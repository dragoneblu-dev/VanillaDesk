/**
 * js/store.js
 * Core Storage Engine: Gestione Stato in RAM, Hashing, Scanner Entità e Backup Locale.
 * Responsabilità:
 * 1. Modello Dati e Accessori: Identificatori univoci (generateId), query note (getNote, getChildren).
 * 2. Hashing e Rilevamento Modifiche: Calcolo hash canonici (_hashObj) e ispezione DOM/RAM (hasUnsavedChanges).
 * 3. Scanner Centralizzato Risorse: Scansione transitiva dipendenze e pulizia RAM (scanActiveEntities, cleanOrphanedRAMCaches).
 * 4. Orchestrazione Autosave: Gestione timer di debounce e segnalazione modifiche fisiche (triggerAutoSave, markNeedsPhysicalGC).
 * 5. Crash Recovery Isolato: Persistenza di emergenza su IndexedDB ATTIVA ESCLUSIVAMENTE per la sessione volatile in RAM (senza workspace).
 *    Blocco tassativo di scrittura su IDB se è presente un Workspace su disco o in IDB.
 * 6. Audit Allegati Orfani: Censimento degli asset non referenziati su disco o IDB con calcolo peso (getOrphanedAssets, deleteOrphanedAssets).
 * 7. Tracciamento data e ora dell'ultimo Backup JSON esportato (lastBackupAt).
 * 8. ZERO FORCED AUTO-OPEN: All'avvio l'applicazione non carica forzatamente l'ultimo workspace IDB,
 *    presentando sempre la schermata iniziale per lasciare all'utente la piena libertà di scelta.
 * 9. FIX AGGIORNAMENTO BACKUP IDB & DIFFING OVERRIDE: Ripristino forzato di tutte le note del backup
 *    tramite marcatura _isDirty su tutte le entità e reset degli hash per prevenire il salto di note esistenti.
 * 10. RECOVERY SELETTIVO: Il pulsante "Ripristina Sessione" si mostra unicamente se era aperta una sessione volatile in sola RAM.
 * CLEAN I18N CALLS: Chiamate dirette a I18n.t() senza controlli ternari o stringhe di fallback duplicate.
 * Ottimizzazione O(1) di hasUnsavedChanges per prevenire blocchi computazionali su collezioni con 1000+ note.
 * REFACTOR: La logica specifica per IndexedDB è delegata a js/store-idb.js.
 */

