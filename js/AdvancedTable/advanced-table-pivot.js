/**
 * AdvancedTablePivot.js
 * Motore di aggregazione dati (GROUP BY multiplo) e rendering delle Tabelle Pivot / Dashboard.
 * FIX CITAZIONI: Propagazione del blocco della modalità modifica (isEdit = false) per le citazioni.
 * FIX DRY (Refactoring): Rimossa l'intera duplicazione di codice per Filtri e Sorting.
 * FEAT COLORI: Aggiunto calcolo dell'Opacità Condizionale tramite CSS color-mix sulle righe Pivot.
 * FIX RELAZIONI FORMULE: Risoluzione tramite l'engine centrale 'resolveRelationDetails' (Sostituito codice duplicato).
 * FIX AGGREGAZIONI DATA MAX/MIN: Il controllo isDateCol ha la precedenza assoluta sul controllo numerico,
 * evitando che date ISO (es. '2026-05-20') vengano scambiate per numeri da parseFloat.
 */

const AdvancedPivot = {

    updateDependent: (sourceTableId) => {
        if (!AppState.databases) return;
        
        for (const [tId, state] of Object.entries(AppState.databases)) {
            if (state && state.isPivot && state.sourceTableId === sourceTableId) {
                AdvancedPivot.render(tId);
            }
        }
    },

    createOrUpdate: (tableId, sourceId, groupByArr, aggregations, title = null, chartConfig = null) => {
        const sourceState = AdvancedTable.getTableState(sourceId);
        if (!sourceState) return;

        let pivotState = {
            title: title || ('Analisi: ' + (sourceState.title || 'Database')),
            isPivot: true,
            sourceTableId: sourceId,
            groupBy: groupByArr,
            aggregations: aggregations,
            freeWidth: false,
            columns:[],
            filters: {},
            sorts: [],
            rows:[],
            chartConfig: chartConfig || { visible: false }
        };

        if (tableId) {
            const oldState = AdvancedTable.getState(tableId);
            if (oldState) {
                pivotState.title = oldState.title;
                pivotState.freeWidth = oldState.freeWidth;
                pivotState.filters = oldState.filters || {};
                pivotState.sorts = oldState.sorts ||[];
                
                if (chartConfig) {
                    pivotState.chartConfig = chartConfig;
                } else if (oldState.chartConfig) {
                    pivotState.chartConfig = oldState.chartConfig;
                }
            }
        } else {
            tableId = 'adv_pivot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            let wrapper;
            if (typeof WidgetManager !== 'undefined') {
                wrapper = WidgetManager.createShell('pivot', tableId);
            } else {
                wrapper = document.createElement('div');
                wrapper.className = 'adv-table-wrapper';
                wrapper.id = tableId;
                wrapper.contentEditable = "false";
            }

            Editor.restoreSelection();
            const sel = window.getSelection();
            if (sel.rangeCount) {
                let range = sel.getRangeAt(0);
                range.insertNode(wrapper);
                const p = document.createElement('p'); p.innerHTML = '<br>';
                wrapper.parentNode.insertBefore(p, wrapper.nextSibling);
            }
        }

        groupByArr.forEach((gColId, idx) => {
            const sc = sourceState.columns.find(c => c.id === gColId);
            pivotState.columns.push({
                id: 'grp_' + idx,
                name: sc ? sc.name : 'Gruppo ' + (idx + 1),
                type: sc ? sc.type : 'text',
                sourceColId: sc ? sc.id : null,
                width: 150
            });
        });

        aggregations.forEach((agg, idx) => {
            pivotState.columns.push({
                id: 'agg_' + idx,
                name: agg.label || 'Metrica',
                type: (agg.type === 'list' || agg.type === 'count') ? 'text' : 'number',
                sourceColId: agg.sourceColId,
                width: 150
            });
        });

        AdvancedTable.setState(tableId, pivotState);
        AdvancedPivot.render(tableId);
        Store.triggerAutoSave();
    },

    buildPivotData: (tableId) => {
        let state = AdvancedTable.getState(tableId);
        if (!state) return { pivotRows:[], sourceState: null };

        const sourceState = AdvancedTable.getTableState(state.sourceTableId);
        if (!sourceState) return { pivotRows:[], sourceState: null };

        let sourceRows =[];
        const renderCache = {};
        sourceState.rows.forEach(r => {
            sourceRows.push(AdvancedTable.buildVirtualRow(state.sourceTableId, r, sourceState, renderCache));
        });

        const relationCache = {};
        const isDateCache = {};

        state.groupBy.forEach(gColId => {
            const sc = sourceState.columns.find(c => c.id === gColId);
            if (sc) {
                if (sc.type === 'relation' && sc.targetTableId) {
                    const targetState = AdvancedTable.getTableState(sc.targetTableId);
                    if (targetState) relationCache[sc.id] = { state: targetState, colId: sc.targetColId, srcColDef: sc };
                }
                if (['date', 'datetime', 'time', 'created_time', 'last_edited_time'].includes(sc.type)) isDateCache[sc.id] = true;
            }
        });

        const groupedData = {};

        sourceRows.forEach(row => {
            let keyParts = state.groupBy.map(gColId => {
                let val = row.virtualCells[gColId];

                if (relationCache[gColId]) {
                    const tCache = relationCache[gColId];
                    const details = AdvancedTable.resolveRelationDetails(tCache.srcColDef, val, renderCache);
                    if (details.length > 0) return details.map(d => d.name);
                }

                if (isDateCache[gColId] && val) {
                    const d = new Date(val);
                    if (!isNaN(d.getTime())) {
                        if (val.includes('T') || val.length > 10) return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                        else return d.toLocaleDateString('it-IT');
                    }
                }

                if (Array.isArray(val)) return val.join(', ');
                return String(val || '(Vuoto)').trim() || '(Vuoto)';
            });

            let compositeKey = JSON.stringify(keyParts);

            if (!groupedData[compositeKey]) {
                groupedData[compositeKey] = { keys: keyParts, rows:[] };
            }
            groupedData[compositeKey].rows.push(row);
        });

        let pivotRows = [];
        let rIdCounter = 0;

        for (const [compKey, data] of Object.entries(groupedData)) {
            let pRow = { id: 'pr_' + (rIdCounter++), virtualCells: {}, rawGroupKeys: data.keys };

            state.groupBy.forEach((gColId, idx) => {
                let val = data.keys[idx];
                if (Array.isArray(val)) val = val.join(', ');
                pRow.virtualCells['grp_' + idx] = String(val);
            });

            state.aggregations.forEach((agg, idx) => {
                let aggColId = 'agg_' + idx;
                let result = '';

                if (agg.type === 'count') {
                    result = data.rows.length;
                } else if (agg.type === 'list') {
                    let items = data.rows.map(r => {
                        let v = r.virtualCells[agg.sourceColId];

                        const sCol = sourceState.columns.find(c => c.id === agg.sourceColId);
                        if (sCol && sCol.type === 'relation' && sCol.targetTableId) {
                            const details = AdvancedTable.resolveRelationDetails(sCol, v, renderCache);
                            v = details.map(d => d.name).join(', ');
                        }
                        else if (sCol &&['date', 'datetime', 'time', 'created_time', 'last_edited_time'].includes(sCol.type) && v) {
                            const d = new Date(v);
                            if (!isNaN(d.getTime())) {
                                if (v.includes('T') || v.length > 10) v = d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                                else v = d.toLocaleDateString('it-IT');
                            }
                        }
                        else if (Array.isArray(v)) {
                            v = v.join(', ');
                        }

                        return String(v || '').trim();
                    }).filter(s => s !== '');
                    result = [...new Set(items)].join(', ');
                } else {
                    const sourceCol = sourceState.columns.find(c => c.id === agg.sourceColId);
                    const isNumberCol = sourceCol && ['number'].includes(sourceCol.type);
                    const isDateCol = sourceCol && ['date', 'datetime', 'time', 'created_time', 'last_edited_time'].includes(sourceCol.type);

                    let vals = data.rows.map(r => r.virtualCells[agg.sourceColId]).filter(v => v !== undefined && v !== null && v !== '');

                    if (vals.length === 0) {
                        result = '-';
                    } else if (agg.type === 'sum' || agg.type === 'avg') {
                        let nums = vals.map(v => parseFloat(v)).filter(n => !isNaN(n));
                        if (nums.length === 0) result = '-';
                        else if (agg.type === 'sum') result = nums.reduce((a, b) => a + b, 0);
                        else if (agg.type === 'avg') result = (nums.reduce((a, b) => a + b, 0) / nums.length);
                    } else if (agg.type === 'max' || agg.type === 'min') {
                        // Precedenza assoluta alle date per evitare che stringhe ISO vengano scambiate per numeri da parseFloat
                        if (isDateCol) {
                            let times = vals.map(v => {
                                const d = new Date(v);
                                return isNaN(d.getTime()) ? null : d.getTime();
                            }).filter(t => t !== null);

                            if (times.length === 0) result = '-';
                            else {
                                let targetTime = agg.type === 'max' ? Math.max(...times) : Math.min(...times);
                                const resDate = new Date(targetTime);
                                if (sourceCol.type === 'time') {
                                    result = resDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                                } else if (sourceCol.type === 'date') {
                                    result = resDate.toLocaleDateString('it-IT');
                                } else {
                                    result = AdvancedTable.formatTime(resDate);
                                }
                            }
                        } else if (isNumberCol || vals.every(v => !isNaN(parseFloat(v)))) {
                            let nums = vals.map(v => parseFloat(v));
                            result = agg.type === 'max' ? Math.max(...nums) : Math.min(...nums);
                        } else {
                            let strings = vals.map(v => String(v));
                            strings.sort((a, b) => a.localeCompare(b));
                            result = agg.type === 'min' ? strings[0] : strings[strings.length - 1];
                        }
                    }
                }

                if (typeof result === 'number' && result % 1 !== 0) result = Math.round(result * 100) / 100;
                pRow.virtualCells[aggColId] = String(result);
            });

            pivotRows.push(pRow);
        }

        if (typeof AdvancedTable !== 'undefined' && AdvancedTable.filterRows && AdvancedTable.sortRows) {
            pivotRows = AdvancedTable.filterRows(pivotRows, state, true, sourceState);
            pivotRows = AdvancedTable.sortRows(pivotRows, state, true, sourceState);
        }

        return { pivotRows, sourceState };
    },

    render: (tableId) => {
        if (!tableId) return;
        const wrapper = document.getElementById(tableId);
        if (!wrapper) return;

        let state = AdvancedTable.getState(tableId);

        if (!state) {
            const type = wrapper.getAttribute('data-widget-type');
            if (type) {
                let bodyContainer = wrapper.querySelector('.widget-body');
                if (!bodyContainer) {
                    wrapper.innerHTML = `<div class="widget-body"></div>`;
                    bodyContainer = wrapper.querySelector('.widget-body');
                }
                bodyContainer.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; color:var(--danger-color); border:1px dashed var(--danger-color); border-radius:6px; background:rgba(239, 68, 68, 0.05);">
                        <span><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.alertTriangle} Errore Critico: I dati di configurazione di questo Widget sono andati perduti.</span></span>
                        <button class="adv-add-btn danger" style="border: 1px solid var(--danger-color); background: var(--bg-color);" onclick="document.getElementById('${tableId}').remove(); if(typeof Store !== 'undefined') Store.triggerAutoSave();"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.trash} Rimuovi Widget Rotto</span></button>
                    </div>
                `;
            }
            return;
        }

        const isCited = tableId.includes('_cited_');
        const isEdit = AppState.isEditMode && !isCited;

        const { pivotRows, sourceState } = AdvancedPivot.buildPivotData(tableId);
        let bodyContainer = wrapper.querySelector('.widget-body');

        if (!bodyContainer) {
            wrapper.innerHTML = `
                <div class="widget-header adv-table-header">
                    <span class="widget-drag-handle adv-drag-handle" title="Trascina per spostare" draggable="true" style="${isEdit ? 'display:flex;' : 'display:none;'}">${Icons.dragHandle}</span>
                    <span class="widget-options-btn adv-drag-handle" title="Opzioni" style="${isEdit ? 'display:flex;' : 'display:none;'}">${Icons.dotsVertical}</span>
                    <span class="widget-icon" style="display:inline-flex;"></span>
                    <span class="widget-title adv-table-title" contenteditable="${isEdit ? 'true' : 'false'}" style="flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 50px;">Caricamento...</span>
                    <div class="widget-tools adv-tools" style="flex-shrink: 0;"></div>
                </div>
                <div class="widget-body"></div>
            `;
            bodyContainer = wrapper.querySelector('.widget-body');
        }

        if (!sourceState) {
            bodyContainer.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; color:var(--danger-color); border:1px dashed var(--danger-color); border-radius:6px; background:rgba(239, 68, 68, 0.05);">
                    <span><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.alertTriangle} Il Database originale di questa Tabella Pivot è stato eliminato.</span></span>
                    <button class="adv-add-btn danger" style="border: 1px solid var(--danger-color); background: var(--bg-color);" onclick="AdvancedTable.deleteTable('${tableId}', true)"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.trash} Rimuovi Pivot</span></button>
                </div>
            `;
            return;
        }

        let prevScrollX = 0, prevScrollY = 0;
        const existingScroll = bodyContainer.querySelector('.adv-scroll-container');
        if (existingScroll) {
            prevScrollX = existingScroll.scrollLeft;
            prevScrollY = existingScroll.scrollTop;
        }

        const hasFilter = state.filters && Object.keys(state.filters).some(k => state.filters[k].trim() !== '');
        const hasSort = state.sorts.length > 0;
        const hasChart = state.chartConfig && state.chartConfig.visible;

        if (typeof WidgetManager !== 'undefined') {
            const tools =[];
            if (isEdit && typeof AdvancedTableCharts !== 'undefined') {
                tools.push({ icon: Icons.data, label: 'Grafico', title: 'Configura Grafico', active: hasChart, onClick: () => AdvancedTableCharts.openConfigMenu(tableId) });
            }
            
            tools.push({ id: `adv-sort-btn-${tableId}`, icon: Icons.sort, title: 'Ordina Tabella Pivot', active: hasSort, editOnly: false, onClick: AdvancedTable.openSortMenu });
            tools.push({ id: `adv-filter-btn-${tableId}`, icon: Icons.filter, title: 'Filtra Tabella Pivot', active: hasFilter, editOnly: false, onClick: AdvancedTable.openFilterMenu });

            WidgetManager.updateShellUI(tableId, {
                icon: hasChart ? Icons.tablePivot : Icons.tablePivot,
                title: state.title.replace('📈 ', '').replace('📊 ', ''),
                optionsId: `adv-opt-btn-${tableId}`,
                tools: tools,
                onTitleChange: AdvancedTable.updateTitle,
                onOptionsClick: AdvancedPivotMenus.openOptions,
                onDragStart: AdvancedTable.onTableDragStart,
                onDragEnd: AdvancedTable.onTableDragEnd
            });
        }

        let html = '';

        if (hasChart) {
            html += `
                <div id="chart_container_${tableId}" style="width:100%; min-height:350px; padding:15px; margin-bottom:5px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-color); box-sizing:border-box;">
                    <!-- Il canvas verra iniettato qui da AdvancedTableCharts -->
                </div>
            `;
        } else {
            const zebraClass = (state.striped !== false) ? 'table-striped' : '';
            const tableWidthClass = state.freeWidth ? '' : 'adv-table-full-width';
            html += `<div class="adv-scroll-container"><table class="adv-table ${zebraClass} ${tableWidthClass}"><thead><tr>`;

            state.columns.forEach(col => {
                if (!col.width) col.width = 150;

                let sortIndicator = '';
                const sortRule = state.sorts.find(s => s.colId === col.id);
                if (sortRule) sortIndicator = sortRule.dir === 1 ? ' ↑' : ' ↓';

                const isGroup = col.id.startsWith('grp_');
                const icon = isGroup ? Icons.group : Icons.formula;
                const resizerHtml = isEdit ? `<div class="adv-col-resizer" onmousedown="AdvancedTable.startResize(event, '${tableId}', '${col.id}')"></div>` : '';

                let tooltipAttr = '';
                let commentIcon = '';
                if (sourceState) {
                    const srcCol = sourceState.columns.find(c => c.id === col.sourceColId);
                    if (srcCol && srcCol.comment) {
                        const safeComment = srcCol.comment.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                        tooltipAttr = `data-tooltip="<b>${srcCol.name}</b><br><span style='color:var(--text-secondary);'>${safeComment}</span>"`;
                        commentIcon = `<span style="opacity:0.5; margin-left:4px; display:inline-flex; align-items:center;">${Icons.info}</span>`;
                    }
                }

                html += `<th data-col="${col.id}" style="width: ${col.width}px; background: ${isGroup ? 'rgba(37, 99, 235, 0.05)' : 'rgba(0,0,0,0.02)'}; ${isGroup ? 'color: var(--accent-color);' : ''} position: relative;" ${tooltipAttr}>
                            <div class="adv-th-content">
                                <span style="display:flex; align-items:center; gap:5px;"><span style="display:inline-flex;">${icon}</span> ${col.name} ${commentIcon}</span>
                                <span>${sortIndicator}</span>
                            </div>
                            ${resizerHtml}
                         </th>`;
            });
            html += `</tr></thead><tbody>`;

            if (pivotRows.length === 0) {
                html += `<tr><td colspan="${state.columns.length}" style="text-align:center; color:var(--text-secondary); padding:20px;">Nessun risultato per i filtri attuali.</td></tr>`;
            } else {
                pivotRows.forEach(row => {
                    
                    let rowColorClass = '';
                    let rowOpacity = '100';

                    if (state.conditionalColors && state.conditionalColors.length > 0) {
                        for (const rule of state.conditionalColors) {
                            if (!rule.active || rule.conditions.length === 0) continue;
                            
                            let allMatch = true;
                            for (const cond of rule.conditions) {
                                const colDef = state.columns.find(c => c.id === cond.colId);
                                if (!colDef) { allMatch = false; break; }

                                let cellVal = row.virtualCells[cond.colId];
                                let targetVal = cond.value;

                                if (typeof targetVal === 'string' && targetVal.startsWith('=')) {
                                    targetVal = AdvancedTable.evaluateFormula(targetVal.substring(1), row, state.columns, tableId, state.title, row.virtualCells, renderCache);
                                }

                                if (!LogicEngine.evaluateCondition(cond.operator, targetVal, cellVal, null, colDef, { mode: cond.dateMode, shift: cond.dateShift })) {
                                    allMatch = false;
                                    break;
                                }
                            }
                            
                            if (allMatch) {
                                rowColorClass = rule.color && rule.color !== 'none' ? rule.color : '';
                                
                                let opVal = rule.opacity !== undefined ? rule.opacity : '100';
                                if (rule.opacityType === 'formula') {
                                    opVal = AdvancedTable.evaluateFormula(opVal, row, state.columns, tableId, state.title, row.virtualCells, renderCache);
                                } else if (typeof opVal === 'string' && opVal.startsWith('=')) {
                                    opVal = AdvancedTable.evaluateFormula(opVal.substring(1), row, state.columns, tableId, state.title, row.virtualCells, renderCache);
                                }
                                rowOpacity = opVal;
                                
                                break; 
                            }
                        }
                    }

                    let pOp = parseFloat(rowOpacity);
                    if (isNaN(pOp)) pOp = 100;
                    pOp = Math.max(0, Math.min(100, pOp));

                    let inlineBgStyle = '';
                    if (rowColorClass && pOp < 100) {
                        inlineBgStyle = `background-color: color-mix(in srgb, var(--${rowColorClass}) ${pOp}%, transparent) !important;`;
                        rowColorClass = ''; 
                    }

                    html += `<tr class="${rowColorClass}" data-row-id="${row.id}" style="${inlineBgStyle}">`;
                    
                    state.columns.forEach((col, idx) => {
                        const isGroup = col.id.startsWith('grp_');
                        let htmlVal = row.virtualCells[col.id] || '';

                        if (isGroup && row.rawGroupKeys[idx] !== '(Vuoto)') {
                            const srcColDef = sourceState.columns.find(c => c.id === col.sourceColId);

                            if (srcColDef &&['select', 'multi-select'].includes(srcColDef.type)) {
                                let content = '';
                                const rawArray = Array.isArray(row.rawGroupKeys[idx]) ? row.rawGroupKeys[idx] :[row.rawGroupKeys[idx]];
                                rawArray.forEach(v => {
                                    let colorClass = sourceState.selectColors && sourceState.selectColors[srcColDef.id] && sourceState.selectColors[srcColDef.id][v] ? sourceState.selectColors[srcColDef.id][v] : 'default-color';
                                    content += `<span class="adv-select-pill ${colorClass}">${v}</span> `;
                                });
                                htmlVal = content;
                            }
                            else if (srcColDef && srcColDef.type === 'relation') {
                                let content = '';
                                // Se è una relazione, le stringhe arrivate qui sono già state decodificate e risolte dal Core!
                                // Possiamo limitarci a splittarle sulla virgola e stamparle come pillole distinte.
                                const rawArray = Array.isArray(row.rawGroupKeys[idx]) ? row.rawGroupKeys[idx] : [row.rawGroupKeys[idx]];
                                rawArray.forEach(v => { 
                                    const splitVals = typeof v === 'string' ? v.split(',').map(s => s.trim()) : [v];
                                    splitVals.forEach(sv => {
                                        if (sv) content += `<span class="adv-select-pill default-color">${UI.escapeHTML(sv)}</span> `;
                                    });
                                });
                                htmlVal = content || '<span class="adv-select-empty">Vuoto</span>';
                            }
                        }
                        html += `<td style="${isGroup ? 'font-weight:bold; background: rgba(0,0,0,0.01);' : ''} width: ${col.width}px; max-width: ${col.width}px; word-wrap: break-word;">${htmlVal}</td>`;
                    });
                    html += `</tr>`;
                });
            }
            html += `</tbody></table></div>`;
        }

        bodyContainer.innerHTML = html;

        if (prevScrollX > 0 || prevScrollY > 0) {
            const newScroll = bodyContainer.querySelector('.adv-scroll-container');
            if (newScroll) {
                newScroll.scrollLeft = prevScrollX;
                newScroll.scrollTop = prevScrollY;
            }
        }

        if (hasChart && typeof AdvancedTableCharts !== 'undefined') {
            setTimeout(() => {
                AdvancedTableCharts.renderChart(tableId, `chart_container_${tableId}`, pivotRows, state);
            }, 10);
        }
    }
};