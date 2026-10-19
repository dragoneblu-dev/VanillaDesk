/**
 * editor-keyboard-navigation.js
 * Sottomodulo di Editor.
 * Responsabilità: Navigazione complessa del cursore tramite tastiera (Tabulazioni in elenchi e blocchi codice, 
 * Escape intelligente dalla formattazione, Indentazione e Spostamenti geometrici nelle tabelle).
 * Gestione della navigazione a celle basata su matrice 2D: spostamento perpendicolare affidabile
 * tra celle, con pieno supporto alla navigazione multilinea interna prima del cambio cella.
 * Selezione estesa verticale (Shift+ArrowUp/Down) attraverso gli snippet copiabili.
 * Navigazione orizzontale (ArrowLeft/ArrowRight) priva di blocchi per entrare e uscire da snippet e inline shells.
 * Rilascio automatico della selezione widget al movimento del cursore con tasti freccia.
 * FIX CARET GLITCH: Navigazione fluida fuori dallo snippet scavalcando i cuscinetti \u200B ed esclusione
 * degli inline widget dall'escape verticale su nuova riga per impedire salti del cursore.
 * FIX HORIZONTAL INLINE ENTRY: Scavalcamento automatico dello \u200B anche quando ci si muove dall'esterno verso lo snippet.
 * FIX FORMAT ESCAPE JUMP: Risolto salto anomalo del cursore nei testi formattati/colorati annidati,
 * vincolando l'escape con ArrowRight alla reale fine corsa del testo all'interno dell'intero blocco contenitore.
 */

