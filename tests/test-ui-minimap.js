/**
 * tests/test-ui-minimap.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-minimap.js
 * Responsabilità: Rendering della minimappa, sincronizzazione viewport,
 * prevenzione collisione ID e NAME duplicati nel DOM clonato.
 */

describe("UI Minimap: Sincronizzazione Documento & Isolamento DOM", () => {

    const setupMinimapDOM = () => {
        let sandbox = document.getElementById('testSandBox');
        if (!sandbox) {
            sandbox = document.createElement('div');
            sandbox.id = 'testSandBox';
            document.body.appendChild(sandbox);
        }

        let container = document.getElementById('minimapContainer');
        if (container) {
            container.remove();
        }

        container = document.createElement('div');
        container.id = 'minimapContainer';
        container.className = 'hidden';
        container.innerHTML = `
            <div id="minimapContentWrapper">
                <div id="minimapContent"></div>
            </div>
            <div id="minimapViewport"></div>
        `;
        sandbox.appendChild(container);

        let scrollContent = document.getElementById('editorScrollContent');
        if (!scrollContent) {
            scrollContent = document.createElement('div');
            scrollContent.id = 'editorScrollContent';
            sandbox.appendChild(scrollContent);
        }
        
        // Re-iniezione controllata del markup preservando sempre #noteContent
        scrollContent.innerHTML = `
            <input id="noteTitle" value="Titolo Test">
            <div id="noteContent" class="editor-content"><p id="par_1">Testo paragrafo</p></div>
        `;

        AppState.showMinimap = false;
    };

    test("Minimap: Toggle attiva e disattiva la visualizzazione nel DOM", () => {
        setupMinimapDOM();
        const container = document.getElementById('minimapContainer');

        UI.Minimap.toggle();
        Assert.isTrue(AppState.showMinimap);
        Assert.isFalse(container.classList.contains('hidden'));

        UI.Minimap.toggle();
        Assert.isFalse(AppState.showMinimap);
        Assert.isTrue(container.classList.contains('hidden'));
    });

    test("Minimap: Sync converte gli attributi ID in data-mini-id per evitare collisioni", () => {
        setupMinimapDOM();
        AppState.showMinimap = true;

        UI.Minimap.sync();

        const mini = document.getElementById('minimapContent');
        Assert.isTrue(mini.innerHTML.includes('data-mini-id="noteTitle"'));
        Assert.isTrue(mini.innerHTML.includes('data-mini-id="par_1"'));
        
        // Non devono essere presenti duplicati con id puro
        Assert.strictEqual(mini.querySelector('#par_1'), null);
    });

    test("Minimap: Calcolo geometrico e aggiornamento della viewport (updateViewport)", () => {
        setupMinimapDOM();
        AppState.showMinimap = true;

        const scrollContent = document.getElementById('editorScrollContent');
        const viewport = document.getElementById('minimapViewport');
        const container = document.getElementById('minimapContainer');
        const wrapper = document.getElementById('minimapContentWrapper');

        Assert.isTrue(viewport !== null);
        Assert.isTrue(container !== null);
        Assert.isTrue(wrapper !== null);

        // Simula le dimensioni dell'editor reale
        Object.defineProperty(scrollContent, 'scrollHeight', { value: 2000, configurable: true });
        Object.defineProperty(scrollContent, 'clientHeight', { value: 500, configurable: true });
        Object.defineProperty(scrollContent, 'scrollTop', { value: 400, configurable: true, writable: true });

        // Imposta una scala discreta controllata (0.1)
        UI.Minimap.scale = 0.1;
        UI.Minimap.updateViewport();

        // Con scala 0.1:
        // viewportHeight = 500 * 0.1 = 50px
        // viewportTop = 400 * 0.1 = 40px
        Assert.strictEqual(viewport.style.height, '50px');
        Assert.strictEqual(viewport.style.top, '40px');
    });

    test("Minimap: Isolamento contro la duplicazione degli attributi NAME di input", () => {
        setupMinimapDOM();
        AppState.showMinimap = true;

        const scrollContent = document.getElementById('editorScrollContent');
        scrollContent.innerHTML = `
            <input id="unique_field" name="client_email" value="info@example.com">
            <div id="noteContent" class="editor-content"><p>Testo</p></div>
        `;

        UI.Minimap.sync();

        const mini = document.getElementById('minimapContent');

        // L'attributo name nativo deve essere convertito per non confondere il browser autofill
        Assert.isTrue(mini.innerHTML.includes('data-mini-name="client_email"'));
        Assert.strictEqual(mini.querySelector('input[name="client_email"]'), null);
    });

});