/**
 * js/export-html.js
 * Sottomodulo di ExportManager dedicato alla generazione del Documento HTML Unico per stampa/PDF.
 * - Inietta il template CSS stampabile ad alta fedeltà (Palette Light, layout A4/margini, formattazioni).
 * - Crea l'Indice dinamico (TOC) con ancore interne ipertestuali.
 * - Esegue l'idratazione ricorsiva delle citazioni (_hydrateCitationsForExport) con protezione anti-loop.
 * - Sostituisce i riferimenti agli asset multimediali con percorsi relativi conformi ('assets/').
 * - Converte i widget complessi (Database, Tabelle Pivot, Diari, Codice, Bottoni Macro) in markup tabellare statico pulito.
 */

Object.assign(ExportManager, {

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
                
                .tag-hash {
                    color: var(--accent-color, #2563eb);
                    font-weight: 500;
                    background: rgba(37, 99, 235, 0.08);
                    padding: 1px 5px;
                    border-radius: 4px;
                }
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
                        } catch(e) { wrapper.outerHTML = '<p>[Barra Pulsanti rimossa]</p>'; }
                    } else if (type === 'database' || type === 'pivot') {
                        try {
                            const state = AppState.databases[trueId];
                            if (!state || !AppState.isRelationalTable(state)) throw new Error();
                            
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
    }
});