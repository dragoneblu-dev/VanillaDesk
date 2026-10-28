/**
 * editor-caret.js
 * Modulo geometrico per la gestione assoluta del cursore (Caret), Range e Selection.
 * Sottomodulo di Editor.
 * Include:
 * - Salvataggio e ripristino sicuro del range (saveSelection, restoreSelection).
 * - Calcolo matematico delle posizioni assolute del cursore (_getAbsoluteCaretPosition, _setAbsoluteCaretPosition).
 * - Motore di coordinate lineare per codice e testo con tag BR (_getCodeOffset, _setCodeOffset, _getRawText).
 * - Espulsione dalla zona morta del cuscinetto \u200B (adjustCaretAwayFromZwsDeadZone).
 * - Posizionamento O(1) post-widget inline (setCaretAfterInlineElement).
 */

Object.assign(Editor, {
    savedRange: null,

    // Helper per estrarre il testo esattamente come lo legge il motore delle coordinate (_getCodeOffset),
    // bypassando i problemi del getter nativo 'innerText' dei browser sui tag <br> annidati negli span.
    _getRawText: (node) => {
        let text = '';
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
        let curr;
        while ((curr = walker.nextNode())) {
            if (curr.nodeType === 3) text += curr.nodeValue;
            else if (curr.nodeName === 'BR') text += '\n';
        }
        return text;
    },

    // Corregge la posizione del cursore se è intrappolato nella zona morta tra la shell inline e il suo cuscinetto \u200B
    adjustCaretAwayFromZwsDeadZone: () => {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount || !sel.isCollapsed) return;

        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (!node || node.nodeType !== Node.TEXT_NODE) return;

        const val = node.nodeValue || '';
        const offset = range.startOffset;

        // Caso A: il nodo si trova DOPO una .adv-inline-shell e inizia con \u200B
        const prev = node.previousSibling;
        if (prev && prev.nodeType === 1 && prev.classList.contains('adv-inline-shell')) {
            if (val.startsWith('\u200B') && offset === 0) {
                // Sposta il cursore a offset 1 (dopo il \u200B)
                const safeOffset = Math.min(1, val.length);
                const r = document.createRange();
                r.setStart(node, safeOffset);
                r.collapse(true);
                sel.removeAllRanges();
                sel.addRange(r);
                return;
            }
        }

        // Caso B: il nodo si trova PRIMA di una .adv-inline-shell e finisce con \u200B
        const next = node.nextSibling;
        if (next && next.nodeType === 1 && next.classList.contains('adv-inline-shell')) {
            if (val.endsWith('\u200B') && offset === val.length) {
                // Sposta il cursore a offset val.length - 1 (prima del \u200B)
                const safeOffset = Math.max(0, val.length - 1);
                const r = document.createRange();
                r.setStart(node, safeOffset);
                r.collapse(true);
                sel.removeAllRanges();
                sel.addRange(r);
                return;
            }
        }
    },

    // Posiziona in modo snello e O(1) il cursore subito dopo un elemento inline o segnalibro
    setCaretAfterInlineElement: (element) => {
        if (!element || !document.body.contains(element)) return;

        const editorEl = document.getElementById('noteContent');
        if (!editorEl) return;

        // Gestione puramente locale del cuscinetto: assicura che il nodo adiacente esista e inizi con ZWS
        let next = element.nextSibling;
        if (!next || next.nodeType !== Node.TEXT_NODE) {
            const zws = document.createTextNode('\u200B');
            element.parentNode.insertBefore(zws, element.nextSibling);
            next = zws;
        } else if (!next.nodeValue.startsWith('\u200B')) {
            next.nodeValue = '\u200B' + next.nodeValue;
        }

        editorEl.focus();

        const sel = window.getSelection();
        const range = document.createRange();
        // Offset 1 atterra esattamente dopo lo \u200B nel flusso del testo editabile
        range.setStart(next, 1);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);

        // Aggiorna lo snapshot della selezione per proteggere i successivi comandi della toolbar
        Editor.savedRange = range.cloneRange();

        if (element.scrollIntoView) {
            element.scrollIntoView({ behavior: 'auto', block: 'nearest' });
        }
    },

    saveSelection: () => {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) Editor.savedRange = sel.getRangeAt(0);
    },

    restoreSelection: () => {
        if (Editor.savedRange) {
            let node = Editor.savedRange.commonAncestorContainer;
            if (node.nodeType === 3) node = node.parentNode;
            const editableElement = node.closest('[contenteditable="true"]') || document.getElementById('noteContent');
            
            // Focus impostato prima di addRange per evitare reset a offset 0
            if (editableElement) editableElement.focus({ preventScroll: true });

            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(Editor.savedRange);
        } else {
            document.getElementById('noteContent')?.focus({ preventScroll: true });
        }
    },

    _getAbsoluteCaretPosition: (el, isStart) => {
        const sel = window.getSelection();
        if (!sel.rangeCount) return 0;
        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(el);
        preCaretRange.setEnd(isStart ? range.startContainer : range.endContainer, isStart ? range.startOffset : range.endOffset);
        return preCaretRange.toString().length;
    },

    _setAbsoluteCaretPosition: (el, start, end) => {
        let startNode = null, endNode = null;
        let startChar = 0, endChar = 0, charCount = 0;

        const traverseNodes = (node) => {
            if (node.nodeType === 3) {
                let nextCharCount = charCount + node.length;
                if (!startNode && start >= charCount && start <= nextCharCount) {
                    startNode = node; startChar = start - charCount;
                }
                if (!endNode && end >= charCount && end <= nextCharCount) {
                    endNode = node; endChar = end - charCount;
                }
                charCount = nextCharCount;
            } else {
                for (let i = 0; i < node.childNodes.length; i++) {
                    traverseNodes(node.childNodes[i]);
                    if (startNode && endNode) return;
                }
            }
        };

        traverseNodes(el);

        if (startNode && endNode) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.setStart(startNode, startChar);
            range.setEnd(endNode, endChar);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    },

    _getCodeOffset: (preNode, targetContainer, targetOffset) => {
        try {
            // Seleziona tutto dall'inizio del blocco PRE fino al cursore esatto
            const range = document.createRange();
            range.setStart(preNode, 0);
            range.setEnd(targetContainer, targetOffset);
            
            // Estrae una copia del DOM contenente solo la parte prima del cursore
            const frag = range.cloneContents();
            let pos = 0;
            
            // Conta in modo matematico tutti i caratteri e le andate a capo presenti
            const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
            let node;
            while ((node = walker.nextNode())) {
                if (node.nodeType === 3) pos += node.nodeValue.length;
                else if (node.nodeName === 'BR') pos += 1;
            }
            return pos;
        } catch (e) {
            return 0;
        }
    },

    _setCodeOffset: (preNode, startOffset, endOffset) => {
        let startNode = null, endNode = null;
        let startChar = 0, endChar = 0, currentPos = 0;
        let lastNode = null;

        const walker = document.createTreeWalker(preNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
        let node;

        while ((node = walker.nextNode())) {
            if (node.nodeType !== 3 && node.nodeName !== 'BR') continue;

            let nodeLen = node.nodeType === 3 ? node.nodeValue.length : 1;

            if (!startNode && currentPos + nodeLen >= startOffset) {
                startNode = node;
                startChar = startOffset - currentPos;
            }
            if (!endNode && currentPos + nodeLen >= endOffset) {
                endNode = node;
                endChar = endOffset - currentPos;
            }

            lastNode = node;
            currentPos += nodeLen;

            if (startNode && endNode) break;
        }

        if (!startNode && lastNode) { 
            startNode = lastNode; 
            startChar = lastNode.nodeType === 3 ? lastNode.nodeValue.length : 1; 
        }
        if (!endNode && lastNode) { 
            endNode = lastNode; 
            endChar = lastNode.nodeType === 3 ? lastNode.nodeValue.length : 1; 
        }

        if (!startNode) {
            startNode = preNode; startChar = 0;
            endNode = preNode; endChar = 0;
        }

        try {
            const sel = window.getSelection();
            const range = document.createRange();

            const applyEdge = (isStart, tgtNode, tgtChar) => {
                if (tgtNode.nodeType === 3) {
                    if (isStart) range.setStart(tgtNode, tgtChar);
                    else range.setEnd(tgtNode, tgtChar);
                } else if (tgtNode.nodeName === 'BR') {
                    const parent = tgtNode.parentNode;
                    const childIndex = Array.from(parent.childNodes).indexOf(tgtNode);
                    const finalIndex = tgtChar === 0 ? childIndex : childIndex + 1;
                    
                    if (isStart) range.setStart(parent, finalIndex);
                    else range.setEnd(parent, finalIndex);
                } else {
                    const finalIndex = Math.min(tgtChar, tgtNode.childNodes.length);
                    if (isStart) range.setStart(tgtNode, finalIndex);
                    else range.setEnd(tgtNode, finalIndex);
                }
            };

            applyEdge(true, startNode, startChar);
            applyEdge(false, endNode, endChar);

            sel.removeAllRanges();
            sel.addRange(range);
        } catch (e) {
            console.error("[Caret Engine Error] Impossibile posizionare il cursore nel codice: ", e);
        }
    }
});