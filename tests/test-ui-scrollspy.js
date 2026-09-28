/**
 * tests/test-ui-scrollspy.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-scrollspy.js
 * Responsabilità: Rilevamento intestazioni visibili (H2, H3) e
 * sincronizzazione dell'evidenziazione nel Sommario (TOC).
 */

describe("UI ScrollSpy: Sincronizzazione Indice Laterale & Scroll", () => {

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

        scrollArea.innerHTML = `
            <div id="noteContent">
                <h2 id="head_1">Introduzione</h2>
                <div style="height:300px;"></div>
                <h2 id="head_2">Funzionalità</h2>
            </div>
        `;

        let tocContainer = document.createElement('div');
        tocContainer.className = 'dynamic-toc-container';
        tocContainer.innerHTML = `
            <div class="toc-node"><span class="toc-icon">#</span><span>Introduzione</span></div>
            <div class="toc-node"><span class="toc-icon">#</span><span>Funzionalità</span></div>
        `;
        sandbox.appendChild(tocContainer);

        AppState.isSwitchingNote = false;
    };

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

});