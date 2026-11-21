/**
 * editor-keyboard-mutations.js
 * Sottomodulo di Editor.
 * Responsabilità: Intercettazione di tasti che distruggono o creano nodi complessi
 * Controllo di identità tra widget corrente e widget bersaglio per permettere l'uso dei tasti Canc e Backspace
 * all'interno delle aree editabili (Es. Colonne).
 * Intercettazione chirurgica della fusione dei paragrafi tramite Backspace/Canc
 * utilizzando un DOM TreeWalker assoluto per scavalcare correttamente i confini delle liste (UL/OL)
 * proteggendo gli appunti inline e gli snippet copiabili dalla distruzione nativa del browser.
 * Eliminazione atomica e fluida dello snippet copiabile su Backspace/Canc con supporto Undo (Ctrl+Z).
 * Cancellazione immediata di <hr> e <img> adiacenti su Backspace/Canc mantenendo il cursore in posizione.
 * Salvaguardia dei widget complessi da Backspace/Canc e flash bordo rosso (500ms).
 * Impedisce lo svuotamento totale dell'editor su cancellazione dell'ultimo blocco vuoto.
 * Disattivazione automatica del comando bold residuo all'uscita dai titoli H1..H6 con Invio.
 * Parità operativa tra Backspace e Delete con salvataggio automatico.
 * Centralizzazione della cancellazione di selezioni estese in deleteSelection(e).
 * Calcolo esatto di isAtEnd tramite postRange sull'intero blocco genitore.
 * Riposizionamento del cursore subito dopo il tag <a> prima che l'Invio nativo possa clonare il link.
 * Gestione completa delle liste To-Do (adv-checklist) su Invio (split al cursore, outdent o uscita spezzando la lista),
 * Backspace, Delete e selezioni multi-voce.
 * Esclusione dei blocchi contenenti immagini, audio, iframe, hr o widget inline dalla rimozione automatica di righe vuote.
 * Uscita pulita con Invio su riga vuota anche quando il blockquote risiede dentro un punto elenco (<li>).
 * Confinamento di handleDeleteKey alle aree editabili interne (celle di tabelle semplici e colonne).
 */

