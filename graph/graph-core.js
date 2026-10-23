/**
 * graph/graph-core.js
 * Modulo Core del Grafo Integrato a Schermo Intero:
 * - Opera direttamente sulla memoria viva dell'applicazione (AppState.notes, AppState.databases) in tempo reale.
 * - Zero latenza, zero duplicazioni e zero problemi di permessi del File System o cross-origin popup.
 * - Gestione dinamica del Drawer: aggancia temporaneamente #advGlobalDrawer all'overlay massimizzato
 *   all'apertura e lo ripristina dentro .layout alla chiusura per garantire visibilità e funzionamento perfetto dei filtri.
 * - Invocazione affidabile di loadGraphConfig() all'apertura del grafo per ripristinare le forze fisiche configurate.
 * - Ciclo di vita controllato: apertura a tutto schermo con focus dinamico del nodo e chiusura istantanea su Escape o pulsante.
 * - Navigazione reattiva: al doppio click su nota o tag (#), chiude il grafo e attiva istantaneamente la pagina in VanillaDesk.
 */

window.GraphApp = {
    selectedNodeId: null,
    isOpen: false,

    open: async (targetNoteId = null) => {
        const overlay = document.getElementById('graphFullscreenView');
        if (!overlay) return;

        GraphApp.isOpen = true;
        overlay.style.display = 'flex';

        // 1. Sposta temporaneamente il drawer universale dentro l'overlay per renderlo visibile sopra il grafo
        const drawer = document.getElementById('advGlobalDrawer');
        if (drawer && !overlay.contains(drawer)) {
            overlay.appendChild(drawer);
        }

        // 2. Sincronizza l'etichetta del workspace corrente
        const wsLabel = document.getElementById('graphWorkspaceLabel');
        if (wsLabel) {
            wsLabel.innerText = AppState.fileName || 'Mappa delle Connessioni';
        }

        // 3. Inizializza il canvas e la UI se non ancora fatto, oppure ridimensiona
        if (!GraphCanvas.canvas) {
            GraphCanvas.canvas = document.getElementById('graphCanvas');
            if (GraphCanvas.canvas) {
                GraphCanvas.ctx = GraphCanvas.canvas.getContext('2d');
                window.addEventListener('resize', () => {
                    if (GraphApp.isOpen) {
                        GraphCanvas.resize();
                    }
                });
                GraphCanvas.bindEvents();
                GraphUI.init();
            }
        }

        // 4. Carica le impostazioni fisiche e i filtri salvati prima del calcolo
        await GraphApp.loadGraphConfig();

        // 5. Calcola le dimensioni reali dello schermo ora che l'overlay è display:flex
        GraphCanvas.resize();

        // 6. Costruisce la topologia dai dati vivi in RAM
        GraphData.buildGraph();

        // 7. Inietta nodi e link nel canvas
        GraphCanvas.updateData(GraphData.nodes, GraphData.links, false);

        // 8. Centratura o focalizzazione nodo specifico
        if (targetNoteId) {
            setTimeout(() => {
                GraphCanvas.focusNode(targetNoteId);
            }, 60);
        } else {
            GraphCanvas.fitToView();
        }

        GraphCanvas.render();
    },

    close: () => {
        // Chiudi prima il drawer se ancora aperto
        if (typeof UI !== 'undefined' && typeof UI.closeDrawer === 'function') {
            UI.closeDrawer(true);
        }

        // Riposiziona il drawer dentro .layout affinché torni al suo posto naturale per VanillaDesk
        const drawer = document.getElementById('advGlobalDrawer');
        const layout = document.querySelector('.layout');
        if (drawer && layout && !layout.contains(drawer)) {
            layout.appendChild(drawer);
        }

        const overlay = document.getElementById('graphFullscreenView');
        if (overlay) {
            overlay.style.display = 'none';
        }

        GraphApp.isOpen = false;

        // Interrompe l'eventuale simulazione fisica per non consumare CPU
        if (GraphCanvas.animFrameId) {
            cancelAnimationFrame(GraphCanvas.animFrameId);
            GraphCanvas.animFrameId = null;
        }

        // Chiudi eventuale tooltip aperto
        const tip = document.getElementById('graphTooltip');
        if (tip) tip.style.display = 'none';
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

    /**
     * Seleziona la nota in VanillaDesk e chiude la vista del grafo
     */
    openNoteInOpener: (noteId) => {
        if (!noteId) return;

        GraphApp.close();

        if (typeof UI !== 'undefined' && typeof UI.selectNote === 'function') {
            UI.selectNote(noteId);
        }
    },

    /**
     * Preimposta ed esegue la ricerca per Tag nell'albero di VanillaDesk e chiude il grafo
     */
    filterTagInOpener: (tagTitle) => {
        if (!tagTitle) return;
        const cleanTag = tagTitle.replace(/^#+/, '').trim();

        GraphApp.close();

        if (typeof EventsGlobal !== 'undefined' && typeof EventsGlobal.executeTagSearch === 'function') {
            EventsGlobal.executeTagSearch(cleanTag);
        }
    }
};

// Chiusura automatica su tasto Escape da tastiera
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && GraphApp.isOpen) {
        // Se c'è un cassetto drawer aperto sopra il grafo, lascia chiudere prima il cassetto
        const drawer = document.getElementById('advGlobalDrawer');
        if (drawer && drawer.classList.contains('open')) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        GraphApp.close();
    }
});