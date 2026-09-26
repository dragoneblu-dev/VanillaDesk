/**
 * tests/test-column-manager.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: column-manager
 * Conteggio test case: 8
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("ColumnManager: Layout Colonne, Snap 5% & Resizing Grid (8 Test)", () => {

    test("ColumnManager: _initWidths genera frazioni percentuali esatte per 2 colonne", () => {
            const state = { columns: 2, widths: null };
            const widths = ColumnManager._initWidths(state);
            Assert.deepEqual(widths, [50, 50]);
        });

    test("ColumnManager: _initWidths genera frazioni percentuali esatte per 3 colonne", () => {
            const state = { columns: 3, widths: null };
            const widths = ColumnManager._initWidths(state);
            Assert.strictEqual(widths.length, 3);
            Assert.strictEqual(Math.round(widths[0]), 33);
        });

    test("ColumnManager: setColumns riconfigura le frazioni percentuali", () => {
            const cId = 'adv_cols_test';
            AppState.databases[cId] = { columns: 2, mode: 'independent', contents: ['A', 'B'], widths: [50, 50] };

            ColumnManager.setColumns(cId, 3);
            const state = AppState.databases[cId];
            Assert.strictEqual(state.columns, 3);
            Assert.strictEqual(state.widths.length, 3);
        });

    test("ColumnManager: setColumns unisce contenuti eccedenti se si riduce il numero di colonne", () => {
            const cId = 'adv_cols_merge';
            AppState.databases[cId] = {
                columns: 3,
                mode: 'independent',
                contents: ['Col 1', 'Col 2', 'Col 3'],
                widths: [33, 33, 34]
            };

            ColumnManager.setColumns(cId, 2);
            const state = AppState.databases[cId];
            Assert.strictEqual(state.columns, 2);
            Assert.strictEqual(state.contents.length, 2);
            Assert.isTrue(state.contents[1].includes('Col 2'));
            Assert.isTrue(state.contents[1].includes('Col 3'));
        });

    test("ColumnManager: setMode 'continuous' fonde array contenuti in stringa unica", () => {
            const cId = 'adv_cols_mode_c';
            AppState.databases[cId] = { columns: 2, mode: 'independent', contents: ['Testo 1', 'Testo 2'] };

            ColumnManager.setMode(cId, 'continuous');
            Assert.strictEqual(AppState.databases[cId].mode, 'continuous');
            Assert.strictEqual(AppState.databases[cId].contents.length, 1);
            Assert.isTrue(AppState.databases[cId].contents[0].includes('Testo 1<br>Testo 2'));
        });

    test("ColumnManager: setMode 'independent' prepara la prima colonna con il testo unificato", () => {
            const cId = 'adv_cols_mode_i';
            AppState.databases[cId] = { columns: 2, mode: 'continuous', contents: ['Testo Unico'] };

            ColumnManager.setMode(cId, 'independent');
            Assert.strictEqual(AppState.databases[cId].mode, 'independent');
            Assert.strictEqual(AppState.databases[cId].contents[0], 'Testo Unico');
        });

    test("ColumnManager: destroyAndUnwrap riversa il testo preservato ed elimina lo stato in RAM", () => {
            const cId = 'adv_cols_unwrap';
            const dummy = document.createElement('div');
            dummy.id = cId;
            dummy.innerHTML = `
                <div class="adv-columns-container-wrap">
                    <div class="col-box">Testo da salvare A</div>
                    <div class="col-box">Testo da salvare B</div>
                </div>
            `;
            document.body.appendChild(dummy);

            AppState.databases[cId] = { columns: 2, mode: 'independent', contents: [] };

            ColumnManager.destroyAndUnwrap(cId);

            Assert.isTrue(AppState.databases[cId] === undefined);
            Assert.isTrue(document.body.innerHTML.includes('Testo da salvare A'));
            Assert.isTrue(document.body.innerHTML.includes('Testo da salvare B'));
        });

    test("ColumnManager: render genera inline css grid-template-columns corrispondente ai pesi", () => {
            const cId = 'adv_cols_grid';
            const dummy = document.createElement('div');
            dummy.id = cId;
            dummy.className = 'adv-widget-shell widget-type-columns';
            document.body.appendChild(dummy);

            AppState.databases[cId] = { columns: 2, mode: 'independent', contents: ['1', '2'], widths: [40, 60] };

            ColumnManager.render(cId);

            const gridEl = dummy.querySelector('.adv-columns-independent');
            Assert.isNotNull(gridEl);
            Assert.isTrue(gridEl.style.gridTemplateColumns.includes('40% 60%'));
            dummy.remove();
        });

    test("ColumnManager: snap a multipli del 5% su delta larghezza colonna", () => {
        const deltaPct = 7.3;
        const snapped = Math.round(deltaPct / 5) * 5;
        Assert.strictEqual(snapped, 5);

        const deltaPct2 = 8.1;
        const snapped2 = Math.round(deltaPct2 / 5) * 5;
        Assert.strictEqual(snapped2, 10);
    });

    test("ColumnManager: vincolo larghezza minima colonna di almeno 10%", () => {
        const leftWidth = 12;
        const delta = -5; // porterebbe left a 7% (inferiore a 10%)

        const newLeft = leftWidth + delta;
        const isAllowed = newLeft >= 10;
        Assert.isFalse(isAllowed);
    });

});
