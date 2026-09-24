/**
 * editor-core.js
 * Inizializzazione editor e core engine (Caret, Boundaries, RawText e Sanificazione JSON).
 * Scansione transitiva nel Garbage Collector per tutelare database relazionali, template e asset.
 * Re-idratazione immediata post-salvataggio.
 * Estirpazione degli Zero-Width Space (\u200B) orfani dal DOM.
 * Inseriti .adv-board-card e gli eventi calendario nella Whitelist di handleSmartClickEscape.
 * Normalizzazione retroattiva degli appunti inline salvati con tag a blocco.
 * FIX CARET: Integrato l'estrattore geometrico assoluto basato su Range.cloneContents per il calcolo infallibile degli offset.
 * FIX UNDO/REDO CARET: minifyHTMLForStorage preserva il marcatore di cronologia quando richiesto dagli snapshot RAM.
 * FIX ARCHITETTURA: Ricollocato _getRawText nativamente in editor-core per garantire disponibilità globale.
 * FIX RESTORE SELECTION: Invocazione del focus prima dell'assegnazione del range per evitare il reset all'inizio del blocco.
  * FEAT HEAL FONT ARTIFACTS: Rimozione chirurgica degli span parassiti con style="font-size: ..." generati da WebKit su unione blocchi.
 */

