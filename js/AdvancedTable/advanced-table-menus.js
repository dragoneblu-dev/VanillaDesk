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
            visibilityItems.push({ type: 'custom', html: '<div style="font-size:0.65rem; font-weight:bold; color:var(--text-secondary); padding:4px 8px; text-transform:uppercase; letter-spacing:0.05em;">Campi Nascosti</div>' });
            visibilityItems = visibilityItems.concat(hiddenItems);
        }

        const widthLabel = 'Adatta a larghezza pagina&nbsp;' + (!state.freeWidth ? ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>' : '');
        const zebraLabel = 'Righe alternate' + (state.striped !== false ? ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>' : '');
        const footerLabel = 'Piè di pagina (Nuova riga / Pagine)' + (!isFooterHidden ? ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>' : '');

        const clamp = state.textClamp !== undefined ? state.textClamp : 1; 
        const chk = ' <span style="color:var(--accent-color); font-weight:bold; float:right; margin-left:10px;">✓</span>';
        
        const lineClampItems =[
            { label: 'Tutto il testo' + (clamp === 'auto' ? chk : ''), onClick: () => AdvancedTableMenus.setTextClamp(tableId, 'auto') },
            { label: 'Max 1 riga' + (clamp === 1 ? chk : ''), onClick: () => AdvancedTableMenus.setTextClamp(tableId, 1) },
            { label: 'Max 2 righe' + (clamp === 2 ? chk : ''), onClick: () => AdvancedTableMenus.setTextClamp(tableId, 2) },
            { label: 'Max 3 righe' + (clamp === 3 ? chk : ''), onClick: () => AdvancedTableMenus.setTextClamp(tableId, 3) }
        ];

        const menuItems =[
            { icon: Icons.eye, label: 'Visualizza campo', type: 'submenu', items: visibilityItems },
            { icon: Icons.widthFit, label: widthLabel, onClick: () => AdvancedTable.toggleFreeWidth(tableId) },
            { icon: Icons.zebra, label: zebraLabel, onClick: () => AdvancedTableMenus.toggleZebra(tableId) },
            { icon: Icons.layoutAuto, label: footerLabel, onClick: () => AdvancedTableMenus.toggleFooterControls(tableId) },
            { icon: Icons.text, label: 'Altezza Righe Testo', type: 'submenu', items: lineClampItems }
        ];

        if (!state.isLinkedView && !state.isPivot && typeof AdvancedTableConditionalColors !== 'undefined') {
            const activeRulesCount = state.conditionalColors ? state.conditionalColors.filter(r => r.active).length : 0;
            
            menuItems.push({ type: 'divider' });
            menuItems.push({ 
                icon: Icons.palette, 
                label: `Colorazione Condizionale`, 
                badge: activeRulesCount > 0 ? activeRulesCount : null,
                onClick: () => AdvancedTableConditionalColors.openConditionalColorPanel(e, tableId) 
            });
        }

        menuItems.push({ type: 'divider' });

        const linkedViews = [];
        if (AppState.databases) {
            Object.keys(AppState.databases).forEach(k => {
                const db = AppState.databases[k];
                const originalSource = state.isLinkedView || state.isPivot ? state.sourceTableId : tableId;
                if (db && (db.isLinkedView || db.isPivot) && db.sourceTableId === originalSource && k !== tableId) {
                    linkedViews.push({ icon: db.isPivot ? (db.chartConfig?.visible ? '📊' : '📈') : Icons.link, label: db.title || 'Vista senza titolo', onClick: () => UI.jumpToWidget(k) });
                }
            });
        }

        if (linkedViews.length > 0) menuItems.push({ icon: Icons.link, label: 'Altre Viste Collegate...', type: 'submenu', items: linkedViews });
        if (state.isLinkedView || state.isPivot) menuItems.push({ icon: Icons.tableDatabase, label: 'Vai al Database Originale', onClick: () => UI.jumpToWidget(state.sourceTableId) });
        if (linkedViews.length > 0 || state.isLinkedView || state.isPivot) menuItems.push({ type: 'divider' });

        if (!state.isLinkedView && !state.isPivot) menuItems.push({ icon: Icons.import, label: 'Importa da CSV (Sostituisci)', onClick: () => AdvancedTable.importCSV(tableId) });
        
        menuItems.push({ icon: Icons.export, label: 'Esporta come CSV', onClick: () => AdvancedTable.exportCSV(tableId) });
        menuItems.push({ type: 'divider' });
        
        let deleteLabel = 'Elimina Database';
        if (state.isLinkedView) deleteLabel = 'Rimuovi Vista Collegata';
        if (state.isPivot) deleteLabel = 'Rimuovi Tabella Pivot';

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