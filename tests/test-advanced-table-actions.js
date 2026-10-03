/**
 * tests/test-advanced-table-actions.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-actions
 * Conteggio test case: 26
 * Generato automaticamente il: 2026-09-30 23:55:00
 */

describe("AdvancedTable Actions: Circolarità Grafo, Drag Colonne, Rollup & Resizing (26 Test)", () => {

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

    // =========================================================================
    // NUOVI TEST CASE: ROLLUP SCHEMA VALIDATION, ACTIONS & LIFECYCLE
    // =========================================================================

    test("Rollup Schema: saveRollupConfig blocca dipendenza circolare diretta tra rollup speculari", () => {
        const dbA_id = 'db_roll_a';
        const dbB_id = 'db_roll_b';

        // DB B ha già un rollup che punta a DB A colonna 'col_a_roll'
        AppState.databases[dbB_id] = {
            id: dbB_id,
            title: 'Tabella B',
            columns: [
                { id: 'b_rel_a', name: 'Rel_A', type: 'relation', targetTableId: dbA_id },
                { id: 'b_roll_a', name: 'Rollup_Su_A', type: 'rollup', relationColId: 'b_rel_a', targetTableId: dbA_id, targetColId: 'col_a_roll' }
            ],
            rows: []
        };

        // DB A sta tentando di configurare 'col_a_roll' come Rollup che punta a DB B colonna 'b_roll_a' (Ciclo Diretto)
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

    test("Database Title: updateTitle aggiorna il nome e propaga modifiche a formule cross-db tabella[...]", () => {
        const dbSrc = 'db_title_src';
        const dbFormula = 'db_title_formula';

        AppState.databases[dbSrc] = {
            id: dbSrc,
            title: 'Magazzino',
            columns: [{ id: 'c1', name: 'Qta', type: 'number' }],
            rows: []
        };

        AppState.databases[dbFormula] = {
            id: dbFormula,
            title: 'Report',
            columns: [
                { id: 'f1', name: 'Calcolo', type: 'formula', formula: 'SOMMA(tabella["Magazzino"], "Qta")' }
            ],
            rows: []
        };

        AdvancedTable.updateTitle(dbSrc, 'Magazzino Centrale');

        Assert.strictEqual(AppState.databases[dbSrc].title, 'Magazzino Centrale');
        const updatedFormula = AppState.databases[dbFormula].columns[0].formula;
        Assert.isTrue(updatedFormula.includes('tabella["Magazzino Centrale"]'), "La formula deve contenere il nuovo titolo del DB");
    });

    test("Database Title: updateTitle risolve collisioni aggiungendo contatore progressivo (1), (2)", () => {
        AppState.databases['db_coll_1'] = { id: 'db_coll_1', title: 'Clienti' };
        AppState.databases['db_coll_2'] = { id: 'db_coll_2', title: 'Altro' };

        AdvancedTable.updateTitle('db_coll_2', 'Clienti');
        Assert.strictEqual(AppState.databases['db_coll_2'].title, 'Clienti (1)');

        AppState.databases['db_coll_3'] = { id: 'db_coll_3', title: 'Terzo' };
        AdvancedTable.updateTitle('db_coll_3', 'Clienti');
        Assert.strictEqual(AppState.databases['db_coll_3'].title, 'Clienti (2)');
    });

    test("Colonne: onColDrop riordina le colonne inserendo la sorgente a sinistra del target conforme a borderLeft", () => {
        const dbId = 'db_drop_cols';
        AppState.databases[dbId] = {
            id: dbId,
            columns: [
                { id: 'col_A', name: 'A' },
                { id: 'col_B', name: 'B' },
                { id: 'col_C', name: 'C' }
            ],
            rows: []
        };

        const fakeEvent = {
            preventDefault: () => {},
            stopPropagation: () => {}
        };

        // 1. Spostamento verso destra: trasciniamo col_A sul target col_C.
        // Conforme al borderLeft dell'interfaccia, col_A viene posizionata subito prima (a sinistra) di col_C.
        AdvancedTable.draggedColId = 'col_A';
        AdvancedTable.onColDrop(fakeEvent, dbId, 'col_C');

        let colIds = AppState.databases[dbId].columns.map(c => c.id);
        Assert.deepEqual(colIds, ['col_B', 'col_A', 'col_C']);

        // 2. Spostamento verso sinistra: trasciniamo col_C (in fondo) sul target col_B (in testa).
        // Viene posizionata prima di col_B.
        AdvancedTable.draggedColId = 'col_C';
        AdvancedTable.onColDrop(fakeEvent, dbId, 'col_B');

        colIds = AppState.databases[dbId].columns.map(c => c.id);
        Assert.deepEqual(colIds, ['col_C', 'col_B', 'col_A']);
    });

    test("Relazioni: unlinkRelation rimuove il record collegato sia in relazione diretta che in backlink inverso", () => {
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

    test("FreeWidth: toggleFreeWidth inverte il booleano di larghezza libera", () => {
        const dbFw = 'db_fw_toggle';
        AppState.databases[dbFw] = { id: dbFw, freeWidth: false, rows: [], columns: [] };

        AdvancedTable.toggleFreeWidth(dbFw);
        Assert.strictEqual(AppState.databases[dbFw].freeWidth, true);

        AdvancedTable.toggleFreeWidth(dbFw);
        Assert.strictEqual(AppState.databases[dbFw].freeWidth, false);
    });

    test("Delete Table: deleteTable blocca la cancellazione se il DB è puntato da relazioni in altri DB", () => {
        AppState.databases['db_blocked_target'] = {
            id: 'db_blocked_target',
            title: 'Fornitori',
            columns: [{ id: 'c_name', name: 'Nome' }],
            rows: []
        };

        AppState.databases['db_pointing'] = {
            id: 'db_pointing',
            title: 'Ordini Acquisto',
            columns: [{ id: 'c_supp', type: 'relation', targetTableId: 'db_blocked_target' }],
            rows: []
        };

        let alertMsg = '';
        const origAlert = window.alert;
        window.alert = (msg) => { alertMsg = msg; };

        try {
            AdvancedTable.deleteTable('db_blocked_target');
            Assert.isTrue(alertMsg.includes('IMPOSSIBILE ELIMINARE'), "La cancellazione di un DB puntato da relazioni esterne deve essere respinta");
            Assert.isTrue(!!AppState.databases['db_blocked_target'], "Il database target deve rimanere integro");
        } finally {
            window.alert = origAlert;
        }
    });

    test("Delete Table: deleteTable esegue soft delete su SYS_PROPERTIES_DB mantenendo i dati integri", () => {
        AppState.databases['SYS_PROPERTIES_DB'] = {
            id: 'SYS_PROPERTIES_DB',
            title: 'Proprietà e Tag di Pagina',
            columns: [{ id: 'sys_c_note' }],
            rows: [{ id: 'r1', cells: { sys_c_note: 'n1' } }]
        };

        AdvancedTable.deleteTable('SYS_PROPERTIES_DB');

        Assert.isTrue(!!AppState.databases['SYS_PROPERTIES_DB'], "SYS_PROPERTIES_DB non deve essere eliminato da AppState.databases");
        Assert.strictEqual(AppState.databases['SYS_PROPERTIES_DB'].rows.length, 1);
    });

    test("Delete Table: deleteTable su vista collegata rimuove solo la vista lasciando intatto il DB originale", () => {
        AppState.databases['db_orig_real'] = {
            id: 'db_orig_real',
            title: 'Database Reale',
            columns: [{ id: 'c1', name: 'Nome' }],
            rows: [{ id: 'r1', cells: { c1: 'Dato' } }]
        };

        AppState.databases['adv_link_view1'] = {
            id: 'adv_link_view1',
            isLinkedView: true,
            sourceTableId: 'db_orig_real'
        };

        const origConfirm = window.confirm;
        window.confirm = () => true;

        try {
            AdvancedTable.deleteTable('adv_link_view1');
            Assert.isFalse(!!AppState.databases['adv_link_view1'], "La vista collegata deve essere rimossa");
            Assert.isTrue(!!AppState.databases['db_orig_real'], "Il database originale deve rimanere integro e intatto");
            Assert.strictEqual(AppState.databases['db_orig_real'].rows.length, 1);
        } finally {
            window.confirm = origConfirm;
        }
    });

});