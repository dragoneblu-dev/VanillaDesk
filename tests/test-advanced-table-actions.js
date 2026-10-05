/**
 * tests/test-advanced-table-actions.js
 * Suite di Collaudo Unitario per Geometria, Drag Colonne, Titoli e Interazione Note.
 * Modulo testato: js/AdvancedTable/advanced-table-actions.js
 * Conteggio test case: 12
 */

describe("AdvancedTable Actions: Geometria, Drag Colonne, Titoli e Pagine Record (12 Test)", () => {

    test("Database Title: updateTitle aggiorna il nome e propaga modifiche a formule cross-db tabella[...]", () => {
        const dbSrc = 'db_title_src';
        const dbFormula = 'db_title_formula';

        AppState.databases[dbSrc] = {
            id: dbSrc,
            title: 'Magazzino',
            columns: [{ id: 'c1', name: 'Qta', type: 'number' }],
            rows: []
        };

        AppState.databases[dbFormula] = {
            id: dbFormula,
            title: 'Report',
            columns: [
                { id: 'f1', name: 'Calcolo', type: 'formula', formula: 'SOMMA(tabella["Magazzino"], "Qta")' }
            ],
            rows: []
        };

        let treeRenderCalled = false;
        const origRenderTree = UI.renderTree;
        UI.renderTree = () => { treeRenderCalled = true; };

        try {
            AdvancedTable.updateTitle(dbSrc, 'Magazzino Centrale');

            Assert.strictEqual(AppState.databases[dbSrc].title, 'Magazzino Centrale');
            const updatedFormula = AppState.databases[dbFormula].columns[0].formula;
            Assert.isTrue(updatedFormula.includes('tabella["Magazzino Centrale"]'), "La formula deve contenere il nuovo titolo del DB");
            Assert.isTrue(treeRenderCalled, "updateTitle deve notificare UI.renderTree() per sincronizzare la sidebar");
        } finally {
            UI.renderTree = origRenderTree;
        }
    });

    test("Database Title: updateTitle risolve collisioni aggiungendo contatore progressivo (1), (2)", () => {
        AppState.databases['db_coll_1'] = { id: 'db_coll_1', title: 'Clienti' };
        AppState.databases['db_coll_2'] = { id: 'db_coll_2', title: 'Altro' };

        AdvancedTable.updateTitle('db_coll_2', 'Clienti');
        Assert.strictEqual(AppState.databases['db_coll_2'].title, 'Clienti (1)');

        AppState.databases['db_coll_3'] = { id: 'db_coll_3', title: 'Terzo' };
        AdvancedTable.updateTitle('db_coll_3', 'Clienti');
        Assert.strictEqual(AppState.databases['db_coll_3'].title, 'Clienti (2)');
    });

    test("Colonne: onColDrop riordina le colonne inserendo la sorgente a sinistra del target", () => {
        const dbId = 'db_drop_cols';
        AppState.databases[dbId] = {
            id: dbId,
            columns: [
                { id: 'col_A', name: 'A' },
                { id: 'col_B', name: 'B' },
                { id: 'col_C', name: 'C' }
            ],
            rows: []
        };

        const fakeEvent = {
            preventDefault: () => {},
            stopPropagation: () => {}
        };

        // Trasciniamo col_A prima di col_C
        AdvancedTable.draggedColId = 'col_A';
        AdvancedTable.onColDrop(fakeEvent, dbId, 'col_C');

        let colIds = AppState.databases[dbId].columns.map(c => c.id);
        Assert.deepEqual(colIds, ['col_B', 'col_A', 'col_C']);

        // Trasciniamo col_C prima di col_B
        AdvancedTable.draggedColId = 'col_C';
        AdvancedTable.onColDrop(fakeEvent, dbId, 'col_B');

        colIds = AppState.databases[dbId].columns.map(c => c.id);
        Assert.deepEqual(colIds, ['col_C', 'col_B', 'col_A']);
    });

    test("FreeWidth: toggleFreeWidth inverte il booleano di larghezza libera", () => {
        const dbFw = 'db_fw_toggle';
        AppState.databases[dbFw] = { id: dbFw, freeWidth: false, rows: [], columns: [] };

        AdvancedTable.toggleFreeWidth(dbFw);
        Assert.strictEqual(AppState.databases[dbFw].freeWidth, true);

        AdvancedTable.toggleFreeWidth(dbFw);
        Assert.strictEqual(AppState.databases[dbFw].freeWidth, false);
    });

    test("Record Note: openRecordNote crea nuova nota con _isDraft, _isDirty e token di revisione", () => {
        const dbId = 'db_rec_note_test';
        AppState.databases[dbId] = {
            id: dbId,
            columns: [{ id: 'c_rec', name: 'Scheda', type: 'record_note' }],
            rows: [{ id: 'r1', cells: { c_rec: '' } }]
        };

        let selectedNoteId = null;
        const origSelectNote = UI.selectNote;
        UI.selectNote = (id) => { selectedNoteId = id; };

        try {
            AdvancedTable.openRecordNote(dbId, 'r1', 'c_rec');

            const generatedNoteId = AppState.databases[dbId].rows[0].cells.c_rec;
            Assert.isTrue(!!generatedNoteId, "La cella deve contenere l'ID della nuova nota");
            
            const newNote = Store.getNote(generatedNoteId);
            Assert.isNotNull(newNote);
            Assert.isTrue(newNote.isRecordNote);
            Assert.strictEqual(newNote._isDraft, true, "La nuova nota deve avere _isDraft per prevenire cancellazioni premature");
            Assert.strictEqual(newNote._isDirty, true, "La nuova nota deve avere _isDirty attivo");
            Assert.isTrue(!!newNote.revId);
            Assert.strictEqual(newNote.revId, newNote._baseRevId);
            Assert.strictEqual(selectedNoteId, generatedNoteId, "UI.selectNote deve essere invocata con il nuovo ID");
        } finally {
            UI.selectNote = origSelectNote;
        }
    });

    test("Note Link: clearNoteLink azzera il valore del collegamento alla nota", () => {
        const dbId = 'db_clear_link_test';
        AppState.databases[dbId] = {
            id: dbId,
            columns: [{ id: 'c_link', name: 'Riferimento', type: 'note_link' }],
            rows: [{ id: 'r1', cells: { c_link: { noteId: 'n_target', title: 'Target' } } }]
        };

        AdvancedTable.clearNoteLink(null, dbId, 'r1', 'c_link');
        Assert.strictEqual(AppState.databases[dbId].rows[0].cells.c_link, null);
    });

    test("Long Text Modal: openLongTextModal imposta sola lettura su colonne calcolate", () => {
        const dbId = 'db_modal_ro_test';
        AppState.databases[dbId] = {
            id: dbId,
            columns: [{ id: 'c_form', name: 'FormulaCalcolata', type: 'formula', formula: '"Risultato"' }],
            rows: [{ id: 'r1', cells: { c_form: 'Risultato' } }]
        };

        let drawerFooterHTML = '';
        const origOpenDrawer = UI.openDrawer;
        UI.openDrawer = (title, body, footer) => {
            drawerFooterHTML = footer;
        };

        try {
            AdvancedTable.openLongTextModal(dbId, 'r1', 'c_form');
            Assert.isTrue(drawerFooterHTML.includes(I18n.t('common.close')), "Nei campi calcolati deve essere presente solo il tasto Chiudi");
            Assert.isFalse(drawerFooterHTML.includes('saveLongText'), "Nei campi calcolati non deve comparire il pulsante di salvataggio");
        } finally {
            UI.openDrawer = origOpenDrawer;
        }
    });

    test("Long Text Modal: saveLongText aggiorna il testo della cella target", () => {
        const dbId = 'db_save_text_test';
        AppState.databases[dbId] = {
            id: dbId,
            columns: [{ id: 'c_desc', name: 'Descrizione', type: 'text' }],
            rows: [{ id: 'r1', cells: { c_desc: 'Testo Vecchio' } }]
        };

        const textarea = document.createElement('textarea');
        textarea.id = 'advLongTextInput';
        textarea.value = 'Testo Aggiornato da Modale';
        document.body.appendChild(textarea);

        try {
            AdvancedTable.saveLongText(dbId, 'r1', 'c_desc');
            Assert.strictEqual(AppState.databases[dbId].rows[0].cells.c_desc, 'Testo Aggiornato da Modale');
        } finally {
            textarea.remove();
        }
    });

    test("Delete Table: deleteTable blocca la cancellazione se il DB è puntato da relazioni in altri DB", () => {
        AppState.databases['db_blocked_target'] = {
            id: 'db_blocked_target',
            title: 'Fornitori',
            columns: [{ id: 'c_name', name: 'Nome' }],
            rows: []
        };

        AppState.databases['db_pointing'] = {
            id: 'db_pointing',
            title: 'Ordini Acquisto',
            columns: [{ id: 'c_supp', type: 'relation', targetTableId: 'db_blocked_target' }],
            rows: []
        };

        let alertMsg = '';
        const origAlert = window.alert;
        window.alert = (msg) => { alertMsg = msg; };

        try {
            AdvancedTable.deleteTable('db_blocked_target');
            Assert.isTrue(alertMsg.includes('IMPOSSIBILE ELIMINARE'), "La cancellazione di un DB puntato da relazioni esterne deve essere respinta");
            Assert.isTrue(!!AppState.databases['db_blocked_target'], "Il database target deve rimanere integro");
        } finally {
            window.alert = origAlert;
        }
    });

    test("Delete Table: deleteTable esegue soft delete su SYS_PROPERTIES_DB mantenendo i dati integri", () => {
        AppState.databases['SYS_PROPERTIES_DB'] = {
            id: 'SYS_PROPERTIES_DB',
            title: 'Proprietà e Tag di Pagina',
            columns: [{ id: 'sys_c_note' }],
            rows: [{ id: 'r1', cells: { sys_c_note: 'n1' } }]
        };

        AdvancedTable.deleteTable('SYS_PROPERTIES_DB');

        Assert.isTrue(!!AppState.databases['SYS_PROPERTIES_DB'], "SYS_PROPERTIES_DB non deve essere eliminato da AppState.databases");
        Assert.strictEqual(AppState.databases['SYS_PROPERTIES_DB'].rows.length, 1);
    });

    test("Delete Table: deleteTable su vista collegata rimuove solo la vista lasciando intatto il DB originale", () => {
        AppState.databases['db_orig_real'] = {
            id: 'db_orig_real',
            title: 'Database Reale',
            columns: [{ id: 'c1', name: 'Nome' }],
            rows: [{ id: 'r1', cells: { c1: 'Dato' } }]
        };

        AppState.databases['adv_link_view1'] = {
            id: 'adv_link_view1',
            isLinkedView: true,
            sourceTableId: 'db_orig_real'
        };

        const origConfirm = window.confirm;
        window.confirm = () => true;

        try {
            AdvancedTable.deleteTable('adv_link_view1');
            Assert.isFalse(!!AppState.databases['adv_link_view1'], "La vista collegata deve essere rimossa");
            Assert.isTrue(!!AppState.databases['db_orig_real'], "Il database originale deve rimanere integro e intatto");
            Assert.strictEqual(AppState.databases['db_orig_real'].rows.length, 1);
        } finally {
            window.confirm = origConfirm;
        }
    });

    test("Delete Table: deleteTable su citazione rimuove solo l'elemento DOM preservando il DB sorgente", () => {
        const citedId = 'adv_tbl_real_cited_123';
        AppState.databases['adv_tbl_real'] = {
            id: 'adv_tbl_real',
            title: 'Database Principale',
            columns: [{ id: 'c1', name: 'Nome' }],
            rows: []
        };

        const wrapper = document.createElement('div');
        wrapper.id = citedId;
        wrapper.className = 'adv-table-wrapper';
        document.body.appendChild(wrapper);

        const origConfirm = window.confirm;
        window.confirm = () => true;

        try {
            AdvancedTable.deleteTable(citedId);
            Assert.isNull(document.getElementById(citedId));
            Assert.isNotNull(AppState.databases['adv_tbl_real'], "Il database originale non deve essere eliminato");
        } finally {
            window.confirm = origConfirm;
            if (wrapper.parentNode) wrapper.remove();
        }
    });

});