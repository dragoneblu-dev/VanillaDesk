/**
 * AdvancedTableData.js
 * Isolamento delle operazioni CRUD (Create, Read, Update, Delete) per i Database.
 * FIX SEARCH CONTENT: Il filtro text/contains ora cerca anche all'interno del corpo (content) 
 * delle note dedicate (record_note) e non solo nel titolo.
 * Integrazione colonna 'note_link' (Collegamento a Nota).
 * FIX CHECKBOX EXACT MATCH: Supporto a match esatti booleani (= Sì / = No / = true / = false)
 * evitando fallimenti causati da parole chiave descrittive composite.
 * PERF & DOM SHIELD: Uscita immediata (early-exit) in updateData se il valore non è cambiato,
 * prevenendo la distruzione accidentale del DOM e consentendo il click singolo sui campi interattivi.
 */

Object.assign(AdvancedTable, {

    touchRecordUpdate: (tableId, rowId) => {
        if (!tableId || !rowId) return;
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        if (!realTableId) return;

        let state = AdvancedTable.getState(realTableId);
        if (!state || state.isPivot) return;

        const row = state.rows.find(r => r.id === rowId);
        if (row) {
            row.updatedAt = Date.now();
            AdvancedTable.setState(realTableId, state);
            
            // Forza silenziosamente l'aggiornamento visivo di chiunque stia dipendendo da questa tabella
            if (typeof AdvancedPivot !== 'undefined') AdvancedPivot.updateDependent(realTableId);
        }
    },

    updateData: async (tableId, rowId, colId, value) => {
        if (!tableId || !rowId || !colId) return;
        
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        if (!realTableId) return;

        let state = AdvancedTable.getState(realTableId);
        if (!state || state.isPivot) return;

        const row = state.rows.find(r => r.id === rowId);
        if (!row) return;

        // Se il dato non è cambiato, non tocchiamo il DOM
        // Questo impedisce la distruzione del nodo durante il mousedown/mouseup, consentendo il click singolo
        const isChanged = JSON.stringify(row.cells[colId]) !== JSON.stringify(value);
        if (!isChanged) {
            return;
        }

        let oldRowContext = JSON.parse(JSON.stringify(row));
        row.cells[colId] = value;
        row.updatedAt = Date.now();

        AdvancedTable.setState(realTableId, state);

        if (typeof AdvancedAutomations !== 'undefined') {
            await AdvancedAutomations.evaluate(realTableId, rowId, false, oldRowContext);
            await AdvancedAutomations.triggerCrossDB(realTableId); 
        }
        
        state = AdvancedTable.getState(realTableId);
        AdvancedTable.setState(realTableId, state);
        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();

        if (typeof AdvancedPivot !== 'undefined') AdvancedPivot.updateDependent(realTableId);

        const drawer = document.getElementById('advGlobalDrawer');
        const drawerTitle = document.getElementById('advDrawerTitle');
        if (drawer && drawer.classList.contains('open') && drawerTitle && (drawerTitle.innerText.includes('Dettaglio Record') || drawerTitle.innerText.includes('Tag e Proprietà')) && AdvancedTable.activeRecordId === rowId) {
            AdvancedTable.openRecordView(tableId, rowId);
        }

        if (realTableId === 'SYS_PROPERTIES_DB' && typeof UI !== 'undefined' && typeof UI.checkAndUpdatePropertiesIcon === 'function') {
            UI.checkAndUpdatePropertiesIcon(AppState.currentNoteId);
        }
    },

    updateDateRange: async (tableId, rowId, colId, value, part) => {
        if (!tableId || !rowId || !colId) return;

        const realTableId = AdvancedTable._resolveSourceId(tableId);
        if (!realTableId) return;

        let state = AdvancedTable.getState(realTableId);
        if (!state || state.isPivot) return;

        const row = state.rows.find(r => r.id === rowId);
        if (row) {
            let current = row.cells[colId];

            if (typeof current !== 'object' || current === null) {
                current = { start: current || '', end: '' };
            }

            if (value) {
                const newValMs = new Date(value).getTime();
                if (!isNaN(newValMs)) {
                    if (part === 'start' && current.end) {
                        const endMs = new Date(current.end).getTime();
                        if (!isNaN(endMs) && newValMs > endMs) {
                            // Se l'utente avanza la data di inizio oltre la fine,
                            // spingiamo silenziosamente la fine in avanti per mantenere la coerenza
                            current.end = value; 
                        }
                    } else if (part === 'end' && current.start) {
                        const startMs = new Date(current.start).getTime();
                        if (!isNaN(startMs) && newValMs < startMs) {
                            alert("⚠️ ATTENZIONE:\nLa Data di Fine non può essere antecedente alla Data di Inizio.\n\nIl valore è stato reimpostato automaticamente per coincidere con la data di Inizio.");
                            
                            // Sovrascriviamo l'input errato dell'utente con la data di inizio
                            value = current.start; 
                        }
                    }
                }
            }

            let oldRowContext = JSON.parse(JSON.stringify(row));
            current[part] = value;

            if (JSON.stringify(row.cells[colId]) !== JSON.stringify(current)) {
                row.cells[colId] = current;
                row.updatedAt = Date.now();

                AdvancedTable.setState(realTableId, state);

                if (typeof AdvancedAutomations !== 'undefined') {
                    await AdvancedAutomations.evaluate(realTableId, rowId, false, oldRowContext);
                    await AdvancedAutomations.triggerCrossDB(realTableId);
                }
            }
        }
        
        state = AdvancedTable.getState(realTableId);
        AdvancedTable.setState(realTableId, state);
        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();

        if (typeof AdvancedPivot !== 'undefined') AdvancedPivot.updateDependent(realTableId);

        const drawer = document.getElementById('advGlobalDrawer');
        const drawerTitle = document.getElementById('advDrawerTitle');
        if (drawer && drawer.classList.contains('open') && drawerTitle && (drawerTitle.innerText.includes('Dettaglio Record') || drawerTitle.innerText.includes('Tag e Proprietà')) && AdvancedTable.activeRecordId === rowId) {
            // Riapriamo la vista record per far sì che l'interfaccia si aggiorni
            // forzatamente col valore corretto se l'utente aveva inserito quello sbagliato
            AdvancedTable.openRecordView(tableId, rowId);
        }

        if (realTableId === 'SYS_PROPERTIES_DB' && typeof UI !== 'undefined' && typeof UI.checkAndUpdatePropertiesIcon === 'function') {
            UI.checkAndUpdatePropertiesIcon(AppState.currentNoteId);
        }
    },

    addRow: async (e, tableId) => {
        if (e) e.stopPropagation();
        if (!tableId) return;
        
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        if (!realTableId) return;

        let state = AdvancedTable.getState(realTableId);
        if (!state || state.isPivot) return;

        const now = Date.now();
        const newRow = { id: 'r' + Store.generateId(), createdAt: now, updatedAt: now, cells: {} };
        state.columns.forEach(c => {
            if (c.type === 'checkbox') newRow.cells[c.id] = false;
            else if (c.type === 'multi-select' || c.type === 'relation') newRow.cells[c.id] = [];
            else newRow.cells[c.id] = '';
        });
        state.rows.push(newRow);

        AdvancedTable.setState(realTableId, state);

        if (typeof AdvancedAutomations !== 'undefined') {
            await AdvancedAutomations.evaluate(realTableId, newRow.id, true);
            await AdvancedAutomations.triggerCrossDB(realTableId);
        }

        state = AdvancedTable.getState(realTableId);
        AdvancedTable.setState(realTableId, state);
        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();
    },

    deleteRecord: (tableId, rowId) => {
        if (!confirm("Sei sicuro di voler eliminare definitivamente questo record dal database? L'operazione non può essere annullata.")) return;
        
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);
        if(!state) return;

        const row = state.rows.find(r => r.id === rowId);
        if (row) {
            // Pulizia ricorsiva delle Pagine Record collegate per non lasciare file orfani
            state.columns.filter(c => c.type === 'record_note').forEach(c => {
                const noteId = row.cells[c.id];
                if (noteId && typeof UI !== 'undefined' && UI.Trash) UI.Trash.forceHardDeleteRecursive(noteId);
            });
        }

        state.rows = state.rows.filter(r => r.id !== rowId);
        if (state.selectedRows) {
            state.selectedRows = state.selectedRows.filter(id => id !== rowId);
        }

        AdvancedTable.setState(realTableId, state);
        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();
        
        if (typeof UI !== 'undefined' && typeof UI.closeDrawer !== 'undefined') UI.closeDrawer();
    },

    createRecordAtDate: async (tableId, timestampMs, dateColIdOverride = null, groupColId = null, groupValue = null) => {
        if (!tableId) return;

        const realTableId = AdvancedTable._resolveSourceId(tableId);
        if (!realTableId) return;

        let sourceState = AdvancedTable.getState(realTableId);
        let viewState = AdvancedTable.getState(tableId); 

        if (!sourceState || sourceState.isPivot) return;
        if (isNaN(timestampMs)) return;

        const dateColId = dateColIdOverride || (viewState ? (viewState.calendarDateCol || viewState.timelineDateCol) : null) || sourceState.columns.find(c => c.type === 'date' || c.type === 'datetime')?.id;
        
        if (!dateColId) {
            AdvancedTable.addRow(null, tableId);
            return;
        }

        const col = sourceState.columns.find(c => c.id === dateColId);
        if (!col) return;
        
        const d = new Date(timestampMs);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        
        const localISODate = `${yyyy}-${mm}-${dd}`;
        const localISOTime = `${localISODate}T${hh}:${mins}`;

        let startVal = col.type === 'datetime' ? localISOTime : localISODate;
        let endVal = startVal;

        if (col.hasEndDate) {
            if (col.type === 'datetime') {
                const dEnd = new Date(timestampMs + 3600000); 
                const ehh = String(dEnd.getHours()).padStart(2, '0');
                const emins = String(dEnd.getMinutes()).padStart(2, '0');
                const eyyyy = dEnd.getFullYear();
                const emm = String(dEnd.getMonth() + 1).padStart(2, '0');
                const edd = String(dEnd.getDate()).padStart(2, '0');
                endVal = `${eyyyy}-${emm}-${edd}T${ehh}:${emins}`;
            } else {
                const dEnd = new Date(timestampMs + 86400000);
                const eyyyy = dEnd.getFullYear();
                const emm = String(dEnd.getMonth() + 1).padStart(2, '0');
                const edd = String(dEnd.getDate()).padStart(2, '0');
                endVal = `${eyyyy}-${emm}-${edd}`;
            }
        }
        
        const now = Date.now();
        const newRow = { id: 'r' + Store.generateId(), createdAt: now, updatedAt: now, cells: {} };

        sourceState.columns.forEach(c => {
            if (c.id === dateColId) {
                newRow.cells[c.id] = col.hasEndDate ? {start: startVal, end: endVal} : startVal;
            } else if (groupColId && c.id === groupColId) {
                if (c.type === 'multi-select' || c.type === 'relation') {
                    newRow.cells[c.id] = groupValue ? [groupValue] : [];
                } else {
                    newRow.cells[c.id] = groupValue || '';
                }
            } else if (c.type === 'checkbox') {
                newRow.cells[c.id] = false;
            } else if (c.type === 'multi-select' || c.type === 'relation') {
                newRow.cells[c.id] = [];
            } else {
                newRow.cells[c.id] = '';
            }
        });
        
        sourceState.rows.push(newRow);
        AdvancedTable.setState(realTableId, sourceState);

        if (typeof AdvancedAutomations !== 'undefined') {
            await AdvancedAutomations.evaluate(realTableId, newRow.id, true);
            await AdvancedAutomations.triggerCrossDB(realTableId);
        }

        sourceState = AdvancedTable.getState(realTableId);
        AdvancedTable.setState(realTableId, sourceState);
        Store.triggerAutoSave();
        
        AdvancedTable.updateDependentViews(realTableId);
        AdvancedTable.openRecordView(tableId, newRow.id);
    },

    toggleRowSelection: (tableId, rowId, isChecked) => {
        if (!tableId) return;
        let viewState = AdvancedTable.getState(tableId);
        if (!viewState || viewState.isPivot) return;

        if (!viewState.selectedRows) viewState.selectedRows = [];

        if (isChecked) {
            if (!viewState.selectedRows.includes(rowId)) viewState.selectedRows.push(rowId);
        } else {
            viewState.selectedRows = viewState.selectedRows.filter(id => id !== rowId);
        }

        AdvancedTable.setState(tableId, viewState);
        AdvancedTable.renderTable(tableId);
    },

    deleteSelectedRows: (tableId) => {
        if (!tableId) return;
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        if (!realTableId) return;

        let state = AdvancedTable.getState(realTableId);
        let viewState = AdvancedTable.getState(tableId);
        
        if (!state || !viewState || state.isPivot) return;
        if (!viewState.selectedRows || viewState.selectedRows.length === 0) return;

        state.columns.filter(c => c.type === 'record_note').forEach(c => {
            viewState.selectedRows.forEach(rowId => {
                const row = state.rows.find(r => r.id === rowId);
                if (row && row.cells[c.id]) UI.Trash.forceHardDeleteRecursive(row.cells[c.id]);
            });
        });

        state.rows = state.rows.filter(r => !viewState.selectedRows.includes(r.id));
        viewState.selectedRows = [];

        AdvancedTable.setState(realTableId, state);
        if (realTableId !== tableId) AdvancedTable.setState(tableId, viewState);
        
        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();
    },

    addColumn: (tableId, type) => {
        if (!tableId) return;
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        if (!realTableId) return;

        let state = AdvancedTable.getState(realTableId);
        if (!state) return;
        
        const newColId = 'c_' + Store.generateId();

        const typeNames = {
            'text': 'Nuovo Testo',
            'number': 'Nuovo Numero',
            'select': 'Nuova Selezione',
            'multi-select': 'Nuova Selezione Multipla',
            'date': 'Nuova Data',
            'datetime': 'Nuova Data e Ora',
            'time': 'Nuovo Orario',
            'checkbox': 'Nuova Spunta',
            'formula': 'Nuova Formula',
            'relation': 'Nuova Relazione',
            'rollup': 'Nuovo Rollup',
            'url': 'Nuovo Link',
            'created_time': 'Data Creazione',
            'last_edited_time': 'Ultima Modifica',
            'record_note': 'Pagina Record',
            'note_link': 'Collegamento a Nota'
        };
        const colName = typeNames[type] || 'Nuova Colonna';

        const newCol = { id: newColId, name: colName, type: type, width: 150 };
        if (state.isPivot && type === 'formula') newCol.isViewFormula = true;

        state.columns.push(newCol);

        if (!state.isPivot) {
            state.rows.forEach(r => {
                if (type === 'checkbox') r.cells[newColId] = false;
                else if (type === 'multi-select' || type === 'relation') r.cells[newColId] = [];
                else r.cells[newColId] = '';
            });
        }

        AdvancedTable.setState(realTableId, state);
        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();
        AdvancedTable.closeDropdowns(true);

        if (type === 'relation') {
            AdvancedTable.openRelationConfig(realTableId, newColId);
        } else if (type === 'rollup') {
            AdvancedTable.openRollupConfig(realTableId, newColId);
        } else if (type === 'formula') {
            AdvancedTable.editFormula(realTableId, newColId);
        }
        
        if (realTableId === 'SYS_PROPERTIES_DB' && AdvancedTable.activeRecordId) {
            AdvancedTable.openRecordView(tableId, AdvancedTable.activeRecordId);
        }
    },

    restoreHiddenColInView: (tableId, colId) => {
        if (!tableId) return;
        let state = AdvancedTable.getState(tableId);
        if (!state || !state.isPivot) return;

        const col = state.columns.find(c => c.id === colId);
        if (col) {
            col.hidden = false;
            AdvancedTable.setState(tableId, state);
            AdvancedTable.renderTable(tableId);
            Store.triggerAutoSave();
            AdvancedTable.closeDropdowns(true);
        }
    },

    forceRecalculate: (tableId) => {
        if (!tableId) return;
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        if (!realTableId) return;

        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();
        if (typeof AdvancedPivot !== 'undefined') AdvancedPivot.updateDependent(realTableId);
    },

    changePage: (tableId, delta) => {
        if (!tableId) return;
        let state = AdvancedTable.getState(tableId);
        if (!state) return;
        if (!state.currentPage) state.currentPage = 1;
        state.currentPage += delta;
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
    },

    togglePageSizeMenu: (e, tableId) => {
        e.stopPropagation();
        AdvancedTable.closeDropdowns(true);
        if (!tableId) return;
        const state = AdvancedTable.getState(tableId);
        if (!state) return;

        const dropdown = document.createElement('div');
        dropdown.className = 'adv-dropdown';
        dropdown.id = 'advPageSizeDropdown';

        dropdown.onmousedown = (ev) => ev.stopPropagation();
        dropdown.onclick = (ev) => ev.stopPropagation();

        const opts = [
            { val: 'all', label: 'Tutte (Nessuna impaginazione)' },
            { val: 10, label: '10 righe per pagina' },
            { val: 20, label: '20 righe per pagina' },
            { val: 50, label: '50 righe per pagina' }
        ];

        let html = `<div class="adv-dropdown-title">Righe per pagina</div>`;
        opts.forEach(opt => {
            let isActive = (state.pageSize || 'all') == opt.val;
            html += `<div class="adv-dropdown-item ${isActive ? 'active' : ''}" onclick="AdvancedTable.setPageSize('${tableId}', '${opt.val}')">
                        <span>${opt.label}</span>
                     </div>`;
        });

        dropdown.innerHTML = html;
        document.body.appendChild(dropdown);
        AdvancedTable._positionDropdown(dropdown, e.currentTarget.id);
    },

    setPageSize: (tableId, size) => {
        if (!tableId) return;
        let state = AdvancedTable.getState(tableId);
        if (!state) return;
        state.pageSize = size;
        state.currentPage = 1;
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
        AdvancedTable.closeDropdowns(true);
        Store.triggerAutoSave();
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

                // Riconoscimento logico del vero tipo di dato per i raggruppamenti (grp_X)
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

                // Gestione Speciale Date di Sistema (Per le tabelle normali)
                if (colDef.type === 'created_time' || colDef.type === 'last_edited_time') {
                    const valA = colDef.type === 'created_time' ? a.createdAt : a.updatedAt;
                    const valB = colDef.type === 'created_time' ? b.createdAt : b.updatedAt;
                    const tA = new Date(valA).getTime() || 0;
                    const tB = new Date(valB).getTime() || 0;
                    diff = tA - tB;
                }
                // Gestione Speciale Pagine Record Note
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
                // Gestione Date Standard e Datetime (Supporto italiano DD/MM/YYYY)
                else if (isDateCol) {
                    if (typeof va === 'object' && va !== null) va = va.start;
                    if (typeof vb === 'object' && vb !== null) vb = vb.start;

                    let tA = va ? new Date(va).getTime() : 0;
                    let tB = vb ? new Date(vb).getTime() : 0;
                    
                    if (isNaN(tA) && typeof va === 'string' && va.includes('/')) {
                        const pA = va.split(' ')[0].split('/'); 
                        if(pA.length === 3) tA = new Date(`${pA[2]}-${pA[1]}-${pA[0]}`).getTime();
                    }
                    if (isNaN(tB) && typeof vb === 'string' && vb.includes('/')) {
                        const pB = vb.split(' ')[0].split('/'); 
                        if(pB.length === 3) tB = new Date(`${pB[2]}-${pB[1]}-${pB[0]}`).getTime();
                    }
                    diff = (isNaN(tA) ? 0 : tA) - (isNaN(tB) ? 0 : tB);
                }
                // Numeri e Formule Matematiche
                else if (!isNaN(parseFloat(va)) && !isNaN(parseFloat(vb)) && va !== '' && vb !== '') {
                    diff = parseFloat(va) - parseFloat(vb);
                } 
                // Testo generico
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
    // MOTORE CENTRALE FILTRAGGIO DATI
    // ==========================================
    filterRows: (viewRows, state, isPivotContext = false, sourceStateForPivot = null) => {
        if (!state || !state.filters || Object.keys(state.filters).length === 0) return viewRows;

        let filtered = [...viewRows];
        
        Object.keys(state.filters).forEach(cId => {
            const rawTerm = state.filters[cId].trim();
            if (!rawTerm) return;

            const terms = rawTerm.split(';').map(t => t.trim()).filter(t => t);
            if (terms.length === 0) return;

            const colDef = state.columns.find(c => c.id === cId);
            if (!colDef) return;
            
            // Risoluzione tipo Data nativa o derivata da sorgente Pivot
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
                    // Delega tutta la risoluzione complessa alla funzione centrale
                    displayStr = AdvancedTable.getFormatDisplayValue(colDef, cellVal);
                    
                    if (colDef.type === 'checkbox') {
                        if (cellVal === true) displayStr += ' completato true checked sì si yes';
                        if (cellVal === false) displayStr += ' falso false unchecked no';
                    }
                    if (isDateType) {
                        displayStr += " " + cellVal; 
                    }
                    // FIX RECORD NOTE SEARCH: Estraiamo il corpo della nota per permettere 
                    // la ricerca profonda all'interno dei record
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

                        // RISOLUZIONE ACCURATA BOOLEANA PER CHECKBOX
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
                            let rawDateForMath = cellVal;
                            if (typeof cellVal === 'object' && cellVal !== null) rawDateForMath = cellVal.start;
                            if (colDef.type === 'created_time' && !isPivotContext) rawDateForMath = r.createdAt;
                            if (colDef.type === 'last_edited_time' && !isPivotContext) rawDateForMath = r.updatedAt;

                            let cellDate = null;
                            if (rawDateForMath && typeof rawDateForMath === 'string' && rawDateForMath.includes('/')) {
                                const p = rawDateForMath.split(' ')[0].split('/');
                                if(p.length === 3) cellDate = new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime();
                            } else {
                                cellDate = new Date(rawDateForMath).getTime();
                            }

                            let targetDate = null;
                            if (targetVal.includes('/')) {
                                const p = targetVal.split(' ')[0].split('/');
                                if(p.length === 3) targetDate = new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime();
                            } else {
                                targetDate = new Date(targetVal).getTime();
                            }

                            if (cellDate && targetDate && !isNaN(cellDate) && !isNaN(targetDate)) {
                                if (operator === '>') return cellDate > targetDate;
                                if (operator === '<') return cellDate < targetDate;
                                if (operator === '>=') return cellDate >= targetDate;
                                if (operator === '<=') return cellDate <= targetDate;
                                if (operator === '=') return cellDate === targetDate;
                                if (operator === '!=') return cellDate !== targetDate;
                            }
                        }

                        const cNum = parseFloat(cellVal);
                        const tNum = parseFloat(targetVal);

                        if (!isNaN(cNum) && !isNaN(tNum)) {
                            if (operator === '>') return cNum > tNum;
                            if (operator === '<') return cNum < tNum;
                            if (operator === '>=') return cNum >= tNum;
                            if (operator === '<=') return cNum <= tNum;
                            if (operator === '=') return cNum === tNum;
                            if (operator === '!=') return cNum !== tNum;
                        }
                        
                        let resolvedArrayForExactMatch = null;
                        if (!isPivotContext) {
                            if (colDef.type === 'relation' || colDef.type === 'relation_backlink') {
                                resolvedArrayForExactMatch = AdvancedTable._resolveRelationNames(colDef, cellVal);
                            } else if (colDef.type === 'multi-select') {
                                resolvedArrayForExactMatch = Array.isArray(cellVal) ? cellVal : (cellVal ? [cellVal] : []);
                            }
                        }

                        if (operator === '!=') {
                            if (resolvedArrayForExactMatch) {
                                return !resolvedArrayForExactMatch.some(v => String(v).toLowerCase() === targetVal.toLowerCase());
                            }
                            return String(displayStr || '').toLowerCase() !== targetVal.toLowerCase();
                        }
                        if (operator === '=') {
                            if (resolvedArrayForExactMatch) {
                                return resolvedArrayForExactMatch.some(v => String(v).toLowerCase() === targetVal.toLowerCase());
                            }
                            return String(displayStr || '').toLowerCase() === targetVal.toLowerCase();
                        }
                    }

                    return String(displayStr || '').toLowerCase().includes(term.toLowerCase());
                });
            });
        });
        
        return filtered;
    }
});