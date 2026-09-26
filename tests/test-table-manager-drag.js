/**
 * tests/test-table-manager-drag.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: table-manager-drag
 * Conteggio test case: 3
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("TableManager Drag: Riordino Righe/Colonne & Colgroup Resizing (3 Test)", () => {

    test("TableManager: _stripLegacyWidths rimuove width e height inline da tutte le celle", () => {
            const table = document.createElement('table');
            table.innerHTML = `
                <tr>
                    <th style="width: 150px; min-width: 50px;">A</th>
                    <td width="200" height="40" style="max-width: 300px;">B</td>
                </tr>
            `;
            TableManager._stripLegacyWidths(table);

            const th = table.querySelector('th');
            const td = table.querySelector('td');
            Assert.strictEqual(th.style.width, '');
            Assert.strictEqual(th.style.minWidth, '');
            Assert.isNull(td.getAttribute('width'));
            Assert.isNull(td.getAttribute('height'));
        });

    test("TableManager: _ensureColgroup genera elemento colgroup con numero di tag col esatto", () => {
            const table = document.createElement('table');
            const colgroup = TableManager._ensureColgroup(table, 4);

            Assert.strictEqual(colgroup.children.length, 4);
            Assert.strictEqual(colgroup.firstChild.tagName.toLowerCase(), 'col');
            Assert.strictEqual(table.firstChild, colgroup);
        });

    test("TableManager: _ensureColgroup rigenera colgroup se il conteggio colonne muta", () => {
            const table = document.createElement('table');
            TableManager._ensureColgroup(table, 2);
            Assert.strictEqual(table.querySelector('colgroup').children.length, 2);

            // Espansione a 5 colonne
            TableManager._ensureColgroup(table, 5);
            Assert.strictEqual(table.querySelector('colgroup').children.length, 5);
        });

});
