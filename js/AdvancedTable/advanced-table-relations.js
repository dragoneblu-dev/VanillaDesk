/**
 * advanced-table-relations.js
 * Modulo dedicato alla gestione delle Relazioni tra Database, Relazioni Inverse (Backlink) e Rollup.
 * Include:
 * - Configurazione guidata tramite Drawer (openRelationConfig, openRollupConfig)
 * - Selettore interattivo dei record collegati con ricerca e lazy-rendering incrementale (openRelationSelector)
 * - Controllo e blocco matematico dei cicli ricorsivi (checkCircularRelation)
 * - Scollegamento chirurgico tra entità relazionate con invalidazione cache e ridisegno bidirezionale (unlinkRelation)
 * - Tendina "Dettaglio" nel Drawer di selezione relazionale per disambiguare record omonimi su layout monoriga
 * - Inizializzazione automatica di col.treeDirection ('parent' o 'children') per auto-relazioni WBS
 * - FEAT RADIO VS CHECKBOX: Differenziazione grafica dell'indicatore per singleRecord (Radio ◉/○) vs Multiplo (Checkbox).
 * - FEAT QUICK-CREATE: Creazione al volo di un nuovo record nella tabella bersaglio con assegnazione condizionata al solo campo target (text o number).
 * - FEAT QUICK PEEK ADI-STATE UX: Finestra modale con footer ergonomico dinamico (Chiudi in consultazione,
 *   Annulla/Salva se modificato, Annulla ed Elimina/Salva se appena creato) integrato con le classi CSS di sistema.
 * - FEAT FEEDBACK CONTATORE: Notifica numerica in tempo reale sui record visualizzati rispetto al totale.
 * - FIX ROLLUP VALUE OVERSIGHT: Ripristinata estrazione corretta di .value per rollupConfigTarget.
 * - FIX DEBOUNCE RESTORE: Ripristinato timer originale a 250ms per filterRelationOptions.
 * - FIX HEADER LAYOUT PEEK: Header del pop-up modale blindato su singola riga orizzontale con pulsante ✕ allineato a destra.
 * - FIX POPUP BUBBLING: Stop completo alla propagazione del click per impedire la chiusura accidentale del Drawer sottostante.
 * - FIX SEARCH AUTOFILL BLOCK: Disinnescato l'autocompletamento nativo degli indirizzi del browser e dei password manager sul campo cerca.
 */

