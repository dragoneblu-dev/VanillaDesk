/**
 * js/AdvancedTable/advanced-table-column-menus.js
 * Menu Contestuali per la singola Colonna: Cambio Tipo, Rinomina, Sposta, Elimina.
 * Configurazione esplicita per relazioni con popup di alert per la prevenzione perdita dati.
 * Gestione dinamica della visibilità del campo (compatibile con griglia e Drawer).
 * Pulizia a cascata dello stato (sort, filtri, viste e formattazione condizionale) su eliminazione colonna.
 * Integrazione del tipo 'note_link' (Collegamento a Nota).
 * PROTEZIONE ROLLUP BIDIREZIONALE: Verifica che nessuna tabella dello spazio di lavoro possieda
 * rollup o relazioni (uscenti o entranti) puntate a questa colonna prima di consentirne la cancellazione.
 * FIX CONVERSIONE RELAZIONE/ROLLUP: Richiesta di conferma preventiva su perdita dati prima dell'apertura
 * dei drawer di configurazione per evitare che le colonne rimangano in stato ibrido.
 * FEAT SMART DATE PARSER: Conversione robusta da Testo a Data con rilevamento range (start/end),
 * decodifica entità HTML (-&gt; ➔ ->), supporto separatori multipli, riconoscimento anno a 4 cifre (ISO vs EU/US),
 * disambiguazione matematica giorno/mese (>12), risoluzione ambiguità basata sulla lingua (en vs it/es/de)
 * e composizione deterministica indipendente dal fuso orario.
 * FIX DATE RANGE TO TEXT WITH ARROWS: Conversione coerente da range a testo con freccia direzionale esplicita
 * per entrambe le date (s ➔ e), solo inizio (s ➔) o solo fine (➔ e).
 * FIX RANGE SPLIT ISO DATE: Eliminata la falsa segmentazione delle date singole ISO (YYYY-MM-DD)
 * che provocava l'impostazione errata della data di fine al 1° Gennaio.
 * FEAT CASCADE FORMULA REFACTOR ON RENAME: Rinomina colonna sincronizza automaticamente tutte le formule
 * dello stesso database e di tabelle collegate esterne (sia per nome che per ID immutabile), prevenendo rotture.
 * FIX TYPEERROR S.COLUMNS.SOME: Verifica rigorosa con Array.isArray(s.columns) per isolare ed evitare
 * crash su widget non tabellari presenti in AppState.databases (diari, codice, bottoni).
 */

