/**
 * advanced-table-query.js
 * Motore di Query, Algebra degli Intervalli Temporali, Ordinamento e Filtraggio Dati.
 * Sottomodulo di AdvancedTable.
 * Include:
 * - Parsing e normalizzazione intervalli di date (_parseDateStringToMs, _extractIntervalFromValue).
 * - Motore centrale di ordinamento multi-colonna (sortRows).
 * - Motore centrale di filtraggio dati con ricerca rapida universale (filterRows).
 */

Object.assign(AdvancedTable, {

    // Helper interno per l'estrazione millimetrica degli intervalli temporali in millisecondi
    _parseDateStringToMs: (str) => {
        if (!str && str !== 0) return NaN;
        str = String(str).trim();
        if (str.includes('/')) {
            const parts = str.split(' ');
            const dParts = parts[0].split('/');
            if (dParts.length === 3) {
                const iso = `${dParts[2]}-${dParts[1]}-${dParts[0]}` + (parts[1] ? `T${parts[1]}` : '');
                const d = new Date(iso);
                if (!isNaN(d.getTime())) return d.getTime();
            }
        }
        if (/^\d{11,}$/.test(str)) {
            return Number(str);
        }
        const d = new Date(str);
        return isNaN(d.getTime()) ? NaN : d.getTime();
    },

    _extractIntervalFromValue: (val, colDef = null, row = null, isPivotContext = false) => {
        if (!val && val !== 0) return null;

        if (colDef && !isPivotContext) {
            if (colDef.type === 'created_time' && row && row.createdAt) {
                const t = typeof row.createdAt === 'number' ? row.createdAt : AdvancedTable._parseDateStringToMs(row.createdAt);
                return { startMs: t, endMs: t };
            }
            if (colDef.type === 'last_edited_time' && row && row.updatedAt) {
                const t = typeof row.updatedAt === 'number' ? row.updatedAt : AdvancedTable._parseDateStringToMs(row.updatedAt);
                return { startMs: t, endMs: t };
            }
        }

        if (typeof val === 'object' && val !== null) {
            const s = AdvancedTable._parseDateStringToMs(val.start);
            const e = val.end ? AdvancedTable._parseDateStringToMs(val.end) : s;
            if (isNaN(s) && isNaN(e)) return null;
            const startMs = !isNaN(s) ? s : e;
            const endMs = !isNaN(e) ? e : s;
            return {
                startMs: Math.min(startMs, endMs),
                endMs: Math.max(startMs, endMs)
            };
        }

        const strVal = String(val).trim();
        if (strVal.includes('➔') || strVal.includes('->')) {
            const parts = strVal.split(/➔|->/);
            const s = AdvancedTable._parseDateStringToMs(parts[0]);
            const e = AdvancedTable._parseDateStringToMs(parts[1]);
            if (!isNaN(s) || !isNaN(e)) {
                const startMs = !isNaN(s) ? s : e;
                const endMs = !isNaN(e) ? e : s;
                return {
                    startMs: Math.min(startMs, endMs),
                    endMs: Math.max(startMs, endMs)
                };
            }
        }

        const t = AdvancedTable._parseDateStringToMs(strVal);
        if (isNaN(t)) return null;
        return { startMs: t, endMs: t };
    },

    // ==========================================
    // MOTORE CENTRALE ORDINAMENTO DATI
    // ==========================================
    sortRows: (viewRows, state, isPivotContext = false, sourceStateForPivot = null) => {
        if (!state || !state.sorts || state.sorts.length === 0) return viewRows;

        let sorted = [...viewRows];
        sorted.sort((a, b) => {
            for (let sortRule of state.sorts) {
                const colDef = state.columns.find(c => c.id === sortRule.colId);
                if (!colDef) continue;
                
                let va = a.virtualCells[sortRule.colId];
                let vb = b.virtualCells[sortRule.colId];
                let diff = 0;

                let isDateCol = false;
                let isRecordNote = false;

                if (isPivotContext && sortRule.colId.startsWith('grp_')) {
                    const srcColDef = sourceStateForPivot.columns.find(c => c.id === colDef.sourceColId);
                    if (srcColDef) {
                        isDateCol = ['date', 'datetime', 'time', 'created_time', 'last_edited_time'].includes(srcColDef.type);
                        isRecordNote = srcColDef.type === 'record_note';
                    }
                } else {
                    isDateCol = ['date', 'datetime', 'created_time', 'last_edited_time'].includes(colDef.type);
                    isRecordNote = colDef.type === 'record_note';
                }

                if (colDef.type === 'created_time' || colDef.type === 'last_edited_time') {
                    const valA = colDef.type === 'created_time' ? a.createdAt : a.updatedAt;
                    const valB = colDef.type === 'created_time' ? b.createdAt : b.updatedAt;
                    const tA = typeof valA === 'number' ? valA : AdvancedTable._parseDateStringToMs(valA) || 0;
                    const tB = typeof valB === 'number' ? valB : AdvancedTable._parseDateStringToMs(valB) || 0;
                    diff = tA - tB;
                }
                else if (isRecordNote) {
                    const noteA = typeof Store !== 'undefined' ? Store.getNote(va) : null;
                    const noteB = typeof Store !== 'undefined' ? Store.getNote(vb) : null;
                    const titleA = noteA ? (noteA.title || '').toLowerCase() : '';
                    const titleB = noteB ? (noteB.title || '').toLowerCase() : '';
                    diff = titleA.localeCompare(titleB, undefined, {numeric: true, sensitivity: 'base'});
                }
                else if (colDef.type === 'note_link') {
                    const strA = AdvancedTable.getFormatDisplayValue(colDef, va).toLowerCase();
                    const strB = AdvancedTable.getFormatDisplayValue(colDef, vb).toLowerCase();
                    diff = strA.localeCompare(strB, undefined, {numeric: true, sensitivity: 'base'});
                }
                else if (isDateCol) {
                    const intA = AdvancedTable._extractIntervalFromValue(va);
                    const intB = AdvancedTable._extractIntervalFromValue(vb);
                    const tA = intA ? intA.startMs : 0;
                    const tB = intB ? intB.startMs : 0;
                    diff = tA - tB;
                }
                else if (!isNaN(parseFloat(va)) && !isNaN(parseFloat(vb)) && va !== '' && vb !== '') {
                    diff = parseFloat(va) - parseFloat(vb);
                } 
                else {
                    diff = String(va || '').localeCompare(String(vb || ''), undefined, {numeric: true, sensitivity: 'base'});
                }
                
                if (diff !== 0) return sortRule.dir * diff;
            }
            return 0;
        });
        return sorted;
    },

    // ==========================================
    // MOTORE CENTRALE FILTRAGGIO DATI (CON RICERCA RAPIDA OR)
    // ==========================================
    filterRows: (viewRows, state, isPivotContext = false, sourceStateForPivot = null) => {
        if (!state) return viewRows;

        let filtered = [...viewRows];

        // 1. RICERCA RAPIDA UNIVERSALE (FULL-TEXT IN OR SU TUTTI I CAMPI)
        if (state.quickSearch && state.quickSearch.trim() !== '') {
            const q = state.quickSearch.trim().toLowerCase();

            filtered = filtered.filter(r => {
                return (state.columns || []).some(colDef => {
                    let cellVal = r.virtualCells ? r.virtualCells[colDef.id] : undefined;
                    if (cellVal === undefined && r.cells) cellVal = r.cells[colDef.id];
                    if (cellVal === undefined || cellVal === null || cellVal === '') return false;

                    let displayStr = '';

                    if (isPivotContext) {
                        displayStr = String(cellVal || '');
                    } else {
                        displayStr = AdvancedTable.getFormatDisplayValue(colDef, cellVal);
                        
                        if (colDef.type === 'checkbox') {
                            if (cellVal === true) displayStr += ' completato true checked sì si yes';
                            if (cellVal === false) displayStr += ' falso false unchecked no';
                        }
                        if (colDef.type === 'record_note' && cellVal) {
                            const linkedNote = typeof Store !== 'undefined' ? Store.getNote(cellVal) : null;
                            if (linkedNote && typeof UI !== 'undefined' && UI.extractSearchableText) {
                                displayStr += " " + UI.extractSearchableText(linkedNote.content);
                            }
                        }
                    }

                    return String(displayStr || '').toLowerCase().includes(q);
                });
            });
        }

        // 2. FILTRI SPECIFICI PER COLONNA (IN AND)
        if (!state.filters || Object.keys(state.filters).length === 0) return filtered;
        
        const isStrictNumeric = (str) => {
            if (str === null || str === undefined) return false;
            const s = String(str).trim().replace(',', '.');
            return s !== '' && !isNaN(s) && !isNaN(parseFloat(s)) && isFinite(Number(s));
        };

        Object.keys(state.filters).forEach(cId => {
            const rawTerm = state.filters[cId].trim();
            if (!rawTerm) return;

            const terms = rawTerm.split(';').map(t => t.trim()).filter(t => t);
            if (terms.length === 0) return;

            const colDef = state.columns.find(c => c.id === cId);
            if (!colDef) return;
            
            let isDateType = ['date', 'datetime', 'created_time', 'last_edited_time'].includes(colDef.type);
            if (isPivotContext && cId.startsWith('grp_')) {
                const srcColDef = sourceStateForPivot.columns.find(c => c.id === colDef.sourceColId);
                if (srcColDef && ['date', 'datetime', 'time', 'created_time', 'last_edited_time'].includes(srcColDef.type)) {
                    isDateType = true;
                }
            }

            filtered = filtered.filter(r => {
                let cellVal = r.virtualCells[cId];
                let displayStr = '';

                if (isPivotContext) {
                    displayStr = String(cellVal || '');
                } else {
                    displayStr = AdvancedTable.getFormatDisplayValue(colDef, cellVal);
                    
                    if (colDef.type === 'checkbox') {
                        if (cellVal === true) displayStr += ' completato true checked sì si yes';
                        if (cellVal === false) displayStr += ' falso false unchecked no';
                    }
                    if (isDateType) {
                        displayStr += " " + (typeof cellVal === 'object' && cellVal !== null ? `${cellVal.start || ''} ${cellVal.end || ''}` : cellVal); 
                    }
                    if (colDef.type === 'record_note' && cellVal) {
                        const linkedNote = typeof Store !== 'undefined' ? Store.getNote(cellVal) : null;
                        if (linkedNote && typeof UI !== 'undefined') {
                            displayStr += " " + UI.extractSearchableText(linkedNote.content);
                        }
                    }
                }

                return terms.some(term => {
                    const matchOp = term.match(/^(>=|<=|!=|>|<|=)\s*(.*)/);

                    if (matchOp) {
                        const operator = matchOp[1];
                        let targetVal = matchOp[2].trim();

                        if (colDef.type === 'checkbox') {
                            const isChecked = cellVal === true;
                            const lowerTarget = targetVal.toLowerCase();
                            const isTargetTrue = ['sì', 'si', 'true', '1', 'checked', 'completato'].includes(lowerTarget);
                            const isTargetFalse = ['no', 'false', '0', 'unchecked', 'falso'].includes(lowerTarget);

                            if (operator === '=') {
                                return isTargetTrue ? isChecked : (isTargetFalse ? !isChecked : false);
                            }
                            if (operator === '!=') {
                                return isTargetTrue ? !isChecked : (isTargetFalse ? isChecked : false);
                            }
                        }

                        if (isDateType) {
                            const cellInterval = AdvancedTable._extractIntervalFromValue(cellVal, colDef, r, isPivotContext);
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

                        const isColNumeric = ['number', 'formula', 'rollup'].includes(colDef.type);
                        const isBothNumeric = isStrictNumeric(cellVal) && isStrictNumeric(targetVal);

                        if (isColNumeric || isBothNumeric) {
                            const cNum = parseFloat(String(cellVal).replace(',', '.'));
                            const tNum = parseFloat(String(targetVal).replace(',', '.'));

                            if (!isNaN(cNum) && !isNaN(tNum)) {
                                if (operator === '>') return cNum > tNum;
                                if (operator === '<') return cNum < tNum;
                                if (operator === '>=') return cNum >= tNum;
                                if (operator === '<=') return cNum <= tNum;
                                if (operator === '=') return cNum === tNum;
                                if (operator === '!=') return cNum !== tNum;
                            }
                        }
                        
                        let resolvedArrayForExactMatch = null;
                        if (!isPivotContext) {
                            if (colDef.type === 'relation' || colDef.type === 'relation_backlink') {
                                resolvedArrayForExactMatch = AdvancedTable._resolveRelationNames(colDef, cellVal);
                            } else if (colDef.type === 'multi-select') {
                                resolvedArrayForExactMatch = Array.isArray(cellVal) ? cellVal : (cellVal ? [cellVal] : []);
                            }
                        }

                        const strA = String(displayStr || '').toLowerCase();
                        const strB = String(targetVal || '').toLowerCase();

                        if (operator === '=') {
                            if (resolvedArrayForExactMatch) {
                                return resolvedArrayForExactMatch.some(v => String(v).toLowerCase() === strB);
                            }
                            return strA === strB;
                        }

                        if (operator === '!=') {
                            if (resolvedArrayForExactMatch) {
                                return !resolvedArrayForExactMatch.some(v => {
                                    const low = String(v).toLowerCase();
                                    return low === strB || low.includes(strB);
                                });
                            }
                            return !strA.includes(strB);
                        }

                        const cmp = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
                        if (operator === '>') return cmp > 0;
                        if (operator === '<') return cmp < 0;
                        if (operator === '>=') return cmp >= 0;
                        if (operator === '<=') return cmp <= 0;
                    }

                    return String(displayStr || '').toLowerCase().includes(term.toLowerCase());
                });
            });
        });
        
        return filtered;
    }
});