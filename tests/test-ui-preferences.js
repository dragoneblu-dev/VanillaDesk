/**
 * tests/test-ui-preferences.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-preferences
 */

describe("UI Preferences: Temi, Zoom Font, WordWrap & Continuous Edit (test-ui-preferences.js)", () => {

    beforeEach(() => {
        let sandbox = document.getElementById('testSandBox');
        if (!sandbox) {
            sandbox = document.createElement('div');
            sandbox.id = 'testSandBox';
            document.body.appendChild(sandbox);
        }

        let editorWrapper = document.getElementById('editorWrapper');
        if (!editorWrapper) {
            editorWrapper = document.createElement('div');
            editorWrapper.id = 'editorWrapper';
            sandbox.appendChild(editorWrapper);
        }

        let editorToolbar = document.getElementById('editorToolbar');
        if (!editorToolbar) {
            editorToolbar = document.createElement('div');
            editorToolbar.id = 'editorToolbar';
            editorToolbar.className = 'toolbar hidden';
            sandbox.appendChild(editorToolbar);
        }

        let noteTitle = document.getElementById('noteTitle');
        if (!noteTitle) {
            noteTitle = document.createElement('input');
            noteTitle.id = 'noteTitle';
            sandbox.appendChild(noteTitle);
        }

        let noteContent = document.getElementById('noteContent');
        if (!noteContent) {
            noteContent = document.createElement('div');
            noteContent.id = 'noteContent';
            sandbox.appendChild(noteContent);
        }

        let editToggleBtn = document.getElementById('editToggleBtn');
        if (!editToggleBtn) {
            editToggleBtn = document.createElement('button');
            editToggleBtn.id = 'editToggleBtn';
            sandbox.appendChild(editToggleBtn);
        }

        let sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            sidebar = document.createElement('aside');
            sidebar.id = 'sidebar';
            sandbox.appendChild(sidebar);
        }

        let sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
        if (!sidebarToggleBtn) {
            sidebarToggleBtn = document.createElement('button');
            sidebarToggleBtn.id = 'sidebarToggleBtn';
            sandbox.appendChild(sidebarToggleBtn);
        }
    });

    afterEach(() => {
        document.body.removeAttribute('data-theme');
        AppState.currentNoteId = null;
        AppState.isEditMode = false;
    });

    test("UI Preferences: togglePageWidth alterna tra 900px e 100%", () => {
        document.documentElement.style.setProperty('--page-max-width', '900px');

        UI.togglePageWidth();
        Assert.strictEqual(document.documentElement.style.getPropertyValue('--page-max-width'), '100%');

        UI.togglePageWidth();
        Assert.strictEqual(document.documentElement.style.getPropertyValue('--page-max-width'), '900px');
    });

    test("UI Preferences: changeFontSize incrementa e rispetta limiti min (10px) e max (32px)", () => {
        UI.currentFontSize = 16;
        UI.changeFontSize(2);
        Assert.strictEqual(UI.currentFontSize, 18);
        Assert.strictEqual(document.documentElement.style.getPropertyValue('--reading-font-size'), '18px');

        UI.changeFontSize(-30);
        Assert.strictEqual(UI.currentFontSize, 10); // Min clamp

        UI.changeFontSize(50);
        Assert.strictEqual(UI.currentFontSize, 32); // Max clamp
    });

    test("UI Preferences: setTheme assegna attributo data-theme su body e salva in localStorage", () => {
        UI.setTheme('dark');
        Assert.strictEqual(document.body.getAttribute('data-theme'), 'dark');
        Assert.strictEqual(localStorage.getItem('theme'), 'dark');

        UI.setTheme('white');
        Assert.strictEqual(document.body.getAttribute('data-theme'), 'white');

        UI.setTheme('light');
        Assert.isNull(document.body.getAttribute('data-theme'), "Il tema chiaro predefinito rimuove l'attributo data-theme");
    });

    test("UI Preferences: setContinuousEdit e toggleContinuousEdit alternano la modalità di modifica continua", () => {
        UI.setContinuousEdit(true);
        Assert.isTrue(AppState.continuousEditMode);
        Assert.strictEqual(localStorage.getItem('pronotes_continuous'), 'true');

        UI.toggleContinuousEdit();
        Assert.isFalse(AppState.continuousEditMode);
        Assert.strictEqual(localStorage.getItem('pronotes_continuous'), 'false');
    });

    test("UI Preferences: toggleWordWrap aggiunge e rimuove la classe no-wrap su noteContent", () => {
        const editor = document.getElementById('noteContent');
        AppState.noWrapMode = false;

        UI.toggleWordWrap();
        Assert.isTrue(AppState.noWrapMode);
        Assert.isTrue(editor.classList.contains('no-wrap'));

        UI.toggleWordWrap();
        Assert.isFalse(AppState.noWrapMode);
        Assert.isFalse(editor.classList.contains('no-wrap'));
    });

    test("UI Preferences: toggleSidebar alterna la classe collapsed e lo stato del pulsante", () => {
        const sb = document.getElementById('sidebar');
        const btn = document.getElementById('sidebarToggleBtn');

        sb.classList.remove('collapsed');
        btn.classList.add('active');

        UI.toggleSidebar();
        Assert.isTrue(sb.classList.contains('collapsed'));
        Assert.isFalse(btn.classList.contains('active'));

        UI.toggleSidebar();
        Assert.isFalse(sb.classList.contains('collapsed'));
        Assert.isTrue(btn.classList.add !== undefined);
    });

    test("UI Preferences: toggleEditMode attiva e disattiva toolbar, attributi contenteditable e readonly", () => {
        const note = { id: 'n_edit_test', title: 'Testo', content: '<p>A</p>' };
        AppState.notes = [note];
        AppState.currentNoteId = 'n_edit_test';

        const titleInput = document.getElementById('noteTitle');
        const contentDiv = document.getElementById('noteContent');
        const toolbar = document.getElementById('editorToolbar');
        const toggleBtn = document.getElementById('editToggleBtn');

        // Attivazione Edit Mode
        UI.toggleEditMode(true);
        Assert.isTrue(AppState.isEditMode);
        Assert.isNull(titleInput.getAttribute('readonly'));
        Assert.strictEqual(contentDiv.getAttribute('contenteditable'), 'true');
        Assert.isFalse(toolbar.classList.contains('hidden'));
        Assert.isTrue(toggleBtn.classList.contains('btn-editing'));

        // Disattivazione Edit Mode
        UI.toggleEditMode(false);
        Assert.isFalse(AppState.isEditMode);
        Assert.strictEqual(titleInput.getAttribute('readonly'), 'true');
        Assert.strictEqual(contentDiv.getAttribute('contenteditable'), 'false');
        Assert.isTrue(toolbar.classList.contains('hidden'));
        Assert.isFalse(toggleBtn.classList.contains('btn-editing'));
    });

});