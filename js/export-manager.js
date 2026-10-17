/**
 * js/export-manager.js
 * Modulo Core e Controller Interfaccia di Esportazione.
 * Gestisce lo stato della finestra di esportazione, la selezione a schede (Formato e Ambito),
 * l'attraversamento gerarchico dei discendenti (collectDescendants) e il dispatch
 * verso i motori specializzati (HTML, Markdown e Vault Obsidian).
 * Tutte le funzioni rimangono aggregate sull'oggetto globale ExportManager garantendo
 * la totale retrocompatibilità con gli altri moduli applicativi (AIBridge, LinkManager, ecc.).
 */

const ExportManager = {
    _activeExportFormat: 'html',
    _activeExportScope: 'current',

    openModal: () => {
        const modal = document.getElementById('exportModal');
        if (modal) {
            modal.classList.remove('hidden');
            // Inizializza lo stato dell'interfaccia con i valori predefiniti
            ExportManager.selectFormatCard(ExportManager._activeExportFormat || 'html');
            if (ExportManager._activeExportFormat !== 'obsidian') {
                ExportManager.selectScopeCard(AppState.currentNoteId ? 'current' : 'all');
            }
        }

        const menu = document.getElementById('mainMenuDropdown');
        if (menu) menu.classList.add('hidden');
    },

    closeModal: () => {
        const modal = document.getElementById('exportModal');
        if (modal) modal.classList.add('hidden');
    },

    selectFormatCard: (formatKey) => {
        ExportManager._activeExportFormat = formatKey;

        const formatCards = document.querySelectorAll('#exportFormatCards .export-format-card');
        formatCards.forEach(card => {
            const isSelected = card.dataset.format === formatKey;
            if (isSelected) {
                card.classList.add('active');
                card.style.borderColor = 'var(--accent-color)';
                card.style.borderWidth = '2px';
                card.style.backgroundColor = 'rgba(37, 99, 235, 0.06)';
            } else {
                card.classList.remove('active');
                card.style.borderColor = 'var(--border-color)';
                card.style.borderWidth = '1px';
                card.style.backgroundColor = 'var(--bg-color)';
            }
        });

        // Visibilità opzione immagini markdown
        const mdOptions = document.getElementById('exportMdOptions');
        if (mdOptions) {
            mdOptions.style.display = (formatKey === 'md') ? 'block' : 'none';
        }

        // Regola vincolante: se si seleziona "obsidian", l'unico ambito valido è "all" (Intero Workspace)
        const scopeCards = document.querySelectorAll('#exportScopeCards .export-scope-card');
        const scopeNotice = document.getElementById('exportScopeNotice');

        if (formatKey === 'obsidian') {
            scopeCards.forEach(card => {
                if (card.dataset.scope !== 'all') {
                    card.style.opacity = '0.35';
                    card.style.pointerEvents = 'none';
                    card.style.borderColor = 'var(--border-color)';
                    card.style.backgroundColor = 'var(--bg-color)';
                    card.classList.remove('active');
                } else {
                    card.style.opacity = '1';
                    card.style.pointerEvents = 'auto';
                }
            });
            ExportManager.selectScopeCard('all');
            if (scopeNotice) scopeNotice.style.display = 'block';
        } else {
            scopeCards.forEach(card => {
                card.style.opacity = '1';
                card.style.pointerEvents = 'auto';
            });
            if (scopeNotice) scopeNotice.style.display = 'none';
            // Se non c'è una nota aperta e torniamo da obsidian, forza 'all'
            if (!AppState.currentNoteId && ExportManager._activeExportScope !== 'all') {
                ExportManager.selectScopeCard('all');
            }
        }
    },

    selectScopeCard: (scopeKey) => {
        // Se siamo in modalità obsidian, impedisce di selezionare scope diversi da 'all'
        if (ExportManager._activeExportFormat === 'obsidian' && scopeKey !== 'all') {
            return;
        }

        ExportManager._activeExportScope = scopeKey;

        const scopeCards = document.querySelectorAll('#exportScopeCards .export-scope-card');
        scopeCards.forEach(card => {
            const isSelected = card.dataset.scope === scopeKey;
            if (isSelected) {
                card.classList.add('active');
                card.style.borderColor = 'var(--accent-color)';
                card.style.borderWidth = '2px';
                card.style.backgroundColor = 'rgba(37, 99, 235, 0.06)';
            } else {
                card.classList.remove('active');
                card.style.borderColor = 'var(--border-color)';
                card.style.borderWidth = '1px';
                card.style.backgroundColor = 'var(--bg-color)';
            }
        });
    },

    executeCustomExport: () => {
        const format = ExportManager._activeExportFormat || 'html';
        const scope = ExportManager._activeExportScope || 'current';

        ExportManager.closeModal();

        if (format === 'obsidian') {
            ExportManager.exportObsidianVault();
        } else {
            ExportManager.processExport(scope, format);
        }
    },

    processExport: (mode, explicitFormat = null) => {
        const formatSelect = document.getElementById('exportFormatSelect');
        const format = explicitFormat || (formatSelect ? formatSelect.value : 'html');

        const imageCheckbox = document.getElementById('exportMdIncludeImages');
        const includeImages = imageCheckbox ? imageCheckbox.checked : true;

        ExportManager.closeModal();

        let nodesToProcess = [];
        let docTitle = "Esportazione Note";

        if (mode === 'branch' || mode === 'current') {
            if (!AppState.currentNoteId) {
                alert("Seleziona prima una nota per esportare.");
                return;
            }
            const rootNote = Store.getNote(AppState.currentNoteId);
            docTitle = rootNote.title || 'Senza Titolo';
            nodesToProcess = [{ note: rootNote, level: 0 }];
            
            if (mode === 'branch') {
                ExportManager.collectDescendants(rootNote.id, 1, nodesToProcess);
            }
        } else {
            const cleanFileName = AppState.fileName.replace(/\.json$/i, '');
            docTitle = "Esportazione - " + cleanFileName;
            
            const roots = Store.getChildren(null);
            roots.forEach(root => {
                nodesToProcess.push({ note: root, level: 0 });
                ExportManager.collectDescendants(root.id, 1, nodesToProcess);
            });
        }

        if (format === 'html') {
            ExportManager.generateHTMLDocument(docTitle, nodesToProcess);
        } else {
            ExportManager.generateMarkdownDocument(docTitle, nodesToProcess, includeImages);
        }
    },

    collectDescendants: (parentId, level, list) => {
        const children = Store.getChildren(parentId);
        children.forEach(child => {
            list.push({ note: child, level: level });
            ExportManager.collectDescendants(child.id, level + 1, list);
        });
    }
};