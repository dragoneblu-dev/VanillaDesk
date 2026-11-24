/**
 * tests/test-ui-tree-db.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: js/ui/ui-tree-db.js
 */

describe("UI.TreeDB: Nodi Database, Viste e Tooltip Statistici (test-ui-tree-db.js)", () => {

    test("_formatBytes: formatta correttamente byte, KB e MB", () => {
        Assert.strictEqual(UI._formatBytes(0), '0 Bytes');
        Assert.strictEqual(UI._formatBytes(512), '512 Bytes');
        Assert.strictEqual(UI._formatBytes(1024), '1 KB');
        Assert.strictEqual(UI._formatBytes(1536), '1.5 KB');
        Assert.strictEqual(UI._formatBytes(1048576), '1 MB');
    });

    test("_showDbTooltip: genera statistiche corrette per Database Relazionale e Diario/Log con escape XSS", () => {
        const tooltip = document.getElementById('advCustomTooltip');
        const prevNotes = [...AppState.notes];
        const prevDbs = AppState.databases;
        const prevCss = tooltip.style.cssText;
        const prevHtml = tooltip.innerHTML;

        try {
            const anchor = document.createElement('div');
            anchor.getBoundingClientRect = () => ({ top: 40, right: 200, left: 20, bottom: 60, width: 180, height: 20 });

            AppState.databases = {
                adv_tbl_ext: { id: 'adv_tbl_ext', title: 'Clienti <VIP>', columns: [], rows: [] },
                adv_tbl_main: {
                    id: 'adv_tbl_main',
                    title: 'Progetti',
                    columns: [
                        { id: 'c1', name: 'Nome', type: 'text' },
                        { id: 'c_rel', name: 'Cliente', type: 'relation', targetTableId: 'adv_tbl_ext' }
                    ],
                    rows: [
                        { id: 'r1', createdAt: 1700000000000, updatedAt: 1700001000000, cells: { c1: 'A' } }
                    ],
                    savedFilters: [{ id: 'f1', name: 'Attivi' }],
                    automations: [{ id: 'a1', active: true }, { id: 'a2', active: false }]
                },
                adv_journal_1: {
                    id: 'adv_journal_1',
                    title: 'Diario / Log',
                    entries: [
                        { id: 'j1', content: 'Fatto', endTime: 1700000000000 },
                        { id: 'j2', content: 'Da fare', endTime: null }
                    ]
                }
            };

            AppState.notes = [
                { id: 'n_host_1', title: 'Nota Ospite', content: '<div id="adv_tbl_main"></div><div id="adv_journal_1"></div>' },
                { id: 'n_rec_1', title: 'Rec 1', isRecordNote: true, linkedTableId: 'adv_tbl_main', linkedRowId: 'r1' }
            ];

            // 1. Database Relazionale
            UI._showDbTooltip('adv_tbl_main', AppState.databases.adv_tbl_main, { currentTarget: anchor });
            Assert.isTrue(tooltip.innerHTML.includes('Nota Ospite'));
            Assert.isTrue(tooltip.innerHTML.includes('Clienti &lt;VIP&gt;'));
            Assert.isTrue(tooltip.innerHTML.includes('1')); // record, note collegate, filtri, automazioni attive
            Assert.strictEqual(tooltip.style.opacity, '1');

            // 2. Diario / Log
            UI._showDbTooltip('adv_journal_1', AppState.databases.adv_journal_1, { currentTarget: anchor });
            Assert.isTrue(tooltip.innerHTML.includes(I18n.t('tree_db.total_entries')));
            Assert.isTrue(tooltip.innerHTML.includes(I18n.t('tree_db.pending_entries')));
            Assert.isTrue(tooltip.innerHTML.includes('color:var(--danger-color);'));
        } finally {
            AppState.notes = prevNotes;
            AppState.databases = prevDbs;
            tooltip.style.cssText = prevCss;
            tooltip.innerHTML = prevHtml;
        }
    });

    test("_showViewTooltip & _showButtonBarTooltip: mostrano dettagli di viste collegate, grafici e barre pulsanti", () => {
        const tooltip = document.getElementById('advCustomTooltip');
        const prevNotes = [...AppState.notes];
        const prevCss = tooltip.style.cssText;
        const prevHtml = tooltip.innerHTML;

        try {
            const anchor = document.createElement('div');
            anchor.getBoundingClientRect = () => ({ top: 40, right: 200, left: 20, bottom: 60, width: 180, height: 20 });

            AppState.notes = [
                { id: 'n_v', title: 'Dashboard', content: '<div id="adv_v_kanban"></div><div id="adv_btnbar_1"></div>' }
            ];

            UI._showViewTooltip('adv_v_kanban', { title: 'Kanban <Test>', viewType: 'board' }, {}, { currentTarget: anchor });
            Assert.isTrue(tooltip.innerHTML.includes('Kanban &lt;Test&gt;'));
            Assert.isTrue(tooltip.innerHTML.includes('Dashboard'));

            UI._showViewTooltip('adv_v_chart', { isPivot: true, chartConfig: { visible: true, type: 'pie' } }, {}, { currentTarget: anchor });
            Assert.isTrue(tooltip.innerHTML.includes('PIE'));

            UI._showButtonBarTooltip('adv_btnbar_1', { buttons: [{ label: 'Esegui <Macro>' }] }, {}, { currentTarget: anchor });
            Assert.isTrue(tooltip.innerHTML.includes('Esegui &lt;Macro&gt;'));
            Assert.isTrue(tooltip.innerHTML.includes('Dashboard'));

            UI._showButtonBarTooltip('adv_btnbar_empty', { buttons: [] }, {}, { currentTarget: anchor });
            Assert.isTrue(tooltip.innerHTML.includes(I18n.t('tree_db.no_buttons_configured')));
        } finally {
            AppState.notes = prevNotes;
            tooltip.style.cssText = prevCss;
            tooltip.innerHTML = prevHtml;
        }
    });

    test("buildDatabaseVirtualTreeElement: in modalità esplicita DB mostra viste collegate e barre macro; in modalità Note applica anti-flooding", () => {
        const prevNotes = [...AppState.notes];
        const prevDbs = AppState.databases;
        const prevCurId = AppState.currentNoteId;
        const prevSearch = AppState.searchFilter;
        const prevProps = AppState.activePropertyFilters;
        const prevHostSet = UI._activeRecordHostNoteIds;
        const prevJump = UI.jumpToWidget;
        const prevRenderTree = UI.renderTree;

        let jumpedId = null;
        let rendered = false;

        try {
            UI.jumpToWidget = (id) => { jumpedId = id; };
            UI.renderTree = () => { rendered = true; };

            AppState.searchFilter = '';
            AppState.activePropertyFilters = [];
            AppState.currentNoteId = 'n_rec_active';
            UI._activeRecordHostNoteIds = null;

            AppState.databases = {
                adv_tbl_main: { id: 'adv_tbl_main', title: 'Task DB', expandedInTree: true, columns: [], rows: [] },
                adv_tbl_view: { id: 'adv_tbl_view', title: 'Bacheca Task', isLinkedView: true, sourceTableId: 'adv_tbl_main', viewType: 'board' },
                adv_btnbar_main: { id: 'adv_btnbar_main', buttons: [{ label: 'Chiudi Tutto', actionBlocks: [{ targetDbId: 'adv_tbl_main' }] }] }
            };

            const dbNotes = [
                { id: 'n_rec_hidden', parentId: null, title: 'Nascosta', isRecordNote: true, linkedTableId: 'adv_tbl_main', content: '' },
                { id: 'n_rec_active', parentId: null, title: 'Attiva', isRecordNote: true, linkedTableId: 'adv_tbl_main', content: '' }
            ];
            AppState.notes = [...dbNotes];

            // 1. Modalità esplicita DB: include vista collegata, barra macro e solo la record note attiva
            const explicitEl = UI.buildDatabaseVirtualTreeElement('adv_tbl_main', AppState.databases.adv_tbl_main, dbNotes, false, true);
            Assert.isTrue(explicitEl !== null);
            Assert.isTrue(explicitEl.innerHTML.includes('Bacheca Task'));
            Assert.isTrue(explicitEl.innerHTML.includes(I18n.t('tree_db.button_bar')));
            Assert.isTrue(explicitEl.innerHTML.includes('Attiva'));
            Assert.isFalse(explicitEl.innerHTML.includes('Nascosta'));

            // Click sul nodo DB invoca jumpToWidget
            explicitEl.querySelector('.node-content').click();
            Assert.strictEqual(jumpedId, 'adv_tbl_main');

            // Click sul toggle inverte expandedInTree e chiama renderTree
            explicitEl.querySelector('.toggle-btn').click();
            Assert.isFalse(AppState.databases.adv_tbl_main.expandedInTree);
            Assert.isTrue(rendered);

            // 2. Modalità Note (non esplicita): non mostra viste/macro e nasconde se nessuna nota è attiva/filtrata
            AppState.currentNoteId = null;
            const hiddenInNotes = UI.buildDatabaseVirtualTreeElement('adv_tbl_main', AppState.databases.adv_tbl_main, dbNotes, false, false);
            Assert.isNull(hiddenInNotes);

            // 3. Con ricerca che matcha solo una figlia: il nodo DB diventa tree-ghost-node ed espande la figlia
            AppState.searchFilter = 'nascosta';
            const filteredEl = UI.buildDatabaseVirtualTreeElement('adv_tbl_main', AppState.databases.adv_tbl_main, dbNotes, false, false);
            Assert.isTrue(filteredEl !== null);
            Assert.isTrue(filteredEl.querySelector('.node-content').classList.contains('tree-ghost-node'));
            Assert.isTrue(filteredEl.innerHTML.includes('Nascosta'));
            Assert.isFalse(filteredEl.innerHTML.includes('Bacheca Task'));
        } finally {
            AppState.notes = prevNotes;
            AppState.databases = prevDbs;
            AppState.currentNoteId = prevCurId;
            AppState.searchFilter = prevSearch;
            AppState.activePropertyFilters = prevProps;
            UI._activeRecordHostNoteIds = prevHostSet;
            UI.jumpToWidget = prevJump;
            UI.renderTree = prevRenderTree;
        }
    });

});