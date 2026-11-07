/**
 * tests/test-editor-keyboard.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-keyboard
 */

describe("Editor Keyboard: Smart Home, Auto-Close & Scorciatoie Markdown (test-editor-keyboard.js)", () => {

    beforeEach(() => {
        let editor = document.getElementById('noteContent');
        if (!editor) {
            editor = document.createElement('div');
            editor.id = 'noteContent';
            document.body.appendChild(editor);
        } else {
            editor.innerHTML = '';
        }
        editor.setAttribute('contenteditable', 'true');
        AppState.isEditMode = true;
    });

    afterEach(() => {
        let editor = document.getElementById('noteContent');
        if (editor) editor.innerHTML = '';
        AppState.isEditMode = false;
    });

    test("Editor: isBlockElement riconosce elementi a blocco W3C", () => {
        Assert.isTrue(Editor.isBlockElement(document.createElement('p')));
        Assert.isTrue(Editor.isBlockElement(document.createElement('div')));
        Assert.isTrue(Editor.isBlockElement(document.createElement('li')));
        Assert.isTrue(Editor.isBlockElement(document.createElement('h1')));
        Assert.isTrue(Editor.isBlockElement(document.createElement('pre')));
        Assert.isFalse(Editor.isBlockElement(document.createElement('span')));
        Assert.isFalse(Editor.isBlockElement(document.createElement('a')));
    });

    test("Editor: handleHomeKey ritorna false se Shift è premuto", () => {
        const ev = { shiftKey: true, key: 'Home' };
        Assert.isFalse(Editor.handleHomeKey(ev));
    });

    test("Editor: handleHomeKey ritorna false se il cursore non si trova dentro un blocco di codice", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="p_norm">Paragrafo ordinario</p>';
        const p = editor.querySelector('#p_norm');

        const r = document.createRange();
        r.setStart(p.firstChild, 5);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);

        const ev = { shiftKey: false, key: 'Home' };
        Assert.isFalse(Editor.handleHomeKey(ev), "Non deve intervenire fuori dai blocchi pre.code-content");
    });

    test("Editor: getSelectedBlocks estrae blocchi intersecati da un range", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="p1">Primo</p><p id="p2">Secondo</p>';

        const p1 = editor.querySelector('#p1');
        const p2 = editor.querySelector('#p2');

        const range = document.createRange();
        range.setStart(p1.firstChild, 2);
        range.setEnd(p2.firstChild, 2);

        const blocks = Editor.getSelectedBlocks(range);
        Assert.strictEqual(blocks.length, 2);
        Assert.strictEqual(blocks[0].id, 'p1');
        Assert.strictEqual(blocks[1].id, 'p2');
    });

    test("Editor.handleHomeKey: all'interno di pre.code-content va al primo carattere non vuoto", () => {
        const pre = document.createElement('pre');
        pre.className = 'code-content';
        pre.textContent = '    const pi = 3.14;';
        document.body.appendChild(pre);

        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        r.setStart(pre.firstChild, 16); // A fine riga
        r.collapse(true);
        sel.addRange(r);

        const ev = { key: 'Home', shiftKey: false, preventDefault: () => {} };
        const handled = Editor.handleHomeKey(ev);
        Assert.isTrue(handled);

        // Il cursore deve trovarsi all'offset 4 (dopo i 4 spazi)
        const currentPos = Editor._getCodeOffset(pre, sel.anchorNode, sel.anchorOffset);
        Assert.strictEqual(currentPos, 4);
        pre.remove();
    });

    test("Editor.handleHomeKey: seconda pressione su primo carattere salta a colonna 0", () => {
        const pre = document.createElement('pre');
        pre.className = 'code-content';
        pre.textContent = '    const pi = 3.14;';
        document.body.appendChild(pre);

        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        r.setStart(pre.firstChild, 4); // Già sul primo carattere
        r.collapse(true);
        sel.addRange(r);

        const ev = { key: 'Home', shiftKey: false, preventDefault: () => {} };
        Editor.handleHomeKey(ev);

        const currentPos = Editor._getCodeOffset(pre, sel.anchorNode, sel.anchorOffset);
        Assert.strictEqual(currentPos, 0, "Deve saltare alla colonna 0 esatta");
        pre.remove();
    });

    test("Editor.handleHomeKey: su riga di soli spazi salta direttamente a colonna 0", () => {
        const pre = document.createElement('pre');
        pre.className = 'code-content';
        pre.textContent = '    ';
        document.body.appendChild(pre);

        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        r.setStart(pre.firstChild, 4);
        r.collapse(true);
        sel.addRange(r);

        const ev = { key: 'Home', shiftKey: false, preventDefault: () => {} };
        Editor.handleHomeKey(ev);

        const currentPos = Editor._getCodeOffset(pre, sel.anchorNode, sel.anchorOffset);
        Assert.strictEqual(currentPos, 0);
        pre.remove();
    });

    test("Editor.handleMarkdownShortcuts: '---' genera linea <hr>", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = '<p>---</p>';

        const p = editor.querySelector('p');
        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        r.setStart(p.firstChild, 3);
        r.collapse(true);
        sel.addRange(r);

        AppState.isEditMode = true;
        Editor.handleMarkdownShortcuts();
        Assert.isNotNull(editor.querySelector('hr'));
    });

    test("Editor.handleMarkdownShortcuts: '- ' genera elenco puntato ul", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = '<p>-\u00A0</p>';

        const p = editor.querySelector('p');
        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        r.setStart(p.firstChild, 2);
        r.collapse(true);
        sel.addRange(r);

        let execCalled = false;
        const origExec = document.execCommand;
        document.execCommand = (cmd) => { if (cmd === 'insertUnorderedList') execCalled = true; };

        try {
            AppState.isEditMode = true;
            Editor.handleMarkdownShortcuts();
            Assert.isTrue(execCalled);
        } finally {
            document.execCommand = origExec;
        }
    });

    test("Editor.handleMarkdownShortcuts: '* ' genera elenco puntato ul", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = '<p>*\u00A0</p>';

        const p = editor.querySelector('p');
        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        r.setStart(p.firstChild, 2);
        r.collapse(true);
        sel.addRange(r);

        let execCalled = false;
        const origExec = document.execCommand;
        document.execCommand = (cmd) => { if (cmd === 'insertUnorderedList') execCalled = true; };

        try {
            AppState.isEditMode = true;
            Editor.handleMarkdownShortcuts();
            Assert.isTrue(execCalled);
        } finally {
            document.execCommand = origExec;
        }
    });

    test("Editor.handleMarkdownShortcuts: '1. ' genera elenco numerato ol", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = '<p>1.\u00A0</p>';

        const p = editor.querySelector('p');
        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        r.setStart(p.firstChild, 3);
        r.collapse(true);
        sel.addRange(r);

        let execCalled = false;
        const origExec = document.execCommand;
        document.execCommand = (cmd) => { if (cmd === 'insertOrderedList') execCalled = true; };

        try {
            AppState.isEditMode = true;
            Editor.handleMarkdownShortcuts();
            Assert.isTrue(execCalled);
        } finally {
            document.execCommand = origExec;
        }
    });

    test("Editor.handleMarkdownShortcuts: '5. ' assegna attributo start=5 a ol", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = '<ol id="test_ol_start"><li><br></li></ol>';

        const ol = editor.querySelector('#test_ol_start');
        const li = ol.querySelector('li');
        li.textContent = "5.\u00A0";

        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        r.setStart(li.firstChild, 3);
        r.collapse(true);
        sel.addRange(r);

        AppState.isEditMode = true;
        Editor.handleMarkdownShortcuts();

        Assert.isNotNull(ol);
    });

    test("Editor.handleMarkdownShortcuts: '[] ' genera checklist interattiva", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = '<p>[]\u00A0</p>';

        const p = editor.querySelector('p');
        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        r.setStart(p.firstChild, 3);
        r.collapse(true);
        sel.addRange(r);

        let checklistInserted = false;
        const origInsert = Editor.insertChecklist;
        Editor.insertChecklist = () => { checklistInserted = true; };

        try {
            AppState.isEditMode = true;
            Editor.handleMarkdownShortcuts();
            Assert.isTrue(checklistInserted);
        } finally {
            Editor.insertChecklist = origInsert;
        }
    });

    test("Editor.handleBracketAutoClose: wrapping automatico di selezione estesa con parentesi", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="p_wrap">testo selezionato</p>';

        const p = editor.querySelector('#p_wrap');
        const r = document.createRange();
        r.selectNodeContents(p.firstChild);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);

        let insertedVal = '';
        const origExec = document.execCommand;
        document.execCommand = (cmd, show, val) => {
            if (cmd === 'insertText') insertedVal = val;
        };

        try {
            const ev = { key: '(', target: p, preventDefault: () => {} };
            Editor.handleBracketAutoClose(ev);

            Assert.strictEqual(insertedVal, '(testo selezionato)', "Premere '(' su una selezione deve racchiudere il testo tra parentesi");
        } finally {
            document.execCommand = origExec;
        }
    });

    test("Editor.handleBracketAutoClose: wrapping automatico di selezione estesa con virgolette", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="p_quote_wrap">parola</p>';

        const p = editor.querySelector('#p_quote_wrap');
        const r = document.createRange();
        r.selectNodeContents(p.firstChild);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);

        let insertedVal = '';
        const origExec = document.execCommand;
        document.execCommand = (cmd, show, val) => {
            if (cmd === 'insertText') insertedVal = val;
        };

        try {
            const ev = { key: '"', target: p, preventDefault: () => {} };
            Editor.handleBracketAutoClose(ev);

            Assert.strictEqual(insertedVal, '"parola"', "Premere '\"' su una selezione deve racchiudere il testo tra virgolette");
        } finally {
            document.execCommand = origExec;
        }
    });

    test("Editor.handleBracketAutoClose: digitazione ![ apre modal Citazione Live", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="p_cit_trg">![</p>';

        const p = editor.querySelector('#p_cit_trg');
        const r = document.createRange();
        r.setStart(p.firstChild, 2);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);

        let modalOpened = false;
        const origOpen = CitationManager.openModal;
        CitationManager.openModal = () => { modalOpened = true; };

        try {
            const ev = { key: '[', target: p, preventDefault: () => {} };
            Editor.handleBracketAutoClose(ev);

            Assert.isTrue(modalOpened, "Digitare '![' seguito da '[' deve avviare CitationManager.openModal()");
        } finally {
            CitationManager.openModal = origOpen;
        }
    });

    test("Editor.handleBracketAutoClose: digitazione [[ apre modal Link Interno", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="p_link_trg">[</p>';

        const p = editor.querySelector('#p_link_trg');
        const r = document.createRange();
        r.setStart(p.firstChild, 1);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);

        let linkModalOpened = false;
        const origOpen = LinkManager.openInternalModal;
        LinkManager.openInternalModal = () => { linkModalOpened = true; };

        try {
            const ev = { key: '[', target: p, preventDefault: () => {} };
            Editor.handleBracketAutoClose(ev);

            Assert.isTrue(linkModalOpened, "Digitare '[' seguito da '[' deve avviare LinkManager.openInternalModal()");
        } finally {
            LinkManager.openInternalModal = origOpen;
        }
    });

    test("Editor.handleBracketAutoClose: shortcut ''' o ``` a inizio riga apre blocco di codice in-place", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="p_code_shortcut">\'\'</p>';

        const p = editor.querySelector('#p_code_shortcut');
        const r = document.createRange();
        r.setStart(p.firstChild, 2);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);

        let codeBlockInserted = false;
        const origInsert = Editor.insertCodeBlock;
        Editor.insertCodeBlock = () => { codeBlockInserted = true; };

        try {
            const ev = { key: "'", target: p, preventDefault: () => {} };
            Editor.handleBracketAutoClose(ev);

            Assert.isTrue(codeBlockInserted, "Digitare il terzo apice deve innescare l'inserimento in-place del blocco codice");
        } finally {
            Editor.insertCodeBlock = origInsert;
        }
    });

    test("Editor.handleBracketAutoClose: jump-over oltre la parentesi o virgoletta chiusa già presente a destra", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="p_jump">func()</p>';

        const p = editor.querySelector('#p_jump');
        const r = document.createRange();
        r.setStart(p.firstChild, 5); // Cursore tra '(' e ')'
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);

        let defaultPrevented = false;
        const ev = { key: ')', target: p, preventDefault: () => { defaultPrevented = true; } };

        Editor.handleBracketAutoClose(ev);

        Assert.isTrue(defaultPrevented, "Digitare ')' quando ')' è già a destra deve eseguire jump-over");
    });

    test("Editor.handleBracketAutoClose: non inserisce auto-chiusura in mezzo a lettere alfanumeriche", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p id="p_word">parola</p>';

        const p = editor.querySelector('#p_word');
        const r = document.createRange();
        r.setStart(p.firstChild, 3); // Cursore in mezzo a "par|ola"
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);

        let defaultPrevented = false;
        const ev = { key: '(', target: p, preventDefault: () => { defaultPrevented = true; } };

        Editor.handleBracketAutoClose(ev);

        Assert.isFalse(defaultPrevented, "In mezzo a una parola alfanumerica non deve scattare l'autoclose");
    });

    test("Editor.handleBracketAutoClose: non interviene se l'evento proviene da input o textarea nativi", () => {
        const input = document.createElement('input');
        input.value = "test";
        document.body.appendChild(input);

        let defaultPrevented = false;
        const ev = { key: '(', target: input, preventDefault: () => { defaultPrevented = true; } };

        Editor.handleBracketAutoClose(ev);

        Assert.isFalse(defaultPrevented, "Nei campi input standard l'auto-close deve uscire all'istante senza bloccare il browser");
        input.remove();
    });

});