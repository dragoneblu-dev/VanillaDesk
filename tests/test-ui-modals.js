/**
 * tests/test-ui-modals.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: js/ui/ui-modals.js
 */

describe("UI.Modals: Finestre Modali Iniettate (test-ui-modals.js)", () => {

    test("Inietta nel DOM #exportModal e #fileViewerModal con stato iniziale nascosto e struttura completa", () => {
        const exportModal = document.getElementById('exportModal');
        const viewerModal = document.getElementById('fileViewerModal');

        Assert.isTrue(exportModal !== null);
        Assert.isTrue(viewerModal !== null);
        Assert.isTrue(exportModal.classList.contains('hidden'));
        Assert.isTrue(viewerModal.classList.contains('hidden'));

        // Verifica cards di formato e ambito in #exportModal
        Assert.strictEqual(exportModal.querySelectorAll('.export-format-card').length, 4);
        Assert.strictEqual(exportModal.querySelectorAll('.export-scope-card').length, 3);
        Assert.isTrue(document.getElementById('exportMdIncludeImages') !== null);
        Assert.isTrue(document.getElementById('exportMdIncludeImages').checked);

        // Verifica controlli iniziali di #fileViewerModal
        const viewerPath = document.getElementById('viewerPath');
        const btnReplace = document.getElementById('btnReplaceContent');
        const btnCopy = document.getElementById('btnCopyContent');
        Assert.isTrue(viewerPath !== null && viewerPath.hasAttribute('readonly'));
        Assert.isTrue(btnReplace !== null && btnReplace.disabled);
        Assert.isTrue(btnCopy !== null && btnCopy.disabled);
    });

    test("#exportModal: interazione completa con ExportManager (formati, ambiti, opzioni Markdown, executeCustomExport, chiusura)", () => {
        const exportModal = document.getElementById('exportModal');
        const mdOptions = document.getElementById('exportMdOptions');
        const scopeNotice = document.getElementById('exportScopeNotice');

        const prevFormat = ExportManager._activeExportFormat;
        const prevScope = ExportManager._activeExportScope;
        const prevNoteId = AppState.currentNoteId;
        const prevNotes = [...AppState.notes];
        const prevDownloadSnapshot = Store.downloadSnapshot;
        const prevExportVault = ExportManager.exportObsidianVault;
        const prevProcessExport = ExportManager.processExport;

        const dispatched = [];
        try {
            Store.downloadSnapshot = () => dispatched.push('json');
            ExportManager.exportObsidianVault = () => dispatched.push('obsidian');
            ExportManager.processExport = (scope, format) => dispatched.push(`${format}:${scope}`);

            AppState.notes = [
                { id: 'n_exp_1', parentId: null, title: 'Nota Export', content: '<p>Test</p>' }
            ];
            AppState.currentNoteId = 'n_exp_1';

            ExportManager.openModal();
            Assert.isFalse(exportModal.classList.contains('hidden'));

            // Selezione formato Markdown: mostra opzioni immagini e mantiene tutti gli ambiti attivi
            ExportManager.selectFormatCard('md');
            Assert.strictEqual(ExportManager._activeExportFormat, 'md');
            Assert.strictEqual(mdOptions.style.display, 'block');
            Assert.strictEqual(scopeNotice.style.display, 'none');

            const currentScopeCard = exportModal.querySelector('.export-scope-card[data-scope="current"]');
            const branchScopeCard = exportModal.querySelector('.export-scope-card[data-scope="branch"]');
            const allScopeCard = exportModal.querySelector('.export-scope-card[data-scope="all"]');
            Assert.strictEqual(currentScopeCard.style.pointerEvents, 'auto');

            // Selezione ambito branch ed esecuzione dispatch
            ExportManager.selectScopeCard('branch');
            Assert.strictEqual(ExportManager._activeExportScope, 'branch');
            Assert.isTrue(branchScopeCard.classList.contains('active'));
            ExportManager.executeCustomExport();
            Assert.strictEqual(dispatched[0], 'md:branch');
            Assert.isTrue(exportModal.classList.contains('hidden'));

            // Selezione formato Obsidian: blocca ambiti parziali, forza 'all' ed esegue dispatch
            ExportManager.openModal();
            ExportManager.selectFormatCard('obsidian');
            Assert.strictEqual(ExportManager._activeExportFormat, 'obsidian');
            Assert.strictEqual(ExportManager._activeExportScope, 'all');
            Assert.strictEqual(mdOptions.style.display, 'none');
            Assert.strictEqual(scopeNotice.style.display, 'block');
            Assert.strictEqual(currentScopeCard.style.pointerEvents, 'none');
            Assert.strictEqual(branchScopeCard.style.pointerEvents, 'none');
            Assert.isTrue(allScopeCard.classList.contains('active'));
            ExportManager.executeCustomExport();
            Assert.strictEqual(dispatched[1], 'obsidian');

            // Selezione formato JSON: mantiene blocco ambiti parziali su 'all' ed esegue dispatch
            ExportManager.openModal();
            ExportManager.selectFormatCard('json');
            Assert.strictEqual(ExportManager._activeExportFormat, 'json');
            Assert.strictEqual(ExportManager._activeExportScope, 'all');
            Assert.strictEqual(scopeNotice.style.display, 'block');
            ExportManager.executeCustomExport();
            Assert.strictEqual(dispatched[2], 'json');

            // Chiusura modale esplicita
            ExportManager.openModal();
            ExportManager.closeModal();
            Assert.isTrue(exportModal.classList.contains('hidden'));
        } finally {
            ExportManager.closeModal();
            ExportManager._activeExportFormat = prevFormat;
            ExportManager._activeExportScope = prevScope;
            AppState.currentNoteId = prevNoteId;
            AppState.notes = prevNotes;
            Store.downloadSnapshot = prevDownloadSnapshot;
            ExportManager.exportObsidianVault = prevExportVault;
            ExportManager.processExport = prevProcessExport;
        }
    });

    test("#fileViewerModal: integrazione con LinkManager.replaceContent e closeViewer", () => {
        const viewerModal = document.getElementById('fileViewerModal');
        const findInput = document.getElementById('viewerFindInput');
        const replaceInput = document.getElementById('viewerReplaceInput');
        const contentDiv = document.getElementById('viewerContent');
        const btnReplace = document.getElementById('btnReplaceContent');
        const fakeLink = document.createElement('a');

        const prevLink = LinkManager.currentFileLinkElement;
        const prevBtnHtml = btnReplace.innerHTML;
        const prevBtnDisabled = btnReplace.disabled;

        try {
            viewerModal.classList.remove('hidden');
            LinkManager.currentFileLinkElement = fakeLink;
            btnReplace.disabled = false;
            contentDiv.innerText = "ERROR foo ERROR bar";
            findInput.value = "ERROR";
            replaceInput.value = "WARN";

            LinkManager.replaceContent();

            Assert.strictEqual(contentDiv.innerText, "WARN foo WARN bar");
            Assert.strictEqual(fakeLink.getAttribute('data-last-find'), "ERROR");

            LinkManager.closeViewer();
            Assert.isTrue(viewerModal.classList.contains('hidden'));
            Assert.isNull(LinkManager.currentFileLinkElement);
        } finally {
            viewerModal.classList.add('hidden');
            LinkManager.currentFileLinkElement = prevLink;
            findInput.value = "";
            replaceInput.value = "";
            contentDiv.innerText = "";
            btnReplace.innerHTML = prevBtnHtml;
            btnReplace.disabled = prevBtnDisabled;
        }
    });

});