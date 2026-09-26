/**
 * logic-engine-macro.js
 * Esecuzione Massiva: Applica i blocchi di azioni (Macro) su centinaia di record.
 * Isolato per gestire effetti collaterali (Side Effects) come l'invio di Email e la Creazione Record.
 * FIX ERROR TRAP: Riconoscimento delle stringhe di errore restituite dalle formule
 * per impedire la corruzione delle celle del DB e garantire il popolamento di errorsLog.
 * FIX INSERT_SELECT: Associazione di _rawRow al contesto di origine per la risoluzione corretta di set_from_source_col.
 */

Object.assign(LogicEngine, {
    // ==========================================
    // ESECUZIONE MASSIVA MACRO (DRY CORE)
    // ==========================================
    executeMacroBlocks: async (actionBlocks, defaultTargetDbId, sourceRow, isTestMode) => {
        let totalRowsAffected = 0;
        let emailsSent = 0;
        const updatedDbIds = new Set();
        let errorsLog = [];

        // CONTESTO DI ORIGINE (Dati della riga che scatena il pulsante)
        let origineContext = {};
        if (sourceRow) {
            const sourceState = AdvancedTable.getTableState(defaultTargetDbId);
            if (sourceState) {
                origineContext = AdvancedTable._buildRigaContext(sourceRow, sourceState.columns);
                origineContext._rawRow = sourceRow;
            }
        }

        for (const blk of actionBlocks) {
            let targetDbId = blk.targetDbId;
            if (!targetDbId || targetDbId === 'THIS_ROW') {
                targetDbId = defaultTargetDbId;
            }
            if (!targetDbId || !blk.actions || blk.actions.length === 0) continue;
            
            const targetState = AdvancedTable.getTableState(targetDbId);
            if (!targetState) continue;

            const isThisRowMode = blk.targetDbId === 'THIS_ROW';

            // 1. MAILTO (Email)
            if (blk.actionType === 'email') {
                let usesRigaContext = false;
                blk.actions.forEach(a => {
                    if (a.type && a.type.includes('formula') && a.value && (a.value.includes('riga[') || a.value.includes('riga.'))) {
                        usesRigaContext = true;
                    }
                });

                let matchingRows = [];
                if (isThisRowMode && sourceRow) {
                    matchingRows.push(sourceRow);
                } else {
                    for (const r of targetState.rows) {
                        let isMatch = true;
                        if (blk.filters && blk.filters.length > 0) {
                            isMatch = blk.filters.every(f => {
                                const colDef = targetState.columns.find(c => c.id === f.colId);
                                return LogicEngine.evaluateCondition(f.operator, f.value, r.cells[f.colId], null, colDef);
                            });
                        }
                        if (isMatch) matchingRows.push(r);
                    }
                }

                let rowToUse = null;

                if (usesRigaContext) {
                    if (matchingRows.length === 0) {
                        errorsLog.push(`Generazione Email annullata: La formula usa i dati di un record (riga), ma i filtri impostati non hanno trovato alcuna riga corrispondente nel database.`);
                        continue;
                    }
                    if (matchingRows.length > 1) {
                        errorsLog.push(`Generazione Email bloccata per sicurezza: La formula richiede i dati di UN record specifico, ma i filtri restituiscono ${matchingRows.length} righe. Assicurati che i filtri isolino ESATTAMENTE UNA riga per poter inviare la mail ed evitare lo spam.`);
                        continue;
                    }
                    rowToUse = matchingRows[0];
                } else {
                    rowToUse = matchingRows.length > 0 ? matchingRows[0] : { id: 'mock', cells: {}, virtualCells: {} };
                }

                try {
                    const toAct = blk.actions.find(a => a.colId === 'EMAIL_TO');
                    const ccAct = blk.actions.find(a => a.colId === 'EMAIL_CC'); 
                    const subAct = blk.actions.find(a => a.colId === 'EMAIL_SUBJECT');
                    const bodyAct = blk.actions.find(a => a.colId === 'EMAIL_BODY');

                    const dummyCol = { type: 'text' };
                    const toVal = await LogicEngine.calculateNewValue(toAct.type, toAct.value, toAct.value2, '', dummyCol, rowToUse, targetState, origineContext);
                    const ccVal = ccAct ? await LogicEngine.calculateNewValue(ccAct.type, ccAct.value, ccAct.value2, '', dummyCol, rowToUse, targetState, origineContext) : '';
                    const subVal = await LogicEngine.calculateNewValue(subAct.type, subAct.value, subAct.value2, '', dummyCol, rowToUse, targetState, origineContext);
                    const bodyVal = await LogicEngine.calculateNewValue(bodyAct.type, bodyAct.value, bodyAct.value2, '', dummyCol, rowToUse, targetState, origineContext);

                    // Verifica presenza errori nelle formule email
                    const emailParts = [toVal, ccVal, subVal, bodyVal];
                    const hasError = emailParts.some(p => typeof p === 'string' && (p.includes('Async Err') || p.includes('Err</span>')));
                    if (hasError) {
                        errorsLog.push(`Generazione Email fallita: Una o più formule contengono errori di sintassi o riferimenti non validi.`);
                        continue;
                    }

                    let mailto = `mailto:${toVal}?subject=${encodeURIComponent(subVal)}&body=${encodeURIComponent(bodyVal)}`;
                    if (ccVal) mailto += `&cc=${encodeURIComponent(ccVal)}`;
                    
                    const link = document.createElement('a');
                    link.href = mailto;
                    link.target = '_blank';
                    link.click();
                    emailsSent++;
                } catch (err) {
                    errorsLog.push(`Generazione Email Fallita: ${err.message || String(err)}`);
                }
            }
            // 2. INSERIMENTO NUOVA RIGA
            else if (blk.actionType === 'insert') {
                const now = Date.now();
                const newRow = { id: 'r' + Store.generateId(), createdAt: now, updatedAt: now, cells: {} };
                
                targetState.columns.forEach(c => {
                    if (c.type === 'checkbox') newRow.cells[c.id] = false;
                    else if (['multi-select', 'relation'].includes(c.type)) newRow.cells[c.id] = [];
                    else if (['date', 'datetime'].includes(c.type)) newRow.cells[c.id] = c.hasEndDate ? {start:'', end:''} : '';
                    else newRow.cells[c.id] = '';
                });

                try {
                    let hasFormulaError = false;

                    for (const act of blk.actions) {
                        const targetColDef = targetState.columns.find(c => c.id === act.colId);
                        if (!targetColDef) continue;

                        let finalVal = await LogicEngine.calculateNewValue(act.type, act.value, act.value2, newRow.cells[act.colId], targetColDef, newRow, targetState, origineContext);
                        
                        // Intercettazione formula non valida
                        if (typeof finalVal === 'string' && (finalVal.includes('Async Err') || finalVal.includes('Err</span>'))) {
                            errorsLog.push(`Errore Formula nella creazione riga [DB: ${UI.escapeHTML(targetState.title)} - Colonna: ${UI.escapeHTML(targetColDef.name)}]`);
                            hasFormulaError = true;
                            break;
                        }

                        if (['select', 'multi-select'].includes(targetColDef.type)) {
                            const valArray = Array.isArray(finalVal) ? finalVal : (finalVal ? [finalVal] : []);
                            valArray.forEach(strVal => {
                                if (String(strVal).trim() !== '') {
                                    let opts = targetState.selectOptions[act.colId] || [];
                                    if (!opts.includes(strVal)) targetState.selectOptions[act.colId] = [...opts, strVal];
                                }
                            });
                        }
                        newRow.cells[act.colId] = finalVal;
                    }

                    if (!hasFormulaError) {
                        targetState.rows.push(newRow);
                        totalRowsAffected++;
                        updatedDbIds.add(targetDbId);

                        if (typeof AdvancedAutomations !== 'undefined') {
                            AdvancedAutomations.evaluate(targetDbId, newRow.id, true);
                            AdvancedAutomations.triggerCrossDB(targetDbId);
                        }
                    }
                } catch(err) {
                    errorsLog.push(`Creazione Riga [DB: ${targetState.title}]: ${err.message || String(err)}`);
                }
            }
            // 3. INSERIMENTO DA SELECT (Copia massiva da altro DB)
            else if (blk.actionType === 'insert_select') {
                if (!blk.sourceDbId) {
                    errorsLog.push(`Azione "Copia Righe": Database Sorgente non configurato.`);
                    continue;
                }
                const sourceDbState = AdvancedTable.getTableState(blk.sourceDbId);
                if (!sourceDbState) continue;

                const filteredSourceRows = sourceDbState.rows.filter(r => {
                    if (!blk.filters || blk.filters.length === 0) return true;
                    return blk.filters.every(f => {
                        const colDef = sourceDbState.columns.find(c => c.id === f.colId);
                        return LogicEngine.evaluateCondition(f.operator, f.value, r.cells[f.colId], null, colDef);
                    });
                });

                for (const sRow of filteredSourceRows) {
                    const now = Date.now();
                    const newRow = { id: 'r' + Store.generateId(), createdAt: now, updatedAt: now, cells: {} };
                    
                    targetState.columns.forEach(c => {
                        if (c.type === 'checkbox') newRow.cells[c.id] = false;
                        else if (['multi-select', 'relation'].includes(c.type)) newRow.cells[c.id] = [];
                        else if (['date', 'datetime'].includes(c.type)) newRow.cells[c.id] = c.hasEndDate ? {start:'', end:''} : '';
                        else newRow.cells[c.id] = '';
                    });

                    const dynamicOrigineContext = AdvancedTable._buildRigaContext(sRow, sourceDbState.columns);
                    dynamicOrigineContext._rawRow = sRow; // Passaggio del record nativo per set_from_source_col

                    try {
                        let hasFormulaError = false;

                        for (const act of blk.actions) {
                            const targetColDef = targetState.columns.find(c => c.id === act.colId);
                            if (!targetColDef) continue;

                            let finalVal = await LogicEngine.calculateNewValue(act.type, act.value, act.value2, newRow.cells[act.colId], targetColDef, newRow, targetState, dynamicOrigineContext);
                            
                            if (typeof finalVal === 'string' && (finalVal.includes('Async Err') || finalVal.includes('Err</span>'))) {
                                errorsLog.push(`Errore Formula nel travaso riga [DB: ${UI.escapeHTML(targetState.title)} - Colonna: ${UI.escapeHTML(targetColDef.name)}]`);
                                hasFormulaError = true;
                                break;
                            }

                            if (['select', 'multi-select'].includes(targetColDef.type)) {
                                const arr = Array.isArray(finalVal) ? finalVal : (finalVal ? [finalVal] : []);
                                arr.forEach(strVal => {
                                    if (String(strVal).trim() !== '') {
                                        let opts = targetState.selectOptions[act.colId] || [];
                                        if (!opts.includes(strVal)) targetState.selectOptions[act.colId] = [...opts, strVal];
                                    }
                                });
                            }
                            newRow.cells[act.colId] = finalVal;
                        }

                        if (!hasFormulaError) {
                            targetState.rows.push(newRow);
                            totalRowsAffected++;
                            updatedDbIds.add(targetDbId);

                            if (typeof AdvancedAutomations !== 'undefined') {
                                AdvancedAutomations.evaluate(targetDbId, newRow.id, true);
                                AdvancedAutomations.triggerCrossDB(targetDbId);
                            }
                        }
                    } catch(err) {
                        errorsLog.push(`Creazione Multipla [Riga Sorgente: ${sRow.id}]: ${err.message || String(err)}`);
                    }
                }
            }
            // 4. UPDATE RECORD ESISTENTI
            else {
                let localAffected = 0;
                let rowsToProcess = [];

                if (isThisRowMode && sourceRow) {
                    rowsToProcess.push(sourceRow);
                } else {
                    for (const r of targetState.rows) {
                        let isMatch = true;
                        if (blk.filters && blk.filters.length > 0) {
                            isMatch = blk.filters.every(f => {
                                const colDef = targetState.columns.find(c => c.id === f.colId);
                                return LogicEngine.evaluateCondition(f.operator, f.value, r.cells[f.colId], null, colDef);
                            });
                        }
                        if (isMatch) rowsToProcess.push(r);
                    }
                }

                for (const r of rowsToProcess) {
                    let recordChanged = false;
                    try {
                        for (const act of blk.actions) {
                            const targetColDef = targetState.columns.find(c => c.id === act.colId);
                            if (!targetColDef) continue;

                            let currentVal = r.cells[act.colId];
                            let newVal = await LogicEngine.calculateNewValue(act.type, act.value, act.value2, currentVal, targetColDef, r, targetState, origineContext);

                            // Intercettazione stringhe di errore: impedisce la scrittura di markup errato nella cella
                            if (typeof newVal === 'string' && (newVal.includes('Async Err') || newVal.includes('Err</span>'))) {
                                const titleCol = targetState.columns[0];
                                const rowTitle = titleCol ? r.cells[titleCol.id] : r.id;
                                errorsLog.push(`Errore Formula in riga "<b>${UI.escapeHTML(String(rowTitle).substring(0,30))}</b>" [DB: ${UI.escapeHTML(targetState.title)} - Colonna: ${UI.escapeHTML(targetColDef.name)}]`);
                                continue;
                            }

                            if (['select', 'multi-select'].includes(targetColDef.type)) {
                                const valArray = Array.isArray(newVal) ? newVal : (newVal ? [newVal] : []);
                                valArray.forEach(strVal => {
                                    if (String(strVal).trim() !== '') {
                                        let opts = targetState.selectOptions[act.colId] || [];
                                        if (!opts.includes(strVal)) targetState.selectOptions[act.colId] = [...opts, strVal];
                                    }
                                });
                            }

                            if (JSON.stringify(currentVal) !== JSON.stringify(newVal)) {
                                r.cells[act.colId] = newVal;
                                recordChanged = true;
                            }
                        }

                        if (recordChanged) {
                            r.updatedAt = Date.now();
                            localAffected++;
                            if (typeof AdvancedAutomations !== 'undefined') {
                                AdvancedAutomations.evaluate(targetDbId, r.id, false);
                                AdvancedAutomations.triggerCrossDB(targetDbId);
                            }
                        }
                    } catch(err) {
                        const titleCol = targetState.columns[0];
                        const rowTitle = titleCol ? r.cells[titleCol.id] : r.id;
                        errorsLog.push(`Aggiornamento Riga "<b>${UI.escapeHTML(String(rowTitle).substring(0,30))}</b>" [DB: ${UI.escapeHTML(targetState.title)}]: ${err.message || String(err)}`);
                    }
                }
                
                if (localAffected > 0) {
                    totalRowsAffected += localAffected;
                    updatedDbIds.add(targetDbId);
                }
            }
        }

        return { totalRowsAffected, emailsSent, updatedDbIds, errorsLog };
    }
});