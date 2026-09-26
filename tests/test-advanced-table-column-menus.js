/**
 * tests/test-advanced-table-column-menus.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-column-menus
 * Conteggio test case: 13
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Column Menus: Rinomina, Tipi Dato & Backlink Config (13 Test)", () => {

    test("ColumnMenus: toggleEndDate alterna lo stato hasEndDate su date", () => {
            const tId = 'db_col_enddate';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c_date', name: 'Scadenza', type: 'date', hasEndDate: false }],
                rows: []
            };

            AdvancedTableColumnMenus.toggleEndDate(tId, 'c_date');
            Assert.isTrue(AppState.databases[tId].columns[0].hasEndDate);

            AdvancedTableColumnMenus.toggleEndDate(tId, 'c_date');
            Assert.isFalse(AppState.databases[tId].columns[0].hasEndDate);
        });

    test("ColumnMenus: toggleRelationSingle limita gli array a max 1 elemento", () => {
            const tId = 'db_col_single';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c_rel', name: 'Relazione', type: 'relation', singleRecord: false }],
                rows: [
                    { id: 'r1', cells: { c_rel: ['id_1', 'id_2', 'id_3'] } }
                ]
            };

            AdvancedTableColumnMenus.toggleRelationSingle(tId, 'c_rel');
            Assert.isTrue(AppState.databases[tId].columns[0].singleRecord);
            Assert.deepEqual(AppState.databases[tId].rows[0].cells.c_rel, ['id_1']);
        });

    test("ColumnMenus: toggleRelationBacklink crea la colonna inversa nel database di destinazione", () => {
            const tSrc = 'db_source_bl';
            const tTgt = 'db_target_bl';

            AppState.databases[tSrc] = {
                id: tSrc,
                title: 'Fatture',
                columns: [{ id: 'c_rel', name: 'Cliente', type: 'relation', targetTableId: tTgt, showBacklink: false }],
                rows: []
            };
            AppState.databases[tTgt] = {
                id: tTgt,
                title: 'Clienti',
                columns: [{ id: 'c_name', name: 'Ragione Sociale' }],
                rows: []
            };

            AdvancedTableColumnMenus.toggleRelationBacklink(tSrc, 'c_rel');

            const srcCol = AppState.databases[tSrc].columns[0];
            Assert.isTrue(srcCol.showBacklink);
            Assert.isNotNull(srcCol.backlinkColId);

            const tgtState = AppState.databases[tTgt];
            const blCol = tgtState.columns.find(c => c.id === srcCol.backlinkColId);
            Assert.isNotNull(blCol);
            Assert.strictEqual(blCol.type, 'relation_backlink');
            Assert.strictEqual(blCol.linkedTableId, tSrc);
        });

    test("ColumnMenus: toggleRelationBacklink invocato di nuovo rimuove la colonna inversa", () => {
            const tSrc = 'db_source_bl2';
            const tTgt = 'db_target_bl2';

            AppState.databases[tSrc] = {
                id: tSrc,
                title: 'Ordini',
                columns: [{ id: 'c_rel', name: 'Cliente', type: 'relation', targetTableId: tTgt, showBacklink: false }],
                rows: []
            };
            AppState.databases[tTgt] = {
                id: tTgt,
                title: 'Clienti',
                columns: [],
                rows: []
            };

            // 1. Attiva
            AdvancedTableColumnMenus.toggleRelationBacklink(tSrc, 'c_rel');
            const blId = AppState.databases[tSrc].columns[0].backlinkColId;

            // 2. Disattiva
            AdvancedTableColumnMenus.toggleRelationBacklink(tSrc, 'c_rel');
            Assert.isFalse(AppState.databases[tSrc].columns[0].showBacklink);
            Assert.strictEqual(AppState.databases[tTgt].columns.find(c => c.id === blId), undefined);
        });

    test("ColumnMenus: setBacklinkDisplay imposta 'list' o 'count'", () => {
            const tId = 'db_bldisp';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'bl_1', type: 'relation_backlink', backlinkDisplay: 'list' }],
                rows: []
            };

            AdvancedTableColumnMenus.setBacklinkDisplay(tId, 'bl_1', 'count');
            Assert.strictEqual(AppState.databases[tId].columns[0].backlinkDisplay, 'count');
        });

    test("ColumnMenus: setColDecimals imposta la precisione decimale (0-4)", () => {
            const tId = 'db_dec';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c_num', type: 'number', decimals: 'default' }],
                rows: []
            };

            AdvancedTableColumnMenus.setColDecimals(tId, 'c_num', 2);
            Assert.strictEqual(AppState.databases[tId].columns[0].decimals, 2);
        });

    test("ColumnMenus: moveCol sposta la colonna a sinistra di 1 posizione", () => {
            const tId = 'db_move_col';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }],
                rows: []
            };

            AdvancedTableColumnMenus.moveCol(tId, 'c2', -1);
            Assert.strictEqual(AppState.databases[tId].columns[0].id, 'c2');
            Assert.strictEqual(AppState.databases[tId].columns[1].id, 'c1');
        });

    test("ColumnMenus: moveCol sposta la colonna a destra di 1 posizione", () => {
            const tId = 'db_move_col2';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }],
                rows: []
            };

            AdvancedTableColumnMenus.moveCol(tId, 'c1', 1);
            Assert.strictEqual(AppState.databases[tId].columns[0].id, 'c2');
            Assert.strictEqual(AppState.databases[tId].columns[1].id, 'c1');
        });

    test("ColumnMenus: changeColType converte da 'number' a 'text' preservando la stringa", () => {
            const tId = 'db_conv_num_txt';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c1', name: 'Prezzo', type: 'number' }],
                rows: [{ id: 'r1', cells: { c1: 99.5 } }]
            };

            AdvancedTableColumnMenus.changeColType(tId, 'c1', 'text');
            Assert.strictEqual(AppState.databases[tId].columns[0].type, 'text');
            Assert.strictEqual(AppState.databases[tId].rows[0].cells.c1, '99.5');
        });

    test("ColumnMenus: changeColType converte da 'select' a 'multi-select' racchiudendo in array", () => {
            const tId = 'db_conv_sel_multi';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c1', name: 'Stato', type: 'select' }],
                selectOptions: { c1: ['Attivo'] },
                selectColors: { c1: { 'Attivo': 'hl-c1' } },
                rows: [{ id: 'r1', cells: { c1: 'Attivo' } }]
            };

            AdvancedTableColumnMenus.changeColType(tId, 'c1', 'multi-select');
            Assert.strictEqual(AppState.databases[tId].columns[0].type, 'multi-select');
            Assert.deepEqual(AppState.databases[tId].rows[0].cells.c1, ['Attivo']);
        });

    test("ColumnMenus: changeColType converte da stringa 'sì' a checkbox true", () => {
            const tId = 'db_conv_chk';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c1', name: 'Approvato', type: 'text' }],
                rows: [{ id: 'r1', cells: { c1: 'sì' } }, { id: 'r2', cells: { c1: 'no' } }]
            };

            AdvancedTableColumnMenus.changeColType(tId, 'c1', 'checkbox');
            Assert.strictEqual(AppState.databases[tId].columns[0].type, 'checkbox');
            Assert.strictEqual(AppState.databases[tId].rows[0].cells.c1, true);
            Assert.strictEqual(AppState.databases[tId].rows[1].cells.c1, false);
        });

    test("ColumnMenus: toggleVisibility impedisce di nascondere l'unica colonna visibile", () => {
            const tId = 'db_vis_block';
            AppState.databases[tId] = {
                id: tId,
                viewType: 'table',
                columns: [{ id: 'c_solo', name: 'Solo' }],
                viewConfig: { 'table': { hiddenCols: [] } },
                rows: []
            };

            let alertShown = false;
            const origAlert = window.alert;
            window.alert = () => { alertShown = true; };

            try {
                AdvancedTableColumnMenus.toggleVisibility(tId, 'c_solo');
                Assert.isTrue(alertShown);
                Assert.strictEqual(AppState.databases[tId].viewConfig['table'].hiddenCols.length, 0);
            } finally {
                window.alert = origAlert;
            }
        });

    test("ColumnMenus: saveColumnComment memorizza la stringa di commento", () => {
            const tId = 'db_comment';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c1', name: 'Codice', comment: '' }],
                rows: []
            };

            const dummyInput = document.createElement('textarea');
            dummyInput.id = 'advColCommentInput';
            dummyInput.value = 'Commento importante di colonna';
            document.body.appendChild(dummyInput);

            try {
                AdvancedTableColumnMenus.saveColumnComment(tId, 'c1');
                Assert.strictEqual(AppState.databases[tId].columns[0].comment, 'Commento importante di colonna');
            } finally {
                dummyInput.remove();
            }
        });

});
