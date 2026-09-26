/**
 * AdvancedTableCSV.js
 * Modulo isolato per l'importazione e l'esportazione massiva dei dati da/verso CSV.
 * FIX NAMESPACE: Corretti i riferimenti a TableManager.CSV per parseFullCSV e escapeCSV.
 * FIX IMPORT UX: Aggiunta interfaccia per la selezione del separatore (, ; TAB Altro) prima del parsing.
 * FIX PRESTAZIONI: Inserito scudo protettivo che attiva l'impaginazione automatica (20 righe) 
 * se si importano più di 100 record su una tabella senza limiti, prevenendo il blocco del browser.
 */

Object.assign(AdvancedTable, {

    exportCSV: (tableId) => {
        try {
            let state = AdvancedTable.getState(tableId);
            if (!state) {
                return;
            }

            let csvContent = "";

            if (state.isPivot && typeof AdvancedPivot !== 'undefined') {
                const data = AdvancedPivot.buildPivotData(tableId);
                if (!data || !data.pivotRows) return;

                const headers = state.columns.map(c => TableManager.CSV.escapeCSV(c.name));
                csvContent += headers.join(";") + "\n";

                data.pivotRows.forEach((row, rIdx) => {
                    const rowData = state.columns.map((col, cIdx) => {
                        let val = row.virtualCells[col.id] || '';

                        const isGroup = col.id.startsWith('grp_');
                        if (isGroup && row.rawGroupKeys[cIdx] !== '(Vuoto)') {
                            const srcColDef = data.sourceState.columns.find(c => c.id === col.sourceColId);
                            if (srcColDef && srcColDef.type === 'relation') {
                                const rawArray = Array.isArray(row.rawGroupKeys[cIdx]) ? row.rawGroupKeys[cIdx] : [row.rawGroupKeys[cIdx]];
                                val = rawArray.join(', ');
                            }
                        }

                        if (Array.isArray(val)) val = val.join(', ');
                        return TableManager.CSV.escapeCSV(String(val));
                    });
                    csvContent += rowData.join(";") + "\n";
                });

            } else {
                const visibleCols = state.columns.filter(c => !c.hidden);
                const headers = visibleCols.map(c => TableManager.CSV.escapeCSV(c.name));
                csvContent += headers.join(";") + "\n";

                state.rows.forEach(row => {
                    const vRow = { ...row, virtualCells: { ...row.cells } };
                    state.columns.forEach(col => {
                        if (col.type === 'formula') vRow.virtualCells[col.id] = (typeof AdvancedTable.evaluateFormula === 'function') ? AdvancedTable.evaluateFormula(col.formula, vRow, state.columns, tableId, state.title, vRow.virtualCells) : '';
                        else vRow.virtualCells[col.id] = vRow.cells[col.id];
                    });

                    const rowData = visibleCols.map(col => {
                        let val = vRow.virtualCells[col.id];

                        if (col.type === 'created_time') val = AdvancedTable.formatTime(row.createdAt);
                        else if (col.type === 'last_edited_time') val = AdvancedTable.formatTime(row.updatedAt);
                        else if (col.type === 'checkbox') val = val ? 'Sì' : 'No';
                        else if (col.type === 'date' || col.type === 'datetime') {
                            if (col.hasEndDate && val && typeof val === 'object') {
                                val = `${val.start || ''} -> ${val.end || ''}`;
                            } else if (val && typeof val === 'object') {
                                val = val.start || '';
                            }
                        }
                        else if (col.type === 'relation') {
                            const tState = AdvancedTable.getTableState(col.targetTableId);
                            if (tState && Array.isArray(val)) {
                                val = val.map(tId => {
                                    const tr = tState.rows.find(r => r.id === tId);
                                    return tr ? tr.cells[col.targetColId] : 'Orfano';
                                });
                            }
                            val = Array.isArray(val) ? val.join(', ') : val;
                        }
                        else if (Array.isArray(val)) val = val.join(', ');

                        return TableManager.CSV.escapeCSV(String(val || ''));
                    });
                    csvContent += rowData.join(";") + "\n";
                });
            }

            const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.style.display = "none";
            link.setAttribute("href", url);
            link.setAttribute("download", `${(state.title || "Database").replace(/ /g, '_')}_export.csv`);
            document.body.appendChild(link);
            
            link.click();
            
            setTimeout(() => {
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            }, 300);

        } catch(err) {
            console.error(err);
            alert("Errore tecnico durante l'esportazione della tabella.");
        }
    },

    importCSV: async (tableId) => {
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
        try {
            // 1. Richiesta del file all'utente tramite File System API
            const [fileHandle] = await window.showOpenFilePicker({
                types: [{ description: 'CSV Files', accept: { 'text/csv': ['.csv'] } }],
            });
            const file = await fileHandle.getFile();
            const text = await file.text();

            // 2. Generazione dell'Interfaccia Utente (Drawer) per le opzioni di importazione
            const bodyHTML = `
                <div style="background: rgba(37, 99, 235, 0.05); padding: 15px; border-radius: 6px; border: 1px solid rgba(37, 99, 235, 0.2); margin-bottom: 20px;">
                    <p style="font-size:0.85rem; color:var(--text-secondary); margin:0 0 15px 0; line-height:1.5;">
                        Imposta i parametri corretti in base a come è stato generato il tuo file CSV.
                    </p>
                    
                    <label style="font-size:0.8rem; font-weight:bold; color:var(--text-primary); display:block; margin-bottom:5px;">Separatore dei campi:</label>
                    <select id="advCsvSeparator" class="modern-input" style="width:100%; margin-bottom:10px;" onchange="document.getElementById('advCsvCustomSep').style.display = this.value === 'custom' ? 'block' : 'none'">
                        <option value=";">Punto e Virgola (;)</option>
                        <option value=",">Virgola (,)</option>
                        <option value="TAB">Tabulazione (TAB)</option>
                        <option value="custom">Altro (Specifica)...</option>
                    </select>
                    
                    <input type="text" id="advCsvCustomSep" class="modern-input" style="width:100%; margin-bottom:15px; display:none;" placeholder="Digita un separatore custom (es: | o ~)" maxlength="3">

                    <label style="font-size:0.8rem; font-weight:bold; color:var(--text-primary); display:block; margin-bottom:5px; margin-top:15px; border-top: 1px dashed var(--border-color); padding-top: 15px;">Intestazioni (Nomi delle Colonne):</label>
                    <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; cursor:pointer; color:var(--text-primary);">
                        <input type="checkbox" id="advCsvHasHeaders" checked style="transform:scale(1.2);">
                        La prima riga del file contiene i nomi delle colonne
                    </label>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-left: 25px; margin-top: 5px;">
                        Se <b>spuntato</b>, modificheremo i nomi delle colonne di questo database per farli combaciare con il file.<br>
                        Se <b>deselezionato</b>, inietteremo i dati nudi e crudi da sinistra verso destra.
                    </div>
                </div>
            `;
            
            const footerHTML = `
                <button class="btn" style="color:var(--danger-color); margin-right:auto;" onclick="document.getElementById('advCsvCancel').click()">Annulla</button>
                <button class="btn btn-primary" onclick="document.getElementById('advCsvConfirm').click()"><span style="display:inline-flex; align-items:center; gap:5px;">${typeof Icons !== 'undefined' ? Icons.import : '📥'} Importa Dati</span></button>
                <button id="advCsvCancel" style="display:none;"></button>
                <button id="advCsvConfirm" style="display:none;"></button>
            `;

            UI.openDrawer('📥 Importazione CSV Database', bodyHTML, footerHTML);

            // 3. Attendiamo la decisione dell'utente
            const importConfig = await new Promise((resolve) => {
                document.getElementById('advCsvConfirm').onclick = () => {
                    const sepSelect = document.getElementById('advCsvSeparator').value;
                    let finalSep = sepSelect;
                    
                    if (sepSelect === 'TAB') finalSep = '\t';
                    else if (sepSelect === 'custom') {
                        finalSep = document.getElementById('advCsvCustomSep').value;
                        if (!finalSep) finalSep = ';'; // Fallback di sicurezza
                    }
                    
                    const hasHeaders = document.getElementById('advCsvHasHeaders').checked;
                    resolve({ separator: finalSep, hasHeaders: hasHeaders });
                };
                
                document.getElementById('advCsvCancel').onclick = () => resolve(null);
            });

            // Se l'utente annulla
            if (!importConfig) {
                UI.closeDrawer();
                return;
            }

            UI.closeDrawer();
            if (typeof Editor !== 'undefined') Editor.saveSnapshot();

            // 4. Parsing EFFETTIVO basato sulla scelta dell'utente
            const parsed = TableManager.CSV.parseFullCSV(text, importConfig.separator);
            
            if (parsed.length < 1) {
                alert("Il CSV è vuoto o non è stato possibile dividerlo con il separatore scelto.");
                return;
            }

            let state = AdvancedTable.getState(tableId);

            const colMapping = [];
            const editableCols = state.columns.filter(c => !['formula', 'created_time', 'last_edited_time'].includes(c.type));

            let dataRows = [];

            // 5. Mappatura colonne
            if (importConfig.hasHeaders) {
                const headers = parsed[0];
                dataRows = parsed.slice(1);

                headers.forEach((h, index) => {
                    const cleanHeader = h.trim();
                    let targetCol = editableCols[index];

                    if (targetCol) {
                        const realCol = state.columns.find(c => c.id === targetCol.id);
                        realCol.name = cleanHeader || `Colonna ${index + 1}`;
                        colMapping.push({ index: index, colId: realCol.id, type: realCol.type });
                    } else {
                        const newColId = 'c' + Date.now() + index;
                        state.columns.push({ id: newColId, name: cleanHeader || `Colonna ${index + 1}`, type: 'text', width: 150 });
                        colMapping.push({ index: index, colId: newColId, type: 'text' });
                    }
                });
            } else {
                dataRows = parsed;
                editableCols.forEach((col, index) => {
                    colMapping.push({ index: index, colId: col.id, type: col.type });
                });
            }

            state.rows = []; // Reset righe attuali

            // 6. Costruzione e iniezione Dati
            dataRows.forEach((rowArr, rIdx) => {
                if (rowArr.length === 0 || (rowArr.length === 1 && rowArr[0].trim() === '')) return;

                const now = Date.now();
                const newRow = { id: 'r' + now + '_' + rIdx, createdAt: now, updatedAt: now, cells: {} };

                state.columns.forEach(c => {
                    newRow.cells[c.id] = (c.type === 'checkbox') ? false : (['multi-select', 'relation'].includes(c.type) ? [] : '');
                });

                colMapping.forEach(m => {
                    let rawVal = (rowArr[m.index] || '').trim();

                    if (m.type === 'checkbox') {
                        const lower = rawVal.toLowerCase();
                        newRow.cells[m.colId] = ['sì', 'si', 'yes', 'true', '1', 'v'].includes(lower);
                    } else if (m.type === 'number') {
                        const n = parseFloat(rawVal.replace(',', '.'));
                        newRow.cells[m.colId] = isNaN(n) ? '' : n;
                    } else if (m.type === 'multi-select') {
                        const parts = rawVal.split(',').map(s => s.trim()).filter(s => s);
                        newRow.cells[m.colId] = parts;
                        if (!state.selectOptions[m.colId]) state.selectOptions[m.colId] = [];
                        parts.forEach(p => {
                            if (!state.selectOptions[m.colId].includes(p)) state.selectOptions[m.colId].push(p);
                        });
                    } else if (m.type === 'select') {
                        newRow.cells[m.colId] = rawVal;
                        if (rawVal) {
                            if (!state.selectOptions[m.colId]) state.selectOptions[m.colId] = [];
                            if (!state.selectOptions[m.colId].includes(rawVal)) {
                                state.selectOptions[m.colId].push(rawVal);
                            }
                        }
                    } else if (m.type === 'relation') {
                        // Nelle importazioni, le relazioni restano vuote (richiedono ID specifici)
                        newRow.cells[m.colId] = [];
                    } else {
                        newRow.cells[m.colId] = rawVal;
                    }
                });

                state.rows.push(newRow);
            });

            // FIX PRESTAZIONI IMPORT MASSIVO: 
            // Se stiamo caricando più di 100 righe e la tabella non è limitata, applichiamo un blocco a 20 righe.
            if (dataRows.length > 100 && (!state.pageSize || state.pageSize === 'all')) {
                state.pageSize = 20;
                state.currentPage = 1;
                
                if (typeof UI !== 'undefined' && UI.showToast) {
                    setTimeout(() => {
                        UI.showToast("Impaginazione a 20 righe attivata in automatico per proteggere le prestazioni.", "info");
                    }, 2500); 
                }
            }

            // 7. Salvataggio finale
            AdvancedTable.setState(tableId, state);
            AdvancedTable.renderTable(tableId);
            Store.triggerAutoSave();
            
            if (typeof AdvancedTable.updateDependentViews === 'function') {
                AdvancedTable.updateDependentViews(tableId);
            }
            
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast(`Importati con successo ${dataRows.length} record.`, "success");
            }

        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error(err);
                alert("Errore durante l'importazione: " + err.message);
            }
        }
    }
});