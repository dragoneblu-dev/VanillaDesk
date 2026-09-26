/**
 * tests/test-advanced-table-sort.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-sort
 * Conteggio test case: 6
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Sort: Ordinamento Multi-Colonna, Stringhe & Date (6 Test)", () => {

    test("Sort: alfabetico crescente (A -> Z)", () => {
            const state = {
                columns: [{ id: 'c_str', name: 'Nome', type: 'text' }],
                sorts: [{ colId: 'c_str', dir: 1 }]
            };
            const rows = [
                { id: '1', virtualCells: { c_str: 'Zeta' } },
                { id: '2', virtualCells: { c_str: 'Alfa' } },
                { id: '3', virtualCells: { c_str: 'Beta' } }
            ];
            const res = AdvancedTable.sortRows(rows, state);
            Assert.strictEqual(res[0].virtualCells.c_str, 'Alfa');
            Assert.strictEqual(res[1].virtualCells.c_str, 'Beta');
            Assert.strictEqual(res[2].virtualCells.c_str, 'Zeta');
        });

    test("Sort: alfabetico decrescente (Z -> A)", () => {
            const state = {
                columns: [{ id: 'c_str', name: 'Nome', type: 'text' }],
                sorts: [{ colId: 'c_str', dir: -1 }]
            };
            const rows = [
                { id: '1', virtualCells: { c_str: 'Zeta' } },
                { id: '2', virtualCells: { c_str: 'Alfa' } }
            ];
            const res = AdvancedTable.sortRows(rows, state);
            Assert.strictEqual(res[0].virtualCells.c_str, 'Zeta');
        });

    test("Sort: numerico rispetta valori matematici reali e non ordine ASCII", () => {
            const state = {
                columns: [{ id: 'c_n', name: 'Val', type: 'number' }],
                sorts: [{ colId: 'c_n', dir: 1 }]
            };
            const rows = [
                { id: '1', virtualCells: { c_n: '100' } },
                { id: '2', virtualCells: { c_n: '2' } },
                { id: '3', virtualCells: { c_n: '15' } }
            ];
            const res = AdvancedTable.sortRows(rows, state);
            Assert.strictEqual(Number(res[0].virtualCells.c_n), 2);
            Assert.strictEqual(Number(res[1].virtualCells.c_n), 15);
            Assert.strictEqual(Number(res[2].virtualCells.c_n), 100);
        });

    test("Sort: date in formato ISO 8601", () => {
            const state = {
                columns: [{ id: 'c_d', name: 'Data', type: 'date' }],
                sorts: [{ colId: 'c_d', dir: 1 }]
            };
            const rows = [
                { id: '1', virtualCells: { c_d: '2026-11-20' } },
                { id: '2', virtualCells: { c_d: '2026-02-10' } },
                { id: '3', virtualCells: { c_d: '2026-08-05' } }
            ];
            const res = AdvancedTable.sortRows(rows, state);
            Assert.strictEqual(res[0].virtualCells.c_d, '2026-02-10');
            Assert.strictEqual(res[2].virtualCells.c_d, '2026-11-20');
        });

    test("Sort: date in formato italiano con barre (DD/MM/YYYY)", () => {
            const state = {
                columns: [{ id: 'c_d', name: 'Data', type: 'date' }],
                sorts: [{ colId: 'c_d', dir: 1 }]
            };
            const rows = [
                { id: '1', virtualCells: { c_d: '25/12/2026' } },
                { id: '2', virtualCells: { c_d: '05/01/2026' } }
            ];
            const res = AdvancedTable.sortRows(rows, state);
            Assert.strictEqual(res[0].virtualCells.c_d, '05/01/2026');
        });

    test("Sort: composito su due colonne (Reparto ASC, Spesa DESC)", () => {
            const state = {
                columns: [
                    { id: 'c_rep', name: 'Reparto', type: 'text' },
                    { id: 'c_val', name: 'Spesa', type: 'number' }
                ],
                sorts: [
                    { colId: 'c_rep', dir: 1 },
                    { colId: 'c_val', dir: -1 }
                ]
            };
            const rows = [
                { id: '1', virtualCells: { c_rep: 'IT', c_val: 500 } },
                { id: '2', virtualCells: { c_rep: 'HR', c_val: 100 } },
                { id: '3', virtualCells: { c_rep: 'IT', c_val: 950 } }
            ];
            const res = AdvancedTable.sortRows(rows, state);
            Assert.strictEqual(res[0].id, '2'); 
            Assert.strictEqual(res[1].id, '3'); 
            Assert.strictEqual(res[2].id, '1');
        });

});
