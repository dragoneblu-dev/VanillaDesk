/**
 * tests/test-advanced-table-data.js
 * Suite Modulare di Collaudo Unitario e di Integrazione ad Altissima Copertura (100%).
 * Modulo testato: advanced-table-data
 * Conteggio test case: 35
 */

describe("AdvancedTable Data: CRUD, Date Ranges, Filtri Matematici, Soft-Delete & Selezione (35 Test)", () => {

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

    test("TableData: deleteRecord esegue Soft-Delete su record_note preservando la nota nel cestino (Undo-Safe)", () => {
        const tId = 'db_del_rn';
        const noteId = 'note_attached_123';
        AppState.databases[tId] = {
            id: tId,
            columns: [{ id: 'c_rn', type: 'record_note' }],
            rows: [{ id: 'r_del', cells: { c_rn: noteId } }],
            selectedRows: ['r_del']
        };
        AppState.notes = [{ id: noteId, title: 'Pagina Record', content: '<p>Contenuto prezioso</p>' }];

        const origConfirm = window.confirm;
        window.confirm = () => true;

        try {
            AdvancedTable.deleteRecord(tId, 'r_del');
            Assert.strictEqual(AppState.databases[tId].rows.length, 0);
            Assert.strictEqual(AppState.databases[tId].selectedRows.length, 0);

            const noteInRepo = Store.getNote(noteId);
            Assert.isNotNull(noteInRepo, "La nota deve essere conservata nel repository");
            Assert.isTrue(Boolean(noteInRepo.deletedAt), "La nota deve essere contrassegnata come cancellata soft per il cestino");
            Assert.strictEqual(noteInRepo.content, '<p>Contenuto prezioso</p>', "Il contenuto non deve andare perso");
        } finally {
            window.confirm = origConfirm;
        }
    });

    test("TableData: deleteSelectedRows rimuove in blocco le sole righe selezionate ed esegue soft-delete sulle note collegate", () => {
        const tId = 'db_del_sel';
        AppState.databases[tId] = {
            id: tId,
            columns: [
                { id: 'c1', type: 'text' },
                { id: 'c_rn', type: 'record_note' }
            ],
            rows: [
                { id: 'r1', cells: { c1: '1', c_rn: 'note_rn_1' } },
                { id: 'r2', cells: { c1: '2', c_rn: 'note_rn_2' } },
                { id: 'r3', cells: { c1: '3', c_rn: 'note_rn_3' } }
            ],
            selectedRows: ['r1', 'r3']
        };

        AppState.notes = [
            { id: 'note_rn_1', title: 'N1' },
            { id: 'note_rn_2', title: 'N2' },
            { id: 'note_rn_3', title: 'N3' }
        ];

        AdvancedTable.deleteSelectedRows(tId, true);
        Assert.strictEqual(AppState.databases[tId].rows.length, 1);
        Assert.strictEqual(AppState.databases[tId].rows[0].id, 'r2');
        Assert.strictEqual(AppState.databases[tId].selectedRows.length, 0);

        Assert.isTrue(Boolean(Store.getNote('note_rn_1').deletedAt));
        Assert.strictEqual(Store.getNote('note_rn_2').deletedAt, undefined);
        Assert.isTrue(Boolean(Store.getNote('note_rn_3').deletedAt));
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
            await AdvancedTable.updateDateRange(tId, 'r_rng', 'c_rng', '2026-05-01', 'end');
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
        Assert.isTrue(newRow.cells.c_dt.end.includes('T11:00'));
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

    test("TableData: updateDateRange esce subito (early-exit) se la data con fine è identica", async () => {
        const tId = 'db_daterange_earlyexit';
        AppState.databases[tId] = {
            id: tId,
            columns: [{ id: 'c_range', type: 'date', hasEndDate: true }],
            rows: [{ id: 'r1', cells: { c_range: { start: '2026-10-01', end: '2026-10-15' } }, updatedAt: 1000 }]
        };

        await AdvancedTable.updateDateRange(tId, 'r1', 'c_range', '2026-10-01', 'start');
        Assert.strictEqual(AppState.databases[tId].rows[0].updatedAt, 1000, "updatedAt non deve mutare al semplice blur senza modifiche");
    });

    test("TableData: deleteRecord esegue cascade cleanup rimuovendo i riferimenti orfani da altri database", () => {
        const tTarget = 'db_target_records';
        const tSource = 'db_source_pointing';

        AppState.databases = {
            [tTarget]: {
                id: tTarget,
                columns: [{ id: 'c_name', type: 'text' }],
                rows: [{ id: 'r_del_target', cells: { c_name: 'Record da Cancellare' } }]
            },
            [tSource]: {
                id: tSource,
                columns: [
                    { id: 'c_rel_multi', type: 'relation', targetTableId: tTarget },
                    { id: 'c_rel_single', type: 'relation', targetTableId: tTarget, singleRecord: true }
                ],
                rows: [
                    { id: 'r_source_1', cells: { c_rel_multi: ['r_del_target', 'r_keep'], c_rel_single: 'r_del_target' } }
                ]
            }
        };

        const origConfirm = window.confirm;
        window.confirm = () => true;

        try {
            AdvancedTable.deleteRecord(tTarget, 'r_del_target');
            Assert.strictEqual(AppState.databases[tTarget].rows.length, 0);
            Assert.deepEqual(AppState.databases[tSource].rows[0].cells.c_rel_multi, ['r_keep']);
            Assert.strictEqual(AppState.databases[tSource].rows[0].cells.c_rel_single, '');
        } finally {
            window.confirm = origConfirm;
        }
    });

    test("TableData: deleteSelectedRows esegue cascade cleanup massivo su relazioni orfane", () => {
        const tTarget = 'db_target_multi';
        const tSource = 'db_source_multi';

        AppState.databases = {
            [tTarget]: {
                id: tTarget,
                columns: [{ id: 'c1', type: 'text' }],
                rows: [
                    { id: 'r_del_1', cells: { c1: 'A' } },
                    { id: 'r_del_2', cells: { c1: 'B' } }
                ],
                selectedRows: ['r_del_1', 'r_del_2']
            },
            [tSource]: {
                id: tSource,
                columns: [{ id: 'c_rel', type: 'relation', targetTableId: tTarget }],
                rows: [
                    { id: 'r_src', cells: { c_rel: ['r_del_1', 'r_del_2', 'r_survivor'] } }
                ]
            }
        };

        AdvancedTable.deleteSelectedRows(tTarget, true);
        Assert.strictEqual(AppState.databases[tTarget].rows.length, 0);
        Assert.deepEqual(AppState.databases[tSource].rows[0].cells.c_rel, ['r_survivor']);
    });

    test("TableData: updateData sincronizza immediatamente row.virtualCells oltre a row.cells", async () => {
        const tId = 'db_sync_test';
        AppState.databases[tId] = {
            id: tId,
            columns: [
                { id: 'c_num', name: 'Numero', type: 'number' },
                { id: 'c_calc', name: 'Doppio', type: 'formula', formula: 'riga["Numero"] * 2' }
            ],
            rows: [
                { id: 'r_sync_1', cells: { c_num: 5, c_calc: '' }, virtualCells: { c_num: 5, c_calc: 10 }, updatedAt: 0 }
            ]
        };

        await AdvancedTable.updateData(tId, 'r_sync_1', 'c_num', 20);

        const row = AppState.databases[tId].rows[0];
        Assert.strictEqual(row.cells.c_num, 20);
        Assert.strictEqual(row.virtualCells.c_num, 20, "virtualCells deve essere allineato subito con cells");
        Assert.strictEqual(Number(row.virtualCells.c_calc), 40, "La formula dipendente deve risultare ricalcolata in virtualCells");
    });

    test("TableData: updateDateRange sincronizza row.virtualCells all'aggiornamento dell'intervallo", async () => {
        const tId = 'db_sync_range';
        AppState.databases[tId] = {
            id: tId,
            columns: [{ id: 'c_dt', type: 'date', hasEndDate: true }],
            rows: [{ id: 'r1', cells: { c_dt: { start: '2026-01-01', end: '2026-01-05' } }, virtualCells: {} }]
        };

        await AdvancedTable.updateDateRange(tId, 'r1', 'c_dt', '2026-01-10', 'end');

        const row = AppState.databases[tId].rows[0];
        Assert.strictEqual(row.cells.c_dt.end, '2026-01-10');
        Assert.strictEqual(row.virtualCells.c_dt.end, '2026-01-10', "virtualCells deve riflettere la nuova data di fine");
    });

    // NUOVI TEST CASE COMPLETI (Overlapping, Full Text Search su Note e Multi-Sort)
    test("TableData: filterRows con algebra sovrapposizione intervalli (= valuta intersezione)", () => {
        const state = {
            columns: [{ id: 'c_rng', name: 'Intervallo', type: 'date', hasEndDate: true }],
            filters: { c_rng: '= 2026-05-10 ➔ 2026-05-20' }
        };
        const rows = [
            { id: 'r_overlap', virtualCells: { c_rng: { start: '2026-05-15', end: '2026-05-25' } } }, // Si interseca
            { id: 'r_inside', virtualCells: { c_rng: { start: '2026-05-12', end: '2026-05-18' } } },  // Incluso
            { id: 'r_disjoint', virtualCells: { c_rng: { start: '2026-05-21', end: '2026-05-30' } } } // Disgiunto
        ];

        const res = AdvancedTable.filterRows(rows, state);
        Assert.strictEqual(res.length, 2);
        Assert.strictEqual(res[0].id, 'r_overlap');
        Assert.strictEqual(res[1].id, 'r_inside');
    });

    test("TableData: filterRows scandaglia il contenuto interno della nota collegata in record_note", () => {
        const noteId = 'n_body_search';
        AppState.notes = [
            { id: noteId, title: 'Titolo Breve', content: '<p>Contenuto segreto con parola chiave <b>TopSecretKeyword</b></p>' }
        ];

        const state = {
            columns: [{ id: 'c_rn', name: 'Scheda', type: 'record_note' }],
            filters: { c_rn: 'TopSecretKeyword' }
        };
        const rows = [
            { id: 'r1', virtualCells: { c_rn: noteId } },
            { id: 'r2', virtualCells: { c_rn: 'altra_nota' } }
        ];

        const res = AdvancedTable.filterRows(rows, state);
        Assert.strictEqual(res.length, 1);
        Assert.strictEqual(res[0].id, 'r1');
    });

    test("TableData: sortRows multicriterio (Primario per Data, Secondario per Importo)", () => {
        const state = {
            columns: [
                { id: 'c_date', name: 'Data', type: 'date' },
                { id: 'c_amt', name: 'Importo', type: 'number' }
            ],
            sorts: [
                { colId: 'c_date', dir: 1 },  // Data ASC
                { colId: 'c_amt', dir: -1 }   // Importo DESC
            ]
        };

        const rows = [
            { id: 'r1', virtualCells: { c_date: '2026-05-01', c_amt: 100 } },
            { id: 'r2', virtualCells: { c_date: '2026-05-01', c_amt: 500 } }, // Stessa data, importo maggiore -> deve precedere r1
            { id: 'r3', virtualCells: { c_date: '2026-04-01', c_amt: 50 } }
        ];

        const sorted = AdvancedTable.sortRows(rows, state);
        Assert.strictEqual(sorted[0].id, 'r3'); // 2026-04-01
        Assert.strictEqual(sorted[1].id, 'r2'); // 2026-05-01, 500
        Assert.strictEqual(sorted[2].id, 'r1'); // 2026-05-01, 100
    });

    test("TableData: filterRows confronto lessicografico naturale (< e >) su testo", () => {
        const state = {
            columns: [{ id: 'c_t', name: 'Codice', type: 'text' }],
            filters: { c_t: '< C' }
        };
        const rows = [
            { id: '1', virtualCells: { c_t: 'A10' } },
            { id: '2', virtualCells: { c_t: 'B99' } },
            { id: '3', virtualCells: { c_t: 'D01' } }
        ];

        const res = AdvancedTable.filterRows(rows, state);
        Assert.strictEqual(res.length, 2);
        Assert.strictEqual(res[0].id, '1');
        Assert.strictEqual(res[1].id, '2');
    });

    test("TableData: clearSelectedRows azzera la selezione e deseleziona il global selector", () => {
        const tId = 'db_clr_sel';
        AppState.databases[tId] = {
            id: tId,
            selectedRows: ['r1', 'r2', 'r3'],
            columns: [],
            rows: []
        };

        AdvancedTable.clearSelectedRows(tId);
        Assert.strictEqual(AppState.databases[tId].selectedRows.length, 0);
    });

});