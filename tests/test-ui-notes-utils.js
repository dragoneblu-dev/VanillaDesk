/**
 * tests/test-ui-notes-utils.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-notes-utils
 */

describe("UI Notes Utils: Breadcrumb, Preferiti, Badge & Controlli (test-ui-notes-utils.js)", () => {

    beforeEach(() => {
        let sandbox = document.getElementById('testSandBox');
        if (!sandbox) {
            sandbox = document.createElement('div');
            sandbox.id = 'testSandBox';
            document.body.appendChild(sandbox);
        }

        let btnProps = document.getElementById('btnNoteProperties');
        if (!btnProps) {
            btnProps = document.createElement('button');
            btnProps.id = 'btnNoteProperties';
            sandbox.appendChild(btnProps);
        }
        btnProps.className = 'icon-btn';
        btnProps.innerHTML = '';

        let btnInfo = document.getElementById('btnNoteInfo');
        if (!btnInfo) {
            btnInfo = document.createElement('button');
            btnInfo.id = 'btnNoteInfo';
            sandbox.appendChild(btnInfo);
        }
        btnInfo.className = 'icon-btn';
        btnInfo.innerHTML = '';

        let markBtn = document.getElementById('markBtn');
        if (!markBtn) {
            markBtn = document.createElement('button');
            markBtn.id = 'markBtn';
            sandbox.appendChild(markBtn);
        }

        let breadcrumb = document.getElementById('breadcrumb');
        if (!breadcrumb) {
            breadcrumb = document.createElement('span');
            breadcrumb.id = 'breadcrumb';
            sandbox.appendChild(breadcrumb);
        }

        let titleInput = document.getElementById('noteTitle');
        if (!titleInput) {
            titleInput = document.createElement('input');
            titleInput.id = 'noteTitle';
            sandbox.appendChild(titleInput);
        }

        let editorContent = document.getElementById('noteContent');
        if (!editorContent) {
            editorContent = document.createElement('div');
            editorContent.id = 'noteContent';
            sandbox.appendChild(editorContent);
        }

        AppState.notes = [];
        AppState.databases = {};
        AppState.currentNoteId = null;
    });

    afterEach(() => {
        const btnProps = document.getElementById('btnNoteProperties');
        if (btnProps) btnProps.innerHTML = '';
        const btnInfo = document.getElementById('btnNoteInfo');
        if (btnInfo) btnInfo.innerHTML = '';
    });

    test("UI: checkAndUpdatePropertiesIcon disattiva il pulsante se non ci sono proprietà", () => {
        const btn = document.getElementById('btnNoteProperties');
        UI.checkAndUpdatePropertiesIcon('note_untagged');
        Assert.isFalse(btn.classList.contains('active'));
    });

    test("UI: checkAndUpdatePropertiesIcon calcola il conteggio esatto delle proprietà valorizzate e genera il badge", () => {
        const noteId = 'n_tagged_test';
        AppState.databases['SYS_PROPERTIES_DB'] = {
            columns: [
                { id: 'sys_c_note', name: 'Nota' },
                { id: 'p1', name: 'Priorità', type: 'select' },
                { id: 'p2', name: 'Completato', type: 'checkbox' },
                { id: 'p3', name: 'Scadenza', type: 'date' }
            ],
            rows: [
                {
                    cells: {
                        'sys_c_note': noteId,
                        'p1': 'Alta',
                        'p2': true,
                        'p3': '' // Vuota, non deve essere conteggiata
                    }
                }
            ]
        };

        UI.checkAndUpdatePropertiesIcon(noteId);

        const btn = document.getElementById('btnNoteProperties');
        Assert.isTrue(btn.classList.contains('active'));
        const badge = btn.querySelector('.header-counter-badge');
        Assert.isNotNull(badge);
        Assert.strictEqual(badge.textContent, '2', "Deve conteggiare esattamente le 2 proprietà valorizzate");
    });

    test("UI: updateNoteInfoIcon conta i backlinks in entrata e aggiunge il badge", () => {
        const targetId = 'n_focal_target';
        AppState.notes = [
            { id: targetId, title: 'Nota Target', content: '<p>Centro</p>' },
            { id: 'n_a', title: 'Nota A', content: `<p><a data-note-id="${targetId}">Link</a></p>` },
            { id: 'n_b', title: 'Nota B', content: `<blockquote data-ref-note="${targetId}">Citazione</blockquote>` },
            { id: 'n_c', title: 'Nota C', content: '<p>Nessun link</p>' }
        ];

        UI.updateNoteInfoIcon(targetId);

        const btn = document.getElementById('btnNoteInfo');
        Assert.isTrue(btn.classList.contains('active'));
        const badge = btn.querySelector('.header-counter-badge');
        Assert.isNotNull(badge);
        Assert.strictEqual(badge.textContent, '2', "Deve rilevare esattamente i 2 backlinks in entrata");
    });

    test("UI: applyNoteSpellcheck imposta correttamente l'attributo spellcheck per la nota", () => {
        const titleInput = document.getElementById('noteTitle');
        const contentDiv = document.getElementById('noteContent');

        const noteNormal = { id: 'n1', title: 'Normale', disableSpellcheck: false };
        UI.applyNoteSpellcheck(noteNormal);
        Assert.strictEqual(contentDiv.getAttribute('spellcheck'), 'true');
        Assert.strictEqual(titleInput.getAttribute('spellcheck'), 'true');

        const noteNoSpell = { id: 'n2', title: 'Codice', disableSpellcheck: true };
        UI.applyNoteSpellcheck(noteNoSpell);
        Assert.strictEqual(contentDiv.getAttribute('spellcheck'), 'false');
        Assert.strictEqual(titleInput.getAttribute('spellcheck'), 'false');
    });

    test("UI: toggleMark inverte isMarked, imposta _isDirty e aggiorna il pulsante", () => {
        const note = { id: 'n_mark_test', title: 'Preferita', isMarked: false, _isDirty: false };
        AppState.notes = [note];
        AppState.currentNoteId = 'n_mark_test';

        UI.toggleMark();

        Assert.isTrue(note.isMarked);
        Assert.isTrue(note._isDirty);

        const btn = document.getElementById('markBtn');
        Assert.isTrue(btn.classList.contains('active'));

        UI.toggleMark();
        Assert.isFalse(note.isMarked);
        Assert.isFalse(btn.classList.contains('active'));
    });

    test("UI: updateBreadcrumb genera la catena dei genitori e include il badge Cestino per note eliminate", () => {
        const noteRoot = { id: 'root', parentId: null, title: 'Documenti' };
        const noteChild = { id: 'child', parentId: 'root', title: 'Progetto', deletedAt: Date.now() };
        AppState.notes = [noteRoot, noteChild];

        UI.updateBreadcrumb(noteChild);

        const bc = document.getElementById('breadcrumb');
        Assert.isTrue(bc.innerHTML.includes('Cestino'), "Deve mostrare il badge Cestino se la nota è eliminata");
        Assert.isTrue(bc.textContent.includes('Documenti'));
        Assert.isTrue(bc.textContent.includes('Progetto'));
    });

    test("UI: goUpOneLevel risale alla nota genitore o alla Home Dashboard", () => {
        let selectedNoteId = null;
        let homeCalled = false;

        const origSelect = UI.selectNote;
        const origHome = UI.goHome;
        UI.selectNote = (id) => { selectedNoteId = id; };
        UI.goHome = () => { homeCalled = true; };

        try {
            // Caso 1: nota con genitore
            AppState.notes = [
                { id: 'p_up', parentId: null, title: 'Padre' },
                { id: 'c_up', parentId: 'p_up', title: 'Figlio' }
            ];
            AppState.currentNoteId = 'c_up';
            UI.goUpOneLevel();
            Assert.strictEqual(selectedNoteId, 'p_up');

            // Caso 2: nota radice senza genitore -> va a Home
            AppState.currentNoteId = 'p_up';
            UI.goUpOneLevel();
            Assert.isTrue(homeCalled);
        } finally {
            UI.selectNote = origSelect;
            UI.goHome = origHome;
        }
    });

});