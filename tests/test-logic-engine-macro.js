/**
 * tests/test-logic-engine-macro.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: logic-engine-macro
 * Conteggio test case: 6
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("LogicEngine Macro: Esecuzione Massiva, Batch & Mailto (6 Test)", () => {

    test("Macro Pipeline: azione UPDATE filtra e muta solo le righe bersaglio", async () => {
            const dbId = 'db_macro_test';
            AppState.databases[dbId] = {
                id: dbId,
                title: 'Ordini Clienti',
                columns: [
                    { id: 'c_id', name: 'ID', type: 'text' },
                    { id: 'c_st', name: 'Stato', type: 'text' },
                    { id: 'c_bl', name: 'Bloccato', type: 'checkbox' }
                ],
                rows: [
                    { id: 'r1', cells: { c_id: 'ORD-1', c_st: 'In Corso', c_bl: false } },
                    { id: 'r2', cells: { c_id: 'ORD-2', c_st: 'Chiuso', c_bl: false } },
                    { id: 'r3', cells: { c_id: 'ORD-3', c_st: 'In Corso', c_bl: false } }
                ]
            };

            const macroBlocks = [
                {
                    targetDbId: dbId,
                    actionType: 'update',
                    filters: [{ colId: 'c_st', operator: '=', value: 'In Corso' }],
                    actions: [{ colId: 'c_bl', type: 'set_true', value: '' }]
                }
            ];

            const response = await LogicEngine.executeMacroBlocks(macroBlocks, dbId, null, false);
            Assert.strictEqual(response.totalRowsAffected, 2);
            Assert.isTrue(response.updatedDbIds.has(dbId));

            const updatedDb = AppState.databases[dbId];
            Assert.strictEqual(updatedDb.rows[0].cells.c_bl, true);
            Assert.strictEqual(updatedDb.rows[1].cells.c_bl, false);
            Assert.strictEqual(updatedDb.rows[2].cells.c_bl, true);
        });

    test("Macro Pipeline: azione INSERT crea nuovo record con valori predefiniti e calcolati", async () => {
            const dbId = 'db_insert_test';
            AppState.databases[dbId] = {
                id: dbId,
                title: 'Log Errori',
                columns: [
                    { id: 'c_msg', name: 'Messaggio', type: 'text' },
                    { id: 'c_qta', name: 'Severita', type: 'number' }
                ],
                rows: []
            };

            const macroBlocks = [
                {
                    targetDbId: dbId,
                    actionType: 'insert',
                    actions: [
                        { colId: 'c_msg', type: 'set_fixed', value: 'Eccezione Rilevata' },
                        { colId: 'c_qta', type: 'set_fixed', value: '5' }
                    ]
                }
            ];

            const response = await LogicEngine.executeMacroBlocks(macroBlocks, dbId, null, false);
            Assert.strictEqual(response.totalRowsAffected, 1);
            Assert.strictEqual(AppState.databases[dbId].rows.length, 1);

            const newRow = AppState.databases[dbId].rows[0];
            Assert.strictEqual(newRow.cells.c_msg, 'Eccezione Rilevata');
            Assert.strictEqual(Number(newRow.cells.c_qta), 5);
        });

    test("Macro Pipeline: intercettazione e logging degli errori di sintassi", async () => {
            const dbId = 'db_err_test';
            AppState.databases[dbId] = {
                id: dbId,
                title: 'Test Errori',
                columns: [{ id: 'c1', name: 'Nome', type: 'text' }],
                rows: [{ id: 'r1', cells: { c1: 'Valore Originale' } }]
            };

            const macroBlocks = [
                {
                    targetDbId: dbId,
                    actionType: 'update',
                    filters: [],
                    actions: [{ colId: 'c1', type: 'set_formula', value: 'riga[$$$syntaxError' }]
                }
            ];

            const response = await LogicEngine.executeMacroBlocks(macroBlocks, dbId, null, false);

            // 1. L'errore deve essere catturato nel log
            Assert.isTrue(response.errorsLog.length > 0, "L'errore nella formula deve essere catturato nel log");

            // 2. La cella non deve essere corrotta con testo di errore HTML
            const db = AppState.databases[dbId];
            Assert.strictEqual(db.rows[0].cells.c1, 'Valore Originale');
        });

    test("Macro Pipeline: 'insert_select' trasferisce record filtrati leggendo dal contesto origine", async () => {
            const srcDbId = 'db_catalog_src';
            const dstDbId = 'db_orders_dst';

            AppState.databases[srcDbId] = {
                id: srcDbId,
                title: 'Catalogo Prodotti',
                columns: [
                    { id: 'p_name', name: 'Nome', type: 'text' },
                    { id: 'p_price', name: 'Prezzo', type: 'number' },
                    { id: 'p_avail', name: 'Disponibile', type: 'checkbox' }
                ],
                rows: [
                    { id: 'prod_1', cells: { p_name: 'Monitor 4K', p_price: 400, p_avail: true } },
                    { id: 'prod_2', cells: { p_name: 'Tastiera Guasta', p_price: 30, p_avail: false } },
                    { id: 'prod_3', cells: { p_name: 'Mouse Wireless', p_price: 50, p_avail: true } }
                ]
            };

            AppState.databases[dstDbId] = {
                id: dstDbId,
                title: 'Righe Ordine',
                columns: [
                    { id: 'o_item', name: 'Articolo', type: 'text' },
                    { id: 'o_subtotal', name: 'Subtotale Scontato', type: 'number' }
                ],
                rows: []
            };

            // Macro che preleva solo gli articoli disponibili e applica uno sconto del 10% tramite formula con `origine`
            const macroBlocks = [
                {
                    targetDbId: dstDbId,
                    sourceDbId: srcDbId,
                    actionType: 'insert_select',
                    filters: [{ colId: 'p_avail', operator: '=', value: 'true' }],
                    actions: [
                        { colId: 'o_item', type: 'set_from_source_col', value: 'p_name' },
                        { colId: 'o_subtotal', type: 'set_formula', value: 'Number(origine["Prezzo"] || 0) * 0.90' }
                    ]
                }
            ];

            const response = await LogicEngine.executeMacroBlocks(macroBlocks, dstDbId, null, false);

            Assert.strictEqual(response.totalRowsAffected, 2);
            Assert.strictEqual(AppState.databases[dstDbId].rows.length, 2);

            const orderRows = AppState.databases[dstDbId].rows;
            Assert.strictEqual(orderRows[0].cells.o_item, 'Monitor 4K');
            Assert.strictEqual(Number(orderRows[0].cells.o_subtotal), 360);
            Assert.strictEqual(orderRows[1].cells.o_item, 'Mouse Wireless');
            Assert.strictEqual(Number(orderRows[1].cells.o_subtotal), 45);
        });

    test("LogicEngine: executeMacroBlocks non esegue azioni se i filtri non restituiscono riscontri", async () => {
            const dbId = 'db_no_match';
            AppState.databases[dbId] = {
                id: dbId,
                title: 'Test No Match',
                columns: [{ id: 'c1', type: 'text' }],
                rows: [{ id: 'r1', cells: { c1: 'Valore 1' } }]
            };

            const macro = [{
                targetDbId: dbId,
                actionType: 'update',
                filters: [{ colId: 'c1', operator: '=', value: 'Valore Inesistente' }],
                actions: [{ colId: 'c1', type: 'set_fixed', value: 'Modificato' }]
            }];

            const res = await LogicEngine.executeMacroBlocks(macro, dbId, null, false);
            Assert.strictEqual(res.totalRowsAffected, 0);
            Assert.strictEqual(AppState.databases[dbId].rows[0].cells.c1, 'Valore 1');
        });

    test("LogicEngine: executeMacroBlocks cattura eccezioni interne in errorsLog", async () => {
            const dbId = 'db_crash_test';
            AppState.databases[dbId] = {
                id: dbId,
                title: 'Test Crash',
                columns: [{ id: 'c_calc', type: 'text' }],
                rows: [{ id: 'r1', cells: { c_calc: 'A' } }]
            };

            const macro = [{
                targetDbId: dbId,
                actionType: 'update',
                filters: [],
                actions: [{ colId: 'c_calc', type: 'set_formula', value: 'riga["Inesistente"].prop.sub' }]
            }];

            const res = await LogicEngine.executeMacroBlocks(macro, dbId, null, false);
            Assert.isTrue(res.errorsLog.length > 0);
        });

});