Object.assign(Editor, {

    /**
     * SNIPPET HORIZONTAL ESCAPE & ENTRY
     * Consente alle frecce ArrowLeft e ArrowRight di uscire e di entrare fluidamente nello snippet copiabile
     * scavalcando il cuscinetto \u200B senza arrestarsi nello spazio vuoto tra lo \u200B e il widget.
     */
    _handleSnippetHorizontalEscape: (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;
        if (e.shiftKey) return false;

        const sel = window.getSelection();
        if (!sel.rangeCount || !sel.isCollapsed) return false;

        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        let parent = node.nodeType === 3 ? node.parentNode : node;

        // 1. USCITA DALLO SNIPPET (Quando il cursore è all'interno di .snippet-text)
        const snippetText = parent.closest('.snippet-text');
        if (snippetText) {
            const snippetWrapper = snippetText.closest('.adv-copy-snippet, .adv-inline-shell') || snippetText;

            if (e.key === 'ArrowLeft') {
                const preRange = range.cloneRange();
                preRange.selectNodeContents(snippetText);
                preRange.setEnd(range.startContainer, range.startOffset);
                const isAtStart = preRange.toString().replace(/[\u200B\uFEFF]/g, '').length === 0;

                if (isAtStart) {
                    e.preventDefault();
                    let prevNode = snippetWrapper.previousSibling;
                    const newRange = document.createRange();
                    if (prevNode && prevNode.nodeType === 3) {
                        const val = prevNode.nodeValue || '';
                        // Se prevNode termina con \u200B, scavalcalo e atterra saldamente sul testo visibile precedente
                        const targetOffset = val.endsWith('\u200B') ? Math.max(0, val.length - 1) : val.length;
                        newRange.setStart(prevNode, targetOffset);
                    } else if (prevNode) {
                        newRange.setStartAfter(prevNode);
                    } else {
                        newRange.setStartBefore(snippetWrapper);
                    }
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    return true;
                }
            } else if (e.key === 'ArrowRight') {
                const postRange = range.cloneRange();
                postRange.selectNodeContents(snippetText);
                postRange.setStart(range.endContainer, range.endOffset);
                const isAtEnd = postRange.toString().replace(/[\u200B\uFEFF]/g, '').length === 0;

                if (isAtEnd) {
                    e.preventDefault();
                    let nextNode = snippetWrapper.nextSibling;
                    const newRange = document.createRange();
                    if (nextNode && nextNode.nodeType === 3) {
                        const val = nextNode.nodeValue || '';
                        // Se nextNode inizia con \u200B, scavalcalo e posizionati direttamente sul primo carattere di testo
                        const targetOffset = val.startsWith('\u200B') ? Math.min(1, val.length) : 0;
                        newRange.setStart(nextNode, targetOffset);
                    } else if (nextNode) {
                        newRange.setStartBefore(nextNode);
                    } else {
                        newRange.setStartAfter(snippetWrapper);
                    }
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    return true;
                }
            }
            return false;
        }

        // 2. INGRESSO NELLO SNIPPET DALL'ESTERNO (Scavalcamento dello \u200B senza soste nel limbo)
        if (node.nodeType === 3) {
            const val = node.nodeValue || '';
            const offset = range.startOffset;

            // Avvicinamento da sinistra verso lo snippet con ArrowRight
            if (e.key === 'ArrowRight') {
                const nextEl = node.nextSibling;
                if (nextEl && nextEl.nodeType === 1 && nextEl.classList.contains('adv-copy-snippet') && val.endsWith('\u200B')) {
                    if (offset >= val.length - 1) {
                        const textSpan = nextEl.querySelector('.snippet-text');
                        if (textSpan) {
                            e.preventDefault();
                            const newRange = document.createRange();
                            newRange.selectNodeContents(textSpan);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            return true;
                        }
                    }
                }
            }

            // Avvicinamento da destra verso lo snippet con ArrowLeft
            if (e.key === 'ArrowLeft') {
                const prevEl = node.previousSibling;
                if (prevEl && prevEl.nodeType === 1 && prevEl.classList.contains('adv-copy-snippet') && val.startsWith('\u200B')) {
                    if (offset <= 1) {
                        const textSpan = prevEl.querySelector('.snippet-text');
                        if (textSpan) {
                            e.preventDefault();
                            const newRange = document.createRange();
                            newRange.selectNodeContents(textSpan);
                            newRange.collapse(false);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    },

    /**
     * SNIPPET SHIFT SELECTION (Estensione Selezione Multi-Riga)
     * Consente a Shift+ArrowDown e Shift+ArrowUp di scavalcare gli snippet copiabili
     * senza arrestare la selezione al confine del contenitore.
     */
    _handleSnippetShiftSelection: (e) => {
        if (!e.shiftKey) return false;
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false;

        const sel = window.getSelection();
        if (!sel.rangeCount) return false;

        const focusNode = sel.focusNode;
        if (!focusNode) return false;
        const focusEl = focusNode.nodeType === 3 ? focusNode.parentNode : focusNode;

        const editor = document.getElementById('noteContent');
        if (!editor || !editor.contains(focusEl)) return false;

        // Se il cursore è dentro un link, non intervenire con lo shift selection degli snippet
        if (focusEl.closest('a')) return false;

        // Verifica se l'estremo attivo della selezione è dentro o subito adiacente a uno snippet copiabile
        const snippet = focusEl.closest('.adv-copy-snippet') ||
                        (focusNode.nextSibling && focusNode.nextSibling.classList && focusNode.nextSibling.classList.contains('adv-copy-snippet') ? focusNode.nextSibling : null) ||
                        (focusNode.previousSibling && focusNode.previousSibling.classList && focusNode.previousSibling.classList.contains('adv-copy-snippet') ? focusNode.previousSibling : null);

        if (!snippet) return false;

        const currentBlock = snippet.closest('p, div, li, h1, h2, h3, h4, h5, h6');
        if (!currentBlock || currentBlock.id === 'noteContent') return false;

        let targetBlock = null;

        if (e.key === 'ArrowDown') {
            targetBlock = currentBlock.nextElementSibling;
            while (targetBlock && (!Editor.isBlockElement(targetBlock) || (targetBlock.classList && targetBlock.classList.contains('adv-widget-shell')))) {
                targetBlock = targetBlock.nextElementSibling;
            }
        } else if (e.key === 'ArrowUp') {
            targetBlock = currentBlock.previousElementSibling;
            while (targetBlock && (!Editor.isBlockElement(targetBlock) || (targetBlock.classList && targetBlock.classList.contains('adv-widget-shell')))) {
                targetBlock = targetBlock.previousElementSibling;
            }
        }

        if (targetBlock) {
            e.preventDefault();

            // Calcolo del punto di atterraggio sul blocco successivo
            const anchorNode = sel.anchorNode;
            const anchorOffset = sel.anchorOffset;

            // Troviamo il primo o ultimo nodo di testo nel blocco di destinazione per una selezione naturale
            const walker = document.createTreeWalker(targetBlock, NodeFilter.SHOW_TEXT, null, false);
            let destTextNode = null;

            if (e.key === 'ArrowDown') {
                destTextNode = walker.nextNode() || targetBlock;
                const offset = destTextNode.nodeType === 3 ? Math.min(destTextNode.length, sel.focusOffset || 0) : 0;
                sel.setBaseAndExtent(anchorNode, anchorOffset, destTextNode, offset);
            } else {
                let lastText = null;
                while (walker.nextNode()) lastText = walker.currentNode;
                destTextNode = lastText || targetBlock;
                const offset = destTextNode.nodeType === 3 ? destTextNode.length : targetBlock.childNodes.length;
                sel.setBaseAndExtent(anchorNode, anchorOffset, destTextNode, offset);
            }

            targetBlock.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            return true;
        }

        return false;
    },

    /**
     * SNIPPET VERTICAL ESCAPE (Raycast Engine)
     * Previene il blocco del cursore quando si preme ArrowUp o ArrowDown
     * all'interno o nei pressi di uno snippet copiabile.
     */
    _handleSnippetVerticalEscape: (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false;
        
        // Se Shift è premuto, deleghiamo al gestore di selezione estesa
        if (e.shiftKey) {
            return Editor._handleSnippetShiftSelection(e);
        }

        const sel = window.getSelection();
        if (!sel.rangeCount) return false;

        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        let parent = node.nodeType === 3 ? node.parentNode : node;

        // Se il cursore è dentro un link, non intervenire: la navigazione verticale è naturale
        if (parent && parent.closest('a')) {
            return false;
        }

        // Si attiva SOLO se il cursore è adiacente o dentro uno snippet copiabile
        const isNearSnippet = parent.closest('.adv-copy-snippet') || 
                              (node.nextSibling && node.nextSibling.classList && node.nextSibling.classList.contains('adv-copy-snippet')) || 
                              (node.previousSibling && node.previousSibling.classList && node.previousSibling.classList.contains('adv-copy-snippet'));

        if (!isNearSnippet) return false;

        e.preventDefault(); 

        // 1. Calcola la posizione X/Y attuale esatta
        let caretRect = range.getBoundingClientRect();
        if (caretRect.width === 0 && caretRect.height === 0) {
            // Fix per ricavare la posizione se siamo in un punto del DOM senza bounding box apparente
            const span = document.createElement('span');
            span.appendChild(document.createTextNode('\u200B'));
            range.insertNode(span);
            caretRect = span.getBoundingClientRect();
            span.remove();
        }

        const currentX = caretRect.left;
        // Spostamento Y: balzo di 20 pixel sopra o sotto
        const currentY = e.key === 'ArrowDown' ? caretRect.bottom + 20 : caretRect.top - 20;

        // 2. RAYCASTING: Identifica l'elemento alle coordinate calcolate
        let targetNode = null;
        let targetOffset = 0;

        if (document.caretRangeFromPoint) {
            // Chrome / Edge / Safari
            const dropRange = document.caretRangeFromPoint(currentX, currentY);
            if (dropRange) { 
                targetNode = dropRange.startContainer; 
                targetOffset = dropRange.startOffset; 
            }
        } else if (document.caretPositionFromPoint) {
            // Firefox
            const pos = document.caretPositionFromPoint(currentX, currentY);
            if (pos) { 
                targetNode = pos.offsetNode; 
                targetOffset = pos.offset; 
            }
        }

        const editor = document.getElementById('noteContent');

        // 3. Verifica se abbiamo colpito qualcosa di valido nell'editor
        if (targetNode && editor.contains(targetNode)) {
            const checkNode = targetNode.nodeType === 3 ? targetNode.parentNode : targetNode;
            
            if (!checkNode.closest('.adv-widget-shell:not(.adv-inline-shell)')) {
                // Posizionamento sulle coordinate del raycast
                const newRange = document.createRange();
                newRange.setStart(targetNode, targetOffset);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
                return true;
            }
        }

        // 4. FALLBACK DI SICUREZZA: Navigazione a blocchi
        const currentBlock = parent.closest('p, div, li, h1, h2, h3, h4, h5, h6');
        if (!currentBlock || currentBlock.id === 'noteContent') return false;

        let targetBlock = null;
        if (e.key === 'ArrowDown') {
            targetBlock = currentBlock.nextElementSibling;
            while (targetBlock && (!Editor.isBlockElement(targetBlock) || targetBlock.classList.contains('adv-widget-shell'))) {
                targetBlock = targetBlock.nextElementSibling;
            }
            
            // Se non c'è un blocco sotto, creiamo un nuovo paragrafo per permettere l'uscita
            if (!targetBlock) {
                targetBlock = document.createElement('p');
                targetBlock.innerHTML = '<br>';
                currentBlock.parentNode.insertBefore(targetBlock, currentBlock.nextSibling);
            }
        } 
        else if (e.key === 'ArrowUp') {
            targetBlock = currentBlock.previousElementSibling;
            while (targetBlock && (!Editor.isBlockElement(targetBlock) || targetBlock.classList.contains('adv-widget-shell'))) {
                targetBlock = targetBlock.previousElementSibling;
            }
        }

        if (targetBlock) {
            const newRange = document.createRange();
            newRange.selectNodeContents(targetBlock);
            newRange.collapse(e.key === 'ArrowDown'); 
            sel.removeAllRanges();
            sel.addRange(newRange);
            targetBlock.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            return true;
        }

        return false;
    },

    /**
     * GESTORE DI NAVIGAZIONE TABELLE E WIDGET (Matrice 2D e Frecce)
     * Governa gli spostamenti geometrici tra celle, gestisce l'escape orizzontale/verticale
     * dai widget e rilascia la selezione widget attiva.
     */
    handleTableNavigation: (e) => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return false;

        // Azzeramento precauzionale del timer di digitazione quando l'utente naviga con le frecce
        if (typeof Editor !== 'undefined') {
            clearTimeout(Editor.typingTimer);
            Editor.isTyping = false;
        }

        // Rilascia l'eventuale selezione attiva di un intero widget
        if (typeof Editor.clearWidgetSelection === 'function' && Editor.selectedWidget) {
            Editor.clearWidgetSelection();
        }

        // Gestione escape orizzontale dagli snippet
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            if (Editor._handleSnippetHorizontalEscape(e)) return true;
        }

        // Gestione escape verticale dagli snippet
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if (Editor._handleSnippetVerticalEscape(e)) return true;
        }

        if (e.shiftKey) return false; // Non interferire con la selezione multipla nativa (Shift+Arrow)

        const sel = window.getSelection();
        if (!sel.rangeCount) return false;

        let node = sel.anchorNode;
        if (node.nodeType === 3) node = node.parentNode;

        // Se siamo dentro un link e NON siamo in una tabella, non eseguire alcuna intercettazione
        const insideLink = node.closest('a');
        const cell = node.closest('td, th');

        if (insideLink && !cell) {
            return false;
        }

        if (!cell) return false;

        const row = cell.parentElement;
        const table = row.closest('table');
        if (!table) return false;

        // 1. COSTRUZIONE MATRICE 2D DELLA TABELLA (Risolve Rowspan/Colspan)
        const grid = [];
        let maxCols = 0;
        let currGeo = null;

        for (let r = 0; r < table.rows.length; r++) {
            const tr = table.rows[r];
            if (!grid[r]) grid[r] = [];
            let x = 0;
            
            for (let c = 0; c < tr.cells.length; c++) {
                const td = tr.cells[c];
                // Salta le coordinate logiche già occupate da celle fuse (rowspan/colspan) in righe precedenti
                while (grid[r][x]) { x++; }
                
                const rs = parseInt(td.getAttribute('rowspan'), 10) || 1;
                const cs = parseInt(td.getAttribute('colspan'), 10) || 1;
                
                const geo = { cell: td, startX: x, startY: r, endX: x + cs - 1, endY: r + rs - 1 };
                
                if (td === cell) currGeo = geo;

                // Occupa fisicamente lo spazio logico nella matrice 2D
                for (let yy = 0; yy < rs; yy++) {
                    if (!grid[r + yy]) grid[r + yy] = [];
                    for (let xx = 0; xx < cs; xx++) {
                        grid[r + yy][x + xx] = geo;
                    }
                }
                x += cs;
            }
            if (x > maxCols) maxCols = x;
        }

        if (!currGeo) return false;
        const maxRows = grid.length;

        // 2. CONTROLLO MOVIMENTO: DIFFERENZIAZIONE TRA NAVIGAZIONE INTERNA E CAMBIO CELLA
        const origRange = sel.getRangeAt(0).cloneRange();
        const startContainer = origRange.startContainer;
        const startOffset = origRange.startOffset;

        let intent = null;

        if (e.key === 'ArrowDown') {
            // Proviamo a muovere il cursore avanti di una linea con il comando nativo del browser
            sel.modify("move", "forward", "line");
            const newRange = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
            let newNode = newRange ? newRange.startContainer : null;

            // Se il cursore è ancora nella stessa cella ed è avanzato su un nodo o offset differente
            const isStillInSameCell = newNode && cell.contains(newNode.nodeType === 3 ? newNode.parentNode : newNode);
            const hasMoved = newRange && (newNode !== startContainer || newRange.startOffset !== startOffset);

            if (isStillInSameCell && hasMoved) {
                e.preventDefault();
                return true;
            }

            sel.removeAllRanges();
            sel.addRange(origRange);
            intent = 'down';

        } else if (e.key === 'ArrowUp') {
            sel.modify("move", "backward", "line");
            const newRange = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
            let newNode = newRange ? newRange.startContainer : null;

            const isStillInSameCell = newNode && cell.contains(newNode.nodeType === 3 ? newNode.parentNode : newNode);
            const hasMoved = newRange && (newNode !== startContainer || newRange.startOffset !== startOffset);

            if (isStillInSameCell && hasMoved) {
                e.preventDefault();
                return true;
            }

            sel.removeAllRanges();
            sel.addRange(origRange);
            intent = 'up';

        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const textLen = cell.textContent.length;
            const caretPos = Editor._getAbsoluteCaretPosition(cell, true);
            const isEmpty = textLen === 0 || cell.innerText.replace(/[\n\r\u200B]/g, '').trim() === '';

            if (e.key === 'ArrowLeft' && (isEmpty || caretPos === 0)) {
                intent = 'left';
            } else if (e.key === 'ArrowRight' && (isEmpty || caretPos === textLen)) {
                intent = 'right';
            }
        }

        // Se il cursore si trova in mezzo al testo, lasciamo gestire lo spostamento orizzontale al browser nativo
        if (!intent) return false; 

        // Da qui in poi governiamo noi: blocco totale del salto casuale nativo alla cella destra
        e.preventDefault(); 

        // 3. IDENTIFICAZIONE COORDINATE BERSAGLIO
        let targetX = currGeo.startX;
        let targetY = currGeo.startY;

        if (intent === 'up') targetY = currGeo.startY - 1;
        if (intent === 'down') targetY = currGeo.endY + 1;
        if (intent === 'left') targetX = currGeo.startX - 1;
        if (intent === 'right') targetX = currGeo.endX + 1;

        // 4. ESECUZIONE SPOSTAMENTO SULLA MATRICE
        let targetCell = null;
        if (targetY >= 0 && targetY < maxRows && targetX >= 0 && targetX < maxCols) {
            if (grid[targetY] && grid[targetY][targetX]) {
                targetCell = grid[targetY][targetX].cell;
            }
        }

        if (targetCell) {
            const newRange = document.createRange();
            if (targetCell.innerText.replace(/[\n\r\u200B]/g, '').trim() === '') {
                // Cella vuota, posiziona cursore nudo all'inizio
                newRange.setStart(targetCell, 0);
                newRange.collapse(true);
            } else {
                newRange.selectNodeContents(targetCell);
                // Direzione cursore basata sull'approccio di arrivo: 
                // Se vengo da sopra/sinistra mi metto in testa, se vengo dal basso/destra mi metto in coda.
                if (intent === 'down' || intent === 'right') newRange.collapse(true); 
                else newRange.collapse(false); 
            }
            sel.removeAllRanges();
            sel.addRange(newRange);
            targetCell.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
            return true;
        } else {
            // Fuoriuscita pulita dalla tabella con inserimento di paragrafo se assente
            const wrapper = table.closest('.simple-table-wrapper, .adv-table-wrapper') || table;
            const isExitingUp = intent === 'up' || (intent === 'left' && targetX < 0);
            let pNode = isExitingUp ? wrapper.previousElementSibling : wrapper.nextElementSibling;
            
            if (!pNode || !['P', 'DIV', 'H1', 'H2', 'H3'].includes(pNode.tagName)) {
                pNode = document.createElement('p');
                pNode.innerHTML = '<br>';
                wrapper.parentNode.insertBefore(pNode, isExitingUp ? wrapper : wrapper.nextSibling);
            }

            const newRange = document.createRange();
            newRange.selectNodeContents(pNode);
            // Se usciamo verso il basso, il cursore va all'inizio del paragrafo, se verso l'alto va alla fine
            newRange.collapse(!isExitingUp);
            sel.removeAllRanges();
            sel.addRange(newRange);
            pNode.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            return true;
        }
    },

    /**
     * GESTORE TABULAZIONE
     * Trasforma il tasto TAB in una funzione contestuale (Indentazione per Liste, Spazi vuoti per il Codice).
     */
    handleTabKey: (e) => {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        let node = selection.anchorNode;
        if (node.nodeType === 3) node = node.parentNode;

        // Impedisce il Tab all'interno dei Diari o Tabelle Semplici per non sfalsarne il layout
        if (node.closest('td, th') || node.closest('.adv-journal-wrapper')) return;

        e.preventDefault();

        // 1. LOGICA SPECIALE PER BLOCCHI DI CODICE
        const preNode = node.closest('pre');
        if (preNode) {
            Editor.saveSnapshot();
            
            // Caso A (Selezione Singola senza Shift): Usa l'API nativa per velocità
            if (selection.isCollapsed && !e.shiftKey) {
                document.execCommand('insertText', false, '    ');
                if (typeof CodeManager !== 'undefined') {
                    const pos = Editor._getCodeOffset(preNode, selection.anchorNode, selection.anchorOffset);
                    CodeManager.highlightBlock(preNode, true);
                    Editor._setCodeOffset(preNode, pos, pos);
                }
                Store.triggerAutoSave();
                return;
            }
            
            // Caso B (Selezione Multi-Linea o Shift+Tab): Indent/outdent riga per riga
            const range = selection.getRangeAt(0);
            
            let startOffset = Editor._getCodeOffset(preNode, range.startContainer, range.startOffset);
            let endOffset = Editor._getCodeOffset(preNode, range.endContainer, range.endOffset);
            if (startOffset > endOffset) { const t = startOffset; startOffset = endOffset; endOffset = t; }

            // Usa un estrattore puro per allineare il testo alla griglia matematica del Caret Engine, ignorando i bug degli span nidificati.
            let text = '';
            const walker = document.createTreeWalker(preNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
            let wNode;
            while ((wNode = walker.nextNode())) {
                if (wNode.nodeType === 3) text += wNode.nodeValue;
                else if (wNode.nodeName === 'BR') text += '\n';
            }
            
            let lines = text.split('\n');
            let currentPos = 0;
            let startLineIdx = -1;
            let endLineIdx = -1;

            // Mappatura delle coordinate verticali e orizzontali (Linee e Colonne)
            for (let i = 0; i < lines.length; i++) {
                let lineLength = lines[i].length + 1; // +1 per \n
                if (startLineIdx === -1 && (currentPos + lineLength > startOffset || currentPos + lines[i].length >= startOffset)) startLineIdx = i;
                if (endLineIdx === -1 && (currentPos + lineLength > endOffset || currentPos + lines[i].length >= endOffset)) endLineIdx = i;
                currentPos += lineLength;
            }

            if (startLineIdx === -1) startLineIdx = lines.length - 1;
            if (endLineIdx === -1) endLineIdx = lines.length - 1;

            let charsAddedTotal = 0;
            let charsAddedBeforeStart = 0;

            for (let i = startLineIdx; i <= endLineIdx; i++) {
                if (e.shiftKey) {
                    const match = lines[i].match(/^[ \t]{1,4}/);
                    if (match) {
                        lines[i] = lines[i].substring(match[0].length);
                        charsAddedTotal -= match[0].length;
                        if (i === startLineIdx) charsAddedBeforeStart -= match[0].length;
                    }
                } else {
                    lines[i] = '    ' + lines[i];
                    charsAddedTotal += 4;
                    if (i === startLineIdx) charsAddedBeforeStart += 4;
                }
            }

            preNode.textContent = lines.join('\n');
            if (typeof CodeManager !== 'undefined') CodeManager.highlightBlock(preNode, true);

            let newStart = Math.max(0, startOffset + charsAddedBeforeStart);
            let newEnd = Math.max(0, endOffset + charsAddedTotal);
            
            Editor._setCodeOffset(preNode, newStart, newEnd);
            Store.triggerAutoSave();
            return;
        }

        // 2. LOGICA NORMALE PER LISTE E PARAGRAFI
        const range = selection.getRangeAt(0);
        const closestLi = node.closest('li');
        let blocks = [];
        
        if (!range.collapsed) blocks = Editor.getSelectedBlocks(range);

        // Se non è selezionato un intero blocco, cerchiamo di catturare l'elemento contestuale
        if (blocks.length === 0) {
            if (closestLi) blocks.push(closestLi);
            else {
                let currentBlock = node;
                while (currentBlock && !Editor.isBlockElement(currentBlock) && currentBlock.id !== 'noteContent') {
                    currentBlock = currentBlock.parentNode;
                }
                if (currentBlock && currentBlock.id !== 'noteContent') blocks.push(currentBlock);
            }
        }
        
        if (blocks.length > 0 && (e.shiftKey || !range.collapsed || closestLi)) {
            Editor.saveSnapshot();
            
            // Iniezione di nodi Ghost Marker per salvare la selezione durante la rigenerazione del DOM
            const startId = 'tab-start-' + Date.now();
            const endId = 'tab-end-' + Date.now();

            const startMarker = document.createElement('span');
            startMarker.id = startId; startMarker.style.display = 'none';
            const endMarker = document.createElement('span');
            endMarker.id = endId; endMarker.style.display = 'none';

            if (!range.collapsed) {
                const endRange = range.cloneRange();
                endRange.collapse(false);
                endRange.insertNode(endMarker);
            }
            
            const startRange = range.cloneRange();
            startRange.collapse(true);
            startRange.insertNode(startMarker);

            // Ordina i blocchi seguendo la gerarchia DOM dall'alto verso il basso
            blocks.sort((a,b) => (a === b) ? 0 : (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

            blocks.forEach(block => {
                if (block.tagName === 'LI') {
                    const ulNode = block.parentNode;
                    // Indentazione specifica per le Checklist avanzate o per l'elenco puntato nativo
                    if (ulNode && ulNode.classList.contains('adv-checklist')) {
                        if (e.shiftKey) Editor.outdentChecklistLine(block);
                        else Editor.indentChecklistLine(block);
                    } else {
                        if (e.shiftKey) {
                            Editor.outdentStandardListItem(block);
                        } else {
                            const selTmp = window.getSelection();
                            const rngTmp = document.createRange();
                            rngTmp.selectNodeContents(block);
                            selTmp.removeAllRanges();
                            selTmp.addRange(rngTmp);
                            document.execCommand('indent', false, null);
                        }
                    }
                } else {
                    // Indentazione per paragrafi standard (Aggiunge \u00A0 - Spazi Unificatori)
                    if (e.shiftKey) {
                        let textNode = block.firstChild;
                        while (textNode && textNode.nodeType !== 3) textNode = textNode.nextSibling;
                        if (textNode && textNode.nodeType === 3) {
                            textNode.nodeValue = textNode.nodeValue.replace(/^[\s\u00A0]{1,4}/, '');
                        }
                    } else {
                        let textNode = block.firstChild;
                        if (!textNode || textNode.nodeType !== 3) {
                            textNode = document.createTextNode('');
                            block.insertBefore(textNode, block.firstChild);
                        }
                        textNode.nodeValue = '\u00A0\u00A0\u00A0\u00A0' + textNode.nodeValue;
                    }
                }
            });

            // Recupera e distrugge i marker riposizionando il cursore
            const recoveredStart = document.getElementById(startId);
            const recoveredEnd = document.getElementById(endId);

            const newRange = document.createRange();
            if (recoveredStart) {
                newRange.setStartAfter(recoveredStart);
                if (!range.collapsed && recoveredEnd) newRange.setEndBefore(recoveredEnd);
                else newRange.collapse(true);
                
                selection.removeAllRanges();
                selection.addRange(newRange);
            }
            if (recoveredStart) recoveredStart.remove();
            if (recoveredEnd) recoveredEnd.remove();

        } else {
            // Fallback per paragrafi vuoti o testo libero: inserimento di 4 spazi
            document.execCommand('insertText', false, '\u00A0\u00A0\u00A0\u00A0');
        }
        Store.triggerAutoSave();
    },

    /**
     * GESTORE DI ESCAPE FORMATTAZIONE (Smart Exit)
     * Rileva quando il cursore si trova ai confini di un blocco editabile o all'estremità assoluta
     * di uno span di formattazione a fine paragrafo, permettendo di proseguire in testo normale.
     */
    handleFormatEscape: (e) => {
        if (!AppState.isEditMode) return;
        
        // 1. ESCAPE DA AREE EDITABILI (WIDGETS A BLOCCO - Esclude esplicitamente gli snippet e i link inline)
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            const sel = window.getSelection();
            if (!sel.isCollapsed || !sel.rangeCount) return;

            const range = sel.getRangeAt(0);
            let container = range.startContainer;
            let offset = range.startOffset;

            // Se il cursore si trova dentro un link normale (a, .file-link, .internal-link), non applicare l'escape a blocchi
            const parentEl = container.nodeType === Node.TEXT_NODE ? container.parentNode : container;
            if (parentEl && parentEl.closest('a')) {
                return;
            }

            if ((container.nodeType === Node.TEXT_NODE && offset === container.length) ||
                (container.nodeType !== Node.TEXT_NODE && offset === container.childNodes.length)) {
                
                let editableArea = container.nodeType === Node.TEXT_NODE ? container.parentNode.closest('.widget-editable-area') : container.closest('.widget-editable-area');
                
                if (editableArea && !editableArea.closest('.adv-inline-shell, .adv-copy-snippet')) {
                    const walker = document.createTreeWalker(editableArea, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
                    walker.currentNode = container.nodeType === Node.TEXT_NODE ? container : container.childNodes[offset-1] || container;
                    
                    let isAtVeryEnd = true;
                    let nextNode;
                    while ((nextNode = walker.nextNode())) {
                        if (nextNode.nodeType === Node.TEXT_NODE && nextNode.textContent.replace(/\u200B/g, '').trim() !== '') {
                            isAtVeryEnd = false;
                            break;
                        }
                    }

                    if (isAtVeryEnd) {
                        const widgetShell = editableArea.closest('.adv-widget-shell');
                        if (widgetShell && !widgetShell.classList.contains('adv-inline-shell')) {
                            e.preventDefault();
                            let targetP = widgetShell.nextElementSibling;
                            if (!targetP || (targetP.tagName !== 'P' && targetP.tagName !== 'DIV')) {
                                targetP = document.createElement('p');
                                targetP.innerHTML = '<br>';
                                widgetShell.parentNode.insertBefore(targetP, widgetShell.nextSibling);
                            }
                            const newRange = document.createRange();
                            newRange.setStart(targetP, 0);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            return;
                        }
                    }
                }
            }
        }

        // 2. ESCAPE DA ELEMENTI DI FORMATTAZIONE (Grassetto, Colori, ecc.) - Esclusivamente con Freccia Destra a fine blocco
        if (e.key === 'ArrowRight') {
            if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;

            const sel = window.getSelection();
            if (!sel.isCollapsed || !sel.rangeCount) return;

            const range = sel.getRangeAt(0);
            let container = range.startContainer;

            // Se il cursore si trova dentro un link normale (a, .file-link, .internal-link), la navigazione orizzontale è gestita altrove
            const parentEl = container.nodeType === Node.TEXT_NODE ? container.parentNode : container;
            if (parentEl && parentEl.closest('a')) {
                return;
            }

            // Esclude le shell inline dei widget (snippet, note inline, ecc.)
            if (parentEl && parentEl.closest('.adv-inline-shell')) {
                return;
            }

            // Esclude blocchi di codice
            if (parentEl && parentEl.closest('pre, .code-content')) {
                return;
            }

            const currentBlock = parentEl.closest('p, div, li, h1, h2, h3, h4, h5, h6, td, th') || document.getElementById('noteContent');
            if (!currentBlock) return;

            // Riconoscimento elementi di formattazione inline o classi di stile VanillaDesk
            const isFormatElement = (el) => {
                if (!el || el.nodeType !== Node.ELEMENT_NODE || el === currentBlock) return false;
                if (el.classList.contains('adv-inline-shell') || el.classList.contains('adv-widget-shell')) return false;

                const tag = el.tagName.toUpperCase();
                if (['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'CODE'].includes(tag)) return true;
                if (tag === 'SPAN' && (
                    el.className.includes('hl-') || 
                    el.className.includes('tx-') || 
                    el.className.includes('ff-') || 
                    el.className.includes('fs-')
                )) return true;
                return false;
            };

            // Identifica l'elemento di formattazione più esterno tra il nodo attivo e il blocco contenitore
            let curr = parentEl;
            let outermostFormatEl = null;
            while (curr && curr !== currentBlock && curr.id !== 'noteContent') {
                if (isFormatElement(curr)) {
                    outermostFormatEl = curr;
                }
                curr = curr.parentNode;
            }

            // Se non ci troviamo all'interno di alcun elemento formattato, non è richiesto alcun escape
            if (!outermostFormatEl) return;

            // Fast-path: se il cursore non si trova alla fine del nodo di testo corrente, ci sono ancora caratteri
            if (container.nodeType === Node.TEXT_NODE && range.endOffset < container.nodeValue.length) {
                return;
            }

            // Verifica se tra la posizione corrente del cursore e la fine del blocco contenitore è presente altro testo o media
            try {
                const postRangeInBlock = document.createRange();
                postRangeInBlock.setStart(range.endContainer, range.endOffset);
                postRangeInBlock.setEnd(currentBlock, currentBlock.childNodes.length);

                const remainingText = postRangeInBlock.toString().replace(/[\u200B\uFEFF\n\r]/g, '');
                const hasMediaAfter = !!postRangeInBlock.cloneContents().querySelector('img, iframe, audio, svg, .adv-widget-shell, .adv-inline-shell, .adv-copy-snippet, .inline-note-wrapper');

                // Se nel blocco dopo il cursore è presente altro testo o media, la navigazione deve essere nativa senza salti
                if (remainingText.length > 0 || hasMediaAfter) {
                    return;
                }
            } catch (_) {
                return;
            }

            // Siamo alla fine assoluta del blocco e dell'elemento formattato: esegue l'escape verso il testo normale
            e.preventDefault();
            const newRange = document.createRange();
            newRange.setStartAfter(outermostFormatEl);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);

            if (document.queryCommandState('bold')) {
                try { document.execCommand('bold', false, null); } catch(err) {}
            }
            if (document.queryCommandState('italic')) {
                try { document.execCommand('italic', false, null); } catch(err) {}
            }
            if (document.queryCommandState('underline')) {
                try { document.execCommand('underline', false, null); } catch(err) {}
            }
            if (document.queryCommandState('strikeThrough')) {
                try { document.execCommand('strikeThrough', false, null); } catch(err) {}
            }

            Editor.updateToolbarFormatting();
        }
    }
});