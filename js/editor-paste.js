/**
 * editor-paste.js
 * Modulo per la gestione dell'evento Incolla (Paste) nell'Editor.
 * Sottomodulo di Editor.
 * - Incolla URL con autolink / link-wrap.
 * - Incolla rich text (Word, Google Docs, siti web) con sanificazione profonda tramite Editor.cleanDOMTree.
 * - Incolla plain text con preservazione della struttura e spaziatura.
 * - Intercettore diretto in fase di cattura su #inlineNoteInput e #bookmarkCommentInput.
 * - FIX MULTI-PARAGRAPH SELECTION REPLACEMENT: Eliminazione atomica preventiva della selezione estesa
 *   prima dell'inserimento, garantendo la sostituzione esatta del testo selezionato su più paragrafi.
 * - FIX SEAMLESS PARAGRAPH MERGE: Fusione naturale dei blocchi incollati nello stile di Word e Google Docs
 *   (il primo blocco si fonde con il testo precedente, l'ultimo con il testo successivo, senza spezzare
 *   la frase in paragrafi vuoti o isolati).
 * - FIX EXCEL RASTER IMAGE OVERRIDE: Neutralizzazione del file image/png accessorio generato da Microsoft Excel
 *   quando si copiano celle, garantendo l'incollamento del testo o della tabella ed evitando lo screenshot raster.
 */

