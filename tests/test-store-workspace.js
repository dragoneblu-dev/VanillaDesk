/**
 * tests/test-store-workspace.js
 * Suite Modulare di Collaudo per la Concorrenza, I/O su File System e Merge di VanillaDesk.
 * Modulo testato: js/store-workspace.js
 * Responsabilità verificate:
 * - 3-Way Field-Level Merging per Database Relazionali (colonne, righe, opzioni, tie-breaker LWW)
 * - 3-Way Merge per Diari/Log (array entries e risoluzione temporale)
 * - Concorrenza Ottimistica Note (Revision Token revId, rilevamento conflitti e stashing)
 * - Modalità di risoluzione conflitti ('reload' vs 'overwrite')
 * - Sincronizzazione JIT componenti in lettura (syncWidgetsForNote)
 * - Verifica integrità note su disco (syncNoteFromDisk) e protezione bozze locali (_isDraft / untracked hash)
 * - Decrittografia e caricamento diretto frammenti (_decryptAndProcessFragment) senza _id_hack
 * - Reset e consumo del flag di Garbage Collection fisica (executePhysicalGarbageCollection)
 */

describe("StoreWorkspace: Concorrenza LWW, 3-Way Merge, Revision Tokens & JIT Sync", () => {

    // =========================================================================
    // 1. 3-WAY FIELD-LEVEL MERGING PER DATABASE RDBMS
    // =========================================================================

    test("StoreWorkspace: _mergeDatabaseStates fonde colonne e celle concorrenti (Field-Level Merge)", () => {
        const testDbId = 'adv_tbl_test_merge_1';
        Store._baseDatabases[testDbId] = {
            columns: [{ id: 'c1', name: 'Nome' }],
            rows: [{ id: 'r1', cells: { c1: 'Originale' }, updatedAt: 500 }]
        };

        const diskState = {
            columns: [{ id: 'c1', name: 'Nome' }, { id: 'c2', name: 'Prezzo' }],
            rows: [
                { id: 'r1', cells: { c1: 'Originale', c2: 10 }, updatedAt: 1000 }
            ]
        };
        const ramState = {
            columns: [{ id: 'c1', name: 'Nome' }, { id: 'c3', name: 'Stato' }],
            rows: [
                { id: 'r1', cells: { c1: 'Modificato da RAM', c3: 'Attivo' }, updatedAt: 2000 }
            ]
        };

        const merged = Store._mergeDatabaseStates(testDbId, diskState, ramState);
        Assert.strictEqual(merged.columns.length, 3);

        const r1 = merged.rows.find(r => r.id === 'r1');
        Assert.strictEqual(r1.cells.c1, 'Modificato da RAM');
        Assert.strictEqual(r1.cells.c2, 10);
        Assert.strictEqual(r1.cells.c3, 'Attivo');
    });

    test("StoreWorkspace: _mergeDatabaseStates preserva righe create su disco e in RAM contemporaneamente", () => {
        const testDbId = 'adv_tbl_test_merge_2';
        const diskState = {
            columns: [{ id: 'c1', name: 'Nome' }],
            rows: [
                { id: 'r_disk_new', cells: { c1: 'Creato su Disco' }, updatedAt: 1500 }
            ]
        };
        const ramState = {
            columns: [{ id: 'c1', name: 'Nome' }],
            rows: [
                { id: 'r_ram_new', cells: { c1: 'Creato in RAM' }, updatedAt: 1600 }
            ]
        };

        const merged = Store._mergeDatabaseStates(testDbId, diskState, ramState);
        Assert.strictEqual(merged.rows.length, 2);
        Assert.isTrue(merged.rows.some(r => r.id === 'r_disk_new'));
        Assert.isTrue(merged.rows.some(r => r.id === 'r_ram_new'));
    });

    test("StoreWorkspace: _mergeDatabaseStates fonde opzioni e colori delle colonne Select", () => {
        const testDbId = 'adv_tbl_test_merge_3';
        const diskState = {
            columns: [{ id: 'c_sel', name: 'Tag', type: 'select' }],
            selectOptions: { c_sel: ['Bozza', 'Revisione'] },
            selectColors: { c_sel: { 'Bozza': 'hl-c1' } },
            rows: []
        };
        const ramState = {
            columns: [{ id: 'c_sel', name: 'Tag', type: 'select' }],
            selectOptions: { c_sel: ['Approvato'] },
            selectColors: { c_sel: { 'Approvato': 'hl-c6' } },
            rows: []
        };

        const merged = Store._mergeDatabaseStates(testDbId, diskState, ramState);
        Assert.deepEqual(merged.selectOptions.c_sel, ['Bozza', 'Revisione', 'Approvato']);
        Assert.strictEqual(merged.selectColors.c_sel['Bozza'], 'hl-c1');
        Assert.strictEqual(merged.selectColors.c_sel['Approvato'], 'hl-c6');
    });

    test("StoreWorkspace: _mergeDatabaseStates tie-breaker a parità di timestamp favorisce la sessione in RAM", () => {
        const testDbId = 'adv_tbl_test_merge_4';
        const fixedTime = 50000;
        const diskState = {
            columns: [{ id: 'c1', name: 'Nome' }],
            rows: [{ id: 'r1', cells: { c1: 'Valore Disco' }, updatedAt: fixedTime }]
        };
        const ramState = {
            columns: [{ id: 'c1', name: 'Nome' }],
            rows: [{ id: 'r1', cells: { c1: 'Valore RAM' }, updatedAt: fixedTime }]
        };
        const merged = Store._mergeDatabaseStates(testDbId, diskState, ramState);
        Assert.strictEqual(merged.rows[0].cells.c1, 'Valore RAM');
    });

    test("StoreWorkspace: _mergeDatabaseStates preserva le righe del disco se la RAM ha array vuoto accidentale", () => {
        const testDbId = 'adv_tbl_test_merge_5';
        const diskState = {
            columns: [{ id: 'c1', name: 'Nome' }],
            rows: [{ id: 'r_persisted', cells: { c1: 'Dato Sicuro' }, updatedAt: 1000 }]
        };
        const ramState = {
            columns: [{ id: 'c1', name: 'Nome' }],
            rows: []
        };
        const merged = Store._mergeDatabaseStates(testDbId, diskState, ramState);
        Assert.strictEqual(merged.rows.length, 1);
        Assert.strictEqual(merged.rows[0].id, 'r_persisted');
    });

    test("StoreWorkspace: _mergeDatabaseStates preserva intatte le righe del DB in assenza di modifiche", () => {
        const testDbId = 'adv_tbl_test_merge_6';
        const initial = {
            columns: [{ id: 'c1', name: 'Nome' }],
            rows: [{ id: 'r1', cells: { c1: 'Stabile' }, updatedAt: 500 }]
        };
        const merged = Store._mergeDatabaseStates(testDbId, initial, initial);
        Assert.strictEqual(merged.rows.length, 1);
        Assert.strictEqual(merged.rows[0].cells.c1, 'Stabile');
    });

    // =========================================================================
    // 2. 3-WAY MERGE PER DIARIO / LOG (ENTRIES)
    // =========================================================================

    test("StoreWorkspace: _mergeDatabaseStates fonde correttamente voci concorrenti del Diario", () => {
        const testJournalId = 'adv_journal_merge_1';
        Store._baseDatabases[testJournalId] = {
            entries: [{ id: 'j1', timestamp: 100, content: 'Nota iniziale', endTime: null }]
        };

        const diskState = {
            entries: [
                { id: 'j1', timestamp: 100, content: 'Nota iniziale', endTime: null },
                { id: 'j_disk', timestamp: 150, content: 'Aggiunto da disco', endTime: null }
            ]
        };

        const ramState = {
            entries: [
                { id: 'j1', timestamp: 200, content: 'Nota completata da RAM', endTime: 200 },
                { id: 'j_ram', timestamp: 180, content: 'Aggiunto da RAM', endTime: null }
            ]
        };

        const merged = Store._mergeDatabaseStates(testJournalId, diskState, ramState);
        Assert.strictEqual(merged.entries.length, 3);
        const j1 = merged.entries.find(e => e.id === 'j1');
        Assert.strictEqual(j1.content, 'Nota completata da RAM');
        Assert.strictEqual(j1.endTime, 200);
    });

    // =========================================================================
    // 3. CONCORRENZA OTTIMISTICA NOTE E REVISION TOKENS (revId)
    // =========================================================================

    test("StoreWorkspace: revision token rileva divergenza concorrente sulla nota", async () => {
        const localNote = {
            id: 'n_test_rev',
            title: 'Versione RAM',
            content: '<p>RAM</p>',
            revId: 'rev_local_01',
            _baseRevId: 'rev_base_initial'
        };

        const diskNote = {
            id: 'n_test_rev',
            title: 'Versione Disco Modificata',
            content: '<p>Disco</p>',
            revId: 'rev_disk_different'
        };

        Assert.isTrue(diskNote.revId !== localNote._baseRevId, "Divergenza tra disco e base revId deve essere rilevata");
    });

    test("StoreWorkspace: risoluzione conflitto 'reload' allinea i token e resetta lo stato dirty", async () => {
        const localNote = {
            id: 'n_conf_1',
            title: 'Bozza Locale',
            content: '<p>Locale</p>',
            revId: 'rev_local',
            _baseRevId: 'rev_base_old',
            _isDirty: true
        };

        const diskNote = {
            id: 'n_conf_1',
            title: 'Versione Disco Consolidata',
            content: '<p>Disco Consolidato</p>',
            revId: 'rev_disk_fresh'
        };

        const origPrompt = UI.promptNoteConflict;
        UI.promptNoteConflict = async () => 'reload';

        try {
            const res = await Store.handleNoteConflict(localNote, diskNote);
            Assert.strictEqual(res, 'reload');
            Assert.strictEqual(localNote.title, 'Versione Disco Consolidata');
            Assert.strictEqual(localNote.revId, 'rev_disk_fresh');
            Assert.strictEqual(localNote._baseRevId, 'rev_disk_fresh');
            Assert.isFalse(localNote._isDirty);
        } finally {
            UI.promptNoteConflict = origPrompt;
        }
    });

    test("StoreWorkspace: risoluzione conflitto 'overwrite' preserva modifiche locali con base aggiornata", async () => {
        const localNote = {
            id: 'n_conf_2',
            title: 'Bozza Locale da Forzare',
            content: '<p>Locale Forzato</p>',
            revId: 'rev_local',
            _baseRevId: 'rev_base_old',
            _isDirty: true
        };

        const diskNote = {
            id: 'n_conf_2',
            title: 'Versione Disco',
            content: '<p>Disco</p>',
            revId: 'rev_disk_fresh'
        };

        const origPrompt = UI.promptNoteConflict;
        UI.promptNoteConflict = async () => 'overwrite';

        try {
            const res = await Store.handleNoteConflict(localNote, diskNote);
            Assert.strictEqual(res, 'overwrite');
            Assert.strictEqual(localNote.title, 'Bozza Locale da Forzare');
            Assert.strictEqual(localNote._baseRevId, 'rev_disk_fresh');
            Assert.isTrue(localNote._isDirty);
        } finally {
            UI.promptNoteConflict = origPrompt;
        }
    });

    // =========================================================================
    // 4. JIT COMPONENT RECONCILIATION & DISK SYNC
    // =========================================================================

    test("StoreWorkspace: syncWidgetsForNote aggiorna i dati in RAM se il disco ha una versione più recente senza sporcare lo stato", async () => {
        const testDbId = 'adv_tbl_jit_sync_test';
        Store.isDirty = false;

        const oldRamState = {
            title: "Database Stantio in RAM",
            columns: [{ id: 'c1', name: 'Task' }],
            rows: [{ id: 'r1', cells: { c1: 'Prima' } }]
        };

        const freshDiskState = {
            title: "Database Aggiornato su Disco",
            columns: [{ id: 'c1', name: 'Task' }],
            rows: [{ id: 'r1', cells: { c1: 'Aggiornato da altro utente' } }]
        };

        if (!AppState.databases) AppState.databases = {};
        AppState.databases[testDbId] = oldRamState;
        Store._baseDatabases[testDbId] = JSON.parse(JSON.stringify(oldRamState));
        Store._diskHashes.databases[testDbId] = Store._hashObj(oldRamState, "RAW_");

        const origRead = Store._readFragmentFromDisk;
        Store._readFragmentFromDisk = async (dirHandle, fileName) => {
            if (fileName === `${testDbId}.json`) {
                return { status: 'success', data: JSON.stringify(freshDiskState) };
            }
            return { status: 'not_found' };
        };

        const origHandle = AppState.workspaceHandle;
        AppState.workspaceHandle = {
            getDirectoryHandle: async () => ({})
        };

        try {
            const noteContentWithWidget = `<p>Testo</p><div id="${testDbId}" class="adv-widget-shell" data-widget-type="database"></div>`;
            await Store.syncWidgetsForNote(noteContentWithWidget);

            Assert.strictEqual(AppState.databases[testDbId].title, "Database Aggiornato su Disco");
            Assert.strictEqual(AppState.databases[testDbId].rows[0].cells.c1, "Aggiornato da altro utente");
            Assert.isFalse(Store.isDirty, "La sola riconciliazione in lettura non deve sporcare lo stato con 'Modificato...'");
        } finally {
            Store._readFragmentFromDisk = origRead;
            AppState.workspaceHandle = origHandle;
        }
    });

    test("StoreWorkspace: syncNoteFromDisk protegge bozze locali e note non ancora su disco", async () => {
        const testNoteId = 'n_local_unflushed';
        AppState.notes = [
            { id: testNoteId, title: 'Nuova Bozza', content: '<p>In corso</p>', _isDraft: true }
        ];
        delete Store._diskHashes.notes[testNoteId];

        const origHandle = AppState.workspaceHandle;
        AppState.workspaceHandle = { name: "TestWS" };

        try {
            const res = await Store.syncNoteFromDisk(testNoteId);
            Assert.strictEqual(res.status, 'draft', "Una nota in stato _isDraft o non ancora scritta su disco non deve mai risultare cancellata");
        } finally {
            AppState.workspaceHandle = origHandle;
        }
    });

    test("StoreWorkspace: _decryptAndProcessFragment carica direttamente il database con entityId senza _id_hack", async () => {
        const sampleDb = {
            title: "Database Diretto",
            columns: [{ id: 'c1', name: 'Task', type: 'text' }],
            rows: [{ id: 'r1', cells: { c1: 'Dato' } }]
        };
        const dbId = "adv_tbl_direct_load_test";
        const jsonStr = JSON.stringify(sampleDb);

        AppState.databases = {};
        const success = await Store._decryptAndProcessFragment(jsonStr, 'database', dbId);

        Assert.isTrue(success);
        Assert.isNotNull(AppState.databases[dbId]);
        Assert.strictEqual(AppState.databases[dbId].title, "Database Diretto");
        Assert.strictEqual(AppState.databases[dbId]._id_hack, undefined, "Nessuna proprietà _id_hack fittizia deve permanere nello stato");
        Assert.isTrue(Store._diskHashes.databases[dbId] !== undefined);
    });

    test("StoreWorkspace: executePhysicalGarbageCollection resetta il flag _needsPhysicalGC a false", async () => {
        Store._needsPhysicalGC = true;

        const origHandle = AppState.workspaceHandle;
        AppState.workspaceHandle = null; // Simula esecuzione pulita

        try {
            await Store.executePhysicalGarbageCollection();
            Assert.isFalse(Store._needsPhysicalGC, "L'esecuzione della GC fisica deve sempre consumare e resettare il flag _needsPhysicalGC");
        } finally {
            AppState.workspaceHandle = origHandle;
        }
    });

});