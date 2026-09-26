/**
 * tests/test-advanced-table-context.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-context
 * Conteggio test case: 28
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Context: Virtual Rows, Rollup & Risoluzione Relazioni (28 Test)", () => {

    test("Virtual Row: estrazione automatica timestamp di sistema", () => {
            const state = {
                id: 'tbl_v',
                columns: [
                    { id: 'c_c', name: 'Creato', type: 'created_time' },
                    { id: 'c_u', name: 'Modificato', type: 'last_edited_time' }
                ],
                rows: []
            };
            const fixedNow = 1779364800000;
            const rowData = { id: 'r1', createdAt: fixedNow, updatedAt: fixedNow, cells: {} };
            const vRow = AdvancedTable.buildVirtualRow('tbl_v', rowData, state);
            Assert.isTrue(typeof vRow.virtualCells.c_c === 'string' && vRow.virtualCells.c_c.length > 0);
            Assert.isTrue(typeof vRow.virtualCells.c_u === 'string' && vRow.virtualCells.c_u.length > 0);
        });

    test("Virtual Row: calcolo automatico formula dipendente interna", () => {
            const state = {
                id: 'tbl_v2',
                title: 'Test',
                columns: [
                    { id: 'c1', name: 'Base', type: 'number' },
                    { id: 'c2', name: 'Raddoppio', type: 'formula', formula: 'riga["Base"] * 2' }
                ],
                rows: []
            };
            const r = { id: 'r1', cells: { c1: 21 }, createdAt: Date.now(), updatedAt: Date.now() };
            const vRow = AdvancedTable.buildVirtualRow('tbl_v2', r, state);
            Assert.strictEqual(Number(vRow.virtualCells.c2), 42);
        });

    test("Virtual Row: ordinamento topologico formule a cascata (A -> B -> C)", () => {
            const state = {
                id: 'tbl_v3',
                title: 'Cascade',
                columns: [
                    { id: 'c_a', name: 'A', type: 'number' },
                    { id: 'c_c', name: 'C', type: 'formula', formula: 'riga["B"] + 10' }, 
                    { id: 'c_b', name: 'B', type: 'formula', formula: 'riga["A"] * 2' }
                ],
                rows: []
            };
            const r = { id: 'r1', cells: { c_a: 5 }, createdAt: Date.now(), updatedAt: Date.now() };
            const vRow = AdvancedTable.buildVirtualRow('tbl_v3', r, state);
            Assert.strictEqual(Number(vRow.virtualCells.c_b), 10);
            Assert.strictEqual(Number(vRow.virtualCells.c_c), 20);
        });

    test("Virtual Row: protezione da formule circolari infinite (A -> B -> A)", () => {
            const state = {
                id: 'tbl_v4',
                title: 'LoopFormulas',
                columns: [
                    { id: 'f_a', name: 'A', type: 'formula', formula: 'riga["B"] + 1' },
                    { id: 'f_b', name: 'B', type: 'formula', formula: 'riga["A"] + 1' }
                ],
                rows: []
            };
            const r = { id: 'r1', cells: {}, createdAt: Date.now(), updatedAt: Date.now() };
            const vRow = AdvancedTable.buildVirtualRow('tbl_v4', r, state);
            Assert.isTrue(String(vRow.virtualCells.f_a).includes('Circolare') || String(vRow.virtualCells.f_b).includes('Circolare'));
        });

    test("Relazioni: risoluzione pulita di ID orfani senza generare eccezioni", () => {
            const targetDbId = 'db_clients_orphans';
            AppState.databases[targetDbId] = {
                id: targetDbId,
                title: 'Clienti',
                columns: [{ id: 'c_name', name: 'Nome', type: 'text' }],
                rows: [{ id: 'cli_1', cells: { c_name: 'Azienda Esistente' } }]
            };

            const relCol = {
                id: 'c_rel',
                name: 'Cliente',
                type: 'relation',
                targetTableId: targetDbId,
                targetColId: 'c_name'
            };

            // 'cli_deleted' non esiste più nel database target
            const details = AdvancedTable.resolveRelationDetails(relCol, ['cli_1', 'cli_deleted'], {});

            Assert.strictEqual(details.length, 2);
            Assert.strictEqual(details[0].name, 'Azienda Esistente');
            Assert.strictEqual(details[1].name, 'Orfano');
        });

    test("Backlink: aggregazione numerica 'sum' con rimozione duplicati ('distinct')", () => {
            const srcDbId = 'db_invoices_src';
            const targetDbId = 'db_customers_tgt';

            // Database Fatture: due fatture distinte con importo identico (150) e una con 200
            AppState.databases[srcDbId] = {
                id: srcDbId,
                title: 'Fatture',
                columns: [
                    { id: 'f_cli', name: 'Cliente', type: 'relation', targetTableId: targetDbId },
                    { id: 'f_imp', name: 'Importo', type: 'number' }
                ],
                rows: [
                    { id: 'inv_1', cells: { f_cli: ['cust_A'], f_imp: 150 } },
                    { id: 'inv_2', cells: { f_cli: ['cust_A'], f_imp: 150 } }, // Duplicato di importo
                    { id: 'inv_3', cells: { f_cli: ['cust_A'], f_imp: 200 } }
                ]
            };

            // Database Clienti con colonna Backlink configurata per estrarre e sommare 'Importo' univoco
            const backlinkCol = {
                id: 'bl_invoices',
                name: 'Totale Univoco Spese',
                type: 'relation_backlink',
                linkedTableId: srcDbId,
                linkedColId: 'f_cli',
                backlinkDisplay: 'property',
                backlinkPropertyId: 'f_imp',
                backlinkDistinct: true,
                backlinkAggType: 'sum'
            };

            const customerState = {
                id: targetDbId,
                title: 'Clienti',
                columns: [
                    { id: 'c_name', name: 'Nome', type: 'text' },
                    backlinkCol
                ],
                rows: [{ id: 'cust_A', cells: { c_name: 'Acme Corp' } }]
            };
            AppState.databases[targetDbId] = customerState;

            const vRow = AdvancedTable.buildVirtualRow(targetDbId, customerState.rows[0], customerState, {});

            // Con distinct=true, gli importi considerati devono essere 150 e 200 -> Somma = 350 (non 500)
            Assert.strictEqual(Number(vRow.virtualCells['bl_invoices']), 350);
        });

    test("RDBMS: formatDecimal con virgola italiana '12,50' e 2 decimali", () => {
            Assert.strictEqual(AdvancedTable.formatDecimal("12,50", 2), "12.50");
        });

    test("RDBMS: formatDecimal con valore vuoto o nullo ritorna valore invariato", () => {
            Assert.strictEqual(AdvancedTable.formatDecimal("", 2), "");
            Assert.strictEqual(AdvancedTable.formatDecimal(null, 2), null);
        });

    test("RDBMS: formatDecimal con decimale 'default' preserva precisione originaria", () => {
            Assert.strictEqual(AdvancedTable.formatDecimal(12.34567, 'default'), 12.34567);
        });

    test("RDBMS: resolveRelationDetails con target colonna di tipo numero converte a stringa pulita", () => {
            const dbTarget = 'db_prices_rel';
            AppState.databases[dbTarget] = {
                id: dbTarget,
                title: 'Listino',
                columns: [{ id: 'p_cost', name: 'Costo', type: 'number' }],
                rows: [{ id: 'item_1', cells: { p_cost: 49.99 } }]
            };

            const relCol = {
                id: 'r_price',
                name: 'Prezzo Listino',
                type: 'relation',
                targetTableId: dbTarget,
                targetColId: 'p_cost'
            };

            const details = AdvancedTable.resolveRelationDetails(relCol, ['item_1'], {});
            Assert.strictEqual(details[0].name, '49.99');
        });

    test("RDBMS: getFormatDisplayValue su note_link con JSON corrotto fa fallback su 'Nota Mancante'", () => {
            const col = { id: 'c_nl', name: 'Link Nota', type: 'note_link' };
            const formatted = AdvancedTable.getFormatDisplayValue(col, "{json_incompleto");
            Assert.strictEqual(formatted, "Nota Mancante");
        });

    test("AdvancedTable: formatTime restituisce stringa data e ora formattata", () => {
            const ts = 1778841600000;
            const res = AdvancedTable.formatTime(ts);
            Assert.isTrue(res.length > 5);
            Assert.isTrue(res.includes(':'));
        });

    test("AdvancedTable: formatDecimal con valore fisso a 2 decimali", () => {
            Assert.strictEqual(AdvancedTable.formatDecimal(15, 2), "15.00");
            Assert.strictEqual(AdvancedTable.formatDecimal(15.987, 2), "15.99");
        });

    test("AdvancedTable: getFormatDisplayValue formatta multi-select in ordine alfabetico", () => {
            const col = { id: 'c_tags', type: 'multi-select' };
            const res = AdvancedTable.getFormatDisplayValue(col, ['Zeta', 'Alfa', 'Gamma']);
            Assert.strictEqual(res, "Alfa, Gamma, Zeta");
        });

    test("AdvancedTable: getFormatDisplayValue formatta checkbox in '☑ Sì' o '☐ No'", () => {
            const col = { id: 'c_b', type: 'checkbox' };
            Assert.strictEqual(AdvancedTable.getFormatDisplayValue(col, true), "☑ Sì");
            Assert.strictEqual(AdvancedTable.getFormatDisplayValue(col, false), "☐ No");
        });

    test("Relazioni Multiple: toggleRelationValue con colId specifico valida correttamente la circolarità", () => {
            const dbTest = {
                id: 'db_toggle_test',
                columns: [
                    { id: 'r_up', name: 'Upstream', type: 'relation', targetTableId: 'db_toggle_test' },
                    { id: 'r_down', name: 'Downstream', type: 'relation', targetTableId: 'db_toggle_test' }
                ],
                rows: [
                    { id: 't1', cells: { r_up: ['t2'], r_down: [] } },
                    { id: 't2', cells: { r_up: [], r_down: [] } }
                ]
            };
            AppState.databases['db_toggle_test'] = dbTest;

            // Simuliamo l'apertura del selettore per t2 sulla colonna r_down verso t1 (connessione reciproca lecita)
            AdvancedTable._pendingRelSelect = {
                realTableId: 'db_toggle_test',
                tableId: 'db_toggle_test',
                rowId: 't2',
                colId: 'r_down',
                currentVals: [],
                targetDbId: 'db_toggle_test',
                targetColId: 'r_down',
                isBacklink: false
            };

            let alertTriggered = false;
            const origAlert = window.alert;
            window.alert = () => { alertTriggered = true; };

            try {
                AdvancedTable.toggleRelationValue('t1');
                Assert.isFalse(alertTriggered, "Non deve scattare l'alert per relazioni reciproche su colonne distinte");
                Assert.isTrue(dbTest.rows[1].cells.r_down.includes('t1'));
            } finally {
                window.alert = origAlert;
            }
        });

    test("RDBMS: getFormatDisplayValue su colonna formula con decimali formattati", () => {
            const col = { id: 'c_f', type: 'formula', decimals: 2 };
            Assert.strictEqual(AdvancedTable.getFormatDisplayValue(col, 125.6789), "125.68");
        });

    test("RDBMS: getFormatDisplayValue su colonna rollup con decimali", () => {
            const col = { id: 'c_r', type: 'rollup', decimals: 1 };
            Assert.strictEqual(AdvancedTable.getFormatDisplayValue(col, 44.44), "44.4");
        });

    test("RDBMS: getFormatDisplayValue su colonna created_time formatta data e ora", () => {
            const col = { id: 'c_ct', type: 'created_time' };
            const res = AdvancedTable.getFormatDisplayValue(col, 1778841600000);
            Assert.isTrue(res.includes(':'));
        });

    test("RDBMS: getFormatDisplayValue su data singola stringa rimane inalterata", () => {
            const col = { id: 'c_dt', type: 'date' };
            Assert.strictEqual(AdvancedTable.getFormatDisplayValue(col, '2026-06-15'), '2026-06-15');
        });

    test("RDBMS: getFormatDisplayValue su note_link con oggetto {noteId, title}", () => {
            AppState.notes = [{ id: 'n_doc_1', title: 'Specifiche Tecniche' }];
            const col = { id: 'c_nl', type: 'note_link' };
            const res = AdvancedTable.getFormatDisplayValue(col, { noteId: 'n_doc_1' });
            Assert.strictEqual(res, 'Specifiche Tecniche');
        });

    test("RDBMS: getFormatDisplayValue su note_link con capitolo anchor", () => {
            AppState.notes = [{ id: 'n_doc_2', title: 'Manuale' }];
            const col = { id: 'c_nl', type: 'note_link' };
            const res = AdvancedTable.getFormatDisplayValue(col, { noteId: 'n_doc_2', anchor: 'Capitolo 3' });
            Assert.strictEqual(res, 'Manuale > Capitolo 3');
        });

    test("RDBMS: getFormatDisplayValue su note_link con nota nel cestino restituisce 'Nota nel Cestino'", () => {
            AppState.notes = [{ id: 'n_trashed', title: 'Vecchia Nota', deletedAt: Date.now() }];
            const col = { id: 'c_nl', type: 'note_link' };
            const res = AdvancedTable.getFormatDisplayValue(col, { noteId: 'n_trashed' });
            Assert.strictEqual(res, 'Nota nel Cestino');
        });

    test("RDBMS: resolveRelationDetails gestisce ID mancanti nel DB target restituendo 'Orfano'", () => {
            AppState.databases['db_tgt_missing'] = {
                id: 'db_tgt_missing',
                columns: [{ id: 'c_name', name: 'Nome' }],
                rows: [{ id: 'row_exists', cells: { c_name: 'Presente' } }]
            };
            const col = { id: 'r_col', type: 'relation', targetTableId: 'db_tgt_missing', targetColId: 'c_name' };

            const details = AdvancedTable.resolveRelationDetails(col, ['row_exists', 'row_ghost']);
            Assert.strictEqual(details.length, 2);
            Assert.strictEqual(details[0].name, 'Presente');
            Assert.strictEqual(details[1].name, 'Orfano');
        });

    test("RDBMS: resolveRelationDetails su colonna target di tipo formula calcola virtual row", () => {
            AppState.databases['db_tgt_formula'] = {
                id: 'db_tgt_formula',
                columns: [
                    { id: 'c_price', name: 'Prezzo', type: 'number' },
                    { id: 'c_calc', name: 'Etichetta', type: 'formula', formula: '"EUR " + riga["Prezzo"]' }
                ],
                rows: [{ id: 'p1', cells: { c_price: 99 }, createdAt: 0, updatedAt: 0 }]
            };
            const col = { id: 'r_col', type: 'relation', targetTableId: 'db_tgt_formula', targetColId: 'c_calc' };

            const details = AdvancedTable.resolveRelationDetails(col, ['p1']);
            Assert.strictEqual(details[0].name, 'EUR 99');
        });

    test("RDBMS: buildVirtualRow con backlink di tipo 'count'", () => {
            AppState.databases['db_src_bl'] = {
                columns: [{ id: 'r_ptr', type: 'relation' }],
                rows: [
                    { id: 's1', cells: { r_ptr: ['target_row'] } },
                    { id: 's2', cells: { r_ptr: ['target_row'] } },
                    { id: 's3', cells: { r_ptr: ['other_row'] } }
                ]
            };
            const targetState = {
                id: 'db_tgt_bl',
                columns: [{
                    id: 'bl_count',
                    type: 'relation_backlink',
                    linkedTableId: 'db_src_bl',
                    linkedColId: 'r_ptr',
                    backlinkDisplay: 'count'
                }],
                rows: [{ id: 'target_row', cells: {} }]
            };
            AppState.databases['db_tgt_bl'] = targetState;

            const vRow = AdvancedTable.buildVirtualRow('db_tgt_bl', targetState.rows[0], targetState, {});
            Assert.strictEqual(vRow.virtualCells['bl_count'], 2);
        });

    test("RDBMS: buildVirtualRow con backlink di tipo 'list' raccoglie gli ID collegati", () => {
            AppState.databases['db_src_bl2'] = {
                columns: [{ id: 'r_ptr', type: 'relation' }],
                rows: [
                    { id: 's1', cells: { r_ptr: ['target_row_2'] } },
                    { id: 's2', cells: { r_ptr: ['target_row_2'] } }
                ]
            };
            const targetState = {
                id: 'db_tgt_bl2',
                columns: [{
                    id: 'bl_list',
                    type: 'relation_backlink',
                    linkedTableId: 'db_src_bl2',
                    linkedColId: 'r_ptr',
                    backlinkDisplay: 'list'
                }],
                rows: [{ id: 'target_row_2', cells: {} }]
            };
            AppState.databases['db_tgt_bl2'] = targetState;

            const vRow = AdvancedTable.buildVirtualRow('db_tgt_bl2', targetState.rows[0], targetState, {});
            Assert.deepEqual(vRow.virtualCells['bl_list'], ['s1', 's2']);
        });

    test("RDBMS: buildVirtualRow con rollup su record collegato inesistente restituisce stringa vuota", () => {
            AppState.databases['db_rollup_src'] = {
                id: 'db_rollup_src',
                columns: [{ id: 'c_val', name: 'Valore', type: 'number' }],
                rows: []
            };
            const hostState = {
                id: 'db_rollup_host',
                columns: [
                    { id: 'c_rel', type: 'relation', targetTableId: 'db_rollup_src' },
                    { id: 'c_roll', type: 'rollup', relationColId: 'c_rel', targetColId: 'c_val' }
                ],
                rows: [{ id: 'r_host', cells: { c_rel: ['non_esisto'] } }]
            };
            AppState.databases['db_rollup_host'] = hostState;

            const vRow = AdvancedTable.buildVirtualRow('db_rollup_host', hostState.rows[0], hostState, {});
            Assert.strictEqual(vRow.virtualCells['c_roll'], '');
        });

});
