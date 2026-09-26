/**
 * tests/test-advanced-table-select.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-select
 * Conteggio test case: 12
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Select: Pillole, Ordinamento A-Z & Colori (12 Test)", () => {

    test("Select: createSelectOption ordina alfabeticamente l'array memorizzato", () => {
            const tId = 'db_sel_alpha';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c_tag', type: 'select' }],
                selectOptions: { c_tag: ['Zeta', 'Beta'] },
                selectColors: { c_tag: {} },
                rows: [{ id: 'r1', cells: { c_tag: '' } }]
            };

            AdvancedTable.createSelectOption(tId, 'r1', 'c_tag', 'Alfa');
            Assert.deepEqual(AppState.databases[tId].selectOptions.c_tag, ['Alfa', 'Beta', 'Zeta']);
        });

    test("Select: createSelectOption assegna colore predefinito 'hl-c1' alla nuova opzione", () => {
            const tId = 'db_sel_color';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c_tag', type: 'select' }],
                selectOptions: { c_tag: [] },
                selectColors: { c_tag: {} },
                rows: [{ id: 'r1', cells: { c_tag: '' } }]
            };

            AdvancedTable.createSelectOption(tId, 'r1', 'c_tag', 'NuovoTag');
            Assert.strictEqual(AppState.databases[tId].selectColors.c_tag['NuovoTag'], 'hl-c1');
        });

    test("Select: renameSelectOption aggiorna il nome nel dizionario e preserva l'ordine A-Z", () => {
            const tId = 'db_sel_ren';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c1', type: 'select' }],
                selectOptions: { c1: ['Beta', 'VecchioZeta'] },
                selectColors: { c1: { 'VecchioZeta': 'hl-c4' } },
                rows: [{ id: 'r1', cells: { c1: 'VecchioZeta' } }]
            };

            AdvancedTable.renameSelectOption(null, tId, 'c1', 'VecchioZeta', 'AlfaRinominato');

            // 'AlfaRinominato' deve trovarsi all'indice 0 (prima di 'Beta')
            Assert.deepEqual(AppState.databases[tId].selectOptions.c1, ['AlfaRinominato', 'Beta']);
            Assert.strictEqual(AppState.databases[tId].selectColors.c1['AlfaRinominato'], 'hl-c4');
            Assert.strictEqual(AppState.databases[tId].rows[0].cells.c1, 'AlfaRinominato');
        });

    test("Select: renameSelectOption blocca nomi duplicati già esistenti", () => {
            const tId = 'db_sel_dup';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c1', type: 'select' }],
                selectOptions: { c1: ['Attivo', 'Chiuso'] },
                selectColors: { c1: {} },
                rows: []
            };

            let alertTriggered = false;
            const origAlert = window.alert;
            window.alert = () => { alertTriggered = true; };

            try {
                AdvancedTable.renameSelectOption(null, tId, 'c1', 'Chiuso', 'Attivo');
                Assert.isTrue(alertTriggered);
                Assert.isTrue(AppState.databases[tId].selectOptions.c1.includes('Chiuso'));
            } finally {
                window.alert = origAlert;
            }
        });

    test("Select: deleteSelectOption rimuove l'opzione da tutte le celle collegate", () => {
            const tId = 'db_sel_purge';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c_multi', type: 'multi-select' }],
                selectOptions: { c_multi: ['Keep', 'DeleteMe'] },
                selectColors: { c_multi: { 'DeleteMe': 'hl-c10' } },
                rows: [
                    { id: 'r1', cells: { c_multi: ['Keep', 'DeleteMe'] } },
                    { id: 'r2', cells: { c_multi: ['DeleteMe'] } }
                ]
            };

            const origConfirm = window.confirm;
            window.confirm = () => true;

            try {
                const evMock = { stopPropagation: () => {} };
                AdvancedTable.deleteSelectOption(evMock, tId, 'c_multi', 'DeleteMe');

                Assert.deepEqual(AppState.databases[tId].selectOptions.c_multi, ['Keep']);
                Assert.strictEqual(AppState.databases[tId].selectColors.c_multi['DeleteMe'], undefined);
                Assert.deepEqual(AppState.databases[tId].rows[0].cells.c_multi, ['Keep']);
                Assert.deepEqual(AppState.databases[tId].rows[1].cells.c_multi, []);
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("Select: toggleSelectValue su colonna 'select' singola deseleziona se il valore è già presente", () => {
            const tId = 'db_sel_toggle_off';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c1', type: 'select' }],
                rows: [{ id: 'r1', cells: { c1: 'Scelto' } }]
            };

            AdvancedTable.toggleSelectValue(tId, 'r1', 'c1', 'Scelto');
            Assert.strictEqual(AppState.databases[tId].rows[0].cells.c1, '');
        });

    test("Select: toggleSelectValue su colonna 'multi-select' accoda o toglie elemento", () => {
            const tId = 'db_sel_multi_tog';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c1', type: 'multi-select' }],
                rows: [{ id: 'r1', cells: { c1: ['A'] } }]
            };

            // Accoda 'B'
            AdvancedTable.toggleSelectValue(tId, 'r1', 'c1', 'B');
            Assert.deepEqual(AppState.databases[tId].rows[0].cells.c1, ['A', 'B']);

            // Toglie 'A'
            AdvancedTable.toggleSelectValue(tId, 'r1', 'c1', 'A');
            Assert.deepEqual(AppState.databases[tId].rows[0].cells.c1, ['B']);
        });

    test("Select: clearSelect svuota la cella (stringa vuota per select, array vuoto per multi-select)", () => {
            const tId = 'db_sel_clr';
            AppState.databases[tId] = {
                id: tId,
                columns: [
                    { id: 'c_s', type: 'select' },
                    { id: 'c_m', type: 'multi-select' }
                ],
                rows: [{ id: 'r1', cells: { c_s: 'Valore', c_m: ['A', 'B'] } }]
            };

            AdvancedTable.clearSelect(tId, 'r1', 'c_s');
            Assert.strictEqual(AppState.databases[tId].rows[0].cells.c_s, '');

            AdvancedTable.clearSelect(tId, 'r1', 'c_m');
            Assert.deepEqual(AppState.databases[tId].rows[0].cells.c_m, []);
        });

    test("Select: setTagColor assegna una classe colore tematica alla pillola", () => {
            const tId = 'db_sel_set_color';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c1', type: 'select' }],
                selectColors: { c1: {} },
                rows: [{ id: 'r1', cells: { c1: 'Importante' } }]
            };

            const evMock = { stopPropagation: () => {} };
            AdvancedTable.setTagColor(evMock, tId, 'r1', 'c1', 'Importante', 'hl-c10', null);
            Assert.strictEqual(AppState.databases[tId].selectColors.c1['Importante'], 'hl-c10');
        });

    test("Select: filterSelectOptions filtra visivamente gli elementi del dropdown", () => {
            const container = document.createElement('div');
            container.id = 'advSelectOptionsContainer';
            container.innerHTML = `
                <div class="adv-select-item"><span class="adv-select-pill">Bozza</span></div>
                <div class="adv-select-item"><span class="adv-select-pill">Pubblicato</span></div>
            `;
            document.body.appendChild(container);

            try {
                AdvancedTable.filterSelectOptions('pub');
                const items = container.querySelectorAll('.adv-select-item');
                Assert.strictEqual(items[0].style.display, 'none');
                Assert.strictEqual(items[1].style.display, 'flex');
            } finally {
                container.remove();
            }
        });

    test("Select: createSelectOptionFromInput svuota l'input e crea l'opzione", () => {
            // Pulizia difensiva da eventuali dropdown orfani lasciati da test precedenti
            document.querySelectorAll('#advCreateSelectInput').forEach(el => el.remove());

            const dummyInput = document.createElement('input');
            dummyInput.id = 'advCreateSelectInput';
            dummyInput.value = 'NuovoElemento';
            document.body.appendChild(dummyInput);

            const tId = 'db_sel_from_input';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'c1', type: 'select' }],
                selectOptions: { c1: [] },
                selectColors: { c1: {} },
                rows: [{ id: 'r1', cells: { c1: '' } }]
            };

            try {
                AdvancedTable.createSelectOptionFromInput(tId, 'r1', 'c1', 'NuovoElemento');
                Assert.strictEqual(dummyInput.value, '');
                Assert.isTrue(AppState.databases[tId].selectOptions.c1.includes('NuovoElemento'));
            } finally {
                dummyInput.remove();
            }
        });

    test("Select: pillColors contiene 10 varianti cromatiche hl-c*", () => {
            Assert.strictEqual(AdvancedTable.pillColors.length, 10);
            Assert.isTrue(AdvancedTable.pillColors.includes('hl-c1'));
            Assert.isTrue(AdvancedTable.pillColors.includes('hl-c10'));
        });

});
