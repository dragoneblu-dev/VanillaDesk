/**
 * graph/graph-ui.js
 * Modulo Interfaccia Utente per Graph View:
 * - Selettore Rapido Header a due stati: "Grafo Globale" vs "Grafo Locale" (profondità fissa 3x).
 * - Ricerca istantanea con evidenziazione in tempo reale e scorrimento ciclico con Invio.
 * - Cassetto laterale dei filtri snello ed essenziale: Colorazione dei nodi, filtri ed elasticità fisica
 *   (privo di controlli ridondanti o duplicati già presenti nell'header).
 * - Sincronizzazione atomica con GraphCanvas.restartSimulation() al cambio di modalità o nodo focale.
 * - Slider tarabili con estensione fino a 1200 per repulsione e 0.001 per gravità.
 * - Slider distinti per configurare le distanze delle molle: Note/Citazioni, Cartelle/Gerarchie e Tag (#).
 * - Risolto conflitto listener capture per garantire l'apertura e chiusura fluida del Drawer.
 * - Legenda interattiva cliccabile per l'attivazione/disattivazione rapida dei filtri.
 */

window.GraphUI = {
    activeSearchMatches: null,
    searchMatchList: [],
    searchMatchIndex: -1,

    init: () => {
        const searchInput = document.getElementById('graphSearchInput');
        const clearBtn = document.getElementById('graphSearchClear');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                GraphUI.handleSearch(e.target.value);
            });

            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    GraphUI.handleSearch('');
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    GraphUI.focusNextSearchMatch();
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    GraphUI.handleSearch('');
                    searchInput.focus();
                }
            });
        }

        GraphUI.syncHeaderModeControls();
    },

    syncHeaderModeControls: () => {
        const btnGlobal = document.getElementById('btnGraphModeGlobal');
        const btnLocal = document.getElementById('btnGraphModeLocal');

        const isLocal = GraphData.options.graphMode === 'local';

        if (btnGlobal && btnLocal) {
            if (isLocal) {
                btnGlobal.classList.remove('active');
                btnLocal.classList.add('active');
            } else {
                btnGlobal.classList.add('active');
                btnLocal.classList.remove('active');
            }
        }
    },

    setGraphMode: (mode) => {
        if (GraphData.options.graphMode === mode) return;

        GraphData.options.graphMode = mode;
        if (mode === 'local' && !GraphData.options.localRootId) {
            GraphData.options.localRootId = AppState.currentNoteId || (GraphData.nodes.find(n => n.type === 'note')?.id || null);
        }

        GraphUI.syncHeaderModeControls();
        
        // Ricostruisce la topologia appropriata (completa o filtrata a 3x)
        GraphData.buildGraph();

        // Riavvia direttamente la simulazione topologica prelevando i nuovi nodi allineati
        GraphCanvas.restartSimulation();
        GraphApp.saveGraphConfig();

        if (typeof UI !== 'undefined' && UI.showToast) {
            const label = mode === 'local' ? "Grafo Locale (Rete contestuale 3x)" : "Grafo Globale (Intero Workspace)";
            UI.showToast(label, "info");
        }
    },

    setLocalRoot: (nodeId) => {
        GraphData.options.localRootId = nodeId;
        GraphData.options.graphMode = 'local';
        GraphUI.syncHeaderModeControls();
        
        GraphData.buildGraph();
        GraphCanvas.restartSimulation();
        GraphApp.saveGraphConfig();

        const node = GraphData.nodeMap.get(nodeId);
        if (node && typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(`Centro Grafo Locale: ${node.title}`, "info");
        }
    },

    handleSearch: (query) => {
        const term = (query || '').trim().toLowerCase();
        const clearBtn = document.getElementById('graphSearchClear');

        if (clearBtn) {
            clearBtn.style.display = term ? 'block' : 'none';
        }

        if (!term) {
            GraphUI.activeSearchMatches = null;
            GraphUI.searchMatchList = [];
            GraphUI.searchMatchIndex = -1;
            GraphCanvas.render();
            return;
        }

        const matches = new Set();
        const matchList = [];
        GraphData.nodes.forEach(node => {
            if (node.title.toLowerCase().includes(term)) {
                matches.add(node.id);
                matchList.push(node.id);
            }
        });

        GraphUI.activeSearchMatches = matches;
        GraphUI.searchMatchList = matchList;
        GraphUI.searchMatchIndex = -1;
        GraphCanvas.render();
    },

    focusNextSearchMatch: () => {
        if (!GraphUI.searchMatchList || GraphUI.searchMatchList.length === 0) return;

        GraphUI.searchMatchIndex = (GraphUI.searchMatchIndex + 1) % GraphUI.searchMatchList.length;
        const targetNodeId = GraphUI.searchMatchList[GraphUI.searchMatchIndex];

        GraphCanvas.focusNode(targetNodeId);

        const node = GraphCanvas.nodes.find(n => n.id === targetNodeId);
        if (node && typeof UI !== 'undefined' && UI.showToast) {
            const current = GraphUI.searchMatchIndex + 1;
            const total = GraphUI.searchMatchList.length;
            UI.showToast(`(${current}/${total}) ${node.title}`, "info");
        }
    },

    openFilterDrawer: () => {
        const opts = GraphData.options;
        const phys = GraphCanvas.physics;
        const colorMode = opts.colorMode || 'type';

        const bodyHTML = `
            <div style="display:flex; flex-direction:column; gap:20px; font-size:0.85rem;">
                
                <!-- SEZIONE 1: COLORAZIONE DEI NODI -->
                <div>
                    <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--accent-color); text-transform:uppercase; letter-spacing:0.5px;">
                        Colorazione dei Nodi
                    </h4>
                    <label style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px; display:block;">Raggruppa cromaticamente per:</label>
                    <select id="selGraphColorMode" class="modern-input" style="width:100%;" onchange="GraphUI.updateOption('colorMode', this.value)">
                        <option value="type" ${colorMode === 'type' ? 'selected' : ''}>Tipo Elemento (Note, Record, Tag)</option>
                        <option value="folder" ${colorMode === 'folder' ? 'selected' : ''}>Cartella di Appartenenza</option>
                        <option value="tag" ${colorMode === 'tag' ? 'selected' : ''}>Tag Primario della Nota</option>
                    </select>
                </div>

                <div class="separator-h" style="height:1px; background:var(--border-color); margin:0;"></div>

                <!-- SEZIONE 2: FILTRI DI VISUALIZZAZIONE -->
                <div>
                    <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--accent-color); text-transform:uppercase; letter-spacing:0.5px;">
                        Filtri di Visualizzazione
                    </h4>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                            <input type="checkbox" id="chkShowTags" ${opts.showTags ? 'checked' : ''} onchange="GraphUI.updateOption('showTags', this.checked)">
                            <span>Mostra Nodi Tag (#)</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                            <input type="checkbox" id="chkShowRecordNotes" ${opts.showRecordNotes ? 'checked' : ''} onchange="GraphUI.updateOption('showRecordNotes', this.checked)">
                            <span>Mostra Pagine Record di Database</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                            <input type="checkbox" id="chkShowHierarchy" ${opts.showHierarchy ? 'checked' : ''} onchange="GraphUI.updateOption('showHierarchy', this.checked)">
                            <span>Mostra Collegamenti Gerarchici (Cartelle)</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                            <input type="checkbox" id="chkShowCitations" ${opts.showCitations ? 'checked' : ''} onchange="GraphUI.updateOption('showCitations', this.checked)">
                            <span>Mostra Citazioni Live (Transclusion)</span>
                        </label>
                    </div>
                </div>

                <div class="separator-h" style="height:1px; background:var(--border-color); margin:0;"></div>

                <!-- SEZIONE 3: FORZE FISICHE (SLIDERS ESTESI E DISTANZE SEPARATE) -->
                <div>
                    <h4 style="margin:0 0 12px 0; font-size:0.9rem; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px;">
                        Parametri di Simulazione Fisica
                    </h4>
                    
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span>Repulsione tra Nodi</span>
                                <b id="valRepulsion">${phys.repulsion}</b>
                            </div>
                            <input type="range" min="50" max="1200" step="25" value="${phys.repulsion}" style="width:100%;" oninput="GraphUI.updatePhysics('repulsion', this.value)">
                        </div>

                        <div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span>Distanza Collegamenti Note / Citazioni</span>
                                <b id="valSpringNote">${phys.springLengthNote || 85}</b>
                            </div>
                            <input type="range" min="20" max="250" step="5" value="${phys.springLengthNote || 85}" style="width:100%;" oninput="GraphUI.updatePhysics('springLengthNote', this.value)">
                        </div>

                        <div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span>Distanza Cartelle / Gerarchia</span>
                                <b id="valSpringRecord">${phys.springLengthRecord || 55}</b>
                            </div>
                            <input type="range" min="20" max="200" step="5" value="${phys.springLengthRecord || 55}" style="width:100%;" oninput="GraphUI.updatePhysics('springLengthRecord', this.value)">
                        </div>

                        <div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span>Distanza Massima Tag (#)</span>
                                <b id="valSpringTag">${phys.springLengthTag || 140}</b>
                            </div>
                            <input type="range" min="30" max="350" step="5" value="${phys.springLengthTag || 140}" style="width:100%;" oninput="GraphUI.updatePhysics('springLengthTag', this.value)">
                        </div>

                        <div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span>Gravità Centrale</span>
                                <b id="valGravity">${phys.gravity}</b>
                            </div>
                            <input type="range" min="0.001" max="0.08" step="0.001" value="${phys.gravity}" style="width:100%;" oninput="GraphUI.updatePhysics('gravity', this.value)">
                        </div>
                    </div>
                </div>
            </div>
        `;

        const footerHTML = `
            <button class="btn btn-primary" onclick="UI.closeDrawer();" style="width:100%; justify-content:center;">Chiudi Pannello</button>
        `;

        UI.openDrawer("Impostazioni & Forze del Grafo", bodyHTML, footerHTML);
    },

    toggleOption: (key) => {
        const currentVal = !!GraphData.options[key];
        GraphUI.updateOption(key, !currentVal);

        const chkMap = {
            showTags: 'chkShowTags',
            showRecordNotes: 'chkShowRecordNotes',
            showHierarchy: 'chkShowHierarchy',
            showCitations: 'chkShowCitations'
        };
        const chkId = chkMap[key];
        if (chkId) {
            const chkEl = document.getElementById(chkId);
            if (chkEl) chkEl.checked = !currentVal;
        }
    },

    updateOption: (key, value) => {
        GraphData.options[key] = value;
        GraphData.buildGraph();
        GraphCanvas.updateData(GraphData.nodes, GraphData.links, false);
        GraphCanvas.render();
        GraphApp.saveGraphConfig();
    },

    updatePhysics: (key, value) => {
        const parsed = parseFloat(value);
        GraphCanvas.physics[key] = parsed;

        const valMap = {
            'repulsion': 'valRepulsion',
            'springLengthNote': 'valSpringNote',
            'springLengthRecord': 'valSpringRecord',
            'springLengthTag': 'valSpringTag',
            'gravity': 'valGravity'
        };

        const targetSpanId = valMap[key];
        if (targetSpanId) {
            const valSpan = document.getElementById(targetSpanId);
            if (valSpan) valSpan.innerText = parsed;
        }

        GraphCanvas.restartSimulation();
        GraphApp.saveGraphConfig();
    }
};