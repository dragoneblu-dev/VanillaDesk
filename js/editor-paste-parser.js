/**
 * editor-paste-parser.js
 * Sottomodulo di Editor.
 * Parser e convertitori specializzati per la gestione dell'Incolla:
 * - Riconoscimento tabelle Excel / Google Sheets isolate (_isExcelOrSpreadsheetPaste).
 * - Generazione tabella nativa VanillaDesk da dati tabulari (_createSimpleTableFromExcel).
 * - Formattazione e strutturazione a blocchi/elenchi di Plain Text (_formatPlainTextForHTML).
 * - Conversione semantica elenchi Word MsoList in <ol>/<ul> (_convertWordListsToHTML).
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
    }
});