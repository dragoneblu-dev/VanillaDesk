/**
 * AdvancedTableActions.js
 * Modifiche strutturali complesse, Drag&Drop, Resize, Modali e Controlli Relazioni / Rollup.
 * Esecuzione macro con LogicEngine centralizzato.
 * Ottimizzazione rendering relazioni e paginazione incrementale.
 * Mappatura ID garantita per la generazione dei Prompt AI.
 * Integrazione selettore per colonna 'note_link' (Collegamento a Nota).
 * FIX MODAL READONLY: openLongTextModal mostra sola lettura senza tasto Salva per campi calcolati (Rollup/Formula).
 * FIX SELEZIONE RELAZIONI: Clonazione difensiva degli array in openRelationSelector e toggleRelationValue
 * per impedire mutazioni in-place che bloccavano il re-render automatico della vista WBS / Albero.
 * FEAT WBS AUTO-EXPAND: L'aggiunta di un figlio o genitore espande automaticamente il ramo nell'albero WBS.
 * FIX CHECK CIRCULAR MULTI-RELATION: checkCircularRelation riceve colId e circoscrive la ricerca di cicli
 * esclusivamente alla catena semantica del campo in modifica, consentendo relazioni multiple distinte sullo stesso DB.
 */

Object.assign(AdvancedTable, {

    _relSearchTimer: null,

    onTableDragStart: (e, tableId) => {
        if (!AppState.isEditMode) return;
        AppState.draggedBlockId = tableId;
        AppState.draggedBlockType = 'table';
        e.dataTransfer.effectAllowed = 'move';
        
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll();

        const wrapper = document.getElementById(tableId);
        if (wrapper) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNode(wrapper);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    },

    onTableDragEnd: (e) => {
        AppState.draggedBlockId = null;
        AppState.draggedBlockType = null;
        document.querySelectorAll('.node-content').forEach(el => el.classList.remove('drag-middle', 'drag-top', 'drag-bottom'));
        const tc = document.getElementById('treeContainer');
        if (tc) tc.classList.remove('drag-over-root');
    },

    updateTitle: (tableId, newTitle) => {
        if (!AppState.databases) return;
        let state = AppState.databases[tableId];
        if (!state) return;
        
        let oldTitle = state.title;
        let cleanTitle = newTitle.trim() || I18n.t('editor.untitled');

        let allNames = [];
        Object.keys(AppState.databases).forEach(id => {
            if (id !== tableId && AppState.databases[id].title) {
                allNames.push(AppState.databases[id].title);
            }
        });

        let finalTitle = cleanTitle;
        let counter = 1;
        while (allNames.includes(finalTitle)) {
            finalTitle = `${cleanTitle} (${counter})`;
            counter++;
        }

        state.title = finalTitle;
        AdvancedTable.setState(tableId, state);

        if (oldTitle && oldTitle !== finalTitle && !state.isLinkedView && !state.isPivot) {
            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex1 = new RegExp(`tabella\\[['"]${escapeRegExp(oldTitle)}['"]\\]`, 'g');
            const replace1 = `tabella["${finalTitle.replace(/"/g, '\\"')}"]`;

            Object.keys(AppState.databases).forEach(id => {
                let s = AppState.databases[id];
                let sChanged = false;
                
                if (s && Array.isArray(s.columns)) {
                    s.columns.forEach(c => {
                        if (c.type === 'formula' && c.formula && c.formula.match(regex1)) {
                            c.formula = c.formula.replace(regex1, replace1);
                            sChanged = true;
                        }
                    });
                }
                if (sChanged) {
                    AdvancedTable.setState(id, s);
                }
            });
        }

        const titleEl = document.querySelector(`#${tableId} .adv-table-title`);
        if (titleEl && titleEl.innerText !== finalTitle) titleEl.innerText = finalTitle;

        Store.triggerAutoSave();
    },

    onColDragStart: (e, tableId, colId) => {
        e.stopPropagation();
        
        AdvancedTable.draggedColId = colId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'col_drag_' + colId);
        
        setTimeout(() => { e.target.style.opacity = '0.5'; }, 0);
    },

    onColDragEnter: (e) => {
        if (!AdvancedTable.draggedColId) return;
        e.preventDefault(); 
    },

    onColDragOver: (e) => {
        if (!AdvancedTable.draggedColId) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        
        const target = e.target.closest('th');
        if (target && target.getAttribute('data-col') !== AdvancedTable.draggedColId) {
            target.style.borderLeft = '3px solid var(--accent-color)';
        }
    },

    onColDragLeave: (e) => {
        if (!AdvancedTable.draggedColId) return;
        e.stopPropagation();
        const target = e.target.closest('th');
        if (target) target.style.borderLeft = '';
    },

    onColDrop: (e, tableId, targetColId) => {
        e.preventDefault();
        e.stopPropagation();
        
        const sourceColId = AdvancedTable.draggedColId;
        AdvancedTable.draggedColId = null;

        document.querySelectorAll('th').forEach(th => {
            th.style.opacity = '1';
            th.style.borderLeft = '';
        });

        if (!sourceColId || sourceColId === targetColId) return;

        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);

        const srcIdx = state.columns.findIndex(c => c.id === sourceColId);
        const tgtIdx = state.columns.findIndex(c => c.id === targetColId);

        if (srcIdx > -1 && tgtIdx > -1) {
            const [col] = state.columns.splice(srcIdx, 1);
            let insertIdx = tgtIdx;
            if (srcIdx < tgtIdx) insertIdx = tgtIdx - 1;
            
            state.columns.splice(insertIdx, 0, col);
            
            AdvancedTable.setState(realTableId, state);
            AdvancedTable.updateDependentViews(realTableId);
            Store.triggerAutoSave();
        }
    },

    startResize: (e, tableId, colId) => {
        e.preventDefault(); e.stopPropagation();
        let state = AdvancedTable.getState(tableId);
        
        if (!state.freeWidth) {
            state.freeWidth = true;
            const tableEl = document.querySelector(`#${tableId} .adv-table`);
            if (tableEl) tableEl.classList.remove('adv-table-full-width');
        }

        AdvancedTable.resizingCol = { tableId, colId, state };
        AdvancedTable.startX = e.pageX;

        const thEl = document.querySelector(`#adv-th-${tableId}-${colId}`);
        if (thEl) {
            AdvancedTable.startWidth = thEl.getBoundingClientRect().width;
        } else {
            const col = state.columns.find(c => c.id === colId);
            AdvancedTable.startWidth = col.width || 150; 
        }

        e.target.classList.add('resizing');
    },

    handleGlobalMouseMove: (e) => {
        if (!AdvancedTable.resizingCol) return;
        
        e.preventDefault(); 
        
        const diff = e.pageX - AdvancedTable.startX;
        let newWidth = AdvancedTable.startWidth + diff;
        if (newWidth < 50) newWidth = 50;

        const tableId = AdvancedTable.resizingCol.tableId;
        const colId = AdvancedTable.resizingCol.colId;
        const th = document.querySelector(`#${tableId} th[data-col="${colId}"]`);

        if (th) {
            th.style.width = newWidth + 'px';
            th.style.maxWidth = newWidth + 'px'; 
            
            const colIndex = Array.from(th.parentNode.children).indexOf(th);
            const table = th.closest('table');

            if (table) {
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(tr => {
                    const td = tr.children[colIndex];
                    if (td) {
                        td.style.width = newWidth + 'px';
                        td.style.maxWidth = newWidth + 'px';
                    }
                });
            }
        }
    },

    handleGlobalMouseUp: (e) => {
        if (!AdvancedTable.resizingCol) return;
        const { tableId, colId, state } = AdvancedTable.resizingCol;
        
        const diff = e.pageX - AdvancedTable.startX;
        let newWidth = AdvancedTable.startWidth + diff;
        if (newWidth < 50) newWidth = 50;

        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let realState = AdvancedTable.getState(realTableId);

        const colToUpdate = realState.columns.find(c => c.id === colId);
        if (colToUpdate) colToUpdate.width = newWidth;
        AdvancedTable.setState(realTableId, realState);

        if (state.isLinkedView) {
            AdvancedTable.setState(tableId, state);
        }

        document.querySelectorAll('.adv-col-resizer').forEach(el => el.classList.remove('resizing'));
        AdvancedTable.resizingCol = null;
        
        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();
    },

    autoFitColumn: (e, tableId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);
        if (!col) return;

        let maxWidth = 80; 
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Misura l'intestazione della colonna
        ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'; 
        maxWidth = Math.max(maxWidth, ctx.measureText(col.name).width + 60);

        // Misura il contenuto di tutte le celle
        ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const renderCache = {};
        
        state.rows.forEach(r => {
            let vRow = AdvancedTable.buildVirtualRow(realTableId, r, state, renderCache);
            let val = vRow.virtualCells[colId];
            
            // Usa il formatter centrale per avere il testo esatto che l'utente vede a schermo
            let strVal = AdvancedTable.getFormatDisplayValue(col, val);
            
            if (strVal !== undefined && strVal !== null && strVal !== '') {
                if (strVal.includes('\n')) {
                    const lines = strVal.split('\n');
                    lines.forEach(l => {
                        let w = ctx.measureText(l).width + 30;
                        if (w > maxWidth) maxWidth = w;
                    });
                } else {
                    let w = ctx.measureText(strVal).width + 30; 
                    
                    if (col.type === 'select' || col.type === 'multi-select' || col.type === 'relation' || col.type === 'relation_backlink') w += 20; 
                    if (col.type === 'record_note' || col.type === 'note_link') w += 25; 
                    
                    if (w > maxWidth) maxWidth = w;
                }
            }
        });

        if (maxWidth > 600) maxWidth = 600;

        col.width = Math.round(maxWidth);
        
        if (!state.freeWidth) state.freeWidth = true;

        AdvancedTable.setState(realTableId, state);
        
        if (tableId !== realTableId) {
            let localState = AdvancedTable.getState(tableId);
            localState.freeWidth = true;
            AdvancedTable.setState(tableId, localState);
        }

        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();
    },

    toggleFreeWidth: (tableId) => {
        let state = AdvancedTable.getState(tableId);
        state.freeWidth = !state.freeWidth;
        AdvancedTable.setState(tableId, state);

        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
        AdvancedTable.closeDropdowns(true);
    },

    moveTableToNote: (tableId, targetNoteId) => {
        if (typeof AppState === 'undefined') return;
        if (AppState.currentNoteId === targetNoteId) {
            alert(I18n.t('adv_actions.table_already_in_note'));
            return;
        }

        const wrapper = document.getElementById(tableId);
        if (!wrapper) return;

        const targetNote = Store.getNote(targetNoteId);
        if (!targetNote) return;

        const tableHTML = wrapper.outerHTML;

        targetNote.content = (targetNote.content || '') + '<p><br></p>' + tableHTML + '<p><br></p>';
        targetNote.updatedAt = new Date().toISOString();

        wrapper.remove();

        if (typeof Editor !== 'undefined') {
            Editor.saveSnapshot();
            Editor.sanitizeContent();
        }

        Store.triggerAutoSave();
        AdvancedTable.closeDropdowns(true);

        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(I18n.t('adv_actions.table_moved_success', { noteTitle: targetNote.title }), 'success');
        }
    },

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
            Object.keys(AppState.databases).forEach(tId => {
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
        }

        col.type = 'relation';
        col.targetTableId = tId;
        col.targetColId = cTargetId;

        if (hasTargetChanged) {
            state.rows.forEach(r => r.cells[colId] = []);
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
        const relationCols = state.columns.filter(c => c.type === 'relation' && c.targetTableId);

        let relOptionsHTML = `<option value="">${I18n.t('adv_actions.select_rel_col_placeholder')}</option>`;
        relationCols.forEach(c => {
            relOptionsHTML += `<option value="${c.id}">${c.name}</option>`;
        });

        if (relationCols.length === 0) {
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
        const relColId = document.getElementById('rollupConfigRel').value;
        const tgtSelect = document.getElementById('rollupConfigTarget');
        tgtSelect.innerHTML = `<option value="">${I18n.t('adv_actions.select_col_placeholder')}</option>`;

        if (!relColId) return;

        const { realTableId } = AdvancedTable._pendingRollupConfig;
        const state = AdvancedTable.getState(realTableId);
        const relCol = state.columns.find(c => c.id === relColId);

        if (!relCol || !relCol.targetTableId) return;

        const targetState = AdvancedTable.getTableState(relCol.targetTableId);
        if (targetState && targetState.columns) {
            targetState.columns.forEach(c => {
                tgtSelect.innerHTML += `<option value="${c.id}">${c.name} (${c.type})</option>`;
            });
        }
    },

    saveRollupConfig: () => {
        const relColId = document.getElementById('rollupConfigRel').value;
        const targetColId = document.getElementById('rollupConfigTarget').value;

        if (!relColId || !targetColId) {
            alert(I18n.t('adv_actions.alert_select_rel_and_col'));
            return;
        }

        const { realTableId, colId } = AdvancedTable._pendingRollupConfig;
        let state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);

        col.relationColId = relColId;
        col.targetColId = targetColId;

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

        // Il parametro currentLimit definisce lo scaglione di rendering inziale per proteggere la CPU
        AdvancedTable._pendingRelSelect = { 
            realTableId, tableId, rowId, colId, 
            targetState, targetDbId, targetColId, isBacklink: false,
            currentVals: currentVals,
            currentLimit: 50 
        };

        const bodyHTML = `
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 15px; padding: 10px; background: rgba(0,0,0,0.02); border-radius: 4px; border: 1px solid var(--border-color);">
                ${Icons.link} ${I18n.t('adv_actions.connected_to')} <b style="color:var(--accent-color); cursor:pointer;" onclick="UI.closeDrawer(); setTimeout(() => UI.jumpToWidget('${targetDbId}'), 150)" title="${I18n.t('adv_actions.go_to_source_db')}">${targetTabName}</b> ➔ ${I18n.t('adv_actions.field_label')} <b>${targetColName}</b>
            </div>
            <input type="text" id="relSelectSearch" class="modern-input" placeholder="${I18n.t('adv_actions.search_value_placeholder')}" oninput="AdvancedTable.filterRelationOptions(this.value)">
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

        const { targetState, currentVals, isBacklink, targetColId, targetDbId } = pending;
        const listEl = document.getElementById('relSelectList');
        if (!listEl) return;
        
        const displayColId = isBacklink ? targetState.columns[0].id : targetColId;
        const targetColDef = targetState.columns.find(c => c.id === displayColId);
        const lowerFilter = filter.toLowerCase();

        let itemsToRender = [];
        const renderCache = {};
        
        const isCalculatedCol = targetColDef && ['formula', 'rollup', 'relation_backlink'].includes(targetColDef.type);
        
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

            if (filter && !displayVal.toLowerCase().includes(lowerFilter)) {
                continue; 
            }

            matchCount++;
            totalCount++;

            itemsToRender.push({
                id: tRow.id,
                displayVal: displayVal,
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
            html += `
                <div class="link-modal-item ${item.isSelected ? 'active' : ''}" style="justify-content:space-between; border: 1px solid var(--border-color);" onclick="AdvancedTable.toggleRelationValue('${item.id}')">
                    <span>${UI.escapeHTML(item.displayVal)}</span>
                    <span style="color:var(--accent-color); font-weight:bold;">${item.isSelected ? '✓' : ''}</span>
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
        let isAdding = false;

        if (currentVals.includes(targetRowId)) {
            currentVals = currentVals.filter(id => id !== targetRowId);
        } else {
            isAdding = true;
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
    },

    openLongTextModal: (tableId, rowId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        const state = AdvancedTable.getState(realTableId);
        if (!state) return;
        
        const row = state.rows.find(r => r.id === rowId);
        const col = state.columns.find(c => c.id === colId);
        if (!row || !col) return;

        const isComputed = ['formula', 'rollup', 'relation_backlink', 'created_time', 'last_edited_time'].includes(col.type);

        let val = '';
        if (isComputed) {
            const vRow = AdvancedTable.buildVirtualRow(realTableId, row, state);
            val = AdvancedTable.getFormatDisplayValue(col, vRow.virtualCells[colId]);
        } else {
            val = row.cells[colId] || '';
        }

        const readonlyAttr = (!AppState.isEditMode || isComputed) ? 'readonly' : '';
        const modalTitle = isComputed ? I18n.t('adv_actions.view_text_title', { colName: col.name }) : I18n.t('adv_actions.edit_text_title', { colName: col.name });

        const bodyHTML = `
            <textarea id="advLongTextInput" class="modern-input" ${readonlyAttr} style="width:100%; height:100%; min-height: 300px; resize:vertical; font-family:inherit; font-size:0.95rem; line-height:1.5; padding:10px; ${isComputed ? 'cursor:default;' : ''}">${UI.escapeHTML(String(val))}</textarea>
        `;
        
        const footerHTML = (isComputed || !AppState.isEditMode) ? `
            <button class="btn btn-primary" onclick="UI.closeDrawer()">${I18n.t('common.close')}</button>
        ` : `
            <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.cancel')}</button>
            <button class="btn btn-primary" onclick="AdvancedTable.saveLongText('${tableId}', '${rowId}', '${colId}')">${I18n.t('adv_actions.save_text')}</button>
        `;

        if (typeof UI !== 'undefined') {
            UI.openDrawer(`${Icons.recordView} ${modalTitle}`, bodyHTML, footerHTML);
        }
        
        setTimeout(() => {
            const input = document.getElementById('advLongTextInput');
            if (input && !isComputed) input.focus();
        }, 50);
    },

    saveLongText: (tableId, rowId, colId) => {
        const input = document.getElementById('advLongTextInput');
        if (input) {
            AdvancedTable.updateData(tableId, rowId, colId, input.value);
            if (typeof UI !== 'undefined') UI.closeDrawer();
        }
    },

    openRecordNote: (tableId, rowId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);
        if (!state) return;
        
        const row = state.rows.find(r => r.id === rowId);
        if (!row) return;

        let noteId = row.cells[colId];
        let newlyCreated = false;

        if (!noteId || !Store.getNote(noteId) || Store.getNote(noteId).deletedAt) {
            noteId = Store.generateId();
            const now = new Date().toISOString();
            
            const newNote = {
                id: noteId,
                parentId: AppState.currentNoteId, 
                title: "", 
                content: `<p><br></p>`,
                isMarked: false,
                expanded: true,
                createdAt: now,
                updatedAt: now,
                isRecordNote: true, 
                linkedTableId: realTableId,
                linkedRowId: rowId
            };
            
            AppState.notes.push(newNote);
            row.cells[colId] = noteId;
            AdvancedTable.setState(realTableId, state);
            Store.triggerAutoSave();
            newlyCreated = true;
        }

        if (typeof UI !== 'undefined' && UI.selectNote) {
            UI.selectNote(noteId);
        }

        if (newlyCreated || !Store.getNote(noteId).title) {
            if (typeof UI !== 'undefined' && UI.toggleEditMode) UI.toggleEditMode(true);
            setTimeout(() => {
                const titleInput = document.getElementById('noteTitle');
                if (titleInput) titleInput.focus();
            }, 100);
        }
    },
    
    deleteTable: (tableId, force = false) => {
        // GESTIONE CITAZIONE (Transclusion): Se l'elemento rimosso è una citazione di un database,
        // rimuove solo il contenitore visivo senza distruggere lo stato del database originale né le sue pagine record!
        const isCitation = tableId.includes('_cited_') || (document.getElementById(tableId) && document.getElementById(tableId).closest('.block-citation'));
        if (isCitation) {
            if (!force && !confirm(I18n.t('adv_actions.confirm_remove_cited_db'))) return;
            const wrapper = document.getElementById(tableId);
            if (wrapper) wrapper.remove();
            AdvancedTable.closeDropdowns(true);
            if (typeof Editor !== 'undefined') Editor.sanitizeContent();
            if (typeof Store !== 'undefined') Store.triggerAutoSave();
            return;
        }

        let state = AdvancedTable.getState(tableId);
        
        // --- SYSTEM DB PROTECTION: Soft Delete (Delete DOM, Keep Data) ---
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        if (realTableId === 'SYS_PROPERTIES_DB') {
            const wrapper = document.getElementById(tableId);
            if (wrapper) wrapper.remove();
            
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast(I18n.t('adv_actions.sys_db_soft_delete_toast'), "info");
            }
            AdvancedTable.closeDropdowns(true);
            return;
        }

        let msg = I18n.t('adv_actions.confirm_delete_db');
        if (state.isPivot) msg = I18n.t('adv_menus.remove_pivot');
        else if (state.isLinkedView) msg = I18n.t('adv_actions.confirm_remove_linked_view');

        if (typeof AppState !== 'undefined' && !state.isPivot && !state.isLinkedView) {
            let isTargetOfRelation = false;
            let pointingTableName = "";

            if (AppState.databases) {
                Object.keys(AppState.databases).forEach(id => {
                    const s = AppState.databases[id];
                    // Controllo rigoroso Array.isArray(s.columns)
                    if (id === tableId || !s || !Array.isArray(s.columns)) return;
                    
                    s.columns.forEach(c => {
                        if ((c.type === 'relation' || c.type === 'relation_backlink') && (c.targetTableId === tableId || c.linkedTableId === tableId)) {
                            isTargetOfRelation = true;
                            pointingTableName = s.title;
                        }
                    });
                });
            }

            if (isTargetOfRelation) {
                alert(I18n.t('adv_actions.cannot_delete_target_of_relation', { tableName: pointingTableName }));
                AdvancedTable.closeDropdowns(true);
                return;
            }
        }

        if (!force && !confirm(msg)) return;

        // Controllo rigoroso Array.isArray(state.columns)
        if (!state.isLinkedView && !state.isPivot && Array.isArray(state.columns)) {
            state.columns.filter(c => c.type === 'record_note').forEach(c => {
                state.rows.forEach(r => {
                    const noteId = r.cells[c.id];
                    if (noteId && typeof UI !== 'undefined') UI.Trash.forceHardDeleteRecursive(noteId);
                });
            });
        }

        const wrapper = document.getElementById(tableId);
        if (wrapper) wrapper.remove();

        if (AppState.databases && AppState.databases[tableId]) {
            delete AppState.databases[tableId];
        }

        if (!state.isLinkedView && !state.isPivot) {
            AdvancedTable.updateDependentViews(tableId);
        }

        AdvancedTable.closeDropdowns(true);
        if (typeof Editor !== 'undefined') Editor.sanitizeContent();
        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    },

    // ESECUZIONE PULSANTE DI COLONNA E UI RELATIVA
    runCellMacro: async (tableId, rowId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        const state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);
        const sourceRow = state.rows.find(r => r.id === rowId);

        if (!col || !sourceRow) return;

        if (!col.actionBlocks || col.actionBlocks.length === 0) {
            if (typeof UI !== 'undefined') UI.showToast(I18n.t('adv_actions.btn_no_actions_configured'), "warning");
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
    },

    // =========================================================================
    // GESTORI COLLEGAMENTO A NOTA (note_link)
    // =========================================================================
    openNoteLinkSelector: (e, tableId, rowId, colId) => {
        if (e) e.stopPropagation();
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        const state = AdvancedTable.getState(realTableId);
        const row = state.rows.find(r => r.id === rowId);
        const currentVal = row ? row.cells[colId] : null;

        let targetNoteId = null;
        let targetRefId = null;

        if (currentVal && typeof currentVal === 'object') {
            targetNoteId = currentVal.noteId;
            targetRefId = currentVal.refId;
        } else if (typeof currentVal === 'string' && currentVal) {
            targetNoteId = currentVal;
        }

        UI.DocumentBrowser.open('link', `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.link} ${I18n.t('adv_col_menu.type_note_link')}</span>`, (item) => {
            const anchor = (item.refType === 'chapter') ? item.title : null;
            let displayTitle = item.noteTitle || item.title;
            if (item.refType !== 'note' && item.refType !== 'chapter') {
                displayTitle = item.title;
            }

            const linkData = {
                noteId: item.noteId,
                title: displayTitle,
                anchor: anchor,
                refId: item.refId
            };

            AdvancedTable.updateData(tableId, rowId, colId, linkData);
            UI.closeDrawer();
        }, { noteId: targetNoteId, refId: targetRefId });
    },

    clearNoteLink: (e, tableId, rowId, colId) => {
        if (e) e.stopPropagation();
        AdvancedTable.updateData(tableId, rowId, colId, null);
    }
});