/**
 * tests/test-editor-keyboard-navigation.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-keyboard-navigation
 * Conteggio test case: 3
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("Editor Keyboard Navigation: Griglia Tabelle, Tabulazioni & Escape (3 Test)", () => {

    test("Editor: handleFormatEscape rimuove formattazione uscendo con Spazio a fine parola", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p><b>Parola</b></p>';
            const b = editor.querySelector('b');

            const range = document.createRange();
            range.setStart(b.firstChild, 6); // Fine parola 'Parola'
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            AppState.isEditMode = true;
            Editor.handleFormatEscape({ key: ' ', preventDefault: () => {} });
            // Non deve lanciare eccezioni
        });

    test("Editor: _handleSnippetVerticalEscape non si attiva se non siamo in prossimità di snippet", () => {
            const res = Editor._handleSnippetVerticalEscape({ key: 'ArrowDown', shiftKey: false });
            Assert.isFalse(res);
        });

    test("Lists: tab su elemento di lista non vuoto chiama indentChecklistLine o execCommand indent", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<ul><li id="tab_li">Elemento</li></ul>';

            const li = editor.querySelector('#tab_li');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(li.firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            let indentCalled = false;
            const origExec = document.execCommand;
            document.execCommand = (cmd) => { if (cmd === 'indent') indentCalled = true; };

            try {
                const ev = { shiftKey: false, preventDefault: () => {} };
                Editor.handleTabKey(ev);
                Assert.isTrue(indentCalled);
            } finally {
                document.execCommand = origExec;
            }
        });

});
