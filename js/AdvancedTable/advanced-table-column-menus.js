/**
 * js/AdvancedTable/advanced-table-column-menus.js
 * Menu Contestuali per la singola Colonna: Cambio Tipo, Rinomina, Sposta, Elimina.
 * Configurazione esplicita per relazioni con popup di alert per la prevenzione perdita dati.
 * Gestione dinamica della visibilità del campo (compatibile con griglia e Drawer).
 * Pulizia a cascata dello stato (sort, filtri, viste e formattazione condizionale) su eliminazione colonna.
 * Integrazione del tipo 'note_link' (Collegamento a Nota).
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
            alert("Il database di destinazione non esiste più.");
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

        let optionsHTML = '<option value="">-- Seleziona Proprietà --</option>';
        sourceState.columns.forEach(c => {
            optionsHTML += `<option value="${c.id}" data-type="${c.type}" ${col.backlinkPropertyId === c.id ? 'selected' : ''}>${c.name} (${c.type})</option>`;
        });

        const isChecked = col.backlinkDistinct !== false ? 'checked' : '';
        const aggType = col.backlinkAggType || 'list';

        const bodyHTML = `
            <div style="background: rgba(37, 99, 235, 0.05); padding: 10px; border-radius: 6px; margin-bottom: 15px; font-size: 0.8rem; border: 1px solid rgba(37, 99, 235, 0.2);">
                Invece di mostrare i nomi dei record, questa colonna estrarrà e aggregherà i valori della proprietà che selezionerai qui sotto.
            </div>
            
            <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold; display:block; margin-bottom:5px;">1. Scegli la colonna da "${sourceState.title}":</label>
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
                Rimuovi duplicati (Esegui Distinct)
            </label>

            <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold; display:block; margin-bottom:5px;">2. Operazione da eseguire sui valori trovati:</label>
            <select id="blPropConfigOp" class="modern-input" style="margin-bottom: 20px;">
                <option value="list" ${aggType === 'list' ? 'selected' : ''}>Uniscili in una lista testuale (A, B, C...)</option>
                <option value="count" ${aggType === 'count' ? 'selected' : ''}>Conta Quanti Sono (N. Elementi)</option>
                <option value="sum" ${aggType === 'sum' ? 'selected' : ''} style="display:none;">Sommali Matematicamente (+)</option>
            </select>
        `;

        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">Annulla</button>
            <button class="btn btn-primary" onclick="AdvancedTableColumnMenus.saveBacklinkProperty('${realTableId}', '${colId}')">Salva Aggregazione</button>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.relation} Estrai Proprietà Collegata</span>`, bodyHTML, footerHTML);

        setTimeout(() => {
            const sel = document.getElementById('blPropConfigSelect');
            if (sel) sel.onchange();
        }, 50);
    },

    saveBacklinkProperty: (realTableId, colId) => {
        const propId = document.getElementById('blPropConfigSelect').value;
        const isDistinct = document.getElementById('blPropConfigDistinct').checked;
        const aggType = document.getElementById('blPropConfigOp').value;

        if (!propId) { alert("Seleziona una proprietà."); return; }

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
            if (!confirm("⚠️ ATTENZIONE: Questa colonna contiene già dei collegamenti ad un database.\nSe modifichi il Database di destinazione, tutti i collegamenti attuali verranno cancellati in modo irreversibile.\nSe però modifichi solo il campo che desideri visualizzare senza modificare il Database, tutti i collegamenti attuali verranno mantenuti.\n\nVuoi procedere con la configurazione?")) {
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
                alert("Impossibile nascondere l'unica colonna visibile rimasta.");
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
            { type: 'custom', html: `<div style="font-size:11px; font-weight:bold; color:var(--text-secondary); text-transform:uppercase; padding:4px;">Seleziona Tipo Colonna</div>` },
            { icon: Icons.text, label: 'Testo', onClick: () => AdvancedTable.addColumn(tableId, 'text') },
            { icon: Icons.number, label: 'Numero', onClick: () => AdvancedTable.addColumn(tableId, 'number') },
            { icon: Icons.select, label: 'Select Singola', onClick: () => AdvancedTable.addColumn(tableId, 'select') },
            { icon: Icons.multiSelect, label: 'Multi Select', onClick: () => AdvancedTable.addColumn(tableId, 'multi-select') },
            { icon: Icons.date, label: 'Data (GG/MM/AAAA)', onClick: () => AdvancedTable.addColumn(tableId, 'date') },
            { icon: Icons.date, label: 'Data e Ora', onClick: () => AdvancedTable.addColumn(tableId, 'datetime') },
            { icon: Icons.time, label: 'Solo Ora', onClick: () => AdvancedTable.addColumn(tableId, 'time') },
            { icon: Icons.checkbox, label: 'Checkbox', onClick: () => AdvancedTable.addColumn(tableId, 'checkbox') },
            { icon: Icons.formula, label: 'Formula (Javascript)', onClick: () => AdvancedTable.addColumn(tableId, 'formula') },
            { icon: Icons.relation, label: 'Relazione', onClick: () => AdvancedTable.addColumn(tableId, 'relation') },
            { icon: Icons.rollup, label: 'Rollup (Lookup)', onClick: () => AdvancedTable.addColumn(tableId, 'rollup') },
            { icon: Icons.url, label: 'URL / Link', onClick: () => AdvancedTable.addColumn(tableId, 'url') },
            { icon: Icons.link, label: 'Collegamento a Nota', onClick: () => AdvancedTable.addColumn(tableId, 'note_link') },
            { icon: Icons.recordPage, label: 'Pagina Dedicata', onClick: () => AdvancedTable.addColumn(tableId, 'record_note') },
            { icon: Icons.play, label: 'Pulsante (Macro)', onClick: () => AdvancedTable.addColumn(tableId, 'button') },
            { type: 'divider' },
            { icon: Icons.time, label: 'Data Creazione', onClick: () => AdvancedTable.addColumn(tableId, 'created_time') },
            { icon: Icons.time, label: 'Ultima Modifica', onClick: () => AdvancedTable.addColumn(tableId, 'last_edited_time') }
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
                        <input type="text" class="adv-menu-input" value="${safeName}" placeholder="Rinomina e premi Invio..." id="editColNameInput" onkeydown="event.stopPropagation(); if(event.key === 'Enter') { event.preventDefault(); AdvancedTableColumnMenus.changeColName('${realTableId}', '${colId}'); }" style="margin:0; width:100%; font-weight:bold;">
                    </div>
                `
            },
            { type: 'divider' },
            {
                icon: Icons.noteInline,
                label: col.comment ? 'Modifica Commento...' : 'Aggiungi Commento...',
                onClick: () => AdvancedTableColumnMenus.openColumnCommentModal(realTableId, colId)
            },
            {
                icon: Icons.eyeOff,
                label: 'Campo Nascosto' + (isHidden ? chk : ''),
                disabled: !canHide,
                onClick: () => AdvancedTableColumnMenus.toggleVisibility(tableId, colId)
            },
            { type: 'divider' }
        ];

        if (col.type === 'date' || col.type === 'datetime') {
            menuItems.push({ icon: Icons.time, label: 'Data di Fine' + (col.hasEndDate ? chk : ''), onClick: () => AdvancedTableColumnMenus.toggleEndDate(realTableId, colId) });
            menuItems.push({ type: 'divider' });
        }

        if (col.type === 'relation') {
            menuItems.push({ icon: Icons.relation, label: 'Configura Relazione', onClick: () => AdvancedTableColumnMenus.reconfigureRelation(realTableId, colId) });
            menuItems.push({ icon: Icons.checkSquare, label: 'Limita a 1 solo record' + (col.singleRecord ? chk : ''), onClick: () => AdvancedTableColumnMenus.toggleRelationSingle(realTableId, colId) });
            menuItems.push({ icon: Icons.relation, label: 'Mostra in DB destinazione' + (col.showBacklink ? chk : ''), onClick: () => AdvancedTableColumnMenus.toggleRelationBacklink(realTableId, colId) });
            menuItems.push({ type: 'divider' });
        }

        if (col.type === 'relation_backlink') {
            menuItems.push({
                icon: Icons.eye, label: 'Mostra come...', type: 'submenu',
                items: [
                    { label: 'Elenco Record' + (col.backlinkDisplay === 'list' || !col.backlinkDisplay ? chk : ''), onClick: () => AdvancedTableColumnMenus.setBacklinkDisplay(realTableId, colId, 'list') },
                    { label: 'Conteggio Numerico' + (col.backlinkDisplay === 'count' ? chk : ''), onClick: () => AdvancedTableColumnMenus.setBacklinkDisplay(realTableId, colId, 'count') },
                    { type: 'divider' },
                    { label: 'Proprietà Specifica...' + (col.backlinkDisplay === 'property' ? chk : ''), onClick: () => AdvancedTableColumnMenus.openBacklinkPropertyConfig(realTableId, colId) }
                ]
            });
            menuItems.push({ type: 'divider' });
        }

        if (col.type === 'number' || col.type === 'rollup') {
            const dec = col.decimals !== undefined ? col.decimals : 'default';
            menuItems.push({
                icon: Icons.number, label: 'Formato Decimali', type: 'submenu',
                items: [
                    { label: 'Default' + (dec === 'default' ? chk : ''), onClick: () => AdvancedTableColumnMenus.setColDecimals(realTableId, colId, 'default') },
                    { label: 'Nessun decimale (0)' + (dec === 0 ? chk : ''), onClick: () => AdvancedTableColumnMenus.setColDecimals(realTableId, colId, 0) },
                    { label: '1 Decimale' + (dec === 1 ? chk : ''), onClick: () => AdvancedTableColumnMenus.setColDecimals(realTableId, colId, 1) },
                    { label: '2 Decimali' + (dec === 2 ? chk : ''), onClick: () => AdvancedTableColumnMenus.setColDecimals(realTableId, colId, 2) },
                    { label: '3 Decimali' + (dec === 3 ? chk : ''), onClick: () => AdvancedTableColumnMenus.setColDecimals(realTableId, colId, 3) },
                    { label: '4 Decimali' + (dec === 4 ? chk : ''), onClick: () => AdvancedTableColumnMenus.setColDecimals(realTableId, colId, 4) }
                ]
            });
            menuItems.push({ type: 'divider' });
        }
        
        if (col.type === 'button') {
            menuItems.push({ icon: Icons.settings, label: 'Configura Azioni Pulsante', onClick: () => AdvancedTable.openButtonColConfig(realTableId, colId) });
            menuItems.push({ type: 'divider' });
        }

        const chkType = (type) => col.type === type ? chk : '';

        if (col.type !== 'relation_backlink') {
            menuItems.push(
                {
                    icon: Icons.settings, label: 'Cambia tipo dato', type: 'submenu',
                    items:[
                        { icon: Icons.text, label: 'Testo' + chkType('text'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'text') },
                        { icon: Icons.number, label: 'Numero' + chkType('number'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'number') },
                        { icon: Icons.select, label: 'Select Singola' + chkType('select'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'select') },
                        { icon: Icons.multiSelect, label: 'Multi Select' + chkType('multi-select'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'multi-select') },
                        { icon: Icons.date, label: 'Data (GG/MM/AAAA)' + chkType('date'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'date') },
                        { icon: Icons.date, label: 'Data e Ora' + chkType('datetime'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'datetime') },
                        { icon: Icons.time, label: 'Solo Ora' + chkType('time'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'time') },
                        { icon: Icons.checkbox, label: 'Checkbox' + chkType('checkbox'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'checkbox') },
                        { icon: Icons.formula, label: 'Formula (Javascript)' + chkType('formula'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'formula') },
                        { icon: Icons.relation, label: 'Relazione' + chkType('relation'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'relation') },
                        { icon: Icons.rollup, label: 'Rollup (Lookup)' + chkType('rollup'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'rollup') },
                        { icon: Icons.url, label: 'URL / Link' + chkType('url'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'url') },
                        { icon: Icons.link, label: 'Collegamento a Nota' + chkType('note_link'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'note_link') },
                        { icon: Icons.recordPage, label: 'Pagina Dedicata' + chkType('record_note'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'record_note') },
                        { icon: Icons.play, label: 'Pulsante (Macro)' + chkType('button'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'button') },
                        { type: 'divider' },
                        { icon: Icons.time, label: 'Data Creazione' + chkType('created_time'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'created_time') },
                        { icon: Icons.time, label: 'Ultima Modifica' + chkType('last_edited_time'), onClick: () => AdvancedTableColumnMenus.changeColType(realTableId, colId, 'last_edited_time') }
                    ]
                }
            );
        } else {
            menuItems.push({ type: 'custom', html: '<div style="font-size:0.75rem; color:var(--text-secondary); padding:4px; font-style:italic;">Questa colonna è gestita dall\'app.<br>Cambia le sue impostazioni<br>cliccando su "Mostra come...".</div>' });
        }

        if (col.type === 'formula') menuItems.push({ icon: Icons.formula, label: 'Modifica Formula', onClick: () => AdvancedTable.editFormula(realTableId, colId) });
        else if (col.type === 'rollup') menuItems.push({ icon: Icons.rollup, label: 'Configura Rollup', onClick: () => AdvancedTable.openRollupConfig(realTableId, colId) });

        menuItems.push({ type: 'divider' });

        menuItems.push({
            icon: Icons.moveArrow, label: 'Sposta Colonna', type: 'submenu',
            items:[
                { icon: Icons.arrowLeft, label: 'Sposta prima', disabled: colIndex === 0, onClick: () => AdvancedTableColumnMenus.moveCol(realTableId, colId, -1) },
                { icon: Icons.arrowRight, label: 'Sposta dopo', disabled: colIndex === state.columns.length - 1, onClick: () => AdvancedTableColumnMenus.moveCol(realTableId, colId, 1) }
            ]
        });

        menuItems.push({ type: 'divider' });
        
        const deleteLabel = col.type === 'relation_backlink' ? 'Nascondi Relazione Collegata' : 'Elimina Colonna';
        menuItems.push({ icon: Icons.trash, label: deleteLabel, danger: true, onClick: () => AdvancedTableColumnMenus.deleteCol(realTableId, colId) });

        const anchorId = e && e.currentTarget && e.currentTarget.id ? e.currentTarget.id : `adv-th-${tableId}-${colId}`;
        UI.Menu.buildContextMenu(anchorId, menuItems);

        setTimeout(() => {
            const input = document.getElementById('editColNameInput');
            if (input) { input.focus(); input.select(); }
        }, 50);
    },

    openColumnCommentModal: (tableId, colId) => {
        AdvancedTable.closeDropdowns(true);
        const state = AdvancedTable.getState(tableId);
        const col = state.columns.find(c => c.id === colId);
        const currentComment = col.comment || '';

        const bodyHTML = `
            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 15px; line-height: 1.5;">
                Aggiungi una descrizione o delle note per la colonna <b>${col.name}</b>. Questo testo apparirà come un suggerimento (tooltip) passando il mouse sull'intestazione della tabella.
            </div>
            <textarea id="advColCommentInput" class="modern-input" style="width: 100%; min-height: 120px; resize: vertical; padding: 10px; font-family: inherit; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 6px;" placeholder="Scrivi qui il commento...">${currentComment}</textarea>
        `;

        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">Annulla</button>
            <button class="btn btn-primary" onclick="AdvancedTableColumnMenus.saveColumnComment('${tableId}', '${colId}')">Salva Commento</button>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.noteInline} Commento Colonna</span>`, bodyHTML, footerHTML);

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
        state.columns.find(c => c.id === colId).name = newName;

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
        if (newType === 'relation') {
            AdvancedTable.openRelationConfig(tableId, colId);
            return;
        } else if (newType === 'rollup') {
            AdvancedTable.openRollupConfig(tableId, colId);
            return;
        }

        let state = AdvancedTable.getState(tableId);
        const col = state.columns.find(c => c.id === colId);
        const oldType = col.type;

        if (oldType === newType) return;

        let hasDataLoss = false;

        let formulaValues = {};
        if (oldType === 'formula' || oldType === 'rollup' || oldType === 'relation_backlink') {
            state.rows.forEach(r => {
                const vRow = AdvancedTable.buildVirtualRow(tableId, r, state);
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

        // Pre-valutazione calcolo mappa valori in memoria
        const newSelectOptions = new Set();
        const pendingRowValues = new Map();
        const recordNoteIdsToDelete = [];

        state.rows.forEach(r => {
            let oldVal;
            if (oldType === 'formula' || oldType === 'rollup' || oldType === 'relation_backlink') oldVal = formulaValues[r.id];
            else if (oldType === 'relation' && relationCache[r.id]) oldVal = relationCache[r.id];
            else oldVal = r.cells[colId];

            let newVal = '';

            if (oldType === 'record_note') {
                if (r.cells[colId]) {
                    recordNoteIdsToDelete.push(r.cells[colId]);
                    hasDataLoss = true;
                }
                newVal = '';
            }
            else if (newType === 'created_time' || newType === 'last_edited_time' || newType === 'formula' || newType === 'rollup' || newType === 'record_note' || newType === 'button' || newType === 'note_link') {
                newVal = '';
                if (oldVal !== undefined && oldVal !== null && oldVal !== '' && !(Array.isArray(oldVal) && oldVal.length === 0)) {
                    hasDataLoss = true;
                }
            }
            else if (oldVal === undefined || oldVal === null || oldVal === '') {
                newVal = newType === 'checkbox' ? false : (newType === 'multi-select' ?[] : '');
            }
            else {
                let strVal = '';
                if (Array.isArray(oldVal)) strVal = oldVal.join(', ');
                else if (oldType === 'checkbox') strVal = oldVal ? "Sì" : "No";
                else if (typeof oldVal === 'object' && oldVal.start) strVal = String(oldVal.start).trim();
                else strVal = String(oldVal).trim();

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
                        let parsedDateStr = strVal;
                        if (strVal.includes('/')) {
                            const p = strVal.split(' ')[0].split('/');
                            if (p.length === 3) {
                                parsedDateStr = `${p[2]}-${p[1]}-${p[0]}`;
                                if (strVal.includes(':')) {
                                    parsedDateStr += 'T' + strVal.split(' ')[1];
                                }
                            }
                        }

                        const d = new Date(parsedDateStr);
                        if (!isNaN(d.getTime())) {
                            newVal = newType === 'date' ? d.toISOString().split('T')[0] : d.toISOString().slice(0, 16);
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
            const proceed = confirm("Attenzione: Alcuni dati in questa colonna non sono compatibili con il nuovo formato (o verranno distrutte le pagine associate) e andranno persi. Vuoi procedere comunque?");
            if (!proceed) return;
        }

        // Solo dopo conferma esplicita procediamo all'eliminazione delle pagine fisiche
        if (recordNoteIdsToDelete.length > 0 && typeof UI !== 'undefined' && UI.Trash) {
            recordNoteIdsToDelete.forEach(noteId => {
                UI.Trash.forceHardDeleteRecursive(noteId);
            });
        }

        // Applica i nuovi valori a tutte le righe
        state.rows.forEach(r => {
            if (pendingRowValues.has(r.id)) {
                r.cells[colId] = pendingRowValues.get(r.id);
            }
        });

        col.type = newType;
        if (col.hasEndDate) delete col.hasEndDate;

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

        AdvancedTable.setState(tableId, state);
        
        if (tableId === 'SYS_PROPERTIES_DB' && AdvancedTable.activeRecordId) {
            AdvancedTable.openRecordView(tableId, AdvancedTable.activeRecordId);
        } else {
            AdvancedTable.updateDependentViews(tableId);
            if (AdvancedTable.activeRecordId) {
                const activeTId = AdvancedTable.activeTableId || tableId;
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
            if (!confirm(`Nascondere questa colonna? (L'opzione "Mostra nel database collegato" verrà disattivata nell'origine).`)) {
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
                            if (cDef.type === 'formula' && cDef.formula && cDef.formula.includes(searchPattern)) {
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
            alert(`🚫 IMPOSSIBILE ELIMINARE:\nLa colonna "${col.name}" è attualmente puntata dal database "${pointingTableName}" tramite una Relazione o un Rollup.\n\nRimuovi prima il campo collegato in quel database per poter procedere.`);
            AdvancedTable.closeDropdowns(true);
            return;
        }

        if (isUsedInFormula) {
            if (!confirm(`⚠️ ATTENZIONE: La colonna "${col.name}" è utilizzata all'interno di una o più Formule.\nSe la elimini, smetteranno di funzionare.\n\nSei sicuro di volerla eliminare comunque?`)) {
                AdvancedTable.closeDropdowns(true);
                return;
            }
        } else {
            if (!confirm(`Eliminare intera colonna e tutti i suoi dati?`)) {
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
                const activeTId = AdvancedTable.activeTableId || tableId;
                AdvancedTable.openRecordView(activeTId, AdvancedTable.activeRecordId);
            }
        }
        
        Store.triggerAutoSave();
        AdvancedTable.closeDropdowns(true);
    }
};