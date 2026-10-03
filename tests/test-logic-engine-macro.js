/**
 * tests/test-logic-engine-macro.js
 * Suite Modulare di Collaudo Unitario e di Integrazione ad Altissima Copertura (100%).
 * Modulo testato: logic-engine-macro
 * Conteggio test case: 16
 */

describe("LogicEngine Macro: Esecuzione Massiva, Batch, Transazioni, VirtualCells Sync & Rollback (16 Test)", () => {

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

        Assert.isTrue(response.errorsLog.length > 0, "L'errore nella formula deve essere catturato nel log");

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

    test("Transazione Macro: Rollback atomico multi-riga se una formula fallisce a metà", async () => {
        const dbId = 'db_tx_rollback';
        AppState.databases[dbId] = {
            id: dbId,
            title: 'Account Saldi',
            columns: [
                { id: 'c_acc', name: 'Conto', type: 'text' },
                { id: 'c_bal', name: 'Saldo', type: 'number' }
            ],
            rows: [
                { id: 'r1', cells: { c_acc: 'Conto 1', c_bal: 100 } },
                { id: 'r2', cells: { c_acc: 'Conto 2', c_bal: 200 } }
            ]
        };

        const macro = [{
            targetDbId: dbId,
            actionType: 'update',
            filters: [],
            actions: [
                { colId: 'c_bal', type: 'set_formula', value: 'riga["Conto"] === "Conto 1" ? 999 : riga[$$$Crash' }
            ]
        }];

        const res = await LogicEngine.executeMacroBlocks(macro, dbId, null, false);

        Assert.isTrue(res.rolledBack, "La transazione deve essere dichiarata rolledBack");
        Assert.strictEqual(res.totalRowsAffected, 0, "Nessuna riga deve risultare confermata");

        const db = AppState.databases[dbId];
        Assert.strictEqual(db.rows[0].cells.c_bal, 100, "La prima riga deve essere ripristinata al valore originario");
        Assert.strictEqual(db.rows[1].cells.c_bal, 200);
    });

    test("Transazione Macro: Rollback cross-database se il secondo blocco fallisce", async () => {
        const dbA = 'db_tx_cross_a';
        const dbB = 'db_tx_cross_b';

        AppState.databases = {
            [dbA]: {
                id: dbA,
                title: 'Magazzino',
                columns: [{ id: 'ca1', name: 'Qta', type: 'number' }],
                rows: [{ id: 'ra1', cells: { ca1: 50 } }]
            },
            [dbB]: {
                id: dbB,
                title: 'Storico',
                columns: [{ id: 'cb1', name: 'Dato', type: 'text' }],
                rows: [{ id: 'rb1', cells: { cb1: 'Vecchio' } }]
            }
        };

        const macro = [
            {
                targetDbId: dbA,
                actionType: 'update',
                filters: [],
                actions: [{ colId: 'ca1', type: 'set_fixed', value: '10' }]
            },
            {
                targetDbId: dbB,
                actionType: 'update',
                filters: [],
                actions: [{ colId: 'cb1', type: 'set_formula', value: 'riga[$$$Errore' }]
            }
        ];

        const res = await LogicEngine.executeMacroBlocks(macro, dbA, null, false);

        Assert.isTrue(res.rolledBack);
        Assert.strictEqual(res.totalRowsAffected, 0);

        Assert.strictEqual(AppState.databases[dbA].rows[0].cells.ca1, 50, "dbA deve subire rollback anche se il suo blocco era formalmente valido");
        Assert.strictEqual(AppState.databases[dbB].rows[0].cells.cb1, 'Vecchio');
    });

    test("Transazione Macro: Nessuna email accodata viene inviata se un blocco successivo fallisce", async () => {
        const dbId = 'db_tx_email';
        AppState.databases[dbId] = {
            id: dbId,
            title: 'Clienti',
            columns: [{ id: 'c_mail', name: 'Email', type: 'text' }],
            rows: [{ id: 'r1', cells: { c_mail: 'test@example.com' } }]
        };

        const macro = [
            {
                targetDbId: dbId,
                actionType: 'email',
                actions: [
                    { colId: 'EMAIL_TO', type: 'set_fixed', value: 'test@example.com' },
                    { colId: 'EMAIL_SUBJECT', type: 'set_fixed', value: 'Oggetto' },
                    { colId: 'EMAIL_BODY', type: 'set_fixed', value: 'Corpo' }
                ]
            },
            {
                targetDbId: dbId,
                actionType: 'update',
                filters: [],
                actions: [{ colId: 'c_mail', type: 'set_formula', value: 'riga[$$$Fallimento' }]
            }
        ];

        const res = await LogicEngine.executeMacroBlocks(macro, dbId, null, false);

        Assert.isTrue(res.rolledBack);
        Assert.strictEqual(res.emailsSent, 0, "Nessuna email deve risultare inviata se la transazione fallisce");
    });

    test("Macro Pipeline: Mutazione opzioni Select apprende automaticamente nuovi tag", async () => {
        const dbId = 'db_select_learn';
        AppState.databases[dbId] = {
            id: dbId,
            title: 'Task Progetto',
            columns: [{ id: 'c_tag', name: 'Tag', type: 'multi-select' }],
            selectOptions: { c_tag: ['Bug'] },
            rows: [{ id: 'r1', cells: { c_tag: ['Bug'] } }]
        };

        const macro = [{
            targetDbId: dbId,
            actionType: 'update',
            filters: [],
            actions: [{ colId: 'c_tag', type: 'add_fixed', value: 'Urgente' }]
        }];

        const res = await LogicEngine.executeMacroBlocks(macro, dbId, null, false);
        Assert.strictEqual(res.totalRowsAffected, 1);
        Assert.deepEqual(AppState.databases[dbId].rows[0].cells.c_tag, ['Bug', 'Urgente']);
        Assert.isTrue(AppState.databases[dbId].selectOptions.c_tag.includes('Urgente'), "L'opzione nuova deve essere registrata in selectOptions");
    });

    test("Macro Pipeline (VirtualCells Sync): filtro WHERE opera correttamente su colonna formula calcolata", async () => {
        const dbId = 'db_vc_macro_filter';
        AppState.databases[dbId] = {
            id: dbId,
            title: 'Fatturato',
            columns: [
                { id: 'c_qta', name: 'Quantita', type: 'number' },
                { id: 'c_prz', name: 'Prezzo', type: 'number' },
                { id: 'c_tot', name: 'Totale', type: 'formula', formula: 'riga["Quantita"] * riga["Prezzo"]' },
                { id: 'c_tag', name: 'Tag', type: 'text' }
            ],
            rows: [
                { id: 'r1', cells: { c_qta: 10, c_prz: 20, c_tot: '', c_tag: 'Base' } }, // Tot = 200
                { id: 'r2', cells: { c_qta: 2, c_prz: 15, c_tot: '', c_tag: 'Base' } }    // Tot = 30
            ]
        };

        const macro = [{
            targetDbId: dbId,
            actionType: 'update',
            filters: [{ colId: 'c_tot', operator: '>', value: '100' }],
            actions: [{ colId: 'c_tag', type: 'set_fixed', value: 'VIP' }]
        }];

        const res = await LogicEngine.executeMacroBlocks(macro, dbId, null, false);
        Assert.strictEqual(res.totalRowsAffected, 1, "Solo r1 supera 100 nel totale calcolato");
        Assert.strictEqual(AppState.databases[dbId].rows[0].cells.c_tag, 'VIP');
        Assert.strictEqual(AppState.databases[dbId].rows[1].cells.c_tag, 'Base');
    });

    test("Macro Pipeline (VirtualCells Sync): azione SET aggiorna istantaneamente virtualCells della riga", async () => {
        const dbId = 'db_vc_sync_set';
        AppState.databases[dbId] = {
            id: dbId,
            title: 'SyncTest',
            columns: [
                { id: 'c_val', name: 'Valore', type: 'number' }
            ],
            rows: [
                { id: 'r1', cells: { c_val: 10 }, virtualCells: { c_val: 10 } }
            ]
        };

        const macro = [{
            targetDbId: dbId,
            actionType: 'update',
            filters: [],
            actions: [{ colId: 'c_val', type: 'set_fixed', value: '99' }]
        }];

        const res = await LogicEngine.executeMacroBlocks(macro, dbId, null, false);
        Assert.strictEqual(res.totalRowsAffected, 1);
        const row = AppState.databases[dbId].rows[0];
        Assert.strictEqual(row.cells.c_val, 99);
        Assert.strictEqual(row.virtualCells.c_val, 99, "virtualCells deve essere perfettamente sincronizzata con cells");
    });

    test("Macro Context: esecuzione in modalità THIS_ROW muta esclusivamente la riga di origine", async () => {
        const dbId = 'db_this_row_test';
        AppState.databases[dbId] = {
            id: dbId,
            title: 'Tasks',
            columns: [
                { id: 'c_task', name: 'Attivita', type: 'text' },
                { id: 'c_done', name: 'Eseguito', type: 'checkbox' }
            ],
            rows: [
                { id: 'r1', cells: { c_task: 'Task 1', c_done: false } },
                { id: 'r2', cells: { c_task: 'Task 2', c_done: false } },
                { id: 'r3', cells: { c_task: 'Task 3', c_done: false } }
            ]
        };

        const sourceRow = AppState.databases[dbId].rows[1];

        const macro = [{
            targetDbId: 'THIS_ROW',
            actionType: 'update',
            filters: [],
            actions: [{ colId: 'c_done', type: 'set_true', value: '' }]
        }];

        const res = await LogicEngine.executeMacroBlocks(macro, dbId, sourceRow, false);
        Assert.strictEqual(res.totalRowsAffected, 1);
        Assert.strictEqual(AppState.databases[dbId].rows[0].cells.c_done, false);
        Assert.strictEqual(AppState.databases[dbId].rows[1].cells.c_done, true, "Solo la riga sorgente deve essere marcata");
        Assert.strictEqual(AppState.databases[dbId].rows[2].cells.c_done, false);
    });

    test("Macro Pipeline: 'insert_select' con 0 record corrispondenti non muta il target e non scatena rollback", async () => {
        const srcId = 'db_src_empty_q';
        const dstId = 'db_dst_empty_q';

        AppState.databases[srcId] = {
            id: srcId,
            title: 'Sorgente',
            columns: [{ id: 's1', type: 'text' }],
            rows: [{ id: 'rs1', cells: { s1: 'NonCorrisponde' } }]
        };
        AppState.databases[dstId] = {
            id: dstId,
            title: 'Destinazione',
            columns: [{ id: 'd1', type: 'text' }],
            rows: []
        };

        const macro = [{
            targetDbId: dstId,
            sourceDbId: srcId,
            actionType: 'insert_select',
            filters: [{ colId: 's1', operator: '=', value: 'ValoreFantasma' }],
            actions: [{ colId: 'd1', type: 'set_from_source_col', value: 's1' }]
        }];

        const res = await LogicEngine.executeMacroBlocks(macro, dstId, null, false);
        Assert.isFalse(res.rolledBack);
        Assert.strictEqual(res.totalRowsAffected, 0);
        Assert.strictEqual(AppState.databases[dstId].rows.length, 0);
    });

    test("Macro Email: generazione url mailto con formule dinamiche", async () => {
        const dbId = 'db_mail_gen';
        AppState.databases[dbId] = {
            id: dbId,
            title: 'Rubrica',
            columns: [
                { id: 'c_name', name: 'Nome', type: 'text' },
                { id: 'c_mail', name: 'Email', type: 'text' }
            ],
            rows: [
                { id: 'r1', cells: { c_name: 'Mario', c_mail: 'mario@test.com' } }
            ]
        };

        const macro = [{
            targetDbId: dbId,
            actionType: 'email',
            filters: [{ colId: 'c_name', operator: '=', value: 'Mario' }],
            actions: [
                { colId: 'EMAIL_TO', type: 'set_formula', value: 'riga["Email"]' },
                { colId: 'EMAIL_CC', type: 'set_fixed', value: 'admin@test.com' },
                { colId: 'EMAIL_SUBJECT', type: 'set_formula', value: '"Sollecito per " + riga["Nome"]' },
                { colId: 'EMAIL_BODY', type: 'set_fixed', value: 'Messaggio di avviso.' }
            ]
        }];

        let openedUrl = null;
        const origCreate = document.createElement;
        document.createElement = function(tag) {
            const el = origCreate.call(document, tag);
            if (tag.toLowerCase() === 'a') {
                const capture = function() {
                    openedUrl = el.getAttribute('href') || el.href || this.href;
                };
                el.click = capture;
                el.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    capture();
                });
            }
            return el;
        };

        try {
            const res = await LogicEngine.executeMacroBlocks(macro, dbId, null, false);
            Assert.strictEqual(res.emailsSent, 1);
            Assert.isNotNull(openedUrl);
            Assert.isTrue(openedUrl.startsWith('mailto:mario@test.com'));
            Assert.isTrue(openedUrl.includes('admin@test.com'));
            Assert.isTrue(decodeURIComponent(openedUrl).includes('Sollecito per Mario'));
        } finally {
            document.createElement = origCreate;
        }
    });

    test("Macro Pipeline: propagazione post-commit ai trigger delle automazioni", async () => {
        const dbId = 'db_auto_dispatch';
        let automationTriggered = false;

        const autoMock = {
            evaluate: (targetId, rowId, isNew) => {
                if (targetId === dbId) automationTriggered = true;
            },
            triggerCrossDB: () => {}
        };

        const origWindowAuto = typeof window !== 'undefined' ? window.AdvancedAutomations : undefined;
        if (typeof window !== 'undefined') {
            window.AdvancedAutomations = autoMock;
        }

        AppState.databases[dbId] = {
            id: dbId,
            title: 'AutoDispatch',
            columns: [{ id: 'c1', type: 'text' }],
            rows: [{ id: 'r1', cells: { c1: 'Prima' } }]
        };

        const macro = [{
            targetDbId: dbId,
            actionType: 'update',
            filters: [],
            actions: [{ colId: 'c1', type: 'set_fixed', value: 'Dopo' }]
        }];

        try {
            const res = await LogicEngine.executeMacroBlocks(macro, dbId, null, false);
            Assert.strictEqual(res.totalRowsAffected, 1);
            Assert.isTrue(automationTriggered, "L'evento dell'automazione deve essere scatenato a valle del commit");
        } finally {
            if (typeof window !== 'undefined') {
                window.AdvancedAutomations = origWindowAuto;
            }
        }
    });

});