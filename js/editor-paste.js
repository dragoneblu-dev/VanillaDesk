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
 * - FIX CARET UNCOLLAPSED ON WIDGET PASTE: Riposizionamento e collasso esatto del cursore alla fine del testo
 *   incollato all'interno di Snippet Copiabili e celle di Tabelle Semplici, eliminando la selezione persistente del testo.
 * - REFACTOR DRY: Centralizzazione di _formatTextToInlineHTML e _insertInlineHTMLAndCollapse per eliminare
 *   duplicazioni di codice tra snippet, tabelle, liste e mini-editor.
 * - FEAT PERSISTENT ASSET STORAGE FOR PASTED IMAGES: Salvataggio fisico automatico delle immagini (sia da screenshot
 *   singolo, sia incorporate nel testo copiato da Word, OneNote o Web) nella cartella assets/ del Workspace tramite Store.saveAsset.
 * - FIX WORD CLIPBOARD IMAGES EXTRACTION: Risoluzione dell'eliminazione accidentale delle immagini di Word da regex condizionale
 *   ed estrazione automatica dei dati binari da RTF (\pict) tramite rilevamento magic bytes (FFD8FF per JPEG, 89504E47 per PNG)
 *   per immagini con percorsi file:/// non accessibili dal browser.
 * - FIX PRESERVE ADJACENT SPACES ON PASTE: Risolto alla radice l'annientamento dello spazio precedente
 *   durante la sostituzione di una parola selezionata, sostituendo execCommand('delete') con Range.deleteContents()
 *   per disinnescare l'euristica "Smart Delete" di Chromium.
 * - FIX ROOT BR ISOLATION: Ogni <br> a livello root viene convertito direttamente in <p><br></p>,
 *   impedendo l'inserimento di tag <br> sparsi direttamente come figli di #noteContent o blocchi <p><br><br>...</p>.
 * - FIX WEB IMAGES CORS FALLBACK: Gestione unificata di download e fallback per immagini web remote senza errori di rete fetch().
 * - FIX ASYNC PASTE CARET PRESERVATION: Ancoraggio preventivo sincrono nel DOM vivo prima del download asincrono delle immagini,
 *   prevenendo la perdita del range d'inserimento causata dal rilascio del focus durante operazioni asincrone.
 * - FIX ANCHORED IMAGES BUFFER PRUNING: Corretto controllo hasRealContent in flushInlineBuffer per rilevare tag <a>
 *   o contenitori inline che racchiudono immagini (<img>) prive di testo diretto, prevenendone lo scarto accidentale.
 * - FEAT LINK PRESERVATION & BLOCK INVERSION: Preservazione integrale dei tag <a> attorno alle immagini con corretta
 *   inversione gerarchica (<p><a href="..."><img></a></p>) per eliminare nesting illegali e tag link orfani a livello root.
 */

