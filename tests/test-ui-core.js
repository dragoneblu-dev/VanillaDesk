/**
 * tests/test-ui-core.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-core
 */

describe("UI Core: Interfaccia Base, Status Pill & Header Unsaved (test-ui-core.js)", () => {

    let originalFileName;
    let originalCurrentNoteId;

    beforeEach(() => {
        originalFileName = AppState.fileName;
        originalCurrentNoteId = AppState.currentNoteId;

        let sandbox = document.getElementById('testSandBox');
        if (!sandbox) {
            sandbox = document.createElement('div');
            sandbox.id = 'testSandBox';
            document.body.appendChild(sandbox);
        }

        let header = document.querySelector('header');
        if (!header) {
            header = document.createElement('header');
            sandbox.appendChild(header);
        }

        let saveStatus = document.getElementById('saveStatus');
        if (!saveStatus) {
            saveStatus = document.createElement('span');
            saveStatus.id = 'saveStatus';
            header.appendChild(saveStatus);
        }

        let fileNameDisplay = document.getElementById('fileNameDisplay');
        if (!fileNameDisplay) {
            fileNameDisplay = document.createElement('div');
            fileNameDisplay.id = 'fileNameDisplay';
            header.appendChild(fileNameDisplay);
        }
    });

    afterEach(() => {
        AppState.fileName = originalFileName;
        AppState.currentNoteId = originalCurrentNoteId;

        const header = document.querySelector('header');
        if (header) header.classList.remove('header-unsaved');

        const saveStatus = document.getElementById('saveStatus');
        if (saveStatus) saveStatus.className = 'status-pill hidden';
    });

    test("UI: formatDate produce una stringa temporale formattata conforme", () => {
        const iso = "2026-05-15T14:30:00.000Z";
        const formatted = UI.formatDate(iso);
        Assert.isTrue(formatted.includes("15/05") || formatted.includes("05/15"));
        Assert.isTrue(formatted.includes(":30"));
    });

    test("UI: formatDate con parametro nullo o vuoto restituisce stringa vuota", () => {
        Assert.strictEqual(UI.formatDate(null), "");
        Assert.strictEqual(UI.formatDate(""), "");
        Assert.strictEqual(UI.formatDate(undefined), "");
    });

    test("UI: escapeHTML esegue l'escape sicuro di caratteri speciali e gestisce input nulli", () => {
        Assert.strictEqual(UI.escapeHTML(null), "");
        Assert.strictEqual(UI.escapeHTML(undefined), "");
        Assert.strictEqual(UI.escapeHTML('<script>alert("xss") & \'test\'</script>'), "&lt;script&gt;alert(&quot;xss&quot;) &amp; &#39;test&#39;&lt;/script&gt;");
        Assert.strictEqual(UI.escapeHTML(12345), "12345");
    });

    test("UI: showStatus con stato 'unsaved' colora l'header di rosso e abilita il click per creare il workspace", () => {
        const header = document.querySelector('header');
        const saveStatus = document.getElementById('saveStatus');

        let createWorkspaceCalled = false;
        const origCreate = Store.createWorkspace;
        Store.createWorkspace = (force) => { createWorkspaceCalled = true; };

        try {
            UI.showStatus('unsaved');
            Assert.isTrue(header.classList.contains('header-unsaved'), "L'header deve avere la classe header-unsaved");
            Assert.isTrue(saveStatus.classList.contains('status-error'));
            Assert.strictEqual(saveStatus.style.cursor, 'pointer');

            saveStatus.click();
            Assert.isTrue(createWorkspaceCalled, "Il click sul pill unsaved deve avviare la procedura di salvataggio workspace");
        } finally {
            Store.createWorkspace = origCreate;
        }
    });

    test("UI: showStatus con stato 'saved' rimuove l'avviso rosso dall'header", () => {
        const header = document.querySelector('header');
        header.classList.add('header-unsaved');

        UI.showStatus('saved');
        Assert.isFalse(header.classList.contains('header-unsaved'));
        const saveStatus = document.getElementById('saveStatus');
        Assert.isTrue(saveStatus.classList.contains('status-saved'));
    });

    test("UI: updateHeaderTitles visualizza workspace e titolo nota su due righe", () => {
        UI.updateHeaderTitles("Progetto Alpha", "Specifiche Tecniche");

        const display = document.getElementById('fileNameDisplay');
        const wsSpan = display.querySelector('.header-workspace-name');
        const noteSpan = display.querySelector('.header-note-name');

        Assert.isNotNull(wsSpan);
        Assert.isNotNull(noteSpan);
        Assert.strictEqual(wsSpan.textContent, "Progetto Alpha");
        Assert.strictEqual(noteSpan.textContent, "Specifiche Tecniche");
    });

    test("UI: updateHeaderTitles in assenza di nota attiva visualizza la Home Dashboard", () => {
        AppState.fileName = "MioWorkspace";
        AppState.currentNoteId = null;

        UI.updateHeaderTitles(null, null);

        const display = document.getElementById('fileNameDisplay');
        const noteSpan = display.querySelector('.header-note-name');
        Assert.strictEqual(noteSpan.textContent, I18n.t('home_dashboard.title'));
    });

    test("UI: openGraphView salva preventivamente se il workspace è dirty e delega a GraphApp", () => {
        let savedToFile = false;
        let graphOpenedWith = null;

        const origSave = Store.saveToFile;
        const origDirty = Store.isDirty;
        const origHandle = AppState.workspaceHandle;

        Store.saveToFile = () => { savedToFile = true; };
        Store.isDirty = true;
        AppState.workspaceHandle = { name: "ws" };

        window.GraphApp = {
            open: (noteId) => { graphOpenedWith = noteId; }
        };

        try {
            UI.openGraphView('note_target_graph');
            Assert.isTrue(savedToFile, "Deve salvare prima di aprire il grafo");
            Assert.strictEqual(graphOpenedWith, 'note_target_graph');
        } finally {
            Store.saveToFile = origSave;
            Store.isDirty = origDirty;
            AppState.workspaceHandle = origHandle;
            delete window.GraphApp;
        }
    });

});