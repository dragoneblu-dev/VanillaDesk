/**
 * editor-copy.js
 * Modulo isolato per la gestione degli eventi di Copia (Copy) e Taglio (Cut).
 * Sottomodulo di Editor.
 * - Algoritmo lineare a blocchi leaf per estrazione plainText con corrispondenza 1:1 delle righe vuote.
 * - Ricostruzione deterministica degli stili antenati (b, i, u, s, code, link e classi VanillaDesk) per selezioni parziali.
 * - Serializzazione tabulare TSV pulita per fogli di calcolo.
 * - Riconoscimento blocchi di codice per esportazione pulita senza tag parassiti.
 * - Pulizia elementi di servizio e maniglie UI nel frammento clonato.
 */

Object.assign(Editor, {

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
    }
});