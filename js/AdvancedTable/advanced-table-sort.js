/**
 * AdvancedTableSort.js
 * Modulo dedicato alla logica di Ordinamento Multi-Colonna.
 * FIX UX: Possibilità di invertire l'ordine con un doppio click sulla regola esistente.
 * FEAT QUICK SORT: Doppio click sull'intestazione colonna (th) esegue l'ordinamento rapido o inverte la direzione.
 * FEAT ANTI-CONFLICT TIMER: Disaccoppiamento intelligente tra singolo click (menu colonna) e doppio click (ordinamento).
 * FIX OPEN_COL_MENU DISPATCH: Invocazione difensiva di openColMenu con target e stopPropagation sicuri.
 */

Object.assign(AdvancedTable, {
    _thClickTimer: null,

    onThClick: (e, tableId, colId) => {
        if (e) {
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
            if (e.target && e.target.classList && e.target.classList.contains('adv-col-resizer')) return;
        }
        const anchorId = e && e.currentTarget && e.currentTarget.id ? e.currentTarget.id : `adv-th-${tableId}-${colId}`;
        clearTimeout(AdvancedTable._thClickTimer);
        AdvancedTable._thClickTimer = setTimeout(() => {
            const el = document.getElementById(anchorId);
            if (typeof AdvancedTableColumnMenus !== 'undefined' && typeof AdvancedTableColumnMenus.openColMenu === 'function') {
                AdvancedTableColumnMenus.openColMenu({ currentTarget: el, target: el, stopPropagation: () => {} }, tableId, colId);
            }
        }, 220);
    },

    onThDblClick: (e, tableId, colId) => {
        if (e) {
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
            if (typeof e.preventDefault === 'function') e.preventDefault();
        }
        clearTimeout(AdvancedTable._thClickTimer);
        AdvancedTable.quickSortColumn(tableId, colId);
    },

    quickSortColumn: (tableId, colId) => {
        let state = AdvancedTable.getState(tableId);
        if (!state) return;

        if (!state.sorts) state.sorts = [];

        const existingIdx = state.sorts.findIndex(s => s.colId === colId);

        if (existingIdx === 0) {
            // È già l'ordinamento primario attivo: inverte la direzione (1 -> -1 -> 1)
            state.sorts[0].dir *= -1;
        } else if (existingIdx > 0) {
            // È presente tra i sort secondari: promuovi a primario invertendo
            const [rule] = state.sorts.splice(existingIdx, 1);
            rule.dir *= -1;
            state.sorts.unshift(rule);
        } else {
            // Non era ordinato: imposta come ordinamento primario crescente (A-Z)
            state.sorts = [{ colId, dir: 1 }];
        }

        AdvancedTable.setState(tableId, state);
        AdvancedTable.closeDropdowns(true);
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
    },

    openSortMenu: (e, tableId) => {
        if (e) e.stopPropagation();

        const existing = document.querySelector('.adv-dropdown.sort-menu');
        UI.Menu.closeAll(true);
        if (existing && e) return;

        const state = AdvancedTable.getState(tableId);

        const dropdown = document.createElement('div');
        dropdown.className = 'adv-dropdown sort-menu';
        dropdown.id = 'advSortMenuDropdown';
        dropdown.onmousedown = (ev) => ev.stopPropagation();
        dropdown.onclick = (ev) => ev.stopPropagation();
        dropdown.style.minWidth = '250px';

        let html = `<div class="adv-dropdown-title" style="margin-bottom:8px;">${I18n.t('adv_sort.active_rules')}</div>`;

        if (state.sorts && state.sorts.length > 0) {
            state.sorts.forEach((sortRule, index) => {
                const colName = (state.columns || []).find(c => c.id === sortRule.colId)?.name || I18n.t('adv_sort.deleted_col');
                const dirLabel = sortRule.dir === 1 ? I18n.t('adv_sort.asc') : I18n.t('adv_sort.desc');
                html += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; background:var(--item-hover); border-radius:4px; margin-bottom:4px; font-size:0.8rem; cursor:pointer;"
                         title="${I18n.t('adv_sort.dblclick_invert')}"
                         ondblclick="event.stopPropagation(); AdvancedTable.toggleSortDirection('${tableId}', ${index})">
                        <div style="pointer-events:none;">
                            <span style="color:var(--text-secondary); margin-right:4px;">${index + 1}.</span> 
                            <b>${colName}</b> <span style="opacity:0.7; font-size:0.7rem;">${dirLabel}</span>
                        </div>
                        <button class="adv-icon-btn danger" onclick="event.stopPropagation(); AdvancedTable.removeSort('${tableId}', ${index})" title="${I18n.t('adv_sort.remove_rule')}">✕</button>
                    </div>`;
            });
            html += `<hr style="border:0; border-top:1px solid var(--border-color); margin: 8px 0;">`;
        } else {
            html += `<div style="font-size:0.8rem; color:#888; padding:4px; margin-bottom:8px;">${I18n.t('adv_sort.no_rules')}</div>`;
        }

        html += `<div class="adv-dropdown-title">${I18n.t('adv_sort.add_rule')}</div>`;
        html += `<select class="adv-dropdown-select" id="advSortCol" onchange="event.stopPropagation()">
                    <option value="">${I18n.t('adv_sort.select_col')}</option>`;
        (state.columns || []).forEach(c => {
            if (!(state.sorts || []).find(s => s.colId === c.id)) {
                html += `<option value="${c.id}">${c.name}</option>`;
            }
        });
        html += `</select>`;

        html += `<div style="display:flex; gap:5px; margin-bottom:5px;">
                    <button class="adv-add-btn" style="flex:1; border:1px solid var(--border-color);" onclick="event.stopPropagation(); AdvancedTable.addSort('${tableId}', 1)">${I18n.t('adv_sort.btn_asc')}</button>
                    <button class="adv-add-btn" style="flex:1; border:1px solid var(--border-color);" onclick="event.stopPropagation(); AdvancedTable.addSort('${tableId}', -1)">${I18n.t('adv_sort.btn_desc')}</button>
                 </div>`;

        if (state.sorts && state.sorts.length > 0) {
            html += `<button class="adv-add-btn" style="width:100%; color:var(--danger-color); margin-top:5px;" onclick="event.stopPropagation(); AdvancedTable.clearSort('${tableId}')">${I18n.t('adv_sort.clear_all')}</button>`;
        }

        dropdown.innerHTML = html;
        document.body.appendChild(dropdown);
        UI.Menu.positionAt(dropdown, `adv-sort-btn-${tableId}`);
    },

    addSort: (tableId, dir) => {
        const colId = document.getElementById('advSortCol').value;
        if (!colId) return;

        let state = AdvancedTable.getState(tableId);

        if (!state.sorts) state.sorts = [];
        state.sorts.push({ colId, dir });

        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
        AdvancedTable.openSortMenu(null, tableId);
    },

    toggleSortDirection: (tableId, index) => {
        let state = AdvancedTable.getState(tableId);
        if (state.sorts && state.sorts[index]) {
            state.sorts[index].dir *= -1; // -1 diventa 1, 1 diventa -1
            AdvancedTable.setState(tableId, state);
            AdvancedTable.renderTable(tableId);
            Store.triggerAutoSave();
            AdvancedTable.openSortMenu(null, tableId);
        }
    },

    removeSort: (tableId, indexToRemove) => {
        let state = AdvancedTable.getState(tableId);
        if (state.sorts && state.sorts.length > indexToRemove) state.sorts.splice(indexToRemove, 1);

        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
        AdvancedTable.openSortMenu(null, tableId);
    },

    clearSort: (tableId) => {
        let state = AdvancedTable.getState(tableId);
        state.sorts = [];
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
        UI.Menu.closeAll(true);
        Store.triggerAutoSave();
    }
});