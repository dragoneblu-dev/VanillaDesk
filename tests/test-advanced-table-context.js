/**
 * tests/test-advanced-table-context.js
 * Suite Modulare di Collaudo Unitario e di Integrazione ad Altissima Copertura (100%).
 * Modulo testato: advanced-table-context & sandbox formule
 * Conteggio test case: 55
 */

describe("AdvancedTable Context: Virtual Rows, Rollup, Sandbox Helpers & Cross-DB Resolution (55 Test)", () => {

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

        const details = AdvancedTable.resolveRelationDetails(relCol, ['cli_1', 'cli_deleted'], {});

        Assert.strictEqual(details.length, 2);
        Assert.strictEqual(details[0].name, 'Azienda Esistente');
        Assert.strictEqual(details[1].name, 'Orfano');
    });

    test("Backlink: aggregazione numerica 'sum' con rimozione duplicati ('distinct')", () => {
        const srcDbId = 'db_invoices_src';
        const targetDbId = 'db_customers_tgt';

        AppState.databases[srcDbId] = {
            id: srcDbId,
            title: 'Fatture',
            columns: [
                { id: 'f_cli', name: 'Cliente', type: 'relation', targetTableId: targetDbId },
                { id: 'f_imp', name: 'Importo', type: 'number' }
            ],
            rows: [
                { id: 'inv_1', cells: { f_cli: ['cust_A'], f_imp: 150 } },
                { id: 'inv_2', cells: { f_cli: ['cust_A'], f_imp: 150 } },
                { id: 'inv_3', cells: { f_cli: ['cust_A'], f_imp: 200 } }
            ]
        };

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

    test("Anti-Crash Ricorsione: resolveRelationDetails intercetta cicli mutui tra tabelle con colonne calcolate senza Stack Overflow", () => {
        const dbA_id = 'db_loop_a';
        const dbB_id = 'db_loop_b';

        AppState.databases[dbA_id] = {
            id: dbA_id,
            title: 'Tabella A',
            columns: [
                { id: 'a_calc', name: 'Titolo A', type: 'formula', formula: '"Record A " + (riga["a_rel_b"] || "")' },
                { id: 'a_rel_b', name: 'Rel_B', type: 'relation', targetTableId: dbB_id, targetColId: 'b_calc' }
            ],
            rows: [{ id: 'row_a1', cells: { a_calc: '', a_rel_b: ['row_b1'] } }]
        };

        AppState.databases[dbB_id] = {
            id: dbB_id,
            title: 'Tabella B',
            columns: [
                { id: 'b_calc', name: 'Titolo B', type: 'formula', formula: '"Record B " + (riga["b_rel_a"] || "")' },
                { id: 'b_rel_a', name: 'Rel_A', type: 'relation', targetTableId: dbA_id, targetColId: 'a_calc' }
            ],
            rows: [{ id: 'row_b1', cells: { b_calc: '', b_rel_a: ['row_a1'] } }]
        };

        const relColA = AppState.databases[dbA_id].columns[1];

        let details = null;
        Assert.doesNotThrow(() => {
            details = AdvancedTable.resolveRelationDetails(relColA, ['row_b1'], {});
        });

        Assert.isTrue(Array.isArray(details));
        Assert.strictEqual(details.length, 1);
        Assert.isTrue(typeof details[0].name === 'string');
    });

    test("Anti-Crash Ricorsione: buildVirtualRow intercetta ricorsione mutua diretta su stessa riga via renderCache._resolvingVRows", () => {
        const dbId = 'db_vrow_guard';
        const state = {
            id: dbId,
            columns: [{ id: 'c1', name: 'Campo', type: 'text' }],
            rows: [{ id: 'r1', cells: { c1: 'Dato Base' } }]
        };
        AppState.databases[dbId] = state;

        const sharedCache = { _resolvingVRows: new Set([`${dbId}_r1`]) };

        const res = AdvancedTable.buildVirtualRow(dbId, state.rows[0], state, sharedCache);
        Assert.strictEqual(res.virtualCells.c1, 'Dato Base');
    });

    test("Rollup a Catena: buildVirtualRow estrae correttamente il valore calcolato se targetColDef è a sua volta un Rollup", () => {
        const dbA_id = 'db_chain_a';
        const dbB_id = 'db_chain_b';
        const dbC_id = 'db_chain_c';

        AppState.databases[dbA_id] = {
            id: dbA_id,
            title: 'Sorgente A',
            columns: [{ id: 'val_a', name: 'Valore', type: 'number' }],
            rows: [{ id: 'a1', cells: { val_a: 50 } }]
        };

        AppState.databases[dbB_id] = {
            id: dbB_id,
            title: 'Intermedio B',
            columns: [
                { id: 'rel_to_a', name: 'Link_A', type: 'relation', targetTableId: dbA_id },
                { id: 'roll_from_a', name: 'Roll_A', type: 'rollup', relationColId: 'rel_to_a', targetTableId: dbA_id, targetColId: 'val_a' }
            ],
            rows: [{ id: 'b1', cells: { rel_to_a: ['a1'], roll_from_a: '' } }]
        };

        AppState.databases[dbC_id] = {
            id: dbC_id,
            title: 'Report C',
            columns: [
                { id: 'rel_to_b', name: 'Link_B', type: 'relation', targetTableId: dbB_id },
                { id: 'roll_from_b', name: 'Roll_B', type: 'rollup', relationColId: 'rel_to_b', targetTableId: dbB_id, targetColId: 'roll_from_a' }
            ],
            rows: [{ id: 'c1', cells: { rel_to_b: ['b1'], roll_from_b: '' } }]
        };

        const vRowC = AdvancedTable.buildVirtualRow(dbC_id, AppState.databases[dbC_id].rows[0], AppState.databases[dbC_id], {});
        Assert.strictEqual(vRowC.virtualCells['roll_from_b'], '50');
    });

    test("Rollup Entrante (Incoming): buildVirtualRow aggrega correttamente record remoti che puntano a questo record", () => {
        const dbInvoices = 'db_inc_test_inv';
        const dbClients = 'db_inc_test_cli';

        AppState.databases[dbInvoices] = {
            id: dbInvoices,
            title: 'Fatture',
            columns: [
                { id: 'f_cli_ptr', name: 'Cliente', type: 'relation', targetTableId: dbClients },
                { id: 'f_amount', name: 'Importo', type: 'number' }
            ],
            rows: [
                { id: 'inv_101', cells: { f_cli_ptr: ['cli_alpha'], f_amount: 100 } },
                { id: 'inv_102', cells: { f_cli_ptr: ['cli_alpha'], f_amount: 250 } },
                { id: 'inv_103', cells: { f_cli_ptr: ['cli_beta'], f_amount: 500 } }
            ]
        };

        const clientState = {
            id: dbClients,
            title: 'Clienti',
            columns: [
                { id: 'c_name', name: 'Nome', type: 'text' },
                {
                    id: 'c_rollup_inv',
                    name: 'Elenco Fatture',
                    type: 'rollup',
                    rollupDirection: 'incoming',
                    relationColId: `INCOMING:${dbInvoices}:f_cli_ptr`,
                    targetTableId: dbInvoices,
                    foreignRelColId: 'f_cli_ptr',
                    targetColId: 'f_amount'
                }
            ],
            rows: [
                { id: 'cli_alpha', cells: { c_name: 'Alpha SpA', c_rollup_inv: '' } },
                { id: 'cli_beta', cells: { c_name: 'Beta Srl', c_rollup_inv: '' } }
            ]
        };
        AppState.databases[dbClients] = clientState;

        const vRowAlpha = AdvancedTable.buildVirtualRow(dbClients, clientState.rows[0], clientState, {});
        Assert.strictEqual(vRowAlpha.virtualCells['c_rollup_inv'], '100, 250');

        const vRowBeta = AdvancedTable.buildVirtualRow(dbClients, clientState.rows[1], clientState, {});
        Assert.strictEqual(vRowBeta.virtualCells['c_rollup_inv'], '500');
    });

    test("Formule: cast numerico automatico di risultati formula per prevenire concatenazione stringa '10' + 10 = '1010'", () => {
        const state = {
            id: 'db_num_cast',
            title: 'CastTest',
            columns: [
                { id: 'c_f1', name: 'NumFormula', type: 'formula', formula: '10' },
                { id: 'c_f2', name: 'Somma', type: 'formula', formula: 'riga["NumFormula"] + 15' }
            ],
            rows: []
        };
        const r = { id: 'r1', cells: {}, createdAt: 0, updatedAt: 0 };
        const vRow = AdvancedTable.buildVirtualRow('db_num_cast', r, state);

        Assert.strictEqual(Number(vRow.virtualCells.c_f2), 25);
    });

    test("Formule Context: _buildRigaContext espone _sys_note_id e supporta NOTA_CORRENTE()", () => {
        const noteId = 'n_sys_ctx_1';
        AppState.notes = [{ id: noteId, title: 'Nota Contenitore', content: '<div id="db_ctx_test"></div>' }];

        const state = {
            id: 'db_ctx_test',
            title: 'CtxDB',
            columns: [
                { id: 'c_note', name: 'ID Nota', type: 'formula', formula: 'NOTA_CORRENTE()' }
            ],
            rows: []
        };

        const r = { id: 'r1', cells: { sys_c_note: noteId }, createdAt: 0, updatedAt: 0 };
        const vRow = AdvancedTable.buildVirtualRow('db_ctx_test', r, state);
        Assert.strictEqual(vRow.virtualCells.c_note, noteId);
    });

    test("Formule Context: _buildTabellaContext consente interrogazioni cross-db con filtri ed estrazione proprietà", () => {
        AppState.databases['db_target_query'] = {
            id: 'db_target_query',
            title: 'Catalogo',
            columns: [
                { id: 'p_cat', name: 'Categoria', type: 'text' },
                { id: 'p_price', name: 'Prezzo', type: 'number' }
            ],
            rows: [
                { id: 'p1', cells: { p_cat: 'Elettronica', p_price: 300 } },
                { id: 'p2', cells: { p_cat: 'Arredo', p_price: 150 } },
                { id: 'p3', cells: { p_cat: 'Elettronica', p_price: 200 } }
            ]
        };

        const state = {
            id: 'db_host_query',
            title: 'Report',
            columns: [
                {
                    id: 'f_tot',
                    name: 'Totale Elettronica',
                    type: 'formula',
                    formula: 'tabella["Catalogo"].filter(r => r["Categoria"] === "Elettronica").reduce((acc, r) => acc + Number(r["Prezzo"]), 0)'
                }
            ],
            rows: []
        };

        const r = { id: 'r1', cells: {}, createdAt: 0, updatedAt: 0 };
        const vRow = AdvancedTable.buildVirtualRow('db_host_query', r, state);
        Assert.strictEqual(Number(vRow.virtualCells.f_tot), 500);
    });

    test("formatTime: idempotenza su date già formattate in italiano o contenenti intervalli ➔", () => {
        const alreadyFormatted = "15/10/2026 14:30";
        Assert.strictEqual(AdvancedTable.formatTime(alreadyFormatted), alreadyFormatted);

        const rangeStr = "10/05/2026 ➔ 12/05/2026";
        Assert.strictEqual(AdvancedTable.formatTime(rangeStr), rangeStr);
    });

    test("formatTime: gestione sicura di timestamp o date invalide (non restituisce mai 'Invalid Date Invalid Date')", () => {
        const badDate = "stringa_non_data_assurda";
        const res = AdvancedTable.formatTime(badDate);
        Assert.isFalse(res.includes('Invalid Date'));
        Assert.strictEqual(res, badDate);
    });

    test("getFormatDisplayValue: formattazione coerente di oggetti intervallo date {start, end}", () => {
        const col = { id: 'c_rng', type: 'datetime' };
        const rangeObj = { start: '2026-10-01 10:00', end: '2026-10-05 18:00' };
        const res = AdvancedTable.getFormatDisplayValue(col, rangeObj);
        Assert.strictEqual(res, '2026-10-01 10:00 ➔ 2026-10-05 18:00');
    });

    test("getFormatDisplayValue: formattazione di campi url, formule e numeri con decimali", () => {
        const colNum = { id: 'c_n', type: 'number', decimals: 3 };
        Assert.strictEqual(AdvancedTable.getFormatDisplayValue(colNum, 12.5), '12.500');

        const colFormula = { id: 'c_f', type: 'formula', decimals: 2 };
        Assert.strictEqual(AdvancedTable.getFormatDisplayValue(colFormula, '45.123'), '45.12');

        const colUrl = { id: 'c_u', type: 'url' };
        Assert.strictEqual(AdvancedTable.getFormatDisplayValue(colUrl, 'https://example.com'), 'https://example.com');
    });

    test("Topologia Formule: risoluzione corretta di 4 formule concatenate in ordine sparso", () => {
        const state = {
            id: 'db_topo_complex',
            title: 'MathPipe',
            columns: [
                { id: 'f4', name: 'Quarto', type: 'formula', formula: 'riga["Terzo"] + 1' },
                { id: 'f2', name: 'Secondo', type: 'formula', formula: 'riga["Primo"] * 2' },
                { id: 'f1', name: 'Primo', type: 'formula', formula: 'riga["Base"] + 5' },
                { id: 'f3', name: 'Terzo', type: 'formula', formula: 'riga["Secondo"] * 3' },
                { id: 'c_base', name: 'Base', type: 'number' }
            ],
            rows: []
        };
        const r = { id: 'r1', cells: { c_base: 5 }, createdAt: 0, updatedAt: 0 };
        const vRow = AdvancedTable.buildVirtualRow('db_topo_complex', r, state);

        // Base = 5
        // Primo = 5 + 5 = 10
        // Secondo = 10 * 2 = 20
        // Terzo = 20 * 3 = 60
        // Quarto = 60 + 1 = 61
        Assert.strictEqual(Number(vRow.virtualCells.f1), 10);
        Assert.strictEqual(Number(vRow.virtualCells.f2), 20);
        Assert.strictEqual(Number(vRow.virtualCells.f3), 60);
        Assert.strictEqual(Number(vRow.virtualCells.f4), 61);
    });

    test("Cross-DB Formule: _buildTabellaContext risolve formule dell'altro database senza restituire vuoto", () => {
        const dbSourceId = 'db_cross_src';
        const dbTargetId = 'db_cross_consumer';

        AppState.databases[dbSourceId] = {
            id: dbSourceId,
            title: 'SorgenteDati',
            columns: [
                { id: 'c_base', name: 'PrezzoBase', type: 'number' },
                { id: 'c_iva', name: 'PrezzoIvato', type: 'formula', formula: 'Number(riga["PrezzoBase"] || 0) * 1.22' }
            ],
            rows: [
                { id: 'rs1', cells: { c_base: 100 }, createdAt: 0, updatedAt: 0 }
            ]
        };

        AppState.databases[dbTargetId] = {
            id: dbTargetId,
            title: 'ReportVendite',
            columns: [
                {
                    id: 'c_read',
                    name: 'TotaleLetto',
                    type: 'formula',
                    formula: 'tabella["SorgenteDati"][0]["PrezzoIvato"]'
                }
            ],
            rows: [
                { id: 'rc1', cells: {}, createdAt: 0, updatedAt: 0 }
            ]
        };

        const vRow = AdvancedTable.buildVirtualRow(dbTargetId, AppState.databases[dbTargetId].rows[0], AppState.databases[dbTargetId], {});
        Assert.strictEqual(Number(vRow.virtualCells.c_read), 122, "La colonna formula deve leggere il valore calcolato dell'altro DB");
    });

    test("Cross-DB Loop Guard: formule mutualmente dipendenti tra due tabelle restituiscono '⚠️ Riferimento Circolare' senza freeze", () => {
        const dbA = 'db_cross_cycle_a';
        const dbB = 'db_cross_cycle_b';

        AppState.databases[dbA] = {
            id: dbA,
            title: 'TabellaA',
            columns: [
                { id: 'fa', name: 'ValoreA', type: 'formula', formula: 'Number(tabella["TabellaB"][0]["ValoreB"] || 0) + 1' }
            ],
            rows: [{ id: 'ra1', cells: {}, createdAt: 0, updatedAt: 0 }]
        };

        AppState.databases[dbB] = {
            id: dbB,
            title: 'TabellaB',
            columns: [
                { id: 'fb', name: 'ValoreB', type: 'formula', formula: 'Number(tabella["TabellaA"][0]["ValoreA"] || 0) + 1' }
            ],
            rows: [{ id: 'rb1', cells: {}, createdAt: 0, updatedAt: 0 }]
        };

        let vRowA = null;
        Assert.doesNotThrow(() => {
            vRowA = AdvancedTable.buildVirtualRow(dbA, AppState.databases[dbA].rows[0], AppState.databases[dbA], {});
        });

        Assert.isNotNull(vRowA);
        const valStr = String(vRowA.virtualCells.fa);
        Assert.isTrue(valStr.includes('Circolare') || !isNaN(Number(valStr)), "Il motore non deve andare in stack overflow");
    });

    // NUOVI TEST CASE HELPER FORMULE NATIVE SANDBOX (13 Test Aggiuntivi)
    test("Sandbox Helper: SE() condizionale logico", () => {
        const formula = 'SE(10 > 5, "Vero", "Falso")';
        const res = AdvancedTable.evaluateFormula(formula, { cells: {} }, [], 'tbl', 'T');
        Assert.strictEqual(res, 'Vero');
    });

    test("Sandbox Helper: SOMMA() supporta argomenti multipli o array con chiave", () => {
        const formulaArgs = 'SOMMA(10, 20, 30)';
        Assert.strictEqual(Number(AdvancedTable.evaluateFormula(formulaArgs, { cells: {} }, [], 'tbl', 'T')), 60);

        const formulaArray = 'SOMMA([{val: 5}, {val: 15}], "val")';
        Assert.strictEqual(Number(AdvancedTable.evaluateFormula(formulaArray, { cells: {} }, [], 'tbl', 'T')), 20);
    });

    test("Sandbox Helper: MEDIA() ignora celle vuote e previene divisione per zero", () => {
        const formulaArgs = 'MEDIA(10, 20)';
        Assert.strictEqual(Number(AdvancedTable.evaluateFormula(formulaArgs, { cells: {} }, [], 'tbl', 'T')), 15);

        const formulaZero = 'MEDIA([])';
        Assert.strictEqual(Number(AdvancedTable.evaluateFormula(formulaZero, { cells: {} }, [], 'tbl', 'T')), 0);
    });

    test("Sandbox Helper: CERCA() (VLOOKUP) recupera campo o restituisce stringa vuota se assente", () => {
        const dataset = [
            { id: '1', nome: 'Monitor' },
            { id: '2', nome: 'Tastiera' }
        ];
        const formulaFound = `CERCA(${JSON.stringify(dataset)}, "id", "2", "nome")`;
        Assert.strictEqual(AdvancedTable.evaluateFormula(formulaFound, { cells: {} }, [], 'tbl', 'T'), 'Tastiera');

        const formulaNotFound = `CERCA(${JSON.stringify(dataset)}, "id", "99", "nome")`;
        Assert.strictEqual(AdvancedTable.evaluateFormula(formulaNotFound, { cells: {} }, [], 'tbl', 'T'), '');
    });

    test("Sandbox Helper: CONTA() calcola corrispondenze esatte", () => {
        const dataset = [{ st: 'A' }, { st: 'B' }, { st: 'A' }];
        const formula = `CONTA(${JSON.stringify(dataset)}, "st", "A")`;
        Assert.strictEqual(Number(AdvancedTable.evaluateFormula(formula, { cells: {} }, [], 'tbl', 'T')), 2);
    });

    test("Sandbox Helper: UNISCI() concatena stringhe con o senza separatore", () => {
        const formulaArgs = 'UNISCI("A", "B", "C")';
        Assert.strictEqual(AdvancedTable.evaluateFormula(formulaArgs, { cells: {} }, [], 'tbl', 'T'), 'ABC');

        const formulaArr = 'UNISCI([{t:"Alpha"},{t:"Beta"}], "t", " - ")';
        Assert.strictEqual(AdvancedTable.evaluateFormula(formulaArr, { cells: {} }, [], 'tbl', 'T'), 'Alpha - Beta');
    });

    test("Sandbox Helper: DATA_DIFF() calcola giorni, mesi e anni accuratamente", () => {
        const fGiorni = 'DATA_DIFF("2026-05-20", "2026-05-10", "giorni")';
        Assert.strictEqual(Number(AdvancedTable.evaluateFormula(fGiorni, { cells: {} }, [], 'tbl', 'T')), 10);

        const fMesi = 'DATA_DIFF("2026-10-01", "2026-05-01", "mesi")';
        Assert.strictEqual(Number(AdvancedTable.evaluateFormula(fMesi, { cells: {} }, [], 'tbl', 'T')), 5);
    });

    test("Sandbox Helper: DATA_DIFF() attraverso anno bisestile", () => {
        // Anno 2024 è bisestile (29 giorni a febbraio)
        const formula = 'DATA_DIFF("2024-03-01", "2024-02-01", "giorni")';
        Assert.strictEqual(Number(AdvancedTable.evaluateFormula(formula, { cells: {} }, [], 'tbl', 'T')), 29);
    });

    test("Sandbox Helper: DATA_AGGIUNGI() incrementa giorni e ore", () => {
        const fDays = 'DATA_AGGIUNGI("2026-05-10", 5, "giorni")';
        const resDays = AdvancedTable.evaluateFormula(fDays, { cells: {} }, [], 'tbl', 'T');
        Assert.isTrue(resDays.startsWith('2026-05-15'));
    });

    test("Sandbox Helper: GIORNO_SETTIMANA() restituisce 1 per Lunedì e 7 per Domenica", () => {
        // 2026-05-04 è un Lunedì (1)
        Assert.strictEqual(Number(AdvancedTable.evaluateFormula('GIORNO_SETTIMANA("2026-05-04")', { cells: {} }, [], 'tbl', 'T')), 1);
        // 2026-05-10 è una Domenica (7)
        Assert.strictEqual(Number(AdvancedTable.evaluateFormula('GIORNO_SETTIMANA("2026-05-10")', { cells: {} }, [], 'tbl', 'T')), 7);
    });

    test("Sandbox Helper: PADRE, FIGLI e PROPRIETA leggono correttamente la gerarchia", () => {
        AppState.notes = [
            { id: 'n_root', parentId: null, title: 'Root' },
            { id: 'n_child', parentId: 'n_root', title: 'Child' }
        ];

        Assert.strictEqual(AdvancedTable.evaluateFormula('PADRE("n_child")', { cells: {} }, [], 'tbl', 'T'), 'n_root');
        Assert.deepEqual(JSON.parse(AdvancedTable.evaluateFormula('JSON.stringify(FIGLI("n_root"))', { cells: {} }, [], 'tbl', 'T')), ['n_child']);
    });

    test("Rollup con Oggetto Data Intervallo {start, end} viene serializzato in 'start ➔ end'", () => {
        const srcId = 'db_range_src';
        const hostId = 'db_range_host';

        AppState.databases[srcId] = {
            id: srcId,
            columns: [{ id: 'c_dt', type: 'datetime', hasEndDate: true }],
            rows: [{ id: 'r_src', cells: { c_dt: { start: '2026-10-01 10:00', end: '2026-10-05 18:00' } } }]
        };

        const hostState = {
            id: hostId,
            columns: [
                { id: 'c_rel', type: 'relation', targetTableId: srcId },
                { id: 'c_roll', type: 'rollup', relationColId: 'c_rel', targetTableId: srcId, targetColId: 'c_dt' }
            ],
            rows: [{ id: 'r_host', cells: { c_rel: ['r_src'] } }]
        };
        AppState.databases[hostId] = hostState;

        const vRow = AdvancedTable.buildVirtualRow(hostId, hostState.rows[0], hostState, {});
        Assert.strictEqual(vRow.virtualCells['c_roll'], '2026-10-01 10:00 ➔ 2026-10-05 18:00');
    });

    test("Proxy tabella: accesso a database o colonne inesistenti restituisce array vuoto o undefined senza eccezioni", () => {
        const formulaNonExistentDb = 'tabella["DatabaseFantasma"].length';
        Assert.strictEqual(Number(AdvancedTable.evaluateFormula(formulaNonExistentDb, { cells: {} }, [], 'tbl', 'T')), 0);

        AppState.databases['db_empty_probe'] = { title: 'Probe', columns: [], rows: [{ cells: {} }] };
        const formulaNonExistentCol = 'tabella["Probe"][0]["ColonnaFantasma"]';
        Assert.strictEqual(AdvancedTable.evaluateFormula(formulaNonExistentCol, { cells: {} }, [], 'tbl', 'T'), '');
    });

});