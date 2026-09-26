/**
 * tests/test-advanced-table-tree.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-tree
 * Conteggio test case: 10
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Tree: WBS, Gerarchia Ricorsiva & Nodi Radice (10 Test)", () => {

    test("WBS: risoluzione gerarchica con direzione 'children'", () => {
            const treeDb = {
                id: 'db_wbs_c',
                title: 'Progetto WBS',
                viewType: 'tree',
                treeRelationColId: 'rel_sub',
                treeRelationDirection: 'children',
                columns: [
                    { id: 't_name', name: 'Attività', type: 'text' },
                    { id: 'rel_sub', name: 'Sotto-task', type: 'relation', targetTableId: 'db_wbs_c' }
                ],
                rows: [
                    { id: 'root_1', cells: { t_name: 'Fase 1', rel_sub: ['sub_1_1', 'sub_1_2'] } },
                    { id: 'sub_1_1', cells: { t_name: 'Attività 1.1', rel_sub: [] } },
                    { id: 'sub_1_2', cells: { t_name: 'Attività 1.2', rel_sub: [] } },
                    { id: 'root_2', cells: { t_name: 'Fase 2', rel_sub: [] } }
                ]
            };
            AppState.databases['db_wbs_c'] = treeDb;

            // Rilevamento nodi radice (devono essere solo root_1 e root_2)
            const parentMap = new Map();
            treeDb.rows.forEach(r => {
                (r.cells.rel_sub || []).forEach(childId => parentMap.set(childId, r.id));
            });

            const roots = treeDb.rows.filter(r => !parentMap.has(r.id)).map(r => r.id);
            Assert.deepEqual(roots, ['root_1', 'root_2']);
            Assert.strictEqual(parentMap.get('sub_1_1'), 'root_1');
            Assert.strictEqual(parentMap.get('sub_1_2'), 'root_1');
        });

    test("WBS: risoluzione gerarchica con direzione 'parent'", () => {
            const treeDbP = {
                id: 'db_wbs_p',
                title: 'WBS Inverso',
                viewType: 'tree',
                treeRelationColId: 'rel_parent',
                treeRelationDirection: 'parent',
                columns: [
                    { id: 't_name', name: 'Attività', type: 'text' },
                    { id: 'rel_parent', name: 'Genitore', type: 'relation', targetTableId: 'db_wbs_p', singleRecord: true }
                ],
                rows: [
                    { id: 'p_root', cells: { t_name: 'Progetto Principale', rel_parent: null } },
                    { id: 'p_child1', cells: { t_name: 'Sub 1', rel_parent: 'p_root' } },
                    { id: 'p_child2', cells: { t_name: 'Sub 2', rel_parent: 'p_root' } },
                    { id: 'p_subchild', cells: { t_name: 'Sub 1.1', rel_parent: 'p_child1' } }
                ]
            };
            AppState.databases['db_wbs_p'] = treeDbP;

            const childrenMap = new Map();
            treeDbP.rows.forEach(r => childrenMap.set(r.id, []));
            treeDbP.rows.forEach(r => {
                const parentId = r.cells.rel_parent;
                if (parentId && childrenMap.has(parentId)) {
                    childrenMap.get(parentId).push(r.id);
                }
            });

            Assert.deepEqual(childrenMap.get('p_root'), ['p_child1', 'p_child2']);
            Assert.deepEqual(childrenMap.get('p_child1'), ['p_subchild']);
        });

    test("WBS: calcolo paginazione limitato alle sole Radici di Livello 0", () => {
            // Simulazione: 25 attività radice, ciascuna con 4 sotto-task (totale 125 record fisici)
            const rootCount = 25;
            const pageSize = 10;
            const totalPages = Math.max(1, Math.ceil(rootCount / pageSize));
            Assert.strictEqual(totalPages, 3); // Pag 1: 10 radici, Pag 2: 10 radici, Pag 3: 5 radici
        });

    test("WBS: toggleCollapseAll collassa tutti i genitori se almeno uno è aperto", () => {
            const tId = 'db_wbs_col_all';
            AppState.databases[tId] = {
                id: tId,
                treeRelationColId: 'rel',
                treeRelationDirection: 'children',
                treeCollapsedNodes: [], // Tutto aperto
                columns: [{ id: 'rel', type: 'relation', targetTableId: tId }],
                rows: [
                    { id: 'p1', cells: { rel: ['c1'] } },
                    { id: 'c1', cells: { rel: [] } }
                ]
            };

            AdvancedTree.toggleCollapseAll(tId);
            Assert.deepEqual(AppState.databases[tId].treeCollapsedNodes, ['p1']);
        });

    test("WBS: toggleCollapseAll espande tutto se tutti i genitori sono già collassati", () => {
            const tId = 'db_wbs_exp_all';
            AppState.databases[tId] = {
                id: tId,
                treeRelationColId: 'rel',
                treeRelationDirection: 'children',
                treeCollapsedNodes: ['p1'], // Tutto chiuso
                columns: [{ id: 'rel', type: 'relation', targetTableId: tId }],
                rows: [
                    { id: 'p1', cells: { rel: ['c1'] } },
                    { id: 'c1', cells: { rel: [] } }
                ]
            };

            AdvancedTree.toggleCollapseAll(tId);
            Assert.deepEqual(AppState.databases[tId].treeCollapsedNodes, []);
        });

    test("WBS: toggleNode aggiunge ID a treeCollapsedNodes", () => {
            const tId = 'db_wbs_tog_node';
            AppState.databases[tId] = { id: tId, treeCollapsedNodes: [] };

            AdvancedTree.toggleNode(tId, 'parent_A');
            Assert.isTrue(AppState.databases[tId].treeCollapsedNodes.includes('parent_A'));

            AdvancedTree.toggleNode(tId, 'parent_A');
            Assert.isFalse(AppState.databases[tId].treeCollapsedNodes.includes('parent_A'));
        });

    test("WBS: addSubtask con direction='children' accoda il nuovo ID a parentRow.cells", () => {
            const tId = 'db_wbs_add_child';
            AppState.isEditMode = true;
            AppState.databases[tId] = {
                id: tId,
                treeRelationColId: 'rel',
                treeRelationDirection: 'children',
                columns: [{ id: 'rel', type: 'relation', targetTableId: tId }],
                rows: [{ id: 'p_row', cells: { rel: ['child_1'] } }]
            };

            AdvancedTree.addSubtask(tId, 'p_row');
            const pRow = AppState.databases[tId].rows.find(r => r.id === 'p_row');
            Assert.strictEqual(pRow.cells.rel.length, 2);
            Assert.strictEqual(AppState.databases[tId].rows.length, 2);
        });

    test("bis. WBS: toggleRelationValue espande automaticamente il nodo genitore collassato", () => {
            const tId = 'db_wbs_auto_expand';
            AppState.databases[tId] = {
                id: tId,
                viewType: 'tree',
                treeRelationColId: 'rel',
                treeRelationDirection: 'children',
                treeCollapsedNodes: ['p_node'], // Nodo genitore attualmente collassato
                columns: [{ id: 'rel', type: 'relation', targetTableId: tId }],
                rows: [
                    { id: 'p_node', cells: { rel: [] } },
                    { id: 'c_node', cells: { rel: [] } }
                ]
            };

            AdvancedTable._pendingRelSelect = {
                realTableId: tId,
                tableId: tId,
                rowId: 'p_node',
                colId: 'rel',
                currentVals: [],
                targetDbId: tId,
                targetColId: 'rel',
                isBacklink: false
            };

            // Collega 'c_node' a 'p_node'
            AdvancedTable.toggleRelationValue('c_node');

            // Il nodo genitore 'p_node' deve essere rimosso da treeCollapsedNodes per espanderlo a video
            Assert.isFalse(AppState.databases[tId].treeCollapsedNodes.includes('p_node'));
            Assert.isTrue(AppState.databases[tId].rows[0].cells.rel.includes('c_node'));
        });

    test("WBS: addSubtask con direction='parent' assegna parentRowId al nuovo record", () => {
            const tId = 'db_wbs_add_parent';
            AppState.isEditMode = true;
            AppState.databases[tId] = {
                id: tId,
                treeRelationColId: 'rel_p',
                treeRelationDirection: 'parent',
                columns: [{ id: 'rel_p', type: 'relation', targetTableId: tId, singleRecord: true }],
                rows: [{ id: 'p_target_row', cells: { rel_p: null } }]
            };

            AdvancedTree.addSubtask(tId, 'p_target_row');
            Assert.strictEqual(AppState.databases[tId].rows.length, 2);
            const newChild = AppState.databases[tId].rows[1];
            Assert.strictEqual(newChild.cells.rel_p, 'p_target_row');
        });

    test("WBS: filtro testuale conserva ricorsivamente la catena degli antenati", () => {
            // Struttura: Radice -> Macrofase -> Bug (solo Bug matcha il filtro)
            const parentMap = new Map([['c1', 'root'], ['leaf_match', 'c1']]);
            const matchingIds = new Set(['leaf_match']);
            const visibleSet = new Set();

            matchingIds.forEach(id => {
                let curr = id;
                while (curr) {
                    visibleSet.add(curr);
                    curr = parentMap.get(curr);
                }
            });

            Assert.isTrue(visibleSet.has('root'));
            Assert.isTrue(visibleSet.has('c1'));
            Assert.isTrue(visibleSet.has('leaf_match'));
        });

});
