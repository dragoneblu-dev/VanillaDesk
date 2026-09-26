/**
 * tests/test-table-manager-selection.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: table-manager-selection
 * Conteggio test case: 9
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("TableManager Selection: Bounding Box 2D, Merge & Split (9 Test)", () => {

    test("TableManager: isContiguous verifica se una selezione forma un rettangolo perfetto", () => {
            const dummyTable = document.createElement('table');
            dummyTable.innerHTML = `
                <tbody>
                    <tr><td id="c00">A</td><td id="c01">B</td><td id="c02">C</td></tr>
                    <tr><td id="c10">D</td><td id="c11">E</td><td id="c12">F</td></tr>
                </tbody>
            `;

            const c00 = dummyTable.querySelector('#c00');
            const c01 = dummyTable.querySelector('#c01');
            const c10 = dummyTable.querySelector('#c10');
            const c11 = dummyTable.querySelector('#c11');
            const c02 = dummyTable.querySelector('#c02');

            // Blocco rettangolare 2x2: c00, c01, c10, c11
            Assert.isTrue(TableManager.Selection.isContiguous([c00, c01, c10, c11], dummyTable));

            // Selezione discontinua a forma di "L": c00, c01, c10 (senza c11)
            Assert.isFalse(TableManager.Selection.isContiguous([c00, c01, c10], dummyTable));

            // Selezione con buchi: c00 e c02 (manca c01)
            Assert.isFalse(TableManager.Selection.isContiguous([c00, c02], dummyTable));
        });

    test("TableManager: mergeCells fonde un'area 2x2 impostando correttamente colspan e rowspan", () => {
            const dummyTable = document.createElement('table');
            dummyTable.innerHTML = `
                <tbody>
                    <tr><td id="m00">Cella A</td><td id="m01">Cella B</td></tr>
                    <tr><td id="m10">Cella C</td><td id="m11">Cella D</td></tr>
                </tbody>
            `;

            const cells = [
                dummyTable.querySelector('#m00'),
                dummyTable.querySelector('#m01'),
                dummyTable.querySelector('#m10'),
                dummyTable.querySelector('#m11')
            ];

            TableManager.Selection.selectedCells = cells;
            TableManager.Selection.mergeCells();

            const remainingCells = dummyTable.querySelectorAll('td');
            Assert.strictEqual(remainingCells.length, 1, "Dopo la fusione di un blocco 2x2 deve rimanere una sola cella fisica");

            const masterCell = remainingCells[0];
            Assert.strictEqual(parseInt(masterCell.getAttribute('colspan'), 10), 2);
            Assert.strictEqual(parseInt(masterCell.getAttribute('rowspan'), 10), 2);
            Assert.isTrue(masterCell.innerHTML.includes('Cella A'));
            Assert.isTrue(masterCell.innerHTML.includes('Cella D'));
        });

    test("TableManager: splitCell ripristina la matrice esatta delle celle precedentemente unite", () => {
            const dummyTable = document.createElement('table');
            dummyTable.innerHTML = `
                <tbody>
                    <tr><td id="mergedCell" colspan="2" rowspan="2">Testo Unito</td><td id="side1">Laterale 1</td></tr>
                    <tr><td id="side2">Laterale 2</td></tr>
                </tbody>
            `;

            const cellToSplit = dummyTable.querySelector('#mergedCell');
            TableManager.activeCell = cellToSplit;
            TableManager.Selection.selectedCells = [cellToSplit];

            TableManager.Selection.splitCell();

            Assert.isNull(cellToSplit.getAttribute('colspan'));
            Assert.isNull(cellToSplit.getAttribute('rowspan'));

            // Riga 0 deve ora contenere 3 celle (le 2 originali del colspan + il laterale)
            Assert.strictEqual(dummyTable.rows[0].cells.length, 3);
            // Riga 1 deve ora contenere 3 celle (le 2 generate dal rowspan + il laterale)
            Assert.strictEqual(dummyTable.rows[1].cells.length, 3);
        });

    test("TableManager: isContiguous restituisce true per cella singola", () => {
            const table = document.createElement('table');
            table.innerHTML = '<tr><td id="c1">Solo</td></tr>';
            const c1 = table.querySelector('#c1');
            Assert.isTrue(TableManager.Selection.isContiguous([c1], table));
        });

    test("TableManager: isContiguous restituisce true per array vuoto", () => {
            const table = document.createElement('table');
            Assert.isTrue(TableManager.Selection.isContiguous([], table));
        });

    test("TableManager: mergeCells su 2 celle adiacenti orizzontali assegna colspan=2", () => {
            const table = document.createElement('table');
            table.innerHTML = '<tbody><tr><td id="c1">A</td><td id="c2">B</td></tr></tbody>';
            const c1 = table.querySelector('#c1');
            const c2 = table.querySelector('#c2');

            TableManager.Selection.selectedCells = [c1, c2];
            TableManager.Selection.mergeCells();

            Assert.strictEqual(table.querySelectorAll('td').length, 1);
            Assert.strictEqual(parseInt(c1.getAttribute('colspan'), 10), 2);
        });

    test("TableManager: splitCell su cella con colspan=2 rigenera la seconda cella con contenteditable='true'", () => {
            const table = document.createElement('table');
            table.innerHTML = '<tbody><tr><td id="m_cell" colspan="2">Testo</td></tr></tbody>';
            const cell = table.querySelector('#m_cell');

            TableManager.activeCell = cell;
            TableManager.Selection.selectedCells = [cell];
            TableManager.Selection.splitCell();

            const cells = table.querySelectorAll('td');
            Assert.strictEqual(cells.length, 2);
            Assert.strictEqual(cells[1].getAttribute('contenteditable'), 'true');
            Assert.isNull(cell.getAttribute('colspan'));
        });

    test("SimpleTable: colorCell applica colore a cella singola", () => {
            const table = document.createElement('table');
            table.innerHTML = `<tbody><tr><td id="c_one">A</td></tr></tbody>`;
            const cOne = table.querySelector('#c_one');
            TableManager.activeCell = cOne;
            TableManager.Selection.selectedCells = [];

            TableManager.UI.performAction('colorCell', 'hl-c10');
            Assert.isTrue(cOne.classList.contains('hl-c10'));
        });

    test("SimpleTable: alignCell su selezione multipla allinea tutte le celle", () => {
            const table = document.createElement('table');
            table.innerHTML = `<tbody><tr><td id="c1">A</td><td id="c2">B</td></tr></tbody>`;
            const c1 = table.querySelector('#c1');
            const c2 = table.querySelector('#c2');

            TableManager.Selection.selectedCells = [c1, c2];
            TableManager.UI.performAction('alignCell', 'text-center');

            Assert.isTrue(c1.classList.contains('text-center'));
            Assert.isTrue(c2.classList.contains('text-center'));
        });

});
