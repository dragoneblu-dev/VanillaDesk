/**
 * tests/test-ui-notes-header.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: js/ui/ui-notes-header.js
 */

describe("UI.NotesHeader: Proprietà Header, Banner Cestino e Conflitti (test-ui-notes-header.js)", () => {

    test("renderPageHeaderProperties: crea #noteHeaderProperties se assente e lo nasconde per note nulle o nel cestino", () => {
        const existingContainer = document.getElementById('noteHeaderProperties');
        const titleInput = document.getElementById('noteTitle');
        const contentEl = document.getElementById('noteContent');
        if (existingContainer) existingContainer.remove();

        try {
            UI.renderPageHeaderProperties(null);
            const created = document.getElementById('noteHeaderProperties');
            Assert.isTrue(created !== null);
            Assert.strictEqual(created.parentNode, titleInput.parentNode);
            Assert.strictEqual(created.nextElementSibling, contentEl);
            Assert.strictEqual(created.style.display, 'none');
            Assert.strictEqual(created.innerHTML, '');

            created.style.display = 'block';
            created.innerHTML = '<div>Altro</div>';

            UI.renderPageHeaderProperties({ id: 'n_del', title: 'Eliminata', deletedAt: Date.now() });
            Assert.strictEqual(created.style.display, 'none');
            Assert.strictEqual(created.innerHTML, '');
        } finally {
            const c = document.getElementById('noteHeaderProperties');
            if (c) {
                c.style.display = 'none';
                c.innerHTML = '';
            }
        }
    });

    test("renderPageHeaderProperties: renderizza i campi valorizzati di una record note escludendo titolo, record_note, nascosti e vuoti", () => {
        const container = document.getElementById('noteHeaderProperties');
        const prevDbs = AppState.databases;
        const prevDisplay = container.style.display;
        const prevHtml = container.innerHTML;

        try {
            AppState.databases = {
                db_hdr_test: {
                    id: 'db_hdr_test',
                    title: 'Task <DB>',
                    showHeaderRecordFields: true,
                    showHeaderPageProps: false,
                    columns: [
                        { id: 'c_title', name: 'Nome', type: 'text' },
                        { id: 'c_status', name: 'Stato', type: 'select' },
                        { id: 'c_empty', name: 'Vuoto', type: 'text' },
                        { id: 'c_hidden', name: 'Nascosto', type: 'text', hidden: true },
                        { id: 'c_note', name: 'Pagina', type: 'record_note' },
                        { id: 'c_date', name: 'Scadenza', type: 'date', hasEndDate: true }
                    ],
                    selectColors: { c_status: { 'In Corso': 'hl-c4' } },
                    rows: [
                        {
                            id: 'r_hdr_1',
                            cells: {
                                c_title: 'Titolo Riga',
                                c_status: 'In Corso',
                                c_empty: '',
                                c_hidden: 'Segreto',
                                c_note: 'n_rec_1',
                                c_date: { start: '2026-05-01', end: '2026-05-10' }
                            }
                        }
                    ]
                }
            };

            const recordNote = {
                id: 'n_rec_1',
                title: 'Nota Record',
                isRecordNote: true,
                linkedTableId: 'db_hdr_test',
                linkedRowId: 'r_hdr_1'
            };

            UI.renderPageHeaderProperties(recordNote);

            Assert.strictEqual(container.style.display, 'block');
            Assert.isTrue(container.innerHTML.includes('Task &lt;DB&gt;'));
            Assert.isTrue(container.innerHTML.includes('Stato:'));
            Assert.isTrue(container.innerHTML.includes('In Corso'));
            Assert.isTrue(container.innerHTML.includes('Scadenza:'));
            Assert.isFalse(container.innerHTML.includes('Nome:'));
            Assert.isFalse(container.innerHTML.includes('Vuoto:'));
            Assert.isFalse(container.innerHTML.includes('Nascosto:'));
            Assert.isFalse(container.innerHTML.includes('Segreto'));

            // Disattivazione flag showHeaderRecordFields
            AppState.databases.db_hdr_test.showHeaderRecordFields = false;
            UI.renderPageHeaderProperties(recordNote);
            Assert.strictEqual(container.style.display, 'none');
            Assert.strictEqual(container.innerHTML, '');
        } finally {
            AppState.databases = prevDbs;
            container.style.display = prevDisplay;
            container.innerHTML = prevHtml;
        }
    });

    test("renderPageHeaderProperties: mostra SYS_PROPERTIES_DB rispettando i flag per note libere e record note", () => {
        const container = document.getElementById('noteHeaderProperties');
        const prevDbs = AppState.databases;
        const prevDisplay = container.style.display;
        const prevHtml = container.innerHTML;

        try {
            AppState.databases = {
                SYS_PROPERTIES_DB: {
                    id: 'SYS_PROPERTIES_DB',
                    showHeaderOnNotes: true,
                    columns: [
                        { id: 'sys_c_note', name: 'Nota', type: 'record_note' },
                        { id: 'sys_c_tags', name: 'Tag', type: 'multi-select' },
                        { id: 'prop_custom', name: 'Owner<XSS>', type: 'text' },
                        { id: 'prop_empty_arr', name: 'VuotoArr', type: 'multi-select' }
                    ],
                    selectColors: {},
                    rows: [
                        {
                            id: 'sys_r_n_free',
                            cells: {
                                sys_c_note: 'n_free',
                                sys_c_tags: ['architettura', 'test'],
                                prop_custom: 'Mario',
                                prop_empty_arr: []
                            }
                        },
                        {
                            id: 'sys_r_n_rec',
                            cells: {
                                sys_c_note: 'n_rec',
                                sys_c_tags: ['urgent'],
                                prop_custom: '',
                                prop_empty_arr: []
                            }
                        }
                    ]
                },
                db_rec_props: {
                    id: 'db_rec_props',
                    title: 'DB Progetti',
                    showHeaderRecordFields: false,
                    showHeaderPageProps: true,
                    columns: [{ id: 'c1', name: 'Titolo', type: 'text' }],
                    rows: [{ id: 'r1', cells: { c1: 'Alpha' } }]
                }
            };

            // 1. Nota libera con showHeaderOnNotes = true
            UI.renderPageHeaderProperties({ id: 'n_free', title: 'Nota Libera' });
            Assert.strictEqual(container.style.display, 'block');
            Assert.isTrue(container.innerHTML.includes('architettura'));
            Assert.isTrue(container.innerHTML.includes('Owner&lt;XSS&gt;:'));
            Assert.isTrue(container.innerHTML.includes('Mario'));
            Assert.isFalse(container.innerHTML.includes('VuotoArr:'));

            // 2. Nota libera con showHeaderOnNotes = false
            AppState.databases.SYS_PROPERTIES_DB.showHeaderOnNotes = false;
            UI.renderPageHeaderProperties({ id: 'n_free', title: 'Nota Libera' });
            Assert.strictEqual(container.style.display, 'none');

            // 3. Record note con showHeaderPageProps = true (indipendente da showHeaderOnNotes)
            UI.renderPageHeaderProperties({
                id: 'n_rec',
                title: 'Record',
                isRecordNote: true,
                linkedTableId: 'db_rec_props',
                linkedRowId: 'r1'
            });
            Assert.strictEqual(container.style.display, 'block');
            Assert.isTrue(container.innerHTML.includes('urgent'));
        } finally {
            AppState.databases = prevDbs;
            container.style.display = prevDisplay;
            container.innerHTML = prevHtml;
        }
    });

    test("_updateTrashedNoteUI: mostra banner rosso, blocca titolo e nasconde pulsante Modifica; ripristina su nota attiva", () => {
        const titleInput = document.getElementById('noteTitle');
        const editToggleBtn = document.getElementById('editToggleBtn');
        const prevTitleColor = titleInput.style.color;
        const prevReadOnly = titleInput.hasAttribute('readonly');
        const prevBtnDisplay = editToggleBtn.style.display;

        try {
            UI._updateTrashedNoteUI({ id: 'n_trash_1', title: 'Nel Cestino', deletedAt: 1700000000000 });

            const banner = document.getElementById('trashedNoteWarningBanner');
            Assert.isTrue(banner !== null);
            Assert.strictEqual(banner.style.display, 'flex');
            Assert.isTrue(banner.innerHTML.includes('n_trash_1'));
            Assert.strictEqual(titleInput.style.color, 'var(--danger-color)');
            Assert.isTrue(titleInput.hasAttribute('readonly'));
            Assert.strictEqual(editToggleBtn.style.display, 'none');

            UI._updateTrashedNoteUI({ id: 'n_active_1', title: 'Attiva' });
            Assert.strictEqual(banner.style.display, 'none');
            Assert.strictEqual(banner.innerHTML, '');
            Assert.strictEqual(titleInput.style.color, '');
            Assert.strictEqual(editToggleBtn.style.display, '');
        } finally {
            const banner = document.getElementById('trashedNoteWarningBanner');
            if (banner) banner.remove();
            titleInput.style.color = prevTitleColor;
            if (prevReadOnly) titleInput.setAttribute('readonly', 'true');
            else titleInput.removeAttribute('readonly');
            editToggleBtn.style.display = prevBtnDisplay;
        }
    });

    test("restoreNoteFromBanner: orchestra Trash.restore, closeDrawer, _updateTrashedNoteUI e selectNote", () => {
        const prevNotes = [...AppState.notes];
        const prevTrashRestore = UI.Trash.restore;
        const prevCloseDrawer = UI.closeDrawer;
        const prevSelectNote = UI.selectNote;

        const calls = [];
        try {
            const noteObj = { id: 'n_rest_1', title: 'Da Ripristinare', deletedAt: Date.now() };
            AppState.notes = [noteObj];

            UI.Trash.restore = (id) => {
                calls.push(`restore:${id}`);
                delete noteObj.deletedAt;
            };
            UI.closeDrawer = () => calls.push('closeDrawer');
            UI.selectNote = (id) => calls.push(`select:${id}`);

            UI._updateTrashedNoteUI(noteObj);
            UI.restoreNoteFromBanner('n_rest_1');

            Assert.strictEqual(calls.join(','), 'restore:n_rest_1,closeDrawer,select:n_rest_1');
            const banner = document.getElementById('trashedNoteWarningBanner');
            Assert.strictEqual(banner.style.display, 'none');
        } finally {
            const banner = document.getElementById('trashedNoteWarningBanner');
            if (banner) banner.remove();
            AppState.notes = prevNotes;
            UI.Trash.restore = prevTrashRestore;
            UI.closeDrawer = prevCloseDrawer;
            UI.selectNote = prevSelectNote;
        }
    });

    test("promptNoteConflict: renderizza overlay con titolo escaped e risolve reload / overwrite", async () => {
        const prevOverlay = document.getElementById('advNoteConflictOverlay');
        if (prevOverlay) prevOverlay.remove();

        try {
            const pReload = UI.promptNoteConflict(
                { title: 'Nota <Script>', updatedAt: '2026-05-01T10:00:00.000Z' },
                { updatedAt: '2026-05-01T10:05:00.000Z' }
            );

            const overlay1 = document.getElementById('advNoteConflictOverlay');
            Assert.isTrue(overlay1 !== null);
            Assert.isTrue(overlay1.innerHTML.includes('Nota &lt;Script&gt;'));

            overlay1.querySelector('#btnConflictReload').click();
            const res1 = await pReload;
            Assert.strictEqual(res1, 'reload');
            Assert.isNull(document.getElementById('advNoteConflictOverlay'));

            const pOverwrite = UI.promptNoteConflict(
                { title: 'Altra Nota', updatedAt: '2026-05-01T10:00:00.000Z' },
                { updatedAt: '2026-05-01T10:05:00.000Z' }
            );

            const overlay2 = document.getElementById('advNoteConflictOverlay');
            Assert.isTrue(overlay2 !== null);
            overlay2.querySelector('#btnConflictOverwrite').click();
            const res2 = await pOverwrite;
            Assert.strictEqual(res2, 'overwrite');
            Assert.isNull(document.getElementById('advNoteConflictOverlay'));
        } finally {
            const leftover = document.getElementById('advNoteConflictOverlay');
            if (leftover) leftover.remove();
        }
    });

});