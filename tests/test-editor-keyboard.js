/**
 * tests/test-editor-keyboard.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-keyboard
 * Conteggio test case: 9
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("Editor Keyboard: Smart Home, Auto-Close & Scorciatoie Markdown (9 Test)", () => {

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

    test("Editor: getSelectedBlocks estrae blocchi intersecati da un range", () => {
            let editor = document.getElementById('noteContent');
            if (!editor) {
                editor = document.createElement('div');
                editor.id = 'noteContent';
                document.body.appendChild(editor);
            }
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
            // Usa non-breaking space \u00A0 come fa il browser in contenteditable prima del rimpiazzo
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

});
