/**
 * editor-keyboard-mutations.js
 * Sottomodulo di Editor.
 * Responsabilità: Intercettazione di tasti che distruggono o creano nodi complessi
 * FIX CANCELLAZIONE WIDGET INTERNI: Aggiunto controllo di identità tra widget corrente 
 * e widget bersaglio per permettere l'uso dei tasti Canc e Backspace all'interno delle aree editabili (Es. Colonne).
 * FIX MERGE INLINE WIDGETS: Intercettazione chirurgica della fusione dei paragrafi tramite Backspace/Canc
 * utilizzando un DOM TreeWalker assoluto per scavalcare correttamente i confini delle liste (UL/OL) 
 * proteggendo gli appunti inline e gli snippet copiabili dalla distruzione nativa del browser.
 * CANCELLAZIONE SNIPPET LINEARE: Eliminazione atomica e fluida dello snippet copiabile su Backspace/Canc
 * senza popup bloccanti o over-engineering, con pieno supporto al ripristino istantaneo tramite Undo (Ctrl+Z).
 * CANCELLAZIONE DIRETTA HR: Cancellazione immediata di <hr> se precede il blocco su Backspace o se segue su Canc.
 * SALVAGUARDIA WIDGET DA TASTIERA & FLASH BORDO ROSSO (500ms): Impedisce l'eliminazione accidentale dei widget
 * complessi tramite Backspace e Canc e preserva le righe vuote di separazione, mostrando un contorno rosso animato
 * sul widget protetto che scompare automaticamente dopo mezzo secondo.
 * SALVAGUARDIA BLOCCO MINIMO: Impedisce lo svuotamento totale dell'editor su cancellazione dell'ultimo blocco vuoto.
 * RESET EREDITÀ FORMATTAZIONE: Disattivazione automatica del comando bold residuo all'uscita dai titoli H1..H6 con Invio.
 * FIX AUTOSAVE DELETE/CANC: Parità operativa tra Backspace e Delete con salvataggio automatico (Store.triggerAutoSave)
 * preservando il blocco di sicurezza per i widget inline (.adv-inline-shell).
 * REFACTOR UNIFIED SELECTION DELETION: Centralizzazione della cancellazione di selezioni estese in deleteSelection(e),
 * eliminando codice duplicato e gestendo in modo omogeneo tabelle, blocchi di codice e testo normale.
 * FIX DELETE BOUNDARY (POST-RANGE): Calcolo esatto di isAtEnd tramite postRange sull'intero blocco genitore,
 * impedendo che Canc a fine di un tag inline (es. <b>) scavalchi caratteri successivi dello stesso paragrafo.
 * PREVENT LINK SPLIT ON ENTER: Riposizionamento del cursore subito dopo il tag <a> prima che l'Invio nativo
 * possa clonare il link sulla nuova riga, eliminando sdoppiamenti alla radice senza pezze a posteriori.
 * FIX CHECKLIST BACKSPACE CRASH & CARET BOUNDARY (2.2): Calcolo protetto di isAtChecklistStart con span.contains()
 * per prevenire eccezioni IndexSizeError e garantire la conversione pulita del primo elemento to-do in paragrafo.
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
            const currentBlock = node.closest('p, div, li') || quoteBlock;
            const isEmptyLine = currentBlock.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim() === '' && !currentBlock.querySelector('img, audio, iframe');

            // Se la riga attuale è vuota, scatta l'uscita dalla citazione
            if (isEmptyLine) {
                e.preventDefault();
                Editor.saveSnapshot();

                if (currentBlock !== quoteBlock) {
                    currentBlock.remove();
                }

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

                Store.triggerAutoSave();
                Editor.updateToolbarFormatting();
                return;
            }
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
                cb.setAttribute('contenteditable', 'false');

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

        // CANCELLAZIONE SEPARATORE <HR> CON BACKSPACE (Quando il cursore è direttamente nel root editor prima/dopo <hr>)
        if (container === editorRoot && range.startOffset > 0) {
            const nodeBefore = editorRoot.childNodes[range.startOffset - 1];
            if (nodeBefore && nodeBefore.tagName === 'HR') {
                e.preventDefault();
                Editor.saveSnapshot();
                nodeBefore.remove();
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

        // GESTIONE CHECKLIST ROBUSTA (2.2): calcolo protetto di isAtChecklistStart per prevenire IndexSizeError
        if (closestList && closestList.classList.contains('adv-checklist')) {
            const span = closestLi.querySelector('span.checklist-text');
            let isAtChecklistStart = false;

            if (span && span.contains(range.startContainer)) {
                try {
                    const preCaretRange = range.cloneRange();
                    preCaretRange.selectNodeContents(span);
                    preCaretRange.setEnd(range.startContainer, range.startOffset);
                    isAtChecklistStart = (preCaretRange.toString().length === 0);
                } catch (_) {
                    isAtChecklistStart = false;
                }
            } else if (span) {
                // Il cursore si trova nell'LI a monte dello span: consideralo all'inizio ed evita crash DOM
                isAtChecklistStart = true;
            }

            if (isAtChecklistStart) {
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
                    } else {
                        // Prima voce della checklist: Backspace a inizio riga la converte in paragrafo standard
                        const parentUl = closestLi.parentNode;
                        const p = document.createElement('p');
                        p.innerHTML = span.innerHTML || '<br>';
                        parentUl.parentNode.insertBefore(p, parentUl);
                        closestLi.remove();
                        if (parentUl.children.length === 0) parentUl.remove();

                        const newRange = document.createRange();
                        newRange.setStart(p, 0);
                        newRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                    }
                }
                Store.triggerAutoSave();
                return;
            }
        }

        // Verifica se il cursore è all'inizio del blocco corrente tenendo conto di tag inline e media
        let isAtBlockStart = false;
        if (block) {
            const cleanText = (str) => (str || '').replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
            const isEmptyBlock = cleanText(block.textContent) === '' && !block.querySelector('img, audio, iframe, .adv-widget-shell, .adv-inline-shell, hr');

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

            // GESTIONE MINIMALE HR CON BACKSPACE: Se il blocco precedente è un separatore <hr>, rimuovilo
            const prevSibling = block.previousElementSibling;
            if (prevSibling && prevSibling.tagName === 'HR') {
                e.preventDefault();
                Editor.saveSnapshot();
                prevSibling.remove();
                Store.triggerAutoSave();
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

            // Se il blocco precedente è vuoto (tra testi normali): rimuovilo senza spostare il cursore a fine riga
            if (prevNode && !WidgetManager.isProtectedBlock(prevNode) && cleanText(prevNode.textContent) === '') {
                e.preventDefault();
                Editor.saveSnapshot();
                prevNode.remove();
                Store.triggerAutoSave();
                return;
            }

            // Se il blocco corrente è vuoto (tra testi normali): rimuovilo e posiziona il cursore sul blocco precedente
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

        // CANCELLAZIONE SEPARATORE <HR> CON CANC/DELETE (Quando il cursore è direttamente nel root editor prima di <hr>)
        if (container === editorRoot && range.startOffset < editorRoot.childNodes.length) {
            const nodeAfter = editorRoot.childNodes[range.startOffset];
            if (nodeAfter && nodeAfter.tagName === 'HR') {
                e.preventDefault();
                Editor.saveSnapshot();
                nodeAfter.remove();
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

        const currentWidget = container.nodeType === 3 ? container.parentNode.closest('.adv-widget-shell') : container.closest('.adv-widget-shell');

        if (block) {
            let isAtEnd = false;
            
            const cleanText = (str) => (str || '').replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
            const isEmptyBlock = cleanText(block.textContent) === '' && !block.querySelector('img, audio, iframe, .adv-widget-shell, .adv-inline-shell, hr');

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
                // GESTIONE MINIMALE HR CON CANC: Se l'elemento successivo è un <hr>, eliminalo
                const nextSibling = block.nextElementSibling;
                if (nextSibling && nextSibling.tagName === 'HR') {
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

                // Se il blocco successivo è vuoto (tra testi normali): rimuovilo con snapshot e autosave immediato
                if (nextNode && !WidgetManager.isProtectedBlock(nextNode) && cleanText(nextNode.textContent) === '') {
                    e.preventDefault();
                    Editor.saveSnapshot();
                    nextNode.remove();
                    Store.triggerAutoSave();
                    return;
                }

                // Se il blocco corrente è vuoto ed esiste un blocco successivo: rimuovi il blocco corrente e posizionati sul successivo
                if (isEmptyBlock && nextNode && !WidgetManager.isProtectedBlock(nextNode) && !block.closest('li, table, .adv-widget-shell')) {
                    e.preventDefault();
                    Editor.saveSnapshot();

                    const newRange = document.createRange();
                    newRange.selectNodeContents(nextNode);
                    newRange.collapse(true);

                    block.remove();
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                    Store.triggerAutoSave();
                    return;
                }

                // GUARDIA DIFENSIVA ORIGINALE INTEGRALE:
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