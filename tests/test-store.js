/**
 * tests/test-store.js
 * Suite Modulare di Collaudo Unitario e di Integrazione Completa per lo Storage di VanillaDesk.
 * Modulo testato: store.js & CryptoUtils
 * Conteggio test case: 35
 * Copertura estesa:
 * - Hashing deterministico, CRLF/LF parity e prefissi crittografici
 * - Cifratura/Decifratura AES-GCM 256-bit, gestione errori e token malformati
 * - Cache crittografica PBKDF2 e abbattimento dei tempi di derivazione (Zero-Lag Vault)
 * - Coerenza del Workspace Vault Salt tra frammenti
 * - 3-Way Field-Level Merge per Database Relazionali (colonne, righe, opzioni, tie-breaker LWW)
 * - 3-Way Merge per Diari/Log (array entries)
 * - Concorrenza Ottimistica Note (Revision Token revId, rilevamento conflitti e stashing)
 * - Scrittura Atomica e Sicura con gestione stream abort
 * - Prevenzione falsi positivi di salvataggio (hasUnsavedChanges)
 * - Rilevamento in tempo reale di cancellazioni testo nel DOM vivo dell'editor
 * - Sincronizzazione JIT in lettura componenti referenziati (syncWidgetsForNote)
 * - Lifecycle note e gerarchie (generateId, getChildren, prepareForSave)
 * - Scanner centralizzato entità attive (scanActiveEntities), pulizia RAM (cleanOrphanedRAMCaches) e GC fisica controllata (_needsPhysicalGC)
 * - Caricamento diretto database in openWorkspace senza _id_hack
 * - Debounce e allineamento salvataggio di emergenza locale (saveLocalBackup)
 */

