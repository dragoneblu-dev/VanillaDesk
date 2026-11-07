/**
 * tests/test-ui-drawer.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-drawer.js
 * Responsabilità: Apertura e chiusura Drawer laterale, stack storico di ritorno,
 * modalità trasparenza X-Ray (Ghost) e ancoraggio Destra/Sinistra (Dock).
 */

describe("UI Drawer: Pannello Laterale, Storico Schermate, Dock & Ghost (test-ui-drawer.js)", () => {

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

    afterEach(() => {
        if (typeof UI !== 'undefined' && typeof UI.closeDrawer === 'function') {
            UI.closeDrawer(true);
        }
    });

    test("Drawer: Apertura e chiusura corretta con iniezione di contenuto e footer", () => {
        setupDrawerDOM();

        UI.openDrawer("Titolo Test", "<p>Corpo del pannello</p>", "<button id='btnTest'>Salva</button>");

        const drawer = document.getElementById('advGlobalDrawer');
        Assert.isTrue(drawer.classList.contains('open'));
        Assert.strictEqual(document.getElementById('advDrawerTitle').innerText, 'Titolo Test');
        Assert.isTrue(document.getElementById('advDrawerBody').innerHTML.includes('Corpo del pannello'));
        Assert.isTrue(document.getElementById('advDrawerFooter').innerHTML.includes('btnTest'));

        UI.closeDrawer(true);
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

    test("Drawer: goBackDrawer emette l'evento globale 'drawer-restored'", () => {
        setupDrawerDOM();

        let restoredEventFired = false;
        let restoredTitle = '';

        const handler = (e) => {
            restoredEventFired = true;
            restoredTitle = e.detail?.titleText;
        };
        document.addEventListener('drawer-restored', handler);

        try {
            UI.openDrawer("Schermata A", "<div>A</div>");
            UI.openDrawer("Schermata B", "<div>B</div>");
            UI.goBackDrawer();

            Assert.isTrue(restoredEventFired);
            Assert.strictEqual(restoredTitle, "Schermata A");
        } finally {
            document.removeEventListener('drawer-restored', handler);
        }
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

    test("Drawer: closeDrawer blocca la chiusura se advLongTextInput è stato modificato e l'utente rifiuta lo scarto", () => {
        setupDrawerDOM();

        const bodyHTML = `
            <textarea id="advLongTextInput" data-original-value="Testo Iniziale">Testo Modificato</textarea>
        `;
        UI.openDrawer("Modifica Testo", bodyHTML, "<button>Salva</button>");

        const origConfirm = window.confirm;
        window.confirm = () => false; // Rifiuta lo scarto delle modifiche

        try {
            UI.closeDrawer(false);
            const drawer = document.getElementById('advGlobalDrawer');
            Assert.isTrue(drawer.classList.contains('open'), "Il drawer deve rimanere aperto se l'utente rifiuta lo scarto");
        } finally {
            window.confirm = origConfirm;
        }
    });

    test("Drawer: Ctrl+Enter attiva il pulsante primario nel footer del drawer", () => {
        setupDrawerDOM();

        let primaryClicked = false;
        const footerHTML = `
            <button class="btn btn-primary" id="btnTestSave">Salva</button>
        `;
        UI.openDrawer("Test Shortcut", "<div>Test</div>", footerHTML);

        const btnSave = document.getElementById('btnTestSave');
        btnSave.onclick = () => { primaryClicked = true; };

        const drawer = document.getElementById('advGlobalDrawer');
        drawer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));

        Assert.isTrue(primaryClicked, "Ctrl+Enter deve attivare il pulsante primario");
    });

});