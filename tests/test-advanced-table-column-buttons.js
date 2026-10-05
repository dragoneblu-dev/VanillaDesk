/**
 * tests/test-advanced-table-column-buttons.js
 * Suite di Collaudo Unitario per Pulsanti e Macro configurati nelle Colonne del Database.
 * Modulo testato: js/AdvancedTable/advanced-table-column-buttons.js
 * Conteggio test case: 6
 */

describe("AdvancedTable Column Buttons: Esecuzione Macro, Azioni e Configurazione (6 Test)", () => {

    test("Button Column: runCellMacro non procede se non vi sono azioni configurate", async () => {
        const dbId = 'db_btn_empty_test';
        AppState.databases[dbId] = {
            id: dbId,
            columns: [{ id: 'btn_col', name: 'Azione', type: 'button', actionBlocks: [] }],
            rows: [{ id: 'r1', cells: { btn_col: '' } }]
        };

        let toastTriggered = false;
        const origToast = UI.showToast;
        UI.showToast = () => { toastTriggered = true; };

        try {
            await AdvancedTable.runCellMacro(dbId, 'r1', 'btn_col');
            Assert.isTrue(toastTriggered, "In assenza di azioni deve essere visualizzato un avviso all'utente");
        } finally {
            UI.showToast = origToast;
        }
    });

    test("Button Column: runCellMacro rispetta la richiesta di conferma dell'utente (requireConfirm)", async () => {
        const dbId = 'db_btn_confirm_test';
        AppState.databases[dbId] = {
            id: dbId,
            columns: [{
                id: 'btn_col',
                name: 'Esegui',
                type: 'button',
                requireConfirm: true,
                actionBlocks: [{
                    targetDbId: 'THIS_ROW',
                    actionType: 'update',
                    actions: [{ colId: 'status_col', type: 'set_fixed', value: 'Confermato' }]
                }]
            }, {
                id: 'status_col',
                name: 'Stato',
                type: 'text'
            }],
            rows: [{ id: 'r1', cells: { btn_col: '', status_col: 'Bozza' } }]
        };

        const origConfirm = window.confirm;
        window.confirm = () => false; // L'utente rifiuta l'esecuzione

        try {
            await AdvancedTable.runCellMacro(dbId, 'r1', 'btn_col');
            Assert.strictEqual(AppState.databases[dbId].rows[0].cells.status_col, 'Bozza', "Se l'utente annulla, la macro non deve mutare i dati");

            window.confirm = () => true; // L'utente accetta l'esecuzione
            await AdvancedTable.runCellMacro(dbId, 'r1', 'btn_col');
            Assert.strictEqual(AppState.databases[dbId].rows[0].cells.status_col, 'Confermato', "Se confermato, la macro deve aggiornare la riga");
        } finally {
            window.confirm = origConfirm;
        }
    });

    test("Button Column: runCellMacro esegue azioni su questa riga (THIS_ROW) con formule e auto-save", async () => {
        const dbId = 'db_btn_this_row_test';
        AppState.databases[dbId] = {
            id: dbId,
            title: 'Task',
            columns: [
                { id: 'btn_col', name: 'Completa', type: 'button', actionBlocks: [{
                    targetDbId: 'THIS_ROW',
                    actionType: 'update',
                    actions: [
                        { colId: 'prog_col', type: 'set_fixed', value: '100' },
                        { colId: 'state_col', type: 'set_formula', value: 'riga["Nome"] + " - Fatto"' }
                    ]
                }] },
                { id: 'name_col', name: 'Nome', type: 'text' },
                { id: 'prog_col', name: 'Progresso', type: 'number' },
                { id: 'state_col', name: 'Stato', type: 'text' }
            ],
            rows: [{ id: 'r1', cells: { btn_col: '', name_col: 'Core Module', prog_col: 0, state_col: '' } }]
        };

        let autoSaveTriggered = false;
        const origAutoSave = Store.triggerAutoSave;
        Store.triggerAutoSave = () => { autoSaveTriggered = true; };

        try {
            await AdvancedTable.runCellMacro(dbId, 'r1', 'btn_col');
            const row = AppState.databases[dbId].rows[0];
            Assert.strictEqual(row.cells.prog_col, 100);
            Assert.strictEqual(row.cells.state_col, 'Core Module - Fatto');
            Assert.isTrue(autoSaveTriggered, "L'esecuzione della macro deve innescare il salvataggio automatico");
        } finally {
            Store.triggerAutoSave = origAutoSave;
        }
    });

    test("Button Column: runCellMacro trasferisce dati tra righe tramite origineContext", async () => {
        const dbSourceId = 'db_btn_src_transfer';
        const dbTargetId = 'db_btn_tgt_transfer';

        AppState.databases[dbSourceId] = {
            id: dbSourceId,
            title: 'Sorgente',
            columns: [
                { id: 'btn_transfer', name: 'Travasa', type: 'button', actionBlocks: [{
                    targetDbId: dbTargetId,
                    actionType: 'update',
                    filters: [{ colId: 't_id_match', operator: '=', value: 'T1' }],
                    actions: [{ colId: 't_copied_val', type: 'set_formula', value: 'origine["ValoreOrigine"] * 2' }]
                }] },
                { id: 's_val', name: 'ValoreOrigine', type: 'number' }
            ],
            rows: [{ id: 's_row1', cells: { btn_transfer: '', s_val: 25 } }]
        };

        AppState.databases[dbTargetId] = {
            id: dbTargetId,
            title: 'Destinazione',
            columns: [
                { id: 't_id_match', name: 'Codice', type: 'text' },
                { id: 't_copied_val', name: 'ValoreCalcolato', type: 'number' }
            ],
            rows: [{ id: 't_row1', cells: { t_id_match: 'T1', t_copied_val: 0 } }]
        };

        await AdvancedTable.runCellMacro(dbSourceId, 's_row1', 'btn_transfer');
        Assert.strictEqual(AppState.databases[dbTargetId].rows[0].cells.t_copied_val, 50, "La macro deve accedere ai dati della riga origine tramite origine[...] e aggiornare il target");
    });

    test("Button Column Config: _saveButtonColConfig memorizza la configurazione sulla colonna", () => {
        const dbId = 'db_btn_save_cfg';
        AppState.databases[dbId] = {
            id: dbId,
            columns: [{ id: 'c_btn', name: 'Azione', type: 'button' }],
            rows: []
        };

        AdvancedTable._tempColButtonConfig = {
            tableId: dbId,
            colId: 'c_btn',
            config: {
                buttonLabel: 'Approva Subito',
                buttonColor: '#22c55e',
                requireConfirm: true,
                actionBlocks: [{ id: 'blk1', targetDbId: 'THIS_ROW', actionType: 'update', actions: [] }]
            }
        };

        AdvancedTable._saveButtonColConfig();

        const col = AppState.databases[dbId].columns[0];
        Assert.strictEqual(col.buttonLabel, 'Approva Subito');
        Assert.strictEqual(col.buttonColor, '#22c55e');
        Assert.strictEqual(col.requireConfirm, true);
        Assert.strictEqual(col.actionBlocks.length, 1);
        Assert.strictEqual(col.actionBlocks[0].id, 'blk1');
    });

    test("Button Column Builder: _addButtonColBlock genera ID univoco e blocchi validi", () => {
        AdvancedTable._tempColButtonConfig = {
            tableId: 'db_dummy',
            colId: 'col_dummy',
            config: { actionBlocks: [] }
        };

        // Simula la funzione di refresh per non interferire con il DOM
        const origRefresh = AdvancedTable._triggerRefresh;
        AdvancedTable._triggerRefresh = () => {};

        try {
            AdvancedTable._addButtonColBlock();
            Assert.strictEqual(AdvancedTable._tempColButtonConfig.config.actionBlocks.length, 1);
            const block = AdvancedTable._tempColButtonConfig.config.actionBlocks[0];
            Assert.isTrue(block.id.startsWith('actblk_'));
            Assert.strictEqual(block.targetDbId, 'THIS_ROW');
            Assert.strictEqual(block.actionType, 'update');
        } finally {
            AdvancedTable._triggerRefresh = origRefresh;
        }
    });

});