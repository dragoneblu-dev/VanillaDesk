/**
 * AdvancedTableAutomations-Core.js
 * ENGINE LOGICO: Valutazione delle regole (evaluate), parsing date, esecuzione massiva.
 * Valutazione indipendente dall'interfaccia per i Database di Sistema.
 * Supporto per Opacità Dinamica nell'azione color_row.
 * Isolamento tra azioni globali (scatto singolo) e azioni a riga nel Cron Engine.
 */

const AdvancedAutomations = {
    _tempAuto: null,
    _toastTimer: null,
    _cronTimer: null,
    _autoToastTimer: null, 

    _notifyFired: () => {
        clearTimeout(AdvancedAutomations._autoToastTimer);
        AdvancedAutomations._autoToastTimer = setTimeout(() => {
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast("Automazione eseguita", "auto");
            }
        }, 800); 
    },

    startCronEngine: () => {
        if (AdvancedAutomations._cronTimer) clearInterval(AdvancedAutomations._cronTimer);
        
        AdvancedAutomations._cronTimer = setInterval(async () => {
            if (!AppState.databases) return;

            const now = new Date();
            const currentDay = now.getDay(); 
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const currentHourMinute = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
            const currentMinuteStr = `${now.getFullYear()}-${mm}-${dd} ${currentHourMinute}`;
            const todayStr = `${now.getFullYear()}-${mm}-${dd}`;

            for (const tId of Object.keys(AppState.databases)) {
                const state = AppState.databases[tId];
                if (!state || !state.automations || state.isPivot || state.isLinkedView) continue;

                for (const auto of state.automations) {
                    if (!auto.active || !auto.isValid) continue;

                    const timerTrigger = auto.triggers.find(t => t.colId === 'SYS_TIMER');
                    if (!timerTrigger) continue;

                    let isTimeTriggerFired = false;
                    let fireForSpecificRows = [];

                    if (timerTrigger.operator === 'col_reference') {
                        const dateColId = timerTrigger.value;
                        const colDef = state.columns.find(c => c.id === dateColId);
                        const offsetMins = parseInt(timerTrigger.dateShift) || 0;
                        
                        if (state.rows && colDef) {
                            state.rows.forEach(row => {
                                // Mappa in virtual row per leggere eventuali rollup di date
                                const vRow = AdvancedTable.buildVirtualRow(tId, row, state);
                                const cellVal = vRow.virtualCells[dateColId] !== undefined ? vRow.virtualCells[dateColId] : row.cells[dateColId];
                                
                                if (cellVal) {
                                    const targetMs = AdvancedAutomations._parseDateFuzzy(typeof cellVal === 'object' ? cellVal.start : cellVal);
                                    if (!isNaN(targetMs)) {
                                        const triggerTimeMs = targetMs + (offsetMins * 60000);
                                        const triggerDate = new Date(triggerTimeMs);
                                        
                                        const t_mm = String(triggerDate.getMonth() + 1).padStart(2, '0');
                                        const t_dd = String(triggerDate.getDate()).padStart(2, '0');

                                        if (colDef.type === 'date') {
                                            const triggerDateStr = `${triggerDate.getFullYear()}-${t_mm}-${t_dd}`;
                                            
                                            if (triggerDateStr === todayStr) {
                                                auto._firedDates = auto._firedDates || {};
                                                if (auto._firedDates[row.id] !== todayStr) {
                                                    auto._firedDates[row.id] = todayStr;
                                                    fireForSpecificRows.push(row.id);
                                                }
                                            }
                                        } else {
                                            const triggerStr = `${triggerDate.getFullYear()}-${t_mm}-${t_dd} ${String(triggerDate.getHours()).padStart(2, '0')}:${String(triggerDate.getMinutes()).padStart(2, '0')}`;
                                            
                                            if (triggerStr === currentMinuteStr && auto._lastFired !== currentMinuteStr) {
                                                fireForSpecificRows.push(row.id);
                                            }
                                        }
                                    }
                                }
                            });
                            if (colDef.type !== 'date' && fireForSpecificRows.length > 0) {
                                 auto._lastFired = currentMinuteStr;
                            }
                        }
                    } else if (timerTrigger.operator === 'exact_date') {
                        const targetDate = new Date(timerTrigger.value);
                        if (!isNaN(targetDate.getTime())) {
                            const t_mm = String(targetDate.getMonth() + 1).padStart(2, '0');
                            const t_dd = String(targetDate.getDate()).padStart(2, '0');
                            const t_hh = String(targetDate.getHours()).padStart(2, '0');
                            const t_min = String(targetDate.getMinutes()).padStart(2, '0');
                            const targetStr = `${targetDate.getFullYear()}-${t_mm}-${t_dd} ${t_hh}:${t_min}`;
                            
                            if (targetStr === currentMinuteStr && auto._lastFired !== currentMinuteStr) {
                                isTimeTriggerFired = true;
                            }
                        }
                    } else if (timerTrigger.operator === 'formula') {
                        if (state.rows) {
                            for (const row of state.rows) {
                                const vRow = AdvancedTable.buildVirtualRow(tId, row, state);
                                try {
                                    const isTrue = await AdvancedTable.executeAsyncScript(timerTrigger.value, row, state.columns, tId, state.title, vRow.virtualCells);
                                    if (isTrue === true || String(isTrue).toLowerCase() === 'true') {
                                        auto._firedDates = auto._firedDates || {};
                                        const fireKey = `${row.id}_${currentMinuteStr}`;
                                        if (auto._firedDates[fireKey] !== true) {
                                            auto._firedDates[fireKey] = true;
                                            fireForSpecificRows.push(row.id);
                                        }
                                    }
                                } catch(e) {}
                            }
                        }
                    } else {
                        let dayMatch = false;
                        if (timerTrigger.operator === 'every_day') {
                            dayMatch = true;
                        } else {
                            const activeDays = timerTrigger.operator.split(',');
                            if (activeDays.includes(String(currentDay))) dayMatch = true;
                        }

                        if (dayMatch && timerTrigger.value === currentHourMinute && auto._lastFired !== currentMinuteStr) {
                            isTimeTriggerFired = true;
                        }
                    }

                    // Esecuzione controllata: separazione tra azioni globali (scatto singolo) e aggiornamento righe
                    if (isTimeTriggerFired) {
                        auto._lastFired = currentMinuteStr;
                        AdvancedTable.setState(tId, state);

                        const hasRowUpdates = auto.actions.some(a => a.colId !== 'SYS_ACTION' || a.type === 'color_row');
                        const hasSystemActions = auto.actions.some(a => a.colId === 'SYS_ACTION' && a.type !== 'color_row');

                        let tableUpdated = false;

                        // 1. Azioni di sistema scattano una sola volta
                        if (hasSystemActions) {
                            const mockRow = (state.rows && state.rows.length > 0) 
                                ? state.rows[0] 
                                : { id: 'sys_cron_mock', createdAt: Date.now(), updatedAt: Date.now(), cells: {} };

                            const changed = await AdvancedAutomations.evaluate(tId, mockRow.id, false, null, null, true, null, auto.id, false, 0, true);
                            if (changed) tableUpdated = true;
                        }

                        // 2. Modifiche a colonne di riga vengono iterate sulle righe reali della tabella
                        if (hasRowUpdates && state.rows && state.rows.length > 0) {
                            for (const row of state.rows) {
                                const changed = await AdvancedAutomations.evaluate(tId, row.id, false, null, null, true, null, auto.id, false, 0, false);
                                if (changed) tableUpdated = true;
                            }
                        }

                        if (tableUpdated && document.getElementById(tId)) {
                            AdvancedTable.renderTable(tId);
                        }
                    } else if (fireForSpecificRows.length > 0) {
                        AdvancedTable.setState(tId, state);
                        let timerChanged = false;
                        for (const rowId of fireForSpecificRows) {
                            const changed = await AdvancedAutomations.evaluate(tId, rowId, false, null, null, true, null, auto.id, false, 0);
                            if (changed) timerChanged = true;
                        }
                        if (timerChanged && document.getElementById(tId)) {
                            AdvancedTable.renderTable(tId);
                        }
                    }
                }
            }
        }, 60000); 
    },

    triggerOnLoad: async (tableId) => {
        let state = AdvancedTable.getState(tableId);
        if (!state || !state.automations) return;
        
        let hasFired = false;
        for (const auto of state.automations) {
            if (!auto.active || !auto.isValid) continue;
            
            const hasOnLoad = auto.triggers.some(t => t.colId === 'SYS_ON_LOAD');
            if (hasOnLoad && state.rows) {
                for (const r of state.rows) {
                    const changed = await AdvancedAutomations.evaluate(tableId, r.id, false, null, null, false, null, auto.id, true, 0);
                    if (changed) hasFired = true;
                }
            }
        }
        
        if (hasFired && document.getElementById(tableId)) {
            AdvancedTable.renderTable(tableId);
        }
    },

    triggerCrossDB: async (sourceTableId, recursionDepth = 0) => {
        if (!AppState.databases) return;
        
        for (const tId of Object.keys(AppState.databases)) {
            if (tId === sourceTableId) continue;
            const state = AppState.databases[tId];
            if (!state || !state.automations) continue;
            
            const hasCrossDbListener = state.automations.some(a => a.active && a.triggers.some(t => t.colId === 'SYS_CROSS_DB' && t.value === sourceTableId));
            
            if (hasCrossDbListener && state.rows) {
                for (const r of state.rows) {
                    await AdvancedAutomations.evaluate(tId, r.id, false, null, sourceTableId, false, null, null, false, recursionDepth + 1);
                }
            }
        }
    },

    triggerFromNoteChange: (tableId, rowId, fieldColId, oldVal, newVal) => {
        const override = {
            colId: fieldColId,
            oldVal: oldVal,
            newVal: newVal
        };
        AdvancedAutomations.evaluate(tableId, rowId, false, null, null, false, override, null, false, 0);
    },

    _validateAutomation: (auto, state) => {
        let errors = [];

        auto.triggers.forEach((t, i) => {
            if (t.colId.startsWith('SYS_')) return;
            
            let actualColId = t.colId;
            if (actualColId.endsWith('_TITLE')) actualColId = actualColId.replace('_TITLE', '');
            if (actualColId.endsWith('_CONTENT')) actualColId = actualColId.replace('_CONTENT', '');

            let c = state.columns.find(col => col.id === actualColId);
            if (!c) {
                errors.push(`Condizione ${i + 1}: Colonna eliminata`);
            } else if (c.type === 'date' || c.type === 'datetime') {
                if (t.operator.startsWith('range_') && !c.hasEndDate) errors.push(`Condizione ${i + 1}: '${c.name}' non ha più la Data di Fine`);
                if (!t.operator.startsWith('range_') && t.operator !== 'empty' && t.operator !== 'not_empty' && t.operator !== 'changed' && c.hasEndDate) errors.push(`Condizione ${i + 1}: '${c.name}' ora richiede un operatore Range`);
            }
        });

        auto.actions.forEach((a, i) => {
            if (a.colId === 'SYS_ACTION') return; 
            let c = state.columns.find(col => col.id === a.colId);
            if (!c) {
                errors.push(`Azione ${i + 1}: Colonna destinazione eliminata`);
            } else if (c.type === 'date' || c.type === 'datetime') {
                if (a.type.includes('_start') || a.type.includes('_end')) {
                    if (!c.hasEndDate) errors.push(`Azione ${i + 1}: '${c.name}' non ha più la Data di Fine`);
                }
            }
        });

        return errors;
    },

    saveAutomation: (e, tableId) => {
        if (e) e.stopPropagation();
        let state = AdvancedTable.getState(tableId);
        if (!state.automations) state.automations = [];

        const auto = AdvancedAutomations._tempAuto;
        if (auto.actions.length === 0 || auto.actions.some(a => !a.colId)) {
            alert("Devi impostare almeno un'azione valida con una colonna di destinazione.");
            return;
        }
        if (auto.triggers.some(t => !t.colId)) {
            alert("Rimuovi i trigger vuoti o seleziona una colonna/evento.");
            return;
        }

        if (!auto.name || auto.name.trim() === '') {
            let tName = "Modifica";
            let aName = "Azione";

            if (auto.triggers.length > 0) {
                const t = auto.triggers[0];
                if (t.colId === 'SYS_NEW_ROW') tName = "Nuova riga";
                else if (t.colId === 'SYS_ANY_CHANGE') tName = "Qualsiasi modifica";
                else if (t.colId === 'SYS_TIMER') tName = "Orologio scatta";
                else if (t.colId === 'SYS_CROSS_DB') tName = "Evento DB Esterno";
                else if (t.colId === 'SYS_ON_LOAD') tName = "Caricamento Tabella";
                else if (t.colId === 'SYS_JS_FORMULA') tName = "Condizione Personalizzata JS";
                else {
                    let actualColId = t.colId;
                    if (actualColId.endsWith('_TITLE')) actualColId = actualColId.replace('_TITLE', '');
                    if (actualColId.endsWith('_CONTENT')) actualColId = actualColId.replace('_CONTENT', '');
                    const c = state.columns.find(col => col.id === actualColId);
                    if (c) tName = c.name;
                }
            }

            if (auto.actions.length > 0) {
                const a = auto.actions[0];
                if (a.colId === 'SYS_ACTION') {
                    if (a.type === 'alarm') aName = "Allarme Sonoro";
                    else aName = "Sistema";
                }
                else {
                    const c = state.columns.find(col => col.id === a.colId);
                    if (c) aName = c.name;
                }
            }

            auto.name = `Se [${tName}] allora imposta [${aName}]`;
        }

        const existingIdx = state.automations.findIndex(a => a.id === auto.id);
        if (existingIdx > -1) {
            state.automations[existingIdx] = auto;
        } else {
            state.automations.push(auto);
        }

        AdvancedTable.setState(tableId, state);
        Store.triggerAutoSave();
        if (typeof AdvancedAutomations.openPanel !== 'undefined') AdvancedAutomations.openPanel(null, tableId);
        AdvancedTable.renderTable(tableId);
    },

    runMassiveAutomation: async (e, tableId, autoId) => {
        if (e) e.stopPropagation();
        
        let state = AdvancedTable.getState(tableId);
        const auto = state.automations.find(a => a.id === autoId);
        
        if (!auto || !auto.isValid) {
            alert("L'automazione non è valida e non può essere eseguita.");
            return;
        }

        if (!confirm(`Sei sicuro di voler forzare l'esecuzione di "${auto.name}" su TUTTE le ${state.rows.length} righe del database?\n\nI filtri della vista attuale verranno ignorati. L'operazione non è facilmente annullabile.`)) {
            return;
        }

        let originalAutomations = JSON.parse(JSON.stringify(state.automations));
        state.automations = [auto];
        AdvancedTable.setState(tableId, state);

        let rowsUpdated = 0;

        try {
            for (const r of state.rows) {
                let oldUpdated = r.updatedAt;
                const changed = await AdvancedAutomations.evaluate(tableId, r.id, true, null, null, false, null, null, false, 0);
                
                const updatedRow = state.rows.find(rx => rx.id === r.id);
                if (updatedRow && updatedRow.updatedAt !== oldUpdated) {
                    rowsUpdated++;
                } else if (changed) {
                    rowsUpdated++;
                }
            }

            state = AdvancedTable.getState(tableId);
            state.automations = originalAutomations;
            AdvancedTable.setState(tableId, state);

            AdvancedTable.renderTable(tableId);
            Store.triggerAutoSave();
            
            alert(`✅ Esecuzione completata.\nSono state modificate ${rowsUpdated} righe su ${state.rows.length}.`);

        } catch(err) {
            console.error(err);
            state = AdvancedTable.getState(tableId);
            state.automations = originalAutomations;
            AdvancedTable.setState(tableId, state);
            alert("Errore durante l'esecuzione massiva.");
        }
    },

    _parseDateFuzzy: (dateStr) => {
        if (!dateStr) return NaN;
        if (dateStr.includes('/')) {
            const p = dateStr.split(' ')[0].split('/');
            if (p.length === 3) return new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime();
        }
        return new Date(dateStr).getTime();
    },

    evaluate: async (tableId, rowId, isNewRow = false, oldRowContext = null, crossDbTriggerId = null, isTimerEvent = false, noteChangeOverride = null, targetAutoId = null, isOnLoadEvent = false, recursionDepth = 0, isSystemActionOnly = false, executedAutoIds = null) => {
        
        // Controllo del loop dipendente dalla profondità di ricorsione
        if (recursionDepth > 10) {
            console.warn(`⚠️ LOOP INFINITO BLOCCATO al livello di ricorsione ${recursionDepth}. L'automazione A sta chiamando B che chiama A ripetutamente.`);
            return false;
        }

        let state = AdvancedTable.getState(tableId);
        if (!state.automations || state.automations.length === 0) return false;

        let row = state.rows ? state.rows.find(r => r.id === rowId) : null;
        if (!row && !isSystemActionOnly) return false;
        if (!row) {
            row = { id: rowId, createdAt: Date.now(), updatedAt: Date.now(), cells: {} };
        }

        let rowChanged = false;
        let visualChanged = false;
        
        // Tracciamento delle regole già eseguite per la stessa riga in questa catena
        if (!executedAutoIds) {
            executedAutoIds = new Set();
        }
        
        try {
            let stopAllExecution = false;
            let vRow = AdvancedTable.buildVirtualRow(tableId, row, state);

            for (const auto of state.automations) {
                if (stopAllExecution) break;
                if (targetAutoId && auto.id !== targetAutoId) continue;
                if (!auto.active || !auto.isValid) continue;
                if (auto.actions.length === 0) continue;

                // Evita di rieseguire la stessa identica regola nella stessa catena di eventi
                if (executedAutoIds.has(auto.id)) continue;

                const isTimerTriggered = auto.triggers.some(t => t.colId === 'SYS_TIMER');
                const isOnLoadTriggered = auto.triggers.some(t => t.colId === 'SYS_ON_LOAD');

                if (isTimerEvent && !isTimerTriggered) continue;
                if (isOnLoadEvent && !isOnLoadTriggered) continue;
                if (!isTimerEvent && !isOnLoadEvent && (isTimerTriggered || isOnLoadTriggered)) continue;

                if (crossDbTriggerId) {
                    const listensToThisDB = auto.triggers.some(t => t.colId === 'SYS_CROSS_DB' && t.value === crossDbTriggerId);
                    if (!listensToThisDB) continue;
                } else {
                    const isPureCrossDB = auto.triggers.some(t => t.colId === 'SYS_CROSS_DB');
                    if (isPureCrossDB) continue;
                }

                let allMatch = true;

                if (auto.triggers.length === 0 && isNewRow) {
                    allMatch = false;
                }

                for (let i = 0; i < auto.triggers.length; i++) {
                    const t = auto.triggers[i];
                    if (!allMatch) break; 

                    if (t.colId === 'SYS_NEW_ROW' || t.colId === 'SYS_ANY_CHANGE' || t.colId === 'SYS_TIMER' || t.colId === 'SYS_CROSS_DB' || t.colId === 'SYS_ON_LOAD') {
                        if (t.colId === 'SYS_NEW_ROW' && !isNewRow) allMatch = false;
                        continue;
                    }

                    let isNoteField = false;
                    let realColId = t.colId;
                    let noteFieldType = '';

                    if (t.colId.endsWith('_TITLE')) { isNoteField = true; realColId = t.colId.replace('_TITLE', ''); noteFieldType = 'title'; }
                    if (t.colId.endsWith('_CONTENT')) { isNoteField = true; realColId = t.colId.replace('_CONTENT', ''); noteFieldType = 'content'; }

                    let colDef = null;
                    if (realColId === 'SYS_JS_FORMULA') {
                        colDef = { id: 'SYS_JS_FORMULA', type: 'special' };
                    } else {
                        colDef = state.columns.find(c => c.id === realColId);
                    }

                    if (!colDef) { allMatch = false; break; }

                    let cellValRaw = vRow.virtualCells[realColId] !== undefined ? vRow.virtualCells[realColId] : row.cells[realColId];
                    let oldCellValRaw = oldRowContext ? oldRowContext.cells[realColId] : null;

                    if (isNoteField) {
                        if (noteChangeOverride && noteChangeOverride.colId === t.colId) {
                            cellValRaw = noteChangeOverride.newVal;
                            oldCellValRaw = noteChangeOverride.oldVal;
                        } else {
                            const linkedNote = Store.getNote(cellValRaw);
                            if (linkedNote) {
                                cellValRaw = noteFieldType === 'title' ? linkedNote.title : UI.extractSearchableText(linkedNote.content);
                            } else {
                                cellValRaw = '';
                            }

                            if (oldRowContext) {
                                const oldLinkedNoteId = oldRowContext.cells[realColId];
                                if (oldLinkedNoteId) {
                                    const oldNote = Store.getNote(oldLinkedNoteId);
                                    oldCellValRaw = oldNote ? (noteFieldType === 'title' ? oldNote.title : UI.extractSearchableText(oldNote.content)) : '';
                                }
                            } else {
                                oldCellValRaw = cellValRaw; 
                            }
                        }
                    }

                    const dateOpts = { mode: t.dateMode, shift: t.dateShift };
                    const match = LogicEngine.evaluateCondition(t.operator, t.value, cellValRaw, oldCellValRaw, colDef, dateOpts, vRow, state);

                    if (!match) allMatch = false;
                }

                if (allMatch) {
                    executedAutoIds.add(auto.id);

                    for (const act of auto.actions) {
                        let actType = act.type || 'set_fixed';

                        if (act.colId === 'SYS_ACTION') {
                            if (actType === 'stop_execution') {
                                stopAllExecution = true;
                            }
                            else if (actType === 'show_toast' || actType === 'alarm') {
                                let msg = act.value || '';
                                if (msg.startsWith('=')) {
                                    msg = await AdvancedTable.executeAsyncScript(msg.substring(1), row, state.columns, tableId, state.title, vRow.virtualCells);
                                }
                                
                                if (actType === 'show_toast') {
                                    if (typeof UI !== 'undefined' && UI.showToast && !isOnLoadEvent) {
                                        clearTimeout(AdvancedAutomations._toastTimer);
                                        AdvancedAutomations._toastTimer = setTimeout(() => UI.showToast(msg, 'auto'), 100);
                                    }
                                } else if (actType === 'alarm') {
                                    if (typeof UI !== 'undefined' && UI.Alarm && !isOnLoadEvent) {
                                        UI.Alarm.trigger(msg);
                                    }
                                }
                            }
                            else if (actType === 'insert_row') {
                                const targetDbId = act.value;
                                if (targetDbId) {
                                    const targetState = AdvancedTable.getState(targetDbId);
                                    if (targetState && !targetState.isPivot && targetState.columns.length > 0) {
                                        let newTitle = act.value2 || 'Record da Automazione';
                                        if (newTitle.startsWith('=')) {
                                            newTitle = await AdvancedTable.executeAsyncScript(newTitle.substring(1), row, state.columns, tableId, state.title, vRow.virtualCells);
                                        }
                                        const nRow = { id: 'r' + Date.now() + Math.random().toString(36).substr(2, 5), createdAt: Date.now(), updatedAt: Date.now(), cells: {} };
                                        targetState.columns.forEach(c => {
                                            if (c.type === 'checkbox') nRow.cells[c.id] = false;
                                            else if (['multi-select', 'relation'].includes(c.type)) nRow.cells[c.id] = [];
                                            else if (['date', 'datetime'].includes(c.type)) nRow.cells[c.id] = c.hasEndDate ? { start: '', end: '' } : '';
                                            else nRow.cells[c.id] = '';
                                        });
                                        nRow.cells[targetState.columns[0].id] = newTitle;
                                        targetState.rows.push(nRow);
                                        
                                        AdvancedTable.setState(targetDbId, targetState);
                                        AdvancedTable.renderTable(targetDbId);
                                        AdvancedTable.updateDependentViews(targetDbId);

                                        // Persistenza automatica della nuova riga creata
                                        if (typeof Store !== 'undefined') {
                                            Store.triggerAutoSave();
                                        }

                                        // Passaggio della profondità ricorsiva per inibizione Loop
                                        await AdvancedAutomations.evaluate(targetDbId, nRow.id, true, null, null, false, null, null, false, recursionDepth + 1);
                                        await AdvancedAutomations.triggerCrossDB(targetDbId, recursionDepth + 1);
                                        
                                        if (!isTimerEvent && !isOnLoadEvent) AdvancedAutomations._notifyFired();
                                    }
                                }
                            }
                            else if (actType === 'color_row' && !isSystemActionOnly) {
                                let opVal = act.value2 !== undefined && act.value2 !== '' ? act.value2 : '100';
                                if (String(opVal).startsWith('=')) {
                                    opVal = await AdvancedTable.executeAsyncScript(opVal.substring(1), row, state.columns, tableId, state.title, vRow.virtualCells);
                                }
                                
                                if (row.color !== act.value || row.opacity !== String(opVal)) {
                                    row.color = act.value;
                                    row.opacity = String(opVal);
                                    visualChanged = true;
                                }
                            }
                            continue; 
                        }

                        if (isSystemActionOnly) continue;

                        let targetColDef = state.columns.find(c => c.id === act.colId);
                        if (!targetColDef) continue;

                        let currentVal = row.cells[act.colId];
                        let newVal = currentVal;

                        if (targetColDef.type === 'record_note') {
                            if (actType === 'set_empty') {
                                const noteToDelete = currentVal;
                                newVal = '';
                                
                                // Consolidamento preventivo della cella nel database per garantire coerenza
                                row.cells[act.colId] = '';
                                vRow.virtualCells[act.colId] = '';
                                rowChanged = true;
                                AdvancedTable.setState(tableId, state);

                                if (noteToDelete && typeof UI !== 'undefined' && UI.Trash) {
                                    UI.Trash.forceHardDeleteRecursive(noteToDelete);
                                }

                                // Riafferma lo stato del database post-eliminazione nota
                                AdvancedTable.setState(tableId, state);
                            } else {
                                let titleToSet = act.value;
                                if (actType === 'set_formula') {
                                    titleToSet = await AdvancedTable.executeAsyncScript(act.value, row, state.columns, tableId, state.title, vRow.virtualCells);
                                } else if (actType === 'set_today') {
                                    titleToSet = new Date().toISOString().split('T')[0];
                                } else if (actType === 'set_now') {
                                    let d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                                    titleToSet = d.toISOString().slice(0, 16);
                                }
                                
                                titleToSet = String(titleToSet || 'Record da Automazione').trim();

                                if (currentVal && Store.getNote(currentVal)) {
                                    const linkedNote = Store.getNote(currentVal);
                                    linkedNote.title = titleToSet;
                                    linkedNote.updatedAt = new Date().toISOString();
                                    
                                    if (typeof UI !== 'undefined' && UI.renderTree) {
                                        setTimeout(() => UI.renderTree(), 10);
                                    }
                                } else {
                                    const newNoteId = Store.generateId();
                                    const nowStr = new Date().toISOString();
                                    
                                    const newNote = {
                                        id: newNoteId,
                                        parentId: AppState.currentNoteId, 
                                        title: titleToSet, 
                                        content: `<p><br></p>`,
                                        isMarked: false,
                                        expanded: true,
                                        createdAt: nowStr,
                                        updatedAt: nowStr,
                                        isRecordNote: true, 
                                        linkedTableId: AdvancedTable._resolveSourceId(tableId),
                                        linkedRowId: row.id
                                    };
                                    AppState.notes.push(newNote);
                                    newVal = newNoteId;
                                    
                                    if (typeof UI !== 'undefined' && UI.renderTree) {
                                        setTimeout(() => UI.renderTree(), 10);
                                    }
                                }
                            }
                        }
                        else {
                            newVal = await LogicEngine.calculateNewValue(actType, act.value, act.value2, currentVal, targetColDef, row, state);

                            if (['select', 'multi-select'].includes(targetColDef.type)) {
                                const valArray = Array.isArray(newVal) ? newVal : (newVal ? [newVal] : []);
                                valArray.forEach(strVal => {
                                    if (String(strVal).trim() !== '') {
                                        let opts = state.selectOptions[act.colId] || [];
                                        if (!opts.includes(strVal)) state.selectOptions[act.colId] = [...opts, strVal];
                                    }
                                });
                            }
                        }

                        if (JSON.stringify(currentVal) !== JSON.stringify(newVal)) {
                            row.cells[act.colId] = newVal;
                            vRow.virtualCells[act.colId] = newVal;
                            rowChanged = true;
                        }
                    }
                }
            }

            if (rowChanged || visualChanged) {
                if (rowChanged) {
                    row.updatedAt = Date.now();
                }
                
                AdvancedTable.setState(tableId, state);
                AdvancedTable.updateDependentViews(tableId);

                // Se stiamo aggiornando un database di sistema (Proprietà) 
                // e questo record corrisponde alla nota correntemente aperta, forziamo l'aggiornamento grafico
                if (tableId === 'SYS_PROPERTIES_DB') {
                    if (typeof UI !== 'undefined' && typeof UI.checkAndUpdatePropertiesIcon === 'function') {
                        UI.checkAndUpdatePropertiesIcon(row.cells['sys_c_note']);
                    }
                    const drawer = document.getElementById('advGlobalDrawer');
                    if (drawer && drawer.classList.contains('open') && AdvancedTable.activeRecordId === rowId) {
                        AdvancedTable.openRecordView(tableId, rowId);
                    }
                }

                // Inibisce la propagazione ricorsiva se stop_execution è intervenuto, mantenendo oldRowContext
                if (!isTimerEvent && !isOnLoadEvent && !stopAllExecution) {
                    if (rowChanged) {
                        AdvancedAutomations._notifyFired();
                        await AdvancedAutomations.evaluate(tableId, rowId, false, oldRowContext, crossDbTriggerId, false, null, null, false, recursionDepth + 1, false, executedAutoIds);
                    }
                }
            }
            return (rowChanged || visualChanged);
        } catch (e) {
            console.error("Errore di valutazione automazione:", e);
            return false;
        }
    }
};