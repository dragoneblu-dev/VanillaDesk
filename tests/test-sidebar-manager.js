/**
 * tests/test-sidebar-manager.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: sidebar-manager.js
 * Responsabilità: Autocomplete di ricerca tag, pillole filtro interattive,
 * prevenzione click-through, gestione valori unici da SYS_PROPERTIES_DB,
 * combinazioni faceted multi-pillola e risoluzione semantica delle relazioni.
 */

describe("Sidebar Manager: Autocomplete Ricerca, Pillole Filtro & Tag", () => {

    const setupSearchDOM = () => {
        let sandbox = document.getElementById('testSandBox');
        if (!sandbox) {
            sandbox = document.createElement('div');
            sandbox.id = 'testSandBox';
            document.body.appendChild(sandbox);
        }

        let input = document.getElementById('searchInput');
        if (!input) {
            input = document.createElement('input');
            input.id = 'searchInput';
            sandbox.appendChild(input);
        }
        input.value = '';

        let pillsContainer = document.getElementById('activeSearchFilters');
        if (!pillsContainer) {
            pillsContainer = document.createElement('div');
            pillsContainer.id = 'activeSearchFilters';
            sandbox.appendChild(pillsContainer);
        }
        pillsContainer.innerHTML = '';

        let treeContainer = document.getElementById('treeContainer');
        if (!treeContainer) {
            treeContainer = document.createElement('div');
            treeContainer.id = 'treeContainer';
            sandbox.appendChild(treeContainer);
        }
        treeContainer.innerHTML = '';

        AppState.notes = [
            { id: 'n1', parentId: null, title: 'Guida Frontend', content: 'Note' },
            { id: 'n2', parentId: null, title: 'Backend API', content: 'Note' }
        ];

        AppState.databases = {};
        AdvancedTable.ensureSystemPropertiesDB();
        const propsDb = AppState.databases['SYS_PROPERTIES_DB'];
        propsDb.rows.find(r => r.cells['sys_c_note'] === 'n1').cells['sys_c_tags'] = ['Javascript', 'UI'];
        propsDb.rows.find(r => r.cells['sys_c_note'] === 'n2').cells['sys_c_tags'] = ['NodeJS', 'Database'];
        propsDb.selectOptions['sys_c_tags'] = ['Javascript', 'UI', 'NodeJS', 'Database'];

        AppState.activePropertyFilters = [];
        AppState.searchFilter = '';
        AppState.currentNoteId = null;
        AppState.showBookmarksInTree = false;
        AppState.showFavoritesInTree = false;
        AppState.showDbNotesInTree = false;
    };

    test("Autocomplete: Estrazione dinamica suggerimenti da termine digitato", () => {
        setupSearchDOM();
        const input = document.getElementById('searchInput');
        
        SidebarManager.SearchAutocomplete.show(input, "java");

        const popup = document.getElementById('sidebar-filter-autocomplete-portal');
        Assert.isTrue(popup !== null);
        Assert.isTrue(popup.style.display !== 'none');
        Assert.isTrue(popup.textContent.includes('Javascript'));
    });

    test("Autocomplete: Selezione suggerimento crea la pillola attiva e svuota l'input", () => {
        setupSearchDOM();
        const input = document.getElementById('searchInput');
        input.value = 'java';

        SidebarManager.SearchAutocomplete.select('sys_c_tags', 'Javascript', '#Tag', 'Javascript');

        // L'input deve essere ripulito per la visualizzazione dei risultati
        Assert.strictEqual(input.value, '');

        // Il filtro deve essere registrato in AppState
        Assert.strictEqual(AppState.activePropertyFilters.length, 1);
        Assert.strictEqual(AppState.activePropertyFilters[0].realValue, 'Javascript');

        // La pillola deve essere renderizzata nel contenitore
        const pillsContainer = document.getElementById('activeSearchFilters');
        Assert.isTrue(pillsContainer.textContent.includes('#Tag: Javascript'));
    });

    test("Autocomplete: Rimozione pillola ripristina la ricerca", () => {
        setupSearchDOM();

        SidebarManager.SearchAutocomplete.select('sys_c_tags', 'UI', '#Tag', 'UI');
        Assert.strictEqual(AppState.activePropertyFilters.length, 1);

        // Simula click sulla ✕ della pillola
        SidebarManager.SearchAutocomplete.remove(0);

        Assert.strictEqual(AppState.activePropertyFilters.length, 0);
        const pillsContainer = document.getElementById('activeSearchFilters');
        Assert.strictEqual(pillsContainer.innerHTML, '');
    });

    test("Autocomplete: Gestione corretta dei filtri di colonna (*EXISTS*)", () => {
        setupSearchDOM();
        const input = document.getElementById('searchInput');

        SidebarManager.SearchAutocomplete.show(input, "tag");
        const popup = document.getElementById('sidebar-filter-autocomplete-portal');

        // Deve contenere il suggerimento di esistenza per l'intera colonna
        Assert.isTrue(popup.textContent.includes('Qualsiasi valore'));

        SidebarManager.SearchAutocomplete.select('sys_c_tags', '*EXISTS*', '#Tag', '🏷️ #Tag');
        Assert.strictEqual(AppState.activePropertyFilters[0].realValue, '*EXISTS*');
        Assert.strictEqual(AppState.activePropertyFilters[0].visualText, '🏷️ #Tag');
    });

    test("Autocomplete: Combinazione multi-pillola (Faceted Intersect) filtra in logica AND", () => {
        setupSearchDOM();
        const propsDb = AppState.databases['SYS_PROPERTIES_DB'];

        // Aggiunge una colonna personalizzata "Autore" a SYS_PROPERTIES_DB
        propsDb.columns.push({ id: 'c_author', name: 'Autore', type: 'text' });
        propsDb.rows.find(r => r.cells['sys_c_note'] === 'n1').cells['c_author'] = 'Mario';
        propsDb.rows.find(r => r.cells['sys_c_note'] === 'n2').cells['c_author'] = 'Luigi';

        // Aggiunge una terza nota garantendo parentId: null per il corretto crawling
        AppState.notes.push({ id: 'n3', parentId: null, title: 'DevOps Guide', content: 'Note' });
        propsDb.rows.push({
            id: 'sys_r_n3',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            cells: { 'sys_c_note': 'n3', 'sys_c_tags': ['UI'], 'c_author': 'Mario' }
        });

        // Applica simultaneamente due filtri: #Tag = Javascript AND Autore = Mario
        SidebarManager.SearchAutocomplete.select('sys_c_tags', 'Javascript', '#Tag', 'Javascript');
        SidebarManager.SearchAutocomplete.select('c_author', 'Mario', 'Autore', 'Mario');

        Assert.strictEqual(AppState.activePropertyFilters.length, 2);

        // Solo 'n1' soddisfa entrambi i criteri contemporaneamente
        AppState.currentNoteId = null;
        const matchingNoteId = AppState._findNextNoteWithMatches(1);
        Assert.strictEqual(matchingNoteId, 'n1');

        // Rimuove il primo filtro (#Tag): rimangono le note con Autore = Mario ('n1' e 'n3')
        SidebarManager.SearchAutocomplete.remove(0);
        Assert.strictEqual(AppState.activePropertyFilters.length, 1);
        Assert.strictEqual(AppState.activePropertyFilters[0].colId, 'c_author');

        const nextMatch1 = AppState._findNextNoteWithMatches(1);
        AppState.currentNoteId = nextMatch1;
        const nextMatch2 = AppState._findNextNoteWithMatches(1);

        const matchedIds = [nextMatch1, nextMatch2];
        Assert.isTrue(matchedIds.includes('n1'));
        Assert.isTrue(matchedIds.includes('n3'));
        Assert.isFalse(matchedIds.includes('n2'));
    });

    test("Autocomplete: Commutazione del valore dal menu della pillola (updateFilterValue)", () => {
        setupSearchDOM();

        // Seleziona inizialmente Javascript
        SidebarManager.SearchAutocomplete.select('sys_c_tags', 'Javascript', '#Tag', 'Javascript');
        Assert.strictEqual(AppState.activePropertyFilters.length, 1);
        Assert.strictEqual(AppState.activePropertyFilters[0].realValue, 'Javascript');

        // Simula la selezione di un valore alternativo dalla tendina aperta sulla pillola
        SidebarManager.SearchAutocomplete.updateFilterValue(0, 'NodeJS', 'NodeJS', 'hl-c2');

        // La pillola deve essere aggiornata sul posto senza creare duplicati
        Assert.strictEqual(AppState.activePropertyFilters.length, 1);
        Assert.strictEqual(AppState.activePropertyFilters[0].realValue, 'NodeJS');
        Assert.strictEqual(AppState.activePropertyFilters[0].visualText, '#Tag: NodeJS');
        Assert.strictEqual(AppState.activePropertyFilters[0].colorClass, 'hl-c2');

        const pillsContainer = document.getElementById('activeSearchFilters');
        Assert.isTrue(pillsContainer.textContent.includes('#Tag: NodeJS'));
        Assert.isFalse(pillsContainer.textContent.includes('Javascript'));
    });

    test("Autocomplete: Risoluzione semantica dei record collegati (Relazioni) esclude ID interni", () => {
        setupSearchDOM();
        const input = document.getElementById('searchInput');

        // Configura un database target esterno "Clienti"
        AppState.databases['db_clients'] = {
            title: 'Clienti',
            columns: [
                { id: 'c_cl_name', name: 'Ragione Sociale', type: 'text' }
            ],
            rows: [
                { id: 'r_cliente_acme', cells: { 'c_cl_name': 'Acme Corporation' } }
            ]
        };

        // Aggiunge una colonna di relazione su SYS_PROPERTIES_DB
        const propsDb = AppState.databases['SYS_PROPERTIES_DB'];
        propsDb.columns.push({
            id: 'c_rel_client',
            name: 'Cliente Assegnato',
            type: 'relation',
            targetTableId: 'db_clients',
            targetColId: 'c_cl_name'
        });

        propsDb.rows.find(r => r.cells['sys_c_note'] === 'n1').cells['c_rel_client'] = ['r_cliente_acme'];

        // Cerca il testo dell'azienda collegata
        SidebarManager.SearchAutocomplete.show(input, "acme");

        const popup = document.getElementById('sidebar-filter-autocomplete-portal');
        Assert.isTrue(popup !== null);
        Assert.isTrue(popup.style.display !== 'none');

        // Deve esporre il titolo leggibile decodificato
        Assert.isTrue(popup.textContent.includes('Acme Corporation'));

        // Non deve mai esporre ID interni crudi o prefissi di sistema
        Assert.isFalse(popup.textContent.includes('r_cliente_acme'));
        Assert.isFalse(popup.textContent.includes('sys_r_'));
    });

});