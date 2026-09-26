/**
 * tests/test-advanced-table-automations-core.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-automations-core
 * Conteggio test case: 21
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Automations Core: Trigger Engine, Cron & Ricorsione (21 Test)", () => {

    test("Automazioni: call-stack limiter anti-loop ricorsivo (depth > 10)", async () => {
            const dbId = 'db_loop_prevent';
            AppState.databases[dbId] = {
                id: dbId,
                title: 'LoopDB',
                columns: [{ id: 'c_loop', name: 'Counter', type: 'number' }],
                rows: [{ id: 'r1', cells: { c_loop: 0 } }],
                automations: [
                    {
                        id: 'auto_loop',
                        active: true,
                        isValid: true,
                        triggers: [{ colId: 'c_loop', operator: '>=', value: '0' }],
                        actions: [{ colId: 'c_loop', type: 'math_add', value: '1' }]
                    }
                ]
            };

            const resultAtLimit = await AdvancedAutomations.evaluate(dbId, 'r1', false, null, null, false, null, null, false, 11);
            Assert.isFalse(resultAtLimit, "L'esecuzione deve arrestarsi immediatamente se la ricorsione supera 10");
        });

    test("Automazioni: parsing fuzzy delle date italiane con slash e ISO", () => {
            const isoTs = AdvancedAutomations._parseDateFuzzy("2026-05-15");
            Assert.isFalse(isNaN(isoTs));
            Assert.strictEqual(new Date(isoTs).getUTCFullYear(), 2026);

            const itTs = AdvancedAutomations._parseDateFuzzy("15/05/2026");
            Assert.isFalse(isNaN(itTs));
            Assert.strictEqual(new Date(itTs).getUTCFullYear(), 2026);

            Assert.isTrue(isNaN(AdvancedAutomations._parseDateFuzzy("stringa_invalida")));
            Assert.isTrue(isNaN(AdvancedAutomations._parseDateFuzzy("")));
        });

    test("Automations: _validateAutomation intercetta colonna trigger eliminata", () => {
            const auto = {
                triggers: [{ colId: 'col_mancante', operator: '=' }],
                actions: [{ colId: 'c_val', type: 'set_fixed' }]
            };
            const state = { columns: [{ id: 'c_val', name: 'Valore' }] };
            const errors = AdvancedAutomations._validateAutomation(auto, state);
            Assert.isTrue(errors.some(e => e.includes('eliminata')));
        });

    test("Automations: _validateAutomation intercetta colonna azione eliminata", () => {
            const auto = {
                triggers: [{ colId: 'c_trig', operator: '=' }],
                actions: [{ colId: 'c_act_mancante', type: 'set_fixed' }]
            };
            const state = { columns: [{ id: 'c_trig', name: 'Trigger' }] };
            const errors = AdvancedAutomations._validateAutomation(auto, state);
            Assert.isTrue(errors.some(e => e.includes('destinazione eliminata')));
        });

    test("Automations: _validateAutomation ignora colonne di sistema (SYS_*) nei controlli", () => {
            const auto = {
                triggers: [{ colId: 'SYS_NEW_ROW', operator: 'sys_trigger' }],
                actions: [{ colId: 'SYS_ACTION', type: 'show_toast', value: 'Notifica' }]
            };
            const state = { columns: [] };
            const errors = AdvancedAutomations._validateAutomation(auto, state);
            Assert.strictEqual(errors.length, 0);
        });

    test("Automations: azione stop_execution arresta l'elaborazione delle regole successive", async () => {
            const dbId = 'db_auto_stop';
            AppState.databases[dbId] = {
                id: dbId,
                columns: [{ id: 'c1', type: 'number' }, { id: 'c_trig', type: 'text' }],
                rows: [{ id: 'r1', cells: { c1: 10, c_trig: 'go' } }],
                automations: [
                    {
                        id: 'rule_1',
                        active: true,
                        isValid: true,
                        triggers: [{ colId: 'c_trig', operator: '=', value: 'go' }],
                        actions: [
                            { colId: 'c1', type: 'math_add', value: '5' },
                            { colId: 'SYS_ACTION', type: 'stop_execution' }
                        ]
                    },
                    {
                        id: 'rule_2',
                        active: true,
                        isValid: true,
                        triggers: [{ colId: 'c_trig', operator: '=', value: 'go' }],
                        actions: [
                            { colId: 'c1', type: 'math_add', value: '100' } // Non deve essere eseguita!
                        ]
                    }
                ]
            };

            await AdvancedAutomations.evaluate(dbId, 'r1', false);
            // c1 deve essere 15 (10 + 5) e non 115
            Assert.strictEqual(Number(AppState.databases[dbId].rows[0].cells.c1), 15);
        });

    test("Automations: azione color_row assegna colore e opacità percentuale", async () => {
            const dbId = 'db_auto_color';
            AppState.databases[dbId] = {
                id: dbId,
                columns: [{ id: 'c_st', type: 'text' }],
                rows: [{ id: 'r1', cells: { c_st: 'Completato' } }],
                automations: [
                    {
                        id: 'a_col',
                        active: true,
                        isValid: true,
                        triggers: [{ colId: 'c_st', operator: '=', value: 'Completato' }],
                        actions: [{ colId: 'SYS_ACTION', type: 'color_row', value: 'hl-c6', value2: '40' }]
                    }
                ]
            };

            await AdvancedAutomations.evaluate(dbId, 'r1', false);
            const row = AppState.databases[dbId].rows[0];
            Assert.strictEqual(row.color, 'hl-c6');
            Assert.strictEqual(row.opacity, '40');
        });

    test("Automations: azione insert_row crea nuova riga nel database specificato", async () => {
            const dbTgt = 'db_auto_target_ins';
            AppState.databases[dbTgt] = {
                id: dbTgt,
                title: 'Audit Target',
                columns: [{ id: 'c_title', name: 'Titolo', type: 'text' }],
                rows: []
            };
            const dbSrc = 'db_auto_src_ins';
            AppState.databases[dbSrc] = {
                id: dbSrc,
                columns: [{ id: 'c_val', type: 'number' }],
                rows: [{ id: 'r1', cells: { c_val: 100 } }],
                automations: [
                    {
                        id: 'a_ins',
                        active: true,
                        isValid: true,
                        triggers: [{ colId: 'c_val', operator: '>', value: '50' }],
                        actions: [{ colId: 'SYS_ACTION', type: 'insert_row', value: dbTgt, value2: 'Generato da Auto' }]
                    }
                ]
            };

            await AdvancedAutomations.evaluate(dbSrc, 'r1', false);
            Assert.strictEqual(AppState.databases[dbTgt].rows.length, 1);
            Assert.strictEqual(AppState.databases[dbTgt].rows[0].cells.c_title, 'Generato da Auto');
        });

    test("Automations: azione su record_note crea nuova nota in AppState.notes e associa ID", async () => {
            const dbId = 'db_auto_rn';
            AppState.databases[dbId] = {
                id: dbId,
                columns: [{ id: 'c_rn', type: 'record_note', name: 'Pagina' }, { id: 'c_trig', type: 'text' }],
                rows: [{ id: 'r1', cells: { c_rn: '', c_trig: 'go' } }],
                automations: [
                    {
                        id: 'a_rn',
                        active: true,
                        isValid: true,
                        triggers: [{ colId: 'c_trig', operator: '=', value: 'go' }],
                        actions: [{ colId: 'c_rn', type: 'set_fixed', value: 'Nuova Scheda Cliente' }]
                    }
                ]
            };

            await AdvancedAutomations.evaluate(dbId, 'r1', false);
            const noteId = AppState.databases[dbId].rows[0].cells.c_rn;
            Assert.isTrue(typeof noteId === 'string' && noteId.length > 5);
            const createdNote = AppState.notes.find(n => n.id === noteId);
            Assert.isNotNull(createdNote);
            Assert.strictEqual(createdNote.title, 'Nuova Scheda Cliente');
        });

    test("Automations: azione record_note con set_empty elimina nota con forceHardDeleteRecursive", async () => {
            const dbId = 'db_auto_rn_del';
            const noteId = 'note_to_del_rn';
            // Registra il database all'interno della nota per non farlo considerare orfano dal Garbage Collector
            AppState.notes = [{ id: noteId, title: 'Da Distruggere', content: `<div id="${dbId}"></div>` }];
            AppState.databases[dbId] = {
                id: dbId,
                columns: [{ id: 'c_rn', type: 'record_note', name: 'Pagina' }, { id: 'c_trig', type: 'text' }],
                rows: [{ id: 'r1', cells: { c_rn: noteId, c_trig: 'del' } }],
                automations: [
                    {
                        id: 'a_rn_del',
                        active: true,
                        isValid: true,
                        triggers: [{ colId: 'c_trig', operator: '=', value: 'del' }],
                        actions: [{ colId: 'c_rn', type: 'set_empty' }]
                    }
                ]
            };

            await AdvancedAutomations.evaluate(dbId, 'r1', false);
            Assert.strictEqual(AppState.databases[dbId].rows[0].cells.c_rn, '');
            Assert.isNull(Store.getNote(noteId));
        });

    test("Automations: triggerOnLoad esegue esclusivamente regole con SYS_ON_LOAD", async () => {
            const dbId = 'db_auto_onload';
            AppState.databases[dbId] = {
                id: dbId,
                columns: [{ id: 'c1', type: 'text' }],
                rows: [{ id: 'r1', cells: { c1: 'Prima' } }],
                automations: [
                    {
                        id: 'a_load',
                        active: true,
                        isValid: true,
                        triggers: [{ colId: 'SYS_ON_LOAD', operator: 'sys_trigger' }],
                        actions: [{ colId: 'c1', type: 'set_fixed', value: 'Caricato' }]
                    },
                    {
                        id: 'a_other',
                        active: true,
                        isValid: true,
                        triggers: [{ colId: 'SYS_NEW_ROW', operator: 'sys_trigger' }],
                        actions: [{ colId: 'c1', type: 'set_fixed', value: 'Ignorato' }]
                    }
                ]
            };

            await AdvancedAutomations.triggerOnLoad(dbId);
            Assert.strictEqual(AppState.databases[dbId].rows[0].cells.c1, 'Caricato');
        });

    test("Automations: triggerCrossDB attiva regole che ascoltano il sourceTableId modificato", async () => {
            const srcId = 'db_cross_src';
            const tgtId = 'db_cross_tgt';

            AppState.databases[tgtId] = {
                id: tgtId,
                columns: [{ id: 'c_status', type: 'text' }],
                rows: [{ id: 'r_tgt', cells: { c_status: 'In Sospeso' } }],
                automations: [
                    {
                        id: 'a_cross',
                        active: true,
                        isValid: true,
                        triggers: [{ colId: 'SYS_CROSS_DB', operator: 'sys_trigger', value: srcId }],
                        actions: [{ colId: 'c_status', type: 'set_fixed', value: 'Aggiornato da Esterno' }]
                    }
                ]
            };

            await AdvancedAutomations.triggerCrossDB(srcId);
            Assert.strictEqual(AppState.databases[tgtId].rows[0].cells.c_status, 'Aggiornato da Esterno');
        });

    test("Automations: triggerFromNoteChange attiva regole su campo TITLE della record note", () => {
            const dbId = 'db_from_note_change';
            AppState.databases[dbId] = {
                id: dbId,
                columns: [{ id: 'c_rn', type: 'record_note' }, { id: 'c_mirror', type: 'text' }],
                rows: [{ id: 'r1', cells: { c_rn: 'note_123', c_mirror: 'Vecchio' } }],
                automations: [
                    {
                        id: 'a_mirror',
                        active: true,
                        isValid: true,
                        triggers: [{ colId: 'c_rn_TITLE', operator: 'changed' }],
                        actions: [{ colId: 'c_mirror', type: 'set_fixed', value: 'Titolo Rilevato' }]
                    }
                ]
            };

            AdvancedAutomations.triggerFromNoteChange(dbId, 'r1', 'c_rn_TITLE', 'Vecchio', 'Nuovo');
            // Non deve andare in errore
        });

    test("Automations: toggleActive attiva o disattiva la regola persistendo lo stato", () => {
            const dbId = 'db_toggle_active';
            AppState.databases[dbId] = {
                id: dbId,
                automations: [{ id: 'auto_tog', active: true, isValid: true, triggers: [], actions: [] }]
            };

            AdvancedAutomations.toggleActive(null, dbId, 'auto_tog', false);
            Assert.isFalse(AppState.databases[dbId].automations[0].active);

            AdvancedAutomations.toggleActive(null, dbId, 'auto_tog', true);
            Assert.isTrue(AppState.databases[dbId].automations[0].active);
        });

    test("Automations: deleteAutomation rimuove la regola da automations", () => {
            const dbId = 'db_del_auto';
            AppState.databases[dbId] = {
                id: dbId,
                automations: [
                    { id: 'keep_a', triggers: [], actions: [] },
                    { id: 'drop_a', triggers: [], actions: [] }
                ]
            };

            const origConfirm = window.confirm;
            window.confirm = () => true;

            try {
                AdvancedAutomations.deleteAutomation(null, dbId, 'drop_a');
                Assert.strictEqual(AppState.databases[dbId].automations.length, 1);
                Assert.strictEqual(AppState.databases[dbId].automations[0].id, 'keep_a');
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("Automations: _updateTimerShift calcola minuti per ore (shiftUnit=60)", () => {
            const dummyNum = document.createElement('input'); dummyNum.id = 'shiftNum_0'; dummyNum.value = '3';
            const dummyUnit = document.createElement('select'); dummyUnit.id = 'shiftUnit_0'; dummyUnit.innerHTML = '<option value="60" selected></option>';
            const dummyDir = document.createElement('select'); dummyDir.id = 'shiftDir_0'; dummyDir.innerHTML = '<option value="1" selected></option>';
            document.body.appendChild(dummyNum); document.body.appendChild(dummyUnit); document.body.appendChild(dummyDir);

            AdvancedAutomations._tempAuto = {
                triggers: [{ dateShift: 0 }]
            };

            try {
                AdvancedAutomations._updateTimerShift(0);
                Assert.strictEqual(AdvancedAutomations._tempAuto.triggers[0].dateShift, 180); // 3 * 60 = 180 min
            } finally {
                dummyNum.remove(); dummyUnit.remove(); dummyDir.remove();
            }
        });

    test("Automations: _updateTimerShift calcola direzione 'Prima' con moltiplicatore negativo (-1)", () => {
            const dummyNum = document.createElement('input'); dummyNum.id = 'shiftNum_1'; dummyNum.value = '2';
            const dummyUnit = document.createElement('select'); dummyUnit.id = 'shiftUnit_1'; dummyUnit.innerHTML = '<option value="1440" selected></option>'; // Giorni
            const dummyDir = document.createElement('select'); dummyDir.id = 'shiftDir_1'; dummyDir.innerHTML = '<option value="-1" selected></option>'; // Prima
            document.body.appendChild(dummyNum); document.body.appendChild(dummyUnit); document.body.appendChild(dummyDir);

            AdvancedAutomations._tempAuto = {
                triggers: [{}, { dateShift: 0 }]
            };

            try {
                AdvancedAutomations._updateTimerShift(1);
                Assert.strictEqual(AdvancedAutomations._tempAuto.triggers[1].dateShift, -2880); // 2 * 1440 * -1
            } finally {
                dummyNum.remove(); dummyUnit.remove(); dummyDir.remove();
            }
        });

    test("Automations: trigger a tempo su colonna esegue per righe che combaciano con Oggi", async () => {
            const dbId = 'db_cron_exact_row';
            const todayStr = new Date().toISOString().split('T')[0];

            AppState.databases[dbId] = {
                id: dbId,
                columns: [{ id: 'c_date', type: 'date' }, { id: 'c_flag', type: 'checkbox' }],
                rows: [
                    { id: 'r_today', cells: { c_date: todayStr, c_flag: false } },
                    { id: 'r_other', cells: { c_date: '2010-01-01', c_flag: false } }
                ],
                automations: [
                    {
                        id: 'auto_cron',
                        active: true,
                        isValid: true,
                        triggers: [{ colId: 'SYS_TIMER', operator: 'col_reference', value: 'c_date', dateShift: 0 }],
                        actions: [{ colId: 'c_flag', type: 'set_true' }]
                    }
                ]
            };

            await AdvancedAutomations.evaluate(dbId, 'r_today', false, null, null, true, null, 'auto_cron');
            Assert.strictEqual(AppState.databases[dbId].rows[0].cells.c_flag, true);
        });

    test("Automations: saveAutomation assegna nome descrittivo automatico se lasciato vuoto", () => {
            const dbId = 'db_auto_autoname';
            AppState.databases[dbId] = {
                id: dbId,
                columns: [{ id: 'c1', name: 'Priorità' }, { id: 'c2', name: 'Scadenza' }],
                rows: [],
                automations: []
            };

            AdvancedAutomations._tempAuto = {
                id: 'a_empty_name',
                name: '',
                active: true,
                triggers: [{ colId: 'c1', operator: '=' }],
                actions: [{ colId: 'c2', type: 'set_today' }]
            };

            AdvancedAutomations.saveAutomation(null, dbId);
            const saved = AppState.databases[dbId].automations[0];
            Assert.isTrue(saved.name.includes('Priorità'));
            Assert.isTrue(saved.name.includes('Scadenza'));
        });

    test("Automations: _notifyFired programma toast con debounce", () => {
            let toastMsg = null;
            const origToast = UI.showToast;
            UI.showToast = (msg) => { toastMsg = msg; };

            try {
                AdvancedAutomations._notifyFired();
                Assert.isNotNull(AdvancedAutomations._autoToastTimer);
            } finally {
                clearTimeout(AdvancedAutomations._autoToastTimer);
                UI.showToast = origToast;
            }
        });

    test("Automations: runMassiveAutomation esegue la regola su tutte le righe del DB", async () => {
            const dbId = 'db_massive_run';
            AppState.databases[dbId] = {
                id: dbId,
                columns: [{ id: 'c1', type: 'text' }],
                rows: [
                    { id: '1', cells: { c1: 'A' }, updatedAt: 1 },
                    { id: '2', cells: { c1: 'B' }, updatedAt: 2 }
                ],
                automations: [
                    {
                        id: 'a_mass',
                        active: true,
                        isValid: true,
                        triggers: [{ colId: 'SYS_ANY_CHANGE', operator: 'sys_trigger' }],
                        actions: [{ colId: 'c1', type: 'set_fixed', value: 'Massivo' }]
                    }
                ]
            };

            const origConfirm = window.confirm;
            const origAlert = window.alert;
            window.confirm = () => true;
            window.alert = () => {};

            try {
                await AdvancedAutomations.runMassiveAutomation(null, dbId, 'a_mass');
                Assert.strictEqual(AppState.databases[dbId].rows[0].cells.c1, 'Massivo');
                Assert.strictEqual(AppState.databases[dbId].rows[1].cells.c1, 'Massivo');
            } finally {
                window.confirm = origConfirm;
                window.alert = origAlert;
            }
        });

});
