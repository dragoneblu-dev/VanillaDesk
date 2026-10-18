/**
 * EditorPaste.js
 * Modulo isolato per la gestione degli eventi Copia, Taglia e Incolla.
 * FIX COPIA: Algoritmo generico lineare a blocchi per plainText che garantisce la corrispondenza 1:1
 * esatta delle righe vuote copiate, eliminando alla radice duplicazioni e sparizioni di a capo.
 * FIX PASTE BR to P: Preserva la struttura a paragrafi nativa evitando la generazione di righe vuote superflue.
 * FIX SNIPPET & INLINE WIDGETS: Protezione assoluta dalle andate a capo (\n) negli snippet e
 * prevenzione dello split del DOM nativo del browser tramite BR-Shielding.
 * PURIFICAZIONE ISTANTANEA ALL'INCOLLA: Intercettore in fase di cattura su #inlineNoteInput e #bookmarkCommentInput
 * che applica immediatamente la funzione unica Editor.sanitizeMiniText.
 * FIX CELLE TABELLA GOOGLE DOCS & WORD: Srotolamento di <p> interni a <td>/<th>, purificazione degli stili
 * inline non conformi e pulizia spazi/BR orfani a inizio e fine cella.
 * FIX INCOLLA TITOLI SU NOTA VUOTA: Rimozione del paragrafo vuoto target per evitare fusioni del browser,
 * con garanzia del paragrafo libero finale se il testo termina con un'intestazione o tabella.
 * FIX SPAZI DETERMINISTICI: Riallineamento millimetrico degli spazi iniziali e finali con pastedText.
 * FEAT CONVERSIONE ELENCHI WORD/DOCS: Parser semantico per convertire i paragrafi MsoList (Word) e le righe
 * numerate/puntate in veri elenchi nativi HTML (<ol> e <ul>) con rimozione dei marcatori testuali duplicati.
 * FIX LINK VANILLADESK: Preservazione integrale di link interni, file link, link esterni e descrizioni personalizzate (data-link-note).
 * FIX WORD 365 PARASITE CLEANUP: Utilizzo diretto di Editor.cleanDOMTree (motore Gomma Formattazioni) per eliminare
 * tutte le classi parassite (MsoNormal), gli stili (-webkit, margin, padding, user-select) e gli elementi proprietari Office.
 * FIX WORD 365 DOUBLE EMPTY LINES: Rimozione preventiva dei tag <o:p>, pulizia whitespace tra blocchi, estirpazione
 * dei trailing <br> a fine paragrafo e abolizione della sostituzione indiscriminata di <br> con </p><p>.
 * FIX SPREADSHEET DEEP SANITIZE: Sanificazione approfondita delle singole celle in _createSimpleTableFromExcel tramite Editor.cleanDOMTree.
 * FEAT ANCESTOR STYLE CAPTURE ON COPY: Preservazione deterministica dei tag (b, i, u, s, code, a) e delle classi di stile VanillaDesk
 * (tx-c*, hl-c*, ff-*, fs-*) quando si copia una porzione di testo interna a elementi formattati.
 * FIX ORPHAN LI WRAP: Incapsulamento automatico di nodi <li> orfani copiati o incollati all'interno del relativo <ul>/<ol>,
 * impedendo che vengano iniettati all'interno di tag <p>.
 * ZERO-FONT PURITY: Conversione preventiva di qualsiasi tag <font> in <span> all'incolla con salvaguardia delle classi ff-* e fs-*.
 * FEAT SMART URL AUTO-LINK: Riconoscimento istantaneo di URL http/https incollati. Se è presente una selezione di testo
 * viene eseguito il Link-Wrap automatico; se il cursore è libero inserisce il link attivo direttamente senza menu invasivi.
 */

