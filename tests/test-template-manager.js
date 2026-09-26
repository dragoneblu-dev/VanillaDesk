/**
 * tests/test-template-manager.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: template-manager
 * Conteggio test case: 10
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("TemplateManager: Salvataggio, Anteprima & Deep-Cloning AST (10 Test)", () => {

    test("TemplateManager: saveNoteAsTemplate crea il record template strutturato", () => {
            const noteId = 'note_tpl_src';
            AppState.notes = [{ id: noteId, title: 'Verbale Riunione', content: '<p>Ordine del giorno</p>' }];
            AppState.templates = [];

            const origPrompt = window.prompt;
            window.prompt = () => "Template Riunione";
            try {
                TemplateManager.saveNoteAsTemplate(noteId);
                Assert.strictEqual(AppState.templates.length, 1);
                Assert.strictEqual(AppState.templates[0].title, "Template Riunione");
                Assert.isTrue(AppState.templates[0].id.startsWith('tpl_'));
            } finally {
                window.prompt = origPrompt;
            }
        });

    test("TemplateManager: deleteTemplate rimuove il template salvato dall'array", () => {
            AppState.templates = [{ id: 'tpl_100', title: 'Da Eliminare' }];
            const origConfirm = window.confirm;
            window.confirm = () => true;
            try {
                TemplateManager.deleteTemplate('tpl_100');
                Assert.strictEqual(AppState.templates.length, 0);
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("TemplateManager: toggleEmptyOverlay mostra l'overlay quando l'editor è vuoto", () => {
            let overlay = document.getElementById('emptyNoteOverlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'emptyNoteOverlay';
                document.body.appendChild(overlay);
            }
            let editor = document.getElementById('noteContent');
            if (!editor) {
                editor = document.createElement('div');
                editor.id = 'noteContent';
                document.body.appendChild(editor);
            }

            AppState.isEditMode = true;
            editor.innerHTML = '<p><br></p>';
            TemplateManager.toggleEmptyOverlay();
            Assert.strictEqual(overlay.style.display, 'block');
        });

    test("TemplateManager: toggleEmptyOverlay nasconde l'overlay se l'editor contiene testo o widget", () => {
            const overlay = document.getElementById('emptyNoteOverlay');
            const editor = document.getElementById('noteContent');
            editor.innerHTML = '<p>Contenuto presente</p>';
            TemplateManager.toggleEmptyOverlay();
            Assert.strictEqual(overlay.style.display, 'none');
        });

    test("TemplateManager: deep cloning assegna nuovi ID ai widget del template", () => {
            const oldId = 'adv_tbl_seed';
            const tpl = {
                id: 'tpl_deep',
                title: 'Tpl DB',
                content: `<div id="${oldId}" class="adv-widget-shell"></div>`,
                widgets: { [oldId]: { title: 'DB Progetti', columns: [], rows: [] } }
            };
            AppState.templates = [tpl];
            AppState.currentNoteId = 'target_note';
            AppState.notes = [{ id: 'target_note', title: 'Target', content: '' }];
            AppState.databases = {};

            const editor = document.getElementById('noteContent');
            editor.innerHTML = '';

            const origConfirm = window.confirm;
            window.confirm = () => true;
            try {
                TemplateManager.applyTemplate('tpl_deep');
                const newDbKeys = Object.keys(AppState.databases);
                Assert.strictEqual(newDbKeys.length, 1);
                Assert.isTrue(newDbKeys[0].startsWith('adv_tbl_'));
                Assert.isFalse(newDbKeys.includes(oldId), "Il vecchio ID del template deve essere rimappato");
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("TemplateManager: deep cloning previene collisioni nei titoli dei database duplicando con contatore", () => {
            AppState.databases = { 'db_ex': { title: 'Clienti' } };
            const oldId = 'adv_tbl_seed2';
            const tpl = {
                id: 'tpl_coll',
                title: 'Tpl Collision',
                content: `<div id="${oldId}"></div>`,
                widgets: { [oldId]: { title: 'Clienti', columns: [], rows: [] } }
            };
            AppState.templates = [tpl];
            AppState.currentNoteId = 'target_note_coll';
            AppState.notes = [{ id: 'target_note_coll', title: 'Target', content: '' }];

            const editor = document.getElementById('noteContent');
            editor.innerHTML = '';

            const origConfirm = window.confirm;
            window.confirm = () => true;
            try {
                TemplateManager.applyTemplate('tpl_coll');
                const generatedDb = Object.values(AppState.databases).find(db => db.title.startsWith('Clienti ('));
                Assert.isNotNull(generatedDb);
                Assert.strictEqual(generatedDb.title, 'Clienti (1)');
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("TemplateManager: deep cloning riscrive i riferimenti alle tabelle nelle formule", () => {
            AppState.databases = { 'db_ex': { title: 'Spese' } };
            const oldId = 'adv_tbl_seed3';
            const tpl = {
                id: 'tpl_formula',
                title: 'Tpl Formula',
                content: `<div id="${oldId}"></div>`,
                widgets: {
                    [oldId]: {
                        title: 'Spese',
                        columns: [{ id: 'c1', type: 'formula', formula: 'tabella["Spese"].length' }],
                        rows: []
                    }
                }
            };
            AppState.templates = [tpl];
            AppState.currentNoteId = 'target_note_f';
            AppState.notes = [{ id: 'target_note_f', title: 'Target', content: '' }];

            const editor = document.getElementById('noteContent');
            editor.innerHTML = '';

            const origConfirm = window.confirm;
            window.confirm = () => true;
            try {
                TemplateManager.applyTemplate('tpl_formula');
                const newDb = Object.values(AppState.databases).find(db => db.title === 'Spese (1)');
                Assert.isNotNull(newDb);
                Assert.isTrue(newDb.columns[0].formula.includes('Spese (1)'));
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("TemplateManager: applyTemplate preserva il titolo della nota corrente", () => {
            const tpl = { id: 'tpl_notitle', title: 'Template Standard', content: '<p>Corpo</p>', widgets: {} };
            AppState.templates = [tpl];
            AppState.currentNoteId = 'note_keep_title';
            AppState.notes = [{ id: 'note_keep_title', title: 'Il Mio Titolo Personalizzato', content: '' }];

            const editor = document.getElementById('noteContent');
            editor.innerHTML = '';

            const origConfirm = window.confirm;
            window.confirm = () => true;
            try {
                TemplateManager.applyTemplate('tpl_notitle');
                const currentNote = Store.getNote('note_keep_title');
                Assert.strictEqual(currentNote.title, 'Il Mio Titolo Personalizzato');
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("TemplateManager: applyTemplate aggiorna il timestamp lastUsed del template", () => {
            const oldDate = "2020-01-01T00:00:00.000Z";
            const tpl = { id: 'tpl_time', title: 'Tpl Time', content: '<p>A</p>', widgets: {}, updatedAt: oldDate, lastUsed: oldDate };
            AppState.templates = [tpl];
            AppState.currentNoteId = 'note_time';
            AppState.notes = [{ id: 'note_time', title: 'Time', content: '' }];

            const editor = document.getElementById('noteContent');
            if (editor) editor.innerHTML = '';

            const origConfirm = window.confirm;
            window.confirm = () => true;
            try {
                TemplateManager.applyTemplate('tpl_time');
                Assert.isTrue(new Date(tpl.lastUsed).getTime() > new Date(oldDate).getTime());
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("TemplateManager: applyTemplate accoda i contenuti in fondo se la nota contiene già testo", () => {
            const tpl = { id: 'tpl_append', title: 'Tpl Append', content: '<p>Contenuto Template</p>', widgets: {} };
            AppState.templates = [tpl];
            AppState.currentNoteId = 'note_append';
            AppState.notes = [{ id: 'note_append', title: 'Nota Esistente', content: '<p>Testo Precedente</p>' }];

            const editor = document.getElementById('noteContent');
            editor.innerHTML = '<p>Testo Precedente</p>';

            const origConfirm = window.confirm;
            window.confirm = () => true;
            try {
                TemplateManager.applyTemplate('tpl_append');
                Assert.isTrue(editor.innerHTML.includes('Testo Precedente'));
                Assert.isTrue(editor.innerHTML.includes('Contenuto Template'));
            } finally {
                window.confirm = origConfirm;
            }
        });

});
