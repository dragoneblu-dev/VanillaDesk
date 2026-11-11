/**
 * js/store-idb.js
 * Modulo dedicato per la gestione dello Storage IndexedDB (Memoria del Browser).
 * Responsabilità:
 * 1. Schema IndexedDB v3 (idb_workspaces, idb_notes, idb_databases, idb_assets, backupStore).
 * 2. Inizializzazione anti-deadlock con timeout di salvaguardia e gestione cooperativa di versionchange.
 * 3. Operazioni CRUD per Asset binari (Blob/Immagini/Audio) in memoria del browser.
 * 4. Transazioni singole atomiche differenziali (saveToIndexedDB) con supporto crittografia AES-GCM e sync multi-scheda.
 * 5. Creazione, apertura, elenco, rinomina ed eliminazione dei Workspace salvati in IndexedDB con verifica password.
 * 6. Tracciamento data e ora dell'ultimo Backup JSON fisico esportato (lastBackupAt) per proteggere da eviction aziendale.
 * 7. Salvataggio preventivo dello stato prima di cambiare o caricare un altro workspace.
 * 8. Astrazione centralizzata per query singole e pulizia dati (idbGetNote, idbGetDatabase, idbListAssets, idbClearWorkspaceData).
 * Svuotamento coerente dello snapshot crash_recovery al termine positivo della scrittura su IndexedDB.
 * CLEAN I18N CALLS: Chiamate dirette a I18n.t() senza controlli ternari o stringhe di fallback duplicate.
 */

// Costanti di schema centralizzate sull'oggetto Store
Store.DB_NAME = 'ProNotesDB';
Store.DB_VERSION = 3;
Store.STORE_BACKUP = 'backupStore';
Store.STORE_WORKSPACES = 'idb_workspaces';
Store.STORE_NOTES = 'idb_notes';
Store.STORE_DATABASES = 'idb_databases';
Store.STORE_ASSETS = 'idb_assets';

