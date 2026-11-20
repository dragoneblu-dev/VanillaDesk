/**
 * editor-paste.js
 * Modulo orchestratore per la gestione dell'evento Incolla (Paste) nell'Editor.
 * Sottomodulo di Editor (i parser e la sanificazione HTML sono in 'editor-paste-parser.js' ed 'editor-paste-html.js').
 * - Smistamento per input nativi, tabelle Excel/Google Sheets, screenshot/immagini pure (singole o multiple), URL web/YouTube e widget protetti.
 * - Incolla testo piano con preservazione dello spazio finale precedente al cursore (senza collasso Blink su execCommand).
 * - Intercettore diretto in fase di cattura su #inlineNoteInput e #bookmarkCommentInput.
 */

Object.assign(Editor, {

    // Inserisce un frammento HTML inline nel Range collassando il cursore all'esatta fine del contenuto
    _insertInlineHTMLAndCollapse: (htmlString, range, selection) => {
        if (!range || !selection) return;

        range.deleteContents();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;
        const frag = document.createDocumentFragment();
        while (tempDiv.firstChild) frag.appendChild(tempDiv.firstChild);

        const lastChild = frag.lastChild;
        range.insertNode(frag);

        if (lastChild) {
            const newRange = document.createRange();
            if (lastChild.nodeType === Node.TEXT_NODE) {
                newRange.setStart(lastChild, lastChild.nodeValue.length);
            } else {
                newRange.setStartAfter(lastChild);
            }
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            if (typeof Editor !== 'undefined') {
                Editor.savedRange = newRange.cloneRange();
            }
        }
    },

    handlePaste: (e) => {
        const clipboardData = (e.clipboardData || window.clipboardData);
        if (!clipboardData) return;

        // ISOLAMENTO RIGOROSO CONTROLLI NATIVI:
        // Se l'incolla avviene all'interno di un tag INPUT o TEXTAREA, lasciamo che sia il browser a gestire l'operazione
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
            if (target.classList && target.classList.contains('adv-number-input')) {
                const text = clipboardData.getData('text/plain');
                if (text && (text.includes(',') || /^\s+|\s+$/.test(text))) {
                    e.preventDefault();
                    document.execCommand('insertText', false, text.trim().replace(',', '.'));
                    return;
                }
            }
            return;
        }

        const pastedText = clipboardData.getData('text/plain');
        const pastedHTML = clipboardData.getData('text/html');
        const pastedRTF = clipboardData.getData('text/rtf') || '';

        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        
        let targetNode = sel.anchorNode;
        if (targetNode.nodeType === 3) targetNode = targetNode.parentNode;

        // Controllo contesti protetti ed editor dedicati (Note Inline e Commenti Segnalibri)
        const isInsideWidget = WidgetManager.isProtectedBlock(targetNode) || WidgetManager.isProtectedInline(targetNode);
        const titleNode = targetNode.closest('.widget-title, .adv-table-title');
        const codePreNode = targetNode.closest('pre.code-content');
        const codeWrapper = codePreNode ? targetNode.closest('[data-widget-type="code"]') : null;
        const snippetText = targetNode.closest('.snippet-text');

        // =========================================================================
        // PRIORITÀ TABELLE EXCEL / GOOGLE SHEETS ISOLATE:
        // Riconosce ed estrae tabelle pure di fogli di calcolo SOLO SE non si tratta di un intero documento Word/Docs
        // =========================================================================
        const isSpreadsheetData = !isInsideWidget && Editor._isExcelOrSpreadsheetPaste(pastedHTML, pastedText);

        if (isSpreadsheetData) {
            const tableHTML = Editor._createSimpleTableFromExcel(pastedHTML, pastedText);
            if (tableHTML) {
                e.preventDefault();
                Editor.saveSnapshot(true);

                if (sel.rangeCount > 0 && !sel.isCollapsed) {
                    sel.getRangeAt(0).deleteContents();
                }

                const currentRange = sel.getRangeAt(0);
                let blockUnderCursor = currentRange.startContainer.nodeType === 3 ? currentRange.startContainer.parentNode : currentRange.startContainer;
                blockUnderCursor = blockUnderCursor.closest ? blockUnderCursor.closest('p, div, h1, h2, h3, h4, h5, h6') : null;

                const isBlockEmpty = blockUnderCursor && blockUnderCursor.id !== 'noteContent' &&
                                     blockUnderCursor.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim() === '' &&
                                     !blockUnderCursor.querySelector('img, audio, iframe, .adv-widget-shell');

                if (isBlockEmpty && blockUnderCursor.parentNode && blockUnderCursor.parentNode.contains(blockUnderCursor)) {
                    currentRange.setStartBefore(blockUnderCursor);
                    currentRange.collapse(true);
                    blockUnderCursor.remove();
                    sel.removeAllRanges();
                    sel.addRange(currentRange);
                }

                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = tableHTML;

                if (typeof Editor.cleanDOMTree === 'function') {
                    Editor.cleanDOMTree(tempDiv);
                }

                const frag = document.createDocumentFragment();
                while (tempDiv.firstChild) frag.appendChild(tempDiv.firstChild);

                const lastNode = frag.lastChild;
                currentRange.deleteContents();
                currentRange.insertNode(frag);

                if (lastNode) {
                    const newRange = document.createRange();
                    newRange.setStartAfter(lastNode);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }

                Editor._ensureLastLineBreak(document.getElementById('noteContent'));

                if (typeof WidgetManager !== 'undefined') {
                    WidgetManager.mountAll();
                }
                if (typeof Store !== 'undefined') {
                    Store.triggerAutoSave();
                }
                return;
            }
        }

        // =========================================================================
        // RICONOSCIMENTO PAYLOAD EXCEL / OFFICE (Neutralizza immagine raster screenshot)
        // =========================================================================
        const isFromOfficeOrExcel = isSpreadsheetData || (pastedHTML && (
            pastedHTML.includes('excel') || 
            pastedHTML.includes('schemas-microsoft-com') || 
            pastedHTML.includes('office') ||
            pastedHTML.includes('data-sheets-')
        )) || (pastedText && pastedText.includes('\t'));

        const items = Array.from((clipboardData || e.originalEvent.clipboardData).items || []);
        const imageFiles = [];
        for (const item of items) {
            if (item.kind === 'file' && item.type && item.type.includes('image/')) {
                const fileObj = item.getAsFile();
                if (fileObj) imageFiles.push(fileObj);
            }
        }
        if (imageFiles.length === 0 && clipboardData.files && clipboardData.files.length > 0) {
            for (const fileObj of Array.from(clipboardData.files)) {
                if (fileObj && fileObj.type && fileObj.type.includes('image/')) {
                    imageFiles.push(fileObj);
                }
            }
        }

        // 1. GESTIONE SCREENSHOT O FILE IMMAGINE PURI (Singoli o Multipli senza testo di contorno)
        const hasTextContent = (pastedText && pastedText.trim().length > 0) || (pastedHTML && pastedHTML.replace(/<[^>]*>/g, '').trim().length > 0);
        const rawPlainTrimmed = (pastedText || '').trim();
        const isFileNamesOnlyText = !pastedHTML && imageFiles.length > 0 && rawPlainTrimmed.length > 0 &&
            rawPlainTrimmed.split(/\r\n|\n|\r/).every(line => {
                const cleanLine = line.trim();
                if (!cleanLine) return true;
                let decodedLine = cleanLine;
                try { decodedLine = decodeURIComponent(cleanLine); } catch (_) {}
                return imageFiles.some(f =>
                    decodedLine === f.name ||
                    decodedLine.endsWith('/' + f.name) ||
                    decodedLine.endsWith('\\' + f.name)
                );
            });

        if (!isSpreadsheetData && !isFromOfficeOrExcel && imageFiles.length > 0 && (!hasTextContent || isFileNamesOnlyText)) {
            const isBlockedTarget = (isInsideWidget && !targetNode.closest('.simple-table-wrapper td, .simple-table-wrapper th, .widget-type-columns .col-box')) ||
                                    !!targetNode.closest('.code-content');
            if (isBlockedTarget) {
                e.preventDefault();
                if (typeof UI !== 'undefined' && UI.showToast) {
                    UI.showToast(I18n.t('events_drag.toast_image_in_widget_blocked'), "warning");
                }
                return;
            }

            if (!sel.isCollapsed && typeof Editor.handleBulkWidgetDeletion === 'function') {
                if (!Editor.handleBulkWidgetDeletion()) {
                    e.preventDefault();
                    return;
                }
            }

            e.preventDefault();
            Editor.saveSnapshot(true);

            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast(typeof I18n !== 'undefined' && typeof I18n.t === 'function' ? I18n.t('editor_core.toast_saving_image') : "Salvataggio immagine in corso...", "info");
            }

            const insertRange = sel.getRangeAt(0).cloneRange();
            const noteIdAtStart = typeof AppState !== 'undefined' ? AppState.currentNoteId : null;

            (async () => {
                let lastRange = null;

                for (const fileOrBlob of imageFiles) {
                    const saved = await Editor.saveImageSource(fileOrBlob);
                    if (!saved) continue;
                    if (typeof AppState !== 'undefined' && AppState.currentNoteId !== noteIdAtStart) return;

                    if (!lastRange) insertRange.deleteContents();

                    const imgNode = document.createElement('img');
                    imgNode.src = saved.blobUrl;
                    imgNode.setAttribute('data-image-ref', saved.fileName);
                    imgNode.setAttribute('alt', fileOrBlob.name || 'Immagine');
                    imgNode.setAttribute('onerror', 'Editor.handleImageError(this)');

                    insertRange.insertNode(imgNode);

                    const inlineContainer = imgNode.closest ? imgNode.closest('td, th, li') : null;
                    if (inlineContainer) {
                        insertRange.setStartAfter(imgNode);
                        insertRange.collapse(true);
                    } else {
                        const pNode = document.createElement('p');
                        pNode.innerHTML = '<br>';
                        const parentP = imgNode.closest ? imgNode.closest('p') : null;
                        if (parentP && parentP.parentNode) {
                            parentP.parentNode.insertBefore(pNode, parentP.nextSibling);
                        } else {
                            insertRange.setStartAfter(imgNode);
                            insertRange.collapse(true);
                            insertRange.insertNode(pNode);
                        }
                        insertRange.setStart(pNode, 0);
                        insertRange.collapse(true);
                    }

                    lastRange = insertRange.cloneRange();
                }

                if (!lastRange) return;

                sel.removeAllRanges();
                sel.addRange(lastRange);

                if (typeof TemplateManager !== 'undefined' && typeof TemplateManager.toggleEmptyOverlay === 'function') {
                    TemplateManager.toggleEmptyOverlay();
                }
                if (typeof Store !== 'undefined') {
                    Store.triggerAutoSave();
                }
            })();

            return;
        }
        
        // Muro di Sicurezza Anti-Zombie su selezione multipla
        if (!sel.isCollapsed) {
            if (typeof Editor !== 'undefined' && Editor.handleBulkWidgetDeletion) {
                if (!Editor.handleBulkWidgetDeletion()) {
                    e.preventDefault();
                    return;
                }
            }
        }

        const isHeavyLoad = pastedText.length > 15000 || (pastedHTML && pastedHTML.length > 30000);
        e.preventDefault();

        // Salvataggio preventivo dello snapshot PRIMA di qualsiasi alterazione del DOM (selezione o marker)
        Editor.saveSnapshot(true);

        // =========================================================================
        // ANCORAGGIO PREVENTIVO NEL DOM VIVO (Previene perdita del range su await)
        // =========================================================================
        const editorRootEl = document.getElementById('noteContent');
        let preAsyncAnchorMarker = null;

        if (!isInsideWidget && sel.rangeCount > 0 && editorRootEl && editorRootEl.contains(sel.anchorNode)) {
            const rawRange = sel.getRangeAt(0);
            preAsyncAnchorMarker = document.createElement('span');
            preAsyncAnchorMarker.id = 'paste-anchor-temp-' + Date.now();
            preAsyncAnchorMarker.style.display = 'none';

            if (!rawRange.collapsed) {
                const getBlockHost = (n) => {
                    const el = n.nodeType === 3 ? n.parentNode : n;
                    const blk = el && el.closest ? el.closest('p, div, li, h1, h2, h3, h4, h5, h6, blockquote') : null;
                    return (blk && blk.id !== 'noteContent' && editorRootEl.contains(blk)) ? blk : null;
                };
                const startBlock = getBlockHost(rawRange.startContainer);
                const endBlock = getBlockHost(rawRange.endContainer);

                rawRange.deleteContents();

                // Se la selezione attraversava due blocchi distinti, deleteContents() lascia i due blocchi separati
                // e collassa il range nell'antenato comune: li fondiamo subito in startBlock con il marker al punto di giunzione.
                if (startBlock && endBlock && startBlock !== endBlock &&
                    document.body.contains(startBlock) && document.body.contains(endBlock) &&
                    !startBlock.closest('.adv-widget-shell, .simple-table-wrapper') &&
                    !endBlock.closest('.adv-widget-shell, .simple-table-wrapper')) {

                    if (startBlock.lastChild && startBlock.lastChild.nodeName === 'BR') {
                        startBlock.lastChild.remove();
                    }
                    startBlock.appendChild(preAsyncAnchorMarker);

                    const endHasBrOnly = endBlock.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim() === '' &&
                                         !endBlock.querySelector('img, audio, iframe, input, svg, .adv-widget-shell, .adv-inline-shell');
                    if (!endHasBrOnly) {
                        while (endBlock.firstChild) {
                            startBlock.appendChild(endBlock.firstChild);
                        }
                    }
                    endBlock.remove();
                } else {
                    rawRange.insertNode(preAsyncAnchorMarker);
                }
            } else {
                rawRange.insertNode(preAsyncAnchorMarker);
            }
        }

        const processPaste = async () => {
            try {
                const rawPastedText = (pastedText || '').trim();
                const hasImagesInHTML = pastedHTML && /<img\b/i.test(pastedHTML);
                // Non trattare come URL web se l'HTML veicola immagini (es. Google Immagini che fornisce l'URL in text/plain)
                const isSingleWebUrl = !hasImagesInHTML && /^https?:\/\/[^\s]+$/i.test(rawPastedText);
                const isCodeContext = targetNode.closest && !!targetNode.closest('.code-content, [data-widget-type="code"]');

                // Gestione incolla link web
                if (!isInsideWidget && !isCodeContext && !snippetText && isSingleWebUrl) {
                    if (preAsyncAnchorMarker && preAsyncAnchorMarker.parentNode) {
                        const restoreRange = document.createRange();
                        restoreRange.setStartBefore(preAsyncAnchorMarker);
                        restoreRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(restoreRange);
                        preAsyncAnchorMarker.remove();
                        preAsyncAnchorMarker = null;
                    }

                    const currentRange = sel.getRangeAt(0);

                    // CASO 1: SELEZIONE PRESENTE (Smart Link Wrap)
                    if (!sel.isCollapsed && currentRange.toString().trim().length > 0) {
                        const selectedText = currentRange.toString();
                        const link = document.createElement('a');
                        link.href = rawPastedText;
                        link.target = "_blank";
                        link.textContent = selectedText;

                        currentRange.deleteContents();
                        currentRange.insertNode(link);

                        const newRange = document.createRange();
                        newRange.setStartAfter(link);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);

                        Store.triggerAutoSave();
                        return;
                    } else {
                        const link = document.createElement('a');
                        link.href = rawPastedText;
                        link.target = "_blank";
                        
                        const displayText = (typeof LinkManager !== 'undefined' && typeof LinkManager._truncateUrl === 'function')
                            ? LinkManager._truncateUrl(rawPastedText, 60)
                            : rawPastedText;
                        link.textContent = displayText;

                        if (typeof LinkManager !== 'undefined' && typeof LinkManager.insertNodeAtSelection === 'function') {
                            LinkManager.insertNodeAtSelection(link);
                        } else {
                            currentRange.deleteContents();
                            currentRange.insertNode(link);
                            const newRange = document.createRange();
                            newRange.setStartAfter(link);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                        }

                        // Se è un URL di YouTube, recupera in background il titolo del video per sostituire l'indirizzo grezzo
                        const ytMatch = rawPastedText.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
                        if (ytMatch && ytMatch[1]) {
                            const ytId = ytMatch[1];
                            const applyYtTitle = (ytTitle) => {
                                if (!ytTitle || !document.body.contains(link)) return;
                                link.textContent = ytTitle;
                                if (AppState.currentNoteId) {
                                    const curNote = Store.getNote(AppState.currentNoteId);
                                    if (curNote && typeof Editor.getCleanHTML === 'function') {
                                        curNote.content = Editor.getCleanHTML();
                                        curNote._isDirty = true;
                                        curNote.updatedAt = new Date().toISOString();
                                    }
                                }
                                if (typeof Store !== 'undefined') Store.triggerAutoSave();
                            };

                            if (typeof WidgetManager !== 'undefined' && WidgetManager._ytMetaCache && WidgetManager._ytMetaCache[ytId] && WidgetManager._ytMetaCache[ytId].title) {
                                applyYtTitle(WidgetManager._ytMetaCache[ytId].title);
                            } else if (typeof fetch === 'function') {
                                const watchUrl = `https://www.youtube.com/watch?v=${ytId}`;
                                fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`)
                                    .then(res => res.ok ? res.json() : null)
                                    .then(data => {
                                        if (data && data.title) {
                                            if (typeof WidgetManager !== 'undefined' && WidgetManager._ytMetaCache) {
                                                WidgetManager._ytMetaCache[ytId] = { title: data.title, author_name: data.author_name || '' };
                                            }
                                            applyYtTitle(data.title);
                                        }
                                    })
                                    .catch(() => {});
                            }
                        }

                        Store.triggerAutoSave();
                        return;
                    }
                }

                if (isInsideWidget) {
                    if (preAsyncAnchorMarker && preAsyncAnchorMarker.parentNode) {
                        preAsyncAnchorMarker.remove();
                        preAsyncAnchorMarker = null;
                    }

                    const isEditable = WidgetManager.isInsideEditableWidgetArea(targetNode) || !!targetNode.closest('.simple-table-wrapper td, .simple-table-wrapper th');
                    
                    if (!isEditable) {
                        alert(I18n.t('editor_alerts.paste_invalid_area'));
                        return;
                    }

                    // Incolla su titolo del widget (es. blocco di codice, database, diario):
                    // inserisce testo piano monoriga mantenendo il cursore esattamente nel titolo
                    if (titleNode) {
                        const cleanTitleText = pastedText.replace(/[\r\n]+/g, ' ');
                        const range = sel.getRangeAt(0);
                        range.deleteContents();
                        const textNode = document.createTextNode(cleanTitleText);
                        range.insertNode(textNode);

                        const newRange = document.createRange();
                        newRange.setStart(textNode, textNode.nodeValue.length);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);

                        Store.triggerAutoSave();
                        return;
                    }

                    if (snippetText || targetNode.closest('.simple-table-wrapper td, .simple-table-wrapper th')) {
                        const inlineHtml = Editor._formatTextToInlineHTML(pastedText);
                        Editor._insertInlineHTMLAndCollapse(inlineHtml, sel.getRangeAt(0), sel);
                        Store.triggerAutoSave();
                        return;
                    }

                    let cleanText = pastedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                    
                    if (codeWrapper && codePreNode) {
                        const preNode = codePreNode;
                        if (preNode.innerHTML === '<br>') preNode.innerHTML = '';
                        
                        const selection = window.getSelection();
                        let targetCaretPos = 0;
                        
                        if (selection.rangeCount > 0 && typeof Editor._getCodeOffset === 'function') {
                            const startPos = Editor._getCodeOffset(preNode, selection.anchorNode, selection.anchorOffset);
                            const focusPos = Editor._getCodeOffset(preNode, selection.focusNode, selection.focusOffset);
                            const minPos = Math.min(startPos, focusPos);
                            
                            targetCaretPos = minPos + cleanText.length;
                            const range = selection.getRangeAt(0);
                            range.deleteContents(); 
                            const textNode = document.createTextNode(cleanText);
                            range.insertNode(textNode);
                        } else {
                            preNode.appendChild(document.createTextNode(cleanText));
                            targetCaretPos = preNode.innerText.length;
                        }
                        
                        if (typeof CodeManager !== 'undefined') CodeManager.highlightBlock(preNode, true);
                        if (typeof Editor._setCodeOffset === 'function') Editor._setCodeOffset(preNode, targetCaretPos, targetCaretPos);
                    } else {
                        document.execCommand('insertText', false, cleanText);
                    }
                    Store.triggerAutoSave();
                    return;
                }

                const freshSel = window.getSelection();
                let currentTargetNode = (freshSel && freshSel.rangeCount > 0) ? freshSel.anchorNode : null;
                if (currentTargetNode && currentTargetNode.nodeType === 3) currentTargetNode = currentTargetNode.parentNode;

                let finalHTML = '';

                // Ripristina il range dentro il nodo di testo adiacente quando presente (previene collasso spazi)
                const restoreAndRemoveMarker = () => {
                    if (preAsyncAnchorMarker && preAsyncAnchorMarker.parentNode) {
                        const r = document.createRange();
                        const prev = preAsyncAnchorMarker.previousSibling;
                        if (prev && prev.nodeType === Node.TEXT_NODE) {
                            r.setStart(prev, prev.nodeValue.length);
                        } else {
                            r.setStartBefore(preAsyncAnchorMarker);
                        }
                        r.collapse(true);
                        freshSel.removeAllRanges();
                        freshSel.addRange(r);
                        preAsyncAnchorMarker.remove();
                        preAsyncAnchorMarker = null;
                    }
                };

                // GESTIONE INCOLLA TESTO PIATTO
                if (!pastedHTML) {
                    const isCellOrList = !!(currentTargetNode && currentTargetNode.closest('td, th, li'));
                    const isInsidePre = !!(currentTargetNode && currentTargetNode.closest('pre'));

                    if (!isInsidePre && (isCellOrList || !pastedText.includes('\n'))) {
                        restoreAndRemoveMarker();
                        if (freshSel && freshSel.rangeCount > 0) {
                            const inlineHtml = Editor._formatTextToInlineHTML(pastedText);
                            Editor._insertInlineHTMLAndCollapse(inlineHtml, freshSel.getRangeAt(0), freshSel);
                        }
                        if (typeof UI !== 'undefined' && typeof UI.handleEditorInput === 'function') {
                            UI.handleEditorInput();
                        } else {
                            Store.triggerAutoSave();
                        }
                        return;
                    } else if (!isInsidePre && !isCellOrList) {
                        // Mantiene preAsyncAnchorMarker intatto per lo split e merge preciso nel Caso B
                        finalHTML = Editor._formatPlainTextForHTML(pastedText);
                    } else {
                        restoreAndRemoveMarker();
                        document.execCommand('insertText', false, pastedText);
                        Store.triggerAutoSave();
                        return;
                    }
                } else {
                    finalHTML = await Editor._sanitizePastedHTML(pastedHTML, pastedText, items, pastedRTF);
                }

                Editor._insertCleanedHTML(finalHTML, sel, editorRootEl, preAsyncAnchorMarker);
                preAsyncAnchorMarker = null;

            } catch (err) {
                console.error('[Editor.handlePaste] Errore durante processPaste:', err);
            } finally {
                if (preAsyncAnchorMarker && preAsyncAnchorMarker.parentNode) {
                    preAsyncAnchorMarker.remove();
                }
            }
        };

        if (isHeavyLoad) {
            if (typeof UI !== 'undefined' && UI.showToast) UI.showToast(I18n.t('editor_alerts.paste_heavy_load'), "warning");
            setTimeout(processPaste, 50); 
        } else {
            processPaste();
        }
    }
});

// INTERCETTORE DIRETTO INCOLLA PER NOTE INLINE E SEGNALIBRI
document.addEventListener('paste', (e) => {
    let target = e.target;
    if (target && target.nodeType === 3) target = target.parentNode;
    if (!target || !target.closest) return;

    const miniEditor = target.closest('#inlineNoteInput, #bookmarkCommentInput');
    if (!miniEditor) return;

    e.preventDefault();
    e.stopPropagation();

    const clipboardData = (e.clipboardData || window.clipboardData);
    if (!clipboardData) return;

    const pastedHTML = clipboardData.getData('text/html');
    const pastedText = clipboardData.getData('text/plain') || '';

    let cleanHTML = '';
    if (pastedHTML) {
        cleanHTML = typeof Editor.sanitizeMiniText === 'function'
            ? Editor.sanitizeMiniText(pastedHTML)
            : pastedHTML;
    } else {
        cleanHTML = Editor._formatTextToInlineHTML(pastedText);
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        Editor._insertInlineHTMLAndCollapse(cleanHTML, sel.getRangeAt(0), sel);
    }
}, true);