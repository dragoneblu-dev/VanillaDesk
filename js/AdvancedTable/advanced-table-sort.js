/**
 * AdvancedTableSort.js
 * Modulo dedicato alla logica di Ordinamento Multi-Colonna.
 * FIX UX: Possibilità di invertire l'ordine con un doppio click sulla regola esistente.
 */

Object.assign(AdvancedTable, {
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

        let html = `<div class="adv-dropdown-title" style="margin-bottom:8px;">Regole di Ordinamento attive</div>`;

        if (state.sorts && state.sorts.length > 0) {
            state.sorts.forEach((sortRule, index) => {
                const colName = (state.columns || []).find(c => c.id === sortRule.colId)?.name || 'Colonna eliminata';
                const dirLabel = sortRule.dir === 1 ? 'Crescente (A-Z)' : 'Decrescente (Z-A)';
                html += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; background:var(--item-hover); border-radius:4px; margin-bottom:4px; font-size:0.8rem; cursor:pointer;"
                         title="Doppio click per invertire l'ordinamento"
                         ondblclick="event.stopPropagation(); AdvancedTable.toggleSortDirection('${tableId}', ${index})">
                        <div style="pointer-events:none;">
                            <span style="color:var(--text-secondary); margin-right:4px;">${index + 1}.</span> 
                            <b>${colName}</b> <span style="opacity:0.7; font-size:0.7rem;">${dirLabel}</span>
                        </div>
                        <button class="adv-icon-btn danger" onclick="event.stopPropagation(); AdvancedTable.removeSort('${tableId}', ${index})" title="Rimuovi regola">✕</button>
                    </div>`;
            });
            html += `<hr style="border:0; border-top:1px solid var(--border-color); margin: 8px 0;">`;
        } else {
            html += `<div style="font-size:0.8rem; color:#888; padding:4px; margin-bottom:8px;">Nessuna regola applicata.</div>`;
        }

        html += `<div class="adv-dropdown-title">Aggiungi Nuova Regola</div>`;
        html += `<select class="adv-dropdown-select" id="advSortCol" onchange="event.stopPropagation()">
                    <option value="">-- Seleziona Colonna --</option>`;
        (state.columns || []).forEach(c => {
            if (!(state.sorts || []).find(s => s.colId === c.id)) {
                html += `<option value="${c.id}">${c.name}</option>`;
            }
        });
        html += `</select>`;

        html += `<div style="display:flex; gap:5px; margin-bottom:5px;">
                    <button class="adv-add-btn" style="flex:1; border:1px solid var(--border-color);" onclick="event.stopPropagation(); AdvancedTable.addSort('${tableId}', 1)">+ A-Z</button>
                    <button class="adv-add-btn" style="flex:1; border:1px solid var(--border-color);" onclick="event.stopPropagation(); AdvancedTable.addSort('${tableId}', -1)">+ Z-A</button>
                 </div>`;

        if (state.sorts && state.sorts.length > 0) {
            html += `<button class="adv-add-btn" style="width:100%; color:var(--danger-color); margin-top:5px;" onclick="event.stopPropagation(); AdvancedTable.clearSort('${tableId}')">Rimuovi Tutte le Regole</button>`;
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