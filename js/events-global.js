/**
 * events-global.js
 * Mappatura e intercettazione degli eventi globali dell'applicazione.
 * FIX MACRO DRAG: Esclusa la barra dei pulsanti dallo Scudo Drag (Drag Shield)
 * per evitare la corruzione dell'evento HTML5 nativo dovuto al pointer-events: none.
 * FIX CTRL+A: L'isolamento della selezione (Select-All) copre ora anche i campi testuali del Diario
 * e gli snippet, prevenendo selezioni globali indesiderate.
 * FIX DRAG-SCROLL: Inserito "Drag Assist Engine" con calcolo matematico.
 * RESTORE DRAG & DROP DEI BLOCCHI: Ripristinato l'intero motore nativo di intercettazione
 * dragstart, dragenter, dragover, dragleave, dragend e drop su editorEl con posizionamento
 * dinamico di #adv-drop-indicator e scroll assistito a 60FPS.
 * RESTORE AUTOFIT DBLCLICK: Ripristinato l'ascoltatore per l'auto-fit delle colonne al doppio click sul resizer.
 * RESTORE SMART CLICK ESCAPE: Ripristinato il listener mousedown su editorEl.
 * FEAT HORIZONTAL WHEEL SCROLL: Scorrimento orizzontale continuo su Kanban e Timeline tramite mouse wheel.
 * FIX TEXTNODE TARGET CLOSEST: Normalizzazione difensiva di e.target nei listener dragstart, dblclick e wheel.
 * FIX ISOLAMENTO INPUT WIDGET: Impedisce all'evento input scatenato dentro celle di database o diari
 * di risalire verso l'editor principale, azzerando le false sporcature di note.updatedAt e i falsi conflitti concorrenti.
 */