Object.assign(Editor, {

    // Helper per verificare se i dati negli appunti provengono da un foglio di calcolo isolato (e non da un documento Word/Docs)
    _isExcelOrSpreadsheetPaste: (pastedHTML, pastedText) => {
        if (!pastedHTML && !pastedText) return false;

        if (pastedHTML) {
            const lowerHTML = pastedHTML.toLowerCase();
            if (!lowerHTML.includes('<table')) return false;

            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(pastedHTML, 'text/html');

                // Se sono presenti blocchi di testo strutturato (paragrafi, titoli, liste) fuori dalle tabelle,
                // si tratta di un documento Word o Google Docs e NON di una selezione di sole celle di foglio di calcolo!
                const nonTableBlocks = Array.from(doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote'))
                    .filter(el => !el.closest('table'));

                if (nonTableBlocks.length > 0) {
                    return false;
                }

                const hasExcelMeta = lowerHTML.includes('progid="excel.sheet"') || 
                                     lowerHTML.includes('progid=excel.sheet') || 
                                     lowerHTML.includes('generator" content="microsoft excel') ||
                                     lowerHTML.includes('xmlns:x="urn:schemas-microsoft-com:office:excel"') ||
                                     lowerHTML.includes('excelworkbook');

                const hasSheetsMeta = lowerHTML.includes('data-sheets-root') || 
                                      lowerHTML.includes('google-sheets-html-origin') ||
                                      lowerHTML.includes('data-sheets-value');

                if (hasExcelMeta || hasSheetsMeta) {
                    return true;
                }

                // Tabella HTML isolata accompagnata da struttura a colonne TSV (\t) in text/plain
                if (pastedText && pastedText.includes('\t')) {
                    return true;
                }
            } catch (_) {}
        }

        // Riconoscimento dati tabulari puri in text/plain (TSV senza HTML)
        if (!pastedHTML && pastedText && pastedText.includes('\t')) {
            const lines = pastedText.trim().split(/\r\n|\n|\r/);
            if (lines.length >= 1 && lines.some(l => l.includes('\t'))) {
                return true;
            }
        }

        return false;
    },

    // Genera il markup nativo di una Tabella Semplice (simple-table-wrapper) da dati Excel/Spreadsheet
    _createSimpleTableFromExcel: (pastedHTML, pastedText) => {
        const stblId = 'stbl_' + (typeof Store !== 'undefined' ? Store.generateId() : Date.now());
        let tableHTML = `<div class="adv-widget-shell simple-table-wrapper" data-widget-type="simple-table" id="${stblId}" contenteditable="false">`;
        tableHTML += `<table class="table-striped" style="width:100%; table-layout:auto;"><tbody>`;

        let rowsParsed = false;
        let totalCellCount = 0;

        // Canale A: Parsing da HTML strutturato (mantiene stili inline essenziali, link, colspan e rowspan)
        if (pastedHTML && pastedHTML.toLowerCase().includes('<table')) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(pastedHTML, 'text/html');
                const srcTable = doc.querySelector('table');

                if (srcTable) {
                    const rows = Array.from(srcTable.rows);
                    if (rows.length > 0) {
                        rows.forEach((tr, rIdx) => {
                            tableHTML += '<tr>';
                            const cells = Array.from(tr.cells);
                            cells.forEach(c => {
                                totalCellCount++;
                                const tag = rIdx === 0 ? 'th' : 'td';
                                const rs = c.getAttribute('rowspan');
                                const cs = c.getAttribute('colspan');

                                let spanAttrs = '';
                                if (rs && parseInt(rs, 10) > 1) spanAttrs += ` rowspan="${parseInt(rs, 10)}"`;
                                if (cs && parseInt(cs, 10) > 1) spanAttrs += ` colspan="${parseInt(cs, 10)}"`;

                                // Sanificazione profonda immediata della singola cella tramite il motore condiviso
                                if (typeof Editor.cleanDOMTree === 'function') {
                                    Editor.cleanDOMTree(c);
                                }

                                let content = c.innerHTML;

                                // Srotola <p> e <div> interni inseriti da Excel
                                content = content.replace(/<\/?(p|div)[^>]*>/gi, '<br>');
                                content = content.replace(/(<br\s*\/?>\s*)+/gi, '<br>');
                                content = content.replace(/^<br\s*\/?>|<br\s*\/?>$/gi, '');

                                // Rimuove tag e stili spuri proprietari di Microsoft Office
                                content = content.replace(/<\/?(font|o:[a-z]+)[^>]*>/gi, '');
                                content = content.replace(/<!--[\s\S]*?-->/g, '');

                                const cleanText = content.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
                                if (!cleanText && !content.includes('<img')) {
                                    content = '<br>';
                                }

                                tableHTML += `<${tag} contenteditable="true"${spanAttrs}>${content}</${tag}>`;
                            });
                            tableHTML += '</tr>';
                        });
                        rowsParsed = true;
                    }
                }
            } catch (err) {
                console.warn("[EXCEL PASTE] Fallback su TSV:", err);
                rowsParsed = false;
            }
        }

        // Canale B: Parsing da TSV plain text (se l'HTML non è presente o non contiene una tabella valida)
        if (!rowsParsed && pastedText && pastedText.includes('\t')) {
            const lines = pastedText.trim().split(/\r\n|\n|\r/);
            lines.forEach((line, rIdx) => {
                if (!line && lines.length > 1) return;
                const cols = line.split('\t');
                const tag = rIdx === 0 ? 'th' : 'td';

                tableHTML += '<tr>';
                cols.forEach(colVal => {
                    totalCellCount++;
                    let text = colVal.trim();
                    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    if (!text) text = '<br>';
                    tableHTML += `<${tag} contenteditable="true">${text}</${tag}>`;
                });
                tableHTML += '</tr>';
            });
            rowsParsed = true;
        }

        // Regola UX: se è stata copiata solo 1 singola cella, non creare una tabella 1x1, lascia passare il testo
        if (totalCellCount <= 1) {
            return null;
        }

        tableHTML += `</tbody></table></div><p><br></p>`;
        return rowsParsed ? tableHTML : null;
    },

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

            // GESTIONE COPIA STANDARD (Per testo normale, link e tabelle)
            const clone = range.cloneContents();

            // =========================================================================
            // RICOSTRUZIONE DETERMINISTICA DEGLI STILI ANTENATI PER IL FRAMMENTO COPIATO
            // =========================================================================
            let formattedFragment = clone;

            const commonAncestor = range.commonAncestorContainer.nodeType === 3 
                ? range.commonAncestorContainer.parentNode 
                : range.commonAncestorContainer;

            // Risaliamo da commonAncestor fino al blocco contenitore (p, div, li, td, th, h1..h6, ecc.)
            let currAncestor = commonAncestor;
            const blockBoundaryTags = ['P', 'DIV', 'LI', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'BODY'];
            
            while (currAncestor && currAncestor.id !== 'noteContent' && !blockBoundaryTags.includes(currAncestor.tagName)) {
                const tag = currAncestor.tagName.toUpperCase();

                if (tag === 'B' || tag === 'STRONG') {
                    const b = document.createElement('b');
                    b.appendChild(formattedFragment);
                    formattedFragment = b;
                } else if (tag === 'I' || tag === 'EM') {
                    const i = document.createElement('i');
                    i.appendChild(formattedFragment);
                    formattedFragment = i;
                } else if (tag === 'U') {
                    const u = document.createElement('u');
                    u.appendChild(formattedFragment);
                    formattedFragment = u;
                } else if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') {
                    const s = document.createElement('s');
                    s.appendChild(formattedFragment);
                    formattedFragment = s;
                } else if (tag === 'CODE' && !currAncestor.closest('pre')) {
                    const code = document.createElement('code');
                    code.appendChild(formattedFragment);
                    formattedFragment = code;
                } else if (tag === 'A') {
                    const a = currAncestor.cloneNode(false);
                    a.appendChild(formattedFragment);
                    formattedFragment = a;
                } else if (tag === 'SPAN') {
                    // Estrae classi di colore, evidenziatore e font native VanillaDesk
                    const validClasses = Array.from(currAncestor.classList).filter(cls => 
                        /^hl-c\d+$/.test(cls) || 
                        /^tx-c\d+$/.test(cls) || 
                        /^ff-/.test(cls) || 
                        /^fs-/.test(cls) ||
                        cls === 'tag-hash'
                    );

                    if (validClasses.length > 0) {
                        const span = document.createElement('span');
                        span.className = validClasses.join(' ');
                        span.appendChild(formattedFragment);
                        formattedFragment = span;
                    }
                }
                currAncestor = currAncestor.parentNode;
            }

            // GESTIONE LI ORFANI IN COPIA: se il frammento contiene LI non avvolti da UL/OL, li avvolge
            const originalList = commonAncestor ? commonAncestor.closest('ul, ol') : null;
            if (originalList) {
                const tempCheck = document.createElement('div');
                tempCheck.appendChild(formattedFragment.cloneNode(true));
                const directLis = Array.from(tempCheck.children).filter(el => el.tagName === 'LI');
                if (directLis.length > 0) {
                    const wrapList = document.createElement(originalList.tagName);
                    if (originalList.className) wrapList.className = originalList.className;
                    while (tempCheck.firstChild) wrapList.appendChild(tempCheck.firstChild);
                    formattedFragment = wrapList;
                }
            }

            const tempDiv = document.createElement('div');
            tempDiv.appendChild(formattedFragment);

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

            // Conserva l'HTML pulito con link, metadati data-* (incluso data-link-note) e tabelle intatti
            const clipboardHTML = tempDiv.innerHTML;

            // 4. Formattazione tabulare snella per plainText (TSV per Excel/Notepad senza cicli quadrupli)
            tempDiv.querySelectorAll('table').forEach(table => {
                const tsv = Array.from(table.rows).map(row => 
                    Array.from(row.cells).map(cell => (cell.innerText || cell.textContent || '').trim().replace(/[\r\n\t]+/g, ' ')).join('\t')
                ).join('\n');
                table.parentNode.replaceChild(document.createTextNode('\n' + tsv + '\n'), table);
            });

            // Checklist: aggiunge il marcatore testuale [x] o [ ]
            tempDiv.querySelectorAll('.adv-checklist-item').forEach(li => {
                const cb = li.querySelector('.adv-checklist-cb, input[type="checkbox"]');
                const isChecked = cb && (cb.checked || cb.hasAttribute('checked'));
                const prefix = isChecked ? '[x] ' : '[ ] ';
                if (cb) cb.remove();
                li.prepend(document.createTextNode(prefix));
            });

            // Liste puntate standard
            tempDiv.querySelectorAll('ul:not(.adv-checklist) > li').forEach(li => {
                li.prepend(document.createTextNode('- '));
            });

            // Liste numerate standard
            tempDiv.querySelectorAll('ol > li').forEach((li, idx) => {
                const start = parseInt(li.parentElement.getAttribute('start'), 10) || 1;
                li.prepend(document.createTextNode(`${start + idx}. `));
            });

            // =========================================================================
            // ESTRAZIONE PULITA A BLOCCHI DEL PLAIN TEXT (Zero duplicazione righe vuote)
            // Ciascun blocco di riga foglia corrisponde a un elemento dell'array di righe.
            // =========================================================================
            const allBlocks = Array.from(tempDiv.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, blockquote'));
            const leafBlocks = allBlocks.filter(b => !b.querySelector('p, div, h1, h2, h3, h4, h5, h6, li, blockquote'));

            let plainText = '';

            if (leafBlocks.length === 0) {
                plainText = tempDiv.innerHTML
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<[^>]+>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/\u00A0/g, ' ')
                    .replace(/\u200B/g, '')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&');
            } else {
                const lines = [];
                leafBlocks.forEach(b => {
                    const textOnly = b.textContent.replace(/[\u200B\uFEFF]/g, '').trim();
                    let lineHtml = '';
                    if (!textOnly && !b.querySelector('img, audio, input, svg')) {
                        lineHtml = '';
                    } else {
                        lineHtml = b.innerHTML
                            .replace(/<br\s*\/?>/gi, '\n')
                            .replace(/<[^>]+>/g, '');
                    }
                    lineHtml = lineHtml
                        .replace(/&nbsp;/g, ' ')
                        .replace(/\u00A0/g, ' ')
                        .replace(/\u200B/g, '')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&amp;/g, '&');
                    lines.push(lineHtml);
                });

                if (lines.length === 1 && lines[0] === '') {
                    plainText = '\n';
                } else {
                    plainText = lines.join('\n');
                }
            }

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

        const items = Array.from((e.clipboardData || e.originalEvent.clipboardData).items);
        let isImage = false;

        // 1. GESTIONE IMMAGINI INCOLLATE (Clipboard File reale, non proveniente da tabella Excel)
        if (!isSpreadsheetData) {
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

                // GESTIONE INCOLLA TESTO PIATTO (PLAIN TEXT)
                if (!pastedHTML) {
                    if (!targetNode.closest('td, th, li, pre')) {
                        const formattedHTML = Editor._formatPlainTextForHTML(pastedText);
                        if (!pastedText.includes('\n')) {
                            document.execCommand('insertText', false, pastedText);
                        } else {
                            const curRange = sel.getRangeAt(0);
                            curRange.deleteContents();
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = formattedHTML;
                            const frag = document.createDocumentFragment();
                            while (tempDiv.firstChild) frag.appendChild(tempDiv.firstChild);
                            const lastChild = frag.lastChild;
                            curRange.insertNode(frag);
                            if (lastChild) {
                                const newRange = document.createRange();
                                newRange.setStartAfter(lastChild);
                                newRange.collapse(true);
                                sel.removeAllRanges();
                                sel.addRange(newRange);
                            }
                        }
                    } else if (targetNode.closest('td, th, li')) {
                        let escaped = pastedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        escaped = escaped.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
                        escaped = escaped.replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length));
                        escaped = escaped.replace(/\r\n|\n|\r/g, '<br>');
                        const curRange = sel.getRangeAt(0);
                        curRange.deleteContents();
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = escaped;
                        const frag = document.createDocumentFragment();
                        while (tempDiv.firstChild) frag.appendChild(tempDiv.firstChild);
                        curRange.insertNode(frag);
                    } else {
                        document.execCommand('insertText', false, pastedText);
                    }
                    return;
                }

                // GESTIONE INCOLLA HTML (RICH TEXT: WORD, GOOGLE DOCS, SITI WEB)

                // PRE-PULIZIA ARTEFATTI WORD: Rimuove commenti condizionali MSO prima del parsing DOM
                const cleanRawHTML = pastedHTML
                    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
                    .replace(/<!\[if[\s\S]*?<!\[endif\]>/gi, '');

                const parser = new DOMParser();
                const doc = parser.parseFromString(cleanRawHTML, 'text/html');

                // FASE 0: RIMOZIONE CONTENITORI FITTIZI DI GOOGLE DOCS, TAG INTRUSIVI E TAG PROPRIETARI OFFICE
                doc.querySelectorAll('script, style, meta, link, iframe, object, embed, noscript, o\\:p, o-p, w\\:sdt').forEach(el => el.remove());

                // Rimozione difensiva basata su tagName per garantire compatibilità con tutti i motori browser
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

                    // Rilevamento semantico unificato di Bold
                    const hasBoldWeight = (el.style && (el.style.fontWeight === 'bold' || el.style.fontWeight === 'bolder' || parseInt(el.style.fontWeight, 10) >= 600)) ||
                                          /font-weight\s*:\s*(bold|bolder|[6-9]00)/i.test(rawStyle) ||
                                          /mso-bidi-font-weight\s*:\s*bold/i.test(rawStyle);

                    // Rilevamento semantico unificato di Italic
                    const hasItalicStyle = (el.style && (el.style.fontStyle === 'italic' || el.style.fontStyle === 'oblique')) ||
                                           /font-style\s*:\s*(italic|oblique)/i.test(rawStyle);

                    // Rilevamento semantico unificato di Sottolineato
                    const hasUnderlineStyle = (el.style && el.style.textDecoration && el.style.textDecoration.includes('underline')) ||
                                              /text-decoration\s*:\s*[^;]*underline/i.test(rawStyle);

                    // Rilevamento semantico unificato di Barrato
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

                        // Rileva se lo span possiede classi VanillaDesk native (font, dimensioni, colori, tag)
                        const existingClass = el.getAttribute('class') || '';
                        const hasVanillaDeskClass = /(?:^|\s)(?:ff-|fs-|hl-c|tx-c|tag-hash)/.test(existingClass);

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
                                // Preserva lo span e le sue classi, inserendo la formattazione semantica al suo interno
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

                    // Rimozione di qualsiasi attributo legacy di presentazione
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

                    let html = cell.innerHTML.trim();
                    html = html.replace(/^(?:&nbsp;|\s|<br\s*\/?>)+/i, '');
                    html = html.replace(/(?:&nbsp;|\s|<br\s*\/?>)+$/i, '');
                    cell.innerHTML = html.trim();

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
                // Rimuove tutte le classi parassite (MsoNormal, ecc.) e gli stili inline (-webkit-*, margin, padding, user-select)
                if (typeof Editor !== 'undefined' && typeof Editor.cleanDOMTree === 'function') {
                    Editor.cleanDOMTree(doc.body);
                }

                // FASE 5: RISOLUZIONE RIGHE VUOTE SPURIE DI WORD 365
                // 5.1 Rimuove i nodi di testo di whitespace (\r, \n, spazi) direttamente figli del body tra blocchi
                Array.from(doc.body.childNodes).forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE && node.nodeValue.replace(/[\r\n\t\s]/g, '') === '') {
                        node.remove();
                    }
                });

                // 5.2 Rimuove i trailing whitespace e <br> parassiti posti alla fine dei paragrafi/blocchi di testo
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

                // 5.3 Normalizzazione e compressione dei paragrafi vuoti consecutivi di Word 365
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

                // 5.4 Rimuove paragrafi vuoti isolati all'inizio e alla fine del frammento incollato
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

                // 5.5 Se il documento ha già blocchi nativi (<p>, <h1>..<h6>, <table>, <ul>, <ol>), NON sostituire <br> con </p><p>!
                const existingBlocks = doc.body.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, table, ul, ol');
                const hasExistingBlocks = existingBlocks.length > 0;

                let finalHTML = doc.body.innerHTML;

                // Rimozione degli a capo strutturali posti agli estremi dal Sistema Operativo
                finalHTML = finalHTML.replace(/^[\r\n\t]+|[\r\n\t]+$/g, '');
                // Conversione fedele degli spazi non comprimibili generati dai browser su copia
                finalHTML = finalHTML.replace(/<span[^>]*class="Apple-converted-space"[^>]*>.*?<\/span>/gi, '&nbsp;');
                // Rimozione di link vuoti privi di testo o icone creati accidentalmente da siti web
                finalHTML = finalHTML.replace(/<a(?![^>]*class=["'][^"']*(internal-link|file-link)[^"']*["'])[^>]*>\s*(<br\s*\/?>)?\s*<\/a>/gi, '');

                if (!hasExistingBlocks && !targetNode.closest('td, th, li, pre')) {
                    let tempWrapper = document.createElement('div');
                    tempWrapper.innerHTML = finalHTML;
                    tempWrapper.querySelectorAll('.adv-inline-shell, .inline-note-data, .bookmark-comment-data, .snippet-text, table, ul, ol').forEach(el => {
                        el.innerHTML = el.innerHTML.replace(/<br\s*\/?>/gi, '%%%BR_SAFE%%%');
                    });
                    finalHTML = tempWrapper.innerHTML;

                    finalHTML = finalHTML.replace(/<br\s*\/?>/gi, '</p><p>');
                    finalHTML = finalHTML.replace(/<p>\s*<\/p>/gi, '<p><br></p>');

                    finalHTML = finalHTML.replace(/%%%BR_SAFE%%%/g, '<br>');
                }

                // Ottimizzazione inline: Se l'utente ha copiato una singola riga o parola priva di a capo, srotola il tag <p> esterno
                const isSingleLinePaste = !pastedText.includes('\n') && !pastedText.includes('\r');
                if (isSingleLinePaste && hasExistingBlocks && existingBlocks.length === 1 && doc.body.firstElementChild && doc.body.firstElementChild.tagName === 'P') {
                    finalHTML = doc.body.firstElementChild.innerHTML;
                }

                // =========================================================================
                // CORREZIONE RADICE SPAZI: RIALLINEAMENTO DETERMINISTICO CON PASTEDTEXT
                // =========================================================================
                const hasBlockTags = /<\/(p|div|h[1-6]|table|ul|ol|li|blockquote|pre)>/i.test(finalHTML);

                if (!hasBlockTags) {
                    finalHTML = finalHTML.replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '');
                    const leadingSpaces = pastedText.match(/^[ \t]*/)[0];
                    const trailingSpaces = pastedText.match(/[ \t]*$/)[0];
                    finalHTML = leadingSpaces + finalHTML + trailingSpaces;
                } else {
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

                    if (isBlockEmpty && blockUnderCursor.parentNode && blockUnderCursor.parentNode.contains(blockUnderCursor) && hasBlockTags) {
                        currentRange.setStartBefore(blockUnderCursor);
                        currentRange.collapse(true);
                        blockUnderCursor.remove();
                        currentSel.removeAllRanges();
                        currentSel.addRange(currentRange);
                    } else if (hasBlockTags && blockUnderCursor && blockUnderCursor.id !== 'noteContent' && !isBlockEmpty) {
                        // Split ordinato del paragrafo contenitore al punto del cursore per evitare annidamenti illegali <p><p>
                        const postRange = currentRange.cloneRange();
                        postRange.selectNodeContents(blockUnderCursor);
                        postRange.setStart(currentRange.endContainer, currentRange.endOffset);
                        const postContent = postRange.extractContents();

                        currentRange.setStartAfter(blockUnderCursor);
                        currentRange.collapse(true);

                        if (postContent.textContent.trim() !== '' || postContent.querySelector('img, audio, input, svg')) {
                            const nextBlock = document.createElement(blockUnderCursor.tagName);
                            nextBlock.appendChild(postContent);
                            blockUnderCursor.parentNode.insertBefore(nextBlock, blockUnderCursor.nextSibling);
                        }
                    }
                }

                // =========================================================================
                // INSERIMENTO PULITO TRAMITE DOM RANGE (Elimina -webkit, color, line-height)
                // =========================================================================
                const curRange = currentSel.getRangeAt(0);
                curRange.deleteContents();

                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = finalHTML;

                const frag = document.createDocumentFragment();
                while (tempDiv.firstChild) {
                    frag.appendChild(tempDiv.firstChild);
                }

                const lastNode = frag.lastChild;
                curRange.insertNode(frag);

                if (lastNode) {
                    const newRange = document.createRange();
                    newRange.setStartAfter(lastNode);
                    newRange.collapse(true);
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
        : pastedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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