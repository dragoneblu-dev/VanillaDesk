/**
 * EditorPaste.js
 * Modulo isolato per la gestione degli eventi Copia, Taglia e Incolla.
 * FIX COPIA TABELLE: Eliminato l'algoritmo ridondante 2D a cicli quadrupli su stringa per il fallback plainText;
 * serializzazione TSV lineare e pulizia della classe adv-cell-selected dall'HTML copiato.
 * FIX PASTE BR to P: I <br> isolati nel testo diventano <p> preservando tabelle, liste e span protetti.
 * FIX SNIPPET & INLINE WIDGETS: Protezione assoluta dalle andate a capo (\n) negli snippet e
 * prevenzione dello split del DOM nativo del browser tramite BR-Shielding.
 * PURIFICAZIONE ISTANTANEA ALL'INCOLLA: Intercettore in fase di cattura su #inlineNoteInput e #bookmarkCommentInput
 * che applica immediatamente la funzione unica Editor.sanitizeMiniText.
 * FIX CELLE TABELLA GOOGLE DOCS: Srotolamento di <p> interni a <td>/<th> e singolo <br> su celle vuote,
 * azzerando i doppi a capo (<p></p><p></p>).
 * FIX INCOLLA TITOLI SU NOTA VUOTA: Rimozione del paragrafo vuoto target per evitare fusioni del browser,
 * con garanzia del paragrafo libero finale se il testo termina con un'intestazione o tabella.
 * FIX SPAZI DETERMINISTICI: Riallineamento millimetrico degli spazi iniziali e finali con pastedText,
 * eliminando lo spostamento e l'iniezione indebita di spazi bianchi.
 * FEAT CONVERSIONE ELENCHI WORD/DOCS: Parser semantico per convertire i paragrafi MsoList (Word) e le righe
 * numerate/puntate in veri elenchi nativi HTML (<ol> e <ul>) con rimozione dei marcatori testuali duplicati.
 */

