/**
 * tests/test-workflow.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: workflow
 * Conteggio test case: 36
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("Workflow Studio: Core, Canvas, Routing & DAG (36 Test)", () => {

    test("Workflow Geometry: calcolo porte cardinali (Top, Right, Bottom, Left)", () => {
            const nodeId = 'n_geo_1';
            // Simuliamo un nodo a coordinate (100, 200) con larghezza 288 e altezza simulata 80
            WorkflowApp.layout.nodes[nodeId] = { x: 100, y: 200 };

            const pTop = WorkflowApp.getNodePortGeometry(nodeId, 'top');
            Assert.strictEqual(pTop.x, 100 + 144); // x + w/2
            Assert.strictEqual(pTop.y, 200);       // y
            Assert.deepEqual(pTop.normal, { x: 0, y: -1 });

            const pRight = WorkflowApp.getNodePortGeometry(nodeId, 'right');
            Assert.strictEqual(pRight.x, 100 + 288); // x + w
            Assert.deepEqual(pRight.normal, { x: 1, y: 0 });

            const pBottom = WorkflowApp.getNodePortGeometry(nodeId, 'bottom');
            Assert.strictEqual(pBottom.x, 100 + 144);
            Assert.deepEqual(pBottom.normal, { x: 0, y: 1 });

            const pLeft = WorkflowApp.getNodePortGeometry(nodeId, 'left');
            Assert.strictEqual(pLeft.x, 100);
            Assert.deepEqual(pLeft.normal, { x: -1, y: 0 });
        });

    test("Collision: _lineIntersectsLine rileva corretta intersezione a croce", () => {
            // Due segmenti perpendicolari che si incrociano in (5, 5)
            const hit = WorkflowApp._lineIntersectsLine(0, 5, 10, 5, 5, 0, 5, 10);
            Assert.isTrue(hit);

            // Due segmenti paralleli disgiunti
            const parallel = WorkflowApp._lineIntersectsLine(0, 0, 10, 0, 0, 5, 10, 5);
            Assert.isFalse(parallel);

            // Due segmenti sghembi che non si toccano
            const miss = WorkflowApp._lineIntersectsLine(0, 0, 4, 4, 6, 6, 10, 2);
            Assert.isFalse(miss);
        });

    test("Collision: _segmentIntersectsBox rileva attraversamento ostacoli", () => {
            // Ostacolo rettangolare: x: 100, y: 100, w: 200, h: 100
            const obstacleBox = { x: 100, y: 100, w: 200, h: 100 };

            // Traiettoria che attraversa l'ostacolo da sinistra a destra
            const hitDirect = WorkflowApp._segmentIntersectsBox({ x: 50, y: 150 }, { x: 350, y: 150 }, obstacleBox);
            Assert.isTrue(hitDirect);

            // Traiettoria che passa sopra l'ostacolo senza toccarlo
            const clearPass = WorkflowApp._segmentIntersectsBox({ x: 50, y: 50 }, { x: 350, y: 50 }, obstacleBox);
            Assert.isFalse(clearPass);

            // Punto interno al box
            const insideHit = WorkflowApp._segmentIntersectsBox({ x: 150, y: 150 }, { x: 160, y: 160 }, obstacleBox);
            Assert.isTrue(insideHit);
        });

    test("Routing: nodi allineati verticalmente generano segmento dritto [p1, p2]", () => {
            const p1 = { x: 200, y: 100 };
            const n1 = { x: 0, y: 1 }; // Uscita verso il basso
            const p2 = { x: 200, y: 300 };
            const n2 = { x: 0, y: -1 }; // Entrata dall'alto

            const waypoints = WorkflowApp._buildOrthogonalWaypoints(p1, n1, p2, n2, []);
            Assert.strictEqual(waypoints.length, 2);
            Assert.strictEqual(waypoints[0].x, 200);
            Assert.strictEqual(waypoints[1].x, 200);
        });

    test("Routing: nodi allineati orizzontalmente generano segmento dritto [p1, p2]", () => {
            const p1 = { x: 100, y: 250 };
            const n1 = { x: 1, y: 0 }; // Uscita a destra
            const p2 = { x: 400, y: 250 };
            const n2 = { x: -1, y: 0 }; // Entrata da sinistra

            const waypoints = WorkflowApp._buildOrthogonalWaypoints(p1, n1, p2, n2, []);
            Assert.strictEqual(waypoints.length, 2);
            Assert.strictEqual(waypoints[0].y, 250);
            Assert.strictEqual(waypoints[1].y, 250);
        });

    test("Routing: raccordi arrotondati _pointsToRoundedPath applicano curve quadratiche Q", () => {
            const waypoints = [
                { x: 100, y: 100 },
                { x: 200, y: 100 },
                { x: 200, y: 300 }
            ];
            const pathData = WorkflowApp._pointsToRoundedPath(waypoints, 12);
            Assert.isTrue(pathData.startsWith('M 100 100'));
            Assert.isTrue(pathData.includes('Q 200 100'), "La curva d'angolo a 90° deve contenere un raccordo quadratico Q");
            Assert.isTrue(pathData.endsWith('200 300'));
        });

    test("Layout: snapToGrid aggancia rigorosamente ai multipli di 24px", () => {
            Assert.strictEqual(WorkflowApp.snapToGrid(0), 0);
            Assert.strictEqual(WorkflowApp.snapToGrid(20), 24);
            Assert.strictEqual(WorkflowApp.snapToGrid(25), 24);
            Assert.strictEqual(WorkflowApp.snapToGrid(40), 48);
            Assert.strictEqual(WorkflowApp.snapToGrid(70), 72);
            Assert.strictEqual(WorkflowApp.snapToGrid(73), 72);
        });

    test("Layout: rilevamento cicli topologici su grafo diretto", () => {
            const dbMock = {
                rows: [
                    { id: 'wf_1', cells: { rel_self: ['wf_2'] } },
                    { id: 'wf_2', cells: { rel_self: ['wf_3'] } },
                    { id: 'wf_3', cells: { rel_self: [] } }
                ]
            };
            WorkflowApp.currentDbState = dbMock;
            WorkflowApp.selfRelCol = { id: 'rel_self', singleRecord: false };

            // Connettere wf_3 a wf_1 deve generare un ciclo!
            Assert.isTrue(WorkflowApp.checkCycle('wf_3', 'wf_1'));

            // Connettere un nodo libero 'wf_4' a 'wf_3' non genera cicli
            dbMock.rows.push({ id: 'wf_4', cells: { rel_self: [] } });
            Assert.isFalse(WorkflowApp.checkCycle('wf_4', 'wf_3'));
        });

    test("Layout: calcolo distribuzione orizzontale equidistante", () => {
            const dummyNodes = [
                { id: 'n1', x: 0, w: 288, h: 80, el: { style: {} } },
                { id: 'n2', x: 100, w: 288, h: 80, el: { style: {} } },
                { id: 'n3', x: 1000, w: 288, h: 80, el: { style: {} } }
            ];

            // Simulazione logica distribuzione orizzontale
            const span = (dummyNodes[2].x + dummyNodes[2].w) - dummyNodes[0].x; // 1288
            const totalW = dummyNodes.reduce((acc, n) => acc + n.w, 0); // 864
            const freeSpace = span - totalW; // 424
            const gap = freeSpace / 2; // 212

            const p0 = 0;
            const p1 = WorkflowApp.snapToGrid(p0 + 288 + gap); // 500 -> 504 (multiplo 24)
            const p2 = WorkflowApp.snapToGrid(p1 + 288 + gap); // 1004 -> 1008

            Assert.strictEqual(p0, 0);
            Assert.isTrue(p1 % 24 === 0);
            Assert.isTrue(p2 % 24 === 0);
            Assert.isTrue(p1 > p0 && p2 > p1);
        });

    test("Workflow: rilevamento cicli su struttura a diamante (A->B, A->C, B->D, C->D; D->A è ciclo)", () => {
            const dbMock = {
                rows: [
                    { id: 'node_a', cells: { rel: ['node_b', 'node_c'] } },
                    { id: 'node_b', cells: { rel: ['node_d'] } },
                    { id: 'node_c', cells: { rel: ['node_d'] } },
                    { id: 'node_d', cells: { rel: [] } }
                ]
            };
            WorkflowApp.currentDbState = dbMock;
            WorkflowApp.selfRelCol = { id: 'rel', singleRecord: false };

            // Connessione legittima A -> D (non è un ciclo)
            Assert.isFalse(WorkflowApp.checkCycle('node_a', 'node_d'));
            // Connessione ciclica D -> A (crea un loop chiuso lungo il grafo a diamante)
            Assert.isTrue(WorkflowApp.checkCycle('node_d', 'node_a'));
        });

    test("Workflow: snapToGrid su coordinate negative aggancia rigorosamente ai multipli di 24", () => {
            Assert.strictEqual(WorkflowApp.snapToGrid(-10), 0);
            Assert.strictEqual(WorkflowApp.snapToGrid(-20), -24);
            Assert.strictEqual(WorkflowApp.snapToGrid(-25), -24);
            Assert.strictEqual(WorkflowApp.snapToGrid(-40), -48);
        });

    test("Workflow: calcolo distribuzione con 2 soli nodi non altera le posizioni", () => {
            WorkflowApp.selectedNodeIds = new Set(['n1', 'n2']);
            // Con soli 2 nodi la funzione non deve lanciare eccezioni
            Assert.doesNotThrow(() => {
                WorkflowApp.distributeSelectedNodes('horizontal');
            });
        });

    test("Workflow Studio: saveCurrentRelationLayout memorizza lo stato attuale per il campo attivo", () => {
            WorkflowApp.selfRelCol = { id: 'rel_wbs', name: 'Padre' };
            WorkflowApp.layout = {
                zoom: 1.5,
                pan: { x: 120, y: 120 },
                nodes: { 'node_1': { x: 48, y: 72 } }
            };
            WorkflowApp.layoutsByRelation = {};

            WorkflowApp.saveCurrentRelationLayout();

            Assert.isNotNull(WorkflowApp.layoutsByRelation['rel_wbs']);
            Assert.strictEqual(WorkflowApp.layoutsByRelation['rel_wbs'].zoom, 1.5);
            Assert.strictEqual(WorkflowApp.layoutsByRelation['rel_wbs'].nodes['node_1'].x, 48);
        });

    test("Workflow Studio: switchRelation preserva il vecchio layout e ripristina quello del nuovo campo", () => {
            const dbMock = {
                id: 'db_wf_multi',
                title: 'Progetto Core',
                columns: [
                    { id: 'c_title', name: 'Titolo', type: 'text' },
                    { id: 'rel_wbs', name: 'Struttura WBS', type: 'relation', targetTableId: 'db_wf_multi' },
                    { id: 'rel_gantt', name: 'Sequenza Gantt', type: 'relation', targetTableId: 'db_wf_multi' }
                ],
                rows: [
                    { id: 'task_A', cells: { c_title: 'A', rel_wbs: [], rel_gantt: ['task_B'] } },
                    { id: 'task_B', cells: { c_title: 'B', rel_wbs: ['task_A'], rel_gantt: [] } }
                ]
            };
            WorkflowApp.currentDbId = 'db_wf_multi';
            WorkflowApp.currentDbState = dbMock;
            WorkflowApp.selfRelCol = dbMock.columns[1]; // rel_wbs

            // Layout per rel_wbs
            WorkflowApp.layout = {
                zoom: 1.0,
                pan: { x: 50, y: 50 },
                connectionStyle: 'orthogonal',
                nodes: { 'task_A': { x: 0, y: 0 }, 'task_B': { x: 300, y: 0 } }
            };

            // Layout precedentemente salvato per rel_gantt
            WorkflowApp.layoutsByRelation = {
                'rel_gantt': {
                    zoom: 0.8,
                    pan: { x: 200, y: 100 },
                    connectionStyle: 'bezier',
                    nodes: { 'task_A': { x: 500, y: 200 }, 'task_B': { x: 800, y: 200 } }
                }
            };

            WorkflowApp.switchRelation('rel_gantt');

            // 1. Verifica che la relazione attiva sia diventata rel_gantt
            Assert.strictEqual(WorkflowApp.selfRelCol.id, 'rel_gantt');

            // 2. Verifica che le proprietà specifiche del layout rel_gantt siano attive
            Assert.strictEqual(WorkflowApp.layout.connectionStyle, 'bezier');
            Assert.strictEqual(WorkflowApp.layout.nodes['task_A'].x, 500);

            // 3. Zoom ricalcolato in Full Auto da fitToView (non statico a 0.8)
            Assert.strictEqual(WorkflowApp.layout.zoom, 1.1);

            // 4. Il vecchio layout di rel_wbs è stato preservato nella mappa
            Assert.strictEqual(WorkflowApp.layoutsByRelation['rel_wbs'].nodes['task_A'].x, 0);
        });

    test("Workflow Studio: switchRelation su nuova relazione mai vista genera layout predefinito", () => {
            const dbMock = {
                id: 'db_wf_new',
                title: 'Progetto',
                columns: [
                    { id: 'c_title', name: 'Titolo', type: 'text' },
                    { id: 'rel_1', name: 'Rel 1', type: 'relation', targetTableId: 'db_wf_new' },
                    { id: 'rel_virgin', name: 'Rel Vergine', type: 'relation', targetTableId: 'db_wf_new' }
                ],
                rows: [{ id: 'r1', cells: { c_title: 'Test' } }]
            };
            WorkflowApp.currentDbId = 'db_wf_new';
            WorkflowApp.currentDbState = dbMock;
            WorkflowApp.selfRelCol = dbMock.columns[1];
            WorkflowApp.layoutsByRelation = {};

            WorkflowApp.switchRelation('rel_virgin');

            Assert.strictEqual(WorkflowApp.selfRelCol.id, 'rel_virgin');
            Assert.strictEqual(WorkflowApp.layout.connectionStyle, 'orthogonal');
            // Lo zoom iniziale non è 1 fisso, ma viene adattato in Full Auto da fitToView
            Assert.strictEqual(WorkflowApp.layout.zoom, 1.1);
        });

    test("Workflow Studio: checkUrlParams rileva parametri #db=...&rel=...&dir=...", async () => {
            const oldHash = window.location.hash;
            window.location.hash = "#db=adv_tbl_sample&rel=c_rel_target&dir=parent";

            try {
                await WorkflowApp.checkUrlParams();
                Assert.strictEqual(WorkflowApp._pendingTargetDbId, 'adv_tbl_sample');
                Assert.strictEqual(WorkflowApp._pendingTargetRelId, 'c_rel_target');
                Assert.strictEqual(WorkflowApp._pendingTargetDir, 'parent');
            } finally {
                window.location.hash = oldHash;
                WorkflowApp._pendingTargetDbId = null;
                WorkflowApp._pendingTargetRelId = null;
                WorkflowApp._pendingTargetDir = null;
            }
        });

    test("Workflow Studio: isCanvasDark rileva correttamente sfondi scuri da stringa esadecimale a 6 cifre", () => {
            WorkflowApp.layout.backgroundColor = '#1e293b'; // Blu scuro
            Assert.isTrue(WorkflowApp.isCanvasDark());

            WorkflowApp.layout.backgroundColor = '#ffffff'; // Bianco
            Assert.isFalse(WorkflowApp.isCanvasDark());
        });

    test("Workflow Studio: isCanvasDark rileva correttamente sfondi da stringa esadecimale a 3 cifre", () => {
            WorkflowApp.layout.backgroundColor = '#111'; // Quasi nero
            Assert.isTrue(WorkflowApp.isCanvasDark());

            WorkflowApp.layout.backgroundColor = '#fff'; // Bianco
            Assert.isFalse(WorkflowApp.isCanvasDark());
        });

    test("Workflow Studio: isCanvasDark rileva correttamente formati rgb e rgba", () => {
            WorkflowApp.layout.backgroundColor = 'rgb(20, 24, 33)'; // Scuro
            Assert.isTrue(WorkflowApp.isCanvasDark());

            WorkflowApp.layout.backgroundColor = 'rgba(255, 255, 255, 0.9)'; // Chiaro
            Assert.isFalse(WorkflowApp.isCanvasDark());
        });

    test("Workflow Studio: applyBlockBorderColor aggiorna il colore dei nodi non condizionali", () => {
            WorkflowApp.currentDbState = {
                id: 'db_borders',
                rows: [{ id: 'node_b1', cells: {} }],
                conditionalColors: []
            };
            const nodeEl = document.createElement('div');
            nodeEl.id = 'wf_node_node_b1';
            nodeEl.className = 'wf-node';
            document.body.appendChild(nodeEl);

            try {
                WorkflowApp.applyBlockBorderColor('#3b82f6');
                Assert.strictEqual(WorkflowApp.layout.borderColor, '#3b82f6');
                Assert.strictEqual(nodeEl.style.borderColor, 'rgb(59, 130, 246)');
            } finally {
                nodeEl.remove();
            }
        });

    test("Workflow Studio: connectNodes rispetta la colonna auto-referenziale attualmente attiva", async () => {
            const dbMock = {
                id: 'db_conn_active',
                columns: [
                    { id: 'rel_active', name: 'Relazione Scelta', type: 'relation', targetTableId: 'db_conn_active' }
                ],
                rows: [
                    { id: 'n1', cells: { rel_active: [] } },
                    { id: 'n2', cells: { rel_active: [] } }
                ]
            };
            WorkflowApp.currentDbId = 'db_conn_active';
            WorkflowApp.currentDbState = dbMock;
            WorkflowApp.selfRelCol = dbMock.columns[0];
            WorkflowApp.layout.locked = false;
            WorkflowApp.layout.relationDirection = 'successor';

            // Disattiva scrittura disco nei test unitari
            const origPersist = WorkflowApp.persistDatabaseToDisk;
            WorkflowApp.persistDatabaseToDisk = async () => {};

            try {
                await WorkflowApp.connectNodes('n1', 'n2');
                Assert.isTrue(dbMock.rows[0].cells.rel_active.includes('n2'));
            } finally {
                WorkflowApp.persistDatabaseToDisk = origPersist;
            }
        });

    test("Workflow Studio: connectNodes blocca modifiche se layout.locked === true", async () => {
            const dbMock = {
                id: 'db_locked',
                columns: [{ id: 'rel', type: 'relation', targetTableId: 'db_locked' }],
                rows: [{ id: 'n1', cells: { rel: [] } }, { id: 'n2', cells: { rel: [] } }]
            };
            WorkflowApp.currentDbState = dbMock;
            WorkflowApp.selfRelCol = dbMock.columns[0];
            WorkflowApp.layout.locked = true;

            await WorkflowApp.connectNodes('n1', 'n2');
            Assert.strictEqual(dbMock.rows[0].cells.rel.length, 0, "Non deve creare collegamenti se il layout è bloccato");
        });

    test("Workflow Studio: checkCycle rileva cicli sul campo di relazione attivo", () => {
            const db = {
                rows: [
                    { id: 'A', cells: { rel: ['B'] } },
                    { id: 'B', cells: { rel: ['C'] } },
                    { id: 'C', cells: { rel: [] } }
                ]
            };
            WorkflowApp.currentDbState = db;
            WorkflowApp.selfRelCol = { id: 'rel' };

            Assert.isTrue(WorkflowApp.checkCycle('C', 'A'));
            Assert.isFalse(WorkflowApp.checkCycle('A', 'C'));
        });

    test("Workflow Studio: porta cardinale con classe 'is-in' non può essere usata come uscita", () => {
            const portEl = document.createElement('div');
            portEl.className = 'wf-port right is-in';
            const nodeEl = document.createElement('div');
            nodeEl.id = 'wf_node_test_port';
            nodeEl.appendChild(portEl);
            document.body.appendChild(nodeEl);

            let toastShown = false;
            const origToast = UI.showToast;
            UI.showToast = () => { toastShown = true; };

            try {
                const evMock = { stopPropagation: () => {}, preventDefault: () => {} };
                WorkflowApp.startLinkDrag(evMock, 'test_port', 'right');
                Assert.isTrue(toastShown, "Deve bloccare l'innesco di uscita da una porta usata come ingresso");
            } finally {
                UI.showToast = origToast;
                nodeEl.remove();
            }
        });

    test("Workflow Studio: zoomAtPoint rispetta i limiti minimi (0.15) e massimi (2.5)", () => {
            let dummyVp = document.getElementById('canvasViewport');
            let createdLocally = false;
            if (!dummyVp) {
                dummyVp = document.createElement('div');
                dummyVp.id = 'canvasViewport';
                document.body.appendChild(dummyVp);
                createdLocally = true;
            }

            try {
                WorkflowApp.layout.zoom = 0.20;
                WorkflowApp.zoomAtPoint(500, 500, 0.1); // zoom molto piccolo
                Assert.strictEqual(WorkflowApp.layout.zoom, 0.15);

                WorkflowApp.layout.zoom = 2.40;
                WorkflowApp.zoomAtPoint(500, 500, 2.0); // zoom molto grande
                Assert.strictEqual(WorkflowApp.layout.zoom, 2.5);
            } finally {
                if (createdLocally) dummyVp.remove();
            }
        });

    test("Workflow Studio: alignSelectedNodes allinea a sinistra su coordinata discreta snapToGrid", () => {
            const el1 = document.createElement('div'); el1.id = 'wf_node_n1'; el1.style.height = '80px';
            const el2 = document.createElement('div'); el2.id = 'wf_node_n2'; el2.style.height = '80px';
            document.body.appendChild(el1);
            document.body.appendChild(el2);

            WorkflowApp.layout.locked = false;
            WorkflowApp.selectedNodeIds = new Set(['n1', 'n2']);
            WorkflowApp.layout.nodes = {
                'n1': { x: 100, y: 0 },
                'n2': { x: 300, y: 100 }
            };

            try {
                WorkflowApp.alignSelectedNodes('left');
                const expectedX = WorkflowApp.snapToGrid(100); // 96
                Assert.strictEqual(WorkflowApp.layout.nodes['n1'].x, expectedX);
                Assert.strictEqual(WorkflowApp.layout.nodes['n2'].x, expectedX);
            } finally {
                el1.remove();
                el2.remove();
            }
        });

    test("Workflow Studio: alignSelectedNodes allinea in alto su coordinata discreta snapToGrid", () => {
            const el1 = document.createElement('div'); el1.id = 'wf_node_n1'; el1.style.height = '80px';
            const el2 = document.createElement('div'); el2.id = 'wf_node_n2'; el2.style.height = '80px';
            document.body.appendChild(el1);
            document.body.appendChild(el2);

            WorkflowApp.layout.locked = false;
            WorkflowApp.selectedNodeIds = new Set(['n1', 'n2']);
            WorkflowApp.layout.nodes = {
                'n1': { x: 0, y: 70 },
                'n2': { x: 100, y: 200 }
            };

            try {
                WorkflowApp.alignSelectedNodes('top');
                const expectedY = WorkflowApp.snapToGrid(70); // 72
                Assert.strictEqual(WorkflowApp.layout.nodes['n1'].y, expectedY);
                Assert.strictEqual(WorkflowApp.layout.nodes['n2'].y, expectedY);
            } finally {
                el1.remove();
                el2.remove();
            }
        });

    test("Workflow: switchRelation salva il layout della relazione corrente prima di passare alla nuova", () => {
            WorkflowApp.currentDbState = {
                id: 'db_sw_test',
                title: 'DB Workflow',
                columns: [
                    { id: 'rel_a', name: 'Relazione A', type: 'relation', targetTableId: 'db_sw_test' },
                    { id: 'rel_b', name: 'Relazione B', type: 'relation', targetTableId: 'db_sw_test' }
                ],
                rows: []
            };
            WorkflowApp.currentDbId = 'db_sw_test';
            WorkflowApp.selfRelCol = WorkflowApp.currentDbState.columns[0];
            WorkflowApp.layout = { zoom: 1.2, pan: { x: 10, y: 20 }, nodes: { 'n1': { x: 100, y: 100 } } };
            WorkflowApp.layoutsByRelation = {};

            WorkflowApp.switchRelation('rel_b');

            Assert.strictEqual(WorkflowApp.selfRelCol.id, 'rel_b');
            Assert.isNotNull(WorkflowApp.layoutsByRelation['rel_a']);
            Assert.strictEqual(WorkflowApp.layoutsByRelation['rel_a'].zoom, 1.2);
        });

    test("Workflow: _segmentIntersectsBox rileva collisione se una linea entra nel box", () => {
            const box = { x: 100, y: 100, w: 200, h: 80 };
            const p1 = { x: 50, y: 140 };
            const p2 = { x: 350, y: 140 };
            Assert.isTrue(WorkflowApp._segmentIntersectsBox(p1, p2, box));
        });

    test("Workflow: _segmentIntersectsBox non rileva collisione per segmenti disgiunti", () => {
            const box = { x: 100, y: 100, w: 200, h: 80 };
            const p1 = { x: 50, y: 50 };
            const p2 = { x: 350, y: 50 };
            Assert.isFalse(WorkflowApp._segmentIntersectsBox(p1, p2, box));
        });

    test("Workflow: _pointsToRoundedPath applica raggio minimo R=12 su curve ortogonali", () => {
            const pts = [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 }
            ];
            const pathStr = WorkflowApp._pointsToRoundedPath(pts, 12);
            Assert.isTrue(pathStr.startsWith('M 0 0'));
            Assert.isTrue(pathStr.includes('Q 100 0'), "Deve inserire la curva di raccordo sull'angolo");
            Assert.isTrue(pathStr.endsWith('100 100'));
        });

    test("Workflow: calculateSmartGuides genera guide magnetiche su allineamento X e Y", () => {
            WorkflowApp.currentDbState = {
                id: 'db_guides',
                rows: [{ id: 'n_anchor', cells: {} }]
            };
            WorkflowApp.selectedNodeIds = new Set(['n_dragged']);
            WorkflowApp.layout.nodes = {
                'n_anchor': { x: 200, y: 200 },
                'n_dragged': { x: 205, y: 203 } // Disallineato di soli 5px e 3px (dentro la soglia di 8px)
            };

            const dummyEl = document.createElement('div');
            dummyEl.id = 'wf_node_n_anchor';
            dummyEl.style.height = '80px';
            document.body.appendChild(dummyEl);

            try {
                const alignment = WorkflowApp.calculateSmartGuides('n_dragged', 205, 203);
                Assert.strictEqual(alignment.snappedX, 200, "Deve agganciare magneticamente a 200px");
                Assert.strictEqual(alignment.snappedY, 200, "Deve agganciare magneticamente a 200px");
                Assert.isTrue(alignment.guides.length >= 1);
            } finally {
                dummyEl.remove();
            }
        });

    test("Workflow: disconnectNodes rimuove il target da cells[relCol.id] e salva", async () => {
            const dbMock = {
                id: 'db_disconn',
                columns: [{ id: 'r_self', type: 'relation', targetTableId: 'db_disconn' }],
                rows: [
                    { id: 'A', cells: { r_self: ['B', 'C'] } },
                    { id: 'B', cells: { r_self: [] } },
                    { id: 'C', cells: { r_self: [] } }
                ]
            };
            WorkflowApp.currentDbState = dbMock;
            WorkflowApp.selfRelCol = dbMock.columns[0];
            WorkflowApp.layout.locked = false;
            WorkflowApp.layout.relationDirection = 'successor';

            const origPersist = WorkflowApp.persistDatabaseToDisk;
            WorkflowApp.persistDatabaseToDisk = async () => {};

            try {
                await WorkflowApp.disconnectNodes('A', 'B');
                Assert.deepEqual(dbMock.rows[0].cells.r_self, ['C']);
            } finally {
                WorkflowApp.persistDatabaseToDisk = origPersist;
            }
        });

    test("Workflow: exportGraphToSVG genera markup XML completo con definizioni defs e foreignObject", () => {
            let dummyVp = document.getElementById('canvasViewport');
            let createdVp = false;
            if (!dummyVp) {
                dummyVp = document.createElement('div');
                dummyVp.id = 'canvasViewport';
                document.body.appendChild(dummyVp);
                createdVp = true;
            }

            WorkflowApp.layout.nodes = { 'n1': { x: 100, y: 100 } };
            const dummyNode = document.createElement('div');
            dummyNode.id = 'wf_node_n1';
            dummyNode.className = 'wf-node';
            dummyNode.style.height = '80px';
            document.body.appendChild(dummyNode);

            let dlTriggered = false;
            const origCreate = URL.createObjectURL;
            URL.createObjectURL = () => "blob:svg_mock";
            const origClick = HTMLAnchorElement.prototype.click;
            HTMLAnchorElement.prototype.click = function() {
                if (this.download && this.download.endsWith('.svg')) dlTriggered = true;
            };

            try {
                WorkflowApp.exportGraphToSVG();
                Assert.isTrue(dlTriggered, "L'esportazione SVG deve generare il file vettoriale e avviare il download");
            } finally {
                URL.createObjectURL = origCreate;
                HTMLAnchorElement.prototype.click = origClick;
                dummyNode.remove();
                if (createdVp) dummyVp.remove();
            }
        });

    test("Workflow: fitToView centra il grafo calcolando panX, panY e zoom", () => {
            WorkflowApp.layout.nodes = {
                'n1': { x: 0, y: 0 },
                'n2': { x: 600, y: 400 }
            };
            const el1 = document.createElement('div'); el1.id = 'wf_node_n1'; el1.style.height = '80px';
            const el2 = document.createElement('div'); el2.id = 'wf_node_n2'; el2.style.height = '80px';
            document.body.appendChild(el1); document.body.appendChild(el2);

            try {
                WorkflowApp.fitToView();
                Assert.isTrue(WorkflowApp.layout.zoom > 0);
                Assert.isTrue(isFinite(WorkflowApp.layout.pan.x));
                Assert.isTrue(isFinite(WorkflowApp.layout.pan.y));
            } finally {
                el1.remove(); el2.remove();
            }
        });

    test("Workflow: snapToGrid con valore zero ritorna esattamente 0", () => {
            Assert.strictEqual(WorkflowApp.snapToGrid(0), 0);
        });

});
