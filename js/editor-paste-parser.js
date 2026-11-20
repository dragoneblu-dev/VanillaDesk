/**
 * editor-paste-parser.js
 * Sottomodulo di Editor.
 * Parser, convertitori di formato e acquisizione binari/RTF per la gestione dell'Incolla:
 * - Riconoscimento tabelle Excel / Google Sheets isolate (_isExcelOrSpreadsheetPaste).
 * - Generazione tabella nativa VanillaDesk da dati tabulari (_createSimpleTableFromExcel).
 * - Formattazione e strutturazione a blocchi/elenchi di Plain Text (_formatPlainTextForHTML, _formatTextToInlineHTML).
 * - Conversione semantica elenchi Word MsoList in <ol>/<ul> (_convertWordListsToHTML).
 * - Acquisizione, resize/compressione WebP e salvataggio immagini su disco o IndexedDB (saveImageSource).
 * - Estrazione immagini esadecimali da payload RTF di Word desktop (_extractImagesFromWordRTF).
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

    // Procedura snella per acquisire, comprimere e salvare un'immagine su disco (assets/) o in IndexedDB (idb_assets)
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

                            // SALVATAGGIO PERSISTENTE: Sia su cartella disco (FSAA) che in IndexedDB (Browser Mode)
                            const isFSAA = AppState.assetsHandle && typeof Store !== 'undefined' && typeof Store.saveAsset === 'function';
                            const isIDB = AppState.storageMode === 'idb' && AppState.workspaceId && typeof Store !== 'undefined' && typeof Store.saveAsset === 'function';

                            if (isFSAA || isIDB) {
                                const ext = finalBlob.type === 'image/webp' ? 'webp' : 'png';
                                const file = new File([finalBlob], `img_${Date.now()}.${ext}`, { type: finalBlob.type });
                                fileName = await Store.saveAsset(file, 'img');
                                if (fileName && Editor.imageCache && Editor.imageCache[fileName]) {
                                    blobUrl = Editor.imageCache[fileName];
                                }
                                console.log(`[Image Persistence] Salvata immagine ${fileName} via ${isIDB ? 'IndexedDB' : 'Cartella Disco'}.`);
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
        } catch (e) {
            console.warn("[saveImageSource] Errore elaborazione:", e);
            return null;
        }
    },

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