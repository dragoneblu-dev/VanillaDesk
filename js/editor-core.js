/**
 * editor-core.js
 * Inizializzazione editor e core engine (Caret, Boundaries, RawText e Sanificazione JSON).
 * Scansione transitiva centralizzata delegata a Store.cleanOrphanedRAMCaches per tutelare database relazionali, template e asset.
 * Re-idratazione immediata post-salvataggio con rilevamento immagini non trovate e placeholder SVG.
 * Normalizzazione e ripristino deterministico dei cuscinetti Zero-Width Space (\u200B) ed estirpazione degli orfani.
 * Inseriti .adv-board-card e gli eventi calendario nella Whitelist di handleSmartClickEscape.
 * Normalizzazione retroattiva degli appunti inline salvati con tag a blocco.
 * FIX CARET: Integrato l'estrattore geometrico assoluto basato su Range.cloneContents per il calcolo infallibile degli offset.
 * FIX UNDO/REDO CARET: minifyHTMLForStorage preserva il marcatore di cronologia quando richiesto dagli snapshot RAM.
 * FIX ARCHITETTURA: Ricollocato _getRawText nativamente in editor-core per garantire disponibilità globale.
 * FIX RESTORE SELECTION: Invocazione del focus prima dell'assegnazione del range per evitare il reset all'inizio del blocco.
 * FEAT HEAL FONT ARTIFACTS: Rimozione chirurgica degli span parassiti con style="font-size: ..." generati da WebKit su unione blocchi.
 * PROCEDURA UNICA SANITIZZAZIONE: Motore centralizzato per note inline e segnalibri limitato alle sole 4 opzioni permesse (Bold, Italic, Underline, Bullet).
 * FEAT BROKEN IMAGES: Generazione di un segnaposto visivo vettoriale chiaro ed evidente per immagini rimosse dal disco o non trovate.
 * FEAT RAW HTML SOURCE EDITOR: Editor a tutto schermo del codice sorgente liofilizzato per modifiche massive esterne (Ctrl+Shift+E).
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

    // Genera un Data-URI SVG per mostrare chiaramente a schermo un'immagine cancellata o non reperibile
    getBrokenImagePlaceholder: (ref = '') => {
        const cleanRef = (ref || 'Immagine mancante')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="110" viewBox="0 0 340 110">
            <rect x="2" y="2" width="336" height="106" rx="8" fill="#fff5f5" stroke="#ef4444" stroke-width="2" stroke-dasharray="6,4"/>
            <g transform="translate(16, 28)">
                <rect x="0" y="0" width="48" height="48" rx="8" fill="#fee2e2" stroke="#f87171" stroke-width="1.5"/>
                <path d="M14 34 L22 22 L28 30 L34 20 L40 34 Z" fill="#ef4444" opacity="0.6"/>
                <circle cx="18" cy="14" r="4" fill="#ef4444" opacity="0.6"/>
                <line x1="6" y1="42" x2="42" y2="6" stroke="#dc2626" stroke-width="3" stroke-linecap="round"/>
            </g>
            <text x="76" y="42" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="14" font-weight="bold" fill="#991b1b">⚠️ Immagine non trovata</text>
            <text x="76" y="62" font-family="monospace" font-size="11" fill="#b91c1c">${cleanRef.length > 32 ? cleanRef.slice(0, 29) + '...' : cleanRef}</text>
            <text x="76" y="80" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="11" fill="#7f1d1d" opacity="0.8">File eliminato o mancante dagli assets</text>
        </svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    },

    markImageBroken: (img, ref = '') => {
        if (!img) return;
        img.classList.add('broken-image');
        img.setAttribute('data-broken', 'true');
        img.src = Editor.getBrokenImagePlaceholder(ref);
        img.setAttribute('title', `Immagine non trovata: ${ref} (File eliminato dal disco o mancante)`);
    },

    handleImageError: (img) => {
        if (!img || img.getAttribute('data-broken') === 'true') return;
        const ref = img.getAttribute('data-image-ref') || img.getAttribute('alt') || 'Immagine';
        Editor.markImageBroken(img, ref);
    },

    // Sanificazione centralizzata e rigorosa per testi di note in linea e segnalibri:
    // Permette ESCLUSIVAMENTE le 4 opzioni della toolbar: Grassetto (b), Corsivo (i), Sottolineato (u), Lista puntata (•) e i ritorni a capo (<br>).
    sanitizeMiniText: (rawHTML) => {
        if (!rawHTML || typeof rawHTML !== 'string') return '';

        // 1. Pre-conversione dei tag a blocco in ritorni a capo ed elementi di lista con punto elenco
        let html = rawHTML
            .replace(/<div[^>]*>/gi, '<br>')
            .replace(/<\/div>/gi, '')
            .replace(/<p[^>]*>/gi, '<br>')
            .replace(/<\/p>/gi, '')
            .replace(/<li[^>]*>/gi, '<br>• ')
            .replace(/<\/li>/gi, '')
            .replace(/<\/?(ul|ol|h[1-6]|blockquote|tr|table|tbody|thead|tfoot|header|footer|section|article|aside)[^>]*>/gi, '<br>');

        const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
        const container = doc.body.firstElementChild;
        if (!container) return '';

        // 2. Rimozione integrale di script, stili, media o elementi interattivi alieni
        container.querySelectorAll('script, style, iframe, object, embed, audio, video, svg, canvas, form, input, button, select, textarea, img').forEach(el => el.remove());

        const allowedFinalTags = new Set(['B', 'I', 'U', 'BR']);

        // 3. Normalizzazione ricorsiva dal basso verso l'alto
        const cleanElement = (el) => {
            const children = Array.from(el.children);
            children.forEach(cleanElement);

            const tag = el.tagName.toUpperCase();

            let isBold = tag === 'B' || tag === 'STRONG';
            let isItalic = tag === 'I' || tag === 'EM';
            let isUnderline = tag === 'U';

            // Riconoscimento stili CSS applicati da browser tramite span o font
            if (tag === 'SPAN' || tag === 'FONT') {
                const fw = el.style.fontWeight;
                if (fw === 'bold' || fw === 'bolder' || parseInt(fw, 10) >= 700) isBold = true;
                const fs = el.style.fontStyle;
                if (fs === 'italic' || fs === 'oblique') isItalic = true;
                const td = el.style.textDecoration || el.style.textDecorationLine;
                if (td && td.includes('underline')) isUnderline = true;
            }

            if (tag === 'BR') {
                while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name);
                return;
            }

            if (isBold || isItalic || isUnderline) {
                const frag = doc.createDocumentFragment();
                while (el.firstChild) {
                    frag.appendChild(el.firstChild);
                }

                let currentWrapper = frag;
                if (isUnderline) {
                    const u = doc.createElement('u');
                    u.appendChild(currentWrapper);
                    currentWrapper = u;
                }
                if (isItalic) {
                    const i = doc.createElement('i');
                    i.appendChild(currentWrapper);
                    currentWrapper = i;
                }
                if (isBold) {
                    const b = doc.createElement('b');
                    b.appendChild(currentWrapper);
                    currentWrapper = b;
                }

                el.parentNode.replaceChild(currentWrapper, el);
            } else if (!allowedFinalTags.has(tag)) {
                // Srotola qualsiasi tag non consentito preservandone il testo interno
                const parent = el.parentNode;
                while (el.firstChild) {
                    parent.insertBefore(el.firstChild, el);
                }
                el.remove();
            } else {
                // Pulisce qualsiasi attributo (style, class, id) rimasto sui tag ammessi
                while (el.attributes.length > 0) {
                    el.removeAttribute(el.attributes[0].name);
                }
            }
        };

        Array.from(container.children).forEach(cleanElement);

        // 4. Eliminazione tag ammessi rimasti vuoti (es. <b></b> o <i>  </i>)
        let changed = true;
        while (changed) {
            changed = false;
            container.querySelectorAll('b, i, u').forEach(tagEl => {
                while (tagEl.attributes.length > 0) tagEl.removeAttribute(tagEl.attributes[0].name);
                const text = tagEl.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
                const hasBr = tagEl.querySelector('br');
                if (!text && !hasBr) {
                    tagEl.remove();
                    changed = true;
                }
            });
        }

        // 5. Compattazione interlinea e rimozione a capo iniziali/finali
        let result = container.innerHTML;
        result = result.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');
        result = result.replace(/^(<br\s*\/?>|\s|&nbsp;)+/gi, '')
                       .replace(/(<br\s*\/?>|\s|&nbsp;)+$/gi, '');

        return result;
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

    // Ripristino deterministico dei cuscinetti \u200B attorno ai widget inline ed estirpazione degli orfani sparsi
    ensureInlineWidgetBuffers: (container) => {
        if (!container) return;

        // 1. Ripristina/Garantisce i cuscinetti \u200B prima e dopo ogni shell inline o link interno
        const inlineShells = container.querySelectorAll('.adv-inline-shell, a.internal-link, a.file-link');
        inlineShells.forEach(shell => {
            // Cuscinetto prima dell'elemento
            const prev = shell.previousSibling;
            if (!prev || prev.nodeType !== Node.TEXT_NODE) {
                shell.parentNode.insertBefore(document.createTextNode('\u200B'), shell);
            } else if (!prev.nodeValue.endsWith('\u200B')) {
                prev.nodeValue += '\u200B';
            }

            // Cuscinetto dopo l'elemento
            const next = shell.nextSibling;
            if (!next || next.nodeType !== Node.TEXT_NODE) {
                shell.parentNode.insertBefore(document.createTextNode('\u200B'), shell.nextSibling);
            } else if (!next.nodeValue.startsWith('\u200B')) {
                next.nodeValue = '\u200B' + next.nodeValue;
            }
        });

        // 2. Garanzia cuscinetto minimo per checklist e snippet vuoti (o rimozione se contengono testo reale)
        container.querySelectorAll('.checklist-text, .snippet-text').forEach(el => {
            const clean = el.textContent.replace(/[\u200B\uFEFF]/g, '').trim();
            if (clean === '') {
                if (el.textContent !== '\u200B') el.textContent = '\u200B';
            } else if (el.textContent.includes('\u200B')) {
                el.textContent = el.textContent.replace(/\u200B/g, '');
            }
        });

        // 3. Estirpazione degli Zero-Width Space orfani in punti errati del documento
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        const orphanNodes = [];
        let textNode;

        while ((textNode = walker.nextNode())) {
            const val = textNode.nodeValue;
            if (!val.includes('\u200B')) continue;

            const parent = textNode.parentNode;
            // AUDIT DIFENSIVO: Protegge i nodi di layout interni a snippet, note inline e checklist
            if (parent && (parent.closest('.adv-inline-shell') || parent.classList.contains('checklist-text') || parent.classList.contains('snippet-text'))) {
                continue;
            }

            const prev = textNode.previousSibling;
            const next = textNode.nextSibling;

            const isAdjacentToShell = (prev && (prev.classList?.contains('adv-inline-shell') || prev.tagName === 'A')) ||
                                      (next && (next.classList?.contains('adv-inline-shell') || next.tagName === 'A'));

            if (!isAdjacentToShell) {
                // Nodo non adiacente a nessun widget: rimuovi completamente i \u200B
                const cleaned = val.replace(/\u200B/g, '');
                if (cleaned === '') {
                    orphanNodes.push(textNode);
                } else {
                    textNode.nodeValue = cleaned;
                }
            } else if (val !== '\u200B') {
                // Adiacente a widget ma con accumuli multipli: riduci a singolo \u200B sul bordo corretto
                const starts = val.startsWith('\u200B');
                const ends = val.endsWith('\u200B');
                let inner = val.replace(/\u200B/g, '');
                if (starts) inner = '\u200B' + inner;
                if (ends && inner !== '\u200B') inner = inner + '\u200B';
                textNode.nodeValue = inner;
            }
        }

        orphanNodes.forEach(n => n.remove());
    },

    hydrateMedia: (container) => {
        container.querySelectorAll('img[data-image-ref]').forEach(img => {
            const ref = img.getAttribute('data-image-ref');
            if (ref && Editor.imageCache && Editor.imageCache[ref]) {
                img.setAttribute('src', Editor.imageCache[ref]);
                img.classList.remove('broken-image');
                img.removeAttribute('data-broken');
                img.removeAttribute('title');
            } else {
                Editor.markImageBroken(img, ref);
            }
        });

        // Controlla immagini esterne o senza data-image-ref con src mancante
        container.querySelectorAll('img:not([data-image-ref])').forEach(img => {
            const src = img.getAttribute('src');
            if (!src || src.trim() === '') {
                Editor.markImageBroken(img, img.getAttribute('alt') || 'Immagine esterna');
            }
        });

        container.querySelectorAll('audio[data-audio-ref]').forEach(aud => {
            const ref = aud.getAttribute('data-audio-ref');
            if (ref && Editor.audioCache && Editor.audioCache[ref]) {
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
            const safeName = (file.name || fileName).replace(/"/g, '&quot;');
            
            Editor.restoreSelection();
            document.execCommand('insertHTML', false, `<img src="${blobUrl}" data-image-ref="${fileName}" alt="${safeName}" onerror="Editor.handleImageError(this)"><p><br></p>`);
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
        if (lastChild && (WidgetManager.isProtectedBlock(lastChild) || ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE'].includes(lastChild.tagName))) {
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

    // Pulizia delle cache in RAM delegata al motore unico e centralizzato di Store
    cleanOrphanedCaches: () => {
        if (typeof Store !== 'undefined' && typeof Store.cleanOrphanedRAMCaches === 'function') {
            Store.cleanOrphanedRAMCaches();
        }
    },

    minifyHTMLForStorage: (htmlString, keepHistoryMarker = false) => {
        if (!htmlString) return "";
        const temp = document.createElement('div');
        temp.innerHTML = htmlString;

        // Normalizzazione retroattiva rigorosa tramite la funzione centralizzata unica
        temp.querySelectorAll('.inline-note-data').forEach(dataSpan => {
            dataSpan.innerHTML = Editor.sanitizeMiniText(dataSpan.innerHTML);
        });

        // Normalizzazione retroattiva dei commenti dei segnalibri
        temp.querySelectorAll('.bookmark-comment-data').forEach(dataSpan => {
            dataSpan.innerHTML = Editor.sanitizeMiniText(dataSpan.innerHTML);
        });

        // Rimozione fonti dinamiche e iframes per prevenire Network Errors e CORS in background
        temp.querySelectorAll('iframe').forEach(ifr => {
            const src = ifr.getAttribute('src');
            if (src) {
                ifr.setAttribute('data-src', src);
                ifr.removeAttribute('src');
            }
        });
        
        temp.querySelectorAll('img[data-image-ref]').forEach(img => {
            img.removeAttribute('src');
            img.classList.remove('broken-image');
            img.removeAttribute('data-broken');
        });
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

        // Normalizzazione immediata del DOM vivo prima della clonazione
        Editor.ensureInlineWidgetBuffers(editor);

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
        Editor.ensureInlineWidgetBuffers(clone);
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

        // Ripristino garantito dei cuscinetti ZWS per tutti i widget inline ed eliminazione orfani
        Editor.ensureInlineWidgetBuffers(editor);

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
    },

    // MODALITA' AVANZATA: MODIFICA DIRETTA CODICE SORGENTE HTML (LIOFILIZZATO)
    openRawHtmlEditor: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        if (!note || note.deletedAt) return;

        if (typeof Editor.sanitizeContent === 'function') {
            Editor.sanitizeContent();
        }

        const rawMinifiedHtml = Editor.getCleanHTML();
        const safeTitle = (note.title || I18n.t('editor.untitled')).replace(/</g, '&lt;');

        const bodyHTML = `
            <div style="display:flex; flex-direction:column; gap:10px; height:100%;">
                <div style="background: rgba(239, 68, 68, 0.08); border-left: 4px solid var(--danger-color); padding: 12px; border-radius: 4px; font-size: 0.85rem; line-height: 1.5;">
                    <div style="color:var(--danger-color); font-weight:bold; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                        <span>${typeof Icons !== 'undefined' ? Icons.alertTriangle : '⚠️'}</span> ${I18n.t('notes_utils.raw_html_warning_title') || 'ATTENZIONE: Modifica Diretta Codice HTML'}
                    </div>
                    <div style="color:var(--text-secondary);">
                        ${I18n.t('notes_utils.raw_html_warning_desc') || 'Stai modificando il markup sorgente liofilizzato della nota. Non alterare o cancellare gli attributi ID dei widget (es. adv_tbl_*, adv_code_*) per non corrompere i dati collegati.'}
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:bold;">Sorgente HTML Minificato:</span>
                    <button class="btn" style="padding:4px 8px; font-size:0.75rem;" onclick="Editor.copyRawHtmlToClipboard()">
                        <span style="display:inline-flex; align-items:center; gap:4px;">${typeof Icons !== 'undefined' ? Icons.clipboard : '📋'} ${I18n.t('notes_utils.raw_html_copy_btn') || 'Copia per VS Code'}</span>
                    </button>
                </div>

                <textarea id="advRawHtmlTextarea" class="modern-input" spellcheck="false" style="flex:1; width:100%; min-height:350px; font-family:'Menlo','Consolas','Monaco',monospace; font-size:0.85rem; line-height:1.5; padding:12px; background:var(--code-bg); color:var(--code-text); border:1px solid var(--border-color); border-radius:6px; resize:none; white-space:pre-wrap; box-sizing:border-box;">${UI.escapeHTML(rawMinifiedHtml)}</textarea>
            </div>
        `;

        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.cancel')}</button>
            <button class="btn btn-primary" onclick="Editor.applyRawHtml()">
                <span style="display:inline-flex; align-items:center; gap:5px;">${typeof Icons !== 'undefined' ? Icons.checkCircle : '✓'} ${I18n.t('notes_utils.raw_html_apply_btn') || 'Applica e Reidrata Pagina'}</span>
            </button>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:6px;">${typeof Icons !== 'undefined' ? Icons.code : '</>'} ${I18n.t('notes_utils.raw_html_title') || 'Sorgente HTML: ' + safeTitle}</span>`, bodyHTML, footerHTML);

        setTimeout(() => {
            const ta = document.getElementById('advRawHtmlTextarea');
            if (ta) ta.focus();
        }, 50);
    },

    copyRawHtmlToClipboard: () => {
        const ta = document.getElementById('advRawHtmlTextarea');
        if (!ta) return;
        navigator.clipboard.writeText(ta.value).then(() => {
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast("Codice HTML copiato negli appunti! Incollalo in VS Code.", "success");
            }
        });
    },

    applyRawHtml: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        if (!note || note.deletedAt) return;

        const ta = document.getElementById('advRawHtmlTextarea');
        if (!ta) return;

        const newRawHtml = ta.value;

        // Salva uno snapshot prima della mutazione: se l'utente sbaglia, potrà annullare con Ctrl+Z!
        Editor.saveSnapshot();

        const editorEl = document.getElementById('noteContent');
        if (!editorEl) return;

        // Minificazione preventiva per sicurezza
        const minified = Editor.minifyHTMLForStorage(newRawHtml);
        note.content = minified;
        note.updatedAt = new Date().toISOString();
        note._isDirty = true;

        // Iniezione nel DOM dell'editor attivo
        editorEl.innerHTML = minified;

        // Reidratazione a catena di tutti i componenti e media
        Editor.hydrateMedia(editorEl);
        if (typeof WidgetManager !== 'undefined') {
            WidgetManager.mountAll(editorEl);
        }
        if (typeof CitationManager !== 'undefined') {
            CitationManager.renderLiveCitations();
        }
        UI.renderInlineFootnotes();
        if (typeof TemplateManager !== 'undefined') {
            TemplateManager.toggleEmptyOverlay();
        }

        Store.triggerAutoSave();
        UI.closeDrawer();

        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(I18n.t('notes_utils.raw_html_success_toast') || "Codice HTML applicato e pagina reidratata con successo!", "success");
        }
    }
};