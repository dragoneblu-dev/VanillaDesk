/**
 * tests/test-editor-format-blocks.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-format-blocks
 * Conteggio test case: 12
 */

describe("Editor Format Blocks: Code Blocks, Divisori, Snippet & Spostamenti (12 Test)", () => {

    test("Editor: insertCopySnippet crea elemento copiabile con testo e pulsante", () => {
        let editor = document.getElementById('noteContent');
        if (!editor) {
            editor = document.createElement('div');
            editor.id = 'noteContent';
            document.body.appendChild(editor);
        }
        editor.innerHTML = '<p>Testo riga</p>';

        const p = editor.querySelector('p');
        const range = document.createRange();
        range.selectNodeContents(p);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        Editor.insertCopySnippet();

        const snippet = editor.querySelector('.adv-copy-snippet');
        Assert.isNotNull(snippet);
        Assert.isNotNull(snippet.querySelector('.snippet-text'));
        Assert.isNotNull(snippet.querySelector('.snippet-copy-btn'));
    });

    test("Editor: healWidgetWrappers risana wrapper spezzati dentro tag di formattazione inline", () => {
        let editor = document.getElementById('noteContent');
        if (!editor) {
            editor = document.createElement('div');
            editor.id = 'noteContent';
            document.body.appendChild(editor);
        }
        // Markup corrotto generato da execCommand del browser: widget racchiuso in <b>
        editor.innerHTML = '<b><div class="adv-widget-shell" id="w_heal"></div></b>';

        Editor.healWidgetWrappers();

        const widget = editor.querySelector('#w_heal');
        Assert.isNotNull(widget);
        Assert.strictEqual(widget.parentNode.tagName.toLowerCase(), 'div', "Il widget deve trovarsi direttamente nella radice e non dentro <b>");
    });

    test("Editor: moveBlock direzionale con -1 sposta paragrafo sopra", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="p_one">Uno</p><p id="p_two">Due</p>';

        const pTwo = editor.querySelector('#p_two');
        const range = document.createRange();
        range.setStart(pTwo.firstChild, 0);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        AppState.isEditMode = true;
        Editor.moveBlock(-1);

        Assert.strictEqual(editor.firstElementChild.id, 'p_two');
    });

    test("Editor: moveBlock direzionale con 1 sposta paragrafo sotto", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="p_first">Primo</p><p id="p_second">Secondo</p>';

        const pFirst = editor.querySelector('#p_first');
        const range = document.createRange();
        range.setStart(pFirst.firstChild, 0);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        AppState.isEditMode = true;
        Editor.moveBlock(1);

        Assert.strictEqual(editor.lastElementChild.id, 'p_first');
    });

    test("Editor.insertDivider: inserisce linea orizzontale <hr> e nuovo paragrafo", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="p_div">Sopra</p>';

        const p = editor.querySelector('#p_div');
        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        r.setStart(p.firstChild, 0);
        r.collapse(true);
        sel.addRange(r);

        Editor.insertDivider();
        Assert.isNotNull(editor.querySelector('hr'));
        Assert.strictEqual(editor.querySelectorAll('p').length, 2);
    });

    // =========================================================================
    // NUOVI TEST CASE (Funzionalità prima non coperte)
    // =========================================================================

    test("Editor: insertCopySnippet con isMasked=true assegna la classe snippet-masked", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="p_snip">Riga per snippet</p>';

        const p = editor.querySelector('#p_snip');
        const r = document.createRange();
        r.setStart(p.firstChild, 0);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);

        Editor.insertCopySnippet(true);

        const snippet = editor.querySelector('.adv-copy-snippet');
        Assert.isNotNull(snippet);
        Assert.isTrue(snippet.classList.contains('snippet-masked'), "Deve possedere la classe snippet-masked per password riservate");
    });

    test("Editor: insertCodeBlock blocca inserimento se cursore è dentro colonne (.widget-type-columns)", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = `
            <div class="adv-widget-shell widget-type-columns">
                <div class="col-box"><p id="p_in_col">Testo in colonna</p></div>
            </div>
        `;

        const p = editor.querySelector('#p_in_col');
        const r = document.createRange();
        r.setStart(p.firstChild, 0);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);

        let alertShown = false;
        const origAlert = window.alert;
        window.alert = () => { alertShown = true; };

        try {
            Editor.insertCodeBlock();
            Assert.isTrue(alertShown, "Deve mostrare alert per barriera colonne");
            Assert.isNull(editor.querySelector('.widget-type-code'), "Non deve inserire il blocco di codice dentro la colonna");
        } finally {
            window.alert = origAlert;
        }
    });

    test("Editor: insertCodeBlock su riga vuota sostituisce il paragrafo e accoda un paragrafo successivo", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="p_empty_target"><br></p>';

        const p = editor.querySelector('#p_empty_target');
        const r = document.createRange();
        r.setStart(p, 0);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);

        Editor.insertCodeBlock();

        Assert.isNull(editor.querySelector('#p_empty_target'), "Il paragrafo vuoto deve essere sostituito");
        const codeWrapper = editor.querySelector('.widget-type-code');
        Assert.isNotNull(codeWrapper);
        Assert.isNotNull(codeWrapper.nextElementSibling);
        Assert.strictEqual(codeWrapper.nextElementSibling.tagName.toLowerCase(), 'p');
    });

    test("Editor.exec: formattazione multi-cella applica e alterna (toggle) il grassetto su tutte le celle", () => {
        const td1 = document.createElement('td'); td1.innerHTML = 'Cella 1';
        const td2 = document.createElement('td'); td2.innerHTML = 'Cella 2';
        document.body.appendChild(td1);
        document.body.appendChild(td2);

        TableManager.Selection.selectedCells = [td1, td2];

        try {
            // Primo exec: applica il tag <b> a entrambe
            Editor.exec('bold');
            Assert.isNotNull(td1.querySelector('b'));
            Assert.isNotNull(td2.querySelector('b'));
            Assert.strictEqual(td1.querySelector('b').textContent, 'Cella 1');

            // Secondo exec: rimuove il tag <b> (Toggle OFF)
            Editor.exec('bold');
            Assert.isNull(td1.querySelector('b'), "Il secondo exec su tutte le celle con tag deve rimuovere il grassetto");
            Assert.isNull(td2.querySelector('b'));
            Assert.strictEqual(td1.textContent.trim(), 'Cella 1');
        } finally {
            TableManager.Selection.selectedCells = [];
            td1.remove();
            td2.remove();
        }
    });

    test("Editor.exec: formattazione multi-cella applica e alterna corsivo e sottolineato", () => {
        const td = document.createElement('td'); td.innerHTML = 'Dato';
        document.body.appendChild(td);
        TableManager.Selection.selectedCells = [td];

        try {
            Editor.exec('italic');
            Assert.isNotNull(td.querySelector('i'));

            Editor.exec('italic');
            Assert.isNull(td.querySelector('i'));

            Editor.exec('underline');
            Assert.isNotNull(td.querySelector('u'));

            Editor.exec('underline');
            Assert.isNull(td.querySelector('u'));
        } finally {
            TableManager.Selection.selectedCells = [];
            td.remove();
        }
    });

    test("Editor: moveBlock con blocco già in cima o in fondo non genera errori", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="only_p">Unico</p>';

        const p = editor.querySelector('#only_p');
        const r = document.createRange();
        r.setStart(p.firstChild, 0);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);

        AppState.isEditMode = true;
        Assert.doesNotThrow(() => {
            Editor.moveBlock(-1); // Nessun blocco sopra
            Editor.moveBlock(1);  // Nessun blocco sotto
        });
        Assert.strictEqual(editor.children.length, 1);
    });

    test("Editor: insertDivider dentro elemento di lista inserisce linea dopo il blocco genitore", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<ul><li id="li_div">Punto elenco</li></ul>';

        const li = editor.querySelector('#li_div');
        const r = document.createRange();
        r.setStart(li.firstChild, 2);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);

        Editor.insertDivider();

        Assert.isNotNull(editor.querySelector('hr'), "Deve inserire la linea orizzontale");
        Assert.isNotNull(editor.querySelector('p'), "Deve inserire il paragrafo per la continuazione");
    });

});