const Store = {
    isDirty: false,
    debounceTimer: null,
    dbPromise: null,
    _activeDB: null,
    _openingPromise: null,
    _isSavingFile: false,
    _saveQueuePending: false,
    _isConflictResolving: false,
    _pendingRecoveryData: null,
    _syncChannel: null,
    _needsPhysicalGC: false,
    _lastImportedAssets: null,
    
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

    // Crea l'Hash convertendo l'oggetto in stringa minificata con prefisso crittografico
    _hashObj: (obj, cryptoPrefix = "") => {
        return Store._simpleHash(cryptoPrefix + JSON.stringify(obj));
    },

    // Ottiene o inizializza il Salt univoco del Workspace per la crittografia di sessione
    _getWorkspaceSalt: () => {
        if (AppState.vaultSaltHex && /^[0-9a-fA-F]{32}$/.test(AppState.vaultSaltHex)) {
            return new Uint8Array(AppState.vaultSaltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        }
        const newSalt = crypto.getRandomValues(new Uint8Array(16));
        AppState.vaultSaltHex = Array.from(newSalt).map(b => b.toString(16).padStart(2, '0')).join('');
        return newSalt;
    },

    // Resetta la sessione crittografica (es. rimozione o rotazione password)
    resetCryptoSession: () => {
        CryptoUtils.clearCache();
        AppState.vaultSaltHex = null;
        Store._diskHashes = { notes: {}, databases: {}, index: "" };
    },

    // Segnala che sono avvenute cancellazioni di entità e che è richiesta la Garbage Collection fisica al prossimo salvataggio
    markNeedsPhysicalGC: () => {
        Store._needsPhysicalGC = true;
    },

    // Verifica se esistono mutazioni non salvate effettive rispetto a disco, RAM e DOM vivo (ottimizzato O(1) per 1000+ note)
    hasUnsavedChanges: () => {
        if (Store.isDirty) return true;

        // 1. Ispezione in tempo reale del DOM vivo dell'editor per rilevare cancellazioni di testo
        if (AppState.currentNoteId && AppState.isEditMode && !AppState.isSwitchingNote) {
            const editorEl = document.getElementById('noteContent');
            const curNote = Store.getNote(AppState.currentNoteId);
            if (editorEl && curNote && Editor.minifyHTMLForStorage) {
                const liveHtml = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                if (liveHtml !== curNote.content) {
                    return true;
                }
            }
        }

        const cryptoPrefix = AppState.documentPassword ? "ENC_" : "RAW_";
        
        // 2. Verifica rapida O(1) note con modifiche non salvate (o nuove note non ancora su disco/IDB)
        for (const note of (AppState.notes || [])) {
            if (note._isDirty || note._isDraft) return true;
            if (!Store._diskHashes.notes[note.id]) return true;
        }

        // 3. Verifica database e blocchi codice con modifiche non salvate (o nuovi componenti non ancora su disco/IDB)
        for (const [dbId, ramState] of Object.entries(AppState.databases || {})) {
            if (!Store._diskHashes.databases[dbId]) return true;
            const currentRamHash = Store._hashObj(ramState, cryptoPrefix);
            if (Store._diskHashes.databases[dbId] !== currentRamHash) {
                return true;
            }
        }

        return false;
    },

    generateId: () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
    },

    getNote: (id) => AppState.notes.find(n => n.id === id) || null,

    getChildren: (parentId, includeDeleted = false) => AppState.notes.filter(n => n.parentId === parentId && (includeDeleted || !n.deletedAt)),

    // =========================================================================
    // SCANNER UNIFICATO IDENTIFICATORI ATTIVI & TRANSIZIONE (RAM & DISK/IDB)
    // =========================================================================
    scanActiveEntities: (includeUndoStack = true) => {
        const activeDbIds = new Set(['SYS_PROPERTIES_DB']);
        const activeImageIds = new Set();
        const activeAudioIds = new Set();
        const validNoteIds = new Set((AppState.notes || []).map(n => n.id));

        const extractIds = (htmlString) => {
            if (!htmlString || typeof htmlString !== 'string') return;
            const dbRegex = /id=["'](adv_tbl_[^"']+|adv_journal_[^"']+|adv_code_[^"']+|adv_btnbar_[^"']+|adv_pivot_[^"']+|adv_link_[^"']+|adv_cols_[^"']+|adv_audio_[^"']+|adv_vid_[^"']+)["']/g;
            let match;
            while ((match = dbRegex.exec(htmlString)) !== null) activeDbIds.add(match[1].split('_cited_')[0]);

            const imgRegex = /data-image-ref=["']([^"']+)["']/g;
            while ((match = imgRegex.exec(htmlString)) !== null) activeImageIds.add(match[1]);

            const audRegex = /data-audio-ref=["']([^"']+)["']/g;
            while ((match = audRegex.exec(htmlString)) !== null) activeAudioIds.add(match[1]);
        };

        // 1. Scansiona Editor Visibile e tutte le Note (comprese quelle nel cestino per preservarne gli allegati)
        const editor = document.getElementById('noteContent');
        if (editor) extractIds(editor.innerHTML);
        (AppState.notes || []).forEach(note => extractIds(note.content));

        // 2. Scansiona Stack di Undo/Redo per preservare asset ripristinabili (escluso durante verifiche orfani esplicite)
        if (includeUndoStack) {
            if (Editor.undoStack) Editor.undoStack.forEach(extractIds);
            if (Editor.redoStack) Editor.redoStack.forEach(extractIds);
        }

        // 3. Scansiona Template (contenuto e widget interni)
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

        // 4. Scansione Transitiva delle Dipendenze Relazionali, Viste, Macro e Automazioni
        if (AppState.databases) {
            let dependenciesAdded = true;
            while (dependenciesAdded) {
                dependenciesAdded = false;
                for (const dbId of Array.from(activeDbIds)) {
                    const dbState = AppState.databases[dbId];
                    if (!dbState) continue;

                    // Sorgente di Viste Collegate o Tabelle Pivot
                    if (dbState.sourceTableId && !activeDbIds.has(dbState.sourceTableId)) {
                        activeDbIds.add(dbState.sourceTableId);
                        dependenciesAdded = true;
                    }

                    // Relazioni, Rollup e Backlink tra tabelle
                    if (Array.isArray(dbState.columns)) {
                        dbState.columns.forEach(col => {
                            if (col.targetTableId && !activeDbIds.has(col.targetTableId)) {
                                activeDbIds.add(col.targetTableId);
                                dependenciesAdded = true;
                            }
                            if (col.linkedTableId && !activeDbIds.has(col.linkedTableId)) {
                                activeDbIds.add(col.linkedTableId);
                                dependenciesAdded = true;
                            }
                        });
                    }

                    // Database bersaglio di pulsanti Macro
                    if (Array.isArray(dbState.buttons)) {
                        dbState.buttons.forEach(btn => {
                            if (Array.isArray(btn.actionBlocks)) {
                                btn.actionBlocks.forEach(blk => {
                                    if (blk.targetDbId && blk.targetDbId !== 'THIS_ROW' && !activeDbIds.has(blk.targetDbId)) {
                                        activeDbIds.add(blk.targetDbId);
                                        dependenciesAdded = true;
                                    }
                                    if (blk.sourceDbId && !activeDbIds.has(blk.sourceDbId)) {
                                        activeDbIds.add(blk.sourceDbId);
                                        dependenciesAdded = true;
                                    }
                                });
                            }
                        });
                    }

                    // Database bersaglio di automazioni
                    if (Array.isArray(dbState.automations)) {
                        dbState.automations.forEach(auto => {
                            if (Array.isArray(auto.actions)) {
                                auto.actions.forEach(act => {
                                    if (act.colId === 'SYS_ACTION' && act.type === 'insert_row' && act.value && !activeDbIds.has(act.value)) {
                                        activeDbIds.add(act.value);
                                        dependenciesAdded = true;
                                    }
                                });
                            }
                        });
                    }
                }
            }

            // Scansione celle dei Database in RAM per allegati multimediali
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

        return { activeDbIds, activeImageIds, activeAudioIds, validNoteIds };
    },

    cleanOrphanedRAMCaches: () => {
        const { activeDbIds, activeImageIds, activeAudioIds } = Store.scanActiveEntities(true);

        // 1. Purga DB Orfani in RAM (preservando SYS_PROPERTIES_DB e le dipendenze transitive)
        if (AppState.databases) {
            Object.keys(AppState.databases).forEach(id => {
                if (!activeDbIds.has(id)) delete AppState.databases[id];
            });
        }

        // 2. Purga Immagini Orfane in RAM
        if (Editor.imageCache) {
            Object.keys(Editor.imageCache).forEach(id => {
                if (!activeImageIds.has(id)) {
                    URL.revokeObjectURL(Editor.imageCache[id]);
                    delete Editor.imageCache[id];
                }
            });
        }

        // 3. Purga Audio Orfani in RAM
        if (Editor.audioCache) {
            Object.keys(Editor.audioCache).forEach(id => {
                if (!activeAudioIds.has(id)) {
                    URL.revokeObjectURL(Editor.audioCache[id]);
                    delete Editor.audioCache[id];
                }
            });
        }
    },

    // Scansiona fisicamente la cartella assets/ o l'archivio IDB rilevando file orfani e spazio occupato
    getOrphanedAssets: async () => {
        if (!AppState.assetsHandle && AppState.storageMode !== 'idb') {
            return { count: 0, totalSize: 0, formattedSize: '0 Bytes', files: [] };
        }

        const { activeImageIds, activeAudioIds } = Store.scanActiveEntities(false);
        const orphanFiles = [];
        let totalBytes = 0;

        if (AppState.storageMode === 'idb') {
            try {
                const assetRecords = typeof Store.idbListAssets === 'function'
                    ? await Store.idbListAssets(AppState.workspaceId)
                    : [];

                for (const asset of assetRecords) {
                    const isImg = asset.name.startsWith('img_');
                    const isAud = asset.name.startsWith('aud_');
                    if ((isImg && !activeImageIds.has(asset.name)) || (isAud && !activeAudioIds.has(asset.name))) {
                        const size = asset.size || (asset.blob ? asset.blob.size : 0);
                        totalBytes += size;
                        orphanFiles.push({
                            name: asset.name,
                            size: size,
                            type: isImg ? 'img' : 'aud'
                        });
                    }
                }
            } catch (e) {
                console.warn("[STORE] Errore scansione allegati orfani in IDB:", e);
            }
        } else if (AppState.assetsHandle) {
            try {
                for await (const entry of AppState.assetsHandle.values()) {
                    if (entry.kind === 'file') {
                        const isImg = entry.name.startsWith('img_');
                        const isAud = entry.name.startsWith('aud_');

                        if ((isImg && !activeImageIds.has(entry.name)) || (isAud && !activeAudioIds.has(entry.name))) {
                            let size = 0;
                            try {
                                const file = await entry.getFile();
                                size = file.size || 0;
                            } catch (_) {}

                            totalBytes += size;
                            orphanFiles.push({
                                name: entry.name,
                                size: size,
                                type: isImg ? 'img' : 'aud'
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn("[STORE] Errore scansione allegati orfani su disco:", e);
            }
        }

        const formattedSize = typeof UI._formatBytes === 'function' 
            ? UI._formatBytes(totalBytes) 
            : `${Math.round(totalBytes / 1024)} KB`;

        return {
            count: orphanFiles.length,
            totalSize: totalBytes,
            formattedSize: formattedSize,
            files: orphanFiles
        };
    },

    // Elimina fisicamente dalla cartella assets/ o da idb_assets solo i file orfani non utilizzati
    deleteOrphanedAssets: async (orphansList = null) => {
        if (!AppState.assetsHandle && AppState.storageMode !== 'idb') return 0;

        const orphans = orphansList || (await Store.getOrphanedAssets()).files;
        let deletedCount = 0;

        for (const fileInfo of orphans) {
            try {
                if (AppState.storageMode === 'idb') {
                    await Store.idbDeleteAsset(AppState.workspaceId, fileInfo.name);
                } else if (AppState.assetsHandle) {
                    await AppState.assetsHandle.removeEntry(fileInfo.name);
                }
                deletedCount++;

                if (fileInfo.type === 'img' && Editor.imageCache && Editor.imageCache[fileInfo.name]) {
                    try { URL.revokeObjectURL(Editor.imageCache[fileInfo.name]); } catch (_) {}
                    delete Editor.imageCache[fileInfo.name];
                } else if (fileInfo.type === 'aud' && Editor.audioCache && Editor.audioCache[fileInfo.name]) {
                    try { URL.revokeObjectURL(Editor.audioCache[fileInfo.name]); } catch (_) {}
                    delete Editor.audioCache[fileInfo.name];
                }
            } catch (err) {
                console.warn(`[STORE] Impossibile eliminare allegato orfano ${fileInfo.name}:`, err);
            }
        }

        return deletedCount;
    },

    prepareForSave: () => {
        Store.cleanOrphanedRAMCaches();
        return {
            workspaceId: AppState.workspaceId || null,
            vaultSalt: AppState.vaultSaltHex || null,
            lastBackupAt: AppState.lastBackupAt || null,
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

    triggerAutoSave: (forceImmediate = false, isManualAction = false) => {
        if (Store._isConflictResolving) return;

        if (!forceImmediate && !isManualAction && !Store.isDirty && !Store.hasUnsavedChanges()) {
            return;
        }

        Store.isDirty = true;

        // 1. MODALITÀ BROWSER (IndexedDB)
        if (AppState.storageMode === 'idb') {
            UI.showStatus("pending");
            if (forceImmediate) {
                clearTimeout(Store.debounceTimer);
                Store.saveToIndexedDB();
                return;
            }
            clearTimeout(Store.debounceTimer);
            Store.debounceTimer = setTimeout(() => {
                if (Store.isDirty && AppState.storageMode === 'idb' && !Store._isConflictResolving) {
                    Store.saveToIndexedDB();
                }
            }, 1500);
            return;
        }

        // 2. MODALITÀ TRANSITORIA (Sola RAM / File JSON standalone: nessun Workspace permanente collegato)
        if (!AppState.workspaceHandle) {
            UI.showStatus("unsaved");
            if (isManualAction) {
                Store.createWorkspace(false).catch(e => console.warn(e));
            }

            if (forceImmediate) {
                clearTimeout(Store.debounceTimer);
                Store.saveLocalBackup();
                return;
            }

            clearTimeout(Store.debounceTimer);
            Store.debounceTimer = setTimeout(() => {
                if (Store.isDirty && !AppState.workspaceHandle && AppState.storageMode !== 'idb' && !Store._isConflictResolving) {
                    Store.saveLocalBackup();
                }
            }, 1500);
            return;
        }

        // 3. MODALITÀ CARTELLA PC (File System Access API) - Solo file su Hard Disk
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
                UI.showToast(I18n.t('store.toast_monolithic_backup_saved'), "success");
            } else Store.downloadSnapshot();
        } catch (err) {}
    },

    // Salva lo snapshot di emergenza in IndexedDB SOLO per la sessione volatile in RAM (senza workspace)
    saveLocalBackup: async () => {
        // REGOLA AUREA: Se è attivo un Workspace su Hard Disk o nel Browser, NON toccare MAI IndexedDB!
        if (AppState.workspaceHandle || AppState.storageMode === 'idb') {
            return;
        }

        try {
            const db = await Store.initDB();
            const storeName = Store.STORE_BACKUP || 'backupStore';
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            
            const payloadObj = Store.prepareForSave();
            let dataToStore = payloadObj;

            if (AppState.documentPassword) {
                const jsonStr = JSON.stringify(payloadObj);
                const encryptedStr = await CryptoUtils.encrypt(jsonStr, AppState.documentPassword);
                dataToStore = { 
                    _isEncryptedBackup: true, 
                    payload: encryptedStr,
                    _isDirty: Store.isDirty,
                    _storageMode: 'ram',
                    _hasWorkspace: false,
                    _savedAt: Date.now()
                };
            } else {
                dataToStore._isDirty = Store.isDirty;
                dataToStore._storageMode = 'ram';
                dataToStore._hasWorkspace = false;
                dataToStore._savedAt = Date.now();
            }
            
            store.put(dataToStore, 'crash_recovery');
        } catch (e) {}
    },

    // Elimina fisicamente lo snapshot di crash recovery
    clearLocalBackup: async () => {
        try {
            const db = await Store.initDB();
            const storeName = Store.STORE_BACKUP || 'backupStore';
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).delete('crash_recovery');
        } catch (_) {}
    },

    checkRecoverableSession: async () => {
        try {
            const db = await Store.initDB();
            const storeName = Store.STORE_BACKUP || 'backupStore';
            if (!db.objectStoreNames.contains(storeName)) return;

            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get('crash_recovery');
            request.onsuccess = () => {
                const result = request.result;
                if (!result) return;
                
                const hasNotes = result.notes && result.notes.length > 0;
                const hasEncrypted = result._isEncryptedBackup && result.payload;

                if (!hasNotes && !hasEncrypted) return;

                // Mostra il pulsante ESCLUSIVAMENTE se la sessione era in sola RAM (nessun workspace cartella/IDB collegato)
                const isStandaloneSession = !result._hasWorkspace || result._storageMode === 'ram';

                if (isStandaloneSession) {
                    Store._pendingRecoveryData = result;
                    const btn = document.getElementById('btnRecoverSession');
                    if (btn) btn.style.display = 'inline-flex';
                }
            };
        } catch (e) {
            console.warn("Impossibile verificare la sessione precedente:", e);
        }
    },

    // All'avvio dell'applicazione non carica forzatamente un workspace IDB precedente:
    // presenta la schermata iniziale pulita verificando solo la presenza di dati da crash recovery.
    recoverFromCrash: async () => {
        console.log("[Store] Verifica sessione all'avvio...");
        await Store.checkRecoverableSession();
    },

    restoreRecoveredSession: async () => {
        const result = Store._pendingRecoveryData;
        if (!result) return;

        try {
            if (result._isEncryptedBackup && result.payload) {
                const password = await UI.PasswordManager.promptForOpen(I18n.t('store.prompt_interrupted_session_password'));
                if (!password) return; 

                try {
                    const decryptedJson = await CryptoUtils.decrypt(result.payload, password);
                    AppState.documentPassword = password;
                    Store._processLoadedMonolith(JSON.parse(decryptedJson));
                } catch (e) { 
                    alert(I18n.t('store.alert_wrong_password')); 
                    return;
                }
            } else if (result.notes && result.notes.length > 0) {
                Store._processLoadedMonolith(result);
            }

            AppState.fileName = I18n.t('common.session_recovered');
            AppState.storageMode = 'ram';
            AppState.workspaceHandle = null;
            AppState.assetsHandle = null;

            if (typeof AdvancedTable !== 'undefined') {
                AdvancedTable.ensureSystemPropertiesDB();
            }

            Store._finalizeUIAfterLoad();
            Store.isDirty = true;
            UI.showStatus("unsaved");

            // Spegne il pulsante discreto dopo il ripristino e consuma il backup per non duplicarlo
            const btn = document.getElementById('btnRecoverSession');
            if (btn) btn.style.display = 'none';

            Store.clearLocalBackup();
            Store._pendingRecoveryData = null;

            UI.showToast(I18n.t('store.toast_previous_session_loaded'), "info");
        } catch(err) {
            console.error("Errore nel ripristino della sessione:", err);
            alert(I18n.t('store.alert_restore_session_error', { error: err.message }));
        }
    },

    downloadSnapshot: async () => {
        let payloadObj = Store.prepareForSave();

        // In modalità IDB, estrae e serializza gli allegati multimediali memorizzati in idb_assets
        if (AppState.storageMode === 'idb' && AppState.workspaceId && typeof Store.idbListAssets === 'function') {
            try {
                const assetsList = await Store.idbListAssets(AppState.workspaceId);

                if (assetsList.length > 0) {
                    payloadObj.assets = {};
                    for (const asset of assetsList) {
                        if (asset.name && asset.blob) {
                            const dataUrl = await new Promise(r => {
                                const reader = new FileReader();
                                reader.onload = () => r(reader.result);
                                reader.onerror = () => r(null);
                                reader.readAsDataURL(asset.blob);
                            });
                            if (dataUrl) {
                                payloadObj.assets[asset.name] = dataUrl;
                            }
                        }
                    }
                }
            } catch (assetErr) {
                console.warn("[STORE] Errore serializzazione allegati per backup JSON:", assetErr);
            }
        }

        let dataToWrite = JSON.stringify(payloadObj, null, 2);
        if (AppState.documentPassword) dataToWrite = await CryptoUtils.encrypt(dataToWrite, AppState.documentPassword);

        const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(dataToWrite);
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        let cleanFileName = (AppState.fileName || "Workspace").replace(/\.json$/i, '');
        const date = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
        downloadAnchorNode.setAttribute("download", `${cleanFileName}_Backup_${date}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();

        // Registrazione data e ora ultimo backup per workspace nel browser
        if (AppState.storageMode === 'idb' && AppState.workspaceId) {
            AppState.lastBackupAt = new Date().toISOString();
            if (typeof Store.saveToIndexedDB === 'function') {
                Store.saveToIndexedDB();
            }
        }
    },

    loadSnapshot: async () => {
        try {
            let text = "";
            let fileName = I18n.t('store.default_backup_filename');

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

            // Decisione preventiva esplicita dell'utente sul tipo di caricamento
            let isOverwritingCurrentIdbWs = false;
            let targetWsId = null;
            let targetWsName = null;

            if (AppState.storageMode === 'idb' && AppState.workspaceId) {
                const choice = confirm(I18n.t('store.confirm_overwrite_or_new_idb_ws', { name: AppState.fileName }));
                if (choice) {
                    isOverwritingCurrentIdbWs = true;
                    targetWsId = AppState.workspaceId;
                    targetWsName = AppState.fileName;
                }
            } else if ((AppState.workspaceHandle || AppState.storageMode === 'idb') && Store.isDirty) {
                if (!confirm(I18n.t('store.confirm_replace_unsaved_session'))) {
                    return;
                }
            } else if (AppState.notes && AppState.notes.length > 0) {
                if (!confirm(I18n.t('store.confirm_replace_current_data'))) {
                    return;
                }
            }

            Editor.clearHistory();

            const btnRec = document.getElementById('btnRecoverSession');
            if (btnRec) btnRec.style.display = 'none';
            Store._pendingRecoveryData = null;

            AppState.workspaceHandle = null;
            AppState.assetsHandle = null;
            Store._diskHashes = { notes: {}, databases: {}, index: "" };
            Store._baseDatabases = {};
            CryptoUtils.clearCache();

            const success = await Store._decryptAndProcess(text);
            if (!success) return;

            const wsName = `${fileName}`;
            if (AppState.storageMode === 'idb') {
                if (isOverwritingCurrentIdbWs && targetWsId) {
                    console.log(`[Store] Aggiornamento del workspace IDB esistente "${targetWsName}" (${targetWsId})...`);
                    
                    AppState.workspaceId = targetWsId;
                    AppState.idbWorkspaceId = targetWsId;
                    AppState.fileName = targetWsName;
                    AppState.lastBackupAt = new Date().toISOString();

                    // Pulisce preventivamente i vecchi record in IDB per quel workspaceId prima di scrivere i nuovi dati
                    if (typeof Store.idbClearWorkspaceData === 'function') {
                        await Store.idbClearWorkspaceData(targetWsId, false);
                    }

                    // Scrive gli asset importati in idb_assets
                    if (Store._lastImportedAssets && typeof Store.idbSaveAsset === 'function') {
                        for (const [name, dataUrl] of Object.entries(Store._lastImportedAssets)) {
                            try {
                                const res = await fetch(dataUrl);
                                const blob = await res.blob();
                                await Store.idbSaveAsset(targetWsId, name, blob, blob.type);
                                const blobUrl = URL.createObjectURL(blob);
                                if (name.startsWith('img_')) Editor.imageCache[name] = blobUrl;
                                if (name.startsWith('aud_')) Editor.audioCache[name] = blobUrl;
                            } catch (_) {}
                        }
                        Store._lastImportedAssets = null;
                    }

                    // Diffing override: marca _isDirty = true su tutte le note e DB affinché nulla venga saltato
                    AppState.notes.forEach(n => { n._isDirty = true; });
                    Store.isDirty = true;
                    Store._diskHashes = { notes: {}, databases: {}, index: "" };
                    
                    await Store.saveToIndexedDB();
                    localStorage.setItem('vanilladesk_active_idb_ws', targetWsId);
                    localStorage.setItem('vanilladesk_storage_mode', 'idb');
                    UI.showToast(I18n.t('store.toast_idb_ws_updated_from_backup', { name: targetWsName }), "success");
                } else {
                    // Creazione di un nuovo workspace distinto nel browser
                    const newWsId = 'ws_' + Store.generateId();
                    console.log(`[Store] Importazione backup come NUOVO workspace IDB: "${wsName}" (${newWsId})...`);
                    AppState.workspaceId = newWsId;
                    AppState.idbWorkspaceId = newWsId;
                    AppState.fileName = wsName;
                    AppState.lastBackupAt = new Date().toISOString();

                    // Scrive gli asset importati in idb_assets per il nuovo workspace
                    if (Store._lastImportedAssets && typeof Store.idbSaveAsset === 'function') {
                        for (const [name, dataUrl] of Object.entries(Store._lastImportedAssets)) {
                            try {
                                const res = await fetch(dataUrl);
                                const blob = await res.blob();
                                await Store.idbSaveAsset(newWsId, name, blob, blob.type);
                                const blobUrl = URL.createObjectURL(blob);
                                if (name.startsWith('img_')) Editor.imageCache[name] = blobUrl;
                                if (name.startsWith('aud_')) Editor.audioCache[name] = blobUrl;
                            } catch (_) {}
                        }
                        Store._lastImportedAssets = null;
                    }

                    AppState.notes.forEach(n => { n._isDirty = true; });
                    Store.isDirty = true;
                    Store._diskHashes = { notes: {}, databases: {}, index: "" };

                    await Store.saveToIndexedDB();
                    localStorage.setItem('vanilladesk_active_idb_ws', newWsId);
                    localStorage.setItem('vanilladesk_storage_mode', 'idb');
                    UI.showToast(I18n.t('store.toast_backup_imported_as_new_ws', { name: wsName }), "success");
                }
            } else {
                AppState.storageMode = 'ram';
                AppState.fileName = `${fileName} (${I18n.t('store.default_backup_filename')})`;
                AppState.notes.forEach(n => { n._isDirty = true; });
                Store.isDirty = true;
                Store._diskHashes = { notes: {}, databases: {}, index: "" };
                Store.saveLocalBackup();
                UI.showStatus("unsaved");
                UI.showToast(I18n.t('store.toast_json_backup_loaded_ram'), "success");
            }

            if (typeof AdvancedTable !== 'undefined') AdvancedTable.ensureSystemPropertiesDB();
            Store._finalizeUIAfterLoad();

        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Errore caricamento backup JSON:", err);
                alert(I18n.t('store.alert_load_json_error', { error: err.message }));
            }
        }
    }
};