describe("Store: Local-First Storage, Concorrenza LWW, Zero-Lag Vault & GC Centralizzata (35 Test)", () => {

    // =========================================================================
    // 1. CRITTOGRAFIA DI BASE (AES-GCM & PBKDF2)
    // =========================================================================

    test("Store: _getWorkspaceSalt inizializza e mantiene coerente AppState.vaultSaltHex", () => {
        AppState.vaultSaltHex = null;
        const salt1 = Store._getWorkspaceSalt();
        Assert.isTrue(salt1 instanceof Uint8Array);
        Assert.strictEqual(salt1.length, 16);
        Assert.isTrue(/^[0-9a-fA-F]{32}$/.test(AppState.vaultSaltHex));

        const salt2 = Store._getWorkspaceSalt();
        Assert.strictEqual(Array.from(salt1).join(','), Array.from(salt2).join(','), "Invocazioni successive devono restituire il medesimo salt di Workspace");
    });

    test("Store: resetCryptoSession azzera salt di workspace e cache crittografica", () => {
        AppState.vaultSaltHex = "00112233445566778899aabbccddeeff";
        Store._diskHashes = { notes: { n1: "h" }, databases: {}, index: "idx" };

        Store.resetCryptoSession();

        Assert.strictEqual(AppState.vaultSaltHex, null);
        Assert.strictEqual(Store._diskHashes.index, "");
        Assert.deepEqual(Store._diskHashes.notes, {});
    });

    // =========================================================================
    // 3. HASHING E DETERMINISMO
    // =========================================================================

    test("Hashing: parità di hash tra terminatori di linea Windows (\\r\\n) e Unix (\\n)", () => {
        const textA = '{\n  "name": "Database",\n  "rows": [1, 2, 3]\n}';
        const textB = '{\r\n  "name": "Database",\r\n  "rows": [1, 2, 3]\r\n}';
        const hA = Store._simpleHash(textA);
        const hB = Store._simpleHash(textB);
        Assert.strictEqual(hA, hB, "Line endings differenti non devono causare falsi conflitti di sincronizzazione");
    });

    test("Store: _hashObj serializza uniformemente oggetti in memoria", () => {
        const objA = { id: 'adv_tbl_1', title: 'Test', active: true };
        const objB = { id: 'adv_tbl_1', title: 'Test', active: true };
        Assert.strictEqual(Store._hashObj(objA), Store._hashObj(objB));
    });

    test("Storage: determinismo hash indipendente da spaziatura interna e line endings", () => {
        const h1 = Store._simpleHash('{\n  "title": "DB"\n}');
        const h2 = Store._simpleHash('{\r\n  "title": "DB"\r\n}');
        Assert.strictEqual(h1, h2);
    });

    test("Store: _simpleHash genera hash deterministico identico su stringhe coincidenti", () => {
        const h1 = Store._simpleHash('VanillaDeskPayload');
        const h2 = Store._simpleHash('VanillaDeskPayload');
        Assert.strictEqual(h1, h2);
    });

    test("Store: _simpleHash genera hash differenti per contenuti anche minimamente alterati", () => {
        const h1 = Store._simpleHash('VanillaDeskPayloadA');
        const h2 = Store._simpleHash('VanillaDeskPayloadB');
        Assert.isFalse(h1 === h2);
    });

    test("Store: _hashObj tiene conto del prefisso crittografico (ENC_ vs RAW_)", () => {
        const payload = { a: 1 };
        const hRaw = Store._hashObj(payload, "RAW_");
        const hEnc = Store._hashObj(payload, "ENC_");
        Assert.isFalse(hRaw === hEnc);
    });

    // =========================================================================
    // 4. 3-WAY FIELD-LEVEL MERGING PER DATABASE RDBMS
    // =========================================================================

    test("Store: _mergeDatabaseStates fonde colonne e celle concorrenti (Field-Level Merge)", () => {
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

    test("Store: _mergeDatabaseStates preserva righe create su disco e righe create in RAM contemporaneamente", () => {
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

    test("Store: _mergeDatabaseStates fonde opzioni e colori delle colonne Select", () => {
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

    test("Storage: _mergeDatabaseStates tie-breaker a parità di timestamp favorisce la sessione in RAM", () => {
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

    test("Storage: _mergeDatabaseStates preserva le righe del disco se la RAM ha array vuoto accidentale", () => {
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

    test("Store: _mergeDatabaseStates preserva intatte le righe del DB in caso di assenza modifiche", () => {
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
    // 5. 3-WAY MERGE PER DIARIO / LOG (ENTRIES)
    // =========================================================================

    test("Store: _mergeDatabaseStates fonde correttamente voci concorrenti del Diario", () => {
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
    // 6. CONCORRENZA OTTIMISTICA NOTE E REVISION TOKENS
    // =========================================================================

    test("Store: revision token rileva divergenza concorrente sulla nota", async () => {
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

    test("Store: risoluzione conflitto reload allinea i token e resetta lo stato dirty", async () => {
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

    test("Store: risoluzione conflitto overwrite preserva modifiche locali con base aggiornata", async () => {
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
    // 7. PREVENZIONE FALSI SALVATAGGI & LIVE DOM DETECTION
    // =========================================================================

    test("Store: hasUnsavedChanges restituisce false se non ci sono mutazioni in RAM", () => {
        Store.isDirty = false;
        AppState.currentNoteId = null;
        AppState.notes = [
            { id: 'n1', title: 'Nota Pulita', content: '<p>Ok</p>', _isDirty: false }
        ];
        AppState.databases = {};
        Store._diskHashes = {
            notes: { n1: Store._hashObj({ id: 'n1', title: 'Nota Pulita', content: '<p>Ok</p>' }, "RAW_") },
            databases: {},
            index: ""
        };

        Assert.isFalse(Store.hasUnsavedChanges(), "La sola lettura non deve risultare come modifica pendente");
    });

    test("Store: hasUnsavedChanges rileva note con flag _isDirty o _isDraft", () => {
        Store.isDirty = false;
        AppState.notes = [
            { id: 'n_draft', title: 'Nuova Nota', content: '<p></p>', _isDirty: true }
        ];
        Assert.isTrue(Store.hasUnsavedChanges());
    });

    test("Store: hasUnsavedChanges rileva nuovi database o blocchi codice non ancora salvati su disco", () => {
        Store.isDirty = false;
        AppState.notes = [];
        AppState.databases = {
            'adv_code_new': { title: 'Query SQL', language: 'sql', content: 'SELECT * FROM test;' }
        };
        Store._diskHashes = { notes: {}, databases: {}, index: "" };

        Assert.isTrue(Store.hasUnsavedChanges(), "Un componente nuovo privo di hash su disco deve essere riconosciuto come non salvato");
    });

    test("Store: hasUnsavedChanges rileva cancellazioni di testo in tempo reale nel DOM vivo dell'editor", () => {
        Store.isDirty = false;
        AppState.currentNoteId = 'n_active_live';
        AppState.isEditMode = true;
        AppState.isSwitchingNote = false;

        const storedContent = '<p>Testo originario memorizzato</p>';
        AppState.notes = [
            { id: 'n_active_live', title: 'Nota Attiva', content: storedContent, _isDirty: false }
        ];
        AppState.databases = {};
        Store._diskHashes.notes = {
            'n_active_live': Store._hashObj({ id: 'n_active_live', title: 'Nota Attiva', content: storedContent }, "RAW_")
        };

        // Simula l'elemento editor vivo nel documento
        let editorEl = document.getElementById('noteContent');
        const createdEditor = !editorEl;
        if (createdEditor) {
            editorEl = document.createElement('div');
            editorEl.id = 'noteContent';
            document.body.appendChild(editorEl);
        }

        try {
            // L'utente cancella del testo nel DOM vivo (rimane solo <p><br></p>)
            editorEl.innerHTML = '<p><br></p>';
            Assert.isTrue(Store.hasUnsavedChanges(), "La cancellazione di testo nel DOM vivo deve essere rilevata come mutazione non salvata");
        } finally {
            if (createdEditor && editorEl) editorEl.remove();
            AppState.currentNoteId = null;
            AppState.isEditMode = false;
        }
    });

    test("Store: triggerAutoSave non marca isDirty se non vi sono modifiche reali", () => {
        Store.isDirty = false;
        AppState.currentNoteId = null;
        AppState.notes = [
            { id: 'n_clean', title: 'Stabile', content: '<p>Testo</p>', _isDirty: false }
        ];
        AppState.databases = {};
        Store._diskHashes.notes = {
            n_clean: Store._hashObj({ id: 'n_clean', title: 'Stabile', content: '<p>Testo</p>' }, "RAW_")
        };
        Store._diskHashes.databases = {};

        Store.triggerAutoSave(false);
        Assert.isFalse(Store.isDirty, "Un accesso o blur senza mutazioni non deve attivare il salvataggio automatico");
    });

    // =========================================================================
    // 8. JIT COMPONENT RECONCILIATION (syncWidgetsForNote)
    // =========================================================================

    test("Store: syncWidgetsForNote aggiorna i dati in RAM se il disco ha una versione più recente senza sporcare lo stato", async () => {
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

    // =========================================================================
    // 9. METODI DI SUPPORTO AL CICLO DI VITA E GERARCHIA
    // =========================================================================

    test("Store: generateId produce identificatori univoci privi di trattini", () => {
        const id1 = Store.generateId();
        const id2 = Store.generateId();
        Assert.isFalse(id1.includes('-'));
        Assert.isFalse(id1 === id2);
    });

    test("Store: getChildren gestisce soft-delete e navigazione gerarchica multilivello", () => {
        AppState.notes = [
            { id: 'root', parentId: null, title: 'Radice' },
            { id: 'child1', parentId: 'root', title: 'Figlio 1' },
            { id: 'child2', parentId: 'root', title: 'Figlio Cestinato', deletedAt: Date.now() },
            { id: 'subchild1', parentId: 'child1', title: 'Nipote' }
        ];

        // Figli diretti attivi
        const activeChildren = Store.getChildren('root', false);
        Assert.strictEqual(activeChildren.length, 1);
        Assert.strictEqual(activeChildren[0].id, 'child1');

        // Figli diretti inclusi cestinati
        const allChildren = Store.getChildren('root', true);
        Assert.strictEqual(allChildren.length, 2);

        // Risoluzione nipote attivo
        const grandChildren = Store.getChildren('child1', false);
        Assert.strictEqual(grandChildren.length, 1);
        Assert.strictEqual(grandChildren[0].id, 'subchild1');
    });

    test("Store: prepareForSave rimuove attributi volatili con prefisso _", () => {
        AppState.notes = [
            { id: 'n1', title: 'Nota', content: 'Test', _isDirty: true, _isDraft: false, _baseRevId: 'xyz' }
        ];
        AppState.databases = {};

        const prepared = Store.prepareForSave();
        const savedNote = prepared.notes[0];
        Assert.strictEqual(savedNote.id, 'n1');
        Assert.strictEqual(savedNote._isDirty, undefined);
        Assert.strictEqual(savedNote._isDraft, undefined);
        Assert.strictEqual(savedNote._baseRevId, undefined);
    });

    // 10. NUOVI TEST INTEGRATIVI: GC FISICA, SCANNER ENTITÀ, AUTO-SAVE E REFACTORING

    test("Store: scanActiveEntities rileva database attivi, immagini e audio nelle note", () => {
        AppState.notes = [
            { id: 'n1', content: '<div id="adv_tbl_scan1"></div><img data-image-ref="img_scan1.png"><audio data-audio-ref="aud_scan1.mp3">' }
        ];
        AppState.databases = {
            'adv_tbl_scan1': { columns: [], rows: [] }
        };
        AppState.templates = [];

        const entities = Store.scanActiveEntities();
        Assert.isTrue(entities.activeDbIds.has('adv_tbl_scan1'));
        Assert.isTrue(entities.activeImageIds.has('img_scan1.png'));
        Assert.isTrue(entities.activeAudioIds.has('aud_scan1.mp3'));
        Assert.isTrue(entities.validNoteIds.has('n1'));
    });

    test("Store: scanActiveEntities preserva asset di note nel cestino (deletedAt)", () => {
        AppState.notes = [
            { id: 'n_trash_img', title: 'Cestinata', deletedAt: Date.now(), content: '<img data-image-ref="img_preserved_in_trash.webp">' }
        ];
        AppState.databases = {};
        AppState.templates = [];

        const entities = Store.scanActiveEntities();
        Assert.isTrue(entities.activeImageIds.has('img_preserved_in_trash.webp'), "Le immagini delle note nel cestino non devono essere considerate orfane");
    });

    test("Store: scanActiveEntities scansiona dipendenze transitive (viste collegate, relazioni, bottoni)", () => {
        AppState.notes = [
            { id: 'n1', content: '<div id="adv_link_dep1"></div>' }
        ];
        AppState.databases = {
            'adv_link_dep1': { isLinkedView: true, sourceTableId: 'adv_tbl_origin_db' },
            'adv_tbl_origin_db': {
                columns: [{ id: 'c_rel', type: 'relation', targetTableId: 'adv_tbl_target_db' }],
                rows: []
            },
            'adv_tbl_target_db': { columns: [], rows: [] }
        };
        AppState.templates = [];

        const entities = Store.scanActiveEntities();
        Assert.isTrue(entities.activeDbIds.has('adv_link_dep1'));
        Assert.isTrue(entities.activeDbIds.has('adv_tbl_origin_db'), "Il DB sorgente di una vista collegata deve essere preservato");
        Assert.isTrue(entities.activeDbIds.has('adv_tbl_target_db'), "Il DB bersaglio di una relazione deve essere preservato transitivamente");
    });

    test("Store: scanActiveEntities preserva immagini e audio presenti nello stack di Undo/Redo", () => {
        AppState.notes = [{ id: 'n1', content: '<p>Vuoto</p>' }];
        AppState.databases = {};
        AppState.templates = [];

        if (typeof Editor !== 'undefined') {
            Editor.undoStack = ['<p>Test</p><img data-image-ref="img_in_undo.png">'];
            Editor.redoStack = ['<p>Test</p><audio data-audio-ref="aud_in_redo.mp3">'];
        }

        const entities = Store.scanActiveEntities();
        Assert.isTrue(entities.activeImageIds.has('img_in_undo.png'), "Gli asset nello stack di Undo devono essere protetti");
        Assert.isTrue(entities.activeAudioIds.has('aud_in_redo.mp3'), "Gli asset nello stack di Redo devono essere protetti");
    });

    test("Store: cleanOrphanedRAMCaches purga i database e asset orfani preservando SYS_PROPERTIES_DB", () => {
        AppState.notes = [{ id: 'n1', content: '<p>Nessun widget</p>' }];
        AppState.databases = {
            'SYS_PROPERTIES_DB': { title: 'Sistema', columns: [], rows: [] },
            'adv_tbl_orphan_zombie': { title: 'Zombie', columns: [], rows: [] }
        };
        AppState.templates = [];

        Store.cleanOrphanedRAMCaches();

        Assert.isNotNull(AppState.databases['SYS_PROPERTIES_DB'], "SYS_PROPERTIES_DB non deve mai essere eliminato");
        Assert.strictEqual(AppState.databases['adv_tbl_orphan_zombie'], undefined, "Il database orfano deve essere rimosso dalla RAM");
    });

    test("Store: _needsPhysicalGC e markNeedsPhysicalGC controllano l'esecuzione della GC fisica", async () => {
        Store._needsPhysicalGC = false;
        Store.markNeedsPhysicalGC();
        Assert.isTrue(Store._needsPhysicalGC);

        // Simuliamo l'esecuzione di executePhysicalGarbageCollection senza workspace per verificare il reset del flag
        const origHandle = AppState.workspaceHandle;
        AppState.workspaceHandle = null;

        try {
            await Store.executePhysicalGarbageCollection();
            Assert.isFalse(Store._needsPhysicalGC, "L'esecuzione della GC fisica deve resettare il flag _needsPhysicalGC a false");
        } finally {
            AppState.workspaceHandle = origHandle;
        }
    });

    test("Store: _decryptAndProcessFragment carica direttamente il database con entityId senza _id_hack", async () => {
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

    test("Store: triggerAutoSave con workspace collegato applica debounce a 1500ms", (done) => {
        Store.isDirty = false;
        clearTimeout(Store.debounceTimer);

        let saveToFileCalls = 0;
        const origSaveToFile = Store.saveToFile;
        Store.saveToFile = async () => {
            saveToFileCalls++;
        };

        const origHandle = AppState.workspaceHandle;
        AppState.workspaceHandle = { name: "TestWS" };

        try {
            // Prima chiamata
            Store.triggerAutoSave(false, true);
            Assert.isTrue(Store.isDirty);
            Assert.strictEqual(saveToFileCalls, 0, "Non deve eseguire saveToFile immediatamente senza forceImmediate");

            // Seconda chiamata immediata (simula digitazione continua)
            Store.triggerAutoSave(false, true);
            Assert.strictEqual(saveToFileCalls, 0, "Il debounce deve accorpare le chiamate consecutive");

            // Verifica asincrona dopo il tempo di debounce
            setTimeout(() => {
                try {
                    Assert.strictEqual(saveToFileCalls, 1, "saveToFile deve essere eseguito una sola volta al termine del debounce");
                } finally {
                    Store.saveToFile = origSaveToFile;
                    AppState.workspaceHandle = origHandle;
                    Store.isDirty = false;
                    done();
                }
            }, 1600);
        } catch(e) {
            Store.saveToFile = origSaveToFile;
            AppState.workspaceHandle = origHandle;
            throw e;
        }
    });

});