/**
 * events-global.js
 * Mappatura e intercettazione degli eventi globali dell'applicazione.
 * FIX MACRO DRAG: Esclusa la barra dei pulsanti dallo Scudo Drag (Drag Shield)
 * per evitare la corruzione dell'evento HTML5 nativo dovuto al pointer-events: none.
 * FIX CTRL+A: L'isolamento della selezione (Select-All) copre ora anche i campi testuali del Diario,
 * gli snippet, tutte le celle di testo e numeriche dei database e i titoli di tutti i widget,
 * impedendo la selezione accidentale dell'intera pagina.
 * FIX DRAG-SCROLL: Inserito "Drag Assist Engine" con calcolo matematico.
 * RESTORE DRAG & DROP DEI BLOCCHI: Ripristinato l'intero motore nativo di intercettazione
 * dragstart, dragenter, dragover, dragleave, dragend e drop su editorEl con posizionamento
 * dinamico di #adv-drop-indicator e scroll assistito a 60FPS.
 * RESTORE AUTOFIT DBLCLICK: Ripristinato l'ascoltatore per l'auto-fit delle colonne al doppio click sul resizer.
 * RESTORE SMART CLICK ESCAPE: Ripristinato il listener mousedown su editorEl.
 * FEAT HORIZONTAL WHEEL SCROLL: Scorrimento orizzontale continuo su Kanban e Timeline tramite mouse wheel.
 * FIX TEXTNODE TARGET CLOSEST: Normalizzazione difensiva di e.target nei listener dragstart, dblclick e wheel.
 * FIX ISOLAMENTO INPUT WIDGET: Impedisce all'evento input scatenato dentro componenti autonomi (Database, Diari, Codice)
 * di sporcare la nota principale, ma garantisce che le Tabelle Semplici (.simple-table-wrapper) e gli Snippet
 * scatenino regolarmente UI.handleEditorInput() e il salvataggio automatico.
 * FEAT HEADING SHORTCUTS: 
 * - H1 nativo (<h1>): Ctrl+Alt+1 o Ctrl+Shift+1
 * - H2 nativo (<h2>): Ctrl+Alt+2 o Ctrl+Shift+2
 * - H3 nativo (<h3>): Ctrl+Alt+3 o Ctrl+Shift+3 (esclusiva da tastiera)
 * - Paragrafo normale (<p>): Ctrl+Alt+0
 * FEAT GUTTER/PADDING CLICK & DBLCLICK STANDARD: Click nel padding di editorScrollContent posiziona il cursore
 * all'inizio della riga corrispondente; doppio click seleziona l'intero paragrafo/blocco.
 * FEAT CSS CUSTOM HIGHLIGHT HASHTAGS: Sottolineatura ed evidenziazione visiva nativa dei tag #parola senza mutare il DOM.
 * FEAT ESC CLEAR SEARCH: Tasto ESC all'interno del campo cerca/tag svuota automaticamente il campo e azzera i filtri.
 * FEAT CTRL+CLICK DIRECT NAVIGATION: Supporto a Ctrl+Click (o Cmd+Click) su link e hashtag per navigazione rapida in Edit Mode.
 * FEAT TAG DISAMBIGUATION: Gestione unificata navigazione tag con prefisso '#' - Selezione diretta se univoco, autocompletamento se ambiguo.
 * FIX CARET DEAD ZONE ON CLICK & KEYDOWN: Normalizzazione immediata del cursore per impedire digitazioni
 * tra il bordo di una shell inline e il cuscinetto \u200B.
 */

