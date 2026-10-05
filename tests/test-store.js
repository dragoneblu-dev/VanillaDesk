/**
 * tests/test-store.js
 * Suite Modulare di Collaudo Unitario per il Core Storage di VanillaDesk.
 * Modulo testato: js/store.js
 * Responsabilità verificate:
 * - Hashing deterministico, parità di terminatori di linea CRLF/LF e prefissi crittografici
 * - Gestione sessione crittografica Workspace (Vault Salt, reset)
 * - Rilevamento modifiche in tempo reale (hasUnsavedChanges, DOM vivo editor, flag _isDirty e _isDraft)
 * - Orchestrazione del debounce di salvataggio automatico (triggerAutoSave)
 * - Lifecycle note, modelli e navigazione gerarchica (generateId, getChildren, prepareForSave)
 * - Scanner centralizzato delle risorse attive (scanActiveEntities), protezione asset nel cestino e nello stack Undo
 * - Pulizia e Garbage Collection della memoria RAM (cleanOrphanedRAMCaches, _needsPhysicalGC)
 */

describe("Store: Core Storage Engine, Hashing, Live Change Detection & Scanner RAM", () => {

    // =========================================================================
    // 1. GESTIONE SESSIONE CRITTOGRAFICA & WORKSPACE VAULT SALT
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
    // 2. HASHING DETERMINISTICO & PARITÀ CROSS-PLATFORM
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
    // 3. RILEVAMENTO MODIFICHE & LIVE DOM DETECTION (hasUnsavedChanges)
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

    // =========================================================================
    // 4. METODI DI SUPPORTO AL CICLO DI VITA E GERARCHIA
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

    // =========================================================================
    // 5. SCANNER RISORSE, ASSET E PULIZIA RAM
    // =========================================================================

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

    test("Store: markNeedsPhysicalGC abilita il flag per la successiva Garbage Collection su disco", () => {
        Store._needsPhysicalGC = false;
        Store.markNeedsPhysicalGC();
        Assert.isTrue(Store._needsPhysicalGC);
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
});