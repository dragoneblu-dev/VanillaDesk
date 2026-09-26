/**
 * editor-keyboard-navigation.js
 * Sottomodulo di Editor.
 * Responsabilità: Navigazione complessa del cursore tramite tastiera (Tabulazioni in elenchi e blocchi codice, 
 * Escape intelligente dalla formattazione, Indentazione e Spostamenti geometrici nelle tabelle).
 */

Object.assign(Editor, {

    /**
     * SNIPPET VERTICAL ESCAPE (Raycast Engine)
     * Previene il bug del browser nativo che fa rimbalzare il cursore in un loop infinito 
     * dentro/fuori lo snippet copiabile quando si preme ArrowUp o ArrowDown.
     */
    _handleSnippetVerticalEscape: (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false;
        if (e.shiftKey) return false; 

        const sel = window.getSelection();
        if (!sel.rangeCount) return false;

        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        let parent = node.nodeType === 3 ? node.parentNode : node;

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
        // Spostamento Y: Facciamo un balzo di 20 pixel (circa un'interlinea) sopra o sotto
        const currentY = e.key === 'ArrowDown' ? caretRect.bottom + 20 : caretRect.top - 20;

        // 2. RAYCASTING: Chiediamo al browser cosa c'è a quelle specifiche coordinate
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
            // Fix: targetNode potrebbe essere un nodo di testo, che non ha .closest()
            const checkNode = targetNode.nodeType === 3 ? targetNode.parentNode : targetNode;
            
            if (!checkNode.closest('.adv-widget-shell:not(.adv-inline-shell)')) {
                // Perfetto! Abbiamo trovato l'allineamento. Spostiamo il cursore.
                const newRange = document.createRange();
                newRange.setStart(targetNode, targetOffset);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
                return true;
            }
        }

        // 4. FALLBACK DI SICUREZZA
        // Se il raycast fallisce (es. la riga sotto è troppo corta o siamo a fine blocco),
        // usiamo la logica dei blocchi per non restare mai bloccati.
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
     * GESTORE DI NAVIGAZIONE TABELLE (Matrice 2D)
     * Ignora le regole logiche del browser per imporre spostamenti fisici su griglia (X,Y)
     * e supporta le micro-navigazioni all'interno della singola cella.
     */
    handleTableNavigation: (e) => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return false;
        
        // Prima di controllare le tabelle, diamo priorità allo scudo anti-rimbalzo per gli snippet
        if (Editor._handleSnippetVerticalEscape(e)) return true;

        if (e.shiftKey) return false; // Non interferire con la selezione multipla nativa (Shift+Arrow)

        const sel = window.getSelection();
        if (!sel.rangeCount) return false;

        let node = sel.anchorNode;
        if (node.nodeType === 3) node = node.parentNode;

        const cell = node.closest('td, th');
        if (!cell) return false;

        const row = cell.parentElement;
        const table = row.closest('table');
        if (!table) return false;

        // 1. COSTRUZIONE MATRICE 2D DELLA TABELLA (Risolve il problema dei Rowspan/Colspan)
        // Creiamo una rappresentazione virtuale della tabella dove ogni cella "fusa" occupa più posti.
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
                
                const rs = parseInt(td.getAttribute('rowspan')) || 1;
                const cs = parseInt(td.getAttribute('colspan')) || 1;
                
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

        // 2. CALCOLO TOLLERANZA BORDI (Micro-Navigazione Testuale)
        // Determina se il cursore è arrivato fisicamente sul bordo della cella. Se non lo è, 
        // lascia che l'utente si sposti normalmente tra le parole senza uscire.
        const range = sel.getRangeAt(0);
        let caretRect = range.getBoundingClientRect();

        // Fix per poter calcolare la posizione geometrica in celle vuote (contenenti solo <br>)
        if (caretRect.width === 0 && caretRect.height === 0) {
            const span = document.createElement('span');
            span.appendChild(document.createTextNode('\u200B'));
            range.insertNode(span);
            caretRect = span.getBoundingClientRect();
            span.remove();
        }

        const cellRect = cell.getBoundingClientRect();
        const style = window.getComputedStyle(cell);
        const pt = parseFloat(style.paddingTop) || 0;
        const pb = parseFloat(style.paddingBottom) || 0;
        const lh = parseFloat(style.lineHeight) || 20;

        const textLen = cell.textContent.length;
        const caretPos = Editor._getAbsoluteCaretPosition(cell, true);
        const isEmpty = textLen === 0 || cell.innerText.replace(/[\n\r\u200B]/g, '').trim() === '';

        // Rilevamento confini estremi (Tolleranza 80% dell'altezza linea per evitare falsi positivi)
        let isAtTop = isEmpty || (caretRect.top - cellRect.top - pt) <= (lh * 0.8);
        let isAtBottom = isEmpty || (cellRect.bottom - pb - caretRect.bottom) <= (lh * 0.8);
        let isAtLeft = isEmpty || caretPos === 0;
        let isAtRight = isEmpty || caretPos === textLen;

        // 3. IDENTIFICAZIONE INTENZIONE E COORDINATE BERSAGLIO
        let targetX = currGeo.startX;
        let targetY = currGeo.startY;
        let intent = null;

        if (e.key === 'ArrowUp' && isAtTop) intent = 'up';
        if (e.key === 'ArrowDown' && isAtBottom) intent = 'down';
        if (e.key === 'ArrowLeft' && isAtLeft) intent = 'left';
        if (e.key === 'ArrowRight' && isAtRight) intent = 'right';

        // Se il cursore si trova in mezzo al testo, lasciamo gestire lo spostamento al browser nativo
        if (!intent) return false; 

        e.preventDefault(); // Da qui in poi governiamo noi: blocco totale del salto casuale nativo

        if (intent === 'up') targetY = currGeo.startY - 1;
        if (intent === 'down') targetY = currGeo.endY + 1; // Salta in fondo all'ingombro dell'eventuale rowspan
        if (intent === 'left') targetX = currGeo.startX - 1;
        if (intent === 'right') targetX = currGeo.endX + 1; // Salta in fondo all'ingombro dell'eventuale colspan

        // Logica "A Capo" (Wrap-around): Se premo destra a fine riga, vado a capo alla riga successiva a sinistra.
        if (targetX < 0 && intent === 'left') {
            targetY = currGeo.startY - 1;
            targetX = maxCols - 1;
        }
        if (targetX >= maxCols && intent === 'right') {
            targetY = currGeo.endY + 1;
            targetX = 0;
        }

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
            // FUORIUSCITA: Genera un paragrafo vuoto fuori dalla tabella se l'utente tenta di uscirne e non ci sono altri blocchi.
            const wrapper = table.closest('.simple-table-wrapper, .adv-table-wrapper') || table;
            let pNode = (intent === 'up' || (intent === 'left' && targetY < 0)) ? wrapper.previousElementSibling : wrapper.nextElementSibling;
            
            if (!pNode || !['P', 'DIV', 'H1', 'H2', 'H3'].includes(pNode.tagName)) {
                pNode = document.createElement('p');
                pNode.innerHTML = '<br>';
                wrapper.parentNode.insertBefore(pNode, (intent === 'up' || (intent === 'left' && targetY < 0)) ? wrapper : wrapper.nextSibling);
            }

            const newRange = document.createRange();
            newRange.selectNodeContents(pNode);
            // Se usciamo verso il basso, il cursore va all'inizio del paragrafo, se verso l'alto va alla fine
            newRange.collapse(intent === 'down' || intent === 'right');
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
            
            // Caso A (Selezione Singola senza Shift): Usa l'API nativa per velocità ed eludere parsing complessi
            if (selection.isCollapsed && !e.shiftKey) {
                document.execCommand('insertText', false, '    ');
                if (typeof CodeManager !== 'undefined') {
                    // Calcolo esatto post-inserimento prima di richiamare l'Highlighter
                    const pos = Editor._getCodeOffset(preNode, selection.anchorNode, selection.anchorOffset);
                    CodeManager.highlightBlock(preNode, true);
                    Editor._setCodeOffset(preNode, pos, pos);
                }
                Store.triggerAutoSave();
                return;
            }
            
            // Caso B (Selezione Multi-Linea o Shift+Tab): Applica logica di indentazione/outdentazione stringa
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
                let lineLength = lines[i].length + 1; // +1 per il \n
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
                    // Outdent (Rimuove fino a 4 spazi iniziali)
                    const match = lines[i].match(/^[ \t]{1,4}/);
                    if (match) {
                        lines[i] = lines[i].substring(match[0].length);
                        charsAddedTotal -= match[0].length;
                        if (i === startLineIdx) charsAddedBeforeStart -= match[0].length;
                    }
                } else {
                    // Indent (Aggiunge 4 spazi)
                    lines[i] = '    ' + lines[i];
                    charsAddedTotal += 4;
                    if (i === startLineIdx) charsAddedBeforeStart += 4;
                }
            }

            preNode.textContent = lines.join('\n');
            if (typeof CodeManager !== 'undefined') CodeManager.highlightBlock(preNode, true);

            // Ricalcolo del offset finale
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
            // Fallback per paragrafi vuoti o testo libero: inserimento brutale di 4 spazi
            document.execCommand('insertText', false, '\u00A0\u00A0\u00A0\u00A0');
        }
        Store.triggerAutoSave();
    },

    /**
     * GESTORE DI ESCAPE FORMATTAZIONE (Smart Exit)
     * Rileva quando il cursore si sta incastrando ai confini di uno span (grassetto, link, ecc.)
     * o di una cella editabile e lo forza ad uscire.
     */
    handleFormatEscape: (e) => {
        if (!AppState.isEditMode) return;
        
        // 1. ESCAPE DA AREE EDITABILI (WIDGETS)
        // Se l'utente usa frecce direzionali in una zona confinata, tentiamo di farlo evadere verso il basso.
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            const sel = window.getSelection();
            if (!sel.isCollapsed || !sel.rangeCount) return;

            const range = sel.getRangeAt(0);
            let container = range.startContainer;
            let offset = range.startOffset;

            // Se il cursore si trova alla fine estrema del nodo testuale
            if ((container.nodeType === Node.TEXT_NODE && offset === container.length) ||
                (container.nodeType !== Node.TEXT_NODE && offset === container.childNodes.length)) {
                
                let editableArea = container.nodeType === Node.TEXT_NODE ? container.parentNode.closest('.widget-editable-area') : container.closest('.widget-editable-area');
                
                if (editableArea) {
                    // Controlla se non c'è più testo *dopo* il cursore all'interno di questa specifica area
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
                        // Creiamo e iniettiamo un nuovo paragrafo per evitare blocchi strutturali
                        if (widgetShell) {
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

        // 2. ESCAPE DA SPAN DI FORMATTAZIONE (Grassetto, Colori, ecc.)
        if (e.key === ' ' || e.key === 'ArrowRight') {
            const sel = window.getSelection();
            if (!sel.isCollapsed || !sel.rangeCount) return;

            const range = sel.getRangeAt(0);
            let container = range.startContainer;
            let offset = range.startOffset;

            if (container.nodeType === Node.TEXT_NODE) {
                if (offset < container.length) return; // Non siamo alla fine della parola
                container = container.parentNode;
            } else if (container.childNodes.length > 0 && offset < container.childNodes.length) {
                return; 
            }

            const formatTags = ['B', 'I', 'U', 'S', 'A'];
            const isFormatSpan = container.tagName === 'SPAN' && (
                container.className.includes('hl-') || 
                container.className.includes('tx-') || 
                container.className.includes('ff-') || 
                container.className.includes('fs-')
            );

            // Disabilita lo stile e fa uscire il cursore dallo span
            if (formatTags.includes(container.tagName) || isFormatSpan) {
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    const newRange = document.createRange();
                    newRange.setStartAfter(container);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    // Rimuove i comandi nativi se persistono
                    document.execCommand('bold', false, false);
                    document.execCommand('italic', false, false);
                    document.execCommand('underline', false, false);
                    Editor.updateToolbarFormatting();
                } else if (e.key === ' ') {
                    e.preventDefault();
                    const newRange = document.createRange();
                    newRange.setStartAfter(container);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    document.execCommand('removeFormat', false, null);
                    document.execCommand('insertText', false, ' ');
                    Editor.updateToolbarFormatting();
                }
            }
        }
    }
});