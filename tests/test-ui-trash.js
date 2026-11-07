/**
 * tests/test-ui-trash.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-trash.js
 * Responsabilità: Gestione note cestinate, ripristino nello stato attivo,
 * hard delete permanente ricorsivo e svuotamento del cestino.
 */

describe("UI Trash: Gestione Cestino & Garbage Collection (test-ui-trash.js)", () => {

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

    afterEach(() => {
        if (typeof UI !== 'undefined' && typeof UI.closeDrawer === 'function') {
            UI.closeDrawer(true);
        }
    });

    test("Trash: Apertura cestino elenca unicamente le note eliminate", () => {
        setupTrashDOM();

        UI.Trash.open();

        const body = document.getElementById('advDrawerBody');
        Assert.isTrue(body.innerHTML.includes('Bozza 1'));
        Assert.isTrue(body.innerHTML.includes('Bozza 2'));
        Assert.isFalse(body.innerHTML.includes('Nota Attiva'));
    });

    test("Trash: visualizza stato vuoto se non vi sono note eliminate nè allegati orfani", async () => {
        setupTrashDOM();
        AppState.notes = [{ id: 'n_only', parentId: null, title: 'Attiva', content: '<p>A</p>' }];

        const origGetOrphans = Store.getOrphanedAssets;
        Store.getOrphanedAssets = async () => ({ count: 0, formattedSize: '0 Bytes', files: [] });

        try {
            await UI.Trash.open();
            const body = document.getElementById('advDrawerBody');
            Assert.isTrue(body.querySelector('.ui-empty-state') !== null);
        } finally {
            Store.getOrphanedAssets = origGetOrphans;
        }
    });

    test("Trash: Ripristino rimuove il flag deletedAt e re-inserisce la nota tra quelle attive", () => {
        setupTrashDOM();

        UI.Trash.restore('n_trash1');

        const restored = Store.getNote('n_trash1');
        Assert.isTrue(restored !== null);
        Assert.isTrue(restored.deletedAt === undefined);
    });

    test("Trash: Ripristino assegna parentId null se la nota madre risulta a sua volta nel Cestino", () => {
        setupTrashDOM();

        const trashedParent = { id: 'p_trash', parentId: null, title: 'Padre Cestinato', deletedAt: Date.now() };
        const trashedChild = { id: 'c_trash', parentId: 'p_trash', title: 'Figlio Cestinato', deletedAt: Date.now() };
        AppState.notes.push(trashedParent, trashedChild);

        UI.Trash.restore('c_trash');

        const restoredChild = Store.getNote('c_trash');
        Assert.strictEqual(restoredChild.parentId, null, "La nota restaurata con genitore nel cestino deve essere riposizionata alla radice");
    });

    test("Trash: Eliminazione permanente cancella fisicamente la nota dalla memoria", () => {
        setupTrashDOM();

        UI.Trash.hardDelete('n_trash2', true);

        Assert.strictEqual(Store.getNote('n_trash2'), null);
        Assert.strictEqual(AppState.notes.length, 2);
    });

    test("Trash: cleanOrphanAttachments invoca Store.deleteOrphanedAssets e mostra toast di conferma", async () => {
        setupTrashDOM();

        let deleteCalled = false;
        let toastShown = false;

        const origConfirm = window.confirm;
        const origDelete = Store.deleteOrphanedAssets;
        const origToast = UI.showToast;

        window.confirm = () => true;
        Store.deleteOrphanedAssets = async () => { deleteCalled = true; return 3; };
        UI.showToast = () => { toastShown = true; };

        try {
            await UI.Trash.cleanOrphanAttachments();
            Assert.isTrue(deleteCalled);
            Assert.isTrue(toastShown);
        } finally {
            window.confirm = origConfirm;
            Store.deleteOrphanedAssets = origDelete;
            UI.showToast = origToast;
        }
    });

    test("Trash: empty svuota tutte le note cestinate preservando quelle attive", async () => {
        setupTrashDOM();

        const origConfirm = window.confirm;
        window.confirm = () => true;

        try {
            await UI.Trash.empty();
            Assert.strictEqual(AppState.notes.length, 1);
            Assert.strictEqual(AppState.notes[0].id, 'n_live');
        } finally {
            window.confirm = origConfirm;
        }
    });

});