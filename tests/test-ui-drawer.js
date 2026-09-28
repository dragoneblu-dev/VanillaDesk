/**
 * tests/test-ui-drawer.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-drawer.js
 * Responsabilità: Apertura e chiusura Drawer laterale, stack storico di ritorno,
 * modalità trasparenza X-Ray (Ghost) e ancoraggio Destra/Sinistra (Dock).
 */

describe("UI Drawer: Pannello Laterale, Storico Schermate, Dock & Ghost", () => {

    const setupDrawerDOM = () => {
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
                <div class="adv-drawer-header">
                    <div id="advDrawerTitle"></div>
                </div>
                <div id="advDrawerBody" class="adv-drawer-body"></div>
                <div id="advDrawerFooter" class="adv-drawer-footer"></div>
            `;
            sandbox.appendChild(drawer);
        }
        drawer.className = 'adv-drawer';
        UI._drawerStack = [];
    };

    test("Drawer: Apertura e chiusura corretta con iniezione di contenuto e footer", () => {
        setupDrawerDOM();

        UI.openDrawer("Titolo Test", "<p>Corpo del pannello</p>", "<button id='btnTest'>Salva</button>");

        const drawer = document.getElementById('advGlobalDrawer');
        Assert.isTrue(drawer.classList.contains('open'));
        Assert.strictEqual(document.getElementById('advDrawerTitle').innerText, 'Titolo Test');
        Assert.isTrue(document.getElementById('advDrawerBody').innerHTML.includes('Corpo del pannello'));
        Assert.isTrue(document.getElementById('advDrawerFooter').innerHTML.includes('btnTest'));

        UI.closeDrawer();
        Assert.isFalse(drawer.classList.contains('open'));
    });

    test("Drawer: Storico a stack e navigazione all'indietro (LIFO)", () => {
        setupDrawerDOM();

        // 1. Apertura primo pannello
        UI.openDrawer("Livello 1", "<div>Contenuto 1</div>", "<button>Pulsante 1</button>");
        Assert.strictEqual(UI._drawerStack.length, 0);

        // 2. Apertura sottomenu su secondo livello (salva il primo nello stack)
        UI.openDrawer("Livello 2", "<div>Contenuto 2</div>", "<button>Pulsante 2</button>");
        Assert.strictEqual(UI._drawerStack.length, 1);
        Assert.strictEqual(UI._drawerStack[0].titleText, 'Livello 1');

        // 3. Navigazione indietro
        UI.goBackDrawer();
        Assert.strictEqual(UI._drawerStack.length, 0);
        Assert.strictEqual(document.getElementById('advDrawerTitle').innerText, 'Livello 1');
        Assert.isTrue(document.getElementById('advDrawerBody').innerHTML.includes('Contenuto 1'));
    });

    test("Drawer: Alternanza modalità X-Ray (Ghost Mode)", () => {
        setupDrawerDOM();
        const drawer = document.getElementById('advGlobalDrawer');
        drawer.classList.add('open');

        Assert.isFalse(drawer.classList.contains('ghost-mode'));

        UI.toggleDrawerGhost();
        Assert.isTrue(drawer.classList.contains('ghost-mode'));

        UI.toggleDrawerGhost();
        Assert.isFalse(drawer.classList.contains('ghost-mode'));
    });

    test("Drawer: Alternanza ancoraggio Destra / Sinistra (Dock Switcher)", () => {
        setupDrawerDOM();
        const drawer = document.getElementById('advGlobalDrawer');

        drawer.classList.remove('dock-right');
        UI.toggleDrawerDock();
        Assert.isTrue(drawer.classList.contains('dock-right'));

        UI.toggleDrawerDock();
        Assert.isFalse(drawer.classList.contains('dock-right'));
    });

});