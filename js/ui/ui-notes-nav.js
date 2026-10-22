/**
 * ui-notes-nav.js
 * Sottomodulo di UI.
 * Gestione della navigazione: Cronologia di navigazione lineare (History Stack),
 * transizione verso la Dashboard (goHome) e risoluzione salti verso i widget (jumpToWidget).
 */

Object.assign(UI, {
    // Cronologia di Navigazione Note e Dashboard (History Stack)
    _navHistory: [],
    _navHistoryIndex: -1,

    updateNavHistoryUI: () => {
        const btnBack = document.getElementById('navBackBtn');
        const btnForward = document.getElementById('navForwardBtn');
        const btnUp = document.getElementById('goUpBtn');

        const canGoBack = UI._navHistoryIndex > 0;
        const canGoForward = UI._navHistoryIndex >= 0 && UI._navHistoryIndex < UI._navHistory.length - 1;

        if (btnBack) {
            btnBack.disabled = !canGoBack;
            btnBack.style.opacity = canGoBack ? '1' : '0.3';
            btnBack.style.cursor = canGoBack ? 'pointer' : 'default';
        }

        if (btnForward) {
            btnForward.disabled = !canGoForward;
            btnForward.style.opacity = canGoForward ? '1' : '0.3';
            btnForward.style.cursor = canGoForward ? 'pointer' : 'default';
        }

        if (btnUp) {
            if (AppState.currentNoteId) {
                const currentNote = Store.getNote(AppState.currentNoteId);
                const canGoUp = currentNote && (currentNote.parentId || (currentNote.isRecordNote && currentNote.linkedTableId));
                btnUp.disabled = !canGoUp;
                btnUp.style.opacity = canGoUp ? '1' : '0.3';
                btnUp.style.cursor = canGoUp ? 'pointer' : 'default';
            } else {
                btnUp.disabled = true;
                btnUp.style.opacity = '0.3';
                btnUp.style.cursor = 'default';
            }
        }
    },

    navHistoryBack: () => {
        if (UI._navHistoryIndex <= 0) return;

        // Scorre a ritroso ignorando eventuali note eliminate nel frattempo
        while (UI._navHistoryIndex > 0) {
            UI._navHistoryIndex--;
            const candidateId = UI._navHistory[UI._navHistoryIndex];

            // Se lo stato nella cronologia è la Dashboard (null)
            if (candidateId === null) {
                UI.goHome(true);
                return;
            }

            const note = Store.getNote(candidateId);
            if (note && !note.deletedAt) {
                UI.selectNote(candidateId, null, null, false, true);
                return;
            }
        }

        // Se tutte le note precedenti sono state rimosse, porta alla Home
        UI.goHome(true);
    },

    navHistoryForward: () => {
        if (UI._navHistoryIndex < 0 || UI._navHistoryIndex >= UI._navHistory.length - 1) return;

        // Scorre in avanti ignorando eventuali note eliminate nel frattempo
        while (UI._navHistoryIndex < UI._navHistory.length - 1) {
            UI._navHistoryIndex++;
            const candidateId = UI._navHistory[UI._navHistoryIndex];

            // Se lo stato successivo è la Dashboard (null)
            if (candidateId === null) {
                UI.goHome(true);
                return;
            }

            const note = Store.getNote(candidateId);
            if (note && !note.deletedAt) {
                UI.selectNote(candidateId, null, null, false, true);
                return;
            }
        }

        UI.updateNavHistoryUI();
    },

    goHome: (isHistoryNavigation = false) => {
        AppState.isSwitchingNote = true;
        if (typeof UI.updateCurrentNoteTimer !== 'undefined') clearTimeout(UI.updateCurrentNoteTimer);

        const tc = document.getElementById('treeContainer');
        if (tc) tc.classList.remove('drag-over-root');

        if (AppState.currentNoteId) {
            const scrollArea = document.querySelector('.editor-scroll-content');
            const currentNote = Store.getNote(AppState.currentNoteId);
            
            if (currentNote) {
                if (scrollArea) currentNote._lastScroll = scrollArea.scrollTop;
                
                const editorEl = document.getElementById('noteContent');
                if (editorEl && typeof Editor !== 'undefined' && AppState.isEditMode) {
                    const cleanHtml = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                    if (cleanHtml && cleanHtml !== currentNote.content) {
                        currentNote.content = cleanHtml;
                        currentNote._isDirty = true;
                        currentNote.updatedAt = new Date().toISOString();
                    }
                }
                Editor.clearHistory();
            }
            if (typeof Store !== 'undefined' && currentNote && (currentNote._isDirty || Store.isDirty)) {
                Store.executePhysicalGarbageCollection();
                Store.triggerAutoSave(true);
            }
        }

        // GESTIONE CRONOLOGIA DI NAVIGAZIONE VERSO LA DASHBOARD (null)
        if (!isHistoryNavigation) {
            if (UI._navHistoryIndex < UI._navHistory.length - 1) {
                UI._navHistory = UI._navHistory.slice(0, UI._navHistoryIndex + 1);
            }
            if (UI._navHistory.length === 0 || UI._navHistory[UI._navHistory.length - 1] !== null) {
                UI._navHistory.push(null);
                if (UI._navHistory.length > 80) UI._navHistory.shift();
                UI._navHistoryIndex = UI._navHistory.length - 1;
            }
        }

        UI.closeDrawer();
        if (typeof UI.Menu !== 'undefined') UI.Menu.closeAll(true);
        if (typeof TableManager !== 'undefined') {
            TableManager.hideTriggers();
            TableManager.hideMenus();
        }

        AppState.currentNoteId = null;
        AppState.isEditMode = false;

        document.querySelectorAll('.node-content').forEach(el => el.classList.remove('active'));

        // Reset badge, proprietà e stato cronologia
        UI.checkAndUpdatePropertiesIcon(null);
        UI.updateNoteInfoIcon(null);
        UI.updateNavHistoryUI();

        if (typeof UI.renderPageHeaderProperties === 'function') {
            UI.renderPageHeaderProperties(null);
        }

        UI._updateTrashedNoteUI(null);
        UI.showEditor(false);

        if (typeof UI.Minimap !== 'undefined') UI.Minimap.sync(); 
        
        setTimeout(() => {
            AppState.isSwitchingNote = false;
        }, 150);
    },

    jumpToWidget: (widgetId) => {
        if (!AppState.notes) return;

        let targetNoteId = null;
        let targetNoteInstance = null;

        // Se l'elemento è già presente nel DOM dell'editor attivo, targetNoteId è la nota corrente
        const editorContent = document.getElementById('noteContent');
        if (editorContent && (editorContent.querySelector(`#${widgetId}`) || editorContent.querySelector(`[id^="${widgetId}_cited_"]`))) {
            targetNoteId = AppState.currentNoteId;
            targetNoteInstance = Store.getNote(AppState.currentNoteId);
        } else {
            const widgetRegex = new RegExp(`id=["']${widgetId}(_cited_[^"']*)?["']`);
            for (let i = 0; i < AppState.notes.length; i++) {
                const note = AppState.notes[i];
                if (!note.content) continue;
                if (widgetRegex.test(note.content)) {
                    targetNoteId = note.id;
                    targetNoteInstance = note;
                    break;
                }
            }
        }

        const handleResolution = () => {
            const trueId = widgetId.split('_cited_')[0];
            if (trueId === 'SYS_PROPERTIES_DB') {
                alert("Questa è la struttura di base delle Proprietà e Tag delle Note.\nNon è un database visibile, ma agisce dietro le quinte.\n\nPer modificare i Tag di una nota, apri le proprietà direttamente dalla barra degli strumenti in cima all'editor.");
                return;
            }

            let el = document.getElementById(widgetId) || document.querySelector(`[id^="${widgetId}_cited_"]`);
            
            if (el && (el.classList.contains('adv-widget-shell') || el.classList.contains('adv-table-wrapper') || el.classList.contains('simple-table-wrapper'))) {
                
                if (UI._lastHighlightedWidget && document.body.contains(UI._lastHighlightedWidget)) {
                    UI._lastHighlightedWidget.style.boxShadow = '';
                    UI._lastHighlightedWidget.style.transition = '';
                }

                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                el.style.transition = 'box-shadow 0.6s ease';
                el.style.boxShadow = '0 0 0 4px var(--marked-border), 0 0 30px var(--marked-border)';
                UI._lastHighlightedWidget = el;

                setTimeout(() => {
                    if (el === UI._lastHighlightedWidget) {
                        el.style.boxShadow = '';
                        setTimeout(() => el.style.transition = '', 600);
                        UI._lastHighlightedWidget = null;
                    }
                }, 800);
                
                return;
            }

            const orphanState = AppState.databases ? AppState.databases[widgetId] : null;
            
            if (orphanState) {
                const targetInjectionNoteId = targetNoteId || AppState.currentNoteId;
                if (!targetInjectionNoteId) {
                    if (typeof UI.showToast !== 'undefined') UI.showToast("Crea una nota vuota, poi clicca di nuovo per poter recuperare l'elemento.", "warning");
                    return;
                }

                let type = 'database';
                if (widgetId.includes('adv_journal_')) type = 'journal';
                else if (widgetId.includes('adv_code_')) type = 'code';
                else if (widgetId.includes('adv_btnbar_')) type = 'buttonbar';
                else if (orphanState.isPivot) type = 'pivot';

                let shellNode = null;
                if (typeof WidgetManager !== 'undefined') {
                    shellNode = WidgetManager.createShell(type, widgetId);
                } else {
                    shellNode = document.createElement('div');
                    shellNode.id = widgetId;
                    shellNode.className = 'adv-widget-shell adv-table-wrapper';
                    shellNode.setAttribute('data-widget-type', type);
                }

                const targetNoteToCure = Store.getNote(targetInjectionNoteId);
                
                if (targetNoteToCure.content) {
                    const regex = new RegExp(widgetId, 'g');
                    targetNoteToCure.content = targetNoteToCure.content.replace(regex, `${widgetId}_broken`);
                }

                targetNoteToCure.content = (targetNoteToCure.content || '') + '<p><br></p>' + shellNode.outerHTML + '<p><br></p>';
                targetNoteToCure.updatedAt = new Date().toISOString();

                if (targetInjectionNoteId === AppState.currentNoteId) {
                    const editorEl = document.getElementById('noteContent');
                    if (editorEl) {
                        editorEl.innerHTML = targetNoteToCure.content;
                        if (typeof WidgetManager !== 'undefined') WidgetManager.mountAll(editorEl);
                        
                        setTimeout(() => {
                            const newEl = document.getElementById(widgetId);
                            if (newEl) newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 100);
                    }
                }

                Store.triggerAutoSave();
                if (typeof UI.showToast !== 'undefined') UI.showToast(`Elemento corrotto "${orphanState.title || type}" recuperato in fondo alla nota.`, "success");
                
            } else {
                if (targetNoteInstance) {
                    const regex = new RegExp(widgetId, 'g');
                    targetNoteInstance.content = targetNoteInstance.content.replace(regex, `zombie_purged_${Date.now()}`);
                    targetNoteInstance.updatedAt = new Date().toISOString();
                    
                    if (AppState.databases && AppState.databases[widgetId]) delete AppState.databases[widgetId];
                    
                    Store.triggerAutoSave();
                    
                    if (typeof UI.showToast !== 'undefined') UI.showToast("L'elemento selezionato non esiste più ed è stato eliminato in modo definitivo dal file.", "info");
                    UI.renderTree(); 
                } else {
                    if (typeof UI.showToast !== 'undefined') UI.showToast("L'elemento selezionato non esiste più.", "error");
                }
            }
        };

        // Sincronizza l'albero laterale evidenziando l'elemento cliccato
        if (typeof UI.highlightTreeNode === 'function') {
            UI.highlightTreeNode(widgetId);
        }

        if (targetNoteId && AppState.currentNoteId !== targetNoteId) {
            // Trasmette widgetId come refId: selectNote atterra direttamente sull'elemento senza resettare lo scroll su _lastScroll
            UI.selectNote(targetNoteId, null, widgetId);
            setTimeout(handleResolution, 250); 
        } else if (targetNoteId) {
            handleResolution();
        } else {
            handleResolution();
        }
    }
});

// Sincronizzazione atomica iniziale all'avvio dell'applicazione
document.addEventListener('DOMContentLoaded', () => {
    if (typeof UI !== 'undefined' && typeof UI.updateNavHistoryUI === 'function') {
        UI.updateNavHistoryUI();
    }
});