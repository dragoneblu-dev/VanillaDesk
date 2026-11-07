/**
 * tests/test-ui-tree.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-tree.js
 * Responsabilità: Rendering dell'albero gerarchico laterale, espansione nodi,
 * filtraggio testuale e per proprietà (Tag, *EXISTS*, booleani, array, date).
 */

describe("UI Tree: Albero Gerarchico, Filtraggio e Tag di Pagina (test-ui-tree.js)", () => {

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

    afterEach(() => {
        const container = document.getElementById('treeContainer');
        if (container) container.innerHTML = '';
    });

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
        
        AdvancedTable.ensureSystemPropertiesDB();
        const propsDb = AppState.databases['SYS_PROPERTIES_DB'];
        
        const row = propsDb.rows.find(r => r.cells['sys_c_note'] === 'n_target');
        row.cells['sys_c_tags'] = ['Urgente'];

        AppState.activePropertyFilters = [
            { colId: 'sys_c_tags', realValue: 'Urgente', colName: 'Tag', visualText: 'Tag: Urgente' }
        ];

        UI.renderTree();

        const container = document.getElementById('treeContainer');
        
        Assert.isTrue(container.querySelector('.node-wrapper[data-id="n_other"]') === null);

        const parentNode = container.querySelector('.node-wrapper[data-id="n_parent"]');
        Assert.isTrue(parentNode !== null);
        Assert.isTrue(parentNode.querySelector('.node-content').classList.contains('tree-ghost-node'));

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
        
        propsDb.rows.push({ id: 'sys_r_corrupted', createdAt: Date.now() }); 
        propsDb.rows.push(null);

        AppState.activePropertyFilters = [
            { colId: 'sys_c_tags', realValue: '*EXISTS*', colName: 'Tag' }
        ];

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

        UI.switchToNotes();
        Assert.isFalse(AppState.showFavoritesInTree);
        let container = document.getElementById('treeContainer');
        Assert.isTrue(container.querySelector('.node-wrapper[data-id="n_fav"]') !== null);
        Assert.isTrue(container.querySelector('.node-wrapper[data-id="n_norm"]') !== null);

        UI.toggleFavoritesInTree();
        Assert.isTrue(AppState.showFavoritesInTree);
        container = document.getElementById('treeContainer');
        Assert.isTrue(container.querySelector('.node-wrapper[data-id="n_fav"]') !== null);
        Assert.isTrue(container.querySelector('.node-wrapper[data-id="n_norm"]') === null);
    });

    test("Tree: renderTree genera lo stato di zero risultati con pulsanti di reset quando ricerca e filtri non trovano corrispondenze", () => {
        setupDOM();

        AppState.notes = [{ id: 'n1', parentId: null, title: 'Alpha', content: '<p>Testo</p>' }];
        AppState.searchFilter = "inesistente";
        AppState.activePropertyFilters = [{ colId: 'sys_c_tags', realValue: 'NessunTag' }];

        UI.renderTree();

        const container = document.getElementById('treeContainer');
        const emptyState = container.querySelector('.tree-empty-search-state');
        Assert.isNotNull(emptyState);
        Assert.isTrue(emptyState.textContent.includes('Nessuna nota trovata'));
        Assert.isTrue(emptyState.querySelectorAll('button').length >= 1);
    });

    test("Tree: extractSearchableText indicizza blocchi di codice e diari", () => {
        const dbId = 'adv_code_index_test';
        AppState.databases[dbId] = {
            title: 'Algoritmo',
            content: 'function calcolaFibonacci(n) { return n; }'
        };

        const html = `
            <p>Descrizione</p>
            <div id="${dbId}" class="code-wrapper"></div>
        `;

        const extracted = UI.extractSearchableText(html);
        Assert.isTrue(extracted.includes('calcolaFibonacci'), "Deve estrarre il codice sorgente dall'oggetto in memoria");
        Assert.isTrue(extracted.includes('Descrizione'));
    });

    test("Tree: Generazione TOC dinamico per la nota attualmente aperta", () => {
        setupDOM();

        const activeNote = {
            id: 'n_active_toc',
            parentId: null,
            title: 'Guida Completa',
            content: '<h1>Capitolo 1</h1><p>Testo</p><h2>Sezione 1.1</h2><h3>Dettaglio</h3>',
            expanded: true
        };
        AppState.notes = [activeNote];
        AppState.currentNoteId = 'n_active_toc';

        UI.renderTree();

        const container = document.getElementById('treeContainer');
        const toc = container.querySelector('.dynamic-toc-container');
        Assert.isNotNull(toc, "La nota attiva con intestazioni deve generare il TOC");

        Assert.isNotNull(toc.querySelector('.toc-h1'));
        Assert.isNotNull(toc.querySelector('.toc-h2'));
        Assert.isNotNull(toc.querySelector('.toc-h3'));
    });

    test("Tree: highlightTreeNode attiva la classe sul nodo specificato", () => {
        setupDOM();
        AppState.notes = [{ id: 'n_target_hl', parentId: null, title: 'Bersaglio' }];
        UI.renderTree();

        UI.highlightTreeNode('n_target_hl');

        const activeNode = document.querySelector('.node-wrapper[data-id="n_target_hl"] > .node-content');
        Assert.isNotNull(activeNode);
        Assert.isTrue(activeNode.classList.contains('active'));
    });

});