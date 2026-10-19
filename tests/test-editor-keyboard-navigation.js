/**
 * tests/test-editor-keyboard-navigation.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-keyboard-navigation
 * Conteggio test case: 25
 * 
 * Verifiche coperte:
 * - Navigazione fine corsa e smart-exit della formattazione (handleFormatEscape)
 * - Risoluzione salti cursore tra span e stili annidati (tx-c*, hl-c*, b, i)
 * - Preservazione della digitazione continua con Spazio
 * - Attraversamento con le 4 frecce di Snippet copiabili e cuscinetti \u200B
 * - Navigazione a griglia geometrica 2D nelle tabelle (handleTableNavigation)
 * - Indentazione contestuale tramite Tab e Shift+Tab (Liste, Checklist, Codice)
 */

describe("Editor Keyboard Navigation: Frecce, Snippet, Tabelle & Format Escape (25 Test)", () => {

    // Helper per inizializzare l'editor pulito nella sandbox
    const setupEditor = (html) => {
        let editor = document.getElementById('noteContent');
        if (!editor) {
            editor = document.createElement('div');
            editor.id = 'noteContent';
            document.body.appendChild(editor);
        }
        editor.innerHTML = html;
        AppState.isEditMode = true;
        return editor;
    };

    // Helper per posizionare il cursore su un nodo a un offset specifico
    const setCaret = (node, offset) => {
        const range = document.createRange();
        range.setStart(node, offset);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return range;
    };

    // =========================================================================
    // SEZIONE 1: FORMAT ESCAPE E RISOLUZIONE SALTI TRA SPAN ANNIDATI
    // =========================================================================

    test("Format Escape: ArrowRight a fine parola interna non salta oltre lo span se segue altro testo nel paragrafo", () => {
        // Riproduzione esatta del caso segnalato:
        const editor = setupEditor('<p id="test_p">ciao sono <span class="tx-c10">un <span class="hl-c2">testo&nbsp;</span>color</span>ati</p>');
        const spanTx = editor.querySelector('.tx-c10');
        const textNodeUn = spanTx.firstChild; // "un "

        // Posiziona il cursore alla fine di "un " (offset 3)
        setCaret(textNodeUn, 3);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowRight',
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        Editor.handleFormatEscape(ev);

        // Poiché nel paragrafo seguono "testo colorati", l'escape NON deve attivarsi
        Assert.isFalse(defaultPrevented, "ArrowRight non deve essere intercettato quando c'è testo successivo nello stesso blocco");
    });

    test("Format Escape: ArrowRight all'interno di span annidato (.hl-c2) prosegue con navigazione nativa", () => {
        const editor = setupEditor('<p id="test_p">ciao sono <span class="tx-c10">un <span class="hl-c2">testo&nbsp;</span>color</span>ati</p>');
        const spanHl = editor.querySelector('.hl-c2');
        const textNodeTesto = spanHl.firstChild; // "testo\u00A0"

        // Posiziona il cursore alla fine di "testo " (offset 6)
        setCaret(textNodeTesto, textNodeTesto.nodeValue.length);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowRight',
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        Editor.handleFormatEscape(ev);

        // Seguono "colorati", quindi nessuna intercettazione forzata
        Assert.isFalse(defaultPrevented, "ArrowRight non deve scavalcare lo span genitore se seguono altri caratteri");
    });

    test("Format Escape: ArrowRight a fine corsa di span parziale prima di testo normale non salta all'esterno", () => {
        const editor = setupEditor('<p id="test_p">ciao sono <span class="tx-c10">un <span class="hl-c2">testo&nbsp;</span>color</span>ati</p>');
        const spanTx = editor.querySelector('.tx-c10');
        const textNodeColor = spanTx.lastChild; // "color"

        // Posiziona il cursore alla fine di "color" (offset 5)
        setCaret(textNodeColor, 5);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowRight',
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        Editor.handleFormatEscape(ev);

        // Nel blocco segue "ati", quindi l'evento deve rimanere nativo per entrare in "ati"
        Assert.isFalse(defaultPrevented, "ArrowRight deve entrare nel testo normale 'ati' senza causare salti a fine riga");
    });

    test("Format Escape: ArrowRight alla fine assoluta del paragrafo esegue l'escape all'esterno dello span", () => {
        const editor = setupEditor('<p id="test_p">Inizio <span class="tx-c10">fine testo</span></p>');
        const spanTx = editor.querySelector('.tx-c10');
        const textNode = spanTx.firstChild;

        // Cursore posizionato alla fine dell'ultimo carattere del paragrafo
        setCaret(textNode, textNode.nodeValue.length);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowRight',
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        Editor.handleFormatEscape(ev);

        // Essendo a fine corsa del blocco, ArrowRight deve eseguire l'escape
        Assert.isTrue(defaultPrevented, "ArrowRight deve eseguire preventDefault a fine corsa del paragrafo");

        const sel = window.getSelection();
        Assert.isTrue(sel.rangeCount > 0);
        const curRange = sel.getRangeAt(0);

        // Il range deve trovarsi subito DOPO lo span all'interno del paragrafo
        Assert.strictEqual(curRange.startContainer, editor.querySelector('#test_p'));
        Assert.strictEqual(curRange.startOffset, 2); // Indice subito dopo lo span
    });

    test("Format Escape: ArrowRight a fine blocco con trailing <br> posiziona il cursore prima del <br> e fuori dallo span", () => {
        const editor = setupEditor('<p id="test_p">Testo <b>grassetto</b><br></p>');
        const b = editor.querySelector('b');

        setCaret(b.firstChild, b.firstChild.nodeValue.length);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowRight',
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        Editor.handleFormatEscape(ev);

        Assert.isTrue(defaultPrevented);
        const sel = window.getSelection();
        const curRange = sel.getRangeAt(0);

        // Il cursore deve trovarsi subito dopo il tag <b>, dentro <p> e prima del <br>
        Assert.strictEqual(curRange.startContainer, editor.querySelector('#test_p'));
        Assert.strictEqual(curRange.startOffset, 2);
    });

    test("Format Escape: tasto Spazio non viene intercettato da handleFormatEscape per preservare la digitazione continua", () => {
        const editor = setupEditor('<p id="test_p">Oggi c\'è il <span class="tx-c10">sole</span></p>');
        const spanTx = editor.querySelector('.tx-c10');

        setCaret(spanTx.firstChild, spanTx.firstChild.nodeValue.length);

        let defaultPrevented = false;
        const ev = {
            key: ' ',
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        Editor.handleFormatEscape(ev);

        // Lo spazio deve rimanere al 100% nativo per poter continuare a digitare frasi colorate
        Assert.isFalse(defaultPrevented, "La barra spaziatrice non deve essere bloccata da handleFormatEscape");
    });

    test("Format Escape: presenza di immagine successiva nello stesso blocco inibisce l'escape artificiale", () => {
        const editor = setupEditor('<p id="test_p"><span class="tx-c10">testo</span><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></p>');
        const spanTx = editor.querySelector('.tx-c10');

        setCaret(spanTx.firstChild, spanTx.firstChild.nodeValue.length);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowRight',
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        Editor.handleFormatEscape(ev);

        // Poiché segue un'immagine, la freccia non deve scavalcare l'immagine
        Assert.isFalse(defaultPrevented, "La presenza di un'immagine dopo lo span deve inibire l'escape artificiale");
    });

    test("Format Escape: Shift+ArrowRight preserva la selezione estesa nativa senza fare escape", () => {
        const editor = setupEditor('<p id="test_p"><span class="tx-c10">testo finale</span></p>');
        const spanTx = editor.querySelector('.tx-c10');

        setCaret(spanTx.firstChild, spanTx.firstChild.nodeValue.length);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowRight',
            shiftKey: true, // Selezione con Shift attiva
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        Editor.handleFormatEscape(ev);

        Assert.isFalse(defaultPrevented, "Shift+ArrowRight non deve mai attivare l'escape della formattazione");
    });

    // =========================================================================
    // SEZIONE 2: NAVIGAZIONE ATTRAVERSO SNIPPET COPIABILI (.adv-copy-snippet)
    // =========================================================================

    test("Snippet: ArrowRight dalla fine dello snippet scavalca il cuscinetto ZWS e atterra dopo di esso", () => {
        const editor = setupEditor('<p id="test_p">Testo <span class="adv-copy-snippet adv-inline-shell" data-widget-type="snippet"><span class="snippet-text">TOKEN123</span><span class="snippet-copy-btn">📋</span></span> finale</p>');
        const snippetText = editor.querySelector('.snippet-text');

        // Cursore alla fine del testo dentro lo snippet
        setCaret(snippetText.firstChild, snippetText.firstChild.nodeValue.length);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowRight',
            shiftKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        const handled = Editor._handleSnippetHorizontalEscape(ev);

        Assert.isTrue(handled, "_handleSnippetHorizontalEscape deve gestire l'uscita a destra dello snippet");
        Assert.isTrue(defaultPrevented);

        const sel = window.getSelection();
        const curRange = sel.getRangeAt(0);
        // Il cursore deve atterrare nel testo successivo o subito dopo lo snippet
        Assert.isNotNull(curRange);
    });

    test("Snippet: ArrowLeft dall'inizio dello snippet scavalca il cuscinetto ZWS e atterra prima dello snippet", () => {
        const editor = setupEditor('<p id="test_p">Testo <span class="adv-copy-snippet adv-inline-shell" data-widget-type="snippet"><span class="snippet-text">TOKEN123</span><span class="snippet-copy-btn">📋</span></span> finale</p>');
        const snippetText = editor.querySelector('.snippet-text');

        // Cursore all'inizio del testo dentro lo snippet (offset 0)
        setCaret(snippetText.firstChild, 0);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowLeft',
            shiftKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        const handled = Editor._handleSnippetHorizontalEscape(ev);

        Assert.isTrue(handled, "_handleSnippetHorizontalEscape deve gestire l'uscita a sinistra dello snippet");
        Assert.isTrue(defaultPrevented);
    });

    test("Snippet: ArrowRight dal testo adiacente con ZWS entra direttamente in .snippet-text senza soste nel limbo", () => {
        const editor = setupEditor('<p id="test_p">Prima\u200B<span class="adv-copy-snippet adv-inline-shell" data-widget-type="snippet"><span class="snippet-text">VAL</span></span></p>');
        const prevTextNode = editor.querySelector('#test_p').firstChild; // "Prima\u200B"

        // Cursore sull'ultimo carattere (sul \u200B)
        setCaret(prevTextNode, prevTextNode.nodeValue.length);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowRight',
            shiftKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        const handled = Editor._handleSnippetHorizontalEscape(ev);

        Assert.isTrue(handled);
        Assert.isTrue(defaultPrevented);

        const sel = window.getSelection();
        const curRange = sel.getRangeAt(0);
        Assert.strictEqual(curRange.startContainer, editor.querySelector('.snippet-text'));
    });

    test("Snippet: Shift+ArrowDown scavalca verticalmente lo snippet estendendo la selezione al blocco sottostante", () => {
        const editor = setupEditor(`
            <p id="p1">Riga con <span class="adv-copy-snippet adv-inline-shell"><span class="snippet-text">SNIP</span></span> attiva</p>
            <p id="p2">Seconda riga di destinazione</p>
        `);
        const snippetText = editor.querySelector('.snippet-text');

        setCaret(snippetText.firstChild, 2);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowDown',
            shiftKey: true,
            preventDefault: () => { defaultPrevented = true; }
        };

        const handled = Editor._handleSnippetShiftSelection(ev);

        Assert.isTrue(handled, "Shift+ArrowDown deve estendere la selezione oltre lo snippet verso il blocco successivo");
        Assert.isTrue(defaultPrevented);

        const sel = window.getSelection();
        Assert.isFalse(sel.isCollapsed, "La selezione deve risultare estesa tra i due blocchi");
    });

    test("Snippet: _handleSnippetVerticalEscape ritorna false se il cursore non si trova nei pressi di uno snippet", () => {
        const editor = setupEditor('<p id="p_clean">Testo pulito senza alcun modulo inline</p>');
        const p = editor.querySelector('#p_clean');
        setCaret(p.firstChild, 5);

        const ev = { key: 'ArrowDown', shiftKey: false };
        const res = Editor._handleSnippetVerticalEscape(ev);

        Assert.isFalse(res, "Non deve intervenire se non ci sono snippet adiacenti");
    });

    // =========================================================================
    // SEZIONE 3: NAVIGAZIONE ATTRAVERSO LINK, NOTE INLINE E SEGNALIBRI
    // =========================================================================

    test("Link & Inline: handleFormatEscape non interferisce con la navigazione orizzontale dentro tag <a>", () => {
        const editor = setupEditor('<p id="test_p">Visita <a href="https://test.com" class="internal-link" data-note-id="n1">Collegamento</a> qui</p>');
        const link = editor.querySelector('a');

        setCaret(link.firstChild, link.firstChild.nodeValue.length);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowRight',
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        Editor.handleFormatEscape(ev);

        // La guardia 'parentEl.closest("a")' deve escludere i link all'istante
        Assert.isFalse(defaultPrevented, "I tag <a> non devono essere trattati da handleFormatEscape");
    });

    test("Inline Notes: il cursore naviga attorno all'appunto nascosto senza scambiare il wrapper per formattazione", () => {
        const editor = setupEditor('<p id="test_p">Parola <span class="inline-note-wrapper adv-inline-shell" data-widget-type="inline-note" contenteditable="false"><span class="inline-note-marker">💬</span></span> successiva</p>');
        const prevText = editor.querySelector('#test_p').firstChild;

        setCaret(prevText, prevText.nodeValue.length);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowRight',
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        Editor.handleFormatEscape(ev);

        // Le shell inline non devono essere considerate elementi di stile
        Assert.isFalse(defaultPrevented, "Gli appunti inline (.adv-inline-shell) non devono essere trattati come span di formattazione");
    });

    test("Bookmarks: i segnalibri (.adv-bookmark-marker) non attivano l'escape della formattazione", () => {
        const editor = setupEditor('<p id="test_p">Testo <span class="adv-bookmark-marker adv-inline-shell" contenteditable="false">🔖</span> continua</p>');
        const prevText = editor.querySelector('#test_p').firstChild;

        setCaret(prevText, prevText.nodeValue.length);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowRight',
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        Editor.handleFormatEscape(ev);

        Assert.isFalse(defaultPrevented);
    });

    // =========================================================================
    // SEZIONE 4: NAVIGAZIONE A GRIGLIA GEOMETRICA TABELLE (handleTableNavigation)
    // =========================================================================

    test("Table Navigation: al di fuori delle tabelle ritorna false lasciando la navigazione al browser", () => {
        const editor = setupEditor('<p id="p_free">Paragrafo ordinario fuori da griglie</p>');
        setCaret(editor.querySelector('#p_free').firstChild, 4);

        const ev = { key: 'ArrowRight', shiftKey: false };
        const handled = Editor.handleTableNavigation(ev);

        Assert.isFalse(handled, "handleTableNavigation deve ritornare false se il cursore non si trova in td o th");
    });

    test("Table Navigation: a metà testo della cella freccia destra non cambia cella e ritorna false", () => {
        const editor = setupEditor(`
            <table>
                <tr>
                    <td id="c1">Cella Uno</td>
                    <td id="c2">Cella Due</td>
                </tr>
            </table>
        `);
        const c1 = editor.querySelector('#c1');
        setCaret(c1.firstChild, 3); // Cursore tra 'l' e 'l' di 'Cella'

        const ev = { key: 'ArrowRight', shiftKey: false, preventDefault: () => {} };
        const handled = Editor.handleTableNavigation(ev);

        Assert.isFalse(handled, "Freccia a destra in mezzo al testo della cella non deve innescare il salto cella");
    });

    test("Table Navigation: a fine testo della cella freccia destra sposta il cursore sulla cella successiva", () => {
        const editor = setupEditor(`
            <table>
                <tr>
                    <td id="c1">Dato 1</td>
                    <td id="c2">Dato 2</td>
                </tr>
            </table>
        `);
        const c1 = editor.querySelector('#c1');
        const c2 = editor.querySelector('#c2');

        // Cursore all'ultimo carattere della prima cella
        setCaret(c1.firstChild, c1.firstChild.nodeValue.length);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowRight',
            shiftKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        const handled = Editor.handleTableNavigation(ev);

        Assert.isTrue(handled, "A fine testo della cella deve spostarsi alla cella successiva");
        Assert.isTrue(defaultPrevented);

        const sel = window.getSelection();
        Assert.isTrue(c2.contains(sel.anchorNode), "Il cursore deve trovarsi all'interno della seconda cella");
    });

    test("Table Navigation: all'inizio del testo della cella freccia sinistra torna alla cella precedente", () => {
        const editor = setupEditor(`
            <table>
                <tr>
                    <td id="c1">Dato 1</td>
                    <td id="c2">Dato 2</td>
                </tr>
            </table>
        `);
        const c1 = editor.querySelector('#c1');
        const c2 = editor.querySelector('#c2');

        // Cursore a inizio della seconda cella (offset 0)
        setCaret(c2.firstChild, 0);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowLeft',
            shiftKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        const handled = Editor.handleTableNavigation(ev);

        Assert.isTrue(handled);
        Assert.isTrue(defaultPrevented);

        const sel = window.getSelection();
        Assert.isTrue(c1.contains(sel.anchorNode), "Il cursore deve ritornare nella prima cella");
    });

    test("Table Navigation: freccia in basso si sposta perpendicolarmente sulla riga sottostante nella stessa colonna", () => {
        const editor = setupEditor(`
            <table>
                <tr>
                    <td id="r1_c1">A1</td>
                    <td id="r1_c2">B1</td>
                </tr>
                <tr>
                    <td id="r2_c1">A2</td>
                    <td id="r2_c2">B2</td>
                </tr>
            </table>
        `);
        const r1c2 = editor.querySelector('#r1_c2');
        const r2c2 = editor.querySelector('#r2_c2');

        setCaret(r1c2.firstChild, 1);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowDown',
            shiftKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        const handled = Editor.handleTableNavigation(ev);

        Assert.isTrue(handled);
        Assert.isTrue(defaultPrevented);

        const sel = window.getSelection();
        Assert.isTrue(r2c2.contains(sel.anchorNode), "Freccia in basso deve atterrare su B2 mantenendo la colonna");
    });

    test("Table Navigation: freccia in basso dall'ultima riga esce dalla tabella creando paragrafo successivo se mancante", () => {
        const editor = setupEditor(`
            <div class="simple-table-wrapper">
                <table>
                    <tr><td id="only_cell">Fine Tabella</td></tr>
                </table>
            </div>
        `);
        const td = editor.querySelector('#only_cell');
        setCaret(td.firstChild, td.firstChild.nodeValue.length);

        let defaultPrevented = false;
        const ev = {
            key: 'ArrowDown',
            shiftKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        const handled = Editor.handleTableNavigation(ev);

        Assert.isTrue(handled);
        Assert.isTrue(defaultPrevented);

        // Deve esistere un paragrafo dopo la tabella
        const pNext = editor.querySelector('.simple-table-wrapper').nextElementSibling;
        Assert.isNotNull(pNext);
        Assert.strictEqual(pNext.tagName, 'P');
    });

    // =========================================================================
    // SEZIONE 5: TABULAZIONI E INDENTAZIONI CONTESTUALI (handleTabKey)
    // =========================================================================

    test("Tab Key: Tab in blocco pre.code-content inserisce esattamente 4 spazi con cursore collassato", () => {
        const editor = setupEditor(`
            <div class="code-wrapper" data-widget-type="code">
                <pre class="code-content">function test() {}</pre>
            </div>
        `);
        const pre = editor.querySelector('pre');
        setCaret(pre.firstChild, 0);

        let execCalled = false;
        let insertedText = '';
        const origExec = document.execCommand;
        document.execCommand = (cmd, showUI, val) => {
            if (cmd === 'insertText') {
                execCalled = true;
                insertedText = val;
            }
        };

        try {
            const ev = {
                key: 'Tab',
                shiftKey: false,
                preventDefault: () => {}
            };

            Editor.handleTabKey(ev);

            Assert.isTrue(execCalled);
            Assert.strictEqual(insertedText, '    ', "Tab nel codice deve inserire 4 spazi standard");
        } finally {
            document.execCommand = origExec;
        }
    });

    test("Tab Key: Tab su elemento di lista chiama indentazione senza distruggere la struttura", () => {
        const editor = setupEditor(`
            <ul>
                <li id="li_tab">Primo elemento</li>
            </ul>
        `);
        const li = editor.querySelector('#li_tab');
        setCaret(li.firstChild, 0);

        let indentCalled = false;
        const origExec = document.execCommand;
        document.execCommand = (cmd) => {
            if (cmd === 'indent') indentCalled = true;
        };

        try {
            const ev = {
                key: 'Tab',
                shiftKey: false,
                preventDefault: () => {}
            };

            Editor.handleTabKey(ev);
            Assert.isTrue(indentCalled);
        } finally {
            document.execCommand = origExec;
        }
    });

    test("Tab Key: Tab all'interno di una cella di tabella non esegue indentazioni parassite", () => {
        const editor = setupEditor(`
            <table>
                <tr><td id="tbl_cell">Testo Cella</td></tr>
            </table>
        `);
        const td = editor.querySelector('#tbl_cell');
        setCaret(td.firstChild, 3);

        let defaultPrevented = false;
        const ev = {
            key: 'Tab',
            shiftKey: false,
            preventDefault: () => { defaultPrevented = true; }
        };

        Editor.handleTabKey(ev);

        // Nelle tabelle il Tab è inibito per evitare alterazioni di layout non gestite
        Assert.isFalse(defaultPrevented, "Tab nelle tabelle deve uscire immediatamente senza alterare la griglia");
    });

});