const EventsGlobal = {
    _lastMiddleClickTime: 0,
    _hashtagHighlightTimer: null,

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

        AppState.searchFilter = (searchInput.value || '').toLowerCase();
        
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
        
        // Se c'è una ricerca testuale esplicita, ricarica la nota aperta per applicare i mark gialli;
        // altrimenti ripulisce immediatamente tutti i mark residui dall'editor vivo senza ricaricare la pagina
        if (AppState.searchFilter.length > 0) {
            if (AppState.currentNoteId) UI.selectNote(AppState.currentNoteId);
        } else {
            if (typeof Editor !== 'undefined' && typeof Editor.cleanHighlightsBeforeSave === 'function') {
                Editor.cleanHighlightsBeforeSave();
            }
            if (AppState.currentNoteId && typeof UI.highlightTreeNode === 'function') {
                UI.highlightTreeNode(AppState.currentNoteId);
            }
        }
        
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
                        searchCounter.innerText = "0/0";
                    }
                }
            }
        }, 150);
    },

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

    // Invia un tag alla sidebar gestendo la logica concordata:
    // 1. Popola la barra col '#' mantenendo la coerenza grafica
    // 2. Se il valore appartiene a una sola colonna/proprietà -> applica direttamente la pillola di filtro
    // 3. Se il valore appartiene a più colonne (ambiguità) -> apre il menu a tendina per far scegliere l'utente
    // 4. Se non esiste ancora come proprietà -> filtra l'albero via full-text
    executeTagSearch: (cleanTag) => {
        if (!cleanTag) return;

        // 1. Espandi la sidebar se collassata
        const sb = document.getElementById('sidebar');
        const sbBtn = document.getElementById('sidebarToggleBtn');
        if (sb && sb.classList.contains('collapsed')) {
            sb.classList.remove('collapsed');
            if (sbBtn) sbBtn.classList.add('active');
        }

        // 2. Imposta la vista albero su Note
        if (typeof UI !== 'undefined' && typeof UI.switchToNotes === 'function') {
            UI.switchToNotes();
        }

        const searchInputEl = document.getElementById('searchInput');
        if (!searchInputEl) return;

        // 3. Verifica le corrispondenze nello schema delle proprietà
        const matchingProperties = (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete && typeof SidebarManager.SearchAutocomplete.getMatchesForTag === 'function')
            ? SidebarManager.SearchAutocomplete.getMatchesForTag(cleanTag)
            : [];

        if (matchingProperties.length === 1) {
            // CASO A (UNIVOCO): Una sola proprietà contiene questo valore esatto.
            // Applica istantaneamente il filtro a pillola senza fastidiosi popup da chiudere a mano.
            const match = matchingProperties[0];
            SidebarManager.SearchAutocomplete.select(match.colId, match.realValue, match.colName, match.displayValue);

            if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') {
                UI.showToast(`Filtro applicato: ${match.colName} = "${match.displayValue}"`, "info");
            }
        } 
        else if (matchingProperties.length > 1) {
            // CASO B (AMBIGUITÀ / PIÙ PROPRIETÀ): Più colonne hanno lo stesso valore (es. Tag e Categoria).
            // Popola il campo con '#tag', focalizza e apre il menu a tendina per permettere all'utente di scegliere.
            searchInputEl.value = '#' + cleanTag;
            searchInputEl.focus();

            setTimeout(() => {
                if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                    SidebarManager.SearchAutocomplete.show(searchInputEl, '#' + cleanTag);
                }
            }, 60);

            if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') {
                UI.showToast(`Seleziona la proprietà per: "${cleanTag}"`, "info");
            }
        } 
        else {
            // CASO C (NESSUNA PROPRIETÀ CENSITA): Cerca nel testo di tutte le note
            searchInputEl.value = '#' + cleanTag;
            EventsGlobal._executeSearchLogic(searchInputEl);
            searchInputEl.focus();

            if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') {
                UI.showToast(`Ricerca tag nel testo: "#${cleanTag}"`, "info");
            }
        }
    },

    // Identifica se le coordinate del mouse cadono su un hashtag all'interno del testo
    _getClickedHashtagAtPoint: (clientX, clientY) => {
        let textNode = null;
        let offset = 0;

        if (document.caretRangeFromPoint) {
            const range = document.caretRangeFromPoint(clientX, clientY);
            if (range) {
                textNode = range.startContainer;
                offset = range.startOffset;
            }
        } else if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(clientX, clientY);
            if (pos) {
                textNode = pos.offsetNode;
                offset = pos.offset;
            }
        }

        // Risoluzione difensiva se le coordinate cadono sul contenitore elemento anziché direttamente sul nodo di testo
        if (textNode && textNode.nodeType === Node.ELEMENT_NODE) {
            const child = textNode.childNodes[offset] || textNode.childNodes[offset - 1] || textNode.firstChild;
            if (child && child.nodeType === Node.TEXT_NODE) {
                textNode = child;
                offset = 0;
            }
        }

        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null;

        // Escludi blocchi di codice dove '#' è sintassi di commento o direttiva
        if (textNode.parentNode && textNode.parentNode.closest && textNode.parentNode.closest('pre.code-content')) {
            return null;
        }

        const text = textNode.nodeValue || '';
        if (!text.includes('#')) return null;

        // Regex per intercettare sia tag semplici sia tag gerarchici (es. #family/mom)
        const tagRegex = /(?:^|[^\wÀ-ÿ])(#([^\s.,;:!?'"()\[\]{}<>]+))/g;
        let match;
        while ((match = tagRegex.exec(text)) !== null) {
            const fullMatch = match[1]; 
            const tagName = match[2].replace(/^#+/, ''); // Depura da eventuali '#' multipli

            const matchStart = match.index + (match[0].length - fullMatch.length);
            const matchEnd = matchStart + fullMatch.length;

            if (offset >= matchStart && offset <= matchEnd) {
                // Esclude codici colore esadecimali puri a 3 o 6 caratteri (es. #fff, #123456)
                if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(tagName)) continue;
                return { fullTag: fullMatch, cleanTag: tagName };
            }
        }

        return null;
    },

    // =========================================================================
    // CSS CUSTOM HIGHLIGHT API: Sottolineatura ed evidenziazione tag senza mutare il DOM
    // =========================================================================
    updateHashtagHighlights: () => {
        if (typeof CSS === 'undefined' || !CSS.highlights) return;

        const editorEl = document.getElementById('noteContent');
        if (!editorEl || !AppState.currentNoteId) {
            CSS.highlights.delete('hashtag-highlight');
            return;
        }

        const ranges = [];
        const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, null, false);
        let node;

        while ((node = walker.nextNode())) {
            const parent = node.parentNode;
            if (!parent) continue;

            // Esclude blocchi di codice e widget complessi dove '#' ha altro significato
            if (parent.closest && parent.closest('pre.code-content, .widget-type-code, [data-widget-type="code"]')) {
                continue;
            }

            const val = node.nodeValue;
            if (!val || !val.includes('#')) continue;

            const tagRegex = /(?:^|[^\wÀ-ÿ])(#([^\s.,;:!?'"()\[\]{}<>]+))/g;
            let match;

            while ((match = tagRegex.exec(val)) !== null) {
                const fullTag = match[1];
                const cleanName = match[2].replace(/^#+/, '');

                // Salta colori esadecimali puri
                if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(cleanName)) continue;

                const startOffset = match.index + (match[0].length - fullTag.length);
                const endOffset = startOffset + fullTag.length;

                try {
                    const r = document.createRange();
                    r.setStart(node, startOffset);
                    r.setEnd(node, endOffset);
                    ranges.push(r);
                } catch (_) {}
            }
        }

        if (ranges.length > 0) {
            const hl = new Highlight(...ranges);
            CSS.highlights.set('hashtag-highlight', hl);
        } else {
            CSS.highlights.delete('hashtag-highlight');
        }
    },

    scheduleHashtagHighlights: () => {
        clearTimeout(EventsGlobal._hashtagHighlightTimer);
        EventsGlobal._hashtagHighlightTimer = setTimeout(() => {
            EventsGlobal.updateHashtagHighlights();
        }, 120);
    },

    init: () => {
        // Iniezione dello stile nativo CSS Custom Highlight per gli hashtag (permanente e visibile a colpo d'occhio)
        if (!document.getElementById('adv-hashtag-highlight-style')) {
            const st = document.createElement('style');
            st.id = 'adv-hashtag-highlight-style';
            st.innerHTML = `
                ::highlight(hashtag-highlight) {
                    color: var(--accent-color) !important;
                    text-decoration: underline dotted var(--accent-color) !important;
                    text-underline-offset: 3px !important;
                    background-color: color-mix(in srgb, var(--accent-color) 10%, transparent) !important;
                }
            `;
            document.head.appendChild(st);
        }

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

        const hideDropIndicator = () => {
            const ind = document.getElementById('adv-drop-indicator');
            if (ind) ind.style.display = 'none';
        };

        // =========================================================================
        // HELPER GEOMETRICO GUTTER/PADDING: Individua il blocco di testo corrispondente a clientY
        // =========================================================================
        const findBlockAtY = (editorEl, clientY) => {
            const children = Array.from(editorEl.children);
            if (children.length === 0) return null;

            for (const block of children) {
                const rect = block.getBoundingClientRect();
                if (clientY >= rect.top && clientY <= rect.bottom) {
                    // Se è una lista (ul/ol), individua il singolo <li> all'altezza specificata
                    if (block.tagName === 'UL' || block.tagName === 'OL') {
                        const lis = Array.from(block.querySelectorAll('li'));
                        for (const li of lis) {
                            const liRect = li.getBoundingClientRect();
                            if (clientY >= liRect.top && clientY <= liRect.bottom) {
                                return li;
                            }
                        }
                        return block.lastElementChild || block;
                    }
                    return block;
                }
            }

            // Se clientY si trova al di sopra del primo blocco
            const firstRect = children[0].getBoundingClientRect();
            if (clientY < firstRect.top) {
                return children[0];
            }

            // Se clientY si trova nello spazio vuoto sotto tutti i blocchi
            return null;
        };

        const scrollArea = document.getElementById('editorScrollContent');
        if (scrollArea) {
            // CLICK SINGOLO NEL PADDING / MARGINE: Colloca il cursore all'inizio della riga corrispondente
            scrollArea.addEventListener('click', (e) => {
                if (e.target === scrollArea && AppState.isEditMode) {
                    const sel = window.getSelection();
                    if (!sel.isCollapsed) return;

                    const activeEl = document.activeElement;
                    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                        if (activeEl.selectionStart !== activeEl.selectionEnd) return;
                    }

                    const editorEl = document.getElementById('noteContent');
                    if (!editorEl || activeEl === document.getElementById('noteTitle')) return;

                    const targetBlock = findBlockAtY(editorEl, e.clientY);

                    if (targetBlock) {
                        // Se il blocco è un widget protetto non editabile come testo puro, non forzare la selezione
                        if (typeof WidgetManager !== 'undefined' && WidgetManager.isProtectedBlock(targetBlock) && !WidgetManager.isInsideEditableWidgetArea(targetBlock)) {
                            return;
                        }

                        let targetNodeToFocus = targetBlock;
                        if (targetBlock.classList && targetBlock.classList.contains('adv-checklist-item')) {
                            const textSpan = targetBlock.querySelector('.checklist-text');
                            if (textSpan) targetNodeToFocus = textSpan;
                        }

                        editorEl.focus();
                        const range = document.createRange();
                        range.selectNodeContents(targetNodeToFocus);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    } else {
                        // Click nello spazio vuoto oltre l'ultimo blocco: colloca il cursore a fine documento
                        editorEl.focus();
                        const range = document.createRange();
                        range.selectNodeContents(editorEl);
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            });

            // DOPPIO CLICK NEL PADDING / MARGINE: Seleziona l'intero paragrafo o punto elenco corrispondente
            scrollArea.addEventListener('dblclick', (e) => {
                if (e.target === scrollArea && AppState.isEditMode) {
                    const editorEl = document.getElementById('noteContent');
                    if (!editorEl) return;

                    const targetBlock = findBlockAtY(editorEl, e.clientY);
                    if (!targetBlock) return;

                    if (typeof WidgetManager !== 'undefined' && WidgetManager.isProtectedBlock(targetBlock) && !WidgetManager.isInsideEditableWidgetArea(targetBlock)) {
                        return;
                    }

                    let targetNodeToSelect = targetBlock;
                    if (targetBlock.classList && targetBlock.classList.contains('adv-checklist-item')) {
                        const textSpan = targetBlock.querySelector('.checklist-text');
                        if (textSpan) targetNodeToSelect = textSpan;
                    }

                    editorEl.focus();
                    const sel = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(targetNodeToSelect);
                    sel.removeAllRanges();
                    sel.addRange(range);
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

        // BLINDO SALVATAGGIO IN USCITA: Blocco chiusura accidentale della scheda se una scrittura massiva è in corso
        window.addEventListener('beforeunload', (e) => {
            if (Store.isDirty || Store._isSavingFile) {
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
                // REGOLA CHIAVE: L'autocompletamento scatta esclusivamente se si digita il prefisso '#'
                if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                    if (e.target.value.startsWith('#')) {
                        SidebarManager.SearchAutocomplete.show(e.target, e.target.value);
                    } else {
                        SidebarManager.SearchAutocomplete.hide();
                    }
                }
                AppState._currentHighlightIndex = 0;
                EventsGlobal._executeSearchLogic(searchInput);
            });
            
            searchInput.addEventListener('focus', (e) => {
                if (e.target.value && e.target.value.startsWith('#')) {
                    if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                        SidebarManager.SearchAutocomplete.show(e.target, e.target.value);
                    }
                }
            });
            
            // Gestione tastiera sul campo cerca: Invio naviga, ESC svuota e resetta i filtri
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();

                    if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                        SidebarManager.SearchAutocomplete.hide();
                    }

                    if (searchInput.value !== '' || (AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0)) {
                        searchInput.value = '';
                        AppState.activePropertyFilters = [];
                        AppState.searchFilter = "";

                        // Rimuove istantaneamente ogni evidenziatore <mark> dall'editor vivo
                        if (typeof Editor !== 'undefined' && typeof Editor.cleanHighlightsBeforeSave === 'function') {
                            Editor.cleanHighlightsBeforeSave();
                        }
                        EventsGlobal._triggerSearchUpdate();
                    } else {
                        searchInput.blur();
                    }
                    return;
                }

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
                // Svuota anche i filtri Proprietà/Tag e azzera il filtro attivo
                AppState.activePropertyFilters = [];
                AppState.searchFilter = "";

                // Rimuove istantaneamente ogni evidenziatore <mark> dall'editor vivo
                if (typeof Editor !== 'undefined' && typeof Editor.cleanHighlightsBeforeSave === 'function') {
                    Editor.cleanHighlightsBeforeSave();
                }

                EventsGlobal._triggerSearchUpdate();
            });
        }

        const editorEl = document.getElementById('noteContent');
        if (!editorEl) return;

        if (typeof Editor !== 'undefined') {
            Editor.initMultiCursor(editorEl);
            Editor.initCopyInterceptor(); 
        }

        // =========================================================================
        // MUTATION OBSERVER REATTIVO: Sincronizzazione Highlights Tag all'apertura nota e modifiche
        // =========================================================================
        const hashtagObserver = new MutationObserver(() => {
            EventsGlobal.scheduleHashtagHighlights();
        });
        hashtagObserver.observe(editorEl, { childList: true, subtree: true, characterData: true });

        // Calcolo iniziale immediato all'avvio
        EventsGlobal.scheduleHashtagHighlights();

        document.addEventListener('keydown', (e) => {
            const isCtrlOrCmd = e.ctrlKey || e.metaKey;
            const key = e.key ? e.key.toLowerCase() : '';

            // SCORCIATOIA VELOCE: CTRL+P APRE LA SIDEBAR E FOCALIZZA LA RICERCA GLOBALE
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
                    searchInputEl.select();
                }
                return;
            }

            if (!AppState.isEditMode) return;
            if (!e.key) return; 

            // ISOLAMENTO RIGOROSO INPUT NATIVI: Gestione mirata di Ctrl+A su input e textarea
            const isNativeInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
            if (isNativeInput) {
                if (isCtrlOrCmd && key === 'a') {
                    // All'interno di input o textarea (campi numerici database, filtri, drawer, ecc.)
                    // seleziona solo il testo del controllo corrente senza propagare la selezione al documento
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof e.target.select === 'function') {
                        e.target.select();
                    }
                    return;
                }
                return;
            }

            // ISOLAMENTO SELECT-ALL (Ctrl+A): Copre anche campi di testo del database (.adv-cell-text), tabelle e titoli dei widget
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

            // SCORCIATOIE RAPIDE PER TITOLI H1, H2, H3 E PARAGRAFO CORPO
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

            if (typeof Editor !== 'undefined') {
                if (!isCtrlOrCmd && !e.altKey && AppState.isEditMode) {
                    // Navigazione completa su griglie e widget per tutte e 4 le direzioni
                    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                        if (typeof Editor.handleTableNavigation === 'function') {
                            if (Editor.handleTableNavigation(e)) return;
                        }
                    }
                }

                if (e.key === 'Enter') { Editor.registerTypingStart(e.key); Editor.handleEnterKey(e); }
                if (e.key === 'Tab') { Editor.registerTypingStart(e.key); Editor.handleTabKey(e); }
                if (e.key === 'Backspace') { Editor.handleBackspaceKey(e); }
                if (e.key === 'Delete') { 
                    if (e.shiftKey) return;
                    Editor.handleDeleteKey(e); 
                }
                
                if (!isCtrlOrCmd && !e.altKey && AppState.isEditMode) {
                    Editor.handleBracketAutoClose(e);
                    Editor.handleFormatEscape(e);
                }
            }

            if (isCtrlOrCmd && AppState.isEditMode) {
                // FORMATTAZIONI STANDARD DI TESTO (SOLO SE SHIFT NON È PREMUTO per non confliggere con scorciatoie come Ctrl+Shift+B)
                if (!e.shiftKey && key === 'b') { e.preventDefault(); Editor.exec('bold'); return; }
                if (!e.shiftKey && key === 'i') { e.preventDefault(); Editor.exec('italic'); return; }
                if (!e.shiftKey && key === 'u') { e.preventDefault(); Editor.exec('underline'); return; }
                if (!e.shiftKey && key === 'k') { e.preventDefault(); Editor.toggleCase(); return; }
                
                // MULTI-CURSORE
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
                // Garanzia di allontanamento preventivo dalla zona morta prima di qualsiasi inserimento testuale
                if (typeof Editor !== 'undefined' && typeof Editor.adjustCaretAwayFromZwsDeadZone === 'function') {
                    Editor.adjustCaretAwayFromZwsDeadZone();
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

        // Correzione automatica del cursore se un click atterra nella zona morta del cuscinetto \u200B
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

        // MOTORE DI GESTIONE TRASCINAMENTO BLOCCHI NELL'EDITOR (DRAG & DROP WIDGETS)
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

                // DRAG ASSIST: Scroll Engine a 60FPS
                // Se mi avvicino ai margini dell'editor, scorro automaticamente
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

                // RIPRISTINO ESATTO DEL BLOCCO ORIGINALE TESTATO
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
            document.querySelectorAll('.node-content').forEach(el => { el.classList.remove('drag-top', 'drag-bottom', 'drag-middle'); }); 
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
                    if (typeof UI !== 'undefined' && UI.showToast) UI.showToast(I18n.t('citation.block_insert_error'), "warning");
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
                    EventsGlobal.scheduleHashtagHighlights();
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
                if (typeof UI !== 'undefined' && UI.showToast) UI.showToast(I18n.t('citation.block_insert_error'), "warning");
                return;
            }

            if (!AppState.draggedBlockId && AppState.isEditMode) {
                if (typeof WidgetManager !== 'undefined') {
                    if (WidgetManager.isProtectedBlock(targetNode) && !WidgetManager.isInsideEditableWidgetArea(targetNode)) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (typeof UI !== 'undefined' && UI.showToast) {
                            UI.showToast(I18n.t('editor_alerts.drop_blocked_on_widget'), "warning");
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
                EventsGlobal.scheduleHashtagHighlights();
            }, 10);
        });

        // AUXCLICK (MIDDLE CLICK SUI LINK)
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

        // SCROLL ORIZZONTALE FLUIDO CON MOUSE WHEEL (Shift + Wheel o Timeline/Kanban)
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

            const isCtrlOrCmd = e.ctrlKey || e.metaKey;

            // =========================================================================
            // NAVIGAZIONE RAPIDA DA CLICK SU HASHTAG
            // - In Read Mode: singolo click sinistro lancia direttamente la ricerca
            // - In Edit Mode: Ctrl + Click sinistro lancia la ricerca senza bloccare l'editing
            // =========================================================================
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

            // COPIA SNIPPET (INCLUSI QUELLI MASCHERATI):
            // Leggiamo textContent anziché innerText per evitare che le proprietà CSS
            // di mascheramento (-webkit-text-security) copino i pallini al posto della password reale.
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