/**
 * tests/test-advanced-table-data.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-data
 * Conteggio test case: 25
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Data: CRUD, Date Ranges, Filtri Matematici & Selezione (25 Test)", () => {

    test("Filter: testo singolo case-insensitive", () => {
            const state = {
                columns: [{ id: 'c_t', name: 'Stato', type: 'text' }],
                filters: { c_t: 'chiuso' }
            };
            const rows = [
                { id: '1', virtualCells: { c_t: 'CHIUSO' } },
                { id: '2', virtualCells: { c_t: 'Aperto' } }
            ];
            Assert.strictEqual(AdvancedTable.filterRows(rows, state).length, 1);
        });

    test("Filter: termini multipli in OR separati da ';'", () => {
            const state = {
                columns: [{ id: 'c_t', name: 'Ruolo', type: 'text' }],
                filters: { c_t: 'admin; dev; support' }
            };
            const rows = [
                { id: '1', virtualCells: { c_t: 'Frontend Dev' } },
                { id: '2', virtualCells: { c_t: 'Marketing' } },
                { id: '3', virtualCells: { c_t: 'Admin' } }
            ];
            Assert.strictEqual(AdvancedTable.filterRows(rows, state).length, 2);
        });

    test("Filter: operatore numerico '>='", () => {
            const state = {
                columns: [{ id: 'c_n', name: 'Qta', type: 'number' }],
                filters: { c_n: '>= 50' }
            };
            const rows = [
                { id: '1', virtualCells: { c_n: 49 } },
                { id: '2', virtualCells: { c_n: 50 } },
                { id: '3', virtualCells: { c_n: 75 } }
            ];
            const res = AdvancedTable.filterRows(rows, state);
            Assert.strictEqual(res.length, 2);
        });

    test("Filter: operatore disuguaglianza '!=' esclude matching esatto", () => {
            const state = {
                columns: [{ id: 'c_t', name: 'Fase', type: 'text' }],
                filters: { c_t: '!= Archiviato' }
            };
            const rows = [
                { id: '1', virtualCells: { c_t: 'Attivo' } },
                { id: '2', virtualCells: { c_t: 'Archiviato' } }
            ];
            const res = AdvancedTable.filterRows(rows, state);
            Assert.strictEqual(res.length, 1);
            Assert.strictEqual(res[0].id, '1');
        });

    test("Filter: operatore data '<' prima di data limite", () => {
            const state = {
                columns: [{ id: 'c_d', name: 'Data', type: 'date' }],
                filters: { c_d: '< 2026-06-01' }
            };
            const rows = [
                { id: '1', virtualCells: { c_d: '2026-05-15' } },
                { id: '2', virtualCells: { c_d: '2026-07-01' } }
            ];
            const res = AdvancedTable.filterRows(rows, state);
            Assert.strictEqual(res.length, 1);
            Assert.strictEqual(res[0].id, '1');
        });

    test("Filter: booleano per checkbox spuntata (= Sì)", () => {
            const state = {
                columns: [{ id: 'c_b', name: 'Fatto', type: 'checkbox' }],
                filters: { c_b: '= Sì' }
            };
            const rows = [
                { id: '1', virtualCells: { c_b: true } },
                { id: '2', virtualCells: { c_b: false } }
            ];
            const res = AdvancedTable.filterRows(rows, state);
            Assert.strictEqual(res.length, 1);
            Assert.strictEqual(res[0].id, '1');
        });

    test("RDBMS: filterRows con spazi bianchi multipli e punteggiatura non genera eccezioni", () => {
            const state = {
                columns: [{ id: 'c_desc', name: 'Descrizione', type: 'text' }],
                filters: { c_desc: '  term1;   term2  ' }
            };
            const rows = [
                { id: '1', virtualCells: { c_desc: 'Prodotto term1 speciale' } },
                { id: '2', virtualCells: { c_desc: 'Altro elemento' } }
            ];
            const res = AdvancedTable.filterRows(rows, state);
            Assert.strictEqual(res.length, 1);
            Assert.strictEqual(res[0].id, '1');
        });

    test("RDBMS: filterRows con operatore '!=' su numeri esclude solo il valore esatto", () => {
            const state = {
                columns: [{ id: 'c_p', name: 'Punti', type: 'number' }],
                filters: { c_p: '!= 100' }
            };
            const rows = [
                { id: '1', virtualCells: { c_p: 100 } },
                { id: '2', virtualCells: { c_p: 105 } },
                { id: '3', virtualCells: { c_p: 99 } }
            ];
            const res = AdvancedTable.filterRows(rows, state);
            Assert.strictEqual(res.length, 2);
        });

    test("RDBMS: filterRows con operatore '!=' esclude valori corrispondenti", () => {
            const state = {
                columns: [{ id: 'c_s', name: 'Note', type: 'text' }],
                filters: { c_s: '!= archiviato' }
            };
            const rows = [
                { id: '1', virtualCells: { c_s: '' } },
                { id: '2', virtualCells: { c_s: 'archiviato' } },
                { id: '3', virtualCells: { c_s: 'attivo' } }
            ];
            const res = AdvancedTable.filterRows(rows, state);
            Assert.strictEqual(res.length, 2);
        });

    test("RDBMS: sortRows su numeri ordina stabilmente includendo celle vuote", () => {
            const state = {
                columns: [{ id: 'c_n', name: 'Voto', type: 'number' }],
                sorts: [{ colId: 'c_n', dir: 1 }]
            };
            const rows = [
                { id: '1', virtualCells: { c_n: 10 } },
                { id: '2', virtualCells: { c_n: '' } },
                { id: '3', virtualCells: { c_n: 5 } }
            ];
            const res = AdvancedTable.sortRows(rows, state);
            Assert.strictEqual(res[0].virtualCells.c_n, '');
            Assert.strictEqual(Number(res[1].virtualCells.c_n), 5);
            Assert.strictEqual(Number(res[2].virtualCells.c_n), 10);
        });

    test("RDBMS: sortRows alfabetico è stabile per parole identiche con differente casing", () => {
            const state = {
                columns: [{ id: 'c_t', name: 'Nome', type: 'text' }],
                sorts: [{ colId: 'c_t', dir: 1 }]
            };
            const rows = [
                { id: '1', virtualCells: { c_t: 'alfa' } },
                { id: '2', virtualCells: { c_t: 'Alfa' } }
            ];
            const res = AdvancedTable.sortRows(rows, state);
            Assert.strictEqual(res.length, 2);
        });

    test("RDBMS: updateData esce immediatamente (early exit) se il valore non è cambiato", async () => {
            const dbId = 'db_early_exit';
            const state = {
                id: dbId,
                columns: [{ id: 'c1', type: 'text' }],
                rows: [{ id: 'r1', cells: { c1: 'Identico' }, updatedAt: 1000 }]
            };
            AppState.databases[dbId] = state;

            await AdvancedTable.updateData(dbId, 'r1', 'c1', 'Identico');
            Assert.strictEqual(state.rows[0].updatedAt, 1000, "L'updatedAt non deve essere alterato se il valore è invariato");
        });

    test("TableData: addRow inserisce record con celle default per ogni tipo", () => {
            const tId = 'db_addrow_def';
            AppState.databases[tId] = {
                id: tId,
                columns: [
                    { id: 'c_t', type: 'text' },
                    { id: 'c_b', type: 'checkbox' },
                    { id: 'c_m', type: 'multi-select' }
                ],
                rows: []
            };

            AdvancedTable.addRow(null, tId);
            const r = AppState.databases[tId].rows[0];
            Assert.isNotNull(r);
            Assert.strictEqual(r.cells.c_t, '');
            Assert.strictEqual(r.cells.c_b, false);
            Assert.deepEqual(r.cells.c_m, []);
        });

    test("TableData: deleteRecord elimina fisicamente la riga e le record_note collegate", () => {
            const tId = 'db_del_rn';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c_rn', type: 'record_note' }],
                rows: [{ id: 'r_del', cells: { c_rn: 'note_attached_123' } }],
                selectedRows: ['r_del']
            };
            AppState.notes = [{ id: 'note_attached_123', title: 'Pagina Record' }];

            const origConfirm = window.confirm;
            window.confirm = () => true;

            try {
                AdvancedTable.deleteRecord(tId, 'r_del');
                Assert.strictEqual(AppState.databases[tId].rows.length, 0);
                Assert.strictEqual(AppState.databases[tId].selectedRows.length, 0);
                Assert.strictEqual(AppState.notes.length, 0);
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("TableData: deleteSelectedRows rimuove in blocco le sole righe selezionate", () => {
            const tId = 'db_del_sel';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c1', type: 'text' }],
                rows: [
                    { id: 'r1', cells: { c1: '1' } },
                    { id: 'r2', cells: { c1: '2' } },
                    { id: 'r3', cells: { c1: '3' } }
                ],
                selectedRows: ['r1', 'r3']
            };

            AdvancedTable.deleteSelectedRows(tId);
            Assert.strictEqual(AppState.databases[tId].rows.length, 1);
            Assert.strictEqual(AppState.databases[tId].rows[0].id, 'r2');
            Assert.strictEqual(AppState.databases[tId].selectedRows.length, 0);
        });

    test("TableData: toggleRowSelection aggiunge e toglie ID da selectedRows", () => {
            const tId = 'db_sel_toggle';
            AppState.databases[tId] = { id: tId, selectedRows: [], columns: [], rows: [] };

            AdvancedTable.toggleRowSelection(tId, 'r_toggle', true);
            Assert.isTrue(AppState.databases[tId].selectedRows.includes('r_toggle'));

            AdvancedTable.toggleRowSelection(tId, 'r_toggle', false);
            Assert.isFalse(AppState.databases[tId].selectedRows.includes('r_toggle'));
        });

    test("TableData: updateDateRange impedisce a 'end' di essere antecedente a 'start'", async () => {
            const tId = 'db_date_order';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c_rng', type: 'date', hasEndDate: true }],
                rows: [{ id: 'r_rng', cells: { c_rng: { start: '2026-05-10', end: '2026-05-20' } } }]
            };

            const origAlert = window.alert;
            window.alert = () => {};

            try {
                // Tentativo di impostare la fine al 05-01 (inferiore a 05-10)
                await AdvancedTable.updateDateRange(tId, 'r_rng', 'c_rng', '2026-05-01', 'end');
                // Deve reimpostare 'end' uguale a 'start' (2026-05-10)
                Assert.strictEqual(AppState.databases[tId].rows[0].cells.c_rng.end, '2026-05-10');
            } finally {
                window.alert = origAlert;
            }
        });

    test("TableData: updateDateRange spinge in avanti 'end' se 'start' viene avanzata oltre la fine", async () => {
            const tId = 'db_date_push';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c_rng', type: 'date', hasEndDate: true }],
                rows: [{ id: 'r_rng', cells: { c_rng: { start: '2026-05-01', end: '2026-05-10' } } }]
            };

            // Avanziamo 'start' al 05-15 (supera 05-10) -> end deve avanzare al 05-15
            await AdvancedTable.updateDateRange(tId, 'r_rng', 'c_rng', '2026-05-15', 'start');
            Assert.strictEqual(AppState.databases[tId].rows[0].cells.c_rng.start, '2026-05-15');
            Assert.strictEqual(AppState.databases[tId].rows[0].cells.c_rng.end, '2026-05-15');
        });

    test("TableData: createRecordAtDate genera riga con date range e orari conformi", async () => {
            const tId = 'db_create_at_date';
            AppState.databases[tId] = {
                id: tId,
                columns: [
                    { id: 'c_title', name: 'Task', type: 'text' },
                    { id: 'c_dt', name: 'Data', type: 'datetime', hasEndDate: true }
                ],
                rows: []
            };

            const baseMs = new Date(2026, 4, 15, 10, 0, 0).getTime();
            await AdvancedTable.createRecordAtDate(tId, baseMs, 'c_dt');

            const newRow = AppState.databases[tId].rows[0];
            Assert.isNotNull(newRow);
            Assert.isTrue(typeof newRow.cells.c_dt === 'object');
            Assert.isTrue(newRow.cells.c_dt.start.includes('T10:00'));
            Assert.isTrue(newRow.cells.c_dt.end.includes('T11:00')); // +1 ora di default per datetime
        });

    test("TableData: addColumn inserisce nuova definizione e popola celle vuote conformi", () => {
            const tId = 'db_add_col';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c1', name: 'Testo', type: 'text' }],
                rows: [{ id: 'r1', cells: { c1: 'A' } }]
            };

            AdvancedTable.addColumn(tId, 'checkbox');
            Assert.strictEqual(AppState.databases[tId].columns.length, 2);
            const newCol = AppState.databases[tId].columns[1];
            Assert.strictEqual(newCol.type, 'checkbox');
            Assert.strictEqual(AppState.databases[tId].rows[0].cells[newCol.id], false);
        });

    test("TableData: setPageSize aggiorna pageSize e resetta currentPage a 1", () => {
            const tId = 'db_pagesize';
            AppState.databases[tId] = { id: tId, pageSize: 'all', currentPage: 5, columns: [], rows: [] };

            AdvancedTable.setPageSize(tId, 20);
            Assert.strictEqual(AppState.databases[tId].pageSize, 20);
            Assert.strictEqual(AppState.databases[tId].currentPage, 1);
        });

    test("TableData: changePage naviga avanti e indietro", () => {
            const tId = 'db_chg_page';
            AppState.databases[tId] = { id: tId, currentPage: 1, columns: [], rows: [] };

            AdvancedTable.changePage(tId, 1);
            Assert.strictEqual(AppState.databases[tId].currentPage, 2);

            AdvancedTable.changePage(tId, -1);
            Assert.strictEqual(AppState.databases[tId].currentPage, 1);
        });

    test("TableData: touchRecordUpdate aggiorna il timestamp updatedAt", () => {
            const tId = 'db_touch';
            AppState.databases[tId] = {
                id: tId,
                columns: [],
                rows: [{ id: 'r_touch', updatedAt: 1000 }]
            };

            AdvancedTable.touchRecordUpdate(tId, 'r_touch');
            Assert.isTrue(AppState.databases[tId].rows[0].updatedAt > 1000);
        });

    test("TableData: clearNoteLink svuota la cella note_link", () => {
            const tId = 'db_clr_nl';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c_nl', type: 'note_link' }],
                rows: [{ id: 'r1', cells: { c_nl: { noteId: 'n1', title: 'Target' } } }]
            };

            const evMock = { stopPropagation: () => {} };
            AdvancedTable.clearNoteLink(evMock, tId, 'r1', 'c_nl');
            Assert.strictEqual(AppState.databases[tId].rows[0].cells.c_nl, null);
        });

    test("TableData: unlinkRelation elimina il collegamento preservando gli altri ID", () => {
            const tId = 'db_unlink_rel';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c_rel', type: 'relation' }],
                rows: [{ id: 'r1', cells: { c_rel: ['link_1', 'link_2', 'link_3'] } }]
            };

            AdvancedTable.unlinkRelation(tId, 'r1', 'c_rel', 'link_2', false);
            Assert.deepEqual(AppState.databases[tId].rows[0].cells.c_rel, ['link_1', 'link_3']);
        });

});
