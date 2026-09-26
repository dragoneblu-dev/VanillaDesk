/**
 * AdvancedTableRender.js
 * Motore Grafico Base. Legge lo stato del Database e genera l'HTML dell'infrastruttura Tabella.
 * FIX DOM: Disabilita i controlli "Aggiungi/Elimina Riga" se la vista sta visualizzando il Database di Sistema.
 * FIX CITAZIONI: Propagazione del blocco della modalità modifica (isEdit = false) per le citazioni.
 * FIX DRY: Rimosse logiche duplicate di sortRows e filterRows. Delega a advanced-table-data.js.
 * FEAT COLORI: Supporto per Opacità Dinamica (CSS color-mix) via Javascript o Valore Fisso.
 * FIX TOOLTIP FILTRI: Unificate le informazioni di Commento e Filtro Attivo nell'unico tooltip di colonna (TH) per evitare conflitti di hover.
 * FEAT: Icona e layout per colonna 'note_link'.
 * FEAT TREE VIEW: Routing automatico verso AdvancedTree.render quando viewType === 'tree'.
 * RESTORE ATTACH CELL EVENTS: Ripristinata integralmente la funzione attachCellEvents e il mouseover globale.
 * FIX LIVE REFRESH: Il pulsante refresh ora ricarica e sincronizza fedelmente i dati dal disco.
 */

