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
 * MOTORE FILTRI POLIMORFO: Gli operatori (=, !=, <, >, <=, >=) operano in modo intelligente su tutti i tipi:
 * - Numeri: confronto matematico.
 * - Testo/Select: uguaglianza esatta su '=', esclusione di contenimento su '!=', confronto alfabetico naturale su '<, >, <=, >='.
 * LIVE REFRESH DA DISCO: forceRecalculate ricarica i dati freschi dal file system (evitando sovrascritture concorrenti).
 * FEAT CLEAR SELECTION: Aggiunta funzione clearSelectedRows per azzerare tutte le righe selezionate.
 * FEAT INTERVAL ALGEBRA: Supporto completo e unificato per filtri su intervalli temporali e range con delimitatore ➔.
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
                const iso = `${dParts[2]}-${dParts[1].padStart(2, '0')}-${dParts[0].padStart(2, '0')}` + (parts[1] ? `T${parts[1]}` : '');
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

    clearSelectedRows: (tableId) => {
        if (!tableId) return;
        let viewState = AdvancedTable.getState(tableId);
        if (!viewState || viewState.isPivot) return;

        viewState.selectedRows = [];

        const globalSelector = document.getElementById('adv-global-row-selector');
        if (globalSelector) {
            globalSelector.classList.remove('selected');
            const cb = globalSelector.querySelector('input');
            if (cb) cb.checked = false;
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

    forceRecalculate: async (tableId) => {
        if (!tableId) return;
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        if (!realTableId) return;

        // Ricarica reale e sicura dal disco locale se è presente un Workspace
        if (AppState.workspaceHandle && typeof Store.readDatabaseFromDisk === 'function') {
            const freshState = await Store.readDatabaseFromDisk(realTableId);
            if (freshState) {
                AppState.databases[realTableId] = freshState;
                const cryptoPrefix = AppState.documentPassword ? "ENC_" : "RAW_";
                Store._diskHashes.databases[realTableId] = Store._hashObj(freshState, cryptoPrefix);
            }
        }

        // Ricalcola le dipendenze e ridisegna tutte le viste collegate senza forzare sovrascritture sporche
        AdvancedTable.updateDependentViews(realTableId);
        if (typeof AdvancedPivot !== 'undefined') AdvancedPivot.updateDependent(realTableId);

        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast("Tabella e dati ricaricati con successo.", "info");
        }
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
                    const tA = typeof valA === 'number' ? valA : AdvancedTable._parseDateStringToMs(valA) || 0;
                    const tB = typeof valB === 'number' ? valB : AdvancedTable._parseDateStringToMs(valB) || 0;
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
                // Gestione Date Standard e Datetime (Supporto italiano DD/MM/YYYY e Intervalli)
                else if (isDateCol) {
                    const intA = AdvancedTable._extractIntervalFromValue(va);
                    const intB = AdvancedTable._extractIntervalFromValue(vb);
                    const tA = intA ? intA.startMs : 0;
                    const tB = intB ? intB.startMs : 0;
                    diff = tA - tB;
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

                        // 1. Checkbox (Booleani)
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

                        // 2. Date e Datetime (Algebra degli Intervalli Temporali)
                        if (isDateType) {
                            const cellInterval = AdvancedTable._extractIntervalFromValue(cellVal, colDef, r, isPivotContext);
                            const targetInterval = AdvancedTable._extractIntervalFromValue(targetVal);

                            if (cellInterval && targetInterval) {
                                const isTargetRange = targetInterval.startMs !== targetInterval.endMs;
                                
                                if (isTargetRange) {
                                    // Se il filtro è un Range (F_start ➔ F_end):
                                    const overlaps = (cellInterval.startMs <= targetInterval.endMs) && (cellInterval.endMs >= targetInterval.startMs);

                                    if (operator === '=') return overlaps;
                                    if (operator === '!=') return !overlaps;
                                    if (operator === '>') return cellInterval.startMs > targetInterval.endMs;
                                    if (operator === '<') return cellInterval.endMs < targetInterval.startMs;
                                    if (operator === '>=') return cellInterval.endMs >= targetInterval.startMs;
                                    if (operator === '<=') return cellInterval.startMs <= targetInterval.endMs;
                                } else {
                                    // Se il filtro è una data singola:
                                    // Se non ha orario esplicito nel testo target, consideriamo l'intera giornata di 24h
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

                        // 3. Numeri Puri (Matematico)
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
                        
                        // 4. Testo, Alfanumerici, Liste e Select
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

                        // Uguaglianza esatta su stringhe/tag
                        if (operator === '=') {
                            if (resolvedArrayForExactMatch) {
                                return resolvedArrayForExactMatch.some(v => String(v).toLowerCase() === strB);
                            }
                            return strA === strB;
                        }

                        // Disuguaglianza: esclude se coincide o se contiene la parola (es. != rosso)
                        if (operator === '!=') {
                            if (resolvedArrayForExactMatch) {
                                return !resolvedArrayForExactMatch.some(v => {
                                    const low = String(v).toLowerCase();
                                    return low === strB || low.includes(strB);
                                });
                            }
                            return !strA.includes(strB);
                        }

                        // Confronto lessicografico naturale (<, >, <=, >=) su testo
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