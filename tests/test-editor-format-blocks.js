/**
 * tests/test-editor-format-blocks.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-format-blocks
 * Conteggio test case: 5
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("Editor Format Blocks: Code Blocks, Divisori, Snippet & Spostamenti (5 Test)", () => {

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

});