Object.assign(AdvancedTable, {

    renderTable: (tableId) => {
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
                        <span><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.alertTriangle} Errore Critico: I dati di configurazione di questo Widget sono andati perduti o eliminati.</span></span>
                        <button class="adv-add-btn danger" style="border: 1px solid var(--danger-color); background: var(--bg-color);" onclick="document.getElementById('${tableId}').remove(); if(typeof Store !== 'undefined') Store.triggerAutoSave();"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.trash} Rimuovi Widget Rotto</span></button>
                    </div>
                `;
            }
            return;
        }

        if (state.isPivot && typeof AdvancedPivot !== 'undefined') {
            return AdvancedPivot.render(tableId);
        }

        const viewType = state.viewType || 'table';

        if (viewType === 'table') {
            AdvancedTable._renderAsTable(wrapper, state, tableId);
        } else if (viewType === 'tree' && typeof AdvancedTree !== 'undefined') {
            AdvancedTree.render(tableId, wrapper, state);
        } else if (viewType === 'board' && typeof AdvancedBoard !== 'undefined') {
            AdvancedBoard.render(tableId, wrapper, state);
        } else if (viewType === 'timeline' && typeof AdvancedTimeline !== 'undefined') {
            AdvancedTimeline.render(tableId, wrapper, state);
        } else if (viewType === 'calendar' && typeof AdvancedCalendar !== 'undefined') {
            AdvancedCalendar.render(tableId, wrapper, state);
        } else {
            AdvancedTable._renderAsTable(wrapper, state, tableId);
        }
    },

    _renderAsTable: (wrapper, state, tableId) => {
        const isCited = tableId.includes('_cited_');
        const isEdit = AppState.isEditMode && !isCited;
        
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

        let prevScrollX = 0, prevScrollY = 0;
        const existingScroll = bodyContainer.querySelector('.adv-scroll-container');
        if (existingScroll) {
            prevScrollX = existingScroll.scrollLeft;
            prevScrollY = existingScroll.scrollTop;
        }

        if (state.isLinkedView && state.sourceDeleted) {
            bodyContainer.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; color:var(--danger-color); border:1px dashed var(--danger-color); border-radius:6px; background:rgba(239, 68, 68, 0.05);">
                    <span><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.alertTriangle} Il Database originale di questa Vista è stato eliminato.</span></span>
                    <button class="adv-add-btn danger" style="border: 1px solid var(--danger-color); background: var(--bg-color);" onclick="AdvancedTable.deleteTable('${tableId}', true)"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.trash} Rimuovi Vista</span></button>
                </div>
            `;
            return;
        }

        const now = Date.now();
        state.rows.forEach(r => {
            if (!r.createdAt) r.createdAt = now;
            if (!r.updatedAt) r.updatedAt = now;
        });

        if (!state.selectedRows) state.selectedRows =[];
        if (state.sorts && !Array.isArray(state.sorts)) state.sorts = state.sorts.colId ? [state.sorts] :[];
        if (!state.sorts) state.sorts =[];

        const viewId = 'table';
        const hiddenList = state.viewConfig && state.viewConfig[viewId] ? state.viewConfig[viewId].hiddenCols :[];

        const visibleCols = state.columns.filter(c => !c.hidden && !hiddenList.includes(c.id));
        const hasHiddenCols = state.columns.length > visibleCols.length;

        let viewRows = [];
        const renderCache = {};
        state.rows.forEach(r => viewRows.push(AdvancedTable.buildVirtualRow(tableId, r, state, renderCache)));

        // CHIAMATE AL MOTORE CENTRALE IN DATA.JS
        viewRows = AdvancedTable.filterRows(viewRows, state);
        viewRows = AdvancedTable.sortRows(viewRows, state);

        let pageSize = state.pageSize || 'all';
        let currentPage = state.currentPage || 1;
        let totalRows = viewRows.length;
        let totalPages = Math.ceil(totalRows / (pageSize === 'all' ? totalRows : pageSize)) || 1;
        let pagedRows = viewRows;

        if (pageSize !== 'all') {
            pageSize = parseInt(pageSize, 10);
            totalPages = Math.ceil(totalRows / pageSize) || 1;
            if (currentPage > totalPages) currentPage = totalPages;
            if (currentPage < 1) currentPage = 1;

            let startIdx = (currentPage - 1) * pageSize;
            let endIdx = startIdx + pageSize;
            pagedRows = viewRows.slice(startIdx, endIdx);
            state.currentPage = currentPage;
        }

        // --- GESTIONE LOGICA ICONE ATTIVE ---
        const hasFilter = state.filters && Object.keys(state.filters).some(k => state.filters[k].trim() !== '');
        const hasSavedFilters = state.savedFilters && state.savedFilters.length > 0;
        const hasSort = state.sorts.length > 0;
        const hasCalculatedFields = state.columns.some(c => c.type === 'formula' || c.type === 'relation' || c.type === 'relation_backlink' || c.type === 'rollup');
        const hasActiveAuto = state.automations && state.automations.some(a => a.active);

        const realTableId = AdvancedTable._resolveSourceId(tableId);
        const isSysDB = realTableId === 'SYS_PROPERTIES_DB';

        if (typeof WidgetManager !== 'undefined') {
            const tools =[];
            if (typeof AdvancedBoard !== 'undefined') {
                tools.push({ id: `adv-view-btn-${tableId}`, icon: Icons.viewList, title: 'Cambia visualizzazione', label: 'Vista', onClick: AdvancedBoard.openViewMenu });
            }
            if (!state.isLinkedView && !isSysDB) {
                tools.push({ icon: Icons.lightning, active: hasActiveAuto, editOnly: true, title: 'Automazioni', onClick: AdvancedAutomations.openPanel });
            }
            tools.push({ id: `adv-sort-btn-${tableId}`, icon: Icons.sort, title: 'Ordina Database', active: hasSort, editOnly: false, onClick: AdvancedTable.openSortMenu });
            
            // FILTRI E VISTE SALVATE
            tools.push({ id: `adv-filter-btn-${tableId}`, icon: Icons.filter, title: 'Filtra Dati (Campi)', active: hasFilter, editOnly: false, onClick: AdvancedTable.openFilterMenu });
            
            const bookmarkIconToUse = hasSavedFilters ? Icons.bookmarkFilled : Icons.bookmark;
            tools.push({ id: `adv-saved-filters-btn-${tableId}`, icon: bookmarkIconToUse, title: 'Viste / Filtri Salvati', active: hasFilter, editOnly: false, onClick: AdvancedTable.openSavedFiltersMenu });
            
            // Pulsante di ricarica e sincronizzazione con il disco
            tools.push({ icon: Icons.refresh, title: 'Ricarica dal disco e aggiorna dati', onClick: () => AdvancedTable.forceRecalculate(tableId) });

            WidgetManager.updateShellUI(tableId, {
                icon: state.isLinkedView ? Icons.link : '',
                title: state.title || 'Database',
                optionsId: `adv-opt-btn-${tableId}`,
                tools: tools,
                onTitleChange: AdvancedTable.updateTitle,
                onOptionsClick: state.isLinkedView ? AdvancedPivotMenus.openOptions : AdvancedTableMenus.openTableOptions,
                onDragStart: AdvancedTable.onTableDragStart,
                onDragEnd: AdvancedTable.onTableDragEnd
            });
        }

        let html = '';
        const zebraClass = (state.striped !== false) ? 'table-striped' : '';
        const tableWidthClass = state.freeWidth ? '' : 'adv-table-full-width';
        html += `<div class="adv-scroll-container"><table class="adv-table ${zebraClass} ${tableWidthClass}"><thead><tr>`;

        visibleCols.forEach(col => {
            let icon = Icons.text;
            if (col.type === 'checkbox') icon = Icons.checkbox;
            if (col.type === 'select') icon = Icons.select;
            if (col.type === 'multi-select') icon = Icons.multiSelect;
            if (col.type === 'date' || col.type === 'datetime') icon = Icons.date;
            if (col.type === 'number') icon = Icons.number;
            if (col.type === 'formula') icon = Icons.formula;
            if (col.type === 'relation' || col.type === 'relation_backlink') icon = Icons.relation;
            if (col.type === 'rollup') icon = Icons.rollup;
            if (col.type === 'url') icon = Icons.url;
            if (col.type === 'record_note') icon = Icons.recordPage;
            if (col.type === 'note_link') icon = Icons.link;
            if (col.type === 'button') icon = Icons.play;

            let sortIndicator = '';
            const sortRule = state.sorts.find(s => s.colId === col.id);
            if (sortRule) sortIndicator = sortRule.dir === 1 ? ' ↑' : ' ↓';

            // GESTIONE UNIFICATA DEL TOOLTIP E DEL FILTRO
            const isFiltered = state.filters && state.filters[col.id] && String(state.filters[col.id]).trim() !== '';
            const thStyleOverrides = isFiltered ? `background: rgba(37, 99, 235, 0.15); color: var(--accent-color); border-bottom: 2px solid var(--accent-color);` : '';
            const filterIconHtml = isFiltered ? `<span style="opacity:0.5; color:var(--accent-color); margin-left:2px; font-size:0.8rem;">${Icons.filter}</span>` : '';

            const safeColName = String(col.name || 'Senza Nome').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            
            let tooltipHTML = `<div style='margin-bottom:4px; font-size:1.1em;'><b>${safeColName}</b></div>`;
            let hasTooltipInfo = false;

            if (col.comment) {
                const safeComment = col.comment.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                tooltipHTML += `<div style='color:var(--text-secondary); margin-bottom:4px;'>${safeComment}</div>`;
                hasTooltipInfo = true;
            }

            if (isFiltered) {
                const safeFilterTerm = state.filters[col.id].replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                tooltipHTML += `<div style='color:var(--accent-color); border-top:1px solid rgba(150,150,150,0.2); padding-top:4px;'><b>Filtro attivo:</b> ${safeFilterTerm}</div>`;
                hasTooltipInfo = true;
            }

            const tooltipAttr = hasTooltipInfo ? `data-tooltip="${tooltipHTML}"` : '';
            const commentIcon = col.comment ? `<span style="opacity:0.5; margin-left:4px; display:inline-flex; align-items:center;">${Icons.info}</span>` : '';

            const isReadonlySystemCol = isSysDB && col.id === 'sys_c_note';
            const pointerStyle = isEdit && !isReadonlySystemCol ? 'cursor:pointer;' : 'cursor:default;';
            const clickEvent = isEdit && !isReadonlySystemCol ? `onclick="AdvancedTableColumnMenus.openColMenu(event, '${tableId}', '${col.id}')"` : '';

            const dragAttrs = isEdit 
                ? `draggable="true" 
                   ondragstart="AdvancedTable.onColDragStart(event, '${tableId}', '${col.id}')" 
                   ondragenter="AdvancedTable.onColDragEnter(event)"
                   ondragover="AdvancedTable.onColDragOver(event)" 
                   ondragleave="AdvancedTable.onColDragLeave(event)" 
                   ondrop="AdvancedTable.onColDrop(event, '${tableId}', '${col.id}')"` 
                : '';

            html += `<th id="adv-th-${tableId}-${col.id}" style="width: ${col.width}px; ${pointerStyle} ${thStyleOverrides}" data-col="${col.id}" ${clickEvent} ${dragAttrs} ${tooltipAttr}>
                        <div class="adv-th-content">
                            <span style="display:flex; align-items:center; gap:5px;"><span style="display:inline-flex;">${icon}</span> ${safeColName} ${commentIcon} ${filterIconHtml}</span>
                            <span>${sortIndicator}</span>
                        </div>
                        ${isEdit ? `<div class="adv-col-resizer" onmousedown="AdvancedTable.startResize(event, '${tableId}', '${col.id}')"></div>` : ''}
                     </th>`;
        });

        let lastColWidth = (isEdit && hasHiddenCols) ? 60 : 40;
        let lastColIcon = '';
        
        if (isEdit) {
            if (state.isLinkedView) {
                lastColIcon = `<button class="adv-add-btn" style="padding:4px; margin:0 auto; display:flex; align-items:center; justify-content:center; color:var(--accent-color);" title="Vai al Database Originale per modificare la struttura" onclick="UI.jumpToWidget('${state.sourceTableId}')">${Icons.tableDatabase}</button>`;
            } else {
                lastColIcon = `<button class="adv-add-btn" style="padding:4px; margin:0 auto; display:flex; align-items:center; justify-content:center;" onclick="AdvancedTableColumnMenus.openAddColumnMenu(event, '${tableId}')">${Icons.plus}</button>`;
            }
        }
        
        html += `<th id="adv-th-add-${tableId}" style="width: ${lastColWidth}px; text-align:center; padding:0; vertical-align:middle;">${lastColIcon}</th></tr></thead><tbody>`;

        if (pagedRows.length === 0) {
            html += `<tr><td colspan="${visibleCols.length + 1}" style="text-align:center; color:var(--text-secondary); padding:20px;">Nessun risultato.</td></tr>`;
        } else {
            pagedRows.forEach(row => {
                
                let rowColorClass = row.color && row.color !== 'none' ? row.color : '';
                let rowOpacity = row.opacity !== undefined ? row.opacity : '100';

                if (state.conditionalColors && state.conditionalColors.length > 0) {
                    for (const rule of state.conditionalColors) {
                        if (!rule.active || !rule.conditions || rule.conditions.length === 0) continue;
                        
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
                            
                            // Valutazione opacità fissa vs formula JS
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

                if (typeof rowOpacity === 'string' && rowOpacity.startsWith('=')) {
                    rowOpacity = AdvancedTable.evaluateFormula(rowOpacity.substring(1), row, state.columns, tableId, state.title, row.virtualCells, renderCache);
                }

                let pOp = parseFloat(rowOpacity);
                if (isNaN(pOp)) pOp = 100;
                pOp = Math.max(0, Math.min(100, pOp));

                let inlineBgStyle = '';
                if (rowColorClass && pOp < 100) {
                    inlineBgStyle = `background-color: color-mix(in srgb, var(--${rowColorClass}) ${pOp}%, transparent) !important;`;
                    rowColorClass = ''; 
                }

                const isRowSelected = state.selectedRows && state.selectedRows.includes(row.id);
                const selectedClass = isRowSelected ? 'adv-row-selected' : '';
                const dblClickEvent = isEdit ? `ondblclick="AdvancedTable.openRecordView('${tableId}', '${row.id}')"` : '';
                
                html += `<tr class="${rowColorClass} ${selectedClass}" data-row-id="${row.id}" ${dblClickEvent} style="${inlineBgStyle}">`;

                visibleCols.forEach(col => {
                    const val = row.virtualCells[col.id] !== undefined ? row.virtualCells[col.id] : '';
                    html += `<td style="width: ${col.width}px; max-width: ${col.width}px;">${AdvancedTable.renderCell(tableId, row, col, val, state, isEdit)}</td>`;
                });

                let actionCell = `<button class="adv-icon-btn" title="Apri Record" onclick="AdvancedTable.openRecordView('${tableId}', '${row.id}')" style="padding:2px; color:currentColor;">${Icons.recordView}</button>`;
                html += `<td class="adv-action-cell"><div class="adv-action-cell-content">${actionCell}</div></td></tr>`;
            });
        }
        html += `</tbody></table></div>`;

        if (!state.hideFooterControls && (isEdit || pageSize !== 'all')) {
            html += `<div class="adv-table-footer-controls">`;
            html += `<div class="adv-footer-left">`;
            
            if (isEdit && !isSysDB) {
                html += `<button class="adv-add-btn" onclick="AdvancedTable.addRow(event, '${tableId}')"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.plus} Nuova riga</span></button>`;
                
                if (state.selectedRows && state.selectedRows.length > 0) {
                    if (state.selectedRows.length === 1) {
                        html += `<button class="adv-add-btn" style="color:var(--accent-color); background:rgba(37, 99, 235, 0.05); border: 1px solid rgba(37, 99, 235, 0.2);" onclick="AdvancedTable.openRecordView('${tableId}', '${state.selectedRows[0]}')"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.recordView} Apri Record</span></button>`;
                    }
                    const btnLabel = state.selectedRows.length === 1 ? 'Elimina 1 riga' : `Elimina ${state.selectedRows.length} righe`;
                    html += `<button class="adv-add-btn danger" onclick="AdvancedTable.deleteSelectedRows('${tableId}')"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.trash} ${btnLabel}</span></button>`;
                    html += `<button class="adv-add-btn" onclick="AdvancedTable.clearSelectedRows('${tableId}')"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.close} Annulla selezione</span></button>`;
                }
            } else if (isSysDB) {
                html += `<div style="font-size:0.75rem; color:var(--text-secondary); opacity:0.7; padding:4px;">Il numero di record riflette le pagine. Le righe non possono essere aggiunte o rimosse manualmente.</div>`;
            }

            html += `</div><div class="adv-footer-right">`;

            if (pageSize === 'all') {
                if (isEdit) html += `<div id="adv-page-btn-${tableId}" class="adv-add-btn" style="cursor:pointer; margin:0; font-weight:normal;" onclick="AdvancedTable.togglePageSizeMenu(event, '${tableId}')">Tutte le righe</div>`;
            } else {
                let prevDisabled = (currentPage === 1) ? 'opacity:0.3; pointer-events:none;' : ``;
                let nextDisabled = (currentPage >= totalPages) ? 'opacity:0.3; pointer-events:none;' : ``;
                html += `<button class="adv-add-btn" style="padding:4px 8px; ${prevDisabled}" onclick="AdvancedTable.changePage('${tableId}', -1)">${Icons.chevronLeft}</button>
                         <div id="adv-page-btn-${tableId}" class="adv-add-btn" style="cursor:${isEdit ? 'pointer' : 'default'}; margin:0; font-weight:normal;" ${isEdit ? `onclick="AdvancedTable.togglePageSizeMenu(event, '${tableId}')"` : ''}>Pagina ${currentPage} di ${totalPages}</div>
                         <button class="adv-add-btn" style="padding:4px 8px; ${nextDisabled}" onclick="AdvancedTable.changePage('${tableId}', 1)">${Icons.chevronRight}</button>`;
            }
            html += `</div></div>`;
        }

        bodyContainer.innerHTML = html;
        if (isEdit && typeof AdvancedTable.attachCellEvents !== 'undefined') {
            AdvancedTable.attachCellEvents(bodyContainer, tableId);
        }

        if (prevScrollX > 0 || prevScrollY > 0) {
            const newScroll = bodyContainer.querySelector('.adv-scroll-container');
            if (newScroll) {
                newScroll.scrollLeft = prevScrollX;
                newScroll.scrollTop = prevScrollY;
            }
        }
    },

    attachCellEvents: (wrapper, tableId) => {
        wrapper.querySelectorAll('.adv-cell-text[contenteditable="true"]').forEach(el => {
            el.addEventListener('dblclick', e => e.stopPropagation());
            el.addEventListener('keydown', e => e.stopPropagation());
            el.addEventListener('blur', (e) => {
                AdvancedTable.updateData(tableId, e.target.getAttribute('data-row'), e.target.getAttribute('data-col'), e.target.innerText);
            });
        });
        
        wrapper.querySelectorAll('.adv-cell-checkbox input:not([disabled])').forEach(el => {
            if (el.closest('.adv-action-cell')) return;
            el.addEventListener('dblclick', e => e.stopPropagation());
            el.addEventListener('change', (e) => {
                AdvancedTable.updateData(tableId, e.target.getAttribute('data-row'), e.target.getAttribute('data-col'), e.target.checked);
            });
        });
        
        wrapper.querySelectorAll('.adv-cell-date input:not([readonly]), .adv-number-input:not([readonly])').forEach(el => {
            el.addEventListener('dblclick', e => e.stopPropagation());
            el.addEventListener('keydown', e => e.stopPropagation());
            el.addEventListener('blur', (e) => {
                // TIMEOUT FIX: Permette al codice html inline di eseguire il salvataggio su 'data-raw-value' prima di trasmetterlo
                setTimeout(() => {
                    if (!e.target.parentNode.closest('.adv-cell-date') || e.target.parentNode.children.length === 1) {
                        let valToSave = e.target.value;
                        if (e.target.classList.contains('adv-number-input')) {
                            let raw = e.target.getAttribute('data-raw-value');
                            if (raw === null || raw === '') {
                                valToSave = '';
                            } else {
                                // Parsing corazzato: garantisce un casting a Number ignorando i difetti della virgola
                                let parsed = parseFloat(String(raw).replace(',', '.'));
                                valToSave = isNaN(parsed) ? '' : parsed;
                            }
                        }
                        AdvancedTable.updateData(tableId, e.target.getAttribute('data-row'), e.target.getAttribute('data-col'), valToSave);
                    }
                }, 0);
            });
        });

        const tbody = wrapper.querySelector('.adv-table tbody');
        const globalSelector = document.getElementById('adv-global-row-selector');
        
        if (tbody && globalSelector) {
            tbody.addEventListener('mouseover', (e) => {
                const state = AdvancedTable.getState(tableId);
                if (!state || state.hideFooterControls || state.isPivot) {
                    globalSelector.classList.remove('visible');
                    return;
                }

                const tr = e.target.closest('tr');
                if (!tr) return;
                
                if (e.target === tbody) { globalSelector.classList.remove('visible'); return; }

                const rowId = tr.getAttribute('data-row-id');
                if (!rowId) return;

                const trRect = tr.getBoundingClientRect();
                
                const scrollContainer = document.getElementById('editorScrollContent');
                if (scrollContainer) {
                    const scrollRect = scrollContainer.getBoundingClientRect();
                    if (trRect.top < scrollRect.top || trRect.bottom > scrollRect.bottom) {
                        globalSelector.classList.remove('visible');
                        return;
                    }
                }

                const widgetWrapper = document.getElementById(tableId);
                const wrapperRect = widgetWrapper.getBoundingClientRect();

                globalSelector.style.top = (trRect.top + (trRect.height / 2) - 12) + 'px';
                globalSelector.style.left = (wrapperRect.left - 22) + 'px'; 

                const isSelected = tr.classList.contains('adv-row-selected');
                const cb = globalSelector.querySelector('input');
                if (cb) cb.checked = isSelected;
                
                if (isSelected) globalSelector.classList.add('selected');
                else globalSelector.classList.remove('selected');
                
                globalSelector.setAttribute('data-target-table', tableId);
                globalSelector.setAttribute('data-target-row', rowId);
                globalSelector.classList.add('visible');
            });

            wrapper.addEventListener('mouseleave', (e) => {
                if (e.relatedTarget !== globalSelector && !globalSelector.contains(e.relatedTarget)) {
                    globalSelector.classList.remove('visible');
                }
            });
        }
    }
});