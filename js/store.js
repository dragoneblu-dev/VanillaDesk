/**
 * js/store.js
 * Gestione I/O: Architettura a Workspace Frammentato (Local-First Cloud Sync Ready).
 * SINCRONISMO IBRIDO ROBUSTO PER PRODUZIONE:
 * 1. Database: 3-Way Field-Level Merge a livello di singola cella tramite tracciamento antenato comune (_baseDatabases).
 * 2. Diario / Log: Supporto esplicito per la fusione LWW di state.entries in _mergeDatabaseStates (Zero perdita dati).
 * 3. Note: Concorrenza Ottimistica deterministica basata su Revision Token (revId). Rilevamento conflitti pre-save con dialog di scelta, blocco re-entrancy e Undo Stash protetto.
 * 4. Autorità index.json: In fase di caricamento, solo le note censite in noteOrder vengono importate.
 * 5. Verifica JIT su disco: Funzione syncNoteFromDisk per allineare le note all'apertura o rilevarne l'eliminazione remota.
 * 6. Media & Storage: Utility _base64ToBlob per retrocompatibilità.
 * 7. Live Sync: Ascolto e trasmissione su BroadcastChannel 'vanilladesk_sync' per eventi 'note_saved' e 'db_saved'.
 */

const DB_NAME = 'ProNotesDB';
const STORE_NAME = 'backupStore';

const CryptoUtils = {
    async deriveKey(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
    },

    bufferToBase64(buf) {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    },

    base64ToBuffer(base64) {
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    },

    async encrypt(text, password) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(password, salt);
        const enc = new TextEncoder();
        const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(text));
        
        const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
        const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
        const cipherBase64 = this.bufferToBase64(cipherBuffer);
        return `PRONOTES_ENC_V1|${saltHex}|${ivHex}|${cipherBase64}`;
    },

    async decrypt(encryptedString, password) {
        const parts = encryptedString.split('|');
        if (parts.length !== 4) throw new Error("Formato corrotto.");
        const salt = new Uint8Array(parts[1].match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const iv = new Uint8Array(parts[2].match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const cipherBytes = this.base64ToBuffer(parts[3]);
        const key = await this.deriveKey(password, salt);
        const decryptedBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, cipherBytes);
        return new TextDecoder().decode(decryptedBuffer);
    }
};

