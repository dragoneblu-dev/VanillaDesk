/**
 * logic-engine-core.js
 * Nucleo del Motore Logico: Calcoli matematici e valutazione delle condizioni (WHERE e SET).
 * Esecuzione prioritaria di Formule JS e supporto calcolo dinamico offset per Oggi (+/- giorni) e Adesso (+/- minuti).
 * Integrazione supporto e confronto per la colonna 'note_link' (Collegamento a Nota).
 * FIX RESILIENZA DATE MULTIPLE: Gestione del merge parziale/totale per campi con Data di Fine (hasEndDate)
 * con controllo universale di coerenza (start <= end) su tutte le mutazioni.
 * FIX INSERT_SELECT: Supporto per la lettura corretta dei valori delle celle sorgente tramite _rawRow.
 * FIX ARRAY CONTAINS: Esteso l'operatore 'contains' e 'not_contains' sulle colonne multi-select e relation
 * per verificare la presenza di sottostringhe tra gli elementi dell'array.
 */

// UTILITY GLOBALE PER XSS (Scudo Iniezioni HTML)
if (typeof UI !== 'undefined' && !UI.escapeHTML) {
    UI.escapeHTML = (str) => {
        if (str === null || str === undefined) return '';
        return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
}

const LogicEngine = {
    // ==========================================
    // 1. MOTORE VALUTAZIONE CONDIZIONI (WHERE)
    // ==========================================
    evaluateCondition: (operator, targetVal, currentVal, oldVal, colDef, dateShiftOpts = { mode: 'exact', shift: 0 }, rowContext = null, stateContext = null) => {
        
        if (colDef && colDef.id === 'SYS_JS_FORMULA') {
            if (!targetVal || !rowContext || !stateContext) return false;
            let formula = targetVal.trim();
            if (formula.startsWith('=')) formula = formula.substring(1);
            
            try {
                let vCells = rowContext.virtualCells;
                if (!vCells && typeof AdvancedTable !== 'undefined') {
                    const vRow = AdvancedTable.buildVirtualRow(stateContext.id || '', rowContext, stateContext);
                    vCells = vRow.virtualCells;
                }
                const result = AdvancedTable.evaluateFormula(formula, rowContext, stateContext.columns, stateContext.id || '', stateContext.title || '', vCells);
                return result === true || result === 'true';
            } catch(e) {
                return false;
            }
        }

        if (!colDef) return false;

        let strVal = String(currentVal === undefined || currentVal === null ? '' : currentVal).trim().toLowerCase();
        let oldStrVal = String(oldVal === undefined || oldVal === null ? '' : oldVal).trim().toLowerCase();
        let tgtValLower = String(targetVal === undefined || targetVal === null ? '' : targetVal).trim().toLowerCase();

        // Estrazione titolo pulito se stiamo valutando un collegamento a nota
        if (colDef.type === 'note_link') {
            let linkObj = null;
            if (currentVal && typeof currentVal === 'object') linkObj = currentVal;
            else if (currentVal && typeof currentVal === 'string') {
                try { linkObj = JSON.parse(currentVal); } catch(e) { linkObj = { noteId: currentVal }; }
            }
            if (linkObj && linkObj.noteId) {
                const note = typeof Store !== 'undefined' ? Store.getNote(linkObj.noteId) : null;
                strVal = (note ? (note.title || '') : (linkObj.title || '')).trim().toLowerCase();
            } else {
                strVal = '';
            }

            let oldLinkObj = null;
            if (oldVal && typeof oldVal === 'object') oldLinkObj = oldVal;
            else if (oldVal && typeof oldVal === 'string') {
                try { oldLinkObj = JSON.parse(oldVal); } catch(e) { oldLinkObj = { noteId: oldVal }; }
            }
            if (oldLinkObj && oldLinkObj.noteId) {
                const oldNote = typeof Store !== 'undefined' ? Store.getNote(oldLinkObj.noteId) : null;
                oldStrVal = (oldNote ? (oldNote.title || '') : (oldLinkObj.title || '')).trim().toLowerCase();
            } else {
                oldStrVal = '';
            }
        }

        if (['number', 'formula', 'rollup'].includes(colDef.type)) {
            const cNum = parseFloat(currentVal);
            const tNum = parseFloat(targetVal);
            const oNum = parseFloat(oldVal);

            if (operator === 'changed') {
                return (isNaN(cNum) ? null : cNum) !== (isNaN(oNum) ? null : oNum);
            }

            if (!isNaN(cNum) && !isNaN(tNum)) {
                if (operator === '>') return cNum > tNum;
                if (operator === '<') return cNum < tNum;
                if (operator === '>=') return cNum >= tNum;
                if (operator === '<=') return cNum <= tNum;
                if (operator === '=') return cNum === tNum;
                if (operator === '!=') return cNum !== tNum;
            }
        }

        if (['date', 'datetime', 'created_time', 'last_edited_time'].includes(colDef.type)) {
            let cellStart = null;
            let cellEnd = null;

            if (colDef.type === 'created_time') cellStart = new Date(currentVal).getTime();
            else if (colDef.type === 'last_edited_time') cellStart = new Date(currentVal).getTime();
            else if (typeof currentVal === 'object' && currentVal !== null) {
                cellStart = currentVal.start ? new Date(currentVal.start).getTime() : NaN;
                cellEnd = currentVal.end ? new Date(currentVal.end).getTime() : NaN;
            } else {
                cellStart = new Date(currentVal).getTime();
            }

            let oldStart = null;
            if (typeof oldVal === 'object' && oldVal !== null) oldStart = oldVal.start ? new Date(oldVal.start).getTime() : NaN;
            else oldStart = new Date(oldVal).getTime();

            if (operator === 'empty') return isNaN(cellStart);
            if (operator === 'not_empty') return !isNaN(cellStart);
            if (operator === 'changed') {
                const c1 = isNaN(cellStart) ? null : cellStart;
                const o1 = isNaN(oldStart) ? null : oldStart;
                return c1 !== o1;
            }

            let targetDateObj;
            if (dateShiftOpts && dateShiftOpts.mode === 'today') {
                targetDateObj = new Date();
                targetDateObj.setHours(0,0,0,0);
            } else {
                targetDateObj = new Date(targetVal);
            }

            if (dateShiftOpts && dateShiftOpts.shift) {
                targetDateObj.setDate(targetDateObj.getDate() + parseInt(dateShiftOpts.shift));
            }

            const tTarget = targetDateObj.getTime();

            if (!isNaN(tTarget)) {
                let dayTarget = tTarget;
                let dayStart = cellStart;
                let dayEnd = cellEnd;
                
                if (colDef.type === 'date') {
                    dayTarget = new Date(tTarget).setHours(0, 0, 0, 0);
                    dayStart = isNaN(cellStart) ? null : new Date(cellStart).setHours(0, 0, 0, 0);
                    dayEnd = isNaN(cellEnd) ? null : new Date(cellEnd).setHours(0, 0, 0, 0);
                }

                if (colDef.hasEndDate && dayEnd !== null) {
                    if (operator === 'range_inside') return dayTarget >= dayStart && dayTarget <= dayEnd;
                    if (operator === 'range_outside') return dayTarget < dayStart || dayTarget > dayEnd;
                    if (operator === 'range_start_eq') return dayStart === dayTarget;
                    if (operator === 'range_end_eq') return dayEnd === dayTarget;
                } else if (dayStart !== null) {
                    if (operator === '=') return dayStart === dayTarget;
                    if (operator === '!=') return dayStart !== dayTarget;
                    if (operator === '>') return dayStart > dayTarget;
                    if (operator === '<') return dayStart < dayTarget;
                    if (operator === '>=') return dayStart >= dayTarget;
                    if (operator === '<=') return dayStart <= dayTarget;
                }
            }
            return false;
        }

        if (['multi-select', 'relation'].includes(colDef.type)) {
            let arr = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
            let oldArr = Array.isArray(oldVal) ? oldVal : (oldVal ? [oldVal] : []);
            
            let contains = arr.includes(targetVal) || arr.some(v => String(v).toLowerCase() === tgtValLower);

            if (operator === '=') return contains;
            if (operator === '!=') return !contains;
            if (operator === 'empty') return arr.length === 0;
            if (operator === 'not_empty') return arr.length > 0;
            if (operator === 'contains') return arr.some(v => String(v).toLowerCase().includes(tgtValLower));
            if (operator === 'not_contains') return !arr.some(v => String(v).toLowerCase().includes(tgtValLower));
            
            if (operator === 'changed') {
                const cJson = JSON.stringify([...arr].sort());
                const oJson = JSON.stringify([...oldArr].sort());
                return cJson !== oJson;
            }
            if (operator === 'relation_added') return !oldArr.includes(targetVal) && arr.includes(targetVal);
            if (operator === 'relation_removed') return oldArr.includes(targetVal) && !arr.includes(targetVal);
            return false;
        }

        if (colDef.type === 'checkbox') {
            let isChecked = currentVal === true || strVal === 'true' || strVal === 'sì';
            let wasChecked = oldVal === true || oldStrVal === 'true' || oldStrVal === 'sì';
            let targetBool = tgtValLower === 'true';
            
            if (operator === '=') return isChecked === targetBool;
            if (operator === '!=') return isChecked !== targetBool;
            if (operator === 'changed') return isChecked !== wasChecked;
            if (operator === 'changed_to') return (wasChecked !== targetBool) && (isChecked === targetBool);
            if (operator === 'changed_from') return (wasChecked === targetBool) && (isChecked !== targetBool);
            return false;
        }

        // Operatori testuali Generici (anche Contiene / Non contiene)
        if (operator === 'empty') return strVal === '';
        if (operator === 'not_empty') return strVal !== '';
        if (operator === '=') return strVal === tgtValLower;
        if (operator === '!=') return strVal !== tgtValLower;
        if (operator === 'contains') return strVal.includes(tgtValLower);
        if (operator === 'not_contains') return !strVal.includes(tgtValLower);
        if (operator === 'changed') return strVal !== oldStrVal;
        if (operator === 'changed_to') return (oldStrVal !== tgtValLower) && (strVal === tgtValLower);
        if (operator === 'changed_from') return (oldStrVal === tgtValLower) && (strVal !== tgtValLower);
        
        return strVal.includes(tgtValLower); 
    },

    // ==========================================
    // 2. MOTORE CALCOLO VALORI (SET)
    // ==========================================
    calculateNewValue: async (actType, val1, val2, currentVal, colDef, rowContext, targetState, sourceRowOrOrigineContext = null) => {
        
        if (actType === 'set_from_source_col') {
            const rawSourceRow = (sourceRowOrOrigineContext && sourceRowOrOrigineContext._rawRow) 
                ? sourceRowOrOrigineContext._rawRow 
                : sourceRowOrOrigineContext;
                
            if (rawSourceRow && rawSourceRow.cells && rawSourceRow.cells[val1] !== undefined) {
                return rawSourceRow.cells[val1];
            }
            if (sourceRowOrOrigineContext && sourceRowOrOrigineContext[val1] !== undefined) {
                return sourceRowOrOrigineContext[val1];
            }
            return '';
        }

        if (actType === 'set_empty') {
            if (['multi-select', 'relation'].includes(colDef.type)) return [];
            if (colDef.type === 'checkbox') return false;
            if (['date', 'datetime'].includes(colDef.type) && colDef.hasEndDate) return { start: '', end: '' };
            if (colDef.type === 'note_link') return null;
            return '';
        }

        // 1. ESECUZIONE FORMULA JS (Priorità Assoluta sull'estrazione del dato)
        let formulaResult = null;
        let isFormulaExec = false;

        const isActFormula = actType === 'set_formula' || actType === 'set_start_formula' || actType === 'set_end_formula';
        const isImplicitFormula = actType.includes('fixed') && typeof val1 === 'string' && val1.startsWith('=');

        if (isActFormula || isImplicitFormula) {
            const formula = isActFormula ? val1 : val1.substring(1).trim();
            let mockRow = rowContext || { id: 'mock', cells: {}, virtualCells: {} };
            
            formulaResult = await AdvancedTable.executeAsyncScript(
                formula, 
                mockRow, 
                targetState.columns, 
                targetState.id || '', 
                targetState.title, 
                mockRow.virtualCells || mockRow.cells, 
                sourceRowOrOrigineContext
            );
            isFormulaExec = true;
        }

        // 2. GESTIONE DATE E DATE-TIME (Con supporto a Shift giorni / minuti e range coherence)
        if (['date', 'datetime'].includes(colDef.type)) {
            const isDateTime = colDef.type === 'datetime';
            let dateObj = (typeof currentVal === 'object' && currentVal !== null) ? { ...currentVal } : { start: currentVal || '', end: '' };
            
            const genDateStr = (baseDate) => {
                const d = new Date(baseDate);
                d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                return isDateTime ? d.toISOString().slice(0, 16) : d.toISOString().split('T')[0];
            };

            const doMath = (isoStart, amountStr, unit, isSub) => {
                if (!isoStart) return isoStart;
                const d = new Date(isoStart);
                if (isNaN(d.getTime())) return isoStart;
                const amt = (parseFloat(amountStr) || 1) * (isSub ? -1 : 1);
                if (unit === 'hours') d.setHours(d.getHours() + amt);
                else if (unit === 'weeks') d.setDate(d.getDate() + (amt * 7));
                else if (unit === 'months') d.setMonth(d.getMonth() + amt);
                else d.setDate(d.getDate() + amt);
                return isDateTime ? d.toISOString().slice(0, 16) : d.toISOString().split('T')[0];
            };

            const now = new Date();

            // Calcolo della data odierna con eventuale offset in giorni (+/-)
            const getShiftedDate = (days) => {
                const d = new Date(now);
                d.setDate(d.getDate() + days);
                d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                return d.toISOString().split('T')[0];
            };

            // Calcolo dell'ora attuale con eventuale offset in minuti (+/-)
            const getShiftedDateTime = (minutes) => {
                const d = new Date(now.getTime() + (minutes * 60000));
                return genDateStr(d);
            };

            // Applica Formula Risultato
            if (actType === 'set_start_formula') {
                dateObj.start = formulaResult;
            } else if (actType === 'set_end_formula') {
                dateObj.end = formulaResult;
            } else if (actType === 'set_formula') {
                try {
                    const parsed = typeof formulaResult === 'string' ? JSON.parse(formulaResult) : formulaResult;
                    if (parsed && typeof parsed === 'object' && (parsed.start !== undefined || parsed.end !== undefined)) {
                        return colDef.hasEndDate ? {
                            start: parsed.start !== undefined ? parsed.start : (dateObj.start || ''),
                            end: parsed.end !== undefined ? parsed.end : (dateObj.end || '')
                        } : (parsed.start !== undefined ? parsed.start : (dateObj.start || ''));
                    }
                } catch(e) {}
                dateObj.start = formulaResult;
            } else if (actType === 'set_today') {
                const dayShift = parseInt(val1, 10) || 0;
                dateObj.start = getShiftedDate(dayShift);
            } else if (actType === 'set_datetime') {
                const minShift = parseInt(val1, 10) || 0;
                dateObj.start = getShiftedDateTime(minShift);
            } else if (actType === 'set_start_today') {
                const dayShift = parseInt(val1, 10) || 0;
                dateObj.start = getShiftedDate(dayShift);
            } else if (actType === 'set_end_today') {
                const dayShift = parseInt(val1, 10) || 0;
                dateObj.end = getShiftedDate(dayShift);
            } else if (actType === 'set_start_now') {
                const minShift = parseInt(val1, 10) || 0;
                dateObj.start = getShiftedDateTime(minShift);
            } else if (actType === 'set_end_now') {
                const minShift = parseInt(val1, 10) || 0;
                dateObj.end = getShiftedDateTime(minShift);
            } else if (actType === 'math_date_add') {
                dateObj.start = doMath(dateObj.start, val1, val2, false);
            } else if (actType === 'math_date_sub') {
                dateObj.start = doMath(dateObj.start, val1, val2, true);
            } else if (actType === 'math_start_add') {
                dateObj.start = doMath(dateObj.start, val1, val2, false);
            } else if (actType === 'math_start_sub') {
                dateObj.start = doMath(dateObj.start, val1, val2, true);
            } else if (actType === 'math_end_add') {
                dateObj.end = doMath(dateObj.end, val1, val2, false);
            } else if (actType === 'math_end_sub') {
                dateObj.end = doMath(dateObj.end, val1, val2, true);
            } else if (actType === 'set_fixed') {
                dateObj.start = isFormulaExec ? formulaResult : val1;
            } else if (actType === 'set_start_fixed') {
                dateObj.start = isFormulaExec ? formulaResult : val1;
            } else if (actType === 'set_end_fixed') {
                dateObj.end = isFormulaExec ? formulaResult : val1;
            }

            // CONTROLLO UNIVERSALE DI COERENZA INTERVALLO (start <= end)
            if (colDef.hasEndDate && dateObj.start && dateObj.end) {
                const sTime = new Date(dateObj.start).getTime();
                const eTime = new Date(dateObj.end).getTime();
                if (!isNaN(sTime) && !isNaN(eTime)) {
                    if (actType.includes('end')) {
                        if (sTime > eTime) dateObj.start = dateObj.end;
                    } else {
                        if (sTime > eTime) dateObj.end = dateObj.start;
                    }
                }
            }

            return colDef.hasEndDate ? dateObj : dateObj.start;
        }

        // 3. RITORNO DIRETTO DELLA FORMULA PER GLI ALTRI TIPI
        if (isFormulaExec && actType === 'set_formula') {
            return formulaResult;
        }

        // 4. RESTO DELLE AZIONI STANDARD
        if (['multi-select', 'relation'].includes(colDef.type)) {
            let arr = Array.isArray(currentVal) ? [...currentVal] : [];
            const cleanVal1 = isFormulaExec ? String(formulaResult).trim() : String(val1).trim();
            if (actType === 'set_fixed') return cleanVal1 ? [cleanVal1] : [];
            if (actType === 'add_fixed') { if (cleanVal1 && !arr.includes(cleanVal1)) arr.push(cleanVal1); return arr; }
            if (actType === 'remove_fixed') return arr.filter(v => String(v) !== cleanVal1);
            return arr;
        }

        if (actType === 'set_true') return true;
        if (actType === 'set_false') return false;
        
        if (actType === 'set_time') {
            const d = new Date();
            return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        }
        
        if (actType === 'math_add') return (parseFloat(currentVal) || 0) + (parseFloat(val1) || 0);
        if (actType === 'math_sub') return (parseFloat(currentVal) || 0) - (parseFloat(val1) || 0);

        if (actType === 'set_fixed') {
            if (colDef.type === 'number') return parseFloat(val1) || 0;
            return val1;
        }

        return currentVal;
    }
};