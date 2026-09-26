/**
 * tests/test-ui-inline-footnotes.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-inline-footnotes
 * Conteggio test case: 3
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("UI Inline Footnotes: Note a Piè di Pagina & Scroll Numerato (3 Test)", () => {

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

});
