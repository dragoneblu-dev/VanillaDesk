/**
 * tests/test-editor-paste-parser.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: js/editor-paste-parser.js
 */

describe("EditorPasteParser: Parser Plain Text, Word, Excel, RTF e Immagini (test-editor-paste-parser.js)", () => {

    test("_formatTextToInlineHTML: converte caratteri speciali, tab, spazi multipli e a capo", () => {
        Assert.strictEqual(Editor._formatTextToInlineHTML(""), "");
        Assert.strictEqual(Editor._formatTextToInlineHTML(null), "");
        Assert.strictEqual(
            Editor._formatTextToInlineHTML("<tag>\t  x\r\ny"),
            "&lt;tag&gt;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;x<br>y"
        );
    });

    test("_formatPlainTextForHTML: distingue riga singola inline da blocchi multi-riga ed elenchi", () => {
        Assert.strictEqual(Editor._formatPlainTextForHTML("Singola"), "Singola");

        const multi = Editor._formatPlainTextForHTML("Titolo\n- Voce 1\n* Voce 2\n1) Uno\n2. Due\n\nFine");
        Assert.isTrue(multi.includes("<p>Titolo</p>"));
        Assert.isTrue(multi.includes("<ul><li>Voce 1</li><li>Voce 2</li></ul>"));
        Assert.isTrue(multi.includes("<ol><li>Uno</li><li>Due</li></ol>"));
        Assert.isTrue(multi.includes("<p><br></p>"));
        Assert.isTrue(multi.includes("<p>Fine</p>"));
    });

    test("_convertWordListsToHTML: separa elenchi numerati e puntati contigui mantenendo intatti i paragrafi", () => {
        const doc = new DOMParser().parseFromString(`
            <p>Intro</p>
            <p class="MsoListParagraph"><span style="mso-list:Ignore">1. </span>Uno</p>
            <p class="MsoListParagraph"><span style="mso-list:Ignore">2. </span>Due</p>
            <p class="MsoListParagraph"><span style="mso-list:Ignore">• </span>Pallino</p>
            <p>Outro</p>
        `, 'text/html');

        Editor._convertWordListsToHTML(doc.body);

        Assert.strictEqual(doc.body.querySelectorAll('ol').length, 1);
        Assert.strictEqual(doc.body.querySelectorAll('ul').length, 1);
        Assert.strictEqual(doc.body.querySelectorAll('p').length, 2);
        Assert.strictEqual(doc.body.querySelector('ol').children.length, 2);
        Assert.strictEqual(doc.body.querySelector('ul').children.length, 1);
    });

    test("_isExcelOrSpreadsheetPaste: riconosce Excel, Google Sheets e TSV, escludendo documenti misti", () => {
        Assert.isTrue(Editor._isExcelOrSpreadsheetPaste('<html progid="Excel.Sheet"><table><tr><td>A</td></tr></table></html>', 'A'));
        Assert.isTrue(Editor._isExcelOrSpreadsheetPaste('<div data-sheets-root="1"><table><tr><td>B</td></tr></table></div>', 'B'));
        Assert.isTrue(Editor._isExcelOrSpreadsheetPaste(null, "A\tB\n1\t2"));
        Assert.isFalse(Editor._isExcelOrSpreadsheetPaste('<p>Testo Word</p><table><tr><td>A</td></tr></table>', 'Testo Word\nA'));
        Assert.isFalse(Editor._isExcelOrSpreadsheetPaste('<p>Solo testo</p>', 'Solo testo'));
    });

    test("_createSimpleTableFromExcel: genera griglia HTML o TSV, applica pulizia celle e scarta 1x1", () => {
        Assert.isNull(Editor._createSimpleTableFromExcel('<table><tr><td>1x1</td></tr></table>', '1x1'));

        const html = `<table><tr><th colspan="2">Testa</th></tr><tr><td><p>R1</p><p>R2</p></td><td></td></tr></table>`;
        const res = Editor._createSimpleTableFromExcel(html, "");
        Assert.isNotNull(res);
        Assert.isTrue(res.includes('colspan="2"'));
        Assert.isTrue(res.includes('R1<br>R2'));
        Assert.isTrue(res.includes('<td contenteditable="true"><br></td>'));

        const resTsv = Editor._createSimpleTableFromExcel(null, "A\tB\n1\t2");
        Assert.isTrue(resTsv.includes('<th contenteditable="true">A</th>'));
        Assert.isTrue(resTsv.includes('<td contenteditable="true">2</td>'));
    });

    test("_extractImagesFromWordRTF: estrae immagini JPEG e PNG ignorando blocchi non validi", () => {
        Assert.strictEqual(Editor._extractImagesFromWordRTF(null).length, 0);
        Assert.strictEqual(Editor._extractImagesFromWordRTF("{\\rtf1 testo senza immagini}").length, 0);

        const hexDummy = "00".repeat(40);
        const rtf = `{\\pict\\pngblip 89504e47${hexDummy}} {\\pict\\jpegblip ffd8ff${hexDummy}} {\\pict\\wmfblip ${hexDummy}}`;
        const blobs = Editor._extractImagesFromWordRTF(rtf);
        Assert.strictEqual(blobs.length, 2);
        Assert.strictEqual(blobs[0].type, 'image/png');
        Assert.strictEqual(blobs[1].type, 'image/jpeg');
    });

    test("saveImageSource: gestisce input non validi senza eccezioni", async () => {
        Assert.isNull(await Editor.saveImageSource(null));
        Assert.isNull(await Editor.saveImageSource("invalid_source"));
        Assert.isNull(await Editor.saveImageSource(new Blob(["testo"], { type: 'text/plain' })));
    });

});