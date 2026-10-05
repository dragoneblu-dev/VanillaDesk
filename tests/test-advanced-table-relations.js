/**
 * tests/test-advanced-table-relations.js
 * Suite di Collaudo Unitario per Relazioni, Rollup, Grafo Circolare e WBS.
 * Modulo testato: js/AdvancedTable/advanced-table-relations.js
 * Conteggio test case: 18
 */

describe("AdvancedTable Relations: Grafo Circolare, Rollup, Backlink e WBS (18 Test)", () => {


    test("Timeline Drag: createDependency rispetta la colonna auto-referenziale esatta", () => {
        const dbTl = {
            id: 'db_tl_cycle',
            columns: [
                { id: 'c_gantt_dep', name: 'Dipendenza', type: 'relation', targetTableId: 'db_tl_cycle' }
            ],
            rows: [
                { id: 'task_1', cells: { c_gantt_dep: ['task_2'] } },
                { id: 'task_2', cells: { c_gantt_dep: [] } }
            ]
        };
        AppState.databases['db_tl_cycle'] = dbTl;

        const isCycle = AdvancedTable.checkCircularRelation('db_tl_cycle', 'task_2', 'db_tl_cycle', 'task_1', 'c_gantt_dep');
        Assert.isTrue(isCycle);
    });
    
    test("Circolarità: auto-riferimento diretto (Task 1 -> Task 1)", () => {
        AppState.databases['db_cycle'] = {
            id: 'db_cycle',
            columns: [{ id: 'p_rel', name: 'Padre', type: 'relation', targetTableId: 'db_cycle' }],
            rows: [{ id: 't1', cells: { p_rel: [] } }]
        };
        Assert.isTrue(AdvancedTable.checkCircularRelation('db_cycle', 't1', 'db_cycle', 't1'));
    });

    test("Circolarità: ciclo a 2 stadi (A -> B -> A)", () => {
        AppState.databases['db_cycle'].rows = [
            { id: 't1', cells: { p_rel: ['t2'] } },
            { id: 't2', cells: { p_rel: [] } }
        ];
        Assert.isTrue(AdvancedTable.checkCircularRelation('db_cycle', 't2', 'db_cycle', 't1'));
    });

    test("Circolarità: ciclo profondo a 4 stadi (A -> B -> C -> D -> A)", () => {
        AppState.databases['db_cycle'].rows = [
            { id: 't1', cells: { p_rel: ['t2'] } },
            { id: 't2', cells: { p_rel: ['t3'] } },
            { id: 't3', cells: { p_rel: ['t4'] } },
            { id: 't4', cells: { p_rel: [] } }
        ];
        Assert.isTrue(AdvancedTable.checkCircularRelation('db_cycle', 't4', 'db_cycle', 't1'));
    });

    test("Circolarità: connessione legittima in un grafo ad albero aciclico", () => {
        AppState.databases['db_cycle'].rows.push({ id: 't5', cells: { p_rel: [] } });
        Assert.isFalse(AdvancedTable.checkCircularRelation('db_cycle', 't5', 'db_cycle', 't3'));
    });

    test("Circolarità: auto-riferimento riflessivo diretto (A -> A) viene sempre bloccato", () => {
        AppState.databases['db_multi_rel'] = {
            id: 'db_multi_rel',
            columns: [
                { id: 'c_padre', name: 'Padre', type: 'relation', targetTableId: 'db_multi_rel' },
                { id: 'c_figlio', name: 'Figlio', type: 'relation', targetTableId: 'db_multi_rel' }
            ],
            rows: [{ id: 'rec_1', cells: { c_padre: [], c_figlio: [] } }]
        };
        Assert.isTrue(AdvancedTable.checkCircularRelation('db_multi_rel', 'rec_1', 'db_multi_rel', 'rec_1', 'c_padre'));
        Assert.isTrue(AdvancedTable.checkCircularRelation('db_multi_rel', 'rec_1', 'db_multi_rel', 'rec_1', 'c_figlio'));
    });

    test("Circolarità: relazioni inverse 'Padre' e 'Figlio' sullo stesso DB non generano falsi positivi", () => {
        AppState.databases['db_multi_rel'].rows = [
            { id: 'rec_A', cells: { c_padre: [], c_figlio: ['rec_B'] } },
            { id: 'rec_B', cells: { c_padre: [], c_figlio: [] } }
        ];

        const isBlocked = AdvancedTable.checkCircularRelation('db_multi_rel', 'rec_B', 'db_multi_rel', 'rec_A', 'c_padre');
        Assert.isFalse(isBlocked, "Relazioni inverse su campi distinti non devono essere scambiate per cicli");
    });

    test("Circolarità: ciclo reale lungo la STESSA colonna (A -> B -> A su 'Padre') viene intercettato", () => {
        AppState.databases['db_multi_rel'].rows = [
            { id: 'rec_A', cells: { c_padre: ['rec_B'], c_figlio: [] } },
            { id: 'rec_B', cells: { c_padre: [], c_figlio: [] } }
        ];

        const isLoop = AdvancedTable.checkCircularRelation('db_multi_rel', 'rec_B', 'db_multi_rel', 'rec_A', 'c_padre');
        Assert.isTrue(isLoop, "Un ciclo chiuso lungo la stessa colonna relazionale deve essere bloccato");
    });

    test("Circolarità: ciclo reale lungo la STESSA colonna (A -> B -> C -> A su 'Figlio') viene intercettato", () => {
        AppState.databases['db_multi_rel'].rows = [
            { id: 'rec_1', cells: { c_padre: [], c_figlio: ['rec_2'] } },
            { id: 'rec_2', cells: { c_padre: [], c_figlio: ['rec_3'] } },
            { id: 'rec_3', cells: { c_padre: [], c_figlio: [] } }
        ];

        const isLoop = AdvancedTable.checkCircularRelation('db_multi_rel', 'rec_3', 'db_multi_rel', 'rec_1', 'c_figlio');
        Assert.isTrue(isLoop);
    });

    test("Circolarità: collegamenti ortogonali indipendenti nello stesso DB (Supervisore vs Sostituto)", () => {
        const dbHR = {
            id: 'db_hr',
            columns: [
                { id: 'c_boss', name: 'Supervisore', type: 'relation', targetTableId: 'db_hr' },
                { id: 'c_sub', name: 'Sostituto', type: 'relation', targetTableId: 'db_hr' }
            ],
            rows: [
                { id: 'emp_A', cells: { c_boss: [], c_sub: ['emp_B'] } },
                { id: 'emp_B', cells: { c_boss: [], c_sub: [] } }
            ]
        };
        AppState.databases['db_hr'] = dbHR;

        const isBlocked = AdvancedTable.checkCircularRelation('db_hr', 'emp_B', 'db_hr', 'emp_A', 'c_boss');
        Assert.isFalse(isBlocked);
    });

    test("Circolarità: relazioni bidirezionali tra DB DIVERSI non vengono bloccate", () => {
        AppState.databases['db_companies'] = {
            id: 'db_companies',
            columns: [{ id: 'c_emps', name: 'Dipendenti', type: 'relation', targetTableId: 'db_people' }],
            rows: [{ id: 'comp_1', cells: { c_emps: ['person_1'] } }]
        };
        AppState.databases['db_people'] = {
            id: 'db_people',
            columns: [{ id: 'c_employer', name: 'Datore', type: 'relation', targetTableId: 'db_companies' }],
            rows: [{ id: 'person_1', cells: { c_employer: [] } }]
        };

        const isBlocked = AdvancedTable.checkCircularRelation('db_people', 'person_1', 'db_companies', 'comp_1', 'c_employer');
        Assert.isFalse(isBlocked, "Relazioni tra database diversi non devono produrre falsi positivi di circolarità");
    });

    test("Circolarità: fallback di sicurezza se colId non viene fornito", () => {
        Assert.isTrue(AdvancedTable.checkCircularRelation('db_any', 'row_1', 'db_any', 'row_1', null));
    });

    test("Auto-relazione: isolamento del grafo quando una riga ha collegamenti nulli o non-array", () => {
        const dbSafe = {
            id: 'db_safe',
            columns: [{ id: 'rel', type: 'relation', targetTableId: 'db_safe' }],
            rows: [
                { id: 'r1', cells: { rel: null } },
                { id: 'r2', cells: { rel: 'stringa_singola_malformata' } }
            ]
        };
        AppState.databases['db_safe'] = dbSafe;

        Assert.doesNotThrow(() => {
            AdvancedTable.checkCircularRelation('db_safe', 'r1', 'db_safe', 'r2', 'rel');
        });
    });

    test("Rollup Schema: saveRollupConfig blocca dipendenza circolare diretta tra rollup speculari", () => {
        const dbA_id = 'db_roll_a';
        const dbB_id = 'db_roll_b';

        AppState.databases[dbB_id] = {
            id: dbB_id,
            title: 'Tabella B',
            columns: [
                { id: 'b_rel_a', name: 'Rel_A', type: 'relation', targetTableId: dbA_id },
                { id: 'b_roll_a', name: 'Rollup_Su_A', type: 'rollup', relationColId: 'b_rel_a', targetTableId: dbA_id, targetColId: 'col_a_roll' }
            ],
            rows: []
        };

        AppState.databases[dbA_id] = {
            id: dbA_id,
            title: 'Tabella A',
            columns: [
                { id: 'a_rel_b', name: 'Rel_B', type: 'relation', targetTableId: dbB_id },
                { id: 'col_a_roll', name: 'Rollup_Su_B', type: 'text' }
            ],
            rows: []
        };

        let selRel = document.getElementById('rollupConfigRel');
        let selTgt = document.getElementById('rollupConfigTarget');
        if (!selRel) {
            selRel = document.createElement('select');
            selRel.id = 'rollupConfigRel';
            document.body.appendChild(selRel);
        }
        if (!selTgt) {
            selTgt = document.createElement('select');
            selTgt.id = 'rollupConfigTarget';
            document.body.appendChild(selTgt);
        }

        selRel.innerHTML = `<option value="a_rel_b" selected>Rel_B</option>`;
        selTgt.innerHTML = `<option value="b_roll_a" selected>Rollup_Su_A</option>`;

        AdvancedTable._pendingRollupConfig = {
            realTableId: dbA_id,
            colId: 'col_a_roll'
        };

        let alertTriggered = false;
        const origAlert = window.alert;
        window.alert = () => { alertTriggered = true; };

        try {
            AdvancedTable.saveRollupConfig();
            Assert.isTrue(alertTriggered, "Deve scattare l'alert di blocco della dipendenza circolare diretta");
            Assert.strictEqual(AppState.databases[dbA_id].columns[1].type, 'text');
        } finally {
            window.alert = origAlert;
            if (selRel) selRel.remove();
            if (selTgt) selTgt.remove();
        }
    });

    test("Rollup Schema: saveRollupConfig consente configurazione rollup legittima non circolare", () => {
        const dbA_id = 'db_legit_a';
        const dbB_id = 'db_legit_b';

        AppState.databases[dbB_id] = {
            id: dbB_id,
            title: 'Prodotti',
            columns: [{ id: 'p_costo', name: 'Costo', type: 'number' }],
            rows: []
        };

        AppState.databases[dbA_id] = {
            id: dbA_id,
            title: 'Ordini',
            columns: [
                { id: 'o_rel_p', name: 'Prodotto', type: 'relation', targetTableId: dbB_id },
                { id: 'o_roll_costo', name: 'Costo Prodotto', type: 'text' }
            ],
            rows: [{ id: 'r1', cells: { o_rel_p: [], o_roll_costo: 'vecchio testo' } }]
        };

        let selRel = document.createElement('select');
        selRel.id = 'rollupConfigRel';
        selRel.innerHTML = `<option value="o_rel_p" selected>Prodotto</option>`;
        document.body.appendChild(selRel);

        let selTgt = document.createElement('select');
        selTgt.id = 'rollupConfigTarget';
        selTgt.innerHTML = `<option value="p_costo" selected>Costo</option>`;
        document.body.appendChild(selTgt);

        AdvancedTable._pendingRollupConfig = {
            realTableId: dbA_id,
            colId: 'o_roll_costo'
        };

        try {
            AdvancedTable.saveRollupConfig();
            const updatedCol = AppState.databases[dbA_id].columns.find(c => c.id === 'o_roll_costo');
            Assert.strictEqual(updatedCol.type, 'rollup');
            Assert.strictEqual(updatedCol.targetColId, 'p_costo');
            Assert.strictEqual(updatedCol.rollupDirection, 'outgoing');
            Assert.strictEqual(AppState.databases[dbA_id].rows[0].cells['o_roll_costo'], '');
        } finally {
            selRel.remove();
            selTgt.remove();
        }
    });

    test("Rollup Schema: saveRollupConfig configura correttamente un rollup 'incoming' (entrante)", () => {
        const dbCustomers = 'db_cust_inc';
        const dbInvoices = 'db_inv_inc';

        AppState.databases[dbInvoices] = {
            id: dbInvoices,
            title: 'Fatture',
            columns: [
                { id: 'f_cli', name: 'Cliente', type: 'relation', targetTableId: dbCustomers },
                { id: 'f_tot', name: 'Totale', type: 'number' }
            ],
            rows: []
        };

        AppState.databases[dbCustomers] = {
            id: dbCustomers,
            title: 'Clienti',
            columns: [
                { id: 'c_name', name: 'Nome', type: 'text' },
                { id: 'c_roll_tot', name: 'Totale Speso', type: 'text' }
            ],
            rows: [{ id: 'cli_1', cells: { c_name: 'Acme', c_roll_tot: '' } }]
        };

        let selRel = document.createElement('select');
        selRel.id = 'rollupConfigRel';
        selRel.innerHTML = `<option value="INCOMING:${dbInvoices}:f_cli" selected>Entrante</option>`;
        document.body.appendChild(selRel);

        let selTgt = document.createElement('select');
        selTgt.id = 'rollupConfigTarget';
        selTgt.innerHTML = `<option value="f_tot" selected>Totale</option>`;
        document.body.appendChild(selTgt);

        AdvancedTable._pendingRollupConfig = {
            realTableId: dbCustomers,
            colId: 'c_roll_tot'
        };

        try {
            AdvancedTable.saveRollupConfig();
            const colDef = AppState.databases[dbCustomers].columns.find(c => c.id === 'c_roll_tot');
            Assert.strictEqual(colDef.type, 'rollup');
            Assert.strictEqual(colDef.rollupDirection, 'incoming');
            Assert.strictEqual(colDef.targetTableId, dbInvoices);
            Assert.strictEqual(colDef.foreignRelColId, 'f_cli');
            Assert.strictEqual(colDef.targetColId, 'f_tot');
        } finally {
            selRel.remove();
            selTgt.remove();
        }
    });

    test("Relazioni: unlinkRelation rimuove il record collegato sia in relazione diretta che in backlink", () => {
        const dbSource = 'db_unl_src';
        const dbTarget = 'db_unl_tgt';

        AppState.databases[dbSource] = {
            id: dbSource,
            columns: [{ id: 'rel_out', type: 'relation', targetTableId: dbTarget }],
            rows: [{ id: 's_row1', cells: { rel_out: ['t_row1', 't_row2'] } }]
        };

        AppState.databases[dbTarget] = {
            id: dbTarget,
            columns: [{ id: 'rel_in', type: 'relation_backlink', linkedTableId: dbSource, linkedColId: 'rel_out' }],
            rows: [{ id: 't_row1', cells: { rel_in: [] } }]
        };

        // 1. Scollegamento Diretto
        AdvancedTable.unlinkRelation(dbSource, 's_row1', 'rel_out', 't_row1', false);
        Assert.deepEqual(AppState.databases[dbSource].rows[0].cells.rel_out, ['t_row2']);

        // 2. Scollegamento da Backlink
        AppState.databases[dbSource].rows[0].cells.rel_out = ['t_row2'];
        AdvancedTable.unlinkRelation(dbTarget, 't_row2', 'rel_in', 's_row1', true);
        Assert.deepEqual(AppState.databases[dbSource].rows[0].cells.rel_out, []);
    });

    test("WBS Auto-Expand: toggleRelationValue espande automaticamente il nodo genitore nella vista ad albero WBS", () => {
        const dbTree = 'db_tree_auto_expand';
        AppState.databases[dbTree] = {
            id: dbTree,
            viewType: 'tree',
            treeRelationColId: 'c_tree_rel',
            treeRelationDirection: 'children',
            treeCollapsedNodes: ['node_parent_1'],
            columns: [{ id: 'c_tree_rel', type: 'relation', targetTableId: dbTree }],
            rows: [
                { id: 'node_parent_1', cells: { c_tree_rel: [] } },
                { id: 'node_child_2', cells: { c_tree_rel: [] } }
            ]
        };

        AdvancedTable._pendingRelSelect = {
            realTableId: dbTree,
            tableId: dbTree,
            rowId: 'node_parent_1',
            colId: 'c_tree_rel',
            currentVals: [],
            targetDbId: dbTree,
            targetColId: 'c_tree_rel',
            isBacklink: false
        };

        AdvancedTable.toggleRelationValue('node_child_2');

        const state = AppState.databases[dbTree];
        Assert.isTrue(state.rows[0].cells.c_tree_rel.includes('node_child_2'));
        Assert.isFalse(state.treeCollapsedNodes.includes('node_parent_1'), "Il nodo genitore deve essere stato auto-espanso");
    });

    test("Relazioni: saveRelationConfig azzera celle se il target cambia e pulisce vecchi backlink", () => {
        const dbSrc = 'db_rel_change_src';
        const dbTgtOld = 'db_rel_change_old';
        const dbTgtNew = 'db_rel_change_new';

        AppState.databases[dbTgtOld] = {
            id: dbTgtOld,
            columns: [{ id: 'bl_old', type: 'relation_backlink' }],
            rows: []
        };
        AppState.databases[dbTgtNew] = {
            id: dbTgtNew,
            columns: [{ id: 'col_name', name: 'Nome', type: 'text' }],
            rows: []
        };
        AppState.databases[dbSrc] = {
            id: dbSrc,
            columns: [{
                id: 'rel_col',
                type: 'relation',
                targetTableId: dbTgtOld,
                showBacklink: true,
                backlinkColId: 'bl_old'
            }],
            rows: [{ id: 'r1', cells: { rel_col: ['old_id'] } }]
        };

        let selTable = document.createElement('select');
        selTable.id = 'relConfigTable';
        selTable.innerHTML = `<option value="${dbTgtNew}" selected>New DB</option>`;
        document.body.appendChild(selTable);

        let selCol = document.createElement('select');
        selCol.id = 'relConfigCol';
        selCol.innerHTML = `<option value="col_name" selected>Nome</option>`;
        document.body.appendChild(selCol);

        AdvancedTable._pendingRelConfig = { realTableId: dbSrc, colId: 'rel_col' };

        try {
            AdvancedTable.saveRelationConfig();
            const col = AppState.databases[dbSrc].columns[0];
            Assert.strictEqual(col.targetTableId, dbTgtNew);
            Assert.strictEqual(col.showBacklink, undefined);
            Assert.deepEqual(AppState.databases[dbSrc].rows[0].cells.rel_col, [], "I vecchi ID associati al precedente database devono essere azzerati");
            Assert.strictEqual(AppState.databases[dbTgtOld].columns.length, 0, "Il vecchio backlink nel target precedente deve essere rimosso");
        } finally {
            selTable.remove();
            selCol.remove();
        }
    });

});