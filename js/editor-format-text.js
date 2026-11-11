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
 * ZERO-FONT UNIFICATION: Eliminazione integrale di ogni gestione del tag legacy <font> sostituito da standard W3C,
 * garantendo la preservazione assoluta delle classi di stile VanillaDesk (ff-*, fs-*, hl-c*, tx-c*).
 * WIDGET PROTECTION: Esclusione categorica di tutti i widget complessi di VanillaDesk dalla gomma formattazioni.
 * FEAT MULTI-CELL FORMATTING: Supporto a Maiuscolo/Minuscolo (toggleCase) e Carattere/Dimensione (applyTextFormat)
 * applicati simultaneamente a tutte le celle selezionate in TableManager con snapshot forzato per Undo/Redo immediato.
 * FIX MULTI-PARAGRAPH FONT PRESERVATION: Preservazione della selezione su paragrafi multipli tramite marker temporanei
 * post-execCommand.
 * FIX FONT INSPECTION ACCURACY: Rilevamento deterministico di font e dimensione tramite closest() sul punto di selezione,
 * prevenendo che ricerche non mirate forzino falsi positivi su font EasyReading da span non selezionati.
 * FEAT WORD-SNAP IN TOGGLE CASE: Integrazione coerente di Smart Caret Collapse in Editor.toggleCase.
 * FIX PARTIAL CELL TEXT FORMATTING & ERASER: Tutela della selezione parziale di testo all'interno di una singola cella
 * di tabella semplice, impedendo la mutazione o pulizia indiscriminata dell'intera cella.
 * FEAT FONT & SIZE PREVIEW ICONS: Mini-anteprima visiva del carattere e della grandezza accanto a ciascuna voce del menu.
 * FIX BLOCKQUOTE LIST WRAP: Supporto completo e fedele per la citazione a blocco di elenchi puntati (UL) e numerati (OL)
 * insieme al testo normale, preservando l'integrità strutturale della lista all'interno del tag blockquote.
 * FIX BR NORMALIZATION (SNELLO E LINEARE): Conversione di ogni <br> che rappresenta una riga in singoli paragrafi <p><br></p>,
 * preservando tutte le righe vuote consecutive senza comprimerle né lasciare <br> nudi a livello root.
 * FIX HEADING BOLD FALSE POSITIVE: Disattivazione automatica dell'indicatore 'B' all'interno delle intestazioni H1..H6
 * a meno che non sia presente un elemento semantico <b> o <strong> esplicito.
 * FEAT ZERO-SHIFT DYNAMIC SUBHEADING SLOT: Adattamento contestuale in-situ del secondo pulsante di titolo della toolbar
 * sui livelli profondi (H3..H6) con toggle-off naturale a paragrafo e zero layout shift orizzontale.
 * FIX CITAZIONI LIVE CHAPTER ID: Preservazione degli attributi ID con prefisso 'blk_' in cleanDOMTree
 * per impedire che la sanificazione cancelli gli ID delle intestazioni e dei blocchi citati.
 * FIX HEADING LEVEL TOGGLE ID PERSISTENCE (1.3): Cattura preventiva e riassegnazione automatica dell'ID blk_*
 * sul nuovo tag di intestazione durante toggleHeader, impedendo la distruzione dell'ancora citata.
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
                                 (typeof TableManager.Selection.hasCellSelection === 'function' 
                                     ? TableManager.Selection.hasCellSelection() 
                                     : TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 0);

        if (hasSelectedCells) {
            const firstCell = TableManager.Selection.selectedCells[0];
            const spanFF = firstCell.querySelector('.ff-serif, .ff-cursive, .ff-easyreading');
            if (spanFF) {
                if (spanFF.classList.contains('ff-serif')) activeFF = 'ff-serif';
                else if (spanFF.classList.contains('ff-cursive')) activeFF = 'ff-cursive';
                else if (spanFF.classList.contains('ff-easyreading')) activeFF = 'ff-easyreading';
            }
            const spanFS = firstCell.querySelector('.fs-small, .fs-large');
            if (spanFS) {
                if (spanFS.classList.contains('fs-small')) activeFS = 'fs-small';
                else if (spanFS.classList.contains('fs-large')) activeFS = 'fs-large';
            }
        } else {
            const sel = window.getSelection();
            const range = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0) : Editor.savedRange;

            let startNode = null;
            if (range) {
                startNode = range.startContainer;
                if (startNode && startNode.nodeType === Node.ELEMENT_NODE && startNode.childNodes && startNode.childNodes[range.startOffset]) {
                    startNode = startNode.childNodes[range.startOffset];
                }
            } else if (sel && sel.anchorNode) {
                startNode = sel.anchorNode;
            }

            if (startNode) {
                const startEl = startNode.nodeType === Node.TEXT_NODE ? startNode.parentNode : startNode;
                if (startEl && startEl.closest) {
                    const ffEl = startEl.closest('.ff-serif, .ff-cursive, .ff-easyreading');
                    if (ffEl) {
                        if (ffEl.classList.contains('ff-serif')) activeFF = 'ff-serif';
                        else if (ffEl.classList.contains('ff-cursive')) activeFF = 'ff-cursive';
                        else if (ffEl.classList.contains('ff-easyreading')) activeFF = 'ff-easyreading';
                    }

                    const fsEl = startEl.closest('.fs-small, .fs-large');
                    if (fsEl) {
                        if (fsEl.classList.contains('fs-small')) activeFS = 'fs-small';
                        else if (fsEl.classList.contains('fs-large')) activeFS = 'fs-large';
                    }
                }
            }
        }

        const items = [
            { type: 'custom', html: `<div class="adv-dropdown-title" style="margin-bottom: 2px;">${I18n.t('format_text.font_group')}</div>` },
            { 
                icon: '<span style="font-size:0.70rem; font-weight:bold; line-height:1;">Ft</span>',
                label: '<span class="ff-default">'+I18n.t('format_text.font_default')+'</span>' + (activeFF === 'ff-default' ? chk : ''), 
                onClick: () => executeFormat('ff', 'ff-default') 
            },
            { 
                icon: '<span style="font-size:0.70rem; font-weight:bold; line-height:1;">Ft</span>',
                label: '<span class="ff-serif">'+I18n.t('format_text.font_serif')+'</span>' + (activeFF === 'ff-serif' ? chk : ''), 
                onClick: () => executeFormat('ff', 'ff-serif') 
            },
            { 
                icon: '<span style="font-size:0.70rem; font-weight:bold; line-height:1;">Ft</span>',
                label: '<span class="ff-cursive">'+I18n.t('format_text.font_cursive')+'</span>' + (activeFF === 'ff-cursive' ? chk : ''), 
                onClick: () => executeFormat('ff', 'ff-cursive') 
            },
            { 
                icon: '<span style="font-size:0.70rem; font-weight:bold; line-height:1;">Ft</span>',
                label:'<span class="ff-easyreading">'+I18n.t('format_text.font_easyreading')+'</span>' + (activeFF === 'ff-easyreading' ? chk : ''), 
                onClick: () => executeFormat('ff', 'ff-easyreading') 
            },
            { type: 'divider' },
            { type: 'custom', html: `<div class="adv-dropdown-title" style="margin-bottom: 2px;">${I18n.t('format_text.size_group')}</div>` },
            { 
                icon: '<span class="fs-small" style="display:inline-flex; align-items:center; justify-content:center; font-size:0.70rem; font-weight:bold; line-height:1;">A</span>',
                label: I18n.t('format_text.size_small') + (activeFS === 'fs-small' ? chk : ''), 
                onClick: () => executeFormat('fs', 'fs-small') 
            },
            { 
                icon: '<span class="fs-standard" style="display:inline-flex; align-items:center; justify-content:center; font-size:0.85rem; font-weight:bold; line-height:1;">A</span>',
                label: I18n.t('format_text.size_standard') + (activeFS === 'fs-standard' ? chk : ''), 
                onClick: () => executeFormat('fs', 'fs-standard') 
            },
            { 
                icon: '<span class="fs-large" style="display:inline-flex; align-items:center; justify-content:center; font-size:1.9rem; font-weight:bold; line-height:1;">A</span>',
                label: I18n.t('format_text.size_large') + (activeFS === 'fs-large' ? chk : ''), 
                onClick: () => executeFormat('fs', 'fs-large') 
            }
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

        const sel = window.getSelection();
        let anchorEl = null;
        if (sel && sel.rangeCount > 0) {
            let n = sel.anchorNode;
            anchorEl = (n && n.nodeType === 3) ? n.parentNode : n;
        }

        const headingBlock = anchorEl ? anchorEl.closest('h1, h2, h3, h4, h5, h6') : null;

        // BOLD: queryCommandState('bold') restituisce true di default su tag di intestazione
        // a causa dello User-Agent Stylesheet del browser. L'icona "B" deve attivarsi solo se
        // l'utente ha inserito o selezionato un elemento semantico esplicito (b o strong).
        let isBold = document.queryCommandState('bold');
        if (headingBlock) {
            isBold = !!(anchorEl && anchorEl.closest('b, strong'));
        }

        toggleBtn('btnFormatB', isBold);
        toggleBtn('btnFormatI', document.queryCommandState('italic'));
        toggleBtn('btnFormatU', document.queryCommandState('underline'));
        toggleBtn('btnFormatS', document.queryCommandState('strikeThrough'));

        let isH1 = false;
        let isH2OrSub = false;
        let subHeadingTag = null; // 'h2', 'h3', 'h4', 'h5', 'h6'
        let isQuote = false;
        let isCustomFont = false;
        let activeListType = null;

        if (sel && sel.rangeCount > 0) {
            let node = sel.anchorNode;
            if (node && node.nodeType === 3) node = node.parentNode;

            const block = node ? node.closest('h1, h2, h3, h4, h5, h6, ul, ol') : null;
            if (block) {
                const tag = block.tagName.toLowerCase();
                if (tag === 'h1') {
                    isH1 = true;
                } else if (['h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
                    isH2OrSub = true;
                    subHeadingTag = tag;
                }
            }

            // Verifica se il cursore si trova dentro un blockquote di formattazione testuale
            const quoteBlock = node ? node.closest('blockquote:not(.adv-widget-shell)') : null;
            if (quoteBlock) {
                isQuote = true;
            }

            const span = node ? node.closest('span[class*="ff-"], span[class*="fs-"]') : null;
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

        // SLOT DINAMICO PER SOTTOTITOLI (H2..H6): adatta l'icona e l'indicatore in-situ senza causare layout shift
        const btnH2 = document.getElementById('btnFormatH2');
        if (btnH2) {
            if (isH2OrSub) {
                btnH2.classList.add('active-format');
                if (subHeadingTag === 'h2') {
                    if (btnH2.dataset.currentHeading !== 'h2') {
                        btnH2.innerHTML = (typeof Icons !== 'undefined' && Icons.h2) ? Icons.h2 : 'H2';
                        btnH2.title = (typeof I18n !== 'undefined' ? I18n.t('toolbar.h2') : "Titolo Secondario (Ctrl+Shift+2 / Ctrl+Alt+2)");
                        btnH2.dataset.currentHeading = 'h2';
                    }
                } else {
                    const levelLabel = subHeadingTag.toUpperCase();
                    if (btnH2.dataset.currentHeading !== subHeadingTag) {
                        btnH2.innerHTML = `<span style="font-weight:bold; font-size:0.75rem; font-family:sans-serif; line-height:1;">${levelLabel}</span>`;
                        btnH2.title = `${levelLabel} (${typeof I18n !== 'undefined' ? I18n.t('toolbar.h2') : 'Intestazione'})`;
                        btnH2.dataset.currentHeading = subHeadingTag;
                    }
                }
            } else {
                btnH2.classList.remove('active-format');
                if (btnH2.dataset.currentHeading && btnH2.dataset.currentHeading !== 'h2') {
                    btnH2.innerHTML = (typeof Icons !== 'undefined' && Icons.h2) ? Icons.h2 : 'H2';
                    btnH2.title = (typeof I18n !== 'undefined' ? I18n.t('toolbar.h2') : "Titolo Secondario (Ctrl+Shift+2 / Ctrl+Alt+2)");
                    btnH2.dataset.currentHeading = 'h2';
                }
            }
        }

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

        // Se siamo su H2..H6 e viene invocato il pulsante secondario attivo, esegue il toggle-off naturale a paragrafo 'p'
        const isSubHeadingToggle = targetTag === 'h2' && ['h2', 'h3', 'h4', 'h5', 'h6'].includes(currentTag);

        // PRESERVAZIONE ID CAPITOLO (blk_*): se il blocco ha un ID capitolo citato, lo salviamo prima di formatBlock
        const savedBlkId = (blockElement.id && blockElement.id.startsWith('blk_')) ? blockElement.id : null;

        if (currentTag === targetTag || isSubHeadingToggle) {
            document.execCommand('formatBlock', false, 'p');
        } else {
            document.execCommand('formatBlock', false, targetTag);
        }

        // RIPRISTINO ID CAPITOLO: riassegna l'ID blk_* al nuovo blocco solo se è ancora un'intestazione
        if (savedBlkId) {
            const currentSel = window.getSelection();
            if (currentSel.rangeCount > 0) {
                let n = currentSel.getRangeAt(0).commonAncestorContainer;
                if (n.nodeType === 3) n = n.parentNode;
                const newBlock = n.closest('h1, h2, h3, h4, h5, h6');
                if (newBlock) {
                    newBlock.id = savedBlkId;
                }
            }
        }
        
        Editor.healWidgetWrappers();
        Editor.updateToolbarFormatting();
    },

    toggleBlockquote: () => {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        let range = selection.getRangeAt(0);
        let container = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentNode;

        // Protezione: non alterare blocchi di codice protetti o widget complessi (eccetto le citazioni)
        if (container.closest('.code-content') || container.closest('.adv-widget-shell:not(.block-citation)')) return;

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

            // Se existingBq contiene blocchi strutturati (p, div, ul, ol, h1..h6, table), li estrae direttamente
            const hasBlockChildren = Array.from(existingBq.children).some(c => 
                ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE'].includes(c.tagName)
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

            // Helper di risoluzione: individua il blocco top-level rispetto all'editor (risalendo i LI ai loro UL/OL)
            const getTopBlock = (node) => {
                let curr = node.nodeType === 3 ? node.parentNode : node;
                while (curr && curr.parentNode && curr.parentNode !== editorRoot && curr !== editorRoot) {
                    if (curr.tagName === 'LI' && (curr.parentNode.tagName === 'UL' || curr.parentNode.tagName === 'OL')) {
                        curr = curr.parentNode;
                        continue;
                    }
                    if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'TABLE', 'PRE'].includes(curr.tagName)) {
                        if (curr.parentNode === editorRoot) break;
                    }
                    curr = curr.parentNode;
                }
                return (curr && curr !== editorRoot) ? curr : null;
            };

            const startBlock = getTopBlock(range.startContainer);
            const endBlock = getTopBlock(range.endContainer);

            let blocksToWrap = [];

            if (startBlock && endBlock) {
                // Raccoglie in sequenza tutti i blocchi fratelli compresi tra startBlock e endBlock
                let curr = startBlock;
                while (curr) {
                    blocksToWrap.push(curr);
                    if (curr === endBlock) break;
                    curr = curr.nextElementSibling;
                }
            } else if (startBlock) {
                blocksToWrap.push(startBlock);
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
                // Se il blocco è una lista (UL o OL), la inseriamo INTERA dentro il blockquote preservando elenchi e punti
                if (b.tagName === 'UL' || b.tagName === 'OL') {
                    bq.appendChild(b);
                } 
                // Se è un paragrafo normale
                else if (b.tagName === 'P') {
                    bq.appendChild(b);
                } 
                // Se è un blocco generico contenente interruzioni di riga <br>
                else {
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
                    } else {
                        const p = document.createElement('p');
                        while (b.firstChild) p.appendChild(b.firstChild);
                        b.remove();
                        bq.appendChild(p);
                    }
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
        // GESTIONE FORMATTAZIONE MULTICELLA TABELLA
        // Se c'è una selezione di testo parziale dentro una singola cella, hasCellSelection ritorna false
        // per consentire l'inversione di case solo della selezione testuale parziale
        const hasSelectedCells = typeof TableManager !== 'undefined' && 
                                 TableManager.Selection && 
                                 (typeof TableManager.Selection.hasCellSelection === 'function' 
                                     ? TableManager.Selection.hasCellSelection() 
                                     : TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 0);

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
        let wasAutoExpanded = false;

        // AUTO-ESPANSIONE SULLA PAROLA CORRENTE (WORD-SNAP) SE IL CURSORE È COLLASSATO
        if (selection.rangeCount > 0 && selection.isCollapsed) {
            if (typeof ColorManager !== 'undefined' && typeof ColorManager.expandSelectionToWord === 'function') {
                wasAutoExpanded = ColorManager.expandSelectionToWord(selection);
            }
        }
        if (!selection.rangeCount || selection.isCollapsed) return;
        const text = selection.toString();
        if (!text) return;
        Editor.saveSnapshot();
        let newText = (text === text.toUpperCase()) ? text.toLowerCase() : text.toUpperCase();
        document.execCommand('insertText', false, newText);

        // SMART CARET COLLAPSE: Collassa a fine parola per evitare sovrascritture accidentali
        if (wasAutoExpanded) {
            const currentSel = window.getSelection();
            if (currentSel && currentSel.rangeCount > 0) {
                currentSel.collapseToEnd();
                if (typeof Editor !== 'undefined') {
                    Editor.savedRange = currentSel.getRangeAt(0).cloneRange();
                }
            }
        }

        Store.triggerAutoSave();
        Editor.updateToolbarFormatting();
    },

    applyTextFormat: (prefix, className) => {
        // GESTIONE FORMATTAZIONE MULTICELLA TABELLA (Font Family & Font Size con snapshot forzato)
        const hasSelectedCells = typeof TableManager !== 'undefined' && 
                                 TableManager.Selection && 
                                 (typeof TableManager.Selection.hasCellSelection === 'function' 
                                     ? TableManager.Selection.hasCellSelection() 
                                     : TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 0);

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

                // Srotolamento ricorsivo di tutti gli span rimasti privi di classi o attributi
                let cleanChanged = true;
                while (cleanChanged) {
                    cleanChanged = false;
                    cell.querySelectorAll('span').forEach(sp => {
                        if (sp.getAttribute('class') === '') sp.removeAttribute('class');
                        if (sp.getAttribute('style') === '') sp.removeAttribute('style');
                        const hasNoClass = !sp.hasAttribute('class') || sp.getAttribute('class').trim() === '';
                        const hasNoStyle = !sp.hasAttribute('style') || sp.getAttribute('style').trim() === '';
                        if (sp.attributes.length === 0 || (hasNoClass && hasNoStyle)) {
                            const parent = sp.parentNode;
                            if (parent) {
                                while (sp.firstChild) parent.insertBefore(sp.firstChild, sp);
                                sp.remove();
                                cleanChanged = true;
                            }
                        }
                    });
                }
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

        // PRESERVAZIONE DELLA SELEZIONE MULTI-PARAGRAFO TRAMITE MARKER TEMPORANEI
        let startMarker = null;
        let endMarker = null;

        if (selection.rangeCount > 0) {
            const postExecRange = selection.getRangeAt(0);
            if (!postExecRange.collapsed) {
                startMarker = document.createElement('span');
                startMarker.id = 'adv-font-sel-start';
                startMarker.style.display = 'none';

                endMarker = document.createElement('span');
                endMarker.id = 'adv-font-sel-end';
                endMarker.style.display = 'none';

                const endR = postExecRange.cloneRange();
                endR.collapse(false);
                endR.insertNode(endMarker);

                const startR = postExecRange.cloneRange();
                startR.collapse(true);
                startR.insertNode(startMarker);
            }
        }

        // Conversione post-taglio dai magic tags alle classi pulite dell'applicazione
        editor.querySelectorAll('*').forEach(el => {
            if (typeof ColorManager !== 'undefined' && !ColorManager._isSafeToColor(el)) return;

            if (prefix === 'ff') {
                const faceAttr = el.getAttribute('face') || '';
                const ffStyle = (el.style.fontFamily || '').replace(/['"]/g, '').trim(); 
                
                if (faceAttr === 'MagicRemoveFF' || ffStyle === 'MagicRemoveFF') {
                    el.removeAttribute('face');
                    el.style.fontFamily = '';
                    el.classList.remove('ff-serif', 'ff-cursive', 'ff-easyreading');
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

        // Garbage collection dei nodi vuoti lasciati indietro (preservando i marker di selezione)
        let changed = true;
        while (changed) {
            changed = false;
            editor.querySelectorAll('*').forEach(el => {
                if (typeof ColorManager !== 'undefined' && !ColorManager._isSafeToColor(el)) return;
                if (el === startMarker || el === endMarker) return;

                if (el.getAttribute('class') === '') el.removeAttribute('class');
                if (el.getAttribute('style') === '') el.removeAttribute('style');
                if (el.getAttribute('face') === '') el.removeAttribute('face');
                if (el.getAttribute('size') === '') el.removeAttribute('size');
                if (el.getAttribute('color') === '') el.removeAttribute('color');

                if (el.tagName === 'SPAN' || el.tagName === 'FONT') {
                    const hasNoClass = !el.hasAttribute('class') || el.getAttribute('class').trim() === '';
                    const hasNoStyle = !el.hasAttribute('style') || el.getAttribute('style').trim() === '';
                    const hasNoFace = !el.hasAttribute('face');
                    const hasNoSize = !el.hasAttribute('size');
                    const hasNoColor = !el.hasAttribute('color');

                    if (el.attributes.length === 0 || (hasNoClass && hasNoStyle && hasNoFace && hasNoSize && hasNoColor)) {
                        const parent = el.parentNode;
                        if (parent) {
                            while (el.firstChild) parent.insertBefore(el.firstChild, el);
                            parent.removeChild(el);
                            changed = true;
                        }
                    }
                }
            });
        }

        // RIPRISTINO ESATTO DELLA SELEZIONE MULTI-PARAGRAFO
        if (startMarker && endMarker && startMarker.parentNode && endMarker.parentNode) {
            const restoredRange = document.createRange();
            restoredRange.setStartAfter(startMarker);
            restoredRange.setEndBefore(endMarker);

            startMarker.remove();
            endMarker.remove();
            editor.normalize();

            selection.removeAllRanges();
            selection.addRange(restoredRange);
            Editor.savedRange = restoredRange.cloneRange();
        } else {
            editor.normalize();
        }

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
     * NORMALIZZAZIONE STRUTTURALE DEI BR: Converte i <br> multipli o orfani a livello di blocco in singoli paragrafi <p> e <p><br></p>.
     */
    cleanDOMTree: (container) => {
        if (!container) return;

        const isProtectedComplexWidget = (node) => {
            if (!node || !node.closest) return false;
            if (node.closest('.simple-table-wrapper') || node.closest('table:not(.adv-table)')) return false;
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

        // Conversione preventiva di tag legacy <font> in <span> per preservare classi e conformità W3C
        const fontElements = Array.from(container.querySelectorAll('font'));
        fontElements.forEach(fontEl => {
            if (isProtectedComplexWidget(fontEl)) return;
            const span = doc.createElement('span');
            Array.from(fontEl.attributes).forEach(attr => {
                span.setAttribute(attr.name, attr.value);
            });
            while (fontEl.firstChild) span.appendChild(fontEl.firstChild);
            if (fontEl.parentNode) {
                fontEl.parentNode.replaceChild(span, fontEl);
            }
        });

        const isSafeToTouch = (node) => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
            if (node.id === 'noteContent') return false;

            // I widget complessi di VanillaDesk non devono MAI essere toccati dalla gomma formattazioni
            if (isProtectedComplexWidget(node)) {
                return false;
            }

            // Se il nodo si trova all'interno di una tabella semplice, è testo sempre editabile e pulibile
            if (node.closest && (node.closest('.simple-table-wrapper') || node.closest('table:not(.adv-table)'))) {
                return true;
            }

            // Se il nodo si trova all'interno di un'area editabile generica fuori dai widget complessi
            if (typeof WidgetManager !== 'undefined' && WidgetManager.isInsideEditableWidgetArea(node)) return true; 

            // PROTEZIONE ANCESTRALE RIGOROSA WIDGET INLINE & LINK:
            // Se il nodo o uno qualsiasi dei suoi antenati appartiene a link, segnalibri, appunti nascosti o snippet, NON toccarlo!
            if (node.closest && (
                node.closest('.internal-link, .file-link') ||
                node.closest('.adv-bookmark-marker') ||
                node.closest('.inline-note-wrapper') ||
                node.closest('.adv-copy-snippet') ||
                node.closest('.adv-inline-shell')
            )) {
                return false;
            }
            if (node.classList && (
                node.classList.contains('internal-link') || 
                node.classList.contains('file-link') || 
                node.classList.contains('inline-note-marker') || 
                node.classList.contains('inline-note-data') || 
                node.classList.contains('adv-bookmark-marker') || 
                node.classList.contains('bookmark-icon') || 
                node.classList.contains('bookmark-comment-data') || 
                node.classList.contains('adv-copy-snippet') ||
                node.classList.contains('snippet-copy-btn') ||
                node.classList.contains('snippet-text')
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
                
                // PRESERVAZIONE ID: Protegge widget, tabelle, segnalibri E ANCHE gli ID dei blocchi/capitoli citati (blk_*)
                if (attr.name === 'id' && (
                    (currentEl.id && currentEl.id.startsWith('blk_')) ||
                    isProtectedWidget || 
                    currentEl.classList.contains('simple-table-wrapper') || 
                    currentEl.closest('.simple-table-wrapper') || 
                    currentEl.classList.contains('adv-bookmark-marker')
                )) return;

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
                        // RIMOZIONE CATEGORICA DI TUTTI GLI STILI INLINE
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
                    if (sp.getAttribute('class') === '') sp.removeAttribute('class');
                    if (sp.getAttribute('style') === '') sp.removeAttribute('style');
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

        // =========================================================================
        // NORMALIZZAZIONE STRUTTURALE BR -> P (SNELLA, O(N), SENZA OVER-ENGINEERING):
        // 1. Converte ogni <br> orfano a livello contenitore (es. tra due <p> o tra <p> e <ul>) in <p><br></p>.
        // 2. Converte blocchi <p>/<div> con <br> multipli (<p><br><br><br></p>) in singoli <p><br></p>.
        // 3. Converte i <br> che separano testo in distinti paragrafi <p>.
        // =========================================================================
        const isProtectedContext = (el) => {
            if (!el || !el.closest) return false;
            return !!el.closest('table, td, th, ul, ol, li, pre, code, .adv-widget-shell, .adv-inline-shell, .inline-note-wrapper, .inline-note-data, .adv-bookmark-marker, .bookmark-comment-data, [data-widget-type]');
        };

        // 1. I <br> orfani a livello radice del container diventano <p><br></p>
        Array.from(container.children).forEach(child => {
            if (child.tagName === 'BR' && !isProtectedContext(child)) {
                const p = doc.createElement('p');
                p.innerHTML = '<br>';
                container.replaceChild(p, child);
            }
        });

        // 2. I blocchi <p> e <div> contenenti <br>
        const blocksWithBr = Array.from(container.querySelectorAll('p, div')).filter(b => {
            if (isProtectedContext(b)) return false;
            if (b.querySelector('table, ul, ol, pre, hr, .adv-widget-shell, [data-widget-type]')) return false;
            return b.querySelector('br') !== null;
        });

        blocksWithBr.forEach(block => {
            const parent = block.parentNode;
            if (!parent) return;

            const textOnly = block.textContent.replace(/[\u200B\uFEFF\u00A0\s\r\n]/g, '');
            const hasMedia = block.querySelector('img, audio, iframe, input, svg');
            const brList = block.querySelectorAll('br');

            // Caso A: Paragrafo già conforme (<p><br></p> singolo)
            if (!textOnly && !hasMedia && brList.length === 1 && block.childNodes.length === 1 && block.tagName === 'P') {
                return;
            }

            // Srotola preventivamente elementi inline che racchiudono solo <br>
            block.querySelectorAll('span, b, i, u, s, font').forEach(inlineEl => {
                const iText = inlineEl.textContent.replace(/[\u200B\uFEFF\u00A0\s\r\n]/g, '');
                const iMedia = inlineEl.querySelector('img, audio, iframe, input, svg');
                if (!iText && !iMedia && inlineEl.querySelector('br')) {
                    const pNode = inlineEl.parentNode;
                    while (inlineEl.firstChild) pNode.insertBefore(inlineEl.firstChild, inlineEl);
                    inlineEl.remove();
                }
            });

            const cleanTextAfter = block.textContent.replace(/[\u200B\uFEFF\u00A0\s\r\n]/g, '');
            const hasMediaAfter = block.querySelector('img, audio, iframe, input, svg');
            const totalBrs = block.querySelectorAll('br').length;

            // Caso B: Blocco con soli <br> (es. <p><br><br><br><br></p>) -> N singoli <p><br></p>
            if (!cleanTextAfter && !hasMediaAfter) {
                const frag = doc.createDocumentFragment();
                for (let i = 0; i < totalBrs; i++) {
                    const p = doc.createElement('p');
                    p.innerHTML = '<br>';
                    frag.appendChild(p);
                }
                parent.replaceChild(frag, block);
                return;
            }

            // Caso C: Blocco con testo e <br> -> spezza sui <br> diretti
            if (Array.from(block.childNodes).some(n => n.nodeType === Node.ELEMENT_NODE && n.tagName === 'BR')) {
                const frag = doc.createDocumentFragment();
                let currentP = doc.createElement('p');
                if (block.className) currentP.className = block.className;

                while (block.firstChild) {
                    const child = block.firstChild;
                    if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'BR') {
                        child.remove();
                        if (currentP.childNodes.length === 0) currentP.innerHTML = '<br>';
                        frag.appendChild(currentP);
                        currentP = doc.createElement('p');
                        if (block.className) currentP.className = block.className;
                    } else {
                        currentP.appendChild(child);
                    }
                }

                if (currentP.childNodes.length > 0) {
                    const t = currentP.textContent.replace(/[\u200B\uFEFF\u00A0\s\r\n]/g, '');
                    const m = currentP.querySelector('img, audio, iframe, input, svg');
                    if (t || m) frag.appendChild(currentP);
                }

                if (frag.childNodes.length > 0) {
                    parent.replaceChild(frag, block);
                }
            }
        });
    },

    clearFormatting: () => {
        Editor.saveSnapshot();
        Editor.restoreSelection();

        // 1. Controllo selezione multipla celle di TableManager
        const hasSelectedCells = typeof TableManager !== 'undefined' && 
                                 TableManager.Selection && 
                                 (typeof TableManager.Selection.hasCellSelection === 'function' 
                                     ? TableManager.Selection.hasCellSelection() 
                                     : TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 0);

        if (hasSelectedCells) {
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
            const isFullCellSelected = selection.isCollapsed || range.toString().trim() === tableCell.textContent.trim();
            if (isFullCellSelected) {
                container = tableCell;
            }
        } else if (tableCell && !simpleTable) {
            return;
        } else if (simpleTable) {
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