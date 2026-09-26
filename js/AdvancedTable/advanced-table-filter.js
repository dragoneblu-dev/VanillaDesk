/**
 * AdvancedTableFilter.js
 * Modulo Filtri Avanzato con Autocompletamento e Gestione Filtri Salvati.
 * FIX CHECKBOX SUGGESTIONS: Normalizzati i suggerimenti per i campi checkbox (Sì / No)
 * evitando simboli o stringhe descrittive composite che bloccavano il match esatto.
 * FIX PIVOT MAX/MIN DATE: Risolto bug per cui le date venivano scambiate per numeri da parseFloat.
 * MOTORE FILTRI POLIMORFO: Gli operatori (=, !=, <, >, <=, >=) operano coerentemente anche nei filtri live:
 * - Numeri: confronto matematico.
 * - Testo/Select: uguaglianza esatta su '=', esclusione di contenimento su '!=', confronto alfabetico naturale su '<, >, <=, >='.
 * FIX AUTOCOMPLETE DATES: Allineamento parsing delle date con estrazione sicura di intervalli {start, end}
 * e timestamp di sistema in buildFilteredRows; rimozione automatica di stringhe "Invalid Date" dai suggerimenti unici.
 * FEAT DATE RANGE FILTERING: buildFilteredRows allineato all'algebra degli intervalli di advanced-table-data.js.
 */

