/**
 * tests/test-ui-document-browser.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-document-browser
 * Conteggio test case: 7
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("UI Document Browser: Esplorazione Gerarchica & Anteprime (7 Test)", () => {

    test("UI.DocumentBrowser: _trimEmptyTrailingTags rimuove tag br e spazi finali", () => {
            const raw = "<p>Paragrafo utile</p><p><br></p><p>  </p>";
            const clean = UI.DocumentBrowser._trimEmptyTrailingTags(raw);
            Assert.strictEqual(clean, "<p>Paragrafo utile</p>");
        });

    test("UI.DocumentBrowser: _trimEmptyTrailingTags non elimina widget complessi in fondo alla citazione", () => {
            const raw = '<p>Testo</p><div class="adv-widget-shell widget-type-database"></div>';
            const clean = UI.DocumentBrowser._trimEmptyTrailingTags(raw);
            Assert.isTrue(clean.includes('adv-widget-shell'));
        });

    test("UI.DocumentBrowser: extractLiveHTML restituisce intero contenuto per refType === 'note'", () => {
            const html = "<h2>Cap 1</h2><p>Contenuto della nota</p>";
            const res = UI.DocumentBrowser.extractLiveHTML(html, null, 'note');
            Assert.isTrue(res.includes("Cap 1"));
            Assert.isTrue(res.includes("Contenuto della nota"));
        });

    test("UI.DocumentBrowser: extractLiveHTML estrae singolo elemento per ID specifico", () => {
            const html = '<p id="p_target">Paragrafo Target</p><p id="p_other">Altro</p>';
            const res = UI.DocumentBrowser.extractLiveHTML(html, 'p_target', 'element');
            Assert.isTrue(res.includes("Paragrafo Target"));
            Assert.isFalse(res.includes("Altro"));
        });

    test("UI.DocumentBrowser: extractLiveHTML avvolge elementi <li> nel proprio tag contenitore <ul>", () => {
            const html = '<ul><li id="li_target">Punto Elenco</li></ul>';
            const res = UI.DocumentBrowser.extractLiveHTML(html, 'li_target', 'element');
            Assert.isTrue(res.startsWith('<UL><li') || res.startsWith('<ul><li'));
        });

    test("UI.DocumentBrowser: extractLiveHTML per capitoli h2 estrae testo fino al prossimo h2 o superiore", () => {
            const html = '<h2 id="sec1">Sezione 1</h2><p>Testo 1</p><p>Testo 2</p><h2 id="sec2">Sezione 2</h2><p>Testo 3</p>';
            const res = UI.DocumentBrowser.extractLiveHTML(html, 'sec1', 'chapter');
            Assert.isTrue(res.includes("Sezione 1"));
            Assert.isTrue(res.includes("Testo 1"));
            Assert.isTrue(res.includes("Testo 2"));
            Assert.isFalse(res.includes("Sezione 2"));
            Assert.isFalse(res.includes("Testo 3"));
        });

    test("UI.DocumentBrowser: extractLiveHTML restituisce messaggio di errore se l'ID non esiste", () => {
            const html = '<p id="p1">Esistente</p>';
            const res = UI.DocumentBrowser.extractLiveHTML(html, 'p_inesistente', 'element');
            Assert.isTrue(res.includes("eliminato"));
        });

});