Object.assign(Store, {

    // Inizializzazione con Singleton Promise anti-deadlock, timeout e gestione cooperativa versionchange
    initDB: () => {
        if (Store._activeDB) {
            const names = Store._activeDB.objectStoreNames;
            if (names.contains(Store.STORE_BACKUP) && 
                names.contains(Store.STORE_WORKSPACES) && 
                names.contains(Store.STORE_NOTES) && 
                names.contains(Store.STORE_DATABASES) && 
                names.contains(Store.STORE_ASSETS)) {
                return Promise.resolve(Store._activeDB);
            }
            try { Store._activeDB.close(); } catch (_) {}
            Store._activeDB = null;
        }

        if (Store._openingPromise) {
            return Store._openingPromise;
        }

        Store._openingPromise = new Promise((resolve, reject) => {
            console.log(`[IDB Storage] Apertura IndexedDB "${Store.DB_NAME}" versione ${Store.DB_VERSION}...`);

            let isSettled = false;
            const openTimeout = setTimeout(() => {
                if (!isSettled) {
                    isSettled = true;
                    Store._openingPromise = null;
                    console.warn("[IDB Storage] Timeout apertura IndexedDB (4s). Reset promise.");
                    reject(new Error("Timeout apertura IndexedDB. Possibile blocco da altra scheda aperta."));
                }
            }, 4000);

            try {
                const request = indexedDB.open(Store.DB_NAME, Store.DB_VERSION);

                request.onblocked = () => {
                    console.warn("[IDB Storage] Connessione bloccata da altra istanza o scheda aperta. Chiudere le altre schede di VanillaDesk per completare l'aggiornamento.");
                };

                request.onupgradeneeded = (e) => {
                    console.log(`[IDB Storage] Upgrade schema da v${e.oldVersion} a v${Store.DB_VERSION}...`);
                    const db = e.target.result;

                    if (!db.objectStoreNames.contains(Store.STORE_BACKUP)) {
                        db.createObjectStore(Store.STORE_BACKUP);
                    }
                    if (!db.objectStoreNames.contains(Store.STORE_WORKSPACES)) {
                        db.createObjectStore(Store.STORE_WORKSPACES, { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains(Store.STORE_NOTES)) {
                        const noteStore = db.createObjectStore(Store.STORE_NOTES, { keyPath: ['workspaceId', 'id'] });
                        noteStore.createIndex('by_workspace', 'workspaceId', { unique: false });
                    }
                    if (!db.objectStoreNames.contains(Store.STORE_DATABASES)) {
                        const dbStore = db.createObjectStore(Store.STORE_DATABASES, { keyPath: ['workspaceId', 'id'] });
                        dbStore.createIndex('by_workspace', 'workspaceId', { unique: false });
                    }
                    if (!db.objectStoreNames.contains(Store.STORE_ASSETS)) {
                        const assetStore = db.createObjectStore(Store.STORE_ASSETS, { keyPath: ['workspaceId', 'name'] });
                        assetStore.createIndex('by_workspace', 'workspaceId', { unique: false });
                    }
                };

                request.onsuccess = () => {
                    clearTimeout(openTimeout);
                    if (isSettled) return;
                    isSettled = true;

                    const db = request.result;
                    Store._activeDB = db;
                    Store._openingPromise = null;

                    db.onversionchange = () => {
                        console.warn("[IDB Storage] Rilevato cambio versione: chiusura connessione attiva.");
                        try { db.close(); } catch (_) {}
                        Store._activeDB = null;
                        Store._openingPromise = null;
                    };

                    console.log(`[IDB Storage] Connessione a IndexedDB stabilita con successo (v${db.version}).`);
                    resolve(db);
                };

                request.onerror = () => {
                    clearTimeout(openTimeout);
                    if (isSettled) return;
                    isSettled = true;

                    console.error("[IDB Storage] Errore apertura IndexedDB:", request.error);
                    Store._activeDB = null;
                    Store._openingPromise = null;
                    reject(request.error);
                };
            } catch (err) {
                clearTimeout(openTimeout);
                if (isSettled) return;
                isSettled = true;
                Store._activeDB = null;
                Store._openingPromise = null;
                reject(err);
            }
        });

        return Store._openingPromise;
    },

    idbSaveAsset: async (workspaceId, assetName, blob, mimeType) => {
        const db = await Store.initDB();
        return new Promise((resolve, reject) => {
            const timeoutTimer = setTimeout(() => {
                reject(new Error("Timeout salvataggio asset in IndexedDB (5s)"));
            }, 5000);

            const tx = db.transaction(Store.STORE_ASSETS, 'readwrite');
            const store = tx.objectStore(Store.STORE_ASSETS);
            store.put({
                workspaceId: workspaceId,
                name: assetName,
                blob: blob,
                type: mimeType,
                size: blob.size || 0,
                updatedAt: Date.now()
            });
            tx.oncomplete = () => {
                clearTimeout(timeoutTimer);
                resolve(true);
            };
            tx.onerror = () => {
                clearTimeout(timeoutTimer);
                reject(tx.error);
            };
            tx.onabort = () => {
                clearTimeout(timeoutTimer);
                reject(tx.error || new Error("Transazione salvataggio asset abortita"));
            };
        });
    },

    idbGetAsset: async (workspaceId, assetName) => {
        if (!workspaceId || !assetName) return null;
        try {
            const db = await Store.initDB();
            return new Promise((resolve) => {
                const tx = db.transaction(Store.STORE_ASSETS, 'readonly');
                const store = tx.objectStore(Store.STORE_ASSETS);
                const req = store.get([workspaceId, assetName]);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (_) {
            return null;
        }
    },

    idbListAssets: async (workspaceId) => {
        if (!workspaceId) return [];
        try {
            const db = await Store.initDB();
            return new Promise((resolve) => {
                const tx = db.transaction(Store.STORE_ASSETS, 'readonly');
                const store = tx.objectStore(Store.STORE_ASSETS);
                const req = store.index('by_workspace').getAll(workspaceId);
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });
        } catch (_) {
            return [];
        }
    },

    idbDeleteAsset: async (workspaceId, assetName) => {
        if (!workspaceId || !assetName) return false;
        try {
            const db = await Store.initDB();
            return new Promise((resolve) => {
                const tx = db.transaction(Store.STORE_ASSETS, 'readwrite');
                const store = tx.objectStore(Store.STORE_ASSETS);
                store.delete([workspaceId, assetName]);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
                tx.onabort = () => resolve(false);
            });
        } catch (_) {
            return false;
        }
    },

    // Lettura atomica e decifratura della singola nota da IndexedDB
    idbGetNote: async (workspaceId, noteId) => {
        if (!workspaceId || !noteId) return null;
        try {
            const db = await Store.initDB();
            const record = await new Promise((resolve) => {
                const tx = db.transaction(Store.STORE_NOTES, 'readonly');
                const store = tx.objectStore(Store.STORE_NOTES);
                const req = store.get([workspaceId, noteId]);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });

            if (!record) return null;

            if (record.isEncrypted && record.payload && AppState.documentPassword) {
                const decStr = await CryptoUtils.decrypt(record.payload, AppState.documentPassword);
                return JSON.parse(decStr);
            } else if (!record.isEncrypted) {
                const cleanNote = { ...record };
                delete cleanNote.workspaceId;
                return cleanNote;
            }
            return null;
        } catch (e) {
            console.warn(`[IDB Storage] Errore lettura nota ${noteId}:`, e);
            return null;
        }
    },

    // Lettura atomica e decifratura del singolo database da IndexedDB
    idbGetDatabase: async (workspaceId, dbId) => {
        if (!workspaceId || !dbId) return null;
        try {
            const db = await Store.initDB();
            const record = await new Promise((resolve) => {
                const tx = db.transaction(Store.STORE_DATABASES, 'readonly');
                const store = tx.objectStore(Store.STORE_DATABASES);
                const req = store.get([workspaceId, dbId]);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });

            if (!record) return null;

            if (record.isEncrypted && record.payload && AppState.documentPassword) {
                const decStr = await CryptoUtils.decrypt(record.payload, AppState.documentPassword);
                return JSON.parse(decStr);
            } else if (!record.isEncrypted) {
                const cleanDb = { ...record };
                delete cleanDb.workspaceId;
                return cleanDb;
            }
            return null;
        } catch (e) {
            console.warn(`[IDB Storage] Errore lettura database ${dbId}:`, e);
            return null;
        }
    },

    // Pulizia dei record (note e DB, opzionalmente asset) per un dato workspaceId
    idbClearWorkspaceData: async (workspaceId, clearAssets = false) => {
        if (!workspaceId) return false;
        try {
            const db = await Store.initDB();
            const storeNames = clearAssets 
                ? [Store.STORE_NOTES, Store.STORE_DATABASES, Store.STORE_ASSETS]
                : [Store.STORE_NOTES, Store.STORE_DATABASES];

            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeNames, 'readwrite');

                const noteIdx = tx.objectStore(Store.STORE_NOTES).index('by_workspace');
                const nReq = noteIdx.openKeyCursor(IDBKeyRange.only(workspaceId));
                nReq.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        tx.objectStore(Store.STORE_NOTES).delete(cursor.primaryKey);
                        cursor.continue();
                    }
                };

                const dbIdx = tx.objectStore(Store.STORE_DATABASES).index('by_workspace');
                const dReq = dbIdx.openKeyCursor(IDBKeyRange.only(workspaceId));
                dReq.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        tx.objectStore(Store.STORE_DATABASES).delete(cursor.primaryKey);
                        cursor.continue();
                    }
                };

                if (clearAssets) {
                    const aIdx = tx.objectStore(Store.STORE_ASSETS).index('by_workspace');
                    const aReq = aIdx.openKeyCursor(IDBKeyRange.only(workspaceId));
                    aReq.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            tx.objectStore(Store.STORE_ASSETS).delete(cursor.primaryKey);
                            cursor.continue();
                        }
                    };
                }

                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error("Pulizia workspace abortita"));
            });
        } catch (err) {
            console.warn(`[IDB Storage] Errore pulizia dati workspace ${workspaceId}:`, err);
            return false;
        }
    },

    idbListWorkspaces: async () => {
        try {
            const db = await Store.initDB();
            return new Promise((resolve) => {
                const tx = db.transaction(Store.STORE_WORKSPACES, 'readonly');
                const store = tx.objectStore(Store.STORE_WORKSPACES);
                const req = store.getAll();
                req.onsuccess = () => {
                    const list = req.result || [];
                    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                    resolve(list);
                };
                req.onerror = () => resolve([]);
            });
        } catch (_) {
            return [];
        }
    },

    idbDeleteWorkspace: async (workspaceId) => {
        if (!workspaceId) return false;
        const db = await Store.initDB();
        
        return new Promise((resolve, reject) => {
            const timeoutTimer = setTimeout(() => {
                reject(new Error("Timeout eliminazione workspace in IndexedDB (5s)"));
            }, 5000);

            const tx = db.transaction([Store.STORE_WORKSPACES, Store.STORE_NOTES, Store.STORE_DATABASES, Store.STORE_ASSETS], 'readwrite');
            
            tx.objectStore(Store.STORE_WORKSPACES).delete(workspaceId);

            const noteIndex = tx.objectStore(Store.STORE_NOTES).index('by_workspace');
            const noteReq = noteIndex.openKeyCursor(IDBKeyRange.only(workspaceId));
            noteReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    tx.objectStore(Store.STORE_NOTES).delete(cursor.primaryKey);
                    cursor.continue();
                }
            };

            const dbIndex = tx.objectStore(Store.STORE_DATABASES).index('by_workspace');
            const dbReq = dbIndex.openKeyCursor(IDBKeyRange.only(workspaceId));
            dbReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    tx.objectStore(Store.STORE_DATABASES).delete(cursor.primaryKey);
                    cursor.continue();
                }
            };

            const assetIndex = tx.objectStore(Store.STORE_ASSETS).index('by_workspace');
            const assetReq = assetIndex.openKeyCursor(IDBKeyRange.only(workspaceId));
            assetReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    tx.objectStore(Store.STORE_ASSETS).delete(cursor.primaryKey);
                    cursor.continue();
                }
            };

            tx.oncomplete = () => {
                clearTimeout(timeoutTimer);
                resolve(true);
            };
            tx.onerror = () => {
                clearTimeout(timeoutTimer);
                reject(tx.error);
            };
            tx.onabort = () => {
                clearTimeout(timeoutTimer);
                reject(tx.error || new Error("Cancellazione workspace abortita"));
            };
        });
    },

    saveToIndexedDB: async (onProgress = null) => {
        if (Store._isSavingFile || Store._isConflictResolving) {
            Store._saveQueuePending = true;
            return;
        }

        if (AppState.storageMode !== 'idb' || !AppState.workspaceId) {
            return;
        }

        Store._isSavingFile = true;
        try {
            UI.showStatus("saving");
            console.log(`[IDB Storage] Inizio salvataggio atomico su IndexedDB per workspace "${AppState.fileName}" (${AppState.workspaceId})...`);

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

            const db = await Store.initDB();
            const cryptoPrefix = AppState.documentPassword ? "ENC_" : "RAW_";
            const wsId = AppState.workspaceId;
            const workspaceSalt = AppState.documentPassword ? Store._getWorkspaceSalt() : null;

            // Metadati workspace con cifratura del payload se protetto da password
            let encryptedIndexPayload = null;
            if (AppState.documentPassword) {
                const sensitiveIndexData = {
                    templates: AppState.templates || [],
                    homeCitations: AppState.homeCitations || [],
                    noteOrder: AppState.notes.map(n => n.id)
                };
                encryptedIndexPayload = await CryptoUtils.encrypt(JSON.stringify(sensitiveIndexData), AppState.documentPassword, workspaceSalt);
            }

            const wsMeta = {
                id: wsId,
                name: AppState.fileName || I18n.t('idb_storage.default_browser_ws_name'),
                updatedAt: Date.now(),
                lastBackupAt: AppState.lastBackupAt || null,
                vaultSalt: AppState.vaultSaltHex || null,
                isEncrypted: !!AppState.documentPassword,
                encryptedPayload: encryptedIndexPayload,
                templates: AppState.documentPassword ? [] : (AppState.templates || []),
                homeCitations: AppState.documentPassword ? [] : (AppState.homeCitations || []),
                noteOrder: AppState.documentPassword ? [] : AppState.notes.map(n => n.id)
            };

            const indexHash = Store._hashObj(wsMeta, cryptoPrefix);
            const needsMetaWrite = (Store._diskHashes.index !== indexHash);

            // Database differenziali da scrivere
            const dbsToWrite = [];
            for (const [dbId, ramState] of Object.entries(AppState.databases || {})) {
                let currentRamHash = Store._hashObj(ramState, cryptoPrefix);
                if (!Store._diskHashes.databases[dbId] || Store._diskHashes.databases[dbId] !== currentRamHash) {
                    dbsToWrite.push({ dbId, ramState });
                }
            }

            // Note differenziali da scrivere
            const notesToWrite = [];
            for (const note of AppState.notes) {
                if (!note._isDirty && !note._isDraft && Store._diskHashes.notes[note.id]) {
                    continue;
                }
                const cleanNote = JSON.parse(JSON.stringify(note));
                cleanNote.workspaceId = wsId;
                Object.keys(cleanNote).forEach(key => { if (key.startsWith('_')) delete cleanNote[key]; });
                const currentHash = Store._hashObj(cleanNote, cryptoPrefix);

                if (note._isDirty || !Store._diskHashes.notes[note.id] || Store._diskHashes.notes[note.id] !== currentHash) {
                    notesToWrite.push({ note, cleanNote });
                }
            }

            // Preparazione asincrona dei record da salvare prima della transazione IDB
            const preparedDbs = [];
            for (const { dbId, ramState } of dbsToWrite) {
                const sanitizedState = JSON.parse(JSON.stringify(ramState));
                delete sanitizedState._renderCache;

                let dbRecord = null;
                if (AppState.documentPassword) {
                    const rawJson = JSON.stringify(sanitizedState);
                    const encPayload = await CryptoUtils.encrypt(rawJson, AppState.documentPassword, workspaceSalt);
                    dbRecord = {
                        workspaceId: wsId,
                        id: dbId,
                        isEncrypted: true,
                        payload: encPayload
                    };
                } else {
                    dbRecord = { ...sanitizedState, workspaceId: wsId, id: dbId, isEncrypted: false };
                }
                preparedDbs.push({ dbId, ramState, dbRecord });
            }

            const preparedNotes = [];
            for (const { note, cleanNote } of notesToWrite) {
                const nextRevId = Store.generateId();
                note.revId = nextRevId;
                cleanNote.revId = nextRevId;
                note._baseRevId = nextRevId;

                // Calcolo canonico dell'hash dopo l'assegnazione definitiva del Revision Token
                const noteHash = Store._hashObj(cleanNote, cryptoPrefix);

                let noteRecord = null;
                if (AppState.documentPassword) {
                    const rawJson = JSON.stringify(cleanNote);
                    const encPayload = await CryptoUtils.encrypt(rawJson, AppState.documentPassword, workspaceSalt);
                    noteRecord = {
                        workspaceId: wsId,
                        id: note.id,
                        isEncrypted: true,
                        payload: encPayload
                    };
                } else {
                    noteRecord = { ...cleanNote, isEncrypted: false };
                }
                preparedNotes.push({ note, cleanNote, noteHash, noteRecord });
            }

            const storesInvolved = [Store.STORE_WORKSPACES, Store.STORE_NOTES, Store.STORE_DATABASES];
            if (Store._needsPhysicalGC) storesInvolved.push(Store.STORE_ASSETS);

            // Transazione atomica singola
            await new Promise((resolve, reject) => {
                const timeoutTimer = setTimeout(() => {
                    reject(new Error("Timeout scrittura atomica in IndexedDB (5s)"));
                }, 5000);

                const tx = db.transaction(storesInvolved, 'readwrite');

                if (needsMetaWrite) {
                    tx.objectStore(Store.STORE_WORKSPACES).put(wsMeta);
                }

                if (preparedDbs.length > 0) {
                    const storeDb = tx.objectStore(Store.STORE_DATABASES);
                    for (const { dbRecord } of preparedDbs) {
                        storeDb.put(dbRecord);
                    }
                }

                if (preparedNotes.length > 0) {
                    const storeNotes = tx.objectStore(Store.STORE_NOTES);
                    for (const { noteRecord } of preparedNotes) {
                        storeNotes.put(noteRecord);
                    }
                }

                // Esecuzione GC fisica su IndexedDB
                if (Store._needsPhysicalGC) {
                    const { activeDbIds, activeImageIds, activeAudioIds, validNoteIds } = Store.scanActiveEntities(false);

                    const noteStore = tx.objectStore(Store.STORE_NOTES);
                    const noteIdx = noteStore.index('by_workspace');
                    const nReq = noteIdx.openKeyCursor(IDBKeyRange.only(wsId));
                    nReq.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            const noteId = cursor.primaryKey[1];
                            if (!validNoteIds.has(noteId)) {
                                noteStore.delete(cursor.primaryKey);
                                delete Store._diskHashes.notes[noteId];
                            }
                            cursor.continue();
                        }
                    };

                    const dbStore = tx.objectStore(Store.STORE_DATABASES);
                    const dbIdx = dbStore.index('by_workspace');
                    const dReq = dbIdx.openKeyCursor(IDBKeyRange.only(wsId));
                    dReq.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            const databaseId = cursor.primaryKey[1];
                            if (!activeDbIds.has(databaseId)) {
                                dbStore.delete(cursor.primaryKey);
                                delete Store._diskHashes.databases[databaseId];
                                delete Store._baseDatabases[databaseId];
                            }
                            cursor.continue();
                        }
                    };

                    const assetStore = tx.objectStore(Store.STORE_ASSETS);
                    const aIdx = assetStore.index('by_workspace');
                    const aReq = aIdx.openKeyCursor(IDBKeyRange.only(wsId));
                    aReq.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            const assetName = cursor.primaryKey[1];
                            const isImg = assetName.startsWith('img_');
                            const isAud = assetName.startsWith('aud_');
                            if ((isImg && !activeImageIds.has(assetName)) || (isAud && !activeAudioIds.has(assetName))) {
                                assetStore.delete(cursor.primaryKey);
                                if (isImg && Editor.imageCache[assetName]) {
                                    URL.revokeObjectURL(Editor.imageCache[assetName]);
                                    delete Editor.imageCache[assetName];
                                } else if (isAud && Editor.audioCache[assetName]) {
                                    URL.revokeObjectURL(Editor.audioCache[assetName]);
                                    delete Editor.audioCache[assetName];
                                }
                            }
                            cursor.continue();
                        }
                    };
                }

                tx.oncomplete = () => {
                    clearTimeout(timeoutTimer);
                    resolve();
                };
                tx.onerror = () => {
                    clearTimeout(timeoutTimer);
                    reject(tx.error || new Error("Errore durante la transazione IDB"));
                };
                tx.onabort = () => {
                    clearTimeout(timeoutTimer);
                    reject(tx.error || new Error("Transazione IDB abortita"));
                };
            });

            if (needsMetaWrite) {
                Store._diskHashes.index = indexHash;
            }
            for (const { dbId, ramState } of preparedDbs) {
                Store._diskHashes.databases[dbId] = Store._hashObj(ramState, cryptoPrefix);
                Store._baseDatabases[dbId] = JSON.parse(JSON.stringify(ramState));
            }
            for (const { note, noteHash } of preparedNotes) {
                Store._diskHashes.notes[note.id] = noteHash;
                note._isDirty = false;
                delete note._isDraft;
            }

            if (Store._needsPhysicalGC) {
                Store._needsPhysicalGC = false;
            }

            Store.isDirty = false;
            UI.showStatus("saved");

            // SVUOTAMENTO SNAPSHOT DI EMERGENZA: I dati sono stabilmente consolidati nel Workspace IDB
            Store.clearLocalBackup();

            // Notifica multi-scheda attraverso BroadcastChannel
            if (Store._syncChannel && AppState.workspaceId) {
                for (const { note } of preparedNotes) {
                    Store._syncChannel.postMessage({
                        workspaceId: AppState.workspaceId,
                        type: 'note_saved',
                        noteId: note.id
                    });
                }
                for (const { dbId } of preparedDbs) {
                    Store._syncChannel.postMessage({
                        workspaceId: AppState.workspaceId,
                        type: 'db_saved',
                        tableId: dbId
                    });
                }
            }

            console.log(`[IDB Storage] Salvataggio completato con successo per "${AppState.fileName}".`);

        } catch (err) {
            Store.isDirty = true;
            UI.showStatus("error");
            console.error("[IDB Storage] Eccezione durante il salvataggio su IndexedDB:", err);
        } finally {
            Store._isSavingFile = false;
            if (Store._saveQueuePending && !Store._isConflictResolving) {
                Store._saveQueuePending = false;
                Store.saveToIndexedDB();
            }
        }
    },

    createBrowserWorkspace: async (customName = null) => {
        if (Store.hasUnsavedChanges()) {
            if (AppState.storageMode === 'idb') {
                await Store.saveToIndexedDB();
            } else if (AppState.workspaceHandle) {
                await Store.saveToFile();
            }
        }

        console.log("[IDB Storage] Avvio creazione nuovo workspace nel browser...");
        
        if (navigator.storage && navigator.storage.persist) {
            try { 
                const isPersisted = await navigator.storage.persist(); 
                console.log(`[IDB Storage] Quota storage persistita dal browser: ${isPersisted}`);
            } catch (_) {}
        }

        const name = (customName || prompt(I18n.t('idb_storage.prompt_choose_name'), I18n.t('idb_storage.default_new_name')) || "").trim();
        if (!name) {
            console.log("[IDB Storage] Creazione annullata dall'utente (nome vuoto o cancel).");
            return;
        }

        Editor.clearHistory();
        Editor.imageCache = {};
        Editor.audioCache = {};
        AppState.notes = [];
        AppState.databases = {};
        AppState.homeCitations = [];
        AppState.templates = [];
        AppState.currentNoteId = null;
        AppState.searchFilter = "";

        const wsId = 'ws_' + Store.generateId();
        AppState.workspaceId = wsId;
        AppState.idbWorkspaceId = wsId;
        AppState.storageMode = 'idb';
        AppState.workspaceHandle = null;
        AppState.assetsHandle = null;
        AppState.fileName = name;
        AppState.documentPassword = null;
        AppState.vaultSaltHex = null;
        AppState.lastBackupAt = null;
        CryptoUtils.clearCache();

        Store._diskHashes = { notes: {}, databases: {}, index: "" };
        Store._baseDatabases = {};

        const newNoteId = Store.generateId();
        const now = new Date().toISOString();
        const initialRevId = Store.generateId();

        AppState.notes.push({
            id: newNoteId,
            parentId: null,
            title: I18n.t('store_workspace.welcome_note_title'),
            content: `
                <blockquote>
                    <b>🌐 Benvenuto nel tuo Workspace salvato nella Memoria del Browser!</b><br>
                    Questo spazio di lavoro è memorizzato in locale nel database del tuo browser (IndexedDB). Non richiede cartelle sul PC né permessi speciali: è veloce, sicuro e funziona su qualsiasi dispositivo o rete aziendale.
                </blockquote>

                <h2>1. Le Potenzialità dei Database</h2>
                <p>Puoi creare tabelle, trasformarle in bacheche Kanban, calendari, timeline o diagrammi ad albero cliccando sul tasto <b>"Vista"</b> nell'intestazione di qualsiasi database.</p>

                <h2>2. Backup e Sicurezza</h2>
                <p>I tuoi dati sono protetti all'interno del browser. Per salvare una copia di sicurezza offline sul tuo computer, clicca sul badge <b>[🌐 Memoria Browser]</b> in alto a sinistra e scegli <b>"Scarica Backup JSON"</b>.</p>
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

        if (typeof AdvancedTable !== 'undefined') {
            AdvancedTable.ensureSystemPropertiesDB();
        }

        UI.setContinuousEdit(true);

        await Store.saveToIndexedDB();

        localStorage.setItem('vanilladesk_active_idb_ws', wsId);
        localStorage.setItem('vanilladesk_storage_mode', 'idb');

        Store._finalizeUIAfterLoad();
        UI.selectNote(newNoteId);

        UI.showToast(I18n.t('idb_storage.toast_workspace_created', { name }), "success");
    },

    openBrowserWorkspace: async (workspaceId) => {
        try {
            if (Store.hasUnsavedChanges()) {
                if (AppState.storageMode === 'idb' && AppState.workspaceId) {
                    await Store.saveToIndexedDB();
                } else if (AppState.workspaceHandle) {
                    await Store.saveToFile();
                }
            }

            console.log(`[IDB Storage] Apertura workspace IDB: ${workspaceId}...`);
            const db = await Store.initDB();
            
            const wsMeta = await new Promise((resolve) => {
                const tx = db.transaction(Store.STORE_WORKSPACES, 'readonly');
                const req = tx.objectStore(Store.STORE_WORKSPACES).get(workspaceId);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });

            if (!wsMeta) {
                console.warn(`[IDB Storage] Workspace ${workspaceId} non trovato in idb_workspaces.`);
                return false;
            }

            // Prompt password se il workspace risulta cifrato
            let activePassword = AppState.documentPassword || null;
            if (wsMeta.isEncrypted) {
                if (!activePassword) {
                    activePassword = await UI.PasswordManager.promptForOpen(I18n.t('idb_storage.prompt_unlock_browser_ws'));
                    if (!activePassword) {
                        return false;
                    }
                }

                try {
                    if (wsMeta.encryptedPayload) {
                        const decMetaJson = await CryptoUtils.decrypt(wsMeta.encryptedPayload, activePassword);
                        const decMeta = JSON.parse(decMetaJson);
                        wsMeta.templates = decMeta.templates || [];
                        wsMeta.homeCitations = decMeta.homeCitations || [];
                        wsMeta.noteOrder = decMeta.noteOrder || [];
                    }
                    AppState.documentPassword = activePassword;
                } catch (err) {
                    alert(I18n.t('idb_storage.alert_wrong_password'));
                    AppState.documentPassword = null;
                    return false;
                }
            } else {
                AppState.documentPassword = null;
            }

            UI.showStatus("loading");

            const rawNotesList = await new Promise((resolve) => {
                const tx = db.transaction(Store.STORE_NOTES, 'readonly');
                const req = tx.objectStore(Store.STORE_NOTES).index('by_workspace').getAll(workspaceId);
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });

            const rawDbsList = await new Promise((resolve) => {
                const tx = db.transaction(Store.STORE_DATABASES, 'readonly');
                const req = tx.objectStore(Store.STORE_DATABASES).index('by_workspace').getAll(workspaceId);
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });

            // Decrittografia note
            const notesList = [];
            for (const n of rawNotesList) {
                if (n.isEncrypted && n.payload) {
                    try {
                        const decStr = await CryptoUtils.decrypt(n.payload, activePassword);
                        notesList.push(JSON.parse(decStr));
                    } catch (e) {
                        console.error("[IDB Storage] Errore decrittografia nota IDB:", n.id, e);
                        alert(I18n.t('idb_storage.alert_notes_decrypt_error'));
                        AppState.documentPassword = null;
                        return false;
                    }
                } else {
                    notesList.push(n);
                }
            }

            // Decrittografia database
            const dbsList = [];
            for (const d of rawDbsList) {
                if (d.isEncrypted && d.payload) {
                    try {
                        const decStr = await CryptoUtils.decrypt(d.payload, activePassword);
                        dbsList.push(JSON.parse(decStr));
                    } catch (e) {
                        console.error("[IDB Storage] Errore decrittografia DB IDB:", d.id, e);
                        alert(I18n.t('idb_storage.alert_dbs_decrypt_error'));
                        AppState.documentPassword = null;
                        return false;
                    }
                } else {
                    dbsList.push(d);
                }
            }

            Editor.clearHistory();
            Editor.imageCache = {};
            Editor.audioCache = {};
            CryptoUtils.clearCache();

            AppState.storageMode = 'idb';
            AppState.workspaceId = workspaceId;
            AppState.idbWorkspaceId = workspaceId;
            AppState.workspaceHandle = null;
            AppState.assetsHandle = null;
            AppState.fileName = wsMeta.name || I18n.t('idb_storage.default_browser_ws_name');
            AppState.vaultSaltHex = wsMeta.vaultSalt || null;
            AppState.lastBackupAt = wsMeta.lastBackupAt || null;
            AppState.templates = wsMeta.templates || [];
            AppState.homeCitations = wsMeta.homeCitations || [];
            AppState.currentNoteId = null;

            Store._diskHashes = { notes: {}, databases: {}, index: "" };
            Store._baseDatabases = {};

            const cryptoPrefix = AppState.documentPassword ? "ENC_" : "RAW_";
            Store._diskHashes.index = Store._hashObj(wsMeta, cryptoPrefix);

            AppState.notes = notesList.map(n => {
                if (!n.revId) n.revId = Store.generateId();
                n._baseRevId = n.revId;
                const clean = { ...n };
                Object.keys(clean).forEach(k => { if (k.startsWith('_')) delete clean[k]; });
                Store._diskHashes.notes[n.id] = Store._hashObj(clean, cryptoPrefix);
                return n;
            });

            AppState.databases = {};
            dbsList.forEach(d => {
                const dbId = d.id;
                const clean = { ...d };
                delete clean.workspaceId;
                AppState.databases[dbId] = clean;
                Store._diskHashes.databases[dbId] = Store._hashObj(clean, cryptoPrefix);
                Store._baseDatabases[dbId] = JSON.parse(JSON.stringify(clean));
            });

            if (wsMeta.noteOrder && Array.isArray(wsMeta.noteOrder)) {
                AppState.notes.sort((a, b) => {
                    let idxA = wsMeta.noteOrder.indexOf(a.id);
                    let idxB = wsMeta.noteOrder.indexOf(b.id);
                    if (idxA === -1) idxA = 999999;
                    if (idxB === -1) idxB = 999999;
                    return idxA - idxB;
                });
            }

            if (typeof AdvancedTable !== 'undefined') {
                AdvancedTable.ensureSystemPropertiesDB();
            }

            localStorage.setItem('vanilladesk_active_idb_ws', workspaceId);
            localStorage.setItem('vanilladesk_storage_mode', 'idb');

            Store._finalizeUIAfterLoad();

            // All'apertura pulita di un workspace nel browser, svuota eventuali vecchi residui di crash recovery
            Store.clearLocalBackup();

            if (AppState.notes.length > 0) {
                UI.selectNote(AppState.notes[0].id);
            }

            console.log(`[IDB Storage] Workspace "${AppState.fileName}" caricato in RAM con ${AppState.notes.length} note.`);
            return true;
        } catch (e) {
            console.error("[IDB Storage] Errore apertura workspace da IndexedDB:", e);
            return false;
        }
    },

    deleteBrowserWorkspace: async (workspaceId) => {
        const isCurrent = AppState.storageMode === 'idb' && AppState.workspaceId === workspaceId;
        const success = await Store.idbDeleteWorkspace(workspaceId);

        if (success && isCurrent) {
            localStorage.removeItem('vanilladesk_active_idb_ws');
            localStorage.removeItem('vanilladesk_storage_mode');
            AppState.storageMode = 'ram';
            AppState.workspaceId = null;
            AppState.idbWorkspaceId = null;
            AppState.notes = [];
            AppState.databases = {};
            AppState.fileName = I18n.t('common.no_workspace');
            Store._finalizeUIAfterLoad();
        }

        return success;
    },

    renameBrowserWorkspace: async (workspaceId, newName) => {
        if (!workspaceId || !newName.trim()) return false;
        const db = await Store.initDB();

        return new Promise((resolve) => {
            const tx = db.transaction(Store.STORE_WORKSPACES, 'readwrite');
            const store = tx.objectStore(Store.STORE_WORKSPACES);
            const req = store.get(workspaceId);
            req.onsuccess = () => {
                const ws = req.result;
                if (!ws) return resolve(false);
                ws.name = newName.trim();
                ws.updatedAt = Date.now();
                store.put(ws);
                if (AppState.storageMode === 'idb' && AppState.workspaceId === workspaceId) {
                    AppState.fileName = ws.name;
                    UI.updateFileName(ws.name);
                }
                resolve(true);
            };
            req.onerror = () => resolve(false);
        });
    }
});