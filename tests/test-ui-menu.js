/**
 * tests/test-ui-menu.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-menu.js
 * Responsabilità: Creazione menu contestuali dinamici, sub-menu a portale,
 * gestione divider, disabilitazione e chiusura centralizzata.
 */

describe("UI Menu: Menu Contestuali & Portali Submenu (test-ui-menu.js)", () => {

    const setupMenuDOM = () => {
        let sandbox = document.getElementById('testSandBox');
        if (!sandbox) {
            sandbox = document.createElement('div');
            sandbox.id = 'testSandBox';
            document.body.appendChild(sandbox);
        }

        let anchor = document.getElementById('menuAnchorBtn');
        if (!anchor) {
            anchor = document.createElement('button');
            anchor.id = 'menuAnchorBtn';
            anchor.innerText = 'Target';
            sandbox.appendChild(anchor);
        }
        UI.Menu.closeAll(true);
    };

    afterEach(() => {
        UI.Menu._preventClose = false;
        UI.Menu.closeAll(true);
    });

    test("Menu: Generazione menu contestuale da specifica e posizionamento", () => {
        setupMenuDOM();

        let clicked = false;
        const items = [
            { label: "Azione 1", onClick: () => { clicked = true; } },
            { type: "divider" },
            { label: "Azione Disabilitata", disabled: true }
        ];

        UI.Menu.buildContextMenu('menuAnchorBtn', items);

        const menuEl = document.querySelector('.adv-dropdown.adv-context-menu:not(.adv-submenu-portal)');
        Assert.isTrue(menuEl !== null);

        const menuItem = menuEl.querySelector('.adv-menu-item');
        Assert.isTrue(menuItem !== null);
        Assert.isTrue(menuItem.textContent.includes("Azione 1"));

        // Esecuzione click su voce
        menuItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        Assert.isTrue(clicked);
    });

    test("Menu: closeAll rimuove tutti i menu e portali aperti", () => {
        setupMenuDOM();

        UI.Menu.buildContextMenu('menuAnchorBtn', [{ label: "Voce Test" }]);
        Assert.isTrue(document.querySelector('.adv-dropdown.adv-context-menu') !== null);

        UI.Menu.closeAll(true);
        Assert.isTrue(document.querySelector('.adv-dropdown.adv-context-menu') === null);
    });

    test("Menu: closeAll rispetta il flag _preventClose a meno che force sia true", () => {
        setupMenuDOM();

        UI.Menu.buildContextMenu('menuAnchorBtn', [{ label: "Voce Protetta" }]);
        UI.Menu._preventClose = true;

        UI.Menu.closeAll(false);
        Assert.isNotNull(document.querySelector('.adv-dropdown.adv-context-menu'), "Non deve chiudersi con _preventClose attivo");

        UI.Menu.closeAll(true);
        Assert.isNull(document.querySelector('.adv-dropdown.adv-context-menu'), "Con force=true deve chiudersi ugualmente");
    });

    test("Menu: supporta voci con pericolo (danger), titolo (title), badge e scorciatoie da tastiera", () => {
        setupMenuDOM();

        const items = [
            { label: "Elimina", danger: true, title: "Elimina elemento", shortcut: "Ctrl+D" },
            { label: "Notifiche", badge: 5, badgeColor: "var(--danger-color)" },
            { type: "custom", html: "<div id='customMenuItem'>Custom HTML</div>" }
        ];

        UI.Menu.buildContextMenu('menuAnchorBtn', items);

        const menuEl = document.querySelector('.adv-dropdown.adv-context-menu:not(.adv-submenu-portal)');
        Assert.isNotNull(menuEl);

        const dangerItem = menuEl.querySelector('.adv-menu-item.danger');
        Assert.isNotNull(dangerItem);
        Assert.strictEqual(dangerItem.title, "Elimina elemento");
        Assert.isTrue(dangerItem.innerHTML.includes("Ctrl+D"));

        const badgeSpan = menuEl.querySelector('span[style*="border-radius:10px"]');
        Assert.isNotNull(badgeSpan);
        Assert.strictEqual(badgeSpan.textContent, "5");

        const customEl = menuEl.querySelector('#customMenuItem');
        Assert.isNotNull(customEl);
        Assert.strictEqual(customEl.textContent, "Custom HTML");
    });

    test("Menu: genera sottomenu ad albero con portale separato per item type submenu", () => {
        setupMenuDOM();

        const items = [
            {
                label: "Menu Padre",
                type: "submenu",
                items: [
                    { label: "Figlio 1" },
                    { label: "Figlio 2" }
                ]
            }
        ];

        UI.Menu.buildContextMenu('menuAnchorBtn', items);

        const menuEl = document.querySelector('.adv-dropdown.adv-context-menu:not(.adv-submenu-portal)');
        Assert.isNotNull(menuEl, "Il menu contestuale principale deve esistere");

        const parentItem = menuEl.querySelector('.adv-menu-item.has-submenu');
        Assert.isNotNull(parentItem, "La voce genitore nel menu principale deve avere classe has-submenu");

        const portal = document.querySelector('.adv-submenu-portal');
        Assert.isNotNull(portal, "Deve creare un elemento portale nel body per il sottomenu");
        Assert.strictEqual(portal._parentMenuItem, parentItem, "Il portale deve puntare al nodo genitore corretto");
    });

    test("Menu: positionAt assegna z-index elevato se l'ancora si trova dentro advRelationPeekModalOverlay", () => {
        const overlay = document.createElement('div');
        overlay.id = 'advRelationPeekModalOverlay';
        const innerBtn = document.createElement('button');
        innerBtn.id = 'innerPeakAnchor';
        overlay.appendChild(innerBtn);
        document.body.appendChild(overlay);

        const dropdown = document.createElement('div');
        dropdown.className = 'adv-dropdown';
        document.body.appendChild(dropdown);

        try {
            UI.Menu.positionAt(dropdown, 'innerPeakAnchor');
            Assert.strictEqual(dropdown.style.zIndex, '100005', "Deve elevare lo z-index dentro il modal peek");
        } finally {
            overlay.remove();
            dropdown.remove();
        }
    });

});