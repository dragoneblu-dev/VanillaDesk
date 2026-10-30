/**
 * editor-format-text.js
 * Sottomodulo di Editor.
 * Gestione formattazioni inline, Menu Stile, Font e la "Gomma Formattazioni" (Deep Sanitization).
 * Tutela dell'infrastruttura Widget, dell'attributo 'start' degli elenchi numerati (OL), di colspan/rowspan per le celle
 * e dei metadati dei link di VanillaDesk (incluso data-link-note per la descrizione aggiuntiva).
 * Inclusione classi e attributi per segnalibri e note commentate.
 * Preservazione esplicita del tag HR nella lista dei tag consentiti dalla gomma formattazioni.
 * toggleBlockquote deterministico con unwrap e appiattimento anti-nidificazione (Single Quote Shield).
 * Aggiornamento contestuale dinamico dell'icona, del tooltip e dello stato active-format su btnListMenu.
 * REFACTOR CENTRALIZZAZIONE: Esportazione di Editor.cleanDOMTree per condividere la logica di sanificazione
 * con l'evento di Paste, eliminando codice duplicato ed Over Engineering.
 * FIX TABELLE & STILI ALIENI: Sanificazione rigorosa del contenuto delle celle delle tabelle semplici,
 * con srotolamento di tutti gli span parassiti, rimozione di classi non native e supporto alle celle selezionate.
 * ZERO-FONT UNIFICATION: Eliminazione integrale del tag legacy <font> sostituito ovunque da <span> standard W3C,
 * garantendo la preservazione assoluta delle classi di stile VanillaDesk (ff-*, fs-*, hl-c*, tx-c*).
 * WIDGET PROTECTION: Esclusione categorica di tutti i widget complessi di VanillaDesk dalla gomma formattazioni.
 * FEAT MULTI-CELL FORMATTING: Supporto a Maiuscolo/Minuscolo (toggleCase) e Carattere/Dimensione (applyTextFormat)
 * applicati simultaneamente a tutte le celle selezionate in TableManager con snapshot forzato per Undo/Redo immediato.
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

        const hasSelectedCells = typeof TableManager !== 'undefined' && 
                                 TableManager.Selection && 
                                 TableManager.Selection.selectedCells && 
                                 TableManager.Selection.selectedCells.length > 0;

        if (hasSelectedCells) {
            const firstCell = TableManager.Selection.selectedCells[0];
            const span = firstCell.querySelector('span[class*="ff-"], span[class*="fs-"]');
            if (span) {
                if (span.classList.contains('ff-serif')) activeFF = 'ff-serif';
                else if (span.classList.contains('ff-cursive')) activeFF = 'ff-cursive';
                else if (span.classList.contains('ff-easyreading')) activeFF = 'ff-easyreading';

                if (span.classList.contains('fs-small')) activeFS = 'fs-small';
                else if (span.classList.contains('fs-large')) activeFS = 'fs-large';
            }
        } else {
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
        }

        const items = [
            { type: 'custom', html: `<div class="adv-dropdown-title" style="margin-bottom: 2px;">${I18n.t('format_text.font_group')}</div>` },
            { label: I18n.t('format_text.font_default') + (activeFF === 'ff-default' ? chk : ''), onClick: () => executeFormat('ff', 'ff-default') },
            { label: I18n.t('format_text.font_serif') + (activeFF === 'ff-serif' ? chk : ''), onClick: () => executeFormat('ff', 'ff-serif') },
            { label: I18n.t('format_text.font_cursive') + (activeFF === 'ff-cursive' ? chk : ''), onClick: () => executeFormat('ff', 'ff-cursive') },
            { label: I18n.t('format_text.font_easyreading') + (activeFF === 'ff-easyreading' ? chk : ''), onClick: () => executeFormat('ff', 'ff-easyreading') },
            { type: 'divider' },
            { type: 'custom', html: `<div class="adv-dropdown-title" style="margin-bottom: 2px;">${I18n.t('format_text.size_group')}</div>` },
            { label: I18n.t('format_text.size_small') + (activeFS === 'fs-small' ? chk : ''), onClick: () => executeFormat('fs', 'fs-small') },
            { label: I18n.t('format_text.size_standard') + (activeFS === 'fs-standard' ? chk : ''), onClick: () => executeFormat('fs', 'fs-standard') },
            { label: I18n.t('format_text.size_large') + (activeFS === 'fs-large' ? chk : ''), onClick: () => executeFormat('fs', 'fs-large') }
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
        let activeListType = null;

        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            let node = sel.anchorNode;
            if (node.nodeType === 3) node = node.parentNode;

            const block = node.closest('h1, h2, h3, h4, h5, h6, ul, ol');
            if (block) {
                const tag = block.tagName.toLowerCase();
                if (tag === 'h1') isH1 = true;
                if (tag === 'h2') isH2 = true;
            }

            // Verifica se il cursore si trova dentro un blockquote di formattazione testuale
            const quoteBlock = node.closest('blockquote:not(.adv-widget-shell)');
            if (quoteBlock) {
                isQuote = true;
            }

            const span = node.closest('span[class*="ff-"], span[class*="fs-"]');
            if (span) isCustomFont = true;

            // Rilevamento contestuale del tipo di elenco attivo
            const checklist = node ? node.closest('ul.adv-checklist') : null;
            const ol = node ? node.closest('ol') : null;
            const ul = node ? node.closest('ul:not(.adv-checklist)') : null;

            if (checklist) activeListType = 'checklist';
            else if (ol) activeListType = (ol.getAttribute('type') === 'A' ? 'ol-a' : 'ol');
            else if (ul) activeListType = 'ul';
        }

        toggleBtn('btnFormatH1', isH1);
        toggleBtn('btnFormatH2', isH2);
        toggleBtn('btnFormatQuote', isQuote);
        toggleBtn('btnFormatTMenu', isCustomFont);

        // Aggiornamento visivo dell'icona, del tooltip e dello stato per lo Split-Button degli elenchi
        const btnList = document.getElementById('btnListMenu');
        if (btnList) {
            const defaultListSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`;

            if (activeListType) {
                btnList.classList.add('active-format');
                btnList.title = "Disattiva elenco (Riconverti in testo normale)";
                if (activeListType === 'checklist') btnList.innerHTML = `<span style="display:inline-flex; align-items:center;">${Icons.checkSquare}</span>`;
                else if (activeListType === 'ol-a') btnList.innerHTML = `<span style="font-size:14px; font-weight:bold; font-family:sans-serif;">A.</span>`;
                else if (activeListType === 'ol') btnList.innerHTML = `<span style="font-size:14px; font-weight:bold; font-family:sans-serif;">1.</span>`;
                else if (activeListType === 'ul') btnList.innerHTML = `<span style="font-size:18px; font-weight:bold; line-height:1;">•</span>`;
            } else {
                btnList.classList.remove('active-format');
                btnList.title = I18n.t('toolbar.lists') || "Elenchi e Diario";
                btnList.innerHTML = defaultListSvg;
            }
        }
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
            // Assicura esplicitamente la visualizzazione a blocco per non ereditare display flex orizzontali
            bq.style.display = 'block';

            const firstBlock = blocksToWrap[0];
            firstBlock.parentNode.insertBefore(bq, firstBlock);

            blocksToWrap.forEach(b => {
                // Se il blocco contiene interruzioni di riga <br>, ogni riga deve diventare un <p> separato
                const hasBr = b.querySelector && b.querySelector('br');
                if (hasBr) {
                    let currentP = document.createElement('p');
                    while (b.firstChild) {
                        const child = b.firstChild;
                        if (child.nodeType === 1 && child.tagName === 'BR') {
                            child.remove();
                            if (currentP.childNodes.length === 0) currentP.innerHTML = '<br>';
                            bq.appendChild(currentP);
                            currentP = document.createElement('p');
                        } else {
                            currentP.appendChild(child);
                        }
                    }
                    if (currentP.childNodes.length > 0) {
                        const cleanT = currentP.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
                        if (cleanT !== '' || currentP.querySelector('img, audio, iframe, input, svg') || bq.children.length === 0) {
                            bq.appendChild(currentP);
                        }
                    }
                    b.remove();
                } else if (b.tagName === 'P') {
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
        const hasSelectedCells = typeof TableManager !== 'undefined' && 
                                 TableManager.Selection && 
                                 TableManager.Selection.selectedCells && 
                                 TableManager.Selection.selectedCells.length > 0;

        // GESTIONE MULTICELLA TABELLA (Preserva la struttura HTML interna mutando solo i nodi testuali con snapshot forzato)
        if (hasSelectedCells) {
            Editor.saveSnapshot(true);
            const cells = TableManager.Selection.selectedCells;

            // 1. Verifica se tutto il testo presente nelle celle è già in maiuscolo
            let allText = '';
            cells.forEach(cell => {
                const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
                let tNode;
                while ((tNode = walker.nextNode())) {
                    allText += tNode.nodeValue || '';
                }
            });

            if (!allText.trim()) return;

            const isAllUpper = allText === allText.toUpperCase();
            const shouldBeUpper = !isAllUpper;

            // 2. Converte esclusivamente i nodi di testo senza alterare tag, classi o stili
            cells.forEach(cell => {
                const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
                let tNode;
                while ((tNode = walker.nextNode())) {
                    if (tNode.nodeValue) {
                        tNode.nodeValue = shouldBeUpper ? tNode.nodeValue.toUpperCase() : tNode.nodeValue.toLowerCase();
                    }
                }
            });

            if (AppState.currentNoteId) {
                const note = Store.getNote(AppState.currentNoteId);
                if (note) {
                    note.content = Editor.getCleanHTML();
                    note._isDirty = true;
                    note.updatedAt = new Date().toISOString();
                }
            }

            Store.triggerAutoSave();
            Editor.updateUndoRedoUI();
            return;
        }

        const selection = window.getSelection();
        if (selection.rangeCount > 0 && selection.isCollapsed) {
            if (typeof ColorManager !== 'undefined' && typeof ColorManager.expandSelectionToWord === 'function') {
                ColorManager.expandSelectionToWord(selection);
            }
        }
        if (!selection.rangeCount || selection.isCollapsed) return;
        const text = selection.toString();
        if (!text) return;
        Editor.saveSnapshot();
        let newText = (text === text.toUpperCase()) ? text.toLowerCase() : text.toUpperCase();
        document.execCommand('insertText', false, newText);
    },

    applyTextFormat: (prefix, className) => {
        // GESTIONE FORMATTAZIONE MULTICELLA TABELLA (Font Family & Font Size con snapshot forzato)
        const hasSelectedCells = typeof TableManager !== 'undefined' && 
                                 TableManager.Selection && 
                                 TableManager.Selection.selectedCells && 
                                 TableManager.Selection.selectedCells.length > 0;

        if (hasSelectedCells) {
            Editor.saveSnapshot(true);
            const cells = TableManager.Selection.selectedCells;

            cells.forEach(cell => {
                if (prefix === 'ff') {
                    // Rimuove qualsiasi classe di font-family precedente
                    cell.querySelectorAll('[class*="ff-"]').forEach(el => {
                        Array.from(el.classList).filter(c => c.startsWith('ff-')).forEach(c => el.classList.remove(c));
                    });

                    // Se non è il font di default, applica la classe specifica
                    if (className !== 'ff-default') {
                        const textOnly = cell.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
                        if (textOnly || cell.querySelector('img, audio, input, svg')) {
                            const span = document.createElement('span');
                            span.className = className;
                            while (cell.firstChild) span.appendChild(cell.firstChild);
                            cell.appendChild(span);
                        }
                    }
                } else if (prefix === 'fs') {
                    // Rimuove qualsiasi classe di font-size precedente
                    cell.querySelectorAll('[class*="fs-"]').forEach(el => {
                        Array.from(el.classList).filter(c => c.startsWith('fs-')).forEach(c => el.classList.remove(c));
                    });

                    // Se è small o large, applica la classe corrispondente
                    if (className === 'fs-small' || className === 'fs-large') {
                        const textOnly = cell.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
                        if (textOnly || cell.querySelector('img, audio, input, svg')) {
                            const span = document.createElement('span');
                            span.className = className;
                            while (cell.firstChild) span.appendChild(cell.firstChild);
                            cell.appendChild(span);
                        }
                    }
                }

                // Pulizia di span rimasti privi di attributi
                cell.querySelectorAll('span').forEach(sp => {
                    if (sp.classList.length === 0 && !sp.hasAttribute('style') && sp.attributes.length === 0) {
                        const parent = sp.parentNode;
                        while (sp.firstChild) parent.insertBefore(sp.firstChild, sp);
                        sp.remove();
                    }
                });
            });

            Editor.healWidgetWrappers();

            if (AppState.currentNoteId) {
                const note = Store.getNote(AppState.currentNoteId);
                if (note) {
                    note.content = Editor.getCleanHTML();
                    note._isDirty = true;
                    note.updatedAt = new Date().toISOString();
                }
            }

            Store.triggerAutoSave();
            if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
            Editor.updateToolbarFormatting();
            Editor.updateUndoRedoUI();
            return;
        }

        Editor.saveSnapshot();
        Editor.restoreSelection();

        const selection = window.getSelection();

        // AUTO-ESPANSIONE SULLA PAROLA CORRENTE (WORD-SNAP)
        if (selection.rangeCount > 0 && selection.isCollapsed) {
            if (typeof ColorManager !== 'undefined' && typeof ColorManager.expandSelectionToWord === 'function') {
                ColorManager.expandSelectionToWord(selection);
            }
        }

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

        // ZERO-FONT CONVERSION: Trasforma qualsiasi tag FONT residuo generato da execCommand in un elemento SPAN standard
        editor.querySelectorAll('font').forEach(fontEl => {
            const span = document.createElement('span');
            while (fontEl.attributes.length > 0) {
                span.setAttribute(fontEl.attributes[0].name, fontEl.attributes[0].value);
                fontEl.removeAttribute(fontEl.attributes[0].name);
            }
            while (fontEl.firstChild) span.appendChild(fontEl.firstChild);
            fontEl.parentNode.replaceChild(span, fontEl);
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

                if (el.tagName === 'SPAN') {
                    if (el.attributes.length === 0 || (el.classList.length === 0 && !el.hasAttribute('style'))) {
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

    /**
     * MOTORE CENTRALE DI SANIFICAZIONE PROFONDA (GOMMA FORMATTAZIONI)
     * Funzione riutilizzata sia da clearFormatting sia da handlePaste per garantire coerenza assoluta,
     * rimozione totale di stili alieni (-webkit, margin, padding, user-select)
     * e conservazione garantita delle classi di stile VanillaDesk (hl-c*, hl-u-c*, tx-c*, ff-*, fs-*).
     * TUTELA ASSOLUTA: Esclusione totale e blindata dei widget complessi di VanillaDesk.
     */
    cleanDOMTree: (container) => {
        if (!container) return;

        const isProtectedComplexWidget = (node) => {
            if (!node || !node.closest) return false;
            if (node.closest('.simple-table-wrapper')) return false;
            if (typeof WidgetManager !== 'undefined' && WidgetManager.isProtectedBlock(node)) return true;
            const shell = node.closest('.adv-widget-shell, .adv-table-wrapper, .adv-journal-wrapper, .code-wrapper, .block-citation, .adv-action-button-wrapper, [data-widget-type]');
            if (!shell) return false;
            const type = shell.getAttribute('data-widget-type');
            if (type === 'simple-table') return false;
            return true;
        };

        // Se il container stesso è o appartiene a un widget complesso di VanillaDesk, non toccarlo!
        if (isProtectedComplexWidget(container)) return;

        const doc = container.ownerDocument || document;

        // Rimozione pulita preventiva di tag non testuali o eseguibili (script, style, meta, link, noscript)
        container.querySelectorAll('script, style, meta, link, noscript').forEach(el => {
            if (!isProtectedComplexWidget(el)) el.remove();
        });
        // ZERO-FONT CONVERSION INIZIALE: Trasforma preventivamente qualsiasi tag FONT in SPAN (escludendo i widget protetti)
        container.querySelectorAll('font').forEach(fontEl => {
            if (isProtectedComplexWidget(fontEl)) return;
            const span = doc.createElement('span');
            while (fontEl.attributes.length > 0) {
                span.setAttribute(fontEl.attributes[0].name, fontEl.attributes[0].value);
                fontEl.removeAttribute(fontEl.attributes[0].name);
            }
            while (fontEl.firstChild) span.appendChild(fontEl.firstChild);
            fontEl.parentNode.replaceChild(span, fontEl);
        });

        const isSafeToTouch = (node) => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
            if (node.id === 'noteContent') return false;

            // I widget di VanillaDesk (e tutto ciò che contengono) non devono MAI essere toccati dalla gomma formattazioni
            if (isProtectedComplexWidget(node)) {
                return false;
            }

            // Se il nodo si trova all'interno di una tabella semplice (.simple-table-wrapper o tag table non complessa)
            if (node.closest && (node.closest('.simple-table-wrapper') || (node.closest('table') && !isProtectedComplexWidget(node)))) {
                return true;
            }

            // Se il nodo si trova all'interno di un'area editabile generica fuori dai widget complessi
            if (typeof WidgetManager !== 'undefined' && WidgetManager.isInsideEditableWidgetArea(node)) return true; 

            if (node.closest && node.closest('.internal-link, .file-link')) {
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

        // NOTA: 'HR' deve essere esplicitamente incluso in allowedTags affinché le linee di separazione non vengano cancellate dalla gomma
        const allowedTags = ['B', 'I', 'U', 'S', 'A', 'P', 'SPAN', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'BR', 'HR', 'IMG', 'INPUT', 'SVG', 'PATH', 'POLYLINE', 'LINE', 'RECT', 'CIRCLE'];
        
        // Rigido allineamento con il Design System di VanillaDesk: ammesse solo le classi ufficiali dell'app.
        // I prefissi validi sono rigorosamente vincolati ai token colore e tipografia di VanillaDesk.
        const allowedPrefixes = ['hl-c', 'hl-u-c', 'tx-c', 'ff-', 'fs-'];
        
        const allowedClasses = [
            // Link, Testo e Ricerca
            'internal-link', 'file-link', 'highlighted-text', 'search-highlight', 'active-highlight', 'tag-hash',
            // Allineamenti di testo VanillaDesk (definiti in tables.css)
            'text-left', 'text-center', 'text-right',
            // Utility colore VanillaDesk (definite in colors.css)
            'bg-none', 'tx-auto',
            // Struttura Shell Base
            'adv-widget-shell', 'adv-inline-shell', 'widget-header', 'adv-table-header', 'widget-drag-handle', 'adv-drag-handle', 'widget-options-btn', 'widget-icon', 'widget-title', 'adv-table-title', 'widget-tools', 'adv-tools', 'widget-body', 'widget-editable-area',
            // Tipi di Widget
            'widget-type-database', 'widget-type-pivot', 'widget-type-journal', 'widget-type-code', 'widget-type-buttonbar', 'widget-type-citation', 'widget-type-columns', 'widget-type-simple-table', 'widget-type-audio', 'widget-type-video',
            // Database
            'adv-table-wrapper', 'table-striped', 'adv-col-resizer',
            // Tabelle Semplici
            'simple-table-wrapper', 'table-row-trigger', 'table-col-trigger', 'table-move-trigger', 'adv-cell-selected',
            // Appunti Nascosti e Segnalibri
            'inline-note-wrapper', 'inline-note-marker', 'inline-note-data', 'adv-bookmark-marker', 'bookmark-icon', 'bookmark-comment-data',
            // Checklist
            'adv-checklist', 'adv-checklist-item', 'adv-checklist-cb', 'checklist-text',
            // Diario
            'adv-journal-wrapper', 'adv-journal-list', 'journal-date-node', 'journal-date-header', 'journal-toggle', 'journal-date-label', 'journal-time-list', 'journal-time-node', 'journal-time-label', 'journal-content', 'hidden-time',
            // Codice e Snippet Copiabili
            'code-wrapper', 'code-action-bar', 'code-action-btn', 'code-content', 'code-action-lang', 'code-action-copy', 'code-copy-btn',
            'adv-copy-snippet', 'snippet-text', 'snippet-copy-btn', 'snippet-masked',
            // Citazioni
            'block-citation', 'citation-body', 'citation-header',
            // Colonne Multi-Layout
            'adv-columns-container-wrap', 'adv-columns-continuous', 'adv-columns-independent', 'col-box', 'col-resizer'
        ];
        
        // Whitelist per attributi Data: include data-link-note per salvaguardare le descrizioni opzionali dei link
        const allowedDataAttrs = ['data-widget-type', 'data-image-ref', 'data-audio-ref', 'data-note-id', 'data-anchor', 'data-ref-id', 'data-file-path', 'data-link-note', 'data-tooltip', 'data-row', 'data-col', 'data-raw-value', 'data-decimals', 'data-opt-name', 'data-date', 'data-timer-expire', 'data-comment', 'data-ref-note', 'data-ref-type', 'data-collapsed', 'data-last-find', 'data-language'];

        const elementsToClean = [];

        if (container.id !== 'noteContent' && container.tagName !== 'BODY') {
            elementsToClean.push(container);
        }

        const walker = doc.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, null, false);
        let currentNode;
        while ((currentNode = walker.nextNode())) {
            if (currentNode.id === 'noteContent') continue;
            elementsToClean.push(currentNode);
        }

        // Processa ed esegue la sanificazione "Bottom-Up"
        const processElement = (el) => {
            if (!el || !el.parentNode) return null;

            const isProtectedWidget = isProtectedComplexWidget(el);
            if (!isSafeToTouch(el)) return el;

            let currentEl = el;
            let tag = currentEl.tagName.toUpperCase();

            // Srotola i contenitori DIV, HEADER, FOOTER, ASIDE, SECTION, ARTICLE creati da copia/incolla
            if (!isProtectedWidget && ['DIV', 'HEADER', 'FOOTER', 'ASIDE', 'SECTION', 'ARTICLE'].includes(tag)) {
                // Esclude le shell dei widget e le colonne registrate
                if (!currentEl.classList.contains('adv-widget-shell') && !currentEl.classList.contains('col-box') && !currentEl.classList.contains('adv-columns-independent') && !currentEl.classList.contains('adv-columns-container-wrap')) {
                    const hasBlockChildren = currentEl.querySelector('p, div, h1, h2, h3, h4, h5, h6, table, ul, ol, blockquote, .adv-widget-shell');
                    if (hasBlockChildren) {
                        // Srotola il contenitore inserendo direttamente i figli al suo posto
                        const parent = currentEl.parentNode;
                        while (currentEl.firstChild) parent.insertBefore(currentEl.firstChild, currentEl);
                        currentEl.remove();
                        return null;
                    } else {
                        // Singolo blocco di testo: convertilo in <p> senza copiare stili parassiti di Word
                        const p = doc.createElement('p');
                        while (currentEl.firstChild) p.appendChild(currentEl.firstChild);
                        currentEl.parentNode.replaceChild(p, currentEl);
                        currentEl = p;
                        tag = 'P';
                    }
                }
            }

            if (!allowedTags.includes(tag)) {
                const frag = doc.createDocumentFragment();
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
                if (attr.name === 'target' && tag === 'A') return;
                if (attr.name === 'src' && (tag === 'IMG' || tag === 'AUDIO')) return;
                if (attr.name === 'controls' && tag === 'AUDIO') return;
                if (attr.name === 'type' && ['UL', 'OL', 'INPUT'].includes(tag)) return;
                // Preserva l'attributo semantico start degli elenchi numerati
                if (attr.name === 'start' && tag === 'OL') return;
                // Preserva i modificatori di fusione celle per th e td
                if ((attr.name === 'colspan' || attr.name === 'rowspan') && (tag === 'TD' || tag === 'TH')) return;
                if (attr.name === 'contenteditable') return;
                if (attr.name === 'id' && (isProtectedWidget || currentEl.classList.contains('simple-table-wrapper') || currentEl.closest('.simple-table-wrapper'))) return;

                if (attr.name === 'class') {
                    const classes = attr.value.split(/\s+/).filter(cls => allowedClasses.includes(cls) || allowedPrefixes.some(p => cls.startsWith(p)));
                    if (classes.length > 0) currentEl.setAttribute('class', classes.join(' '));
                    else currentEl.removeAttribute('class');
                } else if (attr.name === 'style') {
                    if ((currentEl.classList.contains('inline-note-data') || currentEl.classList.contains('bookmark-comment-data')) && attr.value.includes('none')) {
                        currentEl.setAttribute('style', 'display: none;'); 
                    } else if ((tag === 'TD' || tag === 'TH') && /text-align\s*:\s*(center|right|left)/i.test(attr.value)) {
                        const m = attr.value.match(/text-align\s*:\s*(center|right|left)/i);
                        currentEl.setAttribute('style', `text-align: ${m[1].toLowerCase()};`);
                    } else if (tag === 'TABLE' && currentEl.classList.contains('table-striped')) {
                        currentEl.setAttribute('style', 'width:100%; table-layout:auto;');
                    } else if (isProtectedWidget) {
                        return;
                    } else {
                        // RIMOZIONE CATEGORICA DI TUTTI GLI STILI INLINE (color, background, font-family, font-size, -webkit, margin, padding, user-select)
                        // Sia fuori che dentro le celle delle tabelle semplici
                        currentEl.removeAttribute('style'); 
                    }
                } else if (attr.name.startsWith('data-')) {
                    if (allowedDataAttrs.includes(attr.name)) return;
                    currentEl.removeAttribute(attr.name);
                } else {
                    currentEl.removeAttribute(attr.name);
                }
            });

            // Srotola SPAN non protetti se rimasti privi di classi autorizzate
            if (tag === 'SPAN' && !isProtectedWidget) {
                const hasValidClass = currentEl.getAttribute('class') && currentEl.getAttribute('class').trim() !== '';
                const hasValidData = Array.from(currentEl.attributes).some(a => allowedDataAttrs.includes(a.name));
                if (!hasValidClass && !hasValidData) {
                    const parent = currentEl.parentNode;
                    while (currentEl.firstChild) parent.insertBefore(currentEl.firstChild, currentEl);
                    parent.removeChild(currentEl);
                    return null;
                }
            }
            
            return currentEl;
        };

        elementsToClean.reverse().forEach(el => processElement(el));

        // Pulizia ricorsiva degli SPAN rimasti vuoti o privi di classi autorizzate
        let changed = true;
        while (changed) {
            changed = false;
            container.querySelectorAll('span').forEach(sp => {
                if (isSafeToTouch(sp) && !isProtectedComplexWidget(sp)) {
                    const hasValidClass = sp.getAttribute('class') && sp.getAttribute('class').trim() !== '';
                    const hasValidData = Array.from(sp.attributes).some(a => allowedDataAttrs.includes(a.name));
                    if (!hasValidClass && !hasValidData) {
                        const parent = sp.parentNode;
                        if (parent) {
                            while (sp.firstChild) parent.insertBefore(sp.firstChild, sp);
                            sp.remove();
                            changed = true;
                        }
                    }
                }
            });
        }
    },

    clearFormatting: () => {
        Editor.saveSnapshot();
        Editor.restoreSelection();

        // 1. Controllo selezione multipla celle di TableManager
        if (typeof TableManager !== 'undefined' && TableManager.Selection && TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 0) {
            TableManager.Selection.selectedCells.forEach(cell => {
                Editor.cleanDOMTree(cell);
                // Pulizia degli attributi inline style superflui da td/th preservando solo text-align valido
                const rawStyle = (cell.getAttribute('style') || '').toLowerCase();
                const alignMatch = rawStyle.match(/text-align\s*:\s*(center|right|left)/i);
                if (alignMatch) {
                    cell.setAttribute('style', `text-align: ${alignMatch[1].toLowerCase()};`);
                } else {
                    cell.removeAttribute('style');
                }
            });
            Editor.healWidgetWrappers();
            const rootEditor = document.getElementById('noteContent');
            if (rootEditor && typeof Editor.ensureInlineWidgetBuffers === 'function') {
                Editor.ensureInlineWidgetBuffers(rootEditor);
            }
            Store.triggerAutoSave();
            Editor.updateToolbarFormatting();
            return;
        }

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        let range = selection.getRangeAt(0);
        let container = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentNode;

        // Se il cursore o la selezione si trova dentro un widget protetto di VanillaDesk (che non sia una tabella semplice),
        // la gomma formattazioni non deve avere alcun effetto per prevenire la corruzione dei dati.
        if (typeof WidgetManager !== 'undefined' && WidgetManager.isProtectedBlock(container) && !container.closest('.simple-table-wrapper')) {
            return;
        }

        // Se l'utente si trova dentro una cella di tabella semplice o ha selezionato una tabella semplice
        const tableCell = container.closest('td, th');
        const simpleTable = container.closest('.simple-table-wrapper') || (container.closest('table') && !container.closest('.adv-widget-shell:not(.simple-table-wrapper), .adv-table-wrapper'));

        if (tableCell && simpleTable) {
            // Se la selezione è all'interno di una singola cella di tabella semplice, sanifichiamo l'intera cella
            container = tableCell;
        } else if (tableCell && !simpleTable) {
            // È una cella appartenente a un Database o altro widget complesso: non toccare!
            return;
        } else if (simpleTable) {
            // Se la selezione abbraccia la tabella semplice, sanifichiamo l'intera tabella
            container = simpleTable.querySelector('table') || simpleTable;
        } else {
            let macroBlock = container.closest('ul, ol, blockquote, .journal-time-node');
            if (macroBlock && (!WidgetManager || !WidgetManager.isProtectedBlock(macroBlock))) {
                if (macroBlock.classList.contains('journal-time-node')) container = macroBlock.querySelector('.journal-content');
                else container = macroBlock;
            } else {
                let curr = container;
                while (curr && curr.id !== 'noteContent' && curr.tagName && !['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'].includes(curr.tagName)) {
                    curr = curr.parentNode;
                }
                if (curr && curr.id !== 'noteContent') {
                    // Se il blocco trovato è un widget protetto di VanillaDesk, non toccarlo!
                    if (typeof WidgetManager !== 'undefined' && WidgetManager.isProtectedBlock(curr) && !curr.closest('.simple-table-wrapper')) {
                        return;
                    }
                    container = curr;
                }
            }
        }

        // Delega la sanificazione profonda al motore unificato condiviso
        Editor.cleanDOMTree(container);

        try {
            const newRange = document.createRange();
            newRange.selectNodeContents(container);
            selection.removeAllRanges();
            selection.addRange(newRange);
        } catch(e) {}

        Editor.healWidgetWrappers();

        // Ripristino e purificazione deterministica dei cuscinetti ZWS post-pulizia
        const rootEditor = document.getElementById('noteContent');
        if (rootEditor && typeof Editor.ensureInlineWidgetBuffers === 'function') {
            Editor.ensureInlineWidgetBuffers(rootEditor);
        }

        Store.triggerAutoSave();
        Editor.updateToolbarFormatting();
    }
});