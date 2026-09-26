/**
 * tests/test-table-manager-core.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: table-manager-core
 * Conteggio test case: 6
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("TableManager Core: Inizializzazione, Layout Modes & Grid Map (6 Test)", () => {

    test("TableManager: getGridMap costruisce correttamente le coordinate di celle fuse", () => {
            const dummyTable = document.createElement('table');
            dummyTable.innerHTML = `
                <tbody>
                    <tr>
                        <td id="c_0_0" colspan="2">Fusa Orizzontale</td>
                        <td id="c_0_2">Normale</td>
                    </tr>
                    <tr>
                        <td id="c_1_0">Cella 1</td>
                        <td id="c_1_1">Cella 2</td>
                        <td id="c_1_2">Cella 3</td>
                    </tr>
                </tbody>
            `;

            const { grid, cellData } = TableManager.getGridMap(dummyTable);

            // La prima riga deve avere 3 slot logici occupati
            Assert.strictEqual(grid[0].length, 3);
            // Entrambi gli slot 0 e 1 della riga 0 puntano alla stessa cella
            Assert.strictEqual(grid[0][0], grid[0][1]);

            const mergedInfo = cellData.get(grid[0][0]);
            Assert.strictEqual(mergedInfo.w, 2); // colspan = 2
            Assert.strictEqual(mergedInfo.maxX, 1);
        });

    test("TableManager: setLayoutMode 'auto' rimuove colgroup e imposta tableLayout auto", () => {
            const table = document.createElement('table');
            table.innerHTML = '<colgroup><col><col></colgroup><tbody><tr><td>A</td></tr></tbody>';
            TableManager.editingTable = table;

            TableManager.setLayoutMode('auto', true);

            Assert.strictEqual(table.style.tableLayout, 'auto');
            Assert.strictEqual(table.style.width, '100%');
            Assert.isNull(table.querySelector('colgroup'));
        });

    test("TableManager: setLayoutMode 'pixel' imposta width max-content e tableLayout fixed", () => {
            const table = document.createElement('table');
            table.innerHTML = '<tbody><tr><td>A</td><td>B</td></tr></tbody>';
            TableManager.editingTable = table;

            TableManager.setLayoutMode('pixel', true);

            Assert.strictEqual(table.style.tableLayout, 'fixed');
            Assert.strictEqual(table.style.width, 'max-content');
            Assert.isNotNull(table.querySelector('colgroup'));
        });

    test("TableManager: setLayoutMode 'percent' imposta width 100% e tableLayout fixed", () => {
            const table = document.createElement('table');
            table.innerHTML = '<tbody><tr><td>A</td><td>B</td></tr></tbody>';
            TableManager.editingTable = table;

            TableManager.setLayoutMode('percent', true);

            Assert.strictEqual(table.style.tableLayout, 'fixed');
            Assert.strictEqual(table.style.width, '100%');
            Assert.isNotNull(table.querySelector('colgroup'));
        });

    test("TableManager: toggleZebraCurrent alterna la classe table-striped", () => {
            const table = document.createElement('table');
            TableManager.currentTable = table;

            TableManager.toggleZebraCurrent();
            Assert.isTrue(table.classList.contains('table-striped'));

            TableManager.toggleZebraCurrent();
            Assert.isFalse(table.classList.contains('table-striped'));
        });

    test("TableManager: getGridMap indicizza correttamente cella con rowspan verticale", () => {
            const table = document.createElement('table');
            table.innerHTML = `
                <tbody>
                    <tr>
                        <td id="r0c0" rowspan="2">Verticale</td>
                        <td id="r0c1">Destra 1</td>
                    </tr>
                    <tr>
                        <td id="r1c1">Destra 2</td>
                    </tr>
                </tbody>
            `;
            const { grid, cellData } = TableManager.getGridMap(table);

            Assert.strictEqual(grid.length, 2);
            Assert.strictEqual(grid[0][0], grid[1][0]); // La stessa cella occupa riga 0 e riga 1 in colonna 0
            const vInfo = cellData.get(table.querySelector('#r0c0'));
            Assert.strictEqual(vInfo.h, 2);
            Assert.strictEqual(vInfo.maxY, 1);
        });

});