const Editor = {
    savedRange: null,
    currentContext: null,
    selectedWidget: null,

    audioCache: {}, 
    imageCache: {},

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

    // Funzione snella per auto-riparare ed eliminare gli span parassiti con font-size inline iniettati dal browser
    healFontArtifacts: (container) => {
        if (!container) return;
        const badSpans = container.querySelectorAll('h1 span[style*="font-size"], h2 span[style*="font-size"], h3 span[style*="font-size"], h4 span[style*="font-size"], h5 span[style*="font-size"], h6 span[style*="font-size"], p > span[style*="font-size"]');
        
        badSpans.forEach(span => {
            // VanillaDesk usa solo classi (fs-small, fs-large); qualsiasi style.fontSize inline puro è un artefatto del browser
            if (!span.className && span.style.fontSize) {
                const parent = span.parentNode;
                while (span.firstChild) {
                    parent.insertBefore(span.firstChild, span);
                }
                span.remove();
                if (parent) parent.normalize();
            }
        });
    },

    hydrateMedia: (container) => {
        container.querySelectorAll('img[data-image-ref]').forEach(img => {
            const ref = img.getAttribute('data-image-ref');
            if (ref && Editor.imageCache[ref]) {
                img.setAttribute('src', Editor.imageCache[ref]);
            }
        });
        container.querySelectorAll('audio[data-audio-ref]').forEach(aud => {
            const ref = aud.getAttribute('data-audio-ref');
            if (ref && Editor.audioCache[ref]) {
                aud.setAttribute('src', Editor.audioCache[ref]);
            }
        });
    },

    clearWidgetSelection: () => {
        if (Editor.selectedWidget) {
            Editor.selectedWidget.classList.remove('adv-widget-selected');
            Editor.selectedWidget = null;
        }
        document.querySelectorAll('.adv-widget-selected').forEach(el => el.classList.remove('adv-widget-selected'));
    },

    handleImageUpload: async (input) => {
        if (!input.files || !input.files[0]) return;
        
        if (!AppState.assetsHandle) {
            alert("Devi prima creare un Workspace per poter allegare file fisici.");
            input.value = '';
            return;
        }

        Editor.saveSnapshot();
        const file = input.files[0];
        
        if (typeof UI !== 'undefined') UI.showToast("Salvataggio immagine su disco in corso...", "info");
        
        const fileName = await Store.saveAsset(file, 'img');
        
        if (fileName) {
            const blobUrl = Editor.imageCache[fileName];
            
            Editor.restoreSelection();
            document.execCommand('insertHTML', false, `<img src="${blobUrl}" data-image-ref="${fileName}"><p><br></p>`);
            Store.triggerAutoSave();
        }
        
        input.value = '';
    },

    enforceBoundaries: () => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;

        const protectedBlocks = editor.querySelectorAll(WidgetManager.blockSelector + ', ' + WidgetManager.inlineSelector);
        protectedBlocks.forEach(el => {
            if (el.getAttribute('contenteditable') !== 'false') {
                el.setAttribute('contenteditable', 'false');
            }
        });
        Editor._ensureLastLineBreak(editor);
    },
    
    _ensureLastLineBreak: (editorEl) => {
        if (!editorEl) return;
        const lastChild = editorEl.lastElementChild;
        if (lastChild && WidgetManager.isProtectedBlock(lastChild)) {
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            editorEl.appendChild(p);
        }
    },

    handleSmartClickEscape: (e) => {
        if (!AppState.isEditMode) return;
        
        let target = e.target;
        if (target && target.nodeType === 3) target = target.parentNode;
        if (!target || !target.closest) return;

        // Non impedire il click nativo su campi di input o textarea
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        const shell = target.closest('.adv-widget-shell, .adv-inline-shell');
        if (!shell) return;

        Editor.clearWidgetSelection();

        if (typeof WidgetManager !== 'undefined') {
            if (WidgetManager.isInsideEditableWidgetArea(target)) {
                return;
            }
        }

        // Whitelist per permettere l'interazione HTML5 Drag e Click su controlli di modulo
        if (target.closest('th, td, .widget-drag-handle, .widget-options-btn, .adv-tool-btn, .adv-add-btn, .adv-icon-btn, .adv-table-header, .btn, .action-btn-run, .adv-btn-icon-trigger, .snippet-copy-btn, .inline-note-marker, .adv-board-card, .adv-cal-event-std, .adv-cal-event-abs')) {
            return;
        }

        const rect = shell.getBoundingClientRect();
        const isInline = shell.classList.contains('adv-inline-shell');
        
        const isBottomOrRightHalf = isInline 
            ? e.clientX > rect.left + (rect.width / 2) 
            : e.clientY > rect.top + (rect.height / 2);

        let targetNode = isBottomOrRightHalf ? shell.nextSibling : shell.previousSibling;
        
        if (targetNode && targetNode.nodeType === 3) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.setStart(targetNode, isBottomOrRightHalf ? 0 : targetNode.length);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            e.preventDefault();
            e.stopPropagation();
        } else if (targetNode && targetNode.nodeType === 1 && !WidgetManager.isProtectedBlock(targetNode)) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(targetNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            e.preventDefault();
            e.stopPropagation();
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
    },

    cleanOrphanedCaches: () => {
        const activeDbIds = new Set();
        const activeImageIds = new Set();
        const activeAudioIds = new Set(); 

        const extractIds = (htmlString) => {
            if (!htmlString) return;
            const dbRegex = /id=["'](adv_tbl_[^"']+|adv_journal_[^"']+|adv_code_[^"']+|adv_btnbar_[^"']+|adv_pivot_[^"']+|adv_link_[^"']+|adv_cols_[^"']+|adv_audio_[^"']+|adv_vid_[^"']+)["']/g;
            let match;
            while ((match = dbRegex.exec(htmlString)) !== null) activeDbIds.add(match[1].split('_cited_')[0]);

            const imgRegex = /data-image-ref=["']([^"']+)["']/g;
            while ((match = imgRegex.exec(htmlString)) !== null) activeImageIds.add(match[1]);

            const audRegex = /data-audio-ref=["']([^"']+)["']/g;
            while ((match = audRegex.exec(htmlString)) !== null) activeAudioIds.add(match[1]);
        };

        // 1. Scansiona Editor Visibile e Note
        const editor = document.getElementById('noteContent');
        if (editor) extractIds(editor.innerHTML);
        AppState.notes.forEach(note => extractIds(note.content));
        
        // 2. Scansiona Stack di Undo/Redo
        if (Editor.undoStack) Editor.undoStack.forEach(extractIds);
        if (Editor.redoStack) Editor.redoStack.forEach(extractIds);

        // 3. Scansiona Template (Anche i Widget nidificati internamente)
        if (AppState.templates) {
            AppState.templates.forEach(tpl => {
                extractIds(tpl.content);
                if (tpl.widgets) {
                    Object.values(tpl.widgets).forEach(state => {
                        if (state.rows) {
                            state.rows.forEach(row => {
                                if (row.cells) {
                                    Object.values(row.cells).forEach(cellVal => {
                                        if (typeof cellVal === 'string' && (cellVal.includes('data-image-ref') || cellVal.includes('data-audio-ref'))) {
                                            extractIds(cellVal); 
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }

        // 4. Scansione Transitiva delle Dipendenze Relazionali e di Sistema
        if (AppState.databases) {
            let dependenciesAdded = true;
            while (dependenciesAdded) {
                dependenciesAdded = false;
                for (const dbId of Array.from(activeDbIds)) {
                    const dbState = AppState.databases[dbId];
                    if (!dbState) continue;

                    // Sorgente di Viste Collegate o Tabelle Pivot
                    if (dbState.sourceTableId && !activeDbIds.has(dbState.sourceTableId)) {
                        activeDbIds.add(dbState.sourceTableId);
                        dependenciesAdded = true;
                    }

                    // Relazioni, Rollup e Backlink tra tabelle
                    if (Array.isArray(dbState.columns)) {
                        dbState.columns.forEach(col => {
                            if (col.targetTableId && !activeDbIds.has(col.targetTableId)) {
                                activeDbIds.add(col.targetTableId);
                                dependenciesAdded = true;
                            }
                            if (col.linkedTableId && !activeDbIds.has(col.linkedTableId)) {
                                activeDbIds.add(col.linkedTableId);
                                dependenciesAdded = true;
                            }
                        });
                    }

                    // Database bersaglio di pulsanti Macro
                    if (Array.isArray(dbState.buttons)) {
                        dbState.buttons.forEach(btn => {
                            if (Array.isArray(btn.actionBlocks)) {
                                btn.actionBlocks.forEach(blk => {
                                    if (blk.targetDbId && blk.targetDbId !== 'THIS_ROW' && !activeDbIds.has(blk.targetDbId)) {
                                        activeDbIds.add(blk.targetDbId);
                                        dependenciesAdded = true;
                                    }
                                    if (blk.sourceDbId && !activeDbIds.has(blk.sourceDbId)) {
                                        activeDbIds.add(blk.sourceDbId);
                                        dependenciesAdded = true;
                                    }
                                });
                            }
                        });
                    }

                    // Database bersaglio di automazioni
                    if (Array.isArray(dbState.automations)) {
                        dbState.automations.forEach(auto => {
                            if (Array.isArray(auto.actions)) {
                                auto.actions.forEach(act => {
                                    if (act.colId === 'SYS_ACTION' && act.type === 'insert_row' && act.value && !activeDbIds.has(act.value)) {
                                        activeDbIds.add(act.value);
                                        dependenciesAdded = true;
                                    }
                                });
                            }
                        });
                    }
                }
            }

            // Scansiona il contenuto nativo dei Database in RAM per immagini o tracce audio
            Object.values(AppState.databases).forEach(state => {
                if (state.rows) {
                    state.rows.forEach(row => {
                        if (row.cells) {
                            Object.values(row.cells).forEach(cellVal => {
                                if (typeof cellVal === 'string' && (cellVal.includes('data-image-ref') || cellVal.includes('data-audio-ref'))) {
                                    extractIds(cellVal); 
                                }
                            });
                        }
                    });
                }
            });
        }

        // 5. Purga DB Orfani autentici (preservando SYS_PROPERTIES_DB e le dipendenze transitive)
        if (AppState.databases) {
            Object.keys(AppState.databases).forEach(id => {
                if (id === 'SYS_PROPERTIES_DB') return; 
                if (!activeDbIds.has(id)) delete AppState.databases[id];
            });
        }
        
        // 6. Purga Immagini Orfane in RAM
        if (Editor.imageCache) {
            Object.keys(Editor.imageCache).forEach(id => {
                if (!activeImageIds.has(id)) {
                    URL.revokeObjectURL(Editor.imageCache[id]);
                    delete Editor.imageCache[id];
                }
            });
        }
        
        // 7. Purga Audio Orfani in RAM
        if (Editor.audioCache) {
            Object.keys(Editor.audioCache).forEach(id => {
                if (!activeAudioIds.has(id)) {
                    URL.revokeObjectURL(Editor.audioCache[id]);
                    delete Editor.audioCache[id];
                }
            });
        }
    },

    minifyHTMLForStorage: (htmlString, keepHistoryMarker = false) => {
        if (!htmlString) return "";
        const temp = document.createElement('div');
        temp.innerHTML = htmlString;

        // Normalizzazione retroattiva degli appunti inline salvati con tag a blocco
        temp.querySelectorAll('.inline-note-data').forEach(dataSpan => {
            let inner = dataSpan.innerHTML;
            if (/<(div|p|ul|ol|li)[^>]*>/i.test(inner)) {
                inner = inner.replace(/<div[^>]*>/gi, '<br>')
                             .replace(/<\/div>/gi, '')
                             .replace(/<p[^>]*>/gi, '<br>')
                             .replace(/<\/p>/gi, '')
                             .replace(/<li[^>]*>/gi, '<br>• ')
                             .replace(/<\/li>/gi, '')
                             .replace(/<\/?(ul|ol|h[1-6]|blockquote)[^>]*>/gi, '');
                dataSpan.innerHTML = inner.replace(/^(<br\s*\/?>)+/i, '');
            }
        });

        // Rimozione fonti dinamiche e iframes per prevenire Network Errors e CORS in background
        temp.querySelectorAll('iframe').forEach(ifr => {
            const src = ifr.getAttribute('src');
            if (src) {
                ifr.setAttribute('data-src', src);
                ifr.removeAttribute('src');
            }
        });
        
        temp.querySelectorAll('img[data-image-ref]').forEach(img => img.removeAttribute('src'));
        temp.querySelectorAll('audio[data-audio-ref]').forEach(aud => aud.removeAttribute('src'));

        temp.querySelectorAll('.adv-widget-shell').forEach(shell => {
            const type = shell.getAttribute('data-widget-type');
            
            // I video non vengono minificati (non avendo database, per mostrare l'iframe servono i dati crudi del body)
            if (['database', 'pivot', 'journal', 'buttonbar', 'code'].includes(type)) {
                shell.innerHTML = '';
            } 
            else if (type === 'citation') {
                const body = shell.querySelector('.citation-body');
                if (body) body.innerHTML = ''; 
            }
        });

        // Gestione selettiva marcatori Undo/Redo: preservati negli snapshot di cronologia in RAM, estirpati nel salvataggio su disco
        const ghostsSelector = keepHistoryMarker 
            ? '#editor-undo-marker, .adv-multi-cursor, #tab-start-marker, #tab-end-marker'
            : '#editor-undo-marker, .adv-multi-cursor, #tab-start-marker, #tab-end-marker, #history-undo-marker-temp';

        temp.querySelectorAll(ghostsSelector).forEach(g => {
            const parent = g.parentNode;
            while (g.firstChild) parent.insertBefore(g.firstChild, g);
            parent.removeChild(g);
        });

        return temp.innerHTML;
    },

    _normalizeEmptyBlocks: (rootNode) => {
        const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI'];
        const elements = Array.from(rootNode.querySelectorAll(blockTags.join(',')));

        elements.forEach(el => {
            if (WidgetManager.isTotallyProtected(el) || el.closest('.inline-note-wrapper')) {
                return;
            }

            const tag = el.tagName;
            const innerHTML = el.innerHTML;
            const cleanText = el.innerText.replace(/\u200B/g, '').trim();

            if (innerHTML === '' && cleanText === '') {
                if (!el.querySelector('img') && !el.querySelector('audio') && !el.querySelector('iframe')) {
                    el.innerHTML = '<br>';
                }
                return;
            }

            if (tag === 'DIV' && (innerHTML === '<br>' || innerHTML.trim() === '<br>')) {
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                
                if (el.hasAttribute('class')) p.className = el.className;
                if (el.hasAttribute('style')) p.style.cssText = el.style.cssText;
                
                el.parentNode.replaceChild(p, el);
            }
        });

        Editor.healFontArtifacts(rootNode);
    },

    getCleanHTML: () => {
        if (typeof CodeManager !== 'undefined' && typeof CodeManager.forceSyncAll === 'function') {
            CodeManager.forceSyncAll();
        }

        const editor = document.getElementById('noteContent');
        if (!editor) return "";
        const clone = editor.cloneNode(true);

        clone.querySelectorAll(WidgetManager.blockSelector).forEach(el => {
            el.style.boxShadow = ''; el.style.transition = '';
            el.classList.remove('adv-widget-selected');
            if (el.getAttribute('style') === '') el.removeAttribute('style');
        });

        clone.querySelectorAll('h1, h2, h3, .adv-bookmark-marker svg').forEach(el => {
            el.style.backgroundColor = ''; el.style.transition = ''; el.style.transform = ''; el.style.color = '';
            if (el.getAttribute('style') === '') el.removeAttribute('style');
        });

        const svgCopy = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        clone.querySelectorAll('.code-action-copy, .code-copy-btn').forEach(btn => {
            if (btn.innerHTML.includes("Copiato") || btn.innerHTML.includes("✓")) {
                btn.innerHTML = svgCopy;
            }
        });
        
        clone.normalize();
        Editor._normalizeEmptyBlocks(clone);
        return Editor.minifyHTMLForStorage(clone.innerHTML, false);
    },

    sanitizeContent: () => {
        if (typeof CodeManager !== 'undefined' && typeof CodeManager.forceSyncAll === 'function') {
            CodeManager.forceSyncAll();
        }

        const editor = document.getElementById('noteContent');
        if (!editor) return;
        
        Editor.cleanHighlightsBeforeSave();
        Editor._ensureLastLineBreak(editor);
        Editor.clearWidgetSelection();

        editor.querySelectorAll('input, textarea, select').forEach(el => {
            if (el.hasAttribute('id') && !el.id.startsWith('adv_') && !el.id.startsWith('j-search-')) {
                el.removeAttribute('id');
            }
            if (el.hasAttribute('name')) {
                el.removeAttribute('name');
            }
        });

        editor.querySelectorAll(WidgetManager.blockSelector + ', ' + WidgetManager.inlineSelector).forEach(el => {
            el.setAttribute('contenteditable', 'false');
            el.style.boxShadow = ''; el.style.transition = '';
            el.classList.remove('adv-widget-selected');
            if (el.getAttribute('style') === '') el.removeAttribute('style');
        });
        
        editor.querySelectorAll('.code-content').forEach(el => el.setAttribute('contenteditable', 'false'));

        editor.querySelectorAll('h1, h2, h3, .adv-bookmark-marker svg').forEach(el => {
            el.style.backgroundColor = ''; el.style.transition = ''; el.style.transform = ''; el.style.color = '';
            if (el.getAttribute('style') === '') el.removeAttribute('style');
        });

        const ghosts = editor.querySelectorAll('#editor-undo-marker, .adv-multi-cursor, #tab-start-marker, #tab-end-marker, #history-undo-marker-temp');
        ghosts.forEach(g => {
            const parent = g.parentNode;
            while (g.firstChild) parent.insertBefore(g.firstChild, g);
            parent.removeChild(g);
        });

        const svgCopy = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        editor.querySelectorAll('.code-action-copy, .code-copy-btn, .adv-tool-btn').forEach(btn => {
            if (btn.innerHTML.includes("Copiato") || btn.innerHTML.includes("✓")) {
                btn.innerHTML = svgCopy + (btn.innerText.includes('Copia') ? ' Copia' : '');
            }
        });

        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        let node;
        const nodesToRemove = [];
        
        while ((node = walker.nextNode())) {
            if (node.nodeValue.includes('\u200B')) {
                if (node.nodeValue !== '\u200B') {
                    node.nodeValue = node.nodeValue.replace(/\u200B/g, '');
                } else {
                    const prev = node.previousSibling;
                    const next = node.nextSibling;
                    const parent = node.parentNode;
                    
                    const isNeeded = (prev && (prev.tagName === 'A' || (prev.classList && prev.classList.contains('adv-inline-shell')))) ||
                                     (next && (next.tagName === 'A' || (next.classList && next.classList.contains('adv-inline-shell')))) ||
                                     (parent && (parent.classList && (parent.classList.contains('checklist-text') || parent.classList.contains('snippet-text'))));
                    
                    if (!isNeeded) {
                        nodesToRemove.push(node);
                    }
                }
            }
            // distruzione delle sequenze di spazi non comprimibili (\u00A0).
            //if (node.nodeValue.includes('\u00A0\u00A0')) node.nodeValue = node.nodeValue.replace(/\u00A0{2,}/g, ' ');
        }
        
        nodesToRemove.forEach(n => n.remove());

        editor.normalize();
        Editor._normalizeEmptyBlocks(editor);
        Editor.healFontArtifacts(editor);

        Editor.hydrateMedia(editor);

        if (AppState.currentNoteId) {
            const note = Store.getNote(AppState.currentNoteId);
            if (note) {
                note.content = Editor.minifyHTMLForStorage(editor.innerHTML, false);
            }
        }
        
        Store.triggerAutoSave();
    },

    applyHighlight: (elementOrHtml, term) => {
        if (!term) return elementOrHtml;
        const isString = typeof elementOrHtml === 'string';
        const root = isString ? document.createElement('div') : elementOrHtml;
        if (isString) root.innerHTML = elementOrHtml;

        const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${safeTerm})`, 'gi');

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        const nodesToReplace = [];

        let n;
        while (n = walker.nextNode()) {
            const parentTag = n.parentNode ? n.parentNode.tagName.toUpperCase() : '';
            if (parentTag !== 'SCRIPT' && parentTag !== 'STYLE' && parentTag !== 'MARK' && !WidgetManager.isTotallyProtected(n.parentNode)) {
                if (n.nodeValue.match(regex)) nodesToReplace.push(n);
            }
        }

        nodesToReplace.forEach(textNode => {
            const fragment = document.createDocumentFragment();
            const parts = textNode.nodeValue.split(regex);
            parts.forEach(part => {
                if (part.toLowerCase() === term.toLowerCase()) {
                    const mark = document.createElement('mark');
                    mark.className = 'search-highlight';
                    mark.textContent = part;
                    fragment.appendChild(mark);
                } else if (part.length > 0) {
                    fragment.appendChild(document.createTextNode(part));
                }
            });
            textNode.parentNode.replaceChild(fragment, textNode);
        });

        return isString ? root.innerHTML : root;
    },

    cleanHighlightsBeforeSave: () => {
        const editor = document.getElementById('noteContent');
        if (editor) {
            let changed = true;
            while(changed) {
                changed = false;
                const marks = editor.querySelectorAll('mark.search-highlight');
                if (marks.length > 0) {
                    marks.forEach(m => {
                        const parent = m.parentNode;
                        while (m.firstChild) parent.insertBefore(m.firstChild, m);
                        parent.removeChild(m);
                    });
                    changed = true;
                }
            }
            editor.normalize();
        }
    }
};