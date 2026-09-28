/**
 * tests/test-ui-tree.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-tree.js
 * Responsabilità: Rendering dell'albero gerarchico laterale, espansione nodi,
 * filtraggio testuale e per proprietà (Tag, *EXISTS*, booleani, array, date).
 */

describe("UI Tree: Albero Gerarchico, Filtraggio e Tag di Pagina", () => {

    const setupDOM = () => {
        let sandbox = document.getElementById('testSandBox');
        if (!sandbox) {
            sandbox = document.createElement('div');
            sandbox.id = 'testSandBox';
            document.body.appendChild(sandbox);
        }

        let treeContainer = document.getElementById('treeContainer');
        if (!treeContainer) {
            treeContainer = document.createElement('div');
            treeContainer.id = 'treeContainer';
            sandbox.appendChild(treeContainer);
        }
        treeContainer.innerHTML = '';

        let searchInput = document.getElementById('searchInput');
        if (!searchInput) {
            searchInput = document.createElement('input');
            searchInput.id = 'searchInput';
            sandbox.appendChild(searchInput);
        }
        searchInput.value = '';

        // Reset dello stato
        AppState.notes = [];
        AppState.databases = {};
        AppState.currentNoteId = null;
        AppState.searchFilter = "";
        AppState.activePropertyFilters = [];
        AppState.showFavoritesInTree = false;
        AppState.showBookmarksInTree = false;
        AppState.showDbNotesInTree = false;
    };

    test("Tree: Costruzione dell'albero gerarchico radici e sotto-note", () => {
        setupDOM();

        const rootNote = { id: 'n_root', parentId: null, title: 'Progetti', content: '<p>Contenuto</p>', expanded: true };
        const childNote = { id: 'n_child', parentId: 'n_root', title: 'Task 1', content: '<p>Subtask</p>', expanded: true };
        
        AppState.notes = [rootNote, childNote];
        UI.renderTree();

        const container = document.getElementById('treeContainer');
        const rootEl = container.querySelector('.node-wrapper[data-id="n_root"]');
        Assert.isTrue(rootEl !== null);

        const childEl = rootEl.querySelector('.node-wrapper[data-id="n_child"]');
        Assert.isTrue(childEl !== null);
        Assert.isTrue(childEl.textContent.includes('Task 1'));
    });

    test("Tree: Filtraggio con Tag specifico e propagazione antenati (Ghost Nodes)", () => {
        setupDOM();

        const rootNote = { id: 'n_parent', parentId: null, title: 'Cartella Genitore', content: '<p>Testo</p>', expanded: false };
        const matchChild = { id: 'n_target', parentId: 'n_parent', title: 'Nota Urgente', content: '<p>Testo</p>' };
        const otherRoot = { id: 'n_other', parentId: null, title: 'Altra Cartella', content: '<p>Altro</p>' };

        AppState.notes = [rootNote, matchChild, otherRoot];
        
        // Inizializza il DB delle proprietà con il tag associato
        AdvancedTable.ensureSystemPropertiesDB();
        const propsDb = AppState.databases['SYS_PROPERTIES_DB'];
        
        // Assegna il tag 'Urgente' alla nota figlia
        const row = propsDb.rows.find(r => r.cells['sys_c_note'] === 'n_target');
        row.cells['sys_c_tags'] = ['Urgente'];

        // Attiva il filtro proprietà per il Tag 'Urgente'
        AppState.activePropertyFilters = [
            { colId: 'sys_c_tags', realValue: 'Urgente', colName: 'Tag', visualText: 'Tag: Urgente' }
        ];

        UI.renderTree();

        const container = document.getElementById('treeContainer');
        
        // La nota non pertinente deve essere esclusa
        Assert.isTrue(container.querySelector('.node-wrapper[data-id="n_other"]') === null);

        // Il genitore deve essere visibile come Ghost Node per dare contesto
        const parentNode = container.querySelector('.node-wrapper[data-id="n_parent"]');
        Assert.isTrue(parentNode !== null);
        Assert.isTrue(parentNode.querySelector('.node-content').classList.contains('tree-ghost-node'));

        // Il nodo target che ha il tag deve essere visibile e NON ghost
        const targetNode = container.querySelector('.node-wrapper[data-id="n_target"]');
        Assert.isTrue(targetNode !== null);
        Assert.isFalse(targetNode.querySelector('.node-content').classList.contains('tree-ghost-node'));
    });

    test("Tree: Filtro di esistenza proprietà (*EXISTS*) esclude valori vuoti", () => {
        setupDOM();

        const noteWithTag = { id: 'n_tagged', parentId: null, title: 'Nota con Tag', content: '<p>A</p>' };
        const noteEmptyTag = { id: 'n_empty', parentId: null, title: 'Nota senza Tag', content: '<p>B</p>' };

        AppState.notes = [noteWithTag, noteEmptyTag];
        AdvancedTable.ensureSystemPropertiesDB();

        const propsDb = AppState.databases['SYS_PROPERTIES_DB'];
        propsDb.rows.find(r => r.cells['sys_c_note'] === 'n_tagged').cells['sys_c_tags'] = ['Priorità'];
        propsDb.rows.find(r => r.cells['sys_c_note'] === 'n_empty').cells['sys_c_tags'] = [];

        AppState.activePropertyFilters = [
            { colId: 'sys_c_tags', realValue: '*EXISTS*', colName: 'Tag', visualText: '🏷️ Tag' }
        ];

        UI.renderTree();

        const container = document.getElementById('treeContainer');
        Assert.isTrue(container.querySelector('.node-wrapper[data-id="n_tagged"]') !== null);
        Assert.isTrue(container.querySelector('.node-wrapper[data-id="n_empty"]') === null);
    });

    test("Tree: Integrità difensiva in presenza di righe corrotte in SYS_PROPERTIES_DB", () => {
        setupDOM();

        const note = { id: 'n_valid', parentId: null, title: 'Nota Valida', content: '<p>OK</p>' };
        AppState.notes = [note];
        
        AdvancedTable.ensureSystemPropertiesDB();
        const propsDb = AppState.databases['SYS_PROPERTIES_DB'];
        
        // Simula inserimento di una riga corrotta (priva di cells o null)
        propsDb.rows.push({ id: 'sys_r_corrupted', createdAt: Date.now() }); 
        propsDb.rows.push(null);

        AppState.activePropertyFilters = [
            { colId: 'sys_c_tags', realValue: '*EXISTS*', colName: 'Tag' }
        ];

        // L'invocazione non deve sollevare TypeError
        let errorThrown = false;
        try {
            UI.renderTree();
        } catch (e) {
            errorThrown = true;
        }

        Assert.isFalse(errorThrown);
    });

    test("Tree: Navigazione schede (Note, Preferiti, Segnalibri)", () => {
        setupDOM();

        const favNote = { id: 'n_fav', parentId: null, title: 'Preferita', content: '<p>Fav</p>', isMarked: true };
        const normNote = { id: 'n_norm', parentId: null, title: 'Normale', content: '<p>Norm</p>', isMarked: false };
        
        AppState.notes = [favNote, normNote];

        // Scheda Note (Tutte)
        UI.switchToNotes();
        Assert.isFalse(AppState.showFavoritesInTree);
        let container = document.getElementById('treeContainer');
        Assert.isTrue(container.querySelector('.node-wrapper[data-id="n_fav"]') !== null);
        Assert.isTrue(container.querySelector('.node-wrapper[data-id="n_norm"]') !== null);

        // Scheda Preferiti
        UI.toggleFavoritesInTree();
        Assert.isTrue(AppState.showFavoritesInTree);
        container = document.getElementById('treeContainer');
        Assert.isTrue(container.querySelector('.node-wrapper[data-id="n_fav"]') !== null);
        Assert.isTrue(container.querySelector('.node-wrapper[data-id="n_norm"]') === null);
    });

});