/**
 * AdvancedTablePivot.js
 * Motore di aggregazione dati (GROUP BY multiplo), serie temporali continue (Gap Filling)
 * e rendering delle Tabelle Pivot / Dashboard.
 * Gestione della propagazione di sola lettura per le citazioni e calcolo dell'Opacità Condizionale via CSS color-mix.
 * Risoluzione relazioni tramite 'resolveRelationDetails' e precedenza isDateCol sulle aggregazioni MAX/MIN.
 * Supporto all'ordinamento rapido su th con ondblclick per tabelle pivot.
 * Preservazione dell'altezza reale del contenitore grafico per evitare sbalzi verticali durante gli aggiornamenti.
 * Motore dedicato buildTimeSeriesChartData per grafici temporali continui con granularità, finestre e limite di sicurezza.
 */

const AdvancedPivot = {
    _lastChartHeights: {},

    _isDateColumnType: (colDef) => {
        return !!(colDef && ['date', 'datetime', 'created_time', 'last_edited_time'].includes(colDef.type));
    },

    _extractDateObj: (val, colType = 'date') => {
        if (val === undefined || val === null || val === '') return null;

        let raw = val;
        if (typeof raw === 'object') {
            raw = raw.start || raw.end || '';
        }
        if (raw === '' || raw === null || raw === undefined) return null;

        if (typeof raw === 'number' || (typeof raw === 'string' && /^\d{11,}$/.test(raw.trim()))) {
            const d = new Date(Number(raw));
            return isNaN(d.getTime()) ? null : d;
        }

        const str = String(raw).trim();
        if (!str) return null;

        // ISO puro YYYY-MM-DD: costruito in ora locale per evitare slittamenti UTC su fusi negativi
        const isoDateOnly = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoDateOnly) {
            const d = new Date(parseInt(isoDateOnly[1], 10), parseInt(isoDateOnly[2], 10) - 1, parseInt(isoDateOnly[3], 10));
            return isNaN(d.getTime()) ? null : d;
        }

        // Formato europeo DD/MM/YYYY [HH:mm]
        if (str.includes('/')) {
            const parts = str.split(/\s+/);
            const dParts = parts[0].split('/');
            if (dParts.length === 3 && dParts[2].length === 4) {
                const yyyy = parseInt(dParts[2], 10);
                const mm = parseInt(dParts[1], 10) - 1;
                const dd = parseInt(dParts[0], 10);
                let hh = 0, min = 0;
                if (parts[1] && parts[1].includes(':')) {
                    const tParts = parts[1].split(':');
                    hh = parseInt(tParts[0], 10) || 0;
                    min = parseInt(tParts[1], 10) || 0;
                }
                const d = new Date(yyyy, mm, dd, hh, min, 0, 0);
                return isNaN(d.getTime()) ? null : d;
            }
        }

        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
    },

    _getISOWeekInfo: (dateObj) => {
        const target = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
        const dayNr = (target.getDay() + 6) % 7;
        target.setDate(target.getDate() - dayNr + 3);
        const firstThursday = target.valueOf();
        const isoYear = target.getFullYear();
        target.setMonth(0, 1);
        if (target.getDay() !== 4) {
            target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
        }
        const weekNumber = 1 + Math.ceil((firstThursday - target) / 604800000);
        return { year: isoYear, week: weekNumber };
    },

    _getBucketStartDate: (dateObj, granularity) => {
        const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
        if (granularity === 'week') {
            const day = d.getDay();
            const diffToMonday = day === 0 ? -6 : 1 - day;
            d.setDate(d.getDate() + diffToMonday);
        } else if (granularity === 'month') {
            d.setDate(1);
        }
        return d;
    },

    _formatTimeBucket: (bucketDate, granularity, locale) => {
        const yyyy = bucketDate.getFullYear();
        const mm = String(bucketDate.getMonth() + 1).padStart(2, '0');
        const dd = String(bucketDate.getDate()).padStart(2, '0');

        if (granularity === 'month') {
            const monthShort = bucketDate.toLocaleString(locale, { month: 'short' });
            const capMonth = monthShort.charAt(0).toUpperCase() + monthShort.slice(1).replace('.', '');
            const monthLong = bucketDate.toLocaleString(locale, { month: 'long', year: 'numeric' });
            const capLong = monthLong.charAt(0).toUpperCase() + monthLong.slice(1);
            return {
                key: `${yyyy}-${mm}`,
                shortLabel: `${capMonth} '${String(yyyy).slice(-2)}`,
                fullLabel: capLong,
                monthLabel: `${capMonth}${bucketDate.getMonth() === 0 ? " '" + String(yyyy).slice(-2) : ''}`,
                sortMs: bucketDate.getTime()
            };
        }

        if (granularity === 'week') {
            const weekInfo = AdvancedPivot._getISOWeekInfo(bucketDate);
            const endOfWeek = new Date(bucketDate);
            endOfWeek.setDate(endOfWeek.getDate() + 6);
            const wNum = String(weekInfo.week).padStart(2, '0');
            const startFmt = `${dd}/${mm}`;
            const endFmt = `${String(endOfWeek.getDate()).padStart(2, '0')}/${String(endOfWeek.getMonth() + 1).padStart(2, '0')}/${endOfWeek.getFullYear()}`;
            return {
                key: `${weekInfo.year}-W${wNum}`,
                shortLabel: `S${wNum} (${startFmt})`,
                fullLabel: `W${wNum} (${startFmt} - ${endFmt})`,
                monthLabel: null,
                sortMs: bucketDate.getTime()
            };
        }

        const monthShort = bucketDate.toLocaleString(locale, { month: 'short' });
        const capMonth = monthShort.charAt(0).toUpperCase() + monthShort.slice(1).replace('.', '');
        const weekdayShort = bucketDate.toLocaleString(locale, { weekday: 'short' });
        const capDay = weekdayShort.charAt(0).toUpperCase() + weekdayShort.slice(1).replace('.', '');
        return {
            key: `${yyyy}-${mm}-${dd}`,
            shortLabel: `${bucketDate.getDate()} ${capMonth}`,
            fullLabel: `${capDay} ${dd}/${mm}/${yyyy}`,
            monthLabel: null,
            sortMs: bucketDate.getTime()
        };
    },

    _computeAggregationValue: (rowsList, agg, sourceState, renderCache) => {
        if (agg.type === 'count') {
            return rowsList.length;
        }
        const sourceCol = sourceState.columns.find(c => c.id === agg.sourceColId);
        const isNumberCol = sourceCol && ['number'].includes(sourceCol.type);
        const isDateCol = AdvancedPivot._isDateColumnType(sourceCol) || (sourceCol && sourceCol.type === 'time');

        let vals = rowsList.map(r => r.virtualCells[agg.sourceColId]).filter(v => v !== undefined && v !== null && v !== '');
        if (vals.length === 0) return 0;

        if (agg.type === 'sum' || agg.type === 'avg') {
            let nums = vals.map(v => parseFloat(String(v).replace(',', '.'))).filter(n => !isNaN(n));
            if (nums.length === 0) return 0;
            const total = nums.reduce((a, b) => a + b, 0);
            const res = agg.type === 'sum' ? total : (total / nums.length);
            return res % 1 !== 0 ? Math.round(res * 100) / 100 : res;
        }

        if (agg.type === 'max' || agg.type === 'min') {
            if (!isDateCol && (isNumberCol || vals.every(v => !isNaN(parseFloat(String(v).replace(',', '.')))))) {
                let nums = vals.map(v => parseFloat(String(v).replace(',', '.'))).filter(n => !isNaN(n));
                if (nums.length === 0) return 0;
                const res = agg.type === 'max' ? Math.max(...nums) : Math.min(...nums);
                return res % 1 !== 0 ? Math.round(res * 100) / 100 : res;
            }
        }
        return rowsList.length;
    },

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
            title: title || (I18n.t('adv_pivot.title_prefix') + (sourceState.title || I18n.t('editor.database'))),
            isPivot: true,
            sourceTableId: sourceId,
            groupBy: groupByArr,
            aggregations: aggregations,
            freeWidth: false,
            columns:[],
            filters: {},
            sorts: [],
            rows:[],
            chartConfig: chartConfig || { visible: false, height: 'medium' }
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
                name: sc ? sc.name : I18n.t('adv_pivot.default_group_prefix', { num: idx + 1 }),
                type: sc ? sc.type : 'text',
                sourceColId: sc ? sc.id : null,
                width: 150
            });
        });

        aggregations.forEach((agg, idx) => {
            pivotState.columns.push({
                id: 'agg_' + idx,
                name: agg.label || I18n.t('adv_pivot.default_metric'),
                type: (agg.type === 'list' || agg.type === 'count') ? 'text' : 'number',
                sourceColId: agg.sourceColId,
                width: 150
            });
        });

        AdvancedTable.setState(tableId, pivotState);
        AdvancedPivot.render(tableId);
        Store.triggerAutoSave();
    },

    buildTimeSeriesChartData: (tableId) => {
        const state = AdvancedTable.getState(tableId);
        if (!state || !state.isPivot || !state.groupBy || state.groupBy.length === 0) return null;

        const config = state.chartConfig || {};
        if (config.fillTimeGaps === false) return null;
        if (config.type === 'pie' || config.type === 'doughnut') return null;

        const sourceState = AdvancedTable.getTableState(state.sourceTableId);
        if (!sourceState || !Array.isArray(sourceState.columns)) return null;

        const dateColDef = sourceState.columns.find(c => c.id === state.groupBy[0]);
        if (!AdvancedPivot._isDateColumnType(dateColDef)) return null;

        const renderCache = {};
        let sourceRows = (sourceState.rows || []).map(r => AdvancedTable.buildVirtualRow(state.sourceTableId, r, sourceState, renderCache));

        // Applicazione coerente di eventuali filtri attivi sulla Pivot mappati sulle colonne sorgenti
        if (state.filters && Object.keys(state.filters).length > 0) {
            const mappedFilters = {};
            state.groupBy.forEach((gColId, idx) => {
                const fVal = state.filters['grp_' + idx];
                if (fVal && fVal.trim() !== '') {
                    mappedFilters[gColId] = fVal;
                }
            });
            if (Object.keys(mappedFilters).length > 0 && typeof AdvancedTable.filterRows === 'function') {
                sourceRows = AdvancedTable.filterRows(sourceRows, { columns: sourceState.columns, filters: mappedFilters });
            }
        }

        const locale = (typeof I18n !== 'undefined' && I18n.currentLang) ? I18n.currentLang : 'it';
        const seriesColId = state.groupBy.length >= 2 ? state.groupBy[1] : null;
        const seriesColDef = seriesColId ? sourceState.columns.find(c => c.id === seriesColId) : null;
        const emptyLabel = I18n.t('adv_pivot.empty_group_label');

        const datedItems = [];
        let unscheduledCount = 0;

        sourceRows.forEach(row => {
            let rawDate = row.virtualCells[dateColDef.id];
            if (dateColDef.type === 'created_time') rawDate = row.createdAt;
            else if (dateColDef.type === 'last_edited_time') rawDate = row.updatedAt;

            const dObj = AdvancedPivot._extractDateObj(rawDate, dateColDef.type);
            if (!dObj) {
                unscheduledCount++;
                return;
            }

            let sKey = '__single__';
            if (seriesColDef) {
                let sVal = row.virtualCells[seriesColId];
                if (seriesColDef.type === 'relation' || seriesColDef.type === 'relation_backlink') {
                    const details = AdvancedTable.resolveRelationDetails(seriesColDef, sVal, renderCache);
                    sKey = details.length > 0 ? details.map(d => d.name).join(', ') : emptyLabel;
                } else if (seriesColDef.type === 'created_time' || seriesColDef.type === 'last_edited_time') {
                    sKey = AdvancedTable.formatTime(sVal) || emptyLabel;
                } else if (seriesColDef.type === 'checkbox') {
                    sKey = sVal ? I18n.t('sidebar_filter.yes') : I18n.t('sidebar_filter.no');
                } else if (Array.isArray(sVal)) {
                    sKey = sVal.length > 0 ? sVal.join(', ') : emptyLabel;
                } else if (typeof sVal === 'object' && sVal !== null) {
                    sKey = AdvancedTable.getFormatDisplayValue(seriesColDef, sVal, renderCache) || emptyLabel;
                } else {
                    sKey = String(sVal || '').trim() || emptyLabel;
                }
            }

            datedItems.push({ row, dateObj: dObj, seriesKey: sKey });
        });

        const timeWindow = config.timeWindow || 'auto';
        const now = new Date();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let rangeStart = null;
        let rangeEnd = null;

        if (timeWindow === '30d') {
            rangeEnd = new Date(todayMidnight);
            rangeStart = new Date(todayMidnight);
            rangeStart.setDate(rangeStart.getDate() - 29);
        } else if (timeWindow === '90d') {
            rangeEnd = new Date(todayMidnight);
            rangeStart = new Date(todayMidnight);
            rangeStart.setDate(rangeStart.getDate() - 89);
        } else if (timeWindow === '365d') {
            rangeEnd = new Date(todayMidnight);
            rangeStart = new Date(todayMidnight);
            rangeStart.setDate(rangeStart.getDate() - 364);
        } else if (timeWindow === 'year') {
            rangeStart = new Date(now.getFullYear(), 0, 1);
            rangeEnd = new Date(now.getFullYear(), 11, 31);
        } else {
            // Finestra automatica sui dati disponibili
            if (datedItems.length === 0) {
                return {
                    buckets: [],
                    seriesKeys: [],
                    seriesColDef,
                    sourceState,
                    unscheduledCount,
                    effectiveGranularity: config.timeGranularity || 'day',
                    autoGranularityScaled: false
                };
            }
            let minMs = Infinity;
            let maxMs = -Infinity;
            datedItems.forEach(it => {
                const ms = new Date(it.dateObj.getFullYear(), it.dateObj.getMonth(), it.dateObj.getDate()).getTime();
                if (ms < minMs) minMs = ms;
                if (ms > maxMs) maxMs = ms;
            });
            rangeStart = new Date(minMs);
            rangeEnd = new Date(maxMs);
        }

        // Filtro dei record al di fuori della finestra temporale scelta
        const startLimitMs = rangeStart.getTime();
        const endLimitMs = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate(), 23, 59, 59, 999).getTime();
        const itemsInWindow = datedItems.filter(it => {
            const t = it.dateObj.getTime();
            return t >= startLimitMs && t <= endLimitMs;
        });

        let effectiveGranularity = config.timeGranularity || 'day';
        let autoGranularityScaled = false;
        const MAX_BUCKETS = 750;

        const estimateBuckets = (sDate, eDate, gran) => {
            const diffDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1);
            if (gran === 'day') return diffDays;
            if (gran === 'week') return Math.ceil(diffDays / 7);
            return Math.ceil(diffDays / 28);
        };

        if (effectiveGranularity === 'day' && estimateBuckets(rangeStart, rangeEnd, 'day') > MAX_BUCKETS) {
            effectiveGranularity = 'week';
            autoGranularityScaled = true;
        }
        if (effectiveGranularity === 'week' && estimateBuckets(rangeStart, rangeEnd, 'week') > MAX_BUCKETS) {
            effectiveGranularity = 'month';
            autoGranularityScaled = true;
        }

        // Generazione continua dell'asse temporale (Gap Filling)
        const buckets = [];
        const startBucket = AdvancedPivot._getBucketStartDate(rangeStart, effectiveGranularity);
        const endBucket = AdvancedPivot._getBucketStartDate(rangeEnd, effectiveGranularity);

        let iter = new Date(startBucket);
        let guard = 0;
        while (iter.getTime() <= endBucket.getTime() && guard < MAX_BUCKETS + 50) {
            guard++;
            const info = AdvancedPivot._formatTimeBucket(iter, effectiveGranularity, locale);

            if (effectiveGranularity === 'day') {
                const dayOfMonth = iter.getDate();
                const daysInCurrMonth = new Date(iter.getFullYear(), iter.getMonth() + 1, 0).getDate();
                const isFirstDay = dayOfMonth === 1;
                const isCleanOpeningMonth = buckets.length === 0 && (daysInCurrMonth - dayOfMonth >= 10);

                if (isFirstDay || isCleanOpeningMonth) {
                    const mShort = iter.toLocaleString(locale, { month: 'short' });
                    const capM = mShort.charAt(0).toUpperCase() + mShort.slice(1).replace('.', '');
                    info.monthLabel = (iter.getMonth() === 0 || buckets.length === 0)
                        ? `${capM} '${String(iter.getFullYear()).slice(-2)}`
                        : capM;
                }
            }

            buckets.push(info);

            if (effectiveGranularity === 'day') iter.setDate(iter.getDate() + 1);
            else if (effectiveGranularity === 'week') iter.setDate(iter.getDate() + 7);
            else iter.setMonth(iter.getMonth() + 1);
        }

        // Raggruppamento O(N) tramite Map indicizzata
        const bucketMap = new Map();
        const foundSeriesSet = new Set();

        itemsInWindow.forEach(it => {
            const bStart = AdvancedPivot._getBucketStartDate(it.dateObj, effectiveGranularity);
            const bInfo = AdvancedPivot._formatTimeBucket(bStart, effectiveGranularity, locale);
            foundSeriesSet.add(it.seriesKey);

            if (!bucketMap.has(bInfo.key)) bucketMap.set(bInfo.key, new Map());
            const sMap = bucketMap.get(bInfo.key);
            if (!sMap.has(it.seriesKey)) sMap.set(it.seriesKey, []);
            sMap.get(it.seriesKey).push(it.row);
        });

        // Ordinamento logico delle serie (Select segue l'ordine definito nelle opzioni del DB)
        let seriesKeys = [];
        if (!seriesColDef) {
            seriesKeys = ['__single__'];
        } else {
            const rawKeys = Array.from(foundSeriesSet);
            if ((seriesColDef.type === 'select' || seriesColDef.type === 'multi-select') && sourceState.selectOptions && Array.isArray(sourceState.selectOptions[seriesColId])) {
                const definedOrder = sourceState.selectOptions[seriesColId];
                definedOrder.forEach(opt => {
                    if (foundSeriesSet.has(opt)) seriesKeys.push(opt);
                });
                rawKeys.forEach(k => {
                    if (!seriesKeys.includes(k) && k !== emptyLabel) seriesKeys.push(k);
                });
                if (foundSeriesSet.has(emptyLabel)) seriesKeys.push(emptyLabel);
            } else {
                seriesKeys = rawKeys.sort((a, b) => {
                    if (a === emptyLabel) return 1;
                    if (b === emptyLabel) return -1;
                    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
                });
            }
        }

        // Calcolo delle matrici di valori per ogni metrica numerica
        const metrics = (state.aggregations || []).filter(a => a.type !== 'list');
        const targetAgg = metrics[0] || { type: 'count', sourceColId: dateColDef.id, label: I18n.t('adv_pivot.default_metric') };

        const datasetsData = {};
        if (seriesColDef) {
            // Modalità multi-serie (Stacked / Confronto serie per la metrica primaria)
            seriesKeys.forEach(sKey => {
                datasetsData[sKey] = buckets.map(b => {
                    const sMap = bucketMap.get(b.key);
                    const rowsList = sMap ? sMap.get(sKey) : null;
                    if (!rowsList || rowsList.length === 0) return 0;
                    return AdvancedPivot._computeAggregationValue(rowsList, targetAgg, sourceState, renderCache);
                });
            });
        } else {
            // Modalità singola serie (1 o più metriche nel tempo)
            metrics.forEach((agg, mIdx) => {
                const mKey = 'agg_' + mIdx;
                datasetsData[mKey] = buckets.map(b => {
                    const sMap = bucketMap.get(b.key);
                    const rowsList = sMap ? sMap.get('__single__') : null;
                    if (!rowsList || rowsList.length === 0) return 0;
                    return AdvancedPivot._computeAggregationValue(rowsList, agg, sourceState, renderCache);
                });
            });
        }

        return {
            buckets,
            seriesKeys,
            seriesColDef,
            sourceState,
            metrics,
            targetAgg,
            datasetsData,
            unscheduledCount,
            effectiveGranularity,
            autoGranularityScaled
        };
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
        const dateColsCache = {};

        state.groupBy.forEach(gColId => {
            const sc = sourceState.columns.find(c => c.id === gColId);
            if (sc) {
                if (sc.type === 'relation' && sc.targetTableId) {
                    const targetState = AdvancedTable.getTableState(sc.targetTableId);
                    if (targetState) relationCache[sc.id] = { state: targetState, colId: sc.targetColId, srcColDef: sc };
                }
                if (['date', 'datetime', 'time', 'created_time', 'last_edited_time'].includes(sc.type)) {
                    dateColsCache[sc.id] = sc.type;
                }
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

                if (dateColsCache[gColId] && val) {
                    const colType = dateColsCache[gColId];
                    if (colType === 'time') {
                        return String(val).trim() || I18n.t('adv_pivot.empty_group_label');
                    }
                    const d = AdvancedPivot._extractDateObj(val, colType);
                    if (d) {
                        const hasTime = (colType === 'datetime' || colType === 'created_time' || colType === 'last_edited_time') &&
                                        (typeof val === 'number' || String(val).includes('T') || String(val).includes(':'));
                        if (hasTime) {
                            return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                        }
                        return d.toLocaleDateString('it-IT');
                    }
                }

                if (Array.isArray(val)) return val.join(', ');
                return String(val || I18n.t('adv_pivot.empty_group_label')).trim() || I18n.t('adv_pivot.empty_group_label');
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
                            const d = AdvancedPivot._extractDateObj(v, sCol.type);
                            if (d) {
                                if (sCol.type === 'date') v = d.toLocaleDateString('it-IT');
                                else v = d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
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
                                const d = AdvancedPivot._extractDateObj(v, sourceCol.type);
                                return d ? d.getTime() : null;
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
                        <span><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.alertTriangle} ${I18n.t('adv_render.critical_error_lost')}</span></span>
                        <button class="adv-add-btn danger" style="border: 1px solid var(--danger-color); background: var(--bg-color);" onclick="document.getElementById('${tableId}').remove(); if(typeof Store !== 'undefined') Store.triggerAutoSave();"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.trash} ${I18n.t('adv_render.remove_broken_widget')}</span></button>
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
                    <span class="widget-drag-handle adv-drag-handle" title="${I18n.t('widget_manager.drag_to_move')}" draggable="true" style="${isEdit ? 'display:flex;' : 'display:none;'}">${Icons.dragHandle}</span>
                    <span class="widget-options-btn adv-drag-handle" title="${I18n.t('widget_manager.options')}" style="${isEdit ? 'display:flex;' : 'display:none;'}">${Icons.dotsVertical}</span>
                    <span class="widget-icon" style="display:inline-flex;"></span>
                    <span class="widget-title adv-table-title" contenteditable="${isEdit ? 'true' : 'false'}" style="flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 50px;">${I18n.t('common.loading')}</span>
                    <div class="widget-tools adv-tools" style="flex-shrink: 0;"></div>
                </div>
                <div class="widget-body"></div>
            `;
            bodyContainer = wrapper.querySelector('.widget-body');
        }

        if (!sourceState) {
            bodyContainer.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; color:var(--danger-color); border:1px dashed var(--danger-color); border-radius:6px; background:rgba(239, 68, 68, 0.05);">
                    <span><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.alertTriangle} ${I18n.t('adv_pivot.source_deleted_msg')}</span></span>
                    <button class="adv-add-btn danger" style="border: 1px solid var(--danger-color); background: var(--bg-color);" onclick="AdvancedTable.deleteTable('${tableId}', true)"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.trash} ${I18n.t('adv_menus.remove_pivot')}</span></button>
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

        // Firma della configurazione grafica corrente per preservare l'altezza senza sbalzi
        const chartHeightKey = state.chartConfig?.height || 'medium';
        const chartTypeKey = state.chartConfig?.type || 'bar';
        const chartLegendKey = state.chartConfig?.legendPos || 'bottom';
        const chartConfigSig = `${chartHeightKey}_${chartTypeKey}_${chartLegendKey}`;

        const existingChartContainer = document.getElementById(`chart_container_${tableId}`);
        if (hasChart && existingChartContainer && existingChartContainer.offsetHeight > 0) {
            const prevCached = AdvancedPivot._lastChartHeights[tableId];
            if (!prevCached || prevCached.sig === chartConfigSig) {
                AdvancedPivot._lastChartHeights[tableId] = {
                    sig: chartConfigSig,
                    height: existingChartContainer.offsetHeight
                };
            }
        }

        if (typeof WidgetManager !== 'undefined') {
            const tools =[];
            if (isEdit && typeof AdvancedTableCharts !== 'undefined') {
                tools.push({ icon: Icons.data, label: I18n.t('adv_pivot.chart_label'), title: I18n.t('adv_pivot.chart_tooltip'), active: hasChart, onClick: () => AdvancedTableCharts.openConfigMenu(tableId) });
            }
            
            tools.push({ id: `adv-sort-btn-${tableId}`, icon: Icons.sort, title: I18n.t('adv_pivot.sort_pivot_title'), active: hasSort, editOnly: false, onClick: AdvancedTable.openSortMenu });
            tools.push({ id: `adv-filter-btn-${tableId}`, icon: Icons.filter, title: I18n.t('adv_pivot.filter_pivot_title'), active: hasFilter, editOnly: false, onClick: AdvancedTable.openFilterMenu });

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
            const isPie = chartTypeKey === 'doughnut' || chartTypeKey === 'pie';
            let defaultMinH = isPie ? 380 : 400;
            if (chartHeightKey === 'small') defaultMinH = isPie ? 270 : 260;
            else if (chartHeightKey === 'large') defaultMinH = isPie ? 550 : 600;

            const cachedEntry = AdvancedPivot._lastChartHeights[tableId];
            const preservedH = (cachedEntry && cachedEntry.sig === chartConfigSig && cachedEntry.height > defaultMinH)
                ? cachedEntry.height
                : defaultMinH;

            html += `
                <div id="chart_container_${tableId}" style="width:100%; min-height:${preservedH}px; padding:15px; margin-bottom:5px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-color); box-sizing:border-box;">
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

                // Doppio click sull'intestazione esegue l'ordinamento rapido
                html += `<th data-col="${col.id}" style="width: ${col.width}px; background: ${isGroup ? 'rgba(37, 99, 235, 0.05)' : 'rgba(0,0,0,0.02)'}; ${isGroup ? 'color: var(--accent-color);' : ''} position: relative; cursor:pointer;" ${tooltipAttr} ondblclick="AdvancedTable.onThDblClick(event, '${tableId}', '${col.id}')">
                            <div class="adv-th-content">
                                <span style="display:flex; align-items:center; gap:5px;"><span style="display:inline-flex;">${icon}</span> ${col.name} ${commentIcon}</span>
                                <span>${sortIndicator}</span>
                            </div>
                            ${resizerHtml}
                         </th>`;
            });
            html += `</tr></thead><tbody>`;

            if (pivotRows.length === 0) {
                html += `<tr><td colspan="${state.columns.length}" style="text-align:center; color:var(--text-secondary); padding:20px;">${I18n.t('adv_pivot.no_results_filtered')}</td></tr>`;
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
                        const safeColName = String(col.name || '').replace(/"/g, '&quot;');

                        if (isGroup && row.rawGroupKeys[idx] !== I18n.t('adv_pivot.empty_group_label')) {
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
                                const rawArray = Array.isArray(row.rawGroupKeys[idx]) ? row.rawGroupKeys[idx] : [row.rawGroupKeys[idx]];
                                rawArray.forEach(v => { 
                                    const splitVals = typeof v === 'string' ? v.split(',').map(s => s.trim()) : [v];
                                    splitVals.forEach(sv => {
                                        if (sv) content += `<span class="adv-select-pill default-color">${UI.escapeHTML(sv)}</span> `;
                                    });
                                });
                                htmlVal = content || `<span class="adv-select-empty">${I18n.t('common.empty')}</span>`;
                            }
                        }
                        html += `<td style="${isGroup ? 'font-weight:bold; background: rgba(0,0,0,0.01);' : ''} width: ${col.width}px; max-width: ${col.width}px; word-wrap: break-word;" data-col-name="${safeColName}">${htmlVal}</td>`;
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
            const renderAndMeasure = () => {
                const containerId = `chart_container_${tableId}`;
                AdvancedTableCharts.renderChart(tableId, containerId, pivotRows, state);
                const el = document.getElementById(containerId);
                if (el && el.offsetHeight > 0) {
                    AdvancedPivot._lastChartHeights[tableId] = {
                        sig: chartConfigSig,
                        height: el.offsetHeight
                    };
                    el.style.minHeight = `${el.offsetHeight}px`;
                }
            };

            const containerEl = document.getElementById(`chart_container_${tableId}`);
            if (containerEl && containerEl.offsetWidth > 0) {
                renderAndMeasure();
            } else {
                requestAnimationFrame(renderAndMeasure);
            }
        }
    }
};