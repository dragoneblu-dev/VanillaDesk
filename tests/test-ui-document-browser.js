/**
 * tests/test-ui-document-browser.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-document-browser
 */

describe("UI Document Browser: Esplorazione Gerarchica & Anteprime (test-ui-document-browser.js)", () => {

    beforeEach(() => {
        let sandbox = document.getElementById('testSandBox');
        if (!sandbox) {
            sandbox = document.createElement('div');
            sandbox.id = 'testSandBox';
            document.body.appendChild(sandbox);
        }

        let drawer = document.getElementById('advGlobalDrawer');
        if (!drawer) {
            drawer = document.createElement('div');
            drawer.id = 'advGlobalDrawer';
            drawer.className = 'adv-drawer';
            drawer.innerHTML = `
                <div class="adv-drawer-header"><div id="advDrawerTitle"></div></div>
                <div id="advDrawerBody" class="adv-drawer-body"></div>
                <div id="advDrawerFooter" class="adv-drawer-footer"></div>
            `;
            sandbox.appendChild(drawer);
        }

        AppState.notes = [
            { id: 'note_1', parentId: null, title: 'Architettura Software', content: '<h2 id="sec_moduli">Moduli</h2><p id="p_desc">Descrizione architettura</p>' },
            { id: 'note_2', parentId: 'note_1', title: 'Database Relazionale', content: '<p>Tabelle e viste</p>' }
        ];

        UI.DocumentBrowser.expandedNodes.clear();
        UI.DocumentBrowser.allItems = [];
    });

    afterEach(() => {
        UI.closeDrawer(true);
        UI.DocumentBrowser.hidePreview();
    });

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

    test("UI.DocumentBrowser: open adatta il placeholder in base a link o citation", async () => {
        UI.DocumentBrowser.open('link', "Inserisci Link", () => {});
        await new Promise(r => setTimeout(r, 60));

        let input = document.getElementById('docBrowserSearch');
        Assert.strictEqual(input.placeholder, I18n.t('doc_browser.search_placeholder_link'));

        UI.DocumentBrowser.open('citation', "Inserisci Citazione", () => {});
        await new Promise(r => setTimeout(r, 60));

        input = document.getElementById('docBrowserSearch');
        Assert.strictEqual(input.placeholder, I18n.t('doc_browser.search_placeholder_citation'));
    });

    test("UI.DocumentBrowser: expandToTarget espande tutti i nodi antenati per focalizzare il target", () => {
        UI.DocumentBrowser.populate();

        UI.DocumentBrowser.expandToTarget({ noteId: 'note_2' });

        // note_2 è figlia di note_1, quindi docb_note_1 deve essere in expandedNodes
        Assert.isTrue(UI.DocumentBrowser.expandedNodes.has('docb_note_1'));
    });

    test("UI.DocumentBrowser: createAndSelectNote crea nuova nota bozza e la restituisce alla callback", () => {
        let createdResult = null;
        UI.DocumentBrowser.callback = (item) => { createdResult = item; };
        AppState.currentNoteId = 'note_1';

        UI.DocumentBrowser.createAndSelectNote('Nuovo Capitolo');

        Assert.isNotNull(createdResult);
        Assert.strictEqual(createdResult.title, 'Nuovo Capitolo');
        Assert.strictEqual(createdResult.refType, 'note');

        const newNoteInState = Store.getNote(createdResult.noteId);
        Assert.isNotNull(newNoteInState);
        Assert.strictEqual(newNoteInState.parentId, 'note_1', "Deve essere creata come sotto-nota della nota aperta");
        Assert.isTrue(newNoteInState._isDraft);
    });

    test("UI.DocumentBrowser: filter isola i risultati della ricerca e propaga solo i genitori pertinenti", () => {
        UI.DocumentBrowser.populate();

        UI.DocumentBrowser.filter("Database");

        const listEl = document.getElementById('docBrowserList');
        Assert.isNotNull(listEl);
        // note_1 deve comparire come genitore espanso di note_2
        Assert.isTrue(listEl.textContent.includes("Database Relazionale"));
    });

});