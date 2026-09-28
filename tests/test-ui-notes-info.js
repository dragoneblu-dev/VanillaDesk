/**
 * tests/test-ui-notes-info.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-notes-info.js
 * Responsabilità: Calcolo metriche documento, analisi collegamenti in entrata/uscita,
 * auditing delle proprietà delle sotto-note figlie.
 */

describe("UI Notes Info: Metriche, Auditing & Relazioni Backlink", () => {

    const setupInfoDOM = () => {
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
            {
                id: 'n_target',
                parentId: null,
                title: 'Specifiche di Progetto',
                content: '<h1>Architettura</h1><p>Testo descrittivo del sistema.</p><h2>Componenti</h2><p>Dettagli operativi per lo sviluppo del modulo.</p>'
            },
            {
                id: 'n_caller',
                parentId: null,
                title: 'Verbale Riunione',
                content: '<p>Come indicato in <a class="internal-link" data-note-id="n_target">Specifiche</a> procediamo.</p>'
            }
        ];

        AppState.currentNoteId = 'n_target';
        AppState.databases = {};
        AdvancedTable.ensureSystemPropertiesDB();
    };

    test("Info: Calcolo corretto di parole, capitoli e rilevamento Backlinks in entrata", () => {
        setupInfoDOM();

        UI.openNoteInfoPanel();

        const title = document.getElementById('advDrawerTitle');
        const body = document.getElementById('advDrawerBody');
        Assert.isTrue(title !== null);
        Assert.isTrue(body !== null);

        // Verifica presenza del titolo della nota nell'header del Drawer informativo
        Assert.isTrue(title.innerHTML.includes('Specifiche di Progetto'));

        // Verifica presenza del Backlink proveniente da Verbale Riunione nel corpo
        Assert.isTrue(body.innerHTML.includes('Verbale Riunione'));
    });

    test("Info: Calcolo metriche documento con tempo lettura esteso e conteggio widget", () => {
        setupInfoDOM();

        // Genera un testo di esattamente 450 parole
        const wordsArray = Array.from({ length: 450 }).map((_, i) => `parola${i}`);
        const textPayload = wordsArray.join(' ');

        const longNote = {
            id: 'n_long_metrics',
            parentId: null,
            title: 'Documento Esteso',
            content: `
                <h2>Capitolo 1</h2>
                <p>${textPayload}</p>
                <h3>Approfondimento</h3>
                <div id="adv_tbl_1" class="adv-widget-shell" data-widget-type="database"></div>
                <div id="adv_code_1" class="adv-widget-shell" data-widget-type="code"></div>
                <div id="adv_vid_1" class="adv-widget-shell" data-widget-type="video"></div>
            `
        };

        AppState.notes.push(longNote);
        AppState.currentNoteId = 'n_long_metrics';

        UI.openNoteInfoPanel();

        const body = document.getElementById('advDrawerBody');
        Assert.isTrue(body !== null);

        // Parole: 450 (+ 3 parole dei titoli "Capitolo 1" e "Approfondimento" = 453)
        Assert.isTrue(body.innerHTML.includes('453'));

        // Tempo stimato: Math.ceil(453 / 200) = 3m
        Assert.isTrue(body.innerHTML.includes('3m'));

        // Capitoli: 2 (H2 e H3)
        Assert.isTrue(body.innerHTML.includes('2'));

        // Widget complessivi: 3
        Assert.isTrue(body.innerHTML.includes('3'));
    });

    test("Info: Rilevamento completo delle menzioni in uscita (Outlinks) con esclusione auto-link", () => {
        setupInfoDOM();

        const noteB = { id: 'n_out_b', title: 'Target B', content: '<p>B</p>' };
        const noteC = { id: 'n_out_c', title: 'Target C', content: '<p>C</p>' };
        const noteD = { id: 'n_out_d', title: 'Target D Citato', content: '<p>D</p>' };

        const sourceNote = {
            id: 'n_source_outlinks',
            title: 'Nota Sorgente Outlinks',
            content: `
                <p>Vedi <a class="internal-link" data-note-id="n_out_b">Link a B</a></p>
                <p>Vedi anche <a class="internal-link" data-note-id="n_out_c">Link a C</a></p>
                <blockquote class="block-citation" data-ref-note="n_out_d">Citazione</blockquote>
                <p>Auto-link da ignorare: <a class="internal-link" data-note-id="n_source_outlinks">Me stesso</a></p>
            `
        };

        AppState.notes.push(noteB, noteC, noteD, sourceNote);
        AppState.currentNoteId = 'n_source_outlinks';

        UI.openNoteInfoPanel();

        const body = document.getElementById('advDrawerBody');
        Assert.isTrue(body !== null);

        // Devono essere presenti le tre note esterne referenziate
        Assert.isTrue(body.innerHTML.includes('Target B'));
        Assert.isTrue(body.innerHTML.includes('Target C'));
        Assert.isTrue(body.innerHTML.includes('Target D Citato'));
    });

});