/**
 * graph/graph-core.js
 * Modulo Core del Grafo: Gestione del ciclo di vita, ereditarietà dello stato da window.opener,
 * sincronizzazione reattiva e navigazione note e tag verso l'applicazione principale VanillaDesk.
 * - Dynamic Focus Dispatcher: ricezione dell'evento di focus per note selezionate anche a finestra già aperta.
 * - Target Switching: al doppio click su un nodo, attiva la nota ed esegue il ri-focus immediato della finestra VanillaDesk.
 * - Tag Search Dispatcher: doppio click su un tag lancia la ricerca/filtro tassonomico nell'albero di VanillaDesk e porta in primo piano la finestra.
 */

window.GraphApp = {
    selectedNodeId: null,
    syncChannel: null,
    
    init: async () => {
        GraphApp.applyTheme();

        await GraphApp.inheritWorkspace();
        GraphApp.initLiveSync();

        // 1. Carica impostazioni e parametri salvati (da disco o localStorage)
        await GraphApp.loadGraphConfig();

        // 2. Estrae nodi e collegamenti
        GraphData.buildGraph();

        // 3. Inizializza il canvas ed esegue il warm-up matematico a freddo
        GraphCanvas.init('graphCanvas');
        GraphUI.init();

        // 4. Gestione focalizzazione nota da Hash iniziale
        const applyHashTarget = () => {
            const hash = window.location.hash ? window.location.hash.substring(1) : '';
            if (hash) {
                const params = new URLSearchParams(hash);
                const targetNoteId = params.get('note');
                if (targetNoteId) {
                    setTimeout(() => {
                        GraphCanvas.focusNode(targetNoteId);
                    }, 150);
                }
            }
        };

        applyHashTarget();

        // Ascoltatore reattivo per variazioni dell'URL hash quando la finestra è già aperta
        window.addEventListener('hashchange', () => {
            applyHashTarget();
        });
    },

    applyTheme: (themeName = null) => {
        const theme = themeName || localStorage.getItem('theme') || 'light';
        document.body.removeAttribute('data-theme');
        document.body.classList.remove('light-theme', 'dark-theme');

        if (theme !== 'light') {
            document.body.setAttribute('data-theme', theme);
            document.body.classList.add(theme.includes('dark') ? 'dark-theme' : 'light-theme');
        } else {
            document.body.classList.add('light-theme');
        }
    },

    loadGraphConfig: async () => {
        let loaded = false;

        if (AppState.workspaceHandle) {
            try {
                const assetsDir = await AppState.workspaceHandle.getDirectoryHandle('assets', { create: false });
                const graphDir = await assetsDir.getDirectoryHandle('graph', { create: false });
                const fileHandle = await graphDir.getFileHandle('config.json', { create: false });
                const file = await fileHandle.getFile();
                const text = await file.text();
                const config = JSON.parse(text);

                if (config) {
                    if (config.physics) Object.assign(GraphCanvas.physics, config.physics);
                    if (config.options) Object.assign(GraphData.options, config.options);
                    loaded = true;
                }
            } catch (_) {}
        }

        if (!loaded) {
            try {
                const saved = localStorage.getItem('vanilladesk_graph_config');
                if (saved) {
                    const config = JSON.parse(saved);
                    if (config.physics) Object.assign(GraphCanvas.physics, config.physics);
                    if (config.options) Object.assign(GraphData.options, config.options);
                }
            } catch (_) {}
        }
    },

    saveGraphConfig: async () => {
        const config = {
            physics: {
                repulsion: GraphCanvas.physics.repulsion,
                springLengthNote: GraphCanvas.physics.springLengthNote,
                springLengthRecord: GraphCanvas.physics.springLengthRecord,
                springLengthTag: GraphCanvas.physics.springLengthTag,
                springStrength: GraphCanvas.physics.springStrength,
                gravity: GraphCanvas.physics.gravity
            },
            options: { ...GraphData.options }
        };

        try {
            localStorage.setItem('vanilladesk_graph_config', JSON.stringify(config));
        } catch (_) {}

        if (AppState.workspaceHandle) {
            try {
                const assetsDir = await AppState.workspaceHandle.getDirectoryHandle('assets', { create: true });
                const graphDir = await assetsDir.getDirectoryHandle('graph', { create: true });
                const fileHandle = await graphDir.getFileHandle('config.json', { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(config, null, 2));
                await writable.close();
            } catch (_) {}
        }
    },

    inheritWorkspace: async () => {
        let inherited = false;

        try {
            if (window.opener) {
                let openerState = null;

                try {
                    if (window.opener.AppState) {
                        openerState = window.opener.AppState;
                    }
                } catch (_) {}

                if (!openerState && typeof window.opener.eval === 'function') {
                    try {
                        openerState = window.opener.eval('typeof AppState !== "undefined" ? AppState : null');
                        if (openerState) {
                            try {
                                window.opener.eval('if (typeof AppState !== "undefined") window.AppState = AppState;');
                            } catch (_) {}
                        }
                    } catch (_) {}
                }

                if (openerState) {
                    if (openerState.databases) {
                        AppState.databases = Object.assign({}, openerState.databases);
                    }
                    if (openerState.notes) {
                        AppState.notes = [...(openerState.notes || [])];
                    }

                    if (openerState.workspaceHandle) {
                        AppState.workspaceHandle = openerState.workspaceHandle;
                        AppState.assetsHandle = openerState.assetsHandle || null;
                        AppState.documentPassword = openerState.documentPassword || null;
                        AppState.fileName = openerState.fileName || openerState.workspaceHandle.name;

                        await GraphApp.saveHandleToIDB(openerState.workspaceHandle);
                    }

                    inherited = (AppState.notes && AppState.notes.length > 0) || (Object.keys(AppState.databases || {}).length > 0);
                }
            }
        } catch (_) {}

        if (!inherited) {
            try {
                const storedHandle = await GraphApp.getHandleFromIDB();
                if (storedHandle) {
                    AppState.workspaceHandle = storedHandle;
                    AppState.fileName = storedHandle.name;
                    await GraphApp.loadWorkspaceFromHandle(storedHandle);
                    inherited = (AppState.notes && AppState.notes.length > 0) || (Object.keys(AppState.databases || {}).length > 0);
                }
            } catch (_) {}
        }

        const wsLabel = document.getElementById('graphWorkspaceLabel');
        if (wsLabel && AppState.fileName) {
            wsLabel.innerText = AppState.fileName;
        }
    },

    saveHandleToIDB: async (handle) => {
        try {
            if (typeof Store !== 'undefined' && Store.initDB) {
                const db = await Store.initDB();
                const tx = db.transaction('backupStore', 'readwrite');
                tx.objectStore('backupStore').put(handle, 'graph_last_workspace_handle');
            }
        } catch (_) {}
    },

    getHandleFromIDB: async () => {
        try {
            if (typeof Store !== 'undefined' && Store.initDB) {
                const db = await Store.initDB();
                return new Promise((resolve) => {
                    const tx = db.transaction('backupStore', 'readonly');
                    const req = tx.objectStore('backupStore').get('graph_last_workspace_handle');
                    req.onsuccess = () => {
                        if (req.result) resolve(req.result);
                        else {
                            const reqWf = tx.objectStore('backupStore').get('workflow_last_workspace_handle');
                            reqWf.onsuccess = () => resolve(reqWf.result || null);
                            reqWf.onerror = () => resolve(null);
                        }
                    };
                    req.onerror = () => resolve(null);
                });
            }
        } catch (_) {
            return null;
        }
        return null;
    },

    loadWorkspaceFromHandle: async (dirHandle) => {
        AppState.databases = {};
        AppState.notes = [];

        try {
            const notesDir = await dirHandle.getDirectoryHandle('notes');
            for await (const entry of notesDir.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                    const fileHandle = await notesDir.getFileHandle(entry.name);
                    const file = await fileHandle.getFile();
                    let text = await file.text();

                    if (text.startsWith('PRONOTES_ENC_V1|') && AppState.documentPassword && typeof CryptoUtils !== 'undefined') {
                        try {
                            text = await CryptoUtils.decrypt(text, AppState.documentPassword);
                        } catch (_) {}
                    }

                    try {
                        const noteData = JSON.parse(text);
                        AppState.notes.push(noteData);
                    } catch (_) {}
                }
            }
        } catch (_) {}

        try {
            const dbDir = await dirHandle.getDirectoryHandle('databases');
            for await (const entry of dbDir.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                    const dbId = entry.name.replace('.json', '');
                    const fileHandle = await dbDir.getFileHandle(entry.name);
                    const file = await fileHandle.getFile();
                    let text = await file.text();

                    if (text.startsWith('PRONOTES_ENC_V1|') && AppState.documentPassword && typeof CryptoUtils !== 'undefined') {
                        try {
                            text = await CryptoUtils.decrypt(text, AppState.documentPassword);
                        } catch (_) {}
                    }

                    try {
                        const dbData = JSON.parse(text);
                        AppState.databases[dbId] = dbData;
                    } catch (_) {}
                }
            }
        } catch (_) {}
    },

    initLiveSync: () => {
        try {
            GraphApp.syncChannel = new BroadcastChannel('vanilladesk_sync');
            GraphApp.syncChannel.onmessage = (event) => {
                const data = event.data;
                if (!data) return;

                if (data.type === 'note_saved' || data.type === 'db_saved' || data.type === 'workspace_saved') {
                    GraphApp.reloadFromOpener();
                } else if (data.type === 'focus_graph_node' && data.noteId) {
                    if (typeof GraphCanvas !== 'undefined' && GraphCanvas.focusNode) {
                        GraphCanvas.focusNode(data.noteId);
                    }
                }
            };
        } catch (_) {}

        window.addEventListener('focus', () => {
            GraphApp.reloadFromOpener();
        });
    },

    reloadFromOpener: () => {
        try {
            if (window.opener) {
                let openerState = null;
                try {
                    if (window.opener.AppState) openerState = window.opener.AppState;
                } catch (_) {}

                if (!openerState && typeof window.opener.eval === 'function') {
                    openerState = window.opener.eval('typeof AppState !== "undefined" ? AppState : null');
                }

                if (openerState && openerState.notes) {
                    AppState.notes = [...openerState.notes];
                    if (openerState.databases) {
                        AppState.databases = Object.assign({}, openerState.databases);
                    }
                    GraphData.buildGraph();
                    GraphCanvas.nodes = GraphData.nodes;
                    GraphCanvas.links = GraphData.links;
                    GraphCanvas.render();
                }
            }
        } catch (_) {}
    },

    /**
     * Seleziona la nota in VanillaDesk e porta in primo piano la finestra madre
     */
    openNoteInOpener: (noteId) => {
        if (!noteId) return;

        try {
            if (window.opener && !window.opener.closed) {
                if (window.opener.UI && typeof window.opener.UI.selectNote === 'function') {
                    window.opener.UI.selectNote(noteId);

                    // 1. Metodo primario di ri-focalizzazione consentito dal browser durante user gesture (dblclick)
                    try {
                        window.opener.focus();
                    } catch (_) {}

                    // 2. Fallback per Chromium: targeting nominale della finestra madre già aperta
                    try {
                        const mainWin = window.open('', 'VanillaDeskMain');
                        if (mainWin) mainWin.focus();
                    } catch (_) {}

                    if (typeof UI !== 'undefined' && UI.showToast) {
                        UI.showToast(`Nota aperta in VanillaDesk`, "info");
                    }
                    return;
                }
            }
        } catch (_) {}

        alert("Finestra principale di VanillaDesk non accessibile o chiusa.");
    },

    /**
     * Preimposta e applica la ricerca per Tag nella finestra principale di VanillaDesk,
     * portando poi in primo piano la finestra.
     */
    filterTagInOpener: (tagTitle) => {
        if (!tagTitle) return;
        const cleanTag = tagTitle.replace(/^#+/, '').trim();

        try {
            if (window.opener && !window.opener.closed) {
                let executed = false;
                if (window.opener.EventsGlobal && typeof window.opener.EventsGlobal.executeTagSearch === 'function') {
                    window.opener.EventsGlobal.executeTagSearch(cleanTag);
                    executed = true;
                } else if (window.opener.document) {
                    // Fallback sul campo di ricerca laterale
                    const searchInput = window.opener.document.getElementById('searchInput');
                    if (searchInput) {
                        searchInput.value = '#' + cleanTag;
                        searchInput.dispatchEvent(new Event('input'));
                        executed = true;
                    }
                }

                if (executed) {
                    try {
                        window.opener.focus();
                    } catch (_) {}
                    try {
                        const mainWin = window.open('', 'VanillaDeskMain');
                        if (mainWin) mainWin.focus();
                    } catch (_) {}

                    if (typeof UI !== 'undefined' && UI.showToast) {
                        UI.showToast(`Filtro applicato su VanillaDesk: #${cleanTag}`, "success");
                    }
                    return;
                }
            }
        } catch (e) {
            console.warn("[VanillaDesk Graph] Impossibile comunicare con VanillaDesk:", e);
        }

        alert("Finestra principale di VanillaDesk non accessibile o chiusa.");
    }
};

if (typeof UI !== 'undefined' && typeof UI.setTheme !== 'function') {
    UI.setTheme = (themeName) => GraphApp.applyTheme(themeName);
}

document.addEventListener('DOMContentLoaded', GraphApp.init);