Object.assign(Editor, {

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

        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        
        let targetNode = sel.anchorNode;
        if (targetNode.nodeType === 3) targetNode = targetNode.parentNode;

        // Controllo contesti protetti ed editor dedicati (Note Inline e Commenti Segnalibri)
        const isInsideWidget = WidgetManager.isProtectedBlock(targetNode) || WidgetManager.isProtectedInline(targetNode);
        const codeWrapper = targetNode.closest('[data-widget-type="code"]');
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
                Editor.saveSnapshot();

                if (sel.rangeCount > 0 && !sel.isCollapsed) {
                    try {
                        document.execCommand('delete', false, null);
                    } catch (_) {
                        sel.getRangeAt(0).deleteContents();
                    }
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

                // Inserimento pulito tramite Range nativo
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = tableHTML;

                // Sanificazione preventiva immediata del frammento prima dell'iniezione nel DOM
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
        // Quando si copia da Excel, il sistema operativo riceve sempre anche un item 'image/png'.
        // Se la clipboard contiene marcatori di foglio di calcolo o tabulazioni (\t), il file immagine
        // è solo un render di compatibilità e non deve assolutamente sostituire il testo.
        // =========================================================================
        const isFromOfficeOrExcel = isSpreadsheetData || (pastedHTML && (
            pastedHTML.includes('excel') || 
            pastedHTML.includes('schemas-microsoft-com') || 
            pastedHTML.includes('office') ||
            pastedHTML.includes('data-sheets-')
        )) || (pastedText && pastedText.includes('\t'));

        const items = Array.from((e.clipboardData || e.originalEvent.clipboardData).items);
        let isImage = false;

        // 1. GESTIONE IMMAGINI INCOLLATE (File immagine reale o screenshot autentico, MAI da Excel/Office)
        if (!isSpreadsheetData && !isFromOfficeOrExcel) {
            for (let item of items) {
                if (item.kind === 'file' && item.type.includes('image/')) {
                    e.preventDefault();
                    Editor.saveSnapshot();
                    isImage = true;
                    
                    const blob = item.getAsFile();

                    // Controllo peso per tutela prestazioni: Avvisa se > 200KB
                    if (blob.size > 204800) {
                        if (typeof UI !== 'undefined' && UI.showToast) {
                            UI.showToast("Consiglio: L'immagine è pesante. Usa 'Inserisci > Collegamento (link) > Immagine Esterna' o comprimila per non rallentare l'App.", "warning");
                        }
                    }

                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const img = new Image();
                        img.onload = () => {
                            const MAX_WIDTH = 1600;
                            let width = img.width; let height = img.height;
                            if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
                            const canvas = document.createElement('canvas');
                            canvas.width = width; canvas.height = height;
                            canvas.getContext('2d').drawImage(img, 0, 0, width, height);

                            const imgNode = document.createElement('img');
                            imgNode.src = canvas.toDataURL('image/webp', 0.85);
                            const pNode = document.createElement('p');
                            pNode.innerHTML = '<br>';

                            const curRange = sel.getRangeAt(0);
                            curRange.deleteContents();
                            curRange.insertNode(pNode);
                            curRange.insertNode(imgNode);

                            const newRange = document.createRange();
                            newRange.setStart(pNode, 0);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                        };
                        img.src = ev.target.result;
                    };
                    reader.readAsDataURL(blob);
                    return;
                }
            }
        }

        if (isImage) return;
        
        // Muro di Sicurezza Anti-Zombie: Se l'utente sta incollando su una selezione multipla,
        // verifichiamo che non stia distruggendo un intero database visivo.
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

        const processPaste = () => {
            try {
                Editor.saveSnapshot();

                const rawPastedText = (pastedText || '').trim();
                const isSingleWebUrl = /^https?:\/\/[^\s]+$/i.test(rawPastedText);
                const isCodeContext = targetNode.closest && !!targetNode.closest('.code-content, [data-widget-type="code"]');

                // Gestione incolla link web (Smart Link Wrap o inserimento link nativo pulito senza popup)
                if (!isInsideWidget && !isCodeContext && !snippetText && isSingleWebUrl) {
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
                    } 
                    // CASO 2: NESSUNA SELEZIONE (Autolink su cursore libero)
                    else {
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

                        Store.triggerAutoSave();
                        return;
                    }
                }

                if (isInsideWidget) {
                    const isEditable = WidgetManager.isInsideEditableWidgetArea(targetNode) || !!targetNode.closest('.simple-table-wrapper td, .simple-table-wrapper th');
                    
                    if (!isEditable) {
                        alert(I18n.t('editor_alerts.paste_invalid_area'));
                        return;
                    }

                    // Snippet copiabile multi-linea: Incolla l'HTML pulito con <br> per non spezzare lo span
                    if (snippetText) {
                        let cleanTextWithBrs = pastedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        cleanTextWithBrs = cleanTextWithBrs.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
                        cleanTextWithBrs = cleanTextWithBrs.replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length));
                        cleanTextWithBrs = cleanTextWithBrs.replace(/\r\n|\n|\r/g, '<br>');

                        const curRange = sel.getRangeAt(0);
                        curRange.deleteContents();
                        const spanTemp = document.createElement('span');
                        spanTemp.innerHTML = cleanTextWithBrs;
                        const frag = document.createDocumentFragment();
                        while (spanTemp.firstChild) frag.appendChild(spanTemp.firstChild);
                        curRange.insertNode(frag);

                        Store.triggerAutoSave();
                        return;
                    }

                    let cleanText = pastedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                    
                    if (codeWrapper) {
                        const preNode = codeWrapper.querySelector('pre');
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
                        // All'interno di celle di tabelle semplici preserviamo formattazione ed entità
                        if (targetNode.closest('.simple-table-wrapper td, .simple-table-wrapper th')) {
                            let formattedCellText = pastedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            formattedCellText = formattedCellText.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
                            formattedCellText = formattedCellText.replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length));
                            formattedCellText = formattedCellText.replace(/\r\n|\n|\r/g, '<br>');

                            const curRange = sel.getRangeAt(0);
                            curRange.deleteContents();
                            const spanTemp = document.createElement('span');
                            spanTemp.innerHTML = formattedCellText;
                            const frag = document.createDocumentFragment();
                            while (spanTemp.firstChild) frag.appendChild(spanTemp.firstChild);
                            curRange.insertNode(frag);
                        } else {
                            document.execCommand('insertText', false, cleanText);
                        }
                    }
                    Store.triggerAutoSave();
                    return;
                }

                // =========================================================================
                // ELIMINAZIONE PREVENTIVA SELEZIONE ESTESA MULTI-RIGA / MULTI-BLOCCO
                // Se c'è testo selezionato su più paragrafi, viene prima eliminato nativamente
                // lasciando il cursore collassato nel punto esatto per la sostituzione pulita.
                // =========================================================================
                if (!isInsideWidget && sel.rangeCount > 0 && !sel.isCollapsed) {
                    try {
                        document.execCommand('delete', false, null);
                    } catch (_) {
                        sel.getRangeAt(0).deleteContents();
                    }
                }

                // Aggiornamento riferimento al nodo sotto il cursore dopo l'eventuale cancellazione
                const freshSel = window.getSelection();
                let currentTargetNode = (freshSel && freshSel.rangeCount > 0) ? freshSel.anchorNode : null;
                if (currentTargetNode && currentTargetNode.nodeType === 3) currentTargetNode = currentTargetNode.parentNode;

                let finalHTML = '';

                // GESTIONE INCOLLA TESTO PIATTO (PLAIN TEXT)
                if (!pastedHTML) {
                    if (!currentTargetNode || !currentTargetNode.closest('td, th, li, pre')) {
                        if (!pastedText.includes('\n')) {
                            document.execCommand('insertText', false, pastedText);
                            Store.triggerAutoSave();
                            return;
                        } else {
                            finalHTML = Editor._formatPlainTextForHTML(pastedText);
                        }
                    } else if (currentTargetNode.closest('td, th, li')) {
                        let escaped = pastedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        escaped = escaped.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
                        escaped = escaped.replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length));
                        escaped = escaped.replace(/\r\n|\n|\r/g, '<br>');
                        const curRange = freshSel.getRangeAt(0);
                        curRange.deleteContents();
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = escaped;
                        const frag = document.createDocumentFragment();
                        while (tempDiv.firstChild) frag.appendChild(tempDiv.firstChild);
                        curRange.insertNode(frag);
                        Store.triggerAutoSave();
                        return;
                    } else {
                        document.execCommand('insertText', false, pastedText);
                        Store.triggerAutoSave();
                        return;
                    }
                } else {
                    // GESTIONE INCOLLA HTML (RICH TEXT: WORD, GOOGLE DOCS, EXCEL, SITI WEB)

                    // PRE-PULIZIA ARTEFATTI WORD: Rimuove commenti condizionali MSO prima del parsing DOM
                    const cleanRawHTML = pastedHTML
                        .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
                        .replace(/<!\[if[\s\S]*?<!\[endif\]>/gi, '');

                    const parser = new DOMParser();
                    const doc = parser.parseFromString(cleanRawHTML, 'text/html');

                    // FASE 0: RIMOZIONE CONTENITORI FITTIZI DI GOOGLE DOCS, TAG INTRUSIVI E TAG PROPRIETARI OFFICE
                    doc.querySelectorAll('script, style, meta, link, iframe, object, embed, noscript, o\\:p, o-p, w\\:sdt').forEach(el => el.remove());

                    Array.from(doc.body.querySelectorAll('*')).forEach(el => {
                        const t = el.tagName.toUpperCase();
                        if (t.startsWith('O:') || t.startsWith('W:') || t.startsWith('M:') || t === 'O-P') {
                            el.remove();
                        }
                    });

                    // Rimuove i commenti invisibili inseriti da Chrome/Word (es. <!--StartFragment-->)
                    const iter = doc.createNodeIterator(doc.body, NodeFilter.SHOW_COMMENT, null, false);
                    let commentNode;
                    const commentsToRemove = [];
                    while ((commentNode = iter.nextNode())) commentsToRemove.push(commentNode);
                    commentsToRemove.forEach(c => c.remove());

                    // Google Docs avvolge sistematicamente il contenuto in b/strong guid
                    doc.querySelectorAll('b, strong').forEach(bEl => {
                        const styleStr = (bEl.getAttribute('style') || '').toLowerCase();
                        const isNormal = bEl.style.fontWeight === 'normal' || bEl.style.fontWeight === '400' || /font-weight\s*:\s*(normal|[1-4]00)/.test(styleStr);
                        const isDocsGuid = (bEl.id && bEl.id.startsWith('docs-internal-guid')) || styleStr.includes('font-weight:normal');
                        if (isNormal || isDocsGuid) {
                            const parent = bEl.parentNode;
                            if (parent) {
                                while (bEl.firstChild) parent.insertBefore(bEl.firstChild, bEl);
                                bEl.remove();
                            }
                        }
                    });

                    // ZERO-FONT CONVERSION INIZIALE: Trasforma preventivamente qualsiasi tag FONT in SPAN
                    doc.querySelectorAll('font').forEach(fontEl => {
                        const span = doc.createElement('span');
                        while (fontEl.attributes.length > 0) {
                            span.setAttribute(fontEl.attributes[0].name, fontEl.attributes[0].value);
                            fontEl.removeAttribute(fontEl.attributes[0].name);
                        }
                        while (fontEl.firstChild) span.appendChild(fontEl.firstChild);
                        fontEl.parentNode.replaceChild(span, fontEl);
                    });

                    // FASE 0.5: INCAPSULAMENTO DEI TAG LI ORFANI NEL DOCUMENTO INCOLLATO (Previene <p><li>...</li></p>)
                    const orphanLis = Array.from(doc.body.children).filter(el => el.tagName === 'LI');
                    if (orphanLis.length > 0) {
                        const wrapUl = doc.createElement('ul');
                        doc.body.insertBefore(wrapUl, orphanLis[0]);
                        orphanLis.forEach(li => wrapUl.appendChild(li));
                    }

                    // FASE 0.8: CONVERSIONE DEGLI ELENCHI DI WORD (MsoListParagraph) IN VERI <ol> E <ul>
                    Editor._convertWordListsToHTML(doc.body);

                    // Ricostruisce ID validi per eventuali widget incollati (Copia Note interne)
                    doc.querySelectorAll(WidgetManager.blockSelector).forEach(wrapper => {
                        const oldId = wrapper.id;
                        const type = wrapper.getAttribute('data-widget-type');

                        if (type === 'simple-table' || wrapper.classList.contains('simple-table-wrapper')) {
                            wrapper.id = 'stbl_' + Store.generateId();
                            return;
                        }

                        const isJournal = wrapper.classList.contains('adv-journal-wrapper');
                        const prefix = isJournal ? 'adv_journal_' : 'adv_tbl_';
                        const newId = prefix + Store.generateId();
                        wrapper.id = newId;

                        if (AppState.databases && AppState.databases[oldId]) {
                            let stateClone = JSON.parse(JSON.stringify(AppState.databases[oldId]));
                            if (!isJournal && !stateClone.isPivot && !stateClone.isLinkedView) {
                                stateClone.title = (stateClone.title || "Database") + " (Copia)";
                            }
                            AppState.databases[newId] = stateClone;
                        }
                        wrapper.removeAttribute('data-state');
                        wrapper.innerHTML = ''; 
                    });

                    // FASE 1: CONVERSIONE SEMANTICA PULITA (Bold, Italic, Underline, Strike) CON PRESERVAZIONE CLASSI VANILLADESK
                    const allElements = Array.from(doc.body.querySelectorAll('*')).reverse();

                    allElements.forEach(el => {
                        if (WidgetManager.isProtectedBlock(el) || (el.closest && el.closest('.adv-widget-shell, .adv-inline-shell'))) {
                            return;
                        }

                        const tag = el.tagName.toUpperCase();
                        const rawStyle = (el.getAttribute('style') || '').toLowerCase();

                        const hasBoldWeight = (el.style && (el.style.fontWeight === 'bold' || el.style.fontWeight === 'bolder' || parseInt(el.style.fontWeight, 10) >= 600)) ||
                                              /font-weight\s*:\s*(bold|bolder|[6-9]00)/i.test(rawStyle) ||
                                              /mso-bidi-font-weight\s*:\s*bold/i.test(rawStyle);

                        const hasItalicStyle = (el.style && (el.style.fontStyle === 'italic' || el.style.fontStyle === 'oblique')) ||
                                               /font-style\s*:\s*(italic|oblique)/i.test(rawStyle);

                        const hasUnderlineStyle = (el.style && el.style.textDecoration && el.style.textDecoration.includes('underline')) ||
                                                  /text-decoration\s*:\s*[^;]*underline/i.test(rawStyle);

                        const hasStrikeStyle = (el.style && el.style.textDecoration && el.style.textDecoration.includes('line-through')) ||
                                               /text-decoration\s*:\s*[^;]*line-through/i.test(rawStyle);

                        if (tag === 'STRONG') {
                            const b = doc.createElement('b');
                            while (el.firstChild) b.appendChild(el.firstChild);
                            el.parentNode.replaceChild(b, el);
                            return;
                        }
                        if (tag === 'EM') {
                            const i = doc.createElement('i');
                            while (el.firstChild) i.appendChild(el.firstChild);
                            el.parentNode.replaceChild(i, el);
                            return;
                        }
                        if (tag === 'DEL') {
                            const s = doc.createElement('s');
                            while (el.firstChild) s.appendChild(el.firstChild);
                            el.parentNode.replaceChild(s, el);
                            return;
                        }

                        if (tag === 'SPAN' || tag === 'FONT') {
                            const needB = hasBoldWeight && tag !== 'B';
                            const needI = hasItalicStyle && tag !== 'I';
                            const needU = hasUnderlineStyle && tag !== 'U';
                            const needS = hasStrikeStyle && tag !== 'S';

                            const existingClass = el.getAttribute('class') || '';
                            const hasVanillaDeskClass = /(?:^|\s)(?:ff-|fs-|hl-c|hl-u-c|tx-c|tag-hash)/.test(existingClass);

                            if (needB || needI || needU || needS) {
                                const frag = doc.createDocumentFragment();
                                while (el.firstChild) frag.appendChild(el.firstChild);

                                let wrapperTag = frag;
                                if (needS) {
                                    const sTag = doc.createElement('s');
                                    sTag.appendChild(wrapperTag);
                                    wrapperTag = sTag;
                                }
                                if (needU) {
                                    const uTag = doc.createElement('u');
                                    uTag.appendChild(wrapperTag);
                                    wrapperTag = uTag;
                                }
                                if (needI) {
                                    const iTag = doc.createElement('i');
                                    iTag.appendChild(wrapperTag);
                                    wrapperTag = iTag;
                                }
                                if (needB) {
                                    const bTag = doc.createElement('b');
                                    bTag.appendChild(wrapperTag);
                                    wrapperTag = bTag;
                                }

                                if (hasVanillaDeskClass) {
                                    el.appendChild(wrapperTag);
                                } else {
                                    el.parentNode.replaceChild(wrapperTag, el);
                                }
                            }
                        }

                        if (tag === 'P' || tag === 'LI') {
                            const needB = hasBoldWeight && !Array.from(el.children).some(c => c.tagName === 'B');
                            const needI = hasItalicStyle && !Array.from(el.children).some(c => c.tagName === 'I');

                            if (needB || needI) {
                                const frag = doc.createDocumentFragment();
                                while (el.firstChild) frag.appendChild(el.firstChild);

                                let wrapperTag = frag;
                                if (needI) {
                                    const iTag = doc.createElement('i');
                                    iTag.appendChild(wrapperTag);
                                    wrapperTag = iTag;
                                }
                                if (needB) {
                                    const bTag = doc.createElement('b');
                                    bTag.appendChild(wrapperTag);
                                    wrapperTag = bTag;
                                }
                                el.appendChild(wrapperTag);
                            }
                        }
                    });

                    // FASE 2: SROTOLAMENTO STRUTTURALE DI <P> DENTRO <LI> (Google Docs clean-up)
                    doc.querySelectorAll('li > p').forEach(pInsideLi => {
                        const li = pInsideLi.parentNode;
                        if (li && li.tagName === 'LI' && li.children.length === 1) {
                            while (pInsideLi.firstChild) li.insertBefore(pInsideLi.firstChild, pInsideLi);
                            pInsideLi.remove();
                        }
                    });

                    // FASE 3: NORMALIZZAZIONE TOTALE CELLE TABELLE
                    doc.querySelectorAll('td, th').forEach(cell => {
                        cell.querySelectorAll('p, div').forEach(b => {
                            const parent = b.parentNode;
                            while (b.firstChild) parent.insertBefore(b.firstChild, b);
                            if (b.nextSibling) parent.insertBefore(doc.createElement('br'), b.nextSibling);
                            b.remove();
                        });

                        ['border', 'cellpadding', 'cellspacing', 'width', 'height', 'align', 'valign', 'bgcolor', 'background'].forEach(attr => {
                            cell.removeAttribute(attr);
                        });

                        const rawStyle = (cell.getAttribute('style') || '').toLowerCase();
                        const alignMatch = rawStyle.match(/text-align\s*:\s*(center|right|left)/i);
                            
                        if (alignMatch) {
                            cell.setAttribute('style', `text-align: ${alignMatch[1].toLowerCase()};`);
                        } else {
                            cell.removeAttribute('style');
                        }

                        let h = cell.innerHTML.trim();
                        h = h.replace(/^(?:&nbsp;|\s|<br\s*\/?>)+/i, '');
                        h = h.replace(/(?:&nbsp;|\s|<br\s*\/?>)+$/i, '');
                        cell.innerHTML = h.trim();

                        const cellCleanText = cell.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
                        if (!cellCleanText && !cell.querySelector('img, audio, input, svg')) {
                            cell.innerHTML = '<br>';
                        }
                    });

                    // FASE 3.2: INCAPSULAMENTO TABELLE WORD/DOCS IN COMPONENTI NATIVI (.simple-table-wrapper)
                    doc.querySelectorAll('table').forEach(tbl => {
                        if (tbl.closest('.adv-widget-shell, .simple-table-wrapper')) return;

                        ['border', 'cellpadding', 'cellspacing', 'width', 'height', 'align', 'valign', 'bgcolor', 'background'].forEach(attr => {
                            tbl.removeAttribute(attr);
                        });
                        tbl.removeAttribute('style');

                        tbl.querySelectorAll('tr').forEach(tr => {
                            ['align', 'valign', 'bgcolor', 'style', 'height'].forEach(attr => tr.removeAttribute(attr));
                        });

                        const stblId = 'stbl_' + (typeof Store !== 'undefined' ? Store.generateId() : Date.now());
                        const wrapper = doc.createElement('div');
                        wrapper.className = 'adv-widget-shell simple-table-wrapper';
                        wrapper.setAttribute('data-widget-type', 'simple-table');
                        wrapper.id = stblId;
                        wrapper.contentEditable = 'false';

                        tbl.parentNode.insertBefore(wrapper, tbl);
                        wrapper.appendChild(tbl);

                        tbl.classList.add('table-striped');
                        tbl.style.width = '100%';
                        tbl.style.tableLayout = 'auto';

                        tbl.querySelectorAll('th, td').forEach(c => {
                            c.setAttribute('contenteditable', 'true');
                        });
                    });

                    // FASE 4: SANIFICAZIONE PROFONDA UNIFICATA TRAMITE LA GOMMA FORMATTAZIONI (Editor.cleanDOMTree)
                    if (typeof Editor !== 'undefined' && typeof Editor.cleanDOMTree === 'function') {
                        Editor.cleanDOMTree(doc.body);
                    }

                    // FASE 5: RISOLUZIONE RIGHE VUOTE SPURIE DI WORD 365
                    Array.from(doc.body.childNodes).forEach(node => {
                        if (node.nodeType === Node.TEXT_NODE && node.nodeValue.replace(/[\r\n\t\s]/g, '') === '') {
                            node.remove();
                        }
                    });

                    doc.body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, th').forEach(block => {
                        while (block.lastChild && block.childNodes.length > 1) {
                            if (block.lastChild.nodeType === Node.TEXT_NODE && !block.lastChild.nodeValue.replace(/[\u200B\uFEFF\u00A0\s\r\n]/g, '')) {
                                block.lastChild.remove();
                            } else if (block.lastChild.nodeName === 'BR') {
                                block.lastChild.remove();
                            } else {
                                break;
                            }
                        }
                    });

                    let prevWasEmpty = false;
                    Array.from(doc.body.children).forEach(child => {
                        const isBlock = ['P', 'DIV'].includes(child.tagName);
                        if (isBlock) {
                            const text = child.textContent.replace(/[\u200B\uFEFF\u00A0\s]/g, '');
                            const hasMedia = child.querySelector('img, audio, input, svg, iframe, .adv-widget-shell');
                            const isEmpty = !text && !hasMedia;

                            if (isEmpty) {
                                if (prevWasEmpty) {
                                    child.remove();
                                } else {
                                    child.innerHTML = '<br>';
                                    prevWasEmpty = true;
                                }
                            } else {
                                prevWasEmpty = false;
                            }
                        } else {
                            prevWasEmpty = false;
                        }
                    });

                    while (doc.body.firstElementChild && ['P', 'DIV'].includes(doc.body.firstElementChild.tagName) && doc.body.children.length > 1) {
                        const first = doc.body.firstElementChild;
                        const text = first.textContent.replace(/[\u200B\uFEFF\u00A0\s]/g, '');
                        const hasMedia = first.querySelector('img, audio, input, svg, iframe, .adv-widget-shell');
                        if (!text && !hasMedia) first.remove();
                        else break;
                    }
                    while (doc.body.lastElementChild && ['P', 'DIV'].includes(doc.body.lastElementChild.tagName) && doc.body.children.length > 1) {
                        const last = doc.body.lastElementChild;
                        const text = last.textContent.replace(/[\u200B\uFEFF\u00A0\s]/g, '');
                        const hasMedia = last.querySelector('img, audio, input, svg, iframe, .adv-widget-shell');
                        if (!text && !hasMedia) last.remove();
                        else break;
                    }

                    finalHTML = doc.body.innerHTML;
                    finalHTML = finalHTML.replace(/^[\r\n\t]+|[\r\n\t]+$/g, '');
                    finalHTML = finalHTML.replace(/<span[^>]*class="Apple-converted-space"[^>]*>.*?<\/span>/gi, '&nbsp;');
                    finalHTML = finalHTML.replace(/<a(?![^>]*class=["'][^"']*(internal-link|file-link)[^"']*["'])[^>]*>\s*(<br\s*\/?>)?\s*<\/a>/gi, '');

                    // Trattamento spazi iniziale e finale deterministico
                    const hasBlockTags = /<\/(p|div|h[1-6]|table|ul|ol|li|blockquote|pre)>/i.test(finalHTML);
                    if (!hasBlockTags) {
                        finalHTML = finalHTML.replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '');
                        const leadingSpaces = pastedText.match(/^[ \t]*/)[0];
                        const trailingSpaces = pastedText.match(/[ \t]*$/)[0];
                        finalHTML = leadingSpaces + finalHTML + trailingSpaces;
                    } else {
                        finalHTML = finalHTML.replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '');
                    }
                }

                // =========================================================================
                // MOTORE DI FUSIONE PARAGRAFI NATURALE (BLOCK MERGING - WORD/DOCS PARITY)
                // - Se il contenuto è INLINE (1 blocco o testo semplice), si fonde nel paragrafo
                //   corrente tra testo precedente e successivo, senza spezzare la riga.
                // - Se sono PIÙ BLOCCHI: il primo si fonde con la testa, l'ultimo con la coda,
                //   ed i blocchi intermedi si inseriscono in mezzo come veri paragrafi.
                // =========================================================================
                const currentSel = window.getSelection();
                if (!currentSel.rangeCount) return;
                const currentRange = currentSel.getRangeAt(0);

                const isSimpleTextBlock = (el) => {
                    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
                    const tag = el.tagName.toUpperCase();
                    if (el.classList.contains('adv-widget-shell') || el.classList.contains('simple-table-wrapper')) return false;
                    if (!['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'].includes(tag)) return false;
                    return !el.querySelector('table, ul, ol, hr, .adv-widget-shell');
                };

                const isBlockElement = (el) => {
                    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
                    const tag = el.tagName.toUpperCase();
                    return ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'TABLE', 'HR', 'UL', 'OL'].includes(tag) ||
                           el.classList.contains('adv-widget-shell') || el.classList.contains('simple-table-wrapper');
                };

                let containerNode = currentRange.startContainer;
                let targetBlock = containerNode.nodeType === 3 ? containerNode.parentNode : containerNode;
                targetBlock = targetBlock.closest ? targetBlock.closest('p, div, li, h1, h2, h3, h4, h5, h6, blockquote') : null;
                if (targetBlock && targetBlock.id === 'noteContent') targetBlock = null;

                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = finalHTML;

                // Rimuove nodi di testo di whitespace vuoti tra blocchi per prevenire paragrafi fantasma
                Array.from(tempDiv.childNodes).forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE && !node.nodeValue.replace(/[\r\n\t\s]/g, '')) {
                        node.remove();
                    }
                });

                const hasAnyBlocks = Array.from(tempDiv.children).some(isBlockElement);
                let caretTargetNode = null;
                let caretTargetOffset = 0;

                // CASO A: Contenuto puramente inline (parole, frasi, formattazioni senza tag di blocco)
                if (!hasAnyBlocks || !targetBlock) {
                    const frag = document.createDocumentFragment();
                    while (tempDiv.firstChild) frag.appendChild(tempDiv.firstChild);
                    const lastNode = frag.lastChild;
                    currentRange.deleteContents();
                    currentRange.insertNode(frag);
                    if (lastNode) {
                        caretTargetNode = lastNode;
                        caretTargetOffset = lastNode.nodeType === Node.TEXT_NODE ? lastNode.nodeValue.length : 1;
                    }
                } else {
                    // CASO B: Il contenuto incollato contiene uno o più blocchi
                    const normalizedBlocks = [];
                    let inlineBuffer = [];

                    const flushInlineBuffer = () => {
                        if (inlineBuffer.length > 0) {
                            const hasRealContent = inlineBuffer.some(n => 
                                (n.nodeType === Node.TEXT_NODE && n.nodeValue.replace(/[\r\n\t\s\u200B\uFEFF]/g, '') !== '') ||
                                (n.nodeType === Node.ELEMENT_NODE && (n.tagName === 'BR' || n.tagName === 'IMG' || n.textContent.trim() !== ''))
                            );
                            if (hasRealContent) {
                                const p = document.createElement('p');
                                inlineBuffer.forEach(n => p.appendChild(n));
                                normalizedBlocks.push(p);
                            }
                            inlineBuffer = [];
                        }
                    };

                    Array.from(tempDiv.childNodes).forEach(node => {
                        if (isBlockElement(node)) {
                            flushInlineBuffer();
                            normalizedBlocks.push(node);
                        } else {
                            inlineBuffer.push(node);
                        }
                    });
                    flushInlineBuffer();

                    const isTargetEmpty = targetBlock.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim() === '' &&
                                          !targetBlock.querySelector('img, audio, iframe, input, svg, .adv-widget-shell');

                    if (isTargetEmpty) {
                        // Paragrafo corrente vuoto: viene sostituito integralmente dai blocchi incollati
                        const parent = targetBlock.parentNode;
                        let lastInserted = null;
                        normalizedBlocks.forEach(b => {
                            parent.insertBefore(b, targetBlock);
                            lastInserted = b;
                        });
                        targetBlock.remove();

                        if (lastInserted) {
                            caretTargetNode = lastInserted;
                            caretTargetOffset = isBlockElement(lastInserted) ? -1 : lastInserted.childNodes.length;
                        }
                    } else {
                        // Paragrafo corrente non vuoto: estrazione della coda e fusione contestuale
                        const postRange = currentRange.cloneRange();
                        postRange.selectNodeContents(targetBlock);
                        postRange.setStart(currentRange.startContainer, currentRange.startOffset);
                        const tailFrag = postRange.extractContents();

                        while (targetBlock.lastChild && targetBlock.lastChild.nodeName === 'BR' && targetBlock.childNodes.length > 1) {
                            targetBlock.lastChild.remove();
                        }

                        if (normalizedBlocks.length === 1 && isSimpleTextBlock(normalizedBlocks[0])) {
                            // SINGOLO BLOCCO: Fonde tutto inline dentro targetBlock senza spezzare la riga
                            const singleBlock = normalizedBlocks[0];
                            const caretMarker = document.createTextNode('');

                            while (singleBlock.firstChild) {
                                targetBlock.appendChild(singleBlock.firstChild);
                            }

                            targetBlock.appendChild(caretMarker);
                            targetBlock.appendChild(tailFrag);

                            if (targetBlock.childNodes.length === 0) {
                                targetBlock.innerHTML = '<br>';
                            }

                            const newRange = document.createRange();
                            newRange.setStartAfter(caretMarker);
                            newRange.collapse(true);
                            currentSel.removeAllRanges();
                            currentSel.addRange(newRange);
                            caretMarker.remove();
                        } else {
                            // DUE O PIÙ BLOCCHI: Fusione primo con la testa, ultimo con la coda
                            const firstBlock = normalizedBlocks[0];
                            const lastBlock = normalizedBlocks[normalizedBlocks.length - 1];
                            let middleBlocks = normalizedBlocks.slice(1, -1);

                            // Rispetto semantico delle liste: se ci troviamo dentro un <li>, tutti i blocchi devono essere <li>
                            const isInsideList = targetBlock.tagName === 'LI';
                            if (isInsideList) {
                                middleBlocks = middleBlocks.map(b => {
                                    if (b.tagName !== 'LI') {
                                        const li = document.createElement('li');
                                        if (targetBlock.className) li.className = targetBlock.className;
                                        while (b.firstChild) li.appendChild(b.firstChild);
                                        return li;
                                    }
                                    return b;
                                });
                            }

                            if (isSimpleTextBlock(firstBlock)) {
                                while (firstBlock.firstChild) {
                                    targetBlock.appendChild(firstBlock.firstChild);
                                }
                            } else {
                                targetBlock.parentNode.insertBefore(firstBlock, targetBlock.nextSibling);
                            }

                            let insertRef = targetBlock;
                            middleBlocks.forEach(b => {
                                targetBlock.parentNode.insertBefore(b, insertRef.nextSibling);
                                insertRef = b;
                            });

                            if (isSimpleTextBlock(lastBlock)) {
                                let finalBlock = lastBlock;
                                if (isInsideList && lastBlock.tagName !== 'LI') {
                                    const li = document.createElement('li');
                                    if (targetBlock.className) li.className = targetBlock.className;
                                    while (lastBlock.firstChild) li.appendChild(lastBlock.firstChild);
                                    finalBlock = li;
                                }

                                const caretMarker = document.createTextNode('');
                                finalBlock.appendChild(caretMarker);
                                finalBlock.appendChild(tailFrag);
                                targetBlock.parentNode.insertBefore(finalBlock, insertRef.nextSibling);

                                const newRange = document.createRange();
                                newRange.setStartAfter(caretMarker);
                                newRange.collapse(true);
                                currentSel.removeAllRanges();
                                currentSel.addRange(newRange);
                                caretMarker.remove();
                            } else {
                                targetBlock.parentNode.insertBefore(lastBlock, insertRef.nextSibling);
                                insertRef = lastBlock;

                                const hasTailContent = tailFrag.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim() !== '' ||
                                                       tailFrag.querySelector('img, audio, input, svg, iframe, .adv-widget-shell');
                                if (hasTailContent) {
                                    const nextP = document.createElement(targetBlock.tagName || 'p');
                                    nextP.appendChild(tailFrag);
                                    targetBlock.parentNode.insertBefore(nextP, insertRef.nextSibling);
                                    
                                    const newRange = document.createRange();
                                    newRange.setStart(nextP, 0);
                                    newRange.collapse(true);
                                    currentSel.removeAllRanges();
                                    currentSel.addRange(newRange);
                                } else {
                                    const newRange = document.createRange();
                                    newRange.setStartAfter(lastBlock);
                                    newRange.collapse(true);
                                    currentSel.removeAllRanges();
                                    currentSel.addRange(newRange);
                                }
                            }
                        }
                    }
                }

                // Posizionamento cursore su sostituzione blocco vuoto
                if (caretTargetNode && document.body.contains(caretTargetNode)) {
                    const newRange = document.createRange();
                    if (caretTargetNode.nodeType === Node.TEXT_NODE) {
                        const safeOffset = Math.min(caretTargetOffset, caretTargetNode.nodeValue.length);
                        newRange.setStart(caretTargetNode, safeOffset);
                        newRange.collapse(true);
                    } else if (isBlockElement(caretTargetNode)) {
                        newRange.selectNodeContents(caretTargetNode);
                        newRange.collapse(false);
                    } else {
                        newRange.setStartAfter(caretTargetNode);
                        newRange.collapse(true);
                    }
                    currentSel.removeAllRanges();
                    currentSel.addRange(newRange);
                }

                Editor._ensureLastLineBreak(document.getElementById('noteContent'));
                if (typeof Editor.healFontArtifacts === 'function') {
                    Editor.healFontArtifacts(document.getElementById('noteContent'));
                }

                if (typeof WidgetManager !== 'undefined') {
                    WidgetManager.mountAll();
                    Store.triggerAutoSave();
                }

            } finally {
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

// INTERCETTORE DIRETTO E ISTANTANEO INCOLLA PER NOTE INLINE E SEGNALIBRI
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
        // Testo semplice: preservazione rigorosa di tutti gli spazi iniziali, intermedi e finali
        let formatted = pastedText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        formatted = formatted.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
        formatted = formatted.replace(/ {2,}/g, m => '&nbsp;'.repeat(m.length));
        if (formatted.startsWith(' ')) formatted = '&nbsp;' + formatted.slice(1);
        if (formatted.endsWith(' ')) formatted = formatted.slice(0, -1) + '&nbsp;';
        formatted = formatted.replace(/\r\n|\n|\r/g, '<br>');
        cleanHTML = formatted;
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cleanHTML;
        const frag = document.createDocumentFragment();
        while (tempDiv.firstChild) frag.appendChild(tempDiv.firstChild);
        const lastChild = frag.lastChild;
        range.insertNode(frag);
        if (lastChild) {
            const newRange = document.createRange();
            newRange.setStartAfter(lastChild);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
        }
    }
}, true);