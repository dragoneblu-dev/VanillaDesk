/**
 * tests/test-ui-menu.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-menu.js
 * Responsabilità: Creazione menu contestuali dinamici, sub-menu a portale,
 * gestione divider, disabilitazione e chiusura centralizzata.
 */

describe("UI Menu: Menu Contestuali & Portali Submenu", () => {

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

    test("Menu: Generazione menu contestuale da specifica e posizionamento", () => {
        setupMenuDOM();

        let clicked = false;
        const items = [
            { label: "Azione 1", onClick: () => { clicked = true; } },
            { type: "divider" },
            { label: "Azione Disabilitata", disabled: true }
        ];

        UI.Menu.buildContextMenu('menuAnchorBtn', items);

        const menuEl = document.querySelector('.adv-dropdown.adv-context-menu');
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

});