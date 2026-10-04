/**
 * js/store-workspace.js
 * Sottomodulo di Store: I/O File System Access API, Concorrenza e Sincronizzazione Workspace.
 * Responsabilità:
 * 1. File System Access API: Apertura, creazione e navigazione cartelle fisiche (openWorkspace, createWorkspace).
 * 2. Scritture Atomiche Protette: Stream di swap sicuri con gestione abort() automatico (_safeWriteFile).
 * 3. 3-Way Field-Level Merge: Fusione concorrente non distruttiva a livello di singola cella per RDBMS e Diari (_mergeDatabaseStates).
 * 4. Concorrenza Ottimistica Note: Verifica dei Revision Token (revId) e rilevamento conflitti concorrenti (handleNoteConflict).
 * 5. JIT Component Sync: Riconciliazione in lettura al volo per database e frammenti prima dell'apertura nota (syncWidgetsForNote, syncNoteFromDisk).
 * 6. Gestione Asset Fisici & GC su Richiesta: Streaming di immagini/audio e potatura directory (_loadAssetsIntoRAM, executePhysicalGarbageCollection).
 * 7. BroadcastChannel Multi-Scheda: Sincronizzazione in tempo reale isolata per workspaceId.
 * FIX SYNC JIT LOCAL DRAFT: syncNoteFromDisk non scambia mai per eliminata una nota creata localmente non ancora scritta su disco (!Store._diskHashes.notes[noteId]).
 */

