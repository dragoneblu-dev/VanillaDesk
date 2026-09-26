/**
 * AdvancedTableAutomations-UI.js
 * INTERFACCIA UTENTE: Rendering Pannello (Drawer), Builder, Eventi Drag&Drop.
 * FIX FILTRI: Aggiunta opzione SYS_JS_FORMULA per creare Trigger dinamici.
 * FIX UI FORMULE: Qualsiasi azione di tipo formula ora apre la Textarea estesa.
 * REFACTOR: Usa AutomationUIBuilder per generare i selettori di Colore e abbattere duplicazioni.
 */

Object.assign(AdvancedAutomations, {
    draggedAutoIdx: null,

    openPanel: (e, tableId) => {
        if (e) e.stopPropagation();
        AdvancedTable.closeDropdowns(true);

        const state = AdvancedTable.getState(tableId);
        if (!state) return;

        if (!state.automations) state.automations = [];

        AdvancedAutomations._tempCondRules = null; // reset safety
        AdvancedAutomations._renderPanel(tableId, state);
    },

    _renderPanel: (tableId, state) => {
        let listHTML = '';

        if (state.automations.length === 0) {
            listHTML = `
                <div style="text-align:center; padding:30px 10px; background: rgba(0,0,0,0.02); border-radius: 8px; border: 1px dashed var(--border-color);">
                    <div style="margin-bottom:10px; color:var(--accent-color);">${Icons.lightning}</div>
                    <div style="color:var(--text-secondary); font-size:0.9rem;">Il database è attualmente manuale.<br>Aggiungi un'automazione per fargli fare il lavoro sporco.</div>
                </div>
            `;
        } else {
            state.automations.forEach((auto, idx) => {

                const errors = AdvancedAutomations._validateAutomation(auto, state);
                auto.isValid = errors.length === 0;

                const isActive = auto.active !== false && auto.isValid;
                const safeName = (auto.name || 'Automazione ' + (idx + 1)).replace(/</g, '&lt;').replace(/>/g, '&gt;');

                let errorBanner = '';
                if (!auto.isValid) {
                    errorBanner = `<div style="background: rgba(239, 68, 68, 0.1); color: var(--danger-color); padding: 8px; border-radius: 4px; font-size: 0.75rem; margin-bottom: 10px;">
                        <b>⚠️ Errore Configurazione:</b><br> ${errors.join('<br>')}
                    </div>`;
                }

                listHTML += `
                    <div class="drag-item" draggable="true" 
                         ondragstart="AdvancedAutomations.onDragStart(event, ${idx})" 
                         ondragover="AdvancedAutomations.onDragOver(event)" 
                         ondragleave="AdvancedAutomations.onDragLeave(event)" 
                         ondrop="AdvancedAutomations.onDrop(event, '${tableId}', ${idx})" 
                         style="display:flex; flex-direction:column; background:var(--bg-color); border:1px solid ${auto.isValid ? 'var(--border-color)' : 'var(--danger-color)'}; border-radius:8px; padding:12px; margin-bottom:12px; cursor:move; transition: transform 0.1s, box-shadow 0.1s;">
                        
                        ${errorBanner}

                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; pointer-events:none;">
                            <span style="font-weight:bold; color: ${auto.isValid ? 'var(--text-primary)' : 'var(--danger-color)'}; display:flex; align-items:center; gap:8px;">
                                <span style="opacity:0.3; font-size:1.2rem;">⠿</span>
                                ${safeName}
                            </span>
                            <label style="display:flex; align-items:center; gap:5px; font-size:0.8rem; cursor:pointer; pointer-events:auto; background: ${isActive ? 'rgba(34, 197, 94, 0.1)' : 'var(--item-hover)'}; color: ${isActive ? '#166534' : 'var(--text-secondary)'}; padding: 4px 8px; border-radius: 12px; font-weight: bold;">
                                <input type="checkbox" style="margin:0;" ${isActive ? 'checked' : ''} ${!auto.isValid ? 'disabled' : ''} onchange="AdvancedAutomations.toggleActive(event, '${tableId}', '${auto.id}', this.checked)">
                                ${isActive ? 'Attiva' : (auto.isValid ? 'Spenta' : 'Bloccata')}
                            </label>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <button class="btn" style="flex:1; font-size:0.8rem; border-color: var(--border-color); color: var(--text-primary);" onclick="AdvancedAutomations.editAutomation(event, '${tableId}', '${auto.id}')"><span style="margin-right:5px; display:flex; align-items:center;">${Icons.edit}</span> Modifica / Correggi</button>
                            
                            <button class="adv-icon-btn" style="padding:0 12px; background: rgba(37, 99, 235, 0.05); border: 1px solid rgba(37, 99, 235, 0.2); border-radius:4px; color: var(--accent-color); display:flex; align-items:center; justify-content:center;" onclick="AdvancedAutomations.runMassiveAutomation(event, '${tableId}', '${auto.id}')" title="Esegui su tutte le righe">${Icons.play}</button>

                            <button class="adv-icon-btn danger" style="padding:0 12px; background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.2); border-radius:4px; color: var(--danger-color); display:flex; align-items:center; justify-content:center;" onclick="AdvancedAutomations.deleteAutomation(event, '${tableId}', '${auto.id}')" title="Elimina">${Icons.trash}</button>
                        </div>
                    </div>
                `;
            });
            listHTML += `<div class="drag-item" ondragover="AdvancedAutomations.onDragOver(event)" ondragleave="AdvancedAutomations.onDragLeave(event)" ondrop="AdvancedAutomations.onDrop(event, '${tableId}', ${state.automations.length})" style="height:15px;"></div>`;
        }

        const bodyHTML = `
            <div style="margin-bottom:20px;">
                <p style="font-size:0.85rem; color:var(--text-secondary); line-height:1.5;">
                    Le automazioni scattano in sequenza dall'alto verso il basso. Trascinane una per riordinarla. Le automazioni sono basate sugli eventi (scattano quando modifichi una cella). Clicca sul tasto "Play" per applicarle forzatamente allo storico.
                </p>
                <button class="btn btn-primary" style="width:100%; justify-content:center; padding:10px; font-size:0.9rem;" onclick="AdvancedAutomations.createAutomation(event, '${tableId}')"><span style="margin-right:8px; display:flex;">${Icons.lightning}</span> Nuova Automazione</button>
            </div>
            ${listHTML}
        `;

        UI.openDrawer(`Automazioni Database`, bodyHTML, null);
    },

    onDragStart: (e, index) => {
        AdvancedAutomations.draggedAutoIdx = index;
        e.dataTransfer.effectAllowed = 'move';
        e.target.closest('.drag-item').style.opacity = '0.5';
    },

    onDragOver: (e) => {
        e.preventDefault();
        const target = e.target.closest('.drag-item');
        if (target) target.style.borderTop = '3px solid var(--accent-color)';
    },

    onDragLeave: (e) => {
        const target = e.target.closest('.drag-item');
        if (target) target.style.borderTop = '1px solid var(--border-color)';
    },

    onDrop: (e, tableId, targetIdx) => {
        e.preventDefault();
        const srcIdx = AdvancedAutomations.draggedAutoIdx;
        AdvancedAutomations.draggedAutoIdx = null;

        document.querySelectorAll('.drag-item').forEach(el => {
            el.style.opacity = '1';
            el.style.borderTop = '1px solid var(--border-color)';
        });

        if (srcIdx === null || srcIdx === targetIdx) return;

        let state = AdvancedTable.getState(tableId);
        const [auto] = state.automations.splice(srcIdx, 1);

        let newTarget = targetIdx;
        if (srcIdx < targetIdx) newTarget--;

        state.automations.splice(newTarget, 0, auto);

        AdvancedTable.setState(tableId, state);
        Store.triggerAutoSave();
        AdvancedAutomations._renderPanel(tableId, state);
    },

    toggleActive: (e, tableId, autoId, isActive) => {
        if (e) e.stopPropagation();
        let state = AdvancedTable.getState(tableId);
        const auto = state.automations.find(a => a.id === autoId);
        if (auto) {
            auto.active = isActive;
            AdvancedTable.setState(tableId, state);
            Store.triggerAutoSave();
            AdvancedTable.renderTable(tableId);
            AdvancedAutomations._renderPanel(tableId, state);
        }
    },

    deleteAutomation: (e, tableId, autoId) => {
        if (e) e.stopPropagation();
        if (!confirm("Sei sicuro di voler eliminare questa automazione?")) return;
        let state = AdvancedTable.getState(tableId);
        state.automations = state.automations.filter(a => a.id !== autoId);
        AdvancedTable.setState(tableId, state);
        Store.triggerAutoSave();
        AdvancedAutomations._renderPanel(tableId, state);
        AdvancedTable.renderTable(tableId);
    },

    createAutomation: (e, tableId) => {
        if (e) e.stopPropagation();
        const state = AdvancedTable.getState(tableId);
        const firstColId = state.columns.length > 0 ? state.columns[0].id : '';

        AdvancedAutomations._tempAuto = {
            id: 'a_' + Date.now(),
            name: '',
            active: true,
            triggers: [{ colId: firstColId, operator: '=', value: '', dateMode: 'exact', dateShift: 0 }],
            actions: [{ colId: firstColId, type: 'set_fixed', value: '' }]
        };
        AdvancedAutomations._renderBuilder(tableId);
    },

    editAutomation: (e, tableId, autoId) => {
        if (e) e.stopPropagation();
        const state = AdvancedTable.getState(tableId);
        const auto = state.automations.find(a => a.id === autoId);
        if (!auto) return;

        AdvancedAutomations._tempAuto = JSON.parse(JSON.stringify(auto));
        AdvancedAutomations._renderBuilder(tableId);
    },

    _buildRelationOptions: (colDef, selectedVal) => {
        const tState = AdvancedTable.getTableState(colDef.targetTableId);
        if (!tState) return '<option value="">-- Errore DB --</option>';

        let opts = '<option value="">-- Seleziona --</option>';
        tState.rows.forEach(r => {
            let name = String(r.cells[colDef.targetColId] || 'Senza nome').replace(/"/g, '&quot;');
            let sel = String(r.id) === String(selectedVal) ? 'selected' : '';
            opts += `<option value="${r.id}" ${sel}>${name}</option>`;
        });
        return opts;
    },

    _getAllDatabases: () => {
        const dbList = [];
        if (AppState.databases) {
            Object.keys(AppState.databases).forEach(id => {
                const s = AppState.databases[id];
                if (s && !s.isPivot && !s.isLinkedView && s.columns && !id.includes('adv_code_') && !id.includes('adv_btnbar_') && !id.includes('adv_cols_') && !id.includes('adv_journal_')) {
                    dbList.push({ id: id, title: s.title || 'Database Sconosciuto' });
                }
            });
        }
        return dbList;
    },

    _toggleTimerDay: (e, idx, dayCode) => {
        if (e) e.stopPropagation();
        const trigger = AdvancedAutomations._tempAuto.triggers[idx];
        
        let days = trigger.operator === 'every_day' ? ['1','2','3','4','5','6','0'] : trigger.operator.split(',');
        
        if (days.includes(dayCode)) {
            days = days.filter(d => d !== dayCode);
        } else {
            days.push(dayCode);
        }

        if (days.length === 7 || days.length === 0) trigger.operator = 'every_day';
        else trigger.operator = days.join(',');

        const tId = document.querySelector('.adv-drawer').querySelector('.btn-primary').getAttribute('onclick').match(/'([^']+)'/)[1];
        AdvancedAutomations._renderBuilder(tId);
    },

    _updateTimerShift: (idx) => {
        const numEl = document.getElementById(`shiftNum_${idx}`);
        const unitEl = document.getElementById(`shiftUnit_${idx}`);
        const dirEl = document.getElementById(`shiftDir_${idx}`);
        
        if (!numEl || !unitEl || !dirEl) return;
        
        const num = parseInt(numEl.value) || 0;
        const unit = parseInt(unitEl.value) || 1;
        const dir = parseInt(dirEl.value) || 1;
        
        const totalMins = num * unit * dir;
        
        AdvancedAutomations._tempAuto.triggers[idx].dateShift = totalMins;
    },

    _renderBuilder: (tableId) => {
        const state = AdvancedTable.getState(tableId);
        const auto = AdvancedAutomations._tempAuto;
        const cols = state.columns;
        const allDBs = AdvancedAutomations._getAllDatabases();
        
        const formulaPreviews = [];

        let colOptions = ``;
        cols.forEach(c => {
            const safeColName = String(c.name).replace(/"/g, '&quot;');
            let icon = '📄';
            if(c.type === 'text') icon = Icons.text;
            if(c.type === 'number') icon = Icons.number;
            if(c.type === 'select') icon = Icons.select;
            if(c.type === 'multi-select') icon = Icons.multiSelect;
            if(c.type === 'date' || c.type === 'datetime') icon = Icons.date;
            if(c.type === 'time') icon = Icons.time;
            if(c.type === 'checkbox') icon = Icons.checkbox;
            if(c.type === 'formula') icon = Icons.formula;
            if(c.type === 'relation') icon = Icons.relation;
            if(c.type === 'url') icon = Icons.url;

            if (c.type === 'record_note') {
                colOptions += `<option value="${c.id}_TITLE">${Icons.recordPage} ${safeColName} (Titolo)</option>`;
                colOptions += `<option value="${c.id}_CONTENT">${Icons.recordPage} ${safeColName} (Corpo Nota)</option>`;
            } else {
                colOptions += `<option value="${c.id}">${icon} ${safeColName}</option>`;
            }
        });

        colOptions += `</optgroup><optgroup label="Avanzate"><option value="SYS_JS_FORMULA" style="color:var(--accent-color); font-weight:bold;">Formula JS (Personalizzata)</option></optgroup>`;

        const dateCols = cols.filter(c => c.type === 'date' || c.type === 'datetime');

        let triggersHTML = '';
        if (auto.triggers.length === 0) {
            triggersHTML = `<div style="font-size:0.8rem; color:#888; margin:10px 0; text-align:center;">L'automazione scatterà ad <b>ogni singola modifica</b> della riga.</div>`;
        } else {
            auto.triggers.forEach((t, idx) => {
                const isFirst = idx === 0;
                
                let actualColId = t.colId;
                if (actualColId.endsWith('_TITLE')) actualColId = actualColId.replace('_TITLE', '');
                if (actualColId.endsWith('_CONTENT')) actualColId = actualColId.replace('_CONTENT', '');

                let tColDef = null;
                if (actualColId === 'SYS_JS_FORMULA') {
                    tColDef = { id: 'SYS_JS_FORMULA', type: 'special' };
                } else {
                    tColDef = cols.find(c => c.id === actualColId);
                }

                const safeVal = String(t.value || '').replace(/"/g, '&quot;');

                const isSystemEvent = t.colId.startsWith('SYS_') && t.colId !== 'SYS_JS_FORMULA';
                let valInput = '';
                let operatorOptions = '';
                let isHiddenValue = true;
                let rowLayout = `display:flex; gap:8px; margin-bottom:8px; align-items:center;`;
                let colSelectFlex = `flex:2;`;

                if (isSystemEvent) {
                    if (t.colId === 'SYS_TIMER') {
                        rowLayout = `display:flex; flex-direction:column; gap:10px; margin-bottom:15px; align-items:flex-start;`;
                        colSelectFlex = `width:100%;`;

                        const isColumnBased = t.operator === 'col_reference';
                        const isExactDate = t.operator === 'exact_date';
                        const isFormula = t.operator === 'formula';
                        
                        const renderDayBtn = (label, code, activeArray) => {
                            const isActive = activeArray.includes(code);
                            return `<button class="adv-icon-btn" style="flex:1; border:1px solid ${isActive ? 'var(--accent-color)' : 'var(--border-color)'}; background:${isActive ? 'rgba(37,99,235,0.1)' : 'var(--bg-color)'}; color:${isActive ? 'var(--accent-color)' : 'var(--text-secondary)'}; font-weight:bold; padding:4px 0; opacity:1;" onclick="AdvancedAutomations._toggleTimerDay(event, ${idx}, '${code}')">${label}</button>`;
                        };

                        let modeSelectHtml = `
                            <select class="modern-input" style="width:100%; font-weight:bold; margin-bottom:10px; background:rgba(0,0,0,0.02); padding:10px; border-radius:6px;" onchange="AdvancedAutomations._updateTrigger(event, ${idx}, 'operator', this.value)">
                                <option value="every_day" ${!isColumnBased && !isExactDate && !isFormula ? 'selected' : ''}>Orario Fisso (Ricorrente)</option>
                                <option value="exact_date" ${isExactDate ? 'selected' : ''}>Data e Ora esatta (Una tantum)</option>
                                <option value="col_reference" ${isColumnBased ? 'selected' : ''} ${dateCols.length===0 ? 'disabled' : ''}>Basato su Colonna Data del Record</option>
                                <option value="formula" ${isFormula ? 'selected' : ''}>Formula JS (Personalizzata)</option>
                            </select>
                        `;

                        if (isExactDate) {
                            valInput = `
                                <div style="display:flex; flex-direction:column; width:100%;">
                                    ${modeSelectHtml}
                                    <div style="display:flex; align-items:center; gap:10px; width:100%; background:var(--bg-color); border:1px solid var(--border-color); padding:10px; border-radius:6px;">
                                        <span style="font-size:0.8rem; font-weight:bold; color:var(--text-secondary);">L'azione scatterà ESATTAMENTE il:</span>
                                        <input type="datetime-local" class="modern-input" style="flex:1; padding:6px; font-size:1rem; font-weight:bold; color:var(--accent-color);" value="${safeVal}" onchange="AdvancedAutomations._updateTrigger(event, ${idx}, 'value', this.value)">
                                    </div>
                                </div>
                            `;
                        } else if (isFormula) {
                            const inputId = `in_trg_timer_${idx}`;
                            const prevId = `prev_trg_timer_${idx}`;
                            
                            formulaPreviews.push({ id: prevId, inputId: inputId, formula: t.value || '', targetState: state, filters: [] });

                            valInput = `
                                <div style="display:flex; flex-direction:column; width:100%;">
                                    ${modeSelectHtml}
                                    <div style="display:flex; flex-direction:column; gap:5px; width:100%; background:var(--bg-color); border:1px solid var(--border-color); padding:10px; border-radius:6px;">
                                        <div style="display:flex; justify-content:space-between; align-items:center;">
                                            <span style="font-size:0.8rem; font-weight:bold; color:var(--text-secondary);">Condizione Javascript (deve ritornare TRUE):</span>
                                            <button class="btn" style="padding:2px 6px; font-size:0.75rem;" onclick="LogicEngine.copyAutomationAIPrompt(event, '${tableId}', 'btn_prompt_timer_${idx}')" id="btn_prompt_timer_${idx}">${Icons.clipboard} Aiuto AI</button>
                                        </div>
                                        <textarea id="${inputId}" class="modern-input" style="width:100%; font-family:monospace; min-height:80px; resize:vertical; font-size:0.85rem; color:var(--accent-color);" placeholder="Es: riga['Stato'] === 'In Lavorazione' && OGGI() === '2025-12-31'" oninput="AdvancedAutomations._updateTrigger(event, ${idx}, 'value', this.value)">${safeVal}</textarea>
                                        <div id="${prevId}" style="width:100%; background:rgba(0,0,0,0.02); padding:8px; border-radius:4px; font-family:monospace; font-size:0.85rem; border:1px dashed var(--border-color); margin-top:5px;"></div>
                                        <div style="font-size:0.75rem; color:var(--text-secondary); opacity:0.8; margin-top:5px;">Il motore verificherà questa formula per ogni singola riga del database ogni minuto. Usala con cautela.</div>
                                    </div>
                                </div>
                            `;
                        } else if (!isColumnBased) {
                            let activeDays = t.operator === 'every_day' ? ['1','2','3','4','5','6','0'] : t.operator.split(',');
                            valInput = `
                                <div style="display:flex; flex-direction:column; width:100%;">
                                    ${modeSelectHtml}
                                    <div style="display:flex; gap:2px; width:100%; margin-bottom:10px;">
                                        ${renderDayBtn('L', '1', activeDays)}
                                        ${renderDayBtn('M', '2', activeDays)}
                                        ${renderDayBtn('M', '3', activeDays)}
                                        ${renderDayBtn('G', '4', activeDays)}
                                        ${renderDayBtn('V', '5', activeDays)}
                                        ${renderDayBtn('S', '6', activeDays)}
                                        ${renderDayBtn('D', '0', activeDays)}
                                    </div>
                                    <div style="display:flex; align-items:center; gap:10px; width:100%; background:var(--bg-color); border:1px solid var(--border-color); padding:10px; border-radius:6px;">
                                        <span style="font-size:0.8rem; font-weight:bold; color:var(--text-secondary);">Fai scattare l'azione alle ore:</span>
                                        <input type="time" class="modern-input" style="flex:1; padding:6px; font-size:1rem; font-weight:bold; color:var(--accent-color);" value="${safeVal || '09:00'}" onchange="AdvancedAutomations._updateTrigger(event, ${idx}, 'value', this.value)">
                                    </div>
                                </div>
                            `;
                        } else {
                            let dateOpts = dateCols.map(c => `<option value="${c.id}" ${t.value === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
                            if (!t.value && dateCols.length > 0) t.value = dateCols[0].id;
                            
                            const absShift = Math.abs(t.dateShift || 0);
                            const shiftDir = t.dateShift < 0 ? -1 : 1;
                            let shiftUnit = 1; 
                            if (absShift > 0 && absShift % 1440 === 0) shiftUnit = 1440;
                            else if (absShift > 0 && absShift % 60 === 0) shiftUnit = 60;
                            const shiftNum = absShift / shiftUnit;

                            valInput = `
                                <div style="display:flex; flex-direction:column; width:100%;">
                                    ${modeSelectHtml}
                                    <div style="display:flex; align-items:center; gap:10px; width:100%; margin-bottom:10px; background:var(--bg-color); border:1px solid var(--border-color); padding:10px; border-radius:6px;">
                                        <span style="font-size:0.8rem; font-weight:bold; color:var(--text-secondary);">Quando arriva la data in:</span>
                                        <select class="modern-input" style="flex:1; padding:6px; font-size:0.9rem; font-weight:bold;" onchange="AdvancedAutomations._updateTrigger(event, ${idx}, 'value', this.value)">${dateOpts}</select>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:5px; width:100%;">
                                        <span style="font-size:0.8rem; color:var(--text-secondary); margin-right:5px;">L'azione scatterà:</span>
                                        <input type="number" id="shiftNum_${idx}" class="modern-input" style="width:60px; padding:6px; font-size:0.85rem; text-align:center;" value="${shiftNum}" min="0" onchange="AdvancedAutomations._updateTimerShift(${idx})">
                                        <select id="shiftUnit_${idx}" class="modern-input" style="width:90px; padding:6px; font-size:0.85rem;" onchange="AdvancedAutomations._updateTimerShift(${idx})">
                                            <option value="1" ${shiftUnit === 1 ? 'selected' : ''}>Minuti</option>
                                            <option value="60" ${shiftUnit === 60 ? 'selected' : ''}>Ore</option>
                                            <option value="1440" ${shiftUnit === 1440 ? 'selected' : ''}>Giorni</option>
                                        </select>
                                        <select id="shiftDir_${idx}" class="modern-input" style="width:90px; padding:6px; font-size:0.85rem;" onchange="AdvancedAutomations._updateTimerShift(${idx})">
                                            <option value="-1" ${shiftDir === -1 ? 'selected' : ''}>Prima</option>
                                            <option value="1" ${shiftDir === 1 ? 'selected' : ''}>Dopo</option>
                                        </select>
                                    </div>
                                </div>
                            `;
                        }
                        isHiddenValue = false;
                        operatorOptions = `<option value="${t.operator}" style="display:none;"></option>`;

                    } else {
                        operatorOptions = `<option value="sys_trigger">Si verifica</option>`;
                        isHiddenValue = t.colId !== 'SYS_CROSS_DB';
                        
                        if (t.colId === 'SYS_CROSS_DB') {
                            let dbOpts = '<option value="">-- Seleziona DB --</option>';
                            allDBs.forEach(db => {
                                if (db.id !== tableId) dbOpts += `<option value="${db.id}" ${t.value === db.id ? 'selected' : ''}>${db.title}</option>`;
                            });
                            valInput = `<select class="modern-input" style="flex:2; padding:6px; font-size:0.85rem;" onchange="AdvancedAutomations._updateTrigger(event, ${idx}, 'value', this.value)">${dbOpts}</select>`;
                        }
                    }
                }
                else if (tColDef) {
                    isHiddenValue = t.operator === 'empty' || t.operator === 'not_empty' || t.operator === 'changed';

                    operatorOptions = LogicEngine.getConditionOperatorsHTML(tColDef, t.operator, true);

                    if (tColDef.id === 'SYS_JS_FORMULA') {
                        valInput = `<textarea class="modern-input" style="flex:2; padding:6px; font-size:0.85rem; font-family:monospace; min-height:80px; resize:vertical; color:var(--accent-color);" placeholder="Es: riga['Stato'] === 'Aperto' || Number(riga['Importo']) > 100" oninput="AdvancedAutomations._updateTrigger(event, ${idx}, 'value', this.value)">${safeVal}</textarea>`;
                    } else if (tColDef.type === 'select' || tColDef.type === 'multi-select') {
                        let opts = state.selectOptions[tColDef.id] || [];
                        let listId = `dl_trg_${tColDef.id}_${idx}`;
                        valInput = `
                            <input type="text" list="${listId}" class="modern-input" style="flex:2; padding:6px; font-size:0.85rem;" value="${safeVal}" placeholder="Scrivi o scegli..." oninput="AdvancedAutomations._updateTrigger(event, ${idx}, 'value', this.value)">
                            <datalist id="${listId}">${opts.map(o => `<option value="${String(o).replace(/"/g, '&quot;')}">`).join('')}</datalist>
                        `;
                    } else if (tColDef.type === 'relation') {
                        valInput = `<select class="modern-input" style="flex:2; padding:6px; font-size:0.85rem;" onchange="AdvancedAutomations._updateTrigger(event, ${idx}, 'value', this.value)">
                                        ${AdvancedAutomations._buildRelationOptions(tColDef, t.value)}
                                    </select>`;
                    } else if (tColDef.type === 'checkbox') {
                        valInput = `<select class="modern-input" style="flex:2; padding:6px; font-size:0.85rem;" onchange="AdvancedAutomations._updateTrigger(event, ${idx}, 'value', this.value)">
                                        <option value="true" ${t.value === 'true' ? 'selected' : ''}>Sì (Spuntato)</option>
                                        <option value="false" ${t.value === 'false' ? 'selected' : ''}>No (Vuoto)</option>
                                    </select>`;
                    } else if (tColDef.type === 'date' || tColDef.type === 'datetime') {
                        if (!t.dateMode) t.dateMode = 'exact';
                        if (!t.dateShift) t.dateShift = 0;

                        let dynamicHtml = `
                            <select class="modern-input" style="flex:1; padding:6px; min-width:90px; font-size:0.85rem;" onchange="AdvancedAutomations._updateTrigger(event, ${idx}, 'dateMode', this.value)">
                                <option value="exact" ${t.dateMode === 'exact' ? 'selected' : ''}>Data Esatta</option>
                                <option value="today" ${t.dateMode === 'today' ? 'selected' : ''}>Oggi</option>
                            </select>
                        `;

                        if (t.dateMode === 'exact') {
                            dynamicHtml += `<input type="date" class="modern-input" style="flex:1; padding:6px; font-size:0.85rem;" value="${safeVal}" onchange="AdvancedAutomations._updateTrigger(event, ${idx}, 'value', this.value)">`;
                        } else {
                            dynamicHtml += `<div style="flex:1; font-size:0.75rem; color:var(--text-secondary); align-self:center; text-align:center;">( +/- Giorni )</div>`;
                        }

                        dynamicHtml += `
                            <input type="number" class="modern-input" style="width:50px; padding:6px; text-align:center; font-size:0.85rem;" title="Aggiungi o sottrai giorni" value="${t.dateShift}" onchange="AdvancedAutomations._updateTrigger(event, ${idx}, 'dateShift', this.value)">
                        `;

                        valInput = `<div style="display:flex; flex:2; gap:5px; align-items:center;">${dynamicHtml}</div>`;
                    } else {
                        valInput = `<input type="text" class="modern-input" style="flex:2; padding:6px; font-size:0.85rem;" value="${safeVal}" placeholder="Valore..." oninput="AdvancedAutomations._updateTrigger(event, ${idx}, 'value', this.value)">`;
                    }
                }

                let headerLeft = `<span style="font-size:0.75rem; font-weight:bold; color:var(--accent-color); width:25px; text-align:right;">${isFirst ? 'SE' : 'E'}</span>`;
                let delBtn = `<button class="adv-icon-btn danger" style="padding: 4px 6px; display:flex; flex-shrink:0;" onclick="AdvancedAutomations._removeTrigger(event, ${idx})">${Icons.trash}</button>`;

                if (t.colId === 'SYS_TIMER') {
                    triggersHTML += `
                        <div style="position:relative; background: var(--bg-color); padding: 15px; border-radius: 6px; margin-bottom:10px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid var(--border-color); padding-bottom:5px;">
                                <div style="font-size:0.85rem; font-weight:bold; color:var(--accent-color); display:flex; align-items:center; gap:5px;">⏰ Condizione a Tempo</div>
                                ${delBtn}
                            </div>
                            <div style="${rowLayout}">
                                <select class="modern-input" style="${colSelectFlex} padding:6px; font-size:0.85rem; font-weight:bold; color:var(--text-primary);" onchange="AdvancedAutomations._updateTrigger(event, ${idx}, 'colId', this.value)">
                                    <optgroup label="Eventi di Sistema">
                                        <option value="SYS_NEW_ROW" ${t.colId === 'SYS_NEW_ROW' ? 'selected' : ''}>⚡ Creazione Nuova Riga</option>
                                        <option value="SYS_ANY_CHANGE" ${t.colId === 'SYS_ANY_CHANGE' ? 'selected' : ''}>⚡ Qualsiasi Modifica Dati</option>
                                        <option value="SYS_TIMER" ${t.colId === 'SYS_TIMER' ? 'selected' : ''}>⏰ Orario Programmato</option>
                                        <option value="SYS_CROSS_DB" ${t.colId === 'SYS_CROSS_DB' ? 'selected' : ''}>🌐 Modifica in altro Database</option>
                                        <option value="SYS_ON_LOAD" ${t.colId === 'SYS_ON_LOAD' ? 'selected' : ''}>👁️ Al caricamento della Tabella</option>
                                    </optgroup>
                                    <optgroup label="Valori Colonne">
                                        ${colOptions.replace(`value="${t.colId}"`, `value="${t.colId}" selected`)}
                                    </optgroup>
                                </select>
                                <div style="width:100%; ${isHiddenValue ? 'display:none;' : 'display:flex;'}">
                                    ${valInput}
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    triggersHTML += `
                        <div style="${rowLayout} background: var(--bg-color); padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); ${tColDef && tColDef.id === 'SYS_JS_FORMULA' ? 'align-items:flex-start;' : ''}">
                            ${headerLeft}
                            <select class="modern-input" style="${colSelectFlex} padding:6px; font-size:0.85rem; font-weight:bold; color:var(--text-primary); ${tColDef && tColDef.id === 'SYS_JS_FORMULA' ? 'margin-top:5px;' : ''}" onchange="AdvancedAutomations._updateTrigger(event, ${idx}, 'colId', this.value)">
                                <optgroup label="Eventi di Sistema">
                                    <option value="SYS_NEW_ROW" ${t.colId === 'SYS_NEW_ROW' ? 'selected' : ''}>⚡ Creazione Nuova Riga</option>
                                    <option value="SYS_ANY_CHANGE" ${t.colId === 'SYS_ANY_CHANGE' ? 'selected' : ''}>⚡ Qualsiasi Modifica Dati</option>
                                    <option value="SYS_TIMER" ${t.colId === 'SYS_TIMER' ? 'selected' : ''}>⏰ Orario Programmato</option>
                                    <option value="SYS_CROSS_DB" ${t.colId === 'SYS_CROSS_DB' ? 'selected' : ''}>🌐 Modifica in altro Database</option>
                                    <option value="SYS_ON_LOAD" ${t.colId === 'SYS_ON_LOAD' ? 'selected' : ''}>👁️ Al caricamento della Tabella</option>
                                </optgroup>
                                <optgroup label="Valori Colonne">
                                    ${colOptions.replace(`value="${t.colId}"`, `value="${t.colId}" selected`)}
                                </optgroup>
                            </select>
                            <select class="modern-input" style="flex:1; padding:6px; font-size:0.85rem; ${tColDef && tColDef.id === 'SYS_JS_FORMULA' ? 'display:none;' : ''}" onchange="AdvancedAutomations._updateTrigger(event, ${idx}, 'operator', this.value)">
                                ${operatorOptions}
                            </select>
                            <div style="flex:2; ${isHiddenValue ? 'display:none;' : 'display:flex;'}">
                                ${valInput}
                            </div>
                            <div style="${tColDef && tColDef.id === 'SYS_JS_FORMULA' ? 'margin-top:5px;' : ''}">${delBtn}</div>
                        </div>
                    `;
                }
            });
        }

        let actionsHTML = '';
        
        let colsForActions = ``;
        cols.forEach(c => {
            // Previene l'assegnazione arbitraria di valori a colonne protette dal motore
            if (['created_time', 'last_edited_time', 'formula', 'rollup'].includes(c.type)) return;

            if(c.type !== 'record_note') {
                colsForActions += `<option value="${c.id}">${c.name}</option>`;
            } else {
                colsForActions += `<option value="${c.id}">Pagina: ${c.name} (Titolo Nota)</option>`;
            }
        });

        let targetColOptions = `
            <optgroup label="Azioni di Sistema">
                <option value="SYS_ACTION">⚙️ Esegui...</option>
            </optgroup>
            <optgroup label="Colonne Tabella">
                ${colsForActions}
            </optgroup>
        `;

        if (auto.actions.length === 0) {
            actionsHTML = `<div style="font-size:0.8rem; color:var(--danger-color); margin:10px 0; text-align:center;">Seleziona cosa deve fare l'automazione.</div>`;
        } else {
            auto.actions.forEach((a, idx) => {
                let aColDef = cols.find(c => c.id === a.colId);
                let safeVal = String(a.value || '').replace(/"/g, '&quot;');

                let typeOptionsHTML = '';
                let valInputHTML = '';

                if (!a.type) a.type = 'set_fixed';
                if (a.type === 'fixed') a.type = 'set_fixed';

                if (a.colId === 'SYS_ACTION') {
                    typeOptionsHTML = `
                        <option value="color_row" ${a.type === 'color_row' ? 'selected' : ''}>Colora Sfondo Riga Database</option>
                        <option value="show_toast" ${a.type === 'show_toast' ? 'selected' : ''}>Invia Notifica a scomparsa</option>
                        <option value="alarm" ${a.type === 'alarm' ? 'selected' : ''}>Allarme Sonoro Continuo</option>
                        <option value="stop_execution" ${a.type === 'stop_execution' ? 'selected' : ''}>Ferma Automazione (Stop)</option>
                        <option value="insert_row" ${a.type === 'insert_row' ? 'selected' : ''}>Crea Record in Altro DB</option>
                    `;
                    if (a.type === 'show_toast' || a.type === 'alarm') {
                        valInputHTML = `<input type="text" class="modern-input" style="flex:1; padding:6px; font-size:0.85rem;" value="${safeVal}" placeholder="Messaggio (Usa = per le Formule)" oninput="AdvancedAutomations._updateAction(event, ${idx}, 'value', this.value)">`;
                    } else if (a.type === 'insert_row') {
                        let dbOpts = '<option value="">-- Seleziona DB --</option>';
                        allDBs.forEach(db => {
                            if (db.id !== tableId) dbOpts += `<option value="${db.id}" ${a.value === db.id ? 'selected' : ''}>📊 ${db.title}</option>`;
                        });
                        valInputHTML = `
                            <select class="modern-input" style="flex:1; padding:6px; font-size:0.85rem;" onchange="AdvancedAutomations._updateAction(event, ${idx}, 'value', this.value)">${dbOpts}</select>
                            <input type="text" class="modern-input" style="flex:1; padding:6px; font-size:0.85rem;" value="${String(a.value2 || '').replace(/"/g, '&quot;')}" placeholder="Nome della nuova riga (Titolo)..." oninput="AdvancedAutomations._updateAction(event, ${idx}, 'value2', this.value)">
                        `;
                    } else if (a.type === 'color_row') {
                        
                        // LA MODIFICA: Utilizzo dell'helper centrale per i colori
                        const changeScript = `AdvancedAutomations._updateAction(event, ${idx}, 'value', '$$VAL$$'); AdvancedAutomations._renderBuilder('${tableId}');`;
                        const colorSwatches = AutomationUIBuilder.getColorSwatchesHTML(a.value, changeScript);

                        // IMPLEMENTAZIONE OPACITA' FISSA/FORMULA
                        const rawOp = a.value2 !== undefined && a.value2 !== '' ? String(a.value2) : '100';
                        const isFormulaOp = rawOp.startsWith('=');
                        const cleanOp = isFormulaOp ? rawOp.substring(1).trim() : rawOp;
                        const safeOpVal = cleanOp.replace(/"/g, '&quot;');

                        let opInput = `
                            <div style="display:flex; align-items:center; gap:5px; margin-left:auto; padding:4px 8px; border-radius:4px; border:1px solid var(--border-color); flex-shrink:0;">
                                <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">Opacità:</span>
                                <select class="modern-input" style="padding:2px; font-size:0.75rem;" onchange="
                                    const isF = this.value === 'formula';
                                    const newVal = isF ? '=riga[\\'\\']' : '100';
                                    AdvancedAutomations._updateAction(event, ${idx}, 'value2', newVal);
                                    AdvancedAutomations._renderBuilder('${tableId}');
                                ">
                                    <option value="fixed" ${!isFormulaOp ? 'selected' : ''}>Fissa %</option>
                                    <option value="formula" ${isFormulaOp ? 'selected' : ''}>Formula JS</option>
                                </select>
                                ${!isFormulaOp 
                                    ? `<input type="number" class="modern-input action-val2" style="padding:2px; text-align:center;" value="${safeOpVal}" min="0" max="100" oninput="AdvancedAutomations._updateAction(event, ${idx}, 'value2', this.value)">`
                                    : `<input type="text" class="modern-input" style="padding:2px; font-family:monospace; color:var(--accent-color);" value="${safeOpVal}" placeholder="es: riga['Num']" oninput="AdvancedAutomations._updateAction(event, ${idx}, 'value2', '=' + this.value)">`
                                }
                            </div>
                        `;

                        valInputHTML = `<div style="display:flex; align-items:center; gap:10px; width:100%; flex-wrap:wrap;">${colorSwatches}${opInput}</div>`;
                    }
                    
                    actionsHTML += `
                        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px; align-items:flex-start; background: var(--bg-color); padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                            <div style="display:flex; width:100%; align-items:center; gap:8px;">
                                <span style="font-size:0.75rem; font-weight:bold; color:var(--tx-c4); width:55px; text-align:right;">ALLORA</span>
                                <select class="modern-input" style="flex:1; margin:0; font-weight:bold; color:var(--text-primary);" onchange="AdvancedAutomations._updateAction(event, ${idx}, 'colId', this.value)">
                                    ${targetColOptions.replace(`value="${a.colId}"`, `value="${a.colId}" selected`)}
                                </select>
                                <select class="modern-input" style="flex:1.5; margin:0;" onchange="AdvancedAutomations._updateAction(event, ${idx}, 'type', this.value)">
                                    ${typeOptionsHTML}
                                </select>
                                <button class="adv-icon-btn danger" style="padding: 4px 6px; display:flex; flex-shrink:0;" onclick="AdvancedAutomations._removeAction(event, ${idx})">${Icons.trash}</button>
                            </div>
                            ${valInputHTML ? `<div style="width:100%; display:flex; gap:8px;">${valInputHTML}</div>` : ''}
                        </div>
                    `;
                }
                else {
                    typeOptionsHTML = LogicEngine.getActionTypesHTML(aColDef, a.type, 'automation');
                    const changeCallback = `AdvancedAutomations._updateActionField('${tableId}', ${idx})`;
                    
                    const isFormula = a.type && a.type.includes('formula');
                    const inputId = `in_auto_${tableId}_${idx}`;
                    valInputHTML = LogicEngine.getActionInputHTML(aColDef, a.type, a.value, a.value2, state, changeCallback, { inputId: inputId });

                    const prevId = `prev_auto_${tableId}_${idx}`;

                    if (isFormula) {
                        formulaPreviews.push({ id: prevId, inputId: inputId, formula: a.value, targetState: state, filters: auto.triggers });
                        actionsHTML += `
                            <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px; background: var(--bg-color); padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                                <div style="display:flex; align-items:center; width:100%; gap:8px;">
                                    <span style="font-size:0.75rem; font-weight:bold; color:var(--tx-c4); width:55px; text-align:right;">ALLORA</span>
                                    <select class="modern-input" style="flex:1; margin:0; font-weight:bold; color:var(--text-primary);" onchange="AdvancedAutomations._updateAction(event, ${idx}, 'colId', this.value)">
                                        ${targetColOptions.replace(`value="${a.colId}"`, `value="${a.colId}" selected`)}
                                    </select>
                                    <select class="modern-input" style="flex:1; margin:0;" onchange="AdvancedAutomations._updateAction(event, ${idx}, 'type', this.value)">
                                        ${typeOptionsHTML}
                                    </select>
                                    <button class="adv-icon-btn danger" style="padding: 4px 6px; display:flex; flex-shrink:0;" onclick="AdvancedAutomations._removeAction(event, ${idx})">${Icons.trash}</button>
                                </div>
                                <div style="width:100%;">
                                    ${valInputHTML}
                                </div>
                                <div id="${prevId}" style="width:100%; background:rgba(0,0,0,0.02); padding:8px; border-radius:4px; font-family:monospace; font-size:0.85rem; border:1px dashed var(--border-color);">
                                    <!-- Anteprima Live -->
                                </div>
                            </div>
                        `;
                    } else {
                        actionsHTML += `
                            <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center; background: var(--bg-color); padding: 8px; border-radius: 6px; border: 1px solid var(--border-color);">
                                <span style="font-size:0.75rem; font-weight:bold; color:var(--tx-c4); width:55px; text-align:right;">ALLORA</span>
                                <select class="modern-input" style="flex:1; margin:0; font-weight:bold; color:var(--text-primary);" onchange="AdvancedAutomations._updateAction(event, ${idx}, 'colId', this.value)">
                                    ${targetColOptions.replace(`value="${a.colId}"`, `value="${a.colId}" selected`)}
                                </select>
                                <select class="modern-input" style="flex:1; margin:0;" onchange="AdvancedAutomations._updateAction(event, ${idx}, 'type', this.value)">
                                    ${typeOptionsHTML}
                                </select>
                                <div style="flex:1.5;">${valInputHTML}</div>
                                <button class="adv-icon-btn danger" style="padding: 4px 6px; display:flex; flex-shrink:0;" onclick="AdvancedAutomations._removeAction(event, ${idx})">${Icons.trash}</button>
                            </div>
                        `;
                    }
                }
            });
        }

        const safeAutoName = String(auto.name || '').replace(/"/g, '&quot;');

        let formulaHelperHTML = '';
        const hasFormulaAction = auto.actions.some(a => a.type && a.type.includes('formula') || (a.colId === 'SYS_ACTION' && (a.value || '').startsWith('=')));
        
        if (hasFormulaAction) {
            formulaHelperHTML = `
                <div style="background: rgba(37, 99, 235, 0.05); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(37, 99, 235, 0.2); margin-bottom: 10px; font-size: 0.8rem; display:flex; align-items:center; gap:10px;">
                    <span style="display:inline-flex; color:var(--accent-color);">${Icons.formula}</span>
                    <div style="flex:1; color:var(--text-secondary);">
                        <b>Modo Formula attivo:</b> Usa <code>riga["Nome"]</code> per leggere i dati. Per farti aiutare da un'IA, copia le istruzioni.
                    </div>
                    <button id="btnCopyAutoAIPrompt_Auto" class="btn" style="padding: 4px 8px; font-size: 0.75rem; flex-shrink:0;" onclick="LogicEngine.copyAutomationAIPrompt(event, '${tableId}', 'btnCopyAutoAIPrompt_Auto')" title="Copia Prompt per AI">
                        <span style="display:inline-flex; align-items:center; gap:5px;">${Icons.clipboard} Copia Prompt AI</span>
                    </button>
                </div>
            `;
        }

        const bodyHTML = `
            <div style="display:flex; flex-direction:column; gap:15px; height:100%; padding-bottom:20px;">
                <div>
                    <label style="font-size:0.85rem; font-weight:bold; color:var(--text-secondary);">Nome Automazione (Opzionale):</label>
                    <input type="text" class="modern-input" style="font-size:1.1rem; font-weight:bold; border-bottom:2px solid var(--border-color)!important;" value="${safeAutoName}" placeholder="Es: Seleziona Stato In Corso, auto-imposta la data" oninput="AdvancedAutomations._tempAuto.name = this.value">
                </div>

                <div style="background:var(--item-hover); padding:15px; border-radius:8px; border:1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                        <h4 style="margin:0; font-size:0.95rem; color:var(--accent-color); display:flex; align-items:center; gap:6px;">${Icons.lightning} CONDIZIONI</h4>
                        <button class="adv-icon-btn" style="background:var(--bg-color); border:1px solid var(--border-color); padding:4px 10px; border-radius:12px; color:var(--text-primary);" onclick="AdvancedAutomations._addTrigger(event, '${tableId}')">+ Aggiungi Condizione</button>
                    </div>
                    ${triggersHTML}
                </div>

                <div style="background:var(--item-hover); padding:15px; border-radius:8px; border:1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                        <h4 style="margin:0; font-size:0.95rem; color:var(--tx-c4); display:flex; align-items:center; gap:6px;">${Icons.data} AZIONI</h4>
                        <button class="adv-icon-btn" style="background:var(--bg-color); border:1px solid var(--border-color); padding:4px 10px; border-radius:12px; color:var(--text-primary);" onclick="AdvancedAutomations._addAction(event, '${tableId}')">+ Aggiungi Azione</button>
                    </div>
                    ${formulaHelperHTML}
                    ${actionsHTML}
                </div>
            </div>
        `;

        const footerHTML = `
            <button class="btn" onclick="AdvancedAutomations.openPanel(event, '${tableId}')">Annulla</button>
            <button class="btn btn-primary" onclick="AdvancedAutomations.saveAutomation(event, '${tableId}')">Salva Automazione</button>
        `;

        UI.openDrawer(`Configura Automazione`, bodyHTML, footerHTML);

        setTimeout(() => {
            formulaPreviews.forEach(p => {
                LogicEngine.updateFormulaLivePreview(p.id, p.formula, p.targetState, p.filters);
                const inputEl = document.getElementById(p.inputId);
                if (inputEl) {
                    let debounceTimer;
                    inputEl.addEventListener('input', (e) => {
                        clearTimeout(debounceTimer);
                        debounceTimer = setTimeout(() => {
                            LogicEngine.updateFormulaLivePreview(p.id, e.target.value, p.targetState, p.filters);
                        }, 300);
                    });
                }
            });
        }, 100);
    },

    _updateActionField: (tableId, actionIndex) => {
        return (field, value) => {
            const auto = AdvancedAutomations._tempAuto;
            if (auto && auto.actions[actionIndex]) {
                auto.actions[actionIndex][field] = value;
            }
        };
    },

    _addTrigger: (e, tableId) => {
        if (e) e.stopPropagation();
        const state = AdvancedTable.getState(tableId);
        const firstColId = state.columns.length > 0 ? state.columns[0].id : '';
        AdvancedAutomations._tempAuto.triggers.push({ colId: firstColId, operator: '=', value: '', dateMode: 'exact', dateShift: 0 });
        AdvancedAutomations._renderBuilder(tableId);
    },
    
    _removeTrigger: (e, idx) => {
        if (e) e.stopPropagation();
        AdvancedAutomations._tempAuto.triggers.splice(idx, 1);
        AdvancedAutomations._renderBuilder(document.querySelector('.adv-drawer').querySelector('.btn-primary').getAttribute('onclick').match(/'([^']+)'/)[1]);
    },
    
    _updateTrigger: (e, idx, field, val) => {
        if (e) e.stopPropagation();
        AdvancedAutomations._tempAuto.triggers[idx][field] = val;

        const tId = document.querySelector('.adv-drawer').querySelector('.btn-primary').getAttribute('onclick').match(/'([^']+)'/)[1];

        if (field === 'colId') {
            const state = AdvancedTable.getState(tId);
            const col = state.columns.find(c => c.id === val);
            AdvancedAutomations._tempAuto.triggers[idx].value = '';

            if (val === 'SYS_TIMER') {
                AdvancedAutomations._tempAuto.triggers[idx].operator = 'every_day';
                AdvancedAutomations._tempAuto.triggers[idx].value = '09:00';
            } else if (val === 'SYS_JS_FORMULA') {
                AdvancedAutomations._tempAuto.triggers[idx].operator = 'formula';
            } else if (val.startsWith('SYS_')) {
                AdvancedAutomations._tempAuto.triggers[idx].operator = 'sys_trigger';
            } else if (col && col.hasEndDate) {
                AdvancedAutomations._tempAuto.triggers[idx].operator = 'range_inside';
            } else {
                AdvancedAutomations._tempAuto.triggers[idx].operator = '=';
            }

            AdvancedAutomations._tempAuto.triggers[idx].dateMode = 'exact';
            AdvancedAutomations._tempAuto.triggers[idx].dateShift = 0;
            AdvancedAutomations._renderBuilder(tId);
        } else if (field === 'operator' || field === 'dateMode') {
            // Impostiamo dei valori di default sensati cambiando il tipo di operatore per SYS_TIMER
            const trg = AdvancedAutomations._tempAuto.triggers[idx];
            if (trg.colId === 'SYS_TIMER') {
                if (val === 'every_day' || val.includes(',')) {
                    if (!trg.value || trg.value.length !== 5 || !trg.value.includes(':')) trg.value = '09:00';
                } else if (val === 'exact_date') {
                    if (!trg.value || !trg.value.includes('T')) {
                        const now = new Date();
                        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                        trg.value = now.toISOString().slice(0, 16);
                    }
                } else if (val === 'formula') {
                    // Impedisce che ID interni come c_123456 finiscano nella formula JS
                    if (!trg.value || /^c_[\w\d]+$/.test(trg.value) || /^\d{2}:\d{2}$/.test(trg.value) || trg.value.includes('T')) {
                        trg.value = 'riga["Status"] === "In Corso"';
                    }
                } else if (val === 'col_reference') {
                    const state = AdvancedTable.getState(tId);
                    const dateCols = state.columns.filter(c => c.type === 'date' || c.type === 'datetime');
                    if (dateCols.length > 0 && (!trg.value || !state.columns.find(c => c.id === trg.value))) {
                        trg.value = dateCols[0].id;
                    }
                }
            }
            AdvancedAutomations._renderBuilder(tId);
        }
    },

    _addAction: (e, tableId) => {
        if (e) e.stopPropagation();
        const state = AdvancedTable.getState(tableId);
        const firstColId = state.columns.length > 0 ? state.columns[0].id : '';
        AdvancedAutomations._tempAuto.actions.push({ colId: firstColId, type: 'set_fixed', value: '' });
        AdvancedAutomations._renderBuilder(tableId);
    },
    
    _removeAction: (e, idx) => {
        if (e) e.stopPropagation();
        AdvancedAutomations._tempAuto.actions.splice(idx, 1);
        AdvancedAutomations._renderBuilder(document.querySelector('.adv-drawer').querySelector('.btn-primary').getAttribute('onclick').match(/'([^']+)'/)[1]);
    },
    
    _updateAction: (e, idx, field, val) => {
        if (e) e.stopPropagation();
        AdvancedAutomations._tempAuto.actions[idx][field] = val;

        const tId = document.querySelector('.adv-drawer').querySelector('.btn-primary').getAttribute('onclick').match(/'([^']+)'/)[1];

        if (field === 'colId') {
            if (val === 'SYS_ACTION') {
                AdvancedAutomations._tempAuto.actions[idx].type = 'show_toast';
            } else {
                const state = AdvancedTable.getState(tId);
                const col = state.columns.find(c => c.id === val);
                if (col) {
                    if (col.type === 'checkbox') AdvancedAutomations._tempAuto.actions[idx].type = 'set_true';
                    else if (['multi-select', 'relation'].includes(col.type)) AdvancedAutomations._tempAuto.actions[idx].type = 'add_fixed';
                    else if (['date', 'datetime'].includes(col.type)) {
                        AdvancedAutomations._tempAuto.actions[idx].type = col.hasEndDate ? 'set_start_today' : 'set_today';
                    }
                    else if (col.type === 'number') AdvancedAutomations._tempAuto.actions[idx].type = 'set_fixed';
                    else AdvancedAutomations._tempAuto.actions[idx].type = 'set_fixed';
                }
            }
            AdvancedAutomations._tempAuto.actions[idx].value = '';
            AdvancedAutomations._tempAuto.actions[idx].value2 = '';
            AdvancedAutomations._renderBuilder(tId);
        } else if (field === 'type') {
            AdvancedAutomations._tempAuto.actions[idx].value = '';
            AdvancedAutomations._tempAuto.actions[idx].value2 = '';
            AdvancedAutomations._renderBuilder(tId);
        }
    }
});