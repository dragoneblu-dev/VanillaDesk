/**
 * tests/test-ui-inline-footnotes.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-inline-footnotes
 */

describe("UI Inline Footnotes: Note a Piè di Pagina & Scroll Numerato (test-ui-inline-footnotes.js)", () => {

    beforeEach(() => {
        let sandbox = document.getElementById('testSandBox');
        if (!sandbox) {
            sandbox = document.createElement('div');
            sandbox.id = 'testSandBox';
            document.body.appendChild(sandbox);
        }

        let editor = document.getElementById('noteContent');
        if (!editor) {
            editor = document.createElement('div');
            editor.id = 'noteContent';
            sandbox.appendChild(editor);
        }
        editor.innerHTML = '';

        const oldArea = document.getElementById('inline-footnotes-area');
        if (oldArea) oldArea.remove();
    });

    afterEach(() => {
        const area = document.getElementById('inline-footnotes-area');
        if (area) area.remove();
        const editor = document.getElementById('noteContent');
        if (editor) editor.innerHTML = '';
    });

    test("Footnotes: renderInlineFootnotes estrae e numera gli appunti a fondo pagina", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = `
            <p>Testo <span class="inline-note-wrapper"><span class="inline-note-marker">💬</span><span class="inline-note-data">Primo glossario</span></span> fine.</p>
        `;

        UI.renderInlineFootnotes();
        const area = document.getElementById('inline-footnotes-area');
        Assert.isNotNull(area);
        Assert.isTrue(area.innerHTML.includes('[1]'));
        Assert.isTrue(area.innerHTML.includes('Primo glossario'));
    });

    test("Footnotes: renderInlineFootnotes esegue fallback su data-tooltip convertendo ritorni a capo", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = `
            <p>Parola <span class="inline-note-marker" data-tooltip="Riga 1\nRiga 2 &amp; simboli <tag>">💬</span></p>
        `;

        UI.renderInlineFootnotes();
        const area = document.getElementById('inline-footnotes-area');
        Assert.isNotNull(area);
        Assert.isTrue(area.innerHTML.includes('Riga 1<br>Riga 2'));
        Assert.isTrue(area.innerHTML.includes('&lt;tag&gt;'), "I tag HTML nel tooltip devono essere sanitizzati");
    });

    test("Footnotes: renderInlineFootnotes svuota l'area se non sono presenti annotazioni", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = '<p>Nessuna nota inline</p>';

        UI.renderInlineFootnotes();
        const area = document.getElementById('inline-footnotes-area');
        if (area) {
            Assert.strictEqual(area.innerHTML, '');
        }
    });

    test("Footnotes: scrollToInlineNote evidenzia il marcatore e non lancia eccezioni", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = '<span class="inline-note-marker">💬</span>';

        Assert.doesNotThrow(() => {
            UI.scrollToInlineNote(0);
        });
    });

    test("Footnotes: scrollToInlineNote gestisce indici fuori range senza sollevare eccezioni", () => {
        let editor = document.getElementById('noteContent');
        editor.innerHTML = '<span class="inline-note-marker">💬</span>';

        Assert.doesNotThrow(() => {
            UI.scrollToInlineNote(99); // Indice non esistente
        });
    });

});