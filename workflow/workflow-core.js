/**
 * workflow-core.js
 * Modulo Core di Workflow Studio: Stato, Inizializzazione, Sincronizzazione,
 * Gestione Schermate, Persistenza automatica e Navigazione Canvas non distruttiva.
 * FEAT AUTO-LAUNCH: Riconoscimento parametri da URL hash (#db=...&rel=...&dir=...) 
 * ed ereditarietà trasparente dello stato/handle dal genitore (window.opener) per l'apertura immediata.
 * FEAT MULTI-RELATION WORKFLOW: Supporto completo a workflow multipli e indipendenti per database aventi
 * diverse auto-relazioni. Ogni relazione dispone del proprio layout spaziale, collegamenti, stile e impostazioni.
 * FIX PERSISTENZA: Salvataggio automatico nativo su assets/workflow/{dbId}.json con architettura multi-layout.
 */

window.WorkflowApp = {
    currentDbId: null,
    currentDbState: null,
    selfRelCol: null,
    selectedNodeId: null,
    selectedNodeIds: new Set(),
    syncChannel: null,
    _syncPollTimer: null,
    _lastDbContentHash: '',
    
    // Mappa persistita dei layout per ciascun campo di relazione auto-referenziale
    layoutsByRelation: {},

    // Parametri di avvio rapido da URL hash
    _pendingTargetDbId: null,
    _pendingTargetRelId: null,
    _pendingTargetDir: null,
    
    layout: {
        zoom: 1,
        pan: { x: 72, y: 72 },
        visibleColumns: [],
        relationDirection: 'successor',
        connectionStyle: 'orthogonal', // 'bezier' | 'orthogonal' | 'avoidance'
        clusterColId: null,
        backgroundColor: null,          // Sfondo dinamico persistito
        borderColor: null,              // Colore bordi schede persistito
        locked: false,                  // Modalità Consultazione Protetta
        nodes: {}
    },

    panState: { active: false, startX: 0, startY: 0, initialPanX: 0, initialPanY: 0, hasMoved: false },
    dragNodeState: { active: false, masterId: null, startMouseX: 0, startMouseY: 0, initialPositions: {} },
    linkDragState: { active: false, fromRowId: null, fromPortSide: null, startX: 0, startY: 0, tempPath: null },
    marqueeState: { active: false, startClientX: 0, startClientY: 0, startWorldX: 0, startWorldY: 0 },
    minimapDragState: { active: false },
    lastMouseClient: { x: 0, y: 0 },
    _minimapMeta: null,

    escapeHTML: (str) => UI.escapeHTML(str),

    // =========================================================================
    // METODI FONDAMENTALI DI STATO E TRANSIZIONE (CORE)
    // =========================================================================
    switchScreen: (screenId) => {
        document.querySelectorAll('.app-screen').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(screenId);
        if (target) target.classList.add('active');

        const isWorkflow = screenId === 'canvasScreen';
        const ctrl = document.getElementById('workflowCanvasControls');
        const btnSw = document.getElementById('btnSwitchDb');
        const btnRel = document.getElementById('btnReloadDb');
        const ttl = document.getElementById('activeDbTitle');

        if (ctrl) ctrl.style.display = isWorkflow ? 'flex' : 'none';
        if (btnSw) btnSw.style.display = (isWorkflow || screenId === 'dbPickerScreen') ? 'inline-flex' : 'none';
        if (btnRel) btnRel.style.display = isWorkflow ? 'inline-flex' : 'none';
        if (ttl) ttl.style.display = isWorkflow ? 'inline' : 'none';

        if (typeof WorkflowApp.updateSelectionToolbar === 'function') {
            WorkflowApp.updateSelectionToolbar();
        }
    },

    toggleLayoutLock: () => {
        WorkflowApp.layout.locked = !WorkflowApp.layout.locked;
        WorkflowApp.applyLayoutLockState();
        WorkflowApp.saveWorkflowAuto();
        const msg = WorkflowApp.layout.locked ? "Layout Bloccato: modalità consultazione protetta attiva." : "Layout Sbloccato: modifiche abilitate.";
        UI.showToast(msg, WorkflowApp.layout.locked ? "warning" : "info");
        if (typeof WorkflowApp.updateSelectionToolbar === 'function') {
            WorkflowApp.updateSelectionToolbar();
        }
    },

    applyLayoutLockState: () => {
        const isLocked = !!WorkflowApp.layout.locked;
        const btn = document.getElementById('btnLockLayout');
        const label = document.getElementById('lockBtnLabel');

        if (isLocked) {
            document.body.classList.add('layout-locked');
            if (btn) {
                btn.classList.add('active');
                btn.title = "Layout protetto: clicca per sbloccare modifiche e posizioni";
            }
            if (label) label.innerText = "Sblocca";
        } else {
            document.body.classList.remove('layout-locked');
            if (btn) {
                btn.classList.remove('active');
                btn.title = "Blocca/Sblocca spostamento schede e collegamenti";
            }
            if (label) label.innerText = "Blocca";
        }
    },

    getGridStep: () => {
        const rootStyle = getComputedStyle(document.documentElement);
        const stepStr = rootStyle.getPropertyValue('--wf-grid-step').trim();
        const parsed = parseInt(stepStr, 10);
        return (!isNaN(parsed) && parsed > 0) ? parsed : 24;
    },

    snapToGrid: (val) => {
        const step = WorkflowApp.getGridStep();
        return Math.round(val / step) * step;
    },

    // Salva una copia del layout corrente nella mappa in memoria del campo di relazione attivo
    saveCurrentRelationLayout: () => {
        if (WorkflowApp.selfRelCol && WorkflowApp.selfRelCol.id) {
            if (!WorkflowApp.layoutsByRelation) WorkflowApp.layoutsByRelation = {};
            WorkflowApp.layoutsByRelation[WorkflowApp.selfRelCol.id] = JSON.parse(JSON.stringify(WorkflowApp.layout));
        }
    },

    // Commuta il workflow attivo su un'altra auto-relazione dello stesso database
    switchRelation: (newRelColId) => {
        const db = WorkflowApp.currentDbState;
        if (!db || !newRelColId) return;

        if (WorkflowApp.selfRelCol && WorkflowApp.selfRelCol.id === newRelColId) return;

        const newRelCol = (db.columns || []).find(c => c.id === newRelColId);
        if (!newRelCol) return;

        // Salva lo stato del workflow corrente prima dello switch
        WorkflowApp.saveCurrentRelationLayout();

        WorkflowApp.selfRelCol = newRelCol;
        WorkflowApp.clearFocusBranch();
        WorkflowApp.clearSelection();

        // Recupera o inizializza il layout associato a questa specifica relazione
        if (WorkflowApp.layoutsByRelation && WorkflowApp.layoutsByRelation[newRelColId]) {
            WorkflowApp.layout = JSON.parse(JSON.stringify(WorkflowApp.layoutsByRelation[newRelColId]));
            WorkflowApp.applyCanvasBackground(WorkflowApp.layout.backgroundColor);
            WorkflowApp.applyLayoutLockState();
            WorkflowApp.buildNodesDOM();
            WorkflowApp.renderConnections();
            WorkflowApp.renderClusters();
            WorkflowApp.updateCanvasTransform();
            WorkflowApp.fitToView();
        } else {
            const defaultCols = (db.columns || []).filter(c => c.id !== newRelCol.id && !['formula', 'rollup'].includes(c.type)).slice(1, 4).map(c => c.id);
            WorkflowApp.layout = {
                zoom: 1,
                pan: { x: 72, y: 72 },
                visibleColumns: defaultCols,
                relationDirection: 'successor',
                connectionStyle: 'orthogonal',
                clusterColId: null,
                backgroundColor: null,
                borderColor: null,
                locked: false,
                nodes: {}
            };
            WorkflowApp.applyCanvasBackground(null);
            WorkflowApp.applyLayoutLockState();
            WorkflowApp.buildNodesDOM();
            WorkflowApp.runOrganicAutoLayout(true);
            WorkflowApp.fitToView();
        }

        const titleEl = document.getElementById('activeDbTitle');
        if (titleEl) {
            titleEl.innerText = `${db.title || 'Database'} [${newRelCol.name}]`;
        }

        WorkflowApp.saveWorkflowAuto();
        UI.showToast(`Visualizzazione Workflow per: "${newRelCol.name}"`, "info");
    },

    // =========================================================================
    // RICONOSCIMENTO PARAMETRI DI AVVIO E COLLEGAMENTO WORKSPACE
    // =========================================================================
    checkUrlParams: async () => {
        const hash = window.location.hash ? window.location.hash.substring(1) : '';
        const search = window.location.search ? window.location.search.substring(1) : '';
        const queryString = hash || search;

        let targetDbId = null;
        let targetRelId = null;
        let targetDir = null;

        if (queryString) {
            const params = new URLSearchParams(queryString);
            targetDbId = params.get('db');
            targetRelId = params.get('rel');
            targetDir = params.get('dir');
        }

        if (targetDbId) {
            WorkflowApp._pendingTargetDbId = targetDbId;
            WorkflowApp._pendingTargetRelId = targetRelId;
            WorkflowApp._pendingTargetDir = targetDir;
        }

        // Tenta l'aggancio diretto a window.opener se disponibile
        if (window.opener && window.opener.AppState) {
            try {
                if (window.opener.AppState.workspaceHandle) {
                    const handle = window.opener.AppState.workspaceHandle;
                    AppState.workspaceHandle = handle;
                    const wsLabel = document.getElementById('wsBtnLabel');
                    if (wsLabel) wsLabel.innerText = handle.name;

                    // Legge tutti i database dal disco usando l'handle
                    try {
                        const dbDir = await handle.getDirectoryHandle('databases');
                        for await (const entry of dbDir.values()) {
                            if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                                const dbId = entry.name.replace('.json', '');
                                const fileHandle = await dbDir.getFileHandle(entry.name);
                                const file = await fileHandle.getFile();
                                const text = await file.text();
                                try {
                                    const dbState = JSON.parse(text);
                                    if (!dbState.isPivot && !dbState.isLinkedView && !dbId.includes('adv_btnbar_') && !dbId.includes('adv_code_') && !dbId.includes('adv_cols_') && dbId !== 'SYS_PROPERTIES_DB') {
                                        AppState.databases[dbId] = dbState;
                                    }
                                } catch (err) {}
                            }
                        }
                    } catch(readErr) {
                        if (window.opener.AppState.databases) {
                            AppState.databases = Object.assign({}, window.opener.AppState.databases);
                        }
                    }

                    if (window.opener.AppState.notes) {
                        AppState.notes = [...(window.opener.AppState.notes || [])];
                    }

                    // Se il database target è presente, caricalo immediatamente sul canvas
                    if (targetDbId && AppState.databases[targetDbId]) {
                        WorkflowApp._pendingTargetDbId = null;
                        await WorkflowApp.loadDatabaseForWorkflow(targetDbId);
                        return;
                    }
                }
            } catch (err) {
                console.warn("[WORKFLOW] Accesso a window.opener non consentito:", err);
            }
        }
    },

    // =========================================================================
    // INIZIALIZZAZIONE GLOBALE EVENTI CANVAS
    // =========================================================================
    init: () => {
        const savedTheme = localStorage.getItem('theme') || 'light';
        UI.setTheme(savedTheme);
        if (typeof UI.initCustomTooltips === 'function') {
            UI.initCustomTooltips();
        }

        // Fallback difensivo per la navigazione a note nel drawer
        if (!UI.selectNote) {
            UI.selectNote = () => {
                UI.showToast("La visualizzazione completa delle note è disponibile nell'applicazione principale VanillaDesk.", "info");
            };
        }

        WorkflowApp.initLiveSync();

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.adv-dropdown') && !e.target.closest('.adv-context-menu') && !e.target.closest('#btnHamburgerMenu')) {
                if (typeof UI !== 'undefined' && UI.Menu) {
                    UI.Menu.closeAll(true);
                }
            }
        }, true);

        const viewport = document.getElementById('canvasViewport');
        if (!viewport) return;

        viewport.addEventListener('mousedown', (e) => {
            if (typeof UI !== 'undefined' && UI.Menu) {
                UI.Menu.closeAll(true);
            }

            if (e.target.closest('.wf-node') || 
                e.target.closest('button') || 
                e.target.closest('.adv-dropdown') || 
                e.target.closest('.wf-port') || 
                e.target.closest('#workflowMinimap') || 
                e.target.closest('.search-box-header') || 
                e.target.closest('.wf-cluster-header') ||
                e.target.closest('#wfSelectionToolbar')) return;
            
            WorkflowApp.closeSearchDropdown();

            if (e.shiftKey) {
                e.preventDefault();
                WorkflowApp.clearFocusBranch();
                if (!e.ctrlKey && !e.metaKey) WorkflowApp.clearSelection();

                const vpRect = viewport.getBoundingClientRect();
                const zoom = WorkflowApp.layout.zoom || 1;
                const panX = isFinite(WorkflowApp.layout.pan.x) ? WorkflowApp.layout.pan.x : 72;
                const panY = isFinite(WorkflowApp.layout.pan.y) ? WorkflowApp.layout.pan.y : 72;

                const worldX = (e.clientX - vpRect.left - panX) / zoom;
                const worldY = (e.clientY - vpRect.top - panY) / zoom;

                WorkflowApp.marqueeState = {
                    active: true,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    startWorldX: worldX,
                    startWorldY: worldY
                };
                return;
            }

            // Innesco del pan: non deseleziona subito per consentire lo spostamento vista senza perdere il ramo evidenziato
            WorkflowApp.panState = {
                active: true,
                startX: e.clientX,
                startY: e.clientY,
                initialPanX: isFinite(WorkflowApp.layout.pan.x) ? WorkflowApp.layout.pan.x : 72,
                initialPanY: isFinite(WorkflowApp.layout.pan.y) ? WorkflowApp.layout.pan.y : 72,
                hasMoved: false
            };
        });

        window.addEventListener('mousemove', (e) => {
            WorkflowApp.lastMouseClient.x = e.clientX;
            WorkflowApp.lastMouseClient.y = e.clientY;

            if (WorkflowApp.marqueeState.active) {
                WorkflowApp.updateMarqueeBox(e);
                return;
            }

            if (WorkflowApp.panState.active) {
                const dx = e.clientX - WorkflowApp.panState.startX;
                const dy = e.clientY - WorkflowApp.panState.startY;

                if (Math.hypot(dx, dy) > 4) {
                    WorkflowApp.panState.hasMoved = true;
                }

                const nextPanX = WorkflowApp.panState.initialPanX + dx;
                const nextPanY = WorkflowApp.panState.initialPanY + dy;
                
                if (isFinite(nextPanX) && isFinite(nextPanY)) {
                    WorkflowApp.layout.pan.x = nextPanX;
                    WorkflowApp.layout.pan.y = nextPanY;
                    WorkflowApp.updateCanvasTransform();
                }
            }

            if (WorkflowApp.dragNodeState.active && !WorkflowApp.layout.locked) {
                const zoom = WorkflowApp.layout.zoom || 1;
                const rawDx = (e.clientX - WorkflowApp.dragNodeState.startMouseX) / zoom;
                const rawDy = (e.clientY - WorkflowApp.dragNodeState.startMouseY) / zoom;

                const masterInit = WorkflowApp.dragNodeState.initialPositions[WorkflowApp.dragNodeState.masterId];
                if (masterInit) {
                    let tentativeMasterX = masterInit.x + rawDx;
                    let tentativeMasterY = masterInit.y + rawDy;

                    const alignment = WorkflowApp.calculateSmartGuides(WorkflowApp.dragNodeState.masterId, tentativeMasterX, tentativeMasterY);
                    
                    const targetMasterX = alignment.snappedX;
                    const targetMasterY = alignment.snappedY;

                    const snappedDeltaX = targetMasterX - masterInit.x;
                    const snappedDeltaY = targetMasterY - masterInit.y;

                    WorkflowApp.selectedNodeIds.forEach(id => {
                        const initPos = WorkflowApp.dragNodeState.initialPositions[id];
                        if (initPos) {
                            const nx = initPos.x + snappedDeltaX;
                            const ny = initPos.y + snappedDeltaY;
                            WorkflowApp.layout.nodes[id] = { x: nx, y: ny };

                            const nodeEl = document.getElementById(`wf_node_${id}`);
                            if (nodeEl) {
                                nodeEl.style.left = `${nx}px`;
                                nodeEl.style.top = `${ny}px`;
                            }
                        }
                    });

                    WorkflowApp.drawSmartGuides(alignment.guides);
                    WorkflowApp.renderConnections();
                    WorkflowApp.renderClusters();
                    WorkflowApp.updateMinimap();
                }
            }

            if (WorkflowApp.linkDragState.active && !WorkflowApp.layout.locked) {
                WorkflowApp.updateTempLinkPath();
            }

            if (WorkflowApp.minimapDragState.active) {
                WorkflowApp.handleMinimapClick(e);
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (WorkflowApp.marqueeState.active) {
                WorkflowApp.finishMarqueeSelection(e);
            }

            if (WorkflowApp.dragNodeState.active) {
                WorkflowApp.saveWorkflowAuto();
            }

            // Se l'utente ha rilasciato il mouse senza muoverlo (click singolo a vuoto), allora deseleziona
            if (WorkflowApp.panState.active && !WorkflowApp.panState.hasMoved) {
                WorkflowApp.clearFocusBranch();
                WorkflowApp.clearSelection();
            }

            WorkflowApp.panState.active = false;
            WorkflowApp.panState.hasMoved = false;
            WorkflowApp.dragNodeState.active = false;
            WorkflowApp.minimapDragState.active = false;
            WorkflowApp.clearSmartGuides();

            if (WorkflowApp.linkDragState.active) {
                WorkflowApp.finishLinkDrag(e);
            }
        });

        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
            WorkflowApp.zoomAtPoint(e.clientX, e.clientY, zoomFactor);
        }, { passive: false });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-box-header')) {
                WorkflowApp.closeSearchDropdown();
            }
        });

        const minimapEl = document.getElementById('workflowMinimap');
        if (minimapEl) {
            minimapEl.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                WorkflowApp.minimapDragState.active = true;
                WorkflowApp.handleMinimapClick(e);
            });
        }

        // Controllo automatico dei parametri URL/hash all'avvio
        WorkflowApp.checkUrlParams();
    },

    initLiveSync: () => {
        try {
            WorkflowApp.syncChannel = new BroadcastChannel('vanilladesk_sync');
            WorkflowApp.syncChannel.onmessage = (event) => {
                const data = event.data;
                if (!data) return;
                if (data.type === 'db_saved' || data.type === 'workspace_saved' || data.tableId === WorkflowApp.currentDbId) {
                    WorkflowApp.reloadCurrentDatabase(true);
                }
            };
        } catch(e) {}

        window.addEventListener('focus', () => {
            if (document.visibilityState === 'visible') {
                WorkflowApp.reloadCurrentDatabase(true);
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                WorkflowApp.reloadCurrentDatabase(true);
            }
        });

        if (WorkflowApp._syncPollTimer) clearInterval(WorkflowApp._syncPollTimer);
        WorkflowApp._syncPollTimer = setInterval(() => {
            if (document.visibilityState === 'visible' && WorkflowApp.currentDbId && AppState.workspaceHandle) {
                WorkflowApp.reloadCurrentDatabase(true);
            }
        }, 3000);
    },

    selectWorkspace: async () => {
        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            AppState.workspaceHandle = dirHandle;
            document.getElementById('wsBtnLabel').innerText = dirHandle.name;

            AppState.databases = {};
            AppState.notes = [];

            try {
                const dbDir = await dirHandle.getDirectoryHandle('databases');
                for await (const entry of dbDir.values()) {
                    if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                        const dbId = entry.name.replace('.json', '');
                        const fileHandle = await dbDir.getFileHandle(entry.name);
                        const file = await fileHandle.getFile();
                        const text = await file.text();
                        try {
                            const dbState = JSON.parse(text);
                            if (!dbState.isPivot && !dbState.isLinkedView && !dbId.includes('adv_btnbar_') && !dbId.includes('adv_code_') && !dbId.includes('adv_cols_') && dbId !== 'SYS_PROPERTIES_DB') {
                                AppState.databases[dbId] = dbState;
                            }
                        } catch (err) {}
                    }
                }
            } catch(e) {}

            try {
                const notesDir = await dirHandle.getDirectoryHandle('notes');
                for await (const entry of notesDir.values()) {
                    if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                        const nHandle = await notesDir.getFileHandle(entry.name);
                        const nFile = await nHandle.getFile();
                        try {
                            const nData = JSON.parse(await nFile.text());
                            AppState.notes.push(nData);
                        } catch(e) {}
                    }
                }
            } catch(e) {}

            if (WorkflowApp._pendingTargetDbId && AppState.databases[WorkflowApp._pendingTargetDbId]) {
                const targetDbId = WorkflowApp._pendingTargetDbId;
                WorkflowApp._pendingTargetDbId = null;
                await WorkflowApp.loadDatabaseForWorkflow(targetDbId);
            } else {
                WorkflowApp.showDbPicker();
            }
        } catch (e) {
            if (e.name !== 'AbortError') alert("Errore apertura Workspace: " + e.message);
        }
    },

    showDbPicker: () => {
        const grid = document.getElementById('dbGridList');
        grid.innerHTML = '';

        const dbKeys = Object.keys(AppState.databases).filter(id => {
            const db = AppState.databases[id];
            return (db.columns || []).some(c => c.type === 'relation' && (c.targetTableId === id || c.targetTableId === db.id));
        });

        if (dbKeys.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding:50px 20px; color:var(--text-secondary); background:var(--sidebar-bg); border:1px dashed var(--border-color); border-radius:12px;">
                    <div style="font-size:2rem; margin-bottom:12px;">🔍</div>
                    <h3 style="color:var(--text-primary); margin-bottom:8px;">Nessun Database con Auto-Relazione Trovato</h3>
                    <p style="max-width:550px; margin:0 auto; line-height:1.5; font-size:0.9rem;">
                        Per visualizzare una tabella in <b>Workflow Studio</b>, apri <b>VanillaDesk</b> e aggiungi una colonna di tipo <b>Relazione</b> che punti alla tabella stessa.
                    </p>
                </div>
            `;
            WorkflowApp.switchScreen('dbPickerScreen');
            return;
        }

        dbKeys.sort((a, b) => {
            const dbA = AppState.databases[a];
            const dbB = AppState.databases[b];
            return (dbA.title || '').localeCompare(dbB.title || '');
        });

        dbKeys.forEach(id => {
            const db = AppState.databases[id];
            const rowCount = (db.rows || []).length;
            const selfRels = (db.columns || []).filter(c => c.type === 'relation' && (c.targetTableId === id || c.targetTableId === db.id));
            const relNames = selfRels.map(r => r.name).join(', ');

            const card = document.createElement('div');
            card.className = 'db-card';
            card.innerHTML = `
                <div class="db-card-title">
                    <span style="display:inline-flex;">${Icons.tableDatabase}</span>
                    <span>${UI.escapeHTML(db.title || 'Database Senza Nome')}</span>
                </div>
                <div style="font-size:0.85rem; color:var(--text-secondary);">
                    <b>${rowCount}</b> record &bull; <b>${(db.columns || []).length}</b> colonne
                </div>
                <div>
                    <span class="db-card-badge badge-ready">🌟 Workflow Pronto (${UI.escapeHTML(relNames || 'Relazione')})</span>
                </div>
            `;

            card.onclick = () => WorkflowApp.loadDatabaseForWorkflow(id);
            grid.appendChild(card);
        });

        WorkflowApp.switchScreen('dbPickerScreen');
    },

    loadDatabaseForWorkflow: async (dbId) => {
        const db = AppState.databases[dbId];
        if (!db) return;

        WorkflowApp.currentDbId = dbId;
        WorkflowApp.currentDbState = db;
        WorkflowApp._lastDbContentHash = JSON.stringify(db);

        // Raccolta di tutte le auto-relazioni presenti nel DB
        const selfRels = (db.columns || []).filter(c => c.type === 'relation' && (c.targetTableId === dbId || c.targetTableId === db.id));
        let activeRel = selfRels.length > 0 ? selfRels[0] : (db.columns || []).find(c => c.type === 'relation');

        // Assegna la colonna target specificata se invocata dall'URL
        if (WorkflowApp._pendingTargetRelId) {
            const specificRel = (db.columns || []).find(c => c.id === WorkflowApp._pendingTargetRelId);
            if (specificRel) activeRel = specificRel;
            WorkflowApp._pendingTargetRelId = null;
        }
        WorkflowApp.selfRelCol = activeRel;

        const titleEl = document.getElementById('activeDbTitle');
        if (titleEl) {
            titleEl.innerText = activeRel ? `${db.title || 'Database'} [${activeRel.name}]` : (db.title || 'Database');
        }

        // Inizializza il contenitore multi-layout per le relazioni
        WorkflowApp.layoutsByRelation = {};

        // Inizializza il layout corrente di fallback
        const defaultCols = (db.columns || []).filter(c => c.id !== activeRel?.id && !['formula', 'rollup'].includes(c.type)).slice(1, 4).map(c => c.id);
        WorkflowApp.layout = {
            zoom: 1,
            pan: { x: 72, y: 72 },
            visibleColumns: defaultCols,
            relationDirection: 'successor',
            connectionStyle: 'orthogonal',
            clusterColId: null,
            backgroundColor: null,
            borderColor: null,
            locked: false,
            nodes: {}
        };

        if (WorkflowApp._pendingTargetDir) {
            WorkflowApp.layout.relationDirection = (WorkflowApp._pendingTargetDir === 'parent' || WorkflowApp._pendingTargetDir === 'predecessor') ? 'predecessor' : 'successor';
            WorkflowApp._pendingTargetDir = null;
        }

        // CARICAMENTO AUTOMATICO NATIVO DA assets/workflow/{dbId}.json
        const hasLoadedCustomLayout = await WorkflowApp.loadWorkflowFromFile(dbId);

        WorkflowApp.applyCanvasBackground(WorkflowApp.layout.backgroundColor);
        WorkflowApp.applyLayoutLockState();
        WorkflowApp.switchScreen('canvasScreen');

        WorkflowApp.buildNodesDOM();

        if (!hasLoadedCustomLayout) {
            WorkflowApp.runOrganicAutoLayout(true);
        } else {
            (db.rows || []).forEach(r => {
                const pos = WorkflowApp.layout.nodes[r.id];
                const el = document.getElementById(`wf_node_${r.id}`);
                if (pos && el) {
                    el.style.left = `${pos.x}px`;
                    el.style.top = `${pos.y}px`;
                }
            });
            WorkflowApp.renderConnections();
            WorkflowApp.renderClusters();
            WorkflowApp.updateCanvasTransform();
        }
        
        setTimeout(() => {
            WorkflowApp.fitToView();
        }, 60);
    },

    reloadCurrentDatabase: async (silent = false) => {
        if (!WorkflowApp.currentDbId || !AppState.workspaceHandle) return;

        try {
            const dbDir = await AppState.workspaceHandle.getDirectoryHandle('databases');
            const fileHandle = await dbDir.getFileHandle(`${WorkflowApp.currentDbId}.json`);
            const file = await fileHandle.getFile();
            const text = await file.text();

            if (silent && text === WorkflowApp._lastDbContentHash) {
                return;
            }

            const freshDbState = JSON.parse(text);
            WorkflowApp._lastDbContentHash = text;
            AppState.databases[WorkflowApp.currentDbId] = freshDbState;
            WorkflowApp.currentDbState = freshDbState;

            // Preserva la relazione attualmente attiva se esiste ancora, altrimenti fallback
            const currentRelId = WorkflowApp.selfRelCol ? WorkflowApp.selfRelCol.id : null;
            let selfRel = (freshDbState.columns || []).find(c => c.id === currentRelId);
            if (!selfRel) {
                selfRel = (freshDbState.columns || []).find(c => c.type === 'relation' && (c.targetTableId === WorkflowApp.currentDbId || c.targetTableId === freshDbState.id));
                if (!selfRel) selfRel = (freshDbState.columns || []).find(c => c.type === 'relation');
            }
            WorkflowApp.selfRelCol = selfRel;

            const titleEl = document.getElementById('activeDbTitle');
            if (titleEl) {
                titleEl.innerText = selfRel ? `${freshDbState.title || 'Database'} [${selfRel.name}]` : (freshDbState.title || 'Database');
            }

            WorkflowApp.buildNodesDOM();

            (freshDbState.rows || []).forEach(r => {
                const pos = WorkflowApp.layout.nodes[r.id];
                const el = document.getElementById(`wf_node_${r.id}`);
                if (pos && el) {
                    el.style.left = `${pos.x}px`;
                    el.style.top = `${pos.y}px`;
                }
            });

            WorkflowApp.renderConnections();
            WorkflowApp.renderClusters();
            WorkflowApp.updateMinimap();
            if (!silent) UI.showToast("Dati aggiornati ricaricati dal disco!", "success");
        } catch(e) {
            if (!silent) {
                console.error("Errore ricarica:", e);
                UI.showToast("Errore durante la ricarica dal disco.", "error");
            }
        }
    },

    // =========================================================================
    // I/O AUTOMATICO SU assets/workflow/{tableId}.json (CON MULTI-RELATION SUPPORT)
    // =========================================================================
    getWorkflowFolderHandle: async () => {
        if (!AppState.workspaceHandle) return null;
        try {
            const assetsDir = await AppState.workspaceHandle.getDirectoryHandle('assets', { create: true });
            return await assetsDir.getDirectoryHandle('workflow', { create: true });
        } catch (e) {
            console.error("Errore accesso cartella assets/workflow:", e);
            return null;
        }
    },

    saveWorkflowAuto: async () => {
        if (!WorkflowApp.currentDbId || !AppState.workspaceHandle) return;
        try {
            const wfDir = await WorkflowApp.getWorkflowFolderHandle();
            if (!wfDir) return;

            WorkflowApp.saveCurrentRelationLayout();

            const fileHandle = await wfDir.getFileHandle(`${WorkflowApp.currentDbId}.json`, { create: true });
            const writable = await fileHandle.createWritable();
            
            const exportObj = {
                type: "vanilladesk_workflow_layout",
                version: "3.1",
                databaseId: WorkflowApp.currentDbId,
                databaseTitle: WorkflowApp.currentDbState ? WorkflowApp.currentDbState.title : 'database',
                activeRelationColId: WorkflowApp.selfRelCol ? WorkflowApp.selfRelCol.id : null,
                relationColId: WorkflowApp.selfRelCol ? WorkflowApp.selfRelCol.id : null,
                layout: WorkflowApp.layout,
                layoutsByRelation: WorkflowApp.layoutsByRelation || {}
            };

            await writable.write(JSON.stringify(exportObj, null, 2));
            await writable.close();
        } catch(e) {
            console.error("Errore salvataggio automatico workflow:", e);
        }
    },

    loadWorkflowFromFile: async (dbId) => {
        try {
            const wfDir = await WorkflowApp.getWorkflowFolderHandle();
            if (!wfDir) return false;

            const fileHandle = await wfDir.getFileHandle(`${dbId}.json`, { create: false });
            const file = await fileHandle.getFile();
            const text = await file.text();
            const parsed = JSON.parse(text);

            if (parsed) {
                if (parsed.layoutsByRelation) {
                    WorkflowApp.layoutsByRelation = parsed.layoutsByRelation;
                } else {
                    WorkflowApp.layoutsByRelation = {};
                }

                const targetRelId = WorkflowApp.selfRelCol ? WorkflowApp.selfRelCol.id : (parsed.activeRelationColId || parsed.relationColId);

                // Se esiste un layout memorizzato specificamente per la relazione attiva
                if (targetRelId && WorkflowApp.layoutsByRelation[targetRelId]) {
                    WorkflowApp.layout = WorkflowApp.layoutsByRelation[targetRelId];
                    return true;
                }

                // Fallback per file legacy con layout singolo
                if (parsed.layout) {
                    WorkflowApp.layout = parsed.layout;
                    if (targetRelId) {
                        WorkflowApp.layoutsByRelation[targetRelId] = JSON.parse(JSON.stringify(parsed.layout));
                    }
                    return true;
                }
            }
        } catch(e) {
            return false;
        }
        return false;
    },

    loadLegacyLayoutFile: (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (parsed.type !== 'vanilladesk_workflow_layout') {
                    alert("Il file caricato non è una configurazione di layout Workflow valida.");
                    return;
                }

                if (parsed.layoutsByRelation) {
                    WorkflowApp.layoutsByRelation = parsed.layoutsByRelation;
                }

                const targetRelId = WorkflowApp.selfRelCol ? WorkflowApp.selfRelCol.id : (parsed.activeRelationColId || parsed.relationColId);
                
                if (targetRelId && WorkflowApp.layoutsByRelation[targetRelId]) {
                    WorkflowApp.layout = WorkflowApp.layoutsByRelation[targetRelId];
                } else if (parsed.layout) {
                    WorkflowApp.layout = parsed.layout;
                }

                WorkflowApp.applyCanvasBackground(WorkflowApp.layout.backgroundColor);
                WorkflowApp.applyLayoutLockState();

                WorkflowApp.buildNodesDOM();

                const db = WorkflowApp.currentDbState;
                (db.rows || []).forEach(r => {
                    const pos = WorkflowApp.layout.nodes[r.id];
                    const el = document.getElementById(`wf_node_${r.id}`);
                    if (pos && el) {
                        el.style.left = `${pos.x}px`;
                        el.style.top = `${pos.y}px`;
                    }
                });

                WorkflowApp.renderConnections();
                WorkflowApp.renderClusters();
                WorkflowApp.updateCanvasTransform();
                WorkflowApp.saveWorkflowAuto();

                UI.showToast("Layout ripristinato e sincronizzato con successo!", "success");
            } catch (err) {
                alert("Errore durante la lettura del layout: " + err.message);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }
};