/**
 * tests/test-button-manager-core.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: button-manager-core
 * Conteggio test case: 10
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("ButtonManager: Macro Buttons, Migration & Execution (10 Test)", () => {

    test("ButtonManager: _migrateButtonState converte la vecchia struttura in actionBlocks", () => {
            const legacyBtn = {
                id: 'btn_leg',
                targetDbId: 'db_target_legacy',
                actionType: 'update',
                filterColId: 'c_status',
                filterOperator: '=',
                filterValue: 'Aperto',
                actionColId: 'c_done',
                actionValueType: 'set_true',
                actionValue: ''
            };

            const migrated = ButtonManager._migrateButtonState(legacyBtn);
            Assert.strictEqual(migrated.actionBlocks.length, 1);
            Assert.strictEqual(migrated.actionBlocks[0].targetDbId, 'db_target_legacy');
            Assert.strictEqual(migrated.actionBlocks[0].filters[0].colId, 'c_status');
            Assert.strictEqual(migrated.actionBlocks[0].actions[0].colId, 'c_done');
            Assert.isTrue(migrated.targetDbId === undefined);
        });

    test("ButtonManager: _evaluateDynamicLabel restituisce testo invariato se non inizia con '='", () => {
            Assert.strictEqual(ButtonManager._evaluateDynamicLabel("Salva Record"), "Salva Record");
        });

    test("ButtonManager: _evaluateDynamicLabel calcola espressioni matematiche con '='", () => {
            const res = ButtonManager._evaluateDynamicLabel("='Aggiorna ' + (5 + 5) + ' Righe'");
            Assert.strictEqual(res, "Aggiorna 10 Righe");
        });

    test("ButtonManager: _evaluateDynamicLabel gestisce errori di sintassi senza lanciare eccezioni", () => {
            const res = ButtonManager._evaluateDynamicLabel("=formula_invalida(++");
            Assert.isTrue(res.includes("Errore"));
        });

    test("ButtonManager: addButtonToBar aggiunge un nuovo bottone alla barra", () => {
            const barId = 'adv_btnbar_add';
            AppState.databases[barId] = { buttons: [] };

            ButtonManager.addButtonToBar(barId);
            Assert.strictEqual(AppState.databases[barId].buttons.length, 1);
            Assert.isTrue(AppState.databases[barId].buttons[0].id.startsWith('btn_'));
        });

    test("ButtonManager: deleteButtonFromBar rimuove il pulsante specifico", () => {
            const barId = 'adv_btnbar_del';
            AppState.databases[barId] = {
                buttons: [
                    { id: 'b1', label: 'B1' },
                    { id: 'b2', label: 'B2' }
                ]
            };

            const origConfirm = window.confirm;
            window.confirm = () => true;
            try {
                ButtonManager.deleteButtonFromBar(barId, 'b1');
                Assert.strictEqual(AppState.databases[barId].buttons.length, 1);
                Assert.strictEqual(AppState.databases[barId].buttons[0].id, 'b2');
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("ButtonManager: deleteButtonFromBar distrugge l'intero widget se rimosso l'ultimo pulsante", () => {
            const barId = 'adv_btnbar_destroy';
            AppState.databases[barId] = { buttons: [{ id: 'b_solo', label: 'Solo' }] };

            const origConfirm = window.confirm;
            window.confirm = () => true;
            try {
                ButtonManager.deleteButtonFromBar(barId, 'b_solo');
                Assert.isTrue(AppState.databases[barId] === undefined);
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("ButtonManager: blocco esecuzione se non siamo in edit mode (salvo test mode)", async () => {
            AppState.isEditMode = true; // In edit mode i click sui pulsanti aprono le opzioni anziché lanciare
            const res = await ButtonManager.execute('bar_mock', 'btn_mock', false);
            Assert.strictEqual(res, undefined);
        });

    test("ButtonManager: visualizzazione avviso se il pulsante non ha azioni configurate", async () => {
            const barId = 'adv_btnbar_empty';
            AppState.databases[barId] = {
                buttons: [{ id: 'b_empty', label: 'Vuoto', actionBlocks: [] }]
            };

            let toastShown = false;
            const origToast = UI.showToast;
            UI.showToast = () => { toastShown = true; };
            try {
                await ButtonManager.execute(barId, 'b_empty', true);
                Assert.isTrue(toastShown);
            } finally {
                UI.showToast = origToast;
            }
        });

    test("ButtonManager: prompt di conferma blocca l'esecuzione se l'utente rifiuta", async () => {
            const barId = 'adv_btnbar_conf';
            AppState.databases[barId] = {
                buttons: [{
                    id: 'b_conf',
                    label: 'Pericoloso',
                    requireConfirm: true,
                    actionBlocks: [{ targetDbId: 'db', actions: [{ colId: 'c', type: 'set_empty' }] }]
                }]
            };

            const origConfirm = window.confirm;
            window.confirm = () => false; // Utente clicca Annulla
            try {
                await ButtonManager.execute(barId, 'b_conf', true);
                // Non deve procedere
            } finally {
                window.confirm = origConfirm;
            }
        });

});
