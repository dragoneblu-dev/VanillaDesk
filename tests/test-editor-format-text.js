/**
 * tests/test-editor-format-text.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-format-text
 * Conteggio test case: 18
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("Editor Format Text: Toggle Header, Blockquote, Gomma & Typography (18 Test)", () => {

    test("Editor.toggleBlockquote: unwrap di blockquote esistente ripristina paragrafi standard", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<blockquote><p id="p_in_quote">Testo citato</p></blockquote>';

            const p = editor.querySelector('#p_in_quote');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(p.firstChild, 2);
            r.collapse(true);
            sel.addRange(r);

            Editor.toggleBlockquote();

            Assert.isNull(editor.querySelector('blockquote'));
            Assert.isNotNull(editor.querySelector('p'));
            Assert.strictEqual(editor.querySelector('p').textContent, 'Testo citato');
        });

    test("Editor.toggleBlockquote: appiattisce citazioni nidificate residue prima dell'unwrap", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<blockquote><blockquote><p id="nested_p">Nidificato</p></blockquote></blockquote>';

            const p = editor.querySelector('#nested_p');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(p.firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            Editor.toggleBlockquote();
            Assert.isNull(editor.querySelector('blockquote'));
        });

    test("Editor.toggleBlockquote: wrap di paragrafo singolo racchiude in <blockquote>", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p id="p_to_quote">Paragrafo da citare</p>';

            const p = editor.querySelector('#p_to_quote');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(p.firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            Editor.toggleBlockquote();

            const bq = editor.querySelector('blockquote');
            Assert.isNotNull(bq);
            Assert.isTrue(bq.textContent.includes('Paragrafo da citare'));
        });

    test("Editor.toggleBlockquote: wrap di blocchi multipli selezionati", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p id="bq1">Uno</p><p id="bq2">Due</p>';

            const p1 = editor.querySelector('#bq1');
            const p2 = editor.querySelector('#bq2');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(p1.firstChild, 0);
            r.setEnd(p2.firstChild, p2.textContent.length);
            sel.addRange(r);

            Editor.toggleBlockquote();

            const bq = editor.querySelector('blockquote');
            Assert.isNotNull(bq);
            Assert.strictEqual(bq.querySelectorAll('p').length, 2);
        });

    test("Editor.toggleBlockquote: non agisce su elementi di lista <li>", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<ul><li id="li_quote">Elemento</li></ul>';

            const li = editor.querySelector('#li_quote');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(li.firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            Editor.toggleBlockquote();
            Assert.isNull(editor.querySelector('blockquote'), "Non deve creare blockquote dentro o intorno a li");
        });

    test("Editor.toggleHeader: converte paragrafo p in h2 (H1 logico)", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p id="p_head">Intestazione</p>';

            const p = editor.querySelector('#p_head');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(p.firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            Editor.toggleHeader('h2');
            // Deve aver invocato execCommand o sostituito il blocco
            Assert.isTrue(editor.innerHTML.includes('<h2') || editor.innerHTML.includes('<h2>'));
        });

    test("Editor.toggleHeader: converte h2 esistente in p normale se cliccato di nuovo", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<h2 id="h2_toggle">Titolo</h2>';

            const h2 = editor.querySelector('#h2_toggle');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(h2.firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            Editor.toggleHeader('h2');
            Assert.isTrue(editor.innerHTML.includes('<p') || editor.innerHTML.includes('<p>'));
        });

    test("Editor.toggleHeader: non agisce all'interno di elementi di lista <li>", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<ul><li id="li_h">Item</li></ul>';

            const li = editor.querySelector('#li_h');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(li.firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            Editor.toggleHeader('h2');
            Assert.isNull(editor.querySelector('h2'));
        });

    test("Editor.clearFormatting (Gomma): preserva classi colore hl-c* e tx-c*", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p><span class="hl-c5 tx-c10">Testo Colorato</span></p>';

            const span = editor.querySelector('span');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNodeContents(span);
            sel.addRange(r);

            Editor.clearFormatting();
            const cleanedSpan = editor.querySelector('span');
            Assert.isNotNull(cleanedSpan);
            Assert.isTrue(cleanedSpan.classList.contains('hl-c5'));
            Assert.isTrue(cleanedSpan.classList.contains('tx-c10'));
        });

    test("Editor.clearFormatting: rimuove stili inline estranei (es. font-size arbitrario)", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p><span style="font-size: 72px; line-height: 100px;">Testo Enorme</span></p>';

            const span = editor.querySelector('span');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNodeContents(span);
            sel.addRange(r);

            Editor.clearFormatting();
            Assert.isNull(editor.querySelector('span[style*="font-size"]'));
        });

    test("Editor.clearFormatting: preserva integrità link interni (.internal-link)", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p><a class="internal-link" data-note-id="n123">Nota Interna</a></p>';

            const a = editor.querySelector('a');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNodeContents(a);
            sel.addRange(r);

            Editor.clearFormatting();
            const preservedA = editor.querySelector('a.internal-link');
            Assert.isNotNull(preservedA);
            Assert.strictEqual(preservedA.getAttribute('data-note-id'), 'n123');
        });

    test("Editor.clearFormatting: preserva integrità segnalibri (.adv-bookmark-marker)", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p>Testo <span class="adv-bookmark-marker" data-date="2026"><span class="bookmark-icon">B</span></span> coda</p>';

            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNodeContents(editor);
            sel.addRange(r);

            Editor.clearFormatting();
            Assert.isNotNull(editor.querySelector('.adv-bookmark-marker'));
        });

    test("Editor.clearFormatting: srotola contenitori alieni <article> e <section> in testo", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<article><section><p>Testo Intatto</p></section></article>';

            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNodeContents(editor);
            sel.addRange(r);

            Editor.clearFormatting();
            Assert.isNull(editor.querySelector('article'));
            Assert.isNull(editor.querySelector('section'));
            Assert.isTrue(editor.innerHTML.includes('Testo Intatto'));
        });

    test("Editor.clearFormatting: preserva attributo start negli elenchi numerati <ol>", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<ol start="15"><li>Punto Quindici</li></ol>';

            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNodeContents(editor.querySelector('li'));
            sel.addRange(r);

            Editor.clearFormatting();
            const ol = editor.querySelector('ol');
            Assert.isNotNull(ol);
            Assert.strictEqual(ol.getAttribute('start'), '15');
        });

    test("Editor.clearFormatting: converte tag <font> vuoti o privi di attributi eliminandoli", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p><font color="blue">Testo</font></p>';

            const font = editor.querySelector('font');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNodeContents(font);
            sel.addRange(r);

            Editor.clearFormatting();
            Assert.isNull(editor.querySelector('font'));
        });

    test("Editor.applyTextFormat: applica font custom 'ff-serif'", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p id="p_font">Testo con font</p>';

            const p = editor.querySelector('#p_font');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNodeContents(p);
            sel.addRange(r);
            Editor.savedRange = r;

            Editor.applyTextFormat('ff', 'ff-serif');
            // Deve aver applicato la classe ff-serif
            Assert.isTrue(editor.innerHTML.includes('ff-serif'));
        });

    test("Editor.applyTextFormat: applica dimensione 'fs-small'", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p id="p_size">Testo piccolo</p>';

            const p = editor.querySelector('#p_size');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNodeContents(p);
            sel.addRange(r);
            Editor.savedRange = r;

            Editor.applyTextFormat('fs', 'fs-small');
            Assert.isTrue(editor.innerHTML.includes('fs-small'));
        });

    test("Editor.applyTextFormat: reset a dimensione standard rimuove classi fs-*", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p><span class="fs-large" id="span_sz">Testo</span></p>';

            const span = editor.querySelector('#span_sz');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNodeContents(span);
            sel.addRange(r);
            Editor.savedRange = r;

            Editor.applyTextFormat('fs', 'fs-standard');
            Assert.isFalse(editor.innerHTML.includes('fs-large'));
        });

});
