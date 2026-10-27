/**
 * js/AdvancedTable/advanced-table-select.js
 * Isolamento gestione Tipi Select (Singola, Multipla, Colori, Opzioni) con UI Stile Notion.
 * Riapertura reattiva della vista record tramite stato AdvancedTable.activeRecordId === rowId.
 * Logica di ricalcolo ancoraggio per i menu ricostruiti all'interno del Drawer.
 * Ordinamento avanzato: all'apertura mostra prima i tag selezionati (A-Z) e poi quelli disponibili (A-Z).
 * Eliminato il superfluo pulsante "Svuota Cella": le selezioni si gestiscono con toggle pulito (Notion style).
 * Sottomenu modifica opzione (tre puntini) con chiusura automatica immediata al click esterno.
 * Evidenziazione completa dell'intera riga per le opzioni selezionate (.adv-select-item.active) con sfondo dedicato,
 * bordo d'accento e indicatore di spunta chiaro per massima leggibilità a colpo d'occhio.
 * FIX MODAL PEAK ELEVATION: Supporto per z-index elevato (100005 e 100010) e sincronizzazione visiva istantanea
 * della cella all'interno del Quick Peek Modal (#advRelationPeekModalOverlay).
 */

const svgDotsHorizontal = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><circle cx="5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle></svg>`;
const svgTrashSel = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
const svgCheckSel = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

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

        if (!state.selectOptions) state.selectOptions = {};
        if (!state.selectOptions[colId]) state.selectOptions[colId] = [];
        
        // Ordina alfabeticamente la sorgente dati persistente
        state.selectOptions[colId].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));

        if (!state.selectColors) state.selectColors = {};
        if (!state.selectColors[colId]) state.selectColors[colId] = {};

        let currentVals = (row && row.cells) ? row.cells[colId] : [];
        if (!Array.isArray(currentVals)) currentVals = currentVals ? [currentVals] : [];

        // ORDINAMENTO BILANCIATO UX: Prima i selezionati (A-Z), poi i non selezionati (A-Z)
        const selectedGroup = [];
        const unselectedGroup = [];

        state.selectOptions[colId].forEach(opt => {
            if (currentVals.includes(opt)) selectedGroup.push(opt);
            else unselectedGroup.push(opt);
        });

        const partitionedOptions = [...selectedGroup, ...unselectedGroup];

        const dropdown = document.createElement('div');
        dropdown.className = 'adv-dropdown adv-context-menu';
        dropdown.id = 'advSelectDropdown';
        dropdown.style.padding = '8px';
        dropdown.style.display = 'flex';
        dropdown.style.flexDirection = 'column';

        dropdown.onmousedown = (ev) => ev.stopPropagation();
        dropdown.onclick = (ev) => ev.stopPropagation();

        // Eleva lo z-index sopra la modale Quick Peek se aperta
        const peekOverlay = document.getElementById('advRelationPeekModalOverlay');
        if (peekOverlay) {
            dropdown.style.zIndex = '100005';
        }

        // Rilevamento Intelligente dell'Ancora DOM
        let anchorId = explicitAnchorId;
        if (!anchorId && e && e.currentTarget) {
            anchorId = e.currentTarget.id;
        }
        
        if (!anchorId) {
            const drawer = document.getElementById('advGlobalDrawer');
            if (drawer && drawer.classList.contains('open')) {
                anchorId = `adv-sel-rec-${tableId}-${rowId}-${colId}`;
            } else {
                anchorId = `adv-sel-${tableId}-${rowId}-${colId}`;
            }
        }

        dropdown.setAttribute('data-anchor-id', anchorId || '');

        AdvancedTable.renderSelectMenuContent(dropdown, tableId, rowId, colId, state, partitionedOptions, currentVals, col, anchorId);
        document.body.appendChild(dropdown);
        
        UI.Menu.positionAt(dropdown, anchorId);
        
        setTimeout(() => {
            const input = document.getElementById('advCreateSelectInput');
            if (input) input.focus();
        }, 50);
    },

    renderSelectMenuContent: (dropdown, tableId, rowId, colId, state, options, currentVals, col, parentAnchorId) => {

        let html = `<div style="flex-shrink:0;">`; 
        html += `<div class="adv-dropdown-title">${I18n.t('adv_select.search_create_title')}</div>`;
        html += `<input type="text" class="adv-dropdown-input" id="advCreateSelectInput" placeholder="${I18n.t('adv_select.search_placeholder')}" 
                       oninput="AdvancedTable.filterSelectOptions(this.value)" 
                       onkeydown="if(event.key === 'Enter') { event.preventDefault(); AdvancedTable.createSelectOptionFromInput('${tableId}', '${rowId}', '${colId}', this.value); } event.stopPropagation();">`;
        html += `<div class="adv-dropdown-title" style="margin-top:5px;">${I18n.t('adv_select.options_title')}</div>`;
        
        if (options.length === 0) {
            html += `<div id="advSelectNoOptions" style="font-size:0.8rem; color:var(--text-secondary); padding:4px;">${I18n.t('adv_select.no_options')}</div>`;
        }
        html += `</div>`; 

        html += `<div id="advSelectOptionsContainer" class="adv-scroll-container" style="flex:1; min-height: 50px; overflow-y: auto; padding-right: 5px; margin-right: -5px; display:flex; flex-direction:column; gap:2px;">`;

        options.forEach(opt => {
            const isSelected = currentVals.includes(opt);
            const colorClass = state.selectColors[colId][opt] || '';
            const safeOptName = opt.replace(/"/g, '&quot;');
            const escapedOpt = opt.replace(/'/g, "\\'");

            const btnId = `adv-sel-edit-${Date.now()}-${Math.random().toString(36).substr(2,4)}`;

            // EVIDENZIAZIONE DELL'INTERA RIGA SELEZIONATA:
            const activeRowStyle = isSelected
                ? 'background: rgba(37, 99, 235, 0.08); font-weight: 600;'
                : 'background: transparent;';

            html += `
            <div class="adv-menu-item adv-select-item ${isSelected ? 'active' : ''}" 
                 style="padding: 4px 6px 4px 8px; border-radius: 4px; transition: background 0.15s ease; ${activeRowStyle}">
                <div style="display:flex; align-items:center; flex:1; min-width:0; overflow:hidden; gap:8px;" 
                     onclick="event.stopPropagation(); AdvancedTable.toggleSelectValue('${tableId}', '${rowId}', '${colId}', '${escapedOpt}')">
                    
                    <span class="adv-select-pill ${colorClass}" style="margin:0; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" data-opt-name="${safeOptName}">
                        ${opt.replace(/</g, '&lt;')}
                    </span>

                    ${isSelected ? `
                        <span style="margin-left:auto; color:var(--accent-color); display:inline-flex; align-items:center; flex-shrink:0; pointer-events:none;">
                            ${svgCheckSel}
                        </span>
                    ` : ''}
                </div>
                <button id="${btnId}" class="adv-icon-btn" style="padding:4px; margin:0 0 0 4px; color:currentColor; flex-shrink:0;" title="${I18n.t('adv_select.label_options')}" onclick="AdvancedTable.openSelectEditMenu(event, this, '${tableId}', '${rowId}', '${colId}', '${escapedOpt}', '${parentAnchorId}')">
                    ${svgDotsHorizontal}
                </button>
            </div>`;
        });
        html += `</div>`;

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

    createSelectOptionFromInput: async (tableId, rowId, colId, value) => {
        const newOpt = value.trim();
        if (!newOpt) return;

        document.querySelectorAll('#advCreateSelectInput').forEach(el => {
            el.value = '';
        });
        
        let state = AdvancedTable.getState(tableId);
        const options = state.selectOptions[colId] || [];
        
        if (!options.includes(newOpt)) {
            await AdvancedTable.createSelectOption(tableId, rowId, colId, newOpt);
        } else {
            await AdvancedTable.toggleSelectValue(tableId, rowId, colId, newOpt);
        }
    },

    openSelectEditMenu: (e, btnElement, tableId, rowId, colId, optName, parentAnchorId) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        
        // Rimuove eventuali sottomenu già aperti
        document.querySelectorAll('.adv-select-edit-menu').forEach(el => el.remove());

        const state = AdvancedTable.getState(tableId);
        const dropdown = document.createElement('div');
        dropdown.className = 'adv-dropdown adv-context-menu adv-select-edit-menu';
        dropdown.style.minWidth = '180px';
        dropdown.style.padding = '8px';
        
        const peekOverlay = document.getElementById('advRelationPeekModalOverlay');
        dropdown.style.zIndex = peekOverlay ? '100010' : '10005';
        
        const safeOptName = optName.replace(/"/g, '&quot;');
        const escapedOpt = optName.replace(/'/g, "\\'");

        let html = `
            <div class="adv-dropdown-title" style="margin-bottom:5px;">${I18n.t('adv_select.edit_name_title')}</div>
            <input type="text" class="adv-dropdown-input" value="${safeOptName}" placeholder="${I18n.t('adv_select.name_placeholder')}" onkeydown="event.stopPropagation(); if(event.key==='Enter') { event.preventDefault(); AdvancedTable.renameSelectOption(event, '${tableId}', '${colId}', '${escapedOpt}', this.value); }">
            <div class="adv-dropdown-title" style="margin-top:10px; margin-bottom:5px;">${I18n.t('adv_select.color_title')}</div>
            <div class="color-grid" style="grid-template-columns: repeat(5, 1fr); gap:6px; margin-bottom:10px;">
        `;

        AdvancedTable.pillColors.forEach(color => {
            const displayClass = color || 'default-color';
            const isColorSelected = state.selectColors[colId][optName] === color;
            html += `<div class="adv-select-pill ${displayClass}" 
                            style="width:20px; height:20px; padding:0; border-radius:4px; cursor:pointer; margin:0; ${isColorSelected ? 'outline:2px solid var(--accent-color); outline-offset:1px;' : ''}" 
                            title="${color || I18n.t('common.none')}" 
                            onclick="event.stopPropagation(); AdvancedTable.setTagColor(event, '${tableId}', '${rowId}', '${colId}', '${escapedOpt}', '${color}', '${parentAnchorId}')"></div>`;
        });

        html += `
            </div>
            <div class="adv-menu-divider"></div>
            <button class="adv-menu-btn" style="color:var(--danger-color); background:rgba(239, 68, 68, 0.1); display:flex; align-items:center; justify-content:center; gap:5px;" onclick="event.stopPropagation(); AdvancedTable.deleteSelectOption(event, '${tableId}', '${colId}', '${escapedOpt}')">
                ${svgTrashSel} ${I18n.t('adv_select.delete_option')}
            </button>
        `;

        dropdown.innerHTML = html;
        document.body.appendChild(dropdown);
        
        UI.Menu.positionAt(dropdown, btnElement.id);

        // CHIUSURA DETERMINISTICA AL CLICK ESTERNO (Outside Click Handler)
        const closeOnOutsideClick = (event) => {
            if (!dropdown.contains(event.target) && event.target !== btnElement && !btnElement.contains(event.target)) {
                dropdown.remove();
                document.removeEventListener('pointerdown', closeOnOutsideClick, true);
            }
        };
        setTimeout(() => {
            document.addEventListener('pointerdown', closeOnOutsideClick, true);
        }, 10);
    },

    renameSelectOption: (e, tableId, colId, oldName, newNameValue) => {
        if (e) e.stopPropagation();

        const newName = newNameValue.trim();
        if (!newName || newName === oldName) return;

        let state = AdvancedTable.getState(tableId);

        if (state.selectOptions[colId].includes(newName)) {
            alert(I18n.t('adv_select.alert_option_exists', { name: newName }));
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
        const peekOverlay = document.getElementById('advRelationPeekModalOverlay');
        const hasAnchor = parentAnchorId || 
                          (peekOverlay && Array.from(peekOverlay.querySelectorAll('.adv-select-container, [id]')).find(el => el.id === `adv-sel-${tableId}-${rowId}-${colId}`)) ||
                          document.getElementById(`adv-sel-${tableId}-${rowId}-${colId}`) || 
                          document.getElementById(`adv-sel-rec-${tableId}-${rowId}-${colId}`);
        if (hasAnchor) {
            AdvancedTable.openSelectMenu(null, tableId, rowId, colId, parentAnchorId);
        }
    },

    createSelectOption: async (tableId, rowId, colId, newOpt) => {
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

        const col = state.columns.find(c => c.id === colId);
        const row = state.rows.find(r => r.id === rowId);

        let finalValue;
        if (col.type === 'select') {
            finalValue = newOpt;
        } else {
            let current = (row && Array.isArray(row.cells[colId])) ? [...row.cells[colId]] : [];
            if (!current.includes(newOpt)) current.push(newOpt);
            finalValue = current;
        }

        await AdvancedTable.updateData(tableId, rowId, colId, finalValue);

        const drawer = document.getElementById('advGlobalDrawer');
        if (drawer && drawer.classList.contains('open') && AdvancedTable.activeRecordId === rowId) {
            AdvancedTable.openRecordView(tableId, rowId);
        }

        // Aggiornamento reattivo nella modale Quick Peek se aperta
        const peekModal = document.getElementById('advRelationPeekModalOverlay');
        if (peekModal) {
            const targetCellId = `adv-sel-${tableId}-${rowId}-${colId}`;
            const peekContainer = Array.from(peekModal.querySelectorAll('.adv-select-container')).find(el => el.id === targetCellId);
            if (peekContainer) {
                let content = '';
                let vals = Array.isArray(finalValue) ? [...finalValue] : (finalValue ? [finalValue] : []);
                if (col.type === 'multi-select' && vals.length > 0) {
                    vals.sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true, sensitivity: 'base'}));
                }
                if (vals.length > 0) {
                    vals.forEach(v => {
                        let colorClass = state.selectColors && state.selectColors[col.id] && state.selectColors[col.id][v] ? state.selectColors[col.id][v] : '';
                        content += `<span class="adv-select-pill ${colorClass}" data-opt-name="${String(v).replace(/"/g, '&quot;')}">${v}</span>`;
                    });
                } else {
                    content = `<span class="adv-select-empty">${I18n.t('common.empty')}</span>`;
                }
                peekContainer.innerHTML = content;
            }
            if (AdvancedTable._activeRelationPeek) {
                AdvancedTable._activeRelationPeek.isDirty = true;
            }
        }

        // COMPORTAMENTO DIFFERENZIATO:
        // 1. SELECT SINGOLA: chiusura immediata perché la selezione è completata
        if (col.type === 'select') {
            UI.Menu.closeAll(true);
            return;
        }

        // 2. MULTI-SELECT: il menu rimane aperto, mostra il nuovo elemento selezionato (✓) e azzera il campo di ricerca
        const dropdown = document.getElementById('advSelectDropdown');
        if (dropdown) {
            state = AdvancedTable.getState(tableId);
            const freshRow = state.rows.find(r => r.id === rowId);

            let currentVals = (freshRow && freshRow.cells) ? freshRow.cells[colId] : [];
            if (!Array.isArray(currentVals)) currentVals = currentVals ? [currentVals] : [];

            const selectedGroup = [];
            const unselectedGroup = [];

            state.selectOptions[colId].forEach(opt => {
                if (currentVals.includes(opt)) selectedGroup.push(opt);
                else unselectedGroup.push(opt);
            });

            const partitionedOptions = [...selectedGroup, ...unselectedGroup];
            const anchorId = dropdown.getAttribute('data-anchor-id') || null;

            AdvancedTable.renderSelectMenuContent(dropdown, tableId, rowId, colId, state, partitionedOptions, currentVals, col, anchorId);
            
            if (peekModal) {
                dropdown.style.zIndex = '100005';
            }

            document.querySelectorAll('#advCreateSelectInput').forEach(input => {
                input.value = '';
                input.focus();
            });
            AdvancedTable.filterSelectOptions('');
        }
    },

    deleteSelectOption: (e, tableId, colId, optToDelete) => {
        e.stopPropagation();
        if (!confirm(I18n.t('adv_select.confirm_delete_option', { name: optToDelete }))) return;
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

    toggleSelectValue: async (tableId, rowId, colId, value) => {
        let state = AdvancedTable.getState(tableId);
        const col = state.columns.find(c => c.id === colId);
        const row = state.rows.find(r => r.id === rowId);

        let finalValue = value;

        if (col.type === 'select') {
            // TOGGLE PER SELECT SINGOLA: Cliccare sul valore già attivo lo deseleziona svuotando la cella
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

        await AdvancedTable.updateData(tableId, rowId, colId, finalValue);

        const drawer = document.getElementById('advGlobalDrawer');
        if (drawer && drawer.classList.contains('open') && AdvancedTable.activeRecordId === rowId) {
            AdvancedTable.openRecordView(tableId, rowId);
        }

        // AGGIORNAMENTO DINAMICO NELLA MODALE DI ANTEPRIMA RELAZIONI (SE APERTA)
        const peekModal = document.getElementById('advRelationPeekModalOverlay');
        if (peekModal) {
            const targetCellId = `adv-sel-${tableId}-${rowId}-${colId}`;
            const peekContainer = Array.from(peekModal.querySelectorAll('.adv-select-container')).find(el => el.id === targetCellId);
            if (peekContainer) {
                let content = '';
                let vals = Array.isArray(finalValue) ? [...finalValue] : (finalValue ? [finalValue] : []);
                if (col.type === 'multi-select' && vals.length > 0) {
                    vals.sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true, sensitivity: 'base'}));
                }
                if (vals.length > 0) {
                    vals.forEach(v => {
                        let colorClass = state.selectColors && state.selectColors[col.id] && state.selectColors[col.id][v] ? state.selectColors[col.id][v] : '';
                        content += `<span class="adv-select-pill ${colorClass}" data-opt-name="${String(v).replace(/"/g, '&quot;')}">${v}</span>`;
                    });
                } else {
                    content = `<span class="adv-select-empty">${I18n.t('common.empty')}</span>`;
                }
                peekContainer.innerHTML = content;
            }
            if (AdvancedTable._activeRelationPeek) {
                AdvancedTable._activeRelationPeek.isDirty = true;
            }
        }

        const dropdown = document.getElementById('advSelectDropdown');
        if (dropdown && col.type === 'multi-select') {
            state = AdvancedTable.getState(tableId);
            
            if (!state.selectOptions[colId]) state.selectOptions[colId] = [];
            
            // Preserva l'ordine visivo mantenuto dall'apertura per non far "saltare" l'elemento sotto il mouse
            const freshRow = state.rows.find(r => r.id === rowId);
            let currentVals = (freshRow && freshRow.cells) ? freshRow.cells[colId] : [];
            if (!Array.isArray(currentVals)) currentVals = currentVals ? [currentVals] : [];
            
            const currentRenderedOptions = Array.from(dropdown.querySelectorAll('.adv-select-pill'))
                .map(el => el.getAttribute('data-opt-name'))
                .filter(Boolean);

            const optionsToRender = currentRenderedOptions.length > 0 ? currentRenderedOptions : state.selectOptions[colId];
            const anchorId = dropdown.getAttribute('data-anchor-id') || null;

            AdvancedTable.renderSelectMenuContent(dropdown, tableId, rowId, colId, state, optionsToRender, currentVals, col, anchorId);
            
            if (peekModal) {
                dropdown.style.zIndex = '100005';
            }

            document.querySelectorAll('#advCreateSelectInput').forEach(input => {
                input.value = '';
                input.focus();
            });
            AdvancedTable.filterSelectOptions('');
        }
    }
});