Object.assign(AdvancedTable, {

    _relSearchTimer: null,
    _activeRelationPeek: null,

    unlinkRelation: (srcTableId, srcRowId, srcColId, targetIdToUnlink, isBacklink) => {
        const realSrcTable = AdvancedTable._resolveSourceId(srcTableId);
        const srcState = AdvancedTable.getState(realSrcTable);
        if (!srcState) return;

        const srcCol = srcState.columns.find(c => c.id === srcColId);
        if (!srcCol) return;

        if (isBacklink) {
            // Stiamo visualizzando un record di A (targetIdToUnlink) aperto da un backlink in B (realSrcTable).
            // Dobbiamo rimuovere il record di B (srcRowId) dal campo relazione di A (targetColId).
            const targetDbId = AdvancedTable._resolveSourceId(srcCol.linkedTableId);
            const targetColId = srcCol.linkedColId;
            const targetState = AdvancedTable.getState(targetDbId);
            const targetRow = targetState ? targetState.rows.find(r => r.id === targetIdToUnlink) : null;
            
            if (targetRow) {
                let vals = targetRow.cells[targetColId];
                vals = Array.isArray(vals) ? [...vals] : (vals ? [vals] : []);
                vals = vals.filter(id => id !== srcRowId);
                AdvancedTable.updateData(targetDbId, targetIdToUnlink, targetColId, vals);
            }

            // Svuota le cache virtuali e aggiorna reattivamente la tabella B (e tutte le sue viste collegate)
            delete srcState._renderCache;
            AdvancedTable.updateDependentViews(realSrcTable);
            const srcDom = document.getElementById(srcTableId);
            if (srcDom && typeof AdvancedTable.renderTable === 'function') {
                AdvancedTable.renderTable(srcTableId);
            }
        } else {
            // Relazione diretta: rimuoviamo targetIdToUnlink dal record locale srcRowId
            const srcRow = srcState.rows.find(r => r.id === srcRowId);
            if (srcRow) {
                let vals = srcRow.cells[srcColId];
                vals = Array.isArray(vals) ? [...vals] : (vals ? [vals] : []);
                vals = vals.filter(id => id !== targetIdToUnlink);
                AdvancedTable.updateData(realSrcTable, srcRowId, srcColId, vals);
            }

            // Aggiorna anche l'eventuale database bersaglio collegato
            if (srcCol.targetTableId) {
                const targetDbId = AdvancedTable._resolveSourceId(srcCol.targetTableId);
                AdvancedTable.updateDependentViews(targetDbId);
            }

            delete srcState._renderCache;
            AdvancedTable.updateDependentViews(realSrcTable);
            const srcDom = document.getElementById(srcTableId);
            if (srcDom && typeof AdvancedTable.renderTable === 'function') {
                AdvancedTable.renderTable(srcTableId);
            }
        }

        Store.triggerAutoSave();

        if (typeof UI !== 'undefined') {
            UI.closeDrawer();
            if (typeof UI.showToast === 'function') {
                UI.showToast(I18n.t('adv_actions.unlink_success'), "info");
            }
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
        const targetColSelect = document.getElementById('rollupConfigTarget');
        const targetColId = targetColSelect ? targetColSelect.value : '';

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
                secondaryColOptionsHtml += `<option value="${c.id}" ${isSelected}>${UI.escapeHTML(c.name)} (${c.type})</option>`;
            }
        });

        const isSingle = !!col.singleRecord;
        const modeBadgeLabel = isSingle 
            ? (I18n.t('adv_actions.rel_single_record_hint') || "Vincolo: 1 solo record")
            : (I18n.t('adv_actions.rel_multi_record_hint') || "Selezione multipla");

        // Salvataggio parametri completi di sessione del selettore
        AdvancedTable._pendingRelSelect = { 
            realTableId, tableId, rowId, colId, 
            targetState, targetDbId, targetColId, isBacklink: false,
            currentVals: currentVals,
            currentLimit: 50,
            secondaryColId: activeSecondaryColId,
            isSingleRecord: isSingle,
            targetTabName: targetTabName,
            targetColName: targetColName
        };

        const randomSearchName = 'prevent_autofill_rel_' + Date.now();

        const bodyHTML = `
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 10px; padding: 10px; background: rgba(0,0,0,0.02); border-radius: 6px; border: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <div>
                    ${Icons.link} ${I18n.t('adv_actions.connected_to')} <b style="color:var(--accent-color); cursor:pointer;" onclick="UI.closeDrawer(); setTimeout(() => UI.jumpToWidget('${targetDbId}'), 150)" title="${I18n.t('adv_actions.go_to_source_db')}">${UI.escapeHTML(targetTabName)}</b> ➔ ${I18n.t('adv_actions.field_label')} <b>${UI.escapeHTML(targetColName)}</b>
                </div>
                <span style="font-size:0.72rem; font-weight:600; padding:2px 8px; border-radius:10px; background:${isSingle ? 'rgba(234, 179, 8, 0.12)' : 'rgba(37, 99, 235, 0.08)'}; color:${isSingle ? '#b45309' : 'var(--accent-color)'}; border:1px solid ${isSingle ? 'rgba(234, 179, 8, 0.3)' : 'rgba(37, 99, 235, 0.2)'};">
                    ${modeBadgeLabel}
                </span>
            </div>
            
            <!-- Barra Ricerca con blocco totale autofill e Selettore Dettaglio Monoriga Compatto -->
            <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
                <input type="text" id="relSelectSearch" class="modern-input" style="flex:1; margin:0;" 
                       autocomplete="chrome-off" name="${randomSearchName}" 
                       autocorrect="off" autocapitalize="off" spellcheck="false"
                       data-lpignore="true" data-1p-ignore="true" data-form-type="other"
                       placeholder="${I18n.t('adv_actions.search_value_placeholder')}" 
                       oninput="AdvancedTable.filterRelationOptions(this.value)">
                <select id="relSecondaryColSelect" class="modern-input" style="flex:0 0 170px; margin:0; padding:6px 8px; font-size:0.8rem; font-weight:500;" onchange="AdvancedTable.changeRelationSecondaryCol(this.value)">
                    ${secondaryColOptionsHtml}
                </select>
            </div>

            <!-- Indicatore Feedback Conteggio Filtro -->
            <div id="relFilterCounterFeedback" style="font-size:0.75rem; color:var(--text-secondary); opacity:0.8; margin-bottom:6px; padding:0 2px;"></div>

            <div id="relSelectList" class="link-modal-list" style="padding:4px 0; flex:1; overflow-y:auto; display: flex; flex-direction: column; gap: 4px;"></div>
        `;

        if (typeof UI !== 'undefined') 
            UI.openDrawer(I18n.t('adv_actions.select_record_title'), bodyHTML, null);

        setTimeout(() => {
            AdvancedTable.renderRelationOptions('');
            const searchInput = document.getElementById('relSelectSearch');
            if (searchInput) {
                searchInput.focus();
                // Invio rapido da tastiera: se compare il Quick Create, crealo; altrimenti se c'è un solo match, associalo
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const qcBtn = document.querySelector('#relSelectList .quick-create-item');
                        if (qcBtn) {
                            qcBtn.click();
                        } else {
                            const firstItem = document.querySelector('#relSelectList .link-modal-item:not(.quick-create-item)');
                            if (firstItem) firstItem.click();
                        }
                    }
                });
            }
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
            if (AdvancedTable._pendingRelSelect) AdvancedTable._pendingRelSelect.currentLimit = 50;
            AdvancedTable.renderRelationOptions(val);
        }, 250); 
    },

    // =========================================================================
    // QUICK-CREATE: Creazione rapida di una nuova riga nel DB di destinazione
    // Valorizza ESCLUSIVAMENTE lo specifico campo a cui fa riferimento la relazione,
    // e SOLTANTO se tale campo è di tipologia 'text' o 'number' (senza precompilare altro).
    // Subito dopo, apre il Quick Peek Modal isolato con il flag isNewlyCreated = true!
    // =========================================================================
    quickCreateRelationRecord: async (rawTitle) => {
        const pending = AdvancedTable._pendingRelSelect;
        if (!pending) return;

        const cleanTitle = (rawTitle || '').trim();
        if (!cleanTitle) return;

        const targetState = AdvancedTable.getState(pending.targetDbId);
        if (!targetState || !Array.isArray(targetState.rows)) return;

        // Verifica sicurezza: impedisci inserimenti manuali sul database protetto di sistema
        if (typeof AdvancedTable.isSystemDatabaseProtected === 'function' && AdvancedTable.isSystemDatabaseProtected(pending.targetDbId)) {
            return;
        }

        const now = Date.now();
        const newRowId = 'r' + Store.generateId();
        const newRow = { id: newRowId, createdAt: now, updatedAt: now, cells: {}, virtualCells: {} };

        targetState.columns.forEach(c => {
            if (c.type === 'checkbox') newRow.cells[c.id] = false;
            else if (['multi-select', 'relation'].includes(c.type)) newRow.cells[c.id] = [];
            else if (['date', 'datetime'].includes(c.type)) newRow.cells[c.id] = c.hasEndDate ? { start: '', end: '' } : '';
            else newRow.cells[c.id] = '';
        });

        // PRECOMPILAZIONE SELETTIVA: Solo sul campo puntato dalla relazione e SOLO se text o number
        const targetCol = targetState.columns.find(c => c.id === pending.targetColId);
        if (targetCol) {
            if (targetCol.type === 'text') {
                newRow.cells[pending.targetColId] = cleanTitle;
            } else if (targetCol.type === 'number') {
                const num = parseFloat(cleanTitle.replace(',', '.'));
                if (!isNaN(num)) {
                    newRow.cells[pending.targetColId] = num;
                }
            }
            // Negli altri casi (date, select, checkbox, formula, ecc.) non precompilare nulla!
        }

        targetState.rows.push(newRow);

        if (AdvancedTable._rowIndices && AdvancedTable._rowIndices.has(pending.targetDbId)) {
            AdvancedTable._rowIndices.get(pending.targetDbId).set(newRowId, newRow);
        }

        // Calcolo virtuale della nuova riga creata
        const freshVRow = AdvancedTable.buildVirtualRow(pending.targetDbId, newRow, targetState);
        newRow.virtualCells = freshVRow.virtualCells;

        AdvancedTable.setState(pending.targetDbId, targetState);

        // Se presente il modulo di automazioni, innesca la valutazione per nuova riga
        if (typeof AdvancedAutomations !== 'undefined') {
            await AdvancedAutomations.evaluate(pending.targetDbId, newRow.id, true);
            await AdvancedAutomations.triggerCrossDB(pending.targetDbId);
        }

        Store.triggerAutoSave();
        AdvancedTable.updateDependentViews(pending.targetDbId);

        // Associa istantaneamente il nuovo record alla riga corrente
        AdvancedTable.toggleRelationValue(newRowId);

        // Azzera la barra di ricerca e rinfresca la lista
        const searchInput = document.getElementById('relSelectSearch');
        if (searchInput) {
            searchInput.value = '';
        }

        const toastMsg = (typeof I18n !== 'undefined' && I18n.t('adv_actions.quick_create_success', { title: cleanTitle })) || `Record "${cleanTitle}" creato e collegato!`;
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(toastMsg, "success");
        }

        // Apre immediatamente il Quick Peek Modal sul record appena creato con il flag isNewlyCreated = true!
        AdvancedTable.openRelationQuickPeek(pending.targetDbId, newRowId, true);
    },

    // =========================================================================
    // ABORT & DISCARD: Annulla ed Elimina il record creato per sbaglio da Quick-Create
    // =========================================================================
    abortAndDiscardCreatedRecord: (e, targetDbId, createdRowId) => {
        if (e) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
        }

        const pending = AdvancedTable._pendingRelSelect;
        if (pending) {
            // 1. Rimuove il collegamento dalla selezione della riga di partenza
            pending.currentVals = (pending.currentVals || []).filter(id => id !== createdRowId);
            AdvancedTable.updateData(pending.tableId, pending.rowId, pending.colId, pending.currentVals);
        }

        // 2. Rimuove fisicamente il record dal database bersaglio
        const targetState = AdvancedTable.getState(targetDbId);
        if (targetState && Array.isArray(targetState.rows)) {
            targetState.rows = targetState.rows.filter(r => r.id !== createdRowId);
            if (AdvancedTable._rowIndices && AdvancedTable._rowIndices.has(targetDbId)) {
                AdvancedTable._rowIndices.get(targetDbId).delete(createdRowId);
            }
            AdvancedTable.setState(targetDbId, targetState);
            AdvancedTable.updateDependentViews(targetDbId);
        }

        Store.triggerAutoSave();

        // 3. Chiude il pop-up modale
        AdvancedTable.closeRelationQuickPeek(e);

        const toastMsg = (typeof I18n !== 'undefined' && I18n.t('adv_actions.quick_create_canceled_toast')) || "Nuovo record annullato ed eliminato.";
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(toastMsg, "info");
        }
    },

    // =========================================================================
    // HELPER ERGONOMICO: Rende e aggiorna reattivamente i pulsanti nel footer del Quick Peek
    // Usa le classi standard del design system (.btn, .btn-primary) e le chiavi standard i18n
    // =========================================================================
    updateRelationQuickPeekFooter: () => {
        const peek = AdvancedTable._activeRelationPeek;
        const footer = document.getElementById('advRelationPeekFooter');
        if (!peek || !footer) return;

        const isNewlyCreated = peek.isNewlyCreated;
        const isDirty = peek.isDirty;

        const saveLabel = (typeof I18n !== 'undefined' && I18n.t('common.save')) || "Salva";
        const cancelLabel = (typeof I18n !== 'undefined' && I18n.t('common.cancel')) || "Annulla";
        const closeLabel = (typeof I18n !== 'undefined' && I18n.t('common.close')) || "Chiudi";

        if (isNewlyCreated) {
            // Record appena creato al volo: Annulla ed Elimina (Abort) vs Salva
            const discardCreatedLabel = (typeof I18n !== 'undefined' && I18n.t('adv_actions.quick_create_cancel_btn')) || cancelLabel;
            footer.innerHTML = `
                <button type="button" class="btn" onclick="AdvancedTable.cancelRelationQuickPeek(event)" style="border-color:var(--danger-color); color:var(--danger-color);">
                    ${discardCreatedLabel}
                </button>
                <button type="button" class="btn btn-primary" onclick="AdvancedTable.saveRelationQuickPeek(event)">
                    ${saveLabel}
                </button>
            `;
        } else if (isDirty) {
            // Record esistente modificato: Annulla (Rollback) vs Salva
            footer.innerHTML = `
                <button type="button" class="btn" onclick="AdvancedTable.cancelRelationQuickPeek(event)">
                    ${cancelLabel}
                </button>
                <button type="button" class="btn btn-primary" onclick="AdvancedTable.saveRelationQuickPeek(event)">
                    ${saveLabel}
                </button>
            `;
        } else {
            // Record esistente solo consultato: solo Chiudi
            footer.innerHTML = `
                <button type="button" class="btn" onclick="AdvancedTable.closeRelationQuickPeek(event)">
                    ${closeLabel}
                </button>
            `;
        }
    },

    // QUICK PEEK MODAL: Finestra Modale Galleggiante con Layout Standardizzato
    openRelationQuickPeek: (targetDbId, targetRowId, isNewlyCreated = false) => {
        // Chiude e risolve in sicurezza qualsiasi sessione peek già aperta
        if (AdvancedTable._activeRelationPeek) {
            AdvancedTable.cancelRelationQuickPeek();
        }

        const existingModal = document.getElementById('advRelationPeekModalOverlay');
        if (existingModal) existingModal.remove();

        const targetState = AdvancedTable.getState(targetDbId);
        if (!targetState || !Array.isArray(targetState.rows)) return;

        const row = targetState.rows.find(r => r.id === targetRowId);
        if (!row) return;

        // Registrazione dello stato sessione per conferma esplicita o ripristino/rollback
        AdvancedTable._activeRelationPeek = {
            targetDbId: targetDbId,
            targetRowId: targetRowId,
            isNewlyCreated: isNewlyCreated,
            originalCells: JSON.parse(JSON.stringify(row.cells || {})),
            originalUpdatedAt: row.updatedAt,
            isDirty: false
        };

        const titleCol = targetState.columns[0];
        const rawTitle = titleCol ? (row.cells[titleCol.id] || I18n.t('editor.untitled')) : I18n.t('editor.untitled');
        const safeTitle = UI.escapeHTML(String(rawTitle));
        const safeDbName = UI.escapeHTML(String(targetState.title || 'Database'));

        const overlay = document.createElement('div');
        overlay.id = 'advRelationPeekModalOverlay';
        overlay.className = 'link-modal-overlay modal-animate';
        overlay.style.zIndex = '99999'; // Sopra il drawer (500) per consultazione rapida

        // Genera i campi editabili della riga riciclando la classe di layout .adv-cell-layout del sistema
        let fieldsHtml = '<div style="display:flex; flex-direction:column; gap:8px; width:100%;">';
        
        targetState.columns.forEach(col => {
            const safeColName = UI.escapeHTML(col.name);
            // Per le relazioni nel peek modal usiamo sola lettura per non innescare aperture ricorsive del drawer
            const isRel = col.type === 'relation' || col.type === 'relation_backlink';
            const cellVal = (row.virtualCells && row.virtualCells[col.id] !== undefined) ? row.virtualCells[col.id] : row.cells[col.id];
            const renderedCell = AdvancedTable.renderCell(targetDbId, row, col, cellVal, targetState, isRel ? false : AppState.isEditMode);

            fieldsHtml += `
                <div class="adv-cell-layout">
                    <div class="adv-cell-label-wrap">
                        <div class="adv-cell-label">${safeColName}</div>
                    </div>
                    <div class="adv-cell-value-wrap">
                        ${renderedCell}
                    </div>
                </div>
            `;
        });
        fieldsHtml += '</div>';

        // Badge distintivo per record appena creati da Quick-Create riciclando .adv-select-pill
        const newRecordBadgeHtml = isNewlyCreated 
            ? `<span class="adv-select-pill hl-c7" style="margin-left:6px; font-size:0.7rem;">Nuovo</span>` 
            : '';

        // Layout dell'header orizzontale a riga singola con classi semantiche di sistema
        overlay.innerHTML = `
            <div class="link-modal" style="width: 580px; max-width: 92vw; max-height: 85vh; overflow: hidden;">
                <div class="link-modal-header" style="padding: 12px 16px; background: var(--bg-color); flex-shrink: 0;">
                    <div class="link-modal-title ui-flex-between">
                        <div style="display:flex; align-items:center; gap:8px; min-width:0; overflow:hidden;">
                            <span style="color:var(--accent-color); display:inline-flex; flex-shrink:0;">${typeof Icons !== 'undefined' ? Icons.recordView : '📄'}</span>
                            <span style="font-weight:bold; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${safeTitle}</span>
                            <span style="font-size:0.75rem; color:var(--text-secondary); margin-left:6px; flex-shrink:0;">(${safeDbName})</span>
                            ${newRecordBadgeHtml}
                        </div>
                        <button type="button" class="close-modal-btn" onclick="AdvancedTable.handleQuickPeekHeaderClose(event)" title="${typeof I18n !== 'undefined' ? I18n.t('common.close') : 'Chiudi'} (Esc)">✕</button>
                    </div>
                </div>
                <div class="link-modal-list adv-scroll-container" style="padding: 15px;">
                    ${fieldsHtml}
                </div>
                <div id="advRelationPeekFooter" style="padding: 12px 16px; border-top: 1px solid var(--border-color); background: var(--bg-color); display: flex; justify-content: flex-end; align-items: center; gap: 10px; flex-shrink: 0;">
                    <!-- Popolato dinamicamente da updateRelationQuickPeekFooter() -->
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Rendering iniziale reattivo del footer
        AdvancedTable.updateRelationQuickPeekFooter();

        // Rilevamento in tempo reale delle modifiche sui campi all'interno della modale
        const onModalFieldMutated = () => {
            if (AdvancedTable._activeRelationPeek && !AdvancedTable._activeRelationPeek.isDirty) {
                AdvancedTable._activeRelationPeek.isDirty = true;
                AdvancedTable.updateRelationQuickPeekFooter();
            }
        };

        overlay.addEventListener('input', onModalFieldMutated);
        overlay.addEventListener('change', onModalFieldMutated);

        // Blocco categorico della propagazione degli eventi verso il document per non chiudere il Drawer
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target === overlay) {
                AdvancedTable.handleQuickPeekHeaderClose(e);
            }
        });

        overlay.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        // Chiusura/Annullamento tramite tasto Escape
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                const openDropdown = document.querySelector('.adv-dropdown');
                if (openDropdown) {
                    return; // Lascia chiudere prima il menu a tendina delle select
                }
                e.preventDefault();
                e.stopPropagation();
                AdvancedTable.handleQuickPeekHeaderClose(e);
            }
        };
        overlay._escHandler = escHandler;
        document.addEventListener('keydown', escHandler, true);

        // Attiva gli handler di editing per le celle del pop-up modale
        if (AppState.isEditMode && typeof AdvancedTable.attachCellEvents === 'function') {
            AdvancedTable.attachCellEvents(overlay, targetDbId);
        }
    },

    // Gestore unificato di chiusura da ✕ (header), click su backdrop o tasto Escape
    handleQuickPeekHeaderClose: (e) => {
        const peek = AdvancedTable._activeRelationPeek;
        if (!peek) {
            AdvancedTable.closeRelationQuickPeek(e);
            return;
        }

        if (peek.isNewlyCreated) {
            // Se appena creato, chiudere senza salvare equivale ad annullare ed eliminare la riga creata
            AdvancedTable.abortAndDiscardCreatedRecord(e, peek.targetDbId, peek.targetRowId);
        } else if (peek.isDirty) {
            // Se modificato, chiudere esegue il rollback sicuro
            AdvancedTable.cancelRelationQuickPeek(e);
        } else {
            // Se non è stato modificato, chiude direttamente in modo trasparente e silenzioso
            AdvancedTable.closeRelationQuickPeek(e);
        }
    },

    cancelRelationQuickPeek: (e) => {
        if (e) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        }

        const peek = AdvancedTable._activeRelationPeek;
        if (peek) {
            if (peek.isNewlyCreated) {
                AdvancedTable.abortAndDiscardCreatedRecord(e, peek.targetDbId, peek.targetRowId);
                AdvancedTable._activeRelationPeek = null;
                return;
            }

            if (peek.isDirty) {
                const targetState = AdvancedTable.getState(peek.targetDbId);
                if (targetState && Array.isArray(targetState.rows)) {
                    const row = targetState.rows.find(r => r.id === peek.targetRowId);
                    if (row) {
                        row.cells = JSON.parse(JSON.stringify(peek.originalCells));
                        row.updatedAt = peek.originalUpdatedAt;
                        const vRow = AdvancedTable.buildVirtualRow(peek.targetDbId, row, targetState);
                        row.virtualCells = vRow.virtualCells;
                        AdvancedTable.setState(peek.targetDbId, targetState);
                        AdvancedTable.updateDependentViews(peek.targetDbId);
                        Store.triggerAutoSave(true);
                    }
                }
                if (typeof UI !== 'undefined' && UI.showToast) {
                    UI.showToast((typeof I18n !== 'undefined' && I18n.t('adv_actions.quick_peek_cancel_toast')) || "Modifiche annullate.", "info");
                }
            }
            AdvancedTable._activeRelationPeek = null;
        }

        AdvancedTable.closeRelationQuickPeek(e);
    },

    saveRelationQuickPeek: (e) => {
        if (e) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        }

        const peek = AdvancedTable._activeRelationPeek;
        if (peek) {
            const targetState = AdvancedTable.getState(peek.targetDbId);
            if (targetState && Array.isArray(targetState.rows)) {
                const row = targetState.rows.find(r => r.id === peek.targetRowId);
                if (row) {
                    row.updatedAt = Date.now();
                    const vRow = AdvancedTable.buildVirtualRow(peek.targetDbId, row, targetState);
                    row.virtualCells = vRow.virtualCells;
                    AdvancedTable.setState(peek.targetDbId, targetState);
                    AdvancedTable.updateDependentViews(peek.targetDbId);
                    Store.triggerAutoSave(true);
                }
            }

            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast((typeof I18n !== 'undefined' && I18n.t('adv_actions.quick_peek_save_toast')) || "Modifiche salvate con successo.", "success");
            }
            AdvancedTable._activeRelationPeek = null;
        }

        AdvancedTable.closeRelationQuickPeek(e);
    },

    closeRelationQuickPeek: (e) => {
        if (e) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        }

        // Attiva la protezione temporanea su UI per neutralizzare listener ritardati di click su capture
        UI._preventDrawerClose = true;
        setTimeout(() => { 
            UI._preventDrawerClose = false; 
        }, 300);

        const overlay = document.getElementById('advRelationPeekModalOverlay');
        if (overlay) {
            if (overlay._escHandler) {
                document.removeEventListener('keydown', overlay._escHandler, true);
            }
            overlay.remove();
        }
        // Rinfresca le opzioni del selettore sottostante per mostrare subito eventuali modifiche al titolo
        if (AdvancedTable._pendingRelSelect) {
            const currentSearch = document.getElementById('relSelectSearch') ? document.getElementById('relSelectSearch').value : '';
            AdvancedTable.renderRelationOptions(currentSearch);
        }
    },

    renderRelationOptions: (filter, newLimit = null) => {
        const pending = AdvancedTable._pendingRelSelect;
        if (!pending) return;

        if (newLimit !== null) pending.currentLimit = newLimit;
        const currentLimit = pending.currentLimit || 50;

        const { targetState, currentVals, isBacklink, targetColId, targetDbId, secondaryColId, isSingleRecord, targetTabName } = pending;
        const listEl = document.getElementById('relSelectList');
        const counterFeedbackEl = document.getElementById('relFilterCounterFeedback');
        if (!listEl) return;
        
        const displayColId = isBacklink ? targetState.columns[0].id : targetColId;
        const targetColDef = targetState.columns.find(c => c.id === displayColId);
        const secondaryColDef = secondaryColId ? targetState.columns.find(c => c.id === secondaryColId) : null;

        const cleanFilter = (filter || '').trim();
        const lowerFilter = cleanFilter.toLowerCase();

        let itemsToRender = [];
        const renderCache = {};
        
        const isCalculatedCol = targetColDef && ['formula', 'rollup', 'relation_backlink'].includes(targetColDef.type);
        const isSecondaryCalculated = secondaryColDef && ['formula', 'rollup', 'relation_backlink'].includes(secondaryColDef.type);
        
        let matchCount = 0;
        let totalCount = 0;
        let hasExactMatch = false;

        for (let i = 0; i < targetState.rows.length; i++) {
            const tRow = targetState.rows[i];
            const isSelected = currentVals.includes(tRow.id);

            // EARLY BREAK / LAZY EVALUATION in assenza di filtro
            if (!cleanFilter && matchCount >= currentLimit && !isSelected) {
                totalCount++;
                continue;
            }

            let rawVal;
            if (isCalculatedCol) {
                const vRow = AdvancedTable.buildVirtualRow(targetDbId, tRow, targetState, renderCache);
                rawVal = vRow.virtualCells[displayColId];
            } else {
                rawVal = tRow.cells[displayColId];
            }

            let displayVal = AdvancedTable.getFormatDisplayValue(targetColDef, rawVal, renderCache);
            if (!displayVal) displayVal = I18n.t('editor.untitled');

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

            // Verifica se il record corrisponde esattamente alla stringa cercata
            if (cleanFilter && displayVal.trim().toLowerCase() === lowerFilter) {
                hasExactMatch = true;
            }

            // Ricerca combinata sul campo primario e secondario
            const matchesPrimary = displayVal.toLowerCase().includes(lowerFilter);
            const matchesSecondary = secondaryDisplayVal ? secondaryDisplayVal.toLowerCase().includes(lowerFilter) : false;

            if (cleanFilter && !matchesPrimary && !matchesSecondary) {
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

        if (!cleanFilter) {
            totalCount = targetState.rows.length;
        }

        // FEEDBACK VISIVO NUMERICO CONTEGGIO RISULTATI
        if (counterFeedbackEl) {
            const shownCount = Math.min(itemsToRender.length, currentLimit);
            if (cleanFilter) {
                counterFeedbackEl.innerHTML = I18n.t('adv_actions.filter_counter_filtered', { shown: shownCount, total: itemsToRender.length, totalInDb: targetState.rows.length }) || `Filtrati ${shownCount} di ${itemsToRender.length} record (${targetState.rows.length} nel database)`;
            } else {
                counterFeedbackEl.innerHTML = I18n.t('adv_actions.filter_counter_feedback', { shown: shownCount, total: totalCount }) || `Visualizzati ${shownCount} di ${totalCount} record`;
            }
        }

        // Mettiamo in testa i valori già selezionati, poi ordine alfabetico
        itemsToRender.sort((a, b) => {
            if (a.isSelected && !b.isSelected) return -1;
            if (!a.isSelected && b.isSelected) return 1;
            return a.displayVal.localeCompare(b.displayVal, undefined, { numeric: true, sensitivity: 'base' });
        });

        const itemsToShow = itemsToRender.slice(0, currentLimit);

        let html = '';

        // PATTERN QUICK-CREATE: Voce speciale in cima se non esiste match esatto per il testo cercato
        const isProtectedTarget = typeof AdvancedTable.isSystemDatabaseProtected === 'function' && AdvancedTable.isSystemDatabaseProtected(targetDbId, false);
        if (cleanFilter && !hasExactMatch && AppState.isEditMode && !isProtectedTarget) {
            const safeFilter = UI.escapeHTML(cleanFilter);
            const escapedFilter = cleanFilter.replace(/'/g, "\\'");
            const safeTabName = UI.escapeHTML(targetTabName);

            html += `
                <div class="link-modal-item quick-create-item" 
                     style="border: 1px dashed var(--accent-color); background: rgba(37, 99, 235, 0.08); margin-bottom: 6px; font-weight: bold; color: var(--accent-color); display: flex; align-items: center; justify-content: space-between; height: 38px; padding: 0 10px; cursor: pointer; border-radius: 4px; transition: background 0.15s ease;"
                     onmouseenter="this.style.background='rgba(37, 99, 235, 0.15)'"
                     onmouseleave="this.style.background='rgba(37, 99, 235, 0.08)'"
                     onclick="AdvancedTable.quickCreateRelationRecord('${escapedFilter}')">
                    <span style="display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        <span style="font-size:1.15rem; line-height:1; display:inline-flex;">+</span>
                        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Crea "<b>${safeFilter}</b>" in <i>${safeTabName}</i></span>
                    </span>
                    <span style="font-size:0.7rem; font-family:monospace; background:rgba(37,99,235,0.15); padding:2px 6px; border-radius:4px; font-weight:600; flex-shrink:0;">Invio ↵</span>
                </div>
            `;
        }

        itemsToShow.forEach(item => {
            const secondaryHtml = item.secondaryVal ? `
                <span class="adv-relation-secondary-hint" 
                      style="font-size:0.75rem; color:var(--text-secondary); opacity:0.8; max-width:40%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; background:rgba(0,0,0,0.03); border:1px solid var(--border-color); padding:1px 6px; border-radius:4px; margin-left:auto; margin-right:8px; flex-shrink:1;"
                      title="${UI.escapeHTML(item.secondaryVal)}">
                    ${UI.escapeHTML(item.secondaryVal)}
                </span>
            ` : '';

            // QUICK PEEK BUTTON: Ispezione e modifica rapida tramite pop-up galleggiante isolato
            const peekBtn = `
                <button class="adv-icon-btn" 
                        style="padding: 2px 4px; margin-right: 6px; color: var(--text-secondary); opacity: 0.7; flex-shrink: 0;" 
                        title="${I18n.t('adv_actions.quick_peek_tooltip') || 'Ispeziona e compila scheda record (Anteprima)'}" 
                        onclick="event.stopPropagation(); AdvancedTable.openRelationQuickPeek('${targetDbId}', '${item.id}', false)">
                    ${typeof Icons !== 'undefined' ? Icons.recordView : '📄'}
                </button>
            `;

            // DIFFERENZIAZIONE VISIVA: Radio (singolo) vs Checkbox (multiplo)
            let indicatorHtml = '';
            if (isSingleRecord) {
                // Stile Radio Button
                if (item.isSelected) {
                    indicatorHtml = `
                        <span style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:50%; border:2px solid var(--accent-color); background:transparent; flex-shrink:0;">
                            <span style="width:8px; height:8px; border-radius:50%; background:var(--accent-color);"></span>
                        </span>
                    `;
                } else {
                    indicatorHtml = `
                        <span style="display:inline-flex; width:16px; height:16px; border-radius:50%; border:2px solid var(--border-color); background:transparent; opacity:0.6; flex-shrink:0;"></span>
                    `;
                }
            } else {
                // Stile Checkbox standard
                if (item.isSelected) {
                    indicatorHtml = `<span style="color:var(--accent-color); font-weight:bold; flex-shrink:0; width:16px; text-align:right;">✓</span>`;
                } else {
                    indicatorHtml = `<span style="width:16px; flex-shrink:0;"></span>`;
                }
            }

            html += `
                <div class="link-modal-item ${item.isSelected ? 'active' : ''}" 
                     style="display:flex; align-items:center; justify-content:space-between; border: 1px solid var(--border-color); height:38px; min-height:38px; padding:0 8px; box-sizing:border-box; overflow:hidden; border-radius:4px;" 
                     onclick="AdvancedTable.toggleRelationValue('${item.id}')">
                    
                    <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:${item.isSelected ? '600' : 'normal'};" title="${UI.escapeHTML(item.displayVal)}">
                        ${UI.escapeHTML(item.displayVal)}
                    </span>
                    
                    ${secondaryHtml}
                    ${peekBtn}
                    ${indicatorHtml}
                </div>
            `;
        });

        if (totalCount > itemsToShow.length) {
            const diff = totalCount - itemsToShow.length;
            const nextBatch = Math.min(50, diff);
            const nextLimit = currentLimit + 50;
            const safeFilter = filter.replace(/'/g, "\\'");
            
            html += `<button class="btn" style="width:100%; margin-top:8px; justify-content:center; border-style:dashed;" onclick="AdvancedTable.renderRelationOptions('${safeFilter}', ${nextLimit})">${I18n.t('adv_actions.show_more_values', { nextBatch, diff })}</button>`;
        }

        listEl.innerHTML = html;
    },

    checkCircularRelation: (sourceTableId, sourceRowId, targetTableId, targetRowId, colId = null, visited = new Set()) => {
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
        let { realTableId, tableId, rowId, colId, currentVals, targetDbId, targetColId, isBacklink, isSingleRecord } = AdvancedTable._pendingRelSelect;

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
            
            if (isSingleRecord && !isBacklink) {
                currentVals = [targetRowId];
            } else {
                currentVals = [...currentVals, targetRowId];
            }

            // AUTO-EXPAND WBS: Se siamo in vista ad albero WBS ed abbiamo appena collegato un figlio/genitore,
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