Object.assign(Editor, {

    // Helper per convertire testo puro in HTML inline preservando spaziature, tab e ritorni a capo
    _formatTextToInlineHTML: (text) => {
        if (!text) return "";
        return text.replace(/&/g, '&amp;')
                   .replace(/</g, '&lt;')
                   .replace(/>/g, '&gt;')
                   .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')
                   .replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length))
                   .replace(/\r\n|\n|\r/g, '<br>');
    },

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

    // Procedura snella per acquisire, comprimere e salvare un'immagine su disco (in assets/)
    // Supporta file binari, data-URI Base64 e URL web con fallback pulito
    saveImageSource: async (source) => {
        if (!source) return null;

        try {
            let blob = null;

            if (typeof source === 'string') {
                if (source.startsWith('data:image/')) {
                    const res = await fetch(source);
                    if (res.ok) blob = await res.blob();
                } else if (source.startsWith('http://') || source.startsWith('https://')) {
                    const res = await fetch(source);
                    if (res.ok) blob = await res.blob();
                }
            } else if (source instanceof Blob) {
                blob = source;
            }

            if (!blob || !blob.type || !blob.type.startsWith('image/')) {
                return null;
            }

            return await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = async () => {
                        const MAX_WIDTH = 1600;
                        let width = img.width;
                        let height = img.height;
                        if (width > MAX_WIDTH) {
                            height = Math.round((height * MAX_WIDTH) / width);
                            width = MAX_WIDTH;
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        canvas.toBlob(async (compressedBlob) => {
                            const finalBlob = compressedBlob || blob;
                            let fileName = null;
                            let blobUrl = null;

                            // PERSISTENZA SU DISCO: Salva fisicamente il file WebP nella cartella assets/ del Workspace
                            if (AppState.assetsHandle && typeof Store !== 'undefined' && typeof Store.saveAsset === 'function') {
                                const file = new File([finalBlob], `img_${Date.now()}.webp`, { type: 'image/webp' });
                                fileName = await Store.saveAsset(file, 'img');
                                if (fileName && Editor.imageCache && Editor.imageCache[fileName]) {
                                    blobUrl = Editor.imageCache[fileName];
                                }
                            }

                            // Fallback per sessione temporanea in sola RAM
                            if (!fileName) {
                                fileName = 'img_' + (typeof Store !== 'undefined' ? Store.generateId() : Date.now()) + '.webp';
                                blobUrl = URL.createObjectURL(finalBlob);
                                if (!Editor.imageCache) Editor.imageCache = {};
                                Editor.imageCache[fileName] = blobUrl;
                            }

                            resolve({ fileName, blobUrl });
                        }, 'image/webp', 0.85);
                    };
                    img.onerror = () => resolve(null);
                    img.src = ev.target.result;
                };
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch (_) {
            return null;
        }
    },

    // Estrae in modo deterministico le immagini binarie memorizzate nel formato RTF di Word tramite scansione dei Magic Bytes
    _extractImagesFromWordRTF: (rtfText) => {
        if (!rtfText || typeof rtfText !== 'string' || !rtfText.includes('\\pict')) return [];
        const extractedBlobs = [];

        let searchIndex = 0;
        while ((searchIndex = rtfText.indexOf('\\pict', searchIndex)) !== -1) {
            let depth = 1;
            let startPos = searchIndex;
            let endPos = -1;

            let openBracePos = rtfText.lastIndexOf('{', searchIndex);
            let scanStart = openBracePos !== -1 ? openBracePos + 1 : searchIndex + 5;

            for (let i = scanStart; i < rtfText.length; i++) {
                const char = rtfText.charAt(i);
                if (char === '{') depth++;
                else if (char === '}') {
                    depth--;
                    if (depth === 0) {
                        endPos = i;
                        break;
                    }
                }
            }

            if (endPos === -1) endPos = Math.min(rtfText.length, searchIndex + 2000000);
            const pictBlock = rtfText.substring(startPos, endPos);
            searchIndex = endPos;

            const lowerPict = pictBlock.toLowerCase();
            let isPng = lowerPict.includes('pngblip') || lowerPict.includes('89504e47');
            let isJpeg = lowerPict.includes('jpegblip') || lowerPict.includes('jpgblip') || lowerPict.includes('ffd8ff');

            if (!isPng && !isJpeg) continue;

            const mimeType = isPng ? 'image/png' : 'image/jpeg';
            const magicHeader = isPng ? '89504e47' : 'ffd8ff';
            let hexStart = lowerPict.indexOf(magicHeader);

            if (hexStart === -1) {
                const matchFallback = lowerPict.match(/[\r\n\s]([0-9a-f]{32,})/i);
                if (matchFallback) {
                    hexStart = lowerPict.indexOf(matchFallback[1]);
                }
            }

            if (hexStart === -1) continue;

            const hexRaw = pictBlock.substring(hexStart);
            const cleanHex = hexRaw.replace(/[^0-9a-fA-F]/g, '');

            if (cleanHex.length >= 64) {
                try {
                    const byteLen = Math.floor(cleanHex.length / 2);
                    const bytes = new Uint8Array(byteLen);
                    for (let b = 0; b < byteLen; b++) {
                        bytes[b] = parseInt(cleanHex.substr(b * 2, 2), 16);
                    }
                    extractedBlobs.push(new Blob([bytes], { type: mimeType }));
                } catch (_) {}
            }
        }

        return extractedBlobs;
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

        const items = Array.from((e.clipboardData || e.originalEvent.clipboardData).items);
        let isSinglePureImage = false;

        // 1. GESTIONE SCREENSHOT O SINGOLO FILE IMMAGINE PURO (Senza testo di contorno)
        const hasTextContent = (pastedText && pastedText.trim().length > 0) || (pastedHTML && pastedHTML.replace(/<[^>]*>/g, '').trim().length > 0);
        if (!isSpreadsheetData && !isFromOfficeOrExcel && !hasTextContent) {
            for (let item of items) {
                if (item.kind === 'file' && item.type.includes('image/')) {
                    e.preventDefault();
                    isSinglePureImage = true;
                    
                    const fileOrBlob = item.getAsFile();
                    if (!fileOrBlob) return;

                    Editor.saveSnapshot();

                    if (typeof UI !== 'undefined' && UI.showToast) {
                        UI.showToast(typeof I18n !== 'undefined' && typeof I18n.t === 'function' ? I18n.t('editor_core.toast_saving_image') : "Salvataggio immagine su disco in corso...", "info");
                    }

                    Editor.saveImageSource(fileOrBlob).then(saved => {
                        if (!saved) return;

                        const imgNode = document.createElement('img');
                        imgNode.src = saved.blobUrl;
                        imgNode.setAttribute('data-image-ref', saved.fileName);
                        imgNode.setAttribute('alt', 'Immagine');
                        imgNode.setAttribute('onerror', 'Editor.handleImageError(this)');

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

                        if (typeof Store !== 'undefined') {
                            Store.triggerAutoSave();
                        }
                    });
                    return;
                }
            }
        }

        if (isSinglePureImage) return;
        
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

        // =========================================================================
        // ANCORAGGIO PREVENTIVO NEL DOM VIVO (Previene perdita del range su await)
        // =========================================================================
        const editorRootEl = document.getElementById('noteContent');
        let preAsyncAnchorMarker = null;

        if (sel.rangeCount > 0 && editorRootEl && editorRootEl.contains(sel.anchorNode)) {
            const rawRange = sel.getRangeAt(0);
            if (!rawRange.collapsed) {
                rawRange.deleteContents();
            }
            preAsyncAnchorMarker = document.createElement('span');
            preAsyncAnchorMarker.id = 'paste-anchor-temp-' + Date.now();
            preAsyncAnchorMarker.style.display = 'none';
            rawRange.insertNode(preAsyncAnchorMarker);
        }

        const processPaste = async () => {
            try {
                Editor.saveSnapshot();

                const rawPastedText = (pastedText || '').trim();
                const hasImagesInHTML = pastedHTML && /<img\b/i.test(pastedHTML);
                // Non trattare come URL web se l'HTML veicola immagini (es. Google Immagini che fornisce l'URL in text/plain)
                const isSingleWebUrl = !hasImagesInHTML && /^https?:\/\/[^\s]+$/i.test(rawPastedText);
                const isCodeContext = targetNode.closest && !!targetNode.closest('.code-content, [data-widget-type="code"]');

                // Gestione incolla link web
                if (!isInsideWidget && !isCodeContext && !snippetText && isSingleWebUrl) {
                    if (preAsyncAnchorMarker && preAsyncAnchorMarker.parentNode) {
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
                    if (preAsyncAnchorMarker && preAsyncAnchorMarker.parentNode) {
                        preAsyncAnchorMarker.remove();
                        preAsyncAnchorMarker = null;
                    }

                    const isEditable = WidgetManager.isInsideEditableWidgetArea(targetNode) || !!targetNode.closest('.simple-table-wrapper td, .simple-table-wrapper th');
                    
                    if (!isEditable) {
                        alert(I18n.t('editor_alerts.paste_invalid_area'));
                        return;
                    }

                    if (snippetText || targetNode.closest('.simple-table-wrapper td, .simple-table-wrapper th')) {
                        const inlineHtml = Editor._formatTextToInlineHTML(pastedText);
                        Editor._insertInlineHTMLAndCollapse(inlineHtml, sel.getRangeAt(0), sel);
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
                        document.execCommand('insertText', false, cleanText);
                    }
                    Store.triggerAutoSave();
                    return;
                }

                const freshSel = window.getSelection();
                let currentTargetNode = (freshSel && freshSel.rangeCount > 0) ? freshSel.anchorNode : null;
                if (currentTargetNode && currentTargetNode.nodeType === 3) currentTargetNode = currentTargetNode.parentNode;

                let finalHTML = '';

                // GESTIONE INCOLLA TESTO PIATTO
                if (!pastedHTML) {
                    if (preAsyncAnchorMarker && preAsyncAnchorMarker.parentNode) {
                        preAsyncAnchorMarker.remove();
                        preAsyncAnchorMarker = null;
                    }

                    if (!currentTargetNode || !currentTargetNode.closest('td, th, li, pre')) {
                        if (!pastedText.includes('\n')) {
                            document.execCommand('insertText', false, pastedText);
                            Store.triggerAutoSave();
                            return;
                        } else {
                            finalHTML = Editor._formatPlainTextForHTML(pastedText);
                        }
                    } else if (currentTargetNode.closest('td, th, li')) {
                        const inlineHtml = Editor._formatTextToInlineHTML(pastedText);
                        Editor._insertInlineHTMLAndCollapse(inlineHtml, freshSel.getRangeAt(0), freshSel);
                        Store.triggerAutoSave();
                        return;
                    } else {
                        document.execCommand('insertText', false, pastedText);
                        Store.triggerAutoSave();
                        return;
                    }
                } else {
                    // GESTIONE INCOLLA HTML (RICH TEXT CON IMMAGINI DA WORD/DOCS/WEB)
                    const cleanRawHTML = pastedHTML
                        .replace(/<!--\[if\s+gte\s+vml\s+1\][\s\S]*?<!\[endif\]-->/gi, '')
                        .replace(/<!\[if\s+!vml\]>/gi, '')
                        .replace(/<!\[endif\]>/gi, '')
                        .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '');

                    const parser = new DOMParser();
                    const doc = parser.parseFromString(cleanRawHTML, 'text/html');

                    // =========================================================================
                    // ELABORAZIONE E SALVATAGGIO FISICO DELLE IMMAGINI INCORPORATE NEL TESTO
                    // =========================================================================
                    const docImages = Array.from(doc.querySelectorAll('img'));

                    if (docImages.length > 0) {
                        const clipboardImageFiles = items
                            .filter(it => it.kind === 'file' && it.type && it.type.startsWith('image/'))
                            .map(it => it.getAsFile())
                            .filter(Boolean);

                        const rtfImages = Editor._extractImagesFromWordRTF(pastedRTF);

                        let clipImgIdx = 0;
                        let rtfImgIdx = 0;

                        for (const imgEl of docImages) {
                            let src = imgEl.getAttribute('src') || '';
                            let saved = null;

                            // Caso A: Immagine Base64 incorporata (Word, OneNote, rich text)
                            if (src.startsWith('data:image/')) {
                                saved = await Editor.saveImageSource(src);
                            }
                            // Caso B: Percorso locale file:/// di Word desktop -> risoluzione via RTF o file clipboard
                            else if (src.startsWith('file:///') || src.startsWith('file:\\\\\\') || !src) {
                                if (rtfImgIdx < rtfImages.length) {
                                    saved = await Editor.saveImageSource(rtfImages[rtfImgIdx++]);
                                } else if (clipImgIdx < clipboardImageFiles.length) {
                                    saved = await Editor.saveImageSource(clipboardImageFiles[clipImgIdx++]);
                                }
                            }
                            // Caso C: Immagine web remota (Google Docs, Google Immagini o siti web)
                            else if (src.startsWith('http://') || src.startsWith('https://')) {
                                saved = await Editor.saveImageSource(src);
                            }

                            if (saved) {
                                imgEl.setAttribute('data-image-ref', saved.fileName);
                                imgEl.setAttribute('src', saved.blobUrl);
                                imgEl.setAttribute('onerror', 'Editor.handleImageError(this)');
                            } else if (src.startsWith('file:///') || src.startsWith('file:\\\\\\')) {
                                imgEl.remove();
                            }
                        }
                    }

                    // =========================================================================
                    // INVERSIONE SEMANTICA E RISANAMENTO DEI LINK ANOMALI (<a> ATTORNO A BLOCCHI)
                    // Garantisce che i link <a> non vengano persi, ma che nessun <p> stia dentro un <a>
                    // =========================================================================
                    doc.querySelectorAll('a').forEach(aEl => {
                        const blocksInside = aEl.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, table, ul, ol, blockquote');
                        if (blocksInside.length > 0) {
                            // Se un <a> racchiude dei blocchi, inverte la gerarchia: ciascun blocco interno eredita il link
                            const href = aEl.getAttribute('href');
                            const targetAttr = aEl.getAttribute('target');
                            const parent = aEl.parentNode;

                            if (parent) {
                                const frag = doc.createDocumentFragment();
                                while (aEl.firstChild) {
                                    const child = aEl.firstChild;
                                    if (child.nodeType === Node.ELEMENT_NODE && ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI'].includes(child.tagName)) {
                                        // Avvolge il contenuto del blocco dentro un <a> con lo stesso href originario
                                        const innerLink = doc.createElement('a');
                                        if (href) innerLink.setAttribute('href', href);
                                        if (targetAttr) innerLink.setAttribute('target', targetAttr);
                                        while (child.firstChild) innerLink.appendChild(child.firstChild);
                                        child.appendChild(innerLink);
                                        frag.appendChild(child);
                                    } else {
                                        frag.appendChild(child);
                                    }
                                }
                                parent.replaceChild(frag, aEl);
                            }
                        }
                    });

                    // FASE 0: RIMOZIONE TAG INTRUSIVI E PROPRIETARI OFFICE
                    doc.querySelectorAll('script, style, meta, link, iframe, object, embed, noscript, o\\:p, o-p, w\\:sdt').forEach(el => el.remove());

                    Array.from(doc.body.querySelectorAll('*')).forEach(el => {
                        const t = el.tagName.toUpperCase();
                        if (t.startsWith('O:') || t.startsWith('W:') || t.startsWith('M:') || t === 'O-P') {
                            el.remove();
                        }
                    });

                    // Rimuove commenti invisibili
                    const iter = doc.createNodeIterator(doc.body, NodeFilter.SHOW_COMMENT, null, false);
                    let commentNode;
                    const commentsToRemove = [];
                    while ((commentNode = iter.nextNode())) commentsToRemove.push(commentNode);
                    commentsToRemove.forEach(c => c.remove());

                    // Normalizzazione b/strong di Google Docs
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

                    // Conversione preventiva <font> in <span>
                    doc.querySelectorAll('font').forEach(fontEl => {
                        const span = doc.createElement('span');
                        while (fontEl.attributes.length > 0) {
                            span.setAttribute(fontEl.attributes[0].name, fontEl.attributes[0].value);
                            fontEl.removeAttribute(fontEl.attributes[0].name);
                        }
                        while (fontEl.firstChild) span.appendChild(fontEl.firstChild);
                        fontEl.parentNode.replaceChild(span, fontEl);
                    });

                    // FASE 0.5: Incapsulamento tag <li> orfani
                    const orphanLis = Array.from(doc.body.children).filter(el => el.tagName === 'LI');
                    if (orphanLis.length > 0) {
                        const wrapUl = doc.createElement('ul');
                        doc.body.insertBefore(wrapUl, orphanLis[0]);
                        orphanLis.forEach(li => wrapUl.appendChild(li));
                    }

                    // FASE 0.8: Conversione elenchi Word in <ol> e <ul>
                    Editor._convertWordListsToHTML(doc.body);

                    // Re-idratazione ID widget incollati
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

                    // FASE 1: Conversione semantica stili di testo
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

                    // FASE 2: Srotolamento <p> dentro <li>
                    doc.querySelectorAll('li > p').forEach(pInsideLi => {
                        const li = pInsideLi.parentNode;
                        if (li && li.tagName === 'LI' && li.children.length === 1) {
                            while (pInsideLi.firstChild) li.insertBefore(pInsideLi.firstChild, pInsideLi);
                            pInsideLi.remove();
                        }
                    });

                    // FASE 3: Normalizzazione celle tabelle
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

                    // FASE 3.2: Incapsulamento tabelle in .simple-table-wrapper
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

                    // FASE 4: SANIFICAZIONE PROFONDA UNIFICATA (Editor.cleanDOMTree normalizza anche i <br> in <p>)
                    if (typeof Editor !== 'undefined' && typeof Editor.cleanDOMTree === 'function') {
                        Editor.cleanDOMTree(doc.body);
                    }

                    // PULIZIA SELETTIVA DEI SOLI LINK FANTASMA VERAMENTE VUOTI:
                    // Rimuove esclusivamente i tag <a> che non contengono testo e non contengono immagini/media
                    doc.querySelectorAll('a').forEach(aEl => {
                        if (aEl.classList.contains('internal-link') || aEl.classList.contains('file-link')) return;
                        const text = (aEl.textContent || '').replace(/[\u200B\uFEFF\u00A0\s\r\n]/g, '');
                        const hasMedia = !!aEl.querySelector('img, audio, video, svg, iframe');
                        if (!text && !hasMedia) {
                            aEl.remove();
                        }
                    });

                    // FASE 5: Rimozione nodi di testo vuoti ai margini del body (senza eliminare righe vuote intenzionali)
                    Array.from(doc.body.childNodes).forEach(node => {
                        if (node.nodeType === Node.TEXT_NODE && node.nodeValue.replace(/[\r\n\t\s]/g, '') === '') {
                            node.remove();
                        }
                    });

                    // Rimozione nodi vuoti orfani estremi solo se il documento ha più di un elemento
                    while (doc.body.firstElementChild && ['P', 'DIV'].includes(doc.body.firstElementChild.tagName) && doc.body.children.length > 1) {
                        const first = doc.body.firstElementChild;
                        const text = first.textContent.replace(/[\u200B\uFEFF\u00A0\s]/g, '');
                        const hasMedia = first.querySelector('img, audio, input, svg, iframe, .adv-widget-shell');
                        if (!text && !hasMedia && first.querySelectorAll('br').length === 0) first.remove();
                        else break;
                    }
                    while (doc.body.lastElementChild && ['P', 'DIV'].includes(doc.body.lastElementChild.tagName) && doc.body.children.length > 1) {
                        const last = doc.body.lastElementChild;
                        const text = last.textContent.replace(/[\u200B\uFEFF\u00A0\s]/g, '');
                        const hasMedia = last.querySelector('img, audio, input, svg, iframe, .adv-widget-shell');
                        if (!text && !hasMedia && last.querySelectorAll('br').length === 0) last.remove();
                        else break;
                    }

                    finalHTML = doc.body.innerHTML;
                    finalHTML = finalHTML.replace(/^[\r\n\t]+|[\r\n\t]+$/g, '');
                    finalHTML = finalHTML.replace(/<span[^>]*class="Apple-converted-space"[^>]*>.*?<\/span>/gi, '&nbsp;');

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
                // INSERIMENTO NEL DOM E FUSIONE NATURALE PARAGRAFI
                // =========================================================================
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = finalHTML;

                Array.from(tempDiv.childNodes).forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE && !node.nodeValue.replace(/[\r\n\t\s]/g, '')) {
                        node.remove();
                    }
                });

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

                const hasAnyBlocks = Array.from(tempDiv.children).some(isBlockElement);
                let caretTargetNode = null;
                let caretTargetOffset = 0;

                // Determinazione del blocco contenitore (targetBlock) usando l'ancora o la selezione
                let targetBlock = null;
                if (preAsyncAnchorMarker && preAsyncAnchorMarker.parentNode) {
                    targetBlock = preAsyncAnchorMarker.closest('p, div, li, h1, h2, h3, h4, h5, h6, blockquote');
                    if (targetBlock && targetBlock.id === 'noteContent') targetBlock = null;
                }

                // CASO A: Contenuto puramente inline (es. immagine singola, frase o link)
                if (!hasAnyBlocks || !targetBlock) {
                    const frag = document.createDocumentFragment();

                    if (!targetBlock && !hasAnyBlocks) {
                        let curP = document.createElement('p');
                        while (tempDiv.firstChild) {
                            const c = tempDiv.firstChild;
                            if (c.nodeType === Node.ELEMENT_NODE && c.tagName === 'BR') {
                                c.remove();
                                if (curP.childNodes.length === 0) curP.innerHTML = '<br>';
                                frag.appendChild(curP);
                                curP = document.createElement('p');
                            } else {
                                curP.appendChild(c);
                            }
                        }
                        if (curP.childNodes.length > 0) {
                            frag.appendChild(curP);
                        } else if (frag.childNodes.length === 0) {
                            curP.innerHTML = '<br>';
                            frag.appendChild(curP);
                        }
                    } else {
                        while (tempDiv.firstChild) frag.appendChild(tempDiv.firstChild);
                    }

                    const lastNode = frag.lastChild;

                    if (preAsyncAnchorMarker && preAsyncAnchorMarker.parentNode) {
                        preAsyncAnchorMarker.parentNode.insertBefore(frag, preAsyncAnchorMarker);
                        preAsyncAnchorMarker.remove();
                        preAsyncAnchorMarker = null;
                    } else if (sel.rangeCount > 0) {
                        const curRange = sel.getRangeAt(0);
                        curRange.deleteContents();
                        curRange.insertNode(frag);
                    } else if (editorRootEl) {
                        editorRootEl.appendChild(frag);
                    }

                    if (lastNode) {
                        caretTargetNode = lastNode;
                        caretTargetOffset = lastNode.nodeType === Node.TEXT_NODE ? lastNode.nodeValue.length : 1;
                    }
                } else {
                    // CASO B: Contenuto strutturato con blocchi multipli
                    const normalizedBlocks = [];
                    let inlineBuffer = [];

                    const flushInlineBuffer = () => {
                        if (inlineBuffer.length > 0) {
                            // Riconosce nodi con testo reale O elementi multimediali/immagini (anche se racchiusi in tag <a> o <span>)
                            const hasRealContent = inlineBuffer.some(n => 
                                (n.nodeType === Node.TEXT_NODE && n.nodeValue.replace(/[\r\n\t\s\u200B\uFEFF]/g, '') !== '') ||
                                (n.nodeType === Node.ELEMENT_NODE && (
                                    n.tagName === 'BR' || 
                                    n.tagName === 'IMG' || 
                                    n.querySelector('img, audio, video, iframe, input, svg') !== null || 
                                    n.textContent.trim() !== ''
                                ))
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
                        } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
                            flushInlineBuffer();
                            const p = document.createElement('p');
                            p.innerHTML = '<br>';
                            normalizedBlocks.push(p);
                        } else {
                            inlineBuffer.push(node);
                        }
                    });
                    flushInlineBuffer();

                    const isTargetEmpty = targetBlock.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim() === '' &&
                                          !targetBlock.querySelector('img, audio, iframe, input, svg, .adv-widget-shell');

                    if (isTargetEmpty) {
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
                        // Inserimento con preservazione del punto d'ancoraggio nel blocco
                        const frag = document.createDocumentFragment();
                        normalizedBlocks.forEach(b => frag.appendChild(b));
                        const lastNode = frag.lastChild;

                        if (preAsyncAnchorMarker && preAsyncAnchorMarker.parentNode) {
                            preAsyncAnchorMarker.parentNode.insertBefore(frag, preAsyncAnchorMarker);
                            preAsyncAnchorMarker.remove();
                            preAsyncAnchorMarker = null;
                        } else {
                            targetBlock.parentNode.insertBefore(frag, targetBlock.nextSibling);
                        }

                        if (lastNode) {
                            caretTargetNode = lastNode;
                            caretTargetOffset = isBlockElement(lastNode) ? -1 : lastNode.childNodes.length;
                        }
                    }
                }

                // =========================================================================
                // NORMALIZZAZIONE STRUTTURALE ROOT: QUALSIASI INLINE ORFANO VIENE AVVOLTO IN <p>
                // Impedisce che tag <a> o <img> restino nudi direttamente sotto #noteContent
                // =========================================================================
                if (editorRootEl) {
                    Array.from(editorRootEl.childNodes).forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const isBlock = isBlockElement(node);
                            if (!isBlock) {
                                const p = document.createElement('p');
                                editorRootEl.insertBefore(p, node);
                                p.appendChild(node);
                            }
                        } else if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
                            const p = document.createElement('p');
                            editorRootEl.insertBefore(p, node);
                            p.appendChild(node);
                        }
                    });
                }

                // Ripristino del cursore e del focus
                if (editorRootEl && document.activeElement !== editorRootEl && !editorRootEl.contains(document.activeElement)) {
                    editorRootEl.focus({ preventScroll: true });
                }

                const finalSel = window.getSelection();
                if (caretTargetNode && document.body.contains(caretTargetNode) && finalSel) {
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
                    finalSel.removeAllRanges();
                    finalSel.addRange(newRange);
                    if (typeof Editor !== 'undefined') {
                        Editor.savedRange = newRange.cloneRange();
                    }
                }

                Editor._ensureLastLineBreak(document.getElementById('noteContent'));
                if (typeof Editor.healFontArtifacts === 'function') {
                    Editor.healFontArtifacts(document.getElementById('noteContent'));
                }

                // Sincronizzazione immediata della nota in RAM
                if (AppState.currentNoteId) {
                    const note = Store.getNote(AppState.currentNoteId);
                    if (note && typeof Editor.getCleanHTML === 'function') {
                        note.content = Editor.getCleanHTML();
                        note._isDirty = true;
                        note.updatedAt = new Date().toISOString();
                    }
                }

                if (typeof WidgetManager !== 'undefined') {
                    WidgetManager.mountAll();
                    Store.triggerAutoSave();
                }

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
        cleanHTML = Editor._formatTextToInlineHTML(pastedText);
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        Editor._insertInlineHTMLAndCollapse(cleanHTML, sel.getRangeAt(0), sel);
    }
}, true);