Object.assign(Editor, {

    // Helper per convertire testo puro in HTML valido preservando spaziature, tab, caratteri speciali ed elenchi
    _formatPlainTextForHTML: (text) => {
        if (!text) return "";
        let str = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // 1. Escape entità HTML per evitare che stringhe come <noteId> vengano inghiottite come tag
        str = str.replace(/&/g, '&amp;')
                 .replace(/</g, '&lt;')
                 .replace(/>/g, '&gt;');

        // 2. Conversione tabulazioni in 4 spazi non comprimibili
        str = str.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');

        // 3. Preservazione sequenze di spazi multipli intenzionali
        str = str.replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length));

        // 4. Se è testo a riga singola (senza a capo), restituisce la stringa inline senza creare blocchi
        if (!str.includes('\n')) {
            return str;
        }

        // 5. Preservazione dello spazio iniziale di ogni riga
        str = str.replace(/(^|\n) +/g, (match) => {
            const hasNewline = match.startsWith('\n');
            const spacesCount = hasNewline ? match.length - 1 : match.length;
            return (hasNewline ? '\n' : '') + '&nbsp;'.repeat(spacesCount);
        });

        // 6. Composizione blocchi paragrafo conformi per testi su più righe ed elenchi
        const lines = str.split('\n');
        let htmlResult = '';
        let inListType = null; // 'ol' | 'ul' | null

        const olRegex = /^(\d+)[\.\)](\t|\s+)(.*)$/;
        const ulRegex = /^[-*•·](\t|\s+)(.*)$/;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            // Riconoscimento elenchi ordinati (1. Testo o 1) Testo)
            const olMatch = line.match(olRegex);
            // Riconoscimento elenchi puntati (- Testo, * Testo, • Testo)
            const ulMatch = line.match(ulRegex);

            if (olMatch) {
                if (inListType !== 'ol') {
                    if (inListType === 'ul') htmlResult += '</ul>';
                    htmlResult += '<ol>';
                    inListType = 'ol';
                }
                const content = olMatch[3].trim() || '<br>';
                htmlResult += `<li>${content}</li>`;
            } else if (ulMatch) {
                if (inListType !== 'ul') {
                    if (inListType === 'ol') htmlResult += '</ol>';
                    htmlResult += '<ul>';
                    inListType = 'ul';
                }
                const content = ulMatch[2].trim() || '<br>';
                htmlResult += `<li>${content}</li>`;
            } else {
                if (inListType) {
                    htmlResult += inListType === 'ol' ? '</ol>' : '</ul>';
                    inListType = null;
                }

                if (!line || line.trim() === '') {
                    htmlResult += '<p><br></p>';
                } else {
                    htmlResult += `<p>${line}</p>`;
                }
            }
        }

        if (inListType) {
            htmlResult += inListType === 'ol' ? '</ol>' : '</ul>';
        }

        return htmlResult;
    },

    // Parser semantico per convertire la struttura MsoList di Microsoft Word in veri elenchi <ol> e <ul>
    _convertWordListsToHTML: (docBody) => {
        // Seleziona esclusivamente i blocchi foglia (escludendo contenitori che racchiudono altri blocchi)
        const allBlocks = Array.from(docBody.querySelectorAll('p, div'));
        const paragraphs = allBlocks.filter(el => !el.querySelector('p, div, ul, ol, table, h1, h2, h3, h4, h5, h6'));

        let currentListEl = null;
        let currentListType = null; // 'ol' | 'ul'

        paragraphs.forEach(p => {
            const rawClass = p.className || '';
            const rawStyle = p.getAttribute('style') || '';
            const isMsoList = rawClass.includes('MsoList') || 
                              rawStyle.includes('mso-list') || 
                              !!p.querySelector('[style*="mso-list"]');

            const textContent = p.textContent || '';
            const trimmedText = textContent.trim();

            const isNumberedPattern = /^(\d+|[a-zA-Z])[\.\)](\t|\s+)/.test(trimmedText);
            const isBulletPattern = /^[•·\uF0B7\u2022\u25E6\u25AA\u2043\u2219\-](\t|\s+)/.test(trimmedText);

            if (isMsoList || isNumberedPattern || isBulletPattern) {
                const listType = isNumberedPattern ? 'ol' : 'ul';

                // Rimuove il marcatore MSO iniziale (es. "1.   " o "•   ") per evitare numeri o pallini doppi nel tag <li>
                const msoIgnoreSpan = p.querySelector('[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]');
                if (msoIgnoreSpan) {
                    msoIgnoreSpan.remove();
                }

                // Rimuove eventuali marcatori letterali residui rimasti nel primo nodo di testo del paragrafo
                const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null, false);
                const firstTextNode = walker.nextNode();
                if (firstTextNode) {
                    firstTextNode.nodeValue = firstTextNode.nodeValue.replace(/^(\d+[\.\)]|[•·\uF0B7\u2022\u25E6\u25AA\u2043\u2219\-]|\s|\t)+/, '');
                }

                // Se la lista precedente è di tipo diverso, la chiude
                if (currentListEl && currentListType !== listType) {
                    currentListEl = null;
                }

                // Crea il contenitore di lista se necessario
                if (!currentListEl) {
                    currentListEl = docBody.ownerDocument.createElement(listType);
                    currentListType = listType;
                    p.parentNode.insertBefore(currentListEl, p);
                }

                const li = docBody.ownerDocument.createElement('li');
                while (p.firstChild) {
                    li.appendChild(p.firstChild);
                }
                
                // Pulisce l'interno se rimasto vuoto
                if (li.textContent.trim() === '' && !li.querySelector('img, audio, input, svg')) {
                    li.innerHTML = '<br>';
                }

                currentListEl.appendChild(li);
                p.remove();
            } else {
                // Interruzione della sequenza di lista
                currentListEl = null;
                currentListType = null;
            }
        });
    },

    initCopyInterceptor: () => {
        const handleCopyCut = (e) => {
            const editorEl = document.getElementById('noteContent');
            if (!editorEl || !editorEl.contains(window.getSelection().anchorNode)) return;

            const sel = window.getSelection();
            if (sel.isCollapsed) return;

            e.preventDefault();

            const range = sel.getRangeAt(0);
            
            // Se sto copiando dentro un blocco codice, 
            // formatto come testo puro ignorando gli spazi di formattazione HTML.
            const anchorNode = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentNode : sel.anchorNode;
            const codeBlock = anchorNode.closest('.code-content');
            
            if (codeBlock) {
                const tempDiv = document.createElement('div');
                tempDiv.appendChild(range.cloneContents());
                
                // Sostituiamo i <br> con gli a capo reali
                let plainText = tempDiv.innerHTML.replace(/<br\s*\/?>/gi, '\n');
                
                // Rimuoviamo gli Zero-Width Spaces e gli spazi unificatori usati dal DOM
                plainText = plainText.replace(/<[^>]+>/g, '')
                                     .replace(/&nbsp;/g, ' ')
                                     .replace(/\u00A0/g, ' ')
                                     .replace(/\u200B/g, '')
                                     .replace(/&lt;/g, '<')
                                     .replace(/&gt;/g, '>')
                                     .replace(/&amp;/g, '&');
                
                e.clipboardData.setData('text/plain', plainText);
                
                // Rimuoviamo fisicamente se stiamo "Tagliando" (Cut)
                if (e.type === 'cut') {
                    Editor.saveSnapshot();
                    range.deleteContents();
                    if (typeof CodeManager !== 'undefined') CodeManager.highlightBlock(codeBlock, true);
                    Store.triggerAutoSave();
                }
                return;
            }

            // GESTIONE COPIA STANDARD (Per testo normale e tabelle)
            const clone = range.cloneContents();
            const tempDiv = document.createElement('div');
            tempDiv.appendChild(clone);

            // 1. Rimuove elementi di servizio e maniglie UI copiate accidentalmente
            tempDiv.querySelectorAll('.adv-col-resizer, .std-col-resizer, .widget-drag-handle, .widget-options-btn, .adv-tools, .adv-add-btn, .adv-table-footer-controls').forEach(el => el.remove());

            // 2. Rimuove classi temporanee di selezione dalle celle
            tempDiv.querySelectorAll('.adv-cell-selected').forEach(c => c.classList.remove('adv-cell-selected'));

            // 3. Normalizza input e checkbox nei cloni per renderne i dati visibili e copiabili
            tempDiv.querySelectorAll('input').forEach(input => {
                let val = '';
                if (input.type === 'checkbox') {
                    val = input.checked ? 'Sì' : 'No';
                } else {
                    val = input.getAttribute('data-raw-value') || input.value || input.getAttribute('value') || '';
                }
                const span = document.createElement('span');
                span.textContent = val;
                input.parentNode.replaceChild(span, input);
            });

            // Conserva l'HTML pulito con colspan e rowspan intatti
            const clipboardHTML = tempDiv.innerHTML;

            // 4. Formattazione tabulare snella per plainText (TSV per Excel/Notepad senza cicli quadrupli)
            tempDiv.querySelectorAll('table').forEach(table => {
                const tsv = Array.from(table.rows).map(row => 
                    Array.from(row.cells).map(cell => (cell.innerText || cell.textContent || '').trim().replace(/[\r\n\t]+/g, ' ')).join('\t')
                ).join('\n');
                table.parentNode.replaceChild(document.createTextNode('\n' + tsv + '\n'), table);
            });

            let htmlStr = tempDiv.innerHTML;
            htmlStr = htmlStr.replace(/<\/p>\s*<p>/gi, '\n');
            htmlStr = htmlStr.replace(/<p><br><\/p>/gi, '\n');
            htmlStr = htmlStr.replace(/<br\s*\/?>/gi, '\n');
            htmlStr = htmlStr.replace(/<\/li>\s*<li>/gi, '\n- ');
            htmlStr = htmlStr.replace(/<li>/gi, '- ');

            let cleanTextDiv = document.createElement('div');
            cleanTextDiv.innerHTML = htmlStr;
            
            let plainText = cleanTextDiv.innerText || cleanTextDiv.textContent;
            plainText = plainText.replace(/\u200B/g, '').replace(/\u00A0/g, ' '); 

            e.clipboardData.setData('text/html', clipboardHTML);
            e.clipboardData.setData('text/plain', plainText);

            if (e.type === 'cut') {
                Editor.saveSnapshot();
                range.deleteContents();
                Store.triggerAutoSave();
            }
        };

        document.addEventListener('copy', handleCopyCut);
        document.addEventListener('cut', handleCopyCut);
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
        
        const items = Array.from((e.clipboardData || e.originalEvent.clipboardData).items);
        let isImage = false;

        // 1. GESTIONE IMMAGINI INCOLLATE (Clipboard File)
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
                        document.execCommand('insertHTML', false, `<img src="${canvas.toDataURL('image/webp', 0.85)}"><p><br></p>`);
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(blob);
                return;
            }
        }

        if (isImage) return;

        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        
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

        let targetNode = sel.anchorNode;
        if (targetNode.nodeType === 3) targetNode = targetNode.parentNode;

        // Controllo contesti protetti ed editor dedicati (Note Inline e Commenti Segnalibri)
        const isInsideWidget = WidgetManager.isProtectedBlock(targetNode) || WidgetManager.isProtectedInline(targetNode);
        const codeWrapper = targetNode.closest('[data-widget-type="code"]');
        const snippetText = targetNode.closest('.snippet-text');

        const isHeavyLoad = pastedText.length > 15000 || (pastedHTML && pastedHTML.length > 30000);
        e.preventDefault();

        const processPaste = () => {
            try {
                Editor.saveSnapshot();

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
                        document.execCommand('insertHTML', false, cleanTextWithBrs);
                        Store.triggerAutoSave();
                        return;
                    }

                    let cleanText = pastedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                    
                    if (codeWrapper) {
                        const preNode = codeWrapper.querySelector('pre');
                        if (preNode.innerHTML === '<br>') preNode.innerHTML = '';
                        
                        const selection = window.getSelection();
                        let targetCaretPos = 0;
                        
                        // Calcoliamo l'offset matematico futuro prima di rompere il DOM
                        if (selection.rangeCount > 0 && typeof Editor._getCodeOffset === 'function') {
                            const startPos = Editor._getCodeOffset(preNode, selection.anchorNode, selection.anchorOffset);
                            const focusPos = Editor._getCodeOffset(preNode, selection.focusNode, selection.focusOffset);
                            const minPos = Math.min(startPos, focusPos);
                            
                            // La nuova posizione del cursore sarà dove eravamo + la lunghezza della stringa incollata
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
                            document.execCommand('insertHTML', false, formattedCellText);
                        } else {
                            document.execCommand('insertText', false, cleanText);
                        }
                    }
                    Store.triggerAutoSave();
                    return;
                }

                // GESTIONE INCOLLA TESTO PIATTO (PLAIN TEXT)
                if (!pastedHTML) {
                    if (!targetNode.closest('td, th, li, pre')) {
                        const formattedHTML = Editor._formatPlainTextForHTML(pastedText);
                        if (!pastedText.includes('\n')) {
                            // Testo inline a riga singola: inserimento puro senza spezzare i paragrafi
                            document.execCommand('insertText', false, pastedText);
                        } else {
                            document.execCommand('insertHTML', false, formattedHTML);
                        }
                    } else if (targetNode.closest('td, th, li')) {
                        let escaped = pastedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        escaped = escaped.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
                        escaped = escaped.replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length));
                        escaped = escaped.replace(/\r\n|\n|\r/g, '<br>');
                        document.execCommand('insertHTML', false, escaped);
                    } else {
                        document.execCommand('insertText', false, pastedText);
                    }
                    return;
                }

                // GESTIONE INCOLLA HTML (RICH TEXT)
                const allowedTags = ['B', 'I', 'U', 'S', 'A', 'P', 'DIV', 'SPAN', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'BR', 'IMG', 'SVG', 'PATH', 'POLYLINE', 'LINE', 'RECT', 'CIRCLE', 'INPUT'];
                const allowedPrefixes = ['hl-', 'tx-', 'bg-', 'text-', 'ff-', 'fs-'];
                
                const allowedClasses = [
                    'internal-link', 'file-link', 'highlighted-text', 'search-highlight', 'active-highlight',
                    'adv-widget-shell', 'adv-inline-shell', 'widget-header', 'adv-table-header', 'widget-drag-handle', 'adv-drag-handle', 'widget-options-btn', 'widget-icon', 'widget-title', 'adv-table-title', 'widget-tools', 'adv-tools', 'widget-body', 'widget-editable-area',
                    'widget-type-database', 'widget-type-pivot', 'widget-type-journal', 'widget-type-code', 'widget-type-buttonbar', 'widget-type-citation', 'widget-type-columns', 'widget-type-simple-table', 'widget-type-audio', 'widget-type-video',
                    'adv-table-wrapper', 'table-striped', 'adv-col-resizer',
                    'simple-table-wrapper', 'table-row-trigger', 'table-col-trigger', 'table-move-trigger',
                    'inline-note-wrapper', 'inline-note-marker', 'inline-note-data', 'adv-bookmark-marker', 'bookmark-icon', 'bookmark-comment-data',
                    'adv-checklist', 'adv-checklist-item', 'adv-checklist-cb', 'checklist-text',
                    'adv-journal-wrapper', 'adv-journal-list', 'journal-date-node', 'journal-date-header', 'journal-toggle', 'journal-date-label', 'journal-time-list', 'journal-time-node', 'journal-time-label', 'journal-content', 'hidden-time',
                    'code-wrapper', 'code-action-bar', 'code-action-btn', 'code-content', 'code-action-lang', 'code-action-copy', 'code-copy-btn', 'adv-copy-snippet', 'snippet-text', 'snippet-copy-btn',
                    'block-citation', 'citation-body', 'citation-header',
                    'adv-columns-container-wrap', 'adv-columns-continuous', 'adv-columns-independent', 'col-box', 'col-resizer'
                ];
                
                // Whitelist rigorosa per attributi Data (elimina data-id di altri siti web)
                const allowedDataAttrs = ['data-widget-type', 'data-image-ref', 'data-audio-ref', 'data-note-id', 'data-anchor', 'data-ref-id', 'data-file-path', 'data-tooltip', 'data-row', 'data-col', 'data-raw-value', 'data-decimals', 'data-opt-name', 'data-date', 'data-timer-expire', 'data-comment', 'data-ref-note', 'data-ref-type', 'data-collapsed', 'data-last-find', 'data-language'];

                const parser = new DOMParser();
                const doc = parser.parseFromString(pastedHTML, 'text/html');

                // FASE 0: RIMOZIONE CONTENITORI FITTIZI DI GOOGLE DOCS E TAG INTRUSIVI
                doc.querySelectorAll('script, style, meta, link, iframe, object, embed, noscript').forEach(el => el.remove());

                // Rimuove i commenti invisibili inseriti da Chrome/Word (es. <!--StartFragment-->)
                const iter = doc.createNodeIterator(doc.body, NodeFilter.SHOW_COMMENT, null, false);
                let commentNode;
                const commentsToRemove = [];
                while ((commentNode = iter.nextNode())) commentsToRemove.push(commentNode);
                commentsToRemove.forEach(c => c.remove());

                // Google Docs avvolge sistematicamente il contenuto in:
                // <b style="font-weight:normal;" id="docs-internal-guid-..."> o <strong style="font-weight:normal;">
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

                // FASE 1: CONVERSIONE SEMANTICA DEGLI STILI INLINE (Word, Google Docs, LibreOffice)
                const allElements = Array.from(doc.body.querySelectorAll('*')).reverse();

                allElements.forEach(el => {
                    if (WidgetManager.isProtectedBlock(el) || el.closest('.adv-widget-shell, .simple-table-wrapper, .adv-inline-shell')) {
                        return;
                    }

                    const tag = el.tagName.toUpperCase();
                    const rawStyle = (el.getAttribute('style') || '').toLowerCase();

                    // Rilevamento semantico unificato di Bold
                    const hasBoldWeight = (el.style && (el.style.fontWeight === 'bold' || el.style.fontWeight === 'bolder' || parseInt(el.style.fontWeight, 10) >= 600)) ||
                                          /font-weight\s*:\s*(bold|bolder|[6-9]00)/i.test(rawStyle) ||
                                          /mso-bidi-font-weight\s*:\s*bold/i.test(rawStyle);

                    // Rilevamento semantico unificato di Italic
                    const hasItalicStyle = (el.style && (el.style.fontStyle === 'italic' || el.style.fontStyle === 'oblique')) ||
                                           /font-style\s*:\s*(italic|oblique)/i.test(rawStyle);

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

                    if (tag === 'SPAN' || tag === 'FONT') {
                        const needB = hasBoldWeight && tag !== 'B';
                        const needI = hasItalicStyle && tag !== 'I';

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

                // FASE 2: NORMALIZZAZIONE DEI NODI DI TESTO E INDENTAZIONI DI WORD
                const textWalker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
                let textNode;
                while ((textNode = textWalker.nextNode())) {
                    if (textNode.parentNode && textNode.parentNode.closest('pre')) continue;

                    let str = textNode.nodeValue;
                    if (str.includes('\r') || str.includes('\n')) {
                        str = str.replace(/[\r\n]+/g, ' ');
                    }
                    textNode.nodeValue = str;
                }

                // FASE 3: SROTOLAMENTO STRUTTURALE DI <P> DENTRO <LI> (Google Docs clean-up)
                doc.querySelectorAll('li > p').forEach(pInsideLi => {
                    const li = pInsideLi.parentNode;
                    if (li && li.tagName === 'LI' && li.children.length === 1) {
                        while (pInsideLi.firstChild) li.insertBefore(pInsideLi.firstChild, pInsideLi);
                        pInsideLi.remove();
                    }
                });

                // FASE 3.1: NORMALIZZAZIONE CELLE TABELLE (PULIZIA DI <P> E SINGOLO <BR> PER CELLE VUOTE)
                doc.querySelectorAll('td, th').forEach(cell => {
                    cell.querySelectorAll('p, div').forEach(b => {
                        const parent = b.parentNode;
                        while (b.firstChild) parent.insertBefore(b.firstChild, b);
                        if (b.nextSibling) parent.insertBefore(doc.createElement('br'), b.nextSibling);
                        b.remove();
                    });
                    const cellCleanText = cell.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
                    if (!cellCleanText && !cell.querySelector('img, audio, input, svg')) {
                        cell.innerHTML = '<br>';
                    }
                });

                // FASE 4: SROTOLAMENTO DIV ESTERNI E PURIFICAZIONE ATTRIBUTI
                const cleanNode = (node) => {
                    if (node.nodeType === 3) return;

                    if (node.nodeType === 1) {
                        let tag = node.tagName.toUpperCase();
                        const isInternalWidget = node.closest('.adv-widget-shell, .simple-table-wrapper, .adv-inline-shell');

                        // Tag non ammessi (siti esterni)
                        if (!allowedTags.includes(tag)) {
                            const frag = doc.createDocumentFragment();
                            while (node.firstChild) frag.appendChild(node.firstChild);
                            node.parentNode.replaceChild(frag, node);
                            return;
                        }

                        // Srotolamento DIV/HEADER/ASIDE esterni in paragrafi <p>
                        if (!isInternalWidget && (tag === 'DIV' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'ASIDE')) {
                            const p = doc.createElement('p');
                            while (node.firstChild) p.appendChild(node.firstChild);
                            node.parentNode.replaceChild(p, node);
                            node = p;
                            tag = 'P';
                        }

                        // Purificazione chirurgica degli attributi: elimina dir, role, aria-*, style, color, face
                        const attrs = Array.from(node.attributes);
                        attrs.forEach(attr => {
                            if (tag === 'SVG' && ['viewBox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'].includes(attr.name)) return;
                            if (['PATH', 'POLYLINE', 'LINE', 'RECT', 'CIRCLE'].includes(tag) && ['d', 'points', 'x1', 'y1', 'x2', 'y2', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry'].includes(attr.name)) return;
                            if (attr.name === 'href' && tag === 'A') return;
                            if (attr.name === 'src' && (tag === 'IMG' || tag === 'AUDIO')) return;
                            if (attr.name === 'controls' && tag === 'AUDIO') return;
                            if (attr.name === 'type' && ['UL', 'OL', 'INPUT'].includes(tag)) return;
                            if (attr.name === 'start' && tag === 'OL') return;
                            if ((attr.name === 'colspan' || attr.name === 'rowspan') && (tag === 'TD' || tag === 'TH')) return;
                            if (attr.name === 'contenteditable') return;
                            if (attr.name === 'id' && isInternalWidget) return;

                            if (attr.name === 'class') {
                                const classes = attr.value.split(/\s+/).filter(cls => allowedClasses.includes(cls) || allowedPrefixes.some(p => cls.startsWith(p)));
                                if (classes.length > 0) node.setAttribute('class', classes.join(' '));
                                else node.removeAttribute('class');
                            }
                            else if (attr.name === 'style') {
                                if ((node.classList.contains('inline-note-data') || node.classList.contains('bookmark-comment-data')) && attr.value.includes('none')) {
                                    node.setAttribute('style', 'display: none;');
                                } else if (isInternalWidget) {
                                    return;
                                } else {
                                    node.removeAttribute('style'); 
                                }
                            }
                            else if (attr.name.startsWith('data-')) {
                                if (allowedDataAttrs.includes(attr.name)) return;
                                node.removeAttribute(attr.name);
                            }
                            else {
                                node.removeAttribute(attr.name);
                            }
                        });

                        // Srotola SPAN e FONT privi di classi/attributi rimasti dopo la pulizia
                        if ((tag === 'SPAN' || tag === 'FONT') && !isInternalWidget) {
                            if (node.attributes.length === 0) {
                                const frag = doc.createDocumentFragment();
                                while (node.firstChild) frag.appendChild(node.firstChild);
                                node.parentNode.replaceChild(frag, node);
                                return;
                            }
                        }
                    }

                    // Scansione Bottom-Up per evitare di saltare nodi
                    let child = node.lastChild;
                    while (child) {
                        const prev = child.previousSibling;
                        cleanNode(child);
                        child = prev;
                    }
                };

                // Avvia la purificazione partendo dalla coda
                let currNode = doc.body.lastChild;
                while (currNode) {
                    let prevNode = currNode.previousSibling;
                    cleanNode(currNode);
                    currNode = prevNode;
                }

                const lastBodyChild = doc.body.lastElementChild;
                if (lastBodyChild && ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE'].includes(lastBodyChild.tagName)) {
                    const p = doc.createElement('p');
                    p.innerHTML = '<br>';
                    doc.body.appendChild(p);
                }

                let finalHTML = doc.body.innerHTML;

                // Rimozione degli a capo strutturali posti agli estremi dal Sistema Operativo
                finalHTML = finalHTML.replace(/^[\r\n\t]+|[\r\n\t]+$/g, '');
                // Conversione fedele degli spazi non comprimibili generati dai browser su copia
                finalHTML = finalHTML.replace(/<span[^>]*class="Apple-converted-space"[^>]*>.*?<\/span>/gi, '&nbsp;');

                // Rimozione di link vuoti creati dai siti web
                finalHTML = finalHTML.replace(/<a[^>]*>\s*(<br\s*\/?>)?\s*<\/a>/gi, '');

                // Converte i <br> isolati del testo ordinario in blocchi di paragrafo preservando tabelle, liste e span protetti
                if (!targetNode.closest('td, th, li, pre')) {
                    let tempWrapper = document.createElement('div');
                    tempWrapper.innerHTML = finalHTML;
                    tempWrapper.querySelectorAll('.adv-inline-shell, .inline-note-data, .bookmark-comment-data, .snippet-text, table, ul, ol').forEach(el => {
                        el.innerHTML = el.innerHTML.replace(/<br\s*\/?>/gi, '%%%BR_SAFE%%%');
                    });
                    finalHTML = tempWrapper.innerHTML;

                    finalHTML = finalHTML.replace(/<br\s*\/?>/gi, '</p><p>');
                    finalHTML = finalHTML.replace(/<p>\s*<\/p>/gi, '<p><br></p>');

                    // Ripristino fedele dei <br> protetti dentro le celle delle tabelle e gli span
                    finalHTML = finalHTML.replace(/%%%BR_SAFE%%%/g, '<br>');
                }

                // =========================================================================
                // CORREZIONE RADICE SPAZI: RIALLINEAMENTO DETERMINISTICO CON PASTEDTEXT
                // Elimina l'aggiunta o sottrazione di spazi causata dal wrapping HTML di Word/Docs
                // =========================================================================
                const hasBlockTags = /<\/(p|div|h[1-6]|table|ul|ol|blockquote|pre)>/i.test(finalHTML);

                if (!hasBlockTags) {
                    // Per testo o formattazioni inline, ripulisce i margini parassiti e ripristina fedelmente gli spazi originali
                    finalHTML = finalHTML.replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '');

                    const leadingSpaces = pastedText.match(/^[ \t]*/)[0];
                    const trailingSpaces = pastedText.match(/[ \t]*$/)[0];
                    finalHTML = leadingSpaces + finalHTML + trailingSpaces;
                } else {
                    // Per blocchi complessi (es. documenti con tabelle da Word), elimina solo gli spazi parassiti prima e dopo i tag esterni
                    finalHTML = finalHTML.replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '');
                }

                // Gestione blocco vuoto per preservare la struttura dell'editor
                const currentSel = window.getSelection();
                if (currentSel.rangeCount > 0) {
                    const currentRange = currentSel.getRangeAt(0);
                    let blockUnderCursor = currentRange.startContainer.nodeType === 3 ? currentRange.startContainer.parentNode : currentRange.startContainer;
                    blockUnderCursor = blockUnderCursor.closest ? blockUnderCursor.closest('p, div, h1, h2, h3, h4, h5, h6') : null;

                    const isBlockEmpty = blockUnderCursor && blockUnderCursor.id !== 'noteContent' &&
                                         blockUnderCursor.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim() === '' &&
                                         !blockUnderCursor.querySelector('img, audio, iframe, .adv-widget-shell');

                    if (isBlockEmpty && blockUnderCursor.parentNode && hasBlockTags) {
                        currentRange.setStartBefore(blockUnderCursor);
                        currentRange.collapse(true);
                        blockUnderCursor.remove();
                        currentSel.removeAllRanges();
                        currentSel.addRange(currentRange);
                    }
                }

                document.execCommand('insertHTML', false, finalHTML);
                Editor._ensureLastLineBreak(document.getElementById('noteContent'));

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

// INTERCETTORE DIRETTO E ISTANTANEO INCOLLA PER NOTE INLINE E SEGNALIBRI:
// Pulisce l'HTML al momento esatto del paste tramite la procedura unica Editor.sanitizeMiniText,
// impedendo che l'utente veda anche solo temporaneamente testo sporco o formattazioni aliene a video.
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

    let textToClean = '';
    if (pastedHTML) {
        textToClean = pastedHTML;
    } else {
        textToClean = pastedText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\r\n|\n|\r/g, '<br>');
    }

    const cleanHTML = typeof Editor.sanitizeMiniText === 'function'
        ? Editor.sanitizeMiniText(textToClean)
        : pastedText.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    document.execCommand('insertHTML', false, cleanHTML);
}, true);