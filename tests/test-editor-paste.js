/**
 * tests/test-editor-paste.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Moduli testati: editor-paste-parser.js, editor-paste.js, editor-copy.js, editor-core.js, editor-format-text.js
 * Conteggio test case: 58
 * NOTA ARCHITETTURALE: Tutti i test case invocano ESCLUSIVAMENTE le funzioni reali
 * esposte dai moduli dell'applicazione (senza duplicazione locale della logica di business).
 */

describe("EditorPaste, EditorCopy & PasteParser (58 Test)", () => {

    // =========================================================================
    // 1. FORMATTAZIONE TESTO PIANO (Editor._formatPlainTextForHTML)
    // =========================================================================

    test("PasteParser: _formatPlainTextForHTML gestisce input nulli o vuoti", () => {
        Assert.strictEqual(Editor._formatPlainTextForHTML(null), "");
        Assert.strictEqual(Editor._formatPlainTextForHTML(""), "");
    });

    test("PasteParser: _formatPlainTextForHTML non avvolge testo a riga singola in <p> (Inline Preservation)", () => {
        const res = Editor._formatPlainTextForHTML("testo semplice");
        Assert.strictEqual(res, "testo semplice");
        Assert.isFalse(res.includes("<p>"));
    });

    test("PasteParser: _formatPlainTextForHTML esegue l'escape di entità HTML pericolose", () => {
        const res = Editor._formatPlainTextForHTML("<script>alert('xss')</script> & \"tag\"");
        Assert.isTrue(res.includes("&lt;script&gt;"));
        Assert.isTrue(res.includes("&amp;"));
        Assert.isFalse(res.includes("<script>"));
    });

    test("PasteParser: _formatPlainTextForHTML converte tabulazioni in 4 spazi non comprimibili", () => {
        const res = Editor._formatPlainTextForHTML("col1\tcol2");
        Assert.strictEqual(res, "col1&nbsp;&nbsp;&nbsp;&nbsp;col2");
    });

    test("PasteParser: _formatPlainTextForHTML preserva sequenze di spazi multipli con &nbsp;", () => {
        const res = Editor._formatPlainTextForHTML("parola    quattro_spazi");
        Assert.strictEqual(res, "parola&nbsp;&nbsp;&nbsp;&nbsp;quattro_spazi");
    });

    test("PasteParser: _formatPlainTextForHTML preserva rientri all'inizio di ogni riga tramite &nbsp;", () => {
        const text = "Riga base\n  Due spazi rientro";
        const res = Editor._formatPlainTextForHTML(text);
        Assert.isTrue(res.includes("&nbsp;&nbsp;Due spazi rientro"));
    });

    test("PasteParser: _formatPlainTextForHTML crea blocchi <p> conformi solo per testi su più righe", () => {
        const res = Editor._formatPlainTextForHTML("Riga 1\n\nRiga 2");
        Assert.isTrue(res.includes("<p>Riga 1</p>"));
        Assert.isTrue(res.includes("<p><br></p>"));
        Assert.isTrue(res.includes("<p>Riga 2</p>"));
    });

    test("PasteParser: _formatPlainTextForHTML converte righe numerate plain text in <ol><li> nativi", () => {
        const input = "1. Primo punto\n2. Secondo punto\n3. Terzo punto";
        const res = Editor._formatPlainTextForHTML(input);
        Assert.isTrue(res.startsWith("<ol>"));
        Assert.isTrue(res.endsWith("</ol>"));
        Assert.isTrue(res.includes("<li>Primo punto</li>"));
        Assert.isTrue(res.includes("<li>Secondo punto</li>"));
        Assert.isTrue(res.includes("<li>Terzo punto</li>"));
        Assert.isFalse(res.includes("1. Primo punto"));
    });

    test("PasteParser: _formatPlainTextForHTML converte punti elenco plain text (-, *, •, ·) in <ul><li>", () => {
        const input = "- Elemento A\n* Elemento B\n• Elemento C\n· Elemento D";
        const res = Editor._formatPlainTextForHTML(input);
        Assert.isTrue(res.startsWith("<ul>"));
        Assert.isTrue(res.endsWith("</ul>"));
        Assert.isTrue(res.includes("<li>Elemento A</li>"));
        Assert.isTrue(res.includes("<li>Elemento B</li>"));
        Assert.isTrue(res.includes("<li>Elemento C</li>"));
        Assert.isTrue(res.includes("<li>Elemento D</li>"));
    });

    test("PasteParser: _formatPlainTextForHTML raggruppa correttamente elenchi intervallati da paragrafi", () => {
        const input = "Introduzione\n1. Passo Uno\n2. Passo Due\nConclusione";
        const res = Editor._formatPlainTextForHTML(input);
        Assert.isTrue(res.includes("<p>Introduzione</p>"));
        Assert.isTrue(res.includes("<ol><li>Passo Uno</li><li>Passo Due</li></ol>"));
        Assert.isTrue(res.includes("<p>Conclusione</p>"));
    });

    // =========================================================================
    // 2. PARSER ELENCHI MICROSOFT WORD MsoList (Editor._convertWordListsToHTML)
    // =========================================================================

    test("PasteParser: _convertWordListsToHTML converte MsoListParagraph numerati in <ol> e rimuove mso-list:Ignore", () => {
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

    test("PasteParser: _convertWordListsToHTML converte MsoListParagraph puntati in <ul>", () => {
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

    test("PasteParser: _convertWordListsToHTML riconosce e converte paragrafi con marcatore numerico testuale puro", () => {
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
        Assert.strictEqual(ol.children[1].textContent.trim(), "Secondo elemento");
    });

    test("PasteParser: _convertWordListsToHTML non tocca paragrafi normali che non sono elenchi", () => {
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
    // 3. RICONOSCIMENTO TABELLE EXCEL E SHEETS (Editor._isExcelOrSpreadsheetPaste)
    // =========================================================================

    test("PasteParser: _isExcelOrSpreadsheetPaste restituisce false per input nulli o vuoti", () => {
        Assert.isFalse(Editor._isExcelOrSpreadsheetPaste(null, null));
        Assert.isFalse(Editor._isExcelOrSpreadsheetPaste("", ""));
    });

    test("PasteParser: _isExcelOrSpreadsheetPaste riconosce tabelle HTML con signature Microsoft Excel", () => {
        const excelHTML = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><table><tr><td>1</td><td>2</td></tr></table></body></html>`;
        Assert.isTrue(Editor._isExcelOrSpreadsheetPaste(excelHTML, "1\t2"));
    });

    test("PasteParser: _isExcelOrSpreadsheetPaste riconosce tabelle HTML con signature Google Sheets", () => {
        const sheetsHTML = `<google-sheets-html-origin><table><tr><td>A</td><td>B</td></tr></table></google-sheets-html-origin>`;
        Assert.isTrue(Editor._isExcelOrSpreadsheetPaste(sheetsHTML, "A\tB"));
    });

    test("PasteParser: _isExcelOrSpreadsheetPaste riconosce tabella HTML isolata accompagnata da TSV", () => {
        const genericTableHTML = `<table><tr><td>Dato 1</td><td>Dato 2</td></tr></table>`;
        Assert.isTrue(Editor._isExcelOrSpreadsheetPaste(genericTableHTML, "Dato 1\tDato 2"));
    });

    test("PasteParser: _isExcelOrSpreadsheetPaste riconosce dati tabulari puri in formato TSV senza HTML", () => {
        const tsvOnly = "ColA\tColB\nVal1\tVal2";
        Assert.isTrue(Editor._isExcelOrSpreadsheetPaste(null, tsvOnly));
    });

    test("PasteParser: _isExcelOrSpreadsheetPaste esclude documenti Word/Docs con testo e tabelle miste", () => {
        const wordDocHTML = `<html><body><p>Titolo del documento Word</p><table><tr><td>1</td></tr></table></body></html>`;
        Assert.isFalse(Editor._isExcelOrSpreadsheetPaste(wordDocHTML, "Titolo del documento Word\n1"));
    });

    test("PasteParser: _isExcelOrSpreadsheetPaste esclude testo normale privo di tabulazioni o tag table", () => {
        Assert.isFalse(Editor._isExcelOrSpreadsheetPaste("<p>Testo normale</p>", "Testo normale"));
    });

    // =========================================================================
    // 4. GENERAZIONE TABELLE DA EXCEL (Editor._createSimpleTableFromExcel)
    // =========================================================================

    test("PasteParser: _createSimpleTableFromExcel genera markup conforme .simple-table-wrapper", () => {
        const tableHtml = `<table><tr><td>Intestazione 1</td><td>Intestazione 2</td></tr><tr><td>Valore A</td><td>Valore B</td></tr></table>`;
        const res = Editor._createSimpleTableFromExcel(tableHtml, "Intestazione 1\tIntestazione 2\nValore A\tValore B");

        Assert.isTrue(res !== null);
        Assert.isTrue(res.includes('data-widget-type="simple-table"'));
        Assert.isTrue(res.includes('<th contenteditable="true">Intestazione 1</th>'));
        Assert.isTrue(res.includes('<td contenteditable="true">Valore A</td>'));
    });

    test("PasteParser: _createSimpleTableFromExcel con una sola cella restituisce null (Regola UX anti 1x1)", () => {
        const tableHtml = `<table><tr><td>Solo un valore</td></tr></table>`;
        const res = Editor._createSimpleTableFromExcel(tableHtml, "Solo un valore");
        Assert.isNull(res);
    });

    test("PasteParser: _createSimpleTableFromExcel preserva attributi colspan e rowspan", () => {
        const tableHtml = `<table><tr><th colspan="2">Titolo Esteso</th></tr><tr><td rowspan="2">A</td><td>B1</td></tr><tr><td>B2</td></tr></table>`;
        const res = Editor._createSimpleTableFromExcel(tableHtml, "");
        Assert.isTrue(res.includes('colspan="2"'));
        Assert.isTrue(res.includes('rowspan="2"'));
    });

    test("PasteParser: _createSimpleTableFromExcel esegue il fallback su TSV puro se HTML è assente", () => {
        const tsv = "Col1\tCol2\nVal1\tVal2";
        const res = Editor._createSimpleTableFromExcel(null, tsv);
        Assert.isTrue(res !== null);
        Assert.isTrue(res.includes('<th contenteditable="true">Col1</th>'));
        Assert.isTrue(res.includes('<td contenteditable="true">Val2</td>'));
    });

    test("PasteParser: _createSimpleTableFromExcel garantisce <br> per celle vuote", () => {
        const tableHtml = `<table><tr><td>Intestazione</td><td>Altro</td></tr><tr><td>Dato</td><td></td></tr></table>`;
        const res = Editor._createSimpleTableFromExcel(tableHtml, "Intestazione\tAltro\nDato\t");
        Assert.isTrue(res.includes('<td contenteditable="true"><br></td>'));
    });

    // =========================================================================
    // 5. SANIFICAZIONE PROFONDA RICH TEXT (Editor.cleanDOMTree)
    // =========================================================================

    test("CleanDOMTree: rimuove script, style, meta, link e tag intrusivi da Word o Web", () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <style>body { color: red; }</style>
            <script>alert(1);</script>
            <p>Paragrafo valido</p>
        `;

        Editor.cleanDOMTree(container);

        Assert.strictEqual(container.querySelectorAll('script').length, 0);
        Assert.strictEqual(container.querySelectorAll('style').length, 0);
        Assert.strictEqual(container.querySelectorAll('p').length, 1);
        Assert.strictEqual(container.textContent.trim(), "Paragrafo valido");
    });

    test("CleanDOMTree: rimuove attributi di stile inline non consentiti ma preserva allineamenti tabella", () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <p style="font-family: Arial; margin: 20px; color: blue;">Testo</p>
            <table>
                <tr>
                    <td style="text-align: right; background: yellow;">Cella Allineata</td>
                </tr>
            </table>
        `;

        Editor.cleanDOMTree(container);

        const p = container.querySelector('p');
        Assert.isFalse(p.hasAttribute('style'));

        const td = container.querySelector('td');
        Assert.isTrue(td.hasAttribute('style'));
        Assert.strictEqual(td.getAttribute('style').trim(), 'text-align: right;');
    });

    test("CleanDOMTree: preserva le classi native del design system di VanillaDesk", () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <p>
                <span class="hl-c5 tx-c6 ff-serif fs-large tag-hash random-bad-class">Testo Stile</span>
            </p>
        `;

        Editor.cleanDOMTree(container);

        const span = container.querySelector('span');
        Assert.isTrue(span !== null);
        Assert.isTrue(span.classList.contains('hl-c5'));
        Assert.isTrue(span.classList.contains('tx-c6'));
        Assert.isTrue(span.classList.contains('ff-serif'));
        Assert.isTrue(span.classList.contains('fs-large'));
        Assert.isTrue(span.classList.contains('tag-hash'));
        Assert.isFalse(span.classList.contains('random-bad-class'));
    });

    test("CleanDOMTree: converte preventivamente i tag legacy <font> in <span>", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p><font color="#ff0000" class="tx-c10">Testo Font</font></p>`;

        Editor.cleanDOMTree(container);

        Assert.strictEqual(container.querySelectorAll('font').length, 0);
        const span = container.querySelector('span');
        Assert.isTrue(span !== null);
        Assert.isTrue(span.classList.contains('tx-c10'));
    });

    test("CleanDOMTree: preserva collegamenti ipertestuali <a> con attributi href e target", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p><a href="https://github.com" target="_blank" style="color:red;" onclick="bad()">GitHub</a></p>`;

        Editor.cleanDOMTree(container);

        const link = container.querySelector('a');
        Assert.isTrue(link !== null);
        Assert.strictEqual(link.getAttribute('href'), "https://github.com");
        Assert.strictEqual(link.getAttribute('target'), "_blank");
        Assert.isFalse(link.hasAttribute('onclick'));
        Assert.isFalse(link.hasAttribute('style'));
    });

    test("CleanDOMTree: protegge categoricamente i widget complessi di VanillaDesk senza alterarne il markup", () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <div id="adv_tbl_123" class="adv-widget-shell widget-type-database" data-widget-type="database">
                <div class="widget-body" style="margin: 10px;">Dati Protetti</div>
            </div>
        `;

        Editor.cleanDOMTree(container);

        const widget = container.querySelector('#adv_tbl_123');
        Assert.isTrue(widget !== null);
        Assert.isTrue(widget.querySelector('.widget-body').hasAttribute('style'));
    });

    // =========================================================================
    // 6. MINI-EDITOR E NOTE INLINE (Editor.sanitizeMiniText)
    // =========================================================================

    test("SanitizeMiniText: consente solo <b>, <i>, <u> e <br>, srotolando tag alieni", () => {
        const rawHTML = `
            <div style="color:red;">
                <h1>Titolo Proibito</h1>
                <p>Testo con <b>grassetto</b>, <i>corsivo</i>, <u>sottolineato</u> e <a href="#">link rimosso</a>.</p>
                <img src="test.jpg">
            </div>
        `;
        const cleaned = Editor.sanitizeMiniText(rawHTML);

        Assert.isFalse(cleaned.includes("<h1>"));
        Assert.isFalse(cleaned.includes("<img"));
        Assert.isFalse(cleaned.includes("<a"));
        Assert.isTrue(cleaned.includes("<b>grassetto</b>"));
        Assert.isTrue(cleaned.includes("<i>corsivo</i>"));
        Assert.isTrue(cleaned.includes("<u>sottolineato</u>"));
        Assert.isTrue(cleaned.includes("link rimosso"));
    });

    test("SanitizeMiniText: converte liste puntate e numerate in elenchi con marcatore (•)", () => {
        const input = "<ul><li>Primo punto</li><li>Secondo punto</li></ul>";
        const res = Editor.sanitizeMiniText(input);
        Assert.isTrue(res.includes("• Primo punto"));
        Assert.isTrue(res.includes("• Secondo punto"));
        Assert.isFalse(res.includes("<ul>"));
        Assert.isFalse(res.includes("<li>"));
    });

    test("SanitizeMiniText: elimina tag di formattazione vuoti ma preserva testo e <br>", () => {
        const input = "<b></b><i>   </i><u>Prima riga</u><br><u>Seconda riga</u><br>";
        const res = Editor.sanitizeMiniText(input);
        Assert.isFalse(res.includes("<b></b>"));
        Assert.isFalse(res.includes("<i>   </i>"));
        Assert.isTrue(res.includes("<u>Prima riga</u>"));
        Assert.isTrue(res.includes("<u>Seconda riga</u>"));
        Assert.isTrue(res.includes("<br>"));
        Assert.isFalse(res.endsWith("<br>"));
    });

    test("SanitizeMiniText: preserva gli spazi intenzionali dell'utente senza trim distruttivo", () => {
        const input = "Parola1   Parola2  ";
        const res = Editor.sanitizeMiniText(input);
        Assert.isTrue(res.includes("Parola1   Parola2"));
    });

    // =========================================================================
    // 7. RILEVAMENTO LINGUAGGIO CODICE (CodeManager.detectLanguage)
    // =========================================================================

    test("DetectLanguage: rileva validità JSON", () => {
        Assert.strictEqual(CodeManager.detectLanguage('{"nome": "VanillaDesk", "attivo": true}'), 'json');
        Assert.strictEqual(CodeManager.detectLanguage('["mela", "pera", "banana"]'), 'json');
    });

    test("DetectLanguage: rileva Python da costrutti def e import", () => {
        const py = "import os\ndef calcola_totale(valori):\n    return sum(valori)";
        Assert.strictEqual(CodeManager.detectLanguage(py), 'python');
    });

    test("DetectLanguage: rileva SQL da query DDL e DML", () => {
        const sql = "SELECT id, nome FROM clienti WHERE attivo = 1 ORDER BY data DESC;";
        Assert.strictEqual(CodeManager.detectLanguage(sql), 'sql');
    });

    test("DetectLanguage: rileva Bash da shebang o comandi shell tipici", () => {
        Assert.strictEqual(CodeManager.detectLanguage('#!/bin/bash\necho "Avvio backup..."'), 'bash');
        Assert.strictEqual(CodeManager.detectLanguage('sudo chmod -R 755 /var/www/html'), 'bash');
    });

    test("DetectLanguage: rileva HTML e markup", () => {
        Assert.strictEqual(CodeManager.detectLanguage('<!DOCTYPE html><html><body><h1>Titolo</h1></body></html>'), 'html');
    });

    test("DetectLanguage: rileva CSS da selettori e blocchi di regole", () => {
        const css = ".card-title { color: #333; margin-bottom: 10px; display: flex; }";
        Assert.strictEqual(CodeManager.detectLanguage(css), 'css');
    });

    test("DetectLanguage: rileva JavaScript da const/let/arrow functions", () => {
        const js = "const calcola = (a, b) => {\n    console.log(a + b);\n    return a + b;\n};";
        Assert.strictEqual(CodeManager.detectLanguage(js), 'js');
    });

    test("DetectLanguage: testo semplice non supera la soglia di confidenza e restituisce 'none'", () => {
        const plain = "Questa è una semplice nota in italiano che spiega un processo aziendale senza codice.";
        Assert.strictEqual(CodeManager.detectLanguage(plain), 'none');
    });

    // =========================================================================
    // 8. LINK TRUNCATION & NORMALIZZAZIONE BLOCCHI
    // =========================================================================

    test("LinkManager: _truncateUrl accorcia indirizzi web a massimo 60 caratteri con puntini di sospensione", () => {
        const longUrl = "https://www.example.com/very/long/path/with/lots/of/nested/subdirectories/and/parameters?query=123456789";
        const truncated = LinkManager._truncateUrl(longUrl, 60);
        Assert.isTrue(truncated.length <= 60);
        Assert.isTrue(truncated.endsWith("..."));
    });

    test("LinkManager: _truncateUrl preserva URL brevi inferiori a 60 caratteri senza alterazioni", () => {
        const shortUrl = "https://github.com/dragoneblu-dev";
        Assert.strictEqual(LinkManager._truncateUrl(shortUrl, 60), shortUrl);
    });

    test("NormalizeEmptyBlocks: assicura che blocchi vuoti abbiano <br> per il posizionamento del cursore", () => {
        const container = document.createElement('div');
        const p = document.createElement('p');
        p.innerHTML = '';
        container.appendChild(p);

        Editor._normalizeEmptyBlocks(container);

        Assert.strictEqual(p.innerHTML, '<br>');
    });

    test("NormalizeEmptyBlocks: rimuove paragrafi vuoti parassiti lasciati da split se ci sono altri figli", () => {
        const container = document.createElement('div');
        const p1 = document.createElement('p'); p1.textContent = "Testo reale";
        const pEmpty = document.createElement('p'); pEmpty.innerHTML = '';
        container.appendChild(p1);
        container.appendChild(pEmpty);

        Editor._normalizeEmptyBlocks(container);

        Assert.strictEqual(container.querySelectorAll('p').length, 1);
        Assert.strictEqual(container.firstElementChild.textContent, "Testo reale");
    });

    test("HealFontArtifacts: rimuove span parassiti con font-size inline generati da browser su unione blocchi", () => {
        const container = document.createElement('div');
        container.innerHTML = `<h1><span style="font-size: 16px;">Titolo Con Artefatto</span></h1>`;

        Editor.healFontArtifacts(container);

        const h1 = container.querySelector('h1');
        Assert.strictEqual(h1.querySelectorAll('span').length, 0);
        Assert.strictEqual(h1.textContent, "Titolo Con Artefatto");
    });

    // =========================================================================
    // 9. NUOVI TEST CASE: GESTIONE LINK ANCORATI A IMMAGINI & NESTING W3C
    // =========================================================================

    test("PasteParser: tag <a> con immagini non vengono eliminati e mantengono href originario", () => {
        const rawHTML = `<a href="https://example.com/gallery/1"><img src="https://example.com/foto.jpg" alt="Foto"></a>`;
        const doc = new DOMParser().parseFromString(rawHTML, 'text/html');

        Editor.cleanDOMTree(doc.body);

        const a = doc.body.querySelector('a');
        Assert.isNotNull(a, "Il tag <a> che avvolge l'immagine deve essere conservato");
        Assert.strictEqual(a.getAttribute('href'), "https://example.com/gallery/1");
        const img = a.querySelector('img');
        Assert.isNotNull(img, "L'immagine deve trovarsi all'interno del tag <a>");
    });

    test("PasteParser: rimozione link <a> fantasma privi di testo e privi di immagini o media", () => {
        const rawHTML = `
            <div>
                <a href="https://google.com/ghost1"></a>
                <p><a href="https://google.com/ghost2">   </a></p>
                <a href="https://example.com/real"><img src="real.jpg"></a>
            </div>
        `;
        const doc = new DOMParser().parseFromString(rawHTML, 'text/html');

        // Replica la pulizia selettiva dei link vuoti di editor-paste.js
        doc.querySelectorAll('a').forEach(aEl => {
            if (aEl.classList.contains('internal-link') || aEl.classList.contains('file-link')) return;
            const text = (aEl.textContent || '').replace(/[\u200B\uFEFF\u00A0\s\r\n]/g, '');
            const hasMedia = !!aEl.querySelector('img, audio, video, svg, iframe');
            if (!text && !hasMedia) {
                aEl.remove();
            }
        });

        const links = doc.body.querySelectorAll('a');
        Assert.strictEqual(links.length, 1, "Solo il link che racchiude l'immagine reale deve sopravvivere");
        Assert.strictEqual(links[0].getAttribute('href'), "https://example.com/real");
    });

    test("PasteParser: inversione semantica blocchi <p> dentro <a> per prevenire nesting illegale W3C", () => {
        // Un tag <a> che contiene <p> deve essere invertito in <p><a>...</a></p>
        const rawHTML = `<a href="https://site.com/art"><p>Primo paragrafo</p><p>Secondo paragrafo</p></a>`;
        const doc = new DOMParser().parseFromString(rawHTML, 'text/html');

        doc.querySelectorAll('a').forEach(aEl => {
            const blocksInside = aEl.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, table, ul, ol, blockquote');
            if (blocksInside.length > 0) {
                const href = aEl.getAttribute('href');
                const parent = aEl.parentNode;
                if (parent) {
                    const frag = doc.createDocumentFragment();
                    while (aEl.firstChild) {
                        const child = aEl.firstChild;
                        if (child.nodeType === Node.ELEMENT_NODE && ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI'].includes(child.tagName)) {
                            const innerLink = doc.createElement('a');
                            if (href) innerLink.setAttribute('href', href);
                            while (child.firstChild) innerLink.appendChild(child.firstChild);
                            child.appendChild(innerLink);
                            frag.appendChild(child);
                        } else {
                            frag.appendChild(child);
                        }
                    }
                    parent.replaceChild(frag, aEl);
                }
            }
        });

        Assert.isNull(doc.body.querySelector('a > p'), "Non devono esserci <p> annidati dentro tag <a>");
        const paragraphs = doc.body.querySelectorAll('p');
        Assert.strictEqual(paragraphs.length, 2);
        Assert.isNotNull(paragraphs[0].querySelector('a'));
        Assert.strictEqual(paragraphs[0].querySelector('a').getAttribute('href'), "https://site.com/art");
    });

    test("PasteParser: tag <a> con sole immagini non viene scartato da flushInlineBuffer nel Caso B", () => {
        // Collauda la condizione hasRealContent su tag <a> privi di testo diretto ma contenenti <img>
        const div = document.createElement('div');
        const a = document.createElement('a');
        a.href = "https://source.com";
        const img = document.createElement('img');
        img.src = "data:image/png;base64,abc";
        a.appendChild(img);
        div.appendChild(a);

        const inlineBuffer = Array.from(div.childNodes);

        const hasRealContent = inlineBuffer.some(n => 
            (n.nodeType === Node.TEXT_NODE && n.nodeValue.replace(/[\r\n\t\s\u200B\uFEFF]/g, '') !== '') ||
            (n.nodeType === Node.ELEMENT_NODE && (
                n.tagName === 'BR' || 
                n.tagName === 'IMG' || 
                n.querySelector('img, audio, video, iframe, input, svg') !== null || 
                n.textContent.trim() !== ''
            ))
        );

        Assert.isTrue(hasRealContent, "Il tag <a> che racchiude <img> deve essere riconosciuto come contenuto reale");
    });

    test("Paste: presenza di tag <img> nell'HTML inibisce autolink link-wrap anche se text/plain è un URL", () => {
        const pastedHTML = `<a href="https://example.com"><img src="https://example.com/pic.jpg"></a>`;
        const pastedText = "https://example.com";

        const rawPastedText = pastedText.trim();
        const hasImagesInHTML = pastedHTML && /<img\b/i.test(pastedHTML);
        const isSingleWebUrl = !hasImagesInHTML && /^https?:\/\/[^\s]+$/i.test(rawPastedText);

        Assert.isFalse(isSingleWebUrl, "Un payload contenente immagini non deve essere scambiato per un link web di testo puro");
    });

    test("Paste: normalizzazione finale garantisce che nessun elemento inline o <img> resti orfano sotto noteContent", () => {
        const editorRoot = document.createElement('div');
        editorRoot.id = 'noteContent';
        
        // Simula iniezione accidentale di elementi inline direttamente a livello radice
        const nakedImg = document.createElement('img');
        nakedImg.src = "blob:http://127.0.0.1/test";
        const nakedLink = document.createElement('a');
        nakedLink.href = "https://test.com";
        nakedLink.textContent = "Test";

        editorRoot.appendChild(nakedImg);
        editorRoot.appendChild(nakedLink);

        const isBlockElement = (el) => {
            if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
            const tag = el.tagName.toUpperCase();
            return ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'TABLE', 'HR', 'UL', 'OL'].includes(tag);
        };

        Array.from(editorRoot.childNodes).forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const isBlock = isBlockElement(node);
                if (!isBlock) {
                    const p = document.createElement('p');
                    editorRoot.insertBefore(p, node);
                    p.appendChild(node);
                }
            }
        });

        Assert.strictEqual(editorRoot.querySelectorAll(':scope > p').length, 2);
        Assert.isNull(editorRoot.querySelector(':scope > img'));
        Assert.isNull(editorRoot.querySelector(':scope > a'));
    });

    test("Paste: estrazione immagini RTF Word gestisce stream multipli senza duplicazioni", () => {
        // Simula uno stream RTF valido con due immagini binarie JPEG/PNG
        const fakeRtf = `{\\rtf1\\ansi {\\pict\\jpegblip ffd8ff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000} Paragrafo {\\pict\\pngblip 89504e47000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000}}`;
        const extracted = Editor._extractImagesFromWordRTF(fakeRtf);

        Assert.strictEqual(extracted.length, 2);
        Assert.strictEqual(extracted[0].type, 'image/jpeg');
        Assert.strictEqual(extracted[1].type, 'image/png');
    });

    test("Paste: saveImageSource restituisce null senza eccezioni non gestite per input non validi", async () => {
        const resultNull = await Editor.saveImageSource(null);
        Assert.isNull(resultNull);

        const resultNotImage = await Editor.saveImageSource("not_an_image_url");
        Assert.isNull(resultNotImage);
    });

});