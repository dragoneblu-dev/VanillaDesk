/**
 * ExportManager.js
 * Crea il documento di esportazione (HTML o Markdown) e gestisce l'importazione.
 * Supporto ai percorsi relativi "assets/" per i file multimediali locali.
 * Parser completo per la re-importazione di tabelle Markdown in componenti nativi.
 * Supporto alla conservazione del valore di partenza (start) negli elenchi numerati.
 * FIX TOKEN CORRUPTION: I token temporanei per codice e tabelle usano identificatori privi di underscore (%%%TABLEBLOCK...%%%)
 * per prevenire la corruzione accidentale causata dalle regex del corsivo (_..._).
 * FIX DELIMITER: Corretta la chiusura delle liste ordinate nel convertitore.
 * FIX INTEGRITÀ: Ripristinata integralmente la funzione processMarkdownImport con controlli difensivi.
 */

const ExportManager = {

    openModal: () => {
        const modal = document.getElementById('exportModal');
        if (modal) modal.classList.remove('hidden');

        const menu = document.getElementById('mainMenuDropdown');
        if (menu) menu.classList.add('hidden');
    },

    closeModal: () => {
        const modal = document.getElementById('exportModal');
        if (modal) modal.classList.add('hidden');
    },

    processExport: (mode) => {
        const formatSelect = document.getElementById('exportFormatSelect');
        const format = formatSelect ? formatSelect.value : 'html';

        const imageCheckbox = document.getElementById('exportMdIncludeImages');
        const includeImages = imageCheckbox ? imageCheckbox.checked : true;

        ExportManager.closeModal();

        let nodesToProcess = [];
        let docTitle = "Esportazione Note";

        if (mode === 'branch' || mode === 'current') {
            if (!AppState.currentNoteId) {
                alert("Seleziona prima una nota per esportare.");
                return;
            }
            const rootNote = Store.getNote(AppState.currentNoteId);
            docTitle = rootNote.title || 'Senza Titolo';
            nodesToProcess = [{ note: rootNote, level: 0 }];
            
            if (mode === 'branch') {
                ExportManager.collectDescendants(rootNote.id, 1, nodesToProcess);
            }
        } else {
            const cleanFileName = AppState.fileName.replace(/\.json$/i, '');
            docTitle = "Esportazione - " + cleanFileName;
            
            const roots = Store.getChildren(null);
            roots.forEach(root => {
                nodesToProcess.push({ note: root, level: 0 });
                ExportManager.collectDescendants(root.id, 1, nodesToProcess);
            });
        }

        if (format === 'html') {
            ExportManager.generateHTMLDocument(docTitle, nodesToProcess);
        } else {
            ExportManager.generateMarkdownDocument(docTitle, nodesToProcess, includeImages);
        }
    },

    collectDescendants: (parentId, level, list) => {
        const children = Store.getChildren(parentId);
        children.forEach(child => {
            list.push({ note: child, level: level });
            ExportManager.collectDescendants(child.id, level + 1, list);
        });
    },

    // Idrata le citazioni estraendo il Live HTML prima dell'elaborazione Widget
    _hydrateCitationsForExport: (container, visited = new Set()) => {
        const citations = container.querySelectorAll('.block-citation');
        citations.forEach(cit => {
            const noteId = cit.getAttribute('data-ref-note');
            const refType = cit.getAttribute('data-ref-type') || 'note';
            const refId = cit.getAttribute('data-ref-id');
            const body = cit.querySelector('.citation-body');

            if (!noteId || !body) return;

            if (visited.has(noteId)) {
                body.innerHTML = `<p style="color:red; font-weight:bold;">[Riferimento Circolare bloccato]</p>`;
                return;
            }

            const targetNote = Store.getNote(noteId);
            if (targetNote) {
                const extractedHTML = UI.DocumentBrowser.extractLiveHTML(targetNote.content || '', refId, refType);
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = extractedHTML;
                
                // Ricorsione per citazioni dentro citazioni
                const nextVisited = new Set(visited);
                nextVisited.add(noteId);
                ExportManager._hydrateCitationsForExport(tempDiv, nextVisited);

                body.innerHTML = tempDiv.innerHTML;
            } else {
                body.innerHTML = `<p style="color:red; font-style:italic;">[Nota di origine eliminata]</p>`;
            }
        });
    },

    generateHTMLDocument: (title, flatList) => {
        const printWindow = window.open('', '_blank');

        let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title}</title>
            <style>
                :root {
                    /* Palette Light/White Mode per l'Esportazione */
                    --hl-c1: #eeeeee; --hl-tc-c1: #000000;
                    --hl-c2: #d1d1d1; --hl-tc-c2: #000000;
                    --hl-c3: #e1ad93; --hl-tc-c3: #000000;
                    --hl-c4: #fad0aa; --hl-tc-c4: #000000;
                    --hl-c5: #ffff83; --hl-tc-c5: #000000;
                    --hl-c6: #b1e0c9; --hl-tc-c6: #000000;
                    --hl-c7: #a8d5fa; --hl-tc-c7: #000000;
                    --hl-c8: #d1b4e6; --hl-tc-c8: #000000;
                    --hl-c9: #f4c2d7; --hl-tc-c9: #000000;
                    --hl-c10: #ffb1af; --hl-tc-c10: #000000;

                    --tx-c1: #32302c; --tx-c2: #878787;
                    --tx-c3: #b15a35; --tx-c4: #ff8600;
                    --tx-c5: #c0c000; --tx-c6: #00ae49;
                    --tx-c7: #0f8ddf; --tx-c8: #853bc7;
                    --tx-c9: #c52779; --tx-c10: #d00000;
                }

                @media print {
                    @page { margin: 2cm; }
                }
                body {
                    font-family: "Times New Roman", Times, serif;
                    line-height: 1.5;
                    color: #000;
                    background: #fff;
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 40px;
                }
                h1.lvl-0 { font-size: 24pt; border-bottom: 2px solid #000; margin-top: 40px; padding-bottom: 10px; }
                h1.lvl-1 { font-size: 18pt; color: #333; margin-top: 30px; }
                h1.lvl-2 { font-size: 14pt; color: #444; margin-top: 20px; font-style: italic; }
                h1.lvl-3 { font-size: 12pt; font-weight: bold; margin-top: 15px; }
                
                .note-content { margin-bottom: 20px; text-align: justify; }
                .note-content img { max-width: 100%; height: auto; display: block; margin: 10px auto; }
                .note-content table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                .note-content th, .note-content td { border: 1px solid #000; padding: 5px 8px; font-size: 0.9em; background: transparent; }
                .note-content blockquote { border-left: 3px solid #ccc; padding-left: 10px; margin-left: 10px; font-style: italic; }
                .note-content pre { background: #f0f0f0; padding: 10px; border: 1px solid #ccc; white-space: pre-wrap; word-break: break-all; font-family: monospace; font-size: 0.85em; }
                
                .toc { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; margin-bottom: 40px; page-break-after: always; }
                .toc-title { font-size: 18pt; font-weight: bold; margin-bottom: 15px; text-align: center; }
                .toc-item { margin-bottom: 5px; }
                .toc-indent-0 { font-weight: bold; }
                .toc-indent-1 { margin-left: 20px; }
                .toc-indent-2 { margin-left: 40px; }
                .toc-indent-3 { margin-left: 60px; }
                a { text-decoration: none; color: #2563eb; }
                a:hover { text-decoration: underline; }
                
                .exported-footnote { font-size: 0.85em; color: #666; font-style: italic; }
                .snippet-export { background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: monospace; border: 1px solid #ccc; }
                .citation-export { border: 1px solid #ddd; border-radius: 4px; padding: 15px; background: #fafafa; margin-bottom: 15px; border-left: 4px solid #2563eb; }

                /* Classi di utilità per colori sfondo e testo */
                .hl-c1 { background-color: var(--hl-c1) !important; color: var(--hl-tc-c1) !important; }
                .hl-c2 { background-color: var(--hl-c2) !important; color: var(--hl-tc-c2) !important; }
                .hl-c3 { background-color: var(--hl-c3) !important; color: var(--hl-tc-c3) !important; }
                .hl-c4 { background-color: var(--hl-c4) !important; color: var(--hl-tc-c4) !important; }
                .hl-c5 { background-color: var(--hl-c5) !important; color: var(--hl-tc-c5) !important; }
                .hl-c6 { background-color: var(--hl-c6) !important; color: var(--hl-tc-c6) !important; }
                .hl-c7 { background-color: var(--hl-c7) !important; color: var(--hl-tc-c7) !important; }
                .hl-c8 { background-color: var(--hl-c8) !important; color: var(--hl-tc-c8) !important; }
                .hl-c9 { background-color: var(--hl-c9) !important; color: var(--hl-tc-c9) !important; }
                .hl-c10 { background-color: var(--hl-c10) !important; color: var(--hl-tc-c10) !important; }

                .tx-c1 { color: var(--tx-c1) !important; }
                .tx-c2 { color: var(--tx-c2) !important; }
                .tx-c3 { color: var(--tx-c3) !important; }
                .tx-c4 { color: var(--tx-c4) !important; }
                .tx-c5 { color: var(--tx-c5) !important; }
                .tx-c6 { color: var(--tx-c6) !important; }
                .tx-c7 { color: var(--tx-c7) !important; }
                .tx-c8 { color: var(--tx-c8) !important; }
                .tx-c9 { color: var(--tx-c9) !important; }
                .tx-c10 { color: var(--tx-c10) !important; }

                /* Stile per i tag/pills dei Database */
                .adv-select-pill { 
                    display: inline-block; padding: 2px 6px; border-radius: 6px; font-size: 0.85em; 
                    border: 1px solid rgba(0,0,0,0.1); margin: 1px; font-family: -apple-system, sans-serif;
                }
                .adv-select-pill.default-color { background-color: #f3f4f6; color: #333; }
            </style>
        </head>
        <body>
            <div style="text-align:center; margin-bottom:50px;">
                <h1 style="font-size:32pt; margin-bottom:10px;">${title}</h1>
                <p>Generato il: ${new Date().toLocaleString('it-IT')}</p>
            </div>

            <div class="toc">
                <div class="toc-title">Indice</div>
        `;

        if (flatList.length > 1) {
            flatList.forEach((item, index) => {
                htmlContent += `<div class="toc-item toc-indent-${Math.min(item.level, 3)}"><a href="#note-${index}">${item.note.title}</a></div>`;
            });
        } else {
            htmlContent += `<div class="toc-item toc-indent-0"><a href="#note-0">${flatList[0].note.title}</a></div>`;
        }

        htmlContent += `</div>`;

        flatList.forEach((item, index) => {
            const headerClass = `lvl-${Math.min(item.level, 3)}`;

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = item.note.content || '';

            // 1. Idratazione Citazioni
            ExportManager._hydrateCitationsForExport(tempDiv);

            // 2. Sostituzione dei puntatori Asset con i path relativi "assets/"
            tempDiv.querySelectorAll('img[data-image-ref]').forEach(img => {
                const ref = img.getAttribute('data-image-ref');
                if (ref) img.setAttribute('src', 'assets/' + ref);
            });
            tempDiv.querySelectorAll('audio[data-audio-ref]').forEach(aud => {
                const ref = aud.getAttribute('data-audio-ref');
                if (ref) aud.setAttribute('src', 'assets/' + ref);
            });

            tempDiv.querySelectorAll('.adv-copy-snippet').forEach(snippet => {
                const textNode = snippet.querySelector('.snippet-text');
                const text = textNode ? textNode.innerText : '';
                const code = document.createElement('code');
                code.className = 'snippet-export';
                code.innerText = text;
                snippet.parentNode.replaceChild(code, snippet);
            });

            // 3. Conversione Widget Complessi in HTML Statico
            if (typeof WidgetManager !== 'undefined') {
                const widgets = Array.from(tempDiv.querySelectorAll(WidgetManager.blockSelector)).reverse();
                
                widgets.forEach(wrapper => {
                    let type = wrapper.getAttribute('data-widget-type');
                    
                    if (!type) {
                        if (wrapper.classList.contains('adv-journal-wrapper')) type = 'journal';
                        else if (wrapper.classList.contains('code-wrapper')) type = 'code';
                        else if (wrapper.classList.contains('adv-action-button-wrapper')) type = 'buttonbar';
                        else if (wrapper.classList.contains('block-citation')) type = 'citation';
                        else type = 'database';
                    }
                    
                    const trueId = wrapper.id.split('_cited_')[0];

                    if (type === 'buttonbar') {
                        try {
                            const state = AppState.databases[trueId] || {};
                            if (state && state.buttons) {
                                const labels = state.buttons.map(b => `[${b.label || 'Pulsante'}]`).join(' ');
                                wrapper.outerHTML = `<p style="font-style:italic; color:#666;">(Barra Pulsanti: ${labels})</p>`;
                            } else {
                                wrapper.outerHTML = `<p style="font-style:italic; color:#666;">(Barra Pulsanti vuota)</p>`;
                            }
                        } catch(e) {
                            wrapper.innerHTML = '<p>[Barra Pulsanti rimossa]</p>';
                        }
                    } else if (type === 'database' || type === 'pivot') {
                        try {
                            const state = AppState.databases[trueId];
                            if (!state) throw new Error();
                            
                            const originalDbState = state.isLinkedView || state.isPivot ? AppState.databases[state.sourceTableId] : null;
                            const originalTitle = originalDbState ? originalDbState.title : state.title;

                            if (state.isPivot && state.chartConfig && state.chartConfig.visible) {
                                wrapper.outerHTML = `<p style="font-style:italic; color:#666;">[Grafico relativo al database: "${originalTitle || 'Sconosciuto'}"]</p>`;
                                return;
                            }
                            
                            let viewRows = [];
                            const renderCache = {};
                            state.rows.forEach(r => viewRows.push(AdvancedTable.buildVirtualRow(trueId, r, state, renderCache)));
                            viewRows = AdvancedTable.filterRows(viewRows, state);
                            viewRows = AdvancedTable.sortRows(viewRows, state);
                            
                            let tableHTML = `<h4 style="margin-bottom:5px;">📊 ${state.title || 'Database'}</h4>`;
                            tableHTML += '<table style="width:100%; border-collapse:collapse; margin-bottom:15px; font-size:0.9em;">';
                            tableHTML += '<thead><tr>';

                            state.columns.forEach(c => {
                                if (!c.hidden) tableHTML += `<th style="border:1px solid #ccc; padding:6px; background:#f9f9f9; text-align:left;">${c.name}</th>`;
                            });

                            tableHTML += '</tr></thead><tbody>';

                            viewRows.forEach(r => {
                                let rowColorClass = '';
                                if (state.conditionalColors && state.conditionalColors.length > 0) {
                                    for (const rule of state.conditionalColors) {
                                        if (!rule.active || rule.conditions.length === 0) continue;
                                        
                                        let allMatch = true;
                                        for (const cond of rule.conditions) {
                                            const colDef = state.columns.find(c => c.id === cond.colId);
                                            if (!colDef) { allMatch = false; break; }

                                            let cellVal = r.virtualCells[cond.colId];
                                            let targetVal = cond.value;

                                            if (typeof targetVal === 'string' && targetVal.startsWith('=')) {
                                                targetVal = AdvancedTable.evaluateFormula(targetVal.substring(1), r, state.columns, trueId, state.title, r.virtualCells, renderCache);
                                            }

                                            if (!LogicEngine.evaluateCondition(cond.operator, targetVal, cellVal, null, colDef, { mode: cond.dateMode, shift: cond.dateShift })) {
                                                allMatch = false;
                                                break;
                                            }
                                        }
                                        if (allMatch) {
                                            rowColorClass = rule.color && rule.color !== 'none' ? rule.color : '';
                                            break; 
                                        }
                                    }
                                }

                                tableHTML += `<tr class="${rowColorClass}">`;
                                state.columns.forEach(c => {
                                    if (!c.hidden) {
                                        let val = r.virtualCells[c.id];
                                        let displayVal = '';

                                        if (['select', 'multi-select'].includes(c.type)) {
                                            const vals = Array.isArray(val) ? val : (val ? [val] : []);
                                            vals.forEach(v => {
                                                let colorClass = state.selectColors && state.selectColors[c.id] && state.selectColors[c.id][v] ? state.selectColors[c.id][v] : 'default-color';
                                                displayVal += `<span class="adv-select-pill ${colorClass}">${v}</span> `;
                                            });
                                        } else {
                                            displayVal = AdvancedTable.getFormatDisplayValue(c, val);
                                        }

                                        tableHTML += `<td style="border:1px solid #ccc; padding:6px;">${displayVal}</td>`;
                                    }
                                });
                                tableHTML += '</tr>';
                            });

                            tableHTML += '</tbody></table>';
                            wrapper.outerHTML = tableHTML;
                        } catch (e) {
                            wrapper.innerHTML = '<p>[Database non esportabile o rimosso]</p>';
                        }
                    } else if (type === 'journal') {
                        try {
                            const state = AppState.databases[trueId] || {};
                            const title = state.title || 'Diario / Log';
                            let jHTML = `<h4 style="margin-bottom:5px;">📔 ${title}</h4><ul>`;
                            
                            const sorted = [...(state.entries || [])].sort((a,b) => a.timestamp - b.timestamp);
                            let currentDate = '';
                            
                            sorted.forEach(entry => {
                                if (entry.dateStr !== currentDate) {
                                    jHTML += `</ul><h5>${entry.dateStr}</h5><ul style="margin-bottom:15px;">`;
                                    currentDate = entry.dateStr;
                                }
                                const check = entry.endTime ? '☑' : '☐';
                                const text = entry.content.replace(/<[^>]*>?/gm, '').trim();
                                jHTML += `<li>${check} <b>${entry.timeStr}</b>: ${text}</li>`;
                            });
                            
                            jHTML += `</ul>`;
                            wrapper.outerHTML = jHTML;
                        } catch (e) {
                            wrapper.innerHTML = '<p>[Diario non esportabile o rimosso]</p>';
                        }
                    } else if (type === 'code' || wrapper.classList.contains('code-wrapper')) {
                        try {
                            const state = AppState.databases[trueId] || {};
                            const title = state.title || 'Codice';
                            let codeText = state.content || '';
                            codeText = codeText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br>');
                            wrapper.outerHTML = `<h4 style="margin-bottom:5px;">&lt;/&gt; ${title}</h4><pre>${codeText}</pre>`;
                        } catch(e) {
                            wrapper.innerHTML = '<p>[Codice non esportabile]</p>';
                        }
                    } else if (type === 'citation') {
                        const titleNode = wrapper.querySelector('.adv-table-title');
                        const citTitle = titleNode ? titleNode.innerText : 'Citazione';
                        const body = wrapper.querySelector('.citation-body');
                        const innerContent = body ? body.innerHTML : '<p style="color:red;">Contenuto mancante</p>';
                        
                        wrapper.outerHTML = `
                            <div class="citation-export">
                                <div style="font-weight:bold; margin-bottom:10px; color:#555;">${citTitle}</div>
                                <div>${innerContent}</div>
                            </div>
                        `;
                    }
                });
            }

            tempDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                const span = document.createElement('span');
                span.innerHTML = cb.checked ? '☑ ' : '☐ ';
                span.style.marginRight = '5px';
                cb.parentNode.replaceChild(span, cb);
            });

            tempDiv.querySelectorAll('.adv-bookmark-marker').forEach(marker => marker.remove());

            tempDiv.querySelectorAll('.code-action-bar, .adv-col-resizer, .adv-tools, .journal-toggle, .adv-drag-handle').forEach(el => el.remove());

            tempDiv.querySelectorAll('.inline-note-wrapper').forEach(wrapper => {
                const dataSpan = wrapper.querySelector('.inline-note-data');
                let text = dataSpan ? dataSpan.innerHTML : '';
                
                if (!text) {
                    const marker = wrapper.querySelector('.inline-note-marker');
                    text = marker ? (marker.getAttribute('data-tooltip') || '') : '';
                }
                
                const sup = document.createElement('sup');
                sup.className = 'exported-footnote';
                sup.innerHTML = `[Nota: ${text}]`;
                wrapper.parentNode.replaceChild(sup, wrapper);
            });
            
            tempDiv.querySelectorAll('.inline-note-marker[data-tooltip]').forEach(marker => {
                const text = marker.getAttribute('data-tooltip') || '';
                const sup = document.createElement('sup');
                sup.className = 'exported-footnote';
                sup.innerHTML = ` [Nota: ${text}]`;
                marker.parentNode.replaceChild(sup, marker);
            });

            let cleanContent = tempDiv.innerHTML;

            htmlContent += `
                <div id="note-${index}">
                    <h1 class="${headerClass}">${item.note.title}</h1>
                    <div class="note-content">
                        ${cleanContent || '<p style="color:#999; font-style:italic;">(Nessun contenuto)</p>'}
                    </div>
                </div>
            `;
        });

        htmlContent += `
        </body>
        </html>`;

        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
    },

    generateMarkdownDocument: (title, flatList, includeImages) => {
        let md = `# ${title}\n\n*Generato il: ${new Date().toLocaleString('it-IT')}*\n\n---\n\n`;

        if (flatList.length > 1) {
            md += `## Indice\n`;
            flatList.forEach((item) => {
                const indent = "  ".repeat(item.level);
                const anchor = item.note.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                md += `${indent}- [${item.note.title}](#${anchor})\n`;
            });
            md += `\n---\n\n`;
        }

        flatList.forEach((item) => {
            const headingLevel = Math.min(item.level + 1, 6);
            md += `${'#'.repeat(headingLevel)} ${item.note.title}\n\n`;
            md += ExportManager.htmlToMarkdown(item.note.content || '', includeImages) + `\n\n---\n\n`;
        });

        const blob = new Blob(["\uFEFF" + md], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.style.display = "none";
        link.setAttribute("href", url);
        link.setAttribute("download", `${title.replace(/[^a-zA-Z0-9]/g, '_')}.md`);
        document.body.appendChild(link);
        
        link.click();
        
        setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        }, 300);
    },

    htmlToMarkdown: (html, includeImages) => {
        if (!html) return "";
        const temp = document.createElement('div');
        temp.innerHTML = html;

        ExportManager._hydrateCitationsForExport(temp);

        temp.querySelectorAll('.adv-bookmark-marker').forEach(marker => marker.remove());

        temp.querySelectorAll('.adv-copy-snippet').forEach(snippet => {
            const textNode = snippet.querySelector('.snippet-text');
            const text = textNode ? textNode.innerText : '';
            snippet.outerHTML = `\`${text}\``;
        });

        if (typeof WidgetManager !== 'undefined') {
            const widgets = Array.from(temp.querySelectorAll(WidgetManager.blockSelector)).reverse();
            
            widgets.forEach(wrapper => {
                let type = wrapper.getAttribute('data-widget-type');
                
                if (!type) {
                    if (wrapper.classList.contains('adv-journal-wrapper')) type = 'journal';
                    else if (wrapper.classList.contains('code-wrapper')) type = 'code';
                    else if (wrapper.classList.contains('adv-action-button-wrapper')) type = 'buttonbar';
                    else if (wrapper.classList.contains('block-citation')) type = 'citation';
                    else type = 'database';
                }
                
                const trueId = wrapper.id.split('_cited_')[0];

                if (type === 'buttonbar') {
                    try {
                        const state = AppState.databases[trueId] || {};
                        if (state && state.buttons) {
                            const labels = state.buttons.map(b => `[${b.label || 'Pulsante'}]`).join(' ');
                            wrapper.outerHTML = `\n*[Barra Pulsanti: ${labels}]*\n\n`;
                        } else {
                            wrapper.outerHTML = `\n*[Barra Pulsanti vuota]*\n\n`;
                        }
                    } catch(e) { wrapper.outerHTML = "\n*[Barra Pulsanti rimossa]*\n"; }
                } else if (type === 'database' || type === 'pivot') {
                    try {
                        const state = AppState.databases[trueId];
                        if (!state) throw new Error();
                        
                        const originalDbState = state.isLinkedView || state.isPivot ? AppState.databases[state.sourceTableId] : null;
                        const originalTitle = originalDbState ? originalDbState.title : state.title;

                        if (state.isPivot && state.chartConfig && state.chartConfig.visible) {
                            wrapper.outerHTML = `\n*[Grafico relativo al database: "${originalTitle || 'Sconosciuto'}"]*\n\n`;
                            return;
                        }
                        
                        let viewRows = [];
                        const renderCache = {};
                        state.rows.forEach(r => viewRows.push(AdvancedTable.buildVirtualRow(trueId, r, state, renderCache)));
                        viewRows = AdvancedTable.filterRows(viewRows, state);
                        viewRows = AdvancedTable.sortRows(viewRows, state);
                        
                        let mdTable = `\n**📊 ${state.title || 'Database'}**\n\n`;
                        const visibleCols = state.columns.filter(c => !c.hidden);

                        mdTable += `| ${visibleCols.map(c => c.name.replace(/\|/g, '\\|')).join(' | ')} |\n`;
                        mdTable += `| ${visibleCols.map(() => '---').join(' | ')} |\n`;

                        viewRows.forEach(r => {
                            const rowData = visibleCols.map(c => {
                                let val = r.virtualCells[c.id];
                                let displayVal = AdvancedTable.getFormatDisplayValue(c, val);
                                return String(displayVal || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
                            });
                            mdTable += `| ${rowData.join(' | ')} |\n`;
                        });
                        wrapper.outerHTML = mdTable + '\n';
                    } catch(e) { wrapper.outerHTML = "\n*[Database non esportabile]*\n"; }
                } else if (type === 'journal') {
                    try {
                        const state = AppState.databases[trueId] || {};
                        const title = state.title || 'Diario / Log';
                        let mdJournal = `\n**📔 ${title}**\n\n`;

                        const sorted = [...(state.entries || [])].sort((a,b) => a.timestamp - b.timestamp);
                        let currentDate = '';
                        sorted.forEach(entry => {
                            if (entry.dateStr !== currentDate) {
                                mdJournal += `\n**${entry.dateStr}**\n`;
                                currentDate = entry.dateStr;
                            }
                            const check = entry.endTime ? '[x]' : '[ ]';
                            let text = entry.content.replace(/<[^>]*>?/gm, '').trim(); 
                            mdJournal += `- ${check} \`${entry.timeStr}\` ${text}\n`;
                        });
                        wrapper.outerHTML = mdJournal + '\n';
                    } catch(e) { wrapper.outerHTML = "\n*[Diario non esportabile]*\n"; }
                } else if (type === 'code') {
                    try {
                        const state = AppState.databases[trueId] || {};
                        const lang = state.language || '';
                        const codeText = state.content || '';
                        const title = state.title || 'Codice';
                        wrapper.outerHTML = `\n**&lt;/&gt; ${title}**\n\`\`\`${lang === 'none' ? '' : lang}\n${codeText}\n\`\`\`\n\n`;
                    } catch(e) { wrapper.outerHTML = "\n*[Codice rimosso]*\n"; }
                } else if (type === 'citation') {
                    const body = wrapper.querySelector('.citation-body');
                    const titleNode = wrapper.querySelector('.adv-table-title');
                    const citTitle = titleNode ? titleNode.innerText : 'Citazione';
                    
                    if (body) {
                        wrapper.outerHTML = `<blockquote><b>${citTitle}</b><br>${body.innerHTML}</blockquote>`;
                    } else {
                        wrapper.outerHTML = `<blockquote><b>${citTitle}</b><br>[Contenuto mancante]</blockquote>`;
                    }
                }
            });
        }

        temp.querySelectorAll('table:not(.adv-table)').forEach(table => {
            let mdTable = '\n';
            Array.from(table.rows).forEach((row, i) => {
                let rowData = Array.from(row.cells).map(cell => cell.innerText.replace(/\|/g, '\\|').replace(/\n/g, ' '));
                mdTable += `| ${rowData.join(' | ')} |\n`;
                if (i === 0) {
                    mdTable += `| ${Array.from(row.cells).map(() => '---').join(' | ')} |\n`;
                }
            });
            table.outerHTML = mdTable + '\n';
        });

        temp.querySelectorAll('.adv-checklist-item').forEach(li => {
            const cb = li.querySelector('.adv-checklist-cb');
            const textSpan = li.querySelector('.checklist-text');
            const isChecked = cb && cb.checked ? '[x]' : '[ ]';
            const text = textSpan ? textSpan.innerHTML : li.innerHTML;
            li.outerHTML = `<li>${isChecked} ${text}</li>`;
        });

        temp.querySelectorAll('blockquote').forEach(bq => {
            const header = bq.querySelector('.citation-header');
            if (header) header.remove();
            let text = bq.innerHTML.replace(/<br\s*\/?>/gi, '\n');
            text = text.replace(/<[^>]+>/g, '').trim(); 
            bq.outerHTML = `\n> ${text.replace(/\n/g, '\n> ')}\n\n`;
        });

        temp.querySelectorAll('.inline-note-wrapper').forEach(wrapper => {
            const dataSpan = wrapper.querySelector('.inline-note-data');
            let text = dataSpan ? dataSpan.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') : '';
            
            if (!text) {
                const marker = wrapper.querySelector('.inline-note-marker');
                text = marker ? (marker.getAttribute('data-tooltip') || '').replace(/<br\s*\/?>/gi, '\n') : '';
            }
            wrapper.outerHTML = ` ^[${text}] `;
        });

        let htmlStr = temp.innerHTML;
        
        htmlStr = htmlStr.replace(/<br\s*\/?>/gi, '\n');
        
        htmlStr = htmlStr.replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gi, '**$2**');
        htmlStr = htmlStr.replace(/<(i|em)[^>]*>(.*?)<\/\1>/gi, '*$2*');
        htmlStr = htmlStr.replace(/<(s|strike)[^>]*>(.*?)<\/\1>/gi, '~~$2~~');
        
        htmlStr = htmlStr.replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

        if (includeImages) {
            htmlStr = htmlStr.replace(/<img[^>]*data-image-ref=["']([^"']+)["'][^>]*>/gi, '![Immagine](assets/$1)');
            htmlStr = htmlStr.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (match, src) => {
                if(match.includes('data-image-ref')) return match; 
                return `![Immagine](${src})`;
            });
        } else {
            htmlStr = htmlStr.replace(/<img[^>]*>/gi, '');
        }

        for (let i = 1; i <= 6; i++) {
            const regex = new RegExp(`<h${i}[^>]*>(.*?)<\/h${i}>`, 'gi');
            htmlStr = htmlStr.replace(regex, `\n${'#'.repeat(i)} $1\n\n`);
        }

        htmlStr = htmlStr.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
        
        let olCounter = 0;
        let inOl = false;
        htmlStr = htmlStr.split('\n').map(line => {
            if (line.includes('<ol')) { 
                inOl = true; 
                const matchStart = line.match(/start=["'](\d+)["']/i);
                olCounter = matchStart ? parseInt(matchStart[1], 10) : 1; 
                return line.replace(/<ol[^>]*>/i, ''); 
            }
            if (line.includes('</ol>')) { inOl = false; return line.replace(/<\/ol>/i, '\n'); }
            if (inOl && line.startsWith('- ')) {
                const updatedLine = line.replace(/^- /, `${olCounter}. `);
                olCounter++;
                return updatedLine;
            }
            return line;
        }).join('\n');
        if (inOl) htmlStr += '\n';

        htmlStr = htmlStr.replace(/<\/?ul[^>]*>/gi, '\n');
        htmlStr = htmlStr.replace(/<\/?(p|div)[^>]*>/gi, '\n');

        htmlStr = htmlStr.replace(/\n{3,}/g, '\n\n');
        htmlStr = htmlStr.replace(/<[^>]+>/g, '');

        const decoder = document.createElement('textarea');
        decoder.innerHTML = htmlStr;
        return decoder.value.trim();
    },

    importMarkdown: async () => {
        try {
            if (window.showOpenFilePicker) {
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{ description: 'Markdown Files', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }],
                });
                const file = await fileHandle.getFile();
                const mdText = await file.text();
                
                const title = file.name.replace(/\.(md|markdown|txt)$/i, '');
                ExportManager.processMarkdownImport(mdText, title);
            } else {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.md,.markdown,.txt';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    const title = file.name.replace(/\.(md|markdown|txt)$/i, '');
                    const reader = new FileReader();
                    reader.onload = (event) => ExportManager.processMarkdownImport(event.target.result, title);
                    reader.readAsText(file);
                };
                input.click();
            }
        } catch (err) {
            if (err.name !== 'AbortError') alert("Errore apertura file Markdown: " + err.message);
        }
    },

    processMarkdownImport: (mdText, title) => {
        if (!mdText) return;

        const htmlContent = ExportManager.parseMarkdownToHTML(mdText);

        const noteId = Store.generateId();
        const now = new Date().toISOString();
        
        const newNote = {
            id: noteId,
            parentId: AppState.currentNoteId || null, 
            title: title || "Nota Importata",
            content: htmlContent,
            isMarked: false,
            expanded: true,
            createdAt: now,
            updatedAt: now
        };
        
        AppState.notes.push(newNote);
        
        if (typeof UI !== 'undefined') {
            if (typeof UI.renderTree === 'function') UI.renderTree();
            if (typeof UI.selectNote === 'function') UI.selectNote(noteId);
            if (typeof UI.showToast === 'function') UI.showToast(`File Markdown importato come nuova nota: "${title}"`, 'success');
        }
        
        if (typeof Store !== 'undefined' && typeof Store.triggerAutoSave === 'function') {
            Store.triggerAutoSave();
        }
    },

    _parseMarkdownCellText: (cellText) => {
        if (!cellText || cellText.trim() === '') return '<br>';
        let t = cellText.trim();
        t = t.replace(/<br\s*[\/]?>/gi, '<br>');
        t = t.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        t = t.replace(/\*(.*?)\*/g, '<i>$1</i>');
        t = t.replace(/~~(.*?)~~/g, '<s>$1</s>');
        t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
        t = t.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
        return t || '<br>';
    },

    parseMarkdownToHTML: (md) => {
        let html = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // 1. TOKENIZZAZIONE DEI BLOCCHI DI CODICE (Token privi di underscore per non interferire con le regex del corsivo)
        const codeBlocks = [];
        html = html.replace(/```([\w-]*)\n([\s\S]*?)```/gm, (match, lang, code) => {
            const blockId = 'adv_code_' + Store.generateId();
            const cleanLang = lang || 'none';
            
            if (!AppState.databases) AppState.databases = {};
            AppState.databases[blockId] = { title: 'Codice Importato', language: cleanLang, content: code };

            const shell = `<div id="${blockId}" class="adv-widget-shell widget-type-code code-wrapper" data-widget-type="code" contenteditable="false"></div>`;
            
            codeBlocks.push(shell);
            return `\n\n%%%CODEBLOCK${codeBlocks.length - 1}%%%\n\n`;
        });

        // 2. TOKENIZZAZIONE DELLE TABELLE MARKDOWN (Pipe Tables)
        const tableBlocks = [];
        const lines = html.split('\n');
        const outputLines = [];
        let inTable = false;
        let tableBuffer = [];

        const isTableLine = (l) => {
            const trimmed = l.trim();
            return trimmed.includes('|') && (trimmed.startsWith('|') || trimmed.endsWith('|') || trimmed.split('|').length >= 3);
        };

        const isDelimiterLine = (l) => {
            const trimmed = l.trim().replace(/^\|/, '').replace(/\|$/, '');
            const parts = trimmed.split('|').map(p => p.trim());
            return parts.length > 0 && parts.every(p => /^:?-+:?$/.test(p));
        };

        const flushTableBuffer = () => {
            if (tableBuffer.length >= 2 && isDelimiterLine(tableBuffer[1])) {
                const headerLine = tableBuffer[0].trim().replace(/^\|/, '').replace(/\|$/, '');
                const headers = headerLine.split('|').map(h => h.trim());
                
                const dataLines = tableBuffer.slice(2);
                const stblId = 'stbl_' + Store.generateId();
                
                let tblHTML = `<div class="adv-widget-shell simple-table-wrapper" data-widget-type="simple-table" id="${stblId}" contenteditable="false">`;
                tblHTML += `<table class="table-striped" style="width:100%; table-layout:auto;"><tbody>`;
                
                // Intestazione
                tblHTML += `<tr>`;
                headers.forEach(h => {
                    tblHTML += `<th contenteditable="true">${ExportManager._parseMarkdownCellText(h)}</th>`;
                });
                tblHTML += `</tr>`;
                
                // Righe di dati
                dataLines.forEach(dLine => {
                    const cleanDLine = dLine.trim().replace(/^\|/, '').replace(/\|$/, '');
                    const cells = cleanDLine.split('|').map(c => c.trim());
                    
                    tblHTML += `<tr>`;
                    for (let c = 0; c < headers.length; c++) {
                        const cellContent = cells[c] !== undefined ? cells[c] : '';
                        tblHTML += `<td contenteditable="true">${ExportManager._parseMarkdownCellText(cellContent)}</td>`;
                    }
                    tblHTML += `</tr>`;
                });
                
                tblHTML += `</tbody></table></div>`;
                
                tableBlocks.push(tblHTML);
                outputLines.push(`\n\n%%%TABLEBLOCK${tableBlocks.length - 1}%%%\n\n`);
            } else {
                // Se non era una tabella valida con divisore conforme, rilascia le righe inalterate
                tableBuffer.forEach(tblLine => outputLines.push(tblLine));
            }
            tableBuffer = [];
            inTable = false;
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (isTableLine(line)) {
                inTable = true;
                tableBuffer.push(line);
            } else {
                if (inTable) flushTableBuffer();
                outputLines.push(line);
            }
        }
        if (inTable) flushTableBuffer();

        html = outputLines.join('\n');

        // 3. PARSING DELLE ALTRE STRUTTURE MARKDOWN
        html = html.replace(/^>\s*(.*?)(?=\n|$)/gm, '<blockquote>$1</blockquote>');

        html = html.replace(/^###### (.*?)$/gm, '<h6>$1</h6>');
        html = html.replace(/^##### (.*?)$/gm, '<h5>$1</h5>');
        html = html.replace(/^#### (.*?)$/gm, '<h4>$1</h4>');
        html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

        html = html.replace(/^---$/gm, '<hr>');

        html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        html = html.replace(/\*(.*?)\*/g, '<i>$1</i>');
        html = html.replace(/__(.*?)__/g, '<b>$1</b>');
        html = html.replace(/_(.*?)_/g, '<i>$1</i>');
        html = html.replace(/~~(.*?)~~/g, '<s>$1</s>');

        html = html.replace(/^- \[ \]\s*(.*?)$/gm, '<li class="adv-checklist-item"><input type="checkbox" class="adv-checklist-cb"><span class="checklist-text" contenteditable="true">$1</span></li>');
        html = html.replace(/^- \[x\]\s*(.*?)$/gm, '<li class="adv-checklist-item"><input type="checkbox" class="adv-checklist-cb" checked><span class="checklist-text" contenteditable="true">$1</span></li>');

        let inUl = false;
        html = html.split('\n').map(line => {
            if (line.match(/^-\s+(?!\[[ x]\])/)) {
                if (!inUl) { inUl = true; return '<ul><li>' + line.replace(/^-\s+/, '') + '</li>'; }
                return '<li>' + line.replace(/^-\s+/, '') + '</li>';
            } else if (inUl) {
                inUl = false; return '</ul>\n' + line;
            }
            return line;
        }).join('\n');
        if (inUl) html += '</ul>';

        // Gestione avanzata importazione elenchi numerati con conservazione del valore di partenza
        let inOl = false;
        html = html.split('\n').map(line => {
            const olMatch = line.match(/^(\d+)\.\s+/);
            if (olMatch) {
                const num = parseInt(olMatch[1], 10);
                if (!inOl) { 
                    inOl = true; 
                    const startAttr = num !== 1 ? ` start="${num}"` : '';
                    return `<ol${startAttr}><li>` + line.replace(/^\d+\.\s+/, '') + '</li>'; 
                }
                return '<li>' + line.replace(/^\d+\.\s+/, '') + '</li>';
            } else if (inOl) {
                inOl = false; return '</ol>\n' + line;
            }
            return line;
        }).join('\n');
        if (inOl) html += '</ol>';

        html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1">');
        html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');

        const blocks = html.split('\n\n');
        html = blocks.map(block => {
            const t = block.trim();
            if (!t) return '';
            if (t.startsWith('%%%CODEBLOCK') || t.startsWith('%%%TABLEBLOCK') || t.startsWith('<h') || t.startsWith('<ul') || t.startsWith('<ol') || t.startsWith('<blockquote') || t.startsWith('<hr')) {
                return t;
            }
            return `<p>${t.replace(/\n/g, '<br>')}</p>`;
        }).join('');

        // 4. RE-INIEZIONE DEI BLOCCHI CODICE E TABELLE (Match affidabile e senza conflitti)
        html = html.replace(/%%%CODEBLOCK(\d+)%%%/g, (match, idx) => {
            return codeBlocks[parseInt(idx, 10)];
        });

        html = html.replace(/%%%TABLEBLOCK(\d+)%%%/g, (match, idx) => {
            return tableBlocks[parseInt(idx, 10)];
        });

        return html;
    }
};