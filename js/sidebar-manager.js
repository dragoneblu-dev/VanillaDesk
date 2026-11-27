/**
 * sidebar-manager.js
 * Modulo dedicato alla gestione visiva e al ridimensionamento dell'albero di navigazione.
 * Integra il motore SearchAutocomplete per filtrare le note tramite Tag e Proprietà di Pagina
 * e per accedere allo storico delle ultime 10 ricerche (SearchHistory).
 * SearchAutocomplete accetta ed elabora termini sia con prefisso '#' che puri, lasciando al
 * controller degli eventi la discrezione sull'apertura dell'overlay.
 * L'altezza e lo scorrimento del menu a tendina si adattano dinamicamente alla viewport.
 * Pillole dei filtri interattive con apertura menu a tendina sul corpo, visualizzazione delle
 * opzioni disponibili per proprietà e rimozione isolata su click della ✕.
 * Risoluzione semantica dei record collegati, date ad intervallo {start, end} e note_link.
 * Supporto al filtraggio per sole note senza tag/proprietà valorizzata (*EMPTY*) o presenti (*EXISTS*).
 * Selettore rapido di ambito (Stesso paragrafo, Stesso capitolo, Tutta la nota) per ricerche multi-termine con ';'.
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
            resizer.title = I18n.t('sidebar_filter.resizer_title');
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

    // STORICO DELLE ULTIME 10 RICERCHE TESTUALI CONSOLIDATE
    SearchHistory: {
        STORAGE_KEY: 'pronotes_search_history',
        MAX_ITEMS: 10,

        getAll: () => {
            try {
                const raw = localStorage.getItem(SidebarManager.SearchHistory.STORAGE_KEY);
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed.filter(q => typeof q === 'string' && q.trim().length > 0).slice(0, SidebarManager.SearchHistory.MAX_ITEMS) : [];
            } catch (_) {
                return [];
            }
        },

        add: (rawQuery) => {
            if (!rawQuery || typeof rawQuery !== 'string') return;
            const clean = rawQuery.replace(/\u00A0/g, ' ');
            if (clean.trim().length === 0) return;

            const current = SidebarManager.SearchHistory.getAll().filter(item => item !== clean);
            current.unshift(clean);
            const trimmed = current.slice(0, SidebarManager.SearchHistory.MAX_ITEMS);

            try {
                localStorage.setItem(SidebarManager.SearchHistory.STORAGE_KEY, JSON.stringify(trimmed));
            } catch (_) {}
        },

        remove: (index) => {
            const current = SidebarManager.SearchHistory.getAll();
            if (index >= 0 && index < current.length) {
                current.splice(index, 1);
                try {
                    localStorage.setItem(SidebarManager.SearchHistory.STORAGE_KEY, JSON.stringify(current));
                } catch (_) {}
            }
        },

        clear: () => {
            try {
                localStorage.removeItem(SidebarManager.SearchHistory.STORAGE_KEY);
            } catch (_) {}
        }
    },

    // MOTORE AUTOCOMPLETE E FILTRI A PILLOLA PER LA RICERCA LATERALE
    SearchAutocomplete: {
        _activeHistoryIndex: -1,

        // Formatta valori composti di tipo Date Range o Note Link; restituisce null per altri tipi
        _formatDateOrLinkValue: (col, val) => {
            if (['date', 'datetime'].includes(col?.type) || (typeof val === 'object' && val !== null && (val.start !== undefined || val.end !== undefined))) {
                if (typeof val === 'object' && val !== null) {
                    if (val.start && val.end) return `${val.start} ➔ ${val.end}`;
                    if (val.start) return val.start;
                    if (val.end) return `➔ ${val.end}`;
                    return '';
                }
                return String(val);
            }
            if (col?.type === 'note_link' || (typeof val === 'object' && val !== null && val.noteId !== undefined)) {
                if (typeof val === 'object' && val !== null) {
                    let linkTitle = val.title || '';
                    if (!linkTitle && val.noteId && typeof Store !== 'undefined') {
                        const tn = Store.getNote(val.noteId);
                        if (tn) linkTitle = tn.title;
                    }
                    return linkTitle;
                }
                return String(val);
            }
            return null;
        },

        // Estrae in una Map (realValue -> displayValue) tutti i valori univoci presenti per una colonna di SYS_PROPERTIES_DB
        _collectColumnValuesMap: (propsDb, col) => {
            const uniqueValuesMap = new Map();

            if (col.type === 'select' || col.type === 'multi-select') {
                (propsDb.selectOptions?.[col.id] || []).forEach(v => {
                    const sVal = String(v);
                    uniqueValuesMap.set(sVal, sVal);
                });
            }

            (propsDb.rows || []).forEach(r => {
                const val = r?.cells?.[col.id];
                if (val === undefined || val === null || val === '') return;

                if (col.type === 'checkbox') {
                    const boolLabel = val === true ? I18n.t('sidebar_filter.yes_checked') : I18n.t('sidebar_filter.no_empty');
                    uniqueValuesMap.set(val === true, boolLabel);
                } else if (col.type === 'relation' || col.type === 'relation_backlink') {
                    if (typeof AdvancedTable !== 'undefined' && typeof AdvancedTable.resolveRelationDetails === 'function') {
                        AdvancedTable.resolveRelationDetails(col, val).forEach(item => {
                            if (item.id && item.name && item.name !== 'Orfano') {
                                uniqueValuesMap.set(item.id, item.name);
                            }
                        });
                    }
                } else {
                    const formattedObj = SidebarManager.SearchAutocomplete._formatDateOrLinkValue(col, val);
                    if (formattedObj !== null) {
                        if (formattedObj) uniqueValuesMap.set(formattedObj, formattedObj);
                    } else if (Array.isArray(val)) {
                        val.forEach(v => {
                            if (v !== undefined && v !== null && v !== '') {
                                const sVal = String(v);
                                uniqueValuesMap.set(sVal, sVal);
                            }
                        });
                    } else {
                        const sVal = String(val);
                        uniqueValuesMap.set(sVal, sVal);
                    }
                }
            });

            return uniqueValuesMap;
        },

        _getOptionColorClass: (propsDb, col, realVal) => {
            if (['select', 'multi-select'].includes(col.type) && propsDb.selectColors && propsDb.selectColors[col.id]) {
                return propsDb.selectColors[col.id][realVal] || 'default-color';
            }
            return 'default-color';
        },

        _getOrCreatePortal: (inputEl) => {
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
            const margin = 10;
            const spaceBelow = window.innerHeight - (rect.bottom + 5) - margin;
            const spaceAbove = (rect.top - 5) - margin;

            popup.style.left = rect.left + 'px';
            popup.style.minWidth = rect.width + 'px';
            const availableSpace = Math.max(rect.width, window.innerWidth - rect.left - 15);
            const maxAllowedWidth = Math.min(rect.width + 200, availableSpace);
            popup.style.maxWidth = maxAllowedWidth + 'px';
            popup.style.width = 'max-content';
            popup.style.boxSizing = 'border-box';
            popup.style.overflowY = 'auto';
            popup.style.overflowX = 'hidden';

            if (spaceBelow >= 120 || spaceBelow >= spaceAbove) {
                popup.style.top = (rect.bottom + 5) + 'px';
                popup.style.bottom = 'auto';
                popup.style.maxHeight = Math.max(60, spaceBelow) + 'px';
            } else {
                popup.style.top = 'auto';
                popup.style.bottom = (window.innerHeight - rect.top + 5) + 'px';
                popup.style.maxHeight = Math.max(60, spaceAbove) + 'px';
            }

            popup.scrollTop = 0;
            return popup;
        },

        isHistoryOpen: () => {
            const popup = document.getElementById('sidebar-filter-autocomplete-portal');
            return !!(popup && popup.style.display === 'block' && popup.dataset.mode === 'history');
        },

        showHistory: (inputEl) => {
            if (!inputEl || inputEl.value !== '') {
                SidebarManager.SearchAutocomplete.hide();
                return;
            }

            const history = SidebarManager.SearchHistory.getAll();
            if (history.length === 0) {
                SidebarManager.SearchAutocomplete.hide();
                return;
            }

            const popup = SidebarManager.SearchAutocomplete._getOrCreatePortal(inputEl);
            popup.dataset.mode = 'history';
            SidebarManager.SearchAutocomplete._activeHistoryIndex = -1;

            const titleTxt = I18n.t('sidebar_filter.recent_searches_title');
            const clearTxt = I18n.t('sidebar_filter.clear_history');
            const removeItemTitle = I18n.t('sidebar_filter.remove_history_item');
            const searchIcon = (typeof Icons !== 'undefined' && (Icons.time || Icons.search)) ? (Icons.time || Icons.search) : '🕒';

            let html = `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px;">
                    <span style="font-size:0.7rem; color:var(--text-secondary); font-weight:bold; text-transform:uppercase;">${titleTxt}</span>
                    <span style="font-size:0.7rem; color:var(--text-secondary); cursor:pointer; opacity:0.8;"
                          onmouseenter="this.style.opacity='1'; this.style.color='var(--danger-color)';"
                          onmouseleave="this.style.opacity='0.8'; this.style.color='var(--text-secondary)';"
                          onmousedown="event.preventDefault(); event.stopPropagation(); SidebarManager.SearchAutocomplete.clearAllHistory();">${clearTxt}</span>
                </div>
            `;

            history.forEach((queryStr, idx) => {
                const safeQuery = (typeof UI !== 'undefined' && UI.escapeHTML) ? UI.escapeHTML(queryStr) : queryStr.replace(/</g, '&lt;');
                const jsEncoded = encodeURIComponent(queryStr).replace(/'/g, '%27');

                html += `
                    <div class="adv-filter-autocomplete-item history-item" data-history-idx="${idx}" data-query-enc="${jsEncoded}"
                         style="display:flex; align-items:center; justify-content:space-between; gap:8px;"
                         onmousedown="event.preventDefault(); SidebarManager.SearchAutocomplete.selectHistoryItem(decodeURIComponent(this.dataset.queryEnc || ''))">
                        <div style="display:flex; align-items:center; gap:6px; flex:1; min-width:0; overflow:hidden;">
                            <span style="opacity:0.6; display:inline-flex; flex-shrink:0;">${searchIcon}</span>
                            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeQuery}</span>
                        </div>
                        <span title="${removeItemTitle}"
                              style="opacity:0.5; font-size:0.75rem; padding:1px 4px; border-radius:3px; flex-shrink:0; cursor:pointer;"
                              onmouseenter="this.style.opacity='1'; this.style.color='var(--danger-color)';"
                              onmouseleave="this.style.opacity='0.5'; this.style.color='inherit';"
                              onmousedown="event.preventDefault(); event.stopPropagation(); SidebarManager.SearchAutocomplete.removeHistoryItem(${idx});">✕</span>
                    </div>
                `;
            });

            popup.innerHTML = html;
            popup.style.display = 'block';
        },

        navigateHistory: (delta) => {
            if (!SidebarManager.SearchAutocomplete.isHistoryOpen()) return false;
            const popup = document.getElementById('sidebar-filter-autocomplete-portal');
            const items = Array.from(popup.querySelectorAll('.history-item'));
            if (items.length === 0) return false;

            let nextIdx = SidebarManager.SearchAutocomplete._activeHistoryIndex + delta;
            if (nextIdx < 0) nextIdx = items.length - 1;
            if (nextIdx >= items.length) nextIdx = 0;

            SidebarManager.SearchAutocomplete._activeHistoryIndex = nextIdx;
            items.forEach((el, i) => {
                if (i === nextIdx) {
                    el.style.background = 'var(--item-hover)';
                    el.style.color = 'var(--accent-color)';
                    el.scrollIntoView({ block: 'nearest' });
                } else {
                    el.style.background = '';
                    el.style.color = '';
                }
            });
            return true;
        },

        confirmSelectedHistory: () => {
            if (!SidebarManager.SearchAutocomplete.isHistoryOpen()) return false;
            const idx = SidebarManager.SearchAutocomplete._activeHistoryIndex;
            if (idx < 0) return false;
            const popup = document.getElementById('sidebar-filter-autocomplete-portal');
            const activeItem = popup.querySelector(`.history-item[data-history-idx="${idx}"]`);
            if (!activeItem) return false;
            const queryStr = decodeURIComponent(activeItem.dataset.queryEnc || '');
            if (!queryStr) return false;
            SidebarManager.SearchAutocomplete.selectHistoryItem(queryStr);
            return true;
        },

        selectHistoryItem: (queryText) => {
            const inputEl = document.getElementById('searchInput');
            if (!inputEl) return;
            inputEl.value = queryText;
            SidebarManager.SearchAutocomplete.hide();
            SidebarManager.SearchHistory.add(queryText);

            if (typeof EventsGlobal !== 'undefined' && typeof EventsGlobal._executeSearchLogic === 'function') {
                AppState._currentHighlightIndex = -1;
                EventsGlobal._executeSearchLogic(inputEl, true);
            }
            inputEl.focus();
        },

        removeHistoryItem: (index) => {
            SidebarManager.SearchHistory.remove(index);
            const inputEl = document.getElementById('searchInput');
            if (inputEl) SidebarManager.SearchAutocomplete.showHistory(inputEl);
        },

        clearAllHistory: () => {
            SidebarManager.SearchHistory.clear();
            SidebarManager.SearchAutocomplete.hide();
        },

        // Raccoglie tutte le corrispondenze presenti nel database di sistema per un determinato valore di tag
        getMatchesForTag: (cleanTag) => {
            if (!cleanTag) return [];
            const lowerTag = cleanTag.trim().toLowerCase();

            const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
            if (!propsDb || !propsDb.columns || !propsDb.rows) return [];

            const matches = [];

            propsDb.columns.forEach(col => {
                if (col.id === 'sys_c_note') return;

                const uniqueValuesMap = SidebarManager.SearchAutocomplete._collectColumnValuesMap(propsDb, col);

                uniqueValuesMap.forEach((displayVal, realVal) => {
                    if (String(displayVal).toLowerCase() === lowerTag) {
                        matches.push({
                            type: 'value',
                            colId: col.id,
                            colName: col.name,
                            displayValue: displayVal,
                            realValue: realVal,
                            colorClass: SidebarManager.SearchAutocomplete._getOptionColorClass(propsDb, col, realVal)
                        });
                    }
                });
            });

            return matches;
        },

        show: (inputEl, term) => {
            if (!term || typeof term !== 'string' || term.trim() === '') {
                SidebarManager.SearchAutocomplete.hide('Termine vuoto');
                return;
            }

            // Normalizza il termine di ricerca eliminando l'eventuale marcatore '#' iniziale
            const cleanQuery = term.replace(/^#+/, '').trim();
            const lowerTerm = cleanQuery.toLowerCase();

            const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
            if (!propsDb || !propsDb.columns || !propsDb.rows) {
                SidebarManager.SearchAutocomplete.hide('Nessun DB proprietà');
                return;
            }

            let suggestions = [];

            propsDb.columns.forEach(col => {
                if (col.id === 'sys_c_note') return;

                // 1. Ricerca sul NOME DELLA COLONNA (Filtro *EXISTS*)
                if (!lowerTerm || col.name.toLowerCase().includes(lowerTerm)) {
                    const isExistsActive = AppState.activePropertyFilters && AppState.activePropertyFilters.some(f => f.colId === col.id && f.realValue === '*EXISTS*');
                    if (!isExistsActive) {
                        suggestions.push({
                            type: 'column_exists',
                            colId: col.id,
                            colName: col.name,
                            displayValue: I18n.t('sidebar_filter.any_value'),
                            realValue: '*EXISTS*', 
                            colorClass: 'default-color'
                        });
                    }
                }

                // 2. Estrazione e ricerca sui valori risolti della colonna
                const uniqueValuesMap = SidebarManager.SearchAutocomplete._collectColumnValuesMap(propsDb, col);

                uniqueValuesMap.forEach((displayVal, realVal) => {
                    const strToSearch = String(displayVal).toLowerCase();

                    if (!lowerTerm || strToSearch.includes(lowerTerm)) {
                        const isAlreadyActive = AppState.activePropertyFilters && AppState.activePropertyFilters.some(f => f.colId === col.id && String(f.realValue) === String(realVal));
                        if (isAlreadyActive) return;

                        suggestions.push({
                            type: 'value',
                            colId: col.id,
                            colName: col.name,
                            displayValue: displayVal,
                            realValue: realVal,
                            colorClass: SidebarManager.SearchAutocomplete._getOptionColorClass(propsDb, col, realVal)
                        });
                    }
                });
            });

            if (suggestions.length === 0) {
                SidebarManager.SearchAutocomplete.hide('Nessun suggerimento');
                return;
            }

            const popup = SidebarManager.SearchAutocomplete._getOrCreatePortal(inputEl);
            popup.dataset.mode = 'tags';
            SidebarManager.SearchAutocomplete._activeHistoryIndex = -1;

            let html = `<div style="font-size:0.7rem; color:var(--text-secondary); padding:4px 8px; font-weight:bold; text-transform:uppercase;">${I18n.t('sidebar_filter.suggestions_title')}</div>`;
            
            suggestions.forEach((sug) => {
                const safeDisplayValue = String(sug.displayValue).replace(/"/g, '&quot;').replace(/'/g, "\\'");
                const safeRealValue = typeof sug.realValue === 'string' ? sug.realValue.replace(/"/g, '&quot;').replace(/'/g, "\\'") : sug.realValue;
                const safeColName = sug.colName.replace(/'/g, "\\'");

                if (sug.type === 'column_exists') {
                    html += `
                        <div class="adv-filter-autocomplete-item" style="display:flex; align-items:center; gap:8px;" onmousedown="event.preventDefault(); SidebarManager.SearchAutocomplete.select('${sug.colId}', '${safeRealValue}', '${safeColName}', '${I18n.t('sidebar_filter.any')}')">
                            <span style="color:var(--text-primary); font-weight:bold; font-size:0.8rem;">🏷️ ${sug.colName}</span>
                            <span style="font-size:0.75rem; color:var(--text-secondary); opacity:0.7;">(${sug.displayValue})</span>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="adv-filter-autocomplete-item" style="display:flex; align-items:center; gap:8px;" onmousedown="event.preventDefault(); SidebarManager.SearchAutocomplete.select('${sug.colId}', '${safeRealValue}', '${safeColName}', '${safeDisplayValue}')">
                            <span class="adv-select-pill ${sug.colorClass}" style="margin:0; padding:2px 6px;">${String(sug.displayValue).replace(/</g, '&lt;')}</span>
                            <span style="font-size:0.75rem; color:var(--text-secondary); opacity:0.7;">${I18n.t('sidebar_filter.in_column', { colName: sug.colName })}</span>
                        </div>
                    `;
                }
            });

            popup.innerHTML = html;
            popup.style.display = 'block';
        },

        hide: (reason = 'Sconosciuta') => {
            const popup = document.getElementById('sidebar-filter-autocomplete-portal');
            SidebarManager.SearchAutocomplete._activeHistoryIndex = -1;
            if (popup && popup.style.display !== 'none') {
                popup.style.display = 'none';
                delete popup.dataset.mode;
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
                
                let formattedVisualText = '';
                if (realValue === '*EXISTS*') {
                    formattedVisualText = I18n.t('sidebar_filter.pill_any', { colName });
                } else if (realValue === '*EMPTY*') {
                    formattedVisualText = I18n.t('sidebar_filter.pill_empty', { colName });
                } else {
                    formattedVisualText = `${colName}: ${visualPillText.replace(/^[🏷️🚫\s]+/, '')}`;
                }

                AppState.activePropertyFilters.push({ 
                    colId: colId, 
                    realValue: realValue, 
                    colName: colName,
                    visualText: formattedVisualText,
                    colorClass: colorClass 
                });
            }

            SidebarManager.SearchAutocomplete.hide('Selezione Effettuata');
            SidebarManager.SearchAutocomplete.renderPills();
            
            if (typeof EventsGlobal !== 'undefined' && typeof EventsGlobal._triggerSearchUpdate === 'function') {
                EventsGlobal._triggerSearchUpdate();
            }
        },

        remove: (index) => {
            if (AppState.activePropertyFilters && AppState.activePropertyFilters.length > index) {
                AppState.activePropertyFilters.splice(index, 1);
                
                SidebarManager.SearchAutocomplete.renderPills();

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

            if (newValue === '*EXISTS*') {
                filter.visualText = I18n.t('sidebar_filter.pill_any', { colName: filter.colName });
            } else if (newValue === '*EMPTY*') {
                filter.visualText = I18n.t('sidebar_filter.pill_empty', { colName: filter.colName });
            } else {
                filter.visualText = `${filter.colName}: ${displayValue}`;
            }

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
                    html: `<div class="adv-dropdown-title" style="padding:2px 4px 6px 4px; border-bottom:1px solid var(--border-color); margin-bottom:4px;">${I18n.t('sidebar_filter.property_label', { colName })}</div>`
                },
                {
                    label: I18n.t('sidebar_filter.option_any') + (filter.realValue === '*EXISTS*' ? chk : ''),
                    onClick: () => {
                        SidebarManager.SearchAutocomplete.updateFilterValue(filterIndex, '*EXISTS*', colName, 'default-color');
                    }
                },
                {
                    label: I18n.t('sidebar_filter.option_empty') + (filter.realValue === '*EMPTY*' ? chk : ''),
                    onClick: () => {
                        SidebarManager.SearchAutocomplete.updateFilterValue(filterIndex, '*EMPTY*', colName, 'default-color');
                    }
                },
                { type: 'divider' }
            ];

            if (col && col.type === 'checkbox') {
                const isTrue = filter.realValue === true;
                const isFalse = filter.realValue === false;
                menuItems.push(
                    {
                        label: I18n.t('sidebar_filter.yes_checked') + (isTrue ? chk : ''),
                        onClick: () => SidebarManager.SearchAutocomplete.updateFilterValue(filterIndex, true, I18n.t('sidebar_filter.yes'), 'default-color')
                    },
                    {
                        label: I18n.t('sidebar_filter.no_empty') + (isFalse ? chk : ''),
                        onClick: () => SidebarManager.SearchAutocomplete.updateFilterValue(filterIndex, false, I18n.t('sidebar_filter.no'), 'default-color')
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
                        html: `<div style="font-size:0.75rem; color:var(--text-secondary); padding:4px 8px; font-style:italic;">${I18n.t('sidebar_filter.no_values_available')}</div>`
                    });
                } else {
                    options.forEach(opt => {
                        const isSelected = String(filter.realValue) === String(opt);
                        const colorClass = SidebarManager.SearchAutocomplete._getOptionColorClass(propsDb, col, opt);
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
                        html: `<div style="font-size:0.75rem; color:var(--text-secondary); padding:4px 8px; font-style:italic;">${I18n.t('sidebar_filter.no_linked_records')}</div>`
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
                // Per campi di tipo testo, data, numero, note_link: estrae i valori distinti gestendo correttamente gli oggetti
                let distinctVals = new Map();
                if (propsDb && propsDb.rows) {
                    propsDb.rows.forEach(r => {
                        let v = r.cells[filter.colId];
                        if (v === undefined || v === null || v === '') return;

                        const formattedObj = SidebarManager.SearchAutocomplete._formatDateOrLinkValue(col, v);
                        if (formattedObj !== null) {
                            if (formattedObj) distinctVals.set(formattedObj, formattedObj);
                        } else if (typeof v === 'object' && v !== null) {
                            const sVal = JSON.stringify(v);
                            distinctVals.set(sVal, sVal);
                        } else {
                            const sVal = String(v);
                            distinctVals.set(sVal, sVal);
                        }
                    });
                }

                const sortedEntries = Array.from(distinctVals.entries()).sort((a, b) => 
                    a[1].localeCompare(b[1], undefined, { numeric: true, sensitivity: 'base' })
                );

                if (sortedEntries.length === 0) {
                    menuItems.push({
                        type: 'custom',
                        html: `<div style="font-size:0.75rem; color:var(--text-secondary); padding:4px 8px; font-style:italic;">${I18n.t('sidebar_filter.no_values_stored')}</div>`
                    });
                } else {
                    sortedEntries.forEach(([realVal, displayVal]) => {
                        const isSelected = String(filter.realValue) === String(realVal);
                        menuItems.push({
                            label: `${String(displayVal).replace(/</g, '&lt;')}` + (isSelected ? chk : ''),
                            onClick: () => {
                                SidebarManager.SearchAutocomplete.updateFilterValue(filterIndex, realVal, displayVal, 'default-color');
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

        setMultiSearchScope: (scope) => {
            if (AppState.multiSearchScope === scope) return;
            AppState.multiSearchScope = scope;
            SidebarManager.SearchAutocomplete.renderPills();
            if (typeof EventsGlobal !== 'undefined' && typeof EventsGlobal._triggerSearchUpdate === 'function') {
                EventsGlobal._triggerSearchUpdate();
            }
        },

        renderPills: () => {
            const container = document.getElementById('activeSearchFilters');
            if (!container) return;

            const searchTerms = (typeof AppState !== 'undefined' && typeof AppState.parseSearchTerms === 'function')
                ? AppState.parseSearchTerms(AppState.searchFilter)
                : [];
            const isMultiTerm = searchTerms.length > 1;
            const hasPropFilters = AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0;

            if (!hasPropFilters && !isMultiTerm) {
                container.innerHTML = '';
                return;
            }

            let html = '';

            // Pillole di selezione ambito per ricerca multi-termine (';') con tooltip personalizzato coerente col tema
            if (isMultiTerm) {
                const curScope = AppState.multiSearchScope || 'paragraph';
                const scopes = [
                    { id: 'paragraph', label: I18n.t('tree.scope_paragraph'), title: I18n.t('tree.scope_paragraph_title') },
                    { id: 'chapter', label: I18n.t('tree.scope_chapter'), title: I18n.t('tree.scope_chapter_title') },
                    { id: 'note', label: I18n.t('tree.scope_note'), title: I18n.t('tree.scope_note_title') }
                ];

                html += `<div style="display:flex; flex-wrap:wrap; gap:4px; width:100%; margin-bottom:${hasPropFilters ? '4px' : '0'};">`;
                scopes.forEach(sc => {
                    const isActive = curScope === sc.id;
                    const activeStyle = isActive
                        ? 'background:var(--item-active); color:var(--accent-color); border:1px solid var(--accent-color); font-weight:600;'
                        : 'background:transparent; color:var(--text-secondary); border:1px solid var(--border-color); opacity:0.8;';
                    const safeTooltip = (typeof UI !== 'undefined' && UI.escapeHTML)
                        ? UI.escapeHTML(sc.title)
                        : String(sc.title).replace(/"/g, '&quot;');
                    html += `
                        <span class="adv-select-pill" data-tooltip="${safeTooltip}" style="cursor:pointer; margin:0; padding:1px 7px; font-size:0.72rem; border-radius:10px; user-select:none; ${activeStyle}"
                              onclick="SidebarManager.SearchAutocomplete.setMultiSearchScope('${sc.id}')">
                            ${sc.label}
                        </span>
                    `;
                });
                html += `</div>`;
            }

            if (hasPropFilters) {
                AppState.activePropertyFilters.forEach((filter, idx) => {
                    const safeTitle = String(filter.visualText).replace(/"/g, '&quot;');
                    const anchorId = `active-filter-pill-${idx}`;

                    html += `
                        <span id="${anchorId}" class="adv-select-pill ${filter.colorClass || 'default-color'}" 
                              style="display:inline-flex; align-items:center; gap:0; margin:0; padding:1px 2px 1px 6px; user-select:none; border-radius:12px;"
                              title="${I18n.t('sidebar_filter.active_filter_tooltip', { title: safeTitle })}">
                            
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
                                  title="${I18n.t('sidebar_filter.remove_filter_tooltip')}">✕</span>
                        </span>
                    `;
                });
            }

            container.innerHTML = html;
        }
    }
};