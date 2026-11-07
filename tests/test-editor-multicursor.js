/**
 * tests/test-editor-multicursor.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-multicursor
 */

describe("Editor Multicursor: Ricerca Concorrente Ctrl+D & Sincronizzazione (test-editor-multicursor.js)", () => {

    beforeEach(() => {
        let editor = document.getElementById('noteContent');
        if (!editor) {
            editor = document.createElement('div');
            editor.id = 'noteContent';
            document.body.appendChild(editor);
        } else {
            editor.innerHTML = '';
        }
        Editor.multiSelectActive = false;
        Editor.multiSelectTerm = '';
    });

    afterEach(() => {
        Editor.clearMultiCursor();
        let editor = document.getElementById('noteContent');
        if (editor) editor.innerHTML = '';
        AppState.isEditMode = false;
    });

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

    test("Editor.triggerMultiCursor: avvisa e non si attiva se invocato dentro un widget protetto", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = `
            <div class="adv-widget-shell widget-type-database" id="db_test_shell">
                <span id="txt_protected">Testo Protetto</span>
            </div>
        `;

        const targetSpan = editor.querySelector('#txt_protected');
        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        r.selectNodeContents(targetSpan);
        sel.addRange(r);

        let toastShown = false;
        const origToast = UI.showToast;
        UI.showToast = (msg, type) => {
            toastShown = true;
            Assert.strictEqual(type, "warning");
        };

        AppState.isEditMode = true;

        try {
            Editor.triggerMultiCursor();
            Assert.isFalse(Editor.multiSelectActive, "Non deve attivare il multi-cursore nei widget protetti");
            Assert.isTrue(toastShown);
        } finally {
            UI.showToast = origToast;
        }
    });

    test("Editor.triggerMultiCursor: supporta e consente l'uso dei cursori multipli dentro i blocchi codice", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = `
            <div class="code-wrapper widget-type-code" id="adv_code_multi">
                <pre class="code-content">const item = 1; let item = 2;</pre>
            </div>
        `;

        const pre = editor.querySelector('pre');
        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        r.setStart(pre.firstChild, 6);
        r.setEnd(pre.firstChild, 10); // Seleziona primo 'item'
        sel.addRange(r);

        AppState.isEditMode = true;
        Editor.triggerMultiCursor();

        Assert.isTrue(Editor.multiSelectActive, "Nel codice il multi-cursore deve essere ammesso");
        Assert.strictEqual(Editor.multiSelectTerm, 'item');
        Editor.clearMultiCursor();
    });

    test("Editor.triggerMultiCursor: mostra avviso se non vi sono ulteriori occorrenze identiche nel testo", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = '<p>valoreUnicoNelDocumento</p>';

        const p = editor.querySelector('p');
        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        r.selectNodeContents(p.firstChild);
        sel.addRange(r);

        AppState.isEditMode = true;
        Editor.triggerMultiCursor(); // Master attivato

        let noMoreToastShown = false;
        const origToast = UI.showToast;
        UI.showToast = () => { noMoreToastShown = true; };

        try {
            Editor.triggerMultiCursor(); // Invocazione successiva su termine singolo
            Assert.isTrue(noMoreToastShown, "Deve mostrare avviso se non esistono altre occorrenze");
        } finally {
            UI.showToast = origToast;
            Editor.clearMultiCursor();
        }
    });

});