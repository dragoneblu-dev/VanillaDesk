/**
 * advanced-table-column-buttons.js
 * Modulo dedicato alla configurazione ed esecuzione dei Pulsanti Macro inseriti come Colonne nel Database.
 * Include:
 * - Esecuzione transazionale delle macro di cella (runCellMacro)
 * - UI Drawer di configurazione visuale blocchi, azioni SET e filtri WHERE (openButtonColConfig, _renderButtonColBuilder)
 * - Gestione campi opacità, formule ed email
 */

Object.assign(AdvancedTable, {

    runCellMacro: async (tableId, rowId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        const state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);
        const sourceRow = state.rows.find(r => r.id === rowId);

        if (!col || !sourceRow) return;

        if (!col.actionBlocks || col.actionBlocks.length === 0) {
            if (typeof UI !== 'undefined' && UI.showToast) UI.showToast(I18n.t('adv_actions.btn_no_actions_configured'), "warning");
            return;
        }

        if (col.requireConfirm) {
            const btnLabel = col.buttonLabel || col.name;
            if (!confirm(I18n.t('adv_actions.btn_confirm_execution', { label: btnLabel }))) return;
        }

        const response = await LogicEngine.executeMacroBlocks(col.actionBlocks, realTableId, sourceRow, false);
        
        if (response.updatedDbIds.size > 0 || response.emailsSent > 0) {
            response.updatedDbIds.forEach(dbId => {
                AdvancedTable.setState(dbId, AppState.databases[dbId]);
                AdvancedTable.updateDependentViews(dbId);
                const targetDOM = document.getElementById(dbId);
                if (targetDOM) AdvancedTable.renderTable(dbId);
            });
            
            Store.triggerAutoSave(true);
            
            if (response.errorsLog.length > 0) {
                const errorHtml = `<div style="color:var(--danger-color); font-family:monospace;">${response.errorsLog.join('<br>')}</div>`;
                UI.openDrawer(`${Icons.listFilter} ${I18n.t('adv_actions.macro_execution_log')}`, errorHtml, `<button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.close')}</button>`);
            } else {
                let msg = I18n.t('adv_actions.macro_completed_msg', { rows: response.totalRowsAffected, dbs: response.updatedDbIds.size });
                if (response.emailsSent > 0) msg += I18n.t('adv_actions.macro_emails_sent', { count: response.emailsSent });
                if (typeof UI !== 'undefined') UI.showToast(msg, "success");
            }
        } else {
            if (response.errorsLog.length > 0) {
                UI.openDrawer(`${Icons.listFilter} ${I18n.t('adv_actions.macro_execution_log')}`, `<div style="color:var(--danger-color); font-family:monospace;">${response.errorsLog.join('<br>')}</div>`, null);
            } else {
                if (typeof UI !== 'undefined') UI.showToast(I18n.t('adv_actions.macro_no_rows_affected'), "info");
            }
        }
    },

    _captureOpenStates: () => {
        const fullArea = document.getElementById('btnConfigFullArea') || document.querySelector('.adv-drawer-body');
        if (fullArea) {
            window._openActionBlocks = Array.from(fullArea.querySelectorAll('.action-block-card[open]')).map(el => el.dataset.blockId);
            const aesthetic = document.getElementById('btnAestheticOptions');
            if (aesthetic) window._openAesthetic = aesthetic.hasAttribute('open');
        }
    },

    _triggerRefresh: () => {
        AdvancedTable._captureOpenStates();
        const labelEl = document.getElementById('btnConfigLabel');
        if (labelEl && AdvancedTable._tempColButtonConfig) {
             AdvancedTable._tempColButtonConfig.config.buttonLabel = labelEl.value.trim();
        }
        AdvancedTable._renderButtonColBuilder();
    },

    openButtonColConfig: (tableId, colId) => {
        AdvancedTable.closeDropdowns(true);
        const state = AdvancedTable.getState(tableId);
        const col = state.columns.find(c => c.id === colId);
        if (!col) return;

        AdvancedTable._tempColButtonConfig = {
            tableId: tableId,
            colId: colId,
            config: JSON.parse(JSON.stringify(col))
        };
        
        if (!AdvancedTable._tempColButtonConfig.config.actionBlocks) {
            AdvancedTable._tempColButtonConfig.config.actionBlocks = [];
        }

        window._openActionBlocks = undefined;
        window._openAesthetic = undefined;

        AdvancedTable._renderButtonColBuilder();
    },

    _renderButtonColBuilder: () => {
        const { tableId, config } = AdvancedTable._tempColButtonConfig;
        const hostState = AdvancedTable.getState(tableId); 
        if (hostState) hostState.id = tableId;

        const dbList = AutomationUIBuilder.getAvailableDatabases();
        const isAestheticOpen = window._openAesthetic !== undefined ? window._openAesthetic : true;

        const buttonColors = [
            { val: '#2563eb', name: I18n.t('adv_actions.btn_color_blue') },
            { val: '#22c55e', name: I18n.t('adv_actions.btn_color_green') },
            { val: '#ef4444', name: I18n.t('adv_actions.btn_color_red') },
            { val: '#eab308', name: I18n.t('adv_actions.btn_color_yellow') },
            { val: '#8b5cf6', name: I18n.t('adv_actions.btn_color_purple') },
            { val: '#333333', name: I18n.t('adv_actions.btn_color_black') }
        ];

        let colorSwatchesHtml = `<div style="display: flex; gap: 8px; margin-top: 5px; flex-wrap: wrap;">`;
        buttonColors.forEach(c => {
            const isSelected = (config.buttonColor || 'var(--accent-color)') === c.val;
            const borderStyle = isSelected ? 'border: 2px solid var(--text-primary); transform: scale(1.1);' : 'border: 2px solid transparent;';
            colorSwatchesHtml += `
                <div class="btn-color-swatch" 
                     style="width: 28px; height: 28px; border-radius: 6px; background-color: ${c.val}; cursor: pointer; ${borderStyle} box-shadow: 0 2px 4px rgba(0,0,0,0.15); transition: all 0.1s ease;" 
                     onclick="AdvancedTable._updateButtonColField('buttonColor', '${c.val}')" 
                     title="${c.name}">
                </div>
            `;
        });
        colorSwatchesHtml += `</div>`;

        let html = `
            <div id="btnConfigFullArea" style="display:flex; flex-direction:column; gap:10px; padding-bottom:30px;">
            <details id="btnAestheticOptions" class="aesthetic-block-card" style="background:var(--item-hover); border-radius:8px; border:1px solid var(--border-color); margin-bottom:15px;" ${isAestheticOpen ? 'open' : ''}>
                <summary style="padding:12px; font-weight:bold; cursor:pointer; outline:none; display:flex; justify-content:space-between; align-items:center; color:var(--text-primary);">
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <span style="font-size:0.95rem; display:flex; align-items:center; gap:8px;">${Icons.palette} ${I18n.t('adv_actions.btn_appearance_behavior')}</span>
                    </div>
                    <span style="color:var(--text-secondary); font-size:0.8rem;">▼</span>
                </summary>
                
                <div style="padding: 0 15px 15px 15px; display:flex; flex-direction:column; gap:10px; border-top: 1px solid var(--border-color); margin-top: 10px; padding-top: 15px;">
                    <label style="font-size:0.8rem; font-weight:bold; color:var(--text-primary);">${I18n.t('adv_actions.btn_label_label')}</label>
                    <input type="text" id="btnConfigLabel" class="modern-input" style="width:100%; margin-bottom: 10px;" value="${(config.buttonLabel || config.name).replace(/"/g, '&quot;')}" onblur="AdvancedTable._triggerRefresh()">
                    
                    <label style="font-size:0.8rem; font-weight:bold; color:var(--text-primary);">${I18n.t('adv_actions.btn_color_label')}</label>
                    ${colorSwatchesHtml}
                    
                    <label style="display:flex; align-items:center; gap:8px; font-size:0.8rem; cursor:pointer; color:var(--text-secondary); margin-top:15px;">
                        <input type="checkbox" style="transform:scale(1.1);" ${config.requireConfirm ? 'checked' : ''} onchange="AdvancedTable._updateButtonColField('requireConfirm', this.checked)">
                        ${I18n.t('adv_actions.btn_confirm_checkbox')}
                    </label>
                </div>
            </details>
            
            <h4 style="margin: 0; font-size: 0.95rem; color: var(--accent-color); border-bottom: 1px solid var(--border-color); padding-bottom: 5px;">${I18n.t('adv_actions.btn_actions_title')}</h4>
        `;

        const formulaPreviews = [];

        if (!config.actionBlocks || config.actionBlocks.length === 0) {
            html += `<div style="text-align:center; padding:20px; color:var(--text-secondary); font-style:italic; background:var(--bg-color); border:1px dashed var(--border-color); border-radius:6px; margin-top: 10px;">${I18n.t('adv_actions.btn_no_actions_placeholder')}</div>`;
        } else {
            const callbacks = {
                onBlockChange: "AdvancedTable._updateButtonColBlock",
                onBlockRemove: "AdvancedTable._removeButtonColBlock",
                onFilterChange: "AdvancedTable._updateButtonColFilter",
                onFilterRemove: "AdvancedTable._removeButtonColFilter",
                onFilterAdd: "AdvancedTable._addButtonColFilter",
                onActionChange: "AdvancedTable._updateButtonColAction",
                onActionRemove: "AdvancedTable._removeButtonColAction",
                onActionAdd: "AdvancedTable._addButtonColAction",
                onRefresh: "AdvancedTable._triggerRefresh"
            };

            config.actionBlocks.forEach((blk, index) => {
                const isThisRow = blk.targetDbId === 'THIS_ROW';
                const targetDbToRead = isThisRow ? tableId : blk.targetDbId;
                const targetState = targetDbToRead ? AdvancedTable.getTableState(targetDbToRead) : null;
                if (targetState) targetState.id = targetDbToRead;
                
                const sourceState = blk.sourceDbId ? AdvancedTable.getTableState(blk.sourceDbId) : hostState;
                if (sourceState) sourceState.id = blk.sourceDbId || tableId;
                
                html += AutomationUIBuilder.buildActionBlockCard(blk, index, dbList, isThisRow, targetState, sourceState, formulaPreviews, callbacks, true);
            });
        }

        html += `<button class="btn" style="width:100%; justify-content:center; padding:10px; border-style:dashed; margin-top:10px;" onclick="AdvancedTable._addButtonColBlock()">${I18n.t('adv_actions.btn_add_action_block')}</button></div>`;

        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.cancel')}</button>
            <button class="btn btn-primary" onclick="AdvancedTable._saveButtonColConfig()">${I18n.t('adv_actions.btn_save_actions')}</button>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.settings} ${I18n.t('adv_actions.btn_configure_title')}</span>`, html, footerHTML);

        setTimeout(() => {
            const fullArea = document.getElementById('btnConfigFullArea');
            if (fullArea) {
                fullArea.querySelectorAll('.action-block-card, .aesthetic-block-card').forEach(details => {
                    details.addEventListener('toggle', () => {
                        AdvancedTable._captureOpenStates();
                    });
                });
            }

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

    _updateButtonColField: (field, val) => {
        AdvancedTable._tempColButtonConfig.config[field] = val;
        AdvancedTable._triggerRefresh();
    },

    _updateButtonColBlock: (blkIdx, field, val) => {
        const blk = AdvancedTable._tempColButtonConfig.config.actionBlocks[blkIdx];
        const oldType = blk.actionType;
        blk[field] = val;
        
        if (field === 'targetDbId' && val === 'THIS_ROW') {
            if (blk.actionType !== 'email') blk.actionType = 'update';
            blk.filters = [];
        }
        
        if (field === 'actionType' && oldType !== val) {
            blk.actions = [];
        }

        AdvancedTable._triggerRefresh();
    },

    _addButtonColBlock: () => {
        const newId = 'actblk_' + Store.generateId();
        AdvancedTable._tempColButtonConfig.config.actionBlocks.push({
            id: newId, targetDbId: 'THIS_ROW', actionType: 'update', filters: [], actions: []
        });
        if (!window._openActionBlocks) window._openActionBlocks = [];
        window._openActionBlocks.push(newId);
        AdvancedTable._triggerRefresh();
    },

    _removeButtonColBlock: (e, idx) => {
        if (e) e.stopPropagation();
        if (!confirm(I18n.t('adv_actions.btn_confirm_delete_block'))) return;
        AdvancedTable._tempColButtonConfig.config.actionBlocks.splice(idx, 1);
        AdvancedTable._triggerRefresh();
    },

    _addButtonColFilter: (e, blkIdx) => {
        if (e) e.stopPropagation();
        AdvancedTable._tempColButtonConfig.config.actionBlocks[blkIdx].filters.push({ colId: '', operator: '=', value: '' });
        AdvancedTable._triggerRefresh();
    },

    _removeButtonColFilter: (e, blkIdx, fIdx) => {
        if (e) e.stopPropagation();
        AdvancedTable._tempColButtonConfig.config.actionBlocks[blkIdx].filters.splice(fIdx, 1);
        AdvancedTable._triggerRefresh();
    },

    _updateButtonColFilter: (blkIdx, fIdx) => {
        return (field, val) => {
            const flt = AdvancedTable._tempColButtonConfig.config.actionBlocks[blkIdx].filters[fIdx];
            flt[field] = val;
            if (field === 'colId') { flt.value = ''; flt.operator = '='; }
            if (field === 'colId' || field === 'operator') AdvancedTable._triggerRefresh();
        };
    },

    _addButtonColAction: (e, blkIdx) => {
        if (e) e.stopPropagation();
        AdvancedTable._tempColButtonConfig.config.actionBlocks[blkIdx].actions.push({ colId: '', type: 'set_fixed', value: '' });
        AdvancedTable._triggerRefresh();
    },

    _removeButtonColAction: (e, blkIdx, aIdx) => {
        if (e) e.stopPropagation();
        AdvancedTable._tempColButtonConfig.config.actionBlocks[blkIdx].actions.splice(aIdx, 1);
        AdvancedTable._triggerRefresh();
    },

    _updateButtonColAction: (blkIdx, aIdx) => {
        return (field, value) => {
            let act = AdvancedTable._tempColButtonConfig.config.actionBlocks[blkIdx].actions[aIdx];
            if (act) {
                act[field] = value;
                if (field === 'colId' || field === 'type') {
                    if (field === 'colId') act.type = 'set_fixed';
                    act.value = ''; act.value2 = '';
                    AdvancedTable._triggerRefresh();
                }
            }
        };
    },

    _saveButtonColConfig: () => {
        const { tableId, colId, config } = AdvancedTable._tempColButtonConfig;
        let state = AdvancedTable.getState(tableId);
        
        let targetCol = state.columns.find(c => c.id === colId);
        if (targetCol) {
            targetCol.buttonLabel = config.buttonLabel;
            targetCol.buttonColor = config.buttonColor;
            targetCol.requireConfirm = config.requireConfirm;
            targetCol.actionBlocks = JSON.parse(JSON.stringify(config.actionBlocks));
            
            AdvancedTable.setState(tableId, state);
            AdvancedTable.renderTable(tableId);
            Store.triggerAutoSave();
            UI.closeDrawer();
        }
    }
});