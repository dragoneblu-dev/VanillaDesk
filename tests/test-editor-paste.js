/**
 * tests/test-editor-paste.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Moduli testati: editor-paste-parser.js, editor-paste.js, editor-copy.js, editor-core.js, editor-format-text.js
 * Conteggio test case: 50
 * NOTA ARCHITETTURALE: Tutti i 50 test case invocano ESCLUSIVAMENTE le funzioni reali
 * esposte dai moduli dell'applicazione (senza duplicazione locale della logica di business).
 */

describe("EditorPaste, EditorCopy & PasteParser (50 Test)", () => {

    // =========================================================================
    // 1. FORMATTAZIONE TESTO PIANO (Editor._formatPlainTextForHTML)
    // =========================================================================

    test("PasteParser: _formatPlainTextForHTML gestisce input nulli o vuoti", () => {
        Assert.strictEqual(Editor._formatPlainTextForHTML(null), "");
        Assert.strictEqual(Editor._formatPlainTextForHTML(""), "");
    });

    test("PasteParser: _formatPlainTextForHTML non avvolge testo a riga singola in <p> (Inline Preservation)", () => {
        // Se il testo incollato è su riga singola, non deve essere frammentato in blocchi <p>
        const res = Editor._formatPlainTextForHTML("testo semplice");
        Assert.strictEqual(res, "testo semplice");
        Assert.isFalse(res.includes("<p>"));
    });

    test("PasteParser: _formatPlainTextForHTML esegue l'escape di entità HTML pericolose", () => {
        // Previene attacchi XSS assicurandosi che i caratteri speciali vengano trasformati in entità
        const res = Editor._formatPlainTextForHTML("<script>alert('xss')</script> & \"tag\"");
        Assert.isTrue(res.includes("&lt;script&gt;"));
        Assert.isTrue(res.includes("&amp;"));
        Assert.isFalse(res.includes("<script>"));
    });

    test("PasteParser: _formatPlainTextForHTML converte tabulazioni in 4 spazi non comprimibili", () => {
        // Le tabulazioni (\t) del testo semplice devono diventare 4 &nbsp; per non collassare
        const res = Editor._formatPlainTextForHTML("col1\tcol2");
        Assert.strictEqual(res, "col1&nbsp;&nbsp;&nbsp;&nbsp;col2");
    });

    test("PasteParser: _formatPlainTextForHTML preserva sequenze di spazi multipli con &nbsp;", () => {
        // Spazi multipli consecutivi devono essere preservati evitando la compattazione nativa HTML
        const res = Editor._formatPlainTextForHTML("parola    quattro_spazi");
        Assert.strictEqual(res, "parola&nbsp;&nbsp;&nbsp;&nbsp;quattro_spazi");
    });

    test("PasteParser: _formatPlainTextForHTML preserva rientri all'inizio di ogni riga tramite &nbsp;", () => {
        // I rientri visivi all'inizio delle righe devono rimanere visibili tramite &nbsp;
        const text = "Riga base\n  Due spazi rientro";
        const res = Editor._formatPlainTextForHTML(text);
        Assert.isTrue(res.includes("&nbsp;&nbsp;Due spazi rientro"));
    });

    test("PasteParser: _formatPlainTextForHTML crea blocchi <p> conformi solo per testi su più righe", () => {
        // Per testi con a capo, genera blocchi paragrafo conformi e preserva le righe vuote come <p><br></p>
        const res = Editor._formatPlainTextForHTML("Riga 1\n\nRiga 2");
        Assert.isTrue(res.includes("<p>Riga 1</p>"));
        Assert.isTrue(res.includes("<p><br></p>"));
        Assert.isTrue(res.includes("<p>Riga 2</p>"));
    });

    test("PasteParser: _formatPlainTextForHTML converte righe numerate plain text in <ol><li> nativi", () => {
        // Riconosce sequenze numerate nel testo semplice e le struttura in elenchi ordinati nativi
        const input = "1. Primo punto\n2. Secondo punto\n3. Terzo punto";
        const res = Editor._formatPlainTextForHTML(input);
        Assert.isTrue(res.startsWith("<ol>"));
        Assert.isTrue(res.endsWith("</ol>"));
        Assert.isTrue(res.includes("<li>Primo punto</li>"));
        Assert.isTrue(res.includes("<li>Secondo punto</li>"));
        Assert.isTrue(res.includes("<li>Terzo punto</li>"));
        Assert.isFalse(res.includes("1. Primo punto")); // Il marcatore numerico duplicato viene rimosso
    });

    test("PasteParser: _formatPlainTextForHTML converte punti elenco plain text (-, *, •, ·) in <ul><li>", () => {
        // Riconosce trattini, asterischi e pallini nel testo puro convertendoli in tag <ul> e <li>
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
        // Chiude e riapre correttamente le liste quando sono intervallate da paragrafi normali
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
        // Riconosce le classi MsoListParagraph di Word rimuovendo il tag di numerazione duplicato mso-list:Ignore
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
        // Converte gli elenchi puntati Word con pallino '·' in elenchi <ul> puliti
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
        // Converte paragrafi che iniziano con numero e tabulazione ("1.\t") in elenchi ordinati
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
        // Garantisce che il parser Word non alteri i normali paragrafi di testo privi di marcatori
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
        // Riconosce il namespace xmlns:x proprietario di Microsoft Excel
        const excelHTML = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><table><tr><td>1</td><td>2</td></tr></table></body></html>`;
        Assert.isTrue(Editor._isExcelOrSpreadsheetPaste(excelHTML, "1\t2"));
    });

    test("PasteParser: _isExcelOrSpreadsheetPaste riconosce tabelle HTML con signature Google Sheets", () => {
        // Riconosce i tag contenitore proprietari di Google Sheets (google-sheets-html-origin)
        const sheetsHTML = `<google-sheets-html-origin><table><tr><td>A</td><td>B</td></tr></table></google-sheets-html-origin>`;
        Assert.isTrue(Editor._isExcelOrSpreadsheetPaste(sheetsHTML, "A\tB"));
    });

    test("PasteParser: _isExcelOrSpreadsheetPaste riconosce tabella HTML isolata accompagnata da TSV", () => {
        // Riconosce tabelle senza signature specifica purché accompagnate da TSV puro in text/plain
        const genericTableHTML = `<table><tr><td>Dato 1</td><td>Dato 2</td></tr></table>`;
        Assert.isTrue(Editor._isExcelOrSpreadsheetPaste(genericTableHTML, "Dato 1\tDato 2"));
    });

    test("PasteParser: _isExcelOrSpreadsheetPaste riconosce dati tabulari puri in formato TSV senza HTML", () => {
        // Consente l'importazione anche in assenza di markup HTML purché la stringa contenga tabulazioni
        const tsvOnly = "ColA\tColB\nVal1\tVal2";
        Assert.isTrue(Editor._isExcelOrSpreadsheetPaste(null, tsvOnly));
    });

    test("PasteParser: _isExcelOrSpreadsheetPaste esclude documenti Word/Docs con testo e tabelle miste", () => {
        // Se il frammento contiene paragrafi di testo all'esterno della tabella, non è una selezione di solo foglio di calcolo
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
        // Trasforma le celle in una tabella semplice nativa di VanillaDesk con classe table-striped
        const tableHtml = `<table><tr><td>Intestazione 1</td><td>Intestazione 2</td></tr><tr><td>Valore A</td><td>Valore B</td></tr></table>`;
        const res = Editor._createSimpleTableFromExcel(tableHtml, "Intestazione 1\tIntestazione 2\nValore A\tValore B");

        Assert.isTrue(res !== null);
        Assert.isTrue(res.includes('data-widget-type="simple-table"'));
        Assert.isTrue(res.includes('<th contenteditable="true">Intestazione 1</th>'));
        Assert.isTrue(res.includes('<td contenteditable="true">Valore A</td>'));
    });

    test("PasteParser: _createSimpleTableFromExcel con una sola cella restituisce null (Regola UX anti 1x1)", () => {
        // Se viene copiata una sola cella da Excel, non crea una griglia 1x1 ma lascia passare il testo
        const tableHtml = `<table><tr><td>Solo un valore</td></tr></table>`;
        const res = Editor._createSimpleTableFromExcel(tableHtml, "Solo un valore");
        Assert.isNull(res);
    });

    test("PasteParser: _createSimpleTableFromExcel preserva attributi colspan e rowspan", () => {
        // Mantiene intatte le fusioni di celle provenienti da fogli di calcolo
        const tableHtml = `<table><tr><th colspan="2">Titolo Esteso</th></tr><tr><td rowspan="2">A</td><td>B1</td></tr><tr><td>B2</td></tr></table>`;
        const res = Editor._createSimpleTableFromExcel(tableHtml, "");
        Assert.isTrue(res.includes('colspan="2"'));
        Assert.isTrue(res.includes('rowspan="2"'));
    });

    test("PasteParser: _createSimpleTableFromExcel esegue il fallback su TSV puro se HTML è assente", () => {
        // In assenza di payload HTML, ricostruisce l'intera griglia a partire dai valori separati da tabulazione
        const tsv = "Col1\tCol2\nVal1\tVal2";
        const res = Editor._createSimpleTableFromExcel(null, tsv);
        Assert.isTrue(res !== null);
        Assert.isTrue(res.includes('<th contenteditable="true">Col1</th>'));
        Assert.isTrue(res.includes('<td contenteditable="true">Val2</td>'));
    });

    test("PasteParser: _createSimpleTableFromExcel garantisce <br> per celle vuote", () => {
        // Le celle vuote devono contenere un <br> per consentire il posizionamento del cursore
        const tableHtml = `<table><tr><td>Intestazione</td><td>Altro</td></tr><tr><td>Dato</td><td></td></tr></table>`;
        const res = Editor._createSimpleTableFromExcel(tableHtml, "Intestazione\tAltro\nDato\t");
        Assert.isTrue(res.includes('<td contenteditable="true"><br></td>'));
    });

    // =========================================================================
    // 5. SANIFICAZIONE PROFONDA RICH TEXT (Editor.cleanDOMTree)
    // =========================================================================

    test("CleanDOMTree: rimuove script, style, meta, link e tag intrusivi da Word o Web", () => {
        // Verifica che tag non testuali come <style> o <script> vengano completamente rimossi
        // con il loro contenuto interno (CSS e codice JS), impedendo che vengano riversati
        // nel documento come nodi di testo visibile orfani.
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
        // Rimuove stili come font-family o margin, ma preserva text-align valido sulle celle
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
        // Mantiene le classi di formattazione dell'app (hl-*, tx-*, ff-*, fs-*, tag-hash) e rimuove le altre
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
        // Elimina i vecchi tag <font> HTML convertendoli in <span> standard W3C
        const container = document.createElement('div');
        container.innerHTML = `<p><font color="#ff0000" class="tx-c10">Testo Font</font></p>`;

        Editor.cleanDOMTree(container);

        Assert.strictEqual(container.querySelectorAll('font').length, 0);
        const span = container.querySelector('span');
        Assert.isTrue(span !== null);
        Assert.isTrue(span.classList.contains('tx-c10'));
    });

    test("CleanDOMTree: preserva collegamenti ipertestuali <a> con attributi href e target", () => {
        // Mantiene i link validi pulendo attributi non consentiti come style e onclick
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
        // I widget complessi come Database o Pivot sono protetti da qualsiasi alterazione
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
        // Permette solo la formattazione essenziale per gli appunti nelle note inline e nei segnalibri
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
        // Converte i tag di lista in ritorni a capo preceduti da pallino testuale
        const input = "<ul><li>Primo punto</li><li>Secondo punto</li></ul>";
        const res = Editor.sanitizeMiniText(input);
        Assert.isTrue(res.includes("• Primo punto"));
        Assert.isTrue(res.includes("• Secondo punto"));
        Assert.isFalse(res.includes("<ul>"));
        Assert.isFalse(res.includes("<li>"));
    });

    test("SanitizeMiniText: elimina tag di formattazione vuoti ma preserva testo e <br>", () => {
        // Verifica che i tag vuoti (o con soli spazi) vengano eliminati, mentre il testo valido
        // e i ritorni a capo intermedi tra blocchi di testo vengano preservati; i ritorni a capo
        // orfani alla fine della stringa vengono rimossi come da specifica del Passo 5.
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
        // Mantiene gli spazi digitati dall'utente all'interno del testo
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
        // Gli URL mostrati nel testo del link vengono troncati a 60 caratteri per evitare di spezzare il layout
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
        // Previene la scomparsa visiva dei blocchi vuoti garantendo un tag <br> all'interno
        const container = document.createElement('div');
        const p = document.createElement('p');
        p.innerHTML = '';
        container.appendChild(p);

        Editor._normalizeEmptyBlocks(container);

        Assert.strictEqual(p.innerHTML, '<br>');
    });

    test("NormalizeEmptyBlocks: rimuove paragrafi vuoti parassiti lasciati da split se ci sono altri figli", () => {
        // Elimina i tag <p></p> completamente vuoti generati dai browser su mutazioni di riga
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
        // Srotola gli span con stili inline parassiti font-size iniettati da WebKit/Blink
        const container = document.createElement('div');
        container.innerHTML = `<h1><span style="font-size: 16px;">Titolo Con Artefatto</span></h1>`;

        Editor.healFontArtifacts(container);

        const h1 = container.querySelector('h1');
        Assert.strictEqual(h1.querySelectorAll('span').length, 0);
        Assert.strictEqual(h1.textContent, "Titolo Con Artefatto");
    });

});