/**
 * editor-keyboard-mutations.js
 * Sottomodulo di Editor.
 * Responsabilità: Intercettazione di tasti che distruggono o creano nodi complessi
 * FIX CANCELLAZIONE WIDGET INTERNI: Aggiunto controllo di identità tra widget corrente 
 * e widget bersaglio per permettere l'uso dei tasti Canc e Backspace all'interno delle aree editabili (Es. Colonne).
 * FIX MERGE INLINE WIDGETS: Intercettazione chirurgica della fusione dei paragrafi tramite Backspace/Canc
 * utilizzando un DOM TreeWalker assoluto per scavalcare correttamente i confini delle liste (UL/OL) 
 * proteggendo gli appunti inline e gli snippet copiabili dalla distruzione nativa del browser.
 */

Object.assign(Editor, {

    safeDeleteWidget: (widgetNode) => {
        const type = widgetNode.getAttribute('data-widget-type');
        if (type === 'database' || type === 'pivot') {
            if (typeof AdvancedTable !== 'undefined') AdvancedTable.deleteTable(widgetNode.id);
        } else if (type === 'journal') {
            if (typeof JournalManager !== 'undefined') JournalManager.deleteJournal(widgetNode.id);
        } else if (type === 'code') {
            if (typeof CodeManager !== 'undefined') CodeManager.destroy(widgetNode.id);
        } else if (type === 'buttonbar') {
            if (typeof ButtonManager !== 'undefined') ButtonManager.destroy(widgetNode.id);
        } else if (type === 'columns') {
            if (typeof ColumnManager !== 'undefined') ColumnManager.destroyAndUnwrap(widgetNode.id);
        } else if (widgetNode.classList.contains('block-citation')) {
            if (confirm("Eliminare questa citazione?")) {
                widgetNode.remove();
                Editor.saveSnapshot();
                Store.triggerAutoSave();
            }
        } else {
            widgetNode.remove();
            Editor.saveSnapshot();
            Store.triggerAutoSave();
        }
    },

    handleBulkWidgetDeletion: () => {
        const sel = window.getSelection();
        if (!sel.rangeCount || sel.isCollapsed) return true;

        const range = sel.getRangeAt(0);
        let container = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentNode;

        if (WidgetManager.isInsideEditableWidgetArea(container) || container.closest('.simple-table-wrapper td, .simple-table-wrapper th')) {
            return true;
        }

        const editor = document.getElementById('noteContent');
        if (!editor) return true;

        const allWidgets = editor.querySelectorAll(WidgetManager.blockSelector);
        const widgetsToDelete = [];

        allWidgets.forEach(widget => {
            // Le tabelle semplici sono puro HTML ripristinabile al 100% con Ctrl+Z: nessun blocco di conferma
            if (widget.classList.contains('simple-table-wrapper') || widget.getAttribute('data-widget-type') === 'simple-table') {
                return;
            }
            if (sel.containsNode(widget, true)) {
                widgetsToDelete.push(widget);
            }
        });

        if (widgetsToDelete.length === 0 && WidgetManager.isProtectedBlock(container)) {
            const exactWidget = container.closest(WidgetManager.blockSelector);
            if (exactWidget) widgetsToDelete.push(exactWidget);
        }

        if (widgetsToDelete.length > 0) {
            const msg = widgetsToDelete.length === 1
                ? "⚠️ Stai per sovrascrivere o eliminare un Elemento Complesso (Database, Codice, ecc.).\nSei sicuro di voler procedere perdendo i suoi dati in modo irreversibile?"
                : `⚠️ Stai per sovrascrivere o eliminare ${widgetsToDelete.length} Elementi Complessi (Database, Codice, ecc.).\nSei sicuro di voler procedere perdendo i loro dati in modo irreversibile?`;

            if (confirm(msg)) {
                Editor.saveSnapshot();
                widgetsToDelete.forEach(widget => {
                    const id = widget.id;
                    const type = widget.getAttribute('data-widget-type') || 'database'; 
                    
                    if (type === 'database' || type === 'pivot') {
                        let state = AppState.databases ? AppState.databases[id] : null;

                        // DB SISTEMA: Impedire eliminazione del JSON globale se viene raso al suolo il widget a schermo
                        const trueId = id.split('_cited_')[0];
                        if (trueId === 'SYS_PROPERTIES_DB') {
                            if (typeof UI !== 'undefined' && UI.showToast) UI.showToast("Interfaccia rimossa. I dati del sistema rimangono intatti in background.", "info");
                            return; 
                        }
                        
                        if (state && !state.isLinkedView && !state.isPivot && state.columns) {
                            state.columns.filter(c => c.type === 'record_note').forEach(c => {
                                state.rows.forEach(r => {
                                    const noteId = r.cells[c.id];
                                    if (noteId && typeof UI !== 'undefined') UI.Trash.forceHardDeleteRecursive(noteId);
                                });
                            });
                        }
                        
                        if (AppState.databases && AppState.databases[id]) delete AppState.databases[id];
                        
                        if (typeof AdvancedTable !== 'undefined' && state && !state.isLinkedView && !state.isPivot) {
                            AdvancedTable.updateDependentViews(id);
                        }
                    } else if (type === 'journal' || type === 'code' || type === 'buttonbar' || type === 'columns') {
                        if (AppState.databases && AppState.databases[id]) delete AppState.databases[id];
                    }
                });
                return true; 
            } else {
                return false; 
            }
        }
        return true;
    },

    handleEnterKey: (e) => {
        if (e.shiftKey) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        if (!selection.isCollapsed) {
            if (!Editor.handleBulkWidgetDeletion()) {
                e.preventDefault();
                return;
            }
        }

        let node = selection.getRangeAt(0).commonAncestorContainer;
        if (node.nodeType === 3) node = node.parentNode;

        // --- FIX TABELLE HTML: Evita il raddoppio dei tag BR
        const simpleTableCell = node.closest('.simple-table-wrapper td, .simple-table-wrapper th');
        if (simpleTableCell) {
            e.preventDefault();
            Editor.saveSnapshot();
            document.execCommand('insertLineBreak', false, null); // Inserisce in modo pulito un solo <br>
            if (typeof Store !== 'undefined') Store.triggerAutoSave();
            return;
        }

        const preNode = node.closest('pre.code-content');
        if (preNode) {
            e.preventDefault();
            Editor.saveSnapshot();
            
            let currentPos = Editor._getCodeOffset(preNode, selection.anchorNode, selection.anchorOffset);
            
            // 1. Estrazione stringa pura
            let rawText = Editor._getRawText(preNode);
            // Spoglia l'a capo strutturale del motore grafico per lavorare sui veri dati utente
            if (rawText.endsWith('\n')) rawText = rawText.slice(0, -1);

            // FIX: Se l'utente clicca all'estrema fine del blocco codice, il browser posiziona
            // il cursore DOPO il <br> strutturale invisibile. Dobbiamo clampare matematicamente 
            // l'offset alla lunghezza reale del testo per evitare la scomparsa del cursore.
            if (currentPos > rawText.length) {
                currentPos = rawText.length;
            }

            const textBeforeCaret = rawText.substring(0, currentPos);
            const lines = textBeforeCaret.split('\n');
            const currentLine = lines[lines.length - 1] || '';
            
            const match = currentLine.match(/^[\s\t]+/);
            const indent = match ? match[0] : '';
            
            // 2. Assemblaggio nuova stringa bypassando .textContent nativo
            const newText = rawText.substring(0, currentPos) + '\n' + indent + rawText.substring(currentPos);
            
            // 3. Esecuzione Forzata
            if (typeof CodeManager !== 'undefined') {
                CodeManager.highlightBlock(preNode, true, newText);
            } else {
                preNode.textContent = newText;
            }
            
            // 4. Riposizionamento matematico
            const newPos = currentPos + 1 + indent.length; 
            Editor._setCodeOffset(preNode, newPos, newPos);
            
            Store.triggerAutoSave();
            return;
        }

        if (WidgetManager.isProtectedBlock(node)) return;

        const closestLi = node.closest('li');
        const closestList = closestLi ? closestLi.parentElement : null;

        if (closestList && closestList.classList.contains('adv-checklist')) {
            e.preventDefault();
            Editor.saveSnapshot();

            const spanText = closestLi.querySelector('span.checklist-text');
            const isEmpty = !spanText || spanText.innerText.replace(/\u200B/g, '').trim() === '';

            if (isEmpty) {
                const parentUl = closestLi.parentNode;
                const grandParentLi = parentUl.closest('li');
                closestLi.remove();

                let breakNode;
                if (grandParentLi) {
                    breakNode = document.createElement('li');
                    breakNode.innerHTML = '<br>';
                    breakNode.style.display = 'flex';
                    breakNode.style.flexWrap = 'wrap';
                    grandParentLi.parentNode.insertBefore(breakNode, grandParentLi.nextSibling);
                } else {
                    breakNode = document.createElement('p');
                    breakNode.innerHTML = '<br>';
                    parentUl.parentNode.insertBefore(breakNode, parentUl.nextSibling);
                }

                if (parentUl.children.length === 0) parentUl.remove();

                const newRange = document.createRange();
                newRange.setStart(breakNode, 0);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } else {
                const newLi = document.createElement('li');
                newLi.className = 'adv-checklist-item';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'adv-checklist-cb';

                const span = document.createElement('span');
                span.className = 'checklist-text';
                span.contentEditable = 'true';
                span.appendChild(document.createTextNode('\u200B'));

                newLi.appendChild(cb);
                newLi.appendChild(span);

                closestLi.parentNode.insertBefore(newLi, closestLi.nextSibling);

                const newRange = document.createRange();
                newRange.selectNodeContents(span);
                newRange.collapse(false);
                selection.removeAllRanges();
                selection.addRange(newRange);
            }
            return;
        }
    },

    handleBackspaceKey: (e) => {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        //console.groupCollapsed('🔴 [DEBUG-BACKSPACE] Avvio Backspace');

        if (!selection.isCollapsed) {
            if (!Editor.handleBulkWidgetDeletion()) {
                e.preventDefault();
                //console.groupEnd();
                return;
            }
            e.preventDefault();
            Editor.saveSnapshot();
            document.execCommand('delete', false, null);
            Store.triggerAutoSave();
            //console.groupEnd();
            return;
        }

        const range = selection.getRangeAt(0);
        let container = range.startContainer;

        const currentWidget = container.nodeType === 3 ? container.parentNode.closest('.adv-widget-shell') : container.closest('.adv-widget-shell');

        if (container.nodeType === 3 && WidgetManager.isProtectedBlock(container.parentNode) && !WidgetManager.isInsideEditableWidgetArea(container.parentNode)) { console.groupEnd(); return; }
        if (container.closest && WidgetManager.isProtectedBlock(container) && !WidgetManager.isInsideEditableWidgetArea(container)) { console.groupEnd(); return; }

        const closestLi = container.nodeType === 3 ? container.parentNode.closest('li') : (container.closest ? container.closest('li') : null);
        const closestList = closestLi ? closestLi.parentElement : null;

        if (closestList && closestList.classList.contains('adv-checklist')) {
            const span = closestLi.querySelector('span.checklist-text');
            const preCaretRange = range.cloneRange();
            if (span) preCaretRange.selectNodeContents(span);
            preCaretRange.setEnd(range.startContainer, range.startOffset);

            if (preCaretRange.toString().length === 0) {
                e.preventDefault();
                Editor.saveSnapshot();
                const isEmpty = !span || span.innerText.replace(/\u200B/g, '').trim() === '';

                if (isEmpty) {
                    const parentUl = closestLi.parentNode;
                    const grandParentLi = parentUl.closest('li');
                    closestLi.remove();

                    let breakNode = grandParentLi ? document.createElement('li') : document.createElement('p');
                    breakNode.innerHTML = '<br>';
                    if (grandParentLi) {
                        breakNode.style.display = 'flex'; breakNode.style.flexWrap = 'wrap';
                        grandParentLi.parentNode.insertBefore(breakNode, grandParentLi.nextSibling);
                    } else parentUl.parentNode.insertBefore(breakNode, parentUl.nextSibling);

                    if (parentUl.children.length === 0) parentUl.remove();

                    const newRange = document.createRange();
                    newRange.setStart(breakNode, 0);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                } else {
                    const prevLi = closestLi.previousElementSibling;
                    if (prevLi) {
                        const prevSpan = prevLi.querySelector('span.checklist-text');
                        if (prevSpan && span) {
                            const zws = document.createTextNode('\u200B');
                            prevSpan.appendChild(zws);
                            while (span.firstChild) prevSpan.appendChild(span.firstChild);
                            closestLi.remove();
                            
                            const newRange = document.createRange();
                            newRange.setStart(zws, 1);
                            newRange.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(newRange);
                        }
                    }
                }
                //console.groupEnd();
                return;
            }
        }

        let block = container.nodeType === 3 ? container.parentNode.closest('p, div, li, h1, h2, h3') : (container.closest ? container.closest('p, div, li, h1, h2, h3') : null);
        
        if (block && range.startOffset === 0 && (container.nodeType !== 3 || container.previousSibling === null)) {
            const isEmptyBlock = block.textContent.replace(/[\u200B\n\r]/g, '').trim() === '';
            
            // FIX TREEWALKER: Usa un esploratore del DOM per trovare il VERO nodo precedente, 
            // scavalcando le barriere strutturali (es. List item dentro a un UL/OL).
            let prevNode = null;
            const walker = document.createTreeWalker(document.getElementById('noteContent'), NodeFilter.SHOW_ELEMENT, null, false);
            walker.currentNode = block;
            let pNode;
            while ((pNode = walker.previousNode())) {
                if (pNode.id === 'noteContent') continue;
                if (['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(pNode.tagName)) {
                    // Preveniamo la fusione in div interni ai Widget (eccetto colonne/tabella editabili)
                    if (WidgetManager.isProtectedBlock(pNode) && !WidgetManager.isInsideEditableWidgetArea(pNode)) {
                        prevNode = pNode.closest('.adv-widget-shell');
                    } else {
                        prevNode = pNode;
                    }
                    break;
                }
            }

            //console.log("[DEBUG-BACKSPACE] prevNode individuato per Merge tramite TreeWalker:", prevNode);

            // FIX MANUAL MERGE (BACKSPACE): Se tiriamo su il blocco e il nodo precedente contiene Widget Inline
            // Fondere nativamente distruggerebbe lo span contenteditable="false". Usiamo il Manual Merge!
            if (prevNode && ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(prevNode.tagName) && block.querySelector('.adv-inline-shell')) {
                 e.preventDefault();
                 Editor.saveSnapshot();
                 const sel = window.getSelection();
                 const marker = document.createElement('span');
                 marker.id = 'manual-merge-marker';
                 prevNode.appendChild(marker);
                 
                 // Travasa i contenuti nel nodo superiore
                 while(block.firstChild) {
                     prevNode.appendChild(block.firstChild);
                 }
                 const parentList = block.parentNode;
                 block.remove();
                 
                 // Pulisci le liste svuotate
                 if (parentList && (parentList.tagName === 'UL' || parentList.tagName === 'OL') && parentList.children.length === 0) {
                     parentList.remove();
                 }

                 const newRange = document.createRange();
                 newRange.setStartAfter(marker);
                 newRange.collapse(true);
                 sel.removeAllRanges();
                 sel.addRange(newRange);
                 marker.remove();
                 Store.triggerAutoSave();
                 //console.log("[DEBUG-BACKSPACE] Merge manuale eseguito per proteggere inline widget.");
                 //console.groupEnd();
                 return;
            }

            if (prevNode && WidgetManager.isProtectedBlock(prevNode)) {
                
                // LA CORREZIONE: Se siamo dentro a un widget e il nodo precedente appartiene
                // allo stesso widget, lasciamo che il browser faccia il suo lavoro nativo.
                const targetWidget = prevNode.closest('.adv-widget-shell');
                if (currentWidget && targetWidget && currentWidget === targetWidget) {
                    //console.groupEnd();
                    return; 
                }

                e.preventDefault();
                
                if (isEmptyBlock) {
                    Editor.saveSnapshot();

                    const sel = window.getSelection();
                    const newRange = document.createRange();
                    newRange.setStartAfter(prevNode);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);

                    block.remove();
                    Store.triggerAutoSave();
                    //console.groupEnd();
                    return;
                }

                const shell = targetWidget || prevNode;
                if (shell) {
                    if (shell.classList.contains('adv-widget-selected')) {
                        Editor.safeDeleteWidget(shell);
                        Editor.clearWidgetSelection();
                    } else {
                        Editor.clearWidgetSelection();
                        shell.classList.add('adv-widget-selected');
                        Editor.selectedWidget = shell;
                    }
                }
                //console.groupEnd();
                return; 
            }
        }
        //console.log("[DEBUG-BACKSPACE] Backspace gestito nativamente dal browser");
        //console.groupEnd();
    },

    handleDeleteKey: (e) => {
        //console.groupCollapsed('🔴 [DEBUG-DELETE] Avvio Tasto Delete (Canc)');
        const selection = window.getSelection();
        if (!selection.rangeCount) { console.groupEnd(); return; }

        if (!selection.isCollapsed) {
            //console.log("[DEBUG-DELETE] Esecuzione Bulk Delete su selezione.");
            if (!Editor.handleBulkWidgetDeletion()) {
                e.preventDefault();
                //console.groupEnd();
                return;
            }
            e.preventDefault();
            Editor.saveSnapshot();
            document.execCommand('delete', false, null);
            Store.triggerAutoSave();
            //console.groupEnd();
            return;
        }

        const range = selection.getRangeAt(0);
        let container = range.startContainer;
        let block = container.nodeType === 3 ? container.parentNode.closest('p, div, li, h1, h2, h3') : (container.closest ? container.closest('p, div, li, h1, h2, h3') : null);
        
        //console.log("[DEBUG-DELETE] Delete su Block:", block);

        const currentWidget = container.nodeType === 3 ? container.parentNode.closest('.adv-widget-shell') : container.closest('.adv-widget-shell');

        if (block) {
            let isAtEnd = false;
            
            if (container.nodeType === 3 && range.startOffset === container.length) {
                const walker = document.createTreeWalker(document.getElementById('noteContent'), NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null, false);
                walker.currentNode = container;
                let nextTextNode = walker.nextNode();
                while (nextTextNode && nextTextNode.nodeType === 3 && nextTextNode.textContent.trim() === '') nextTextNode = walker.nextNode();
                
                // Se c'è un BR nativo che il browser può rimuovere, lasciamo fare a lui
                if (nextTextNode && nextTextNode.nodeName === 'BR') {
                    //console.log("[DEBUG-DELETE] Ignoro: sono davanti a un <br>");
                    //console.groupEnd();
                    return; 
                }
                isAtEnd = true;
            } 
            else if (container.nodeType !== 3 && range.startOffset >= container.childNodes.length - 1) {
                isAtEnd = true;
            }
            
            const isEmptyBlock = block.textContent.replace(/[\u200B\n\r]/g, '').trim() === '';
            if (isEmptyBlock) isAtEnd = true;

            if (isAtEnd) {
                // FIX TREEWALKER: Invece di chiedere block.nextElementSibling (che in un LI restituisce null),
                // usiamo un TreeWalker assoluto per scovare il VERO blocco fisico successivo nel documento!
                let nextNode = null;
                const walker = document.createTreeWalker(document.getElementById('noteContent'), NodeFilter.SHOW_ELEMENT, null, false);
                walker.currentNode = block;
                let n;
                while ((n = walker.nextNode())) {
                    if (['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(n.tagName)) {
                        // Ci assicuriamo di non prendere un nodo che è in realtà contenuto *dentro* al blocco attuale
                        if (!block.contains(n)) {
                            nextNode = n;
                            break;
                        }
                    }
                }

                //console.log("[DEBUG-DELETE] NextNode individuato per Merge tramite TreeWalker:", nextNode);

                // FIX MANUAL MERGE (DELETE): Se il nodo successivo contiene un widget inline (come un appunto o snippet),
                // il merge nativo del browser distruggerebbe i tag contenteditable=false. Lo uniamo manualmente!
                if (nextNode && ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(nextNode.tagName) && nextNode.querySelector('.adv-inline-shell')) {
                    e.preventDefault();
                    Editor.saveSnapshot();
                    const sel = window.getSelection();
                    const marker = document.createElement('span');
                    marker.id = 'manual-merge-marker';
                    block.appendChild(marker);
                    
                    // Travasa tutto il contenuto dal nodo inferiore al blocco attuale
                    while (nextNode.firstChild) {
                        block.appendChild(nextNode.firstChild);
                    }
                    
                    // Rimuove il vecchio blocco svuotato, proteggendo le gerarchie delle liste
                    const parentList = nextNode.parentNode;
                    nextNode.remove();
                    if (parentList && (parentList.tagName === 'UL' || parentList.tagName === 'OL') && parentList.children.length === 0) {
                        parentList.remove();
                    }
                    
                    // Ripristina il cursore esattamente nel punto di fusione
                    const newRange = document.createRange();
                    newRange.setStartAfter(marker);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    marker.remove();
                    
                    Store.triggerAutoSave();
                    //console.log("[DEBUG-DELETE] Merge manuale eseguito con successo per salvare gli inline widget.");
                    //console.groupEnd();
                    return;
                }

                if (nextNode && WidgetManager.isProtectedBlock(nextNode)) {
                    
                    // LA CORREZIONE: Stesso principio del Backspace
                    const targetWidget = nextNode.closest('.adv-widget-shell');
                    if (currentWidget && targetWidget && currentWidget === targetWidget) {
                        //console.groupEnd();
                        return; 
                    }

                    e.preventDefault();
                    
                    if (isEmptyBlock) {
                        Editor.saveSnapshot();

                        const sel = window.getSelection();
                        const newRange = document.createRange();
                        newRange.setStartBefore(nextNode);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);

                        block.remove();
                        Store.triggerAutoSave();
                        //console.groupEnd();
                        return;
                    }

                    const shell = targetWidget || nextNode;
                    if (shell) {
                        if (shell.classList.contains('adv-widget-selected')) {
                            Editor.safeDeleteWidget(shell);
                            Editor.clearWidgetSelection();
                        } else {
                            Editor.clearWidgetSelection();
                            shell.classList.add('adv-widget-selected');
                            Editor.selectedWidget = shell;
                        }
                    }
                    //console.groupEnd();
                    return; 
                }
            }
        }
        //console.log("[DEBUG-DELETE] Delete gestito nativamente dal browser");
        //console.groupEnd();
    }
});