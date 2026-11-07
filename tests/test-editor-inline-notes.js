/**
 * tests/test-editor-inline-notes.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-inline-notes
 * Conteggio test case: 8
 */

describe("Editor Inline Notes: Appunti Nascosti & Protezione Dom (test-editor-inline-notes.js)", () => {

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

    // =========================================================================
    // NUOVI TEST CASE (Funzionalità prima non coperte)
    // =========================================================================

    test("Inline Notes: insertInlineNote racchiude il wrapper tra cuscinetti ZWS per la navigazione del cursore", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p>Testo di prova</p>';

        const p = editor.querySelector('p');
        const r = document.createRange();
        r.setStart(p.firstChild, 5);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);

        Editor.insertInlineNote();

        const wrapper = editor.querySelector('.inline-note-wrapper');
        Assert.isNotNull(wrapper);
        Assert.strictEqual(wrapper.getAttribute('contenteditable'), 'false');
        Assert.isTrue(wrapper.previousSibling && wrapper.previousSibling.nodeValue.endsWith('\u200B'), "Deve inserire ZWS prima del wrapper");
        Assert.isTrue(wrapper.nextSibling && wrapper.nextSibling.nodeValue.startsWith('\u200B'), "Deve inserire ZWS dopo il wrapper");
    });

    test("Inline Notes: handleInlineNoteClick apre il Drawer e migra il vecchio data-tooltip in inline-note-data", () => {
        const wrapper = document.createElement('span');
        wrapper.className = 'inline-note-wrapper';
        const marker = document.createElement('span');
        marker.className = 'inline-note-marker';
        marker.setAttribute('data-tooltip', 'Annotazione Legacy');
        wrapper.appendChild(marker);
        document.getElementById('noteContent').appendChild(wrapper);

        AppState.isEditMode = true;
        Editor.handleInlineNoteClick(marker);

        const drawer = document.getElementById('advGlobalDrawer');
        Assert.isTrue(drawer && drawer.classList.contains('open'), "Il drawer delle note inline deve aprirsi");

        const dataSpan = wrapper.querySelector('.inline-note-data');
        Assert.isNotNull(dataSpan, "Deve creare inline-note-data migrando da data-tooltip");
        Assert.strictEqual(dataSpan.innerHTML, 'Annotazione Legacy');
        Assert.isFalse(marker.hasAttribute('data-tooltip'), "Il vecchio attributo data-tooltip deve essere rimosso");

        UI.closeDrawer();
        const drawerBody = document.getElementById('advDrawerBody');
        if (drawerBody) drawerBody.innerHTML = '';
        wrapper.remove();
    });

    test("Inline Notes: saveInlineNote riposiziona il cursore subito dopo il widget", () => {
        const drawerBody = document.getElementById('advDrawerBody');
        if (drawerBody) drawerBody.innerHTML = '';

        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p>Inizio <span class="inline-note-wrapper" id="in_wrap_test"><span class="inline-note-marker">💬</span><span class="inline-note-data"></span></span> fine</p>';
        const marker = editor.querySelector('.inline-note-marker');

        const input = document.createElement('div');
        input.id = 'inlineNoteInput';
        input.innerHTML = 'Test appunto salvato';
        document.body.appendChild(input);

        try {
            Editor.currentInlineNote = marker;
            Editor.saveInlineNote();

            const sel = window.getSelection();
            Assert.isTrue(sel.rangeCount > 0);
            const curRange = sel.getRangeAt(0);

            // Il cursore deve trovarsi sul nodo di testo successivo
            const wrapper = editor.querySelector('#in_wrap_test');
            Assert.strictEqual(curRange.startContainer, wrapper.nextSibling);
            Assert.strictEqual(curRange.startOffset, 1, "Il cursore deve trovarsi subito dopo il cuscinetto ZWS ad offset 1");
        } finally {
            input.remove();
            if (drawerBody) drawerBody.innerHTML = '';
        }
    });

    test("Inline Notes: saveInlineNote con input vuoto azzera il contenuto di inline-note-data senza errori", () => {
        const drawerBody = document.getElementById('advDrawerBody');
        if (drawerBody) drawerBody.innerHTML = '';

        const marker = document.createElement('span');
        marker.className = 'inline-note-marker';
        const wrapper = document.createElement('span');
        wrapper.className = 'inline-note-wrapper';
        const dataSpan = document.createElement('span');
        dataSpan.className = 'inline-note-data';
        dataSpan.innerHTML = 'Vecchio testo';
        wrapper.appendChild(marker);
        wrapper.appendChild(dataSpan);
        document.body.appendChild(wrapper);

        const input = document.createElement('div');
        input.id = 'inlineNoteInput';
        input.innerHTML = ''; // Input completamente svuotato
        document.body.appendChild(input);

        try {
            Editor.currentInlineNote = marker;
            Editor.saveInlineNote();

            Assert.strictEqual(dataSpan.innerHTML, '', "Deve svuotare inline-note-data se l'utente ha cancellato l'appunto");
        } finally {
            input.remove();
            wrapper.remove();
            if (drawerBody) drawerBody.innerHTML = '';
        }
    });

    test("Inline Notes: renderInlineFootnotes compila e numera correttamente gli appunti", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = `
            <p>Parola 1 <span class="inline-note-wrapper"><span class="inline-note-marker">💬</span><span class="inline-note-data">Nota prima</span></span></p>
            <p>Parola 2 <span class="inline-note-wrapper"><span class="inline-note-marker">💬</span><span class="inline-note-data">Nota seconda</span></span></p>
        `;

        UI.renderInlineFootnotes();

        const area = document.getElementById('inline-footnotes-area');
        Assert.isNotNull(area);
        Assert.isTrue(area.innerHTML.includes('[1]'));
        Assert.isTrue(area.innerHTML.includes('Nota prima'));
        Assert.isTrue(area.innerHTML.includes('[2]'));
        Assert.isTrue(area.innerHTML.includes('Nota seconda'));
    });

    test("Inline Notes: renderInlineFootnotes svuota l'area se non sono presenti annotazioni nella pagina", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p>Testo pulito senza annotazioni</p>';

        UI.renderInlineFootnotes();

        const area = document.getElementById('inline-footnotes-area');
        Assert.isNotNull(area);
        Assert.strictEqual(area.innerHTML, '', "L'area delle note a piè di pagina deve risultare completamente vuota");
    });

});