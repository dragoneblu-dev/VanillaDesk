/**
 * sidebar-manager.js
 * Modulo dedicato alla gestione visiva e al ridimensionamento dell'albero di navigazione.
 * Integra il motore SearchAutocomplete per filtrare le note tramite Tag di Pagina.
 * FEAT FACETED CHIPS: Pillole dei filtri interattive con apertura menu a tendina sul corpo,
 * visualizzazione delle opzioni disponibili per proprietà e rimozione isolata su click della ✕.
 * FIX RELATION LABELS: Risoluzione semantica dei record collegati (nessun ID 'sys_r_*' esposto all'utente).
 * UX COMPACT PILL MENU: Spaziatura compatta ottimizzata (padding 2px 4px) per l'elenco delle opzioni a pillola.
 */

const SidebarManager = {
    isResizing: false,
    startX: 0,
    startWidth: 0,

    init: () => {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        if (!document.getElementById('sidebarResizer')) {
            const resizer = document.createElement('div');
            resizer.id = 'sidebarResizer';
            resizer.className = 'sidebar-resizer';
            sidebar.appendChild(resizer);

            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                SidebarManager.isResizing = true;
                SidebarManager.startX = e.pageX;
                SidebarManager.startWidth = sidebar.getBoundingClientRect().width;
                resizer.classList.add('active');
                document.body.style.cursor = 'col-resize';
            });
        }

        document.addEventListener('mousemove', (e) => {
            if (!SidebarManager.isResizing) return;
            const diff = e.pageX - SidebarManager.startX;
            let newWidth = SidebarManager.startWidth + diff;

            if (newWidth < 200) newWidth = 200;
            if (newWidth > 600) newWidth = 600;

            document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        });

        document.addEventListener('mouseup', () => {
            if (SidebarManager.isResizing) {
                SidebarManager.isResizing = false;
                const resizer = document.getElementById('sidebarResizer');
                if (resizer) resizer.classList.remove('active');
                document.body.style.cursor = 'default';

                const finalWidth = document.documentElement.style.getPropertyValue('--sidebar-width');
                localStorage.setItem('pronotes_sidebar_width', finalWidth);
            }
        });

        const savedWidth = localStorage.getItem('pronotes_sidebar_width');
        if (savedWidth) {
            document.documentElement.style.setProperty('--sidebar-width', savedWidth);
        }
    },

    // MOTORE AUTOCOMPLETE E FILTRI A PILLOLA PER LA RICERCA LATERALE
    SearchAutocomplete: {
        
        show: (inputEl, term) => {
            SidebarManager.SearchAutocomplete.hide('Reinizializzazione');

            if (!term || term.trim() === '') {
                return;
            }
            const lowerTerm = term.toLowerCase();

            const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
            if (!propsDb || !propsDb.columns || !propsDb.rows) {
                return;
            }

            let suggestions = [];

            propsDb.columns.forEach(col => {
                if (col.id === 'sys_c_note') return;

                // 1. Ricerca sul NOME DELLA COLONNA (Filtro *EXISTS*)
                if (col.name.toLowerCase().includes(lowerTerm)) {
                    const isAlreadyActive = AppState.activePropertyFilters && AppState.activePropertyFilters.some(f => f.colId === col.id && f.realValue === '*EXISTS*');
                    if (!isAlreadyActive) {
                        suggestions.push({
                            type: 'column',
                            colId: col.id,
                            colName: col.name,
                            displayValue: `Qualsiasi valore in "${col.name}"`,
                            realValue: '*EXISTS*', 
                            colorClass: 'default-color'
                        });
                    }
                }

                // 2. Estrazione e risoluzione dei valori unici (con decodifica delle relazioni)
                let uniqueValuesMap = new Map(); // Mappa: realValue -> displayValue
                
                if (col.type === 'select' || col.type === 'multi-select') {
                    (propsDb.selectOptions[col.id] || []).forEach(v => {
                        const sVal = String(v);
                        uniqueValuesMap.set(sVal, sVal);
                    });
                }

                propsDb.rows.forEach(r => {
                    let val = r.cells[col.id];
                    if (val === undefined || val === null || val === '') return;
                    
                    if (col.type === 'checkbox') {
                        const boolLabel = val === true ? 'Sì (Spuntato)' : 'No (Vuoto)';
                        uniqueValuesMap.set(val === true, boolLabel);
                    } else if (col.type === 'relation' || col.type === 'relation_backlink') {
                        // Risoluzione semantica degli ID: mostra i titoli e nasconde 'sys_r_*'
                        if (typeof AdvancedTable !== 'undefined' && typeof AdvancedTable.resolveRelationDetails === 'function') {
                            const details = AdvancedTable.resolveRelationDetails(col, val);
                            details.forEach(item => {
                                if (item.id && item.name && item.name !== 'Orfano') {
                                    uniqueValuesMap.set(item.id, item.name);
                                }
                            });
                        }
                    } else if (Array.isArray(val)) {
                        val.forEach(v => {
                            const sVal = String(v);
                            uniqueValuesMap.set(sVal, sVal);
                        });
                    } else {
                        const sVal = String(val);
                        uniqueValuesMap.set(sVal, sVal);
                    }
                });

                // 3. Ricerca sui VALORI RISOLTI DELLA COLONNA
                uniqueValuesMap.forEach((displayVal, realVal) => {
                    const strToSearch = String(displayVal).toLowerCase();

                    if (strToSearch.includes(lowerTerm)) {
                        let colorClass = 'default-color';
                        if (['select', 'multi-select'].includes(col.type) && propsDb.selectColors && propsDb.selectColors[col.id]) {
                            colorClass = propsDb.selectColors[col.id][realVal] || 'default-color';
                        }

                        const isAlreadyActive = AppState.activePropertyFilters && AppState.activePropertyFilters.some(f => f.colId === col.id && String(f.realValue) === String(realVal));
                        if (isAlreadyActive) return;

                        suggestions.push({
                            type: 'value',
                            colId: col.id,
                            colName: col.name,
                            displayValue: displayVal,
                            realValue: realVal,
                            colorClass: colorClass
                        });
                    }
                });
            });

            if (suggestions.length === 0) return;

            let popup = document.getElementById('sidebar-filter-autocomplete-portal');
            if (!popup) {
                popup = document.createElement('div');
                popup.id = 'sidebar-filter-autocomplete-portal';
                popup.className = 'adv-filter-autocomplete';
                popup.style.position = 'fixed';
                popup.style.zIndex = '99999';
                document.body.appendChild(popup);
            }

            const rect = inputEl.getBoundingClientRect();
            popup.style.top = rect.bottom + 5 + 'px';
            popup.style.left = rect.left + 'px';
            popup.style.width = rect.width + 'px';

            let html = '<div style="font-size:0.7rem; color:var(--text-secondary); padding:4px 8px; font-weight:bold; text-transform:uppercase;">Suggerimenti Proprietà:</div>';
            
            // Limitiamo a max 15 suggerimenti visivi
            suggestions.slice(0, 15).forEach((sug) => {
                const safeDisplayValue = String(sug.displayValue).replace(/"/g, '&quot;').replace(/'/g, "\\'");
                const safeRealValue = typeof sug.realValue === 'string' ? sug.realValue.replace(/"/g, '&quot;').replace(/'/g, "\\'") : sug.realValue;
                const safeColName = sug.colName.replace(/'/g, "\\'");

                if (sug.type === 'column') {
                    html += `
                        <div class="adv-filter-autocomplete-item" style="display:flex; align-items:center; gap:8px;" onmousedown="event.preventDefault(); SidebarManager.SearchAutocomplete.select('${sug.colId}', '${safeRealValue}', '${safeColName}', '🏷️ ${safeColName}')">
                            <span style="color:var(--text-primary); font-weight:bold; font-size:0.8rem;">🏷️ ${sug.colName}</span>
                            <span style="font-size:0.75rem; color:var(--text-secondary); opacity:0.7;">(Mostra note con questo campo compilato)</span>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="adv-filter-autocomplete-item" style="display:flex; align-items:center; gap:8px;" onmousedown="event.preventDefault(); SidebarManager.SearchAutocomplete.select('${sug.colId}', '${safeRealValue}', '${safeColName}', '${safeDisplayValue}')">
                            <span class="adv-select-pill ${sug.colorClass}" style="margin:0; padding:2px 6px;">${String(sug.displayValue).replace(/</g, '&lt;')}</span>
                            <span style="font-size:0.75rem; color:var(--text-secondary); opacity:0.7;">in ${sug.colName}</span>
                        </div>
                    `;
                }
            });

            popup.innerHTML = html;
            popup.style.display = 'block';
        },

        hide: (reason = 'Sconosciuta') => {
            const popup = document.getElementById('sidebar-filter-autocomplete-portal');
            if (popup && popup.style.display !== 'none') {
                popup.style.display = 'none';
            }
        },

        scheduleHide: () => {
            clearTimeout(SidebarManager.SearchAutocomplete._hideTimer);
            SidebarManager.SearchAutocomplete._hideTimer = setTimeout(() => {
                SidebarManager.SearchAutocomplete.hide();
            }, 250);
        },

        select: (colId, realValue, colName, visualPillText) => {
            const inputEl = document.getElementById('searchInput');
            if (inputEl) {
                inputEl.value = '';
                inputEl.focus();
            }

            if (!AppState.activePropertyFilters) AppState.activePropertyFilters = [];
            
            if (realValue === 'true') realValue = true;
            if (realValue === 'false') realValue = false;

            const isAlreadyActive = AppState.activePropertyFilters.some(f => f.colId === colId && f.realValue === realValue);
            
            if (!isAlreadyActive) {
                const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
                const colorClass = (propsDb && propsDb.selectColors && propsDb.selectColors[colId] && propsDb.selectColors[colId][realValue]) ? propsDb.selectColors[colId][realValue] : 'default-color';
                
                // Formato standard conciso: "Proprietà: Valore" oppure "🏷️ Proprietà" se *EXISTS*
                const formattedVisualText = realValue === '*EXISTS*' 
                    ? `🏷️ ${colName}` 
                    : `${colName}: ${visualPillText.replace(/^[🏷️\s]+/, '')}`;

                AppState.activePropertyFilters.push({ 
                    colId: colId, 
                    realValue: realValue, 
                    colName: colName,
                    visualText: formattedVisualText,
                    colorClass: colorClass 
                });
            }

            SidebarManager.SearchAutocomplete.hide('Selezione Effettuata');
            
            if (typeof EventsGlobal !== 'undefined' && typeof EventsGlobal._triggerSearchUpdate === 'function') {
                EventsGlobal._triggerSearchUpdate();
            }
        },

        remove: (index) => {
            if (AppState.activePropertyFilters && AppState.activePropertyFilters.length > index) {
                AppState.activePropertyFilters.splice(index, 1);
                
                if (typeof EventsGlobal !== 'undefined' && typeof EventsGlobal._triggerSearchUpdate === 'function') {
                    EventsGlobal._triggerSearchUpdate();
                }
                
                const inputEl = document.getElementById('searchInput');
                if (inputEl) inputEl.focus();
            }
        },

        updateFilterValue: (index, newValue, displayValue, newColorClass) => {
            if (!AppState.activePropertyFilters || !AppState.activePropertyFilters[index]) return;

            const filter = AppState.activePropertyFilters[index];
            filter.realValue = newValue;
            filter.colorClass = newColorClass || 'default-color';
            filter.visualText = newValue === '*EXISTS*' 
                ? `🏷️ ${filter.colName}` 
                : `${filter.colName}: ${displayValue}`;

            SidebarManager.SearchAutocomplete.renderPills();

            if (typeof EventsGlobal !== 'undefined' && typeof EventsGlobal._triggerSearchUpdate === 'function') {
                EventsGlobal._triggerSearchUpdate();
            }

            const inputEl = document.getElementById('searchInput');
            if (inputEl) inputEl.focus();
        },

        openPillMenu: (e, filterIndex, anchorId) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }

            if (!AppState.activePropertyFilters || !AppState.activePropertyFilters[filterIndex]) return;
            const filter = AppState.activePropertyFilters[filterIndex];

            const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
            const col = propsDb && propsDb.columns ? propsDb.columns.find(c => c.id === filter.colId) : null;
            const colName = col ? col.name : filter.colName;

            const chk = '<span style="color:var(--accent-color); font-weight:bold; margin-left:auto;">✓</span>';
            const menuItems = [
                {
                    type: 'custom',
                    html: `<div class="adv-dropdown-title" style="padding:2px 4px 6px 4px; border-bottom:1px solid var(--border-color); margin-bottom:4px;">Proprietà: <b>${colName}</b></div>`
                },
                {
                    label: `Qualsiasi valore (*EXISTS*)` + (filter.realValue === '*EXISTS*' ? chk : ''),
                    onClick: () => {
                        SidebarManager.SearchAutocomplete.updateFilterValue(filterIndex, '*EXISTS*', colName, 'default-color');
                    }
                },
                { type: 'divider' }
            ];

            if (col && col.type === 'checkbox') {
                const isTrue = filter.realValue === true;
                const isFalse = filter.realValue === false;
                menuItems.push(
                    {
                        label: 'Sì (Spuntato)' + (isTrue ? chk : ''),
                        onClick: () => SidebarManager.SearchAutocomplete.updateFilterValue(filterIndex, true, 'Sì', 'default-color')
                    },
                    {
                        label: 'No (Vuoto)' + (isFalse ? chk : ''),
                        onClick: () => SidebarManager.SearchAutocomplete.updateFilterValue(filterIndex, false, 'No', 'default-color')
                    }
                );
            } else if (col && (col.type === 'select' || col.type === 'multi-select')) {
                let options = Array.from(new Set(propsDb.selectOptions[col.id] || []));
                
                // Raccoglie anche eventuali valori già presenti nelle righe
                if (propsDb.rows) {
                    propsDb.rows.forEach(r => {
                        let v = r.cells[col.id];
                        if (Array.isArray(v)) v.forEach(item => { if (item) options.push(String(item)); });
                        else if (v) options.push(String(v));
                    });
                    options = Array.from(new Set(options));
                }

                options.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));

                if (options.length === 0) {
                    menuItems.push({
                        type: 'custom',
                        html: '<div style="font-size:0.75rem; color:var(--text-secondary); padding:4px 8px; font-style:italic;">Nessun valore disponibile.</div>'
                    });
                } else {
                    options.forEach(opt => {
                        const isSelected = String(filter.realValue) === String(opt);
                        const colorClass = propsDb.selectColors && propsDb.selectColors[col.id] ? propsDb.selectColors[col.id][opt] || 'default-color' : 'default-color';
                        menuItems.push({
                            label: `<span class="adv-select-pill ${colorClass}" style="margin:0; padding:2px 6px;">${String(opt).replace(/</g, '&lt;')}</span>` + (isSelected ? chk : ''),
                            onClick: () => {
                                SidebarManager.SearchAutocomplete.updateFilterValue(filterIndex, opt, opt, colorClass);
                            }
                        });
                    });
                }
            } else if (col && (col.type === 'relation' || col.type === 'relation_backlink')) {
                // Risoluzione semantica delle relazioni nel menu della pillola
                const relMap = new Map();

                // 1. Raccoglie i target già associati nei record
                if (propsDb.rows && typeof AdvancedTable !== 'undefined' && AdvancedTable.resolveRelationDetails) {
                    propsDb.rows.forEach(r => {
                        let v = r.cells[col.id];
                        if (v) {
                            const details = AdvancedTable.resolveRelationDetails(col, v);
                            details.forEach(item => {
                                if (item.id && item.name && item.name !== 'Orfano') {
                                    relMap.set(item.id, item.name);
                                }
                            });
                        }
                    });
                }

                // 2. Raccoglie tutti i record disponibili dal database di destinazione
                const targetDbId = col.type === 'relation' ? col.targetTableId : col.linkedTableId;
                const targetDb = targetDbId && typeof AdvancedTable !== 'undefined' ? AdvancedTable.getTableState(targetDbId) : null;
                
                if (targetDb && targetDb.rows && typeof AdvancedTable !== 'undefined' && AdvancedTable.resolveRelationDetails) {
                    targetDb.rows.forEach(tRow => {
                        const details = AdvancedTable.resolveRelationDetails(col, [tRow.id]);
                        if (details.length > 0 && details[0].name && details[0].name !== 'Orfano') {
                            relMap.set(tRow.id, details[0].name);
                        }
                    });
                }

                const sortedRelations = Array.from(relMap.entries()).sort((a, b) => 
                    a[1].localeCompare(b[1], undefined, { numeric: true, sensitivity: 'base' })
                );

                if (sortedRelations.length === 0) {
                    menuItems.push({
                        type: 'custom',
                        html: '<div style="font-size:0.75rem; color:var(--text-secondary); padding:4px 8px; font-style:italic;">Nessun record collegato trovato.</div>'
                    });
                } else {
                    sortedRelations.forEach(([relId, relName]) => {
                        const isSelected = String(filter.realValue) === String(relId);
                        menuItems.push({
                            label: `<span class="adv-select-pill default-color" style="margin:0; padding:2px 6px;">${UI.escapeHTML(relName)}</span>` + (isSelected ? chk : ''),
                            onClick: () => {
                                SidebarManager.SearchAutocomplete.updateFilterValue(filterIndex, relId, relName, 'default-color');
                            }
                        });
                    });
                }
            } else {
                // Per campi di tipo testo, data, numero: estrae i valori distinti presenti nei record
                let distinctVals = new Set();
                if (propsDb && propsDb.rows) {
                    propsDb.rows.forEach(r => {
                        let v = r.cells[filter.colId];
                        if (v !== undefined && v !== null && v !== '') {
                            if (typeof v === 'object' && v.start) distinctVals.add(v.start);
                            else distinctVals.add(String(v));
                        }
                    });
                }

                const valArray = Array.from(distinctVals).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

                if (valArray.length === 0) {
                    menuItems.push({
                        type: 'custom',
                        html: '<div style="font-size:0.75rem; color:var(--text-secondary); padding:4px 8px; font-style:italic;">Nessun valore memorizzato.</div>'
                    });
                } else {
                    valArray.forEach(val => {
                        const isSelected = String(filter.realValue) === String(val);
                        menuItems.push({
                            label: `${String(val).replace(/</g, '&lt;')}` + (isSelected ? chk : ''),
                            onClick: () => {
                                SidebarManager.SearchAutocomplete.updateFilterValue(filterIndex, val, val, 'default-color');
                            }
                        });
                    });
                }
            }

            UI.Menu.buildContextMenu(anchorId, menuItems);

            // Ottimizzazione compatta specifica: riduce il padding a 1px solo per le righe di questo menu
            const menuEl = document.querySelector('.adv-dropdown.adv-context-menu:last-child');
            if (menuEl) {
                menuEl.querySelectorAll('.adv-menu-item').forEach(el => {
                    el.style.padding = '1px';
                    el.style.marginBottom = '1px';
                });
            }
        },

        renderPills: () => {
            const container = document.getElementById('activeSearchFilters');
            if (!container) return;

            if (!AppState.activePropertyFilters || AppState.activePropertyFilters.length === 0) {
                container.innerHTML = '';
                return;
            }

            let html = '';
            AppState.activePropertyFilters.forEach((filter, idx) => {
                const safeTitle = String(filter.visualText).replace(/"/g, '&quot;');
                const anchorId = `active-filter-pill-${idx}`;

                html += `
                    <span id="${anchorId}" class="adv-select-pill ${filter.colorClass || 'default-color'}" 
                          style="display:inline-flex; align-items:center; gap:0; margin:0; padding:1px 2px 1px 6px; user-select:none; border-radius:12px;"
                          title="Filtro attivo: ${safeTitle}">
                        
                        <!-- Corpo cliccabile per aprire le opzioni -->
                        <span class="pill-body" style="cursor:pointer; display:inline-flex; align-items:center; gap:4px; padding:1px 2px;"
                              onclick="SidebarManager.SearchAutocomplete.openPillMenu(event, ${idx}, '${anchorId}')">
                            <span>${filter.visualText}</span>
                            <span style="opacity:0.6; font-size:0.65rem;">▾</span>
                        </span>

                        <!-- Separatore visivo ergonomico -->
                        <span style="width:1px; height:12px; background:currentColor; opacity:0.25; margin:0 4px;"></span>

                        <!-- Bersaglio isolato di eliminazione -->
                        <span class="pill-close" style="cursor:pointer; padding:1px 4px; opacity:0.6; font-weight:bold; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; transition:all 0.15s ease;"
                              onmouseenter="this.style.opacity='1'; this.style.backgroundColor='rgba(0,0,0,0.1)';"
                              onmouseleave="this.style.opacity='0.6'; this.style.backgroundColor='transparent';"
                              onclick="event.stopPropagation(); SidebarManager.SearchAutocomplete.remove(${idx})" 
                              title="Rimuovi questo filtro">✕</span>
                    </span>
                `;
            });
            container.innerHTML = html;
        }
    }
};