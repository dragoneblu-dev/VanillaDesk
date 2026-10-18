/**
 * events-drag.js
 * Modulo dedicato al Drag & Drop dei blocchi e all'assistente di scorrimento (Drag Assist Engine).
 * Sottomodulo di EventsGlobal.
 * FIX MACRO DRAG: Esclusa la barra dei pulsanti dallo Scudo Drag (Drag Shield)
 * per evitare la corruzione dell'evento HTML5 nativo dovuto al pointer-events: none.
 * FIX DRAG-SCROLL: Inserito "Drag Assist Engine" con calcolo matematico a 60FPS.
 * RESTORE DRAG & DROP DEI BLOCCHI: Ripristinato l'intero motore nativo di intercettazione
 * dragstart, dragenter, dragover, dragleave, dragend e drop su editorEl con posizionamento
 * dinamico di #adv-drop-indicator.
 * FEAT HORIZONTAL WHEEL SCROLL: Scorrimento orizzontale continuo su Kanban e Timeline tramite mouse wheel.
 * FEAT GUTTER/PADDING CLICK & DBLCLICK STANDARD: Click nel padding di editorScrollContent posiziona il cursore
 * all'inizio della riga corrispondente; doppio click seleziona l'intero paragrafo/blocco.
 */

window.EventsGlobal = window.EventsGlobal || {};

Object.assign(EventsGlobal, {
    _dragScrollTimer: null,
    _dragScrollSpeed: 0,

    toggleDragShield: (enable, draggedType) => {
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
    },

    stopDragAssist: () => {
        EventsGlobal.toggleDragShield(false, null);
        if (EventsGlobal._dragScrollTimer) {
            cancelAnimationFrame(EventsGlobal._dragScrollTimer);
            EventsGlobal._dragScrollTimer = null;
        }
    },

    hideDropIndicator: () => {
        const ind = document.getElementById('adv-drop-indicator');
        if (ind) ind.style.display = 'none';
    },

    // =========================================================================
    // HELPER GEOMETRICO GUTTER/PADDING: Individua il blocco di testo corrispondente a clientY
    // =========================================================================
    findBlockAtY: (editorEl, clientY) => {
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
    },

    initDragAndDrop: (editorEl, scrollArea) => {
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

                    const activeContent = document.getElementById('noteContent');
                    if (!activeContent || activeEl === document.getElementById('noteTitle')) return;

                    const targetBlock = EventsGlobal.findBlockAtY(activeContent, e.clientY);

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

                        activeContent.focus();
                        const range = document.createRange();
                        range.selectNodeContents(targetNodeToFocus);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    } else {
                        // Click nello spazio vuoto oltre l'ultimo blocco: colloca il cursore a fine documento
                        activeContent.focus();
                        const range = document.createRange();
                        range.selectNodeContents(activeContent);
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            });

            // DOPPIO CLICK NEL PADDING / MARGINE: Seleziona l'intero paragrafo o punto elenco corrispondente
            scrollArea.addEventListener('dblclick', (e) => {
                if (e.target === scrollArea && AppState.isEditMode) {
                    const activeContent = document.getElementById('noteContent');
                    if (!activeContent) return;

                    const targetBlock = EventsGlobal.findBlockAtY(activeContent, e.clientY);
                    if (!targetBlock) return;

                    if (typeof WidgetManager !== 'undefined' && WidgetManager.isProtectedBlock(targetBlock) && !WidgetManager.isInsideEditableWidgetArea(targetBlock)) {
                        return;
                    }

                    let targetNodeToSelect = targetBlock;
                    if (targetBlock.classList && targetBlock.classList.contains('adv-checklist-item')) {
                        const textSpan = targetBlock.querySelector('.checklist-text');
                        if (textSpan) targetNodeToSelect = textSpan;
                    }

                    activeContent.focus();
                    const sel = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(targetNodeToSelect);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            });
        }

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
                EventsGlobal.toggleDragShield(true, AppState.draggedBlockType);
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

                    EventsGlobal._dragScrollSpeed = 0;
                    if (e.clientY - rect.top < threshold) {
                        EventsGlobal._dragScrollSpeed = -maxSpeed * (1 - (e.clientY - rect.top) / threshold);
                    } else if (rect.bottom - e.clientY < threshold) {
                        EventsGlobal._dragScrollSpeed = maxSpeed * (1 - (rect.bottom - e.clientY) / threshold);
                    }

                    if (EventsGlobal._dragScrollSpeed !== 0) {
                        if (!EventsGlobal._dragScrollTimer) {
                            const scrollLoop = () => {
                                scrollContainer.scrollTop += EventsGlobal._dragScrollSpeed;
                                EventsGlobal._dragScrollTimer = requestAnimationFrame(scrollLoop);
                            };
                            EventsGlobal._dragScrollTimer = requestAnimationFrame(scrollLoop);
                        }
                    } else {
                        if (EventsGlobal._dragScrollTimer) {
                            cancelAnimationFrame(EventsGlobal._dragScrollTimer);
                            EventsGlobal._dragScrollTimer = null;
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
                    EventsGlobal.hideDropIndicator();
                    return;
                }

                let sourceBlock = null;
                if (AppState.draggedBlockType === 'image') {
                    sourceBlock = editorEl.querySelector(`img[data-image-ref="${AppState.draggedBlockId}"]`);
                } else {
                    sourceBlock = document.getElementById(AppState.draggedBlockId);
                }

                if (!sourceBlock || dropNode === sourceBlock || sourceBlock.contains(dropNode)) {
                    EventsGlobal.hideDropIndicator();
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
                        EventsGlobal.hideDropIndicator();
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
                    EventsGlobal.hideDropIndicator();
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
                    EventsGlobal.hideDropIndicator();
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
                    EventsGlobal.hideDropIndicator();
                    // Interrompiamo lo scroll forzato se il mouse esce fisicamente dall'editor
                    if (EventsGlobal._dragScrollTimer) {
                        cancelAnimationFrame(EventsGlobal._dragScrollTimer);
                        EventsGlobal._dragScrollTimer = null;
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

            EventsGlobal.hideDropIndicator();
            AppState.draggedBlockId = null;
            AppState.draggedBlockType = null;
            document.querySelectorAll('.node-content').forEach(el => { el.classList.remove('drag-top', 'drag-bottom', 'drag-middle'); }); 
            const tc = document.getElementById('treeContainer');
            if (tc) tc.classList.remove('drag-over-root'); 
            
            // DRAG ASSIST: Rimuove lo scudo e ferma lo scorrimento
            EventsGlobal.stopDragAssist();
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

            EventsGlobal.hideDropIndicator();
            
            if (AppState.draggedBlockId && AppState.isEditMode) {
                e.preventDefault(); 
                e.stopPropagation();

                const blockId = AppState.draggedBlockId;

                // DRAG ASSIST: Arresto Immediato del motore prima dei calcoli di rilascio
                EventsGlobal.stopDragAssist();

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
            EventsGlobal.stopDragAssist();

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
    }
});