/**
 * sidebar-manager.js
 * Modulo dedicato alla gestione visiva e al ridimensionamento dell'albero di navigazione.
 * Integra il motore SearchAutocomplete per filtrare le note tramite Tag di Pagina.
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

    // MOTORE AUTOCOMPLETE PER LA RICERCA LATERALE
    SearchAutocomplete: {
        
        show: (inputEl, term) => {
            //console.log(`[AUTOCOMPLETE] Richiesta apertura per termine: "${term}"`);
            
            SidebarManager.SearchAutocomplete.hide('Reinizializzazione');

            if (!term || term.trim() === '') {
                //console.log("[AUTOCOMPLETE] Termine vuoto. Menu non mostrato.");
                return;
            }
            const lowerTerm = term.toLowerCase();

            const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
            if (!propsDb || !propsDb.columns || !propsDb.rows) {
                //console.log("[AUTOCOMPLETE] Nessun SYS_PROPERTIES_DB valido trovato.");
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

                // 2. Estrazione di tutti i valori unici presenti nelle righe per questa colonna
                let uniqueVals = new Set();
                
                if (col.type === 'select' || col.type === 'multi-select') {
                    (propsDb.selectOptions[col.id] || []).forEach(v => uniqueVals.add(String(v)));
                }

                propsDb.rows.forEach(r => {
                    let val = r.cells[col.id];
                    if (val === undefined || val === null || val === '') return;
                    
                    if (col.type === 'checkbox') {
                        uniqueVals.add(val === true ? 'Sì (Spuntato)' : 'No (Vuoto)');
                    } else if (Array.isArray(val)) {
                        val.forEach(v => uniqueVals.add(String(v)));
                    } else {
                        uniqueVals.add(String(val));
                    }
                });

                // 3. Ricerca sui VALORI DELLA COLONNA
                uniqueVals.forEach(val => {
                    if (val.toLowerCase().includes(lowerTerm)) {
                        let colorClass = 'default-color';
                        if (['select', 'multi-select'].includes(col.type) && propsDb.selectColors && propsDb.selectColors[col.id]) {
                            colorClass = propsDb.selectColors[col.id][val] || 'default-color';
                        }

                        let realVal = val;
                        if (col.type === 'checkbox') {
                            realVal = val === 'Sì (Spuntato)' ? true : false;
                        }

                        // Saltiamo i valori che l'utente ha già convertito in Pillole attive
                        const isAlreadyActive = AppState.activePropertyFilters && AppState.activePropertyFilters.some(f => f.colId === col.id && String(f.realValue) === String(realVal));
                        if (isAlreadyActive) return;

                        if (col.type === 'checkbox' && !val.toLowerCase().includes(lowerTerm)) return;

                        suggestions.push({
                            type: 'value',
                            colId: col.id,
                            colName: col.name,
                            displayValue: val,
                            realValue: realVal,
                            colorClass: colorClass
                        });
                    }
                });
            });

            if (suggestions.length === 0) {
                console.log("[AUTOCOMPLETE] Nessun suggerimento trovato per questo termine.");
                return;
            }

            console.log(`[AUTOCOMPLETE] Mostrati ${suggestions.length} suggerimenti.`);

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
                            <span class="adv-select-pill ${sug.colorClass}" style="margin:0; padding:2px 6px;">${sug.displayValue.replace(/</g, '&lt;')}</span>
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
                console.log(`[AUTOCOMPLETE] Chiusura popup. Causa: ${reason}`);
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
            console.log(`[AUTOCOMPLETE] Selezione filtro: ${colName} -> ${realValue}`);
            
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
                const propsDb = AppState.databases['SYS_PROPERTIES_DB'];
                const colorClass = (propsDb && propsDb.selectColors && propsDb.selectColors[colId] && propsDb.selectColors[colId][realValue]) ? propsDb.selectColors[colId][realValue] : 'default-color';
                
                AppState.activePropertyFilters.push({ 
                    colId: colId, 
                    realValue: realValue, 
                    colName: colName,
                    visualText: visualPillText,
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
                console.log(`[AUTOCOMPLETE] Rimozione filtro attivo all'indice ${index}`);
                AppState.activePropertyFilters.splice(index, 1);
                
                if (typeof EventsGlobal !== 'undefined' && typeof EventsGlobal._triggerSearchUpdate === 'function') {
                    EventsGlobal._triggerSearchUpdate();
                }
                
                const inputEl = document.getElementById('searchInput');
                if (inputEl) inputEl.focus();
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
                html += `
                    <span class="adv-select-pill ${filter.colorClass || 'default-color'}" style="display:inline-flex; align-items:center; gap:4px; margin:0; cursor:pointer;" onclick="SidebarManager.SearchAutocomplete.remove(${idx})" title="Rimuovi filtro: ${safeTitle}">
                        ${filter.visualText} <span style="opacity:0.5;">✕</span>
                    </span>
                `;
            });
            container.innerHTML = html;
        }
    }
};