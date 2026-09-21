/**
 * js/store.js
 * Gestione I/O: Architettura a Workspace Frammentato (Local-First Cloud Sync Ready).
 * SINCRONISMO IBRIDO ROBUSTO PER PRODUZIONE:
 * 1. Database: Field-Level LWW Merge automatico solo in caso di divergenza disco reale (Zero overhead locale).
 * 2. Note: Generazione automatica di Copia di Conflitto ('[Conflitto...] Titolo') per impedire la perdita di dati.
 * 3. Media & Storage: Ripristinata utility _base64ToBlob per retrocompatibilità.
 * Normalizzazione carriage return (\r\n -> \n) e hashing deterministico per prevenire falsi conflitti.
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
    _pendingRecoveryData: null,
    
    _diskHashes: { notes: {}, databases: {}, index: "" },

    _simpleHash: (str) => {
        if (!str || typeof str !== 'string') return 0;
        // Normalizzazione carriage return per coerenza tra File System Windows e RAM Browser
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

    getNote: (id) => AppState.notes.find(n => n.id === id),

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
            const activeImageIds = new Set();
            const activeAudioIds = new Set(); 

            const extractIds = (htmlString) => {
                if (!htmlString) return;
                const imgRegex = /data-image-ref=["']([^"']+)["']/g;
                let match;
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

    /**
     * Algoritmo di Riconciliazione Database a Livello di Cella e di Riga (Field-Level Merge).
     * Si attiva solo ed esclusivamente quando un file esterno differisce sia dalla RAM che dalla base.
     */
    _mergeDatabaseStates: (diskState, ramState) => {
        const merged = { ...diskState, ...ramState };

        // 1. FUSIONE COLONNE: Unione degli schemi per col.id
        const colMap = new Map();
        (diskState.columns || []).forEach(c => colMap.set(c.id, c));
        (ramState.columns || []).forEach(c => colMap.set(c.id, c)); 
        merged.columns = Array.from(colMap.values());

        // 2. FUSIONE OPZIONI SELECT & COLORI
        merged.selectOptions = { ...(diskState.selectOptions || {}) };
        merged.selectColors = { ...(diskState.selectColors || {}) };

        for (const [colId, opts] of Object.entries(ramState.selectOptions || {})) {
            const diskOpts = merged.selectOptions[colId] || [];
            merged.selectOptions[colId] = Array.from(new Set([...diskOpts, ...opts]));
        }
        for (const [colId, colors] of Object.entries(ramState.selectColors || {})) {
            merged.selectColors[colId] = { ...(merged.selectColors[colId] || {}), ...colors };
        }

        // 3. FUSIONE RIGHE & CELLE (Field-Level LWW)
        const diskRowMap = new Map((diskState.rows || []).map(r => [r.id, r]));
        const ramRowMap = new Map((ramState.rows || []).map(r => [r.id, r]));
        const mergedRowsMap = new Map();

        // Elaborazione righe presenti in RAM
        ramRowMap.forEach((rRam, rowId) => {
            const rDisk = diskRowMap.get(rowId);
            if (!rDisk) {
                mergedRowsMap.set(rowId, rRam);
            } else {
                const ramTime = rRam.updatedAt || rRam.createdAt || 0;
                const diskTime = rDisk.updatedAt || rDisk.createdAt || 0;

                const baseCells = ramTime >= diskTime ? { ...rDisk.cells } : { ...rRam.cells };
                const winningCells = ramTime >= diskTime ? { ...rRam.cells } : { ...rDisk.cells };

                const mergedCells = Object.assign({}, baseCells, winningCells);

                mergedRowsMap.set(rowId, {
                    id: rowId,
                    createdAt: rDisk.createdAt || rRam.createdAt || Date.now(),
                    updatedAt: Math.max(ramTime, diskTime),
                    cells: mergedCells,
                    color: rRam.color || rDisk.color || 'none',
                    opacity: rRam.opacity !== undefined ? rRam.opacity : rDisk.opacity
                });
            }
        });

        // Aggiunta righe create esternamente sul disco e non presenti in RAM
        diskRowMap.forEach((rDisk, rowId) => {
            if (!mergedRowsMap.has(rowId)) {
                mergedRowsMap.set(rowId, rDisk);
            }
        });

        merged.rows = Array.from(mergedRowsMap.values());
        return merged;
    },

    saveToFile: async () => {
        if (Store._isSavingFile) { Store._saveQueuePending = true; return; }
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
                if (currentNote && typeof Editor !== 'undefined') currentNote.content = Editor.getCleanHTML();
            }

            Store.saveLocalBackup(); 

            const notesDir = await AppState.workspaceHandle.getDirectoryHandle('notes', { create: true });
            const dbDir = await AppState.workspaceHandle.getDirectoryHandle('databases', { create: true });

            const cryptoPrefix = AppState.documentPassword ? "ENC_" : "RAW_";

            // =========================================================================
            // 1. SALVATAGGIO INDEX (MULTI-UTENTE ABILITATO LWW E MIGRAZIONE CRITTOGRAFIA)
            // =========================================================================
            const indexPayload = { templates: AppState.templates || [], homeCitations: AppState.homeCitations || [], noteOrder: AppState.notes.map(n => n.id) };
            const indexStr = JSON.stringify(indexPayload, null, 2);
            const indexHash = Store._hashObj(indexPayload, cryptoPrefix);

            if (Store._diskHashes.index !== indexHash) {
                const diskResult = await Store._readFragmentFromDisk(AppState.workspaceHandle, 'index.json');
                let shouldWriteIndex = false;
                let payloadIndexStr = indexStr;

                if (diskResult.status === 'success') {
                    // Se il file su disco è cifrato ma la password è stata rimossa, sovrascrive direttamente in chiaro
                    if (diskResult.data.startsWith('PRONOTES_ENC_V1|') && !AppState.documentPassword) {
                        shouldWriteIndex = true;
                    } else {
                        try {
                            const diskData = JSON.parse(diskResult.data);
                            const diskHash = Store._hashObj(diskData, cryptoPrefix);
                            
                            if (Store._diskHashes.index && diskHash !== Store._diskHashes.index) {
                                console.warn(`🚨 [SYNC LOG] Conflitto reale su index.json.`);
                                console.log(`Hash in RAM: ${Store._diskHashes.index}`);
                                console.log(`Hash su Disco: ${diskHash}`);

                                // LWW: Integra i dati del disco con le modifiche locali
                                AppState.templates = diskData.templates || AppState.templates;
                                AppState.homeCitations = diskData.homeCitations || AppState.homeCitations;
                                
                                const newIndexPayload = { templates: AppState.templates, homeCitations: AppState.homeCitations, noteOrder: AppState.notes.map(n => n.id) };
                                payloadIndexStr = JSON.stringify(newIndexPayload, null, 2);
                            }
                            shouldWriteIndex = true;
                        } catch(e) { 
                            shouldWriteIndex = true;
                        }
                    }
                } else if (diskResult.status === 'not_found') {
                    shouldWriteIndex = true;
                } else {
                    console.warn(`🟠 [SYNC LOG] File index.json bloccato o inaccessibile. Salto la scrittura per prevenire corruzioni.`);
                    hasWriteErrors = true;
                }

                if (shouldWriteIndex) {
                    try {
                        let dataToWrite = AppState.documentPassword ? await CryptoUtils.encrypt(payloadIndexStr, AppState.documentPassword) : payloadIndexStr;
                        const fileHandle = await AppState.workspaceHandle.getFileHandle('index.json', { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(dataToWrite);
                        await writable.close();
                        Store._diskHashes.index = Store._hashObj(JSON.parse(payloadIndexStr), cryptoPrefix);
                    } catch (writeErr) {
                        console.error("Errore scrittura index.json:", writeErr);
                        hasWriteErrors = true;
                    }
                }
            }

            // =========================================================================
            // 2. SALVATAGGIO DATABASE CON FIELD-LEVEL MERGE IBRIDO
            // =========================================================================
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
                                    // SLOW-PATH: Riconciliazione cella per cella a zero perdita dati
                                    finalStateToWrite = Store._mergeDatabaseStates(diskState, ramState);
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
                    } catch (writeErr) {
                        console.error(`Errore scrittura DB ${dbId}.json:`, writeErr);
                        hasWriteErrors = true;
                    }
                }
            }

            if (syncedDatabasesCount > 0 && typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast(`Sincronizzazione: Fusi ${syncedDatabasesCount} database concorrenti a livello di cella.`, "info");
            }

            // =========================================================================
            // 3. SALVATAGGIO NOTE CON COPIA DI CONFLITTO AUTOMATICA
            // =========================================================================
            const ramNotes = AppState.notes.map(note => {
                const cleanNote = { ...note };
                Object.keys(cleanNote).forEach(key => { if (key.startsWith('_')) delete cleanNote[key]; });
                return cleanNote;
            });

            const newConflictNotes = [];

            for (const note of ramNotes) {
                let currentRamHash = Store._hashObj(note, cryptoPrefix);
                
                if (Store._diskHashes.notes[note.id] !== currentRamHash) {
                    const diskResult = await Store._readFragmentFromDisk(notesDir, `${note.id}.json`);
                    let noteToWrite = note;

                    if (diskResult.status === 'error') {
                        hasWriteErrors = true;
                        continue;
                    }
                    else if (diskResult.status === 'success') {
                        if (!diskResult.data.startsWith('PRONOTES_ENC_V1|') || AppState.documentPassword) {
                            try {
                                const diskNote = JSON.parse(diskResult.data);
                                const currentDiskHash = Store._hashObj(diskNote, cryptoPrefix);
                                
                                // Conflitto reale su testo: il file su disco è cambiato mentre l'utente editava in locale
                                if (Store._diskHashes.notes[note.id] && currentDiskHash !== Store._diskHashes.notes[note.id]) {
                                    
                                    const now = new Date();
                                    const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
                                    
                                    const conflictNote = {
                                        id: Store.generateId(),
                                        parentId: note.parentId,
                                        title: `[Conflitto ${timeStr}] ${note.title || 'Senza Titolo'}`,
                                        content: note.content,
                                        isMarked: false,
                                        expanded: true,
                                        createdAt: now.toISOString(),
                                        updatedAt: now.toISOString()
                                    };

                                    newConflictNotes.push(conflictNote);

                                    // La nota corrente in RAM accetta la versione del disco
                                    const liveNoteIndex = AppState.notes.findIndex(n => n.id === note.id);
                                    if (liveNoteIndex > -1) {
                                        AppState.notes[liveNoteIndex] = diskNote;
                                    }
                                    noteToWrite = diskNote;
                                    Store._diskHashes.notes[note.id] = currentDiskHash;

                                    // Se la nota in conflitto era aperta a schermo, riallinea il DOM in modalità protetta
                                    if (AppState.currentNoteId === note.id) {
                                        const editorEl = document.getElementById('noteContent');
                                        if (editorEl && typeof UI !== 'undefined') {
                                            AppState.isSwitchingNote = true;
                                            UI.toggleEditMode(false);
                                            editorEl.innerHTML = diskNote.content || '<p><br></p>';
                                            if (typeof Editor !== 'undefined' && Editor.hydrateMedia) Editor.hydrateMedia(editorEl);
                                            if (typeof WidgetManager !== 'undefined') WidgetManager.mountAll(editorEl);
                                            if (typeof CitationManager !== 'undefined') CitationManager.renderLiveCitations();
                                            setTimeout(() => { AppState.isSwitchingNote = false; }, 200);
                                        }
                                    }
                                }
                            } catch(e) { 
                                console.error(`[SYNC ERROR] Errore verifica conflitto nota ${note.id}:`, e); 
                            }
                        }
                    }

                    try {
                        const noteStr = JSON.stringify(noteToWrite, null, 2);
                        let dataToWrite = AppState.documentPassword ? await CryptoUtils.encrypt(noteStr, AppState.documentPassword) : noteStr;
                        const fileHandle = await notesDir.getFileHandle(`${note.id}.json`, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(dataToWrite);
                        await writable.close();
                        Store._diskHashes.notes[note.id] = Store._hashObj(noteToWrite, cryptoPrefix);
                    } catch (writeErr) {
                        console.error(`Errore scrittura nota ${note.id}.json:`, writeErr);
                        hasWriteErrors = true;
                    }
                }
            }

            if (newConflictNotes.length > 0) {
                for (const cNote of newConflictNotes) {
                    AppState.notes.push(cNote);
                    
                    if (typeof AdvancedTable !== 'undefined' && AdvancedTable.syncSystemPropertiesRow) {
                        AdvancedTable.syncSystemPropertiesRow(cNote.id);
                    }

                    const cStr = JSON.stringify(cNote, null, 2);
                    let dataToWrite = AppState.documentPassword ? await CryptoUtils.encrypt(cStr, AppState.documentPassword) : cStr;
                    const fHandle = await notesDir.getFileHandle(`${cNote.id}.json`, { create: true });
                    const wr = await fHandle.createWritable();
                    await wr.write(dataToWrite);
                    await wr.close();
                    Store._diskHashes.notes[cNote.id] = Store._hashObj(cNote, cryptoPrefix);
                }
                
                if (typeof UI !== 'undefined' && UI.renderTree) UI.renderTree();
                if (typeof UI !== 'undefined' && UI.showToast) {
                    UI.showToast(`Rilevata modifica concorrente. Modifiche locali preservate in "[Conflitto ...]".`, "warning", true);
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
            if (Store._saveQueuePending) { Store._saveQueuePending = false; Store.saveToFile(); }
        }
    },

    triggerAutoSave: (forceImmediate = false, isManualAction = false) => {
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
            if (Store.isDirty && AppState.workspaceHandle) Store.saveToFile();
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

            const hadExistingNotesInRAM = AppState.notes && AppState.notes.length > 0;

            if (forceFresh || !hadExistingNotesInRAM) {
                if (typeof Editor !== 'undefined') Editor.clearHistory();
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
            
            if (AppState.notes.length === 0) {
                const newNoteId = Store.generateId();
                const now = new Date().toISOString();

                AppState.notes.push({
                    id: newNoteId,
                    parentId: null,
                    title: "Prima Nota",
                    content: "<p>Benvenuto nel tuo nuovo Workspace. Inizia a scrivere i tuoi appunti qui...</p><p><br></p>",
                    isMarked: false,
                    expanded: true,
                    createdAt: now,
                    updatedAt: now
                });
            }

            if (typeof AdvancedTable !== 'undefined') {
                AdvancedTable.ensureSystemPropertiesDB();
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
            AppState.notes.push(data);
            Store._diskHashes.notes[data.id] = Store._hashObj(data, cryptoPrefix);
        } else if (type === 'database') {
            const dbId = data._id_hack; 
            delete data._id_hack; // Rimuove l'attributo fantasma PRIMA del parsing per riallineare l'Hash
            
            AppState.databases[dbId] = data;
            
            // HASH CANONICO
            const realHash = Store._hashObj(data, cryptoPrefix);
            Store._diskHashes.databases[dbId] = realHash;
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
            return note;
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