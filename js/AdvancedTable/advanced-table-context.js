/**
 * js/AdvancedTable/advanced-table-context.js
 * Sottomodulo di AdvancedTable.
 * Motore "Virtual Cells" per la risoluzione dei Rollup, 
 * delle Relazioni (Decodifica Nomi) e Formule Matematiche topologiche.
 * Supporto per la risoluzione e visualizzazione del campo 'note_link'.
 * FIX TIMESTAMPS: Inserimento automatico di created_time e last_edited_time in virtualCells.
 * FIX NUMBER CAST: Conversione automatica in Number dei valori numerici letti da formule concatenate,
 * prevenendo il bug di concatenazione testuale ("10" + 10 = "1010").
 */

Object.assign(AdvancedTable, {

    formatTime: (ts) => {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    },

    formatDecimal: (val, decimals) => {
        if (decimals === undefined || decimals === 'default' || val === '' || val === null) return val;
        let numStr = String(val).replace(',', '.');
        const n = parseFloat(numStr);
        if (isNaN(n)) return val;
        return n.toFixed(parseInt(decimals, 10));
    },

    _getLocalISO: (ts) => {
        if (!ts) return "";
        const d = new Date(ts);
        if (isNaN(d.getTime())) return "";
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 16);
    },

    resolveRelationDetails: (colDef, rawValues, renderCache = {}) => {
        const vals = Array.isArray(rawValues) ? rawValues : (rawValues ? [rawValues] : []);
        if (vals.length === 0) return [];

        const targetDbId = colDef.type === 'relation' ? colDef.targetTableId : colDef.linkedTableId;
        if (!targetDbId) return vals.map(id => ({ id: id, name: 'Orfano' }));

        const targetState = AdvancedTable.getTableState(targetDbId);
        if (!targetState) return vals.map(id => ({ id: id, name: 'Orfano' }));

        const displayColId = colDef.type === 'relation' ? colDef.targetColId : targetState.columns[0].id;
        const displayColDef = targetState.columns.find(c => c.id === displayColId);

        // FAST-PATH: Se la colonna bersaglio non è un campo calcolato, saltiamo il pesante motore virtuale
        const isCalculatedCol = displayColDef && ['formula', 'rollup', 'relation_backlink'].includes(displayColDef.type);

        return vals.map(tId => {
            const tRow = targetState.rows.find(r => r.id === tId);
            if (!tRow) return { id: tId, name: 'Orfano' };
            
            let val;
            if (isCalculatedCol) {
                const vRow = AdvancedTable.buildVirtualRow(targetDbId, tRow, targetState, renderCache);
                val = vRow.virtualCells[displayColId];
            } else {
                val = tRow.cells[displayColId];
            }
            
            // Se la colonna target è a sua volta una "Pagina", risolve il titolo reale della nota
            if (displayColDef && displayColDef.type === 'record_note' && val) {
                const note = typeof Store !== 'undefined' ? Store.getNote(val) : null;
                return { id: tId, name: note ? (note.title || 'Senza Titolo') : 'Pagina Orfana' };
            }
            
            // Appiattimento di sicurezza nel caso di array nidificati
            if (Array.isArray(val)) val = val.join(', ');
            
            return { 
                id: tId, 
                name: val !== undefined && val !== null && val !== '' ? String(val) : 'Senza Nome' 
            };
        });
    },

    _resolveRelationNames: (colDef, rawValues, renderCache = {}) => {
        return AdvancedTable.resolveRelationDetails(colDef, rawValues, renderCache).map(rel => rel.name);
    },

    getFormatDisplayValue: (colDef, rawValue, renderCache = {}) => {
        if (!colDef) return String(rawValue || '');
        if (rawValue === undefined || rawValue === null || rawValue === '') return '';

        if (colDef.type === 'record_note') {
            const note = typeof Store !== 'undefined' ? Store.getNote(rawValue) : null;
            return note ? (note.title || 'Senza Titolo') : 'Pagina Orfana';
        }

        if (colDef.type === 'note_link') {
            let linkObj = null;
            if (rawValue && typeof rawValue === 'object') linkObj = rawValue;
            else if (rawValue && typeof rawValue === 'string') {
                try { linkObj = JSON.parse(rawValue); } catch(e) { linkObj = { noteId: rawValue }; }
            }
            if (linkObj && linkObj.noteId) {
                const note = typeof Store !== 'undefined' ? Store.getNote(linkObj.noteId) : null;
                if (note) {
                    return linkObj.anchor ? `${note.title} > ${linkObj.anchor}` : (note.title || 'Senza Titolo');
                }
                return linkObj.title || 'Nota Mancante';
            }
            return '';
        }
        
        if (colDef.type === 'relation' || colDef.type === 'relation_backlink') {
            const details = AdvancedTable.resolveRelationDetails(colDef, rawValue, renderCache);
            let resolvedNames = details.map(d => d.name);
            resolvedNames.sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true, sensitivity: 'base'}));
            return resolvedNames.join(', ');
        }

        if (colDef.type === 'multi-select') {
            const vals = Array.isArray(rawValue) ? [...rawValue] : [rawValue];
            vals.sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true, sensitivity: 'base'}));
            return vals.join(', ');
        }

        // Supporto per date, datetime e oggetti intervallo temporale generati anche da formule
        if (colDef.type === 'date' || colDef.type === 'datetime' || (typeof rawValue === 'object' && rawValue !== null && (rawValue.start !== undefined || rawValue.end !== undefined))) {
             if (typeof rawValue === 'object' && rawValue !== null) {
                 return (rawValue.start || '') + (rawValue.end ? ' ➔ ' + rawValue.end : '');
             }
             return String(rawValue);
        }

        if (colDef.type === 'created_time' || colDef.type === 'last_edited_time') {
             return AdvancedTable.formatTime(rawValue);
        }

        if (colDef.type === 'checkbox') {
             return rawValue ? '☑ Sì' : '☐ No';
        }

        if (Array.isArray(rawValue)) {
             return rawValue.join(', ');
        }

        if (colDef.type === 'number' || colDef.type === 'formula' || colDef.type === 'rollup') {
            const formatted = AdvancedTable.formatDecimal(rawValue, colDef.decimals);
            return formatted !== '' && formatted !== null ? String(formatted) : '';
        }

        return String(rawValue);
    },

    _buildTabellaContext: (renderCache = null) => {
        if (renderCache && renderCache.tabellaContext) {
            return renderCache.tabellaContext;
        }

        const proxy = new Proxy({}, {
            get: function(target, prop) {
                if (prop in target) return target[prop];

                let foundState = null;
                let foundId = null;
                
                if (AppState.databases) {
                    for (const id in AppState.databases) {
                        const s = AppState.databases[id];
                        if (s && !s.isPivot && s.title === prop) {
                            foundState = s;
                            foundId = id;
                            break;
                        }
                    }
                }

                if (!foundState) return [];

                const mappedRows = (foundState.rows || []).map(row => {
                    return new Proxy({}, {
                        get: function(rowTarget, colName) {
                            if (colName in rowTarget) return rowTarget[colName];

                            const c = (foundState.columns || []).find(col => col.name === colName);
                            if (!c) return undefined;

                            let val;
                            if (c.type === 'created_time') {
                                val = AdvancedTable._getLocalISO(row.createdAt);
                            } else if (c.type === 'last_edited_time') {
                                val = AdvancedTable._getLocalISO(row.updatedAt);
                            } else if (c.type === 'relation' || c.type === 'relation_backlink') {
                                const details = AdvancedTable.resolveRelationDetails(c, (row.cells || {})[c.id], renderCache || {});
                                val = details.map(d => d.name);
                            } else if (c.type === 'note_link') {
                                val = AdvancedTable.getFormatDisplayValue(c, (row.cells || {})[c.id], renderCache || {});
                            } else {
                                val = (row.cells || {})[c.id];
                            }

                            rowTarget[colName] = val;
                            return val;
                        }
                    });
                });

                target[prop] = mappedRows;
                return mappedRows;
            }
        });

        if (renderCache) renderCache.tabellaContext = proxy;
        return proxy;
    },

    _buildRigaContext: (row, columns, virtualCells = null, renderCache = {}, tableId = null) => {
        const rigaContext = {};
        
        let noteId = null;
        if (row && row.cells && row.cells['sys_c_note']) {
            noteId = row.cells['sys_c_note']; 
        } else {
            // Risoluzione gerarchica della nota contenitore per sbloccare NOTA_CORRENTE()
            if (tableId && typeof AppState !== 'undefined' && AppState.notes) {
                const trueId = (typeof AdvancedTable !== 'undefined' && typeof AdvancedTable._resolveSourceId === 'function')
                    ? AdvancedTable._resolveSourceId(tableId)
                    : tableId.split('_cited_')[0];
                for (const n of AppState.notes) {
                    if (n.content && (n.content.includes(tableId) || n.content.includes(trueId))) {
                        noteId = n.id;
                        break;
                    }
                }
            }
            if (!noteId && typeof AppState !== 'undefined' && AppState.currentNoteId) {
                noteId = AppState.currentNoteId;
            }
            if (!noteId && columns) {
                const rnCol = (columns || []).find(c => c.type === 'record_note');
                if (rnCol) {
                    noteId = virtualCells ? virtualCells[rnCol.id] : (row && row.cells ? row.cells[rnCol.id] : null);
                }
            }
        }
        rigaContext["_sys_note_id"] = noteId || null; 
        
        return new Proxy(rigaContext, {
            get: function(target, propName) {
                if (propName in target) return target[propName];

                const c = (columns || []).find(col => col.name === propName);
                if (!c) return undefined;

                let cellVal = virtualCells ? virtualCells[c.id] : (row && row.cells ? row.cells[c.id] : undefined);
                let val;

                if (c.type === 'created_time') {
                    val = AdvancedTable._getLocalISO(row ? row.createdAt : null);
                } else if (c.type === 'last_edited_time') {
                    val = AdvancedTable._getLocalISO(row ? row.updatedAt : null);
                } else if (c.type === 'relation' || c.type === 'relation_backlink') {
                    const details = AdvancedTable.resolveRelationDetails(c, cellVal, renderCache);
                    val = details.map(d => d.name);
                } else if (c.type === 'note_link') {
                    val = AdvancedTable.getFormatDisplayValue(c, cellVal, renderCache);
                } else if (c.type !== 'formula') {
                    val = cellVal;
                    // Se una colonna numerica contiene un valore numerico stringa, esegui cast a Number
                    if (c.type === 'number' && typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) {
                        val = Number(val);
                    }
                } else if (virtualCells && virtualCells[c.id] !== undefined) {
                    val = virtualCells[c.id];
                    // FIX CONCATENAZIONE FORMULE: Se il risultato virtuale è un numero salvato come stringa,
                    // restituiscilo come Number nativo per evitare "10" + 10 = "1010"
                    if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) {
                        val = Number(val);
                    }
                }

                target[propName] = val;
                return val;
            }
        });
    },

    buildVirtualRow: (tableId, row, state, renderCache = {}) => {
        let vRow = { ...row, virtualCells: { ...(row.cells || {}) } };

        (state.columns ||[]).forEach(col => {
            // Popolamento unificato e coerente dei timestamp di sistema
            if (col.type === 'created_time') {
                vRow.virtualCells[col.id] = row.createdAt ? AdvancedTable.formatTime(row.createdAt) : '';
                return;
            }
            if (col.type === 'last_edited_time') {
                vRow.virtualCells[col.id] = row.updatedAt ? AdvancedTable.formatTime(row.updatedAt) : '';
                return;
            }

            if (col.type === 'relation_backlink' && col.linkedTableId && col.linkedColId) {
                if (!renderCache.backlinks) renderCache.backlinks = {};
                if (!renderCache.backlinks[col.id]) {
                    renderCache.backlinks[col.id] = {};
                    const sourceState = AdvancedTable.getTableState(col.linkedTableId);
                    if (sourceState) {
                        sourceState.rows.forEach(srcRow => {
                            const vals = srcRow.cells[col.linkedColId];
                            if (Array.isArray(vals)) {
                                vals.forEach(v => {
                                    if (!renderCache.backlinks[col.id][v]) renderCache.backlinks[col.id][v] = [];
                                    renderCache.backlinks[col.id][v].push(srcRow);
                                });
                            }
                        });
                    }
                }

                let backlinks = renderCache.backlinks[col.id][row.id] || [];

                if (col.backlinkDisplay === 'property' && col.backlinkPropertyId) {
                    let props = backlinks.map(r => r.cells[col.backlinkPropertyId]).filter(v => v !== '' && v !== null);
                    props = props.flat(); 
                    
                    if (col.backlinkDistinct) {
                        props = [...new Set(props.map(String))];
                    }
                    
                    if (col.backlinkAggType === 'count') {
                        vRow.virtualCells[col.id] = props.length;
                    } else if (col.backlinkAggType === 'sum') {
                        const nums = props.map(v => parseFloat(v)).filter(n => !isNaN(n));
                        vRow.virtualCells[col.id] = nums.reduce((a, b) => a + b, 0);
                    } else {
                        vRow.virtualCells[col.id] = props.join(', ');
                    }
                } else if (col.backlinkDisplay === 'count') {
                    vRow.virtualCells[col.id] = backlinks.length;
                } else {
                    vRow.virtualCells[col.id] = backlinks.map(r => r.id);
                }
                return;
            }

            if (col.type === 'rollup' && col.relationColId && col.targetColId) {
                const relationVals = (row.cells || {})[col.relationColId];
                if (!relationVals || !Array.isArray(relationVals) || relationVals.length === 0) {
                    vRow.virtualCells[col.id] = '';
                    return;
                }

                const relColDef = state.columns.find(c => c.id === col.relationColId);
                if (!relColDef || !relColDef.targetTableId) return;

                if (!renderCache.rowIndexes) renderCache.rowIndexes = {};
                if (!renderCache.rowIndexes[relColDef.targetTableId]) {
                    renderCache.rowIndexes[relColDef.targetTableId] = {};
                    const ts = AdvancedTable.getTableState(relColDef.targetTableId);
                    if (ts) ts.rows.forEach(r => renderCache.rowIndexes[relColDef.targetTableId][r.id] = { state: ts, row: r });
                }

                const targetState = AdvancedTable.getTableState(relColDef.targetTableId);
                if (!targetState) return;

                const targetColDef = targetState.columns.find(c => c.id === col.targetColId);
                if (!targetColDef) return;

                let rolled = [];
                relationVals.forEach(tId => {
                    const cacheRef = renderCache.rowIndexes[relColDef.targetTableId][tId];
                    if (cacheRef) {
                        const tRow = cacheRef.row;
                        let val;
                        
                        if (targetColDef.type === 'created_time') val = AdvancedTable.formatTime(tRow.createdAt);
                        else if (targetColDef.type === 'last_edited_time') val = AdvancedTable.formatTime(tRow.updatedAt);
                        else if (targetColDef.type === 'formula' && typeof AdvancedTable.evaluateFormula === 'function') {
                            let tVirtualCells = {};
                            targetState.columns.forEach(tc => {
                                if(tc.type === 'created_time') tVirtualCells[tc.id] = AdvancedTable.formatTime(tRow.createdAt);
                                else if(tc.type === 'last_edited_time') tVirtualCells[tc.id] = AdvancedTable.formatTime(tRow.updatedAt);
                                else tVirtualCells[tc.id] = tRow.cells[tc.id];
                            });
                            try {
                                val = AdvancedTable.evaluateFormula(targetColDef.formula, {cells: tVirtualCells, createdAt: tRow.createdAt, updatedAt: tRow.updatedAt}, targetState.columns, relColDef.targetTableId, targetState.title, tVirtualCells, renderCache);
                            } catch(e) { val = ''; }
                        }
                        else val = tRow.cells[col.targetColId];

                        if (val !== undefined && val !== null && val !== '') {
                            if (typeof val === 'object' && !Array.isArray(val)) {
                                if (val.start && val.end) val = `${val.start} ➔ ${val.end}`;
                                else if (val.start) val = val.start;
                                else val = JSON.stringify(val);
                            }
                            if (Array.isArray(val)) rolled.push(...val);
                            else rolled.push(val);
                        }
                    }
                });
                
                vRow.virtualCells[col.id] = [...new Set(rolled)].join(', ');
            }
        });

        // =========================================================
        // ORDINAMENTO TOPOLOGICO FORMULE (Risoluzione Loop & Dipendenze)
        // =========================================================
        const formulaCols = (state.columns || []).filter(c => c.type === 'formula');
        if (formulaCols.length > 0) {
            const resolved = new Set();
            const resolving = new Set();

            const resolveFormula = (col) => {
                if (resolved.has(col.id)) return;
                
                // Prevenzione Paradossi / Loop Infiniti
                if (resolving.has(col.id)) {
                    vRow.virtualCells[col.id] = '⚠️ Riferimento Circolare';
                    resolved.add(col.id);
                    return;
                }
                
                resolving.add(col.id);

                // Cerca dipendenze incrociate analizzando il codice sorgente della formula
                formulaCols.forEach(otherCol => {
                    if (otherCol.id !== col.id && col.formula) {
                        const escapedName = otherCol.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(`riga\\s*\\[\\s*["']${escapedName}["']\\s*\\]|riga\\.${escapedName}\\b`);
                        if (regex.test(col.formula)) {
                            resolveFormula(otherCol);
                        }
                    }
                });

                // Valuta in sicurezza sapendo che le dipendenze a sinistra o destra sono già calcolate in vRow.virtualCells
                vRow.virtualCells[col.id] = (typeof AdvancedTable.evaluateFormula === 'function') ? 
                    AdvancedTable.evaluateFormula(col.formula, vRow, state.columns, tableId, state.title, vRow.virtualCells, renderCache) : '';
                
                resolving.delete(col.id);
                resolved.add(col.id);
            };

            formulaCols.forEach(col => resolveFormula(col));
        }

        return vRow;
    }
});