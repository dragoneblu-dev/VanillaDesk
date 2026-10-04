/**
 * js/store.js
 * Core Storage Engine: Gestione Stato in RAM, Hashing, Scanner Entità e Backup Locale.
 * Responsabilità:
 * 1. Modello Dati e Accessori: Identificatori univoci (generateId), query note (getNote, getChildren).
 * 2. Hashing e Rilevamento Modifiche: Calcolo hash canonici (_hashObj) e ispezione DOM/RAM (hasUnsavedChanges).
 * 3. Scanner Centralizzato Risorse: Scansione transitiva dipendenze e pulizia RAM (scanActiveEntities, cleanOrphanedRAMCaches).
 * 4. Orchestrazione Autosave: Gestione timer di debounce e segnalazione modifiche fisiche (triggerAutoSave, markNeedsPhysicalGC).
 * 5. Crash Recovery & Snapshot Standalone: Persistenza di emergenza su IndexedDB e import/export di file JSON monolitici.
 */

const DB_NAME = 'ProNotesDB';
const STORE_NAME = 'backupStore';

const Store = {
    isDirty: false,
    debounceTimer: null,
    dbPromise: null,
    _isSavingFile: false,
    _saveQueuePending: false,
    _isConflictResolving: false,
    _pendingRecoveryData: null,
    _syncChannel: null,
    _needsPhysicalGC: false,
    
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

    // Verifica se esistono mutazioni non salvate effettive rispetto a disco, RAM e DOM vivo
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
        
        // 2. Verifica note con modifiche non salvate (o nuove note non ancora su disco)
        for (const note of (AppState.notes || [])) {
            if (note._isDirty || note._isDraft) return true;
            const cleanNote = { ...note };
            Object.keys(cleanNote).forEach(key => { if (key.startsWith('_')) delete cleanNote[key]; });
            const currentHash = Store._hashObj(cleanNote, cryptoPrefix);
            if (!Store._diskHashes.notes[note.id] || Store._diskHashes.notes[note.id] !== currentHash) {
                return true;
            }
        }

        // 3. Verifica database e blocchi codice con modifiche non salvate (o nuovi componenti non ancora su disco)
        for (const [dbId, ramState] of Object.entries(AppState.databases || {})) {
            const currentRamHash = Store._hashObj(ramState, cryptoPrefix);
            if (!Store._diskHashes.databases[dbId] || Store._diskHashes.databases[dbId] !== currentRamHash) {
                return true;
            }
        }

        return false;
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

    // =========================================================================
    // SCANNER UNIFICATO IDENTIFICATORI ATTIVI & TRANSIZIONE (RAM & DISK)
    // =========================================================================
    scanActiveEntities: () => {
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

        // 2. Scansiona Stack di Undo/Redo per preservare asset ripristinabili
        if (Editor.undoStack) Editor.undoStack.forEach(extractIds);
        if (Editor.redoStack) Editor.redoStack.forEach(extractIds);

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
        const { activeDbIds, activeImageIds, activeAudioIds } = Store.scanActiveEntities();

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

    prepareForSave: () => {
        Store.cleanOrphanedRAMCaches();
        return {
            workspaceId: AppState.workspaceId || null,
            vaultSalt: AppState.vaultSaltHex || null,
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
        // Se l'utente sta interagendo con il modale di conflitto, nessun salvataggio automatico deve partire
        if (Store._isConflictResolving) return;

        // Se non vi è alcuna modifica reale pendente e non è richiesta azione manuale, non sporcare lo stato
        if (!forceImmediate && !isManualAction && !Store.isDirty && !Store.hasUnsavedChanges()) {
            return;
        }

        Store.isDirty = true;

        // Sessione solo in RAM (senza cartella Workspace collegata su disco)
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
                if (Store.isDirty && !AppState.workspaceHandle && !Store._isConflictResolving) {
                    Store.saveLocalBackup();
                }
            }, 1500);
            return;
        }

        // Workspace su disco attivo: salvataggio immediato o debouciato a 1500ms
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

            AppState.fileName = I18n.t('common.session_recovered');
            if (typeof AdvancedTable !== 'undefined') {
                AdvancedTable.ensureSystemPropertiesDB();
            }

            Store._finalizeUIAfterLoad();
            Store.isDirty = true;
            UI.showStatus("unsaved");

            const btn = document.getElementById('btnRecoverSession');
            if (btn) btn.style.display = 'none';

            Store._pendingRecoveryData = null;

            UI.showToast("Sessione precedente caricata in memoria. Salva in un Workspace per renderla permanente.", "info");
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

            Editor.clearHistory();

            // Azzeramento pulsante e cache sessione di recupero
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

            AppState.fileName = `${fileName} (Backup)`;
            if (typeof AdvancedTable !== 'undefined') AdvancedTable.ensureSystemPropertiesDB();

            Store._finalizeUIAfterLoad();
            Store.isDirty = true;
            Store.saveLocalBackup();
            UI.showStatus("unsaved");

            UI.showToast("File JSON di backup caricato con successo.", "success");
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Errore caricamento backup JSON:", err);
                alert("Errore durante il caricamento del file JSON: " + err.message);
            }
        }
    }
};