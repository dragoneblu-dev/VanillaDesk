/**
 * events-global.js
 * Mappatura e intercettazione degli eventi globali dell'applicazione (Router Principale).
 * Esclude la barra dei pulsanti dallo Scudo Drag (Drag Shield)
 * per evitare la corruzione dell'evento HTML5 nativo dovuto al pointer-events: none.
 * L'isolamento della selezione (Select-All / Ctrl+A) copre anche i campi testuali del Diario,
 * gli snippet, tutte le celle di testo e numeriche dei database e i titoli di tutti i widget,
 * impedendo la selezione accidentale dell'intera pagina.
 * Ascoltatore per l'auto-fit delle colonne al doppio click sul resizer e smart click escape.
 * Impedisce all'evento input scatenato dentro componenti autonomi (Database, Diari, Codice)
 * di sporcare la nota principale, garantendo al contempo che le Tabelle Semplici (.simple-table-wrapper) e gli Snippet
 * scatenino regolarmente UI.handleEditorInput() e il salvataggio automatico.
 * Isolamento degli eventi tastiera dell'editor principale rispetto a Drawer, Modali e celle di Database.
 * Mantiene visibile il cursore nello scrollArea su ogni input nell'editor.
 * Scorciatoie titoli: H1 (Ctrl+Alt+1 / Ctrl+Shift+1), H2 (Ctrl+Alt+2 / Ctrl+Shift+2), H3 (Ctrl+Alt+3 / Ctrl+Shift+3), Paragrafo (Ctrl+Alt+0).
 * Scorciatoie colorazione: Ctrl+Shift+H (Evidenziatore), Ctrl+Alt+H (Colore Testo).
 * Supporto a Ctrl+Click (o Cmd+Click) su link e hashtag per navigazione rapida in Edit Mode.
 * Normalizzazione immediata del cursore per impedire digitazioni nella zona morta ZWS.
 * Chiusura automatica della toolbar fluttuante del link all'uscita del cursore.
 * Persistenza immediata su saveToIndexedDB() alla chiusura della scheda se in modalità Browser.
 * Svuotamento rapido del campo di ricerca con ESC dalla schermata di scrittura.
 */

window.EventsGlobal = window.EventsGlobal || {};

