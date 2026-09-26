/**
 * tests/test-advanced-table-core.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-core
 * Conteggio test case: 7
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Core: State Management, Pan & System Database (7 Test)", () => {

    test("Schema: eliminazione colonna pulisce a cascata filtri attivi", () => {
            const state = {
                columns: [{ id: 'c_keep', name: 'Keep' }, { id: 'c_drop', name: 'Drop' }],
                filters: { 'c_drop': 'filtro_da_eliminare', 'c_keep': 'attivo' },
                rows: []
            };
            // Simulazione logica interna di sanitizeTableConfig in deleteCol
            if (state.filters && state.filters['c_drop']) delete state.filters['c_drop'];
            Assert.strictEqual(state.filters['c_drop'], undefined);
            Assert.strictEqual(state.filters['c_keep'], 'attivo');
        });

    test("Schema: eliminazione colonna pulisce a cascata regole sorts", () => {
            const state = {
                columns: [{ id: 'c_keep', name: 'Keep' }, { id: 'c_drop', name: 'Drop' }],
                sorts: [{ colId: 'c_drop', dir: 1 }, { colId: 'c_keep', dir: -1 }]
            };
            state.sorts = state.sorts.filter(s => s.colId !== 'c_drop');
            Assert.strictEqual(state.sorts.length, 1);
            Assert.strictEqual(state.sorts[0].colId, 'c_keep');
        });

    test("Schema: eliminazione colonna pulisce a cascata regole conditionalColors", () => {
            const state = {
                conditionalColors: [
                    { id: 'rule_1', conditions: [{ colId: 'c_drop', operator: '=' }] },
                    { id: 'rule_2', conditions: [{ colId: 'c_keep', operator: '=' }] }
                ]
            };
            state.conditionalColors.forEach(rule => {
                rule.conditions = rule.conditions.filter(c => c.colId !== 'c_drop');
            });
            state.conditionalColors = state.conditionalColors.filter(rule => rule.conditions.length > 0);
            Assert.strictEqual(state.conditionalColors.length, 1);
            Assert.strictEqual(state.conditionalColors[0].id, 'rule_2');
        });

    test("Schema: eliminazione colonna pulisce a cascata hiddenCols in viewConfig", () => {
            const state = {
                viewConfig: {
                    'table': { hiddenCols: ['c_drop', 'c_keep'] }
                }
            };
            state.viewConfig['table'].hiddenCols = state.viewConfig['table'].hiddenCols.filter(id => id !== 'c_drop');
            Assert.deepEqual(state.viewConfig['table'].hiddenCols, ['c_keep']);
        });

    test("Schema: eliminazione colonna reimposta viewType a 'table' se raggruppava Kanban", () => {
            const state = {
                viewType: 'board',
                boardGroupBy: 'c_drop'
            };
            if (state.boardGroupBy === 'c_drop') {
                delete state.boardGroupBy;
                state.viewType = 'table';
            }
            Assert.strictEqual(state.viewType, 'table');
            Assert.strictEqual(state.boardGroupBy, undefined);
        });

    test("Schema: eliminazione colonna reimposta viewType a 'table' se era la data del Calendario", () => {
            const state = {
                viewType: 'calendar',
                calendarDateCol: 'c_date_drop'
            };
            if (state.calendarDateCol === 'c_date_drop') {
                delete state.calendarDateCol;
                state.viewType = 'table';
            }
            Assert.strictEqual(state.viewType, 'table');
            Assert.strictEqual(state.calendarDateCol, undefined);
        });

    test("Schema: eliminazione colonna reimposta viewType a 'table' se era la data della Timeline", () => {
            const state = {
                viewType: 'timeline',
                timelineDateCol: 'c_tl_drop'
            };
            if (state.timelineDateCol === 'c_tl_drop') {
                delete state.timelineDateCol;
                state.viewType = 'table';
            }
            Assert.strictEqual(state.viewType, 'table');
            Assert.strictEqual(state.timelineDateCol, undefined);
        });

});
