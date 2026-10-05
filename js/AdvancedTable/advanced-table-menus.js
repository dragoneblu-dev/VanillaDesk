/**
 * AdvancedTableMenus.js
 * Menu Contestuali Principali per Tabelle Database (Visibilità, Esportazione, Zebra, Layout).
 * FIX LOOP: Rimozione dell'autorichiamo infinto per le Viste Collegate.
 * FEAT UX: Implementato il Badge numerico elegante per la Colorazione Condizionale.
 */

const AdvancedTableMenus = {

    openTableOptions: (e, tableId) => {
        if (e) e.stopPropagation();
        AdvancedTable.closeDropdowns(true);

        let state = AdvancedTable.getState(tableId);
        if (!state) return;

        const isFreeWidth = state.freeWidth === true;
        const isStriped = state.striped !== false;
        const isFooterHidden = state.hideFooterControls === true;

        let viewId = 'table';
        if (state.viewType === 'board') viewId = 'board_' + state.boardGroupBy;
        else if (state.viewType === 'calendar') viewId = 'calendar_' + state.calendarDateCol;
        else if (state.viewType === 'timeline') viewId = 'timeline_' + state.timelineDateCol;

        const hiddenList = state.viewConfig && state.viewConfig[viewId] ? state.viewConfig[viewId].hiddenCols :[];

        const visibleItems = [];
        const hiddenItems =[];

        state.columns.forEach(c => {
            const isVisible = !hiddenList.includes(c.id);
            const item = { label: c.name, icon: isVisible ? Icons.eye : Icons.eyeOff, disabled: (isVisible && (state.columns.length - hiddenList.length === 1)), onClick: () => AdvancedTableMenus.toggleColVisibility(tableId, c.id) };
            if (isVisible) visibleItems.push(item); else hiddenItems.push(item);
        });

        let visibilityItems = [...visibleItems];
        if (hiddenItems.length > 0) {
            if (visibleItems.length > 0) visibilityItems.push({ type: 'divider' });
            visibilityItems.push({ type: 'custom', html: `<div style="font-size:0.65rem; font-weight:bold; color:var(--text-secondary); padding:4px 8px; text-transform:uppercase; letter-spacing:0.05em;">${I18n.t('adv_menus.hidden_fields')}</div>` });
            visibilityItems = visibilityItems.concat(hiddenItems);
        }

        const widthLabel = I18n.t('adv_menus.fit_page_width') + '&nbsp;' + (!state.freeWidth ? ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>' : '');
        const zebraLabel = I18n.t('adv_menus.striped_rows') + (state.striped !== false ? ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>' : '');
        const footerLabel = I18n.t('adv_menus.footer_controls') + (!isFooterHidden ? ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>' : '');

        const clamp = state.textClamp !== undefined ? state.textClamp : 1; 
        const chk = ' <span style="color:var(--accent-color); font-weight:bold; float:right; margin-left:10px;">✓</span>';
        
        const lineClampItems =[
            { label: I18n.t('adv_menus.clamp_auto') + (clamp === 'auto' ? chk : ''), onClick: () => AdvancedTableMenus.setTextClamp(tableId, 'auto') },
            { label: I18n.t('adv_menus.clamp_1') + (clamp === 1 ? chk : ''), onClick: () => AdvancedTableMenus.setTextClamp(tableId, 1) },
            { label: I18n.t('adv_menus.clamp_2') + (clamp === 2 ? chk : ''), onClick: () => AdvancedTableMenus.setTextClamp(tableId, 2) },
            { label: I18n.t('adv_menus.clamp_3') + (clamp === 3 ? chk : ''), onClick: () => AdvancedTableMenus.setTextClamp(tableId, 3) }
        ];

        const menuItems =[
            { icon: Icons.eye, label: I18n.t('adv_menus.view_field'), type: 'submenu', items: visibilityItems },
            { icon: Icons.widthFit, label: widthLabel, onClick: () => AdvancedTable.toggleFreeWidth(tableId) },
            { icon: Icons.zebra, label: zebraLabel, onClick: () => AdvancedTableMenus.toggleZebra(tableId) },
            { icon: Icons.layoutAuto, label: footerLabel, onClick: () => AdvancedTableMenus.toggleFooterControls(tableId) },
            { icon: Icons.text, label: I18n.t('adv_menus.row_height'), type: 'submenu', items: lineClampItems }
        ];

        if (!state.isLinkedView && !state.isPivot && typeof AdvancedTableConditionalColors !== 'undefined') {
            const activeRulesCount = state.conditionalColors ? state.conditionalColors.filter(r => r.active).length : 0;
            
            menuItems.push({ type: 'divider' });
            menuItems.push({ 
                icon: Icons.palette, 
                label: I18n.t('adv_menus.conditional_colors'), 
                badge: activeRulesCount > 0 ? activeRulesCount : null,
                onClick: () => AdvancedTableConditionalColors.openConditionalColorPanel(e, tableId) 
            });
        }

        menuItems.push({ type: 'divider' });

        const linkedViews = [];
        if (AppState.databases) {
            AppState.getRelationalDatabaseIds().forEach(k => {
                const db = AppState.databases[k];
                const originalSource = state.isLinkedView || state.isPivot ? state.sourceTableId : tableId;
                if (db && (db.isLinkedView || db.isPivot) && db.sourceTableId === originalSource && k !== tableId) {
                    linkedViews.push({ icon: db.isPivot ? (db.chartConfig?.visible ? '📊' : '📈') : Icons.link, label: db.title || I18n.t('editor.untitled'), onClick: () => UI.jumpToWidget(k) });
                }
            });
        }

        if (linkedViews.length > 0) menuItems.push({ icon: Icons.link, label: I18n.t('adv_menus.other_linked_views'), type: 'submenu', items: linkedViews });
        if (state.isLinkedView || state.isPivot) menuItems.push({ icon: Icons.tableDatabase, label: I18n.t('adv_menus.go_to_original_db'), onClick: () => UI.jumpToWidget(state.sourceTableId) });
        if (linkedViews.length > 0 || state.isLinkedView || state.isPivot) menuItems.push({ type: 'divider' });

        if (!state.isLinkedView && !state.isPivot) menuItems.push({ icon: Icons.import, label: I18n.t('adv_menus.import_csv'), onClick: () => AdvancedTable.importCSV(tableId) });
        
        menuItems.push({ icon: Icons.export, label: I18n.t('adv_menus.export_csv'), onClick: () => AdvancedTable.exportCSV(tableId) });
        menuItems.push({ type: 'divider' });
        
        let deleteLabel = I18n.t('adv_menus.delete_db');
        if (state.isLinkedView) deleteLabel = I18n.t('adv_menus.remove_linked_view');
        if (state.isPivot) deleteLabel = I18n.t('adv_menus.remove_pivot');

        menuItems.push({ icon: Icons.trash, label: deleteLabel, danger: true, onClick: () => AdvancedTable.deleteTable(tableId) });

        const anchor = e ? e.currentTarget.id : `adv-opt-btn-${tableId}`;
        UI.Menu.buildContextMenu(anchor, menuItems);
    },

    toggleFooterControls: (tableId) => {
        let state = AdvancedTable.getState(tableId);
        state.hideFooterControls = !state.hideFooterControls;
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
        UI.Menu.closeAll(true);
    },

    setTextClamp: (tableId, value) => {
        let state = AdvancedTable.getState(tableId);
        state.textClamp = value;
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
    },

    toggleZebra: (tableId) => {
        let state = AdvancedTable.getState(tableId);
        state.striped = state.striped === false ? true : false;
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
    },

    toggleColVisibility: (tableId, colId) => {
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

        if (idx > -1) hiddenList.splice(idx, 1);
        else hiddenList.push(colId);

        state.columns.forEach(c => delete c.hidden);

        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
        AdvancedTableMenus.openTableOptions(null, tableId);
    }
};