const AdvancedTableColumnMenus = {
    
    toggleEndDate: (tableId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);
        col.hasEndDate = !col.hasEndDate;

        AdvancedTable.setState(realTableId, state);
        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();
        AdvancedTable.closeDropdowns(true);
    },

    toggleRelationSingle: (tableId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);
        
        col.singleRecord = !col.singleRecord;

        if (col.singleRecord) {
            state.rows.forEach(r => {
                if (Array.isArray(r.cells[colId]) && r.cells[colId].length > 1) {
                    r.cells[colId] = [r.cells[colId][0]];
                }
            });
        }

        AdvancedTable.setState(realTableId, state);
        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();
        AdvancedTable.closeDropdowns(true);
    },

    toggleRelationBacklink: (tableId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);
        let col = state.columns.find(c => c.id === colId);
        
        if (!col || !col.targetTableId) return;

        let targetState = AdvancedTable.getTableState(col.targetTableId);
        if (!targetState) {
            alert(I18n.t('adv_col_menu.target_db_missing'));
            return;
        }

        col.showBacklink = !col.showBacklink;

        if (col.showBacklink) {
            const blColId = 'bl_' + realTableId + '_' + colId;
            col.backlinkColId = blColId; 
            targetState.columns.push({
                id: blColId,
                name: `Collegati da: ${state.title}`,
                type: 'relation_backlink',
                linkedTableId: realTableId,
                linkedColId: colId,
                backlinkDisplay: 'list', 
                backlinkDistinct: true,
                backlinkAggType: 'list',
                comment: `Colonna generata automaticamente.\nMostra i record del database "${state.title}" che puntano a questa riga.`,
                width: 150
            });
        } else {
            if (col.backlinkColId) {
                targetState.columns = targetState.columns.filter(c => c.id !== col.backlinkColId);
                delete col.backlinkColId;
            }
        }

        AdvancedTable.setState(realTableId, state);
        AdvancedTable.setState(col.targetTableId, targetState);
        
        AdvancedTable.updateDependentViews(realTableId);
        AdvancedTable.updateDependentViews(col.targetTableId);
        Store.triggerAutoSave();
        AdvancedTable.closeDropdowns(true);
    },

    setBacklinkDisplay: (tableId, colId, displayType) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);
        let col = state.columns.find(c => c.id === colId);
        
        if (!col || col.type !== 'relation_backlink') return;

        col.backlinkDisplay = displayType;
        if (displayType !== 'property') delete col.backlinkPropertyId;

        AdvancedTable.setState(realTableId, state);
        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();
        AdvancedTable.closeDropdowns(true);
    },

    openBacklinkPropertyConfig: (tableId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        AdvancedTable.closeDropdowns(true);
        
        let state = AdvancedTable.getState(realTableId);
        let col = state.columns.find(c => c.id === colId);

        const sourceState = AdvancedTable.getTableState(col.linkedTableId);
        if (!sourceState) return;

        let optionsHTML = `<option value="">${I18n.t('adv_col_menu.backlink_select_prop')}</option>`;
        sourceState.columns.forEach(c => {
            optionsHTML += `<option value="${c.id}" data-type="${c.type}" ${col.backlinkPropertyId === c.id ? 'selected' : ''}>${c.name} (${c.type})</option>`;
        });

        const isChecked = col.backlinkDistinct !== false ? 'checked' : '';
        const aggType = col.backlinkAggType || 'list';

        const bodyHTML = `
            <div style="background: rgba(37, 99, 235, 0.05); padding: 10px; border-radius: 6px; margin-bottom: 15px; font-size: 0.8rem; border: 1px solid rgba(37, 99, 235, 0.2);">
                ${I18n.t('adv_col_menu.backlink_drawer_desc')}
            </div>
            
            <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold; display:block; margin-bottom:5px;">${I18n.t('adv_col_menu.backlink_choose_col', { tableTitle: sourceState.title })}</label>
            <select id="blPropConfigSelect" class="modern-input" style="margin-bottom: 15px;" onchange="
                const t = this.options[this.selectedIndex].getAttribute('data-type'); 
                const op = document.getElementById('blPropConfigOp');
                if (op) {
                    const isNum = ['number', 'formula', 'rollup'].includes(t);
                    op.querySelector('option[value=\\'sum\\']').style.display = isNum ? 'block' : 'none';
                    if (!isNum && op.value === 'sum') op.value = 'list';
                }
            ">
                ${optionsHTML}
            </select>

            <label style="display:flex; align-items:center; gap:8px; font-size:0.8rem; cursor:pointer; color:var(--text-primary); margin-bottom:15px; padding: 10px; border: 1px solid var(--border-color); border-radius:6px; background: var(--item-hover);">
                <input type="checkbox" id="blPropConfigDistinct" style="transform:scale(1.1);" ${isChecked}>
                ${I18n.t('adv_col_menu.backlink_distinct')}
            </label>

            <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold; display:block; margin-bottom:5px;">${I18n.t('adv_col_menu.backlink_operation_label')}</label>
            <select id="blPropConfigOp" class="modern-input" style="margin-bottom: 20px;">
                <option value="list" ${aggType === 'list' ? 'selected' : ''}>${I18n.t('adv_col_menu.backlink_op_list')}</option>
                <option value="count" ${aggType === 'count' ? 'selected' : ''}>${I18n.t('adv_col_menu.backlink_op_count')}</option>
                <option value="sum" ${aggType === 'sum' ? 'selected' : ''} style="display:none;">${I18n.t('adv_col_menu.backlink_op_sum')}</option>
            </select>
        `;

        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.cancel')}</button>
            <button class="btn btn-primary" onclick="AdvancedTableColumnMenus.saveBacklinkProperty('${realTableId}', '${colId}')">${I18n.t('common.save')}</button>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.relation} ${I18n.t('adv_col_menu.backlink_drawer_title')}</span>`, bodyHTML, footerHTML);

        setTimeout(() => {
            const sel = document.getElementById('blPropConfigSelect');
            if (sel) sel.onchange();
        }, 50);
    },

    saveBacklinkProperty: (realTableId, colId) => {
        const propId = document.getElementById('blPropConfigSelect').value;
        const isDistinct = document.getElementById('blPropConfigDistinct').checked;
        const aggType = document.getElementById('blPropConfigOp').value;

        if (!propId) { alert(I18n.t('adv_col_menu.backlink_alert_select')); return; }

        let state = AdvancedTable.getState(realTableId);
        let col = state.columns.find(c => c.id === colId);

        col.backlinkDisplay = 'property';
        col.backlinkPropertyId = propId;
        col.backlinkDistinct = isDistinct;
        col.backlinkAggType = aggType;

        AdvancedTable.setState(realTableId, state);
        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();
        UI.closeDrawer();
    },

    setColDecimals: (tableId, colId, decimals) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);
        
        col.decimals = decimals;

        AdvancedTable.setState(realTableId, state);
        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();
        AdvancedTable.closeDropdowns(true);
    },

    reconfigureRelation: (tableId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        const state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);

        if (!col) return;

        let hasData = state.rows.some(r => {
            const val = r.cells[colId];
            return Array.isArray(val) ? val.length > 0 : !!val;
        });

        if (hasData) {
            if (!confirm(I18n.t('adv_col_menu.warn_relation_change'))) {
                AdvancedTable.closeDropdowns(true);
                return;
            }
        }
        
        AdvancedTable.openRelationConfig(realTableId, colId);
    },

    toggleVisibility: (tableId, colId) => {
        let state = AdvancedTable.getState(tableId);

        let viewId = 'table';
        if (state.viewType === 'board') viewId = 'board_' + state.boardGroupBy;
        else if (state.viewType === 'calendar') viewId = 'calendar_' + state.calendarDateCol;
        else if (state.viewType === 'timeline') viewId = 'timeline_' + state.timelineDateCol;

        if (!state.viewConfig) state.viewConfig = {};
        if (!state.viewConfig[viewId]) {
            state.viewConfig[viewId] = { hiddenCols: state.columns.filter(c => c.hidden).map(c => c.id) };
        }

        const hiddenList = state.viewConfig[viewId].hiddenCols;
        const idx = hiddenList.indexOf(colId);

        if (idx > -1) {
            hiddenList.splice(idx, 1);
        } else {
            if (state.columns.length - hiddenList.length <= 1) {
                alert(I18n.t('adv_col_menu.alert_min_visible'));
                return;
            }
            hiddenList.push(colId);
        }

        state.columns.forEach(c => delete c.hidden);

        AdvancedTable.setState(tableId, state);

        const drawer = document.getElementById('advGlobalDrawer');
        if (drawer && drawer.classList.contains('open') && AdvancedTable.activeRecordId) {
            AdvancedTable.openRecordView(tableId, AdvancedTable.activeRecordId);
        } else {
            const realTableId = AdvancedTable._resolveSourceId(tableId);
            AdvancedTable.updateDependentViews(realTableId);
            UI.Menu.closeAll(true);
        }
        
        Store.triggerAutoSave();
    },

    openAddColumnMenu: (e, tableId) => {
        if (e) e.stopPropagation();
        UI.Menu.closeAll(true);

        const menuItems =[
            { type: 'custom', html: `<div style="font-size:11px; font-weight:bold; color:var(--text-secondary); text-transform:uppercase; padding:4px;">${I18n.t('adv_col_menu.add_col_title')}</div>` },
            { icon: Icons.text, label: I18n.t('adv_col_menu.type_text'), onClick: () => AdvancedTable.addColumn(tableId, 'text') },
            { icon: Icons.number, label: I18n.t('adv_col_menu.type_number'), onClick: () => AdvancedTable.addColumn(tableId, 'number') },
            { icon: Icons.select, label: I18n.t('adv_col_menu.type_select'), onClick: () => AdvancedTable.addColumn(tableId, 'select') },
            { icon: Icons.multiSelect, label: I18n.t('adv_col_menu.type_multi_select'), onClick: () => AdvancedTable.addColumn(tableId, 'multi-select') },
            { icon: Icons.date, label: I18n.t('adv_col_menu.type_date'), onClick: () => AdvancedTable.addColumn(tableId, 'date') },
            { icon: Icons.date, label: I18n.t('adv_col_menu.type_datetime'), onClick: () => AdvancedTable.addColumn(tableId, 'datetime') },
            { icon: Icons.time, label: I18n.t('adv_col_menu.type_time'), onClick: () => AdvancedTable.addColumn(tableId, 'time') },
            { icon: Icons.checkbox, label: I18n.t('adv_col_menu.type_checkbox'), onClick: () => AdvancedTable.addColumn(tableId, 'checkbox') },
            { icon: Icons.formula, label: I18n.t('adv_col_menu.type_formula'), onClick: () => AdvancedTable.addColumn(tableId, 'formula') },
            { icon: Icons.relation, label: I18n.t('adv_col_menu.type_relation'), onClick: () => AdvancedTable.addColumn(tableId, 'relation') },
            { icon: Icons.rollup, label: I18n.t('adv_col_menu.type_rollup'), onClick: () => AdvancedTable.addColumn(tableId, 'rollup') },
            { icon: Icons.url, label: I18n.t('adv_col_menu.type_url'), onClick: () => AdvancedTable.addColumn(tableId, 'url') },
            { icon: Icons.link, label: I18n.t('adv_col_menu.type_note_link'), onClick: () => AdvancedTable.addColumn(tableId, 'note_link') },
            { icon: Icons.recordPage, label: I18n.t('adv_col_menu.type_record_note'), onClick: () => AdvancedTable.addColumn(tableId, 'record_note') },
            { icon: Icons.play, label: I18n.t('adv_col_menu.type_button'), onClick: () => AdvancedTable.addColumn(tableId, 'button') },
            { type: 'divider' },
            { icon: Icons.time, label: I18n.t('adv_col_menu.type_created_time'), onClick: () => AdvancedTable.addColumn(tableId, 'created_time') },
            { icon: Icons.time, label: I18n.t('adv_col_menu.type_last_edited_time'), onClick: () => AdvancedTable.addColumn(tableId, 'last_edited_time') }
        ];

        const anchorId = e && e.currentTarget && e.currentTarget.id ? e.currentTarget.id : `adv-th-add-${tableId}`;
        UI.Menu.buildContextMenu(anchorId, menuItems);
    },

    openColMenu: (e, tableId, colId) => {
        if (e) e.stopPropagation();
        if (e && e.target && e.target.classList.contains('adv-col-resizer')) return;

        const realTableId = AdvancedTable._resolveSourceId(tableId);
        const state = AdvancedTable.getState(realTableId);
        
        // Uso stateForView per recuperare i parametri di visualizzazione della vista corrente
        const stateForView = AdvancedTable.getState(tableId);
        
        const colIndex = state.columns.findIndex(c => c.id === colId);
        const col = state.columns[colIndex];

        const safeName = col.name.replace(/"/g, '&quot;');

        let viewId = 'table';
        if (stateForView.viewType === 'board') viewId = 'board_' + stateForView.boardGroupBy;
        else if (stateForView.viewType === 'calendar') viewId = 'calendar_' + stateForView.calendarDateCol;
        else if (stateForView.viewType === 'timeline') viewId = 'timeline_' + stateForView.timelineDateCol;

        const hiddenList = stateForView.viewConfig && stateForView.viewConfig[viewId] ? stateForView.viewConfig[viewId].hiddenCols : [];
        const isHidden = col.hidden || hiddenList.includes(colId);
        const visibleColsCount = stateForView.columns.length - hiddenList.length;
        const canHide = isHidden || visibleColsCount > 1;

        const chk = ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>';

        const menuItems =[
            {
                type: 'custom',
                html: `
                    <div style="padding: 2px;">
                        <input type="text" class="adv-menu-input" value="${safeName}" placeholder="${I18n.t('adv_col_menu.rename_placeholder')}" id="editColNameInput" onkeydown="event.stopPropagation(); if(event.key === 'Enter') { event.preventDefault(); AdvancedTableColumnMenus.changeColName('${realTableId}', '${colId}'); }" style="margin:0; width:100%; font-weight:bold;">
                    </div>
                `
            },
            { type: 'divider' },
            {
                icon: Icons.noteInline,
                label: col.comment ? I18n.t('adv_col_menu.comment_edit') : I18n.t('adv_col_menu.comment_add'),
                onClick: () => AdvancedTableColumnMenus.openColumnCommentModal(realTableId, colId)
            },
            {
                icon: Icons.eyeOff,
                label: I18n.t('adv_col_menu.hidden_field') + (isHidden ? chk : ''),
                disabled: !canHide,
                onClick: () => AdvancedTableColumnMenus.toggleVisibility(tableId, colId)
            },
            { type: 'divider' }
        ];

        if (col.type === 'date' || col.type === 'datetime') {
            menuItems.push({ icon: Icons.time, label: I18n.t('adv_col_menu.end_date') + (col.hasEndDate ? chk : ''), onClick: () => AdvancedTableColumnMenus.toggleEndDate(realTableId, colId) });
            menuItems.push({ type: 'divider' });
        }

        if (col.type === 'relation') {
            menuItems.push({ icon: Icons.relation, label: I18n.t('adv_col_menu.configure_relation'), onClick: () => AdvancedTableColumnMenus.reconfigureRelation(realTableId, colId) });
            menuItems.push({ icon: Icons.checkSquare, label: I18n.t('adv_col_menu.single_record_limit') + (col.singleRecord ? chk : ''), onClick: () => AdvancedTableColumnMenus.toggleRelationSingle(realTableId, colId) });
            menuItems.push({ icon: Icons.relation, label: I18n.t('adv_col_menu.show_backlink_in_target') + (col.showBacklink ? chk : ''), onClick: () => AdvancedTableColumnMenus.toggleRelationBacklink(realTableId, colId) });
            menuItems.push({ type: 'divider' });
        }

        if (col.type === 'relation_backlink') {
            menuItems.push({
                icon: Icons.eye, label: I18n.t('adv_col_menu.display_as'), type: 'submenu',
                items: [
                    { label: I18n.t('adv_col_menu.records_list') + (col.backlinkDisplay === 'list' || !col.backlinkDisplay ? chk : ''), onClick: () => AdvancedTableColumnMenus.setBacklinkDisplay(realTableId, colId, 'list') },
                    { label: I18n.t('adv_col_menu.numeric_count') + (col.backlinkDisplay === 'count' ? chk : ''), onClick: () => AdvancedTableColumnMenus.setBacklinkDisplay(realTableId, colId, 'count') },
                    { type: 'divider' },
                    { label: I18n.t('adv_col_menu.specific_property') + (col.backlinkDisplay === 'property' ? chk : ''), onClick: () => AdvancedTableColumnMenus.openBacklinkPropertyConfig(realTableId, colId) }
                ]
            });
            menuItems.push({ type: 'divider' });
        }

        if (col.type === 'number' || col.type === 'rollup') {
            const dec = col.decimals !== undefined ? col.decimals : 'default';
            menuItems.push({
                icon: Icons.number, label: I18n.t('adv_col_menu.decimal_format'), type: 'submenu',
                items: [
                    { label: I18n.t('adv_col_menu.decimal_default') + (dec === 'default' ? chk : ''), onClick: () => AdvancedTableColumnMenus.setColDecimals(realTableId, colId, 'default') },
                    { label: I18n.t('adv_col_menu.decimal_zero') + (dec === 0 ? chk : ''), onClick: () => AdvancedTableColumnMenus.setColDecimals(realTableId, colId, 0) },
                    { label: I18n.t('adv_col_menu.decimal_1') + (dec === 1 ? chk : ''), onClick: () => AdvancedTableColumnMenus.setColDecimals(realTableId, colId, 1) },
                    { label: I18n.t('adv_col_menu.decimal_2') + (dec === 2 ? chk : ''), onClick: () => AdvancedTableColumnMenus.setColDecimals(realTableId, colId, 2) },
                    { label: I18n.t('adv_col_menu.decimal_3') + (dec === 3 ? chk : ''), onClick: () => AdvancedTableColumnMenus.setColDecimals(realTableId, colId, 3) },
                    { label: I18n.t('adv_col_menu.decimal_4') + (dec === 4 ? chk : ''), onClick: () => AdvancedTableColumnMenus.setColDecimals(realTableId, colId, 4) }
                ]
            });
            menuItems.push({ type: 'divider' });
        }
        
        if (col.type === 'button') {
            menuItems.push({ icon: Icons.settings, label: I18n.t('adv_col_menu.configure_btn_macro'), onClick: () => AdvancedTable.openButtonColConfig(realTableId, colId) });
            menuItems.push({ type: 'divider' });
        }

        const chkType = (type) => col.type === type ? chk : '';

        if (col.type !== 'relation_backlink') {
            menuItems.push(
                {
                    icon: Icons.settings, label: I18n.t('adv_col_menu.change_data_type'), type: 'submenu',
                    items:[
                        { icon: Icons.text, label: I18n.t('adv_col_menu.type_text') + chkType('text'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'text') },
                        { icon: Icons.number, label: I18n.t('adv_col_menu.type_number') + chkType('number'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'number') },
                        { icon: Icons.select, label: I18n.t('adv_col_menu.type_select') + chkType('select'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'select') },
                        { icon: Icons.multiSelect, label: I18n.t('adv_col_menu.type_multi_select') + chkType('multi-select'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'multi-select') },
                        { icon: Icons.date, label: I18n.t('adv_col_menu.type_date') + chkType('date'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'date') },
                        { icon: Icons.date, label: I18n.t('adv_col_menu.type_datetime') + chkType('datetime'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'datetime') },
                        { icon: Icons.time, label: I18n.t('adv_col_menu.type_time') + chkType('time'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'time') },
                        { icon: Icons.checkbox, label: I18n.t('adv_col_menu.type_checkbox') + chkType('checkbox'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'checkbox') },
                        { icon: Icons.formula, label: I18n.t('adv_col_menu.type_formula') + chkType('formula'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'formula') },
                        { icon: Icons.relation, label: I18n.t('adv_col_menu.type_relation') + chkType('relation'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'relation') },
                        { icon: Icons.rollup, label: I18n.t('adv_col_menu.type_rollup') + chkType('rollup'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'rollup') },
                        { icon: Icons.url, label: I18n.t('adv_col_menu.type_url') + chkType('url'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'url') },
                        { icon: Icons.link, label: I18n.t('adv_col_menu.type_note_link') + chkType('note_link'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'note_link') },
                        { icon: Icons.recordPage, label: I18n.t('adv_col_menu.type_record_note') + chkType('record_note'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'record_note') },
                        { icon: Icons.play, label: I18n.t('adv_col_menu.type_button') + chkType('button'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'button') },
                        { type: 'divider' },
                        { icon: Icons.time, label: I18n.t('adv_col_menu.type_created_time') + chkType('created_time'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'created_time') },
                        { icon: Icons.time, label: I18n.t('adv_col_menu.type_last_edited_time') + chkType('last_edited_time'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'last_edited_time') }
                    ]
                }
            );
        } else {
            menuItems.push({ type: 'custom', html: `<div style="font-size:0.75rem; color:var(--text-secondary); padding:4px; font-style:italic;">${I18n.t('adv_col_menu.managed_by_app')}</div>` });
        }

        if (col.type === 'formula') menuItems.push({ icon: Icons.formula, label: I18n.t('adv_col_menu.edit_formula'), onClick: () => AdvancedTable.editFormula(realTableId, colId) });
        else if (col.type === 'rollup') menuItems.push({ icon: Icons.rollup, label: I18n.t('adv_col_menu.configure_rollup'), onClick: () => AdvancedTable.openRollupConfig(realTableId, colId) });

        menuItems.push({ type: 'divider' });

        menuItems.push({
            icon: Icons.moveArrow, label: I18n.t('adv_col_menu.move_column'), type: 'submenu',
            items:[
                { icon: Icons.arrowLeft, label: I18n.t('adv_col_menu.move_before'), disabled: colIndex === 0, onClick: () => AdvancedTableColumnMenus.moveCol(realTableId, colId, -1) },
                { icon: Icons.arrowRight, label: I18n.t('adv_col_menu.move_after'), disabled: colIndex === state.columns.length - 1, onClick: () => AdvancedTableColumnMenus.moveCol(realTableId, colId, 1) }
            ]
        });

        menuItems.push({ type: 'divider' });
        
        const deleteLabel = col.type === 'relation_backlink' ? I18n.t('adv_col_menu.hide_backlink') : I18n.t('adv_col_menu.delete_column');
        menuItems.push({ icon: Icons.trash, label: deleteLabel, danger: true, onClick: () => AdvancedTableColumnMenus.deleteCol(realTableId, colId) });

        const anchorId = e && e.currentTarget && e.currentTarget.id ? e.currentTarget.id : `adv-th-${tableId}-${colId}`;
        UI.Menu.buildContextMenu(anchorId, menuItems);
    },

    openColumnCommentModal: (tableId, colId) => {
        AdvancedTable.closeDropdowns(true);
        const state = AdvancedTable.getState(tableId);
        const col = state.columns.find(c => c.id === colId);
        const currentComment = col.comment || '';

        const bodyHTML = `
            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 15px; line-height: 1.5;">
                ${I18n.t('adv_col_menu.comment_modal_desc', { colName: col.name })}
            </div>
            <textarea id="advColCommentInput" class="modern-input" style="width: 100%; min-height: 120px; resize: vertical; padding: 10px; font-family: inherit; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 6px;" placeholder="${I18n.t('adv_col_menu.comment_placeholder')}">${currentComment}</textarea>
        `;

        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.cancel')}</button>
            <button class="btn btn-primary" onclick="AdvancedTableColumnMenus.saveColumnComment('${tableId}', '${colId}')">${I18n.t('common.save')}</button>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.noteInline} ${I18n.t('adv_col_menu.comment_modal_title')}</span>`, bodyHTML, footerHTML);

        setTimeout(() => {
            const input = document.getElementById('advColCommentInput');
            if (input) input.focus();
        }, 50);
    },

    saveColumnComment: (tableId, colId) => {
        const input = document.getElementById('advColCommentInput');
        if (!input) return;

        let state = AdvancedTable.getState(tableId);
        const col = state.columns.find(c => c.id === colId);
        if (col) {
            col.comment = input.value.trim();
        }

        AdvancedTable.setState(tableId, state);
        AdvancedTable.updateDependentViews(tableId); 
        Store.triggerAutoSave();
        UI.closeDrawer();
    },

    changeColName: (tableId, colId) => {
        const input = document.getElementById('editColNameInput');
        if (!input) return;
        const newName = input.value.trim();
        if (!newName) return;

        let state = AdvancedTable.getState(tableId);
        const col = state.columns.find(c => c.id === colId);
        if (!col) return;
        const oldName = col.name;

        if (oldName === newName) {
            AdvancedTable.closeDropdowns(true);
            return;
        }

        col.name = newName;

        // AGGIORNAMENTO A CASCATA FORMULE (Stesso DB e Cross-DB)
        AdvancedTable._updateColumnReferencesInFormulas(tableId, oldName, newName);

        AdvancedTable.setState(tableId, state);
        
        // Sincronizzazione viste e Drawer
        AdvancedTable.updateDependentViews(tableId);

        if (AdvancedTable.activeRecordId) {
            const activeTId = AdvancedTable.activeTableId || tableId;
            AdvancedTable.openRecordView(activeTId, AdvancedTable.activeRecordId);
        }
        
        Store.triggerAutoSave();
        AdvancedTable.closeDropdowns(true);
    },

    changeColType: (tableId, colId, newType) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);
        if (!col) return;
        const oldType = col.type;

        if (oldType === newType) return;

        // Se passiamo a 'relation' o 'rollup', verifichiamo prima se ci sono dati che andranno persi
        if (newType === 'relation' || newType === 'rollup') {
            const hasData = state.rows.some(r => {
                const val = r.cells[colId];
                return val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0);
            });

            if (hasData) {
                if (!confirm(I18n.t('adv_col_menu.warn_data_loss'))) {
                    AdvancedTable.closeDropdowns(true);
                    return;
                }
            }

            if (newType === 'relation') {
                AdvancedTable.openRelationConfig(realTableId, colId);
            } else {
                AdvancedTable.openRollupConfig(realTableId, colId);
            }
            return;
        }

        let hasDataLoss = false;

        let formulaValues = {};
        if (oldType === 'formula' || oldType === 'rollup' || oldType === 'relation_backlink') {
            state.rows.forEach(r => {
                const vRow = AdvancedTable.buildVirtualRow(realTableId, r, state);
                formulaValues[r.id] = vRow.virtualCells[colId];
            });
        }

        let relationCache = {};
        if (oldType === 'relation') {
            const targetState = AdvancedTable.getTableState(col.targetTableId);
            if (targetState) {
                state.rows.forEach(r => {
                    const vals = Array.isArray(r.cells[colId]) ? r.cells[colId] :[];
                    const textVals = vals.map(tId => {
                        const tRow = targetState.rows.find(tr => tr.id === tId);
                        return tRow ? tRow.cells[col.targetColId] : 'Orfano';
                    });
                    relationCache[r.id] = textVals;
                });
            }
        }

        // =========================================================================
        // HELPER DI PARSING DATE DETERMINISTICO (Timezone Independent & Entity Safe)
        // =========================================================================
        const parseSingleDatePart = (partStr, isDateTime) => {
            if (!partStr || typeof partStr !== 'string') return null;
            let str = partStr.trim();
            if (!str) return null;

            // 1. Estrazione componente orario se presente (HH:mm oppure HH:mm:ss)
            let timeStr = '';
            const timeMatch = str.match(/(?:[T\s])(\d{1,2}:\d{2}(?::\d{2})?)\s*$/i);
            if (timeMatch) {
                timeStr = timeMatch[1];
                str = str.substring(0, timeMatch.index).trim();
            }

            // 2. Rilevamento timestamp numerico puro (millisecondi)
            if (/^\d{11,}$/.test(str)) {
                const tsNum = Number(str);
                if (!isNaN(tsNum)) {
                    const d = new Date(tsNum);
                    if (!isNaN(d.getTime())) {
                        const yyyy = String(d.getFullYear()).padStart(4, '0');
                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        const hh = String(d.getHours()).padStart(2, '0');
                        const min = String(d.getMinutes()).padStart(2, '0');
                        return isDateTime ? `${yyyy}-${mm}-${dd}T${hh}:${min}` : `${yyyy}-${mm}-${dd}`;
                    }
                }
            }

            // 3. Suddivisione componenti data tramite separatori standard (/, -, .)
            const parts = str.split(/[\/\-\.]/).map(s => s.trim()).filter(Boolean);
            if (parts.length === 3) {
                let year = null, month = null, day = null;

                // 3.2: Riconoscimento Anno a 4 cifre
                if (parts[0].length === 4) {
                    // Formato ISO: YYYY-MM-DD oppure YYYY/MM/DD oppure YYYY.MM.DD
                    year = parseInt(parts[0], 10);
                    month = parseInt(parts[1], 10);
                    day = parseInt(parts[2], 10);
                } else {
                    // Anno in ultima posizione: DD/MM/YYYY oppure MM/DD/YYYY (supporto anche anno a 2 cifre)
                    let yPart = parts[2];
                    if (yPart.length === 2) {
                        year = 2000 + parseInt(yPart, 10);
                    } else if (yPart.length === 4) {
                        year = parseInt(yPart, 10);
                    }

                    if (year !== null) {
                        let valA = parseInt(parts[0], 10);
                        let valB = parseInt(parts[1], 10);

                        // 3.3: Disambiguazione Matematica Giorno/Mese (> 12)
                        if (valA > 12 && valB <= 12) {
                            day = valA;
                            month = valB;
                        } else if (valB > 12 && valA <= 12) {
                            month = valA;
                            day = valB;
                        } else {
                            // 3.4: Risoluzione Ambiguità quando entrambi sono <= 12 tramite lingua attiva (I18n)
                            const isEn = typeof I18n !== 'undefined' && I18n.currentLang === 'en';
                            if (isEn) {
                                month = valA;
                                day = valB;
                            } else {
                                day = valA;
                                month = valB;
                            }
                        }
                    }
                }

                if (year !== null && month !== null && day !== null && !isNaN(year) && !isNaN(month) && !isNaN(day)) {
                    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                        let hours = 0, minutes = 0;
                        if (isDateTime && timeStr) {
                            const tParts = timeStr.split(':');
                            hours = parseInt(tParts[0], 10) || 0;
                            minutes = parseInt(tParts[1], 10) || 0;
                        }

                        // Validazione del giorno effettivo per evitare date impossibili (es. 31 Febbraio)
                        const testD = new Date(year, month - 1, day);
                        if (!isNaN(testD.getTime()) && testD.getFullYear() === year && (testD.getMonth() + 1) === month && testD.getDate() === day) {
                            const yyyy = String(year).padStart(4, '0');
                            const mm = String(month).padStart(2, '0');
                            const dd = String(day).padStart(2, '0');
                            if (isDateTime) {
                                const hh = String(hours).padStart(2, '0');
                                const min = String(minutes).padStart(2, '0');
                                return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
                            }
                            return `${yyyy}-${mm}-${dd}`;
                        }
                    }
                }
            }

            // Fallback con Date parser nativo per stringhe già conformi allo standard
            const fallbackD = new Date(str + (timeStr ? (' ' + timeStr) : ''));
            if (!isNaN(fallbackD.getTime())) {
                const yyyy = String(fallbackD.getFullYear()).padStart(4, '0');
                const mm = String(fallbackD.getMonth() + 1).padStart(2, '0');
                const dd = String(fallbackD.getDate()).padStart(2, '0');
                if (isDateTime) {
                    const hh = String(fallbackD.getHours()).padStart(2, '0');
                    const min = String(fallbackD.getMinutes()).padStart(2, '0');
                    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
                }
                return `${yyyy}-${mm}-${dd}`;
            }

            return null;
        };

        const parseDateRangeString = (rawString, isDateTime) => {
            if (!rawString || typeof rawString !== 'string') return null;
            
            // Decodifica preventiva delle entità HTML per evitare che '->' venga letto come '-&gt;'
            let clean = rawString
                .replace(/&gt;/gi, '>')
                .replace(/&lt;/gi, '<')
                .replace(/&amp;/gi, '&')
                .replace(/^(?:dal|from|vom|del)\s+/i, '')
                .trim();
                
            if (!clean) return null;

            // Riconoscimento frecce esplicite (con supporto a freccia isolata a inizio/fine stringa)
            const hasArrow = /➔|→|->|=>/.test(clean);
            if (hasArrow) {
                const parts = clean.split(/\s*(?:➔|→|->|=>)\s*/);
                const rawStart = parts[0] ? parts[0].trim() : '';
                const rawEnd = parts[1] ? parts[1].trim() : '';

                const parsedStart = rawStart ? parseSingleDatePart(rawStart, isDateTime) : '';
                const parsedEnd = rawEnd ? parseSingleDatePart(rawEnd, isDateTime) : '';

                if (parsedStart && parsedEnd) {
                    if (parsedStart > parsedEnd) {
                        return { start: parsedEnd, end: parsedStart };
                    }
                    return { start: parsedStart, end: parsedEnd };
                } else if (parsedStart) {
                    return { start: parsedStart, end: '' }; // Freccia presente, termine fine aperto
                } else if (parsedEnd) {
                    return { start: '', end: parsedEnd }; // Freccia presente, inizio aperto
                }
                return null;
            }

            // Riconoscimento parole chiave per intervalli con spazi
            const wordRangeRegex = /\s+(?:to|al|bis)\s+/i;
            if (wordRangeRegex.test(clean)) {
                const parts = clean.split(wordRangeRegex);
                const parsedStart = parseSingleDatePart(parts[0], isDateTime);
                const parsedEnd = parseSingleDatePart(parts[1], isDateTime);
                if (parsedStart && parsedEnd) {
                    if (parsedStart > parsedEnd) return { start: parsedEnd, end: parsedStart };
                    return { start: parsedStart, end: parsedEnd };
                } else if (parsedStart) {
                    return { start: parsedStart, end: '' };
                } else if (parsedEnd) {
                    return { start: '', end: parsedEnd };
                }
            }

            // Riconoscimento trattino come separatore di range SOLO se circondato da spazi (es: "01/01/2026 - 10/01/2026")
            // oppure tra due date complete separate da slash/punto (es: "01/01/2026-10/01/2026")
            const isRangeHyphen = /\s+-\s+/.test(clean) || /(?:[\/\.]\d{4})\-(?:\d{1,2}[\/\.])/.test(clean);
            if (isRangeHyphen) {
                const parts = clean.split(/\s+-\s+|(?<=[\/\.]\d{4})\-(?=\d{1,2}[\/\.])/);
                if (parts.length >= 2) {
                    const parsedStart = parseSingleDatePart(parts[0], isDateTime);
                    const parsedEnd = parseSingleDatePart(parts[1], isDateTime);
                    if (parsedStart && parsedEnd) {
                        if (parsedStart > parsedEnd) return { start: parsedEnd, end: parsedStart };
                        return { start: parsedStart, end: parsedEnd };
                    } else if (parsedStart) {
                        return { start: parsedStart, end: '' };
                    } else if (parsedEnd) {
                        return { start: '', end: parsedEnd };
                    }
                }
            }

            // Data singola pura (nessun range, preserva ISO senza spezzare anno-mese)
            const single = parseSingleDatePart(clean, isDateTime);
            return single ? single : null;
        };

        // Pre-valutazione calcolo mappa valori in memoria
        const newSelectOptions = new Set();
        const pendingRowValues = new Map();
        const recordNoteIdsToDelete = [];
        let hasAnyRange = false;

        state.rows.forEach(r => {
            let oldVal;
            if (oldType === 'formula' || oldType === 'rollup' || oldType === 'relation_backlink') oldVal = formulaValues[r.id];
            else if (oldType === 'relation' && relationCache[r.id]) oldVal = relationCache[r.id];
            else oldVal = r.cells[colId];

            let newVal = '';

            // Riconoscimento immediato di valori nulli, vuoti o oggetti range vuoti per prevenire [object Object]
            const isNullOrEmpty = oldVal === undefined || oldVal === null || oldVal === '' || 
                                  (typeof oldVal === 'object' && oldVal !== null && !oldVal.start && !oldVal.end);

            if (oldType === 'record_note') {
                if (r.cells[colId]) {
                    recordNoteIdsToDelete.push(r.cells[colId]);
                    hasDataLoss = true;
                }
                newVal = '';
            }
            else if (newType === 'created_time' || newType === 'last_edited_time' || newType === 'formula' || newType === 'rollup' || newType === 'record_note' || newType === 'button' || newType === 'note_link') {
                newVal = '';
                if (!isNullOrEmpty && !(Array.isArray(oldVal) && oldVal.length === 0)) {
                    hasDataLoss = true;
                }
            }
            else if (isNullOrEmpty) {
                newVal = newType === 'checkbox' ? false : (newType === 'multi-select' ? [] : '');
            }
            else {
                let strVal = '';
                if (Array.isArray(oldVal)) {
                    strVal = oldVal.join(', ');
                } else if (oldType === 'checkbox') {
                    strVal = oldVal ? "Sì" : "No";
                } else if (typeof oldVal === 'object') {
                    // Conversione da Range a Testo: la freccia viene sempre inclusa per indicare inizio, fine o entrambi
                    const s = oldVal.start ? String(oldVal.start).trim() : '';
                    const e = oldVal.end ? String(oldVal.end).trim() : '';
                    if (s && e) {
                        strVal = `${s} ➔ ${e}`;
                    } else if (s) {
                        strVal = `${s} ➔`; // Solo inizio (termine aperto)
                    } else if (e) {
                        strVal = `➔ ${e}`; // Solo fine (termine iniziale aperto)
                    } else {
                        strVal = '';
                    }
                } else {
                    strVal = String(oldVal).trim();
                }

                switch (newType) {
                    case 'text':
                    case 'url':
                        newVal = strVal;
                        break;
                    case 'number':
                        const n = parseFloat(strVal.replace(',', '.'));
                        if (isNaN(n)) {
                            newVal = '';
                            if (strVal !== '') hasDataLoss = true;
                        } else {
                            newVal = n;
                        }
                        break;
                    case 'checkbox':
                        const lower = strVal.toLowerCase();
                        if (['sì', 'si', 'yes', 'true', '1', 'v'].includes(lower)) newVal = true;
                        else if (['no', 'false', '0', 'f'].includes(lower)) newVal = false;
                        else {
                            newVal = false;
                            if (strVal !== '') hasDataLoss = true;
                        }
                        break;
                    case 'date':
                    case 'datetime':
                        const isDateTime = newType === 'datetime';
                        let parsedDateResult = null;

                        if (typeof oldVal === 'object' && oldVal !== null) {
                            const pStart = parseSingleDatePart(String(oldVal.start || ''), isDateTime);
                            const pEnd = parseSingleDatePart(String(oldVal.end || ''), isDateTime);
                            if (pStart || pEnd) {
                                parsedDateResult = { start: pStart || '', end: pEnd || '' };
                            }
                        } else {
                            parsedDateResult = parseDateRangeString(strVal, isDateTime);
                        }

                        if (parsedDateResult) {
                            if (typeof parsedDateResult === 'object') {
                                hasAnyRange = true;
                                newVal = parsedDateResult;
                            } else {
                                newVal = parsedDateResult;
                            }
                        } else {
                            newVal = '';
                            if (strVal !== '') hasDataLoss = true;
                        }
                        break;
                    case 'time':
                        newVal = strVal.length >= 5 ? strVal.substring(0, 5) : '';
                        if (!newVal && strVal !== '') hasDataLoss = true;
                        break;
                    case 'select':
                        newVal = strVal.substring(0, 50);
                        if (newVal) newSelectOptions.add(newVal);
                        break;
                    case 'multi-select':
                        if (oldType === 'select') {
                            newVal = [strVal];
                            newSelectOptions.add(strVal);
                        } else {
                            newVal = strVal.split(',').map(s => s.trim()).filter(s => s);
                            newVal.forEach(v => newSelectOptions.add(v));
                        }
                        break;
                }
            }
            pendingRowValues.set(r.id, newVal);
        });

        // Conferma preventiva se presente perdita di dati
        if (hasDataLoss) {
            const proceed = confirm(I18n.t('adv_col_menu.warn_data_loss'));
            if (!proceed) return;
        }

        // Solo dopo conferma esplicita procediamo all'eliminazione delle pagine fisiche
        if (recordNoteIdsToDelete.length > 0 && typeof UI !== 'undefined' && UI.Trash) {
            recordNoteIdsToDelete.forEach(noteId => {
                UI.Trash.forceHardDeleteRecursive(noteId);
            });
        }

        // Normalizzazione coerente di tutti i record se la colonna risultante supporta o meno la Data di Fine (hasEndDate)
        if (newType === 'date' || newType === 'datetime') {
            state.rows.forEach(r => {
                let v = pendingRowValues.get(r.id);
                if (hasAnyRange) {
                    if (typeof v === 'object' && v !== null) {
                        pendingRowValues.set(r.id, { start: v.start || '', end: v.end || '' });
                    } else if (v) {
                        pendingRowValues.set(r.id, { start: v, end: '' }); // Data singola in colonna range: end rimane rigorosamente vuota
                    } else {
                        pendingRowValues.set(r.id, { start: '', end: '' });
                    }
                } else {
                    if (typeof v === 'object' && v !== null) {
                        pendingRowValues.set(r.id, v.start || '');
                    }
                }
            });
        }

        // Applica i nuovi valori a tutte le righe
        state.rows.forEach(r => {
            if (pendingRowValues.has(r.id)) {
                r.cells[colId] = pendingRowValues.get(r.id);
            }
        });

        col.type = newType;

        // Gestione coerente dell'attributo hasEndDate per date e intervalli
        if (hasAnyRange && (newType === 'date' || newType === 'datetime')) {
            col.hasEndDate = true;
        } else if (col.hasEndDate) {
            delete col.hasEndDate;
        }

        if (oldType === 'relation' && newType !== 'relation') {
            if (col.showBacklink && col.backlinkColId) {
                let targetState = AdvancedTable.getTableState(col.targetTableId);
                if (targetState) {
                    targetState.columns = targetState.columns.filter(c => c.id !== col.backlinkColId);
                    AdvancedTable.setState(col.targetTableId, targetState);
                    AdvancedTable.updateDependentViews(col.targetTableId);
                }
            }
            delete col.targetTableId;
            delete col.targetColId;
            delete col.showBacklink;
            delete col.backlinkColId;
            delete col.singleRecord;
        }
        if (oldType === 'rollup' && newType !== 'rollup') {
            delete col.relationColId;
            delete col.targetColId;
            delete col.rollupDirection;
            delete col.foreignRelColId;
        }

        if (newType === 'select' || newType === 'multi-select') {
            if (!state.selectOptions) state.selectOptions = {};
            if (!state.selectColors) state.selectColors = {};

            const existingOpts = state.selectOptions[colId] || [];
            const existingColors = state.selectColors[colId] || {};

            state.selectOptions[colId] = Array.from(new Set([...existingOpts, ...newSelectOptions]));
            state.selectColors[colId] = existingColors;
        }

        if (newType === 'formula' && !col.formula) col.formula = 'riga["Nome"] || ""';
        
        if (newType === 'button') {
            col.buttonLabel = 'Esegui Azione';
            col.buttonColor = 'var(--accent-color)';
            col.buttonIcon = Icons.play;
            col.requireConfirm = false;
            col.actionBlocks = [];
        }

        AdvancedTable.setState(realTableId, state);
        
        if (realTableId === 'SYS_PROPERTIES_DB' && AdvancedTable.activeRecordId) {
            AdvancedTable.openRecordView(realTableId, AdvancedTable.activeRecordId);
        } else {
            AdvancedTable.updateDependentViews(realTableId);
            if (AdvancedTable.activeRecordId) {
                const activeTId = AdvancedTable.activeTableId || realTableId;
                AdvancedTable.openRecordView(activeTId, AdvancedTable.activeRecordId);
            }
        }
        
        Store.triggerAutoSave();
        AdvancedTable.closeDropdowns(true);
    },

    moveCol: (tableId, colId, direction) => {
        let state = AdvancedTable.getState(tableId);
        const index = state.columns.findIndex(c => c.id === colId);

        if (direction === -1 && index > 0) {
            const temp = state.columns[index - 1];
            state.columns[index - 1] = state.columns[index];
            state.columns[index] = temp;
        } else if (direction === 1 && index < state.columns.length - 1) {
            const temp = state.columns[index + 1];
            state.columns[index + 1] = state.columns[index];
            state.columns[index] = temp;
        }

        AdvancedTable.setState(tableId, state);
        AdvancedTable.updateDependentViews(tableId);
        Store.triggerAutoSave();
        AdvancedTable.closeDropdowns(true);
    },

    deleteCol: (tableId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);
        if (!col) return;

        if (col.type === 'relation_backlink') {
            if (!confirm(I18n.t('adv_col_menu.confirm_hide_backlink'))) {
                AdvancedTable.closeDropdowns(true);
                return;
            }
            
            let sourceState = AdvancedTable.getTableState(col.linkedTableId);
            if (sourceState) {
                const srcCol = sourceState.columns.find(c => c.id === col.linkedColId);
                if (srcCol) {
                    srcCol.showBacklink = false;
                    delete srcCol.backlinkColId;
                    AdvancedTable.setState(col.linkedTableId, sourceState);
                    AdvancedTable.updateDependentViews(col.linkedTableId);
                }
            }
            
            state.columns = state.columns.filter(c => c.id !== colId);
            AdvancedTable.setState(realTableId, state);
            AdvancedTable.updateDependentViews(realTableId);
            Store.triggerAutoSave();
            AdvancedTable.closeDropdowns(true);
            return;
        }

        let isUsedInFormula = false;
        let isTargetOfRelation = false;
        let pointingTableName = "";

        const searchPattern = `riga["${col.name}"]`;
        const searchIdPattern = `riga["${col.id}"]`;

        // Scansione di protezione su tutti i database per rilevare formule, relazioni e rollup (uscenti o entranti)
        if (AppState.databases) {
            Object.keys(AppState.databases).forEach(otherDbId => {
                if (otherDbId === realTableId) return;
                const otherDb = AppState.databases[otherDbId];
                if (!otherDb || !Array.isArray(otherDb.columns)) return;

                otherDb.columns.forEach(cDef => {
                    if (cDef.type === 'formula' && cDef.formula && (cDef.formula.includes(searchPattern) || cDef.formula.includes(searchIdPattern))) {
                        isUsedInFormula = true;
                    }
                    if (cDef.type === 'relation' && cDef.targetTableId === realTableId && cDef.targetColId === colId) {
                        isTargetOfRelation = true;
                        pointingTableName = otherDb.title || 'Altro DB';
                    }
                    if (cDef.type === 'rollup' && cDef.targetColId === colId && (cDef.targetTableId === realTableId || (cDef.relationColId && String(cDef.relationColId).includes(realTableId)))) {
                        isTargetOfRelation = true;
                        pointingTableName = otherDb.title || 'Altro DB';
                    }
                });
            });
        }

        AppState.notes.forEach(n => {
            if (!n.content) return;
            const regex = /<div[^>]*class="adv-table-wrapper"[^>]*id="([^"]+)"[^>]*data-state=(['"])(.*?)\1/g;
            let m;
            while ((m = regex.exec(n.content)) !== null) {
                const foundTableId = m[1];
                try {
                    const s = JSON.parse(m[3].replace(/&quot;/g, '"'));
                    if (s.columns) {
                        s.columns.forEach(cDef => {
                            if (cDef.type === 'formula' && cDef.formula && (cDef.formula.includes(searchPattern) || cDef.formula.includes(searchIdPattern))) {
                                isUsedInFormula = true;
                            }
                            if ((cDef.type === 'relation' || cDef.type === 'rollup') && cDef.targetColId === colId && cDef.targetTableId === realTableId) {
                                isTargetOfRelation = true;
                                pointingTableName = s.title;
                            }
                        });
                    }
                } catch (e) { }
            }
        });

        if (isTargetOfRelation) {
            alert(I18n.t('adv_col_menu.warn_target_of_relation', { colName: col.name, tableName: pointingTableName }));
            AdvancedTable.closeDropdowns(true);
            return;
        }

        if (isUsedInFormula) {
            if (!confirm(I18n.t('adv_col_menu.warn_used_in_formula', { colName: col.name }))) {
                AdvancedTable.closeDropdowns(true);
                return;
            }
        } else {
            if (!confirm(I18n.t('adv_col_menu.confirm_delete_column'))) {
                AdvancedTable.closeDropdowns(true);
                return;
            }
        }

        if (col.type === 'record_note') {
            state.rows.forEach(r => {
                if (r.cells[colId]) UI.Trash.forceHardDeleteRecursive(r.cells[colId]);
            });
        }

        if (col.type === 'relation' && col.showBacklink && col.backlinkColId) {
            let targetState = AdvancedTable.getTableState(col.targetTableId);
            if (targetState) {
                targetState.columns = targetState.columns.filter(c => c.id !== col.backlinkColId);
                AdvancedTable.setState(col.targetTableId, targetState);
                AdvancedTable.updateDependentViews(col.targetTableId);
            }
        }

        // Rimozione fisica della colonna
        state.columns = state.columns.filter(c => c.id !== colId);
        
        // Pulizia celle solo per tabelle fisiche (non viste collegate o pivot)
        if (!state.isLinkedView && !state.isPivot) {
            state.rows.forEach(r => delete r.cells[colId]);
        }
        if (state.selectOptions && state.selectOptions[colId]) delete state.selectOptions[colId];
        if (state.selectColors && state.selectColors[colId]) delete state.selectColors[colId];

        // Pulizia a cascata dello stato da configurazioni orfane per prevenire crash
        const sanitizeTableConfig = (tState) => {
            if (!tState) return;

            // Filtri attivi
            if (tState.filters && tState.filters[colId]) {
                delete tState.filters[colId];
            }

            // Ordinamenti
            if (Array.isArray(tState.sorts)) {
                tState.sorts = tState.sorts.filter(s => s.colId !== colId);
            }

            // Regole di formattazione condizionale
            if (Array.isArray(tState.conditionalColors)) {
                tState.conditionalColors.forEach(rule => {
                    if (Array.isArray(rule.conditions)) {
                        rule.conditions = rule.conditions.filter(cond => cond.colId !== colId);
                    }
                });
                tState.conditionalColors = tState.conditionalColors.filter(rule => rule.conditions && rule.conditions.length > 0);
            }

            // Configurazione visibilità viste
            if (tState.viewConfig) {
                Object.keys(tState.viewConfig).forEach(vKey => {
                    if (tState.viewConfig[vKey] && Array.isArray(tState.viewConfig[vKey].hiddenCols)) {
                        tState.viewConfig[vKey].hiddenCols = tState.viewConfig[vKey].hiddenCols.filter(id => id !== colId);
                    }
                });
            }

            // Reset raggruppamenti speciali se legati alla colonna eliminata
            if (tState.boardGroupBy === colId) {
                delete tState.boardGroupBy;
                if (tState.viewType === 'board') tState.viewType = 'table';
            }
            if (tState.calendarDateCol === colId) {
                delete tState.calendarDateCol;
                if (tState.viewType === 'calendar') tState.viewType = 'table';
            }
            if (tState.timelineDateCol === colId) {
                delete tState.timelineDateCol;
                if (tState.viewType === 'timeline') tState.viewType = 'table';
            }
        };

        sanitizeTableConfig(state);
        AdvancedTable.setState(realTableId, state);

        // Allineamento a cascata su tutte le viste collegate dipendenti
        if (AppState.databases) {
            Object.keys(AppState.databases).forEach(id => {
                const depState = AppState.databases[id];
                if (depState && depState.sourceTableId === realTableId) {
                    sanitizeTableConfig(depState);
                    AdvancedTable.setState(id, depState);
                }
            });
        }
        
        if (realTableId === 'SYS_PROPERTIES_DB' && AdvancedTable.activeRecordId) {
            AdvancedTable.openRecordView(realTableId, AdvancedTable.activeRecordId);
        } else {
            AdvancedTable.updateDependentViews(realTableId);
            if (AdvancedTable.activeRecordId) {
                const activeTId = AdvancedTable.activeTableId || realTableId;
                AdvancedTable.openRecordView(activeTId, AdvancedTable.activeRecordId);
            }
        }
        
        Store.triggerAutoSave();
        AdvancedTable.closeDropdowns(true);
    }
};

