/**
 * tests/test-ui-trash.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-trash.js
 * Responsabilità: Gestione note cestinate, ripristino nello stato attivo,
 * hard delete permanente ricorsivo e svuotamento del cestino.
 */

describe("UI Trash: Gestione Cestino & Garbage Collection", () => {

    const setupTrashDOM = () => {
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
            { id: 'n_live', parentId: null, title: 'Nota Attiva', content: '<p>A</p>' },
            { id: 'n_trash1', parentId: null, title: 'Bozza 1', content: '<p>B</p>', deletedAt: Date.now() - 5000 },
            { id: 'n_trash2', parentId: null, title: 'Bozza 2', content: '<p>C</p>', deletedAt: Date.now() }
        ];

        AdvancedTable.ensureSystemPropertiesDB();
    };

    test("Trash: Apertura cestino elenca unicamente le note eliminate", () => {
        setupTrashDOM();

        UI.Trash.open();

        const body = document.getElementById('advDrawerBody');
        Assert.isTrue(body.innerHTML.includes('Bozza 1'));
        Assert.isTrue(body.innerHTML.includes('Bozza 2'));
        Assert.isFalse(body.innerHTML.includes('Nota Attiva'));
    });

    test("Trash: Ripristino rimuove il flag deletedAt e re-inserisce la nota tra quelle attive", () => {
        setupTrashDOM();

        UI.Trash.restore('n_trash1');

        const restored = Store.getNote('n_trash1');
        Assert.isTrue(restored !== null);
        Assert.isTrue(restored.deletedAt === undefined);
    });

    test("Trash: Eliminazione permanente cancella fisicamente la nota dalla memoria", () => {
        setupTrashDOM();

        UI.Trash.hardDelete('n_trash2', true);

        Assert.strictEqual(Store.getNote('n_trash2'), null);
        Assert.strictEqual(AppState.notes.length, 2);
    });

});
