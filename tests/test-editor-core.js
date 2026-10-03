/**
 * tests/test-editor-core.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-core
 * Conteggio test case: 25
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("Editor Core: Minificazione HTML, AST Sanitization & Boundaries (25 Test)", () => {

    test("Minify: estirpazione marcatore cronologia temporaneo (#history-undo-marker-temp)", () => {
            const dirty = '<p>Testo valido</p><span id="history-undo-marker-temp"></span><p>Coda</p>';
            const clean = Editor.minifyHTMLForStorage(dirty, false);
            Assert.isFalse(clean.includes('history-undo-marker-temp'));
            Assert.isTrue(clean.includes('Testo valido'));
        });

    test("Minify: preservazione marcatore cronologia quando richiesto dagli snapshot RAM", () => {
            const dirty = '<p>Testo</p><span id="history-undo-marker-temp"></span>';
            const clean = Editor.minifyHTMLForStorage(dirty, true);
            Assert.isTrue(clean.includes('history-undo-marker-temp'));
        });

    test("Minify: rimozione residui multi-cursore (.adv-multi-cursor)", () => {
            const dirty = '<p>Parola <mark class="adv-multi-cursor master">chiave</mark> e <mark class="adv-multi-cursor">chiave</mark></p>';
            const clean = Editor.minifyHTMLForStorage(dirty, false);
            Assert.isFalse(clean.includes('adv-multi-cursor'));
            Assert.isTrue(clean.includes('Parola chiave e chiave'));
        });

    test("Minify: deidratazione carcasse runtime di database, diari e blocchi codice", () => {
            const dirty = `
                <div id="adv_tbl_10" class="adv-widget-shell widget-type-database" data-widget-type="database">
                    <div class="widget-header">Tool</div>
                    <div class="widget-body"><table><tr><td>Dato Pesante</td></tr></table></div>
                </div>
                <div id="adv_code_20" class="adv-widget-shell widget-type-code" data-widget-type="code">
                    <div class="widget-body"><pre class="code-content">console.log("X")</pre></div>
                </div>
            `;
            const clean = Editor.minifyHTMLForStorage(dirty);
            Assert.isTrue(clean.includes('id="adv_tbl_10"'));
            Assert.isTrue(clean.includes('id="adv_code_20"'));
            Assert.isFalse(clean.includes('Dato Pesante'));
            Assert.isFalse(clean.includes('console.log'));
        });

    test("Minify: normalizzazione note inline contenenti tag illegali (p, div, li -> br)", () => {
            const dirty = '<span class="inline-note-data"><p>Riga 1</p><div>Riga 2</div><li>Punto</li></span>';
            const clean = Editor.minifyHTMLForStorage(dirty);
            Assert.isFalse(clean.includes('<p>'));
            Assert.isFalse(clean.includes('<div>'));
            Assert.isFalse(clean.includes('<li>'));
            Assert.isTrue(clean.includes('<br>'));
        });

    test("Minify: disattivazione src iframe per impedire chiamate di rete in background", () => {
            const dirty = '<iframe src="https://www.youtube.com/embed/test"></iframe>';
            const clean = Editor.minifyHTMLForStorage(dirty);
            Assert.isFalse(clean.includes(' src="https://'));
            Assert.isTrue(clean.includes('data-src="https://'));
        });

    test("Minify: rimozione attributo src da immagini e audio aventi puntatori ad asset fisici", () => {
            const dirty = '<img src="blob:http://..." data-image-ref="img_123.jpg"><audio src="blob:http://..." data-audio-ref="aud_123.mp3"></audio>';
            const clean = Editor.minifyHTMLForStorage(dirty);
            Assert.isFalse(clean.includes('src="blob:'));
            Assert.isTrue(clean.includes('data-image-ref="img_123.jpg"'));
            Assert.isTrue(clean.includes('data-audio-ref="aud_123.mp3"'));
        });

    test("Editor: toggleCase inverte stringa tra maiuscolo e minuscolo", () => {
            const strLower = "vanilladesk";
            const toggledUp = (strLower === strLower.toUpperCase()) ? strLower.toLowerCase() : strLower.toUpperCase();
            Assert.strictEqual(toggledUp, "VANILLADESK");

            const toggledDown = (toggledUp === toggledUp.toUpperCase()) ? toggledUp.toLowerCase() : toggledUp.toUpperCase();
            Assert.strictEqual(toggledDown, "vanilladesk");
        });

    test("Editor: _getCodeOffset calcola offset corretto con tag annidati", () => {
            const pre = document.createElement('pre');
            pre.innerHTML = '<span>const</span> <span>x</span> = 10;';
            // Il quarto nodo figlio è il nodo di testo ' = 10;'
            const textNode = pre.childNodes[3];
            const offset = Editor._getCodeOffset(pre, textNode, 3);
            Assert.isTrue(offset > 6);
        });

    test("Editor: _normalizeEmptyBlocks converte div vuoti in paragrafi p standard", () => {
            const container = document.createElement('div');
            container.innerHTML = '<div><br></div>';
            Editor._normalizeEmptyBlocks(container);

            Assert.isNull(container.querySelector('div'));
            Assert.isNotNull(container.querySelector('p'));
        });

    test("Editor: _normalizeEmptyBlocks preserva classi e stili inline durante la conversione", () => {
            const container = document.createElement('div');
            container.innerHTML = '<div class="custom-class" style="color: red;"><br></div>';
            Editor._normalizeEmptyBlocks(container);

            const p = container.querySelector('p');
            Assert.isNotNull(p);
            Assert.isTrue(p.classList.contains('custom-class'));
            Assert.strictEqual(p.style.color, 'red');
        });

    test("Editor: cleanHighlightsBeforeSave rimuove mark.search-highlight preservando il testo interno", () => {
            let editor = document.getElementById('noteContent');
            if (!editor) {
                editor = document.createElement('div');
                editor.id = 'noteContent';
                document.body.appendChild(editor);
            }
            editor.innerHTML = '<p>Testo con <mark class="search-highlight">parola</mark> evidenziata.</p>';

            Editor.cleanHighlightsBeforeSave();

            Assert.isNull(editor.querySelector('mark'));
            Assert.isTrue(editor.innerHTML.includes('Testo con parola evidenziata.'));
        });

    test("Editor: applyHighlight inietta i tag mark.search-highlight sui soli nodi pertinenti", () => {
            const container = document.createElement('div');
            container.innerHTML = '<p>La programmazione reattiva è potente.</p>';

            Editor.applyHighlight(container, 'reattiva');

            const mark = container.querySelector('mark.search-highlight');
            Assert.isNotNull(mark);
            Assert.strictEqual(mark.textContent, 'reattiva');
        });

    test("Editor: applyHighlight ignora elementi protetti da WidgetManager", () => {
            const container = document.createElement('div');
            container.innerHTML = '<div class="adv-widget-shell"><p>Testo Protetto</p></div>';

            Editor.applyHighlight(container, 'Protetto');

            const mark = container.querySelector('mark');
            Assert.isNull(mark, "Non deve applicare evidenziazioni dentro widget protetti");
        });

    test("Editor: copyInterceptor converte br in newline durante la copia", () => {
            const dummy = document.createElement('div');
            dummy.innerHTML = 'Riga 1<br>Riga 2<br>Riga 3';

            let htmlStr = dummy.innerHTML.replace(/<br\s*[\/]?>/gi, '\n');
            Assert.strictEqual(htmlStr, 'Riga 1\nRiga 2\nRiga 3');
        });

    test("Editor: cleanOrphanedCaches preserva SYS_PROPERTIES_DB anche se non referenziato esplicitamente", () => {
            AppState.databases = {
                'SYS_PROPERTIES_DB': { title: 'Proprietà Sistema', columns: [], rows: [] },
                'adv_tbl_dead': { title: 'Morto', columns: [], rows: [] }
            };
            AppState.notes = [];

            Editor.cleanOrphanedCaches();
            Assert.isTrue('SYS_PROPERTIES_DB' in AppState.databases);
            Assert.isFalse('adv_tbl_dead' in AppState.databases);
        });

    test("Editor: sanitizeContent rimuove attributi id e name estranei dagli input", () => {
            let editor = document.getElementById('noteContent');
            if (!editor) {
                editor = document.createElement('div');
                editor.id = 'noteContent';
                document.body.appendChild(editor);
            }
            editor.innerHTML = '<input id="alien_id" name="alien_name" value="test">';

            Editor.sanitizeContent();
            const input = editor.querySelector('input');
            Assert.isNull(input.getAttribute('id'));
            Assert.isNull(input.getAttribute('name'));
        });

    test("Editor: sanitizeContent preserva id legittimi con prefisso adv_", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<div id="adv_tbl_legit" class="adv-widget-shell"></div>';

            Editor.sanitizeContent();
            Assert.isNotNull(editor.querySelector('#adv_tbl_legit'));
        });

    test("Editor: _ensureLastLineBreak aggiunge un paragrafo con br se l'ultimo elemento è un widget protetto", () => {
            const editor = document.createElement('div');
            editor.innerHTML = '<div class="adv-widget-shell widget-type-database"></div>';

            Editor._ensureLastLineBreak(editor);
            const lastEl = editor.lastElementChild;
            Assert.strictEqual(lastEl.tagName.toLowerCase(), 'p');
            Assert.strictEqual(lastEl.innerHTML, '<br>');
        });

    test("Editor: clearWidgetSelection rimuove la classe adv-widget-selected da tutti i widget", () => {
            const w1 = document.createElement('div'); w1.className = 'adv-widget-selected';
            const w2 = document.createElement('div'); w2.className = 'adv-widget-selected';
            document.body.appendChild(w1);
            document.body.appendChild(w2);

            Editor.selectedWidget = w1;
            Editor.clearWidgetSelection();

            Assert.isNull(Editor.selectedWidget);
            Assert.isFalse(w1.classList.contains('adv-widget-selected'));
            Assert.isFalse(w2.classList.contains('adv-widget-selected'));
            w1.remove(); w2.remove();
        });

    test("RawHTML: openRawHtmlEditor apre il Drawer e popola la textarea col codice minificato", () => {
        const noteId = 'note_test_raw_open';
        const initialHtml = '<p>Paragrafo di test</p><h2>Titolo Sezione</h2>';

        AppState.currentNoteId = noteId;
        AppState.notes = [{
            id: noteId,
            title: 'Nota per Test HTML',
            content: initialHtml,
            updatedAt: '2026-10-01T10:00:00.000Z'
        }];

        const editorEl = document.getElementById('noteContent');
        if (editorEl) editorEl.innerHTML = initialHtml;

        Editor.openRawHtmlEditor();

        const drawer = document.getElementById('advGlobalDrawer');
        Assert.isTrue(drawer && drawer.classList.contains('open'), "Il drawer deve risultare aperto");

        const textarea = document.getElementById('advRawHtmlTextarea');
        Assert.isNotNull(textarea, "La textarea del codice sorgente deve essere presente nel DOM");
        Assert.isTrue(textarea.value.includes('Paragrafo di test'), "Il testo del paragrafo deve essere presente nella textarea");
        Assert.isTrue(textarea.value.includes('Titolo Sezione'), "Il titolo deve essere presente nella textarea");

        UI.closeDrawer();
    });

    test("RawHTML: applyRawHtml aggiorna il contenuto della nota, imposta _isDirty e sincronizza il DOM", () => {
        const noteId = 'note_test_raw_apply';
        AppState.currentNoteId = noteId;
        AppState.notes = [{
            id: noteId,
            title: 'Nota Modifica Codice',
            content: '<p>Contenuto Vecchio</p>',
            updatedAt: '2026-10-01T10:00:00.000Z',
            _isDirty: false
        }];

        const editorEl = document.getElementById('noteContent');
        if (editorEl) editorEl.innerHTML = '<p>Contenuto Vecchio</p>';

        Editor.openRawHtmlEditor();

        const textarea = document.getElementById('advRawHtmlTextarea');
        Assert.isNotNull(textarea);
        textarea.value = '<p>Contenuto Nuovo Aggiornato</p><h3>Sotto-titolo</h3>';

        Editor.applyRawHtml();

        const currentNote = Store.getNote(noteId);
        Assert.isTrue(currentNote._isDirty, "La nota deve essere contrassegnata come dirty dopo la modifica");
        Assert.isTrue(currentNote.content.includes('Contenuto Nuovo Aggiornato'), "Il contenuto della nota deve riflettere il nuovo HTML");
        Assert.isTrue(editorEl.innerHTML.includes('Contenuto Nuovo Aggiornato'), "Il DOM dell'editor attivo deve essere aggiornato");

        const drawer = document.getElementById('advGlobalDrawer');
        Assert.isFalse(drawer && drawer.classList.contains('open'), "Il drawer deve chiudersi dopo l'applicazione");
    });

    test("RawHTML: applyRawHtml registra uno snapshot nello storico consentendo l'Undo (Ctrl+Z)", () => {
        const noteId = 'note_test_raw_undo';
        AppState.currentNoteId = noteId;
        AppState.notes = [{
            id: noteId,
            title: 'Nota Undo HTML',
            content: '<p>Versione Iniziale Sicura</p>',
            updatedAt: '2026-10-01T10:00:00.000Z'
        }];

        const editorEl = document.getElementById('noteContent');
        if (editorEl) editorEl.innerHTML = '<p>Versione Iniziale Sicura</p>';

        Editor.clearHistory();

        Editor.openRawHtmlEditor();
        const textarea = document.getElementById('advRawHtmlTextarea');
        textarea.value = '<p>Modifica Errata da Annullare</p>';

        Editor.applyRawHtml();

        Assert.isTrue(editorEl.innerHTML.includes('Modifica Errata da Annullare'));

        // Esegue l'Undo
        Editor.undo();

        Assert.isTrue(editorEl.innerHTML.includes('Versione Iniziale Sicura'), "L'Undo deve ripristinare il markup precedente all'applicazione del sorgente grezzo");
    });

    test("RawHTML: applyRawHtml applica la minificazione preventiva ripulendo iframe e marcatori temporanei", () => {
        const noteId = 'note_test_raw_clean';
        AppState.currentNoteId = noteId;
        AppState.notes = [{
            id: noteId,
            title: 'Test Pulizia',
            content: '<p>Base</p>',
            updatedAt: '2026-10-01T10:00:00.000Z'
        }];

        const editorEl = document.getElementById('noteContent');
        if (editorEl) editorEl.innerHTML = '<p>Base</p>';

        Editor.openRawHtmlEditor();
        const textarea = document.getElementById('advRawHtmlTextarea');
        
        // Iniezione di HTML con iframe esterno non sanitizzato
        textarea.value = '<p>Testo con frame</p><iframe src="https://example.com/embed"></iframe>';

        Editor.applyRawHtml();

        const currentNote = Store.getNote(noteId);
        // Utilizzo dello spazio delimitatore prima di src= per evitare collisioni di sottostringa con data-src=
        Assert.isFalse(currentNote.content.includes(' src="https://example.com/embed"'), "Iframe src deve essere minificato in data-src per prevenire chiamate di rete in background");
        Assert.isTrue(currentNote.content.includes('data-src="https://example.com/embed"'), "Deve preservare data-src");
    });

    test("RawHTML: copyRawHtmlToClipboard scrive sulla clipboard senza generare eccezioni", () => {
        const noteId = 'note_test_raw_copy';
        AppState.currentNoteId = noteId;
        AppState.notes = [{
            id: noteId,
            title: 'Nota per Copia',
            content: '<p>Testo per Clipboard</p>',
            updatedAt: '2026-10-01T10:00:00.000Z'
        }];

        // Sincronizzazione preventiva del DOM dell'editor attivo
        const editorEl = document.getElementById('noteContent');
        if (editorEl) editorEl.innerHTML = '<p>Testo per Clipboard</p>';

        Editor.openRawHtmlEditor();

        let clipboardWrittenText = null;
        const origClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

        // Mock sicuro tramite Object.defineProperty per scavalcare il getter read-only di navigator.clipboard
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: (txt) => {
                    clipboardWrittenText = txt;
                    return Promise.resolve();
                }
            },
            configurable: true,
            writable: true
        });

        try {
            Editor.copyRawHtmlToClipboard();
            Assert.isNotNull(clipboardWrittenText);
            Assert.isTrue(clipboardWrittenText.includes('Testo per Clipboard'));
        } finally {
            if (origClipboardDescriptor) {
                Object.defineProperty(navigator, 'clipboard', origClipboardDescriptor);
            } else {
                delete navigator.clipboard;
            }
            UI.closeDrawer();
        }
    });

});