Object.assign(AdvancedTable, {

    _filterTimeout: null,
    _currentFilterInput: null, 

    // MENU 1: INPUT DI RICERCA (Filtra)
    openFilterMenu: (e, tableId) => {
        if (e) e.stopPropagation();

        const existing = document.querySelector('.adv-dropdown.filter-menu');
        UI.Menu.closeAll(true);
        if (existing && e) return;

        const state = AdvancedTable.getState(tableId);

        const dropdown = document.createElement('div');
        dropdown.className = 'adv-dropdown filter-menu';
        dropdown.id = 'advFilterMenuDropdown';
        dropdown.onmousedown = (ev) => ev.stopPropagation();
        dropdown.onclick = (ev) => ev.stopPropagation();
        dropdown.style.minWidth = '300px';

        if (!state.filters) state.filters = {};

        const safeTooltipText = "Usa i simboli &gt;, &lt;, != o dividi con ; per cercare più termini.\nInizia con = per match esatto.\nPer i range di date puoi usare la freccia ➔";
        
        let html = `<div class="adv-dropdown-title" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; text-transform:uppercase; letter-spacing:0.05em;">
                    <span>Filtra Dati per Campo</span>
                    <span data-tooltip="${safeTooltipText}" style="cursor:help; opacity:0.6; display:inline-flex; align-items:center; color:var(--text-primary); transition: opacity 0.2s;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.6'">${Icons.info}</span>
                 </div>`;

        html += `<div id="advFilterScrollArea" class="adv-scroll-container" style="max-height: 50vh; overflow-y: auto; overflow-x: hidden; padding-right: 5px; padding-bottom: 5px;" onscroll="AdvancedTable.hideFilterAutocomplete()">`;

        const visibleCols = [];
        const hiddenCols = [];

        let viewId = 'table';
        if (state.viewType === 'board') viewId = 'board_' + state.boardGroupBy;
        else if (state.viewType === 'calendar') viewId = 'calendar_' + state.calendarDateCol;
        else if (state.viewType === 'timeline') viewId = 'timeline_' + state.timelineDateCol;

        const hiddenList = state.viewConfig && state.viewConfig[viewId] ? state.viewConfig[viewId].hiddenCols : [];

        (state.columns || []).forEach(c => {
            const isHidden = c.hidden || hiddenList.includes(c.id);
            if (isHidden) hiddenCols.push(c);
            else visibleCols.push(c);
        });

        const buildInputHTML = (c) => {
            const val = state.filters[c.id] || '';
            const safeVal = val.replace(/"/g, '&quot;');
            
            const clearBtn = val ? `<button class="adv-icon-btn danger" style="position:absolute; right:2px; top:50%; transform:translateY(-50%); padding:2px; margin:0;" onclick="event.stopPropagation(); AdvancedTable.clearSingleFilter('${tableId}', '${c.id}')" title="Cancella filtro">${Icons.close}</button>` : '';

            // L'uso di autocomplete="chrome-off", un name casuale e data-lpignore disinnesca l'autofill nativo e di terze parti
            return `<div style="display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap: 10px; margin-bottom:5px; position:relative;">
                        <span style="font-size:0.75rem; color:var(--text-secondary); white-space:nowrap; width: 100px; overflow:hidden; text-overflow:ellipsis;" title="${c.name.replace(/"/g, '&quot;')}">${c.name}</span>
                        <div style="flex:1; position:relative; display:flex; align-items:center;">
                            <input type="text" class="adv-menu-input" style="margin:0; width:100%; padding-right:${val ? '25px' : '5px'};" 
                                   autocomplete="chrome-off" name="prevent_autofill_${c.id}" data-lpignore="true" data-1p-ignore="true" spellcheck="false"
                                   data-col="${c.id}" value="${safeVal}" placeholder="..." 
                                   onkeydown="event.stopPropagation()" 
                                   oninput="AdvancedTable.applyFilter('${tableId}', this)"
                                   onfocus="AdvancedTable.showFilterAutocomplete('${tableId}', this)"
                                   onblur="AdvancedTable.hideFilterAutocomplete()">
                            ${clearBtn}
                        </div>
                     </div>`;
        };

        visibleCols.forEach(c => { html += buildInputHTML(c); });

        if (hiddenCols.length > 0) {
            html += `<div class="adv-dropdown-title" style="margin-top: 15px; margin-bottom: 10px; padding-top: 10px; border-top: 1px solid var(--border-color);">Campi non visibili</div>`;
            hiddenCols.forEach(c => { html += buildInputHTML(c); });
        }

        html += `</div>`; 

        dropdown.innerHTML = html;
        document.body.appendChild(dropdown);
        UI.Menu.positionAt(dropdown, `adv-filter-btn-${tableId}`);
    },

    // MENU 2: GESTIONE SALVATAGGI (Viste Salvate)
    openSavedFiltersMenu: (e, tableId) => {
        if (e) e.stopPropagation();

        const existing = document.querySelector('.adv-dropdown.saved-filters-menu');
        UI.Menu.closeAll(true);
        if (existing && e) return;

        const state = AdvancedTable.getState(tableId);

        const dropdown = document.createElement('div');
        dropdown.className = 'adv-dropdown saved-filters-menu';
        dropdown.id = 'advSavedFiltersMenuDropdown';
        dropdown.onmousedown = (ev) => ev.stopPropagation();
        dropdown.onclick = (ev) => ev.stopPropagation();
        dropdown.style.minWidth = '280px';

        if (!state.filters) state.filters = {};
        if (!state.savedFilters) state.savedFilters = [];

        const currentFilters = {};
        Object.keys(state.filters).forEach(k => { 
            if(state.filters[k].trim()) currentFilters[k] = state.filters[k].trim();
        });
        const hasActiveFilters = Object.keys(currentFilters).length > 0;

        let isDuplicate = false;
        state.savedFilters.forEach(sf => {
            const cleanSaved = {};
            Object.keys(sf.filters).forEach(k => { if(sf.filters[k].trim()) cleanSaved[k] = sf.filters[k].trim();});
            if (JSON.stringify(currentFilters) === JSON.stringify(cleanSaved)) {
                isDuplicate = true;
            }
        });

        const canSave = hasActiveFilters && !isDuplicate;

        let html = `<div class="adv-dropdown-title" style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; text-transform:uppercase; letter-spacing:0.05em;">
                        <span>Viste e Filtri Salvati</span>
                    </div>`;

        html += `<div style="display:flex; flex-direction:column; gap:6px; padding: 0 4px; max-height: 40vh; overflow-y: auto;">`;
        
        if (state.savedFilters.length === 0) {
            html += `<div style="font-size:0.8rem; color:var(--text-secondary); text-align:center; font-style:italic; padding:10px 0;">Nessuna vista salvata.</div>`;
        }

        state.savedFilters.forEach(sf => {
            const cleanSaved = {};
            Object.keys(sf.filters).forEach(k => { if(sf.filters[k].trim()) cleanSaved[k] = sf.filters[k].trim();});
            
            const isActive = JSON.stringify(currentFilters) === JSON.stringify(cleanSaved) && Object.keys(cleanSaved).length > 0;
            const activeStyle = isActive ? 'border-color: var(--accent-color); background: rgba(37, 99, 235, 0.05);' : 'border-color: var(--border-color); background: var(--bg-color);';
            const titleWeight = isActive ? 'font-weight:bold; color:var(--accent-color);' : 'color:var(--text-primary);';

            html += `   <div style="display:flex; align-items:center; justify-content:space-between; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 6px 4px 10px; cursor:pointer; transition: all 0.2s ease; ${activeStyle}"
                             onmouseenter="this.style.borderColor='var(--accent-color)'" 
                             onmouseleave="this.style.borderColor='${isActive ? 'var(--accent-color)' : 'var(--border-color)'}'">
                            
                            <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;" onclick="event.stopPropagation(); AdvancedTable.applySavedFilter('${tableId}', '${sf.id}')">
                                <span style="color:var(--accent-color); display:inline-flex; width:14px; height:14px; opacity:${isActive ? '1' : '0.6'};">${Icons.bookmark}</span>
                                <span style="font-size:0.8rem; ${titleWeight} white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${sf.name.replace(/</g, '&lt;')}</span>
                            </div>

                            <button class="adv-icon-btn danger" style="padding: 4px; margin:0; flex-shrink:0; opacity:0.5; transition: opacity 0.2s;" 
                                    onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.5'"
                                    onclick="event.stopPropagation(); AdvancedTable.deleteSavedFilter('${tableId}', '${sf.id}')" title="Elimina filtro">
                                ${Icons.trash}
                            </button>
                        </div>`;
        });
        html += `</div>`;

        // Se c'è almeno un'azione da mostrare (Salva o Azzera), inseriamo il separatore e i bottoni
        if (canSave || hasActiveFilters) {
            html += `<hr style="border:0; border-top:1px solid var(--border-color); margin: 10px 0;">`;
            
            if (canSave) {
                html += `
                    <button class="adv-menu-btn" style="width:100%; display:flex; justify-content:center; align-items:center; gap:5px; margin-bottom: 5px;" onclick="event.stopPropagation(); AdvancedTable.saveCurrentFilter('${tableId}')">
                        <span style="display:inline-flex; align-items:center; width:14px;">${Icons.save}</span> Salva Vista/Filtro Corrente
                    </button>
                `;
            }

            if (hasActiveFilters) {
                html += `
                <div style="padding-top: ${canSave ? '5px' : '0'};">
                    <button class="adv-menu-btn" style="width:100%; display:flex; justify-content:center; align-items:center; gap:5px; color:var(--danger-color); background:rgba(239, 68, 68, 0.1);" onclick="event.stopPropagation(); AdvancedTable.clearAllFilters('${tableId}', false)">
                        Azzera Tutti i Filtri
                    </button>
                </div>`;
            }
        }

        dropdown.innerHTML = html;
        document.body.appendChild(dropdown);
        UI.Menu.positionAt(dropdown, `adv-saved-filters-btn-${tableId}`);
    },

    saveCurrentFilter: (tableId) => {
        let state = AdvancedTable.getState(tableId);
        
        const hasActiveFilters = state.filters && Object.values(state.filters).some(val => val.trim() !== '');
        if (!hasActiveFilters) return;

        const filterName = prompt("Scegli un nome per questa Vista/Filtro (es: Clienti Premium):");
        if (!filterName || filterName.trim() === '') return;

        if (!state.savedFilters) state.savedFilters = [];
        
        const cleanFilters = {};
        Object.keys(state.filters).forEach(k => {
            if(state.filters[k].trim()) cleanFilters[k] = state.filters[k].trim();
        });

        state.savedFilters.push({
            id: 'sf_' + Date.now() + Math.random().toString(36).substr(2, 5),
            name: filterName.trim(),
            filters: cleanFilters
        });

        AdvancedTable.setState(tableId, state);
        Store.triggerAutoSave();
        
        AdvancedTable.openSavedFiltersMenu(null, tableId);
    },

    applySavedFilter: (tableId, filterId) => {
        let state = AdvancedTable.getState(tableId);
        if (!state.savedFilters) return;

        const sf = state.savedFilters.find(f => f.id === filterId);
        if (!sf) return;

        state.filters = JSON.parse(JSON.stringify(sf.filters));

        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
        
        AdvancedTable.openSavedFiltersMenu(null, tableId);
    },

    deleteSavedFilter: (tableId, filterId) => {
        if (!confirm("Sei sicuro di voler eliminare definitivamente questo filtro dalla lista?")) return;

        let state = AdvancedTable.getState(tableId);
        if (!state.savedFilters) return;

        state.savedFilters = state.savedFilters.filter(f => f.id !== filterId);

        AdvancedTable.setState(tableId, state);
        Store.triggerAutoSave();
        
        AdvancedTable.openSavedFiltersMenu(null, tableId);
    },

    clearSingleFilter: (tableId, colId) => {
        let state = AdvancedTable.getState(tableId);
        if (state.filters && state.filters[colId]) {
            state.filters[colId] = '';
            AdvancedTable.setState(tableId, state);
            AdvancedTable.renderTable(tableId);
            Store.triggerAutoSave();
            AdvancedTable.openFilterMenu(null, tableId);
        }
    },

    clearAllFilters: (tableId, keepMenuOpen = false) => {
        let state = AdvancedTable.getState(tableId);
        state.filters = {};
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();

        if (keepMenuOpen) {
            AdvancedTable.openFilterMenu(null, tableId);
        } else {
            UI.Menu.closeAll(true);
        }
    },

    showFilterAutocomplete: (tableId, inputEl) => {
        AdvancedTable._currentFilterInput = inputEl;
        const targetColId = inputEl.getAttribute('data-col');
        const state = AdvancedTable.getState(tableId);
        const tgtColDef = (state.columns || []).find(c => c.id === targetColId);

        // GESTIONE CHECKBOX: Suggerimenti dedicati puliti senza simboli che corrompono il match
        if (tgtColDef && tgtColDef.type === 'checkbox') {
            let popup = document.getElementById('adv-filter-autocomplete-portal');
            if (!popup) {
                popup = document.createElement('div');
                popup.id = 'adv-filter-autocomplete-portal';
                popup.className = 'adv-filter-autocomplete';
                popup.style.position = 'fixed';
                popup.style.zIndex = '99999';
                document.body.appendChild(popup);
            }
            const rect = inputEl.getBoundingClientRect();
            popup.style.top = rect.bottom + 'px';
            popup.style.left = rect.left + 'px';
            popup.style.width = rect.width + 'px';

            popup.innerHTML = `
                <div class="adv-filter-autocomplete-item" onmousedown="event.preventDefault(); AdvancedTable.selectAutocompleteValue('${tableId}', '${targetColId}', 'Sì')">Sì (Spuntato)</div>
                <div class="adv-filter-autocomplete-item" onmousedown="event.preventDefault(); AdvancedTable.selectAutocompleteValue('${tableId}', '${targetColId}', 'No')">No (Vuoto)</div>
            `;
            popup.style.display = 'block';
            return;
        }

        let uniqueVals = new Set();

        const isStrictNumeric = (str) => {
            if (str === null || str === undefined) return false;
            const s = String(str).trim().replace(',', '.');
            return s !== '' && !isNaN(s) && !isNaN(parseFloat(s)) && isFinite(Number(s));
        };

        const buildFilteredRows = (rowsData, isPivot) => {
            let tempRows = rowsData || [];
            if (state.filters) {
                Object.keys(state.filters).forEach(cId => {
                    if (cId === targetColId) return;
                    const rawTerm = state.filters[cId].trim();
                    if (!rawTerm) return;

                    const terms = (rawTerm.split(';') || []).map(t => t.trim()).filter(t => t);
                    if (terms.length === 0) return;

                    const colDef = (state.columns || []).find(c => c.id === cId);
                    if (!colDef) return;

                    tempRows = tempRows.filter(r => {
                        let cellVal = r.virtualCells[cId];

                        // Usiamo il Core per convertire le matrici complesse in testo semplice in modo coerente
                        const displayVal = AdvancedTable.getFormatDisplayValue(colDef, cellVal);

                        return terms.some(term => {
                            const matchOp = term.match(/^(>=|<=|!=|>|<|=)\s*(.*)/);

                            if (matchOp) {
                                const operator = matchOp[1];
                                let targetVal = matchOp[2].trim();

                                let isDateType = false;
                                if (isPivot && cId.startsWith('grp_')) {
                                    const sourceState = AdvancedTable.getTableState(state.sourceTableId);
                                    const scId = (state.columns || []).find(c => c.id === cId)?.sourceColId;
                                    const sCol = (sourceState?.columns || []).find(c => c.id === scId);
                                    if (sCol && ['date', 'datetime', 'time', 'created_time', 'last_edited_time'].includes(sCol.type)) isDateType = true;
                                } else if (!isPivot && ['date', 'datetime', 'created_time', 'last_edited_time'].includes(colDef.type)) {
                                    isDateType = true;
                                }

                                if (isDateType) {
                                    const cellInterval = AdvancedTable._extractIntervalFromValue(cellVal, colDef, r, isPivot);
                                    const targetInterval = AdvancedTable._extractIntervalFromValue(targetVal);

                                    if (cellInterval && targetInterval) {
                                        const isTargetRange = targetInterval.startMs !== targetInterval.endMs;

                                        if (isTargetRange) {
                                            const overlaps = (cellInterval.startMs <= targetInterval.endMs) && (cellInterval.endMs >= targetInterval.startMs);
                                            if (operator === '=') return overlaps;
                                            if (operator === '!=') return !overlaps;
                                            if (operator === '>') return cellInterval.startMs > targetInterval.endMs;
                                            if (operator === '<') return cellInterval.endMs < targetInterval.startMs;
                                            if (operator === '>=') return cellInterval.endMs >= targetInterval.startMs;
                                            if (operator === '<=') return cellInterval.startMs <= targetInterval.endMs;
                                        } else {
                                            const hasExplicitTime = targetVal.includes(':');
                                            let dayStart = targetInterval.startMs;
                                            let dayEnd = targetInterval.endMs;

                                            if (!hasExplicitTime) {
                                                const d = new Date(targetInterval.startMs);
                                                d.setHours(0, 0, 0, 0);
                                                dayStart = d.getTime();
                                                d.setHours(23, 59, 59, 999);
                                                dayEnd = d.getTime();
                                            }

                                            const isInDayOrOverlaps = (cellInterval.startMs <= dayEnd) && (cellInterval.endMs >= dayStart);
                                            if (operator === '=') return isInDayOrOverlaps;
                                            if (operator === '!=') return !isInDayOrOverlaps;
                                            if (operator === '>') return cellInterval.startMs > dayEnd;
                                            if (operator === '<') return cellInterval.endMs < dayStart;
                                            if (operator === '>=') return cellInterval.endMs >= dayStart;
                                            if (operator === '<=') return cellInterval.startMs <= dayEnd;
                                        }
                                    }
                                }

                                // Confronto numerico matematico puro
                                const isColNumeric = ['number', 'formula', 'rollup'].includes(colDef.type);
                                const isBothNumeric = isStrictNumeric(cellVal) && isStrictNumeric(targetVal);

                                if (isColNumeric || isBothNumeric) {
                                    const cNum = parseFloat(String(cellVal).replace(',', '.'));
                                    const tNum = parseFloat(String(targetVal).replace(',', '.'));
                                    if (!isNaN(cNum) && !isNaN(tNum)) {
                                        if (operator === '>') return cNum > tNum; if (operator === '<') return cNum < tNum;
                                        if (operator === '>=') return cNum >= tNum; if (operator === '<=') return cNum <= tNum;
                                        if (operator === '=') return cNum === tNum; if (operator === '!=') return cNum !== tNum;
                                    }
                                }
                                
                                const strA = String(displayVal || '').toLowerCase();
                                const strB = String(targetVal || '').toLowerCase();

                                if (operator === '=') return strA === strB;
                                if (operator === '!=') return !strA.includes(strB);

                                const cmp = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
                                if (operator === '>') return cmp > 0;
                                if (operator === '<') return cmp < 0;
                                if (operator === '>=') return cmp >= 0;
                                if (operator === '<=') return cmp <= 0;
                            }
                            return String(displayVal || '').toLowerCase().includes(term.toLowerCase());
                        });
                    });
                });
            }
            return tempRows;
        };

        if (state.isPivot) {
            const sourceState = AdvancedTable.getTableState(state.sourceTableId);
            if (!sourceState) return;

            let sourceRows = [];
            (sourceState.rows || []).forEach(r => {
                let vRow = { ...r, virtualCells: { ...r.cells } };
                (sourceState.columns || []).forEach(col => {
                    if (col.type === 'formula') {
                        vRow.virtualCells[col.id] = (typeof AdvancedTable.evaluateFormula === 'function') ? AdvancedTable.evaluateFormula(col.formula, vRow, sourceState.columns, state.sourceTableId, sourceState.title, vRow.virtualCells) : '';
                    } else vRow.virtualCells[col.id] = vRow.cells[col.id];
                });
                sourceRows.push(vRow);
            });

            const relationCache = {};
            const isDateCache = {};
            (state.groupBy || []).forEach(gColId => {
                const sc = (sourceState.columns || []).find(c => c.id === gColId);
                if (sc) {
                    if (sc.type === 'relation' && sc.targetTableId) {
                        const targetState = AdvancedTable.getTableState(sc.targetTableId);
                        if (targetState) relationCache[sc.id] = { state: targetState, colId: sc.targetColId };
                    }
                    if (['date', 'datetime', 'time', 'created_time', 'last_edited_time'].includes(sc.type)) isDateCache[sc.id] = true;
                }
            });

            const groupedData = {};
            sourceRows.forEach(row => {
                let keyParts = (state.groupBy || []).map(gColId => {
                    let val = row.virtualCells[gColId];
                    if (relationCache[gColId]) {
                        const tCache = relationCache[gColId];
                        let arr = Array.isArray(val) ? val : (val ? [val] : []);
                        let resolvedNames = arr.map(tId => {
                            const tRow = (tCache.state.rows || []).find(r => r.id === tId);
                            return tRow ? (tRow.cells[tCache.colId] || 'Senza Nome') : 'Orfano';
                        });
                        if (resolvedNames.length > 0) return resolvedNames;
                    }
                    if (isDateCache[gColId] && val) {
                        return AdvancedTable.formatTime(val);
                    }
                    if (Array.isArray(val)) return val.join(', ');
                    return String(val || '(Vuoto)').trim() || '(Vuoto)';
                });
                let compositeKey = JSON.stringify(keyParts);
                if (!groupedData[compositeKey]) groupedData[compositeKey] = { keys: keyParts, rows: [] };
                groupedData[compositeKey].rows.push(row);
            });

            let rawPivotRows = [];
            for (const [compKey, data] of Object.entries(groupedData)) {
                let pRow = { virtualCells: {} };
                (state.groupBy || []).forEach((gColId, idx) => {
                    let val = data.keys[idx];
                    if (Array.isArray(val)) val = val.join(', ');
                    pRow.virtualCells['grp_' + idx] = String(val);
                });
                (state.aggregations || []).forEach((agg, idx) => {
                    let aggColId = 'agg_' + idx;
                    let result = '';
                    if (agg.type === 'count') result = data.rows.length;
                    else if (agg.type === 'list') {
                        let items = (data.rows || []).map(r => {
                            let v = r.virtualCells[agg.sourceColId];
                            const sCol = (sourceState.columns || []).find(c => c.id === agg.sourceColId);
                            if (sCol && sCol.type === 'relation' && sCol.targetTableId) {
                                const tState = AdvancedTable.getTableState(sCol.targetTableId);
                                if (tState) {
                                    let arr = Array.isArray(v) ? v : (v ? [v] : []);
                                    v = arr.map(tId => {
                                        const tr = (tState.rows || []).find(tx => tx.id === tId);
                                        return tr ? (tr.cells[sCol.targetColId] || 'Senza Nome') : 'Orfano';
                                    }).join(', ');
                                }
                            } else if (sCol && ['date', 'datetime', 'time', 'created_time', 'last_edited_time'].includes(sCol.type) && v) {
                                return AdvancedTable.formatTime(v);
                            } else if (Array.isArray(v)) v = v.join(', ');
                            return String(v || '').trim();
                        }).filter(s => s !== '');
                        result = [...new Set(items)].join(', ');
                    } else {
                        const sourceCol = (sourceState.columns || []).find(c => c.id === agg.sourceColId);
                        let vals = (data.rows || []).map(r => r.virtualCells[agg.sourceColId]).filter(v => v !== undefined && v !== null && v !== '');
                        if (vals.length === 0) result = '-';
                        else if (agg.type === 'sum' || agg.type === 'avg') {
                            let nums = vals.map(v => parseFloat(v)).filter(n => !isNaN(n));
                            if (nums.length === 0) result = '-';
                            else if (agg.type === 'sum') result = nums.reduce((a, b) => a + b, 0);
                            else if (agg.type === 'avg') result = (nums.reduce((a, b) => a + b, 0) / nums.length);
                        } else if (agg.type === 'max' || agg.type === 'min') {
                            if (sourceCol && ['date', 'datetime', 'time', 'created_time', 'last_edited_time'].includes(sourceCol.type)) {
                                let times = vals.map(v => {
                                    const intv = AdvancedTable._extractIntervalFromValue(v);
                                    return intv ? intv.startMs : null;
                                }).filter(t => t !== null);
                                if (times.length === 0) result = '-';
                                else {
                                    let targetTime = agg.type === 'max' ? Math.max(...times) : Math.min(...times);
                                    const resDate = new Date(targetTime);
                                    if (sourceCol.type === 'time') result = resDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                                    else if (sourceCol.type === 'date') result = resDate.toLocaleDateString('it-IT');
                                    else result = AdvancedTable.formatTime(resDate);
                                }
                            } else if ((sourceCol && ['number'].includes(sourceCol.type)) || vals.every(v => !isNaN(parseFloat(v)))) {
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
                rawPivotRows.push(pRow);
            }

            const filteredRows = buildFilteredRows(rawPivotRows, true);
            filteredRows.forEach(r => {
                let extractedVal = r.virtualCells[targetColId];
                if (extractedVal !== undefined && extractedVal !== null && extractedVal !== '' && extractedVal !== '-' && !String(extractedVal).includes('Invalid Date')) {
                    uniqueVals.add(String(extractedVal).trim());
                }
            });

        } else {
            // DATABASE STANDARD
            let rawDbRows = [];
            const renderCache = {};
            (state.rows || []).forEach(r => {
                rawDbRows.push(AdvancedTable.buildVirtualRow(tableId, r, state, renderCache));
            });

            const filteredRows = buildFilteredRows(rawDbRows, false);

            filteredRows.forEach(r => {
                let val = r.virtualCells[targetColId];
                
                if (tgtColDef) {
                    if (tgtColDef.type === 'relation' || (tgtColDef.type === 'relation_backlink' && (!tgtColDef.backlinkDisplay || tgtColDef.backlinkDisplay === 'list'))) {
                        // Per le relazioni vogliamo i singoli nomi esposti separatamente nell'autocomplete (non il listone aggregato)
                        const names = AdvancedTable._resolveRelationNames(tgtColDef, val);
                        names.forEach(n => {
                            if (n && !String(n).includes('Invalid Date')) uniqueVals.add(String(n).trim());
                        });
                    } else if (tgtColDef.type === 'multi-select') {
                        // Stessa cosa per i multi-select, vogliamo poter filtrare per singolo TAG
                        const valArr = Array.isArray(val) ? val : (val ? [val] : []);
                        valArr.forEach(v => {
                            if (v && !String(v).includes('Invalid Date')) uniqueVals.add(String(v).trim());
                        });
                    } else {
                        // Per tutto il resto usiamo il Core (Date formattate, Record Note, ecc)
                        val = AdvancedTable.getFormatDisplayValue(tgtColDef, val);
                        if (val !== undefined && val !== null && val !== '' && !String(val).includes('Invalid Date')) {
                            uniqueVals.add(String(val).trim());
                        }
                    }
                } else {
                     if (Array.isArray(val)) {
                         val.forEach(v => {
                             if (v && !String(v).includes('Invalid Date')) uniqueVals.add(String(v).trim());
                         });
                     } else if (val !== undefined && val !== null && val !== '' && !String(val).includes('Invalid Date')) {
                         uniqueVals.add(String(val).trim());
                     }
                }
            });
        }

        let valArray = Array.from(uniqueVals).filter(v => v !== '');
        if (valArray.length === 0) return;

        valArray.sort((a, b) => {
            if (!isNaN(parseFloat(a)) && !isNaN(parseFloat(b))) return parseFloat(a) - parseFloat(b);
            return a.localeCompare(b);
        });

        let popup = document.getElementById('adv-filter-autocomplete-portal');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'adv-filter-autocomplete-portal';
            popup.className = 'adv-filter-autocomplete';
            popup.style.position = 'fixed';
            popup.style.zIndex = '99999';
            document.body.appendChild(popup);
        }

        const rect = inputEl.getBoundingClientRect();
        popup.style.top = rect.bottom + 'px';
        popup.style.left = rect.left + 'px';
        popup.style.width = rect.width + 'px';

        let html = '';
        valArray.forEach(v => {
            let displayVal = v;
            if (displayVal.length > 45) displayVal = displayVal.substring(0, 45) + '...';
            html += `<div class="adv-filter-autocomplete-item" title="${v.replace(/"/g, '&quot;')}" onmousedown="event.preventDefault(); AdvancedTable.selectAutocompleteValue('${tableId}', '${targetColId}', '${v.replace(/'/g, "\\'")}')">${displayVal.replace(/</g, '&lt;')}</div>`;
        });

        popup.innerHTML = html;
        popup.style.display = 'block';
    },

    hideFilterAutocomplete: () => {
        const popup = document.getElementById('adv-filter-autocomplete-portal');
        if (popup) popup.style.display = 'none';
    },

    selectAutocompleteValue: (tableId, colId, value) => {
        const inputEl = AdvancedTable._currentFilterInput;
        if (!inputEl) return;

        let currentVal = inputEl.value.trim();
        
        let exactValue = value;
        // Se non contiene operatori logici espliciti, assegna operatore di uguaglianza/match
        if (!/^(>=|<=|!=|>|<|=)\s*/.test(exactValue)) {
            exactValue = '= ' + exactValue;
        }

        if (currentVal) {
            if (currentVal.endsWith(';')) currentVal = currentVal.slice(0, -1).trim();
            const existingTerms = currentVal.split(';').map(t => t.trim().toLowerCase());
            if (!existingTerms.includes(exactValue.toLowerCase())) {
                inputEl.value = currentVal + (currentVal ? '; ' : '') + exactValue;
            }
        } else {
            inputEl.value = exactValue;
        }
        
        AdvancedTable.applyFilter(tableId, inputEl);
        AdvancedTable.hideFilterAutocomplete();
    },

    applyFilter: (tableId, inputEl) => {
        const colId = inputEl.getAttribute('data-col');
        const term = inputEl.value;
        let state = AdvancedTable.getState(tableId);

        if (!state.filters) state.filters = {};
        state.filters[colId] = term;

        AdvancedTable.setState(tableId, state);
        
        clearTimeout(AdvancedTable._filterTimeout);
        AdvancedTable._filterTimeout = setTimeout(() => {
            AdvancedTable.renderTable(tableId);
            Store.triggerAutoSave();
        }, 350);
    }
});