Object.assign(Store, {

    // Scrittura sicura con gestione atomica dello stream di swap e abort in caso di eccezione
    _safeWriteFile: async (dirHandle, fileName, textContent) => {
        if (typeof textContent !== 'string') {
            throw new Error(`Payload di scrittura non valido per ${fileName}: attesa stringa.`);
        }
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable({ keepExistingData: false });
        try {
            await writable.write(textContent);
            await writable.close();
        } catch (err) {
            try {
                await writable.abort();
            } catch (_) {}
            throw err;
        }
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
        // Reset del flag di richiesta GC fisica: viene sempre consumato alla chiamata
        Store._needsPhysicalGC = false;

        if (!AppState.workspaceHandle) return;

        const { activeDbIds, activeImageIds, activeAudioIds, validNoteIds } = Store.scanActiveEntities();

        if (AppState.assetsHandle) {
            try {
                for await (const entry of AppState.assetsHandle.values()) {
                    if (entry.kind === 'file') {
                        if (entry.name.startsWith('img_') && !activeImageIds.has(entry.name)) {
                            await AppState.assetsHandle.removeEntry(entry.name);
                            if (Editor.imageCache[entry.name]) { 
                                URL.revokeObjectURL(Editor.imageCache[entry.name]); 
                                delete Editor.imageCache[entry.name]; 
                            }
                        } else if (entry.name.startsWith('aud_') && !activeAudioIds.has(entry.name)) {
                            await AppState.assetsHandle.removeEntry(entry.name);
                            if (Editor.audioCache[entry.name]) { 
                                URL.revokeObjectURL(Editor.audioCache[entry.name]); 
                                delete Editor.audioCache[entry.name]; 
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        try {
            const notesDir = await AppState.workspaceHandle.getDirectoryHandle('notes', { create: false });
            
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

            for await (const entry of dbDir.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                    const dbId = entry.name.replace('.json', '');
                    if (!activeDbIds.has(dbId)) {
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
        if (localNote && (localNote._isDraft || !Store._diskHashes.notes[noteId])) return { status: 'draft' };

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

    // Sincronizzazione JIT in lettura per tutti i componenti/widget richiamati all'interno di una nota
    syncWidgetsForNote: async (contentHtml) => {
        if (!AppState.workspaceHandle || !contentHtml || typeof contentHtml !== 'string') return;

        const widgetIdRegex = /\bid=["'](adv_[a-zA-Z0-9_]+?)["']/g;
        const widgetIds = new Set();
        let match;

        while ((match = widgetIdRegex.exec(contentHtml)) !== null) {
            const rawId = match[1];
            const cleanId = rawId.split('_cited_')[0];
            widgetIds.add(cleanId);
        }

        // Se vi sono viste collegate o pivot, includiamo anche le rispettive sorgenti originali
        widgetIds.forEach(id => {
            const s = AppState.databases ? AppState.databases[id] : null;
            if (s && (s.isLinkedView || s.isPivot) && s.sourceTableId) {
                widgetIds.add(s.sourceTableId.split('_cited_')[0]);
            }
        });

        if (widgetIds.size === 0) return;

        let dbDir;
        try {
            dbDir = await AppState.workspaceHandle.getDirectoryHandle('databases', { create: false });
        } catch (e) {
            return;
        }

        const cryptoPrefix = AppState.documentPassword ? "ENC_" : "RAW_";
        const updatedWidgetIds = [];

        for (const widgetId of widgetIds) {
            try {
                const diskResult = await Store._readFragmentFromDisk(dbDir, `${widgetId}.json`);
                if (diskResult.status !== 'success') continue;

                const diskData = JSON.parse(diskResult.data);
                const diskHash = Store._hashObj(diskData, cryptoPrefix);
                const storedHash = Store._diskHashes.databases[widgetId];

                // Se l'hash su disco differisce da quello registrato in memoria, il file è stato mutato esternamente
                if (storedHash && storedHash !== diskHash) {
                    const ramState = AppState.databases ? AppState.databases[widgetId] : null;

                    if (ramState) {
                        const currentRamHash = Store._hashObj(ramState, cryptoPrefix);

                        // Se la RAM non ha subito modifiche locali pendenti, aggiorniamo direttamente con i dati del disco
                        if (currentRamHash === storedHash) {
                            AppState.databases[widgetId] = diskData;
                            Store._baseDatabases[widgetId] = JSON.parse(JSON.stringify(diskData));
                            Store._diskHashes.databases[widgetId] = diskHash;
                            updatedWidgetIds.push(widgetId);
                        } else {
                            // Se in RAM c'erano modifiche concorrenti non salvate, eseguiamo il 3-Way Merge
                            const merged = Store._mergeDatabaseStates(widgetId, diskData, ramState);
                            AppState.databases[widgetId] = merged;
                            Store._baseDatabases[widgetId] = JSON.parse(JSON.stringify(diskData));
                            updatedWidgetIds.push(widgetId);
                        }
                    } else {
                        // Se non era ancora presente in memoria, carichiamo lo stato del disco
                        if (!AppState.databases) AppState.databases = {};
                        AppState.databases[widgetId] = diskData;
                        Store._baseDatabases[widgetId] = JSON.parse(JSON.stringify(diskData));
                        Store._diskHashes.databases[widgetId] = diskHash;
                        updatedWidgetIds.push(widgetId);
                    }
                } else if (!storedHash) {
                    // Prima volta che vediamo l'hash di questo widget: allineiamo la base
                    Store._diskHashes.databases[widgetId] = diskHash;
                    if (!Store._baseDatabases[widgetId]) {
                        Store._baseDatabases[widgetId] = JSON.parse(JSON.stringify(diskData));
                    }
                }
            } catch (err) {
                console.warn(`[STORE] Impossibile riconciliare JIT il widget ${widgetId} da disco:`, err);
            }
        }

        // Ricalcola le viste e le celle virtuali per i widget effettivamente aggiornati
        if (updatedWidgetIds.length > 0 && typeof AdvancedTable !== 'undefined') {
            updatedWidgetIds.forEach(id => {
                AdvancedTable.updateDependentViews(id);
            });
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
            if (AppState.currentNoteId === localNote.id) {
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
                AppState.isSwitchingNote = true;
                try {
                    const titleInput = document.getElementById('noteTitle');
                    const contentDiv = document.getElementById('noteContent');
                    if (titleInput) titleInput.value = localNote.title || "";
                    if (contentDiv) {
                        contentDiv.innerHTML = localNote.content || "<p><br></p>";
                        Editor.hydrateMedia(contentDiv);
                        Editor.saveSnapshot();
                        WidgetManager.mountAll(contentDiv);
                        if (typeof CitationManager !== 'undefined') CitationManager.renderLiveCitations();
                    }
                    if (typeof UI !== 'undefined') {
                    UI.updateBreadcrumb(localNote);
                    UI.renderInlineFootnotes();
                        if (typeof UI.renderTree === 'function') UI.renderTree();
                        if (typeof UI.showToast === 'function') {
                    UI.showToast(I18n.t('conflict.toast_reloaded'), "info");
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
            UI.showStatus("unsaved"); 
            return; 
        }

        Store._isSavingFile = true;
        let hasWriteErrors = false;

        try {
            UI.showStatus("saving");

            if (AppState.currentNoteId && AppState.isEditMode && !AppState.isSwitchingNote) {
                const currentNote = Store.getNote(AppState.currentNoteId);
                if (currentNote) {
                    const cleanHtml = Editor.getCleanHTML();
                    if (cleanHtml && cleanHtml !== currentNote.content) {
                        currentNote.content = cleanHtml;
                        currentNote._isDirty = true;
                        currentNote.updatedAt = new Date().toISOString();
                    }
                }
            }

            // Sincronizza lo stato in IndexedDB per la recovery (dopo il debounce di saveToFile)
            Store.saveLocalBackup(); 

            const notesDir = await AppState.workspaceHandle.getDirectoryHandle('notes', { create: true });
            const dbDir = await AppState.workspaceHandle.getDirectoryHandle('databases', { create: true });

            const cryptoPrefix = AppState.documentPassword ? "ENC_" : "RAW_";

            // Assegna e garantisce l'ID univoco del workspace se mancante
            if (!AppState.workspaceId) {
                AppState.workspaceId = 'ws_' + Store.generateId();
            }

            // Inizializzazione della chiave e del salt comune di Workspace (previene il PBKDF2 Storm)
            const workspaceSalt = AppState.documentPassword ? Store._getWorkspaceSalt() : null;

            // 1. SALVATAGGIO INDEX
            const indexPayload = { 
                workspaceId: AppState.workspaceId,
                vaultSalt: AppState.vaultSaltHex || null,
                templates: AppState.templates || [], 
                homeCitations: AppState.homeCitations || [], 
                noteOrder: AppState.notes.map(n => n.id) 
            };
            const indexStr = JSON.stringify(indexPayload, null, 2);
            const indexHash = Store._hashObj(indexPayload, cryptoPrefix);

            if (Store._diskHashes.index !== indexHash) {
                try {
                    let dataToWrite = AppState.documentPassword 
                        ? await CryptoUtils.encrypt(indexStr, AppState.documentPassword, workspaceSalt) 
                        : indexStr;
                    await Store._safeWriteFile(AppState.workspaceHandle, 'index.json', dataToWrite);
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
                if (!Store._diskHashes.databases[dbId] || Store._diskHashes.databases[dbId] !== currentRamHash) {
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
                        let dataToWrite = AppState.documentPassword 
                            ? await CryptoUtils.encrypt(finalJsonStr, AppState.documentPassword, workspaceSalt) 
                            : finalJsonStr;
                        await Store._safeWriteFile(dbDir, `${dbId}.json`, dataToWrite);
                        Store._diskHashes.databases[dbId] = Store._hashObj(finalStateToWrite, cryptoPrefix);
                        Store._baseDatabases[dbId] = JSON.parse(JSON.stringify(finalStateToWrite));

                        // Notifica broadcast isolata dal workspaceId
                        if (Store._syncChannel && AppState.workspaceId) {
                            Store._syncChannel.postMessage({ 
                                workspaceId: AppState.workspaceId,
                                type: 'db_saved', 
                                tableId: dbId 
                            });
                        }
                    } catch (writeErr) {
                        console.error(`Errore scrittura DB ${dbId}.json:`, writeErr);
                        hasWriteErrors = true;
                    }
                }
            }

            if (syncedDatabasesCount > 0 && UI.showToast) {
                UI.showToast(`Sincronizzazione: Fusi ${syncedDatabasesCount} database concorrenti a livello di cella.`, "info");
            }

            // 3. SALVATAGGIO NOTE (GESTIONE CONFLITTI TRAMITE REVISION TOKEN revId)
            for (const note of AppState.notes) {
                const cleanNote = { ...note };
                Object.keys(cleanNote).forEach(key => { if (key.startsWith('_')) delete cleanNote[key]; });
                const currentHash = Store._hashObj(cleanNote, cryptoPrefix);

                if (note._isDirty || !Store._diskHashes.notes[note.id] || Store._diskHashes.notes[note.id] !== currentHash) {
                    
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
                                            continue; 
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
                        let dataToWrite = AppState.documentPassword 
                            ? await CryptoUtils.encrypt(noteStr, AppState.documentPassword, workspaceSalt) 
                            : noteStr;
                        await Store._safeWriteFile(notesDir, `${note.id}.json`, dataToWrite);

                        Store._diskHashes.notes[note.id] = Store._hashObj(cleanNote, cryptoPrefix);
                        note._isDirty = false;
                        delete note._isDraft;

                        // Notifica broadcast isolata dal workspaceId
                        if (Store._syncChannel && AppState.workspaceId) {
                            Store._syncChannel.postMessage({ 
                                workspaceId: AppState.workspaceId,
                                type: 'note_saved', 
                                noteId: note.id 
                            });
                        }
                    } catch (writeErr) {
                        console.error(`Errore scrittura nota ${note.id}.json:`, writeErr);
                        hasWriteErrors = true;
                    }
                }
            }

            // 4. GARBAGE COLLECTION FISICA (Eseguita solo se vi sono state cancellazioni effettive di file/entità)
            if (hasWriteErrors) {
                Store.isDirty = true;
                UI.showStatus("error");
                console.error("[STORE] Salvataggio completato con errori di I/O.");
            } else {
                if (Store._needsPhysicalGC) {
                    await Store.executePhysicalGarbageCollection();
                }

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

    _finalizeUIAfterLoad: () => {
        AppState.searchFilter = "";
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = "";
        
        AppState.showFavoritesInTree = false;
        AppState.showBookmarksInTree = false;
        AppState.showDbNotesInTree = false;

        UI._updateTabsUI('notes');
        UI.updateFileName(AppState.fileName);
        UI.renderTree();
        UI.closeEditor();

        const sb = document.getElementById('sidebar');
        const btn = document.getElementById('sidebarToggleBtn');
        if (sb) { sb.classList.remove('collapsed'); if (btn) btn.classList.add('active'); }

        Store.isDirty = false;
        UI.showStatus("saved");

        setTimeout(() => { if (AppState.showMinimap) UI.Minimap.sync(); }, 300);
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
            CryptoUtils.clearCache();

            // Pulizia silente di eventuali file residui di journal da versioni precedenti
            try {
                await dirHandle.removeEntry('.vault_journal.json');
            } catch (_) {}

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
                            const dText = await dFile.text();

                            // Caricamento diretto privo di mutazioni intermedie e doppia serializzazione (_id_hack)
                            await Store._decryptAndProcessFragment(dText, 'database', dbId);
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
        if (UI.promptWorkspaceGuide) {
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
                Editor.clearHistory();
                Editor.imageCache = {};
                Editor.audioCache = {};
                AppState.notes = []; 
                AppState.databases = {}; 
                AppState.homeCitations = []; 
                AppState.templates = []; 
                AppState.currentNoteId = null; 
                AppState.searchFilter = "";
            }

            AppState.workspaceHandle = dirHandle;
            AppState.workspaceId = 'ws_' + Store.generateId();
            AppState.fileName = dirHandle.name;
            AppState.documentPassword = null; 
            AppState.vaultSaltHex = null;
            CryptoUtils.clearCache();
            
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

            UI.setContinuousEdit(true);

            Store.isDirty = true;
            await Store.saveToFile();

            Store.saveLocalBackup();
            Store._finalizeUIAfterLoad();

            if (AppState.notes.length > 0) {
                UI.selectNote(AppState.notes[0].id);
            }
            UI.showToast("Workspace collegato e salvato su disco.", "success");

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

    _decryptAndProcessFragment: async (text, type, entityId = null) => {
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
            AppState.workspaceId = data.workspaceId || ('ws_' + Store.generateId());
            if (data.vaultSalt && /^[0-9a-fA-F]{32}$/.test(data.vaultSalt)) {
                AppState.vaultSaltHex = data.vaultSalt;
            }
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
            // Assegnazione diretta dell'ID database senza manipolazioni JSON intermedie
            const dbId = entityId || data.id || data._id_hack; 
            if (data._id_hack) delete data._id_hack;
            
            AppState.databases[dbId] = data;
            
            // HASH CANONICO
            const realHash = Store._hashObj(data, cryptoPrefix);
            Store._diskHashes.databases[dbId] = realHash;
            Store._baseDatabases[dbId] = JSON.parse(JSON.stringify(data));
        }
        return true;
    },

    _processLoadedMonolith: (parsedData) => {
        AppState.workspaceId = parsedData.workspaceId || ('ws_' + Store.generateId());
        if (parsedData.vaultSalt && /^[0-9a-fA-F]{32}$/.test(parsedData.vaultSalt)) {
            AppState.vaultSaltHex = parsedData.vaultSalt;
        }
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
    }
});

// Inizializzazione ricevitore sincronizzazione live tra finestre (Workflow Studio <-> VanillaDesk <-> Multi-Schede)
if (typeof BroadcastChannel !== 'undefined') {
    try {
        Store._syncChannel = new BroadcastChannel('vanilladesk_sync');
        Store._syncChannel.onmessage = async (event) => {
            const data = event.data;
            if (!data) return;

            // ISOLAMENTO RIGOROSO WORKSPACE: Se la scheda non ha un workspace aperto o il messaggio proviene da un workspace diverso, scarta subito
            if (!AppState.workspaceHandle || !AppState.workspaceId || !data.workspaceId) return;
            if (data.workspaceId !== AppState.workspaceId) return;

            if (data.type === 'db_saved' && data.tableId) {
                if (typeof AdvancedTable !== 'undefined' && typeof AdvancedTable.forceRecalculate === 'function') {
                    // Sincronizzazione automatica silenziosa (nessun toast di disturbo se scatta da un'altra scheda)
                    AdvancedTable.forceRecalculate(data.tableId, true);
                }
            } 
            else if (data.type === 'note_saved' && data.noteId) {
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