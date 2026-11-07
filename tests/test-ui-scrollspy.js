/**
 * tests/test-ui-scrollspy.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-scrollspy.js
 * Responsabilità: Rilevamento intestazioni visibili (H1, H2, H3) e
 * sincronizzazione dell'evidenziazione nel Sommario (TOC).
 */

describe("UI ScrollSpy: Sincronizzazione Indice Laterale & Scroll (test-ui-scrollspy.js)", () => {

    const setupScrollSpyDOM = () => {
        let sandbox = document.getElementById('testSandBox');
        if (!sandbox) {
            sandbox = document.createElement('div');
            sandbox.id = 'testSandBox';
            document.body.appendChild(sandbox);
        }

        let scrollArea = document.getElementById('editorScrollContent');
        if (!scrollArea) {
            scrollArea = document.createElement('div');
            scrollArea.id = 'editorScrollContent';
            scrollArea.className = 'editor-scroll-content';
            sandbox.appendChild(scrollArea);
        }

        scrollArea.getBoundingClientRect = () => ({
            top: 100,
            bottom: 600,
            height: 500
        });

        scrollArea.innerHTML = `
            <div id="noteContent">
                <h2 id="head_1">Introduzione</h2>
                <div style="height:300px;"></div>
                <h2 id="head_2">Funzionalità</h2>
            </div>
        `;

        const oldToc = sandbox.querySelector('.dynamic-toc-container');
        if (oldToc) oldToc.remove();

        let tocContainer = document.createElement('div');
        tocContainer.className = 'dynamic-toc-container';
        tocContainer.innerHTML = `
            <div class="toc-node" id="toc_1"><span class="toc-icon">#</span><span>Introduzione</span></div>
            <div class="toc-node" id="toc_2"><span class="toc-icon">#</span><span>Funzionalità</span></div>
        `;
        sandbox.appendChild(tocContainer);

        let treeContainer = document.getElementById('treeContainer');
        if (!treeContainer) {
            treeContainer = document.createElement('div');
            treeContainer.id = 'treeContainer';
            sandbox.appendChild(treeContainer);
        }
        treeContainer.getBoundingClientRect = () => ({ top: 100, bottom: 600 });

        AppState.isSwitchingNote = false;
    };

    afterEach(() => {
        const toc = document.querySelector('.dynamic-toc-container');
        if (toc) toc.remove();
        AppState.isSwitchingNote = false;
    });

    test("ScrollSpy: Evidenzia il titolo corrente in lettura senza sollevare eccezioni", () => {
        setupScrollSpyDOM();

        let error = false;
        try {
            UI.updateTOCScrollSpy();
        } catch (e) {
            error = true;
        }

        Assert.isFalse(error);
        const nodes = document.querySelectorAll('.dynamic-toc-container .toc-node');
        Assert.strictEqual(nodes.length, 2);
    });

    test("ScrollSpy: early-exit immediato quando isSwitchingNote è true", () => {
        setupScrollSpyDOM();
        AppState.isSwitchingNote = true;

        const h1 = document.getElementById('head_1');
        h1.getBoundingClientRect = () => ({ top: 110, bottom: 140 });

        UI.updateTOCScrollSpy();

        const toc1 = document.getElementById('toc_1');
        Assert.strictEqual(toc1.style.color, '', "Non deve alterare gli stili durante il cambio nota");
    });

    test("ScrollSpy: evidenzia il nodo TOC il cui header ha superato la linea triggerLine", () => {
        setupScrollSpyDOM();

        // triggerLine = areaRect.top + (500 * 0.2) = 100 + 100 = 200
        const h1 = document.getElementById('head_1');
        const h2 = document.getElementById('head_2');

        // h1 ha superato triggerLine (top 150 <= 200)
        h1.getBoundingClientRect = () => ({ top: 150, bottom: 180 });
        // h2 si trova ancora sotto (top 350 > 200)
        h2.getBoundingClientRect = () => ({ top: 350, bottom: 380 });

        UI.updateTOCScrollSpy();

        const toc1 = document.getElementById('toc_1');
        const toc2 = document.getElementById('toc_2');

        Assert.strictEqual(toc1.style.color, 'var(--accent-color)');
        Assert.strictEqual(toc1.style.fontWeight, 'bold');
        Assert.strictEqual(toc2.style.color, '');
        Assert.strictEqual(toc2.style.fontWeight, '');
    });

    test("ScrollSpy: quando un header successivo supera la soglia, sposta l'evidenziazione e resetta i precedenti", () => {
        setupScrollSpyDOM();

        const h1 = document.getElementById('head_1');
        const h2 = document.getElementById('head_2');

        // Entrambi sopra la soglia: il più in basso (h2) deve vincere
        h1.getBoundingClientRect = () => ({ top: 50, bottom: 80 });
        h2.getBoundingClientRect = () => ({ top: 180, bottom: 210 });

        UI.updateTOCScrollSpy();

        const toc1 = document.getElementById('toc_1');
        const toc2 = document.getElementById('toc_2');

        Assert.strictEqual(toc1.style.color, '');
        Assert.strictEqual(toc1.style.fontWeight, '');
        Assert.strictEqual(toc2.style.color, 'var(--accent-color)');
        Assert.strictEqual(toc2.style.fontWeight, 'bold');
    });

    test("ScrollSpy: invoca scrollIntoView sul nodo TOC se questo eccede i confini di treeContainer", () => {
        setupScrollSpyDOM();

        const h2 = document.getElementById('head_2');
        h2.getBoundingClientRect = () => ({ top: 180, bottom: 210 });

        const toc2 = document.getElementById('toc_2');
        // Posizionato oltre il fondo del treeContainer (bottom 650 > 600)
        toc2.getBoundingClientRect = () => ({ top: 620, bottom: 650 });

        let scrolled = false;
        toc2.scrollIntoView = () => { scrolled = true; };

        UI.updateTOCScrollSpy();

        Assert.isTrue(scrolled, "Deve far scorrere la sidebar per mantenere visibile il capitolo");
    });

});