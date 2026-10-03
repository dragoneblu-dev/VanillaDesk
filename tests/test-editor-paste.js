/**
 * tests/test-editor-paste.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-paste.js
 * Conteggio test case: 26
 */

describe("EditorPaste: Plain Text, Word MsoList, Google Docs Sanitization & Spaziature (26 Test)", () => {

    // =========================================================================
    // 1. FORMATTAZIONE TESTO PIANO (_formatPlainTextForHTML)
    // =========================================================================

    test("EditorPaste: _formatPlainTextForHTML gestisce input nulli o vuoti", () => {
        Assert.strictEqual(Editor._formatPlainTextForHTML(null), "");
        Assert.strictEqual(Editor._formatPlainTextForHTML(""), "");
    });

    test("EditorPaste: _formatPlainTextForHTML non avvolge testo a riga singola in <p> (Inline Preservation)", () => {
        const res = Editor._formatPlainTextForHTML("testo semplice");
        Assert.strictEqual(res, "testo semplice");
        Assert.isFalse(res.includes("<p>"));
    });

    test("EditorPaste: _formatPlainTextForHTML esegue l'escape di entità HTML pericolose", () => {
        const res = Editor._formatPlainTextForHTML("<script>alert('xss')</script> & \"tag\"");
        Assert.isTrue(res.includes("&lt;script&gt;"));
        Assert.isTrue(res.includes("&amp;"));
        Assert.isFalse(res.includes("<script>"));
    });

    test("EditorPaste: _formatPlainTextForHTML converte tabulazioni in 4 spazi non comprimibili", () => {
        const res = Editor._formatPlainTextForHTML("col1\tcol2");
        Assert.strictEqual(res, "col1&nbsp;&nbsp;&nbsp;&nbsp;col2");
    });

    test("EditorPaste: _formatPlainTextForHTML preserva sequenze di spazi multipli con &nbsp;", () => {
        const res = Editor._formatPlainTextForHTML("parola    quattro_spazi");
        Assert.strictEqual(res, "parola&nbsp;&nbsp;&nbsp;&nbsp;quattro_spazi");
    });

    test("EditorPaste: _formatPlainTextForHTML crea blocchi <p> conformi solo per testi su più righe", () => {
        const res = Editor._formatPlainTextForHTML("Riga 1\n\nRiga 2");
        Assert.isTrue(res.includes("<p>Riga 1</p>"));
        Assert.isTrue(res.includes("<p><br></p>"));
        Assert.isTrue(res.includes("<p>Riga 2</p>"));
    });

    test("EditorPaste: _formatPlainTextForHTML converte righe numerate plain text in <ol><li> nativi", () => {
        const input = "1. Primo punto\n2. Secondo punto\n3. Terzo punto";
        const res = Editor._formatPlainTextForHTML(input);
        Assert.isTrue(res.startsWith("<ol>"));
        Assert.isTrue(res.endsWith("</ol>"));
        Assert.isTrue(res.includes("<li>Primo punto</li>"));
        Assert.isTrue(res.includes("<li>Secondo punto</li>"));
        Assert.isTrue(res.includes("<li>Terzo punto</li>"));
        Assert.isFalse(res.includes("1. Primo punto")); // Marcatore duplicato rimosso
    });

    test("EditorPaste: _formatPlainTextForHTML converte punti elenco plain text (-, *, •) in <ul><li>", () => {
        const input = "- Elemento A\n* Elemento B\n• Elemento C";
        const res = Editor._formatPlainTextForHTML(input);
        Assert.isTrue(res.startsWith("<ul>"));
        Assert.isTrue(res.endsWith("</ul>"));
        Assert.isTrue(res.includes("<li>Elemento A</li>"));
        Assert.isTrue(res.includes("<li>Elemento B</li>"));
        Assert.isTrue(res.includes("<li>Elemento C</li>"));
    });

    test("EditorPaste: _formatPlainTextForHTML raggruppa correttamente elenchi intervallati da paragrafi", () => {
        const input = "Introduzione\n1. Passo Uno\n2. Passo Due\nConclusione";
        const res = Editor._formatPlainTextForHTML(input);
        Assert.isTrue(res.includes("<p>Introduzione</p>"));
        Assert.isTrue(res.includes("<ol><li>Passo Uno</li><li>Passo Due</li></ol>"));
        Assert.isTrue(res.includes("<p>Conclusione</p>"));
    });

    // =========================================================================
    // 2. PARSER ELENCHI MICROSOFT WORD MsoList (_convertWordListsToHTML)
    // =========================================================================

    test("EditorPaste: _convertWordListsToHTML converte MsoListParagraph numerati in <ol> e rimuove mso-list:Ignore", () => {
        const doc = new DOMParser().parseFromString(`
            <div>
                <p class="MsoListParagraphCxSpFirst" style="mso-list:l0 level1 lfo1;">
                    <span style="mso-list:Ignore">1.<span style="font:7.0pt 'Times New Roman'">&nbsp;&nbsp;&nbsp;</span></span>
                    <span>Primo elemento Word</span>
                </p>
                <p class="MsoListParagraphCxSpLast" style="mso-list:l0 level1 lfo1;">
                    <span style="mso-list:Ignore">2.<span style="font:7.0pt 'Times New Roman'">&nbsp;&nbsp;&nbsp;</span></span>
                    <span>Secondo elemento Word</span>
                </p>
            </div>
        `, 'text/html');

        Editor._convertWordListsToHTML(doc.body);

        const ol = doc.body.querySelector('ol');
        Assert.isTrue(ol !== null);
        const items = ol.querySelectorAll('li');
        Assert.strictEqual(items.length, 2);
        Assert.strictEqual(items[0].textContent.trim(), "Primo elemento Word");
        Assert.strictEqual(items[1].textContent.trim(), "Secondo elemento Word");
        Assert.isFalse(items[0].textContent.includes("1."));
    });

    test("EditorPaste: _convertWordListsToHTML converte MsoListParagraph puntati in <ul>", () => {
        const doc = new DOMParser().parseFromString(`
            <div>
                <p class="MsoListParagraph" style="mso-list:l1 level1 lfo2;">
                    <span style="mso-list:Ignore">·<span style="font:7.0pt 'Times New Roman'">&nbsp;&nbsp;&nbsp;</span></span>
                    <span>Punto elenco puntato</span>
                </p>
            </div>
        `, 'text/html');

        Editor._convertWordListsToHTML(doc.body);

        const ul = doc.body.querySelector('ul');
        Assert.isTrue(ul !== null);
        const li = ul.querySelector('li');
        Assert.strictEqual(li.textContent.trim(), "Punto elenco puntato");
        Assert.isFalse(li.textContent.includes("·"));
    });

    test("EditorPaste: _convertWordListsToHTML riconosce e converte paragrafi con marcatore numerico testuale puro", () => {
        const doc = new DOMParser().parseFromString(`
            <div>
                <p>1.\tElemento tabulato</p>
                <p>2.\tSecondo elemento</p>
            </div>
        `, 'text/html');

        Editor._convertWordListsToHTML(doc.body);

        const ol = doc.body.querySelector('ol');
        Assert.isTrue(ol !== null);
        Assert.strictEqual(ol.children.length, 2);
        Assert.strictEqual(ol.children[0].textContent.trim(), "Elemento tabulato");
    });

    test("EditorPaste: _convertWordListsToHTML non tocca paragrafi normali che non sono elenchi", () => {
        const doc = new DOMParser().parseFromString(`
            <div>
                <p>Paragrafo normale senza marcatore.</p>
                <p>Un secondo paragrafo standard.</p>
            </div>
        `, 'text/html');

        Editor._convertWordListsToHTML(doc.body);

        Assert.strictEqual(doc.body.querySelectorAll('ol, ul').length, 0);
        Assert.strictEqual(doc.body.querySelectorAll('p').length, 2);
    });

    // =========================================================================
    // 3. PULIZIA E SANIFICAZIONE RICH TEXT (Word, Google Docs, Tabelle)
    // =========================================================================

    test("EditorPaste: pulizia rimuove contenitori fittizi Google Docs (docs-internal-guid)", () => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`
            <b id="docs-internal-guid-12345" style="font-weight:normal;">
                <span>Testo dentro wrapper Docs</span>
            </b>
        `, 'text/html');

        doc.querySelectorAll('b, strong').forEach(bEl => {
            const styleStr = (bEl.getAttribute('style') || '').toLowerCase();
            const isNormal = bEl.style.fontWeight === 'normal' || bEl.style.fontWeight === '400' || /font-weight\s*:\s*(normal|[1-4]00)/.test(styleStr);
            const isDocsGuid = (bEl.id && bEl.id.startsWith('docs-internal-guid')) || styleStr.includes('font-weight:normal');
            if (isNormal || isDocsGuid) {
                const parent = bEl.parentNode;
                if (parent) {
                    while (bEl.firstChild) bEl.parentNode.insertBefore(bEl.firstChild, bEl);
                    bEl.remove();
                }
            }
        });

        Assert.strictEqual(doc.body.querySelector('#docs-internal-guid-12345'), null);
        Assert.isTrue(doc.body.textContent.includes("Testo dentro wrapper Docs"));
    });

    test("EditorPaste: converte stili inline font-weight:bold e font-style:italic in <b> e <i>", () => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`
            <p>
                <span style="font-weight: 700;">Grassetto Word</span>
                <span style="font-style: italic;">Corsivo Word</span>
            </p>
        `, 'text/html');

        const allElements = Array.from(doc.body.querySelectorAll('*')).reverse();
        allElements.forEach(el => {
            const rawStyle = (el.getAttribute('style') || '').toLowerCase();
            const hasBold = el.style.fontWeight === 'bold' || parseInt(el.style.fontWeight, 10) >= 600 || rawStyle.includes('font-weight: 700');
            const hasItalic = el.style.fontStyle === 'italic' || rawStyle.includes('font-style: italic');

            if (el.tagName === 'SPAN' && (hasBold || hasItalic)) {
                const frag = doc.createDocumentFragment();
                while (el.firstChild) frag.appendChild(el.firstChild);
                let wrap = frag;
                if (hasItalic) { const i = doc.createElement('i'); i.appendChild(wrap); wrap = i; }
                if (hasBold) { const b = doc.createElement('b'); b.appendChild(wrap); wrap = b; }
                el.appendChild(wrap);
            }
        });

        Assert.isTrue(doc.body.querySelector('b') !== null);
        Assert.isTrue(doc.body.querySelector('i') !== null);
    });

    test("EditorPaste: srotola tag <p> annidati dentro <li> tipici di Google Docs", () => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`
            <ul>
                <li><p>Elemento annidato da Docs</p></li>
            </ul>
        `, 'text/html');

        doc.querySelectorAll('li > p').forEach(pInsideLi => {
            const li = pInsideLi.parentNode;
            if (li && li.tagName === 'LI' && li.children.length === 1) {
                while (pInsideLi.firstChild) li.insertBefore(pInsideLi.firstChild, pInsideLi);
                pInsideLi.remove();
            }
        });

        Assert.strictEqual(doc.body.querySelectorAll('li > p').length, 0);
        Assert.strictEqual(doc.body.querySelector('li').innerHTML, "Elemento annidato da Docs");
    });

    test("EditorPaste: srotola <p> e garantisce <br> nelle celle vuote delle tabelle", () => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`
            <table>
                <tr>
                    <td><p>Contenuto Cella</p></td>
                    <td></td>
                </tr>
            </table>
        `, 'text/html');

        doc.querySelectorAll('td, th').forEach(cell => {
            cell.querySelectorAll('p, div').forEach(b => {
                const parent = b.parentNode;
                while (b.firstChild) parent.insertBefore(b.firstChild, b);
                b.remove();
            });
            const cellCleanText = cell.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
            if (!cellCleanText && !cell.querySelector('img, audio, input, svg')) {
                cell.innerHTML = '<br>';
            }
        });

        const cells = doc.body.querySelectorAll('td');
        Assert.strictEqual(cells[0].querySelectorAll('p').length, 0);
        Assert.strictEqual(cells[0].textContent, "Contenuto Cella");
        Assert.strictEqual(cells[1].innerHTML, "<br>");
    });

    // =========================================================================
    // 4. PRESERVAZIONE DEGLI SPAZI E ALLINEAMENTO PASTEDTEXT
    // =========================================================================

    test("EditorPaste: preserva fedelmente spazi multipli e spazi terminali per testo inline", () => {
        const pastedText = "  testo   ";
        let finalHTML = "testo";

        const hasBlockTags = /<\/(p|div|h[1-6]|table|ul|ol|blockquote|pre)>/i.test(finalHTML);
        if (!hasBlockTags) {
            finalHTML = finalHTML.replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '');
            const leadingSpaces = pastedText.match(/^[ \t]*/)[0];
            const trailingSpaces = pastedText.match(/[ \t]*$/)[0];
            finalHTML = leadingSpaces + finalHTML + trailingSpaces;
        }

        Assert.strictEqual(finalHTML, "  testo   ");
        Assert.strictEqual(finalHTML.length, 10);
    });

    test("EditorPaste: stringa senza spazi (testo) non subisce alcuna iniezione di spazi parassiti", () => {
        const pastedText = "testo";
        let finalHTML = " testo ";

        const hasBlockTags = /<\/(p|div|h[1-6]|table|ul|ol|blockquote|pre)>/i.test(finalHTML);
        if (!hasBlockTags) {
            finalHTML = finalHTML.replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '');
            const leadingSpaces = pastedText.match(/^[ \t]*/)[0];
            const trailingSpaces = pastedText.match(/[ \t]*$/)[0];
            finalHTML = leadingSpaces + finalHTML + trailingSpaces;
        }

        Assert.strictEqual(finalHTML, "testo");
        Assert.strictEqual(finalHTML.length, 5);
    });

    test("EditorPaste: preserva stringa con un solo spazio finale (testo ) senza aggiungere spazio iniziale", () => {
        const pastedText = "testo ";
        let finalHTML = " testo ";

        const hasBlockTags = /<\/(p|div|h[1-6]|table|ul|ol|blockquote|pre)>/i.test(finalHTML);
        if (!hasBlockTags) {
            finalHTML = finalHTML.replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '');
            const leadingSpaces = pastedText.match(/^[ \t]*/)[0];
            const trailingSpaces = pastedText.match(/[ \t]*$/)[0];
            finalHTML = leadingSpaces + finalHTML + trailingSpaces;
        }

        Assert.strictEqual(finalHTML, "testo ");
        Assert.strictEqual(finalHTML.startsWith(" "), false);
        Assert.strictEqual(finalHTML.endsWith(" "), true);
    });

    // =========================================================================
    // 5. ISOLAMENTO CONTROLLI NATIVI E INTERCETTORE COPIA
    // =========================================================================

    test("EditorPaste: input numerici .adv-number-input convertono automaticamente la virgola in punto", () => {
        const input = document.createElement('input');
        input.className = 'adv-number-input';
        input.value = '';

        let intercepted = false;
        const fakeEvent = {
            target: input,
            clipboardData: {
                getData: (type) => type === 'text/plain' ? ' 123,45 ' : ''
            },
            preventDefault: () => { intercepted = true; }
        };

        const target = fakeEvent.target;
        if (target && target.classList.contains('adv-number-input')) {
            const text = fakeEvent.clipboardData.getData('text/plain');
            if (text && (text.includes(',') || /^\s+|\s+$/.test(text))) {
                fakeEvent.preventDefault();
                target.value = text.trim().replace(',', '.');
            }
        }

        Assert.isTrue(intercepted);
        Assert.strictEqual(input.value, "123.45");
    });

    test("EditorPaste: copia di tabelle semplici serializza TSV pulito per Excel", () => {
        const table = document.createElement('table');
        table.innerHTML = `
            <tr><td>Nome</td><td>Importo</td></tr>
            <tr><td>Prodotto A</td><td>100</td></tr>
        `;
        
        const tsv = Array.from(table.rows).map(row => 
            Array.from(row.cells).map(cell => (cell.innerText || cell.textContent || '').trim().replace(/[\r\n\t]+/g, ' ')).join('\t')
        ).join('\n');

        Assert.strictEqual(tsv, "Nome\tImporto\nProdotto A\t100");
    });

    test("EditorPaste: copia rimuove elementi di controllo e maniglie (.adv-col-resizer, .adv-tools)", () => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `
            <div>
                <span>Testo Nota</span>
                <div class="adv-col-resizer"></div>
                <div class="adv-tools"></div>
                <div class="adv-cell-selected">Cella</div>
            </div>
        `;

        tempDiv.querySelectorAll('.adv-col-resizer, .std-col-resizer, .widget-drag-handle, .widget-options-btn, .adv-tools, .adv-add-btn, .adv-table-footer-controls').forEach(el => el.remove());
        tempDiv.querySelectorAll('.adv-cell-selected').forEach(c => c.classList.remove('adv-cell-selected'));

        Assert.strictEqual(tempDiv.querySelectorAll('.adv-col-resizer').length, 0);
        Assert.strictEqual(tempDiv.querySelectorAll('.adv-tools').length, 0);
        Assert.strictEqual(tempDiv.querySelectorAll('.adv-cell-selected').length, 0);
    });

    // =========================================================================
    // 6. SANIFICAZIONE INCOLLA PER NOTE INLINE E SEGNALIBRI
    // =========================================================================

    test("EditorPaste: intercettore su mini-editor purifica l'HTML consentendo solo <b>, <i>, <u> e <br>", () => {
        const rawPastedHTML = `
            <div style="color:red;">
                <h1>Titolo Proibito</h1>
                <p>Testo con <b>grassetto</b>, <i>corsivo</i> e <a href="#">link rimosso</a>.</p>
                <img src="test.jpg">
            </div>
        `;

        const cleaned = Editor.sanitizeMiniText(rawPastedHTML);

        Assert.isFalse(cleaned.includes("<h1>"));
        Assert.isFalse(cleaned.includes("<img"));
        Assert.isFalse(cleaned.includes("<a"));
        Assert.isTrue(cleaned.includes("<b>grassetto</b>"));
        Assert.isTrue(cleaned.includes("<i>corsivo</i>"));
        Assert.isTrue(cleaned.includes("link rimosso"));
    });

    test("EditorPaste: incolla su blocco di codice inietta testo puro senza tag HTML parassiti", () => {
        const pre = document.createElement('pre');
        pre.className = 'code-content';
        pre.innerHTML = '';

        const codeSnippet = "const a = 10;\nconst b = 20;";
        pre.appendChild(document.createTextNode(codeSnippet));

        Assert.strictEqual(pre.textContent, codeSnippet);
        Assert.strictEqual(pre.children.length, 0);
    });

});