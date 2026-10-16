/**
 * tests/test-advanced-table-record.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-record (Dettaglio Record, Drawer, Campi Macro, Commenti e Relazioni)
 * Conteggio test case: 11
 */

describe("AdvancedTable Record: Dettaglio Record, Macro, Commenti Colonna e Relazioni (11 Test)", () => {

    // Helper di configurazione di un database mock con relativo wrapper montato nel sandbox DOM
    const setupMockDatabase = (tableId) => {
        AppState.databases[tableId] = {
            id: tableId,
            title: "Database Collaudo",
            columns: [
                { id: 'c_title', name: 'Titolo', type: 'text', width: 200, comment: 'Commento campo principale' },
                { id: 'c_desc', name: 'Descrizione', type: 'text', width: 200 },
                { id: 'c_num', name: 'Importo', type: 'number', width: 150, decimals: 2 },
                { id: 'c_done', name: 'Completato', type: 'checkbox', width: 100 },
                { id: 'c_tags', name: 'Tag', type: 'multi-select', width: 180 },
                { id: 'c_date', name: 'Scadenza', type: 'date', width: 150 },
                { id: 'c_range', name: 'Periodo', type: 'date', hasEndDate: true, width: 200 },
                { id: 'c_btn', name: 'Azione Rapida', type: 'button', buttonLabel: 'Esegui Macro', buttonColor: '#2563eb', width: 160 }
            ],
            rows: [
                {
                    id: 'row_1',
                    createdAt: 1700000000000,
                    updatedAt: 1700000000000,
                    cells: {
                        c_title: 'Attività Alfa',
                        c_desc: 'Testo breve',
                        c_num: 150.5,
                        c_done: true,
                        c_tags: ['Urgente', 'Bug'],
                        c_date: '2026-10-15',
                        c_range: { start: '2026-10-01', end: '2026-10-10' },
                        c_btn: ''
                    }
                }
            ],
            selectOptions: { c_tags: ['Bug', 'Feature', 'Urgente'] },
            selectColors: { c_tags: { Bug: 'hl-c10', Urgente: 'hl-c4' } }
        };

        // Iniezione del wrapper associato nel sandbox DOM per simulare la presenza del widget
        let wrapper = document.getElementById(tableId);
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = tableId;
            wrapper.className = 'adv-table-wrapper';
            const container = document.getElementById('noteContent') || document.body;
            container.appendChild(wrapper);
        }
    };

    test("Dettaglio Record: colonna di tipo 'button' genera pulsante interattivo ed esclude input di testo", () => {
        const tableId = 'db_test_btn_record';
        setupMockDatabase(tableId);

        let capturedDrawer = null;
        const originalOpenDrawer = UI.openDrawer;
        UI.openDrawer = (title, body, footer) => {
            capturedDrawer = { title, body, footer };
        };

        AppState.isEditMode = true;
        AdvancedTable.openRecordView(tableId, 'row_1');

        UI.openDrawer = originalOpenDrawer;

        Assert.isNotNull(capturedDrawer);
        const body = capturedDrawer.body;

        Assert.isTrue(body.includes('action-btn-run'), "Deve contenere la classe del pulsante macro action-btn-run");
        Assert.isTrue(body.includes('Esegui Macro'), "Deve visualizzare la label del pulsante");
        Assert.isTrue(body.includes("AdvancedTable.runCellMacro('db_test_btn_record', 'row_1', 'c_btn')"), "Deve collegare la chiamata onclick a runCellMacro");
        Assert.isFalse(body.includes(`onblur="AdvancedTable.updateData('${tableId}', 'row_1', 'c_btn'`), "Non deve esistere un input text di modifica per la colonna button");
    });

    test("Dettaglio Record: colonna con commento include l'icona info con tooltip, colonna priva di commento la omette", () => {
        const tableId = 'db_test_comment_record';
        setupMockDatabase(tableId);

        let capturedDrawer = null;
        const originalOpenDrawer = UI.openDrawer;
        UI.openDrawer = (title, body, footer) => {
            capturedDrawer = { title, body, footer };
        };

        AppState.isEditMode = true;
        AdvancedTable.openRecordView(tableId, 'row_1');

        UI.openDrawer = originalOpenDrawer;

        Assert.isNotNull(capturedDrawer);
        const body = capturedDrawer.body;

        // La colonna c_title ha comment: 'Commento campo principale'
        Assert.isTrue(body.includes('Commento campo principale'), "Il tooltip della label deve contenere il commento configurato");
        Assert.isTrue(body.includes('cursor:help'), "L'icona del commento deve avere cursore di aiuto");
        Assert.isTrue(body.includes('onclick="event.stopPropagation();"'), "L'icona del commento deve arrestare la propagazione del click");

        // La colonna c_desc non ha commento
        const descRowMarkup = body.split('drawer-prop-c_desc')[1] || '';
        const descHeaderSection = descRowMarkup.split('</div>')[0];
        Assert.isFalse(descHeaderSection.includes('cursor:help'), "La colonna priva di commento non deve mostrare l'icona informativa");
    });

    test("Dettaglio Record: campo testo monoriga genera <input>, testo multilinea genera <textarea>", () => {
        const tableId = 'db_test_text_record';
        setupMockDatabase(tableId);

        AppState.databases[tableId].rows[0].cells['c_desc'] = "Prima riga\nSeconda riga del testo";

        let capturedDrawer = null;
        const originalOpenDrawer = UI.openDrawer;
        UI.openDrawer = (title, body, footer) => {
            capturedDrawer = { title, body, footer };
        };

        AppState.isEditMode = true;
        AdvancedTable.openRecordView(tableId, 'row_1');

        UI.openDrawer = originalOpenDrawer;

        const body = capturedDrawer.body;
        Assert.isTrue(body.includes('input type="text" value="Attività Alfa"'), "Testo breve monoriga deve generare input text");
        Assert.isTrue(body.includes('<textarea class="modern-input"'), "Testo con a capo deve generare una textarea");
        Assert.isTrue(body.includes('Prima riga\nSeconda riga del testo'), "La textarea deve contenere il testo con ritorni a capo");
    });

    test("Dettaglio Record: data singola genera input singolo, data range genera input start ed end", () => {
        const tableId = 'db_test_date_record';
        setupMockDatabase(tableId);

        let capturedDrawer = null;
        const originalOpenDrawer = UI.openDrawer;
        UI.openDrawer = (title, body, footer) => {
            capturedDrawer = { title, body, footer };
        };

        AppState.isEditMode = true;
        AdvancedTable.openRecordView(tableId, 'row_1');

        UI.openDrawer = originalOpenDrawer;

        const body = capturedDrawer.body;
        Assert.isTrue(body.includes('value="2026-10-15"'), "Data singola deve valorizzare il campo date");
        Assert.isTrue(body.includes('value="2026-10-01"'), "Range data deve valorizzare l'input start");
        Assert.isTrue(body.includes('value="2026-10-10"'), "Range data deve valorizzare l'input end");
        Assert.isTrue(body.includes("updateDateRange('db_test_date_record', 'row_1', 'c_range', this.value, 'start')"), "Input start deve invocare updateDateRange");
        Assert.isTrue(body.includes("updateDateRange('db_test_date_record', 'row_1', 'c_range', this.value, 'end')"), "Input end deve invocare updateDateRange");
    });

    test("Dettaglio Record: i tag multi-select vengono ordinati alfabeticamente con rispettive classi di colore", () => {
        const tableId = 'db_test_select_record';
        setupMockDatabase(tableId);

        AppState.databases[tableId].rows[0].cells['c_tags'] = ['Urgente', 'Bug'];

        let capturedDrawer = null;
        const originalOpenDrawer = UI.openDrawer;
        UI.openDrawer = (title, body, footer) => {
            capturedDrawer = { title, body, footer };
        };

        AppState.isEditMode = true;
        AdvancedTable.openRecordView(tableId, 'row_1');

        UI.openDrawer = originalOpenDrawer;

        const body = capturedDrawer.body;
        const bugIndex = body.indexOf('Bug</span>');
        const urgenteIndex = body.indexOf('Urgente</span>');

        Assert.isTrue(bugIndex > -1, "Deve contenere il tag Bug");
        Assert.isTrue(urgenteIndex > -1, "Deve contenere il tag Urgente");
        Assert.isTrue(bugIndex < urgenteIndex, "I tag multi-select nel drawer devono apparire in ordine alfabetico crescente");
        Assert.isTrue(body.includes('hl-c10'), "Il tag Bug deve mantenere la classe colore hl-c10");
        Assert.isTrue(body.includes('hl-c4'), "Il tag Urgente deve mantenere la classe colore hl-c4");
    });

    test("Dettaglio Record: link a nota interna genera ancora con navigazione e pulsanti gestione", () => {
        const tableId = 'db_test_notelink_record';
        setupMockDatabase(tableId);

        AppState.databases[tableId].columns.push({ id: 'c_notelink', name: 'Riferimento Nota', type: 'note_link' });
        
        AppState.notes.push({ id: 'note_target_99', title: 'Manuale Tecnico', content: '<p>Contenuto</p>' });
        AppState.databases[tableId].rows[0].cells['c_notelink'] = { noteId: 'note_target_99', title: 'Manuale Tecnico' };

        let capturedDrawer = null;
        const originalOpenDrawer = UI.openDrawer;
        UI.openDrawer = (title, body, footer) => {
            capturedDrawer = { title, body, footer };
        };

        AppState.isEditMode = true;
        AdvancedTable.openRecordView(tableId, 'row_1');

        UI.openDrawer = originalOpenDrawer;

        const body = capturedDrawer.body;
        Assert.isTrue(body.includes('UI.selectNote(\'note_target_99\''), "Deve generare il link con click verso la nota bersaglio");
        Assert.isTrue(body.includes('Manuale Tecnico'), "Deve mostrare il titolo della nota collegata");
        Assert.isTrue(body.includes("AdvancedTable.openNoteLinkSelector"), "In edit mode deve mostrare il pulsante per cambiare link");
        Assert.isTrue(body.includes("AdvancedTable.clearNoteLink"), "In edit mode deve mostrare il pulsante per rimuovere il link");
    });

    test("Dettaglio Record: colonna relation risolve i nomi dei record bersaglio e gestisce orfani", () => {
        const tableId = 'db_test_rel_record';
        const targetDbId = 'db_target_companies';

        setupMockDatabase(tableId);

        AppState.databases[targetDbId] = {
            id: targetDbId,
            title: "Aziende",
            columns: [{ id: 'tc_name', name: 'Ragione Sociale', type: 'text' }],
            rows: [
                { id: 'comp_1', cells: { tc_name: 'Acme Corporation' } }
            ]
        };

        AppState.databases[tableId].columns.push({
            id: 'c_rel',
            name: 'Cliente',
            type: 'relation',
            targetTableId: targetDbId,
            targetColId: 'tc_name'
        });
        AppState.databases[tableId].rows[0].cells['c_rel'] = ['comp_1', 'comp_missing'];

        let capturedDrawer = null;
        const originalOpenDrawer = UI.openDrawer;
        UI.openDrawer = (title, body, footer) => {
            capturedDrawer = { title, body, footer };
        };

        AppState.isEditMode = true;
        AdvancedTable.openRecordView(tableId, 'row_1');

        UI.openDrawer = originalOpenDrawer;

        const body = capturedDrawer.body;
        Assert.isTrue(body.includes('Acme Corporation'), "Deve risolvere e visualizzare il nome dell'azienda collegata");
        Assert.isTrue(body.includes(I18n.t('adv_record.orphan_badge')), "Il record non trovato deve visualizzare il badge orfano");
    });

    test("Dettaglio Record: apertura da relazione esterna visualizza banner contestuale e pulsante 'Scollega'", () => {
        const tableId = 'db_child_record';
        
        // Configuriamo il database child senza montare il suo wrapper nel DOM della pagina corrente
        AppState.databases[tableId] = {
            id: tableId,
            title: "Dettaglio Azienda",
            columns: [{ id: 'c_name', name: 'Nome', type: 'text' }],
            rows: [{ id: 'row_1', cells: { c_name: 'Azienda Esterna' } }]
        };

        let capturedDrawer = null;
        const originalOpenDrawer = UI.openDrawer;
        UI.openDrawer = (title, body, footer) => {
            capturedDrawer = { title, body, footer };
        };

        const relationCtx = {
            srcTable: 'db_parent_table',
            srcRow: 'parent_row_5',
            srcCol: 'col_rel_children',
            isBacklink: false
        };

        AppState.isEditMode = true;
        AdvancedTable.openRecordView(tableId, 'row_1', relationCtx);

        UI.openDrawer = originalOpenDrawer;

        const body = capturedDrawer.body;
        Assert.isTrue(body.includes('Stai visualizzando un record appartenente al database'), "Deve mostrare il banner informativo di navigazione relazionale");
        Assert.isTrue(body.includes("AdvancedTable.unlinkRelation('db_parent_table', 'parent_row_5', 'col_rel_children', 'row_1', false)"), "Deve generare il comando unlinkRelation per scollegare anziché distruggere");
    });

    test("Dettaglio Record: flag isClonedCopy mostra banner di conferma duplicazione e pulsante 'Duplica Record' nel footer", () => {
        const tableId = 'db_clone_test';
        setupMockDatabase(tableId);

        let capturedDrawer = null;
        const originalOpenDrawer = UI.openDrawer;
        UI.openDrawer = (title, body, footer) => {
            capturedDrawer = { title, body, footer };
        };

        AppState.isEditMode = true;
        AdvancedTable.openRecordView(tableId, 'row_1', null, true);

        UI.openDrawer = originalOpenDrawer;

        const body = capturedDrawer.body;
        Assert.isTrue(body.includes('Record duplicato con successo! Stai visualizzando la copia creata.'), "Deve mostrare il banner di successo clonazione");
        Assert.isTrue(body.includes("AdvancedTable.duplicateRecord('db_clone_test', 'row_1')"), "Il drawer deve contenere il pulsante per duplicare il record corrente");
    });

    test("Dettaglio Record: in sola lettura (Read Mode) nessun input è modificabile e il pulsante macro resta visibile", () => {
        const tableId = 'db_readonly_test';
        setupMockDatabase(tableId);

        let capturedDrawer = null;
        const originalOpenDrawer = UI.openDrawer;
        UI.openDrawer = (title, body, footer) => {
            capturedDrawer = { title, body, footer };
        };

        // Modalità Lettura (isEdit = false)
        AppState.isEditMode = false;
        AdvancedTable.openRecordView(tableId, 'row_1');

        UI.openDrawer = originalOpenDrawer;

        const body = capturedDrawer.body;
        Assert.isFalse(body.includes('onblur="AdvancedTable.updateData'), "In sola lettura non devono esserci gestori di aggiornamento su input");
        Assert.isFalse(body.includes('<input type="text" value="Attività Alfa"'), "Non deve contenere campi input modificabili");
        Assert.isTrue(body.includes('Attività Alfa</div>'), "Il testo deve essere visualizzato come stringa semplice");
        
        Assert.isTrue(body.includes('action-btn-run'), "Il pulsante macro deve essere presente anche in sola lettura");
        Assert.isTrue(body.includes('Esegui Macro'), "L'etichetta del pulsante macro deve essere visibile");
    });

    test("Dettaglio Record: evento 'drawer-restored' ricarica automaticamente la vista del record attivo", () => {
        const tableId = 'db_restore_event_test';
        setupMockDatabase(tableId);

        let openCallCount = 0;
        let lastTableCalled = null;
        let lastRowCalled = null;

        const originalOpenRecordView = AdvancedTable.openRecordView;
        AdvancedTable.openRecordView = (tId, rId) => {
            openCallCount++;
            lastTableCalled = tId;
            lastRowCalled = rId;
        };

        AdvancedTable.activeTableId = tableId;
        AdvancedTable.activeRecordId = 'row_1';

        document.dispatchEvent(new CustomEvent('drawer-restored', {
            detail: { titleText: '📄 Dettaglio Record: Database Collaudo' }
        }));

        AdvancedTable.openRecordView = originalOpenRecordView;

        Assert.strictEqual(openCallCount, 1, "openRecordView deve essere invocato una volta alla ricezione dell'evento drawer-restored");
        Assert.strictEqual(lastTableCalled, tableId, "La tabella ricaricata deve coincidere con activeTableId");
        Assert.strictEqual(lastRowCalled, 'row_1', "Il record ricaricato deve coincidere con activeRecordId");
    });

});