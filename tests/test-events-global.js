/**
 * tests/test-events-global.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: events-global (Router Eventi, Scorciatoie e Interazioni)
 * Conteggio test case: 11
 */

describe("EventsGlobal: Router Tastiera, Navigazione Link & Checkbox (11 Test)", () => {

    let mockEditorEl;
    let originalAppState;

    beforeEach(() => {
        originalAppState = {
            isEditMode: AppState.isEditMode,
            currentNoteId: AppState.currentNoteId,
            notes: AppState.notes ? [...AppState.notes] : []
        };

        mockEditorEl = document.getElementById('noteContent');
        if (!mockEditorEl) {
            mockEditorEl = document.createElement('div');
            mockEditorEl.id = 'noteContent';
            document.body.appendChild(mockEditorEl);
        } else {
            mockEditorEl.innerHTML = '';
        }

        const oldSearch = document.getElementById('searchInput');
        if (oldSearch) oldSearch.remove();

        EventsGlobal._initialized = false;
        EventsGlobal.init();
    });

    afterEach(() => {
        AppState.isEditMode = originalAppState.isEditMode;
        AppState.currentNoteId = originalAppState.currentNoteId;
        AppState.notes = originalAppState.notes;

        if (mockEditorEl) mockEditorEl.innerHTML = '';
        if (typeof LinkManager !== 'undefined') LinkManager.hideFloatingMenu();
        if (typeof UI !== 'undefined' && typeof UI.closeDrawer === 'function') {
            UI.closeDrawer(true);
        }
    });

    test("EventsGlobal: openLinkDirectly invoca UI.selectNote per link interni con noteId e parametri", () => {
        const link = document.createElement('a');
        link.className = 'internal-link';
        link.setAttribute('data-note-id', 'note_abc');
        link.setAttribute('data-anchor', 'Capitolo 1');
        link.setAttribute('data-ref-id', 'blk_999');

        let calledId = null;
        let calledAnchor = null;
        let calledRef = null;

        const origSelect = UI.selectNote;
        UI.selectNote = (id, anchor, ref) => {
            calledId = id;
            calledAnchor = anchor;
            calledRef = ref;
        };

        try {
            EventsGlobal.openLinkDirectly(link);
            Assert.strictEqual(calledId, 'note_abc');
            Assert.strictEqual(calledAnchor, 'Capitolo 1');
            Assert.strictEqual(calledRef, 'blk_999');
        } finally {
            UI.selectNote = origSelect;
        }
    });

    test("EventsGlobal: openLinkDirectly delega a LinkManager.openViewer per i file-link", () => {
        const link = document.createElement('a');
        link.className = 'file-link';
        link.setAttribute('data-file-path', 'logs/error.log');

        let openedPath = null;
        const origViewer = LinkManager.openViewer;
        LinkManager.openViewer = (path) => { openedPath = path; };

        try {
            EventsGlobal.openLinkDirectly(link);
            Assert.strictEqual(openedPath, 'logs/error.log');
        } finally {
            LinkManager.openViewer = origViewer;
        }
    });

    test("EventsGlobal: openLinkDirectly garantisce il prefisso di protocollo 'https://' per URL web privi di schema", () => {
        const link = document.createElement('a');
        link.setAttribute('href', 'www.google.com');

        let openedUrl = null;
        const origOpen = window.open;
        window.open = (url) => { openedUrl = url; };

        try {
            EventsGlobal.openLinkDirectly(link);
            Assert.strictEqual(openedUrl, 'https://www.google.com');
        } finally {
            window.open = origOpen;
        }
    });

    test("EventsGlobal: openLinkDirectly esegue lo scrollIntoView per ancore hash interne (#)", () => {
        const link = document.createElement('a');
        link.setAttribute('href', '#target-section');

        const targetEl = document.createElement('div');
        targetEl.id = 'target-section';
        document.body.appendChild(targetEl);

        let scrolled = false;
        targetEl.scrollIntoView = () => { scrolled = true; };

        try {
            EventsGlobal.openLinkDirectly(link);
            Assert.isTrue(scrolled);
        } finally {
            targetEl.remove();
        }
    });

    test("EventsGlobal: selectionchange chiude la toolbar link quando il cursore esce dall'elemento attivo", () => {
        const link = document.createElement('a');
        link.textContent = "Mio Link";
        mockEditorEl.appendChild(link);

        const outsideParagraph = document.createElement('p');
        outsideParagraph.textContent = "Altro testo";
        mockEditorEl.appendChild(outsideParagraph);

        LinkManager.activeLink = link;

        const sel = window.getSelection();
        const range = document.createRange();
        range.setStart(outsideParagraph.firstChild, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);

        document.dispatchEvent(new Event('selectionchange'));

        Assert.isNull(LinkManager.activeLink);
    });

    test("EventsGlobal: selectionchange mantiene attiva la toolbar link se la selezione resta all'interno del link", () => {
        const link = document.createElement('a');
        link.textContent = "Mio Link";
        mockEditorEl.appendChild(link);

        LinkManager.activeLink = link;

        const sel = window.getSelection();
        const range = document.createRange();
        range.setStart(link.firstChild, 2);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);

        document.dispatchEvent(new Event('selectionchange'));

        Assert.strictEqual(LinkManager.activeLink, link);
    });

    test("EventsGlobal: Ctrl+P apre la sidebar e focalizza il campo di ricerca globale", () => {
        const oldSidebar = document.getElementById('sidebar');
        if (oldSidebar) oldSidebar.remove();

        const sidebar = document.createElement('aside');
        sidebar.id = 'sidebar';
        sidebar.classList.add('collapsed');
        document.body.appendChild(sidebar);

        const oldSearch = document.getElementById('searchInput');
        if (oldSearch) oldSearch.remove();

        const input = document.createElement('input');
        input.id = 'searchInput';
        document.body.appendChild(input);

        let focused = false;
        input.addEventListener('focus', () => { focused = true; });

        try {
            const ev = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true });
            document.dispatchEvent(ev);

            Assert.isFalse(sidebar.classList.contains('collapsed'));
            Assert.isTrue(focused);
        } finally {
            sidebar.remove();
            input.remove();
        }
    });

    test("EventsGlobal: Ctrl+A circoscrive la selezione esclusivamente al campo cella (.adv-cell-text) attivo", () => {
        AppState.isEditMode = true;

        const cell = document.createElement('div');
        cell.className = 'adv-cell-text';
        cell.textContent = "Dato Cella";
        mockEditorEl.appendChild(cell);

        const sel = window.getSelection();
        const range = document.createRange();
        range.setStart(cell.firstChild, 2);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);

        const ev = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
        document.dispatchEvent(ev);

        const activeRange = sel.getRangeAt(0);
        Assert.strictEqual(activeRange.toString(), "Dato Cella");
    });

    test("EventsGlobal: scorciatoie Ctrl+Alt+1, 2, 3 e 0 invocano Editor.toggleHeader con i tag corretti", () => {
        AppState.isEditMode = true;
        let lastTag = null;

        const origToggle = Editor.toggleHeader;
        Editor.toggleHeader = (tag) => { lastTag = tag; };

        try {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1', altKey: true, ctrlKey: true, bubbles: true }));
            Assert.strictEqual(lastTag, 'h1');

            document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', code: 'Digit2', altKey: true, ctrlKey: true, bubbles: true }));
            Assert.strictEqual(lastTag, 'h2');

            document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', code: 'Digit3', altKey: true, ctrlKey: true, bubbles: true }));
            Assert.strictEqual(lastTag, 'h3');

            document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', code: 'Digit0', altKey: true, ctrlKey: true, bubbles: true }));
            Assert.strictEqual(lastTag, 'p');
        } finally {
            Editor.toggleHeader = origToggle;
        }
    });

    test("EventsGlobal: tasto Escape chiude il Drawer e tutti i menu aperti", () => {
        let menuClosed = false;
        let drawerClosed = false;

        const origCloseMenu = UI.Menu.closeAll;
        const origCloseDrawer = UI.closeDrawer;

        UI.Menu.closeAll = () => { menuClosed = true; };
        UI.closeDrawer = () => { drawerClosed = true; };

        let drawer = document.getElementById('advGlobalDrawer');
        let createdDrawer = false;
        if (!drawer) {
            drawer = document.createElement('div');
            drawer.id = 'advGlobalDrawer';
            document.body.appendChild(drawer);
            createdDrawer = true;
        }
        drawer.classList.add('open');

        try {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            Assert.isTrue(menuClosed);
            Assert.isTrue(drawerClosed);
        } finally {
            UI.Menu.closeAll = origCloseMenu;
            UI.closeDrawer = origCloseDrawer;
            if (createdDrawer) drawer.remove();
            else drawer.classList.remove('open');
        }
    });

    test("EventsGlobal: listener change sul checkbox aggiorna l'attributo 'checked' e salva in AppState", () => {
        const noteId = "note_test_cb";
        AppState.currentNoteId = noteId;
        AppState.isSwitchingNote = false;

        const testNote = {
            id: noteId,
            content: '<p><input type="checkbox"> Compito</p>',
            _isDirty: false
        };
        AppState.notes = [testNote];

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        mockEditorEl.appendChild(cb);

        let autoSaved = false;
        const origSave = Store.triggerAutoSave;
        Store.triggerAutoSave = () => { autoSaved = true; };

        try {
            cb.checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));

            Assert.strictEqual(cb.getAttribute('checked'), 'true');
            Assert.isTrue(autoSaved);

            cb.checked = false;
            cb.dispatchEvent(new Event('change', { bubbles: true }));

            Assert.isNull(cb.getAttribute('checked'));
        } finally {
            Store.triggerAutoSave = origSave;
        }
    });

});