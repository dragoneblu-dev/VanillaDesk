/**
 * tests/test-events-global.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: events-global (Router Eventi, Scorciatoie e Interazioni)
 */

describe("EventsGlobal: Router Tastiera, Navigazione Link & Checkbox (test-events-global.js)", () => {

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

        const selector = document.getElementById('adv-global-row-selector');
        if (selector) selector.remove();
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

    test("EventsGlobal: openLinkDirectly normalizza percorsi assoluti Windows in formato file:///", () => {
        const link = document.createElement('a');
        link.setAttribute('href', 'C:\\Documenti\\Report.pdf');

        let openedUrl = null;
        const origOpen = window.open;
        window.open = (url) => { openedUrl = url; };

        try {
            EventsGlobal.openLinkDirectly(link);
            Assert.strictEqual(openedUrl, 'file:///C:/Documenti/Report.pdf');
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

    test("EventsGlobal: openLinkDirectly con ancora non trovata risale alla macro-sezione sec-*", () => {
        const link = document.createElement('a');
        link.setAttribute('href', '#sec-3-dettaglio-avanzato');

        const macroSec = document.createElement('div');
        macroSec.id = 'sec-3';
        document.body.appendChild(macroSec);

        let scrolled = false;
        macroSec.scrollIntoView = () => { scrolled = true; };

        try {
            EventsGlobal.openLinkDirectly(link);
            Assert.isTrue(scrolled, "Deve effettuare il fallback su sec-3");
        } finally {
            macroSec.remove();
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

    test("EventsGlobal: Alt+ArrowLeft e Alt+ArrowRight attivano la navigazione cronologica", () => {
        let backCalled = false;
        let forwardCalled = false;

        const origBack = UI.navHistoryBack;
        const origForward = UI.navHistoryForward;
        UI.navHistoryBack = () => { backCalled = true; };
        UI.navHistoryForward = () => { forwardCalled = true; };

        try {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }));
            Assert.isTrue(backCalled, "Alt+Left deve chiamare navHistoryBack");

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
            Assert.isTrue(forwardCalled, "Alt+Right deve chiamare navHistoryForward");
        } finally {
            UI.navHistoryBack = origBack;
            UI.navHistoryForward = origForward;
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

    test("EventsGlobal: scorciatoie Ctrl+B, I, U e K chiamano le funzioni di formattazione corrispondenti", () => {
        AppState.isEditMode = true;
        let lastExec = null;
        let toggleCaseCalled = false;

        const origExec = Editor.exec;
        const origToggleCase = Editor.toggleCase;
        Editor.exec = (cmd) => { lastExec = cmd; };
        Editor.toggleCase = () => { toggleCaseCalled = true; };

        try {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
            Assert.strictEqual(lastExec, 'bold');

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, bubbles: true }));
            Assert.strictEqual(lastExec, 'italic');

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', ctrlKey: true, bubbles: true }));
            Assert.strictEqual(lastExec, 'underline');

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
            Assert.isTrue(toggleCaseCalled);
        } finally {
            Editor.exec = origExec;
            Editor.toggleCase = origToggleCase;
        }
    });

    test("EventsGlobal: scorciatoie Ctrl+Shift+H e Ctrl+Alt+H attivano evidenziatore e colore testo", () => {
        AppState.isEditMode = true;
        let lastColorType = null;

        const origApplyLast = ColorManager.applyLast;
        ColorManager.applyLast = (type) => { lastColorType = type; };

        try {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH', ctrlKey: true, shiftKey: true, bubbles: true }));
            Assert.strictEqual(lastColorType, 'highlight');

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH', ctrlKey: true, altKey: true, bubbles: true }));
            Assert.strictEqual(lastColorType, 'text');
        } finally {
            ColorManager.applyLast = origApplyLast;
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

    test("EventsGlobal: auxclick (tasto centrale) su link delega a openLinkDirectly", () => {
        const link = document.createElement('a');
        link.className = 'file-link';
        link.setAttribute('data-file-path', 'documenti/note.txt');
        mockEditorEl.appendChild(link);

        let directlyOpened = null;
        const origOpen = EventsGlobal.openLinkDirectly;
        EventsGlobal.openLinkDirectly = (l) => { directlyOpened = l; };

        try {
            const ev = new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true });
            link.dispatchEvent(ev);
            Assert.strictEqual(directlyOpened, link);
        } finally {
            EventsGlobal.openLinkDirectly = origOpen;
            link.remove();
        }
    });

    test("EventsGlobal: focusin su noteTitle disattiva la toolbar dell'editor", () => {
        AppState.isEditMode = true;

        const titleInput = document.createElement('input');
        titleInput.id = 'noteTitle';
        document.body.appendChild(titleInput);

        let toolbarEnabled = null;
        const origToggle = Editor.toggleAdvancedToolbar;
        Editor.toggleAdvancedToolbar = (enable) => { toolbarEnabled = enable; };

        try {
            titleInput.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
            Assert.isFalse(toolbarEnabled, "Su focusin del titolo la toolbar avanzata deve essere disabilitata");
        } finally {
            Editor.toggleAdvancedToolbar = origToggle;
            titleInput.remove();
        }
    });

    test("EventsGlobal: click su .cit-toggle espande e collassa il blocco citazione", () => {
        const block = document.createElement('div');
        block.className = 'block-citation';
        const toggleBtn = document.createElement('span');
        toggleBtn.className = 'cit-toggle';
        const body = document.createElement('div');
        body.className = 'citation-body';
        block.appendChild(toggleBtn);
        block.appendChild(body);
        document.body.appendChild(block);

        let autoSaved = false;
        const origSave = Store.triggerAutoSave;
        Store.triggerAutoSave = () => { autoSaved = true; };

        try {
            // Primo click: collassa
            toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            Assert.strictEqual(block.getAttribute('data-collapsed'), 'true');
            Assert.strictEqual(body.style.display, 'none');

            // Secondo click: ri-espande
            toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            Assert.isNull(block.getAttribute('data-collapsed'));
            Assert.strictEqual(body.style.display, 'block');
            Assert.isTrue(autoSaved);
        } finally {
            Store.triggerAutoSave = origSave;
            block.remove();
        }
    });

});