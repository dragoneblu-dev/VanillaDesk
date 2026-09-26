/**
 * tests/test-state.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: state
 * Conteggio test case: 21
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AppState: Gestione Stato Globale, Ricerca & Navigazione Note (21 Test)", () => {

    test("Store: prepareForSave rimuove selettivamente proprietà effimere (prefisso '_')", () => {
            AppState.notes = [
                { id: 'n1', title: 'Nota', content: '<p>x</p>', _lastScroll: 450, _highlightIdx: 2 }
            ];
            AppState.databases = {};
            AppState.homeCitations = [];
            AppState.templates = [];

            const payload = Store.prepareForSave();
            const savedNote = payload.notes[0];

            Assert.strictEqual(savedNote.id, 'n1');
            Assert.strictEqual(savedNote.title, 'Nota');
            Assert.strictEqual(savedNote._lastScroll, undefined);
            Assert.strictEqual(savedNote._highlightIdx, undefined);
            Assert.strictEqual(savedNote._oldTitle, undefined);
        });

    test("Store: prepareForSave preserva database attivi presenti nelle note", () => {
            AppState.notes = [{ id: 'n1', title: 'Nota', content: '<div id="adv_tbl_mock1"></div>' }];
            AppState.databases = { adv_tbl_mock1: { title: 'DB Valido', columns: [], rows: [] } };
            AppState.templates = [{ id: 't1', title: 'Tpl' }];

            const payload = Store.prepareForSave();
            Assert.strictEqual(payload.databases.adv_tbl_mock1.title, 'DB Valido');
            Assert.strictEqual(payload.templates[0].title, 'Tpl');
        });

    test("UI: updateBreadcrumb costruisce il percorso ascendente completo delle note", () => {
            const pRoot = { id: 'root', title: 'Root Note', parentId: null };
            const pSub = { id: 'sub', title: 'Sub Note', parentId: 'root' };
            AppState.notes = [pRoot, pSub];

            let bcEl = document.getElementById('breadcrumb');
            if (!bcEl) {
                bcEl = document.createElement('span');
                bcEl.id = 'breadcrumb';
                document.body.appendChild(bcEl);
            }

            UI.updateBreadcrumb(pSub);
            Assert.isTrue(bcEl.innerText.includes('Root Note'));
            Assert.isTrue(bcEl.innerText.includes('Sub Note'));
        });

    test("UI: updateBreadcrumb inietta il badge Cestino se la nota è eliminata", () => {
            const trashed = { id: 'tr', title: 'Trash Note', parentId: null, deletedAt: Date.now() };
            AppState.notes = [trashed];

            const bcEl = document.getElementById('breadcrumb');
            UI.updateBreadcrumb(trashed);
            Assert.isTrue(bcEl.innerHTML.includes('Cestino'));
        });

    test("UI: checkAndUpdatePropertiesIcon attiva il pulsante se ci sono proprietà in SYS_PROPERTIES_DB", () => {
            let btn = document.getElementById('btnNoteProperties');
            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'btnNoteProperties';
                document.body.appendChild(btn);
            }

            AppState.databases['SYS_PROPERTIES_DB'] = {
                columns: [{ id: 'sys_c_tags', name: 'Tags', type: 'multi-select' }],
                rows: [{ cells: { sys_c_note: 'note_tagged', sys_c_tags: ['Urgente'] } }]
            };

            UI.checkAndUpdatePropertiesIcon('note_tagged');
            Assert.isTrue(btn.classList.contains('active'));
        });

    test("UI.Trash: restore ripristina la nota rimuovendo deletedAt", () => {
            const note = { id: 'n_rest', title: 'Da Ripristinare', deletedAt: 123456 };
            AppState.notes = [note];

            UI.Trash.restore('n_rest');
            Assert.strictEqual(note.deletedAt, undefined);
        });

    test("UI.Trash: restore assegna parentId nullo se il genitore è ancora nel cestino", () => {
            const pTrashed = { id: 'p_tr', title: 'Padre', deletedAt: 123456 };
            const child = { id: 'c_tr', parentId: 'p_tr', title: 'Figlio', deletedAt: 123456 };
            AppState.notes = [pTrashed, child];

            UI.Trash.restore('c_tr');
            Assert.strictEqual(child.parentId, null);
        });

    test("UI.Trash: forceHardDeleteRecursive elimina a cascata nota e discendenti", () => {
            const p1 = { id: 'del_1', parentId: null };
            const c1 = { id: 'del_1_1', parentId: 'del_1' };
            const sc1 = { id: 'del_1_1_1', parentId: 'del_1_1' };
            const other = { id: 'safe', parentId: null };
            AppState.notes = [p1, c1, sc1, other];

            UI.Trash.forceHardDeleteRecursive('del_1');
            Assert.strictEqual(AppState.notes.length, 1);
            Assert.strictEqual(AppState.notes[0].id, 'safe');
        });

    test("UI.Trash: forceHardDeleteRecursive rimuove record associati in SYS_PROPERTIES_DB", () => {
            AppState.databases['SYS_PROPERTIES_DB'] = {
                columns: [],
                rows: [
                    { cells: { sys_c_note: 'del_prop' } },
                    { cells: { sys_c_note: 'keep_prop' } }
                ]
            };
            AppState.notes = [{ id: 'del_prop' }];

            UI.Trash.forceHardDeleteRecursive('del_prop');
            Assert.strictEqual(AppState.databases['SYS_PROPERTIES_DB'].rows.length, 1);
            Assert.strictEqual(AppState.databases['SYS_PROPERTIES_DB'].rows[0].cells.sys_c_note, 'keep_prop');
        });

    test("UI: isDescendant identifica correttamente relazioni parentali ad albero", () => {
            AppState.notes = [
                { id: 'gp', parentId: null },
                { id: 'p', parentId: 'gp' },
                { id: 'c', parentId: 'p' },
                { id: 'alien', parentId: null }
            ];

            Assert.isTrue(UI.isDescendant('gp', 'c'));
            Assert.isTrue(UI.isDescendant('p', 'c'));
            Assert.isFalse(UI.isDescendant('c', 'gp'));
            Assert.isFalse(UI.isDescendant('alien', 'c'));
        });

    test("Relazioni Multiple: rilevamento di tutte le colonne auto-referenziali in un database", () => {
            const dbComplex = {
                id: 'db_complex_rels',
                columns: [
                    { id: 'c_title', name: 'Task', type: 'text' },
                    { id: 'c_parent', name: 'Padre', type: 'relation', targetTableId: 'db_complex_rels' },
                    { id: 'c_child', name: 'Figli', type: 'relation', targetTableId: 'db_complex_rels' },
                    { id: 'c_ext', name: 'Cliente Esterno', type: 'relation', targetTableId: 'db_other' },
                    { id: 'c_dep', name: 'Predecessore', type: 'relation', targetTableId: 'db_complex_rels' }
                ],
                rows: []
            };
            AppState.databases['db_complex_rels'] = dbComplex;

            const selfRels = dbComplex.columns.filter(c => c.type === 'relation' && c.targetTableId === 'db_complex_rels');
            Assert.strictEqual(selfRels.length, 3);
            Assert.deepEqual(selfRels.map(r => r.id), ['c_parent', 'c_child', 'c_dep']);
        });

    test("Store: getAllDescendants estrae ricorsivamente l'intero sottoalbero di note", () => {
            AppState.notes = [
                { id: 'r', parentId: null },
                { id: 'c1', parentId: 'r' },
                { id: 'c2', parentId: 'r' },
                { id: 'gc1', parentId: 'c1' },
                { id: 'unrelated', parentId: null }
            ];

            const desc = Store.getAllDescendants('r');
            Assert.strictEqual(desc.length, 3);
            Assert.isTrue(desc.some(n => n.id === 'c1'));
            Assert.isTrue(desc.some(n => n.id === 'c2'));
            Assert.isTrue(desc.some(n => n.id === 'gc1'));
        });

    test("Store: getChildren ignora note eliminate (deletedAt) a meno che specificato", () => {
            AppState.notes = [
                { id: 'act1', parentId: 'root' },
                { id: 'act2', parentId: 'root' },
                { id: 'del1', parentId: 'root', deletedAt: 123456 }
            ];

            const normal = Store.getChildren('root');
            Assert.strictEqual(normal.length, 2);

            const withDeleted = Store.getChildren('root', true);
            Assert.strictEqual(withDeleted.length, 3);
        });

    test("UI Trash: empty elimina fisicamente tutte le note con deletedAt", () => {
            AppState.notes = [
                { id: 'live_note', title: 'Viva' },
                { id: 't1', title: 'Cestinata 1', deletedAt: 100 },
                { id: 't2', title: 'Cestinata 2', deletedAt: 200 }
            ];

            const origConfirm = window.confirm;
            window.confirm = () => true;

            try {
                UI.Trash.empty();
                Assert.strictEqual(AppState.notes.length, 1);
                Assert.strictEqual(AppState.notes[0].id, 'live_note');
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("UI Security: removePassword azzera documentPassword e invalida la cache hash", () => {
            AppState.documentPassword = "PasswordSegreta";
            Store._diskHashes = { notes: { 'n1': 'h1' }, databases: {}, index: 'idx' };

            const origConfirm = window.confirm;
            window.confirm = () => true;

            try {
                UI.PasswordManager.removePassword();
                Assert.isNull(AppState.documentPassword);
                Assert.deepEqual(Store._diskHashes.notes, {});
                Assert.strictEqual(Store._diskHashes.index, "");
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("UI Minimap: de-duplicazione ID converte id in data-mini-id", () => {
            let editorArea = document.getElementById('editorScrollContent');
            if (!editorArea) {
                editorArea = document.createElement('div');
                editorArea.id = 'editorScrollContent';
                document.body.appendChild(editorArea);
            }
            editorArea.innerHTML = '<div id="test_widget_id">Test</div>';

            let mini = document.getElementById('minimapContent');
            if (!mini) {
                mini = document.createElement('div');
                mini.id = 'minimapContent';
                document.body.appendChild(mini);
            }
            let wrapper = document.getElementById('minimapContentWrapper');
            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.id = 'minimapContentWrapper';
                document.body.appendChild(wrapper);
            }
            let container = document.getElementById('minimapContainer');
            if (!container) {
                container = document.createElement('div');
                container.id = 'minimapContainer';
                document.body.appendChild(container);
            }

            AppState.showMinimap = true;
            UI.Minimap.sync();

            Assert.isNull(mini.querySelector('#test_widget_id'));
            Assert.isNotNull(mini.querySelector('[data-mini-id="test_widget_id"]'));
        });

    test("UI Minimap: toggle alterna la classe hidden e salva preferenze in localStorage", () => {
            let container = document.getElementById('minimapContainer');
            let createdContainer = false;
            if (!container) {
                container = document.createElement('div');
                container.id = 'minimapContainer';
                container.className = 'hidden';
                document.body.appendChild(container);
                createdContainer = true;
            }

            let btn = document.getElementById('minimapBtn');
            let createdBtn = false;
            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'minimapBtn';
                document.body.appendChild(btn);
                createdBtn = true;
            }

            try {
                AppState.showMinimap = false;
                UI.Minimap.toggle();
                Assert.isTrue(AppState.showMinimap);
                Assert.strictEqual(localStorage.getItem('pronotes_minimap'), 'true');

                UI.Minimap.toggle();
                Assert.isFalse(AppState.showMinimap);
                Assert.strictEqual(localStorage.getItem('pronotes_minimap'), 'false');
            } finally {
                if (createdContainer) container.remove();
                if (createdBtn) btn.remove();
            }
        });

    test("UI Preferences: toggleContinuousEdit alterna la modalità di edit continuo", () => {
            AppState.continuousEditMode = false;
            UI.toggleContinuousEdit();
            Assert.isTrue(AppState.continuousEditMode);
            Assert.strictEqual(localStorage.getItem('pronotes_continuous'), 'true');

            UI.toggleContinuousEdit();
            Assert.isFalse(AppState.continuousEditMode);
            Assert.strictEqual(localStorage.getItem('pronotes_continuous'), 'false');
        });

    test("UI Preferences: toggleWordWrap aggiunge e rimuove la classe .no-wrap dall'editor", () => {
            let editor = document.getElementById('noteContent');
            AppState.noWrapMode = false;

            UI.toggleWordWrap();
            Assert.isTrue(AppState.noWrapMode);
            Assert.isTrue(editor.classList.contains('no-wrap'));

            UI.toggleWordWrap();
            Assert.isFalse(AppState.noWrapMode);
            Assert.isFalse(editor.classList.contains('no-wrap'));
        });

    test("Store: getChildren esclude le note nel cestino se includeDeleted === false", () => {
            AppState.notes = [
                { id: '1', parentId: null },
                { id: '2', parentId: null, deletedAt: 12345 }
            ];
            const res = Store.getChildren(null, false);
            Assert.strictEqual(res.length, 1);
            Assert.strictEqual(res[0].id, '1');
        });

    test("Store: getChildren include le note nel cestino se includeDeleted === true", () => {
            AppState.notes = [
                { id: '1', parentId: null },
                { id: '2', parentId: null, deletedAt: 12345 }
            ];
            const res = Store.getChildren(null, true);
            Assert.strictEqual(res.length, 2);
        });

});