const Store = {
    isDirty: false,
    debounceTimer: null,
    dbPromise: null,
    _isSavingFile: false,
    _saveQueuePending: false,
    _isConflictResolving: false,
    _pendingRecoveryData: null,
    _syncChannel: null,
    
    _diskHashes: { notes: {}, databases: {}, index: "" },
    _baseDatabases: {},

    _simpleHash: (str) => {
        if (!str || typeof str !== 'string') return 0;
        str = str.replace(/\r\n/g, '\n');
        
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    },

    // Crea l'Hash convertendo l'oggetto in stringa senza spazi (minificata)
    _hashObj: (obj, cryptoPrefix = "") => {
        return Store._simpleHash(cryptoPrefix + JSON.stringify(obj));
    },

    _base64ToBlob: (base64Data, contentType = '') => {
        const sliceSize = 1024;
        const byteCharacters = atob(base64Data.split(',')[1] || base64Data);
        const byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        return new Blob(byteArrays, { type: contentType });
    },

    initDB: () => {
        if (!window.showDirectoryPicker) {
            alert("Il tuo browser non supporta il File System Nativo (Usa Chrome, Edge o Opera su PC).");
        }
        if (!Store.dbPromise) {
            Store.dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        return Store.dbPromise;
    },

    generateId: () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
    },

    getNote: (id) => AppState.notes.find(n => n.id === id) || null,

    getChildren: (parentId, includeDeleted = false) => AppState.notes.filter(n => n.parentId === parentId && (includeDeleted || !n.deletedAt)),

    getAllDescendants: (parentId, includeDeleted = false) => {
        let descendants = [];
        const children = Store.getChildren(parentId, includeDeleted);
        children.forEach(child => {
            descendants.push(child);
            const grandChildren = Store.getAllDescendants(child.id, includeDeleted);
            descendants = descendants.concat(grandChildren);
        });
        return descendants;
    },

    prepareForSave: () => {
        if (typeof Editor !== 'undefined' && Editor.cleanOrphanedCaches) {
            Editor.cleanOrphanedCaches();
        }
        return {
            notes: AppState.notes.map(note => {
                const cleanNote = { ...note };
                Object.keys(cleanNote).forEach(key => { if (key.startsWith('_')) delete cleanNote[key]; });
                return cleanNote;
            }),
            databases: AppState.databases || {},
            homeCitations: AppState.homeCitations || [],
            templates: AppState.templates || [] 
        };
    },

    saveAsset: async (file, typePrefix) => {
        if (!AppState.assetsHandle) {
            alert("Devi creare o aprire un Workspace (Cartella) prima di inserire allegati.");
            return null;
        }
        try {
            const ext = file.name.split('.').pop();
            const fileName = `${typePrefix}_${Store.generateId()}.${ext}`;
            const fileHandle = await AppState.assetsHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(file);
            await writable.close();
            
            const url = URL.createObjectURL(file);
            if (typePrefix === 'img') Editor.imageCache[fileName] = url;
            if (typePrefix === 'aud') Editor.audioCache[fileName] = url;
            
            return fileName;
        } catch (e) {
            console.error("Errore salvataggio asset:", e);
            alert("Errore nel salvare il file nella cartella assets.");
            return null;
        }
    },

    _loadAssetsIntoRAM: async () => {
        if (!AppState.assetsHandle) return;
        Editor.imageCache = {}; 
        Editor.audioCache = {};
        try {
            for await (const entry of AppState.assetsHandle.values()) {
                if (entry.kind === 'file') {
                    const fileHandle = await AppState.assetsHandle.getFileHandle(entry.name);
                    const file = await fileHandle.getFile();
                    const url = URL.createObjectURL(file);
                    
                    if (entry.name.startsWith('img_')) Editor.imageCache[entry.name] = url;
                    if (entry.name.startsWith('aud_')) Editor.audioCache[entry.name] = url;
                }
            }
        } catch(e) {
            console.warn("Impossibile leggere la cartella assets", e);
        }
    },

    executePhysicalGarbageCollection: async () => {
        if (!AppState.workspaceHandle) return;

        if (AppState.assetsHandle) {
            const activeDbIds = new Set();
            const activeImageIds = new Set();
            const activeAudioIds = new Set(); 

            const extractIds = (htmlString) => {
                if (!htmlString) return;
                const dbRegex = /id=["'](adv_tbl_[^"']+|adv_journal_[^"']+|adv_code_[^"']+|adv_btnbar_[^"']+|adv_pivot_[^"']+|adv_link_[^"']+|adv_cols_[^"']+|adv_audio_[^"']+|adv_vid_[^"']+)["']/g;
                let match;
                while ((match = dbRegex.exec(htmlString)) !== null) activeDbIds.add(match[1].split('_cited_')[0]);

                const imgRegex = /data-image-ref=["']([^"']+)["']/g;
                while ((match = imgRegex.exec(htmlString)) !== null) activeImageIds.add(match[1]);

                const audRegex = /data-audio-ref=["']([^"']+)["']/g;
                while ((match = audRegex.exec(htmlString)) !== null) activeAudioIds.add(match[1]);
            };

            // 1. Scansiona Note Attive
            AppState.notes.forEach(note => { if (!note.deletedAt) extractIds(note.content); });

            // 2. Scansiona i Template Salvati
            if (AppState.templates) {
                AppState.templates.forEach(tpl => {
                    extractIds(tpl.content);
                    if (tpl.widgets) {
                        Object.values(tpl.widgets).forEach(state => {
                            if (state.rows) {
                                state.rows.forEach(row => {
                                    if (row.cells) {
                                        Object.values(row.cells).forEach(cellVal => {
                                            if (typeof cellVal === 'string' && (cellVal.includes('data-image-ref') || cellVal.includes('data-audio-ref'))) {
                                                extractIds(cellVal); 
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }

            // 3. Scansiona i Database Attivi
            if (AppState.databases) {
                Object.values(AppState.databases).forEach(state => {
                    if (state.rows) {
                        state.rows.forEach(row => {
                            if (row.cells) {
                                Object.values(row.cells).forEach(cellVal => {
                                    if (typeof cellVal === 'string' && (cellVal.includes('data-image-ref') || cellVal.includes('data-audio-ref'))) {
                                        extractIds(cellVal); 
                                    }
                                });
                            }
                        });
                    }
                });
            }

            try {
                for await (const entry of AppState.assetsHandle.values()) {
                    if (entry.kind === 'file') {
                        if (entry.name.startsWith('img_') && !activeImageIds.has(entry.name)) {
                            await AppState.assetsHandle.removeEntry(entry.name);
                            if (Editor.imageCache[entry.name]) { URL.revokeObjectURL(Editor.imageCache[entry.name]); delete Editor.imageCache[entry.name]; }
                        } else if (entry.name.startsWith('aud_') && !activeAudioIds.has(entry.name)) {
                            await AppState.assetsHandle.removeEntry(entry.name);
                            if (Editor.audioCache[entry.name]) { URL.revokeObjectURL(Editor.audioCache[entry.name]); delete Editor.audioCache[entry.name]; }
                        }
                    }
                }
            } catch (e) {}
        }

        try {
            const notesDir = await AppState.workspaceHandle.getDirectoryHandle('notes', { create: false });
            const validNoteIds = new Set(AppState.notes.map(n => n.id));
            
            for await (const entry of notesDir.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                    const noteId = entry.name.replace('.json', '');
                    if (!validNoteIds.has(noteId)) {
                        await notesDir.removeEntry(entry.name);
                        delete Store._diskHashes.notes[noteId];
                    }
                }
            }

            const dbDir = await AppState.workspaceHandle.getDirectoryHandle('databases', { create: false });
            const validDbIds = new Set(Object.keys(AppState.databases || {}));

            for await (const entry of dbDir.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                    const dbId = entry.name.replace('.json', '');
                    if (!validDbIds.has(dbId)) {
                        await dbDir.removeEntry(entry.name);
                        delete Store._diskHashes.databases[dbId];
                        delete Store._baseDatabases[dbId];
                    }
                }
            }
        } catch(e) {}
    },

    _readFragmentFromDisk: async (dirHandle, fileName) => {
        try {
            const fileHandle = await dirHandle.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            let text = await file.text();
            
            if (text.startsWith('PRONOTES_ENC_V1|') && AppState.documentPassword) {
                try {
                    text = await CryptoUtils.decrypt(text, AppState.documentPassword);
                } catch(e) { 
                    console.error(`🔴 [SYNC LOG] Errore di decrittografia per il file ${fileName}.`);
                    return { status: 'error', error: e }; 
                }
            }
            return { status: 'success', data: text };
        } catch(e) {
            if (e.name === 'NotFoundError') return { status: 'not_found' };
            console.error(`🔴 [SYNC LOG] Impossibile leggere il file ${fileName} (I/O Error):`, e);
            return { status: 'error', error: e }; 
        }
    },

    readDatabaseFromDisk: async (dbId) => {
        if (!AppState.workspaceHandle) return null;
        try {
            const dbDir = await AppState.workspaceHandle.getDirectoryHandle('databases', { create: false });
            const res = await Store._readFragmentFromDisk(dbDir, `${dbId}.json`);
            if (res.status === 'success') {
                const fresh = JSON.parse(res.data);
                Store._baseDatabases[dbId] = JSON.parse(JSON.stringify(fresh));
                return fresh;
            }
        } catch(e) {
            console.warn(`[STORE] Impossibile ricaricare il database ${dbId} dal disco:`, e);
        }
        return null;
    },

    syncNoteFromDisk: async (noteId) => {
        if (!AppState.workspaceHandle) return { status: 'skipped' };
        const localNote = Store.getNote(noteId);
        if (localNote && localNote._isDraft) return { status: 'draft' };

        try {
            const notesDir = await AppState.workspaceHandle.getDirectoryHandle('notes', { create: false });
            const res = await Store._readFragmentFromDisk(notesDir, `${noteId}.json`);
            
            if (res.status === 'not_found') {
                return { status: 'deleted' };
            }
            if (res.status === 'error') {
                console.error(`[SYNC] Errore lettura disco per nota ${noteId}:`, res.error);
                return { status: 'error', error: res.error };
            }
            if (res.status === 'success') {
                const diskNote = JSON.parse(res.data);
                if (diskNote.deletedAt) {
                    return { status: 'deleted' };
                }
                if (!diskNote.revId) diskNote.revId = Store.generateId();
                const cryptoPrefix = AppState.documentPassword ? "ENC_" : "RAW_";
                const cleanDisk = { ...diskNote };
                Object.keys(cleanDisk).forEach(k => { if (k.startsWith('_')) delete cleanDisk[k]; });
                Store._diskHashes.notes[noteId] = Store._hashObj(cleanDisk, cryptoPrefix);
                return { status: 'success', note: diskNote };
            }
        } catch (e) {
            console.warn(`[SYNC] Impossibile verificare nota ${noteId} su disco:`, e);
            return { status: 'error', error: e };
        }
        return { status: 'unknown' };
    },

    checkWorkspaceChanges: async () => {
        if (!AppState.workspaceHandle) return;
        try {
            const diskResult = await Store._readFragmentFromDisk(AppState.workspaceHandle, 'index.json');
            if (diskResult.status === 'success') {
                const diskData = JSON.parse(diskResult.data);
                const cryptoPrefix = AppState.documentPassword ? "ENC_" : "RAW_";
                const diskHash = Store._hashObj(diskData, cryptoPrefix);
                if (Store._diskHashes.index && diskHash !== Store._diskHashes.index) {
                    Store._diskHashes.index = diskHash;
                    if (diskData.noteOrder && Array.isArray(diskData.noteOrder)) {
                        const validIds = new Set(diskData.noteOrder);
                        AppState.notes = AppState.notes.filter(n => validIds.has(n.id) || n._isDraft);
                        AppState.notes.sort((a, b) => {
                            let idxA = diskData.noteOrder.indexOf(a.id);
                            let idxB = diskData.noteOrder.indexOf(b.id);
                            if (idxA === -1) idxA = 999999;
                            if (idxB === -1) idxB = 999999;
                            return idxA - idxB;
                        });
                        if (typeof UI !== 'undefined' && typeof UI.renderTree === 'function') {
                            UI.renderTree();
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("[STORE] checkWorkspaceChanges fallito:", e);
        }
    },

    _mergeDatabaseStates: (dbId, diskState, ramState) => {
        // 1. SUPPORTO FUSIONE PER WIDGET DIARIO / LOG (Struttura basata su 'entries')
        if (ramState.entries || diskState.entries) {
            const baseEntries = (Store._baseDatabases[dbId]?.entries) || [];
            const baseEntryMap = new Map(baseEntries.map(e => [e.id, e]));
            const diskEntryMap = new Map((diskState.entries || []).map(e => [e.id, e]));
            const ramEntryMap = new Map((ramState.entries || []).map(e => [e.id, e]));
            const mergedEntriesMap = new Map();

            const allEntryIds = new Set([...ramEntryMap.keys(), ...diskEntryMap.keys()]);

            allEntryIds.forEach(eId => {
                const eRam = ramEntryMap.get(eId);
                const eDisk = diskEntryMap.get(eId);
                const eBase = baseEntryMap.get(eId);

                if (eRam && !eDisk) {
                    if (eBase && !diskEntryMap.has(eId)) {
                        const ramChanged = JSON.stringify(eRam) !== JSON.stringify(eBase);
                        if (ramChanged) mergedEntriesMap.set(eId, eRam);
                    } else {
                        mergedEntriesMap.set(eId, eRam);
                    }
                } else if (!eRam && eDisk) {
                    if (eBase && !ramEntryMap.has(eId)) {
                        // Cancellato da RAM
                    } else {
                        mergedEntriesMap.set(eId, eDisk);
                    }
                } else if (eRam && eDisk) {
                    const ramTime = eRam.timestamp || 0;
                    const diskTime = eDisk.timestamp || 0;
                    mergedEntriesMap.set(eId, ramTime >= diskTime ? eRam : eDisk);
                }
            });

            const merged = { ...diskState, ...ramState };
            merged.entries = Array.from(mergedEntriesMap.values());
            return merged;
        }

        // 2. FUSIONE PER TABELLE RDBMS (3-Way Field-Level Merge su singola cella)
        const merged = { ...diskState, ...ramState };

        // Fusione Colonne
        const colMap = new Map();
        (diskState.columns || []).forEach(c => colMap.set(c.id, c));
        (ramState.columns || []).forEach(c => colMap.set(c.id, c)); 
        merged.columns = Array.from(colMap.values());

        // Fusione Opzioni Select & Colori
        merged.selectOptions = { ...(diskState.selectOptions || {}) };
        merged.selectColors = { ...(diskState.selectColors || {}) };

        for (const [colId, opts] of Object.entries(ramState.selectOptions || {})) {
            const diskOpts = merged.selectOptions[colId] || [];
            merged.selectOptions[colId] = Array.from(new Set([...diskOpts, ...opts]));
        }
        for (const [colId, colors] of Object.entries(ramState.selectColors || {})) {
            merged.selectColors[colId] = { ...(merged.selectColors[colId] || {}), ...colors };
        }

        // Fusione Righe e Celle a livello di singola proprietà (3-Way Field Merge)
        const baseRows = (Store._baseDatabases[dbId]?.rows) || [];
        const baseRowMap = new Map(baseRows.map(r => [r.id, r]));
        const diskRowMap = new Map((diskState.rows || []).map(r => [r.id, r]));
        const ramRowMap = new Map((ramState.rows || []).map(r => [r.id, r]));
        const mergedRowsMap = new Map();

        const allRowIds = new Set([...ramRowMap.keys(), ...diskRowMap.keys()]);

        allRowIds.forEach(rowId => {
            const rRam = ramRowMap.get(rowId);
            const rDisk = diskRowMap.get(rowId);
            const rBase = baseRowMap.get(rowId);

            if (rRam && !rDisk) {
                if (rBase && !diskRowMap.has(rowId)) {
                    const ramChanged = JSON.stringify(rRam.cells) !== JSON.stringify(rBase.cells);
                    if (ramChanged) mergedRowsMap.set(rowId, rRam);
                } else {
                    mergedRowsMap.set(rowId, rRam);
                }
            } else if (!rRam && rDisk) {
                if (rBase && !ramRowMap.has(rowId)) {
                    // Rimossa in RAM
                } else {
                    mergedRowsMap.set(rowId, rDisk);
                }
            } else if (rRam && rDisk) {
                const ramTime = rRam.updatedAt || rRam.createdAt || 0;
                const diskTime = rDisk.updatedAt || rDisk.createdAt || 0;

                const baseCells = (rBase && rBase.cells) ? rBase.cells : {};
                const diskCells = rDisk.cells || {};
                const ramCells = rRam.cells || {};

                const mergedCells = { ...diskCells, ...ramCells };
                const allColIds = new Set([...Object.keys(diskCells), ...Object.keys(ramCells)]);

                allColIds.forEach(colId => {
                    const valDisk = diskCells[colId];
                    const valRam = ramCells[colId];
                    const valBase = baseCells[colId];

                    const diskChanged = JSON.stringify(valDisk) !== JSON.stringify(valBase);
                    const ramChanged = JSON.stringify(valRam) !== JSON.stringify(valBase);

                    if (ramChanged && !diskChanged) {
                        mergedCells[colId] = valRam;
                    } else if (diskChanged && !ramChanged) {
                        mergedCells[colId] = valDisk;
                    } else if (diskChanged && ramChanged) {
                        mergedCells[colId] = ramTime >= diskTime ? valRam : valDisk;
                    } else {
                        mergedCells[colId] = valDisk !== undefined ? valDisk : valRam;
                    }
                });

                mergedRowsMap.set(rowId, {
                    id: rowId,
                    createdAt: rDisk.createdAt || rRam.createdAt || Date.now(),
                    updatedAt: Math.max(ramTime, diskTime),
                    cells: mergedCells,
                    color: ramTime >= diskTime ? (rRam.color || rDisk.color || 'none') : (rDisk.color || rRam.color || 'none'),
                    opacity: ramTime >= diskTime ? (rRam.opacity !== undefined ? rRam.opacity : rDisk.opacity) : (rDisk.opacity !== undefined ? rDisk.opacity : rRam.opacity)
                });
            }
        });

        merged.rows = Array.from(mergedRowsMap.values());
        return merged;
    },

    handleNoteConflict: async (localNote, diskNote) => {
        Store._isConflictResolving = true;
        let choice = 'reload';

        try {
        if (typeof UI !== 'undefined' && typeof UI.promptNoteConflict === 'function') {
            choice = await UI.promptNoteConflict(localNote, diskNote);
        } else {
            choice = 'reload';
        }
        } finally {
            Store._isConflictResolving = false;
        }

        if (choice === 'reload') {
            // 1. Salvaguardia: salva la versione locale nello stack Undo dell'editor
            if (typeof Editor !== 'undefined' && AppState.currentNoteId === localNote.id) {
                Editor.saveSnapshot();
            }

            // 2. Allinea la nota in RAM con la copia del disco
            Object.assign(localNote, diskNote);
            localNote._baseRevId = diskNote.revId || Store.generateId();
            localNote.revId = localNote._baseRevId;
            localNote._isDirty = false;
            delete localNote._isDraft;

            const cryptoPrefix = AppState.documentPassword ? "ENC_" : "RAW_";
            const cleanDisk = { ...diskNote };
            Object.keys(cleanDisk).forEach(key => { if (key.startsWith('_')) delete cleanDisk[key]; });
            Store._diskHashes.notes[localNote.id] = Store._hashObj(cleanDisk, cryptoPrefix);

            // 3. Ricarica la nota a schermo se è quella correntemente aperta
            if (AppState.currentNoteId === localNote.id) {
                AppState.isSwitchingNote = true; // Impedisce a eventi input spuri di ri-sporcare la nota
                try {
                const titleInput = document.getElementById('noteTitle');
                const contentDiv = document.getElementById('noteContent');
                if (titleInput) titleInput.value = localNote.title || "";
                if (contentDiv) {
                    contentDiv.innerHTML = localNote.content || "<p><br></p>";
                    if (typeof Editor !== 'undefined') {
                        if (Editor.hydrateMedia) Editor.hydrateMedia(contentDiv);
                        if (Editor.saveSnapshot) Editor.saveSnapshot();
                    }
                    if (typeof WidgetManager !== 'undefined') WidgetManager.mountAll(contentDiv);
                    if (typeof CitationManager !== 'undefined') CitationManager.renderLiveCitations();
                }
                if (typeof UI !== 'undefined') {
                    UI.updateBreadcrumb(localNote);
                    UI.renderInlineFootnotes();
                    if (typeof UI.renderTree === 'function') UI.renderTree();
                    if (typeof UI.showToast === 'function') {
                        UI.showToast("Nota ricaricata da disco. Le tue modifiche sono recuperabili con Ctrl+Z.", "info");
                    }
                }
                } finally {
                    setTimeout(() => { AppState.isSwitchingNote = false; }, 100);
                }
            }
            return 'reload';
        } else {
            // Scelta: Sovrascrivi (Forza la versione locale corrente)
            localNote._baseRevId = diskNote.revId;
            localNote._isDirty = true;
            return 'overwrite';
        }
    },

    saveToFile: async () => {
        // Se un salvataggio è già in corso o se stiamo aspettando la scelta sul pop-up di conflitto, non procedere
        if (Store._isSavingFile || Store._isConflictResolving) { 
            Store._saveQueuePending = true; 
            return; 
        }
        if (!AppState.workspaceHandle) { 
            Store.saveLocalBackup(); 
            if (typeof UI !== 'undefined') UI.showStatus("unsaved"); 
            return; 
        }

        Store._isSavingFile = true;
        let hasWriteErrors = false;

        try {
            UI.showStatus("saving");

            if (AppState.currentNoteId && AppState.isEditMode && !AppState.isSwitchingNote) {
                const currentNote = Store.getNote(AppState.currentNoteId);
                if (currentNote && typeof Editor !== 'undefined') {
                    const cleanHtml = Editor.getCleanHTML();
                    if (cleanHtml && cleanHtml !== currentNote.content) {
                        currentNote.content = cleanHtml;
                        currentNote._isDirty = true;
                        currentNote.updatedAt = new Date().toISOString();
                    }
                }
            }

            Store.saveLocalBackup(); 

            const notesDir = await AppState.workspaceHandle.getDirectoryHandle('notes', { create: true });
            const dbDir = await AppState.workspaceHandle.getDirectoryHandle('databases', { create: true });

            const cryptoPrefix = AppState.documentPassword ? "ENC_" : "RAW_";

            // 1. SALVATAGGIO INDEX
            const indexPayload = { 
                templates: AppState.templates || [], 
                homeCitations: AppState.homeCitations || [], 
                noteOrder: AppState.notes.map(n => n.id) 
            };
            const indexStr = JSON.stringify(indexPayload, null, 2);
            const indexHash = Store._hashObj(indexPayload, cryptoPrefix);

            if (Store._diskHashes.index !== indexHash) {
                try {
                    let dataToWrite = AppState.documentPassword ? await CryptoUtils.encrypt(indexStr, AppState.documentPassword) : indexStr;
                    const fileHandle = await AppState.workspaceHandle.getFileHandle('index.json', { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(dataToWrite);
                    await writable.close();
                    Store._diskHashes.index = indexHash;
                } catch (writeErr) {
                    console.error("Errore scrittura index.json:", writeErr);
                    hasWriteErrors = true;
                }
            }

            // 2. SALVATAGGIO DATABASE CON 3-WAY FIELD-LEVEL MERGE
            let syncedDatabasesCount = 0;

            for (const [dbId, ramState] of Object.entries(AppState.databases || {})) {
                let currentRamHash = Store._hashObj(ramState, cryptoPrefix);

                // FAST-PATH: se lo stato in RAM non è mutato, salta senza fare calcoli
                if (Store._diskHashes.databases[dbId] !== currentRamHash) {
                    const diskResult = await Store._readFragmentFromDisk(dbDir, `${dbId}.json`);
                    let finalStateToWrite = ramState;

                    if (diskResult.status === 'error') {
                        hasWriteErrors = true;
                        continue;
                    } 
                    else if (diskResult.status === 'success') {
                        if (!diskResult.data.startsWith('PRONOTES_ENC_V1|') || AppState.documentPassword) {
                            try {
                                const diskState = JSON.parse(diskResult.data);
                                const currentDiskHash = Store._hashObj(diskState, cryptoPrefix);
                                
                                // Conflitto reale: il file sul disco è stato alterato da un'altra sessione
                                if (Store._diskHashes.databases[dbId] && currentDiskHash !== Store._diskHashes.databases[dbId]) {
                                    finalStateToWrite = Store._mergeDatabaseStates(dbId, diskState, ramState);
                                    AppState.databases[dbId] = finalStateToWrite;
                                    syncedDatabasesCount++;

                                    if (typeof AdvancedTable !== 'undefined') {
                                        AdvancedTable.updateDependentViews(dbId);
                                        if (AdvancedTable.activeRecordId) {
                                            const activeTId = AdvancedTable.activeTableId || dbId;
                                            AdvancedTable.openRecordView(activeTId, AdvancedTable.activeRecordId);
                                        }
                                    }
                                }
                            } catch(e) { 
                                console.error(`[SYNC ERROR] Impossibile fondere il DB ${dbId}:`, e); 
                            }
                        }
                    }

                    try {
                        const finalJsonStr = JSON.stringify(finalStateToWrite, null, 2);
                        let dataToWrite = AppState.documentPassword ? await CryptoUtils.encrypt(finalJsonStr, AppState.documentPassword) : finalJsonStr;
                        const fileHandle = await dbDir.getFileHandle(`${dbId}.json`, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(dataToWrite);
                        await writable.close();
                        Store._diskHashes.databases[dbId] = Store._hashObj(finalStateToWrite, cryptoPrefix);
                        Store._baseDatabases[dbId] = JSON.parse(JSON.stringify(finalStateToWrite));

                        // Notifica broadcast alle altre finestre connesse (es. Workflow Studio)
                        if (Store._syncChannel) {
                            Store._syncChannel.postMessage({ type: 'db_saved', tableId: dbId });
                        }
                    } catch (writeErr) {
                        console.error(`Errore scrittura DB ${dbId}.json:`, writeErr);
                        hasWriteErrors = true;
                    }
                }
            }

            if (syncedDatabasesCount > 0 && typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast(`Sincronizzazione: Fusi ${syncedDatabasesCount} database concorrenti a livello di cella.`, "info");
            }

            // 3. SALVATAGGIO NOTE (GESTIONE CONFLITTI TRAMITE REVISION TOKEN revId)
            for (const note of AppState.notes) {
                const cleanNote = { ...note };
                Object.keys(cleanNote).forEach(key => { if (key.startsWith('_')) delete cleanNote[key]; });
                const currentHash = Store._hashObj(cleanNote, cryptoPrefix);

                if (note._isDirty || Store._diskHashes.notes[note.id] !== currentHash) {
                    
                    // Verifica Conflitto Concorrente al Pre-Save (circoscritta alla nota attiva per prevenire prompt multipli)
                    if (!note._isDraft && !note.deletedAt) {
                        const diskRes = await Store._readFragmentFromDisk(notesDir, `${note.id}.json`);
                        if (diskRes.status === 'success') {
                            try {
                                const diskNote = JSON.parse(diskRes.data);
                                
                                // Rilevamento conflitto tramite divergenza del Revision Token
                                if (diskNote.revId && note._baseRevId && diskNote.revId !== note._baseRevId) {
                                    if (AppState.currentNoteId === note.id) {
                                    const resolution = await Store.handleNoteConflict(note, diskNote);
                                    if (resolution === 'reload') {
                                        continue; // Salta il salvataggio: ricaricata versione disco
                                    }
                                    } else {
                                        // Nota in background: allinea la base per prevenire blocchi fantasma
                                        note._baseRevId = diskNote.revId;
                                    }
                                }
                            } catch (e) {
                                console.error("[SYNC] Errore lettura disco per pre-save check:", e);
                            }
                        }
                    }

                    // Genera nuovo token di revisione per questo salvataggio
                    const nextRevId = Store.generateId();
                    note.revId = nextRevId;
                    cleanNote.revId = nextRevId;
                    note._baseRevId = nextRevId;

                    try {
                        const noteStr = JSON.stringify(cleanNote, null, 2);
                        let dataToWrite = AppState.documentPassword ? await CryptoUtils.encrypt(noteStr, AppState.documentPassword) : noteStr;
                        const fileHandle = await notesDir.getFileHandle(`${note.id}.json`, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(dataToWrite);
                        await writable.close();

                        Store._diskHashes.notes[note.id] = Store._hashObj(cleanNote, cryptoPrefix);
                        note._isDirty = false;
                        delete note._isDraft;

                        if (Store._syncChannel) {
                            Store._syncChannel.postMessage({ type: 'note_saved', noteId: note.id });
                        }
                    } catch (writeErr) {
                        console.error(`Errore scrittura nota ${note.id}.json:`, writeErr);
                        hasWriteErrors = true;
                    }
                }
            }

            await Store.executePhysicalGarbageCollection();

            if (hasWriteErrors) {
                Store.isDirty = true;
                UI.showStatus("error");
            } else {
                Store.isDirty = false;
                UI.showStatus("saved");
            }

        } catch (err) {
            Store.isDirty = true; 
            Store.saveLocalBackup();
            UI.showStatus("error");
            console.error("I/O Write Error:", err);
        } finally {
            Store._isSavingFile = false;
            if (Store._saveQueuePending && !Store._isConflictResolving) { 
                Store._saveQueuePending = false; 
                Store.saveToFile(); 
            }
        }
    },

    triggerAutoSave: (forceImmediate = false, isManualAction = false) => {
        // Se l'utente sta interagendo con il modale di conflitto, nessun salvataggio automatico deve partire
        if (Store._isConflictResolving) return;

        Store.isDirty = true;
        Store.saveLocalBackup();

        if (!AppState.workspaceHandle) {
            if (typeof UI !== 'undefined') UI.showStatus("unsaved");
            if (isManualAction) Store.createWorkspace(false).catch(e => console.warn(e));
            return;
        }

        if (forceImmediate) {
            clearTimeout(Store.debounceTimer);
            Store.saveToFile();
            return;
        }

        UI.showStatus("pending");
        clearTimeout(Store.debounceTimer);
        Store.debounceTimer = setTimeout(() => {
            if (Store.isDirty && AppState.workspaceHandle && !Store._isConflictResolving) {
                Store.saveToFile();
            }
        }, 1500);
    },

    _finalizeUIAfterLoad: () => {
        AppState.searchFilter = "";
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = "";
        
        AppState.showFavoritesInTree = false;
        AppState.showBookmarksInTree = false;
        AppState.showDbNotesInTree = false;

        if (typeof UI !== 'undefined' && UI._updateTabsUI) UI._updateTabsUI('notes');
        UI.updateFileName(AppState.fileName);
        UI.renderTree();
        UI.closeEditor();

        const sb = document.getElementById('sidebar');
        const btn = document.getElementById('sidebarToggleBtn');
        if (sb) { sb.classList.remove('collapsed'); if (btn) btn.classList.add('active'); }

        Store.isDirty = false;
        UI.showStatus("saved");

        setTimeout(() => { if (typeof UI !== 'undefined' && AppState.showMinimap) UI.Minimap.sync(); }, 300);
    },

    openWorkspace: async () => {
        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            
            // Azzeramento pulsante e cache sessione di recupero
            const btnRec = document.getElementById('btnRecoverSession');
            if (btnRec) btnRec.style.display = 'none';
            Store._pendingRecoveryData = null;

            AppState.workspaceHandle = dirHandle;
            AppState.fileName = dirHandle.name;

            UI.showStatus("saving"); 

            // Mount Cartelle
            try { AppState.assetsHandle = await dirHandle.getDirectoryHandle('assets', { create: true }); } catch (e) {}
            await Store._loadAssetsIntoRAM();

            // Svuota i vecchi Hash per evitare interferenze
            Store._diskHashes = { notes: {}, databases: {}, index: "" };
            Store._baseDatabases = {};

            // Rilevamento Architettura
            let isLegacyMonolith = false;
            try {
                const dataFileHandle = await dirHandle.getFileHandle('data.json');
                const file = await dataFileHandle.getFile();
                const text = await file.text();
                
                isLegacyMonolith = true;
                const success = await Store._decryptAndProcess(text);
                if (!success) return;

            } catch (e) {
                isLegacyMonolith = false;
            }

            if (!isLegacyMonolith) {
                try {
                    const indexHandle = await dirHandle.getFileHandle('index.json');
                    const idxFile = await indexHandle.getFile();
                    const success = await Store._decryptAndProcessFragment(await idxFile.text(), 'index');
                    if (!success) return; 

                    const notesDir = await dirHandle.getDirectoryHandle('notes');
                    AppState.notes = []; 
                    for await (const entry of notesDir.values()) {
                        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                            const noteId = entry.name.replace('.json', '');
                            // AUTORITÀ DELL'INDICE (INDEX.JSON): Importa solo le note censite in noteOrder
                            if (AppState._noteOrderCache && Array.isArray(AppState._noteOrderCache)) {
                                if (!AppState._noteOrderCache.includes(noteId)) {
                                    continue;
                                }
                            }
                            const nHandle = await notesDir.getFileHandle(entry.name);
                            const nFile = await nHandle.getFile();
                            await Store._decryptAndProcessFragment(await nFile.text(), 'note');
                        }
                    }

                    const dbDir = await dirHandle.getDirectoryHandle('databases');
                    AppState.databases = {}; 
                    for await (const entry of dbDir.values()) {
                        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                            const dbId = entry.name.replace('.json', '');
                            const dHandle = await dbDir.getFileHandle(entry.name);
                            const dFile = await dHandle.getFile();
                            let dText = await dFile.text();
                            
                            if (!dText.startsWith('PRONOTES_ENC')) {
                               let obj = JSON.parse(dText);
                               obj._id_hack = dbId;
                               dText = JSON.stringify(obj);
                            } else {
                               if (!AppState.documentPassword) {
                                   AppState.documentPassword = await UI.PasswordManager.promptForOpen("Sblocca il Workspace");
                                   if (!AppState.documentPassword) return;
                               }
                               let decTxt = await CryptoUtils.decrypt(dText, AppState.documentPassword);
                               let obj = JSON.parse(decTxt);
                               obj._id_hack = dbId;
                               dText = JSON.stringify(obj);
                            }

                            await Store._decryptAndProcessFragment(dText, 'database');
                        }
                    }

                    if (AppState._noteOrderCache && AppState._noteOrderCache.length > 0) {
                        AppState.notes.sort((a, b) => {
                            let idxA = AppState._noteOrderCache.indexOf(a.id);
                            let idxB = AppState._noteOrderCache.indexOf(b.id);
                            if (idxA === -1) idxA = 999999;
                            if (idxB === -1) idxB = 999999;
                            return idxA - idxB;
                        });
                        delete AppState._noteOrderCache; 
                    }

                } catch (e) {
                    console.error(e);
                    if (e.message === "DECRYPT_FAIL") {
                        alert("Password errata. Impossibile leggere i file protetti.");
                        AppState.documentPassword = null;
                    } else {
                        alert("Cartella non riconosciuta o Workspace corrotto.");
                    }
                    UI.showStatus("error");
                    return;
                }
            }

            if (typeof AdvancedTable !== 'undefined') AdvancedTable.ensureSystemPropertiesDB();
            Store._finalizeUIAfterLoad();

            if (isLegacyMonolith) {
                Store.isDirty = true;
                await Store.saveToFile();
                try {
                    const oldHandle = await dirHandle.getFileHandle('data.json');
                    const file = await oldHandle.getFile();
                    const backupHandle = await dirHandle.getFileHandle('data_legacy_backup.json', {create: true});
                    const writable = await backupHandle.createWritable();
                    await writable.write(await file.text());
                    await writable.close();
                    await dirHandle.removeEntry('data.json');
                } catch(err) {}
            }

        } catch (err) {
            if (err.name !== 'AbortError') alert("Errore apertura Workspace: " + err.message);
        }
    },

    createWorkspace: async (forceFresh = false) => {
        if (AppState.workspaceHandle && Store.isDirty) {
            if (!confirm("Attenzione: Stai per cambiare Workspace. Le modifiche non salvate dell'ambiente attuale verranno chiuse. Procedere?")) return;
        }

        // Guida visiva esplicativa al centro dello schermo prima di chiamare il selettore cartella nativo
        if (typeof UI !== 'undefined' && typeof UI.promptWorkspaceGuide === 'function') {
            const proceed = await UI.promptWorkspaceGuide();
            if (!proceed) return;
        }

        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            
            // Azzeramento pulsante e cache sessione di recupero
            const btnRec = document.getElementById('btnRecoverSession');
            if (btnRec) btnRec.style.display = 'none';
            Store._pendingRecoveryData = null;

            let isEmpty = true;
            try { for await (const entry of dirHandle.values()) { isEmpty = false; break; } } catch(e) {}

            if (!isEmpty) {
                if(!confirm("Attenzione: La cartella selezionata NON è vuota. L'app creerà o aggiornerà i propri file al suo interno. Vuoi procedere?")) return;
            }

            // Se l'utente era già in un Workspace aperto o ha richiesto un ambiente pulito, azzera sempre la memoria
            const isSwitchingFromExistingWorkspace = !!AppState.workspaceHandle;
            const hadExistingNotesInRAM = AppState.notes && AppState.notes.length > 0;
            const shouldReset = forceFresh || isSwitchingFromExistingWorkspace || !hadExistingNotesInRAM;

            if (shouldReset) {
                if (typeof Editor !== 'undefined') {
                    Editor.clearHistory();
                    Editor.imageCache = {};
                    Editor.audioCache = {};
                }
                AppState.notes = []; 
                AppState.databases = {}; 
                AppState.homeCitations = []; 
                AppState.templates = []; 
                AppState.currentNoteId = null; 
                AppState.searchFilter = "";
            }

            AppState.workspaceHandle = dirHandle;
            AppState.fileName = dirHandle.name;
            AppState.documentPassword = null; 
            
            try { AppState.assetsHandle = await dirHandle.getDirectoryHandle('assets', { create: true }); } catch(e) {}

            Store._diskHashes = { notes: {}, databases: {}, index: "" };
            Store._baseDatabases = {};
            
            if (AppState.notes.length === 0) {
                const newNoteId = Store.generateId();
                const now = new Date().toISOString();
                const initialRevId = Store.generateId();

                // Creazione della prima nota informativa, formattata e accattivante
                AppState.notes.push({
                    id: newNoteId,
                    parentId: null,
                    title: "Benvenuto in VanillaDesk",
                    content: `
                        <blockquote>
                            <b>👋 Benvenuto nel tuo nuovo Workspace!</b><br>
                            Questo workspace vive sul tuo computer nella cartella selezionata: massima velocità, nessun dato inviato a server esterni, zero abbonamenti. Questa pagina riassume le funzioni chiave e le viste a tua disposizione.
                        </blockquote>

                        <h2>1. La Magia dei Database: Viste Multiple</h2>
                        <p>In VanillaDesk i <b>Database</b> non sono semplici tabelle, ma motori di dati flessibili. Se desideri una delle seguenti visualizzazioni, ti basta inserire un <b>Database</b> (dal menu <b>Blocchi ➔ Database</b>) e cliccare sul tasto <b>"Vista"</b> nell'intestazione:</p>
                        <ul>
                            <li><b>Bacheca Kanban:</b> Gestisci attività a schede trascinabili per stati o fasi (richiede un campo <i>Select</i>).</li>
                            <li><b>Calendario:</b> Pianifica scadenze su vista Mese, Settimana o Giorno (richiede un campo <i>Data</i>).</li>
                            <li><b>Timeline (Gantt):</b> Cronoprogramma con durate, milestone e frecce di dipendenza (richiede <i>Data con Fine</i>).</li>
                            <li><b>Gerarchia WBS (Albero):</b> Struttura task e sotto-attività ad albero infinito (richiede una <i>Relazione</i> verso la tabella stessa).</li>
                            <li><b>Workflow Studio:</b> Esplora la mappa concettuale e il grafo dei processi a nodi 2D interattivi.</li>
                            <li><b>Viste Collegate:</b> Crea specchi dello stesso database, con filtri e ordinamenti indipendenti.</li>
                            <li><b>Tabelle Pivot & Grafici:</b> Raggruppa e calcola totali, medie o percentuali trasformandoli in grafici.</li>
                        </ul>

                        <h2>2. Scorciatoie e Trucchi Rapidi</h2>
                        <div class="adv-widget-shell simple-table-wrapper" data-widget-type="simple-table" contenteditable="false">
                            <table class="table-striped" style="width:100%; table-layout:auto;">
                                <tbody>
                                    <tr>
                                        <th style="width:25%;">Scorciatoia</th>
                                        <th style="width:25%;">Funzionalità</th>
                                        <th style="width:50%;">Descrizione Operativa</th>
                                    </tr>
                                    <tr>
                                        <td><code>[[</code></td>
                                        <td><span class="tx-c4"><b>Link Rapidi</b></span></td>
                                        <td>Digita due quadre per cercare e collegare all'istante un'altra nota o capitolo.</td>
                                    </tr>
                                    <tr>
                                        <td><kbd>Ctrl</kbd> + <kbd>D</kbd></td>
                                        <td><span class="tx-c3"><b>Cursori Multipli</b></span></td>
                                        <td>Seleziona e modifica in contemporanea tutte le occorrenze identiche della parola.</td>
                                    </tr>
                                    <tr>
                                        <td><code>[] </code> o <code>- </code></td>
                                        <td><span class="tx-c6"><b>Checklist & Liste</b></span></td>
                                        <td>Inizia una to-do list o elenco puntato. Usa <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> per i sotto-livelli.</td>
                                    </tr>
                                    <tr>
                                        <td><kbd>Alt</kbd> + <kbd>⬆</kbd> / <kbd>⬇</kbd></td>
                                        <td><span class="tx-c7"><b>Sposta Blocco</b></span></td>
                                        <td>Sposta fisicamente il paragrafo o riga corrente in alto o in basso senza tagliare.</td>
                                    </tr>
                                    <tr>
                                        <td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd></td>
                                        <td><span class="tx-c8"><b>Segnalibro & Timer</b></span></td>
                                        <td>Fissa un segnalibro nel testo ed imposta promemoria con allarme sonoro.</td>
                                    </tr>
                                    <tr>
                                        <td><kbd>Shift</kbd> + Rotella</td>
                                        <td><span class="tx-c9"><b>Scroll Orizzontale</b></span></td>
                                        <td>Scorri lateralmente tabelle, database e bacheche Kanban senza trascinare la scrollbar.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <h2>3. Elementi Interattivi Dimostrativi</h2>
                        <p>
                            Snippet con copia rapida con un click:
                            <span class="adv-copy-snippet adv-inline-shell" data-widget-type="snippet" contenteditable="false">
                                <span class="snippet-text widget-editable-area" contenteditable="true">workspace-local-token-2026</span>
                                <span class="snippet-copy-btn" title="Copia">📋</span>
                            </span>
                        </p>
                        <p>
                            Puoi nascondere note e approfondimenti a margine <span class="inline-note-wrapper adv-inline-shell" data-widget-type="inline-note" contenteditable="false"><span class="inline-note-marker">💬</span><span class="inline-note-data" style="display: none;">Questo appunto appare passando il mouse sopra l'icona e viene raccolto a fine pagina!</span></span> che non spezzano la lettura del testo principale.
                        </p>

                        <h2>4. Riservatezza Assoluta</h2>
                        <p>Questo Workspace è salvato nella cartella del tuo computer che hai appena selezionato. <b>Nessun dato viene inviato a server esterni</b>: le tue note, i database e le immagini sono al sicuro e sotto il tuo esclusivo controllo.</p>
                        <p><br></p>
                    `.trim(),
                    isMarked: true,
                    expanded: true,
                    createdAt: now,
                    updatedAt: now,
                    revId: initialRevId,
                    _baseRevId: initialRevId,
                    _isDraft: false,
                    _isDirty: true
                });
            }

            if (typeof AdvancedTable !== 'undefined') {
                AdvancedTable.ensureSystemPropertiesDB();
            }

            // Abilitazione automatica della modalità Edit Continuo per il nuovo Workspace
            if (typeof UI !== 'undefined' && typeof UI.setContinuousEdit === 'function') {
                UI.setContinuousEdit(true);
            } else {
                AppState.continuousEditMode = true;
                localStorage.setItem('pronotes_continuous', 'true');
            }

            Store.isDirty = true;
            await Store.saveToFile();

            Store.saveLocalBackup();
            Store._finalizeUIAfterLoad();

            if (typeof UI !== 'undefined') {
                if (typeof UI.selectNote !== 'undefined' && AppState.notes.length > 0) {
                    UI.selectNote(AppState.notes[0].id);
                }
                UI.showToast("Workspace collegato e salvato su disco.", "success");
            }

        } catch (err) {
            if (err.name !== 'AbortError') alert("Errore creazione/collegamento Workspace: " + err.message);
        }
    },

    _decryptAndProcess: async (text) => {
        try {
            if (text.startsWith('PRONOTES_ENC_V1|')) {
                const password = await UI.PasswordManager.promptForOpen();
                if (!password) return false; 
                try {
                    const decryptedJson = await CryptoUtils.decrypt(text, password);
                    AppState.documentPassword = password; 
                    Store._processLoadedMonolith(JSON.parse(decryptedJson));
                    return true;
                } catch (err) { alert("Password errata o file corrotto."); return false; }
            } else {
                AppState.documentPassword = null;
                Store._processLoadedMonolith(JSON.parse(text));
                return true;
            }
        } catch (e) { alert("Impossibile leggere il file. Formato non valido."); return false; }
    },

    _decryptAndProcessFragment: async (text, type) => {
        let jsonStr = text;
        
        if (text.startsWith('PRONOTES_ENC_V1|')) {
            if (!AppState.documentPassword) {
                const password = await UI.PasswordManager.promptForOpen("Sblocca il Workspace");
                if (!password) return false;
                AppState.documentPassword = password;
            }
            try { 
                jsonStr = await CryptoUtils.decrypt(text, AppState.documentPassword); 
            } catch (e) { 
                throw new Error("DECRYPT_FAIL"); 
            }
        }

        const data = JSON.parse(jsonStr);
        const cryptoPrefix = AppState.documentPassword ? "ENC_" : "RAW_";

        if (type === 'index') {
            AppState.templates = data.templates || [];
            AppState.homeCitations = data.homeCitations || [];
            AppState._noteOrderCache = data.noteOrder || []; 
            Store._diskHashes.index = Store._hashObj(data, cryptoPrefix);
        } else if (type === 'note') {
            if (!data.revId) data.revId = Store.generateId();
            data._baseRevId = data.revId;
            AppState.notes.push(data);
            
            // L'hash iniziale viene calcolato pulendo le chiavi volatili (_*) per coerenza assoluta con saveToFile
            const cleanData = { ...data };
            Object.keys(cleanData).forEach(k => { if (k.startsWith('_')) delete cleanData[k]; });
            Store._diskHashes.notes[data.id] = Store._hashObj(cleanData, cryptoPrefix);
        } else if (type === 'database') {
            const dbId = data._id_hack; 
            delete data._id_hack;
            
            AppState.databases[dbId] = data;
            
            // HASH CANONICO
            const realHash = Store._hashObj(data, cryptoPrefix);
            Store._diskHashes.databases[dbId] = realHash;
            Store._baseDatabases[dbId] = JSON.parse(JSON.stringify(data));
        }
        return true;
    },

    _processLoadedMonolith: (parsedData) => {
        AppState.databases = parsedData.databases || {};
        AppState.homeCitations = parsedData.homeCitations || [];
        AppState.templates = parsedData.templates || []; 

        let rawNotes = Array.isArray(parsedData) ? parsedData : (parsedData.notes || []);
        const parser = new DOMParser();

        AppState.notes = rawNotes.map(note => {
            if (Array.isArray(note.content)) note.content = note.content.join('');
            
            if (note.content) {
                let contentHTML = note.content;
                const imgRegex = /data-image-ref=["']([^"']+)["']/g;
                let match;
                while ((match = imgRegex.exec(contentHTML)) !== null) {
                    const filename = match[1];
                    if (Editor.imageCache[filename]) {
                        contentHTML = contentHTML.replace(new RegExp(`src=["'][^"']*["']\\s*data-image-ref=["']${filename}["']`, 'g'), `src="${Editor.imageCache[filename]}" data-image-ref="${filename}"`);
                    }
                }
                const audRegex = /data-audio-ref=["']([^"']+)["']/g;
                while ((match = audRegex.exec(contentHTML)) !== null) {
                    const filename = match[1];
                    if (Editor.audioCache[filename]) {
                        contentHTML = contentHTML.replace(new RegExp(`src=["'][^"']*["']\\s*data-audio-ref=["']${filename}["']`, 'g'), `src="${Editor.audioCache[filename]}" data-audio-ref="${filename}"`);
                    }
                }
                note.content = contentHTML;
            }

            if (note.content && note.content.includes('data-state')) {
                let changed = false;
                const doc = parser.parseFromString(note.content, 'text/html');
                doc.querySelectorAll('.adv-widget-shell, .adv-table-wrapper, .adv-journal-wrapper').forEach(el => {
                    if (el.hasAttribute('data-state')) {
                        try { AppState.databases[el.id] = JSON.parse(el.getAttribute('data-state').replace(/&quot;/g, '"')); el.removeAttribute('data-state'); changed = true; } catch(e) {}
                    }
                });
                if (changed) note.content = doc.body.innerHTML;
            }

            if (!note.revId) note.revId = Store.generateId();
            note._baseRevId = note.revId;
            return note;
        });

        Object.keys(AppState.databases).forEach(id => {
            Store._baseDatabases[id] = JSON.parse(JSON.stringify(AppState.databases[id]));
        });
    },

    saveAs: async () => {
        try {
            Store.isDirty = true;
            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({ types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }] });
                let dataToWrite = JSON.stringify(Store.prepareForSave(), null, 2);
                if (AppState.documentPassword) dataToWrite = await CryptoUtils.encrypt(dataToWrite, AppState.documentPassword);
                const writable = await handle.createWritable();
                await writable.write(dataToWrite);
                await writable.close();
                UI.showToast("Backup JSON Monolitico salvato.", "success");
            } else Store.downloadSnapshot();
        } catch (err) {}
    },

    saveLocalBackup: async () => {
        try {
            const db = await Store.initDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            
            const payloadObj = Store.prepareForSave();
            let dataToStore = payloadObj;

            if (AppState.documentPassword) {
                const jsonStr = JSON.stringify(payloadObj);
                const encryptedStr = await CryptoUtils.encrypt(jsonStr, AppState.documentPassword);
                dataToStore = { _isEncryptedBackup: true, payload: encryptedStr };
            }
            
            dataToStore._isDirty = Store.isDirty; 
            store.put(dataToStore, 'crash_recovery');
        } catch (e) {}
    },

    checkRecoverableSession: async () => {
        try {
            const db = await Store.initDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get('crash_recovery');
            request.onsuccess = () => {
                const result = request.result;
                if (!result) return;
                
                const hasNotes = result.notes && result.notes.length > 0;
                const hasEncrypted = result._isEncryptedBackup && result.payload;

                if (hasNotes || hasEncrypted) {
                    Store._pendingRecoveryData = result;
                    const btn = document.getElementById('btnRecoverSession');
                    if (btn) {
                        btn.style.display = 'inline-flex';
                    }
                }
            };
        } catch (e) {
            console.warn("Impossibile verificare la sessione precedente:", e);
        }
    },

    recoverFromCrash: async () => {
        // Verifica in background la presenza di una sessione e aggiorna il pulsante dell'onboarding
        await Store.checkRecoverableSession();
    },

    restoreRecoveredSession: async () => {
        const result = Store._pendingRecoveryData;
        if (!result) return;

        try {
            if (result._isEncryptedBackup && result.payload) {
                const password = await UI.PasswordManager.promptForOpen("Sessione Interrotta Protetta");
                if (!password) return; 

                try {
                    const decryptedJson = await CryptoUtils.decrypt(result.payload, password);
                    AppState.documentPassword = password;
                    Store._processLoadedMonolith(JSON.parse(decryptedJson));
                } catch (e) { 
                    alert("Password errata."); 
                    return;
                }
            } else if (result.notes && result.notes.length > 0) {
                Store._processLoadedMonolith(result);
            }

            AppState.fileName = "Sessione Ripristinata (Senza Workspace)";
            if (typeof AdvancedTable !== 'undefined') {
                AdvancedTable.ensureSystemPropertiesDB();
            }

            Store._finalizeUIAfterLoad();
            Store.isDirty = true;
            UI.showStatus("unsaved");

            const btn = document.getElementById('btnRecoverSession');
            if (btn) btn.style.display = 'none';

            Store._pendingRecoveryData = null;

            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast("Sessione precedente caricata in memoria. Salva in un Workspace per renderla permanente.", "info");
            }
        } catch(err) {
            console.error("Errore nel ripristino della sessione:", err);
            alert("Impossibile ripristinare la sessione: " + err.message);
        }
    },

    downloadSnapshot: async () => {
        let dataToWrite = JSON.stringify(Store.prepareForSave(), null, 2);
        if (AppState.documentPassword) dataToWrite = await CryptoUtils.encrypt(dataToWrite, AppState.documentPassword);

        const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(dataToWrite);
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        let cleanFileName = AppState.fileName.replace(/\.json$/i, '');
        const date = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
        downloadAnchorNode.setAttribute("download", `${cleanFileName}_Backup_${date}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },

    loadSnapshot: async () => {
        try {
            let text = "";
            let fileName = "Backup";

            if (window.showOpenFilePicker) {
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{ description: 'Backup JSON', accept: { 'application/json': ['.json'] } }],
                });
                const file = await fileHandle.getFile();
                fileName = file.name.replace(/\.json$/i, '');
                text = await file.text();
            } else {
                text = await new Promise((resolve, reject) => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    input.onchange = (e) => {
                        const file = e.target.files[0];
                        if (!file) return resolve(null);
                        fileName = file.name.replace(/\.json$/i, '');
                        const reader = new FileReader();
                        reader.onload = (event) => resolve(event.target.result);
                        reader.onerror = (err) => reject(err);
                        reader.readAsText(file);
                    };
                    input.click();
                });
            }

            if (!text) return;

            if (AppState.workspaceHandle && Store.isDirty) {
                if (!confirm("Attenzione: Il caricamento di un file di backup sostituirà la sessione corrente in memoria. Le modifiche non salvate andranno perse. Vuoi continuare?")) {
                    return;
                }
            } else if (AppState.notes && AppState.notes.length > 0) {
                if (!confirm("Attenzione: Il caricamento di un file di backup sostituirà i dati correnti in memoria. Vuoi procedere?")) {
                    return;
                }
            }

            if (typeof Editor !== 'undefined') Editor.clearHistory();

            // Azzeramento pulsante e cache sessione di recupero
            const btnRec = document.getElementById('btnRecoverSession');
            if (btnRec) btnRec.style.display = 'none';
            Store._pendingRecoveryData = null;

            AppState.workspaceHandle = null;
            AppState.assetsHandle = null;
            Store._diskHashes = { notes: {}, databases: {}, index: "" };
            Store._baseDatabases = {};

            const success = await Store._decryptAndProcess(text);
            if (!success) return;

            AppState.fileName = `${fileName} (Backup)`;
            if (typeof AdvancedTable !== 'undefined') AdvancedTable.ensureSystemPropertiesDB();

            Store._finalizeUIAfterLoad();
            Store.isDirty = true;
            Store.saveLocalBackup();
            UI.showStatus("unsaved");

            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast("File JSON di backup caricato con successo.", "success");
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Errore caricamento backup JSON:", err);
                alert("Errore durante il caricamento del file JSON: " + err.message);
            }
        }
    }
};

// Inizializzazione ricevitore sincronizzazione live tra finestre (Workflow Studio <-> VanillaDesk <-> Multi-Schede)
if (typeof BroadcastChannel !== 'undefined') {
    try {
        Store._syncChannel = new BroadcastChannel('vanilladesk_sync');
        Store._syncChannel.onmessage = async (event) => {
            const data = event.data;
            if (!data) return;

            if (data.type === 'db_saved' && data.tableId) {
                if (typeof AdvancedTable !== 'undefined' && typeof AdvancedTable.forceRecalculate === 'function') {
                    AdvancedTable.forceRecalculate(data.tableId);
                }
            } 
            else if (data.type === 'note_saved' && data.noteId) {
                if (!AppState.workspaceHandle) return;
                const noteId = data.noteId;
                const currentOpenId = AppState.currentNoteId;

                if (currentOpenId !== noteId) {
                    // Nota NON correntemente aperta
                    const syncRes = await Store.syncNoteFromDisk(noteId);
                    if (syncRes.status === 'success' && syncRes.note) {
                        const existingNote = Store.getNote(noteId);
                        if (existingNote) {
                            if (!existingNote._isDirty) {
                                Object.assign(existingNote, syncRes.note);
                                existingNote._baseRevId = syncRes.note.revId || existingNote.revId;
                                existingNote._isDirty = false;
                            }
                        } else {
                            syncRes.note._baseRevId = syncRes.note.revId;
                            AppState.notes.push(syncRes.note);
                        }
                    } else if (syncRes.status === 'deleted') {
                        const idx = AppState.notes.findIndex(n => n.id === noteId);
                        if (idx > -1) AppState.notes.splice(idx, 1);
                        if (typeof AdvancedTable !== 'undefined' && AdvancedTable.deleteSystemPropertiesRow) {
                            AdvancedTable.deleteSystemPropertiesRow(noteId);
                        }
                    }
                    if (typeof UI !== 'undefined' && typeof UI.renderTree === 'function') {
                        UI.renderTree();
                    }
                } else {
                    // Nota aperta nella scheda corrente: ricarica dal disco solo se non ci sono modifiche pendenti
                    const currentNote = Store.getNote(noteId);
                    if (currentNote && !currentNote._isDirty) {
                        const syncRes = await Store.syncNoteFromDisk(noteId);
                        if (syncRes.status === 'success' && syncRes.note) {
                            Object.assign(currentNote, syncRes.note);
                            currentNote._baseRevId = syncRes.note.revId || currentNote.revId;
                            currentNote._isDirty = false;

                            const titleInput = document.getElementById('noteTitle');
                            const contentDiv = document.getElementById('noteContent');
                            if (titleInput) titleInput.value = currentNote.title || "";
                            if (contentDiv) {
                                contentDiv.innerHTML = currentNote.content || "<p><br></p>";
                                if (typeof Editor !== 'undefined') {
                                    if (Editor.hydrateMedia) Editor.hydrateMedia(contentDiv);
                                    if (Editor.saveSnapshot) Editor.saveSnapshot();
                                }
                                if (typeof WidgetManager !== 'undefined') {
                                    WidgetManager.mountAll(contentDiv);
                                }
                                if (typeof CitationManager !== 'undefined') {
                                    CitationManager.renderLiveCitations();
                                }
                            }
                            if (typeof UI !== 'undefined' && typeof UI.renderTree === 'function') {
                                UI.renderTree();
                            }
                        } else if (syncRes.status === 'deleted') {
                            const idx = AppState.notes.findIndex(n => n.id === noteId);
                            if (idx > -1) AppState.notes.splice(idx, 1);
                            if (typeof AdvancedTable !== 'undefined' && AdvancedTable.deleteSystemPropertiesRow) {
                                AdvancedTable.deleteSystemPropertiesRow(noteId);
                            }
                            if (typeof UI !== 'undefined' && typeof UI.renderTree === 'function') {
                                UI.renderTree();
                            }
                            if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') {
                                UI.showToast("La nota non è più disponibile sul disco.", "warning");
                            }
                            UI.goHome();
                        }
                    }
                }
            }
        };
    } catch(e) {}
}