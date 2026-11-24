/**
 * tests/test-obsidian-importer.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: js/obsidian-importer.js
 */

describe("ObsidianImporter: Importazione Vault Obsidian (test-obsidian-importer.js)", () => {

    const createMockFileHandle = (name, content, lastModified = 1700000000000) => ({
        kind: 'file',
        name,
        getFile: async () => ({
            name,
            lastModified,
            text: async () => content
        })
    });

    const createMockDirHandle = (name, entries) => ({
        kind: 'directory',
        name,
        values: async function* () {
            for (const entry of entries) {
                yield entry;
            }
        }
    });

    test("openModal: blocca con alert se nessun workspace attivo e apre drawer se disponibile", () => {
        const prevWsHandle = AppState.workspaceHandle;
        const prevStorageMode = AppState.storageMode;
        const prevAlert = window.alert;
        const prevOpenDrawer = UI.openDrawer;

        let alertMsg = null;
        let drawerOpened = false;

        try {
            window.alert = (m) => { alertMsg = m; };
            UI.openDrawer = () => { drawerOpened = true; };

            AppState.workspaceHandle = null;
            AppState.storageMode = 'ram';
            ObsidianImporter.openModal();

            Assert.strictEqual(alertMsg, I18n.t('obsidian_importer.alert_no_workspace'));
            Assert.isFalse(drawerOpened);

            AppState.storageMode = 'idb';
            ObsidianImporter.openModal();
            Assert.isTrue(drawerOpened);
        } finally {
            AppState.workspaceHandle = prevWsHandle;
            AppState.storageMode = prevStorageMode;
            window.alert = prevAlert;
            UI.openDrawer = prevOpenDrawer;
        }
    });

    test("startImport: importa gerarchia cartelle, asset, wikilink, callout, commenti %%, highlight ==, YAML/tag e ignora cartelle di sistema", async () => {
        const prevNotes = [...AppState.notes];
        const prevDbs = AppState.databases;
        const prevShowDirPicker = window.showDirectoryPicker;
        const prevSaveAsset = Store.saveAsset;
        const prevSaveToFile = Store.saveToFile;
        const prevRenderTree = UI.renderTree;
        const prevCloseDrawer = UI.closeDrawer;
        const prevShowToast = UI.showToast;
        const prevSelectNote = UI.selectNote;

        const savedAssets = [];
        let saveFileCalled = false;
        let toastInfo = null;
        let selectedNoteId = null;

        try {
            AppState.notes = [];
            AppState.databases = {};

            const mockVault = createMockDirHandle('MioVault', [
                createMockDirHandle('.obsidian', [
                    createMockFileHandle('config.md', '# Ignorato')
                ]),
                createMockDirHandle('.trash', [
                    createMockFileHandle('cestinata.md', '# Ignorato')
                ]),
                createMockDirHandle('Personaggi', [
                    createMockFileHandle('Eroe.md',
                        '---\n' +
                        'role: Guerriero\n' +
                        'location: "[[Capitale]]"\n' +
                        'tags: [pg, principale]\n' +
                        '---\n' +
                        'Vedi [[Capitale#Porto|Il Porto]] e [[Mancante]].\n' +
                        '==Testo evidenziato== %%Nota segreta%%\n' +
                        '![[ritratto.png|Ritratto]]\n' +
                        '![[tema.mp3]]\n' +
                        '![[inesistente.jpg]]\n' +
                        '> [!NOTE] Info\n' +
                        '> #eroico\n'
                    )
                ]),
                createMockFileHandle('Capitale.md', '# Capitale\n## Porto\nDescrizione'),
                createMockFileHandle('ritratto.png', 'pngbytes'),
                createMockFileHandle('tema.mp3', 'mp3bytes')
            ]);

            window.showDirectoryPicker = async () => mockVault;
            Store.saveAsset = async (file, prefix) => {
                const res = `${prefix}_mock_${file.name}`;
                savedAssets.push(res);
                return res;
            };
            Store.saveToFile = async (progressCb) => {
                saveFileCalled = true;
                if (progressCb) {
                    progressCb({ phase: 'databases', current: 1, total: 1, message: 'DB' });
                    progressCb({ phase: 'notes', current: 1, total: 1, message: 'Notes' });
                    progressCb({ phase: 'complete', current: 1, total: 1, message: 'Done' });
                }
            };
            UI.renderTree = () => {};
            UI.closeDrawer = () => {};
            UI.showToast = (msg, type) => { toastInfo = { msg, type }; };
            UI.selectNote = (id) => { selectedNoteId = id; };

            await ObsidianImporter.startImport();

            Assert.isTrue(saveFileCalled);
            Assert.strictEqual(savedAssets.length, 2);
            Assert.isTrue(toastInfo !== null && toastInfo.type === 'success');
            Assert.isTrue(selectedNoteId !== null);

            // Verifica che .obsidian e .trash siano stati ignorati
            Assert.isNull(AppState.notes.find(n => n.title === 'Ignorato' || n.title === 'config' || n.title === 'cestinata') || null);

            // Verifica creazione cartella radice Vault + cartella Personaggi + 2 note
            const rootNote = AppState.notes.find(n => n.parentId === null && n.title.includes('MioVault'));
            const folderNote = AppState.notes.find(n => n.title === 'Personaggi');
            const eroeNote = AppState.notes.find(n => n.title === 'Eroe');
            const capitaleNote = AppState.notes.find(n => n.title === 'Capitale');

            Assert.isTrue(rootNote !== undefined);
            Assert.isTrue(folderNote !== undefined && folderNote.parentId === rootNote.id);
            Assert.isTrue(eroeNote !== undefined && eroeNote.parentId === folderNote.id);
            Assert.isTrue(capitaleNote !== undefined && capitaleNote.parentId === rootNote.id);

            // Verifica risoluzione wikilink, ancora, link non risolto (convertito in <i> da *...*), commenti %%, highlight ==, asset e callout
            Assert.isTrue(eroeNote.content.includes(`data-note-id="${capitaleNote.id}"`));
            Assert.isTrue(eroeNote.content.includes('data-anchor="Porto"'));
            Assert.isTrue(eroeNote.content.includes('Il Porto'));
            const expectedUnresolvedHtml = I18n.t('obsidian_importer.link_unresolved', { label: 'Mancante' }).replace(/^\*(.*)\*$/, '<i>$1</i>');
            Assert.isTrue(eroeNote.content.includes(expectedUnresolvedHtml));
            Assert.isTrue(eroeNote.content.includes('<span class="hl-c5">Testo evidenziato</span>'));
            Assert.isTrue(eroeNote.content.includes('inline-note-wrapper') && eroeNote.content.includes('Nota segreta'));
            Assert.isTrue(eroeNote.content.includes('data-image-ref="img_mock_ritratto.png"') || eroeNote.content.includes('assets/img_mock_ritratto.png'));
            Assert.isTrue(eroeNote.content.includes('data-audio-ref="aud_mock_tema.mp3"'));
            const expectedMissingAssetHtml = I18n.t('obsidian_importer.asset_not_found', { target: 'inesistente.jpg' }).replace(/^\*(.*)\*$/, '<i>$1</i>');
            Assert.isTrue(eroeNote.content.includes(expectedMissingAssetHtml));
            Assert.isTrue(eroeNote.content.includes('[NOTE] Info'));

            // Verifica estrazione YAML Frontmatter e Tag in SYS_PROPERTIES_DB
            const propsDb = AppState.databases['SYS_PROPERTIES_DB'];
            Assert.isTrue(propsDb !== undefined);
            const eroeRow = propsDb.rows.find(r => r.cells['sys_c_note'] === eroeNote.id);
            Assert.isTrue(eroeRow !== undefined);
            Assert.isTrue(Array.isArray(eroeRow.cells['sys_c_tags']));
            Assert.isTrue(eroeRow.cells['sys_c_tags'].includes('pg'));
            Assert.isTrue(eroeRow.cells['sys_c_tags'].includes('principale'));
            Assert.isTrue(eroeRow.cells['sys_c_tags'].includes('eroico'));

            const roleCol = propsDb.columns.find(c => c.name.toLowerCase() === 'role');
            const locCol = propsDb.columns.find(c => c.name.toLowerCase() === 'location');
            Assert.isTrue(roleCol !== undefined);
            Assert.strictEqual(eroeRow.cells[roleCol.id], 'Guerriero');
            Assert.isTrue(locCol !== undefined && locCol.type === 'note_link');
            Assert.strictEqual(eroeRow.cells[locCol.id].noteId, capitaleNote.id);
        } finally {
            clearTimeout(Store.debounceTimer);
            Store.isDirty = false;
            AppState.notes = prevNotes;
            AppState.databases = prevDbs;
            window.showDirectoryPicker = prevShowDirPicker;
            Store.saveAsset = prevSaveAsset;
            Store.saveToFile = prevSaveToFile;
            UI.renderTree = prevRenderTree;
            UI.closeDrawer = prevCloseDrawer;
            UI.showToast = prevShowToast;
            UI.selectNote = prevSelectNote;
        }
    });

    test("startImport: con wrapInRoot disattivato importa cartelle e note direttamente alla radice", async () => {
        const prevNotes = [...AppState.notes];
        const prevDbs = AppState.databases;
        const prevDrawerBody = document.getElementById('advDrawerBody').innerHTML;
        const prevShowDirPicker = window.showDirectoryPicker;
        const prevSaveToFile = Store.saveToFile;
        const prevRenderTree = UI.renderTree;
        const prevCloseDrawer = UI.closeDrawer;
        const prevShowToast = UI.showToast;
        const prevSelectNote = UI.selectNote;

        try {
            AppState.notes = [];
            AppState.databases = {};
            document.getElementById('advDrawerBody').innerHTML = `<input type="checkbox" id="obsidianWrapInRoot">`;
            document.getElementById('obsidianWrapInRoot').checked = false;

            const mockVault = createMockDirHandle('VaultDiretto', [
                createMockDirHandle('CartellaRoot', [
                    createMockFileHandle('Interna.md', 'Testo interno')
                ]),
                createMockFileHandle('RootNote.md', 'Testo radice')
            ]);

            window.showDirectoryPicker = async () => mockVault;
            Store.saveToFile = async () => {};
            UI.renderTree = () => {};
            UI.closeDrawer = () => {};
            UI.showToast = () => {};
            UI.selectNote = () => {};

            await ObsidianImporter.startImport();

            const vaultRootWrapper = AppState.notes.find(n => n.title.includes('VaultDiretto'));
            const folderRoot = AppState.notes.find(n => n.title === 'CartellaRoot');
            const rootNote = AppState.notes.find(n => n.title === 'RootNote');
            const innerNote = AppState.notes.find(n => n.title === 'Interna');

            Assert.isNull(vaultRootWrapper || null);
            Assert.isTrue(folderRoot !== undefined && folderRoot.parentId === null);
            Assert.isTrue(rootNote !== undefined && rootNote.parentId === null);
            Assert.isTrue(innerNote !== undefined && innerNote.parentId === folderRoot.id);
        } finally {
            clearTimeout(Store.debounceTimer);
            Store.isDirty = false;
            AppState.notes = prevNotes;
            AppState.databases = prevDbs;
            document.getElementById('advDrawerBody').innerHTML = prevDrawerBody;
            window.showDirectoryPicker = prevShowDirPicker;
            Store.saveToFile = prevSaveToFile;
            UI.renderTree = prevRenderTree;
            UI.closeDrawer = prevCloseDrawer;
            UI.showToast = prevShowToast;
            UI.selectNote = prevSelectNote;
        }
    });

    test("startImport: gestisce AbortError silenziosamente e mostra alert su errori reali riabilitando i pulsanti", async () => {
        const prevShowDirPicker = window.showDirectoryPicker;
        const prevAlert = window.alert;
        const prevDrawerBody = document.getElementById('advDrawerBody').innerHTML;

        let alertCount = 0;
        let lastAlert = '';

        try {
            document.getElementById('advDrawerBody').innerHTML = `
                <button id="btnStartObsidianImport" disabled>Start</button>
                <button id="btnCancelObsidianImport" disabled>Cancel</button>
            `;
            window.alert = (msg) => { alertCount++; lastAlert = msg; };

            // 1. AbortError: nessun alert
            window.showDirectoryPicker = async () => {
                const err = new Error('Annullato');
                err.name = 'AbortError';
                throw err;
            };
            await ObsidianImporter.startImport();
            Assert.strictEqual(alertCount, 0);
            Assert.isFalse(document.getElementById('btnStartObsidianImport').disabled);
            Assert.isFalse(document.getElementById('btnCancelObsidianImport').disabled);

            // 2. Errore generico: mostra alert con prefisso i18n
            window.showDirectoryPicker = async () => {
                throw new Error('Permesso negato');
            };
            await ObsidianImporter.startImport();
            Assert.strictEqual(alertCount, 1);
            Assert.isTrue(lastAlert.includes('Permesso negato'));
        } finally {
            window.showDirectoryPicker = prevShowDirPicker;
            window.alert = prevAlert;
            document.getElementById('advDrawerBody').innerHTML = prevDrawerBody;
        }
    });

});