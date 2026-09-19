/**
 * editor-keyboard.js
 * Sottomodulo di Editor.
 * Responsabilità: Intercettazione della digitazione pura (Auto-Close Brackets), 
 * Motore per le Scorciatoie Markdown (Markdown Shortcuts Engine) e Helper per i range.
 * FIX: Previene l'inserimento accidentale di Segnalibri nei Blocchi Codice.
 * FIX CARET/TAB: Implementato _getRawText per calcolare perfettamente offset e indentazioni 
 * all'interno degli span generati dal syntax highlighter, risolvendo i salti cursore.
 * FEAT SMART HOME: Aggiunto gestore handleHomeKey per i blocchi di codice.
 * FEAT LINK RAPIDI: Intercettazione della digitazione "[[" per evocare in modo nativo LinkManager.openInternalModal().
 * FIX LINK RAPIDI INDEXSIZEERROR: Risolto crash setStart(4294967295) collassando direttamente cleanRange
 * dopo deleteContents(), garantendo il corretto ancoraggio e l'apertura immediata del Drawer.
 */

Object.assign(Editor, {

    // Helper per estrarre il testo esattamente come lo legge il motore delle coordinate (_getCodeOffset),
    // bypassando i bug del getter nativo 'innerText' dei browser sui tag <br> annidati negli span.
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

    // MOTORE SMART HOME: Alterna il cursore tra inizio riga e primo carattere valido
    handleHomeKey: (e) => {
        // Disabilitato se c'è Shift per preservare la selezione multipla nativa
        if (e.shiftKey) return false;

        const sel = window.getSelection();
        if (!sel.rangeCount) return false;

        let node = sel.anchorNode;
        if (node.nodeType === 3) node = node.parentNode;

        // Esegue lo Smart Home ESCLUSIVAMENTE nei blocchi di codice, 
        // lasciando intatta la navigazione visiva del browser per il testo normale
        const preNode = node.closest('pre.code-content');
        if (preNode) {
            e.preventDefault();
            const currentPos = Editor._getCodeOffset(preNode, sel.anchorNode, sel.anchorOffset);
            
            // Estrazione del testo puro per calcolare la griglia
            let text = '';
            const walker = document.createTreeWalker(preNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
            let wNode;
            while ((wNode = walker.nextNode())) {
                if (wNode.nodeType === 3) text += wNode.nodeValue;
                else if (wNode.nodeName === 'BR') text += '\n';
            }

            // Identificazione dei limiti matematici della riga corrente
            const lineStart = text.lastIndexOf('\n', currentPos - 1) + 1;
            let nextNewline = text.indexOf('\n', currentPos);
            const lineEnd = nextNewline !== -1 ? nextNewline : text.length;
            
            const lineText = text.substring(lineStart, lineEnd);
            
            // Cerca il primo carattere che NON sia spazio, tab o spazio unificatore
            const firstNonSpaceMatch = lineText.match(/[^\s\u00A0\u200B]/);
            const firstNonSpaceIdx = firstNonSpaceMatch ? firstNonSpaceMatch.index : -1;
            
            let targetPos;
            
            if (firstNonSpaceIdx === -1) {
                // Riga vuota o solo spazi: vai a colonna 0
                targetPos = lineStart;
            } else {
                const textStartPos = lineStart + firstNonSpaceIdx;
                
                // IL TOGGLE: Se sono sull'inizio del testo, salto alla colonna 0. 
                // Altrimenti salto all'inizio del testo.
                if (currentPos === textStartPos) {
                    targetPos = lineStart;
                } else {
                    targetPos = textStartPos;
                }
            }

            Editor._setCodeOffset(preNode, targetPos, targetPos);
            return true;
        }
        
        return false;
    },

    handleBracketAutoClose: (e) => {
        const openPairs = { '(': ')', '{': '}', '"': '"', "'": "'" };
        const closeChars = [')', '}', '"', "'"];
        const quoteChars = ['"', "'"];

        // ==============================================================
        // INNESCO MAGICO COLLEGAMENTI (OBSIDIAN STYLE)
        // Se premo la QUADRA APERTA '[', controllo se la lettera precedente era anch'essa una '['.
        // ==============================================================
        if (e.key === '[') {
            const sel = window.getSelection();
            if (sel.rangeCount && sel.isCollapsed) {
                const range = sel.getRangeAt(0);
                const node = range.startContainer;
                
                // Mai innescare l'UI se siamo nel codice (es. array JavaScript)
                if (!node.parentNode.closest('.code-content')) {
                    if (node.nodeType === 3 && range.startOffset > 0) {
                        const charBefore = node.textContent.charAt(range.startOffset - 1);
                        if (charBefore === '[') {
                            e.preventDefault();
                            
                            const startOffset = range.startOffset - 1;
                            let endOffset = range.startOffset;
                            
                            // Se la prima '[' aveva inserito una ']' automatica, la includiamo nella cancellazione
                            if (node.textContent.charAt(range.startOffset) === ']') {
                                endOffset += 1;
                            }
                            
                            const cleanRange = document.createRange();
                            cleanRange.setStart(node, startOffset);
                            cleanRange.setEnd(node, endOffset);
                            cleanRange.deleteContents();
                            cleanRange.collapse(true);

                            // Se il nodo di testo è rimasto vuoto ed è l'unico figlio del blocco, proteggiamo il layout con <br>
                            if (node.nodeType === Node.TEXT_NODE && node.nodeValue === '') {
                                const parent = node.parentNode;
                                if (parent && parent.childNodes.length === 1 && parent.id !== 'noteContent' && ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(parent.tagName)) {
                                    parent.innerHTML = '<br>';
                                    cleanRange.setStart(parent, 0);
                                    cleanRange.collapse(true);
                                }
                            }

                            sel.removeAllRanges();
                            sel.addRange(cleanRange);
                            
                            // Salva la selezione corretta e apre il Drawer per il Link Interno
                            Editor.saveSelection();
                            if (typeof UI !== 'undefined') UI.closeDrawer();
                            if (typeof LinkManager !== 'undefined') {
                                LinkManager.isEditingMode = false;
                                LinkManager.editingLink = null;
                                LinkManager.openInternalModal();
                            }
                            return;
                        }
                    }
                }
            }
            // Auto-Close per le quadre singole
            const range = sel.getRangeAt(0);
            let targetNode = range.commonAncestorContainer;
            if (targetNode.nodeType === 3) targetNode = targetNode.parentNode;
            
            if (!WidgetManager.isProtectedBlock(targetNode) || WidgetManager.isInsideEditableWidgetArea(targetNode)) {
                const block = targetNode.closest('p, div, pre, li, h1, h2, h3, td, th') || document.getElementById('noteContent');
                if (block) {
                    e.preventDefault();
                    Editor.saveSnapshot();
                    const currentAbs = Editor._getAbsoluteCaretPosition(block, true);
                    document.execCommand('insertText', false, '[]');
                    Editor._setAbsoluteCaretPosition(block, currentAbs + 1, currentAbs + 1);
                }
            }
            return;
        }
        if (e.key === ']') {
            const sel = window.getSelection();
            if (sel.rangeCount && sel.isCollapsed) {
                const range = sel.getRangeAt(0);
                let targetNode = range.commonAncestorContainer;
                if (targetNode.nodeType === 3) targetNode = targetNode.parentNode;
                
                const block = targetNode.closest('p, div, pre, li, h1, h2, h3, td, th') || document.getElementById('noteContent');
                if (block) {
                    const postRange = range.cloneRange();
                    postRange.selectNodeContents(block);
                    postRange.setStart(range.endContainer, range.endOffset);
                    const charAfter = postRange.toString().replace(/\u200B/g, '').charAt(0);
                    
                    if (charAfter === ']') {
                        e.preventDefault();
                        const currentAbs = Editor._getAbsoluteCaretPosition(block, true);
                        Editor._setAbsoluteCaretPosition(block, currentAbs + 1, currentAbs + 1);
                        return;
                    }
                }
            }
            return;
        }
        
        if (!openPairs[e.key] && !closeChars.includes(e.key) && !quoteChars.includes(e.key)) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        let node = range.commonAncestorContainer;
        if (node.nodeType === 3) node = node.parentNode;

        if (WidgetManager.isProtectedBlock(node) && !WidgetManager.isInsideEditableWidgetArea(node)) return;

        const block = node.closest('p, div, pre, li, h1, h2, h3, td, th') || document.getElementById('noteContent');
        if (!block) return;

        const preRange = range.cloneRange();
        preRange.selectNodeContents(block);
        preRange.setEnd(range.startContainer, range.startOffset);
        const textBefore = preRange.toString().replace(/\u200B/g, '');
        const charBefore = textBefore.slice(-1);

        const postRange = range.cloneRange();
        postRange.selectNodeContents(block);
        postRange.setStart(range.endContainer, range.endOffset);
        const textAfter = postRange.toString().replace(/\u200B/g, '');
        const charAfter = textAfter.charAt(0);

        if (closeChars.includes(e.key) || quoteChars.includes(e.key)) {
            if (charAfter === e.key) {
                e.preventDefault();
                const currentAbs = Editor._getAbsoluteCaretPosition(block, true);
                Editor._setAbsoluteCaretPosition(block, currentAbs + 1, currentAbs + 1);
                return;
            }
        }

        if (!range.collapsed && openPairs[e.key]) {
            e.preventDefault();
            Editor.saveSnapshot();
            
            const openChar = e.key;
            const closeChar = openPairs[e.key];
            const textContent = range.toString();
            
            const startAbs = Editor._getAbsoluteCaretPosition(block, true);
            document.execCommand('insertText', false, openChar + textContent + closeChar);
            
            const newStart = startAbs + 1;
            const newEnd = newStart + textContent.length;
            Editor._setAbsoluteCaretPosition(block, newStart, newEnd);
            return;
        }

        if (range.collapsed && openPairs[e.key]) {
            const isAlphanumericAfter = /[a-zA-Z0-9À-ÿ_]/.test(charAfter);
            if (isAlphanumericAfter) return; 

            if (quoteChars.includes(e.key)) {
                const isAlphanumericBefore = /[a-zA-Z0-9À-ÿ_]/.test(charBefore);
                if (isAlphanumericBefore) return; 
            }

            e.preventDefault();
            Editor.saveSnapshot();
            
            const closeChar = openPairs[e.key];
            const currentAbs = Editor._getAbsoluteCaretPosition(block, true);
            
            document.execCommand('insertText', false, e.key + closeChar);
            Editor._setAbsoluteCaretPosition(block, currentAbs + 1, currentAbs + 1);
            return;
        }
    },

    handleMarkdownShortcuts: () => {
        if (!AppState.isEditMode) return;
        
        // --- COLLEGAMENTO AL MENU INLINE (Cerca il testo digitato dopo le `[[`) ---
        if (typeof UI !== 'undefined' && UI.DocumentBrowser && UI.DocumentBrowser._inlineModeActive) {
            UI.DocumentBrowser.handleInlineTyping();
            // Non intercettiamo Markdown se sto cercando una nota
            return; 
        }

        const sel = window.getSelection();
        if (!sel.rangeCount || !sel.isCollapsed) return;

        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        if (node.nodeType === 3) node = node.parentNode;
        
        const block = node.closest('p, div, h1, h2, h3, li');
        if (!block || block.id === 'noteContent') return;
        
        if (WidgetManager.isProtectedBlock(block)) return;

        const isListElement = block.tagName === 'LI';
        const textRaw = block.innerText.replace(/[\u200B\n\r]/g, '').replace(/\u00A0/g, ' ');

        const rules = [
            {
                trigger: /^---$/,
                allowInList: false,
                execute: () => {
                    Editor.saveSnapshot();
                    const hr = document.createElement('hr');
                    const p = document.createElement('p');
                    p.innerHTML = '<br>';
                    
                    block.parentNode.insertBefore(hr, block);
                    block.parentNode.replaceChild(p, block);
                    
                    const newRange = document.createRange();
                    newRange.setStart(p, 0);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
            },
            {
                trigger: /^[-*]\s$/,
                allowInList: false,
                execute: () => {
                    Editor.saveSnapshot();
                    block.innerHTML = '<br>';
                    const newRange = document.createRange();
                    newRange.setStart(block, 0);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    document.execCommand('insertUnorderedList', false, null);
                }
            },
            {
                trigger: /^(\d+)\.\s$/,
                allowInList: false,
                execute: (match) => {
                    Editor.saveSnapshot();
                    const startNum = match[1]; 
                    
                    block.innerHTML = '<br>';
                    const newRange = document.createRange();
                    newRange.setStart(block, 0);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    
                    document.execCommand('insertOrderedList', false, null);

                    const currSel = window.getSelection();
                    if (currSel.rangeCount > 0) {
                        let currNode = currSel.anchorNode;
                        if (currNode.nodeType === 3) currNode = currNode.parentNode;
                        const ol = currNode.closest('ol');
                        if (ol && startNum !== "1") {
                            ol.setAttribute('start', startNum);
                        }
                    }
                }
            },
            {
                trigger: /^\[\]\s$/,
                allowInList: false,
                execute: () => {
                    Editor.saveSnapshot();
                    block.innerHTML = '<br>';
                    const newRange = document.createRange();
                    newRange.setStart(block, 0);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    
                    Editor.saveSelection();
                    Editor.insertChecklist();
                }
            }
        ];

        for (let rule of rules) {
            if (isListElement && !rule.allowInList) continue;

            const match = textRaw.match(rule.trigger);
            if (match) {
                rule.execute(match);
                if (typeof Store !== 'undefined') Store.triggerAutoSave();
                break; 
            }
        }
    },

    getSelectedBlocks: (range) => {
        const editor = document.getElementById('noteContent');
        let startNode = range.startContainer;
        let endNode = range.endContainer;
        
        while (startNode && startNode.parentNode !== editor && startNode !== editor) {
            if (Editor.isBlockElement(startNode)) break;
            startNode = startNode.parentNode;
        }
        while (endNode && endNode.parentNode !== editor && endNode !== editor) {
            if (Editor.isBlockElement(endNode)) break;
            endNode = endNode.parentNode;
        }
        
        if (startNode === editor) startNode = range.startContainer.nodeType === 3 ? range.startContainer : range.startContainer.childNodes[range.startOffset];
        if (endNode === editor) endNode = range.endContainer.nodeType === 3 ? range.endContainer : range.endContainer.childNodes[range.endOffset];
        
        const blocks = [];
        let current = startNode;
        while (current) {
            if (Editor.isBlockElement(current)) blocks.push(current);
            if (current === endNode || current.contains(endNode)) break;
            if (current.nextSibling) current = current.nextSibling;
            else {
                let parent = current.parentNode;
                while (parent && !parent.nextSibling && parent !== editor) parent = parent.parentNode;
                current = parent ? parent.nextSibling : null;
            }
        }
        return [...new Set(blocks)].filter(b => b);
    },

    isBlockElement: (node) => node && node.nodeType === 1 && ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'PRE', 'BLOCKQUOTE'].includes(node.nodeName)
});

document.addEventListener('DOMContentLoaded', () => {
    const editorEl = document.getElementById('noteContent');
    if (editorEl) {
        editorEl.addEventListener('keydown', (e) => {
            const isCtrlOrCmd = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();
            
            if (isCtrlOrCmd && AppState.isEditMode) {
                if (e.shiftKey && key === 'b') {
                    e.preventDefault();
                    
                    // Prevenzione inserimento segnalibro nei blocchi di codice
                    const sel = window.getSelection();
                    if (sel.rangeCount > 0) {
                        const node = sel.anchorNode;
                        if (node && node.nodeType === 3) {
                            if (node.parentNode.closest('.code-content')) {
                                if (typeof UI !== 'undefined' && UI.showToast) UI.showToast("Impossibile inserire un segnalibro dentro un blocco di codice.", "warning");
                                return;
                            }
                        } else if (node && node.closest('.code-content')) {
                            if (typeof UI !== 'undefined' && UI.showToast) UI.showToast("Impossibile inserire un segnalibro dentro un blocco di codice.", "warning");
                            return;
                        }
                    }

                    Editor.saveSelection(); 
                    Editor.insertBookmark();
                    if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
                    return;
                }
            }

            // MOTORE INTERCETTAZIONE TASTO HOME (Inizio Riga)
            if (e.key === 'Home') {
                if (AppState.isEditMode && Editor.handleHomeKey(e)) {
                    return; // Ferma la propagazione se lo Smart Home è stato applicato
                }
            }
        });
    }
});