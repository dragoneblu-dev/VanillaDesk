/**
 * tests/test-export-manager.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: export-manager
 * Conteggio test case: 16
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("ExportManager: Markdown / HTML Translation & Pipe Tables (16 Test)", () => {

    test("MD to HTML: formattazioni inline grassetto, corsivo e sbarrato", () => {
            Assert.isTrue(ExportManager.parseMarkdownToHTML('**Grassetto**').includes('<b>Grassetto</b>'));
            Assert.isTrue(ExportManager.parseMarkdownToHTML('*Corsivo*').includes('<i>Corsivo</i>'));
            Assert.isTrue(ExportManager.parseMarkdownToHTML('~~Sbarrato~~').includes('<s>Sbarrato</s>'));
        });

    test("MD to HTML: gerarchia intestazioni H1-H3", () => {
            Assert.isTrue(ExportManager.parseMarkdownToHTML('# Titolo 1').includes('<h1>Titolo 1</h1>'));
            Assert.isTrue(ExportManager.parseMarkdownToHTML('## Titolo 2').includes('<h2>Titolo 2</h2>'));
            Assert.isTrue(ExportManager.parseMarkdownToHTML('### Titolo 3').includes('<h3>Titolo 3</h3>'));
        });

    test("MD to HTML: checklist attiva e inattiva", () => {
            const res = ExportManager.parseMarkdownToHTML('- [ ] Task da fare\n- [x] Task completato');
            Assert.isTrue(res.includes('class="adv-checklist-item"'));
            Assert.isTrue(res.includes('checked'));
        });

    test("MD to HTML: blocco citazione e collegamenti web", () => {
            Assert.isTrue(ExportManager.parseMarkdownToHTML('> Citazione').includes('<blockquote>Citazione</blockquote>'));
            Assert.isTrue(ExportManager.parseMarkdownToHTML('[VanillaDesk](https://test.com)').includes('<a href="https://test.com" target="_blank">VanillaDesk</a>'));
        });

    test("MD to HTML: elenchi numerati con conservazione del valore di partenza", () => {
            const res = ExportManager.parseMarkdownToHTML('5. Quinto Elemento\n6. Sesto Elemento');
            Assert.isTrue(res.includes('<ol start="5">') || res.includes('<ol start=\'5\'>'));
            Assert.isTrue(res.includes('<li>Quinto Elemento</li>'));
        });

    test("MD to HTML: parsing tabelle Markdown pipe syntax in tabelle semplici", () => {
            const mdTable = `
    | Nome | Ruolo |
    | --- | --- |
    | Mario | Lead |
    | Luigi | Dev |
            `;
            const html = ExportManager.parseMarkdownToHTML(mdTable);
            Assert.isTrue(html.includes('class="adv-widget-shell simple-table-wrapper"'));
            Assert.isTrue(html.includes('<th contenteditable="true">Nome</th>'));
            Assert.isTrue(html.includes('<td contenteditable="true">Mario</td>'));
        });

    test("HTML to MD: conversione tabelle semplici native in tabelle pipe Markdown", () => {
            const html = `
                <table>
                    <tr><th>Col A</th><th>Col B</th></tr>
                    <tr><td>10</td><td>20</td></tr>
                </table>
            `;
            const md = ExportManager.htmlToMarkdown(html, true);
            Assert.isTrue(md.includes('| Col A | Col B |'));
            Assert.isTrue(md.includes('| --- | --- |'));
            Assert.isTrue(md.includes('| 10 | 20 |'));
        });

    test("HTML to MD: gestione immagini e percorsi relativi assets/", () => {
            const html = '<img data-image-ref="img_diagram.png">';
            const mdWithImg = ExportManager.htmlToMarkdown(html, true);
            Assert.isTrue(mdWithImg.includes('![Immagine](assets/img_diagram.png)'));

            const mdWithoutImg = ExportManager.htmlToMarkdown(html, false);
            Assert.isFalse(mdWithoutImg.includes('assets/img_diagram.png'));
        });

    test("Markdown: celle di tabella con formattazioni inline multiple", () => {
            const mdTable = `
    | Nome | Formato |
    | --- | --- |
    | Test | **Grassetto** e *Corsivo* |
            `;
            const html = ExportManager.parseMarkdownToHTML(mdTable);
            Assert.isTrue(html.includes('<b>Grassetto</b>'));
            Assert.isTrue(html.includes('<i>Corsivo</i>'));
        });

    test("Markdown: tabelle con specificatori di allineamento a due punti (:---, :---:, ---:)", () => {
            const mdTable = `
    | Sinistra | Centro | Destra |
    | :--- | :---: | ---: |
    | 1 | 2 | 3 |
            `;
            const html = ExportManager.parseMarkdownToHTML(mdTable);
            Assert.isTrue(html.includes('simple-table-wrapper'));
            Assert.isTrue(html.includes('<td contenteditable="true">1</td>'));
        });

    test("Markdown: blocco codice con tag HTML viene incapsulato nel widget e preservato in RAM", () => {
            const mdCode = '```html\n<div class="test">Contenuto</div>\n```';
            const html = ExportManager.parseMarkdownToHTML(mdCode);
            Assert.isTrue(html.includes('class="adv-widget-shell widget-type-code code-wrapper"'));
            Assert.isFalse(html.includes('<div class="test">Contenuto</div>'));

            const blockIdMatch = html.match(/id="([^"]+)"/);
            Assert.isNotNull(blockIdMatch);
            const blockId = blockIdMatch[1];
            Assert.isTrue(AppState.databases[blockId].content.includes('<div class="test">Contenuto</div>'));
        });

    test("Markdown: blocco codice con backtick singoli interni preserva testo integro in RAM", () => {
            const mdCode = '```js\nconst x = `template_${id}`;\n```';
            const html = ExportManager.parseMarkdownToHTML(mdCode);
            const blockIdMatch = html.match(/id="([^"]+)"/);
            Assert.isNotNull(blockIdMatch);
            const blockId = blockIdMatch[1];
            Assert.isTrue(AppState.databases[blockId].content.includes('template_${id}'));
        });

    test("Markdown: htmlToMarkdown su checklist con testo vuoto non produce eccezioni", () => {
            const html = '<ul class="adv-checklist"><li class="adv-checklist-item"><input type="checkbox" class="adv-checklist-cb"><span class="checklist-text"></span></li></ul>';
            const md = ExportManager.htmlToMarkdown(html, false);
            Assert.isTrue(md.includes('- [ ]'));
        });

    test("Markdown: htmlToMarkdown converte correttamente appunti inline ^[...] ", () => {
            const html = '<p>Testo con appunto <span class="inline-note-wrapper"><span class="inline-note-data">Nota di glossario</span></span> fine.</p>';
            const md = ExportManager.htmlToMarkdown(html, false);
            Assert.isTrue(md.includes('^[Nota di glossario]'));
        });

    test("Markdown: htmlToMarkdown converte paragrafi vuoti in doppi newline corretti", () => {
            const html = '<p>Paragrafo 1</p><p><br></p><p>Paragrafo 2</p>';
            const md = ExportManager.htmlToMarkdown(html, false);
            Assert.isTrue(md.includes('Paragrafo 1\n\nParagrafo 2'));
        });

    test("Markdown: parseMarkdownToHTML converte elenchi numerati con valore start diverso da 1", () => {
            const mdList = "10. Decimo punto\n11. Undicesimo punto";
            const html = ExportManager.parseMarkdownToHTML(mdList);
            Assert.isTrue(html.includes('start="10"') || html.includes("start='10'"));
            Assert.isTrue(html.includes('<li>Decimo punto</li>'));
        });

});
