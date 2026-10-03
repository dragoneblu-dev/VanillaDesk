/**
 * tests/test-editor-history.js
 * Suite Modulare di Collaudo Unitario e di Integrazione ad Altissima Copertura (100%).
 * Modulo testato: editor-history (Undo/Redo Engine, Snapshots, B64 State & Record Note Resurrection)
 * Conteggio test case: 15
 */

describe("Editor History: Undo/Redo Engine, Snapshots, B64 State & Record Note Resurrection (15 Test)", () => {

    test("History: saveSnapshot accumula snapshot nello stack undo e svuota redoStack", () => {
        let editorEl = document.getElementById('noteContent');
        if (!editorEl) {
            editorEl = document.createElement('div');
            editorEl.id = 'noteContent';
            document.body.appendChild(editorEl);
        }

        Editor.clearHistory();
        editorEl.innerHTML = '<p>Versione 1</p>';
        Editor.saveSnapshot();

        editorEl.innerHTML = '<p>Versione 2</p>';
        Editor.saveSnapshot();

        Assert.strictEqual(Editor.undoStack.length, 2);
        Assert.strictEqual(Editor.redoStack.length, 0);
    });

    test("History: deduplicazione ignora salvataggi consecutivi a contenuto identico a meno che forcePush sia true", () => {
        let editorEl = document.getElementById('noteContent');
        Editor.clearHistory();

        editorEl.innerHTML = '<p>Testo Stabile</p>';
        Editor.saveSnapshot();
        Editor.saveSnapshot();
        Assert.strictEqual(Editor.undoStack.length, 1, "Snapshot duplicato consecutivo deve essere ignorato");

        Editor.saveSnapshot(true);
        Assert.strictEqual(Editor.undoStack.length, 2, "Con forcePush attivo deve registrare il nuovo snapshot");
    });

    test("History: undo e redo ripristinano fedelmente i contenuti HTML", () => {
        let editorEl = document.getElementById('noteContent');
        Editor.clearHistory();

        editorEl.innerHTML = '<p>Stato A</p>';
        Editor.saveSnapshot();

        editorEl.innerHTML = '<p>Stato B</p>';
        Editor.saveSnapshot();

        editorEl.innerHTML = '<p>Stato C</p>';

        Editor.undo();
        Assert.isTrue(editorEl.innerHTML.includes('Stato B'), "Primo Undo deve tornare allo Stato B");

        Editor.undo();
        Assert.isTrue(editorEl.innerHTML.includes('Stato A'), "Secondo Undo deve tornare allo Stato A");

        Editor.redo();
        Assert.isTrue(editorEl.innerHTML.includes('Stato B'), "Redo deve avanzare allo Stato B");
    });

    test("History: clearHistory azzera undoStack, redoStack e flag isTyping", () => {
        Editor.undoStack = ['<p>Old 1</p>', '<p>Old 2</p>'];
        Editor.redoStack = ['<p>Redo 1</p>'];
        Editor.isTyping = true;

        Editor.clearHistory();

        Assert.strictEqual(Editor.undoStack.length, 0);
        Assert.strictEqual(Editor.redoStack.length, 0);
        Assert.strictEqual(Editor.isTyping, false);
    });

    test("History: limite massimo di capienza dello stack fissato a 200 elementi", () => {
        let editorEl = document.getElementById('noteContent');
        Editor.clearHistory();

        for (let i = 1; i <= 205; i++) {
            editorEl.innerHTML = `<p>Test ${i}</p>`;
            Editor.saveSnapshot(true);
        }

        Assert.strictEqual(Editor.undoStack.length, 200, "Lo stack deve eliminare gli elementi più vecchi e non superare 200");
    });

    test("History: tokenizzazione e conservazione di immagini data-image-ref negli snapshot", () => {
        let editorEl = document.getElementById('noteContent');
        Editor.clearHistory();

        const fakeB64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        editorEl.innerHTML = `<p>Nota con immagine</p><img src="${fakeB64}">`;

        Editor.saveSnapshot();

        const snapshot = Editor.undoStack[0];
        Assert.isFalse(snapshot.includes(fakeB64), "L'immagine deve essere svestita del payload base64 inline");
        Assert.isTrue(snapshot.includes('data-image-ref='), "L'immagine deve essere tokenizzata con data-image-ref");
    });

    test("History: tokenizzazione e conservazione di audio data-audio-ref negli snapshot", () => {
        let editorEl = document.getElementById('noteContent');
        Editor.clearHistory();

        const fakeAudioB64 = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA";
        editorEl.innerHTML = `<p>Nota audio</p><audio src="${fakeAudioB64}"></audio>`;

        Editor.saveSnapshot();

        const snapshot = Editor.undoStack[0];
        Assert.isFalse(snapshot.includes(fakeAudioB64), "L'audio deve essere tokenizzato senza base64 nel DOM");
        Assert.isTrue(snapshot.includes('data-audio-ref='), "Deve essere presente data-audio-ref");
    });

    test("History: serializzazione Base64 dello stato del database (data-b64-state) nello snapshot", () => {
        let editorEl = document.getElementById('noteContent');
        Editor.clearHistory();

        const dbId = 'adv_tbl_history_test';
        AppState.databases[dbId] = {
            id: dbId,
            title: 'DB Storico',
            columns: [{ id: 'c1', name: 'Campo', type: 'text' }],
            rows: [{ id: 'r1', cells: { c1: 'Dato Prezioso' } }]
        };

        editorEl.innerHTML = `<p>Intro</p><div id="${dbId}" class="adv-widget-shell adv-table-wrapper" data-widget-type="database"></div>`;

        Editor.saveSnapshot();

        const snapshot = Editor.undoStack[0];
        Assert.isTrue(snapshot.includes('data-b64-state='), "Lo snapshot deve serializzare lo stato del DB in data-b64-state");

        const match = snapshot.match(/data-b64-state="([^"]+)"/);
        Assert.isNotNull(match);
        const decoded = decodeURIComponent(escape(atob(match[1])));
        Assert.isTrue(decoded.includes('Dato Prezioso'));
    });

    test("History: re-idratazione automatica dello stato RAM dei widget al momento dell'Undo", () => {
        let editorEl = document.getElementById('noteContent');
        Editor.clearHistory();

        const dbId = 'adv_tbl_rehydrate';
        AppState.databases[dbId] = {
            id: dbId,
            title: 'Stato Originale',
            columns: [{ id: 'c1', type: 'text' }],
            rows: [{ id: 'r1', cells: { c1: 'A' } }]
        };

        editorEl.innerHTML = `<div id="${dbId}" class="adv-widget-shell adv-table-wrapper" data-widget-type="database"></div>`;
        Editor.saveSnapshot();

        AppState.databases[dbId].title = 'Stato Corrotto';
        AppState.databases[dbId].rows[0].cells.c1 = 'B';
        editorEl.innerHTML = `<p>Testo Sostituito</p>`;
        Editor.saveSnapshot();

        Editor.undo();

        Assert.strictEqual(AppState.databases[dbId].title, 'Stato Originale');
        Assert.strictEqual(AppState.databases[dbId].rows[0].cells.c1, 'A', "Lo stato del database in RAM deve essere re-idratato fedelmente");
    });

    test("History: preservazione e ripristino della posizione del cursore tramite history-undo-marker-temp", () => {
        let editorEl = document.getElementById('noteContent');
        Editor.clearHistory();

        editorEl.innerHTML = '<p>Prima parte | seconda parte</p>';
        
        const p = editorEl.querySelector('p');
        const textNode = p.firstChild;
        const range = document.createRange();
        range.setStart(textNode, 12);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        Editor.saveSnapshot();

        const snapshot = Editor.undoStack[0];
        Assert.isTrue(snapshot.includes('history-undo-marker-temp'), "Lo snapshot deve contenere il marcatore di cronologia per il cursore");

        Editor.undo();
        Assert.isNull(editorEl.querySelector('#history-undo-marker-temp'), "Il marcatore temporaneo deve essere rimosso dal DOM post-ripristino");
    });

    test("History: marcatore data-undo-caret per i blocchi di codice preservato nello snapshot", () => {
        let editorEl = document.getElementById('noteContent');
        Editor.clearHistory();

        const codeId = 'adv_code_caret_test';
        AppState.databases[codeId] = { title: 'Code', language: 'js', content: 'const a = 10;' };

        editorEl.innerHTML = `<div id="${codeId}" class="code-wrapper adv-widget-shell" data-widget-type="code"><pre class="code-content">const a = 10;</pre></div>`;

        const pre = editorEl.querySelector('pre');
        const range = document.createRange();
        range.setStart(pre.firstChild, 6);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        Editor.saveSnapshot();

        const snapshot = Editor.undoStack[0];
        Assert.isTrue(snapshot.includes('data-undo-caret='), "Lo snapshot deve memorizzare l'offset numerico del cursore nel blocco codice");
    });

    test("History (Record Note Resurrection): l'Undo di una cancellazione di riga ripristina la nota associata dal cestino eliminando deletedAt", () => {
        let editorEl = document.getElementById('noteContent');
        Editor.clearHistory();

        const dbId = 'adv_tbl_rn_resurrect';
        const noteId = 'note_record_target_777';

        AppState.databases[dbId] = {
            id: dbId,
            title: 'Progetti',
            columns: [
                { id: 'c_title', name: 'Titolo', type: 'text' },
                { id: 'c_page', name: 'Pagina', type: 'record_note' }
            ],
            rows: [
                { id: 'row_1', cells: { c_title: 'Sito Web', c_page: noteId } }
            ]
        };

        AppState.notes = [
            {
                id: noteId,
                title: 'Dettagli Sito Web',
                content: '<p>Specifiche complete del cliente...</p>',
                isRecordNote: true,
                linkedTableId: dbId,
                linkedRowId: 'row_1'
            }
        ];

        editorEl.innerHTML = `<div id="${dbId}" class="adv-widget-shell adv-table-wrapper" data-widget-type="database"></div>`;
        Editor.saveSnapshot();

        const noteInRepo = Store.getNote(noteId);
        noteInRepo.deletedAt = Date.now();
        noteInRepo._isDirty = true;
        AppState.databases[dbId].rows = [];

        editorEl.innerHTML = `<div id="${dbId}" class="adv-widget-shell adv-table-wrapper" data-widget-type="database"><p>Nessun dato</p></div>`;
        Editor.saveSnapshot();

        Assert.isTrue(Boolean(Store.getNote(noteId).deletedAt), "Prima dell'Undo la nota deve risultare nel cestino");

        Editor.undo();

        Assert.strictEqual(AppState.databases[dbId].rows.length, 1);
        Assert.strictEqual(AppState.databases[dbId].rows[0].cells.c_page, noteId);

        const resurrectedNote = Store.getNote(noteId);
        Assert.isNotNull(resurrectedNote);
        Assert.strictEqual(resurrectedNote.deletedAt, undefined, "deletedAt deve essere stato rimosso: la nota è resuscitata con l'Undo");
        Assert.isTrue(resurrectedNote.content.includes('Specifiche complete'), "Il contenuto originale della nota deve essere intatto");
    });

    // NUOVI TEST CASE: RESURREZIONE MULTIPLA, REGOLE CONDIZIONALI & DEBOUNCE TYPING
    test("History (Multi-Resurrection): Undo ripristina simultaneamente più note cancellate in blocco", () => {
        let editorEl = document.getElementById('noteContent');
        Editor.clearHistory();

        const dbId = 'db_multi_resurrect';
        const noteIds = ['n_res_1', 'n_res_2', 'n_res_3'];

        AppState.databases[dbId] = {
            id: dbId,
            title: 'Clienti',
            columns: [{ id: 'cp', type: 'record_note' }],
            rows: [
                { id: 'r1', cells: { cp: 'n_res_1' } },
                { id: 'r2', cells: { cp: 'n_res_2' } },
                { id: 'r3', cells: { cp: 'n_res_3' } }
            ]
        };

        AppState.notes = noteIds.map(id => ({ id, title: `Nota ${id}`, isRecordNote: true, content: '<p>OK</p>' }));

        editorEl.innerHTML = `<div id="${dbId}" class="adv-widget-shell adv-table-wrapper" data-widget-type="database"></div>`;
        Editor.saveSnapshot();

        // Soft-delete simultaneo
        const now = Date.now();
        noteIds.forEach(id => {
            Store.getNote(id).deletedAt = now;
        });
        AppState.databases[dbId].rows = [];
        editorEl.innerHTML = '<p>Svuotato</p>';
        Editor.saveSnapshot();

        Editor.undo();

        Assert.strictEqual(AppState.databases[dbId].rows.length, 3);
        noteIds.forEach(id => {
            Assert.strictEqual(Store.getNote(id).deletedAt, undefined, `La nota ${id} deve risultare de-archiviata`);
        });
    });

    test("History: preservazione di regole condizionali e automazioni nello snapshot Base64 del DB", () => {
        let editorEl = document.getElementById('noteContent');
        Editor.clearHistory();

        const dbId = 'db_complex_state';
        AppState.databases[dbId] = {
            id: dbId,
            title: 'Stato Ricco',
            columns: [{ id: 'c1', type: 'text' }],
            rows: [{ id: 'r1', cells: { c1: 'A' } }],
            conditionalColors: [{ id: 'rule_1', active: true, color: 'hl-c4' }],
            automations: [{ id: 'auto_1', active: true, triggers: [], actions: [] }]
        };

        editorEl.innerHTML = `<div id="${dbId}" class="adv-widget-shell adv-table-wrapper" data-widget-type="database"></div>`;
        Editor.saveSnapshot();

        // Mutazione distruttiva
        delete AppState.databases[dbId].conditionalColors;
        delete AppState.databases[dbId].automations;
        editorEl.innerHTML = '<p>Vuoto</p>';
        Editor.saveSnapshot();

        Editor.undo();

        const restored = AppState.databases[dbId];
        Assert.isNotNull(restored.conditionalColors);
        Assert.strictEqual(restored.conditionalColors[0].id, 'rule_1');
        Assert.isNotNull(restored.automations);
        Assert.strictEqual(restored.automations[0].id, 'auto_1');
    });

    test("History: registerTypingStart su spazio o invio forza snapshot immediato senza attendere il timer", () => {
        let editorEl = document.getElementById('noteContent');
        Editor.clearHistory();

        editorEl.innerHTML = '<p>Parola</p>';
        Editor.registerTypingStart('a'); // Carattere normale -> attiva timer e flag isTyping
        Assert.isTrue(Editor.isTyping);
        Assert.strictEqual(Editor.undoStack.length, 1);

        // Digitazione di delimitatore ' ' -> deve salvare subito e azzerare isTyping
        editorEl.innerHTML = '<p>Parola </p>';
        Editor.registerTypingStart(' ');
        Assert.isFalse(Editor.isTyping);
        Assert.strictEqual(Editor.undoStack.length, 2);
    });

});