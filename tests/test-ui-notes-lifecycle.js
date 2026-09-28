/**
 * tests/test-ui-notes-lifecycle.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-notes-lifecycle.js
 * Responsabilità: Creazione note, selezione, aggiornamento titolo,
 * gestione note cestinate in sola lettura, navigazione verso la Home,
 * tracciamento dirty state e ripristino da banner.
 */

describe("UI Notes Lifecycle: Ciclo di Vita delle Note & Transizioni", () => {

    const setupLifecycleDOM = () => {
        let sandbox = document.getElementById('testSandBox');
        if (!sandbox) {
            sandbox = document.createElement('div');
            sandbox.id = 'testSandBox';
            document.body.appendChild(sandbox);
        }

        let scrollContent = document.getElementById('editorScrollContent');
        if (!scrollContent) {
            scrollContent = document.createElement('div');
            scrollContent.id = 'editorScrollContent';
            sandbox.appendChild(scrollContent);
        }

        let titleInput = document.getElementById('noteTitle');
        if (!titleInput) {
            titleInput = document.createElement('input');
            titleInput.id = 'noteTitle';
            scrollContent.appendChild(titleInput);
        } else if (titleInput.parentNode !== scrollContent) {
            scrollContent.appendChild(titleInput);
        }

        let contentDiv = document.getElementById('noteContent');
        if (!contentDiv) {
            contentDiv = document.createElement('div');
            contentDiv.id = 'noteContent';
            scrollContent.appendChild(contentDiv);
        } else if (contentDiv.parentNode !== scrollContent) {
            scrollContent.appendChild(contentDiv);
        }

        let editBtn = document.getElementById('editToggleBtn');
        if (!editBtn) {
            editBtn = document.createElement('button');
            editBtn.id = 'editToggleBtn';
            sandbox.appendChild(editBtn);
        }

        let treeContainer = document.getElementById('treeContainer');
        if (!treeContainer) {
            treeContainer = document.createElement('div');
            treeContainer.id = 'treeContainer';
            sandbox.appendChild(treeContainer);
        }

        AppState.notes = [];
        AppState.currentNoteId = null;
        AppState.isEditMode = false;
        AppState.isSwitchingNote = false;
        AppState.databases = {};
        AdvancedTable.ensureSystemPropertiesDB();
    };

    test("Lifecycle: Creazione nuova nota la imposta come attiva ed editabile", () => {
        setupLifecycleDOM();

        UI.addNote(null);

        Assert.isTrue(AppState.notes.length === 1);
        const created = AppState.notes[0];
        Assert.strictEqual(AppState.currentNoteId, created.id);
        Assert.isTrue(AppState.isEditMode);

        const titleInput = document.getElementById('noteTitle');
        Assert.isFalse(titleInput.hasAttribute('readonly'));
    });

    test("Lifecycle: Selezione nota carica titolo, contenuto e sincronizza l'interfaccia", async () => {
        setupLifecycleDOM();

        const note = {
            id: 'n_target_sel',
            parentId: null,
            title: 'Architettura Software',
            content: '<p>Contenuto di collaudo</p>',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        AppState.notes.push(note);

        await UI.selectNote('n_target_sel');

        Assert.strictEqual(AppState.currentNoteId, 'n_target_sel');
        Assert.strictEqual(document.getElementById('noteTitle').value, 'Architettura Software');
        Assert.isTrue(document.getElementById('noteContent').innerHTML.includes('Contenuto di collaudo'));
    });

    test("Lifecycle: Nota cestinata viene aperta con blocco di sicurezza (Read-Only Guard)", async () => {
        setupLifecycleDOM();

        const trashedNote = {
            id: 'n_trashed',
            parentId: null,
            title: 'Vecchia Nota',
            content: '<p>Dati protetti</p>',
            deletedAt: Date.now()
        };
        AppState.notes.push(trashedNote);

        await UI.selectNote('n_trashed');

        // La modalità modifica deve essere rigorosamente disabilitata
        Assert.isFalse(AppState.isEditMode);

        const titleInput = document.getElementById('noteTitle');
        Assert.isTrue(titleInput.hasAttribute('readonly'));

        const editBtn = document.getElementById('editToggleBtn');
        Assert.strictEqual(editBtn.style.display, 'none');

        const banner = document.getElementById('trashedNoteWarningBanner');
        Assert.isTrue(banner !== null);
        Assert.strictEqual(banner.style.display, 'flex');
    });

    test("Lifecycle: goHome chiude l'editor e azzera la nota corrente", () => {
        setupLifecycleDOM();
        AppState.currentNoteId = 'n_active';

        UI.goHome();

        Assert.strictEqual(AppState.currentNoteId, null);
        Assert.isFalse(AppState.isEditMode);
    });

    test("Lifecycle: Tracciamento dello stato di modifica (Dirty State Tracking)", async () => {
        setupLifecycleDOM();

        const initialDate = "2026-01-01T10:00:00.000Z";
        const note = {
            id: 'n_dirty_test',
            parentId: null,
            title: 'Titolo Originale',
            content: '<p>Contenuto Base</p>',
            createdAt: initialDate,
            updatedAt: initialDate,
            _isDirty: false
        };
        AppState.notes.push(note);

        await UI.selectNote('n_dirty_test');
        UI.toggleEditMode(true);

        // 1. Modifica del Titolo
        const titleInput = document.getElementById('noteTitle');
        titleInput.value = 'Titolo Modificato';
        UI.updateCurrentNote();

        Assert.isTrue(note._isDirty);
        Assert.strictEqual(note.title, 'Titolo Modificato');

        // 2. Modifica del Contenuto
        const contentDiv = document.getElementById('noteContent');
        contentDiv.innerHTML = '<p>Contenuto Aggiornato con modifiche</p>';
        UI.handleEditorInput();

        Assert.isTrue(note._isDirty);
        Assert.isTrue(note.content.includes('Contenuto Aggiornato con modifiche'));
        Assert.isTrue(new Date(note.updatedAt).getTime() >= new Date(initialDate).getTime());
    });

    test("Lifecycle: Ripristino nota dal banner di pericolo (restoreNoteFromBanner)", async () => {
        setupLifecycleDOM();

        const trashed = {
            id: 'n_restore_test',
            parentId: null,
            title: 'Nota Cestinata da Ripristinare',
            content: '<p>Testo valido</p>',
            deletedAt: Date.now()
        };
        AppState.notes.push(trashed);

        await UI.selectNote('n_restore_test');

        const banner = document.getElementById('trashedNoteWarningBanner');
        Assert.isTrue(banner !== null && banner.style.display === 'flex');

        // Innesca il ripristino tramite il metodo associato al pulsante del banner
        UI.restoreNoteFromBanner('n_restore_test');

        Assert.isTrue(!trashed.deletedAt);
        Assert.isTrue(trashed._isDirty);

        // Il banner deve essere nascosto e il pulsante modifica deve essere nuovamente disponibile
        Assert.strictEqual(banner.style.display, 'none');
        const editBtn = document.getElementById('editToggleBtn');
        Assert.isFalse(editBtn.style.display === 'none');
    });

    test("Lifecycle: Espansione automatica dell'albero ancestrale su apertura sotto-nota", async () => {
        setupLifecycleDOM();

        const grandpa = { id: 'n_grandpa', parentId: null, title: 'Nonno', content: '<p>1</p>', expanded: false };
        const father = { id: 'n_father', parentId: 'n_grandpa', title: 'Padre', content: '<p>2</p>', expanded: false };
        const child = { id: 'n_child', parentId: 'n_father', title: 'Figlio', content: '<p>3</p>', expanded: false };

        AppState.notes.push(grandpa, father, child);

        // Seleziona la nota nipote più profonda
        await UI.selectNote('n_child');

        // Tutti gli antenati lungo il ramo devono essere espansi per rivelare la selezione
        Assert.isTrue(father.expanded === true);
        Assert.isTrue(grandpa.expanded === true);
    });

});