// =========================================================================
// MOTORE AGGIORNAMENTO FORMULE SU RINOMINA COLONNA (STESSO DB E CROSS-DB)
// =========================================================================
Object.assign(AdvancedTable, {
    _updateColumnReferencesInFormulas: (tableId, oldName, newName) => {
        if (!oldName || !newName || oldName === newName || !AppState.databases) return;

        const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedOld = escapeRegExp(oldName);
        const escapedNew = newName.replace(/"/g, '\\"');

        // Regex 1: Accesso alla proprietà tramite parentesi quadre (compatibilità cross-browser senza lookbehind variabile)
        const bracketRegex = new RegExp(`\\b(riga|r|origine|row|item)\\s*\\[\\s*(["'])${escapedOld}\\2\\s*\\]`, 'g');
        const bracketReplace = `$1["${escapedNew}"]`;

        // Regex 2: Argomento testuale nelle funzioni helper: SOMMA(righe, "Col"), MEDIA(..., "Col"), CERCA(..., "Col", ...)
        const helperRegex = new RegExp(`(\\b(?:SOMMA|MEDIA|CONTA|CERCA|UNISCI)\\s*\\([^)]*?)(["'])${escapedOld}\\2`, 'gi');

        const updateStringFormula = (formulaStr) => {
            if (!formulaStr || typeof formulaStr !== 'string') return formulaStr;
            let updated = formulaStr.replace(bracketRegex, bracketReplace);
            updated = updated.replace(helperRegex, `$1"${escapedNew}"`);
            return updated;
        };

        const targetRealId = AdvancedTable._resolveSourceId(tableId);
        const targetState = AppState.databases[targetRealId];
        const targetTitle = targetState ? targetState.title : null;

        Object.keys(AppState.databases).forEach(dbId => {
            const s = AppState.databases[dbId];
            if (!s) return;
            let changed = false;

            const isCurrentDb = (dbId === targetRealId);
            
            // Guardia difensiva rigorosa su Array.isArray(s.columns) per isolare widget non-tabellari (codice, diari, bottoni)
            const referencesThisDb = Boolean(
                Array.isArray(s.columns) && 
                s.columns.some(c => 
                    c.type === 'formula' && c.formula && 
                    (
                        (targetTitle && (c.formula.includes(`tabella["${targetTitle}"]`) || c.formula.includes(`tabella['${targetTitle}']`))) ||
                        (targetRealId && (c.formula.includes(`tabella["${targetRealId}"]`) || c.formula.includes(`tabella['${targetRealId}']`)))
                    )
                )
            );

            if (isCurrentDb || referencesThisDb) {
                // 1. Colonne Formula
                if (Array.isArray(s.columns)) {
                    s.columns.forEach(c => {
                        if (c.type === 'formula' && c.formula) {
                            const newFormula = updateStringFormula(c.formula);
                            if (newFormula !== c.formula) {
                                c.formula = newFormula;
                                changed = true;
                            }
                        }
                    });
                }

                // 2. Automazioni
                if (Array.isArray(s.automations)) {
                    s.automations.forEach(auto => {
                        if (Array.isArray(auto.triggers)) {
                            auto.triggers.forEach(t => {
                                if (t.colId === 'SYS_JS_FORMULA' && t.value) {
                                    const newF = updateStringFormula(t.value);
                                    if (newF !== t.value) { t.value = newF; changed = true; }
                                }
                            });
                        }
                        if (Array.isArray(auto.actions)) {
                            auto.actions.forEach(a => {
                                if (a.type && a.type.includes('formula') && a.value) {
                                    const newF = updateStringFormula(a.value);
                                    if (newF !== a.value) { a.value = newF; changed = true; }
                                }
                            });
                        }
                    });
                }

                // 3. Colonne Pulsante Macro
                if (Array.isArray(s.columns)) {
                    s.columns.forEach(c => {
                        if (c.type === 'button' && Array.isArray(c.actionBlocks)) {
                            c.actionBlocks.forEach(blk => {
                                if (Array.isArray(blk.filters)) {
                                    blk.filters.forEach(f => {
                                        if (f.colId === 'SYS_JS_FORMULA' && f.value) {
                                            const newF = updateStringFormula(f.value);
                                            if (newF !== f.value) { f.value = newF; changed = true; }
                                        }
                                    });
                                }
                                if (Array.isArray(blk.actions)) {
                                    blk.actions.forEach(act => {
                                        if (act.type && act.type.includes('formula') && act.value) {
                                            const newF = updateStringFormula(act.value);
                                            if (newF !== act.value) { act.value = newF; changed = true; }
                                        }
                                    });
                                }
                            });
                        }
                    });
                }

                if (changed) {
                    AdvancedTable.setState(dbId, s);
                    if (dbId !== targetRealId) {
                        AdvancedTable.updateDependentViews(dbId);
                    }
                }
            }
        });
    }
});