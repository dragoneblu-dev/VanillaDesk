/**
 * AdvancedTableConditionalColors.js
 * Menu e UI Builder per la colorazione condizionale delle righe nel Database.
 * FIX REFACTORING: Reintegrate le variabili di stato interne (_tempCondRules e _draggedRuleIdx).
 * FEAT UX: Aggiunto un selettore esplicito per passare dall'Opacità Fissa all'Opacità Dinamica (Formula).
 * FIX LAYOUT: Il controllo dell'Opacità è stato spostato su una riga dedicata a larghezza intera per permettere la stesura di Formule lunghe.
 * FIX DRAG&DROP INFALLIBILE: L'attributo draggable="true" è ora staticamente confinato SOLO all'icona della maniglia.
 * L'immagine fantasma del trascinamento (setDragImage) è stata riprogrammata per mostrare l'intera Card.
 * Questo elimina le race-condition dei browser e sblocca perfettamente la selezione del testo.
 */

const AdvancedTableConditionalColors = {
    _tempCondRules: null,
    _draggedRuleIdx: null,

    openConditionalColorPanel: (e, tableId) => {
        if (e) e.stopPropagation();
        AdvancedTable.closeDropdowns(true);

        const state = AdvancedTable.getState(tableId);
        if (!state) return;
        if (!state.conditionalColors) state.conditionalColors = [];

        AdvancedTableConditionalColors._tempCondRules = JSON.parse(JSON.stringify(state.conditionalColors));
        AdvancedTableConditionalColors._renderConditionalBuilder(tableId);
    },

    _renderConditionalBuilder: (tableId) => {
        const state = AdvancedTable.getState(tableId);
        const rules = AdvancedTableConditionalColors._tempCondRules;

        let colOptions = ``;
        state.columns.forEach(c => {
            const safeColName = String(c.name).replace(/"/g, '&quot;');
            let icon = '📄';
            if(c.type === 'text') icon = Icons.text; if(c.type === 'number') icon = Icons.number; if(c.type === 'select') icon = Icons.select; if(c.type === 'multi-select') icon = Icons.multiSelect; if(c.type === 'date' || c.type === 'datetime') icon = Icons.date; if(c.type === 'time') icon = Icons.time; if(c.type === 'checkbox') icon = Icons.checkbox; if(c.type === 'formula') icon = Icons.formula; if(c.type === 'relation') icon = Icons.relation; if(c.type === 'url') icon = Icons.url; if(c.type === 'button') icon = Icons.play;
            colOptions += `<option value="${c.id}">${icon} ${safeColName}</option>`;
        });

        let listHTML = '';

        if (rules.length === 0) {
            listHTML = `
                <div style="text-align:center; padding:30px 10px; background: rgba(0,0,0,0.02); border-radius: 8px; border: 1px dashed var(--border-color);">
                    <div style="margin-bottom:10px; color:var(--accent-color);">${Icons.palette}</div>
                    <div style="color:var(--text-secondary); font-size:0.9rem;">Nessuna regola visiva attiva.<br>Aggiungi una regola per colorare automaticamente le righe della tabella.</div>
                </div>
            `;
        } else {
            rules.forEach((rule, idx) => {
                const isActive = rule.active;
                let colorSwatches = '';
                
                const noColorSel = (!rule.color || rule.color === 'none') ? 'outline: 2px solid var(--text-primary); transform: scale(1.1); box-shadow: 0 4px 8px rgba(0,0,0,0.2);' : '';
                colorSwatches += `<div class="color-swatch bg-none" style="width: 24px; height: 24px; border-radius: 4px; cursor: pointer; ${noColorSel}" onclick="AdvancedTableConditionalColors._updateCondColor('${tableId}', ${idx}, 'none')" title="Nessun Colore (Predefinito)"></div>`;
                
                const pillColors = ['hl-c1', 'hl-c2', 'hl-c3', 'hl-c4', 'hl-c5', 'hl-c6', 'hl-c7', 'hl-c8', 'hl-c9', 'hl-c10'];
                pillColors.forEach(c => {
                    const selectedStyle = rule.color === c ? 'outline: 2px solid var(--text-primary); transform: scale(1.1); box-shadow: 0 4px 8px rgba(0,0,0,0.2);' : '';
                    colorSwatches += `<div class="color-option ${c}" style="width: 24px; height: 24px; border-radius: 4px; cursor: pointer; ${selectedStyle}" onclick="AdvancedTableConditionalColors._updateCondColor('${tableId}', ${idx}, '${c}')" title="${c}"></div>`;
                });

                const opType = rule.opacityType || 'fixed';
                const safeOpVal = String(rule.opacity !== undefined ? rule.opacity : '100').replace(/"/g, '&quot;');
                
                let opInputHtml = '';
                if (opType === 'fixed') {
                    opInputHtml = `<input type="number" class="modern-input" style="padding:4px; text-align:center; width:80px;" value="${safeOpVal}" min="0" max="100" oninput="AdvancedTableConditionalColors._updateCondOpacity('${tableId}', ${idx}, this.value)"> <span style="font-size:0.8rem; color:var(--text-secondary); margin-left:5px;">%</span>`;
                } else {
                    opInputHtml = `<input type="text" class="modern-input" style="padding:4px; font-family:monospace; color:var(--accent-color); flex:1;" value="${safeOpVal}" placeholder="es: riga['Num']" oninput="AdvancedTableConditionalColors._updateCondOpacity('${tableId}', ${idx}, this.value)">`;
                }

                let resultConfigHTML = `
                    <div style="display:flex; flex-direction:column; gap:8px; cursor:default;" onmousedown="event.stopPropagation()">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:0.8rem; font-weight:bold; color:var(--text-primary); width: 85px;">Sfondo:</span>
                            <div style="display:flex; gap:6px; flex-wrap:wrap; background:var(--item-hover); padding:5px; border-radius:6px; border:1px solid var(--border-color); flex:1;">
                                ${colorSwatches}
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:0.8rem; font-weight:bold; color:var(--text-primary); width: 85px;">Opacità:</span>
                            <div style="display:flex; gap:8px; align-items:center; background:var(--item-hover); padding:6px 10px; border-radius:6px; border:1px solid var(--border-color); flex:1;">
                                <select class="modern-input" style="padding:4px; font-size:0.8rem; width: 120px;" onchange="AdvancedTableConditionalColors._updateCondOpacityType('${tableId}', ${idx}, this.value)">
                                    <option value="fixed" ${opType === 'fixed' ? 'selected' : ''}>Fissa</option>
                                    <option value="formula" ${opType === 'formula' ? 'selected' : ''}>Formula JS</option>
                                </select>
                                ${opInputHtml}
                            </div>
                        </div>
                    </div>
                `;

                let conditionsHTML = '';
                if (rule.conditions.length === 0) {
                    conditionsHTML = `<div style="font-size:0.8rem; color:var(--danger-color); padding: 5px;">Seleziona una colonna per definire la condizione.</div>`;
                } else {
                    rule.conditions.forEach((cond, cIdx) => {
                        const isFirst = cIdx === 0;
                        const cDef = state.columns.find(c => c.id === cond.colId);
                        const safeVal = String(cond.value || '').replace(/"/g, '&quot;');
                        
                        let opHtml = '';
                        let valHtml = '';
                        let isValHidden = true;

                        if (cDef) {
                            opHtml = LogicEngine.getConditionOperatorsHTML(cDef, cond.operator, false);
                            isValHidden = ['empty', 'not_empty'].includes(cond.operator);

                            if (['date', 'datetime'].includes(cDef.type)) {
                                if (!cond.dateMode) cond.dateMode = 'exact';
                                if (!cond.dateShift) cond.dateShift = 0;
                                let dynamicHtml = `<select class="modern-input" style="flex:1; padding:6px; font-size:0.8rem;" onchange="AdvancedTableConditionalColors._updateCondField('${tableId}', ${idx}, ${cIdx}, 'dateMode', this.value)"><option value="exact" ${cond.dateMode === 'exact' ? 'selected' : ''}>Data Esatta</option><option value="today" ${cond.dateMode === 'today' ? 'selected' : ''}>Oggi</option></select>`;
                                if (cond.dateMode === 'exact') dynamicHtml += `<input type="date" class="modern-input" style="flex:1; padding:6px; font-size:0.8rem;" value="${safeVal}" onchange="AdvancedTableConditionalColors._updateCondField('${tableId}', ${idx}, ${cIdx}, 'value', this.value)">`;
                                else dynamicHtml += `<div style="flex:1; font-size:0.75rem; color:var(--text-secondary); align-self:center; text-align:center;">( +/- Giorni )</div>`;
                                dynamicHtml += `<input type="number" class="modern-input" style="width:50px; padding:6px; text-align:center; font-size:0.8rem;" title="Giorni (+/-)" value="${cond.dateShift}" onchange="AdvancedTableConditionalColors._updateCondField('${tableId}', ${idx}, ${cIdx}, 'dateShift', this.value)">`;
                                valHtml = `<div style="display:flex; flex:2; gap:5px;">${dynamicHtml}</div>`;
                            } 
                            else if (['select', 'multi-select'].includes(cDef.type)) {
                                let opts = state.selectOptions[cDef.id] || []; let listId = `dl_cc_${cDef.id}_${idx}_${cIdx}`;
                                valHtml = `<input type="text" list="${listId}" class="modern-input" style="flex:2; padding:6px; font-size:0.8rem;" value="${safeVal}" placeholder="Scrivi o scegli..." oninput="AdvancedTableConditionalColors._updateCondField('${tableId}', ${idx}, ${cIdx}, 'value', this.value)"><datalist id="${listId}">${opts.map(o => `<option value="${String(o).replace(/"/g, '&quot;')}">`).join('')}</datalist>`;
                            }
                            else if (cDef.type === 'checkbox') {
                                valHtml = `<select class="modern-input" style="flex:2; padding:6px; font-size:0.8rem;" onchange="AdvancedTableConditionalColors._updateCondField('${tableId}', ${idx}, ${cIdx}, 'value', this.value)"><option value="true" ${cond.value === 'true' ? 'selected' : ''}>Sì (Spuntato)</option><option value="false" ${cond.value === 'false' ? 'selected' : ''}>No (Vuoto)</option></select>`;
                            }
                            else {
                                valHtml = `<input type="text" class="modern-input" style="flex:2; padding:6px; font-size:0.8rem;" value="${safeVal}" placeholder="Valore (=Formula JS)" oninput="AdvancedTableConditionalColors._updateCondField('${tableId}', ${idx}, ${cIdx}, 'value', this.value)">`;
                            }
                        }

                        conditionsHTML += `
                            <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                                <span style="font-size:0.75rem; font-weight:bold; color:var(--accent-color); width:25px; text-align:right;">${isFirst ? 'SE' : 'AND'}</span>
                                <select class="modern-input" style="flex:1.5; padding:6px; font-size:0.8rem; font-weight:bold;" onchange="AdvancedTableConditionalColors._updateCondField('${tableId}', ${idx}, ${cIdx}, 'colId', this.value)">
                                    ${colOptions.replace(`value="${cond.colId}"`, `value="${cond.colId}" selected`)}
                                </select>
                                <select class="modern-input" style="flex:1; padding:6px; font-size:0.8rem;" onchange="AdvancedTableConditionalColors._updateCondField('${tableId}', ${idx}, ${cIdx}, 'operator', this.value)">
                                    ${opHtml}
                                </select>
                                <div style="flex:2; ${isValHidden ? 'display:none;' : 'display:flex;'}">${valHtml}</div>
                                <button class="adv-icon-btn danger" style="padding:4px;" onclick="AdvancedTableConditionalColors._removeCondRuleCondition('${tableId}', ${idx}, ${cIdx})">${Icons.close}</button>
                            </div>
                        `;
                    });
                }

                // DRAG INFALLIBILE: Solo la maniglia ⠿ ha draggable="true"
                listHTML += `
                    <div class="drag-item" id="cond-rule-${idx}"
                         ondragover="AdvancedTableConditionalColors._onCondDragOver(event)" 
                         ondragleave="AdvancedTableConditionalColors._onCondDragLeave(event)" 
                         ondrop="AdvancedTableConditionalColors._onCondDrop(event, '${tableId}', ${idx})" 
                         style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-bottom:12px; transition: opacity 0.2s;">
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <span style="font-weight:bold; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
                                <span class="widget-drag-handle" style="opacity:0.4; font-size:1.2rem; cursor:grab; padding: 0 5px;"
                                      draggable="true"
                                      ondragstart="AdvancedTableConditionalColors._onCondDragStart(event, ${idx})"
                                      ondragend="AdvancedTableConditionalColors._onCondDragEnd(event, ${idx})"
                                      title="Trascina per riordinare">⠿</span>
                                Regola ${idx + 1}
                            </span>
                            <div style="display:flex; gap:10px; align-items:center;">
                                <label style="display:flex; align-items:center; gap:5px; font-size:0.8rem; cursor:pointer; background: ${isActive ? 'rgba(34, 197, 94, 0.1)' : 'var(--item-hover)'}; color: ${isActive ? '#166534' : 'var(--text-secondary)'}; padding: 4px 8px; border-radius: 12px; font-weight: bold;">
                                    <input type="checkbox" style="margin:0;" ${isActive ? 'checked' : ''} onchange="AdvancedTableConditionalColors._toggleCondActive('${tableId}', ${idx}, this.checked)">
                                    ${isActive ? 'Attiva' : 'Disattiva'}
                                </label>
                                <button class="adv-icon-btn danger" style="padding:4px;" onclick="AdvancedTableConditionalColors._deleteCondRule('${tableId}', ${idx})" title="Elimina Regola">${Icons.trash}</button>
                            </div>
                        </div>

                        <div style="background:var(--item-hover); padding:10px; border-radius:6px; border:1px solid var(--border-color); margin-bottom:15px; cursor:default;" onmousedown="event.stopPropagation()">
                            ${conditionsHTML}
                            <button class="adv-icon-btn" style="background:var(--bg-color); border:1px solid var(--border-color); padding:4px 10px; border-radius:12px; color:var(--text-primary); font-size:0.75rem;" onclick="AdvancedTableConditionalColors._addCondRuleCondition('${tableId}', ${idx})">+ Aggiungi Condizione (AND)</button>
                        </div>

                        ${resultConfigHTML}
                    </div>
                `;
            });
            listHTML += `<div class="drag-item" ondragover="AdvancedTableConditionalColors._onCondDragOver(event)" ondragleave="AdvancedTableConditionalColors._onCondDragLeave(event)" ondrop="AdvancedTableConditionalColors._onCondDrop(event, '${tableId}', ${rules.length})" style="height:15px;"></div>`;
        }

        const bodyHTML = `
            <div style="margin-bottom:20px;">
                <p style="font-size:0.85rem; color:var(--text-secondary); line-height:1.5;">
                    Le regole vengono valutate <b>in tempo reale</b> dall'alto verso il basso. <br>Questa formattazione cambia solo l'aspetto visivo e <b>non sovrascrive la data di Ultima Modifica</b> della riga.
                </p>
                <button class="btn btn-primary" style="width:100%; justify-content:center; padding:10px; font-size:0.9rem;" onclick="AdvancedTableConditionalColors._addCondRule('${tableId}')"><span style="margin-right:8px; display:flex;">${Icons.palette}</span> Nuova Regola di Colore</button>
            </div>
            ${listHTML}
        `;

        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">Annulla</button>
            <button class="btn btn-primary" onclick="AdvancedTableConditionalColors._saveConditionalColors('${tableId}')">Salva Regole</button>
        `;

        UI.openDrawer(`🎨 Colorazione Condizionale`, bodyHTML, footerHTML);
    },

    _updateCondOpacityType: (tableId, idx, type) => {
        AdvancedTableConditionalColors._tempCondRules[idx].opacityType = type;
        AdvancedTableConditionalColors._tempCondRules[idx].opacity = type === 'fixed' ? '100' : 'riga[""]';
        AdvancedTableConditionalColors._renderConditionalBuilder(tableId);
    },

    _updateCondOpacity: (tableId, idx, value) => {
        AdvancedTableConditionalColors._tempCondRules[idx].opacity = value;
    },

    _addCondRule: (tableId) => {
        const state = AdvancedTable.getState(tableId);
        const firstColId = state.columns.length > 0 ? state.columns[0].id : '';
        AdvancedTableConditionalColors._tempCondRules.push({
            id: 'cc_' + Date.now(),
            active: true,
            color: 'hl-c4',
            opacityType: 'fixed',
            opacity: '100',
            conditions: [{ colId: firstColId, operator: '=', value: '', dateMode: 'exact', dateShift: 0 }]
        });
        AdvancedTableConditionalColors._renderConditionalBuilder(tableId);
    },

    _deleteCondRule: (tableId, idx) => {
        if (!confirm("Rimuovere questa regola visiva?")) return;
        AdvancedTableConditionalColors._tempCondRules.splice(idx, 1);
        AdvancedTableConditionalColors._renderConditionalBuilder(tableId);
    },

    _toggleCondActive: (tableId, idx, active) => {
        AdvancedTableConditionalColors._tempCondRules[idx].active = active;
        AdvancedTableConditionalColors._renderConditionalBuilder(tableId);
    },

    _updateCondColor: (tableId, idx, colorClass) => {
        AdvancedTableConditionalColors._tempCondRules[idx].color = colorClass;
        AdvancedTableConditionalColors._renderConditionalBuilder(tableId);
    },

    _addCondRuleCondition: (tableId, ruleIdx) => {
        const state = AdvancedTable.getState(tableId);
        const firstColId = state.columns.length > 0 ? state.columns[0].id : '';
        AdvancedTableConditionalColors._tempCondRules[ruleIdx].conditions.push({ colId: firstColId, operator: '=', value: '', dateMode: 'exact', dateShift: 0 });
        AdvancedTableConditionalColors._renderConditionalBuilder(tableId);
    },

    _removeCondRuleCondition: (tableId, ruleIdx, condIdx) => {
        AdvancedTableConditionalColors._tempCondRules[ruleIdx].conditions.splice(condIdx, 1);
        AdvancedTableConditionalColors._renderConditionalBuilder(tableId);
    },

    _updateCondField: (tableId, ruleIdx, condIdx, field, val) => {
        const cond = AdvancedTableConditionalColors._tempCondRules[ruleIdx].conditions[condIdx];
        cond[field] = val;

        if (field === 'colId') {
            const state = AdvancedTable.getState(tableId);
            const col = state.columns.find(c => c.id === val);
            cond.value = '';
            cond.operator = (col && col.hasEndDate) ? 'range_inside' : '=';
            cond.dateMode = 'exact';
            cond.dateShift = 0;
            AdvancedTableConditionalColors._renderConditionalBuilder(tableId);
        } else if (field === 'operator' || field === 'dateMode') {
            AdvancedTableConditionalColors._renderConditionalBuilder(tableId);
        }
    },

    _onCondDragStart: (e, idx) => { 
        AdvancedTableConditionalColors._draggedRuleIdx = idx; 
        e.dataTransfer.effectAllowed = 'move'; 
        
        const card = document.getElementById(`cond-rule-${idx}`);
        if (card) {
            // Indichiamo al browser che anche se stiamo trascinando la maniglia,
            // l'immagine fantasma deve mostrare l'intera card.
            e.dataTransfer.setDragImage(card, 20, 20);
            
            // Usiamo il timeout per non far sparire istantaneamente anche l'immagine fantasma
            setTimeout(() => { card.style.opacity = '0.4'; }, 0);
        }
    },
    
    _onCondDragOver: (e) => { 
        e.preventDefault(); 
        const t = e.target.closest('.drag-item'); 
        if(t) t.style.borderTop = '3px solid var(--accent-color)'; 
    },
    
    _onCondDragLeave: (e) => { 
        const t = e.target.closest('.drag-item'); 
        if(t) t.style.borderTop = '1px solid var(--border-color)'; 
    },
    
    _onCondDrop: (e, tableId, targetIdx) => {
        e.preventDefault();
        const srcIdx = AdvancedTableConditionalColors._draggedRuleIdx;
        AdvancedTableConditionalColors._draggedRuleIdx = null;
        document.querySelectorAll('.drag-item').forEach(el => { el.style.opacity='1'; el.style.borderTop='1px solid var(--border-color)'; });
        if (srcIdx === null || srcIdx === targetIdx) return;
        const [rule] = AdvancedTableConditionalColors._tempCondRules.splice(srcIdx, 1);
        let newT = targetIdx; if (srcIdx < targetIdx) newT--;
        AdvancedTableConditionalColors._tempCondRules.splice(newT, 0, rule);
        AdvancedTableConditionalColors._renderConditionalBuilder(tableId);
    },

    _onCondDragEnd: (e, idx) => {
        const card = document.getElementById(`cond-rule-${idx}`);
        if (card) {
            card.style.opacity = '1';
        }
        document.querySelectorAll('.drag-item').forEach(el => el.style.borderTop = '1px solid var(--border-color)');
        AdvancedTableConditionalColors._draggedRuleIdx = null;
    },

    _saveConditionalColors: (tableId) => {
        let state = AdvancedTable.getState(tableId);
        
        for (let rule of AdvancedTableConditionalColors._tempCondRules) {
            if (rule.conditions.length === 0) {
                alert("Rimuovi le regole vuote prima di salvare."); return;
            }
        }

        state.conditionalColors = AdvancedTableConditionalColors._tempCondRules;
        AdvancedTable.setState(tableId, state);
        Store.triggerAutoSave();
        AdvancedTable.renderTable(tableId);
        UI.closeDrawer();
    }
};