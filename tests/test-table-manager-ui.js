/**
 * tests/test-table-manager-ui.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: table-manager-ui
 * Conteggio test case: 8
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("TableManager UI: Trigger, Menu Contestuali & Azioni Cella (8 Test)", () => {

    test("SimpleTable: insertRow inserisce riga sotto preservando classi di cella", () => {
            const table = document.createElement('table');
            table.innerHTML = `
                <tbody>
                    <tr>
                        <td class="hl-c5 text-center">Testo</td>
                    </tr>
                </tbody>
            `;
            TableManager.activeCell = table.rows[0].cells[0];

            TableManager.UI.performAction('insertRow', 1);
            Assert.strictEqual(table.rows.length, 2);
            const newCell = table.rows[1].cells[0];
            Assert.isTrue(newCell.classList.contains('hl-c5'));
            Assert.isTrue(newCell.classList.contains('text-center'));
            Assert.strictEqual(newCell.getAttribute('contenteditable'), 'true');
        });

    test("SimpleTable: insertRow inserisce riga sopra alla posizione esatta", () => {
            const table = document.createElement('table');
            table.innerHTML = `
                <tbody>
                    <tr id="r_orig"><td>Originale</td></tr>
                </tbody>
            `;
            TableManager.activeCell = table.rows[0].cells[0];

            TableManager.UI.performAction('insertRow', -1);
            Assert.strictEqual(table.rows.length, 2);
            Assert.strictEqual(table.rows[1].id, 'r_orig');
        });

    test("SimpleTable: deleteRow elimina riga se la tabella ne ha più di una", () => {
            const table = document.createElement('table');
            table.innerHTML = `
                <tbody>
                    <tr><td>1</td></tr>
                    <tr id="r_drop"><td>2</td></tr>
                </tbody>
            `;
            TableManager.activeCell = table.rows[1].cells[0];

            TableManager.UI.performAction('deleteRow');
            Assert.strictEqual(table.rows.length, 1);
            Assert.isNull(table.querySelector('#r_drop'));
        });

    test("SimpleTable: setRowType converte tutti i td di una riga in th", () => {
            const table = document.createElement('table');
            table.innerHTML = `<tbody><tr><td>A</td><td>B</td></tr></tbody>`;
            TableManager.activeCell = table.rows[0].cells[0];

            TableManager.UI.performAction('setRowType', 'th');
            Assert.strictEqual(table.rows[0].cells[0].tagName.toLowerCase(), 'th');
            Assert.strictEqual(table.rows[0].cells[1].tagName.toLowerCase(), 'th');
        });

    test("SimpleTable: colorRow applica classe hl-c* a tutte le celle della riga", () => {
            const table = document.createElement('table');
            table.innerHTML = `<tbody><tr><td>A</td><td>B</td></tr></tbody>`;
            TableManager.activeCell = table.rows[0].cells[0];

            TableManager.UI.performAction('colorRow', 'hl-c6');
            Assert.isTrue(table.rows[0].cells[0].classList.contains('hl-c6'));
            Assert.isTrue(table.rows[0].cells[1].classList.contains('hl-c6'));
        });

    test("SimpleTable: insertCol inserisce colonna a destra su tutte le righe", () => {
            const table = document.createElement('table');
            table.innerHTML = `
                <tbody>
                    <tr><td>R1C1</td></tr>
                    <tr><td>R2C1</td></tr>
                </tbody>
            `;
            TableManager.activeCell = table.rows[0].cells[0];
            TableManager.currentTable = table;

            TableManager.UI.performAction('insertCol', 1);
            Assert.strictEqual(table.rows[0].cells.length, 2);
            Assert.strictEqual(table.rows[1].cells.length, 2);
        });

    test("SimpleTable: deleteCol elimina la colonna da tutte le righe", () => {
            const table = document.createElement('table');
            table.innerHTML = `
                <tbody>
                    <tr><td>A1</td><td id="c_drop">B1</td></tr>
                    <tr><td>A2</td><td>B2</td></tr>
                </tbody>
            `;
            TableManager.activeCell = table.rows[0].cells[1];
            TableManager.currentTable = table;

            TableManager.UI.performAction('deleteCol');
            Assert.strictEqual(table.rows[0].cells.length, 1);
            Assert.strictEqual(table.rows[1].cells.length, 1);
            Assert.isNull(table.querySelector('#c_drop'));
        });

    test("SimpleTable: setColAlign imposta allineamento orizzontale su tutta la colonna", () => {
            const table = document.createElement('table');
            table.innerHTML = `
                <tbody>
                    <tr><td>A1</td></tr>
                    <tr><td>A2</td></tr>
                </tbody>
            `;
            TableManager.activeCell = table.rows[0].cells[0];

            TableManager.UI.performAction('setColAlign', 'text-right');
            Assert.isTrue(table.rows[0].cells[0].classList.contains('text-right'));
            Assert.isTrue(table.rows[1].cells[0].classList.contains('text-right'));
        });

});
