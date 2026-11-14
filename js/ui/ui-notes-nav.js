/**
 * ui-notes-nav.js
 * Sottomodulo di UI.
 * Gestione della navigazione: Cronologia di navigazione lineare (History Stack),
 * transizione verso la Dashboard (goHome) e risoluzione salti verso i widget (jumpToWidget).
 * Sincronizzazione automatica del titolo nell'header su due righe al ritorno alla Dashboard.
 * FEEDFORWARD TOOLTIPS: Mostra nel tooltip delle frecce Indietro/Avanti il titolo esatto della nota di destinazione.
 * RETURNING RECORD ANCHOR: Evidenziazione visiva e centratura temporanea (pulse di 1.2s)
 * confinata alla riga/card di partenza (stili definiti in css/advanced-table.css).
 */

Object.assign(UI, {
    // Cronologia di Navigazione Note e Dashboard (History Stack)
    _navHistory: [],
    _navHistoryIndex: -1,
    _lastLeavingRecord: null,

    // Helper leggero per identificare la nota valida di destinazione senza mutare la cronologia
    _peekNavHistoryTarget: (direction) => {
        let idx = UI._navHistoryIndex + direction;
        while (idx >= 0 && idx < UI._navHistory.length) {
            const id = UI._navHistory[idx];
            if (id === null) return { id: null, title: I18n.t('home_dashboard.title') };
            const note = Store.getNote(id);
            if (note && !note.deletedAt) return note;
            idx += direction;
        }
        return null;
    },

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

            if (canGoBack) {
                const prev = UI._peekNavHistoryTarget(-1);
                const prevTitle = prev ? (prev.title || I18n.t('editor.untitled')) : I18n.t('home_dashboard.title');
                btnBack.title = `${I18n.t('toolbar.nav_back')}\n[${prevTitle}]`;
            } else {
                btnBack.title = I18n.t('toolbar.nav_back');
            }
        }

        if (btnForward) {
            btnForward.disabled = !canGoForward;
            btnForward.style.opacity = canGoForward ? '1' : '0.3';
            btnForward.style.cursor = canGoForward ? 'pointer' : 'default';

            if (canGoForward) {
                const next = UI._peekNavHistoryTarget(1);
                const nextTitle = next ? (next.title || I18n.t('editor.untitled')) : I18n.t('home_dashboard.title');
                btnForward.title = `${I18n.t('toolbar.nav_forward')}\n[${nextTitle}]`;
            } else {
                btnForward.title = I18n.t('toolbar.nav_forward');
            }
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

    goUpOneLevel: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        if (!note) return;

        if (note.isRecordNote && note.linkedTableId) {
            UI.jumpToWidget(note.linkedTableId, note.linkedRowId);
            return;
        }

        if (note.parentId) {
            UI.selectNote(note.parentId);
            return;
        }

        UI.goHome();
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

        // Allinea la seconda riga dell'header indicando chiaramente che si è tornati sulla Dashboard
        UI.updateHeaderTitles(AppState.fileName, null);

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

    // MOTORE DI ANCORAGGIO VISIVO SUL RECORD DI PROVENIENZA
    highlightReturningRecord: (tableId, rowId) => {
        if (!tableId || !rowId) return;

        const realTableId = (typeof AdvancedTable !== 'undefined' && typeof AdvancedTable._resolveSourceId === 'function')
            ? AdvancedTable._resolveSourceId(tableId)
            : tableId.split('_cited_')[0];

        // 1. Allineamento automatico paginazione se il record risiede in un'altra pagina
        const dbState = typeof AdvancedTable !== 'undefined' ? AdvancedTable.getState(realTableId) : null;
        if (dbState && Array.isArray(dbState.rows) && dbState.pageSize) {
            const rowIdx = dbState.rows.findIndex(r => r.id === rowId);
            if (rowIdx !== -1) {
                const targetPage = Math.floor(rowIdx / dbState.pageSize) + 1;
                if (dbState.currentPage !== targetPage) {
                    dbState.currentPage = targetPage;
                    AdvancedTable.setState(tableId, dbState);
                    AdvancedTable.renderTable(tableId);
                }
            }
        }

        // 2. Ricerca dell'elemento visivo nella vista corrente (tabella, bacheca kanban, timeline)
        const applyHighlight = () => {
            const tableWrap = document.getElementById(tableId) || document.querySelector(`[id^="${tableId}_cited_"]`);
            if (!tableWrap) return;

            const targetEl = tableWrap.querySelector(`tr[data-row-id="${rowId}"], .adv-board-card[data-row-id="${rowId}"], #bar-${rowId}, [data-row-id="${rowId}"]`);
            if (!targetEl) return;

            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetEl.classList.remove('adv-row-returning-pulse');
            void targetEl.offsetWidth; // Trigger reflow per riavviare l'animazione
            targetEl.classList.add('adv-row-returning-pulse');

            setTimeout(() => {
                if (document.body.contains(targetEl)) {
                    targetEl.classList.remove('adv-row-returning-pulse');
                }
            }, 1300);
        };

        setTimeout(applyHighlight, 80);
    },

    jumpToWidget: (widgetId, targetRowId = null) => {
        if (!AppState.notes) return;

        // Auto-rilevamento difensivo: se targetRowId non è stato passato esplicitamente ma stiamo lasciando una record-note di questo DB
        if (!targetRowId && AppState.currentNoteId) {
            const currentNote = Store.getNote(AppState.currentNoteId);
            if (currentNote && currentNote.isRecordNote && currentNote.linkedRowId) {
                const cleanCurrentDb = (currentNote.linkedTableId || '').split('_cited_')[0];
                const cleanTargetDb = widgetId.split('_cited_')[0];
                if (cleanCurrentDb === cleanTargetDb) {
                    targetRowId = currentNote.linkedRowId;
                }
            }
        }

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
                alert(I18n.t('notes_nav.alert_system_properties_info'));
                return;
            }

            // Se è specificato un record target (es. ritorno da una record note), focalizza esclusivamente la riga esatta
            if (targetRowId) {
                if (UI._lastHighlightedWidget && document.body.contains(UI._lastHighlightedWidget)) {
                    UI._lastHighlightedWidget.style.boxShadow = '';
                    UI._lastHighlightedWidget.style.transition = '';
                    UI._lastHighlightedWidget = null;
                }
                UI.highlightReturningRecord(widgetId, targetRowId);
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
                    if (typeof UI.showToast !== 'undefined') UI.showToast(I18n.t('notes_nav.toast_create_empty_note_first'), "warning");
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
                if (typeof UI.showToast !== 'undefined') UI.showToast(I18n.t('notes_nav.toast_orphan_recovered', { title: orphanState.title || type }), "success");
                
            } else {
                if (targetNoteInstance) {
                    const regex = new RegExp(widgetId, 'g');
                    targetNoteInstance.content = targetNoteInstance.content.replace(regex, `zombie_purged_${Date.now()}`);
                    targetNoteInstance.updatedAt = new Date().toISOString();
                    
                    if (AppState.databases && AppState.databases[widgetId]) delete AppState.databases[widgetId];
                    
                    Store.triggerAutoSave();
                    
                    if (typeof UI.showToast !== 'undefined') UI.showToast(I18n.t('notes_nav.toast_element_purged'), "info");
                    UI.renderTree(); 
                } else {
                    if (typeof UI.showToast !== 'undefined') UI.showToast(I18n.t('notes_nav.toast_element_not_found'), "error");
                }
            }
        };

        // Sincronizza l'albero laterale evidenziando l'elemento cliccato
        if (typeof UI.highlightTreeNode === 'function') {
            UI.highlightTreeNode(widgetId);
        }

        if (targetNoteId && AppState.currentNoteId !== targetNoteId) {
            // Se targetRowId è presente, non trasmettiamo widgetId a selectNote per non attivare l'alone dell'intero database
            UI.selectNote(targetNoteId, null, targetRowId ? null : widgetId);
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