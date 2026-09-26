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

        // --- GESTIONE INVIO SU TITOLI (h1..h6) ---
        const heading = node.closest('h1, h2, h3, h4, h5, h6');
        if (heading && !heading.closest('.adv-widget-shell')) {
            const range = selection.getRangeAt(0);
            const preRange = range.cloneRange();
            preRange.selectNodeContents(heading);
            preRange.setEnd(range.startContainer, range.startOffset);
            const isAtStart = !preRange.toString().replace(/[\u200B\uFEFF\u00A0\n\r]/g, '');

            const postRange = range.cloneRange();
            postRange.selectNodeContents(heading);
            postRange.setStart(range.endContainer, range.endOffset);
            const isAtEnd = !postRange.toString().replace(/[\u200B\uFEFF\u00A0\n\r]/g, '');

            if (isAtStart || isAtEnd) {
                e.preventDefault();
                Editor.saveSnapshot();
                const p = document.createElement('p');
                p.innerHTML = '<br>';

                if (isAtStart && !isAtEnd) {
                    // Invio a inizio titolo: inserisci paragrafo vuoto sopra e mantieni il cursore sul titolo
                    heading.parentNode.insertBefore(p, heading);
                } else {
                    // Invio a fine titolo o su titolo vuoto: inserisci paragrafo sotto e spostati lì
                    if (isAtStart && isAtEnd) heading.parentNode.replaceChild(p, heading);
                    else heading.parentNode.insertBefore(p, heading.nextSibling);

                    const newRange = document.createRange();
                    newRange.setStart(p, 0);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                }

                Store.triggerAutoSave();
                return;
            }
        }

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

        if (!selection.isCollapsed) {
            if (!Editor.handleBulkWidgetDeletion()) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            Editor.saveSnapshot();
            document.execCommand('delete', false, null);
            Store.triggerAutoSave();
            return;
        }

        const range = selection.getRangeAt(0);
        let container = range.startContainer;

        const currentWidget = container.nodeType === 3 ? container.parentNode.closest('.adv-widget-shell') : container.closest('.adv-widget-shell');

        if (container.nodeType === 3 && WidgetManager.isProtectedBlock(container.parentNode) && !WidgetManager.isInsideEditableWidgetArea(container.parentNode)) { return; }
        if (container.closest && WidgetManager.isProtectedBlock(container) && !WidgetManager.isInsideEditableWidgetArea(container)) { return; }

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
                return;
            }
        }

        let block = container.nodeType === 3 ? container.parentNode.closest('p, div, li, h1, h2, h3, h4, h5, h6') : (container.closest ? container.closest('p, div, li, h1, h2, h3, h4, h5, h6') : null);
        
        // Verifica se il cursore è all'inizio del blocco corrente
        let isAtBlockStart = false;
        if (block) {
            const preRange = range.cloneRange();
            preRange.selectNodeContents(block);
            preRange.setEnd(range.startContainer, range.startOffset);
            isAtBlockStart = !preRange.toString().replace(/[\u200B\uFEFF\u00A0\n\r]/g, '');
        }

        if (block && isAtBlockStart) {
            // Se il cursore si trova all'interno di un'area editabile di un widget (es. Diario, Cella, Codice),
            // non permettere a Backspace di evadere per cancellare il guscio genitore o widget adiacenti
            if (currentWidget) {
                return;
            }
            const cleanText = (str) => (str || '').replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
            const isEmptyBlock = cleanText(block.textContent) === '';
            
            // Trova il blocco visivo precedente tramite TreeWalker
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

            // Se il blocco precedente è vuoto: rimuovilo senza spostare il cursore a fine riga
            if (prevNode && !WidgetManager.isProtectedBlock(prevNode) && cleanText(prevNode.textContent) === '') {
                e.preventDefault();
                Editor.saveSnapshot();
                prevNode.remove();
                Store.triggerAutoSave();
                return;
            }

            // Se il blocco corrente è vuoto: rimuovilo e posiziona il cursore sul blocco precedente
            if (isEmptyBlock && prevNode && !WidgetManager.isProtectedBlock(prevNode) && !block.closest('li, table, .adv-widget-shell')) {
                e.preventDefault();
                Editor.saveSnapshot();

                const newRange = document.createRange();
                newRange.selectNodeContents(prevNode);
                newRange.collapse(false);

                block.remove();
                selection.removeAllRanges();
                selection.addRange(newRange);
                Store.triggerAutoSave();
                return;
            }

            // Merge protetto per blocchi contenenti widget inline
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
                 return;
            }

            // Selezione / eliminazione sicura davanti a widget protetti
            if (prevNode && WidgetManager.isProtectedBlock(prevNode)) {
                const targetWidget = prevNode.closest('.adv-widget-shell');
                if (currentWidget && targetWidget && currentWidget === targetWidget) {
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
                return; 
            }
        }
    },

    handleDeleteKey: (e) => {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        if (!selection.isCollapsed) {
            if (!Editor.handleBulkWidgetDeletion()) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            Editor.saveSnapshot();
            document.execCommand('delete', false, null);
            Store.triggerAutoSave();
            return;
        }

        const range = selection.getRangeAt(0);
        let container = range.startContainer;
        let block = container.nodeType === 3 ? container.parentNode.closest('p, div, li, h1, h2, h3, h4, h5, h6') : (container.closest ? container.closest('p, div, li, h1, h2, h3, h4, h5, h6') : null);

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
                    return;
                }

                if (nextNode && WidgetManager.isProtectedBlock(nextNode)) {
                    
                    // Stesso principio del Backspace
                    const targetWidget = nextNode.closest('.adv-widget-shell');
                    if (currentWidget && targetWidget && currentWidget === targetWidget) {
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
                    return; 
                }
            }
        }
    }
});