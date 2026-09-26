/**
 * automation-ui-builder.js
 * Modulo dedicato alla generazione dell'HTML per le Interfacce di Automazioni e Pulsanti Macro.
 * Risolve la duplicazione di codice (DRY) astraendo la costruzione di Filtri e Azioni.
 * Risoluzione esatta dell'ID database per il pulsante 'Copia Prompt AI'.
 */

const AutomationUIBuilder = {

    getAvailableDatabases: () => {
        const dbList = [];
        if (AppState.databases) {
            Object.keys(AppState.databases).forEach(id => {
                const s = AppState.databases[id];
                // Filtro rigoroso: Deve avere colonne, NON deve essere una pivot/vista collegata, 
                // NON deve avere entries (Diari) o buttons (Macro), e ID specifici sono bannati.
                if (s && s.columns && Array.isArray(s.columns) && !s.isPivot && !s.isLinkedView && !s.entries && !s.buttons) {
                    if (s.title !== 'Diario/Log' && !id.includes('adv_journal_') && !id.includes('adv_code_') && !id.includes('adv_btnbar_') && !id.includes('adv_cols_') && !id.includes('adv_audio_') && !id.includes('cit_')) {
                        dbList.push({ id: id, title: s.title || 'Database Sconosciuto' });
                    }
                }
            });
        }
        return dbList;
    },

    // HELPER: Genera la griglia dei colori per la colorazione delle righe (DRY)
    getColorSwatchesHTML: (currentValue, onChangeScript) => {
        let html = `<div style="display:flex; gap:6px; flex-wrap:wrap; background:var(--bg-color); padding:8px; border-radius:6px; border:1px solid var(--border-color); width:100%;">`;
        
        const noColorSel = (!currentValue || currentValue === 'none') ? 'outline: 2px solid var(--text-primary); transform: scale(1.1); box-shadow: 0 4px 8px rgba(0,0,0,0.2);' : '';
        html += `<div class="color-swatch bg-none" style="width: 24px; height: 24px; border-radius: 4px; cursor: pointer; ${noColorSel}" title="Nessun colore" onclick="${onChangeScript.replace('$$VAL$$', 'none')}"></div>`;
        
        const pillColors = ['hl-c1', 'hl-c2', 'hl-c3', 'hl-c4', 'hl-c5', 'hl-c6', 'hl-c7', 'hl-c8', 'hl-c9', 'hl-c10'];
        pillColors.forEach(c => {
            const isSel = currentValue === c ? 'outline: 2px solid var(--text-primary); transform: scale(1.1); box-shadow: 0 4px 8px rgba(0,0,0,0.2);' : '';
            html += `<div class="color-option ${c}" style="width: 24px; height: 24px; border-radius: 4px; cursor: pointer; ${isSel}" title="${c}" onclick="${onChangeScript.replace('$$VAL$$', c)}"></div>`;
        });
        
        html += `</div>`;
        return html;
    },

    // Costruisce l'intera Action Block Card per i Pulsanti
    buildActionBlockCard: (blk, index, dbList, isThisRow, targetState, sourceState, formulaPreviews, callbacks, allowThisRow = false) => {
        const isOpen = window._openActionBlocks ? window._openActionBlocks.includes(blk.id) : (!blk.targetDbId);

        let dbOptionsHtml = allowThisRow ? `<option value="THIS_ROW" ${isThisRow ? 'selected' : ''}>Questa Riga (Record Corrente)</option>` : `<option value="">-- Seleziona Database --</option>`;
        dbList.forEach(db => {
            dbOptionsHtml += `<option value="${db.id}" ${blk.targetDbId === db.id ? 'selected' : ''}>${db.title}</option>`;
        });

        const dbName = isThisRow ? 'Questa Riga' : (targetState ? targetState.title : 'Nessun DB');
        const resolvedTargetDbId = (targetState && targetState.id) ? targetState.id : (blk.targetDbId && blk.targetDbId !== 'THIS_ROW' ? blk.targetDbId : '');
        
        let actionTitle = 'Modifica Righe';
        if (blk.actionType === 'insert') actionTitle = 'Aggiungi Riga Singola';
        if (blk.actionType === 'insert_select') actionTitle = 'Copia Righe (Da Altro DB)';
        if (blk.actionType === 'email') actionTitle = 'Invia Email (mailto)';

        let setSummary = '';
        if (blk.actionType === 'email') {
            setSummary = `<b>Email:</b> Destinatario, CC, Oggetto e Corpo`;
        } else if (targetState && blk.actions && blk.actions.length > 0) {
            const setCols = blk.actions.map(a => {
                if (a.colId === 'SYS_ACTION') return 'Sistema';
                const colDef = targetState.columns.find(c => c.id === a.colId);
                return colDef ? colDef.name : '?';
            }).filter(n => n !== '?');
            if (setCols.length > 0) setSummary = `<b>SET:</b> ${setCols.join(', ')}`;
        }

        let html = `
            <details class="action-block-card" data-block-id="${blk.id}" style="background:var(--bg-color); border-radius:8px; border:1px solid var(--border-color); margin-bottom: 5px;" ${isOpen ? 'open' : ''}>
                <summary style="padding:12px; cursor:pointer; outline:none; display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.02); border-radius:8px;">
                    <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
                        <div style="font-weight:bold; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
                            <span style="color:var(--text-secondary); opacity:0.5; font-size:0.8rem;">▶</span>
                            <span style="color:var(--accent-color);">${index + 1}.</span> 
                            ${actionTitle} in ${dbName}
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); font-weight:normal; margin-left: 20px;">
                            ${setSummary || 'Nessuna Azione'}
                        </div>
                    </div>
                    <span class="adv-icon-btn danger" style="padding:4px 8px; border:1px solid rgba(239,68,68,0.2); border-radius:4px; background:rgba(239,68,68,0.05);" title="Rimuovi questa azione" onclick="${callbacks.onBlockRemove}(event, ${index})">${Icons.trash}</span>
                </summary>
                
                <div style="padding: 15px; border-top: 1px solid var(--border-color); display:flex; flex-direction:column; gap:15px;">
                    
                    <div style="display:flex; gap:10px; align-items:flex-end;">
                        <div style="flex:2;">
                            <label style="font-size:0.8rem; font-weight:bold; color:var(--text-primary); display:block; margin-bottom:5px;">Database Bersaglio:</label>
                            <select class="modern-input act-target-db" style="width:100%; font-weight:bold;" onchange="${callbacks.onBlockChange}(${index}, 'targetDbId', this.value)">
                                ${dbOptionsHtml}
                            </select>
                        </div>
                        <div style="flex:1;">
                            <label style="font-size:0.8rem; font-weight:bold; color:var(--text-primary); display:block; margin-bottom:5px;">Azione:</label>
                            <select class="modern-input act-type-select" style="width:100%;" onchange="${callbacks.onBlockChange}(${index}, 'actionType', this.value)">
                                <option value="update" ${blk.actionType === 'update' ? 'selected' : ''}>Modifica (UPDATE)</option>
                                <option value="insert" ${blk.actionType === 'insert' ? 'selected' : ''} ${isThisRow ? 'disabled' : ''}>Aggiungi Singola Riga</option>
                                <option value="insert_select" ${blk.actionType === 'insert_select' ? 'selected' : ''} ${isThisRow ? 'disabled' : ''}>Copia Righe (Da Altro DB)</option>
                                <option value="email" ${blk.actionType === 'email' ? 'selected' : ''}>Invia Email (mailto)</option>
                            </select>
                        </div>
                    </div>
        `;

        if (blk.actionType === 'insert_select') {
            let sourceDbOptionsHtml = '<option value="">-- Seleziona DB Origine --</option>';
            dbList.forEach(db => {
                sourceDbOptionsHtml += `<option value="${db.id}" ${blk.sourceDbId === db.id ? 'selected' : ''}>${db.title}</option>`;
            });

            html += `
                <div style="background:var(--item-hover); padding:15px; border-radius:6px; border:1px solid rgba(16, 185, 129, 0.3);">
                    <div style="font-size:0.8rem; color:var(--text-primary); margin-bottom:10px; font-weight:bold;">
                        ${Icons.import} Origine Dati (Da dove copiare le righe)
                    </div>
                    <select class="modern-input act-source-db" style="width:100%; border-color:rgba(16,185,129,0.3) !important;" onchange="${callbacks.onBlockChange}(${index}, 'sourceDbId', this.value)">
                        ${sourceDbOptionsHtml}
                    </select>
                    
                    ${sourceState ? AutomationUIBuilder.buildFiltersListHTML(index, sourceState, blk.filters, callbacks, true).html : ''}
                </div>
            `;
        }

        if (targetState && targetState.columns) {
            
            if (!isThisRow && (blk.actionType === 'update' || blk.actionType === 'email')) {
                const filtersRes = AutomationUIBuilder.buildFiltersListHTML(index, targetState, blk.filters, callbacks, false);
                html += `
                    <div style="margin-top:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:5px; margin-bottom:10px;">
                            <h4 style="margin:0; font-size:0.8rem; color:var(--tx-c4); display:flex; align-items:center; gap:5px;">${Icons.filter} Quali righe modificare nel Bersaglio?</h4>
                            <button class="adv-icon-btn" style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:12px; padding:2px 8px; color:var(--text-primary);" onclick="${callbacks.onFilterAdd}(event, ${index})">+ Condizione</button>
                        </div>
                        <div class="act-filter-list" style="display:flex; flex-direction:column;">
                            ${filtersRes.html || `<div style="font-size:0.8rem; color:var(--text-secondary); text-align:center; padding:5px;">Nessun filtro applicato. Le modificherà TUTTE.</div>`}
                        </div>
                    </div>
                `;
            }

            let setActionsHtml = '';
            
            if (blk.actionType === 'email') {
                if (!blk.actions || blk.actions.length < 4 || blk.actions[0].colId !== 'EMAIL_TO') {
                    blk.actions = [
                        { colId: 'EMAIL_TO', type: 'set_fixed', value: '' }, { colId: 'EMAIL_CC', type: 'set_fixed', value: '' },
                        { colId: 'EMAIL_SUBJECT', type: 'set_fixed', value: '' }, { colId: 'EMAIL_BODY', type: 'set_formula', value: '' }
                    ];
                }

                const renderEmailField = (aIdx, label) => {
                    const act = blk.actions[aIdx];
                    const typeOpts = LogicEngine.getActionTypesHTML({type:'text'}, act.type, 'email');
                    const inputId = `in_${blk.id}_${aIdx}`;
                    const isBody = aIdx === 3;
                    
                    const changeCb = `${callbacks.onActionChange}(${index}, ${aIdx})`;
                    const valHtml = LogicEngine.getActionInputHTML({type:'text'}, act.type, act.value, act.value2, targetState, changeCb, { isEmailBody: isBody, inputId: inputId });

                    const isFormula = act.type.includes('formula');
                    const prevId = `prev_btn_${blk.id}_${aIdx}`;

                    if (isFormula) {
                        formulaPreviews.push({ id: prevId, inputId: inputId, formula: act.value, targetState: targetState, sourceState: sourceState, filters: blk.filters });
                        return `
                            <div class="btn-action-field-row" style="display:flex; flex-direction:column; gap:8px; background:var(--bg-color); padding:10px; border-radius:6px; border:1px solid var(--border-color); margin-bottom:8px;">
                                <div style="display:flex; align-items:center; width:100%; gap:8px;">
                                    <span style="font-size:0.75rem; font-weight:bold; color:var(--accent-color); width:80px; text-align:right;">${label}</span>
                                    <select class="modern-input action-type" style="flex:1; margin:0; font-weight:bold;" onchange="${changeCb}('type', this.value); ${callbacks.onRefresh}();">
                                        ${typeOpts}
                                    </select>
                                </div>
                                <div style="width:100%;">${valHtml}</div>
                                <div id="${prevId}" style="width:100%; background:rgba(0,0,0,0.02); padding:8px; border-radius:4px; font-family:monospace; font-size:0.85rem; border:1px dashed var(--border-color);"></div>
                            </div>
                        `;
                    } else {
                        return `
                            <div class="btn-action-field-row" style="display:flex; gap:8px; align-items:center; background:var(--bg-color); padding:8px; border-radius:6px; border:1px solid var(--border-color); margin-bottom:8px;">
                                <span style="font-size:0.75rem; font-weight:bold; color:var(--accent-color); width:80px; text-align:right;">${label}</span>
                                <select class="modern-input action-type" style="flex:1; margin:0; font-weight:bold;" onchange="${changeCb}('type', this.value); ${callbacks.onRefresh}();">
                                    ${typeOpts}
                                </select>
                                <div style="flex:1.5;">${valHtml}</div>
                            </div>
                        `;
                    }
                };
                
                setActionsHtml += renderEmailField(0, 'A (Email)');
                setActionsHtml += renderEmailField(1, 'CC (Copia)');
                setActionsHtml += renderEmailField(2, 'Oggetto');
                setActionsHtml += renderEmailField(3, 'Corpo (Testo)');

                const hasFormula = blk.actions.some(a => a.type.includes('formula'));
                let aiHelper = '';
                if (hasFormula) {
                    const btnAiId = `btnCopyAutoAIPrompt_${allowThisRow ? 'colbtn_' : ''}${blk.id}`;
                    aiHelper = `
                    <div style="background: rgba(37, 99, 235, 0.05); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(37, 99, 235, 0.2); margin-bottom: 10px; font-size: 0.8rem; display:flex; align-items:center; gap:10px;">
                        <span style="display:inline-flex; color:var(--accent-color);">${Icons.formula}</span>
                        <div style="flex:1; color:var(--text-secondary);">
                            <b>Modo Formula attivo.</b> Le variabili:<br>
                            <code>riga</code> = Dati della riga bersaglio (Destinazione).<br>
                            <code>origine</code> = Dati di <b>Questa Riga</b> in cui hai cliccato il pulsante!
                        </div>
                        <button id="${btnAiId}" class="btn" style="padding: 4px 8px; font-size: 0.75rem; flex-shrink:0;" onclick="LogicEngine.copyAutomationAIPrompt(event, '${resolvedTargetDbId}', '${btnAiId}')" title="Copia Prompt per AI">
                            <span style="display:inline-flex; align-items:center; gap:5px;">${Icons.clipboard} Copia Prompt AI</span>
                        </button>
                    </div>`;
                }

                html += `
                    <div style="background:var(--item-hover); padding:12px; border-radius:6px; border:1px solid var(--border-color);">
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:5px; margin-bottom:10px;">
                            <h4 style="margin:0; font-size:0.8rem; color:var(--accent-color); display:flex; align-items:center; gap:5px;">${Icons.data} Configurazione Email (Mailto)</h4>
                        </div>
                        ${aiHelper}
                        <div class="act-set-list" style="display:flex; flex-direction:column; gap:8px;">
                            ${setActionsHtml}
                        </div>
                    </div>
                `;

            } else {
                if (blk.actions && blk.actions.length > 0 && blk.actions[0].colId === 'EMAIL_TO') {
                    blk.actions = [];
                }

                const actionsToRender = (blk.actions && blk.actions.length > 0) ? blk.actions : [];
                let actionColOptionsArray = [{ val: '', label: '-- Seleziona Colonna --' }];
                
                targetState.columns.forEach(c => {
                    if (!['created_time', 'last_edited_time', 'formula', 'rollup'].includes(c.type)) {
                        actionColOptionsArray.push({ val: c.id, label: `${c.name} (${c.type})` });
                    }
                });
                
                actionsToRender.forEach((act, actIndex) => {
                    let selHtml = '';
                    actionColOptionsArray.forEach(opt => {
                        selHtml += `<option value="${opt.val}" ${act.colId === opt.val ? 'selected' : ''}>${opt.label}</option>`;
                    });

                    const aColDef = targetState.columns.find(c => c.id === act.colId) || { type: 'text' }; 
                    let mode = blk.actionType === 'insert' ? 'button_insert' : 'button_update';
                    if (blk.actionType === 'insert_select') mode = 'button_select';

                    let typeOptionsHTML = LogicEngine.getActionTypesHTML(aColDef, act.type, mode);
                    const changeCallback = `${callbacks.onActionChange}(${index}, ${actIndex})`;
                    const inputId = `in_${blk.id}_${actIndex}`;
                    
                    let valInputHTML = '';

                    if (act.type === 'color_row') {
                        const changeScript = `${changeCallback}('value', '$$VAL$$'); ${callbacks.onRefresh}();`;
                        const colorSwatches = AutomationUIBuilder.getColorSwatchesHTML(act.value, changeScript);

                        const rawOp = act.value2 !== undefined && act.value2 !== '' ? String(act.value2) : '100';
                        const isFormulaOp = rawOp.startsWith('=');
                        const cleanOp = isFormulaOp ? rawOp.substring(1).trim() : rawOp;
                        const safeOpVal = cleanOp.replace(/"/g, '&quot;');

                        let opInput = `
                            <div style="display:flex; align-items:center; gap:5px; margin-left:auto; padding:4px 8px; border-radius:4px; border:1px solid var(--border-color); flex-shrink:0;">
                                <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">Opacità:</span>
                                <select class="modern-input" style="padding:2px; font-size:0.75rem;" onchange="
                                    const isF = this.value === 'formula';
                                    const newVal = isF ? '=riga[\\'\\']' : '100';
                                    ${changeCallback}('value2', newVal);
                                    ${callbacks.onRefresh}();
                                ">
                                    <option value="fixed" ${!isFormulaOp ? 'selected' : ''}>Fissa %</option>
                                    <option value="formula" ${isFormulaOp ? 'selected' : ''}>Formula JS</option>
                                </select>
                                ${!isFormulaOp 
                                    ? `<input type="number" class="modern-input action-val2" style="padding:2px; text-align:center;" value="${safeOpVal}" min="0" max="100" oninput="${changeCallback}('value2', this.value)">`
                                    : `<input type="text" class="modern-input" style="padding:2px; font-family:monospace; color:var(--accent-color);" value="${safeOpVal}" placeholder="es: riga['Num']" oninput="${changeCallback}('value2', '=' + this.value)">`
                                }
                            </div>
                        `;

                        valInputHTML = `<div style="display:flex; align-items:center; gap:10px; width:100%; flex-wrap:wrap;">${colorSwatches}${opInput}</div>`;
                    } else {
                        valInputHTML = LogicEngine.getActionInputHTML(aColDef, act.type, act.value, act.value2, targetState, changeCallback, { sourceDbId: blk.sourceDbId, inputId: inputId });
                    }

                    const isFormula = act.type && act.type.includes('formula');
                    const prevId = `prev_btn_${blk.id}_${actIndex}`;

                    if (isFormula) {
                        formulaPreviews.push({ id: prevId, inputId: inputId, formula: act.value, targetState: targetState, sourceState: sourceState, filters: blk.filters });
                        setActionsHtml += `
                            <div class="btn-action-field-row" style="display:flex; flex-direction:column; gap:8px; background:var(--bg-color); padding:10px; border-radius:6px; border:1px solid var(--border-color); margin-bottom:8px;">
                                <div style="display:flex; align-items:center; width:100%; gap:8px;">
                                    <span style="font-size:0.75rem; font-weight:bold; color:var(--tx-c4); width:35px; text-align:right;">SET</span>
                                    <select class="modern-input action-col" style="flex:1.5; margin:0; font-weight:bold;" onchange="${callbacks.onActionChange}(${index}, ${actIndex})('colId', this.value); ${callbacks.onRefresh}();">${selHtml}</select>
                                    <select class="modern-input action-type" style="flex:1; margin:0;" onchange="${changeCallback}('type', this.value); ${callbacks.onRefresh}();">${typeOptionsHTML}</select>
                                    <button class="adv-icon-btn danger" style="padding:4px;" title="Rimuovi questo campo" onclick="${callbacks.onActionRemove}(event, ${index}, ${actIndex})">${Icons.close}</button>
                                </div>
                                <div style="width:100%;">${valInputHTML}</div>
                                <div id="${prevId}" style="width:100%; background:rgba(0,0,0,0.02); padding:8px; border-radius:4px; font-family:monospace; font-size:0.85rem; border:1px dashed var(--border-color);"></div>
                            </div>
                        `;
                    } else {
                        setActionsHtml += `
                            <div class="btn-action-field-row" style="display:flex; gap:8px; align-items:center; background:var(--bg-color); padding:8px; border-radius:6px; border:1px solid var(--border-color); margin-bottom:8px;">
                                <span style="font-size:0.75rem; font-weight:bold; color:var(--tx-c4); width:35px; text-align:right;">SET</span>
                                <select class="modern-input action-col" style="flex:1.5; margin:0; font-weight:bold;" onchange="${callbacks.onActionChange}(${index}, ${actIndex})('colId', this.value); ${callbacks.onRefresh}();">${selHtml}</select>
                                <select class="modern-input action-type" style="flex:1; margin:0;" onchange="${changeCallback}('type', this.value); ${callbacks.onRefresh}();">${typeOptionsHTML}</select>
                                <div style="flex:1.5;">${valInputHTML}</div>
                                <button class="adv-icon-btn danger" style="padding:4px;" title="Rimuovi questo campo" onclick="${callbacks.onActionRemove}(event, ${index}, ${actIndex})">${Icons.close}</button>
                            </div>
                        `;
                    }
                });

                const hasFormula = blk.actions.some(a => a.type && a.type.includes('formula'));
                let aiHelper = '';
                if (hasFormula) {
                    const btnAiId = `btnCopyAutoAIPrompt_${allowThisRow ? 'colbtn_' : ''}${blk.id}`;
                    aiHelper = `
                    <div style="background: rgba(37, 99, 235, 0.05); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(37, 99, 235, 0.2); margin-bottom: 10px; font-size: 0.8rem; display:flex; align-items:center; gap:10px;">
                        <span style="display:inline-flex; color:var(--accent-color);">${Icons.formula}</span>
                        <div style="flex:1; color:var(--text-secondary);">
                            <b>Modo Formula attivo.</b> Le variabili:<br>
                            <code>riga</code> = Dati della riga bersaglio (Destinazione).<br>
                            <code>origine</code> = Dati di <b>Questa Riga</b> in cui hai cliccato il pulsante!
                        </div>
                        <button id="${btnAiId}" class="btn" style="padding: 4px 8px; font-size: 0.75rem; flex-shrink:0;" onclick="LogicEngine.copyAutomationAIPrompt(event, '${resolvedTargetDbId}', '${btnAiId}')" title="Copia Prompt per AI">
                            <span style="display:inline-flex; align-items:center; gap:5px;">${Icons.clipboard} Copia Prompt AI</span>
                        </button>
                    </div>`;
                }

                html += `
                    <div style="background:var(--item-hover); padding:12px; border-radius:6px; border:1px solid var(--border-color);">
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:5px; margin-bottom:10px;">
                            <h4 style="margin:0; font-size:0.8rem; color:var(--accent-color); display:flex; align-items:center; gap:5px;">${Icons.data} Valori da impostare (SET)</h4>
                            <button class="adv-icon-btn" style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:12px; padding:2px 8px; color:var(--text-primary);" onclick="${callbacks.onActionAdd}(event, ${index})">+ Campo</button>
                        </div>
                        ${aiHelper}
                        <div class="act-set-list" style="display:flex; flex-direction:column;">
                            ${setActionsHtml || `<div style="font-size:0.8rem; color:var(--danger-color); text-align:center; padding:5px;">Imposta almeno una colonna.</div>`}
                        </div>
                    </div>
                `;
            }
        }
        
        html += `</div></details>`;
        return html;
    },

    buildFiltersListHTML: (index, filterStateDB, filterArray, callbacks, isSourceFilter = false) => {
        if (!filterStateDB) return { html: '', count: 0 };
        let fHtml = '';
        const filtersToRender = (filterArray && filterArray.length > 0) ? filterArray : [];
        
        let filterColOptionsArray = [{ val: '', label: '-- Seleziona Colonna --' }];
        filterStateDB.columns.forEach(c => {
            filterColOptionsArray.push({ val: c.id, label: `${c.name} (${c.type})`, type: c.type });
        });
        
        // Aggiunta opzione Formula Personalizzata alla fine della lista colonne
        filterColOptionsArray.push({ val: 'SYS_JS_FORMULA', label: 'Formula JS (Personalizzata)', type: 'special' });

        filtersToRender.forEach((flt, fltIndex) => {
            let fltColHtml = '';
            let selectedColDef = null;

            if (flt.colId === 'SYS_JS_FORMULA') {
                selectedColDef = { id: 'SYS_JS_FORMULA', type: 'special' };
            } else {
                selectedColDef = filterStateDB.columns.find(c => c.id === flt.colId);
            }

            filterColOptionsArray.forEach(opt => {
                let style = opt.val === 'SYS_JS_FORMULA' ? 'font-weight:bold; color:var(--accent-color); background:rgba(37,99,235,0.05);' : '';
                fltColHtml += `<option value="${opt.val}" ${flt.colId === opt.val ? 'selected' : ''} style="${style}">${opt.label}</option>`;
            });

            const isFormula = flt.colId === 'SYS_JS_FORMULA';
            const opHtml = LogicEngine.getConditionOperatorsHTML(selectedColDef, flt.operator, false);
            const isValHidden = ['empty', 'not_empty'].includes(flt.operator);

            const changeCb = `${callbacks.onFilterChange}(${index}, ${fltIndex})`;

            let valHtml = '';
            if (isFormula) {
                valHtml = `<textarea class="modern-input act-filter-val" style="flex:1.5; margin:0; font-family:monospace; color:var(--accent-color); min-height:80px; resize:vertical;" placeholder="Es: riga['Stato'] === 'Aperto' || Number(riga['Importo']) > 100" oninput="${changeCb}('value', this.value)">${(flt.value || '').replace(/"/g, '&quot;')}</textarea>`;
            } else {
                valHtml = `<input type="text" class="modern-input act-filter-val" style="flex:1.5; margin:0; ${isValHidden ? 'display:none;' : ''}" placeholder="Valore..." value="${(flt.value || '').replace(/"/g, '&quot;')}" oninput="${changeCb}('value', this.value)">`;
            }

            fHtml += `
                <div class="btn-filter-field-row" style="display:flex; gap:8px; align-items:${isFormula ? 'flex-start' : 'center'}; margin-bottom:5px;">
                    <span style="font-size:0.75rem; font-weight:bold; color:${isSourceFilter ? '#10b981' : 'var(--tx-c4)'}; width:45px; text-align:right; margin-top:${isFormula ? '10px' : '0'};">${fltIndex === 0 ? 'WHERE' : 'AND'}</span>
                    <select class="modern-input act-filter-col" style="flex:${isFormula ? '1' : '2'}; margin:0;" onchange="${changeCb}('colId', this.value)">${fltColHtml}</select>
                    <select class="modern-input act-filter-op" style="${isFormula ? 'display:none;' : 'flex:1; margin:0;'}" onchange="${changeCb}('operator', this.value)">${opHtml}</select>
                    ${valHtml}
                    <button class="adv-icon-btn danger" style="padding:4px; margin-top:${isFormula ? '10px' : '0'};" title="Rimuovi condizione" onclick="${callbacks.onFilterRemove}(event, ${index}, ${fltIndex})">${Icons.close}</button>
                </div>
            `;
        });
        
        return { html: fHtml, count: filtersToRender.length };
    }
};