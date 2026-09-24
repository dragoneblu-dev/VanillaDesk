/**
 * editor-format-text.js
 * Sottomodulo di Editor.
 * Gestione formattazioni inline, Menu Stile, Font e la "Gomma Draconiana" (Deep Sanitization).
 * Tutela dell'infrastruttura Widget e dell'attributo 'start' degli elenchi numerati (OL).
 * Inclusione classi e attributi per segnalibri e note commentate.
 * FEAT: toggleBlockquote deterministico con unwrap e appiattimento anti-nidificazione (Single Quote Shield).
 */

Object.assign(Editor, {

    openTextFormatMenu: (e, anchorId) => {
        if (e) e.stopPropagation();
        const executeFormat = (cmd, arg) => {
            Editor.saveSelection();
            Editor.applyTextFormat(cmd, arg);
        };

        const chk = ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>';

        let activeFF = 'ff-default';
        let activeFS = 'fs-standard';

        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            let node = sel.anchorNode;
            if (node.nodeType === 3) node = node.parentNode;
            const span = node.closest('span[class*="ff-"], span[class*="fs-"]');
            if (span) {
                if (span.classList.contains('ff-serif')) activeFF = 'ff-serif';
                else if (span.classList.contains('ff-cursive')) activeFF = 'ff-cursive';
                else if (span.classList.contains('ff-easyreading')) activeFF = 'ff-easyreading';

                if (span.classList.contains('fs-small')) activeFS = 'fs-small';
                else if (span.classList.contains('fs-large')) activeFS = 'fs-large';
            }
        }

        const items = [
            { type: 'custom', html: '<div class="adv-dropdown-title" style="margin-bottom: 2px;">Font</div>' },
            { label: 'Standard (Mono)' + (activeFF === 'ff-default' ? chk : ''), onClick: () => executeFormat('ff', 'ff-default') },
            { label: 'Serif' + (activeFF === 'ff-serif' ? chk : ''), onClick: () => executeFormat('ff', 'ff-serif') },
            { label: 'Cursive' + (activeFF === 'ff-cursive' ? chk : ''), onClick: () => executeFormat('ff', 'ff-cursive') },
            { label: 'EasyReading PRO' + (activeFF === 'ff-easyreading' ? chk : ''), onClick: () => executeFormat('ff', 'ff-easyreading') },
            { type: 'divider' },
            { type: 'custom', html: '<div class="adv-dropdown-title" style="margin-bottom: 2px;">Dimensione</div>' },
            { label: 'Piccolo' + (activeFS === 'fs-small' ? chk : ''), onClick: () => executeFormat('fs', 'fs-small') },
            { label: 'Normale' + (activeFS === 'fs-standard' ? chk : ''), onClick: () => executeFormat('fs', 'fs-standard') },
            { label: 'Grande' + (activeFS === 'fs-large' ? chk : ''), onClick: () => executeFormat('fs', 'fs-large') }
        ];

        UI.Menu.buildContextMenu(anchorId, items);
    },

    updateToolbarFormatting: () => {
        if (!AppState.isEditMode) return;

        const toggleBtn = (id, state) => {
            const btn = document.getElementById(id);
            if (btn) {
                if (state) btn.classList.add('active-format');
                else btn.classList.remove('active-format');
            }
        };

        toggleBtn('btnFormatB', document.queryCommandState('bold'));
        toggleBtn('btnFormatI', document.queryCommandState('italic'));
        toggleBtn('btnFormatU', document.queryCommandState('underline'));
        toggleBtn('btnFormatS', document.queryCommandState('strikeThrough'));

        let isH1 = false, isH2 = false, isQuote = false, isCustomFont = false;

        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            let node = sel.anchorNode;
            if (node.nodeType === 3) node = node.parentNode;

            const block = node.closest('h1, h2, h3, h4, h5, h6, ul, ol');
            if (block) {
                const tag = block.tagName.toLowerCase();
                if (tag === 'h2') isH1 = true;
                if (tag === 'h3') isH2 = true;
            }

            // Verifica se il cursore si trova dentro un blockquote di formattazione testuale
            const quoteBlock = node.closest('blockquote:not(.adv-widget-shell)');
            if (quoteBlock) {
                isQuote = true;
            }

            const span = node.closest('span[class*="ff-"], span[class*="fs-"]');
            if (span) isCustomFont = true;
        }

        toggleBtn('btnFormatH1', isH1);
        toggleBtn('btnFormatH2', isH2);
        toggleBtn('btnFormatQuote', isQuote);
        toggleBtn('btnFormatTMenu', isCustomFont);
    },

    toggleHeader: (tag) => {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const parentNode = selection.getRangeAt(0).commonAncestorContainer;
        const element = (parentNode.nodeType === 3) ? parentNode.parentNode : parentNode;
        const blockElement = element.closest('h1, h2, h3, h4, h5, h6, p, div, li, blockquote');

        if (!blockElement) {
            Editor.saveSnapshot();
            document.execCommand('formatBlock', false, tag);
            Editor.healWidgetWrappers();
            Editor.updateToolbarFormatting();
            return;
        }

        if (blockElement.nodeName.toLowerCase() === 'li') return;

        Editor.saveSnapshot();
        const currentTag = blockElement.nodeName.toLowerCase();
        const targetTag = tag.toLowerCase();
        if (currentTag === targetTag) document.execCommand('formatBlock', false, 'p');
        else document.execCommand('formatBlock', false, targetTag);
        
        Editor.healWidgetWrappers();
        Editor.updateToolbarFormatting();
    },

    toggleBlockquote: () => {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        let range = selection.getRangeAt(0);
        let container = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentNode;

        // Protezione: non alterare blocchi di codice, celle di tabelle complesse o liste
        if (container.closest('.code-content') || container.closest('.adv-widget-shell:not(.block-citation)')) return;
        if (container.closest('li')) return;

        const editorRoot = document.getElementById('noteContent') || document.getElementById('inlineNoteInput');
        if (!editorRoot || !editorRoot.contains(container)) return;

        Editor.saveSnapshot();

        // Marker temporaneo per conservare la posizione esatta del cursore
        const marker = document.createElement('span');
        marker.id = 'bkm-toggle-temp';
        marker.style.display = 'none';

        // 1. DISATTIVAZIONE / UNWRAP: Se siamo già dentro un blockquote, risaliamo all'antenato radice
        let existingBq = container.closest('blockquote:not(.adv-widget-shell)');
        if (existingBq) {
            // Risalita all'antenato blockquote più esterno per appiattire l'intera catena nidificata
            while (existingBq.parentElement && existingBq.parentElement.closest('blockquote:not(.adv-widget-shell)')) {
                existingBq = existingBq.parentElement.closest('blockquote:not(.adv-widget-shell)');
            }

            // Appiattisce preventivamente tutti i blockquote nidificati interni
            existingBq.querySelectorAll('blockquote').forEach(nested => {
                const p = nested.parentNode;
                while (nested.firstChild) p.insertBefore(nested.firstChild, nested);
                nested.remove();
            });

            range.insertNode(marker);

            const parent = existingBq.parentNode;
            const hasBlockChildren = Array.from(existingBq.children).some(c => 
                ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(c.tagName)
            );

            if (hasBlockChildren) {
                while (existingBq.firstChild) {
                    parent.insertBefore(existingBq.firstChild, existingBq);
                }
                existingBq.remove();
            } else {
                const paragraphs = [];
                let currentP = document.createElement('p');

                while (existingBq.firstChild) {
                    const child = existingBq.firstChild;
                    if (child.nodeType === 1 && child.tagName === 'BR') {
                        child.remove();
                        if (currentP.childNodes.length === 0) currentP.innerHTML = '<br>';
                        paragraphs.push(currentP);
                        currentP = document.createElement('p');
                    } else {
                        currentP.appendChild(child);
                    }
                }
                if (currentP.childNodes.length > 0) {
                    paragraphs.push(currentP);
                } else if (paragraphs.length === 0) {
                    currentP.innerHTML = '<br>';
                    paragraphs.push(currentP);
                }

                paragraphs.forEach(p => parent.insertBefore(p, existingBq));
                existingBq.remove();
            }

        } else {
            // 2. ATTIVAZIONE / WRAP: Raggruppa i blocchi selezionati in un unico <blockquote>
            let blocksToWrap = [];

            if (!range.collapsed && typeof Editor.getSelectedBlocks === 'function') {
                blocksToWrap = Editor.getSelectedBlocks(range);
            }

            if (blocksToWrap.length === 0) {
                let singleBlock = container.closest('p, div, h1, h2, h3, h4, h5, h6');
                if (singleBlock && singleBlock !== editorRoot) {
                    blocksToWrap.push(singleBlock);
                }
            }

            if (blocksToWrap.length === 0) {
                document.execCommand('formatBlock', false, 'blockquote');
                Editor.healWidgetWrappers();
                Editor.updateToolbarFormatting();
                return;
            }

            range.insertNode(marker);

            const bq = document.createElement('blockquote');
            const firstBlock = blocksToWrap[0];
            firstBlock.parentNode.insertBefore(bq, firstBlock);

            blocksToWrap.forEach(b => {
                // Preserva i paragrafi all'interno del riquadro evitando dispersioni
                if (b.tagName === 'P') {
                    bq.appendChild(b);
                } else {
                    const p = document.createElement('p');
                    while (b.firstChild) p.appendChild(b.firstChild);
                    b.remove();
                    bq.appendChild(p);
                }
            });
        }

        // Ripristino del cursore
        const savedMarker = document.getElementById('bkm-toggle-temp');
        if (savedMarker) {
            const newRange = document.createRange();
            newRange.setStartBefore(savedMarker);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            savedMarker.remove();
        }

        Editor.healWidgetWrappers();
        Store.triggerAutoSave();
        Editor.updateToolbarFormatting();
    },

    toggleCase: () => {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const text = selection.toString();
        if (!text) return;
        Editor.saveSnapshot();
        let newText = (text === text.toUpperCase()) ? text.toLowerCase() : text.toUpperCase();
        document.execCommand('insertText', false, newText);
    },

    applyTextFormat: (prefix, className) => {
        Editor.saveSnapshot();
        Editor.restoreSelection();

        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return;

        const editor = document.getElementById('noteContent') || document.getElementById('inlineNoteInput');
        if (!editor) return;

        // Assicura che il browser utilizzi markup standard (span con stili CSS)
        document.execCommand('styleWithCSS', false, false);

        // Alias magici usati per ingannare document.execCommand e fargli fondere i nodi nativamente
        const magicFF = { 'ff-serif': 'MagicSerif', 'ff-cursive': 'MagicCursive', 'ff-easyreading': 'MagicEasy' };
        const magicFS = { 'fs-small': '1', 'fs-large': '5' };

        editor.querySelectorAll('*').forEach(el => {
            if (typeof ColorManager !== 'undefined' && !ColorManager._isSafeToColor(el)) return;

            if (prefix === 'ff') {
                for (let cls in magicFF) {
                    if (el.classList.contains(cls)) {
                        el.setAttribute('face', magicFF[cls]);
                        el.classList.remove(cls);
                    }
                }
            } else if (prefix === 'fs') {
                for (let cls in magicFS) {
                    if (el.classList.contains(cls)) {
                        el.setAttribute('size', magicFS[cls]);
                        el.classList.remove(cls);
                    }
                }
            }
        });

        let command = prefix === 'ff' ? 'fontName' : 'fontSize';
        let targetValue = '';
        
        if (prefix === 'ff') {
            targetValue = magicFF[className] || 'MagicRemoveFF';
        } else {
            targetValue = magicFS[className] || '3'; 
        }

        document.execCommand(command, false, targetValue);

        // Conversione post-taglio dai magic tags (face/size) alle classi pulite dell'applicazione
        editor.querySelectorAll('*').forEach(el => {
            if (typeof ColorManager !== 'undefined' && !ColorManager._isSafeToColor(el)) return;

            if (prefix === 'ff') {
                const faceAttr = el.getAttribute('face') || '';
                const ffStyle = (el.style.fontFamily || '').replace(/['"]/g, '').trim(); 
                
                if (faceAttr === 'MagicRemoveFF' || ffStyle === 'MagicRemoveFF') {
                    el.removeAttribute('face');
                    el.style.fontFamily = '';
                } else {
                    for (let cls in magicFF) {
                        if (faceAttr === magicFF[cls] || ffStyle === magicFF[cls]) {
                            el.classList.add(cls);
                            el.removeAttribute('face');
                            el.style.fontFamily = '';
                            break;
                        }
                    }
                }
            } else if (prefix === 'fs') {
                const sizeAttr = el.getAttribute('size');
                const fsStyle = el.style.fontSize; 

                const isSmall = sizeAttr === '1' || fsStyle === 'x-small' || fsStyle === '10px';
                const isLarge = sizeAttr === '5' || fsStyle === 'x-large' || fsStyle === '24px';
                const isDefault = sizeAttr === '3' || fsStyle === 'medium' || fsStyle === '16px' || className === 'fs-standard';

                if (isDefault) {
                    el.removeAttribute('size');
                    el.style.fontSize = '';
                    el.classList.remove('fs-small', 'fs-large');
                } else if (isSmall) {
                    el.classList.add('fs-small');
                    el.classList.remove('fs-large');
                    el.removeAttribute('size');
                    el.style.fontSize = '';
                } else if (isLarge) {
                    el.classList.add('fs-large');
                    el.classList.remove('fs-small');
                    el.removeAttribute('size');
                    el.style.fontSize = '';
                }
            }
        });

        // Garbage collection dei nodi vuoti lasciati indietro
        let changed = true;
        while (changed) {
            changed = false;
            editor.querySelectorAll('*').forEach(el => {
                if (typeof ColorManager !== 'undefined' && !ColorManager._isSafeToColor(el)) return;

                if (el.getAttribute('class') === '') el.removeAttribute('class');
                if (el.getAttribute('style') === '') el.removeAttribute('style');
                if (el.getAttribute('face') === '') el.removeAttribute('face');
                if (el.getAttribute('size') === '') el.removeAttribute('size');
                if (el.getAttribute('color') === '') el.removeAttribute('color');

                if (el.tagName === 'SPAN' || el.tagName === 'FONT') {
                    if (el.attributes.length === 0 || (el.tagName === 'SPAN' && el.classList.length === 0 && !el.hasAttribute('style'))) {
                        const parent = el.parentNode;
                        while (el.firstChild) parent.insertBefore(el.firstChild, el);
                        parent.removeChild(el);
                        changed = true;
                    }
                }
            });
        }
        editor.normalize(); 

        Store.triggerAutoSave();
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
        Editor.updateToolbarFormatting();
    },

    clearFormatting: () => {
        Editor.saveSnapshot();
        Editor.restoreSelection();

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        let range = selection.getRangeAt(0);

        // Controlla se il nodo fa parte di un'infrastruttura Widget
        const isSafeToTouch = (node) => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
            if (node.id === 'noteContent') return false;

            if (WidgetManager.isInsideEditableWidgetArea(node)) return true; 

            if (WidgetManager.isProtectedBlock(node) || 
                WidgetManager.isProtectedInline(node) || 
                node.closest('.internal-link, .file-link')) {
                return false;
            }
            if (node.classList && (
                node.classList.contains('internal-link') || 
                node.classList.contains('file-link') || 
                node.classList.contains('inline-note-marker') || 
                node.classList.contains('adv-bookmark-marker') || 
                node.classList.contains('adv-copy-snippet') ||
                node.classList.contains('snippet-copy-btn')
            )) {
                return false;
            }
            return true;
        };

        const allowedTags = ['B', 'I', 'U', 'S', 'A', 'P', 'SPAN', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'BR', 'IMG', 'INPUT', 'SVG', 'PATH', 'POLYLINE', 'LINE', 'RECT', 'CIRCLE'];
        const allowedPrefixes = ['hl-', 'tx-', 'bg-', 'text-', 'ff-', 'fs-'];
        
        const allowedClasses = [
            // Link, Testo e Ricerca
            'internal-link', 'file-link', 'highlighted-text', 'search-highlight', 'active-highlight',
            // Struttura Shell Base
            'adv-widget-shell', 'adv-inline-shell', 'widget-header', 'adv-table-header', 'widget-drag-handle', 'adv-drag-handle', 'widget-options-btn', 'widget-icon', 'widget-title', 'adv-table-title', 'widget-tools', 'adv-tools', 'widget-body', 'widget-editable-area',
            // Tipi di Widget
            'widget-type-database', 'widget-type-pivot', 'widget-type-journal', 'widget-type-code', 'widget-type-buttonbar', 'widget-type-citation', 'widget-type-columns', 'widget-type-simple-table', 'widget-type-audio', 'widget-type-video',
            // Database
            'adv-table-wrapper', 'table-striped', 'adv-col-resizer',
            // Tabelle Semplici
            'simple-table-wrapper', 'table-row-trigger', 'table-col-trigger', 'table-move-trigger',
            // Appunti Nascosti e Segnalibri
            'inline-note-wrapper', 'inline-note-marker', 'inline-note-data', 'adv-bookmark-marker', 'bookmark-icon', 'bookmark-comment-data',
            // Checklist
            'adv-checklist', 'adv-checklist-item', 'adv-checklist-cb', 'checklist-text',
            // Diario
            'adv-journal-wrapper', 'adv-journal-list', 'journal-date-node', 'journal-date-header', 'journal-toggle', 'journal-date-label', 'journal-time-list', 'journal-time-node', 'journal-time-label', 'journal-content', 'hidden-time',
            // Codice e Snippet Copiabili
            'code-wrapper', 'code-action-bar', 'code-action-btn', 'code-content', 'code-action-lang', 'code-action-copy', 'code-copy-btn', 'adv-copy-snippet', 'snippet-text', 'snippet-copy-btn',
            // Citazioni
            'block-citation', 'citation-body', 'citation-header',
            // Colonne Multi-Layout
            'adv-columns-container-wrap', 'adv-columns-continuous', 'adv-columns-independent', 'col-box', 'col-resizer'
        ];
        
        const allowedDataAttrs = ['data-widget-type', 'data-image-ref', 'data-audio-ref', 'data-note-id', 'data-anchor', 'data-ref-id', 'data-file-path', 'data-tooltip', 'data-row', 'data-col', 'data-raw-value', 'data-decimals', 'data-opt-name', 'data-date', 'data-timer-expire', 'data-comment', 'data-ref-note', 'data-ref-type', 'data-collapsed', 'data-last-find', 'data-language'];

        let container = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentNode;

        let macroBlock = container.closest('table, ul, ol, blockquote, .journal-time-node');
        if (macroBlock && !WidgetManager.isProtectedBlock(macroBlock)) {
            if (macroBlock.classList.contains('journal-time-node')) container = macroBlock.querySelector('.journal-content');
            else container = macroBlock;
        } else {
            let curr = container;
            while (curr && curr.id !== 'noteContent' && curr.tagName) {
                if (!allowedTags.includes(curr.tagName.toUpperCase())) container = curr;
                curr = curr.parentNode;
            }
        }

        const elementsToClean = [];
        const forceCleanAll = container.id === 'noteContent' || container.tagName === 'TABLE';

        // 1. Identifica i nodi intersecati dalla selezione
        if (isSafeToTouch(container) || container.id === 'noteContent') {
            const isIntersecting = (node) => {
                if (forceCleanAll) return true;
                const nodeRange = document.createRange();
                try {
                    nodeRange.selectNode(node);
                    return range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
                           range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0;
                } catch(e) { return false; }
            };
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, null, false);
            
            if (container.id !== 'noteContent' && isIntersecting(container)) {
                elementsToClean.push(container);
            }
            
            let currentNode;
            while ((currentNode = walker.nextNode())) {
                if (currentNode.id === 'noteContent') continue; 
                if (isIntersecting(currentNode)) {
                    elementsToClean.push(currentNode);
                }
            }
        }

        selection.removeAllRanges();

        // 2. Processa ed esegue la sanificazione "Bottom-Up"
        const processElement = (el) => {
            if (!document.body.contains(el)) return null; 
            
            const isInternalWidget = el.closest('.adv-widget-shell, .simple-table-wrapper, .adv-inline-shell');

            if (!isSafeToTouch(el)) return el;

            let currentEl = el;
            let tag = currentEl.tagName.toUpperCase();

            // Srotola i contenitori creati da copia/incolla
            if (!isInternalWidget && (tag === 'DIV' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'ASIDE')) {
                const p = document.createElement('p');
                if (currentEl.className) p.className = currentEl.className;
                if (currentEl.style.cssText) p.style.cssText = currentEl.style.cssText;
                
                while (currentEl.firstChild) p.appendChild(currentEl.firstChild);
                currentEl.parentNode.replaceChild(p, currentEl);
                
                if (container === currentEl) container = p; 
                currentEl = p;
                tag = 'P';
            }

            if (!allowedTags.includes(tag)) {
                const frag = document.createDocumentFragment();
                while (currentEl.firstChild) frag.appendChild(currentEl.firstChild);
                currentEl.parentNode.replaceChild(frag, currentEl);
                return null;
            }

            // PULIZIA ATTRIBUTI
            const attrs = Array.from(currentEl.attributes);
            attrs.forEach(attr => {
                if (tag === 'SVG' && ['viewBox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'].includes(attr.name)) return;
                if (['PATH', 'POLYLINE', 'LINE', 'RECT', 'CIRCLE'].includes(tag) && ['d', 'points', 'x1', 'y1', 'x2', 'y2', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry'].includes(attr.name)) return;
                if (attr.name === 'href' && tag === 'A') return;
                if (attr.name === 'src' && (tag === 'IMG' || tag === 'AUDIO')) return;
                if (attr.name === 'controls' && tag === 'AUDIO') return;
                if (attr.name === 'type' && ['UL', 'OL', 'INPUT'].includes(tag)) return;
                // Preserva l'attributo semantico start degli elenchi numerati
                if (attr.name === 'start' && tag === 'OL') return;
                if (attr.name === 'contenteditable') return;
                if (attr.name === 'id' && isInternalWidget) return;

                if (attr.name === 'class') {
                    const classes = attr.value.split(/\s+/).filter(cls => allowedClasses.includes(cls) || allowedPrefixes.some(p => cls.startsWith(p)));
                    if (classes.length > 0) currentEl.setAttribute('class', classes.join(' '));
                    else currentEl.removeAttribute('class');
                } else if (attr.name === 'style') {
                    if ((currentEl.classList.contains('inline-note-data') || currentEl.classList.contains('bookmark-comment-data')) && attr.value.includes('none')) {
                        currentEl.setAttribute('style', 'display: none;'); 
                    } else if (isInternalWidget) {
                        return;
                    } else {
                        currentEl.removeAttribute('style'); 
                    }
                } else if (attr.name.startsWith('data-')) {
                    if (allowedDataAttrs.includes(attr.name)) return;
                    currentEl.removeAttribute(attr.name);
                } else {
                    currentEl.removeAttribute(attr.name);
                }
            });

            if ((tag === 'FONT' || tag === 'SPAN') && !isInternalWidget) {
                if (currentEl.attributes.length === 0) {
                    const parent = currentEl.parentNode;
                    while (currentEl.firstChild) parent.insertBefore(currentEl.firstChild, currentEl);
                    parent.removeChild(currentEl);
                    return null;
                }
            }
            
            return currentEl;
        };

        elementsToClean.reverse().forEach(el => processElement(el));

        try {
            const newRange = document.createRange();
            newRange.selectNodeContents(container);
            selection.removeAllRanges();
            selection.addRange(newRange);
        } catch(e) {}

        Editor.healWidgetWrappers();
        Store.triggerAutoSave();
        Editor.updateToolbarFormatting();
    }
});