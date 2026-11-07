/**
 * tests/test-editor-sanitizer.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-sanitizer.js (con integrazione del motore centrale Editor.cleanDOMTree)
 * Conteggio test case: 44
 * NOTA ARCHITETTURALE: Tutti i test case invocano ESCLUSIVAMENTE le funzioni reali
 * esposte dai moduli dell'applicazione (senza duplicazione locale della logica di business).
 */

describe("Editor Sanitizer: Minificazione, Normalizzazione Blocchi, ZWS & Sicurezza (44 Test)", () => {

    // =========================================================================
    // 1. SANIFICAZIONE TESTI BREVI E NOTE INLINE (Editor.sanitizeMiniText)
    // =========================================================================

    test("SanitizeMiniText: gestisce input nulli, non definiti o vuoti", () => {
        Assert.strictEqual(Editor.sanitizeMiniText(null), "");
        Assert.strictEqual(Editor.sanitizeMiniText(undefined), "");
        Assert.strictEqual(Editor.sanitizeMiniText(""), "");
    });

    test("SanitizeMiniText: disinnesca vettori di attacco XSS (script, iframe, onerror, svg)", () => {
        const malicious = `
            <script>alert('xss')</script>
            <iframe src="javascript:alert(1)"></iframe>
            <img src="invalid.jpg" onerror="alert(2)">
            <svg onload="alert(3)"><circle cx="10" cy="10" r="5"/></svg>
            <p>Testo sicuro</p>
        `;
        const cleaned = Editor.sanitizeMiniText(malicious);

        Assert.isFalse(cleaned.includes("<script"));
        Assert.isFalse(cleaned.includes("<iframe"));
        Assert.isFalse(cleaned.includes("<img"));
        Assert.isFalse(cleaned.includes("<svg"));
        Assert.isFalse(cleaned.includes("onerror"));
        Assert.isFalse(cleaned.includes("onload"));
        Assert.isTrue(cleaned.includes("Testo sicuro"));
    });

    test("SanitizeMiniText: converte tag a blocco (p, div, h1..h6, blockquote, table) in <br>", () => {
        const input = "<h1>Titolo</h1><p>Paragrafo</p><blockquote>Citazione</blockquote>";
        const cleaned = Editor.sanitizeMiniText(input);

        Assert.isFalse(cleaned.includes("<h1>"));
        Assert.isFalse(cleaned.includes("<p>"));
        Assert.isFalse(cleaned.includes("<blockquote>"));
        Assert.isTrue(cleaned.includes("Titolo<br>Paragrafo<br>Citazione"));
    });

    test("SanitizeMiniText: converte elementi <li> in elenchi puntati testuali con marcatore (•)", () => {
        const input = "<ul><li>Primo punto</li><li>Secondo punto</li></ul>";
        const cleaned = Editor.sanitizeMiniText(input);

        Assert.isFalse(cleaned.includes("<ul>"));
        Assert.isFalse(cleaned.includes("<li>"));
        Assert.isTrue(cleaned.includes("• Primo punto"));
        Assert.isTrue(cleaned.includes("• Secondo punto"));
    });

    test("SanitizeMiniText: converte stili CSS e tag alternativi in tag ammessi (strong->b, em->i, underline->u)", () => {
        const input = `
            <strong>Forte</strong>
            <em>Enfasi</em>
            <span style="font-weight: bold;">Span Grassetto</span>
            <span style="font-style: italic;">Span Corsivo</span>
            <span style="text-decoration: underline;">Span Sottolineato</span>
        `;
        const cleaned = Editor.sanitizeMiniText(input);

        Assert.isTrue(cleaned.includes("<b>Forte</b>"));
        Assert.isTrue(cleaned.includes("<i>Enfasi</i>"));
        Assert.isTrue(cleaned.includes("<b>Span Grassetto</b>"));
        Assert.isTrue(cleaned.includes("<i>Span Corsivo</i>"));
        Assert.isTrue(cleaned.includes("<u>Span Sottolineato</u>"));
    });

    test("SanitizeMiniText: elimina tag di formattazione vuoti o con soli spazi", () => {
        const input = "<b></b><i>   </i><u>   </u><b>Valido</b>";
        const cleaned = Editor.sanitizeMiniText(input);

        Assert.isFalse(cleaned.includes("<b></b>"));
        Assert.isFalse(cleaned.includes("<i>"));
        Assert.isFalse(cleaned.includes("<u>"));
        Assert.strictEqual(cleaned, "<b>Valido</b>");
    });

    test("SanitizeMiniText: compatta sequenze di 3 o più <br> consecutivi in un doppio ritorno a capo", () => {
        const input = "Riga 1<br><br><br><br><br>Riga 2";
        const cleaned = Editor.sanitizeMiniText(input);

        Assert.strictEqual(cleaned, "Riga 1<br><br>Riga 2");
    });

    test("SanitizeMiniText: rimuove i <br> orfani all'inizio e alla fine della stringa", () => {
        const input = "<br><br>Testo Centrale<br><br>";
        const cleaned = Editor.sanitizeMiniText(input);

        Assert.strictEqual(cleaned, "Testo Centrale");
    });

    test("SanitizeMiniText: preserva gli spazi interni e i rientri intenzionali dell'utente", () => {
        const input = "  Parola1    Parola2  ";
        const cleaned = Editor.sanitizeMiniText(input);

        Assert.strictEqual(cleaned, "  Parola1    Parola2  ");
    });

    // =========================================================================
    // 2. NORMALIZZAZIONE BLOCCHI VUOTI (Editor._normalizeEmptyBlocks)
    // =========================================================================

    test("NormalizeEmptyBlocks: un singolo blocco <p></p> privo di figli viene sanato con <br>", () => {
        const container = document.createElement('div');
        const p = document.createElement('p');
        p.innerHTML = '';
        container.appendChild(p);

        Editor._normalizeEmptyBlocks(container);

        Assert.strictEqual(p.innerHTML, '<br>');
    });

    test("NormalizeEmptyBlocks: rimuove paragrafi <p></p> completamente vuoti se sono presenti altri blocchi fratelli", () => {
        const container = document.createElement('div');
        const p1 = document.createElement('p'); p1.textContent = "Testo 1";
        const pEmpty = document.createElement('p'); pEmpty.innerHTML = '';
        const p2 = document.createElement('p'); p2.textContent = "Testo 2";
        
        container.appendChild(p1);
        container.appendChild(pEmpty);
        container.appendChild(p2);

        Editor._normalizeEmptyBlocks(container);

        Assert.strictEqual(container.querySelectorAll('p').length, 2);
        Assert.strictEqual(container.children[0].textContent, "Testo 1");
        Assert.strictEqual(container.children[1].textContent, "Testo 2");
    });

    test("NormalizeEmptyBlocks: non rimuove blocchi privi di testo ma contenenti immagini o audio", () => {
        const container = document.createElement('div');
        const p1 = document.createElement('p'); p1.textContent = "Testo";
        const pImg = document.createElement('p'); pImg.innerHTML = '<img src="test.png">';
        
        container.appendChild(p1);
        container.appendChild(pImg);

        Editor._normalizeEmptyBlocks(container);

        Assert.strictEqual(container.querySelectorAll('p').length, 2);
        Assert.isNotNull(container.querySelector('img'));
    });

    test("NormalizeEmptyBlocks: converte tag <div><br></div> in tag standard <p><br></p> preservando classi", () => {
        const container = document.createElement('div');
        const div = document.createElement('div');
        div.className = "custom-block-class";
        div.innerHTML = '<br>';
        container.appendChild(div);

        Editor._normalizeEmptyBlocks(container);

        const p = container.querySelector('p');
        Assert.isNotNull(p);
        Assert.strictEqual(p.innerHTML, '<br>');
        Assert.isTrue(p.classList.contains('custom-block-class'));
        Assert.strictEqual(container.querySelectorAll('div').length, 0);
    });

    // =========================================================================
    // 3. AUTO-RIPARAZIONE ARTEFATTI FONT (Editor.healFontArtifacts)
    // =========================================================================

    test("HealFontArtifacts: rimuove span anonimi con font-size inline parassiti nei titoli", () => {
        const container = document.createElement('div');
        container.innerHTML = `<h2><span style="font-size: 14px;">Titolo Corrotto</span></h2>`;

        Editor.healFontArtifacts(container);

        const h2 = container.querySelector('h2');
        Assert.strictEqual(h2.querySelectorAll('span').length, 0);
        Assert.strictEqual(h2.textContent, "Titolo Corrotto");
    });

    test("HealFontArtifacts: preserva le classi native di dimensione di VanillaDesk (fs-small, fs-large)", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p><span class="fs-large" style="font-size: 20px;">Testo Grande</span></p>`;

        Editor.healFontArtifacts(container);

        const span = container.querySelector('span');
        Assert.isNotNull(span);
        Assert.isTrue(span.classList.contains('fs-large'));
    });

    // =========================================================================
    // 4. GESTIONE CUSCINETTI ZERO-WIDTH SPACE (Editor.ensureInlineWidgetBuffers)
    // =========================================================================

    test("EnsureInlineWidgetBuffers: inietta cuscinetti \\u200B prima e dopo le shell inline", () => {
        const container = document.createElement('div');
        container.innerHTML = `Testo <span class="adv-copy-snippet adv-inline-shell">Snippet</span> seguito`;

        Editor.ensureInlineWidgetBuffers(container);

        const shell = container.querySelector('.adv-inline-shell');
        Assert.isNotNull(shell);
        Assert.isTrue(shell.previousSibling.nodeValue.endsWith('\u200B'));
        Assert.isTrue(shell.nextSibling.nodeValue.startsWith('\u200B'));
    });

    test("EnsureInlineWidgetBuffers: rimuove \\u200B intrappolati all'interno di parole alfanumeriche", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p>c\u200Bi\u200Ba\u200Bo mondo</p>`;

        Editor.ensureInlineWidgetBuffers(container);

        Assert.strictEqual(container.querySelector('p').textContent, "ciao mondo");
    });

    test("EnsureInlineWidgetBuffers: rimuove \\u200B orfani isolati nel testo", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p>Testo con ZWS \u200B orfano</p>`;

        Editor.ensureInlineWidgetBuffers(container);

        Assert.strictEqual(container.querySelector('p').textContent, "Testo con ZWS  orfano");
    });

    test("EnsureInlineWidgetBuffers: comprime sequenze duplicate di \\u200B in un singolo carattere", () => {
        const container = document.createElement('div');
        container.innerHTML = `Testo\u200B\u200B\u200B<span class="adv-inline-shell">Widget</span>\u200B\u200BTesto`;

        Editor.ensureInlineWidgetBuffers(container);

        const shell = container.querySelector('.adv-inline-shell');
        Assert.strictEqual(shell.previousSibling.nodeValue, "Testo\u200B");
        Assert.strictEqual(shell.nextSibling.nodeValue, "\u200BTesto");
    });

    test("EnsureInlineWidgetBuffers: garantisce cuscinetto \\u200B per checklist e snippet vuoti", () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <ul><li class="adv-checklist-item"><span class="checklist-text"></span></li></ul>
            <span class="snippet-text"></span>
        `;

        Editor.ensureInlineWidgetBuffers(container);

        Assert.strictEqual(container.querySelector('.checklist-text').textContent, '\u200B');
        Assert.strictEqual(container.querySelector('.snippet-text').textContent, '\u200B');
    });

    // =========================================================================
    // 5. MINIFICAZIONE PER STORAGE FISICO (Editor.minifyHTMLForStorage)
    // =========================================================================

    test("MinifyHTMLForStorage: disattiva gli attributi src degli iframe trasformandoli in data-src", () => {
        const html = `<p>Video</p><iframe src="https://www.youtube.com/embed/12345"></iframe>`;
        const minified = Editor.minifyHTMLForStorage(html);

        Assert.isFalse(minified.includes(' src="https://www.youtube.com/embed/12345"'));
        Assert.isTrue(minified.includes('data-src="https://www.youtube.com/embed/12345"'));

        const doc = new DOMParser().parseFromString(minified, 'text/html');
        const ifr = doc.querySelector('iframe');
        Assert.isNotNull(ifr);
        Assert.isFalse(ifr.hasAttribute('src'));
        Assert.strictEqual(ifr.getAttribute('data-src'), 'https://www.youtube.com/embed/12345');
    });

    test("MinifyHTMLForStorage: rimuove attributo src da immagini e audio con riferimenti ad asset fisici", () => {
        const html = `
            <img src="blob:http://localhost/abc" data-image-ref="img_123.webp">
            <audio src="blob:http://localhost/def" data-audio-ref="aud_456.mp3"></audio>
        `;
        const minified = Editor.minifyHTMLForStorage(html);

        Assert.isFalse(minified.includes('blob:http://localhost/abc'));
        Assert.isFalse(minified.includes('blob:http://localhost/def'));
        Assert.isTrue(minified.includes('data-image-ref="img_123.webp"'));
        Assert.isTrue(minified.includes('data-audio-ref="aud_456.mp3"'));
    });

    test("MinifyHTMLForStorage: svuota l'HTML runtime dei widget complessi (database, code, journal)", () => {
        const html = `
            <div id="adv_tbl_1" class="adv-widget-shell" data-widget-type="database">
                <table><tr><td>Dato da deidratare</td></tr></table>
            </div>
            <div id="adv_code_2" class="adv-widget-shell" data-widget-type="code">
                <pre>const x = 10;</pre>
            </div>
        `;
        const minified = Editor.minifyHTMLForStorage(html);

        Assert.isTrue(minified.includes('id="adv_tbl_1"'));
        Assert.isTrue(minified.includes('id="adv_code_2"'));
        Assert.isFalse(minified.includes("Dato da deidratare"));
        Assert.isFalse(minified.includes("const x = 10;"));
    });

    test("MinifyHTMLForStorage: svuota citation-body per preservare la transclusion dinamica", () => {
        const html = `
            <blockquote id="cit_1" class="adv-widget-shell" data-widget-type="citation" data-ref-note="note_99">
                <div class="citation-body">Testo citato vecchio</div>
            </blockquote>
        `;
        const minified = Editor.minifyHTMLForStorage(html);

        Assert.isFalse(minified.includes("Testo citato vecchio"));
        Assert.isTrue(minified.includes('data-ref-note="note_99"'));
    });

    test("MinifyHTMLForStorage: rimuove marcatori di selezione multipla e ghost di sistema", () => {
        const html = `
            <p>Testo con <mark class="adv-multi-cursor">cursore attivo</mark></p>
            <span id="editor-undo-marker"></span>
            <span id="tab-start-marker"></span>
        `;
        const minified = Editor.minifyHTMLForStorage(html);

        Assert.isFalse(minified.includes("adv-multi-cursor"));
        Assert.isFalse(minified.includes("editor-undo-marker"));
        Assert.isFalse(minified.includes("tab-start-marker"));
        Assert.isTrue(minified.includes("Testo con cursore attivo"));
    });

    test("MinifyHTMLForStorage: rispetta il flag keepHistoryMarker per history-undo-marker-temp", () => {
        const html = `<p>Prima<span id="history-undo-marker-temp"></span>Dopo</p>`;

        const minifiedWithout = Editor.minifyHTMLForStorage(html, false);
        Assert.isFalse(minifiedWithout.includes("history-undo-marker-temp"));

        const minifiedWith = Editor.minifyHTMLForStorage(html, true);
        Assert.isTrue(minifiedWith.includes("history-undo-marker-temp"));
    });

    // =========================================================================
    // 6. EVIDENZIAZIONE RICERCA (applyHighlight & cleanHighlightsBeforeSave)
    // =========================================================================

    test("ApplyHighlight: evidenzia termine di ricerca con tag mark.search-highlight", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p>VanillaDesk è uno strumento per sviluppatori.</p>`;

        Editor.applyHighlight(container, "sviluppatori");

        const mark = container.querySelector('mark.search-highlight');
        Assert.isNotNull(mark);
        Assert.strictEqual(mark.textContent, "sviluppatori");
    });

    test("ApplyHighlight: gestisce caratteri speciali regex nel termine cercato senza errori", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p>Prezzo: $100.00 (IVA inclusa [speciale])</p>`;

        Assert.doesNotThrow(() => {
            Editor.applyHighlight(container, "$100.00 (IVA inclusa [speciale])");
        });

        const mark = container.querySelector('mark.search-highlight');
        Assert.isNotNull(mark);
        Assert.strictEqual(mark.textContent, "$100.00 (IVA inclusa [speciale])");
    });

    test("ApplyHighlight: supporta ricerca multi-parola cross-node attraverso tag inline", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p>Testo con <b>parola</b> evidenziata insieme</p>`;

        Editor.applyHighlight(container, "parola evidenziata");

        const marks = container.querySelectorAll('mark.search-highlight');
        Assert.isTrue(marks.length >= 1);
        Assert.strictEqual(container.textContent, "Testo con parola evidenziata insieme");
    });

    test("CleanHighlightsBeforeSave: rimuove tutti i tag mark.search-highlight ripristinando testo intatto", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = `<p>Questo è un <mark class="search-highlight">testo ricercato</mark> da salvare.</p>`;

        Editor.cleanHighlightsBeforeSave();

        Assert.strictEqual(editor.querySelectorAll('mark.search-highlight').length, 0);
        Assert.strictEqual(editor.textContent.trim(), "Questo è un testo ricercato da salvare.");
    });

    // =========================================================================
    // 7. SANIFICAZIONE INTEGRALE DEL DOCUMENTO (Editor.sanitizeContent)
    // =========================================================================

    test("SanitizeContent: ripulisce attributi id e name non autorizzati lasciando intatti prefissi adv_", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = `
            <input id="random_unauthorized_id" name="user_name" value="test">
            <input id="adv_input_valid" value="valido">
        `;

        Editor.sanitizeContent();

        const input1 = editor.children[0];
        const input2 = editor.children[1];

        Assert.isFalse(input1.hasAttribute('id'));
        Assert.isFalse(input1.hasAttribute('name'));
        Assert.isTrue(input2.hasAttribute('id'));
        Assert.strictEqual(input2.id, "adv_input_valid");
    });

    test("SanitizeContent: forza contenteditable='false' su tutti i widget per prevenire corruzioni del DOM", () => {
        const editor = document.getElementById('noteContent');
        editor.innerHTML = `
            <div id="adv_tbl_test" class="adv-widget-shell" contenteditable="true"></div>
            <pre class="code-content" contenteditable="true">let x = 1;</pre>
        `;

        Editor.sanitizeContent();

        Assert.strictEqual(editor.querySelector('#adv_tbl_test').getAttribute('contenteditable'), 'false');
        Assert.strictEqual(editor.querySelector('.code-content').getAttribute('contenteditable'), 'false');
    });

    // =========================================================================
    // 8. SANIFICAZIONE DEEP DOM: WORD, GOOGLE DOCS, EXCEL & WEB (Editor.cleanDOMTree)
    // =========================================================================

    test("CleanDOMTree (Word): rimuove classi Mso e stili inline parassiti srotolando gli span vuoti", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p class="MsoNormal" style="margin-top:12.0pt; line-height:115%; font-family:'Calibri',sans-serif; mso-ascii-theme-font:minor-latin;"><span style="color:#1F497D;">Testo da Word</span></p>`;

        Editor.cleanDOMTree(container);

        const p = container.querySelector('p');
        Assert.isNotNull(p);
        Assert.isFalse(p.hasAttribute('class'));
        Assert.isFalse(p.hasAttribute('style'));
        Assert.strictEqual(container.querySelectorAll('span').length, 0);
        Assert.strictEqual(p.textContent.trim(), "Testo da Word");
    });

    test("CleanDOMTree (Word): elimina tag style e script alieni preservando solo il testo valido", () => {
        const container = document.createElement('div');
        container.innerHTML = `<style>p.MsoNormal { color: red; }</style><script>alert('office')</script><p>Contenuto Reale</p>`;

        Editor.cleanDOMTree(container);

        Assert.strictEqual(container.querySelectorAll('style').length, 0);
        Assert.strictEqual(container.querySelectorAll('script').length, 0);
        Assert.strictEqual(container.textContent.trim(), "Contenuto Reale");
    });

    test("CleanDOMTree (Google Docs): sanifica span con stili inline alieni (font-size, color, background) srotolandoli", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p><span style="font-size:11pt; font-family:Arial; color:#222222; background-color:transparent; font-weight:400;">Testo Docs</span></p>`;

        Editor.cleanDOMTree(container);

        const p = container.querySelector('p');
        Assert.isNotNull(p);
        Assert.strictEqual(container.querySelectorAll('span').length, 0);
        Assert.strictEqual(p.textContent.trim(), "Testo Docs");
    });

    test("CleanDOMTree (Google Docs): srotola tag b non consentiti o span parassiti privi di classi", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p><span style="font-weight: normal; font-size: 11pt;">Paragrafo pulito</span></p>`;

        Editor.cleanDOMTree(container);

        const p = container.querySelector('p');
        Assert.isNotNull(p);
        Assert.strictEqual(container.querySelectorAll('span').length, 0);
        Assert.strictEqual(p.textContent.trim(), "Paragrafo pulito");
    });

    test("CleanDOMTree (Excel / Fogli): rimuove attributi obsoleti da tabelle preservando colspan, rowspan e text-align", () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <table border="1" cellpadding="5" cellspacing="0" width="100%" bgcolor="#FFFFFF">
                <tbody>
                    <tr>
                        <td colspan="2" width="50%" bgcolor="#EFEFEF" style="text-align: center; border: 1px solid black; font-size: 10pt;">Intestazione Unita</td>
                    </tr>
                    <tr>
                        <td style="text-align: right; background-color: yellow;">100.00</td>
                        <td>Dato Normale</td>
                    </tr>
                </tbody>
            </table>
        `;

        Editor.cleanDOMTree(container);

        const td1 = container.querySelector('td[colspan="2"]');
        Assert.isNotNull(td1);
        Assert.isFalse(td1.hasAttribute('width'));
        Assert.isFalse(td1.hasAttribute('bgcolor'));
        Assert.strictEqual(td1.getAttribute('style'), 'text-align: center;');

        const td2 = container.querySelectorAll('td')[1];
        Assert.strictEqual(td2.getAttribute('style'), 'text-align: right;');

        const table = container.querySelector('table');
        Assert.isFalse(table.hasAttribute('border'));
        Assert.isFalse(table.hasAttribute('cellpadding'));
        Assert.isFalse(table.hasAttribute('cellspacing'));
        Assert.isFalse(table.hasAttribute('bgcolor'));
        Assert.isFalse(table.hasAttribute('width'));
    });

    test("CleanDOMTree (Web / CMS): srotola tag semantici complessi HTML5 (article, section, header, aside) in blocchi regolari", () => {
        const container = document.createElement('div');
        container.innerHTML = `<article><section><header><h2>Titolo Web</h2></header><p>Contenuto articolo web.</p></section></article>`;

        Editor.cleanDOMTree(container);

        Assert.strictEqual(container.querySelectorAll('article').length, 0);
        Assert.strictEqual(container.querySelectorAll('section').length, 0);
        Assert.strictEqual(container.querySelectorAll('header').length, 0);
        Assert.isNotNull(container.querySelector('h2'));
        Assert.isNotNull(container.querySelector('p'));
        Assert.strictEqual(container.querySelector('h2').textContent, "Titolo Web");
        Assert.strictEqual(container.querySelector('p').textContent, "Contenuto articolo web.");
    });

    test("CleanDOMTree (Web Legacy): converte tag font eliminando attributi obsoleti (color, face, size) e srotola lo span risultante", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p><font color="#ff0000" face="Verdana" size="4">Testo Vintage</font></p>`;

        Editor.cleanDOMTree(container);

        Assert.strictEqual(container.querySelectorAll('font').length, 0);
        Assert.strictEqual(container.querySelectorAll('span').length, 0);
        Assert.strictEqual(container.querySelector('p').textContent, "Testo Vintage");
    });

    test("CleanDOMTree (Web): ripulisce link <a> da script ed eventi inline ma preserva href e target", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p><a href="https://example.com" target="_blank" onclick="alert('xss')" style="color: blue; text-decoration: none;">Link Sicuro</a></p>`;

        Editor.cleanDOMTree(container);

        const a = container.querySelector('a');
        Assert.isNotNull(a);
        Assert.strictEqual(a.getAttribute('href'), 'https://example.com');
        Assert.strictEqual(a.getAttribute('target'), '_blank');
        Assert.isFalse(a.hasAttribute('onclick'));
        Assert.isFalse(a.hasAttribute('style'));
    });

    test("CleanDOMTree (Design System): preserva integralmente le classi autorizzate di VanillaDesk (hl-c*, tx-c*, ff-*, fs-*, tag-hash)", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p><span class="hl-c6 tx-c1 ff-serif fs-large">Testo Formattato VanillaDesk</span> <span class="tag-hash">#progetto</span></p>`;

        Editor.cleanDOMTree(container);

        const spans = container.querySelectorAll('span');
        Assert.strictEqual(spans.length, 2);
        Assert.isTrue(spans[0].classList.contains('hl-c6'));
        Assert.isTrue(spans[0].classList.contains('tx-c1'));
        Assert.isTrue(spans[0].classList.contains('ff-serif'));
        Assert.isTrue(spans[0].classList.contains('fs-large'));
        Assert.isTrue(spans[1].classList.contains('tag-hash'));
    });

    test("CleanDOMTree (Widget Shield): protegge integralmente i widget complessi senza alterarne il markup interno", () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <div id="adv_tbl_protetto" class="adv-widget-shell" data-widget-type="database">
                <div class="widget-header"><span class="widget-title">Database Clienti</span></div>
                <div class="widget-body"><table class="adv-table"><tbody><tr><td>Dato Intoccabile</td></tr></tbody></table></div>
            </div>
        `;

        Editor.cleanDOMTree(container);

        const widget = container.querySelector('#adv_tbl_protetto');
        Assert.isNotNull(widget);
        Assert.strictEqual(widget.getAttribute('data-widget-type'), 'database');
        Assert.isNotNull(widget.querySelector('.widget-title'));
        Assert.strictEqual(widget.querySelector('.widget-title').textContent, "Database Clienti");
    });

    test("SanitizeMiniText (Word & Web): sanifica testo complesso per note inline preservando b, i, u ed eliminando classi Mso", () => {
        const input = `<p class="MsoNormal" style="margin: 0cm;"><strong>Titolo Nota</strong></p><p style="margin: 0cm;">Descrizione con <em>corsivo</em> e <span style="text-decoration: underline;">sottolineato</span>.</p>`;
        const cleaned = Editor.sanitizeMiniText(input);

        Assert.isFalse(cleaned.includes("MsoNormal"));
        Assert.isFalse(cleaned.includes("<p"));
        Assert.isFalse(cleaned.includes("<span"));
        Assert.isTrue(cleaned.includes("<b>Titolo Nota</b>"));
        Assert.isTrue(cleaned.includes("<i>corsivo</i>"));
        Assert.isTrue(cleaned.includes("<u>sottolineato</u>"));
        Assert.isTrue(cleaned.includes("<b>Titolo Nota</b><br>Descrizione con <i>corsivo</i> e <u>sottolineato</u>."));
    });

    test("HealFontArtifacts (Web & Browser): rimuove span anonimi con font-size inline annidati nei paragrafi", () => {
        const container = document.createElement('div');
        container.innerHTML = `<p>Testo Normale <span style="font-size: 11pt;">con font-size parassita</span> seguito.</p>`;

        Editor.healFontArtifacts(container);

        Assert.strictEqual(container.querySelectorAll('span').length, 0);
        Assert.strictEqual(container.querySelector('p').textContent, "Testo Normale con font-size parassita seguito.");
    });

});