const EventsGlobal = {
    _lastMiddleClickTime: 0,

    _triggerSearchUpdate: () => {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            AppState._currentHighlightIndex = 0;
            EventsGlobal._executeSearchLogic(searchInput);
        }
    },

    _executeSearchLogic: (searchInput) => {
        const searchControls = document.getElementById('searchControls');
        const searchCounter = document.getElementById('searchCounter');

        if (AppState.currentNoteId && AppState.isEditMode && !AppState.isSwitchingNote) {
            const currentNote = Store.getNote(AppState.currentNoteId);
            if (currentNote && typeof Editor !== 'undefined') {
                currentNote.content = Editor.getCleanHTML();
            }
        }

        AppState.searchFilter = searchInput.value.toLowerCase();
        
        // Ridisegniamo i filtri a pillola attivi
        if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
            SidebarManager.SearchAutocomplete.renderPills();
        }
        
        // Mostriamo i controlli se c'è un testo OPPURE se c'è un filtro proprietà attivo
        const hasActivePropFilters = AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0;
        
        if (searchInput.value.length > 0 || hasActivePropFilters) {
            if (searchControls) searchControls.classList.remove('hidden');
        } else {
            if (searchControls) searchControls.classList.add('hidden');
            AppState._totalHighlights = 0;
            AppState._globalHighlights = 0;
            AppState._currentHighlightIndex = 0;
        }

        UI.renderTree();
        
        if (AppState.currentNoteId) UI.selectNote(AppState.currentNoteId);
        
        setTimeout(() => {
            const editor = document.getElementById('noteContent');
            if (editor) {
                AppState._totalHighlights = editor.querySelectorAll('mark.search-highlight').length;
                
                if (searchCounter) {
                    if (AppState._totalHighlights > 0) {
                        if (AppState._currentHighlightIndex === -1) {
                            AppState._currentHighlightIndex = AppState._totalHighlights - 1;
                        } else if (AppState._currentHighlightIndex >= AppState._totalHighlights) {
                            AppState._currentHighlightIndex = 0;
                        }
                        AppState._focusHighlight(AppState._currentHighlightIndex);
                    } else {
                        searchCounter.innerText = `0/0/${AppState._globalHighlights}`;
                    }
                }
            }
        }, 150);
    },

    // Risoluzione ed esecuzione diretta dei link (usata da click e auxclick centrale)
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

            // GESTIONE ANCORE INTERNE (In-page Anchors es. #sec-1, #sec-2-media, #manualTopIndex)
            if (href.startsWith('#')) {
                const targetId = href.substring(1);
                if (targetId) {
                    let targetEl = document.getElementById(targetId);
                    
                    // Fallback intelligente: se l'ancora specifica non esiste, prova a risalire alla macro-sezione (es. sec-2)
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

        // =========================================================================
        // DRAG ASSIST ENGINE (Motore di Scrolling Forzato e Scudo CSS)
        // =========================================================================
        let dragScrollTimer = null;
        let dragScrollSpeed = 0;

        const toggleDragShield = (enable, draggedType) => {
            let shield = document.getElementById('drag-shield-style');
            if (enable) {
                if (!shield) {
                    shield = document.createElement('style');
                    shield.id = 'drag-shield-style';
                    
                    // FIX MACRO DRAG: Esclusione .widget-type-buttonbar.
                    // Evita l'annullamento del drag nativo nei widget con maniglie posizionate nel body.
                    shield.innerHTML = `
                        iframe, object, embed { pointer-events: none !important; }
                        .adv-widget-shell:not(.widget-type-buttonbar) .widget-body { pointer-events: none !important; }
                        .simple-table-wrapper td, .simple-table-wrapper th, .widget-type-columns .col-box { pointer-events: auto !important; }
                    `;
                    document.head.appendChild(shield);
                }
            } else {
                if (shield) {
                    shield.remove();
                }
            }
        };

        const stopDragAssist = () => {
            toggleDragShield(false, null);
            if (dragScrollTimer) {
                cancelAnimationFrame(dragScrollTimer);
                dragScrollTimer = null;
            }
        };
        // =========================================================================

        const hideDropIndicator = () => {
            const ind = document.getElementById('adv-drop-indicator');
            if (ind) ind.style.display = 'none';
        };

        const scrollArea = document.getElementById('editorScrollContent');
        if (scrollArea) {
            scrollArea.addEventListener('click', (e) => {
                if (e.target === scrollArea && AppState.isEditMode) {
                    // 1. Controllo di sicurezza per la normale selezione nel DOM (contenteditable)
                    const sel = window.getSelection();
                    if (!sel.isCollapsed) return;

                    // 2. FIX SELEZIONE TITOLO: Controllo di sicurezza per i campi Input/Textarea nativi
                    const activeEl = document.activeElement;
                    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                        // Se c'è del testo evidenziato dentro l'input (es. Titolo), ci fermiamo!
                        if (activeEl.selectionStart !== activeEl.selectionEnd) return;
                    }

                    // Se non c'è nulla di selezionato, possiamo procedere a forzare il focus nell'editor
                    const editorEl = document.getElementById('noteContent');
                    if (editorEl && activeEl !== document.getElementById('noteTitle')) {
                        editorEl.focus();
                        const range = document.createRange();
                        range.selectNodeContents(editorEl);
                        range.collapse(false); 
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            });
        }

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
                
                // SCROLL: Forza la chiusura del Floating Menu in selezione per le Tabelle Semplici
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

        // BLINDO SALVATAGGIO IN USCITA: Supporto Workspace a cartelle e avviso nativo anti-perdita dati
        window.addEventListener('beforeunload', (e) => {
            if (Store.isDirty) {
                if (AppState.workspaceHandle) {
                    Store.saveToFile();
                } else {
                    Store.saveLocalBackup();
                }
                e.preventDefault();
                e.returnValue = '';
            }
        });

        const searchInput = document.getElementById('searchInput');
        const searchClear = document.getElementById('searchClearBtn');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                // Innesca l'autocomplete per i Tag
                if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                    SidebarManager.SearchAutocomplete.show(e.target, e.target.value);
                }
                AppState._currentHighlightIndex = 0;
                EventsGlobal._executeSearchLogic(searchInput);
            });
            
            // FIX RIPRISTINO SUGGERIMENTI: Selezionando una nota si perdeva il blur. 
            // Cliccando sull'input ora si riaprono i suggerimenti!
            searchInput.addEventListener('focus', (e) => {
                if (e.target.value) {
                    if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                        SidebarManager.SearchAutocomplete.show(e.target, e.target.value);
                    }
                }
            });
            
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) AppState.findPrevious();
                    else AppState.findNext();
                }
            });
            
            searchInput.addEventListener('blur', () => {
                if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                    SidebarManager.SearchAutocomplete.scheduleHide();
                }
            });
        }

        if (searchClear) {
            searchClear.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.focus();
                }
                // Svuota anche i filtri Proprietà/Tag
                AppState.activePropertyFilters = [];
                EventsGlobal._triggerSearchUpdate();
            });
        }

        const editorEl = document.getElementById('noteContent');
        if (!editorEl) return;

        if (typeof Editor !== 'undefined') {
            Editor.initMultiCursor(editorEl);
            Editor.initCopyInterceptor(); 
        }

        document.addEventListener('keydown', (e) => {
            if (!AppState.isEditMode) return;
            
            // Blocco di sicurezza anti-crash per eventi sintetici scatenati dal Browser Autocomplete
            if (!e.key) return; 

            // ISOLAMENTO RIGOROSO INPUT NATIVI: Se l'utente sta digitando in un input o textarea
            // (es. Titolo nota, barre di ricerca, campi form, modali), lascia che il browser gestisca
            // nativamente testo, tasti freccia, cancellazione e virgolette senza intromissioni dell'editor.
            const isNativeInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
            if (isNativeInput) {
                return;
            }

            const isCtrlOrCmd = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();

            // ISOLAMENTO SELECT-ALL (Ctrl+A)
            if (isCtrlOrCmd && key === 'a' && AppState.isEditMode) {
                const sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    let node = sel.anchorNode;
                    if (node && node.nodeType === 3) node = node.parentNode;
                    
                    // Identifica se siamo in una sotto-area editabile protetta (Codice, Diario, Cella DB o Tabella Semplice, Snippet)
                    const isolatedArea = node ? node.closest('.code-content, .journal-content, .snippet-text, .adv-cell-text, td[contenteditable="true"], th[contenteditable="true"]') : null;
                    
                    if (isolatedArea) {
                        e.preventDefault();
                        const range = document.createRange();
                        range.selectNodeContents(isolatedArea);
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
                        alert("⚠️ Taglio non consentito: Stai tentando di tagliare elementi complessi (Widget) mischiati a testo normale.\nPer evitare corruzioni, sposta o elimina questi elementi tramite i loro menu dedicati.");
                        return;
                    }
                }
            }

            if (typeof Editor !== 'undefined') {
                if (!isCtrlOrCmd && !e.altKey && AppState.isEditMode) {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        if (typeof Editor.handleTableNavigation === 'function') {
                            if (Editor.handleTableNavigation(e)) return;
                        }
                    }
                }

                if (e.key === 'Enter') { Editor.registerTypingStart(e.key); Editor.handleEnterKey(e); }
                if (e.key === 'Tab') { Editor.registerTypingStart(e.key); Editor.handleTabKey(e); }
                if (e.key === 'Backspace') { Editor.handleBackspaceKey(e); }
                if (e.key === 'Delete') { 
                    if (e.shiftKey) return; // Lascia che il browser gestisca Shift+Delete come Cut (Taglia) nativo
                    Editor.handleDeleteKey(e); 
                }
                
                if (!isCtrlOrCmd && !e.altKey && AppState.isEditMode) {
                    Editor.handleBracketAutoClose(e);
                    Editor.handleFormatEscape(e);
                }
            }

            if (isCtrlOrCmd && AppState.isEditMode) {
                if (key === 'b') { e.preventDefault(); Editor.exec('bold'); return; }
                if (key === 'i') { e.preventDefault(); Editor.exec('italic'); return; }
                if (key === 'u') { e.preventDefault(); Editor.exec('underline'); return; }
                if (key === 'k') { e.preventDefault(); Editor.toggleCase(); return; }
                
                if (key === 'd') { 
                    e.preventDefault(); 
                    Editor.triggerMultiCursor(); 
                    return; 
                }
            }

            if (e.altKey && AppState.isEditMode) {
                if (e.key === 'ArrowUp') { e.preventDefault(); Editor.moveBlock(-1); return; }
                if (e.key === 'ArrowDown') { e.preventDefault(); Editor.moveBlock(1); return; }
            }

            if (isCtrlOrCmd && !e.shiftKey && key === 'z') {
                e.preventDefault();
                Editor.undo();
                return;
            }
            if ((isCtrlOrCmd && key === 'y') || (isCtrlOrCmd && e.shiftKey && key === 'z')) {
                e.preventDefault();
                Editor.redo();
                return;
            }

            if (!isCtrlOrCmd && !e.altKey && e.key.length === 1) {
                const sel = window.getSelection();
                if (!sel.isCollapsed && sel.rangeCount > 0) {
                    if (typeof Editor !== 'undefined' && Editor.handleBulkWidgetDeletion) {
                        if (!Editor.handleBulkWidgetDeletion()) {
                            e.preventDefault(); 
                            return;
                        }
                    }
                }
                if (typeof Editor !== 'undefined') Editor.registerTypingStart(e.key);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
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
                
                const drawer = document.getElementById('advGlobalDrawer');
                if (drawer && drawer.classList.contains('open')) {
                    if (typeof UI.closeDrawer !== 'undefined') UI.closeDrawer();
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

        document.addEventListener('dblclick', (e) => {
            if (!AppState.isEditMode) return;

            let target = e.target;
            if (target && target.nodeType === 3) target = target.parentNode;
            if (!target || !target.closest) return;

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

        // =========================================================================
        // MOTORE DI GESTIONE TRASCINAMENTO BLOCCHI NELL'EDITOR (DRAG & DROP WIDGETS)
        // =========================================================================
        editorEl.addEventListener('dragstart', (e) => {
            if (!AppState.isEditMode) return;

            let target = e.target;
            if (target && target.nodeType === 3) target = target.parentNode;
            if (!target || !target.closest) return;
            
            // CITAZIONI: Mai avviare un drag per nulla che si trovi in una citazione,
            // TRANNE per la maniglia di trascinamento della citazione stessa!
            if (target.closest('.block-citation') && !target.closest('.widget-drag-handle')) {
                e.preventDefault();
                return;
            }

            const thElement = target.closest('th');
            
            if (target.closest('.adv-col-resizer') || 
                target.closest('.adv-board-card') || 
               (thElement && thElement.hasAttribute('data-col')) || 
                (target.classList && (
                    target.classList.contains('table-row-trigger') || 
                    target.classList.contains('table-col-trigger') ||
                    target.classList.contains('table-move-trigger')
                ))) {
                return; 
            }
            
            if (target.tagName === 'IMG' && target.hasAttribute('data-image-ref')) {
                AppState.draggedBlockId = target.getAttribute('data-image-ref');
                AppState.draggedBlockType = 'image';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', AppState.draggedBlockId);
                return;
            }
            
            const widgetWrapper = target.closest(WidgetManager.blockSelector + ', .simple-table-wrapper');
            
            if (widgetWrapper) {
                AppState.draggedBlockId = widgetWrapper.id;
                if (widgetWrapper.hasAttribute('data-widget-type')) {
                    AppState.draggedBlockType = widgetWrapper.getAttribute('data-widget-type');
                } else if (widgetWrapper.classList.contains('adv-table-wrapper')) {
                    AppState.draggedBlockType = 'database';
                } else if (widgetWrapper.classList.contains('adv-journal-wrapper')) {
                    AppState.draggedBlockType = 'journal';
                } else if (widgetWrapper.classList.contains('code-wrapper')) {
                    AppState.draggedBlockType = 'code';
                } else if (widgetWrapper.classList.contains('block-citation')) {
                    AppState.draggedBlockType = 'citation';
                } else if (widgetWrapper.classList.contains('simple-table-wrapper')) {
                    AppState.draggedBlockType = 'simple-table';
                }
                
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', widgetWrapper.id);

                // DRAG ASSIST: Attiviamo lo scudo e il motore per i widget complessi
                toggleDragShield(true, AppState.draggedBlockType);
                return;
            }

            // GESTIONE TRASCINAMENTO TESTO SELEZIONATO (INLINE TEXT DRAG)
            // Previene che il browser serializzi i tag contenitore (es. <ul><li>) spezzando l'elenco al rilascio
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
                if (typeof Editor !== 'undefined' && typeof Editor.saveSnapshot === 'function') {
                    Editor.saveSnapshot(true);
                }

                const range = sel.getRangeAt(0);
                let common = range.commonAncestorContainer;
                if (common.nodeType === 3) common = common.parentNode;

                const singleBlock = common ? common.closest('li, p, h1, h2, h3, h4, h5, h6, td, th') : null;
                if (singleBlock) {
                    const tempDiv = document.createElement('div');
                    tempDiv.appendChild(range.cloneContents());

                    // Rimuove tag di blocco che provocherebbero lo split del contenitore di destinazione
                    let cleanHtml = tempDiv.innerHTML.replace(/<\/?(ul|ol|li|p|div)[^>]*>/gi, '');
                    const plainText = sel.toString();

                    e.dataTransfer.setData('text/plain', plainText);
                    if (cleanHtml) {
                        e.dataTransfer.setData('text/html', cleanHtml);
                    }
                }
            }
        });

        editorEl.addEventListener('dragenter', (e) => {
            if (typeof TableManager !== 'undefined' && TableManager.Drag && TableManager.Drag.dragState) {
                if (typeof TableManager.Drag.handleDragEnter === 'function') {
                    TableManager.Drag.handleDragEnter(e);
                }
            }
        });

        editorEl.addEventListener('dragover', (e) => {
            if (typeof AdvancedTable !== 'undefined' && AdvancedTable.draggedColId) return;
            
            if (typeof TableManager !== 'undefined' && TableManager.Drag && TableManager.Drag.dragState) {
                TableManager.Drag.handleDragOver(e);
                return;
            }

            if (AppState.draggedBlockId && AppState.isEditMode) {
                e.preventDefault(); 
                e.dataTransfer.dropEffect = 'move';

                // ==============================================================
                // DRAG ASSIST: Scroll Engine a 60FPS
                // Se mi avvicino ai margini dell'editor, scorro automaticamente
                // ==============================================================
                const scrollContainer = document.getElementById('editorScrollContent');
                if (scrollContainer) {
                    const rect = scrollContainer.getBoundingClientRect();
                    const threshold = 100;
                    const maxSpeed = 30;

                    dragScrollSpeed = 0;
                    if (e.clientY - rect.top < threshold) {
                        dragScrollSpeed = -maxSpeed * (1 - (e.clientY - rect.top) / threshold);
                    } else if (rect.bottom - e.clientY < threshold) {
                        dragScrollSpeed = maxSpeed * (1 - (rect.bottom - e.clientY) / threshold);
                    }

                    if (dragScrollSpeed !== 0) {
                        if (!dragScrollTimer) {
                            const scrollLoop = () => {
                                scrollContainer.scrollTop += dragScrollSpeed;
                                dragScrollTimer = requestAnimationFrame(scrollLoop);
                            };
                            dragScrollTimer = requestAnimationFrame(scrollLoop);
                        }
                    } else {
                        if (dragScrollTimer) {
                            cancelAnimationFrame(dragScrollTimer);
                            dragScrollTimer = null;
                        }
                    }
                }

                let dropNode = null;
                if (document.caretRangeFromPoint) {
                    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
                    if (range) dropNode = range.startContainer;
                } else if (document.caretPositionFromPoint) {
                    const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
                    if (pos) dropNode = pos.offsetNode;
                }
                if (!dropNode) dropNode = e.target;
                if (dropNode && dropNode.nodeType === 3) dropNode = dropNode.parentNode;
                if (!dropNode || !dropNode.closest) {
                    hideDropIndicator();
                    return;
                }

                let sourceBlock = null;
                if (AppState.draggedBlockType === 'image') {
                    sourceBlock = editorEl.querySelector(`img[data-image-ref="${AppState.draggedBlockId}"]`);
                } else {
                    sourceBlock = document.getElementById(AppState.draggedBlockId);
                }

                if (!sourceBlock || dropNode === sourceBlock || sourceBlock.contains(dropNode)) {
                    hideDropIndicator();
                    return;
                }

                let protectedParent = dropNode.closest(WidgetManager.blockSelector + ', .simple-table-wrapper');
                let targetElement = null;

                // DRAG & DROP: Ignora lo scudo se rilasciamo l'immagine in una tabella semplice
                if (protectedParent && protectedParent.classList.contains('simple-table-wrapper') && ['image', 'audio', 'snippet'].includes(AppState.draggedBlockType)) {
                    protectedParent = null; 
                }

                if (protectedParent && protectedParent !== sourceBlock) {
                    if (AppState.draggedBlockType === 'image') {
                        hideDropIndicator();
                        return;
                    }
                    targetElement = protectedParent;
                } else {
                    if (!targetElement) {
                        targetElement = dropNode.closest('p, div, li, td, th, h1, h2, h3, blockquote');
                    }
                }

                // CITAZIONI: Impedire drop dentro una citazione
                if (targetElement && targetElement.closest('.block-citation')) {
                    hideDropIndicator();
                    return;
                }

                if (targetElement) {
                    const rect = targetElement.getBoundingClientRect();
                    const isTop = e.clientY < rect.top + (rect.height / 2);

                    let indicator = document.getElementById('adv-drop-indicator');
                    if (!indicator) {
                        indicator = document.createElement('div');
                        indicator.id = 'adv-drop-indicator';
                        document.body.appendChild(indicator);
                    }

                    const tag = targetElement.tagName.toUpperCase();
                    if (['TD', 'TH', 'LI', 'BLOCKQUOTE'].includes(tag) && !targetElement.classList.contains('adv-columns-container-wrap') && !targetElement.classList.contains('block-citation')) {
                         indicator.style.top = (rect.bottom + window.scrollY - 2) + 'px';
                         indicator.style.left = (rect.left + window.scrollX) + 'px';
                         indicator.style.width = rect.width + 'px';
                    } else {
                         const topPos = isTop ? rect.top : rect.bottom;
                         indicator.style.top = (topPos + window.scrollY - 1) + 'px';
                         indicator.style.left = (rect.left + window.scrollX) + 'px';
                         indicator.style.width = rect.width + 'px';
                    }

                    indicator.style.display = 'block';
                } else {
                    hideDropIndicator();
                }
            }
        });

        editorEl.addEventListener('dragleave', (e) => {
            if (typeof AdvancedTable !== 'undefined' && AdvancedTable.draggedColId) return;
            
            if (typeof TableManager !== 'undefined' && TableManager.Drag && TableManager.Drag.dragState) {
                const ind = document.getElementById('adv-table-drop-indicator');
                if (ind) ind.style.display = 'none';
                return;
            }

            if (AppState.draggedBlockId) {
                const rect = editorEl.getBoundingClientRect();
                if (e.clientX <= rect.left || e.clientX >= rect.right || e.clientY <= rect.top || e.clientY >= rect.bottom) {
                    hideDropIndicator();
                    // Interrompiamo lo scroll forzato se il mouse esce fisicamente dall'editor
                    if (dragScrollTimer) {
                        cancelAnimationFrame(dragScrollTimer);
                        dragScrollTimer = null;
                    }
                }
            }
        });

        editorEl.addEventListener('dragend', (e) => {
            if (typeof AdvancedTable !== 'undefined' && AdvancedTable.draggedColId) {
                AdvancedTable.draggedColId = null;
                document.querySelectorAll('th').forEach(th => { th.style.opacity = '1'; th.style.borderLeft = ''; });
                return;
            }

            hideDropIndicator();
            AppState.draggedBlockId = null;
            AppState.draggedBlockType = null;
            document.querySelectorAll('.node-content').forEach(el => el.classList.remove('drag-top', 'drag-bottom', 'drag-middle'));
            const tc = document.getElementById('treeContainer');
            if (tc) tc.classList.remove('drag-over-root');
            
            // DRAG ASSIST: Rimuove lo scudo e ferma lo scorrimento
            stopDragAssist();
        });

        editorEl.addEventListener('drop', (e) => {
            if (typeof AdvancedTable !== 'undefined' && AdvancedTable.draggedColId) {
                AdvancedTable.draggedColId = null;
                return;
            }
            
            if (typeof TableManager !== 'undefined' && TableManager.Drag && TableManager.Drag.dragState) {
                TableManager.Drag.handleDrop(e);
                return;
            }

            hideDropIndicator();
            
            if (AppState.draggedBlockId && AppState.isEditMode) {
                e.preventDefault(); 
                e.stopPropagation();

                const blockId = AppState.draggedBlockId;

                // DRAG ASSIST: Arresto Immediato del motore prima dei calcoli di rilascio
                stopDragAssist();

                let target = e.target;
                if (target && target.nodeType === 3) target = target.parentNode;
                if (!target || !target.closest) return;

                // CITAZIONI: Rilascio bloccato
                if (target.closest('.block-citation')) {
                    if (typeof UI !== 'undefined' && UI.showToast) UI.showToast("Azione bloccata: Non puoi aggiungere elementi all'interno di una citazione.", "warning");
                    return;
                }

                let sourceBlock = null;

                if (AppState.draggedBlockType === 'image') {
                    sourceBlock = editorEl.querySelector(`img[data-image-ref="${blockId}"]`);
                } else {
                    sourceBlock = document.getElementById(blockId);
                }

                if (!sourceBlock) {
                    AppState.draggedBlockId = null;
                    AppState.draggedBlockType = null;
                    return;
                }

                let dropNode = null;
                let range = null;
                
                if (document.caretRangeFromPoint) {
                    range = document.caretRangeFromPoint(e.clientX, e.clientY);
                    if (range) dropNode = range.startContainer;
                } else if (document.caretPositionFromPoint) {
                    const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
                    if (pos) {
                        dropNode = pos.offsetNode;
                        range = document.createRange();
                        range.setStart(pos.offsetNode, pos.offset);
                        range.collapse(true);
                    }
                }

                if (!dropNode) dropNode = target; 
                if (dropNode && dropNode.nodeType === 3) dropNode = dropNode.parentNode;

                if (dropNode === sourceBlock || sourceBlock.contains(dropNode)) {
                    AppState.draggedBlockId = null;
                    AppState.draggedBlockType = null;
                    return;
                }

                let protectedParent = dropNode && dropNode.closest ? dropNode.closest(WidgetManager.blockSelector + ', .simple-table-wrapper') : null;
                let targetElement = null;

                // DRAG & DROP: Ignora lo scudo se rilasciamo l'immagine in una tabella semplice
                if (protectedParent && protectedParent.classList.contains('simple-table-wrapper') && ['image', 'audio', 'snippet'].includes(AppState.draggedBlockType)) {
                    protectedParent = null; 
                }

                if (protectedParent && AppState.draggedBlockType === 'image') {
                    UI.showToast("Le immagini non possono essere inserite all'interno di un componente avanzato.", "warning");
                    AppState.draggedBlockId = null;
                    AppState.draggedBlockType = null;
                    return;
                }
                
                if (typeof Editor !== 'undefined') Editor.saveSnapshot();

                if (protectedParent && protectedParent !== sourceBlock) {
                    const rect = protectedParent.getBoundingClientRect();
                    if (e.clientY < rect.top + (rect.height / 2)) {
                        protectedParent.parentNode.insertBefore(sourceBlock, protectedParent);
                    } else {
                        protectedParent.parentNode.insertBefore(sourceBlock, protectedParent.nextSibling);
                    }
                } 
                else {
                    if (!targetElement) {
                        let targetBlock = dropNode.nodeType === 3 ? dropNode.parentNode : dropNode;
                        targetElement = targetBlock.closest('p, div, li, td, th, h1, h2, h3, blockquote');
                    }

                    if (targetElement && targetElement.id !== 'noteContent' && !targetElement.classList.contains('editor-content')) {
                        const tag = targetElement.tagName.toUpperCase();

                        if (['TD', 'TH', 'LI', 'BLOCKQUOTE'].includes(tag) && !targetElement.classList.contains('adv-columns-container-wrap') && !targetElement.classList.contains('block-citation')) {
                            if (range) {
                                range.insertNode(sourceBlock);
                            } else {
                                targetElement.appendChild(sourceBlock);
                            }
                        } 
                        else {
                            const rect = targetElement.getBoundingClientRect();
                            if (e.clientY < rect.top + (rect.height / 2)) {
                                targetElement.parentNode.insertBefore(sourceBlock, targetElement);
                            } else {
                                targetElement.parentNode.insertBefore(sourceBlock, targetElement.nextSibling);
                            }
                        }
                    } else {
                        editorEl.appendChild(sourceBlock); 
                    }
                }

                window.getSelection().removeAllRanges();
                AppState.draggedBlockId = null;
                AppState.draggedBlockType = null;

                setTimeout(() => {
                    if (typeof WidgetManager !== 'undefined') WidgetManager.mountAll();
                    if (typeof Store !== 'undefined') Store.triggerAutoSave();
                }, 10);

                return;
            }

            // Arresto Immediato del motore anche per rilasci a vuoto o di testo
            stopDragAssist();

            let targetNode = e.target;
            if (targetNode && targetNode.nodeType === 3) targetNode = targetNode.parentNode;
            if (!targetNode || !targetNode.closest) return;

            if (targetNode.closest('.block-citation')) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof UI !== 'undefined' && UI.showToast) UI.showToast("Azione bloccata: Non puoi aggiungere elementi all'interno di una citazione.", "warning");
                return;
            }

            if (!AppState.draggedBlockId && AppState.isEditMode) {
                if (typeof WidgetManager !== 'undefined') {
                    if (WidgetManager.isProtectedBlock(targetNode) && !WidgetManager.isInsideEditableWidgetArea(targetNode)) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (typeof UI !== 'undefined' && UI.showToast) {
                            UI.showToast("Azione bloccata: Non puoi rilasciare testo libero sopra l'infrastruttura di un Widget.", "warning");
                        }
                        return;
                    }
                }
            }

            if (targetNode.closest('.adv-cell-text') && AppState.isEditMode && !AppState.draggedBlockId) {
                e.preventDefault();
                const text = e.dataTransfer.getData('text/plain');
                document.execCommand('insertText', false, text);
                return;
            }

            // Consolidamento stato post-spostamento testo per abilitare Undo (Ctrl+Z)
            setTimeout(() => {
                if (AppState.isEditMode && typeof Editor !== 'undefined' && typeof Editor.saveSnapshot === 'function') {
                    Editor.saveSnapshot(true);
                }
                if (typeof WidgetManager !== 'undefined') WidgetManager.mountAll();
                if (typeof Store !== 'undefined') Store.triggerAutoSave();
            }, 10);
        });

        // -------------------------------------------------------------
        // AUXCLICK (MIDDLE CLICK SUI LINK)
        // -------------------------------------------------------------
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

        // =========================================================================
        // SCROLL ORIZZONTALE FLUIDO CON MOUSE WHEEL (Shift + Wheel o Timeline/Kanban)
        // =========================================================================
        document.addEventListener('wheel', (e) => {
            let target = e.target;
            if (target && target.nodeType === 3) target = target.parentNode;
            if (!target || !target.closest) return;

            if (target.closest('#canvasViewport')) return;

            const timelineScroll = target.closest('[id^="timeline-scroll-"]');
            const boardContainer = target.closest('.adv-board-container');
            const scrollContainer = target.closest('.adv-scroll-container');

            if (e.shiftKey && scrollContainer) {
                if (scrollContainer.scrollWidth > scrollContainer.clientWidth) {
                    e.preventDefault();
                    scrollContainer.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
                }
            } else if (timelineScroll) {
                // Sulla Timeline, se l'utente usa la rotella del mouse sull'intestazione o nell'area libera
                if (target.closest('.adv-timeline-header-sticky') || !target.closest('.adv-cal-week-container')) {
                    if (timelineScroll.scrollWidth > timelineScroll.clientWidth) {
                        e.preventDefault();
                        timelineScroll.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
                    }
                }
            } else if (boardContainer) {
                // Nella bacheca Kanban, se l'utente usa la rotella sull'intestazione o tra le colonne
                const kanbanCol = target.closest('.adv-kanban-col');
                if (!kanbanCol || kanbanCol.scrollHeight <= kanbanCol.clientHeight) {
                    if (boardContainer.scrollWidth > boardContainer.clientWidth) {
                        e.preventDefault();
                        boardContainer.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
                    }
                }
            }
        }, { passive: false });

        editorEl.addEventListener('paste', (e) => {
            if (AppState.isEditMode && typeof Editor !== 'undefined' && Editor.handlePaste) {
                Editor.handlePaste(e);
            }
        });

        editorEl.addEventListener('input', (e) => {
            if (!AppState.isSwitchingNote) {
                // Se l'evento input proviene dall'interno di un widget (database, diario, codice, ecc.)
                // non aggiornare il testo della nota principale: il widget gestisce la propria persistenza!
                const target = e.target;
                const isInsideWidget = target && target.closest && !!target.closest(WidgetManager.blockSelector);
                if (isInsideWidget) {
                    return;
                }

                if (typeof Editor !== 'undefined' && typeof Editor.healFontArtifacts === 'function') {
                    Editor.healFontArtifacts(editorEl);
                }
                if (typeof Editor !== 'undefined' && Editor.handleMarkdownShortcuts) {
                    Editor.handleMarkdownShortcuts();
                }
                
                if (typeof UI !== 'undefined' && UI.handleEditorInput) {
                    UI.handleEditorInput();
                }
            }
        });

        // FIX UX CURSORE: Inibiamo esplicitamente l'apparizione delle toolbar tabella
        // se il mouse è stato rilasciato sopra un'immagine!
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

        editorEl.addEventListener('change', (e) => {
            if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
                const now = new Date().toLocaleString();
                if (e.target.checked) e.target.setAttribute('checked', 'true');
                else e.target.removeAttribute('checked');
                e.target.setAttribute('title', `Modificato: ${now}`);
                if (AppState.currentNoteId && !AppState.isSwitchingNote) {
                    const note = Store.getNote(AppState.currentNoteId);
                    note.content = editorEl.innerHTML;
                    if (typeof Store !== 'undefined') Store.triggerAutoSave();
                }
            }
        });

        document.addEventListener('click', (e) => {
            let target = e.target;

            // CHIUSURA AUTOCOMPLETE: Se clicchi fuori dal popup o dalla barra, si chiude.
            if (!target.closest('#searchInput') && !target.closest('.adv-filter-autocomplete')) {
                if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                    SidebarManager.SearchAutocomplete.hide();
                }
            }

            if (target.nodeType === 3) target = target.parentNode;
            if (!target || !target.closest) return;

            const isTd = target.closest('td');
            if (isTd && isTd.closest('.adv-table') && AppState.isEditMode) {
                if (!target.closest('.is-editing')) {
                    document.querySelectorAll('.adv-table td.is-editing').forEach(c => c.classList.remove('is-editing'));
                    isTd.focus({preventScroll: true});
                }
            }

            if (target.closest('.snippet-copy-btn')) {
                e.preventDefault();
                e.stopPropagation();
                const btn = target.closest('.snippet-copy-btn');
                const wrapper = btn.closest('.adv-copy-snippet');
                if (wrapper) {
                    const textSpan = wrapper.querySelector('.snippet-text');
                    if (textSpan) {
                        const textToCopy = textSpan.innerText.trim().replace(/\u00A0/g, ' ');
                        navigator.clipboard.writeText(textToCopy).then(() => {
                            btn.classList.add('copied');
                            btn.innerHTML = typeof Icons !== 'undefined' ? Icons.checkCircle : '✓';
                            if (typeof UI !== 'undefined' && UI.showToast) UI.showToast("Testo copiato!", "success");
                            
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

                // Supporto per click centrale nel caso venga emesso sul listener click (legacy/fallback)
                if (e.button === 1 || e.which === 2) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (Date.now() - EventsGlobal._lastMiddleClickTime < 250) return;
                    EventsGlobal._lastMiddleClickTime = Date.now();
                    EventsGlobal.openLinkDirectly(link);
                    return;
                }

                if (AppState.isEditMode && !e.ctrlKey && !e.metaKey && link.closest('#noteContent')) {
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

            if (target.classList.contains('code-copy-btn') || target.classList.contains('code-action-copy')) {
                e.preventDefault();
                const wrapper = target.closest('.code-wrapper');

                const clone = wrapper.cloneNode(true);
                const actionBars = clone.querySelectorAll('.code-action-bar');
                actionBars.forEach(bar => bar.remove());

                let textToCopy = "";
                if (wrapper.id && AppState.databases) {
                    const trueId = wrapper.id.split('_cited_')[0];
                    if (AppState.databases[trueId] && AppState.databases[trueId].content !== undefined) {
                        textToCopy = AppState.databases[trueId].content;
                    }
                }
                
                if (!textToCopy) textToCopy = clone.innerText.trim();

                if (textToCopy) {
                    navigator.clipboard.writeText(textToCopy).then(() => {
                        target.style.color = "var(--accent-color)";
                        if (typeof UI !== 'undefined' && UI.showToast) {
                            UI.showToast("Copiato negli appunti!", "success");
                        }
                        setTimeout(() => { target.style.color = ""; }, 1500);
                    }).catch(err => {
                        console.error("Errore copia:", err);
                    });
                }
            }
        });
    }
};