Object.assign(Editor, {

    flashWidgetProtectedBorder: (widgetEl) => {
        if (!widgetEl) return;
        widgetEl.classList.add('adv-widget-protected-flash');
        setTimeout(() => {
            if (widgetEl && document.body.contains(widgetEl)) {
                widgetEl.classList.remove('adv-widget-protected-flash');
            }
        }, 500);
    },

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
            if (confirm(I18n.t('keyboard_mutations.confirm_delete_citation'))) {
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
                ? I18n.t('keyboard_mutations.confirm_delete_widget_single')
                : I18n.t('keyboard_mutations.confirm_delete_widget_plural', { count: widgetsToDelete.length });

            if (confirm(msg)) {
                Editor.saveSnapshot();
                widgetsToDelete.forEach(widget => {
                    const id = widget.id;
                    const type = widget.getAttribute('data-widget-type') || 'database'; 
                    
                    if (type === 'database' || type === 'pivot') {
                        let state = AppState.databases ? AppState.databases[id] : null;

                        // DB SISTEMA: Impedire eliminazione del JSON globale se viene rimosso il widget a schermo
                        const trueId = id.split('_cited_')[0];
                        if (trueId === 'SYS_PROPERTIES_DB') {
                            if (typeof UI !== 'undefined' && UI.showToast) {
                                UI.showToast(I18n.t('keyboard_mutations.sys_db_removed_toast'), "info");
                            }
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

    // Fonde sourceSpan (e l'eventuale sotto-lista di sourceLi) in targetSpan lasciando il cursore al punto di giunzione
    _mergeChecklistSpans: (targetSpan, sourceSpan, sourceLi) => {
        if (!targetSpan || !sourceLi) return;
        const targetLi = targetSpan.closest('li.adv-checklist-item');
        const sourceNestedUl = Editor._getChecklistNestedList(sourceLi);
        const sourceParentUl = sourceLi.parentNode;

        if (Editor._isChecklistSpanEmpty(targetSpan)) targetSpan.innerHTML = '';

        const marker = document.createElement('span');
        marker.id = 'chk-merge-marker';
        marker.style.display = 'none';
        targetSpan.appendChild(marker);

        if (sourceSpan && !Editor._isChecklistSpanEmpty(sourceSpan)) {
            while (sourceSpan.firstChild) {
                const ch = sourceSpan.firstChild;
                if (ch.nodeType === 3 && ch.nodeValue === '\u200B') ch.remove();
                else targetSpan.appendChild(ch);
            }
        }

        if (sourceNestedUl && sourceNestedUl.children.length > 0 && targetLi) {
            let ownNested = Editor._getChecklistNestedList(targetLi);
            if (!ownNested) {
                ownNested = document.createElement('ul');
                ownNested.className = 'adv-checklist';
                targetLi.appendChild(ownNested);
            }
            if (sourceParentUl === ownNested) {
                while (sourceNestedUl.firstElementChild) ownNested.insertBefore(sourceNestedUl.firstElementChild, sourceLi);
            } else {
                while (sourceNestedUl.firstElementChild) ownNested.appendChild(sourceNestedUl.firstElementChild);
            }
        }

        sourceLi.remove();
        if (sourceParentUl && sourceParentUl.parentElement && sourceParentUl.parentElement.closest('li.adv-checklist-item') && sourceParentUl.children.length === 0) {
            sourceParentUl.remove();
        }

        const sel = window.getSelection();
        if (Editor._isChecklistSpanEmpty(targetSpan)) {
            marker.remove();
            Editor._placeCaretInChecklistSpan(targetSpan, false);
        } else if (sel) {
            const newRange = document.createRange();
            if (marker.previousSibling && marker.previousSibling.nodeType === 3) {
                newRange.setStart(marker.previousSibling, marker.previousSibling.nodeValue.length);
            } else if (marker.nextSibling && marker.nextSibling.nodeType === 3) {
                newRange.setStart(marker.nextSibling, 0);
            } else {
                newRange.setStartBefore(marker);
            }
            newRange.collapse(true);
            marker.remove();
            sel.removeAllRanges();
            sel.addRange(newRange);
            Editor.savedRange = newRange.cloneRange();
        }
    },

    // Fonde una selezione multi-voce dentro una checklist mantenendo intatto il markup
    _mergeChecklistRange: (range, startLi, endLi) => {
        const startSpan = Editor._getChecklistTextSpan(startLi);
        const endSpan = Editor._getChecklistTextSpan(endLi);
        if (!startSpan || !endSpan) return startLi;

        let rootUl = startLi.closest('ul.adv-checklist');
        while (rootUl && rootUl.parentElement && rootUl.parentElement.closest('ul.adv-checklist')) {
            rootUl = rootUl.parentElement.closest('ul.adv-checklist');
        }

        // 1. Mantiene in endSpan solo la coda dopo la selezione e cancella la porzione selezionata in startSpan
        if (endSpan.contains(range.endContainer)) {
            const preEndRange = document.createRange();
            preEndRange.setStart(endSpan, 0);
            preEndRange.setEnd(range.endContainer, range.endOffset);
            preEndRange.deleteContents();
        } else {
            endSpan.innerHTML = '';
        }

        if (startSpan.contains(range.startContainer)) {
            const postStartRange = document.createRange();
            postStartRange.setStart(range.startContainer, range.startOffset);
            postStartRange.setEnd(startSpan, startSpan.childNodes.length);
            postStartRange.deleteContents();
        } else {
            startSpan.innerHTML = '';
        }

        // 2. Rimuove le voci intermedie tra startLi ed endLi (lasciando endLi al merge finale per preservarne eventuali sotto-liste)
        const allItems = rootUl ? Array.from(rootUl.querySelectorAll('li.adv-checklist-item')) : [];
        const startIdx = allItems.indexOf(startLi);
        const endIdx = allItems.indexOf(endLi);
        if (startIdx !== -1 && endIdx > startIdx + 1) {
            allItems.slice(startIdx + 1, endIdx).forEach(li => {
                if (!li.contains(startLi) && !li.contains(endLi) && li.parentNode) li.remove();
            });
        }
        if (rootUl) {
            rootUl.querySelectorAll('ul.adv-checklist').forEach(sub => {
                if (sub.children.length === 0) sub.remove();
            });
        }

        Editor._mergeChecklistSpans(startSpan, endSpan, endLi);
        return startLi;
    },

    /**
     * GESTORE UNIFICATO CANCELLAZIONE SELEZIONI ESTESE (!isCollapsed)
     * Condiviso in modo omogeneo da Backspace, CANC (Delete) e typing su selezione.
     */
    deleteSelection: (e) => {
        // 1. Tabelle Semplici: Cancellazione simultanea multi-cella
        if (typeof TableManager !== 'undefined' && TableManager.Selection && TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 1) {
            e.preventDefault();
            TableManager.Selection.clearSelectedCellsContent();
            return;
        }

        const selection = window.getSelection();
        if (!selection || !selection.rangeCount || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        let node = range.commonAncestorContainer;
        if (node.nodeType === 3) node = node.parentNode;

        // 2. Blocchi di Codice (pre.code-content): Mappatura lineare e ancoraggio esatto a startPos
        const preNode = node.closest ? node.closest('pre.code-content') : null;
        if (preNode) {
            e.preventDefault();
            Editor.saveSnapshot();

            let startPos = Editor._getCodeOffset(preNode, range.startContainer, range.startOffset);
            let endPos = Editor._getCodeOffset(preNode, range.endContainer, range.endOffset);
            if (startPos > endPos) { const t = startPos; startPos = endPos; endPos = t; }

            let rawText = Editor._getRawText(preNode);
            if (rawText.endsWith('\n')) rawText = rawText.slice(0, -1);

            const newText = rawText.substring(0, startPos) + rawText.substring(endPos);

            const wrapper = preNode.closest('.code-wrapper, [data-widget-type="code"]');
            if (wrapper) {
                const trueId = wrapper.id.split('_cited_')[0];
                if (!AppState.databases) AppState.databases = {};
                if (!AppState.databases[trueId]) AppState.databases[trueId] = { title: I18n.t('code_widget.default_title'), language: 'none', content: '' };
                AppState.databases[trueId].content = newText;
            }

            if (typeof CodeManager !== 'undefined') {
                CodeManager.highlightBlock(preNode, true, newText);
            } else {
                preNode.textContent = newText;
            }

            Editor._setCodeOffset(preNode, startPos, startPos);
            Store.triggerAutoSave();
            return;
        }

        // 3. Salvaguardia Widget Complessi nel testo normale (Database, Diari, ecc.)
        if (!Editor.handleBulkWidgetDeletion()) {
            e.preventDefault();
            return;
        }

        // 3b. Selezioni multi-voce dentro una checklist
        const startEl = range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer;
        const endEl = range.endContainer.nodeType === 3 ? range.endContainer.parentNode : range.endContainer;
        const startCheckLi = startEl && startEl.closest ? startEl.closest('li.adv-checklist-item') : null;
        const endCheckLi = endEl && endEl.closest ? endEl.closest('li.adv-checklist-item') : null;

        if (startCheckLi && endCheckLi) {
            e.preventDefault();
            Editor.saveSnapshot();

            if (startCheckLi === endCheckLi) {
                const spanText = Editor._getChecklistTextSpan(startCheckLi);
                range.deleteContents();
                if (spanText && Editor._isChecklistSpanEmpty(spanText)) {
                    Editor._placeCaretInChecklistSpan(spanText, false);
                } else {
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            } else {
                Editor._mergeChecklistRange(range, startCheckLi, endCheckLi);
            }
            Store.triggerAutoSave();
            return;
        }

        // 4. Testo Normale: Snapshot Undo (Ctrl+Z) e cancellazione nativa del browser (focus e cursore intatti)
        Editor.saveSnapshot();
        setTimeout(() => {
            if (typeof Store !== 'undefined') Store.triggerAutoSave();
        }, 10);
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

        // --- GESTIONE INVIO SU SNIPPET COPIABILE (EVITA NESTING ERRATO DI BLOCCHI IN SPAN) ---
        const snippetText = node.closest('.snippet-text');
        if (snippetText) {
            e.preventDefault();
            Editor.saveSnapshot();

            const snippetWrapper = snippetText.closest('.adv-copy-snippet, .adv-inline-shell') || snippetText;
            const parentBlock = snippetWrapper.closest('p, div, li, h1, h2, h3, h4, h5, h6') || snippetWrapper.parentNode;

            const p = document.createElement('p');
            p.innerHTML = '<br>';

            if (parentBlock && parentBlock.parentNode) {
                parentBlock.parentNode.insertBefore(p, parentBlock.nextSibling);
            } else {
                snippetWrapper.parentNode.insertBefore(p, snippetWrapper.nextSibling);
            }

            const newRange = document.createRange();
            newRange.setStart(p, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);

            Store.triggerAutoSave();
            return;
        }

        // --- GESTIONE TABELLE HTML: Evita il raddoppio dei tag BR
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

                    // RESET EREDITÀ FORMATTAZIONE: Impedisce al browser di ereditare il grassetto dal titolo
                    if (document.queryCommandState('bold')) {
                        try { document.execCommand('bold', false, null); } catch (err) {}
                    }
                }

                Store.triggerAutoSave();
                return;
            } else {
                Editor.saveSnapshot();
            }
        }

        // --- GESTIONE INVIO SU BLOCKQUOTE: DOPPIO INVIO SU RIGA VUOTA PER USCIRE ---
        const quoteBlock = node.closest('blockquote:not(.adv-widget-shell)');
        if (quoteBlock) {
            const candidateBlock = node.closest('p, div');
            const currentBlock = (candidateBlock && quoteBlock.contains(candidateBlock)) ? candidateBlock : quoteBlock;
            const isEmptyLine = currentBlock.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim() === '' && !currentBlock.querySelector('img, audio, iframe');

            // Se la riga attuale è vuota, scatta l'uscita dalla citazione
            if (isEmptyLine) {
                e.preventDefault();
                Editor.saveSnapshot();

                if (currentBlock !== quoteBlock && quoteBlock.contains(currentBlock)) {
                    currentBlock.remove();
                }

                const parentHost = quoteBlock.parentElement;
                const isInsideListHost = parentHost && (parentHost.tagName === 'LI' || (parentHost.classList && parentHost.classList.contains('checklist-text')));

                if (isInsideListHost) {
                    // Se il blockquote risiede dentro un punto elenco, esce dalla citazione restando nel flusso del <li>
                    const br = document.createElement('br');
                    parentHost.insertBefore(br, quoteBlock.nextSibling);

                    if (quoteBlock.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim() === '' && !quoteBlock.querySelector('img, audio, iframe')) {
                        quoteBlock.remove();
                    }

                    const newRange = document.createRange();
                    newRange.setStartAfter(br);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                } else {
                    const p = document.createElement('p');
                    p.innerHTML = '<br>';
                    quoteBlock.parentNode.insertBefore(p, quoteBlock.nextSibling);

                    // Se l'intero blockquote è rimasto vuoto, lo ripulisce
                    if (quoteBlock.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim() === '' && !quoteBlock.querySelector('img, audio, iframe')) {
                        quoteBlock.remove();
                    }

                    const newRange = document.createRange();
                    newRange.setStart(p, 0);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                }

                Store.triggerAutoSave();
                if (typeof Editor.updateToolbarFormatting === 'function') Editor.updateToolbarFormatting();
                return;
            }
        }

        // --- GESTIONE INVIO SU CHECKLIST (TO-DO LIST) ---
        const closestChecklistUl = node.closest('ul.adv-checklist');
        if (closestChecklistUl && !quoteBlock) {
            e.preventDefault();
            Editor.saveSnapshot();

            let targetLi = node.closest('li.adv-checklist-item');
            const hadSelection = !selection.isCollapsed;

            if (hadSelection) {
                const range = selection.getRangeAt(0);
                const startEl = range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer;
                const endEl = range.endContainer.nodeType === 3 ? range.endContainer.parentNode : range.endContainer;
                const startLi = startEl && startEl.closest ? startEl.closest('li.adv-checklist-item') : null;
                const endLi = endEl && endEl.closest ? endEl.closest('li.adv-checklist-item') : null;

                if (startLi && endLi) {
                    if (startLi === endLi) {
                        range.deleteContents();
                        range.collapse(true);
                        targetLi = startLi;
                    } else {
                        targetLi = Editor._mergeChecklistRange(range, startLi, endLi);
                    }
                }
            }

            if (!targetLi) return;

            const spanText = Editor._getChecklistTextSpan(targetLi);
            const isEmpty = Editor._isChecklistSpanEmpty(spanText);

            if (!hadSelection && isEmpty) {
                const resultNode = Editor.outdentChecklistLine(targetLi);
                if (resultNode && resultNode.classList && resultNode.classList.contains('adv-checklist-item')) {
                    Editor._placeCaretInChecklistSpan(Editor._getChecklistTextSpan(resultNode), false);
                } else if (resultNode) {
                    const r = document.createRange();
                    r.setStart(resultNode, 0);
                    r.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(r);
                    Editor.savedRange = r.cloneRange();
                }
            } else {
                const curSel = window.getSelection();
                let range = curSel.rangeCount > 0 ? curSel.getRangeAt(0) : null;
                if (!range || !spanText.contains(range.startContainer)) {
                    Editor._placeCaretInChecklistSpan(spanText, true);
                    range = curSel.getRangeAt(0);
                }

                // Spezza spanText esattamente al punto del cursore mantenendo eventuali tag inline
                const tailRange = document.createRange();
                tailRange.setStart(range.startContainer, range.startOffset);
                tailRange.setEnd(spanText, spanText.childNodes.length);
                const tailFrag = tailRange.extractContents();

                const newLi = Editor._createChecklistItem('', false);
                const newSpan = Editor._getChecklistTextSpan(newLi);

                const tmpDiv = document.createElement('div');
                tmpDiv.appendChild(tailFrag);
                if (!Editor._isChecklistSpanEmpty(tmpDiv)) {
                    newSpan.innerHTML = '';
                    while (tmpDiv.firstChild) {
                        const ch = tmpDiv.firstChild;
                        if (ch.nodeType === 3 && ch.nodeValue === '\u200B' && !ch.nextSibling && !ch.previousSibling) ch.remove();
                        else newSpan.appendChild(ch);
                    }
                }

                if (Editor._isChecklistSpanEmpty(spanText)) {
                    spanText.innerHTML = '';
                    spanText.appendChild(document.createTextNode('\u200B'));
                    const nestedUl = Editor._getChecklistNestedList(targetLi);
                    if (nestedUl) newLi.appendChild(nestedUl);
                }

                targetLi.parentNode.insertBefore(newLi, targetLi.nextSibling);
                Editor._placeCaretInChecklistSpan(newSpan, false);
            }

            Store.triggerAutoSave();
            if (typeof Editor.ensureCaretVisible === 'function') Editor.ensureCaretVisible();
            return;
        }

        // --- GESTIONE INVIO A FINE LINK (<a>): ESTRAZIONE PREVENTIVA DEL CURSORE ---
        // Se il cursore si trova alla fine del link, lo posizioniamo subito dopo nel testo neutro
        // prima che l'Invio del browser sdoppi il tag <a> creando link fantasma sulla nuova riga
        const activeLink = node.closest ? node.closest('a') : null;
        if (activeLink && !activeLink.closest('.adv-widget-shell, .adv-inline-shell')) {
            const range = selection.getRangeAt(0);
            const postRange = range.cloneRange();
            postRange.selectNodeContents(activeLink);
            postRange.setStart(range.endContainer, range.endOffset);

            if (postRange.toString().length === 0) {
                let afterNode = activeLink.nextSibling;
                if (!afterNode || afterNode.nodeType !== Node.TEXT_NODE) {
                    afterNode = document.createTextNode('');
                    activeLink.parentNode.insertBefore(afterNode, activeLink.nextSibling);
                }
                const newRange = document.createRange();
                newRange.setStart(afterNode, 0);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
                // Nessun e.preventDefault(): il browser crea nativamente il nuovo paragrafo privo del link
            }
        }
    },

    handleBackspaceKey: (e) => {
        // 1. INTERCETTAZIONE CANCELLAZIONE MULTI-CELLA TABELLA SEMPLICE
        if (typeof TableManager !== 'undefined' && TableManager.Selection && TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 1) {
            e.preventDefault();
            TableManager.Selection.clearSelectedCellsContent();
            return;
        }

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        // Se c'è del testo selezionato, la gestione è identica e unificata per tutta l'applicazione
        if (!selection.isCollapsed) {
            Editor.deleteSelection(e);
            return;
        }

        const range = selection.getRangeAt(0);
        let container = range.startContainer;
        const editorRoot = document.getElementById('noteContent');

        // Blocco codice a cursore collassato: impedisce di cancellare il widget o evadere all'indietro da offset 0
        let node = container.nodeType === 3 ? container.parentNode : container;
        const preNode = node.closest ? node.closest('pre.code-content') : null;
        if (preNode) {
            let currentPos = Editor._getCodeOffset(preNode, selection.anchorNode, selection.anchorOffset);
            if (currentPos === 0) {
                e.preventDefault();
            }
            return;
        }

        // CANCELLAZIONE SEPARATORE <HR> O <IMG> CON BACKSPACE (Quando il cursore è direttamente nel root editor prima/dopo l'elemento)
        if (container === editorRoot && range.startOffset > 0) {
            const nodeBefore = editorRoot.childNodes[range.startOffset - 1];
            if (nodeBefore && (nodeBefore.tagName === 'HR' || nodeBefore.tagName === 'IMG')) {
                e.preventDefault();
                Editor.saveSnapshot();
                const wasImg = nodeBefore.tagName === 'IMG';
                const nextNode = nodeBefore.nextSibling;
                nodeBefore.remove();
                if (wasImg) {
                    const isEmptyNextP = nextNode && nextNode.nodeType === 1 && nextNode.tagName === 'P' &&
                        nextNode.innerText.trim() === '' &&
                        !nextNode.querySelector('img, audio, iframe, hr, .adv-widget-shell');
                    const p = isEmptyNextP ? nextNode : document.createElement('p');
                    if (!p.parentNode) {
                        p.innerHTML = '<br>';
                        editorRoot.insertBefore(p, nextNode);
                    }
                    const r = document.createRange();
                    r.setStart(p, 0);
                    r.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(r);
                }
                Store.triggerAutoSave();
                return;
            }
        }

        let block = container.nodeType === 3 ? container.parentNode.closest('p, div, li, h1, h2, h3, h4, h5, h6') : (container.closest ? container.closest('p, div, li, h1, h2, h3, h4, h5, h6') : null);

        // CANCELLAZIONE ATOMICA WIDGET INLINE (BACKSPACE): Copre snippet, note inline e segnalibri anche se annidati in tag inline
        let inlineBefore = null;
        if (container.nodeType === 3) {
            const textBeforeCaret = container.nodeValue.substring(0, range.startOffset).replace(/[\u200B\uFEFF]/g, '');
            if (textBeforeCaret.length === 0) {
                let curr = container;
                while (curr && curr.parentNode && curr.parentNode !== editorRoot && (!block || curr.parentNode !== block) && !curr.previousSibling) {
                    curr = curr.parentNode;
                }
                let prev = curr ? curr.previousSibling : null;
                while (prev && prev.nodeType === 3 && prev.nodeValue.replace(/[\u200B\uFEFF]/g, '') === '') {
                    prev = prev.previousSibling;
                }
                if (prev && prev.nodeType === 1 && (prev.classList.contains('adv-inline-shell') || prev.classList.contains('adv-copy-snippet') || prev.classList.contains('inline-note-wrapper') || prev.classList.contains('adv-bookmark-marker'))) {
                    inlineBefore = prev;
                }
            }
        } else if (container.nodeType === 1 && range.startOffset > 0) {
            const prev = container.childNodes[range.startOffset - 1];
            if (prev && prev.nodeType === 1 && (prev.classList.contains('adv-inline-shell') || prev.classList.contains('adv-copy-snippet') || prev.classList.contains('inline-note-wrapper') || prev.classList.contains('adv-bookmark-marker'))) {
                inlineBefore = prev;
            }
        }

        if (inlineBefore) {
            e.preventDefault();
            Editor.saveSnapshot();
            
            const isBookmark = inlineBefore.classList.contains('adv-bookmark-marker');
            const isInlineNote = inlineBefore.classList.contains('inline-note-wrapper');

            // Pulisce i cuscinetti \u200B adiacenti per evitare nodi vuoti
            if (inlineBefore.previousSibling && inlineBefore.previousSibling.nodeType === 3 && inlineBefore.previousSibling.nodeValue.replace(/[\u200B\uFEFF]/g, '') === '') {
                inlineBefore.previousSibling.remove();
            }
            if (inlineBefore.nextSibling && inlineBefore.nextSibling.nodeType === 3 && inlineBefore.nextSibling.nodeValue.replace(/[\u200B\uFEFF]/g, '') === '') {
                inlineBefore.nextSibling.remove();
            }

            inlineBefore.remove();

            if (isBookmark && typeof UI !== 'undefined' && UI.renderTree) {
                UI.renderTree();
            }
            if (isInlineNote && typeof UI !== 'undefined' && UI.renderInlineFootnotes) {
                UI.renderInlineFootnotes();
            }

            Store.triggerAutoSave();
            return;
        }

        const currentWidget = container.nodeType === 3 ? container.parentNode.closest('.adv-widget-shell') : container.closest('.adv-widget-shell');

        if (container.nodeType === 3 && WidgetManager.isProtectedBlock(container.parentNode) && !WidgetManager.isInsideEditableWidgetArea(container.parentNode)) { return; }
        if (container.closest && WidgetManager.isProtectedBlock(container) && !WidgetManager.isInsideEditableWidgetArea(container)) { return; }

        const closestLi = container.nodeType === 3 ? container.parentNode.closest('li') : (container.closest ? container.closest('li') : null);
        const closestList = closestLi ? closestLi.parentElement : null;

        // GESTIONE CHECKLIST ROBUSTA: calcolo protetto di isAtChecklistStart con outdent / merge / promozione
        if (closestList && closestList.classList.contains('adv-checklist')) {
            const span = Editor._getChecklistTextSpan(closestLi);
            let isAtChecklistStart = false;

            if (span && span.contains(range.startContainer)) {
                try {
                    const preCaretRange = range.cloneRange();
                    preCaretRange.selectNodeContents(span);
                    preCaretRange.setEnd(range.startContainer, range.startOffset);
                    isAtChecklistStart = preCaretRange.toString().replace(/[\u200B\uFEFF]/g, '').length === 0 &&
                                         !preCaretRange.cloneContents().querySelector('img, audio, iframe, svg, .adv-inline-shell');
                } catch (_) {
                    isAtChecklistStart = false;
                }
            } else if (span) {
                isAtChecklistStart = true;
            }

            if (isAtChecklistStart) {
                e.preventDefault();
                Editor.saveSnapshot();

                const parentUl = closestLi.parentNode;
                const grandParentLi = (parentUl && parentUl.parentElement) ? parentUl.parentElement.closest('li.adv-checklist-item') : null;

                if (grandParentLi) {
                    Editor.outdentChecklistLine(closestLi);
                    if (span) Editor._placeCaretInChecklistSpan(span, false);
                } else {
                    const prevLi = closestLi.previousElementSibling;
                    if (!prevLi) {
                        // Prima voce della checklist radice: riconverte in paragrafo preservando eventuali sotto-liste
                        const nestedUl = Editor._getChecklistNestedList(closestLi);
                        const p = document.createElement('p');
                        if (span) while (span.firstChild) p.appendChild(span.firstChild);
                        if (Editor._isChecklistSpanEmpty(p)) p.innerHTML = '<br>';

                        parentUl.parentNode.insertBefore(p, parentUl);
                        if (nestedUl) {
                            while (nestedUl.lastElementChild) parentUl.insertBefore(nestedUl.lastElementChild, closestLi.nextSibling);
                        }
                        closestLi.remove();
                        if (parentUl.children.length === 0) parentUl.remove();

                        const newRange = document.createRange();
                        newRange.setStart(p, 0);
                        newRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                    } else {
                        // Trova l'ultima voce visibile precedente (anche se annidata)
                        let targetPrevLi = prevLi;
                        while (true) {
                            const sub = Editor._getChecklistNestedList(targetPrevLi);
                            if (sub && sub.lastElementChild && sub.lastElementChild.classList.contains('adv-checklist-item')) {
                                targetPrevLi = sub.lastElementChild;
                            } else break;
                        }
                        const prevSpan = Editor._getChecklistTextSpan(targetPrevLi);
                        if (prevSpan) Editor._mergeChecklistSpans(prevSpan, span, closestLi);
                    }
                }
                Store.triggerAutoSave();
                return;
            }
        }

        const cleanText = (str) => (str || '').replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
        const hasNonTextMedia = (el) => !!(el && el.querySelector && el.querySelector('img, audio, iframe, hr, .adv-widget-shell, .adv-inline-shell'));

        // Verifica se il cursore è all'inizio del blocco corrente tenendo conto di tag inline e media
        let isAtBlockStart = false;
        if (block) {
            const isEmptyBlock = cleanText(block.textContent) === '' && !hasNonTextMedia(block);

            if (isEmptyBlock) {
                isAtBlockStart = true;
            } else {
                try {
                    const preRange = range.cloneRange();
                    preRange.selectNodeContents(block);
                    preRange.setEnd(range.startContainer, range.startOffset);
                    const textBefore = preRange.toString().replace(/[\u200B\uFEFF\u00A0\n\r]/g, '');
                    const hasMedia = !!preRange.cloneContents().querySelector('img, audio, iframe, svg, .adv-widget-shell, .adv-inline-shell, hr');
                    isAtBlockStart = (textBefore.length === 0 && !hasMedia);
                } catch (_) {
                    isAtBlockStart = false;
                }
            }
        }

        if (block && isAtBlockStart) {
            // Se il cursore si trova all'interno di un'area editabile di un widget (es. Diario, Cella, Codice),
            // non permettere a Backspace di evadere per cancellare il guscio genitore o widget adiacenti
            if (currentWidget) {
                return;
            }

            // GESTIONE MINIMALE HR O IMG CON BACKSPACE: Se il blocco precedente è <hr> o <img> diretto, rimuovilo
            // lasciando il cursore nel blocco corrente esattamente dove si trovava l'elemento
            const prevSibling = block.previousElementSibling;
            if (prevSibling && (prevSibling.tagName === 'HR' || prevSibling.tagName === 'IMG')) {
                e.preventDefault();
                Editor.saveSnapshot();
                prevSibling.remove();
                Store.triggerAutoSave();
                return;
            }

            const isEmptyBlock = cleanText(block.textContent) === '' && !hasNonTextMedia(block);
            
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

            // Se il blocco precedente è un widget protetto: BLOCCA SEMPRE la distruzione sia della riga che del widget,
            // e fai lampeggiare il widget precedente con il contorno rosso per 500ms
            if (prevNode && WidgetManager.isProtectedBlock(prevNode)) {
                const targetWidget = prevNode.closest('.adv-widget-shell');
                if (currentWidget && targetWidget && currentWidget === targetWidget) {
                    return; 
                }

                e.preventDefault();
                
                const shell = targetWidget || prevNode;
                if (shell) {
                    Editor.flashWidgetProtectedBorder(shell);
                }
                return; 
            }

            // Se il blocco è l'unico rimasto nell'editor ed è vuoto, impedisce lo svuotamento assoluto del documento
            if (editorRoot && editorRoot.children.length === 1 && editorRoot.firstElementChild === block && isEmptyBlock) {
                e.preventDefault();
                block.innerHTML = '<br>';
                return;
            }

            // Se il blocco precedente è effettivamente vuoto (senza testo né immagini/audio/widget): rimuovilo senza spostare il cursore a fine riga
            if (prevNode && !WidgetManager.isProtectedBlock(prevNode) && cleanText(prevNode.textContent) === '' && !hasNonTextMedia(prevNode)) {
                e.preventDefault();
                Editor.saveSnapshot();
                let currParent = prevNode.parentNode;
                prevNode.remove();
                while (currParent && (currParent.tagName === 'UL' || currParent.tagName === 'OL') && currParent.children.length === 0) {
                    const upper = currParent.parentNode;
                    currParent.remove();
                    currParent = upper;
                }
                Store.triggerAutoSave();
                return;
            }

            // Fusione pulita dentro span.checklist-text se il blocco precedente è una voce To-Do
            if (prevNode && prevNode.classList && prevNode.classList.contains('adv-checklist-item') && !block.closest('li, table, .adv-widget-shell')) {
                e.preventDefault();
                Editor.saveSnapshot();
                const prevSpan = Editor._getChecklistTextSpan(prevNode);
                if (prevSpan) Editor._mergeChecklistSpans(prevSpan, block, block);
                Store.triggerAutoSave();
                return;
            }

            // Se il blocco corrente è vuoto (tra testi normali o sotto un media): rimuovilo e posiziona il cursore sul blocco precedente
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
        }
    },

    handleDeleteKey: (e) => {
        // 1. INTERCETTAZIONE CANCELLAZIONE MULTI-CELLA TABELLA SEMPLICE
        if (typeof TableManager !== 'undefined' && TableManager.Selection && TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 1) {
            e.preventDefault();
            TableManager.Selection.clearSelectedCellsContent();
            return;
        }

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        // Se c'è del testo selezionato, la gestione è identica e unificata per tutta l'applicazione
        if (!selection.isCollapsed) {
            Editor.deleteSelection(e);
            return;
        }

        const range = selection.getRangeAt(0);
        let container = range.startContainer;
        const editorRoot = document.getElementById('noteContent');

        // Blocco codice a cursore collassato: cancella 1 carattere in avanti senza intaccare widget esterni
        let node = container.nodeType === 3 ? container.parentNode : container;
        const preNode = node.closest ? node.closest('pre.code-content') : null;
        if (preNode) {
            let currentPos = Editor._getCodeOffset(preNode, selection.anchorNode, selection.anchorOffset);
            let rawText = Editor._getRawText(preNode);
            if (rawText.endsWith('\n')) rawText = rawText.slice(0, -1);

            // Alla fine assoluta del codice non cancellare i blocchi o widget esterni successivi
            if (currentPos >= rawText.length) {
                e.preventDefault();
                return;
            }

            e.preventDefault();
            Editor.saveSnapshot();

            const newText = rawText.substring(0, currentPos) + rawText.substring(currentPos + 1);

            const wrapper = preNode.closest('.code-wrapper, [data-widget-type="code"]');
            if (wrapper) {
                const trueId = wrapper.id.split('_cited_')[0];
                if (!AppState.databases) AppState.databases = {};
                if (!AppState.databases[trueId]) AppState.databases[trueId] = { title: I18n.t('code_widget.default_title'), language: 'none', content: '' };
                AppState.databases[trueId].content = newText;
            }

            if (typeof CodeManager !== 'undefined') {
                CodeManager.highlightBlock(preNode, true, newText);
            } else {
                preNode.textContent = newText;
            }

            Editor._setCodeOffset(preNode, currentPos, currentPos);
            Store.triggerAutoSave();
            return;
        }

        // CANCELLAZIONE SEPARATORE <HR> O <IMG> CON CANC/DELETE (Quando il cursore è direttamente nel root editor prima dell'elemento)
        if (container === editorRoot && range.startOffset < editorRoot.childNodes.length) {
            const nodeAfter = editorRoot.childNodes[range.startOffset];
            if (nodeAfter && (nodeAfter.tagName === 'HR' || nodeAfter.tagName === 'IMG')) {
                e.preventDefault();
                Editor.saveSnapshot();
                const wasImg = nodeAfter.tagName === 'IMG';
                const nextNode = nodeAfter.nextSibling;
                nodeAfter.remove();
                if (wasImg) {
                    const isEmptyNextP = nextNode && nextNode.nodeType === 1 && nextNode.tagName === 'P' &&
                        nextNode.innerText.trim() === '' &&
                        !nextNode.querySelector('img, audio, iframe, hr, .adv-widget-shell');
                    const p = isEmptyNextP ? nextNode : document.createElement('p');
                    if (!p.parentNode) {
                        p.innerHTML = '<br>';
                        editorRoot.insertBefore(p, nextNode);
                    }
                    const r = document.createRange();
                    r.setStart(p, 0);
                    r.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(r);
                }
                Store.triggerAutoSave();
                return;
            }
        }

        let block = container.nodeType === 3 ? container.parentNode.closest('p, div, li, h1, h2, h3, h4, h5, h6') : (container.closest ? container.closest('p, div, li, h1, h2, h3, h4, h5, h6') : null);

        // CANCELLAZIONE ATOMICA WIDGET INLINE (DELETE / CANC): Copre snippet, note inline e segnalibri anche se annidati in tag inline
        let inlineAfter = null;
        if (container.nodeType === 3) {
            const textAfterCaret = container.nodeValue.substring(range.startOffset).replace(/[\u200B\uFEFF]/g, '');
            if (textAfterCaret.length === 0) {
                let curr = container;
                while (curr && curr.parentNode && curr.parentNode !== editorRoot && (!block || curr.parentNode !== block) && !curr.nextSibling) {
                    curr = curr.parentNode;
                }
                let next = curr ? curr.nextSibling : null;
                while (next && next.nodeType === 3 && next.nodeValue.replace(/[\u200B\uFEFF]/g, '') === '') {
                    next = next.nextSibling;
                }
                if (next && next.nodeType === 1 && (next.classList.contains('adv-inline-shell') || next.classList.contains('adv-copy-snippet') || next.classList.contains('inline-note-wrapper') || next.classList.contains('adv-bookmark-marker'))) {
                    inlineAfter = next;
                }
            }
        } else if (container.nodeType === 1 && range.startOffset < container.childNodes.length) {
            const next = container.childNodes[range.startOffset];
            if (next && next.nodeType === 1 && (next.classList.contains('adv-inline-shell') || next.classList.contains('adv-copy-snippet') || next.classList.contains('inline-note-wrapper') || next.classList.contains('adv-bookmark-marker'))) {
                inlineAfter = next;
            }
        }

        if (inlineAfter) {
            e.preventDefault();
            Editor.saveSnapshot();

            const isBookmark = inlineAfter.classList.contains('adv-bookmark-marker');
            const isInlineNote = inlineAfter.classList.contains('inline-note-wrapper');

            // Pulisce i cuscinetti \u200B adiacenti per evitare nodi vuoti
            if (inlineAfter.previousSibling && inlineAfter.previousSibling.nodeType === 3 && inlineAfter.previousSibling.nodeValue.replace(/[\u200B\uFEFF]/g, '') === '') {
                inlineAfter.previousSibling.remove();
            }
            if (inlineAfter.nextSibling && inlineAfter.nextSibling.nodeType === 3 && inlineAfter.nextSibling.nodeValue.replace(/[\u200B\uFEFF]/g, '') === '') {
                inlineAfter.nextSibling.remove();
            }

            inlineAfter.remove();

            if (isBookmark && typeof UI !== 'undefined' && UI.renderTree) {
                UI.renderTree();
            }
            if (isInlineNote && typeof UI !== 'undefined' && UI.renderInlineFootnotes) {
                UI.renderInlineFootnotes();
            }

            Store.triggerAutoSave();
            return;
        }

        // GESTIONE DELETE A FINE VOCE CHECKLIST (Fusione con la voce o il blocco successivo)
        const closestCheckLi = node.closest ? node.closest('li.adv-checklist-item') : null;
        if (closestCheckLi) {
            const span = Editor._getChecklistTextSpan(closestCheckLi);
            let isAtChecklistEnd = Editor._isChecklistSpanEmpty(span);

            if (!isAtChecklistEnd && span && span.contains(range.endContainer)) {
                try {
                    const postRange = range.cloneRange();
                    postRange.selectNodeContents(span);
                    postRange.setStart(range.endContainer, range.endOffset);
                    isAtChecklistEnd = postRange.toString().replace(/[\u200B\uFEFF]/g, '').length === 0 &&
                                       !postRange.cloneContents().querySelector('img, audio, iframe, svg, .adv-inline-shell, br');
                } catch (_) {}
            }

            if (isAtChecklistEnd && span) {
                e.preventDefault();
                Editor.saveSnapshot();

                let rootUl = closestCheckLi.closest('ul.adv-checklist');
                while (rootUl && rootUl.parentElement && rootUl.parentElement.closest('ul.adv-checklist')) {
                    rootUl = rootUl.parentElement.closest('ul.adv-checklist');
                }
                const allItems = rootUl ? Array.from(rootUl.querySelectorAll('li.adv-checklist-item')) : [];
                const curIdx = allItems.indexOf(closestCheckLi);
                const nextCheckLi = (curIdx !== -1 && curIdx < allItems.length - 1) ? allItems[curIdx + 1] : null;

                if (nextCheckLi) {
                    const nextSpan = Editor._getChecklistTextSpan(nextCheckLi);
                    Editor._mergeChecklistSpans(span, nextSpan, nextCheckLi);
                } else if (rootUl && rootUl.nextElementSibling) {
                    const nextBlk = rootUl.nextElementSibling;
                    if (WidgetManager.isProtectedBlock(nextBlk)) {
                        Editor.flashWidgetProtectedBorder(nextBlk);
                        return;
                    }
                    if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(nextBlk.tagName)) {
                        Editor._mergeChecklistSpans(span, nextBlk, nextBlk);
                    }
                }
                Store.triggerAutoSave();
                return;
            }
        }

        const currentWidget = container.nodeType === 3 ? container.parentNode.closest('.adv-widget-shell') : container.closest('.adv-widget-shell');
        const editableScope = node.closest ? node.closest('td, th, .col-box') : null;

        // Se siamo dentro un'area editabile di un widget (es. cella di tabella semplice o colonna senza <p> interni),
        // non trattare la shell esterna come blocco da fondere o cancellare in uscita
        if (currentWidget && block && (block === currentWidget || !currentWidget.contains(block))) {
            return;
        }

        if (block) {
            let isAtEnd = false;
            
            const cleanText = (str) => (str || '').replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
            const hasNonTextMedia = (el) => !!(el && el.querySelector && el.querySelector('img, audio, iframe, hr, .adv-widget-shell, .adv-inline-shell'));
            const isEmptyBlock = cleanText(block.textContent) === '' && !hasNonTextMedia(block);

            if (isEmptyBlock) {
                isAtEnd = true;
            } else {
                try {
                    const postRange = range.cloneRange();
                    postRange.selectNodeContents(block);
                    postRange.setStart(range.endContainer, range.endOffset);

                    const remainingText = cleanText(postRange.toString());
                    const frag = postRange.cloneContents();
                    const hasMediaOrWidget = !!frag.querySelector('img, audio, iframe, svg, .adv-widget-shell, .adv-inline-shell, hr');
                    const brCount = frag.querySelectorAll('br').length;

                    // Se dopo il cursore nello stesso blocco c'è ancora testo visibile, un widget/media o più di un <br>
                    if (remainingText.length > 0 || hasMediaOrWidget || brCount > 1) {
                        isAtEnd = false;
                    } else {
                        isAtEnd = true;
                    }
                } catch (_) {
                    isAtEnd = false;
                }
            }

            if (isAtEnd) {
                // GESTIONE MINIMALE HR O IMG CON CANC: Se l'elemento successivo è <hr> o <img> diretto, eliminalo
                // lasciando il cursore esattamente dove si trova
                const nextSibling = block.nextElementSibling;
                if (nextSibling && (nextSibling.tagName === 'HR' || nextSibling.tagName === 'IMG')) {
                    e.preventDefault();
                    Editor.saveSnapshot();
                    nextSibling.remove();
                    Store.triggerAutoSave();
                    return;
                }

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

                // Se siamo dentro una cella di tabella semplice o una colonna, non sconfinare mai fuori dall'area editabile corrente
                if (editableScope && (!nextNode || !editableScope.contains(nextNode))) {
                    return;
                }

                // SALVAGUARDIA WIDGET PROTETTO CON CANC: Impedisce la distruzione della riga e del widget, mostrando il flash rosso per 500ms
                if (nextNode && WidgetManager.isProtectedBlock(nextNode)) {
                    const targetWidget = nextNode.closest('.adv-widget-shell');
                    if (currentWidget && targetWidget && currentWidget === targetWidget) {
                        return; 
                    }

                    e.preventDefault();
                    
                    const shell = targetWidget || nextNode;
                    if (shell) {
                        Editor.flashWidgetProtectedBorder(shell);
                    }
                    return; 
                }

                // Se il blocco successivo è effettivamente vuoto (senza testo né immagini/audio/widget): rimuovilo con snapshot e autosave immediato
                if (nextNode && !WidgetManager.isProtectedBlock(nextNode) && cleanText(nextNode.textContent) === '' && !hasNonTextMedia(nextNode)) {
                    e.preventDefault();
                    Editor.saveSnapshot();
                    let currParent = nextNode.parentNode;
                    nextNode.remove();
                    while (currParent && (currParent.tagName === 'UL' || currParent.tagName === 'OL') && currParent.children.length === 0) {
                        const upper = currParent.parentNode;
                        currParent.remove();
                        currParent = upper;
                    }
                    Store.triggerAutoSave();
                    return;
                }

                // Se il blocco corrente è vuoto ed esiste un blocco successivo: rimuovi il blocco corrente e posizionati sul successivo
                if (isEmptyBlock && nextNode && !WidgetManager.isProtectedBlock(nextNode) && !block.closest('li, table, .adv-widget-shell')) {
                    e.preventDefault();
                    Editor.saveSnapshot();

                    if (nextNode.classList && nextNode.classList.contains('adv-checklist-item')) {
                        const nextSpan = Editor._getChecklistTextSpan(nextNode);
                        block.remove();
                        if (nextSpan) Editor._placeCaretInChecklistSpan(nextSpan, false);
                    } else {
                        const newRange = document.createRange();
                        newRange.selectNodeContents(nextNode);
                        newRange.collapse(true);

                        block.remove();
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                    }
                    Store.triggerAutoSave();
                    return;
                }

                // GUARDIA DIFENSIVA INTEGRALE:
                // Se il nodo successivo contiene un widget inline (come un appunto o snippet),
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
            }
        }

        // Simmetrico a Backspace: per tutte le altre cancellazioni ordinarie di testo in avanti, garantisce il trigger dell'autosave
        setTimeout(() => {
            if (typeof Store !== 'undefined') Store.triggerAutoSave();
        }, 50);
    }
});