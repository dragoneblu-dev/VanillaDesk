/**
 * js/AdvancedTable/advanced-table-select.js
 * Isolamento gestione Tipi Select (Singola, Multipla, Colori, Opzioni) con UI Stile Notion
 * FIX POSIZIONAMENTO MENU: Logica di ricalcolo ancoraggio per i menu ricostruiti all'interno del Drawer.
 * FEAT ORDINAMENTO A-Z PERSISTENTE: Inserimento e rinomina opzioni mantengono sempre ordinato
 * l'array state.selectOptions[colId] da A alla Z in memoria e a video.
 * FIX SEARCH INPUT RESET: Azzeramento sicuro di tutti gli elementi #advCreateSelectInput nel DOM,
 * prevenendo mancate pulizie dovute a collisioni di ID nel documento.
 * FIX HEADLESS CLEANUP: In setTagColor la riapertura del menu avviene solo se è presente un'ancora reale.
 * FIX DEFENSIVO ROW CRASH: openSelectMenu gestisce in modo resiliente l'eventuale assenza del record specificato.
 */

const svgDotsHorizontal = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><circle cx="5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle></svg>`;
const svgTrashSel = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
const svgCloseSel = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

Object.assign(AdvancedTable, {
    pillColors: ['hl-c1', 'hl-c2', 'hl-c3', 'hl-c4', 'hl-c5', 'hl-c6', 'hl-c7', 'hl-c8', 'hl-c9', 'hl-c10'],

    openSelectMenu: (e, tableId, rowId, colId, explicitAnchorId = null) => {
        if (e) e.stopPropagation();
        UI.Menu.closeAll(true);

        let state = AdvancedTable.getState(tableId);
        if (!state) return;

        const col = state.columns ? state.columns.find(c => c.id === colId) : null;
        const row = state.rows ? state.rows.find(r => r.id === rowId) : null;
        
        if (!col) return;

        // Garantisce l'ordinamento A-Z immediato dell'elenco memorizzato
        if (!state.selectOptions) state.selectOptions = {};
        if (!state.selectOptions[colId]) state.selectOptions[colId] = [];
        state.selectOptions[colId].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
        const options = [...state.selectOptions[colId]];

        if (!state.selectColors) state.selectColors = {};
        if (!state.selectColors[colId]) state.selectColors[colId] = {};

        let currentVals = (row && row.cells) ? row.cells[colId] : [];
        if (!Array.isArray(currentVals)) currentVals = currentVals ? [currentVals] : [];

        const dropdown = document.createElement('div');
        dropdown.className = 'adv-dropdown adv-context-menu';
        dropdown.id = 'advSelectDropdown';
        dropdown.style.padding = '8px';
        dropdown.style.display = 'flex';
        dropdown.style.flexDirection = 'column';

        dropdown.onmousedown = (ev) => ev.stopPropagation();
        dropdown.onclick = (ev) => ev.stopPropagation();

        // Rilevamento Intelligente dell'Ancora DOM
        let anchorId = explicitAnchorId;
        if (!anchorId && e && e.currentTarget) {
            anchorId = e.currentTarget.id;
        }
        
        if (!anchorId) {
            // Se non ho l'evento nativo (es. ricaricamento programmatico post-cambio colore)
            // Analizzo se l'utente si trova nel cassetto laterale (Drawer) o nella tabella principale.
            const drawer = document.getElementById('advGlobalDrawer');
            if (drawer && drawer.classList.contains('open')) {
                anchorId = `adv-sel-rec-${tableId}-${rowId}-${colId}`;
            } else {
                anchorId = `adv-sel-${tableId}-${rowId}-${colId}`;
            }
        }

        AdvancedTable.renderSelectMenuContent(dropdown, tableId, rowId, colId, state, options, currentVals, col, anchorId);
        document.body.appendChild(dropdown);
        
        UI.Menu.positionAt(dropdown, anchorId);
        
        setTimeout(() => {
            const input = document.getElementById('advCreateSelectInput');
            if (input) input.focus();
        }, 50);
    },

    renderSelectMenuContent: (dropdown, tableId, rowId, colId, state, options, currentVals, col, parentAnchorId) => {

        let html = `<div style="flex-shrink:0;">`; 
        html += `<div class="adv-dropdown-title">Cerca o Crea Opzione</div>`;
        html += `<input type="text" class="adv-dropdown-input" id="advCreateSelectInput" placeholder="Cerca o digita e premi Invio..." 
                       oninput="AdvancedTable.filterSelectOptions(this.value)" 
                       onkeydown="if(event.key === 'Enter') { event.preventDefault(); AdvancedTable.createSelectOptionFromInput('${tableId}', '${rowId}', '${colId}', this.value); } event.stopPropagation();">`;
        html += `<div class="adv-dropdown-title" style="margin-top:5px;">Opzioni</div>`;
        
        if (options.length === 0) {
            html += `<div id="advSelectNoOptions" style="font-size:0.8rem; color:var(--text-secondary); padding:4px;">Nessuna opzione trovata.</div>`;
        }
        html += `</div>`; 

        html += `<div id="advSelectOptionsContainer" class="adv-scroll-container" style="flex:1; min-height: 50px; overflow-y: auto; padding-right: 5px; margin-right: -5px;">`;

        options.forEach(opt => {
            const isSelected = currentVals.includes(opt);
            const colorClass = state.selectColors[colId][opt] || '';
            const safeOptName = opt.replace(/"/g, '&quot;');
            const escapedOpt = opt.replace(/'/g, "\\'");

            const btnId = `adv-sel-edit-${Date.now()}-${Math.random().toString(36).substr(2,4)}`;

            html += `
            <div class="adv-menu-item adv-select-item ${isSelected ? 'active' : ''}" style="padding-right:4px;">
                <div style="display:flex; align-items:center; flex:1; min-width:0; overflow:hidden;" title="${isSelected ? 'Clicca per rimuovere' : 'Clicca per selezionare'}" onclick="event.stopPropagation(); AdvancedTable.toggleSelectValue('${tableId}', '${rowId}', '${colId}', '${escapedOpt}')">
                    <span class="adv-select-pill ${colorClass}" style="margin:0; max-width:${isSelected ? '85%' : '95%'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" data-opt-name="${safeOptName}">${opt.replace(/</g, '&lt;')}</span>
                    ${isSelected ? `<span style="margin-left:auto; margin-right:8px; opacity:0.5; display:inline-flex; align-items:center; pointer-events:none;">${svgCloseSel}</span>` : ''}
                </div>
                <button id="${btnId}" class="adv-icon-btn" style="padding:4px; margin:0; color:currentColor; flex-shrink:0;" title="Opzioni Etichetta" onclick="AdvancedTable.openSelectEditMenu(event, this, '${tableId}', '${rowId}', '${colId}', '${escapedOpt}', '${parentAnchorId}')">
                    ${svgDotsHorizontal}
                </button>
            </div>`;
        });
        html += `</div>`;

        if (col.type === 'select' || (col.type === 'multi-select' && currentVals.length > 0)) {
            html += `<div style="flex-shrink:0; padding-top: 4px; border-top: 1px solid var(--border-color); margin-top: 4px;">`;
            html += `<div class="adv-menu-item" onclick="event.stopPropagation(); AdvancedTable.clearSelect('${tableId}', '${rowId}', '${colId}')"><em>Svuota Cella</em></div>`;
            html += `</div>`;
        }
        dropdown.innerHTML = html;
    },

    filterSelectOptions: (searchTerm) => {
        const lowerTerm = searchTerm.toLowerCase();
        const items = document.querySelectorAll('#advSelectOptionsContainer .adv-select-item');
        let visibleCount = 0;

        items.forEach(item => {
            const text = item.querySelector('.adv-select-pill').innerText.toLowerCase();
            if (text.includes(lowerTerm)) {
                item.style.display = 'flex';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });

        const noOpts = document.getElementById('advSelectNoOptions');
        if (noOpts) {
            noOpts.style.display = visibleCount === 0 ? 'block' : 'none';
        }
    },

    createSelectOptionFromInput: (tableId, rowId, colId, value) => {
        const newOpt = value.trim();
        if (!newOpt) return;

        // Azzeramento garantito di tutti gli input advCreateSelectInput presenti nel documento
        document.querySelectorAll('#advCreateSelectInput').forEach(el => {
            el.value = '';
        });
        
        let state = AdvancedTable.getState(tableId);
        const options = state.selectOptions[colId] || [];
        
        if (!options.includes(newOpt)) {
            AdvancedTable.createSelectOption(tableId, rowId, colId, newOpt);
        } else {
            AdvancedTable.toggleSelectValue(tableId, rowId, colId, newOpt);
        }
    },

    openSelectEditMenu: (e, btnElement, tableId, rowId, colId, optName, parentAnchorId) => {
        if (e) e.stopPropagation();
        
        document.querySelectorAll('.adv-select-edit-menu').forEach(el => el.remove());

        const state = AdvancedTable.getState(tableId);
        const dropdown = document.createElement('div');
        dropdown.className = 'adv-dropdown adv-context-menu adv-select-edit-menu';
        dropdown.style.minWidth = '180px';
        dropdown.style.padding = '8px';
        
        const safeOptName = optName.replace(/"/g, '&quot;');
        const escapedOpt = optName.replace(/'/g, "\\'");

        let html = `
            <div class="adv-dropdown-title" style="margin-bottom:5px;">Modifica Nome</div>
            <input type="text" class="adv-dropdown-input" value="${safeOptName}" placeholder="Nome..." onkeydown="event.stopPropagation(); if(event.key==='Enter') { event.preventDefault(); AdvancedTable.renameSelectOption(event, '${tableId}', '${colId}', '${escapedOpt}', this.value); }">
            <div class="adv-dropdown-title" style="margin-top:10px; margin-bottom:5px;">Colore</div>
            <div class="color-grid" style="grid-template-columns: repeat(5, 1fr); gap:6px; margin-bottom:10px;">
        `;

        AdvancedTable.pillColors.forEach(color => {
            const displayClass = color || 'default-color';
            const isColorSelected = state.selectColors[colId][optName] === color;
            html += `<div class="adv-select-pill ${displayClass}" 
                            style="width:20px; height:20px; padding:0; border-radius:4px; cursor:pointer; margin:0; ${isColorSelected ? 'outline:2px solid var(--accent-color); outline-offset:1px;' : ''}" 
                            title="${color || 'Nessuno'}" 
                            onclick="event.stopPropagation(); AdvancedTable.setTagColor(event, '${tableId}', '${rowId}', '${colId}', '${escapedOpt}', '${color}', '${parentAnchorId}')"></div>`;
        });

        html += `
            </div>
            <div class="adv-menu-divider"></div>
            <button class="adv-menu-btn" style="color:var(--danger-color); background:rgba(239, 68, 68, 0.1); display:flex; align-items:center; justify-content:center; gap:5px;" onclick="event.stopPropagation(); AdvancedTable.deleteSelectOption(event, '${tableId}', '${colId}', '${escapedOpt}')">
                ${svgTrashSel} Elimina Opzione
            </button>
        `;

        dropdown.innerHTML = html;
        document.body.appendChild(dropdown);
        
        UI.Menu.positionAt(dropdown, btnElement.id);
    },

    renameSelectOption: (e, tableId, colId, oldName, newNameValue) => {
        if (e) e.stopPropagation();

        const newName = newNameValue.trim();
        if (!newName || newName === oldName) return;

        let state = AdvancedTable.getState(tableId);

        if (state.selectOptions[colId].includes(newName)) {
            alert(`L'opzione "${newName}" esiste già!`);
            return;
        }

        const optIndex = state.selectOptions[colId].indexOf(oldName);
        if (optIndex > -1) state.selectOptions[colId][optIndex] = newName;

        // Ordina alfabeticamente l'elenco dopo ogni rinomina
        state.selectOptions[colId].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));

        if (state.selectColors[colId][oldName]) {
            state.selectColors[colId][newName] = state.selectColors[colId][oldName];
            delete state.selectColors[colId][oldName];
        }

        const colType = state.columns.find(c => c.id === colId).type;
        state.rows.forEach(r => {
            let val = r.cells[colId];
            if (colType === 'multi-select' && Array.isArray(val)) {
                if (val.includes(oldName)) {
                    r.cells[colId] = val.map(v => v === oldName ? newName : v);
                    r.updatedAt = Date.now();
                }
            } else if (colType === 'select' && val === oldName) {
                r.cells[colId] = newName;
                r.updatedAt = Date.now();
            }
        });

        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
        UI.Menu.closeAll(true);
    },

    setTagColor: (e, tableId, rowId, colId, optName, newColorClass, parentAnchorId) => {
        if (e) e.stopPropagation();
        let state = AdvancedTable.getState(tableId);
        if (!state) return;

        if (!state.selectColors) state.selectColors = {};
        if (!state.selectColors[colId]) state.selectColors[colId] = {};

        state.selectColors[colId][optName] = newColorClass;
        AdvancedTable.setState(tableId, state);

        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();

        // Riapre il menu a tendina solo se è presente un'ancora visibile reale nel DOM
        const hasAnchor = parentAnchorId || document.getElementById(`adv-sel-${tableId}-${rowId}-${colId}`) || document.getElementById(`adv-sel-rec-${tableId}-${rowId}-${colId}`);
        if (hasAnchor) {
            AdvancedTable.openSelectMenu(null, tableId, rowId, colId, parentAnchorId);
        }
    },

    createSelectOption: (tableId, rowId, colId, newOpt) => {
        let state = AdvancedTable.getState(tableId);
        if (!state.selectOptions[colId]) state.selectOptions[colId] = [];
        
        if (!state.selectOptions[colId].includes(newOpt)) {
            state.selectOptions[colId].push(newOpt);
        }

        // Ordina alfabeticamente l'elenco da A alla Z in modo persistente
        state.selectOptions[colId].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));

        if (!state.selectColors) state.selectColors = {};
        if (!state.selectColors[colId]) state.selectColors[colId] = {};
        if (!state.selectColors[colId][newOpt]) {
            state.selectColors[colId][newOpt] = 'hl-c1';
        }

        AdvancedTable.setState(tableId, state);
        AdvancedTable.toggleSelectValue(tableId, rowId, colId, newOpt);
    },

    deleteSelectOption: (e, tableId, colId, optToDelete) => {
        e.stopPropagation();
        if (!confirm(`Eliminare l'opzione "${optToDelete}" da tutto il database?`)) return;
        let state = AdvancedTable.getState(tableId);

        state.selectOptions[colId] = state.selectOptions[colId].filter(o => o !== optToDelete);
        delete state.selectColors[colId][optToDelete];

        const colType = state.columns.find(c => c.id === colId).type;
        state.rows.forEach(r => {
            let val = r.cells[colId];
            if (colType === 'multi-select' && Array.isArray(val)) {
                let newVal = val.filter(v => v !== optToDelete);
                r.cells[colId] = newVal;
                r.updatedAt = Date.now();
            }
            else if (colType === 'select' && val === optToDelete) {
                r.cells[colId] = '';
                r.updatedAt = Date.now();
            }
        });

        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
        UI.Menu.closeAll(true);
    },

    toggleSelectValue: (tableId, rowId, colId, value) => {
        let state = AdvancedTable.getState(tableId);
        const col = state.columns.find(c => c.id === colId);
        const row = state.rows.find(r => r.id === rowId);

        let finalValue = value;

        if (col.type === 'select') {
            if (row && row.cells[colId] === value) {
                finalValue = '';
            } else {
                finalValue = value;
            }
            UI.Menu.closeAll(true);
        } else if (col.type === 'multi-select') {
            let current = (row && Array.isArray(row.cells[colId])) ? [...row.cells[colId]] : [];
            if (current.includes(value)) current = current.filter(v => v !== value);
            else current.push(value);
            finalValue = current;
        }

        AdvancedTable.updateData(tableId, rowId, colId, finalValue);

        const drawer = document.getElementById('advGlobalDrawer');
        const drawerTitle = document.getElementById('advDrawerTitle');
        if (drawer && drawer.classList.contains('open') && drawerTitle && drawerTitle.innerText.includes('Dettaglio Record')) {
            AdvancedTable.openRecordView(tableId, rowId);
        }

        const dropdown = document.getElementById('advSelectDropdown');
        if (dropdown && col.type === 'multi-select') {
            state = AdvancedTable.getState(tableId);
            
            if (!state.selectOptions[colId]) state.selectOptions[colId] = [];
            state.selectOptions[colId].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
            const options = [...state.selectOptions[colId]];
            
            const freshRow = state.rows.find(r => r.id === rowId);
            let currentVals = (freshRow && freshRow.cells) ? freshRow.cells[colId] : [];
            if (!Array.isArray(currentVals)) currentVals = currentVals ? [currentVals] : [];
            
            AdvancedTable.renderSelectMenuContent(dropdown, tableId, rowId, colId, state, options, currentVals, col, null);
            
            document.querySelectorAll('#advCreateSelectInput').forEach(input => {
                input.value = ''; // Svuota completamente l'input per il prossimo inserimento
                input.focus();
            });
            AdvancedTable.filterSelectOptions(''); // Ripristina la visibilità di tutte le opzioni
        }
    },

    clearSelect: (tableId, rowId, colId) => {
        let state = AdvancedTable.getState(tableId);
        const col = state.columns.find(c => c.id === colId);

        const finalValue = col.type === 'multi-select' ? [] : '';
        AdvancedTable.updateData(tableId, rowId, colId, finalValue);
        
        const drawer = document.getElementById('advGlobalDrawer');
        const drawerTitle = document.getElementById('advDrawerTitle');
        if (drawer && drawer.classList.contains('open') && drawerTitle && drawerTitle.innerText.includes('Dettaglio Record')) {
            AdvancedTable.openRecordView(tableId, rowId);
        }
        
        UI.Menu.closeAll(true);
    }
});