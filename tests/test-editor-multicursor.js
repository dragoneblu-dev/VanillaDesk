/**
 * tests/test-editor-multicursor.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-multicursor
 * Conteggio test case: 3
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("Editor Multicursor: Ricerca Concorrente Ctrl+D & Sincronizzazione (3 Test)", () => {

    test("Editor.triggerMultiCursor: isola la parola sotto cursore e la evidenzia come master", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p>variabile = 1; console.log(variabile);</p>';

            const p = editor.querySelector('p');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(p.firstChild, 0);
            r.setEnd(p.firstChild, 9); // Seleziona 'variabile'
            sel.addRange(r);

            AppState.isEditMode = true;
            Editor.triggerMultiCursor();

            Assert.isTrue(Editor.multiSelectActive);
            Assert.strictEqual(Editor.multiSelectTerm, 'variabile');
            const master = editor.querySelector('.adv-multi-cursor.master');
            Assert.isNotNull(master);
            Assert.strictEqual(master.textContent, 'variabile');
            Editor.clearMultiCursor();
        });

    test("Editor.triggerMultiCursor: seconda invocazione aggancia la successiva occorrenza identica", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p>test alpha test beta test</p>';

            const p = editor.querySelector('p');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(p.firstChild, 0);
            r.setEnd(p.firstChild, 4); // Primo 'test'
            sel.addRange(r);

            AppState.isEditMode = true;
            Editor.triggerMultiCursor(); // Attiva primo master
            Editor.triggerMultiCursor(); // Seleziona secondo

            const cursors = editor.querySelectorAll('.adv-multi-cursor');
            Assert.strictEqual(cursors.length, 3);
            Editor.clearMultiCursor();
        });

    test("Editor.clearMultiCursor: rimuove tutti i mark ripristinando testo normale", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p><mark class="adv-multi-cursor master">parola</mark> e <mark class="adv-multi-cursor">parola</mark></p>';
            Editor.multiSelectActive = true;

            Editor.clearMultiCursor();
            Assert.isNull(editor.querySelector('.adv-multi-cursor'));
            Assert.isFalse(Editor.multiSelectActive);
            Assert.isTrue(editor.textContent.includes('parola e parola'));
        });

});
