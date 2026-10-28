/**
 * editor-sanitizer.js
 * Modulo per la Minificazione HTML, Sanificazione AST e Pulizia Elementi Parassiti.
 * Sottomodulo di Editor.
 * Include:
 * - Sanificazione centralizzata per testi brevi (sanitizeMiniText).
 * - Auto-riparazione degli span parassiti con font-size inline (healFontArtifacts).
 * - Ripristino ed estirpazione cuscinetti ZWS attorno ai widget inline (ensureInlineWidgetBuffers).
 * - Normalizzazione dei blocchi vuoti (_normalizeEmptyBlocks).
 * - Minificazione e serializzazione protetta per il salvataggio (minifyHTMLForStorage, getCleanHTML, sanitizeContent).
 * - Gestione evidenziazioni di ricerca prima e dopo il salvataggio (applyHighlight, cleanHighlightsBeforeSave).
 * - Pulizia centralizzata cache in RAM (cleanOrphanedCaches).
 */

Object.assign(Editor, {

    // Sanificazione centralizzata per testi di note in linea e segnalibri:
    // Permette ESCLUSIVAMENTE le 4 opzioni della toolbar: Grassetto (b), Corsivo (i), Sottolineato (u), Lista puntata (•) e i ritorni a capo (<br>).
    // Preserva intatti gli spazi intenzionali dell'utente senza trim distruttivi.
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

        // 5. Compattazione interlinea e rimozione SOLO di ritorni a capo orfani iniziali/finali (senza toccare gli spazi dell'utente)
        let result = container.innerHTML;
        result = result.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');
        result = result.replace(/^(<br\s*\/?>)+/gi, '')
                       .replace(/(<br\s*\/?>)+$/gi, '');

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

    // Ripristino deterministico dei cuscinetti \u200B attorno ai widget inline ed eliminazione orfani
    // NOTA: I normali tag <a> NON sono shell non-editabili e sono categoricamente esclusi da questa logica.
    ensureInlineWidgetBuffers: (container) => {
        if (!container) return;

        // 1. Ripristina/Garantisce i cuscinetti \u200B prima e dopo OGNI shell inline (contenteditable="false")
        const inlineShells = container.querySelectorAll('.adv-inline-shell');
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

        // 3. Estirpazione degli Zero-Width Space orfani e riallineamento dei bordi
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        const orphanNodes = [];
        let textNode;

        const sel = window.getSelection();
        const activeNode = (sel && sel.rangeCount > 0) ? sel.anchorNode : null;
        const activeOffset = (sel && sel.rangeCount > 0) ? sel.anchorOffset : 0;
        let needsRestoreCaret = false;
        let newCaretOffset = activeOffset;
        let caretTargetNode = null;

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

            const isAfterShell = prev && prev.nodeType === 1 && prev.classList.contains('adv-inline-shell');
            const isBeforeShell = next && next.nodeType === 1 && next.classList.contains('adv-inline-shell');
            const isAdjacentToShell = isAfterShell || isBeforeShell;

            if (!isAdjacentToShell) {
                // Nodo non adiacente a nessun widget inline: rimuovi completamente i \u200B
                if (textNode === activeNode) {
                    const textBefore = val.substring(0, activeOffset);
                    const zwsCountBefore = (textBefore.match(/\u200B/g) || []).length;
                    newCaretOffset = Math.max(0, activeOffset - zwsCountBefore);
                    caretTargetNode = textNode;
                    needsRestoreCaret = true;
                }
                const cleaned = val.replace(/\u200B/g, '');
                if (cleaned === '') {
                    orphanNodes.push(textNode);
                } else {
                    textNode.nodeValue = cleaned;
                }
            } else {
                // Nodo adiacente a una shell: il \u200B deve stare ESCLUSIVAMENTE sui bordi aderenti alla shell
                let pureText = val.replace(/\u200B/g, '');
                let inner = pureText;

                if (isAfterShell) inner = '\u200B' + inner;
                if (isBeforeShell && inner !== '\u200B') inner = inner + '\u200B';

                if (inner !== val) {
                    if (textNode === activeNode) {
                        const textBefore = val.substring(0, activeOffset);
                        const zwsCountBefore = (textBefore.match(/\u200B/g) || []).length;
                        const startsAdjustment = (isAfterShell && activeOffset > 0) ? 1 : 0;
                        newCaretOffset = Math.max(0, activeOffset - zwsCountBefore + startsAdjustment);
                        caretTargetNode = textNode;
                        needsRestoreCaret = true;
                    }
                    textNode.nodeValue = inner;
                }
            }
        }

        orphanNodes.forEach(n => n.remove());

        if (needsRestoreCaret && caretTargetNode && document.body.contains(caretTargetNode)) {
            try {
                const safeOffset = Math.min(newCaretOffset, caretTargetNode.nodeValue.length);
                const r = document.createRange();
                r.setStart(caretTargetNode, safeOffset);
                r.collapse(true);
                sel.removeAllRanges();
                sel.addRange(r);
            } catch (_) {}
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

            // Rimuove tag P parassiti completamente vuoti (<p></p>) lasciati da mutazioni o split di Blink
            if (tag === 'P' && innerHTML === '' && cleanText === '' && rootNode.children.length > 1) {
                el.remove();
                return;
            }

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

        // Si clona l'editor senza alterare il DOM vivo per non disturbare la posizione del cursore attivo
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
    }
});