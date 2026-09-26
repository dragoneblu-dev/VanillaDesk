/**
 * tests/test-advanced-table-automations-ui.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-automations-ui
 * Conteggio test case: 1
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Automations UI: Builder, Drag & Drop Regole (1 Test)", () => {

    test("Automations: onDrop riordina le automazioni nello stack", () => {
            const dbId = 'db_reorder_auto';
            AppState.databases[dbId] = {
                id: dbId,
                automations: [
                    { id: '1', triggers: [], actions: [] },
                    { id: '2', triggers: [], actions: [] },
                    { id: '3', triggers: [], actions: [] }
                ]
            };

            AdvancedAutomations.draggedAutoIdx = 0; // Sposta '1' in posizione 3
            const evMock = { preventDefault: () => {} };
            AdvancedAutomations.onDrop(evMock, dbId, 3);

            Assert.strictEqual(AppState.databases[dbId].automations[0].id, '2');
            Assert.strictEqual(AppState.databases[dbId].automations[1].id, '3');
            Assert.strictEqual(AppState.databases[dbId].automations[2].id, '1');
        });

});