Object.assign(EventsGlobal, {
    _lastMiddleClickTime: 0,
    _initialized: false,

    // Risoluzione ed esecuzione diretta dei link (usata da click, auxclick e Ctrl+Click)
    openLinkDirectly: (link) => {
        if (!link) return;

        if (typeof LinkManager !== 'undefined') LinkManager.hideFloatingMenu();
        if (typeof Editor !== 'undefined' && Editor.hideBookmarkMenu) Editor.hideBookmarkMenu();

        if (link.classList.contains('internal-link')) {
            let noteId = link.getAttribute('data-note-id');
            let anchor = link.getAttribute('data-anchor');
            let refId = link.getAttribute('data-ref-id'); 

            // Fallback di recupero se i parametri sono definiti in un attributo onclick inline
            if (!noteId && link.getAttribute('onclick')) {
                const match = link.getAttribute('onclick').match(/UI\.selectNote\(['"]([^'"]+)['"](?:,\s*['"]?([^'",)]*)['"]?)?(?:,\s*['"]?([^'",)]*)['"]?)?\)/);
                if (match) {
                    noteId = match[1];
                    anchor = match[2] && match[2] !== 'null' ? match[2] : null;
                    refId = match[3] && match[3] !== 'null' ? match[3] : null;
                }
            }

            if (noteId && typeof UI !== 'undefined' && typeof UI.selectNote === 'function') {
                UI.selectNote(noteId, anchor, refId);
            }
        } else if (link.classList.contains('file-link')) {
            const path = link.getAttribute('data-file-path');
            if (path && typeof LinkManager !== 'undefined' && typeof LinkManager.openViewer === 'function') {
                LinkManager.openViewer(path, link);
            }
        } else {
            let href = link.getAttribute('href');
            if (!href || href === '#' || href.startsWith('javascript:')) return;

            // Gestione ancore interne (#sec-1, #manualTopIndex, ecc.)
            if (href.startsWith('#')) {
                const targetId = href.substring(1);
                if (targetId) {
                    let targetEl = document.getElementById(targetId);
                    
                    if (!targetEl && targetId.startsWith('sec-')) {
                        const parts = targetId.split('-');
                        if (parts.length >= 2) {
                            targetEl = document.getElementById(`${parts[0]}-${parts[1]}`);
                        }
                    }

                    if (targetEl) {
                        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
                return;
            }

            href = href.trim().replace(/^https?:\/\/file:\/\/\//i, 'file:///');
            const isLocalPath = /^([a-zA-Z]:[\\/]|\\\\)/i.test(href);
            const hasProtocol = /^[a-zA-Z0-9+-.]+:/i.test(href);
            if (isLocalPath) {
                href = 'file:///' + href.replace(/\\/g, '/');
            } else if (!hasProtocol) {
                href = 'https://' + href;
            }
            window.open(href, '_blank');
        }
    },

    init: () => {
        if (EventsGlobal._initialized) return;
        EventsGlobal._initialized = true;

        const editorEl = document.getElementById('noteContent');
        const scrollArea = document.getElementById('editorScrollContent');

        // 1. Inizializzazione Sottomodulo Ricerca ed Hashtag
        if (typeof EventsGlobal.initSearchEvents === 'function') {
            EventsGlobal.initSearchEvents();
        }

        // 2. Inizializzazione Sottomodulo Drag & Drop e Gutter
        if (typeof EventsGlobal.initDragAndDrop === 'function' && editorEl) {
            EventsGlobal.initDragAndDrop(editorEl, scrollArea);
        }

        // 3. Chiusura automatica toolbar link quando il cursore esce dall'elemento
        document.addEventListener('selectionchange', () => {
            if (typeof LinkManager !== 'undefined' && LinkManager.activeLink) {
                const sel = window.getSelection();
                if (!sel.rangeCount || !sel.anchorNode) {
                    LinkManager.hideFloatingMenu();
                    return;
                }
                let node = sel.anchorNode;
                if (node.nodeType === 3) node = node.parentNode;
                if (!node || (node !== LinkManager.activeLink && !LinkManager.activeLink.contains(node))) {
                    LinkManager.hideFloatingMenu();
                }
            }
        });

        // 4. Selettore Globale Righe Tabella
        if (!document.getElementById('adv-global-row-selector')) {
            const selector = document.createElement('div');
            selector.id = 'adv-global-row-selector';
            selector.innerHTML = '<input type="checkbox" style="pointer-events:none; margin:0; transform:scale(1.1);">';
            document.body.appendChild(selector);

            selector.addEventListener('click', () => {
                const tableId = selector.getAttribute('data-target-table');
                const rowId = selector.getAttribute('data-target-row');
                
                // Se la tabella selezionata fa parte di una citazione, non facciamo nulla.
                if (tableId && tableId.includes('_cited_')) return;

                if (tableId && rowId && typeof AdvancedTable !== 'undefined') {
                    const cb = selector.querySelector('input');
                    cb.checked = !cb.checked;
                    AdvancedTable.toggleRowSelection(tableId, rowId, cb.checked);
                }
            });

            selector.addEventListener('mouseleave', (e) => {
                const tableId = selector.getAttribute('data-target-table');
                const tableWrapper = document.getElementById(tableId);
                if (!tableWrapper || (e.relatedTarget !== tableWrapper && !tableWrapper.contains(e.relatedTarget))) {
                    selector.classList.remove('visible');
                }
            });
        }

        // 5. Gestione Chiusura Menu e Popover al Scroll
        document.addEventListener('scroll', (e) => {
            let target = e.target;
            
            if (target === document || target === window) {
                target = document.body;
            } else if (target.nodeType === 3) {
                target = target.parentNode;
            }

            if (!target || !target.closest) return;

            if (target.closest('.adv-dropdown') || target.closest('.link-modal-list') || target.closest('.adv-floating-popover')) {
                return;
            }

            if (document.activeElement && document.activeElement.closest('.adv-dropdown')) {
                return; 
            }

            if (typeof TableManager !== 'undefined') {
                if (typeof TableManager.UI.hideTriggers === 'function') TableManager.UI.hideTriggers();
                if (typeof TableManager.UI.hideMenus === 'function') TableManager.UI.hideMenus();
                
                if (TableManager.Selection && typeof TableManager.Selection.hideFloatingMenu === 'function') {
                    TableManager.Selection.hideFloatingMenu();
                }
            }
            if (typeof AdvancedTable !== 'undefined' && typeof AdvancedTable.closeDropdowns === 'function') {
                AdvancedTable.closeDropdowns(true);
            }
            if (typeof UI !== 'undefined' && UI.Menu) {
                UI.Menu.closeAll(true);
            }
            
            document.querySelectorAll('.color-dropdown, .list-options-dropdown').forEach(el => el.classList.add('hidden'));

            if (typeof LinkManager !== 'undefined') LinkManager.hideFloatingMenu();
            if (typeof Editor !== 'undefined' && Editor.hideBookmarkMenu) Editor.hideBookmarkMenu();
            if (typeof ImageManager !== 'undefined' && ImageManager.hideFloatingMenu) ImageManager.hideFloatingMenu();

            const rowSel = document.getElementById('adv-global-row-selector');
            if (rowSel) rowSel.classList.remove('visible');
            
        }, true);

        document.addEventListener('mouseup', () => {
            document.body.style.cursor = '';
        });

        // 6. Gestione reattiva del focus tra titolo e corpo
        document.addEventListener('focusin', (e) => {
            if (!AppState.isEditMode) return;
            const target = e.target;
            if (!target) return;

            if (target.id === 'noteTitle' || target.classList.contains('title-input')) {
                if (typeof Editor !== 'undefined' && typeof Editor.toggleAdvancedToolbar === 'function') {
                    Editor.toggleAdvancedToolbar(false);
                }
            } else if (target.closest && target.closest('#noteContent')) {
                if (typeof Editor !== 'undefined' && typeof Editor.checkContext === 'function') {
                    Editor.checkContext();
                }
            }
        });

        // Blocco chiusura accidentale della scheda se modifiche sono in sospeso
        window.addEventListener('beforeunload', (e) => {
            if (Store.isDirty || Store._isSavingFile) {
                if (AppState.workspaceHandle) {
                    Store.saveToFile();
                } else if (AppState.storageMode === 'idb') {
                    Store.saveToIndexedDB();
                } else {
                    Store.saveLocalBackup();
                }
                e.preventDefault();
                e.returnValue = '';
            }
        });

        if (!editorEl) return;

        if (typeof Editor !== 'undefined') {
            Editor.initMultiCursor(editorEl);
            Editor.initCopyInterceptor(); 
        }

        // 7. Router Tastiera Globale
        document.addEventListener('keydown', (e) => {
            const isCtrlOrCmd = e.ctrlKey || e.metaKey;
            const key = e.key ? e.key.toLowerCase() : '';
            const isKeyH = key === 'h' || e.code === 'KeyH';

            // Scorciatoie navigazione cronologica lineare: Alt+Left / Alt+Right
            if (e.altKey && !isCtrlOrCmd && !e.shiftKey) {
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    e.stopPropagation();
                    UI.navHistoryBack();
                    return;
                }
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    e.stopPropagation();
                    UI.navHistoryForward();
                    return;
                }
            }

            // Ctrl+P: apre sidebar e focalizza ricerca globale
            if (isCtrlOrCmd && key === 'p') {
                e.preventDefault();
                e.stopPropagation();

                const sb = document.getElementById('sidebar');
                const btn = document.getElementById('sidebarToggleBtn');
                if (sb && sb.classList.contains('collapsed')) {
                    sb.classList.remove('collapsed');
                    if (btn) btn.classList.add('active');
                }

                const searchInputEl = document.getElementById('searchInput');
                if (searchInputEl) {
                    searchInputEl.focus();
                    if (typeof searchInputEl.select === 'function') {
                        searchInputEl.select();
                    }
                }
                return;
            }

            // Gestione visuale riga Home ed End
            if (e.key === 'Home' || e.key === 'End') {
                if (AppState.isEditMode && typeof Editor.handleHomeEndNavigation === 'function') {
                    if (Editor.handleHomeEndNavigation(e)) {
                        return;
                    }
                }
            }

            if (!AppState.isEditMode) return;
            if (!e.key && !e.code) return; 

            // Isolamento input nativi: Ctrl+A
            const isNativeInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
            if (isNativeInput) {
                if (isCtrlOrCmd && key === 'a') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof e.target.select === 'function') {
                        e.target.select();
                    }
                    return;
                }
                return;
            }

            // Isolamento rigoroso per Drawer e Modali (es. #inlineNoteInput, #bookmarkCommentInput)
            if (e.target && e.target.closest && e.target.closest('.adv-drawer, .link-modal-overlay, #advRelationPeekModalOverlay')) {
                return;
            }

            const isInsideAdvDb = !!(e.target && e.target.closest && e.target.closest('.adv-table-wrapper, .widget-type-database, .widget-type-pivot'));

            // Isolamento Select-All (Ctrl+A)
            if (isCtrlOrCmd && key === 'a' && AppState.isEditMode) {
                const sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    let node = sel.anchorNode;
                    if (node && node.nodeType === 3) node = node.parentNode;
                    
                    const isolatedArea = node ? node.closest('.code-content, .journal-content, .snippet-text, .adv-cell-text, .widget-title, .adv-table-title, td[contenteditable="true"], th[contenteditable="true"], td, th') : null;
                    
                    if (isolatedArea) {
                        e.preventDefault();
                        e.stopPropagation();
                        const targetToSelect = isolatedArea.classList.contains('adv-cell-text') || isolatedArea.classList.contains('widget-title') || isolatedArea.classList.contains('adv-table-title')
                            ? isolatedArea 
                            : (isolatedArea.querySelector('.adv-cell-text') || isolatedArea);
                        const range = document.createRange();
                        range.selectNodeContents(targetToSelect);
                        sel.removeAllRanges();
                        sel.addRange(range);
                        return;
                    }
                }
            }

            if (isCtrlOrCmd && key === 'x' && AppState.isEditMode) {
                const selection = window.getSelection();
                if (!selection.isCollapsed && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const container = range.commonAncestorContainer;
                    const elementNode = container.nodeType === 3 ? container.parentNode : container;
                    
                    const selectedProtectedNodes = elementNode.querySelectorAll ? elementNode.querySelectorAll(WidgetManager.blockSelector) : [];
                    const intersectsProtected = Array.from(selectedProtectedNodes).some(node => selection.containsNode(node, true));
                    const isInsideProtected = WidgetManager.isProtectedBlock(elementNode);

                    if (intersectsProtected || (isInsideProtected && !WidgetManager.isInsideEditableWidgetArea(elementNode))) {
                        e.preventDefault();
                        alert(I18n.t('editor_alerts.cut_blocked_widgets'));
                        return;
                    }
                }
            }

            // Scorciatoie per titoli H1, H2, H3 e paragrafo
            if (isCtrlOrCmd && (e.altKey || e.shiftKey) && AppState.isEditMode) {
                const isDigit1 = e.code === 'Digit1' || e.code === 'Numpad1' || e.key === '1' || e.key === '!';
                const isDigit2 = e.code === 'Digit2' || e.code === 'Numpad2' || e.key === '2';
                const isDigit3 = e.code === 'Digit3' || e.code === 'Numpad3' || e.key === '3' || e.key === '£' || e.key === '#';
                const isDigit0 = e.code === 'Digit0' || e.code === 'Numpad0' || e.key === '0';

                if (isDigit1) {
                    e.preventDefault();
                    Editor.toggleHeader('h1');
                    return;
                }
                if (isDigit2) {
                    e.preventDefault();
                    Editor.toggleHeader('h2');
                    return;
                }
                if (isDigit3) {
                    e.preventDefault();
                    Editor.toggleHeader('h3');
                    return;
                }
                if (isDigit0) {
                    e.preventDefault();
                    Editor.toggleHeader('p');
                    return;
                }
            }

            if (typeof Editor !== 'undefined' && !isInsideAdvDb) {
                if (!isCtrlOrCmd && !e.altKey && AppState.isEditMode) {
                    // Selezione verticale riga per riga (Shift + ArrowUp / ArrowDown)
                    if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                        if (typeof Editor.handleVerticalShiftSelection === 'function') {
                            if (Editor.handleVerticalShiftSelection(e)) return;
                        }
                    }

                    // Navigazione su griglie e tabelle
                    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                        if (typeof Editor.handleTableNavigation === 'function') {
                            if (Editor.handleTableNavigation(e)) return;
                        }
                    }
                }

                if (e.key === 'Enter') { Editor.registerTypingStart(e.key); Editor.handleEnterKey(e); }
                if (e.key === 'Tab') { Editor.registerTypingStart(e.key); Editor.handleTabKey(e); }
                if (e.key === 'Backspace') { 
                    Editor.registerTypingStart(e.key); 
                    Editor.handleBackspaceKey(e); 
                }
                if (e.key === 'Delete') { 
                    if (e.shiftKey) return;
                    Editor.registerTypingStart(e.key); 
                    Editor.handleDeleteKey(e); 
                }
                
                if (!isCtrlOrCmd && !e.altKey && AppState.isEditMode) {
                    Editor.handleBracketAutoClose(e);
                    Editor.handleFormatEscape(e);
                }
            }

            if (isCtrlOrCmd && AppState.isEditMode) {
                // Formattazioni standard di testo
                if (!e.shiftKey && !e.altKey && key === 'b') { e.preventDefault(); Editor.exec('bold'); return; }
                if (!e.shiftKey && !e.altKey && key === 'i') { e.preventDefault(); Editor.exec('italic'); return; }
                if (!e.shiftKey && !e.altKey && key === 'u') { e.preventDefault(); Editor.exec('underline'); return; }
                if (!e.shiftKey && !e.altKey && key === 'k') { e.preventDefault(); Editor.toggleCase(); return; }

                // Evidenziatore (Ctrl+Shift+H) e Colore Testo (Ctrl+Alt+H)
                if (e.shiftKey && !e.altKey && isKeyH) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof ColorManager !== 'undefined') ColorManager.applyLast('highlight');
                    return;
                }
                if (e.altKey && !e.shiftKey && isKeyH) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof ColorManager !== 'undefined') ColorManager.applyLast('text');
                    return;
                }
                
                // Multi-cursore
                if (!e.shiftKey && !e.altKey && key === 'd') { 
                    e.preventDefault(); 
                    Editor.triggerMultiCursor(); 
                    return; 
                }
            }

            if (e.altKey && AppState.isEditMode) {
                if (e.key === 'ArrowUp') { e.preventDefault(); Editor.moveBlock(-1); return; }
                if (e.key === 'ArrowDown') { e.preventDefault(); Editor.moveBlock(1); return; }
            }

            if (isCtrlOrCmd && !e.shiftKey && !e.altKey && key === 'z') {
                e.preventDefault();
                Editor.undo();
                return;
            }
            if ((isCtrlOrCmd && !e.shiftKey && !e.altKey && key === 'y') || (isCtrlOrCmd && e.shiftKey && !e.altKey && key === 'z')) {
                e.preventDefault();
                Editor.redo();
                return;
            }

            if (!isCtrlOrCmd && !e.altKey && !isInsideAdvDb && e.key && e.key.length === 1) {
                const sel = window.getSelection();
                if (!sel.isCollapsed && sel.rangeCount > 0) {
                    if (typeof Editor !== 'undefined' && Editor.handleBulkWidgetDeletion) {
                        if (!Editor.handleBulkWidgetDeletion()) {
                            e.preventDefault(); 
                            return;
                        }
                    }
                }
                // Garanzia di allontanamento preventivo dalla zona morta prima di qualsiasi inserimento testuale
                if (typeof Editor !== 'undefined' && typeof Editor.adjustCaretAwayFromZwsDeadZone === 'function') {
                    Editor.adjustCaretAwayFromZwsDeadZone();
                }
                if (typeof Editor !== 'undefined') Editor.registerTypingStart(e.key);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const drawer = document.getElementById('advGlobalDrawer');
                const wasDrawerOpen = !!(drawer && drawer.classList.contains('open'));
                const wasMultiSelect = !!(typeof Editor !== 'undefined' && Editor.multiSelectActive);
                const wasMenuOpen = !!document.querySelector('.adv-dropdown, #adv-link-popover, #adv-bookmark-popover');
                const hasOpenModal = !!document.querySelector('.link-modal-overlay:not(.hidden), #advRelationPeekModalOverlay');
                const isGraphOpen = !!(typeof GraphApp !== 'undefined' && GraphApp.isOpen);
                const editorWrapper = document.getElementById('editorWrapper');
                const isWritingScreen = !!(editorWrapper && !editorWrapper.classList.contains('hidden'));

                if (typeof TableManager !== 'undefined') {
                    if (TableManager.Drag && TableManager.Drag.dragState) TableManager.Drag.handleMouseUp();
                    if (TableManager.resizingCol) TableManager.handleMouseUp();
                    if (typeof TableManager.UI.hideTriggers === 'function') TableManager.UI.hideTriggers();
                }
                if (typeof AdvancedTable !== 'undefined' && AdvancedTable.resizingCol) {
                    AdvancedTable.handleGlobalMouseUp({ pageX: AdvancedTable.startX }); 
                }
                if (typeof AdvancedCalendar !== 'undefined' && AdvancedCalendar.resizeState) {
                    AdvancedCalendar.onResizeEnd({ pageY: AdvancedCalendar.resizeState.startY });
                }
                if (typeof AdvancedTimeline !== 'undefined' && AdvancedTimeline.dragState) {
                    AdvancedTimeline.onDragEnd({ pageX: AdvancedTimeline.dragState.startX });
                }
                if (typeof UI !== 'undefined' && UI.Menu) {
                    UI.Menu.closeAll(true);
                }
                if (typeof Editor !== 'undefined' && Editor.multiSelectActive) {
                    Editor.clearMultiCursor();
                }
                if (typeof LinkManager !== 'undefined') LinkManager.hideFloatingMenu();
                if (typeof Editor !== 'undefined' && Editor.hideBookmarkMenu) Editor.hideBookmarkMenu();
                
                if (wasDrawerOpen) {
                    if (typeof UI.closeDrawer !== 'undefined') UI.closeDrawer();
                }

                // Svuota il campo di ricerca nella schermata di scrittura se non erano aperti overlay, menu o multi-cursore
                const searchInput = document.getElementById('searchInput');
                if (searchInput && searchInput.value !== '' && isWritingScreen && !isGraphOpen && !wasDrawerOpen && !hasOpenModal && !wasMenuOpen && !wasMultiSelect) {
                    searchInput.value = '';
                    if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                        SidebarManager.SearchAutocomplete.hide();
                    }
                    if (typeof EventsGlobal._triggerSearchUpdate === 'function') {
                        EventsGlobal._triggerSearchUpdate();
                    }
                }
            }
        });

        editorEl.addEventListener('mousedown', (e) => {
            if (window.innerWidth <= 600) {
                const sb = document.getElementById('sidebar');
                const btn = document.getElementById('sidebarToggleBtn');
                if (sb && !sb.classList.contains('collapsed')) {
                    sb.classList.add('collapsed');
                    if (btn) btn.classList.remove('active');
                }
            }
            
            if (typeof Editor !== 'undefined') {
                if (Editor.handleSmartClickEscape) Editor.handleSmartClickEscape(e);
                if (Editor.multiSelectActive) Editor.clearMultiCursor();
            }
        });

        // Correzione automatica del cursore dalla zona morta dello ZWS
        editorEl.addEventListener('mouseup', () => {
            if (typeof Editor !== 'undefined' && typeof Editor.adjustCaretAwayFromZwsDeadZone === 'function') {
                Editor.adjustCaretAwayFromZwsDeadZone();
            }
        });

        document.addEventListener('dblclick', (e) => {
            let target = e.target;
            if (target && target.nodeType === 3) target = target.parentNode;
            if (!target || !target.closest) return;

            if (!AppState.isEditMode) return;

            const resizer = target.closest('.adv-col-resizer');
            if (resizer) {
                e.preventDefault();
                e.stopPropagation();
                
                // Disabilita resize per tabelle citate
                const tableWrap = resizer.closest('.adv-table-wrapper, [data-widget-type="database"]');
                if (tableWrap && tableWrap.id.includes('_cited_')) return;

                const th = resizer.closest('th');
                if (th && tableWrap) {
                    const colId = th.getAttribute('data-col');
                    AdvancedTable.autoFitColumn(e, tableWrap.id, colId); 
                }
            }
        }, true);

        // AUXCLICK (Middle Click sui Link)
        document.addEventListener('auxclick', (e) => {
            if (e.button === 1 || e.which === 2) {
                let target = e.target;
                if (target && target.nodeType === 3) target = target.parentNode;
                if (!target || !target.closest) return;

                const link = target.tagName === 'A' ? target : target.closest('a');
                if (link) {
                    if (link.hasAttribute('download')) return;

                    e.preventDefault();
                    e.stopPropagation();

                    // Prevenzione doppi scatti su browser che emettono eventi multipli
                    if (Date.now() - EventsGlobal._lastMiddleClickTime < 250) return;
                    EventsGlobal._lastMiddleClickTime = Date.now();

                    EventsGlobal.openLinkDirectly(link);
                }
            }
        });

        editorEl.addEventListener('paste', (e) => {
            if (AppState.isEditMode && typeof Editor !== 'undefined' && Editor.handlePaste) {
                Editor.handlePaste(e);
                EventsGlobal.scheduleHashtagHighlights();
            }
        });

        editorEl.addEventListener('input', (e) => {
            if (!AppState.isSwitchingNote) {
                // Se l'evento input proviene da un widget a persistenza autonoma (Database, Diari, Codice, Bottoni),
                // non aggiornare il testo della nota principale.
                // Le tabelle semplici (.simple-table-wrapper) e gli snippet invece SONO parte del testo della nota!
                const target = e.target;
                const isInsideAutonomousWidget = target && target.closest && (
                    target.closest('.adv-table-wrapper, .adv-journal-wrapper, .code-wrapper, .adv-action-button-wrapper, .widget-type-database, .widget-type-pivot, .widget-type-journal, .widget-type-buttonbar')
                ) && !target.closest('.simple-table-wrapper, [data-widget-type="simple-table"]');

                if (isInsideAutonomousWidget) {
                    if (typeof Editor !== 'undefined' && typeof Editor.ensureCaretVisible === 'function') {
                        Editor.ensureCaretVisible();
                    }
                    return;
                }

                if (typeof Editor !== 'undefined' && typeof Editor.healFontArtifacts === 'function') {
                    Editor.healFontArtifacts(editorEl);
                }
                if (typeof Editor !== 'undefined' && Editor.handleMarkdownShortcuts) {
                    Editor.handleMarkdownShortcuts();
                }
                if (typeof Editor !== 'undefined' && typeof Editor.ensureCaretVisible === 'function') {
                    Editor.ensureCaretVisible();
                }
                
                if (typeof UI !== 'undefined' && UI.handleEditorInput) {
                    UI.handleEditorInput();
                }

                EventsGlobal.scheduleHashtagHighlights();
            }
        });

        const checkSelectionAll = (e) => {
            if (e && e.target && e.target.tagName === 'IMG') return;
            
            if (typeof TableManager !== 'undefined' && typeof TableManager.UI.checkSelection === 'function') {
                TableManager.UI.checkSelection();
            }
            if (typeof Editor !== 'undefined') Editor.checkContext();
        };

        editorEl.addEventListener('mouseup', checkSelectionAll);
        editorEl.addEventListener('keyup', (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) checkSelectionAll(e);
        });

        // Modifica Checkbox: deidratazione rigorosa con esclusione dei database autonomi
        editorEl.addEventListener('change', (e) => {
            if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
                // Non toccare il markup della nota se il checkbox appartiene a un database o widget autonomo
                if (e.target.closest && e.target.closest('.adv-table-wrapper, .adv-journal-wrapper, .code-wrapper, .adv-action-button-wrapper, .widget-type-database, .widget-type-pivot, .widget-type-journal, .widget-type-buttonbar')) {
                    return;
                }

                const now = new Date().toLocaleString();
                if (e.target.checked) e.target.setAttribute('checked', 'true');
                else e.target.removeAttribute('checked');
                e.target.setAttribute('title', `Modificato il: ${now}`);

                if (AppState.currentNoteId && !AppState.isSwitchingNote) {
                    const note = Store.getNote(AppState.currentNoteId);
                    if (note) {
                        const newContent = typeof Editor !== 'undefined' && typeof Editor.minifyHTMLForStorage === 'function'
                            ? Editor.minifyHTMLForStorage(editorEl.innerHTML)
                            : editorEl.innerHTML;
                        if (note.content !== newContent) {
                            note.content = newContent;
                            note._isDirty = true;
                            note.updatedAt = new Date().toISOString();
                        }
                        if (typeof Store !== 'undefined') Store.triggerAutoSave();
                    }
                }
            }
        });

        // 8. Dispatcher Click Globale
        document.addEventListener('click', (e) => {
            let target = e.target;

            // Chiusura Autocomplete se click all'esterno
            if (!target.closest('#searchInput') && !target.closest('.adv-filter-autocomplete')) {
                if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                    SidebarManager.SearchAutocomplete.hide();
                }
            }

            if (target.nodeType === 3) target = target.parentNode;
            if (!target || !target.closest) return;

            const isCtrlOrCmd = e.ctrlKey || e.metaKey;

            // Navigazione rapida da click su Hashtag
            // - In Read Mode: singolo click sinistro lancia direttamente la ricerca
            // - In Edit Mode: Ctrl + Click sinistro lancia la ricerca senza bloccare l'editing
            const editorContainer = target.closest('#noteContent');
            if (editorContainer) {
                const shouldTriggerTagSearch = (!AppState.isEditMode) || (AppState.isEditMode && isCtrlOrCmd);
                if (shouldTriggerTagSearch) {
                    const tagInfo = EventsGlobal._getClickedHashtagAtPoint(e.clientX, e.clientY);
                    if (tagInfo && tagInfo.cleanTag) {
                        e.preventDefault();
                        e.stopPropagation();

                        const sel = window.getSelection();
                        if (sel) sel.removeAllRanges();

                        EventsGlobal.executeTagSearch(tagInfo.cleanTag);
                        return;
                    }
                }
            }

            const isTd = target.closest('td');
            if (isTd && isTd.closest('.adv-table') && AppState.isEditMode) {
                if (!target.closest('.is-editing')) {
                    document.querySelectorAll('.adv-table td.is-editing').forEach(c => c.classList.remove('is-editing'));
                    isTd.focus({preventScroll: true});
                }
            }

            // Copia Snippet
            if (target.closest('.snippet-copy-btn')) {
                e.preventDefault();
                e.stopPropagation();
                const btn = target.closest('.snippet-copy-btn');
                const wrapper = btn.closest('.adv-copy-snippet');
                if (wrapper) {
                    const textSpan = wrapper.querySelector('.snippet-text');
                    if (textSpan) {
                        const rawText = textSpan.textContent || textSpan.innerText || '';
                        const textToCopy = rawText.replace(/[\u200B\uFEFF]/g, '').trim().replace(/\u00A0/g, ' ');
                        navigator.clipboard.writeText(textToCopy).then(() => {
                            btn.classList.add('copied');
                            btn.innerHTML = typeof Icons !== 'undefined' ? Icons.checkCircle : '✓';
                            if (typeof UI !== 'undefined' && UI.showToast) UI.showToast(I18n.t('events_global.toast_text_copied'), "success");
                            
                            setTimeout(() => {
                                btn.classList.remove('copied');
                                btn.innerHTML = typeof Icons !== 'undefined' ? Icons.clipboard : '📋';
                            }, 1500);
                        });
                    }
                }
                return;
            }

            if (target.closest('.cit-toggle')) {
                e.preventDefault();
                e.stopPropagation();
                const block = target.closest('.block-citation');
                if (!block) return;

                const body = block.querySelector('.citation-body');
                if (!body) return;

                const isCollapsed = block.getAttribute('data-collapsed') === 'true';

                if (isCollapsed) {
                    block.removeAttribute('data-collapsed');
                    body.style.display = 'block';
                    target.closest('.cit-toggle').style.transform = 'rotate(0deg)';
                } else {
                    block.setAttribute('data-collapsed', 'true');
                    body.style.display = 'none';
                    target.closest('.cit-toggle').style.transform = 'rotate(-90deg)';
                }
                if (typeof Store !== 'undefined') Store.triggerAutoSave();
                return;
            }

            const bookmark = target.closest('.adv-bookmark-marker');
            if (bookmark) {
                e.preventDefault();
                e.stopPropagation(); 
                if (typeof Editor !== 'undefined' && Editor.showBookmarkMenu) {
                    Editor.showBookmarkMenu(bookmark);
                }
                if (typeof LinkManager !== 'undefined') LinkManager.hideFloatingMenu();
                return;
            }

            const inlineNote = target.closest('.inline-note-marker');
            if (inlineNote) {
                e.preventDefault();
                if (inlineNote.closest('.block-citation')) return; 
                
                if (typeof Editor !== 'undefined' && Editor.handleInlineNoteClick) {
                    Editor.handleInlineNoteClick(inlineNote);
                }
                return;
            }

            if (target.tagName === 'A' || target.closest('a')) {
                const link = target.tagName === 'A' ? target : target.closest('a');

                if (link.hasAttribute('download')) {
                    return; 
                }

                if (AppState.isEditMode && link.closest('#noteContent')) {
                    // In Edit Mode: se l'utente tiene premuto Ctrl (o Cmd), naviga direttamente!
                    if (isCtrlOrCmd) {
                        e.preventDefault();
                        e.stopPropagation();
                        EventsGlobal.openLinkDirectly(link);
                        return;
                    }

                    // CITAZIONI: Se è dentro una citazione, clicca direttamente il link bypassando il menu fluttuante
                    if (link.closest('.block-citation')) {
                        e.preventDefault();
                        EventsGlobal.openLinkDirectly(link);
                        return;
                    }

                    e.preventDefault();
                    e.stopPropagation(); 
                    
                    if (typeof LinkManager !== 'undefined') LinkManager.showFloatingMenu(link);
                    if (typeof Editor !== 'undefined' && Editor.hideBookmarkMenu) Editor.hideBookmarkMenu();
                    return;
                } else {
                    if (link.classList.contains('internal-link')) {
                        e.preventDefault();
                        const noteId = link.getAttribute('data-note-id');
                        const anchor = link.getAttribute('data-anchor');
                        const refId = link.getAttribute('data-ref-id'); 
                        if (noteId) UI.selectNote(noteId, anchor, refId);
                    } else if (link.classList.contains('file-link')) {
                        e.preventDefault();
                        const path = link.getAttribute('data-file-path');
                        if (path) LinkManager.openViewer(path, link);
                    } else {
                        if (link.href && link.href.startsWith('http')) {
                            e.preventDefault();
                            window.open(link.href, '_blank');
                        }
                    }
                    return;
                }
            }

            if (typeof LinkManager !== 'undefined') LinkManager.hideFloatingMenu();
            if (typeof Editor !== 'undefined' && Editor.hideBookmarkMenu) Editor.hideBookmarkMenu();
        });
    }
});