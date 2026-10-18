/**
 * tests/test-events-search.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: events-search (Sottomodulo di EventsGlobal)
 * Conteggio test case: 10
 */

describe("EventsSearch: Ricerca Full-Text, Autocomplete Tag & Highlight (10 Test)", () => {

    let originalAppState;
    let mockSearchInput;
    let mockSearchControls;
    let mockSearchCounter;
    let mockEditorEl;

    beforeEach(() => {
        originalAppState = {
            searchFilter: AppState.searchFilter,
            activePropertyFilters: AppState.activePropertyFilters ? [...AppState.activePropertyFilters] : [],
            currentNoteId: AppState.currentNoteId,
            isEditMode: AppState.isEditMode,
            notes: AppState.notes ? [...AppState.notes] : []
        };

        const existingInput = document.getElementById('searchInput');
        if (existingInput) existingInput.remove();

        mockSearchInput = document.createElement('input');
        mockSearchInput.id = 'searchInput';
        document.body.appendChild(mockSearchInput);

        const existingControls = document.getElementById('searchControls');
        if (existingControls) existingControls.remove();

        mockSearchControls = document.createElement('div');
        mockSearchControls.id = 'searchControls';
        mockSearchControls.className = 'hidden';
        document.body.appendChild(mockSearchControls);

        const existingCounter = document.getElementById('searchCounter');
        if (existingCounter) existingCounter.remove();

        mockSearchCounter = document.createElement('span');
        mockSearchCounter.id = 'searchCounter';
        document.body.appendChild(mockSearchCounter);

        mockEditorEl = document.getElementById('noteContent');
        if (!mockEditorEl) {
            mockEditorEl = document.createElement('div');
            mockEditorEl.id = 'noteContent';
            document.body.appendChild(mockEditorEl);
        } else {
            mockEditorEl.innerHTML = '';
        }
    });

    afterEach(() => {
        AppState.searchFilter = originalAppState.searchFilter;
        AppState.activePropertyFilters = originalAppState.activePropertyFilters;
        AppState.currentNoteId = originalAppState.currentNoteId;
        AppState.isEditMode = originalAppState.isEditMode;
        AppState.notes = originalAppState.notes;

        if (mockSearchInput) mockSearchInput.remove();
        if (mockSearchControls) mockSearchControls.remove();
        if (mockSearchCounter) mockSearchCounter.remove();
        if (mockEditorEl) mockEditorEl.innerHTML = '';

        const portal = document.getElementById('sidebar-filter-autocomplete-portal');
        if (portal) portal.remove();
    });

    test("EventsSearch: _executeSearchLogic imposta AppState.searchFilter in minuscolo e gestisce la visibilità dei controlli", () => {
        mockSearchInput.value = "Test Query";
        EventsGlobal._executeSearchLogic(mockSearchInput);

        Assert.strictEqual(AppState.searchFilter, "test query");
        Assert.isFalse(mockSearchControls.classList.contains('hidden'));

        mockSearchInput.value = "";
        EventsGlobal._executeSearchLogic(mockSearchInput);

        Assert.strictEqual(AppState.searchFilter, "");
        Assert.isTrue(mockSearchControls.classList.contains('hidden'));
    });

    test("EventsSearch: _executeSearchLogic mantiene visibili i controlli se sono attivi filtri proprietà anche con testo vuoto", () => {
        mockSearchInput.value = "";
        AppState.activePropertyFilters = [{ colId: 'sys_c_tags', realValue: 'Urgente' }];

        EventsGlobal._executeSearchLogic(mockSearchInput);
        Assert.isFalse(mockSearchControls.classList.contains('hidden'));
    });

    test("EventsSearch: executeTagSearch espande la sidebar e seleziona il tab note", () => {
        const sidebar = document.createElement('aside');
        sidebar.id = 'sidebar';
        sidebar.classList.add('collapsed');
        document.body.appendChild(sidebar);

        let switchedToNotes = false;
        const origSwitch = UI.switchToNotes;
        UI.switchToNotes = () => { switchedToNotes = true; };

        try {
            EventsGlobal.executeTagSearch("progetto");
            Assert.isFalse(sidebar.classList.contains('collapsed'));
            Assert.isTrue(switchedToNotes);
        } finally {
            UI.switchToNotes = origSwitch;
            sidebar.remove();
        }
    });

    test("EventsSearch: executeTagSearch applica direttamente il filtro pillola se la corrispondenza è univoca (Caso A)", () => {
        let selectedCol = null;
        let selectedVal = null;

        const origGetMatches = SidebarManager.SearchAutocomplete.getMatchesForTag;
        const origSelect = SidebarManager.SearchAutocomplete.select;

        SidebarManager.SearchAutocomplete.getMatchesForTag = (tag) => [
            { colId: 'sys_c_tags', realValue: tag, colName: 'Tag', displayValue: tag }
        ];
        SidebarManager.SearchAutocomplete.select = (colId, realVal) => {
            selectedCol = colId;
            selectedVal = realVal;
        };

        try {
            EventsGlobal.executeTagSearch("urgente");
            Assert.strictEqual(selectedCol, 'sys_c_tags');
            Assert.strictEqual(selectedVal, 'urgente');
        } finally {
            SidebarManager.SearchAutocomplete.getMatchesForTag = origGetMatches;
            SidebarManager.SearchAutocomplete.select = origSelect;
        }
    });

    test("EventsSearch: executeTagSearch apre il dropdown di scelta in presenza di ambiguità (Caso B)", async () => {
        let autocompleteShown = false;

        const origGetMatches = SidebarManager.SearchAutocomplete.getMatchesForTag;
        const origShow = SidebarManager.SearchAutocomplete.show;

        SidebarManager.SearchAutocomplete.getMatchesForTag = (tag) => [
            { colId: 'sys_c_tags', realValue: tag, colName: 'Tag', displayValue: tag },
            { colId: 'c_cat', realValue: tag, colName: 'Categoria', displayValue: tag }
        ];
        SidebarManager.SearchAutocomplete.show = (input, term) => {
            autocompleteShown = true;
            Assert.strictEqual(term, "#urgente");
        };

        try {
            EventsGlobal.executeTagSearch("urgente");
            await new Promise(r => setTimeout(r, 80));

            Assert.isTrue(autocompleteShown);
            Assert.strictEqual(mockSearchInput.value, "#urgente");
        } finally {
            SidebarManager.SearchAutocomplete.getMatchesForTag = origGetMatches;
            SidebarManager.SearchAutocomplete.show = origShow;
        }
    });

    test("EventsSearch: executeTagSearch avvia ricerca full-text se il tag non esiste nello schema proprietà (Caso C)", () => {
        const origGetMatches = SidebarManager.SearchAutocomplete.getMatchesForTag;
        SidebarManager.SearchAutocomplete.getMatchesForTag = () => [];

        try {
            EventsGlobal.executeTagSearch("nuovo_tag");
            Assert.strictEqual(mockSearchInput.value, "#nuovo_tag");
            Assert.strictEqual(AppState.searchFilter, "#nuovo_tag");
        } finally {
            SidebarManager.SearchAutocomplete.getMatchesForTag = origGetMatches;
        }
    });

    test("EventsSearch: _getClickedHashtagAtPoint estrae correttamente tag validi dal testo", () => {
        const textNode = document.createTextNode("Questo è un #progetto importante");
        mockEditorEl.appendChild(textNode);

        const origRangeFromPoint = document.caretRangeFromPoint;
        document.caretRangeFromPoint = (x, y) => {
            const range = document.createRange();
            range.setStart(textNode, 15);
            range.collapse(true);
            return range;
        };

        try {
            const result = EventsGlobal._getClickedHashtagAtPoint(100, 100);
            Assert.isNotNull(result);
            Assert.strictEqual(result.fullTag, "#progetto");
            Assert.strictEqual(result.cleanTag, "progetto");
        } finally {
            document.caretRangeFromPoint = origRangeFromPoint;
        }
    });

    test("EventsSearch: _getClickedHashtagAtPoint rifiuta codici esadecimali a 3 e 6 caratteri", () => {
        const textNode = document.createTextNode("Colore: #fff e #1a2b3c non sono tag");
        mockEditorEl.appendChild(textNode);

        const origRangeFromPoint = document.caretRangeFromPoint;

        try {
            document.caretRangeFromPoint = () => {
                const range = document.createRange();
                range.setStart(textNode, 9);
                range.collapse(true);
                return range;
            };
            Assert.isNull(EventsGlobal._getClickedHashtagAtPoint(10, 10));

            document.caretRangeFromPoint = () => {
                const range = document.createRange();
                range.setStart(textNode, 18);
                range.collapse(true);
                return range;
            };
            Assert.isNull(EventsGlobal._getClickedHashtagAtPoint(20, 20));
        } finally {
            document.caretRangeFromPoint = origRangeFromPoint;
        }
    });

    test("EventsSearch: _getClickedHashtagAtPoint ignora hashtag all'interno di blocchi codice (pre.code-content)", () => {
        const pre = document.createElement('pre');
        pre.className = 'code-content';
        const codeText = document.createTextNode("#!/bin/bash\n# commento");
        pre.appendChild(codeText);
        mockEditorEl.appendChild(pre);

        const origRangeFromPoint = document.caretRangeFromPoint;
        document.caretRangeFromPoint = () => {
            const range = document.createRange();
            range.setStart(codeText, 3);
            range.collapse(true);
            return range;
        };

        try {
            const result = EventsGlobal._getClickedHashtagAtPoint(10, 10);
            Assert.isNull(result);
        } finally {
            document.caretRangeFromPoint = origRangeFromPoint;
        }
    });

    test("EventsSearch: scheduleHashtagHighlights esegue il debounce senza sollevare eccezioni in assenza di note aperte", async () => {
        AppState.currentNoteId = null;
        EventsGlobal.scheduleHashtagHighlights();

        Assert.isNotNull(EventsGlobal._hashtagHighlightTimer);

        await new Promise(r => setTimeout(r, 150));
        Assert.isTrue(true);
    });

});