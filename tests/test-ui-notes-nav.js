/**
 * tests/test-ui-notes-nav.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: js/ui/ui-notes-nav.js
 */

describe("UI.NotesNav: Cronologia, Gerarchia, Home & JumpToWidget (test-ui-notes-nav.js)", () => {

    test("_peekNavHistoryTarget & updateNavHistoryUI: saltano note eliminate e gestiscono tooltip e pulsante Livello Superiore", () => {
        const prevNotes = [...AppState.notes];
        const prevCurId = AppState.currentNoteId;
        const prevHist = [...UI._navHistory];
        const prevIdx = UI._navHistoryIndex;

        try {
            AppState.notes = [
                { id: 'n_1', parentId: null, title: 'Prima Nota' },
                { id: 'n_del', parentId: null, title: 'Eliminata', deletedAt: Date.now() },
                { id: 'n_2', parentId: 'n_1', title: 'Seconda Nota' }
            ];
            AppState.currentNoteId = 'n_2';
            UI._navHistory = ['n_1', 'n_del', 'n_2', null];
            UI._navHistoryIndex = 2;

            const backTarget = UI._peekNavHistoryTarget(-1);
            const fwdTarget = UI._peekNavHistoryTarget(1);

            Assert.isTrue(backTarget !== null && backTarget.id === 'n_1');
            Assert.isTrue(fwdTarget !== null && fwdTarget.id === null);

            UI.updateNavHistoryUI();

            const btnBack = document.getElementById('navBackBtn');
            const btnFwd = document.getElementById('navForwardBtn');
            const btnUp = document.getElementById('goUpBtn');

            Assert.isFalse(btnBack.disabled);
            Assert.isTrue(btnBack.title.includes('[Prima Nota]'));
            Assert.isFalse(btnFwd.disabled);
            Assert.isTrue(btnFwd.title.includes(`[${I18n.t('home_dashboard.title')}]`));
            Assert.isFalse(btnUp.disabled);

            // Nota radice senza genitore -> goUpBtn disabilitato
            AppState.currentNoteId = 'n_1';
            UI._navHistoryIndex = 0;
            UI.updateNavHistoryUI();
            Assert.isTrue(btnBack.disabled);
            Assert.isTrue(btnUp.disabled);
        } finally {
            AppState.notes = prevNotes;
            AppState.currentNoteId = prevCurId;
            UI._navHistory = prevHist;
            UI._navHistoryIndex = prevIdx;
            UI.updateNavHistoryUI();
        }
    });

    test("navHistoryBack, navHistoryForward & jumpToNavHistoryIndex: saltano note cestinate e gestiscono Dashboard (null)", () => {
        const prevNotes = [...AppState.notes];
        const prevHist = [...UI._navHistory];
        const prevIdx = UI._navHistoryIndex;
        const prevSelect = UI.selectNote;
        const prevGoHome = UI.goHome;

        const actions = [];
        try {
            AppState.notes = [
                { id: 'n_a', parentId: null, title: 'Nota A' },
                { id: 'n_gone', parentId: null, title: 'Cestinata', deletedAt: 123 },
                { id: 'n_b', parentId: null, title: 'Nota B' }
            ];
            UI._navHistory = [null, 'n_a', 'n_gone', 'n_b'];
            UI._navHistoryIndex = 3;

            UI.selectNote = (id, a, r, s, isHistNav) => actions.push(`select:${id}:${isHistNav}`);
            UI.goHome = (isHistNav) => actions.push(`home:${isHistNav}`);

            // Indietro da n_b salta n_gone -> va a n_a
            UI.navHistoryBack();
            Assert.strictEqual(UI._navHistoryIndex, 1);
            Assert.strictEqual(actions[actions.length - 1], 'select:n_a:true');

            // Indietro ancora -> va alla Dashboard (null)
            UI.navHistoryBack();
            Assert.strictEqual(UI._navHistoryIndex, 0);
            Assert.strictEqual(actions[actions.length - 1], 'home:true');

            // Avanti da null -> va a n_a
            UI.navHistoryForward();
            Assert.strictEqual(UI._navHistoryIndex, 1);
            Assert.strictEqual(actions[actions.length - 1], 'select:n_a:true');

            // Avanti da n_a salta n_gone -> va a n_b
            UI.navHistoryForward();
            Assert.strictEqual(UI._navHistoryIndex, 3);
            Assert.strictEqual(actions[actions.length - 1], 'select:n_b:true');

            // Salto diretto all'indice 0 (Dashboard)
            UI.jumpToNavHistoryIndex(0);
            Assert.strictEqual(UI._navHistoryIndex, 0);
            Assert.strictEqual(actions[actions.length - 1], 'home:true');
        } finally {
            AppState.notes = prevNotes;
            UI._navHistory = prevHist;
            UI._navHistoryIndex = prevIdx;
            UI.selectNote = prevSelect;
            UI.goHome = prevGoHome;
        }
    });

    test("openNavHistoryMenu: costruisce voci fino a max 15 elementi con troncamento titoli lunghi", () => {
        const prevNotes = [...AppState.notes];
        const prevHist = [...UI._navHistory];
        const prevIdx = UI._navHistoryIndex;
        const prevBuildMenu = UI.Menu.buildContextMenu;

        let capturedMenu = null;
        try {
            const longTitle = "Titolo estremamente lungo che supera il limite massimo consentito di quarantacinque caratteri";
            AppState.notes = [];
            const hist = [null];
            for (let i = 0; i < 18; i++) {
                const id = `nh_${i}`;
                AppState.notes.push({ id, parentId: null, title: i === 17 ? longTitle : `Nota ${i}` });
                hist.push(id);
            }
            hist.push('nh_cur');
            AppState.notes.push({ id: 'nh_cur', parentId: null, title: 'Corrente' });

            UI._navHistory = hist;
            UI._navHistoryIndex = hist.length - 1;

            UI.Menu.buildContextMenu = (anchor, items) => {
                capturedMenu = { anchor, items };
            };

            UI.openNavHistoryMenu('navBackBtn', -1);

            Assert.isTrue(capturedMenu !== null);
            Assert.strictEqual(capturedMenu.anchor, 'navBackBtn');
            Assert.strictEqual(capturedMenu.items.length, 15);
            Assert.isTrue(capturedMenu.items[0].label.endsWith('...'));
            Assert.strictEqual(capturedMenu.items[0].label.length, 45);
        } finally {
            AppState.notes = prevNotes;
            UI._navHistory = prevHist;
            UI._navHistoryIndex = prevIdx;
            UI.Menu.buildContextMenu = prevBuildMenu;
        }
    });

    test("goUpOneLevel & openGoUpMenu: risalgono gerarchia note e catena Record Note -> DB -> Nota Ospite -> Home", () => {
        const prevNotes = [...AppState.notes];
        const prevDbs = AppState.databases;
        const prevCurId = AppState.currentNoteId;
        const prevSelect = UI.selectNote;
        const prevJump = UI.jumpToWidget;
        const prevGoHome = UI.goHome;
        const prevBuildMenu = UI.Menu.buildContextMenu;

        const calls = [];
        let capturedMenu = null;

        try {
            AppState.databases = {
                adv_tbl_up: { id: 'adv_tbl_up', title: 'Database Progetti', columns: [], rows: [] }
            };
            AppState.notes = [
                { id: 'n_root', parentId: null, title: 'Workspace Root', content: '' },
                { id: 'n_host', parentId: 'n_root', title: 'Pagina Ospite', content: '<div id="adv_tbl_up"></div>' },
                { id: 'n_rec', parentId: null, title: 'Record Alpha', isRecordNote: true, linkedTableId: 'adv_tbl_up', linkedRowId: 'row_99' },
                { id: 'n_rec_child', parentId: 'n_rec', title: 'Sotto-nota del Record' }
            ];

            UI.selectNote = (id) => calls.push(`select:${id}`);
            UI.jumpToWidget = (dbId, rowId) => calls.push(`jump:${dbId}:${rowId}`);
            UI.goHome = () => calls.push('home');
            UI.Menu.buildContextMenu = (anchor, items) => { capturedMenu = items; };

            // 1. Sotto-nota del record -> risale al record
            AppState.currentNoteId = 'n_rec_child';
            UI.goUpOneLevel();
            Assert.strictEqual(calls[calls.length - 1], 'select:n_rec');

            // 2. Record Note -> risale al DB sulla riga specifica
            AppState.currentNoteId = 'n_rec';
            UI.goUpOneLevel();
            Assert.strictEqual(calls[calls.length - 1], 'jump:adv_tbl_up:row_99');

            // 3. Nota radice -> torna alla Home
            AppState.currentNoteId = 'n_root';
            UI.goUpOneLevel();
            Assert.strictEqual(calls[calls.length - 1], 'home');

            // 4. openGoUpMenu da n_rec_child mostra l'intera catena fino alla Home
            AppState.currentNoteId = 'n_rec_child';
            UI.openGoUpMenu('goUpBtn');
            Assert.isTrue(capturedMenu !== null);
            const labels = capturedMenu.filter(i => i.label).map(i => i.label);
            Assert.strictEqual(labels[0], 'Record Alpha');
            Assert.strictEqual(labels[1], 'Database Progetti');
            Assert.strictEqual(labels[2], 'Pagina Ospite');
            Assert.strictEqual(labels[3], 'Workspace Root');
            Assert.strictEqual(labels[4], I18n.t('home_dashboard.title'));
        } finally {
            AppState.notes = prevNotes;
            AppState.databases = prevDbs;
            AppState.currentNoteId = prevCurId;
            UI.selectNote = prevSelect;
            UI.jumpToWidget = prevJump;
            UI.goHome = prevGoHome;
            UI.Menu.buildContextMenu = prevBuildMenu;
        }
    });

    test("goHome: salva contenuto modificato, azzera stato nota corrente e registra null nella cronologia", async () => {
        const editor = document.getElementById('noteContent');
        const prevHtml = editor.innerHTML;
        const prevNotes = [...AppState.notes];
        const prevCurId = AppState.currentNoteId;
        const prevEditMode = AppState.isEditMode;
        const prevSwitching = AppState.isSwitchingNote;
        const prevHist = [...UI._navHistory];
        const prevIdx = UI._navHistoryIndex;
        const prevShowEditor = UI.showEditor;

        let showEditorArg = null;
        try {
            AppState.isSwitchingNote = false;
            AppState.notes = [
                { id: 'n_home_src', parentId: null, title: 'Nota Aperta', content: '<p>Vecchio</p>' }
            ];
            AppState.currentNoteId = 'n_home_src';
            AppState.isEditMode = true;
            UI._navHistory = ['n_home_src'];
            UI._navHistoryIndex = 0;

            editor.innerHTML = '<p>Modifica prima di Home</p>';
            UI.showEditor = (show) => { showEditorArg = show; };

            UI.goHome(false);

            Assert.isNull(AppState.currentNoteId);
            Assert.isFalse(AppState.isEditMode);
            Assert.strictEqual(showEditorArg, false);
            Assert.isTrue(AppState.notes[0].content.includes('Modifica prima di Home'));
            Assert.isTrue(AppState.notes[0]._isDirty);
            Assert.strictEqual(UI._navHistory.length, 2);
            Assert.isNull(UI._navHistory[1]);
            Assert.strictEqual(UI._navHistoryIndex, 1);

            // Una seconda chiamata a goHome non duplica null consecutivo nella history
            UI.goHome(false);
            Assert.strictEqual(UI._navHistory.length, 2);

            // Attende il completamento del timer interno di sblocco isSwitchingNote
            await new Promise(resolve => setTimeout(resolve, 170));
            Assert.isFalse(AppState.isSwitchingNote);
        } finally {
            clearTimeout(Store.debounceTimer);
            Store.isDirty = false;
            AppState.isSwitchingNote = prevSwitching;
            AppState.notes = prevNotes;
            AppState.currentNoteId = prevCurId;
            AppState.isEditMode = prevEditMode;
            UI._navHistory = prevHist;
            UI._navHistoryIndex = prevIdx;
            UI.showEditor = prevShowEditor;
            editor.innerHTML = prevHtml;
        }
    });

    test("highlightReturningRecord: allinea paginazione e applica la classe .adv-row-returning-pulse sulla riga", async () => {
        const editor = document.getElementById('noteContent');
        const prevHtml = editor.innerHTML;
        const prevDbs = AppState.databases;
        const prevRenderTable = AdvancedTable.renderTable;

        let renderedPageOnCall = null;
        try {
            AppState.databases = {
                adv_tbl_ret: {
                    id: 'adv_tbl_ret',
                    title: 'Test Paginazione',
                    pageSize: 2,
                    currentPage: 1,
                    columns: [{ id: 'c1', name: 'Nome', type: 'text' }],
                    rows: [
                        { id: 'r1', cells: { c1: 'Uno' } },
                        { id: 'r2', cells: { c1: 'Due' } },
                        { id: 'r3', cells: { c1: 'Tre' } }
                    ]
                }
            };

            editor.innerHTML = `
                <div id="adv_tbl_ret" class="adv-table-wrapper">
                    <table><tbody><tr data-row-id="r3"><td>Tre</td></tr></tbody></table>
                </div>
            `;

            AdvancedTable.renderTable = (tblId) => {
                renderedPageOnCall = AppState.databases[tblId].currentPage;
            };

            UI.highlightReturningRecord('adv_tbl_ret', 'r3');

            Assert.strictEqual(AppState.databases.adv_tbl_ret.currentPage, 2);
            Assert.strictEqual(renderedPageOnCall, 2);

            await new Promise(resolve => setTimeout(resolve, 110));

            const targetRow = editor.querySelector('tr[data-row-id="r3"]');
            Assert.isTrue(targetRow !== null);
            Assert.isTrue(targetRow.classList.contains('adv-row-returning-pulse'));
        } finally {
            AppState.databases = prevDbs;
            AdvancedTable.renderTable = prevRenderTable;
            editor.innerHTML = prevHtml;
        }
    });

    test("jumpToWidget: gestisce SYS_PROPERTIES_DB, focus diretto in pagina, salto ad altra nota, recupero orfano e pulizia zombie", () => {
        const editor = document.getElementById('noteContent');
        const prevHtml = editor.innerHTML;
        const prevNotes = [...AppState.notes];
        const prevDbs = AppState.databases;
        const prevCurId = AppState.currentNoteId;
        const prevAlert = window.alert;
        const prevSelectNote = UI.selectNote;
        const prevRenderTree = UI.renderTree;
        const prevLastHighlighted = UI._lastHighlightedWidget;

        let alertMsg = '';
        let selectedCall = null;

        try {
            window.alert = (msg) => { alertMsg = msg; };
            UI.selectNote = (id, a, wId) => { selectedCall = { id, wId }; };
            UI.renderTree = () => {};

            // 1. SYS_PROPERTIES_DB -> mostra alert informativo
            AppState.notes = [{ id: 'n_j1', parentId: null, title: 'Nota 1', content: '' }];
            UI.jumpToWidget('SYS_PROPERTIES_DB');
            Assert.strictEqual(alertMsg, I18n.t('notes_nav.alert_system_properties_info'));

            // 2. Widget nella nota corrente senza targetRowId -> evidenzia boxShadow e memorizza _lastHighlightedWidget
            AppState.notes = [{ id: 'n_j1', parentId: null, title: 'Nota 1', content: '<div id="adv_tbl_local" class="adv-widget-shell"></div>' }];
            AppState.currentNoteId = 'n_j1';
            editor.innerHTML = '<div id="adv_tbl_local" class="adv-widget-shell">DB Locale</div>';
            UI.jumpToWidget('adv_tbl_local');
            const localEl = document.getElementById('adv_tbl_local');
            Assert.strictEqual(UI._lastHighlightedWidget, localEl);
            Assert.isTrue(localEl.style.boxShadow.includes('var(--marked-border)'));

            // 3. Widget presente in un'altra nota -> naviga verso la nota ospite
            AppState.notes = [
                { id: 'n_j1', parentId: null, title: 'Nota 1', content: '' },
                { id: 'n_j2', parentId: null, title: 'Nota 2', content: '<div id="adv_tbl_other"></div>' }
            ];
            AppState.currentNoteId = 'n_j1';
            UI.jumpToWidget('adv_tbl_other');
            Assert.isTrue(selectedCall !== null);
            Assert.strictEqual(selectedCall.id, 'n_j2');
            Assert.strictEqual(selectedCall.wId, 'adv_tbl_other');

            // 4. Auto-rilevamento targetRowId da record note verso DB già visibile nel DOM corrente
            AppState.databases = {
                adv_tbl_cur: { id: 'adv_tbl_cur', title: 'DB Corrente', columns: [], rows: [{ id: 'r_target', cells: {} }] }
            };
            AppState.notes = [
                { id: 'n_rec_cur', title: 'Rec', isRecordNote: true, linkedTableId: 'adv_tbl_cur', linkedRowId: 'r_target', content: '<div id="adv_tbl_cur"></div>' }
            ];
            AppState.currentNoteId = 'n_rec_cur';
            editor.innerHTML = `<div id="adv_tbl_cur" class="adv-table-wrapper"><tr data-row-id="r_target"></tr></div>`;
            const prevHighlightRet = UI.highlightReturningRecord;
            let capturedRet = null;
            UI.highlightReturningRecord = (tId, rId) => { capturedRet = { tId, rId }; };
            UI.jumpToWidget('adv_tbl_cur');
            Assert.isTrue(capturedRet !== null);
            Assert.strictEqual(capturedRet.tId, 'adv_tbl_cur');
            Assert.strictEqual(capturedRet.rId, 'r_target');
            UI.highlightReturningRecord = prevHighlightRet;

            // 5. Widget orfano: stato presente in AppState.databases ma assente dal DOM -> ricostruisce e salva
            editor.innerHTML = '<p>Testo</p>';
            AppState.databases = {
                adv_tbl_orphan: { id: 'adv_tbl_orphan', title: 'DB Orfano', columns: [], rows: [] }
            };
            AppState.notes = [
                { id: 'n_cur_orph', parentId: null, title: 'Nota Corrente', content: 'id="adv_tbl_orphan"' }
            ];
            AppState.currentNoteId = 'n_cur_orph';
            UI.jumpToWidget('adv_tbl_orphan');
            Assert.isTrue(AppState.notes[0].content.includes('adv_tbl_orphan_broken'));
            Assert.isTrue(AppState.notes[0].content.includes('id="adv_tbl_orphan"'));

            // 6. Widget zombie: assente sia da DOM che da AppState.databases -> purga riferimento residuo
            AppState.databases = {};
            AppState.notes = [
                { id: 'n_cur_zmb', parentId: null, title: 'Nota Zombie', content: '<div id="adv_tbl_ghost_ref"></div>' }
            ];
            AppState.currentNoteId = 'n_cur_zmb';
            UI.jumpToWidget('adv_tbl_ghost_ref');
            Assert.isFalse(AppState.notes[0].content.includes('adv_tbl_ghost_ref'));
            Assert.isTrue(AppState.notes[0].content.includes('zombie_purged_'));
        } finally {
            clearTimeout(Store.debounceTimer);
            Store.isDirty = false;
            window.alert = prevAlert;
            UI.selectNote = prevSelectNote;
            UI.renderTree = prevRenderTree;
            UI._lastHighlightedWidget = prevLastHighlighted;
            AppState.notes = prevNotes;
            AppState.databases = prevDbs;
            AppState.currentNoteId = prevCurId;
            editor.innerHTML = prevHtml;
        }
    });

});