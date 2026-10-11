/**
 * tests/test-advanced-table-render.js
 * Suite Modulare di Collaudo Unitario e di Integrazione per il Rendering Grafico Tabellare.
 * Modulo testato: advanced-table-render
 * Conteggio test case: 15
 * Generato automaticamente il: 2026-10-11 19:40:00
 */

describe("AdvancedTable Render: Griglia HTML, Paginazione, Selezione & Stili Cella (15 Test)", () => {

    test("Render: generazione struttura base con thead, tbody e colonne visibili", () => {
        const tId = 'db_render_base';
        AppState.databases[tId] = {
            id: tId,
            title: 'Anagrafica Base',
            columns: [
                { id: 'c1', name: 'Nome', type: 'text', width: 200 },
                { id: 'c2', name: 'Email', type: 'text', width: 250 }
            ],
            rows: [
                { id: 'r1', cells: { c1: 'Mario Rossi', c2: 'mario@example.com' } }
            ]
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        wrapper.className = 'adv-table-wrapper';
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const tableEl = wrapper.querySelector('table.adv-table');
            Assert.isNotNull(tableEl);

            const thList = Array.from(wrapper.querySelectorAll('thead th[data-col]'));
            Assert.strictEqual(thList.length, 2);
            Assert.strictEqual(thList[0].getAttribute('data-col'), 'c1');
            Assert.strictEqual(thList[1].getAttribute('data-col'), 'c2');

            const trList = wrapper.querySelectorAll('tbody tr');
            Assert.strictEqual(trList.length, 1);
        } finally {
            wrapper.remove();
        }
    });

    test("Render: occultamento delle colonne specificate in viewConfig.table.hiddenCols", () => {
        const tId = 'db_render_hidden';
        AppState.databases[tId] = {
            id: tId,
            columns: [
                { id: 'c_vis', name: 'Visibile', type: 'text' },
                { id: 'c_hid', name: 'Nascosta', type: 'text' }
            ],
            viewConfig: {
                table: { hiddenCols: ['c_hid'] }
            },
            rows: [{ id: 'r1', cells: { c_vis: 'Sì', c_hid: 'No' } }]
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const thList = Array.from(wrapper.querySelectorAll('thead th[data-col]'));
            Assert.strictEqual(thList.length, 1);
            Assert.strictEqual(thList[0].getAttribute('data-col'), 'c_vis');
        } finally {
            wrapper.remove();
        }
    });

    test("Render: applicazione corretta degli indicatori di ordinamento asc/desc (↑, ↓) sulle intestazioni", () => {
        const tId = 'db_render_sort_indicators';
        AppState.databases[tId] = {
            id: tId,
            columns: [
                { id: 'c_num', name: 'Punteggio', type: 'number' }
            ],
            sorts: [{ colId: 'c_num', dir: -1 }], // DESC
            rows: [{ id: 'r1', cells: { c_num: 100 } }]
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const th = wrapper.querySelector('thead th[data-col="c_num"]');
            Assert.isNotNull(th);
            Assert.isTrue(th.innerText.includes('↓'), "L'indicatore di ordinamento discendente deve essere visibile");
        } finally {
            wrapper.remove();
        }
    });

    test("Render: rendering del tooltip su th contenente commento colonna e filtro attivo", () => {
        const tId = 'db_render_th_tooltip';
        AppState.databases[tId] = {
            id: tId,
            columns: [
                { id: 'c_desc', name: 'Note', type: 'text', comment: 'Descrizione dettagliata interna' }
            ],
            filters: { c_desc: 'Attivo' },
            rows: [{ id: 'r1', cells: { c_desc: 'Attivo' } }]
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const th = wrapper.querySelector('thead th[data-col="c_desc"]');
            Assert.isNotNull(th);
            const tooltip = th.getAttribute('data-tooltip');
            Assert.isNotNull(tooltip);
            Assert.isTrue(tooltip.includes('Descrizione dettagliata interna'));
            Assert.isTrue(tooltip.includes('Attivo'));
        } finally {
            wrapper.remove();
        }
    });

    test("Render: paginazione limita il rendering delle righe al pageSize configurato", () => {
        const tId = 'db_render_pagination';
        const testRows = [];
        for (let i = 1; i <= 25; i++) {
            testRows.push({ id: `r_${i}`, cells: { c_val: `Elemento ${i}` } });
        }

        AppState.databases[tId] = {
            id: tId,
            pageSize: 10,
            currentPage: 1,
            columns: [{ id: 'c_val', name: 'Valore', type: 'text' }],
            rows: testRows
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const visibleTrs = wrapper.querySelectorAll('tbody tr');
            Assert.strictEqual(visibleTrs.length, 10, "Devono essere renderizzate solo 10 righe a video");
        } finally {
            wrapper.remove();
        }
    });

    test("Render: navigazione tra pagine (currentPage > 1) mostra la tranche corretta di righe", () => {
        const tId = 'db_render_page_2';
        const testRows = [];
        for (let i = 1; i <= 25; i++) {
            testRows.push({ id: `r_${i}`, cells: { c_val: `Riga_${i}` } });
        }

        AppState.databases[tId] = {
            id: tId,
            pageSize: 10,
            currentPage: 2,
            columns: [{ id: 'c_val', name: 'Valore', type: 'text' }],
            rows: testRows
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const firstRowText = wrapper.querySelector('tbody tr:first-child td').innerText;
            Assert.isTrue(firstRowText.includes('Riga_11'), "La pagina 2 con pageSize 10 deve iniziare con la riga 11");
        } finally {
            wrapper.remove();
        }
    });

    test("Render: visualizzazione conteggio record nel footer (totale e filtrato)", () => {
        const tId = 'db_render_count_footer';
        AppState.databases[tId] = {
            id: tId,
            columns: [{ id: 'c_st', name: 'Stato', type: 'text' }],
            rows: [
                { id: 'r1', cells: { c_st: 'Aperto' } },
                { id: 'r2', cells: { c_st: 'Chiuso' } },
                { id: 'r3', cells: { c_st: 'Aperto' } }
            ],
            filters: { c_st: 'Aperto' }
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const countLabel = wrapper.querySelector('.adv-table-count-label');
            Assert.isNotNull(countLabel);
            const text = (countLabel.textContent || countLabel.innerText).replace(/\s+/g, ' ');
            Assert.isTrue(text.includes('2 di 3'), "Il footer deve indicare '2 di 3 record'");
        } finally {
            wrapper.remove();
        }
    });

    test("Render: applicazione della classe 'adv-row-selected' per le righe presenti in selectedRows", () => {
        const tId = 'db_render_selection_class';
        AppState.databases[tId] = {
            id: tId,
            columns: [{ id: 'c1', name: 'Test', type: 'text' }],
            rows: [
                { id: 'row_sel_1', cells: { c1: 'A' } },
                { id: 'row_norm_2', cells: { c1: 'B' } }
            ],
            selectedRows: ['row_sel_1']
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const tr1 = wrapper.querySelector('tbody tr[data-row-id="row_sel_1"]');
            const tr2 = wrapper.querySelector('tbody tr[data-row-id="row_norm_2"]');
            Assert.isTrue(tr1.classList.contains('adv-row-selected'));
            Assert.isFalse(tr2.classList.contains('adv-row-selected'));
        } finally {
            wrapper.remove();
        }
    });

    test("Render: applicazione stile condizionale a livello di riga sul tag tr", () => {
        const tId = 'db_render_row_cond_color';
        AppState.databases[tId] = {
            id: tId,
            columns: [{ id: 'c_status', name: 'Stato', type: 'text' }],
            rows: [
                { id: 'r1', cells: { c_status: 'Attivo' } }
            ],
            conditionalColors: [
                {
                    id: 'rule_row',
                    active: true,
                    targetScope: 'row',
                    color: 'hl-c6',
                    conditions: [{ colId: 'c_status', operator: '=', value: 'Attivo' }]
                }
            ]
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const tr = wrapper.querySelector('tbody tr[data-row-id="r1"]');
            Assert.isNotNull(tr);
            Assert.isTrue(tr.classList.contains('hl-c6'), "Il tag tr deve ricevere la classe hl-c6");
        } finally {
            wrapper.remove();
        }
    });

    test("Render: applicazione stile condizionale a livello di cella (targetScope='cell') sul singolo tag td", () => {
        const tId = 'db_render_cell_cond_color';
        AppState.databases[tId] = {
            id: tId,
            columns: [
                { id: 'c_name', name: 'Nome', type: 'text' },
                { id: 'c_amount', name: 'Importo', type: 'number' }
            ],
            rows: [
                { id: 'r1', cells: { c_name: 'Fattura 1', c_amount: 5000 } }
            ],
            conditionalColors: [
                {
                    id: 'rule_cell_amount',
                    active: true,
                    targetScope: 'cell',
                    targetColId: 'c_amount',
                    color: 'hl-c10',
                    conditions: [{ colId: 'c_amount', operator: '>=', value: '1000' }]
                }
            ]
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const tr = wrapper.querySelector('tbody tr[data-row-id="r1"]');
            Assert.isFalse(tr.classList.contains('hl-c10'), "Il tag tr non deve avere la classe di colore");

            const tdAmount = wrapper.querySelector('tbody td[data-col-name="Importo"]');
            Assert.isNotNull(tdAmount);
            Assert.isTrue(tdAmount.classList.contains('hl-c10') || tdAmount.style.cssText.includes('hl-c10'), "La cella Importo deve avere il colore dedicato");

            const tdName = wrapper.querySelector('tbody td[data-col-name="Nome"]');
            Assert.isFalse(tdName.classList.contains('hl-c10'), "La cella Nome non deve ereditare il colore della cella Importo");
        } finally {
            wrapper.remove();
        }
    });

    test("Render: coesistenza e priorità dello stile di cella sullo stile di riga nello stesso record", () => {
        const tId = 'db_render_coexistence';
        AppState.databases[tId] = {
            id: tId,
            columns: [
                { id: 'col1', name: 'Stato', type: 'text' },
                { id: 'col2', name: 'Alert', type: 'text' }
            ],
            rows: [
                { id: 'r1', cells: { col1: 'Bozza', col2: 'Critico' } }
            ],
            conditionalColors: [
                {
                    id: 'r_row',
                    active: true,
                    targetScope: 'row',
                    color: 'hl-c1',
                    conditions: [{ colId: 'col1', operator: '=', value: 'Bozza' }]
                },
                {
                    id: 'r_cell',
                    active: true,
                    targetScope: 'cell',
                    targetColId: 'col2',
                    color: 'hl-c10',
                    conditions: [{ colId: 'col2', operator: '=', value: 'Critico' }]
                }
            ]
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const tr = wrapper.querySelector('tbody tr[data-row-id="r1"]');
            Assert.isTrue(tr.classList.contains('hl-c1'), "La riga deve mantenere il colore di fondo generale");

            const tdAlert = wrapper.querySelector('tbody td[data-col-name="Alert"]');
            Assert.isTrue(tdAlert.classList.contains('hl-c10') || tdAlert.style.cssText.includes('hl-c10'), "La specifica cella Alert deve avere lo stile di cella dedicato");
        } finally {
            wrapper.remove();
        }
    });

    test("Render: gestione tabella con sorgente eliminata (state.sourceDeleted = true) mostra banner di avviso", () => {
        const tId = 'db_render_deleted_src';
        AppState.databases[tId] = {
            id: tId,
            isLinkedView: true,
            sourceDeleted: true,
            columns: [],
            rows: []
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const body = wrapper.querySelector('.widget-body');
            Assert.isNotNull(body);
            Assert.isTrue(body.innerText.includes('eliminato'), "Deve mostrare l'avviso che il DB originale è stato cancellato");
        } finally {
            wrapper.remove();
        }
    });

    test("Render: visualizzazione messaggio 'Nessun risultato' quando i filtri non restituiscono record", () => {
        const tId = 'db_render_no_results';
        AppState.databases[tId] = {
            id: tId,
            columns: [{ id: 'c1', name: 'Campo', type: 'text' }],
            rows: [{ id: 'r1', cells: { c1: 'Valore 1' } }],
            filters: { c1: 'TestoCheNonEsisteAssolutamente' }
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const tbody = wrapper.querySelector('tbody');
            Assert.isNotNull(tbody);
            Assert.isTrue(tbody.innerText.includes('Nessun risultato') || tbody.innerText.includes('0 record'));
        } finally {
            wrapper.remove();
        }
    });

    test("Render: iniezione barra di ricerca rapida quando showQuickSearch è attivo", () => {
        const tId = 'db_render_quick_search';
        AppState.databases[tId] = {
            id: tId,
            showQuickSearch: true,
            quickSearch: 'termine_cercato',
            columns: [{ id: 'c1', name: 'Test', type: 'text' }],
            rows: [{ id: 'r1', cells: { c1: 'Dato' } }]
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const searchInput = wrapper.querySelector(`#adv-search-input-${tId}`);
            Assert.isNotNull(searchInput, "L'input di ricerca rapida deve essere iniettato nel DOM");
            Assert.strictEqual(searchInput.value, 'termine_cercato');
        } finally {
            wrapper.remove();
        }
    });

    test("Render: applicazione della larghezza fissa (col.width) e classi zebra striped", () => {
        const tId = 'db_render_width_zebra';
        AppState.databases[tId] = {
            id: tId,
            striped: true,
            columns: [
                { id: 'cw', name: 'Larghezza', type: 'text', width: 280 }
            ],
            rows: [{ id: 'r1', cells: { cw: 'Contenuto' } }]
        };

        const wrapper = document.createElement('div');
        wrapper.id = tId;
        document.body.appendChild(wrapper);

        try {
            AdvancedTable.renderTable(tId);
            const table = wrapper.querySelector('table.adv-table');
            Assert.isTrue(table.classList.contains('table-striped'), "La tabella deve avere la classe zebra");

            const th = wrapper.querySelector('thead th[data-col="cw"]');
            Assert.strictEqual(th.style.width, '280px', "La larghezza della colonna deve corrispondere a col.width");
        } finally {
            wrapper.remove();
        }
    });

});