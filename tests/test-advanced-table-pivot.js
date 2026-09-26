/**
 * tests/test-advanced-table-pivot.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-pivot
 * Conteggio test case: 17
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Pivot: Aggregazioni Multi-Group, Somme & Medie (17 Test)", () => {

    test("Pivot: aggregazione matematica multipla (sum, avg, count, min, max)", () => {
            const sourceDb = {
                id: 'db_sales_src',
                title: 'Vendite',
                columns: [
                    { id: 'c_reg', name: 'Regione', type: 'text' },
                    { id: 'c_imp', name: 'Importo', type: 'number' }
                ],
                rows: [
                    { id: 'r1', cells: { c_reg: 'Nord', c_imp: 100 } },
                    { id: 'r2', cells: { c_reg: 'Nord', c_imp: 200 } },
                    { id: 'r3', cells: { c_reg: 'Sud', c_imp: 50 } },
                    { id: 'r4', cells: { c_reg: 'Nord', c_imp: 300 } }
                ]
            };
            AppState.databases['db_sales_src'] = sourceDb;

            const pivotDb = {
                id: 'pivot_sales',
                isPivot: true,
                sourceTableId: 'db_sales_src',
                groupBy: ['c_reg'],
                aggregations: [
                    { type: 'count', sourceColId: 'c_reg', label: 'N. Vendite' },
                    { type: 'sum', sourceColId: 'c_imp', label: 'Totale' },
                    { type: 'avg', sourceColId: 'c_imp', label: 'Media' },
                    { type: 'max', sourceColId: 'c_imp', label: 'Massimo' },
                    { type: 'min', sourceColId: 'c_imp', label: 'Minimo' }
                ],
                columns: [
                    { id: 'grp_0', name: 'Regione', type: 'text' },
                    { id: 'agg_0', name: 'N. Vendite', type: 'number' },
                    { id: 'agg_1', name: 'Totale', type: 'number' },
                    { id: 'agg_2', name: 'Media', type: 'number' },
                    { id: 'agg_3', name: 'Massimo', type: 'number' },
                    { id: 'agg_4', name: 'Minimo', type: 'number' }
                ],
                filters: {},
                sorts: []
            };
            AppState.databases['pivot_sales'] = pivotDb;

            const result = AdvancedPivot.buildPivotData('pivot_sales');
            Assert.strictEqual(result.pivotRows.length, 2); // 'Nord' e 'Sud'

            const nordRow = result.pivotRows.find(r => r.virtualCells.grp_0 === 'Nord');
            Assert.strictEqual(Number(nordRow.virtualCells.agg_0), 3); // 3 vendite
            Assert.strictEqual(Number(nordRow.virtualCells.agg_1), 600); // 100+200+300
            Assert.strictEqual(Number(nordRow.virtualCells.agg_2), 200); // 600/3
            Assert.strictEqual(Number(nordRow.virtualCells.agg_3), 300); // Max
            Assert.strictEqual(Number(nordRow.virtualCells.agg_4), 100); // Min

            const sudRow = result.pivotRows.find(r => r.virtualCells.grp_0 === 'Sud');
            Assert.strictEqual(Number(sudRow.virtualCells.agg_1), 50);
        });

    test("Pivot: aggregazione lista testuale distinct (unione stringhe univoche)", () => {
            const sourceDb = {
                id: 'db_tasks_src',
                title: 'Task Tracker',
                columns: [
                    { id: 't_cat', name: 'Categoria', type: 'text' },
                    { id: 't_user', name: 'Assegnato', type: 'text' }
                ],
                rows: [
                    { id: 'r1', cells: { t_cat: 'Bug', t_user: 'Mario' } },
                    { id: 'r2', cells: { t_cat: 'Bug', t_user: 'Luigi' } },
                    { id: 'r3', cells: { t_cat: 'Bug', t_user: 'Mario' } } // Mario duplicato
                ]
            };
            AppState.databases['db_tasks_src'] = sourceDb;

            const pivotDb = {
                id: 'pivot_tasks',
                isPivot: true,
                sourceTableId: 'db_tasks_src',
                groupBy: ['t_cat'],
                aggregations: [{ type: 'list', sourceColId: 't_user', label: 'Team' }],
                columns: [
                    { id: 'grp_0', name: 'Categoria', type: 'text' },
                    { id: 'agg_0', name: 'Team', type: 'text' }
                ],
                filters: {},
                sorts: []
            };
            AppState.databases['pivot_tasks'] = pivotDb;

            const result = AdvancedPivot.buildPivotData('pivot_tasks');
            const rowBug = result.pivotRows.find(r => r.virtualCells.grp_0 === 'Bug');
            Assert.strictEqual(rowBug.virtualCells.agg_0, 'Mario, Luigi');
        });

    test("Garbage Collector: preserva i database sorgente nascosti referenziati da viste Pivot", () => {
            // Riutilizza in modo trasparente l'elemento #noteContent preesistente nel sandbox senza creare collisioni di ID
            let editor = document.getElementById('noteContent');
            let createdLocally = false;
            if (!editor) {
                editor = document.createElement('div');
                editor.id = 'noteContent';
                document.body.appendChild(editor);
                createdLocally = true;
            }
            const origContent = editor.innerHTML;
            editor.innerHTML = '<div id="adv_pivot_summary" class="adv-widget-shell widget-type-pivot"></div>';

            AppState.notes = [];
            AppState.databases = {
                'adv_pivot_summary': {
                    id: 'adv_pivot_summary',
                    isPivot: true,
                    sourceTableId: 'adv_tbl_hidden_source', // Dipendenza transitiva
                    columns: []
                },
                'adv_tbl_hidden_source': {
                    id: 'adv_tbl_hidden_source',
                    title: 'Dati Grezzi Origine',
                    columns: [],
                    rows: []
                },
                'adv_tbl_zombie': {
                    id: 'adv_tbl_zombie',
                    title: 'Database Realmente Orfano',
                    columns: [],
                    rows: []
                }
            };

            try {
                Editor.cleanOrphanedCaches();

                Assert.isTrue('adv_pivot_summary' in AppState.databases, "La tabella Pivot visualizzata deve essere preservata");
                Assert.isTrue('adv_tbl_hidden_source' in AppState.databases, "Il database sorgente della Pivot deve essere preservato per dipendenza transitiva");
                Assert.isFalse('adv_tbl_zombie' in AppState.databases, "I database realmente orfani devono essere eliminati");
            } finally {
                editor.innerHTML = origContent;
                if (createdLocally) editor.remove();
            }
        });

    test("Pivot: raggruppamento su colonna con valori vuoti assegna etichetta '(Vuoto)'", () => {
            const srcId = 'db_piv_empty_src';
            AppState.databases[srcId] = {
                id: srcId,
                title: 'Sorgente',
                columns: [
                    { id: 'c_grp', name: 'Gruppo', type: 'text' },
                    { id: 'c_num', name: 'Valore', type: 'number' }
                ],
                rows: [
                    { id: 'r1', cells: { c_grp: '', c_num: 10 } },
                    { id: 'r2', cells: { c_grp: null, c_num: 20 } }
                ]
            };
            const pivId = 'db_piv_empty_host';
            AppState.databases[pivId] = {
                id: pivId,
                isPivot: true,
                sourceTableId: srcId,
                groupBy: ['c_grp'],
                aggregations: [{ type: 'count', sourceColId: 'c_num', label: 'Conteggio' }],
                columns: [
                    { id: 'grp_0', name: 'Gruppo', type: 'text' },
                    { id: 'agg_0', name: 'Conteggio', type: 'number' }
                ]
            };

            const res = AdvancedPivot.buildPivotData(pivId);
            Assert.strictEqual(res.pivotRows.length, 1);
            Assert.strictEqual(res.pivotRows[0].virtualCells.grp_0, '(Vuoto)');
            Assert.strictEqual(Number(res.pivotRows[0].virtualCells.agg_0), 2);
        });

    test("Pivot: aggregazione su colonna di tipo data trova Max e Min temporale", () => {
            const srcId = 'db_piv_date_src';
            AppState.databases[srcId] = {
                id: srcId,
                title: 'Audit',
                columns: [
                    { id: 'c_dep', name: 'Reparto', type: 'text' },
                    { id: 'c_dt', name: 'Data Audit', type: 'date' }
                ],
                rows: [
                    { id: '1', cells: { c_dep: 'IT', c_dt: '2026-01-10' } },
                    { id: '2', cells: { c_dep: 'IT', c_dt: '2026-05-20' } },
                    { id: '3', cells: { c_dep: 'IT', c_dt: '2026-03-15' } }
                ]
            };
            const pivId = 'db_piv_date_host';
            AppState.databases[pivId] = {
                id: pivId,
                isPivot: true,
                sourceTableId: srcId,
                groupBy: ['c_dep'],
                aggregations: [
                    { type: 'max', sourceColId: 'c_dt', label: 'Ultimo' },
                    { type: 'min', sourceColId: 'c_dt', label: 'Primo' }
                ],
                columns: [
                    { id: 'grp_0', name: 'Reparto', type: 'text' },
                    { id: 'agg_0', name: 'Ultimo', type: 'text' },
                    { id: 'agg_1', name: 'Primo', type: 'text' }
                ]
            };

            const res = AdvancedPivot.buildPivotData(pivId);
            const r = res.pivotRows[0];
            // Tolleranza per formato it-IT locale a 1 o 2 cifre per il mese (20/5/2026 oppure 20/05/2026)
            Assert.isTrue(r.virtualCells.agg_0.includes('2026') && (r.virtualCells.agg_0.includes('20/5') || r.virtualCells.agg_0.includes('20/05') || r.virtualCells.agg_0.includes('2026-05-20')));
            Assert.isTrue(r.virtualCells.agg_1.includes('2026') && (r.virtualCells.agg_1.includes('10/1') || r.virtualCells.agg_1.includes('10/01') || r.virtualCells.agg_1.includes('2026-01-10')));
        });

    test("Pivot: raggruppamento doppio (Asse X composito a 2 chiavi)", () => {
            const srcId = 'db_piv_2grp_src';
            AppState.databases[srcId] = {
                id: srcId,
                title: 'Fatturato',
                columns: [
                    { id: 'c_anno', name: 'Anno', type: 'text' },
                    { id: 'c_trim', name: 'Trimestre', type: 'text' },
                    { id: 'c_ric', name: 'Ricavo', type: 'number' }
                ],
                rows: [
                    { id: '1', cells: { c_anno: '2026', c_trim: 'Q1', c_ric: 100 } },
                    { id: '2', cells: { c_anno: '2026', c_trim: 'Q1', c_ric: 150 } },
                    { id: '3', cells: { c_anno: '2026', c_trim: 'Q2', c_ric: 200 } }
                ]
            };
            const pivId = 'db_piv_2grp_host';
            AppState.databases[pivId] = {
                id: pivId,
                isPivot: true,
                sourceTableId: srcId,
                groupBy: ['c_anno', 'c_trim'],
                aggregations: [{ type: 'sum', sourceColId: 'c_ric', label: 'Totale Ricavi' }],
                columns: [
                    { id: 'grp_0', name: 'Anno', type: 'text' },
                    { id: 'grp_1', name: 'Trimestre', type: 'text' },
                    { id: 'agg_0', name: 'Totale', type: 'number' }
                ]
            };

            const res = AdvancedPivot.buildPivotData(pivId);
            Assert.strictEqual(res.pivotRows.length, 2); // (2026, Q1) e (2026, Q2)

            const q1 = res.pivotRows.find(r => r.virtualCells.grp_1 === 'Q1');
            Assert.strictEqual(Number(q1.virtualCells.agg_0), 250);

            const q2 = res.pivotRows.find(r => r.virtualCells.grp_1 === 'Q2');
            Assert.strictEqual(Number(q2.virtualCells.agg_0), 200);
        });

    test("Pivot: buildPivotData con DB sorgente eliminato restituisce array vuoto", () => {
            const pivId = 'db_piv_orphan';
            AppState.databases[pivId] = {
                id: pivId,
                isPivot: true,
                sourceTableId: 'db_inesistente_ghost',
                groupBy: ['c1'],
                aggregations: []
            };
            const res = AdvancedPivot.buildPivotData(pivId);
            Assert.strictEqual(res.pivotRows.length, 0);
            Assert.strictEqual(res.sourceState, null);
        });

    test("Pivot: updateDependent rinfresca le viste pivot collegate a un DB sorgente", () => {
            let rendered = false;
            const origRender = AdvancedPivot.render;
            AdvancedPivot.render = () => { rendered = true; };

            AppState.databases['piv_dep_1'] = { id: 'piv_dep_1', isPivot: true, sourceTableId: 'src_table_main' };

            try {
                AdvancedPivot.updateDependent('src_table_main');
                Assert.isTrue(rendered);
            } finally {
                AdvancedPivot.render = origRender;
            }
        });

    test("Pivot: createOrUpdate assegna colonne grp_ e agg_ coerenti", () => {
            const srcId = 'db_piv_meta_src';
            AppState.databases[srcId] = {
                id: srcId,
                title: 'Sorgente Pivot',
                columns: [
                    { id: 'c_cat', name: 'Categoria', type: 'text' },
                    { id: 'c_val', name: 'Importo', type: 'number' }
                ],
                rows: []
            };

            const pivId = 'piv_meta_host';
            AdvancedPivot.createOrUpdate(pivId, srcId, ['c_cat'], [{ type: 'sum', sourceColId: 'c_val', label: 'Totale' }]);

            const piv = AppState.databases[pivId];
            Assert.isNotNull(piv);
            Assert.strictEqual(piv.columns[0].id, 'grp_0');
            Assert.strictEqual(piv.columns[0].name, 'Categoria');
            Assert.strictEqual(piv.columns[1].id, 'agg_0');
            Assert.strictEqual(piv.columns[1].name, 'Totale');
        });

    test("Pivot: buildPivotData con più righe nello stesso gruppo calcola somma esatta", () => {
            const srcId = 'db_piv_calc_src';
            AppState.databases[srcId] = {
                id: srcId,
                columns: [{ id: 'g', type: 'text' }, { id: 'v', type: 'number' }],
                rows: [
                    { id: '1', cells: { g: 'Gruppo1', v: 10 } },
                    { id: '2', cells: { g: 'Gruppo1', v: 25 } },
                    { id: '3', cells: { g: 'Gruppo1', v: 65 } }
                ]
            };
            const pivId = 'piv_calc_host';
            AppState.databases[pivId] = {
                id: pivId,
                isPivot: true,
                sourceTableId: srcId,
                groupBy: ['g'],
                aggregations: [{ type: 'sum', sourceColId: 'v', label: 'Somma' }],
                columns: [{ id: 'grp_0', name: 'G' }, { id: 'agg_0', name: 'Somma', type: 'number' }]
            };

            const res = AdvancedPivot.buildPivotData(pivId);
            Assert.strictEqual(res.pivotRows.length, 1);
            Assert.strictEqual(Number(res.pivotRows[0].virtualCells.agg_0), 100);
        });

    test("Pivot: aggregazione 'avg' su valori con decimali", () => {
            const srcId = 'db_piv_avg_src';
            AppState.databases[srcId] = {
                id: srcId,
                columns: [{ id: 'g', type: 'text' }, { id: 'v', type: 'number' }],
                rows: [
                    { id: '1', cells: { g: 'A', v: 10.5 } },
                    { id: '2', cells: { g: 'A', v: 20.5 } }
                ]
            };
            const pivId = 'piv_avg_host';
            AppState.databases[pivId] = {
                id: pivId,
                isPivot: true,
                sourceTableId: srcId,
                groupBy: ['g'],
                aggregations: [{ type: 'avg', sourceColId: 'v', label: 'Media' }],
                columns: [{ id: 'grp_0', name: 'G' }, { id: 'agg_0', name: 'Media', type: 'number' }]
            };

            const res = AdvancedPivot.buildPivotData(pivId);
            Assert.strictEqual(Number(res.pivotRows[0].virtualCells.agg_0), 15.5);
        });

    test("Pivot: aggregazione 'max' e 'min' su stringhe lessicografiche", () => {
            const srcId = 'db_piv_str_src';
            AppState.databases[srcId] = {
                id: srcId,
                columns: [{ id: 'g', type: 'text' }, { id: 'nome', type: 'text' }],
                rows: [
                    { id: '1', cells: { g: 'Team', nome: 'Zeta' } },
                    { id: '2', cells: { g: 'Team', nome: 'Alfa' } },
                    { id: '3', cells: { g: 'Team', nome: 'Gamma' } }
                ]
            };
            const pivId = 'piv_str_host';
            AppState.databases[pivId] = {
                id: pivId,
                isPivot: true,
                sourceTableId: srcId,
                groupBy: ['g'],
                aggregations: [
                    { type: 'max', sourceColId: 'nome', label: 'Ultimo' },
                    { type: 'min', sourceColId: 'nome', label: 'Primo' }
                ],
                columns: [{ id: 'grp_0', name: 'G' }, { id: 'agg_0', name: 'Ultimo' }, { id: 'agg_1', name: 'Primo' }]
            };

            const res = AdvancedPivot.buildPivotData(pivId);
            Assert.strictEqual(res.pivotRows[0].virtualCells.agg_0, 'Zeta');
            Assert.strictEqual(res.pivotRows[0].virtualCells.agg_1, 'Alfa');
        });

    test("Pivot: raggruppamento su colonna numerica converte chiavi a stringa", () => {
            const srcId = 'db_piv_num_src';
            AppState.databases[srcId] = {
                id: srcId,
                columns: [{ id: 'anno', type: 'number' }],
                rows: [
                    { id: '1', cells: { anno: 2026 } },
                    { id: '2', cells: { anno: 2026 } }
                ]
            };
            const pivId = 'piv_num_host';
            AppState.databases[pivId] = {
                id: pivId,
                isPivot: true,
                sourceTableId: srcId,
                groupBy: ['anno'],
                aggregations: [{ type: 'count', sourceColId: 'anno', label: 'Conteggio' }],
                columns: [{ id: 'grp_0', name: 'Anno' }, { id: 'agg_0', name: 'Conteggio' }]
            };

            const res = AdvancedPivot.buildPivotData(pivId);
            Assert.strictEqual(res.pivotRows.length, 1);
            Assert.strictEqual(res.pivotRows[0].virtualCells.grp_0, '2026');
            Assert.strictEqual(Number(res.pivotRows[0].virtualCells.agg_0), 2);
        });

    test("Pivot: aggregazione ignora celle null o undefined nei conteggi numerici", () => {
            const srcId = 'db_piv_null_src';
            AppState.databases[srcId] = {
                id: srcId,
                columns: [{ id: 'g', type: 'text' }, { id: 'n', type: 'number' }],
                rows: [
                    { id: '1', cells: { g: 'G1', n: 10 } },
                    { id: '2', cells: { g: 'G1', n: null } },
                    { id: '3', cells: { g: 'G1', n: '' } }
                ]
            };
            const pivId = 'piv_null_host';
            AppState.databases[pivId] = {
                id: pivId,
                isPivot: true,
                sourceTableId: srcId,
                groupBy: ['g'],
                aggregations: [{ type: 'sum', sourceColId: 'n', label: 'Somma' }],
                columns: [{ id: 'grp_0' }, { id: 'agg_0' }]
            };

            const res = AdvancedPivot.buildPivotData(pivId);
            Assert.strictEqual(Number(res.pivotRows[0].virtualCells.agg_0), 10);
        });

    test("Pivot: restoreHiddenColInView ripristina colonna nascosta", () => {
            const pId = 'piv_restore_col';
            AppState.databases[pId] = {
                id: pId,
                isPivot: true,
                columns: [{ id: 'c1', hidden: true }]
            };

            AdvancedTable.restoreHiddenColInView(pId, 'c1');
            Assert.isFalse(AppState.databases[pId].columns[0].hidden);
        });

    test("Pivot: toggleColVisibility su pivot aggiunge a hiddenCols", () => {
            const tId = 'piv_toggle_vis';
            AppState.databases[tId] = {
                id: tId,
                viewType: 'table',
                columns: [{ id: 'c1' }, { id: 'c2' }],
                viewConfig: { 'table': { hiddenCols: [] } }
            };

            AdvancedTableMenus.toggleColVisibility(tId, 'c1');
            Assert.isTrue(AppState.databases[tId].viewConfig['table'].hiddenCols.includes('c1'));

            AdvancedTableMenus.toggleColVisibility(tId, 'c1');
            Assert.isFalse(AppState.databases[tId].viewConfig['table'].hiddenCols.includes('c1'));
        });

    test("Pivot: setTextClamp imposta limite righe testo (1, 2, 3 o 'auto')", () => {
            const tId = 'piv_clamp';
            AppState.databases[tId] = { id: tId, textClamp: 1 };

            AdvancedTableMenus.setTextClamp(tId, 3);
            Assert.strictEqual(AppState.databases[tId].textClamp, 3);

            AdvancedTableMenus.setTextClamp(tId, 'auto');
            Assert.strictEqual(AppState.databases[tId].textClamp, 'auto');
        });

});
