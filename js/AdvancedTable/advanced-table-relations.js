/**
 * advanced-table-relations.js
 * Modulo dedicato alla gestione delle Relazioni tra Database, Relazioni Inverse (Backlink) e Rollup.
 * Include:
 * - Configurazione guidata tramite Drawer (openRelationConfig, openRollupConfig)
 * - Selettore interattivo dei record collegati con ricerca e lazy-rendering incrementale (openRelationSelector)
 * - Controllo e blocco matematico dei cicli ricorsivi (checkCircularRelation)
 * - Scollegamento chirurgico tra entità relazionate (unlinkRelation)
 * - FEAT SECONDARY FIELD DISAMBIGUATION: Tendina "Dettaglio" nel Drawer di selezione relazionale
 *   per disambiguare record omonimi mostrando una colonna secondaria su layout monoriga con troncamento (Ellipsis).
 * - FEAT WBS SEMANTIC AUTO-SETUP: Inizializzazione automatica di col.treeDirection ('parent' o 'children')
 *   quando una relazione punta alla tabella stessa (auto-relazione).
 */

Object.assign(AdvancedTable, {

    _relSearchTimer: null,

    unlinkRelation: (srcTableId, srcRowId, srcColId, targetIdToUnlink, isBacklink) => {
        const realSrcTable = AdvancedTable._resolveSourceId(srcTableId);
        const srcState = AdvancedTable.getState(realSrcTable);
        const srcCol = srcState.columns.find(c => c.id === srcColId);

        if (isBacklink) {
            const targetDbId = srcCol.linkedTableId;
            const targetColId = srcCol.linkedColId;
            const targetState = AdvancedTable.getState(targetDbId);
            const targetRow = targetState.rows.find(r => r.id === targetIdToUnlink);
            
            if (targetRow) {
                let vals = targetRow.cells[targetColId];
                vals = Array.isArray(vals) ? [...vals] : (vals ? [vals] : []);
                vals = vals.filter(id => id !== srcRowId);
                AdvancedTable.updateData(targetDbId, targetIdToUnlink, targetColId, vals);
            }
        } else {
            const srcRow = srcState.rows.find(r => r.id === srcRowId);
            if (srcRow) {
                let vals = srcRow.cells[srcColId];
                vals = Array.isArray(vals) ? [...vals] : (vals ? [vals] : []);
                vals = vals.filter(id => id !== targetIdToUnlink);
                AdvancedTable.updateData(realSrcTable, srcRowId, srcColId, vals);
            }
        }

        if (typeof UI !== 'undefined') {
            UI.closeDrawer();
            UI.showToast(I18n.t('adv_actions.unlink_success'), "info");
        }
    },

    openRelationConfig: (tableId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        AdvancedTable.closeDropdowns(true);
        AdvancedTable._pendingRelConfig = { realTableId, colId };

        let optionsHTML = `<option value="">${I18n.t('adv_actions.select_db_placeholder')}</option>`;

        if (AppState.databases) {
            AppState.getRelationalDatabaseIds().forEach(tId => {
                const s = AppState.databases[tId];
                if (s && !s.isPivot && !s.isLinkedView && s.columns && !tId.includes('adv_code_') && !tId.includes('adv_btnbar_') && !tId.includes('adv_cols_') && !tId.includes('adv_journal_')) {
                    const parentName = AdvancedTable.getParentNoteName(tId);
                    optionsHTML += `<option value="${tId}">➔ [${parentName}] ${s.title || I18n.t('editor.database')}</option>`;
                }
            });
        }

        const bodyHTML = `
            <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold; display:block; margin-bottom:5px;">${I18n.t('adv_actions.rel_target_db_label')}</label>
            <select id="relConfigTable" class="modern-input" style="margin-bottom: 15px; width: 100%;" onchange="AdvancedTable.updateRelationColOptions()">${optionsHTML}</select>

            <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold; display:block; margin-bottom:5px;">${I18n.t('adv_actions.rel_target_col_label')}</label>
            <select id="relConfigCol" class="modern-input" style="margin-bottom: 25px; width: 100%;"></select>
        `;
        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.cancel')}</button>
            <button class="btn btn-primary" onclick="AdvancedTable.saveRelationConfig()">${I18n.t('adv_actions.save_relation')}</button>
        `;

        if (typeof UI !== 'undefined') {
            UI.openDrawer(`${Icons.relation} ${I18n.t('adv_col_menu.configure_relation')}`, bodyHTML, footerHTML);
        }

        // Cerchiamo e pre-impostiamo i valori vecchi
        const state = AdvancedTable.getState(realTableId);
        const colDef = state.columns.find(c => c.id === colId);

        if (colDef && colDef.targetTableId) {
            setTimeout(() => {
                const tableSelect = document.getElementById('relConfigTable');
                if (tableSelect && tableSelect.querySelector(`option[value="${colDef.targetTableId}"]`)) {
                    tableSelect.value = colDef.targetTableId;
                    AdvancedTable.updateRelationColOptions();
                    
                    setTimeout(() => {
                        const colSelect = document.getElementById('relConfigCol');
                        if (colDef.targetColId && colSelect && colSelect.querySelector(`option[value="${colDef.targetColId}"]`)) {
                            colSelect.value = colDef.targetColId;
                        }
                    }, 50);
                }
            }, 50);
        }
    },

    updateRelationColOptions: () => {
        const tId = document.getElementById('relConfigTable').value;
        const colSelect = document.getElementById('relConfigCol');
        colSelect.innerHTML = `<option value="">${I18n.t('adv_actions.select_col_placeholder')}</option>`;

        if (!tId) return;
        const state = AdvancedTable.getTableState(tId);
        if (state && state.columns) {
            state.columns.forEach(c => {
                colSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
            });
        }
    },

    saveRelationConfig: () => {
        const tId = document.getElementById('relConfigTable').value;
        const cTargetId = document.getElementById('relConfigCol').value;
        if (!tId || !cTargetId) { alert(I18n.t('adv_actions.alert_select_db_and_col')); return; }

        const { realTableId, colId } = AdvancedTable._pendingRelConfig;
        let state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);

        const oldTargetTableId = col.targetTableId;
        const hasTargetChanged = oldTargetTableId !== tId;

        if (hasTargetChanged && oldTargetTableId && col.showBacklink && col.backlinkColId) {
            let oldTargetState = AdvancedTable.getTableState(oldTargetTableId);
            if (oldTargetState) {
                oldTargetState.columns = oldTargetState.columns.filter(c => c.id !== col.backlinkColId);
                AdvancedTable.setState(oldTargetTableId, oldTargetState);
                AdvancedTable.updateDependentViews(oldTargetTableId);
            }
            delete col.showBacklink;
            delete col.backlinkColId;
            delete col.singleRecord;
            delete col.treeDirection;
        }

        col.type = 'relation';
        col.targetTableId = tId;
        col.targetColId = cTargetId;

        // Auto-imposta la semantica della gerarchia WBS per le auto-relazioni
        const isSelfRel = (tId === realTableId);
        if (isSelfRel) {
            if (!col.treeDirection) {
                col.treeDirection = col.singleRecord ? 'parent' : 'children';
            }
        } else {
            delete col.treeDirection;
        }

        // Pulizia attributi residui di altri tipi di dato per non lasciare lo stato ibrido
        delete col.hasEndDate;
        delete col.formula;
        delete col.decimals;
        delete col.relationColId;
        delete col.rollupDirection;
        delete col.foreignRelColId;
        delete col.buttonLabel;
        delete col.buttonColor;
        delete col.buttonIcon;
        delete col.requireConfirm;
        delete col.actionBlocks;
        if (state.selectOptions && state.selectOptions[colId]) delete state.selectOptions[colId];
        if (state.selectColors && state.selectColors[colId]) delete state.selectColors[colId];

        // Se il target è cambiato o se la colonna prima non era una relazione, azzera le celle
        if (hasTargetChanged) {
            state.rows.forEach(r => r.cells[colId] = []);
            delete col.secondaryDisplayColId;
        }

        AdvancedTable.setState(realTableId, state);
        
        if (realTableId === 'SYS_PROPERTIES_DB' && AdvancedTable.activeRecordId) {
            AdvancedTable.openRecordView(realTableId, AdvancedTable.activeRecordId);
        } else {
            AdvancedTable.updateDependentViews(realTableId);
            if (typeof UI !== 'undefined') UI.closeDrawer();
        }

        Store.triggerAutoSave();
    },

    openRollupConfig: (tableId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        AdvancedTable.closeDropdowns(true);
        AdvancedTable._pendingRollupConfig = { realTableId, colId };

        const state = AdvancedTable.getState(realTableId);
        
        // 1. Relazioni uscenti locali (relation e relation_backlink)
        const outgoingRelationCols = (state.columns || []).filter(c => 
            (c.type === 'relation' && c.targetTableId) || 
            (c.type === 'relation_backlink' && c.linkedTableId)
        );

        // 2. Relazioni da altri database verso questo database (Entranti / Inverse)
        const incomingRelations = [];
        if (AppState.databases) {
            AppState.getRelationalDatabaseIds().forEach(dbId => {
                const otherDb = AppState.databases[dbId];
                if (!otherDb || otherDb.isPivot || otherDb.isLinkedView || !Array.isArray(otherDb.columns)) return;
                if (dbId.includes('adv_code_') || dbId.includes('adv_btnbar_') || dbId.includes('adv_cols_') || dbId.includes('adv_journal_')) return;

                otherDb.columns.forEach(otherCol => {
                    if (otherCol.type === 'relation' && otherCol.targetTableId === realTableId) {
                        const alreadyHasLocalBacklink = (state.columns || []).some(localCol => 
                            localCol.type === 'relation_backlink' && 
                            localCol.linkedTableId === dbId && 
                            localCol.linkedColId === otherCol.id
                        );
                        if (alreadyHasLocalBacklink) return;

                        const parentName = AdvancedTable.getParentNoteName(dbId);
                        incomingRelations.push({
                            val: `INCOMING:${dbId}:${otherCol.id}`,
                            label: `➔ Da [${otherDb.title || 'DB'}] campo '${otherCol.name}' (in: ${parentName})`,
                            dbId: dbId,
                            colId: otherCol.id
                        });
                    }
                });
            });
        }

        let relOptionsHTML = `<option value="">${I18n.t('adv_actions.select_rel_col_placeholder')}</option>`;

        if (outgoingRelationCols.length > 0) {
            const outgoingLabel = (typeof I18n !== 'undefined' && typeof I18n.t === 'function')
                ? I18n.t('adv_actions.rollup_outgoing_relations')
                : "Relazioni di questa tabella (Uscenti)";
            relOptionsHTML += `<optgroup label="${outgoingLabel}">`;
            outgoingRelationCols.forEach(c => {
                const targetDb = AdvancedTable.getTableState(c.targetTableId || c.linkedTableId);
                const targetName = targetDb ? targetDb.title : 'DB';
                const kind = c.type === 'relation_backlink' ? 'Backlink' : 'Relazione';
                relOptionsHTML += `<option value="${c.id}">[${c.name}] ➔ verso '${targetName}' (${kind})</option>`;
            });
            relOptionsHTML += `</optgroup>`;
        }

        if (incomingRelations.length > 0) {
            const incomingLabel = (typeof I18n !== 'undefined' && typeof I18n.t === 'function')
                ? I18n.t('adv_actions.rollup_incoming_relations')
                : "Relazioni da altri database verso questa tabella (Entranti / Inverse)";
            relOptionsHTML += `<optgroup label="${incomingLabel}">`;
            incomingRelations.forEach(inc => {
                relOptionsHTML += `<option value="${inc.val}">${inc.label}</option>`;
            });
            relOptionsHTML += `</optgroup>`;
        }

        if (outgoingRelationCols.length === 0 && incomingRelations.length === 0) {
            relOptionsHTML = `<option value="" disabled>${I18n.t('adv_actions.no_relation_found')}</option>`;
        }

        const bodyHTML = `
            <div style="background: rgba(37, 99, 235, 0.05); padding: 10px; border-radius: 6px; margin-bottom: 15px; font-size: 0.8rem; border: 1px solid rgba(37, 99, 235, 0.2);">
                ${I18n.t('adv_actions.rollup_banner_info')}
            </div>
            <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold; display:block; margin-bottom:5px;">${I18n.t('adv_actions.rollup_rel_col_label')}</label>
            <select id="rollupConfigRel" class="modern-input" style="margin-bottom: 15px; width: 100%;" onchange="AdvancedTable.updateRollupTargetOptions()">
                ${relOptionsHTML}
            </select>

            <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold; display:block; margin-bottom:5px;">${I18n.t('adv_actions.rollup_target_prop_label')}</label>
            <select id="rollupConfigTarget" class="modern-input" style="margin-bottom: 25px; width: 100%;">
                <option value="">${I18n.t('adv_actions.rollup_select_rel_first')}</option>
            </select>
        `;
        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.cancel')}</button>
            <button class="btn btn-primary" onclick="AdvancedTable.saveRollupConfig()">${I18n.t('adv_actions.save_rollup')}</button>
        `;

        if (typeof UI !== 'undefined') 
            UI.openDrawer(`${Icons.rollup} ${I18n.t('adv_col_menu.configure_rollup')}`, bodyHTML, footerHTML);

        const col = state.columns.find(c => c.id === colId);
        setTimeout(() => {
            if (col.relationColId) {
                const relSelect = document.getElementById('rollupConfigRel');
                if (relSelect) {
                    relSelect.value = col.relationColId;
                    AdvancedTable.updateRollupTargetOptions();
                    setTimeout(() => {
                        const tgtSelect = document.getElementById('rollupConfigTarget');
                        if (tgtSelect && col.targetColId) tgtSelect.value = col.targetColId;
                    }, 50);
                }
            }
        }, 50);
    },

    updateRollupTargetOptions: () => {
        const relColVal = document.getElementById('rollupConfigRel').value;
        const tgtSelect = document.getElementById('rollupConfigTarget');
        tgtSelect.innerHTML = `<option value="">${I18n.t('adv_actions.select_col_placeholder')}</option>`;

        if (!relColVal) return;

        const { realTableId } = AdvancedTable._pendingRollupConfig;
        const state = AdvancedTable.getState(realTableId);

        let targetDbId = null;

        if (relColVal.startsWith('INCOMING:')) {
            const parts = relColVal.split(':');
            targetDbId = parts[1];
        } else {
            const relCol = (state.columns || []).find(c => c.id === relColVal);
            if (!relCol) return;
            targetDbId = relCol.targetTableId || relCol.linkedTableId;
        }

        if (!targetDbId) return;

        const targetState = AdvancedTable.getTableState(targetDbId);
        if (targetState && targetState.columns) {
            targetState.columns.forEach(c => {
                tgtSelect.innerHTML += `<option value="${c.id}">${c.name} (${c.type})</option>`;
            });
        }
    },

    saveRollupConfig: () => {
        const relColVal = document.getElementById('rollupConfigRel').value;
        const targetColId = document.getElementById('rollupConfigTarget').value;

        if (!relColVal || !targetColId) {
            alert(I18n.t('adv_actions.alert_select_rel_and_col'));
            return;
        }

        const { realTableId, colId } = AdvancedTable._pendingRollupConfig;
        let state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);
        if (!col) return;

        // CONTROLLO DI SICUREZZA ANTI-CIRCOLARITÀ DIRETTA SCHEMA
        let prospectiveTargetDbId = null;
        if (relColVal.startsWith('INCOMING:')) {
            prospectiveTargetDbId = relColVal.split(':')[1];
        } else {
            const localRel = (state.columns || []).find(c => c.id === relColVal);
            prospectiveTargetDbId = localRel ? (localRel.targetTableId || localRel.linkedTableId) : null;
        }

        if (prospectiveTargetDbId) {
            const targetState = AdvancedTable.getTableState(prospectiveTargetDbId);
            const targetCol = targetState ? (targetState.columns || []).find(c => c.id === targetColId) : null;

            // Se la colonna selezionata nel database bersaglio è a sua volta un Rollup che punta inversamente a questo campo
            if (targetCol && targetCol.type === 'rollup') {
                const targetRelVal = String(targetCol.relationColId || '');
                const targetPointsBackToThisDb = (targetCol.targetTableId === realTableId) || targetRelVal.includes(realTableId);
                if (targetPointsBackToThisDb && targetCol.targetColId === colId) {
                    alert(I18n.t('adv_actions.circular_rollup_blocked') || "Operazione bloccata: la colonna selezionata è a sua volta un Rollup che punta a questo campo (Dipendenza Circolare).");
                    return;
                }
            }
        }

        col.type = 'rollup';
        col.relationColId = relColVal;
        col.targetColId = targetColId;

        // Pulizia attributi residui di altri tipi di dato per non lasciare lo stato ibrido
        delete col.hasEndDate;
        delete col.formula;
        delete col.singleRecord;
        delete col.treeDirection;
        delete col.showBacklink;
        delete col.backlinkColId;
        delete col.buttonLabel;
        delete col.buttonColor;
        delete col.buttonIcon;
        delete col.requireConfirm;
        delete col.actionBlocks;
        if (state.selectOptions && state.selectOptions[colId]) delete state.selectOptions[colId];
        if (state.selectColors && state.selectColors[colId]) delete state.selectColors[colId];

        // Svuota le vecchie celle fisiche di testo/numeri poiché il rollup è calcolato dinamicamente a runtime
        state.rows.forEach(r => r.cells[colId] = '');

        if (relColVal.startsWith('INCOMING:')) {
            const parts = relColVal.split(':');
            col.rollupDirection = 'incoming';
            col.targetTableId = parts[1];
            col.foreignRelColId = parts[2];
        } else {
            col.rollupDirection = 'outgoing';
            const localRel = (state.columns || []).find(c => c.id === relColVal);
            col.targetTableId = localRel ? (localRel.targetTableId || localRel.linkedTableId) : null;
            if (localRel && localRel.type === 'relation_backlink') {
                col.foreignRelColId = localRel.linkedColId;
            } else {
                delete col.foreignRelColId;
            }
        }

        AdvancedTable.setState(realTableId, state);

        if (realTableId === 'SYS_PROPERTIES_DB' && AdvancedTable.activeRecordId) {
            AdvancedTable.openRecordView(realTableId, AdvancedTable.activeRecordId);
        } else {
            AdvancedTable.updateDependentViews(realTableId);
            if (typeof UI !== 'undefined') UI.closeDrawer();
        }
        
        Store.triggerAutoSave();
    },

    openRelationSelector: (e, tableId, rowId, colId) => {
        if (e) e.stopPropagation();
        
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        const state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);
        
        if (col.type === 'relation_backlink') {
            alert(I18n.t('adv_actions.backlink_readonly_alert'));
            return;
        }
        
        const row = state.rows.find(r => r.id === rowId);

        const targetDbId = col.targetTableId;
        const targetColId = col.targetColId;

        const targetState = AdvancedTable.getTableState(targetDbId);
        if (!targetState) { alert(I18n.t('adv_col_menu.target_db_missing')); return; }

        const targetColDef = targetState.columns.find(c => c.id === targetColId);
        const targetColName = targetColDef ? targetColDef.name : I18n.t('adv_actions.unknown');
        const targetTabName = targetState.title || I18n.t('adv_actions.unknown_source');

        let currentVals = Array.isArray(row.cells[colId]) ? [...row.cells[colId]] : (row.cells[colId] ? [row.cells[colId]] : []);

        // Costruzione opzioni per la tendina "Dettaglio / Disambiguazione"
        const primaryDisplayColId = targetColId;
        const activeSecondaryColId = col.secondaryDisplayColId || '';

        let secondaryColOptionsHtml = `<option value="">-- Nessun Dettaglio --</option>`;
        (targetState.columns || []).forEach(c => {
            if (c.id !== primaryDisplayColId) {
                const isSelected = (c.id === activeSecondaryColId) ? 'selected' : '';
                secondaryColOptionsHtml += `<option value="${c.id}" ${isSelected}>Dettaglio: ${UI.escapeHTML(c.name)} (${c.type})</option>`;
            }
        });

        // Il parametro currentLimit definisce lo scaglione di rendering iniziale per proteggere la CPU
        AdvancedTable._pendingRelSelect = { 
            realTableId, tableId, rowId, colId, 
            targetState, targetDbId, targetColId, isBacklink: false,
            currentVals: currentVals,
            currentLimit: 50,
            secondaryColId: activeSecondaryColId
        };

        const bodyHTML = `
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 12px; padding: 10px; background: rgba(0,0,0,0.02); border-radius: 6px; border: 1px solid var(--border-color);">
                ${Icons.link} ${I18n.t('adv_actions.connected_to')} <b style="color:var(--accent-color); cursor:pointer;" onclick="UI.closeDrawer(); setTimeout(() => UI.jumpToWidget('${targetDbId}'), 150)" title="${I18n.t('adv_actions.go_to_source_db')}">${targetTabName}</b> ➔ ${I18n.t('adv_actions.field_label')} <b>${targetColName}</b>
            </div>
            
            <!-- Barra Ricerca e Selettore Dettaglio Monoriga Compatto (Regola 1) -->
            <div style="display:flex; gap:8px; margin-bottom:12px; align-items:center;">
                <input type="text" id="relSelectSearch" class="modern-input" style="flex:1; margin:0;" placeholder="${I18n.t('adv_actions.search_value_placeholder')}" oninput="AdvancedTable.filterRelationOptions(this.value)">
                <select id="relSecondaryColSelect" class="modern-input" style="flex:0 0 170px; margin:0; padding:6px 8px; font-size:0.8rem; font-weight:500;" onchange="AdvancedTable.changeRelationSecondaryCol(this.value)">
                    ${secondaryColOptionsHtml}
                </select>
            </div>

            <div id="relSelectList" class="link-modal-list" style="padding:10px 0; margin-top:10px; flex:1; overflow-y:auto; display: flex; flex-direction: column; gap: 4px;"></div>
        `;

        if (typeof UI !== 'undefined') 
            UI.openDrawer(I18n.t('adv_actions.select_record_title'), bodyHTML, null);

        setTimeout(() => {
            AdvancedTable.renderRelationOptions('');
            const searchInput = document.getElementById('relSelectSearch');
            if (searchInput) searchInput.focus();
        }, 50);
    },

    changeRelationSecondaryCol: (newSecondaryColId) => {
        const pending = AdvancedTable._pendingRelSelect;
        if (!pending) return;

        pending.secondaryColId = newSecondaryColId || '';

        // Memorizza la preferenza sulla colonna di relazione corrente e salva lo stato su disco
        const realState = AdvancedTable.getState(pending.realTableId);
        if (realState && realState.columns) {
            const colDef = realState.columns.find(c => c.id === pending.colId);
            if (colDef) {
                if (newSecondaryColId) {
                    colDef.secondaryDisplayColId = newSecondaryColId;
                } else {
                    delete colDef.secondaryDisplayColId;
                }
                AdvancedTable.setState(pending.realTableId, realState);
                if (typeof Store !== 'undefined' && Store.triggerAutoSave) {
                    Store.triggerAutoSave();
                }
            }
        }

        const currentSearch = document.getElementById('relSelectSearch') ? document.getElementById('relSelectSearch').value : '';
        AdvancedTable.renderRelationOptions(currentSearch);
    },

    filterRelationOptions: (val) => {
        clearTimeout(AdvancedTable._relSearchTimer);
        AdvancedTable._relSearchTimer = setTimeout(() => {
            // Se l'utente digita una nuova stringa di ricerca, resettiamo il limitatore a 50 
            // per evitare di calcolare a vuoto migliaia di DOM nodes con il nuovo filtro
            if (AdvancedTable._pendingRelSelect) AdvancedTable._pendingRelSelect.currentLimit = 50;
            AdvancedTable.renderRelationOptions(val);
        }, 250); 
    },

    renderRelationOptions: (filter, newLimit = null) => {
        const pending = AdvancedTable._pendingRelSelect;
        if (!pending) return;

        if (newLimit !== null) pending.currentLimit = newLimit;
        const currentLimit = pending.currentLimit || 50;

        const { targetState, currentVals, isBacklink, targetColId, targetDbId, secondaryColId } = pending;
        const listEl = document.getElementById('relSelectList');
        if (!listEl) return;
        
        const displayColId = isBacklink ? targetState.columns[0].id : targetColId;
        const targetColDef = targetState.columns.find(c => c.id === displayColId);
        const secondaryColDef = secondaryColId ? targetState.columns.find(c => c.id === secondaryColId) : null;

        const lowerFilter = filter.toLowerCase();

        let itemsToRender = [];
        const renderCache = {};
        
        const isCalculatedCol = targetColDef && ['formula', 'rollup', 'relation_backlink'].includes(targetColDef.type);
        const isSecondaryCalculated = secondaryColDef && ['formula', 'rollup', 'relation_backlink'].includes(secondaryColDef.type);
        
        let matchCount = 0;
        let totalCount = 0;

        for (let i = 0; i < targetState.rows.length; i++) {
            const tRow = targetState.rows[i];
            const isSelected = currentVals.includes(tRow.id);

            // EARLY BREAK / LAZY EVALUATION (Ottimizzazione CPU)
            // Se NON c'è filtro attivo, analizziamo solo fino a `currentLimit`. 
            // Ciononostante, permettiamo sempre il transito agli elementi GIA' SELEZIONATI 
            // affinché appaiano in cima alla lista a prescindere dal limite della pagina.
            if (!filter && matchCount >= currentLimit && !isSelected) {
                totalCount++; // Ma li contiamo, per mostrare il numerino "Rimanenti: X" sul pulsante
                continue;
            }

            let rawVal;
            if (isCalculatedCol) {
                // Calcola la riga virtuale per far girare le formule e avere il vero nome
                const vRow = AdvancedTable.buildVirtualRow(targetDbId, tRow, targetState, renderCache);
                rawVal = vRow.virtualCells[displayColId];
            } else {
                rawVal = tRow.cells[displayColId];
            }

            // Usa l'estrattore per gestire Date e Record Note
            let displayVal = AdvancedTable.getFormatDisplayValue(targetColDef, rawVal, renderCache);
            if (!displayVal) displayVal = I18n.t('editor.untitled');

            // Calcolo valore secondario di disambiguazione se attivo (Regola 1)
            let secondaryDisplayVal = '';
            if (secondaryColDef) {
                let rawSecVal;
                if (isSecondaryCalculated) {
                    const vRow = AdvancedTable.buildVirtualRow(targetDbId, tRow, targetState, renderCache);
                    rawSecVal = vRow.virtualCells[secondaryColDef.id];
                } else {
                    rawSecVal = (tRow.cells || {})[secondaryColDef.id];
                }
                secondaryDisplayVal = AdvancedTable.getFormatDisplayValue(secondaryColDef, rawSecVal, renderCache);
            }

            // Ricerca potenziata: cerca sia nel campo primario che nel campo secondario di dettaglio
            const matchesPrimary = displayVal.toLowerCase().includes(lowerFilter);
            const matchesSecondary = secondaryDisplayVal ? secondaryDisplayVal.toLowerCase().includes(lowerFilter) : false;

            if (filter && !matchesPrimary && !matchesSecondary) {
                continue; 
            }

            matchCount++;
            totalCount++;

            itemsToRender.push({
                id: tRow.id,
                displayVal: displayVal,
                secondaryVal: secondaryDisplayVal,
                isSelected: isSelected
            });
        }

        if (!filter) {
            totalCount = targetState.rows.length;
        }

        // Mettiamo in testa i valori già selezionati, poi ordine alfabetico
        itemsToRender.sort((a, b) => {
            if (a.isSelected && !b.isSelected) return -1;
            if (!a.isSelected && b.isSelected) return 1;
            return a.displayVal.localeCompare(b.displayVal, undefined, { numeric: true, sensitivity: 'base' });
        });

        // Applichiamo la sforbiciata all'array finale per sicurezza (In caso di Filtri che restituiscono 10,000 risultati)
        const itemsToShow = itemsToRender.slice(0, currentLimit);

        let html = '';
        itemsToShow.forEach(item => {
            // Regola 2: Layout monoriga con troncamento (Ellipsis) sia sul titolo che sul dettaglio
            const secondaryHtml = item.secondaryVal ? `
                <span class="adv-relation-secondary-hint" 
                      style="font-size:0.75rem; color:var(--text-secondary); opacity:0.8; max-width:45%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; background:rgba(0,0,0,0.03); border:1px solid var(--border-color); padding:1px 6px; border-radius:4px; margin-left:auto; margin-right:8px; flex-shrink:1;"
                      title="${UI.escapeHTML(item.secondaryVal)}">
                    ${UI.escapeHTML(item.secondaryVal)}
                </span>
            ` : '';

            html += `
                <div class="link-modal-item ${item.isSelected ? 'active' : ''}" 
                     style="display:flex; align-items:center; justify-content:space-between; border: 1px solid var(--border-color); height:38px; min-height:38px; padding:0 10px; box-sizing:border-box; overflow:hidden;" 
                     onclick="AdvancedTable.toggleRelationValue('${item.id}')">
                    
                    <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:${item.isSelected ? '600' : 'normal'};" title="${UI.escapeHTML(item.displayVal)}">
                        ${UI.escapeHTML(item.displayVal)}
                    </span>
                    
                    ${secondaryHtml}
                    
                    <span style="color:var(--accent-color); font-weight:bold; flex-shrink:0; width:16px; text-align:right;">
                        ${item.isSelected ? '✓' : ''}
                    </span>
                </div>
            `;
        });

        if (totalCount > itemsToShow.length) {
            const diff = totalCount - itemsToShow.length;
            const nextBatch = Math.min(50, diff);
            const nextLimit = currentLimit + 50;
            const safeFilter = filter.replace(/'/g, "\\'");
            
            html += `<button class="btn" style="width:100%; margin-top:10px; justify-content:center; border-style:dashed;" onclick="AdvancedTable.renderRelationOptions('${safeFilter}', ${nextLimit})">${I18n.t('adv_actions.show_more_values', { nextBatch, diff })}</button>`;
        }

        listEl.innerHTML = html;
    },

    checkCircularRelation: (sourceTableId, sourceRowId, targetTableId, targetRowId, colId = null, visited = new Set()) => {
        // Auto-riferimento riflessivo diretto (un record non può essere padre o dipendente di se stesso)
        if (sourceTableId === targetTableId && sourceRowId === targetRowId) return true;

        const visitKey = `${targetTableId}_${targetRowId}`;
        if (visited.has(visitKey)) return false;
        visited.add(visitKey);

        const targetState = AdvancedTable.getTableState(targetTableId);
        if (!targetState) return false;

        const targetRow = targetState.rows.find(r => r.id === targetRowId);
        if (!targetRow) return false;

        // Se è specificata la colonna lungo la quale si sta navigando il grafo all'interno dello stesso database,
        // circoscrive la ricerca di cicli esclusivamente a quel campo, consentendo relazioni distinte ortogonali o inverse
        if (colId && sourceTableId === targetTableId) {
            const targetCol = targetState.columns.find(c => c.id === colId);
            if (targetCol && targetCol.type === 'relation') {
                let vals = targetRow.cells[colId];
                if (!Array.isArray(vals)) vals = vals ? [vals] : [];

                for (let relatedRowId of vals) {
                    if (relatedRowId === sourceRowId) {
                        return true;
                    }
                    if (AdvancedTable.checkCircularRelation(sourceTableId, sourceRowId, targetTableId, relatedRowId, colId, new Set(visited))) {
                        return true;
                    }
                }
            }
            return false;
        }

        // Fallback protettivo per chiamate non vincolate a colId specifico
        for (let col of targetState.columns) {
            if (col.type === 'relation' && col.targetTableId === sourceTableId) {
                if (colId && col.id !== colId) continue;

                let vals = targetRow.cells[col.id];
                if (!Array.isArray(vals)) vals = vals ? [vals] : [];

                for (let relatedRowId of vals) {
                    if (relatedRowId === sourceRowId) {
                        return true;
                    }
                    if (AdvancedTable.checkCircularRelation(sourceTableId, sourceRowId, col.targetTableId, relatedRowId, colId, new Set(visited))) {
                        return true;
                    }
                }
            }
        }
        return false;
    },

    toggleRelationValue: (targetRowId) => {
        let { realTableId, tableId, rowId, colId, currentVals, targetDbId, targetColId, isBacklink } = AdvancedTable._pendingRelSelect;

        const state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);

        // CLONAZIONE DIFENSIVA PER EVITARE MUTAZIONI IN-PLACE
        currentVals = Array.isArray(currentVals) ? [...currentVals] : [];

        if (currentVals.includes(targetRowId)) {
            currentVals = currentVals.filter(id => id !== targetRowId);
        } else {
            const isCircular = AdvancedTable.checkCircularRelation(realTableId, rowId, targetDbId, targetRowId, colId);
            if (isCircular) {
                alert(I18n.t('adv_actions.circular_relation_blocked'));
                return;
            }
            
            if (col.singleRecord && !isBacklink) {
                currentVals = [targetRowId];
            } else {
                currentVals = [...currentVals, targetRowId];
            }

            // AUTO-EXPAND WBS: Se siamo in vista ad albero WBS e abbiamo appena collegato un figlio/genitore,
            // espandi automaticamente il nodo affinché l'utente veda subito l'aggiornamento a schermo
            const viewState = AdvancedTable.getState(tableId);
            if (viewState && viewState.viewType === 'tree' && viewState.treeRelationColId === colId) {
                const parentNodeId = (viewState.treeRelationDirection === 'parent') ? targetRowId : rowId;
                if (viewState.treeCollapsedNodes && viewState.treeCollapsedNodes.includes(parentNodeId)) {
                    viewState.treeCollapsedNodes = viewState.treeCollapsedNodes.filter(id => id !== parentNodeId);
                    AdvancedTable.setState(tableId, viewState);
                }
            }
        }

        AdvancedTable._pendingRelSelect.currentVals = currentVals;

        if (isBacklink) {
            let remoteState = AdvancedTable.getState(targetDbId);
            let remoteRow = remoteState.rows.find(r => r.id === targetRowId);
            if (remoteRow) {
                let remoteArr = remoteRow.cells[targetColId];
                remoteArr = Array.isArray(remoteArr) ? [...remoteArr] : (remoteArr ? [remoteArr] : []);
                
                if (remoteArr.includes(rowId)) {
                    remoteArr = remoteArr.filter(id => id !== rowId);
                } else {
                    const remoteColDef = remoteState.columns.find(c => c.id === targetColId);
                    if (remoteColDef && remoteColDef.singleRecord) {
                        remoteArr = [rowId];
                    } else {
                        remoteArr = [...remoteArr, rowId];
                    }
                }
                AdvancedTable.updateData(targetDbId, targetRowId, targetColId, remoteArr);
            }
        } else {
            AdvancedTable.updateData(tableId, rowId, colId, currentVals);
        }

        const drawer = document.getElementById('advGlobalDrawer');
        if (drawer && drawer.classList.contains('open') && AdvancedTable.activeRecordId === rowId) {
            AdvancedTable.openRecordView(tableId, rowId);
        } else {
            // Continuiamo a ri-renderizzare sfruttando il Current Limit salvato in memoria per non rovinare lo scroll
            const currentSearch = document.getElementById('relSelectSearch') ? document.getElementById('relSelectSearch').value : '';
            AdvancedTable.renderRelationOptions(currentSearch);
        }
    }
});