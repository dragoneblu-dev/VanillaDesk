/**
 * tests/test-editor-inline-notes.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-inline-notes
 * Conteggio test case: 2
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("Editor Inline Notes: Appunti Nascosti & Protezione Dom (2 Test)", () => {

    test("Editor: insertInlineNote inserisce la struttura wrapper con marker e contenitore dati", () => {
            let editor = document.getElementById('noteContent');
            if (!editor) {
                editor = document.createElement('div');
                editor.id = 'noteContent';
                document.body.appendChild(editor);
            }
            editor.innerHTML = '<p>Parola da annotare</p>';

            const p = editor.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            Editor.insertInlineNote();

            const wrapper = editor.querySelector('.inline-note-wrapper');
            Assert.isNotNull(wrapper);
            Assert.isNotNull(wrapper.querySelector('.inline-note-marker'));
            Assert.isNotNull(wrapper.querySelector('.inline-note-data'));
        });

    test("Editor: saveInlineNote converte div e p interni in br per non rompere il flusso inline", () => {
            const input = document.createElement('div');
            input.id = 'inlineNoteInput';
            input.innerHTML = '<div>Prima riga</div><p>Seconda riga</p>';
            document.body.appendChild(input);

            const wrapper = document.createElement('span');
            wrapper.className = 'inline-note-wrapper';
            const marker = document.createElement('span');
            marker.className = 'inline-note-marker';
            const dataSpan = document.createElement('span');
            dataSpan.className = 'inline-note-data';
            wrapper.appendChild(marker);
            wrapper.appendChild(dataSpan);
            document.body.appendChild(wrapper);

            Editor.currentInlineNote = marker;
            Editor.saveInlineNote();

            Assert.isFalse(dataSpan.innerHTML.includes('<div>'));
            Assert.isFalse(dataSpan.innerHTML.includes('<p>'));
            Assert.isTrue(dataSpan.innerHTML.includes('Prima riga<br>Seconda riga'));

            input.remove();
            wrapper.remove();
        });

});
