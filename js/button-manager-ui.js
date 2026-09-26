/**
 * button-manager-ui.js
 * Interfaccia di configurazione dei Pulsanti Programmabili.
 * Sincronizzazione atomica degli ID database per la generazione dei Prompt AI.
 */

Object.assign(ButtonManager, {

    _draftBtnState: null,
    _draftBarId: null,
    _isRefreshing: false,

    openConfig: (e, barId, btnId) => {
        if (e) e.stopPropagation();
        UI.Menu.closeAll(true);

        const state = ButtonManager.getState(barId);
        if (!state) return;

        const btnState = state.buttons.find(b => b.id === btnId);
        if (!btnState) return;

        ButtonManager._migrateButtonState(btnState);

        ButtonManager._draftBtnState = JSON.parse(JSON.stringify(btnState));
        ButtonManager._draftBarId = barId;

        window._openActionBlocks = undefined;
        window._openAesthetic = undefined;

        const bodyHTML = `<div id="btnConfigFullArea" style="display:flex; flex-direction:column; gap:10px; padding-bottom:30px;"></div>`;

        const footerHTML = `
            <div style="display:flex; gap:10px;">
                <button class="btn" style="background:rgba(34, 197, 94, 0.1); color:#22c55e; border-color:#22c55e;" onclick="ButtonManager.execute('${barId}', '${btnId}', true)"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.play} Esegui</span></button>
            </div>
            <div style="display:flex; gap:10px; margin-left:auto;">
                <button class="btn" onclick="UI.closeDrawer()">Annulla</button>
                <button class="btn btn-primary" onclick="ButtonManager.saveConfig('${barId}', '${btnId}')">Salva Configurazione</button>
            </div>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.settings} Impostazioni Pulsante</span>`, bodyHTML, footerHTML);

        setTimeout(() => {
            ButtonManager.refreshConfigOptions(barId, btnId);
        }, 50);
    },

    setButtonColor: (e, barId, btnId, colorHex) => {
        if (e) e.preventDefault();
        ButtonManager._updateButtonField('color', colorHex);
    },

    _updateButtonField: (field, val) => {
        if (!ButtonManager._draftBtnState) return;
        ButtonManager._draftBtnState[field] = val;
        ButtonManager._triggerRefresh();
    },

    refreshConfigOptions: (barId, btnId) => {
        const fullArea = document.getElementById('btnConfigFullArea');
        if (!fullArea) return;

        const btnState = ButtonManager._draftBtnState;
        if (!btnState) return;

        const dbList = AutomationUIBuilder.getAvailableDatabases();

        const isNewButton = btnState.label === 'Nuovo Pulsante' && (!btnState.actionBlocks || btnState.actionBlocks.length === 0);
        const isAestheticOpen = window._openAesthetic !== undefined ? window._openAesthetic : isNewButton;
        
        const formulaPreviews = [];

        const buttonColors = [
            { val: '#2563eb', name: 'Blu (Default)' },
            { val: '#22c55e', name: 'Verde (Successo)' },
            { val: '#ef4444', name: 'Rosso (Pericolo)' },
            { val: '#eab308', name: 'Giallo (Avviso)' },
            { val: '#8b5cf6', name: 'Viola (Speciale)' },
            { val: '#333333', name: 'Nero (Scuro)' }
        ];

        let colorSwatchesHtml = `<div style="display: flex; gap: 8px; margin-top: 5px; flex-wrap: wrap;">`;
        buttonColors.forEach(c => {
            const isSelected = (btnState.color || 'var(--accent-color)') === c.val;
            const borderStyle = isSelected ? 'border: 2px solid var(--text-primary); transform: scale(1.1);' : 'border: 2px solid transparent;';
            colorSwatchesHtml += `
                <div class="btn-color-swatch" 
                     style="width: 28px; height: 28px; border-radius: 6px; background-color: ${c.val}; cursor: pointer; ${borderStyle} box-shadow: 0 2px 4px rgba(0,0,0,0.15); transition: all 0.1s ease;" 
                     onclick="ButtonManager.setButtonColor(event, '${barId}', '${btnId}', '${c.val}')" 
                     title="${c.name}">
                </div>
            `;
        });
        colorSwatchesHtml += `</div>`;

        let html = `
            <div style="display:flex; justify-content:flex-end; align-items:center; margin-bottom:5px;">
                <button class="adv-icon-btn danger" style="background: rgba(239,68,68,0.1);" onclick="ButtonManager.deleteButtonFromBar('${barId}', '${btnId}')" title="Elimina questo pulsante">${Icons.trash} Elimina Pulsante</button>
            </div>
            
            <details id="btnAestheticOptions" class="aesthetic-block-card" style="background:var(--item-hover); border-radius:8px; border:1px solid var(--border-color); margin-bottom:15px;" ${isAestheticOpen ? 'open' : ''}>
                <summary style="padding:12px; font-weight:bold; cursor:pointer; outline:none; display:flex; justify-content:space-between; align-items:center; color:var(--text-primary);">
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <span style="font-size:0.95rem; display:flex; align-items:center; gap:8px;">🎨 Aspetto e Comportamento</span>
                        <span style="font-size:0.8rem; color:var(--text-secondary); font-weight:normal;">
                            <b>Testo:</b> ${btnState.label || 'Nessuno'} <span style="opacity:0.5;">|</span> <b>Conferma:</b> ${btnState.requireConfirm ? 'Sì' : 'No'}
                        </span>
                    </div>
                    <span style="color:var(--text-secondary); font-size:0.8rem;">▼</span>
                </summary>
                
                <div style="padding: 0 15px 15px 15px; display:flex; flex-direction:column; gap:10px; border-top: 1px solid var(--border-color); margin-top: 10px; padding-top: 15px;">
                    <label style="font-size:0.8rem; font-weight:bold; color:var(--text-primary);">Etichetta Pulsante:</label>
                    <input type="text" id="btnConfigLabel" class="modern-input" style="width:100%;" value="${(btnState.label || '').replace(/"/g, '&quot;')}" placeholder="Testo visibile... (Es: Completa Ordine o =Formula)" oninput="if (ButtonManager._draftBtnState) ButtonManager._draftBtnState.label = this.value;">
                    
                    <label style="font-size:0.8rem; font-weight:bold; color:var(--text-primary); margin-top:5px;">Colore Pulsante:</label>
                    ${colorSwatchesHtml}
                    
                    <label style="display:flex; align-items:center; gap:8px; font-size:0.8rem; cursor:pointer; color:var(--text-secondary); margin-top:10px;">
                        <input type="checkbox" style="transform:scale(1.1);" ${btnState.requireConfirm ? 'checked' : ''} onchange="ButtonManager._updateButtonField('requireConfirm', this.checked)">
                        Chiedi conferma all'utente prima dell'esecuzione
                    </label>
                </div>
            </details>
            
            <h4 style="margin: 0; font-size: 0.95rem; color: var(--accent-color); border-bottom: 1px solid var(--border-color); padding-bottom: 5px;">Azioni da Eseguire (Macro)</h4>
        `;

        if (!btnState.actionBlocks || btnState.actionBlocks.length === 0) {
            html += `<div style="text-align:center; padding:20px; color:var(--text-secondary); font-style:italic; background:var(--bg-color); border:1px dashed var(--border-color); border-radius:6px;">Nessuna azione configurata. Aggiungine una per iniziare.</div>`;
        } else {
            
            const callbacks = {
                onBlockChange: `ButtonManager._updateActionBlockField`,
                onBlockRemove: `ButtonManager.removeActionBlock`,
                onFilterChange: `ButtonManager._updateFilterField`,
                onFilterRemove: `ButtonManager.removeFilterField`,
                onFilterAdd: `ButtonManager.addFilterField`,
                onActionChange: `ButtonManager._updateActionField`,
                onActionRemove: `ButtonManager.removeSetActionField`,
                onActionAdd: `ButtonManager.addSetActionField`,
                onRefresh: `ButtonManager._triggerRefresh`
            };

            btnState.actionBlocks.forEach((blk, index) => {
                const isThisRow = false; 
                const targetState = blk.targetDbId ? AdvancedTable.getTableState(blk.targetDbId) : null;
                if (targetState) targetState.id = blk.targetDbId;

                const sourceState = blk.sourceDbId ? AdvancedTable.getTableState(blk.sourceDbId) : null;
                if (sourceState) sourceState.id = blk.sourceDbId;
                
                html += AutomationUIBuilder.buildActionBlockCard(blk, index, dbList, isThisRow, targetState, sourceState, formulaPreviews, callbacks, false);
            });
        }

        html += `
            <button class="btn" style="width:100%; justify-content:center; padding:10px; border-style:dashed; margin-top:10px;" onclick="ButtonManager.addActionBlock(event, '${barId}', '${btnId}')">+ Aggiungi Blocco Azione</button>
        `;

        fullArea.innerHTML = html;
        
        fullArea.querySelectorAll('.action-block-card, .aesthetic-block-card').forEach(details => {
            details.addEventListener('toggle', () => {
                ButtonManager._captureOpenStates();
            });
        });

        setTimeout(() => {
            formulaPreviews.forEach(p => {
                LogicEngine.updateFormulaLivePreview(p.id, p.formula, p.targetState, p.filters, p.sourceState);
                const inputEl = document.getElementById(p.inputId);
                if (inputEl) {
                    let debounceTimer;
                    inputEl.addEventListener('input', (e) => {
                        clearTimeout(debounceTimer);
                        debounceTimer = setTimeout(() => {
                            LogicEngine.updateFormulaLivePreview(p.id, e.target.value, p.targetState, p.filters, p.sourceState);
                        }, 300);
                    });
                }
            });
        }, 100);
    },

    _updateActionBlockField: (blkIdx, field, val) => {
        let btnState = ButtonManager._draftBtnState;
        if (!btnState || !btnState.actionBlocks[blkIdx]) return;
        
        const blk = btnState.actionBlocks[blkIdx];
        const oldType = blk.actionType;
        blk[field] = val;
        
        if (field === 'targetDbId' && val === 'THIS_ROW') {
            if (blk.actionType !== 'email') blk.actionType = 'update';
            blk.filters = [];
        }
        
        if (field === 'actionType' && oldType !== val) {
            blk.actions = [];
        }

        ButtonManager._triggerRefresh();
    },

    _updateFilterField: (blkIdx, fIdx) => {
        return (field, val) => {
            let btnState = ButtonManager._draftBtnState;
            if (!btnState || !btnState.actionBlocks[blkIdx]) return;
            const flt = btnState.actionBlocks[blkIdx].filters[fIdx];
            if (flt) {
                flt[field] = val;
                if (field === 'colId') { flt.value = ''; flt.operator = '='; }
                if (field === 'colId' || field === 'operator') ButtonManager._triggerRefresh();
            }
        };
    },

    _updateActionField: (blkIdx, aIdx) => {
        return (field, value) => {
            let btnState = ButtonManager._draftBtnState;
            if (!btnState || !btnState.actionBlocks[blkIdx]) return;
            let act = btnState.actionBlocks[blkIdx].actions[aIdx];
            if (act) {
                act[field] = value;
                if (field === 'colId' || field === 'type') {
                    if (field === 'colId') act.type = 'set_fixed';
                    act.value = ''; act.value2 = '';
                    ButtonManager._triggerRefresh();
                }
            }
        };
    },

    _captureOpenStates: () => {
        const fullArea = document.getElementById('btnConfigFullArea');
        if (fullArea) {
            window._openActionBlocks = Array.from(fullArea.querySelectorAll('.action-block-card[open]')).map(el => el.dataset.blockId);
            const aesthetic = document.getElementById('btnAestheticOptions');
            if (aesthetic) window._openAesthetic = aesthetic.hasAttribute('open');
        }
    },

    addActionBlock: (e, barId, btnId) => {
        if(e) e.preventDefault();
        
        let btnState = ButtonManager._draftBtnState;
        if(!btnState) return;

        const newId = 'actblk_' + Store.generateId();
        
        btnState.actionBlocks.push({
            id: newId,
            targetDbId: null,
            actionType: 'update',
            filters: [],
            actions: []
        });

        if (!window._openActionBlocks) window._openActionBlocks = [];
        window._openActionBlocks.push(newId);

        ButtonManager._triggerRefresh();
    },

    removeActionBlock: (e, blkIdx) => {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        if (!confirm("Eliminare interamente questa Azione dalla Macro?")) return;

        let btnState = ButtonManager._draftBtnState;
        if(!btnState) return;

        btnState.actionBlocks.splice(blkIdx, 1);
        ButtonManager._triggerRefresh();
    },

    addSetActionField: (e, blkIdx) => {
        if (e) e.preventDefault();
        
        let btnState = ButtonManager._draftBtnState;
        if(!btnState || !btnState.actionBlocks[blkIdx]) return;
        
        let blk = btnState.actionBlocks[blkIdx];
        if (!blk.actions) blk.actions = [];
        blk.actions.push({ colId: '', type: 'set_fixed', value: '' });
        
        ButtonManager._triggerRefresh();
    },

    removeSetActionField: (e, blkIdx, actionIndex) => {
        if (e) e.preventDefault();

        let btnState = ButtonManager._draftBtnState;
        if(!btnState || !btnState.actionBlocks[blkIdx]) return;
        
        let blk = btnState.actionBlocks[blkIdx];
        if (blk && blk.actions) {
            blk.actions.splice(actionIndex, 1);
        }
        
        ButtonManager._triggerRefresh();
    },

    addFilterField: (e, blkIdx) => {
        if (e) e.preventDefault();
        
        let btnState = ButtonManager._draftBtnState;
        if(!btnState || !btnState.actionBlocks[blkIdx]) return;
        
        let blk = btnState.actionBlocks[blkIdx];
        if (!blk.filters) blk.filters = [];
        blk.filters.push({ colId: '', operator: '=', value: '' });
        
        ButtonManager._triggerRefresh();
    },

    removeFilterField: (e, blkIdx, filterIndex) => {
        if (e) e.preventDefault();

        let btnState = ButtonManager._draftBtnState;
        if(!btnState || !btnState.actionBlocks[blkIdx]) return;
        
        let blk = btnState.actionBlocks[blkIdx];
        if (blk && blk.filters) {
            blk.filters.splice(filterIndex, 1);
        }
        
        ButtonManager._triggerRefresh();
    },

    _triggerRefresh: () => {
        if (ButtonManager._isRefreshing) return;
        ButtonManager._isRefreshing = true;
        try {
            ButtonManager._captureOpenStates();
            const labelEl = document.getElementById('btnConfigLabel');
            if (labelEl && ButtonManager._draftBtnState) {
                 ButtonManager._draftBtnState.label = labelEl.value.trim();
            }
            const barId = ButtonManager._draftBarId;
            const btnState = ButtonManager._draftBtnState;
            if (!barId || !btnState) return;
            
            ButtonManager.refreshConfigOptions(barId, btnState.id);
        } finally {
            ButtonManager._isRefreshing = false;
        }
    },

    _saveConfigFromDOM: (barId, btnId, silent = false) => {
        ButtonManager._captureOpenStates();

        let btnState = ButtonManager._draftBtnState;
        if (!btnState) return null;
        
        const labelEl = document.getElementById('btnConfigLabel');
        if (labelEl) btnState.label = labelEl.value.trim();

        btnState.actionBlocks = [];
        
        document.querySelectorAll('.action-block-card').forEach(card => {
            const blockId = card.dataset.blockId;
            const targetDbEl = card.querySelector('.act-target-db');
            const actionTypeEl = card.querySelector('.act-type-select');
            const sourceDbEl = card.querySelector('.act-source-db');
            
            const targetDbId = targetDbEl ? targetDbEl.value : null;
            const actionType = actionTypeEl ? actionTypeEl.value : 'update';
            const sourceDbId = sourceDbEl ? sourceDbEl.value : null;
            
            const filters = [];
            if (actionType === 'update' || actionType === 'insert_select' || actionType === 'email') {
                card.querySelectorAll('.btn-filter-field-row').forEach(row => {
                    const colEl = row.querySelector('.act-filter-col');
                    const opEl = row.querySelector('.act-filter-op');
                    const valEl = row.querySelector('.act-filter-val');
                    if (colEl && opEl) {
                        filters.push({ colId: colEl.value, operator: opEl.value, value: valEl ? valEl.value : '' });
                    }
                });
            }

            const actions = [];
            card.querySelectorAll('.btn-action-field-row').forEach(row => {
                const colEl = row.querySelector('.action-col');
                const typeEl = row.querySelector('.action-type');
                const valEl = row.querySelector('.action-val');
                const val2El = row.querySelector('.action-val2');
                
                if (typeEl) {
                    const colId = colEl ? colEl.value : null;
                    const type = typeEl.value;
                    const val = valEl ? valEl.value : '';
                    const val2 = val2El ? val2El.value : '';
                    
                    const pseudoColId = row.querySelector('span') && row.querySelector('span').innerText.includes('A (Email)') ? 'EMAIL_TO' : 
                                        (row.querySelector('span') && row.querySelector('span').innerText.includes('CC') ? 'EMAIL_CC' : 
                                        (row.querySelector('span') && row.querySelector('span').innerText.includes('Oggetto') ? 'EMAIL_SUBJECT' : 
                                        (row.querySelector('span') && row.querySelector('span').innerText.includes('Corpo') ? 'EMAIL_BODY' : colId)));
                    
                    if (pseudoColId) {
                        actions.push({ colId: pseudoColId, type: type, value: val, value2: val2 });
                    }
                }
            });

            btnState.actionBlocks.push({
                id: blockId,
                targetDbId,
                sourceDbId,
                actionType,
                filters,
                actions
            });
        });

        return btnState;
    },

    saveConfig: (barId, btnId) => {
        const draft = ButtonManager._saveConfigFromDOM(barId, btnId, true);
        if (!draft) return;
        
        for (let blk of draft.actionBlocks) {
            if (blk.targetDbId && (!blk.actions || blk.actions.length === 0) && blk.actionType !== 'email') {
                alert("Devi configurare almeno una colonna di destinazione (Azione SET) per tutti i database scelti.");
                return;
            }
        }
        
        let realState = ButtonManager.getState(barId);
        const idx = realState.buttons.findIndex(b => b.id === btnId);
        if (idx !== -1) {
            realState.buttons[idx] = JSON.parse(JSON.stringify(draft));
            ButtonManager.setState(barId, realState); 
        }

        ButtonManager.render(barId);
        UI.closeDrawer();
        
        ButtonManager._draftBtnState = null;
        ButtonManager._draftBarId = null;
    }
});