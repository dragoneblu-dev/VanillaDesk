/**
 * AdvancedTablePivotMenus.js
 * Interfaccia Utente per la generazione di Linked Views e Tabelle Pivot.
 * FIX VISIBILITÀ: Inserito sottomenu "Visualizza Campo" per nascondere colonne anche nelle Viste Analitiche e Board.
 * FIX CONTROLLI: Reintegrato il comando per abilitare/disabilitare l'aggiunta di nuove righe dalle Viste Collegate.
 */

const AdvancedPivotMenus = {
    pendingConfig: null,
    draggedIndex: null,
    draggedType: null,

    openOptions: (e, tableId) => {
        if (e) e.stopPropagation();
        AdvancedTable.closeDropdowns(true);

        let state = AdvancedTable.getState(tableId);
        if (!state) return;

        const isFreeWidth = state.freeWidth === true;
        const isStriped = state.striped !== false;
        const isFooterHidden = state.hideFooterControls === true;

        const widthLabel = 'Adatta a larghezza pagina&nbsp;' + (!state.freeWidth ? ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>' : '');
        const zebraLabel = 'Righe alternate' + (state.striped !== false ? ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>' : '');
        const footerLabel = 'Piè di pagina (Paginazione)' + (!isFooterHidden ? ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>' : '');

        // --- CALCOLO VISIBILITA' CAMPI ---
        let viewId = 'table';
        if (state.viewType === 'board') viewId = 'board_' + state.boardGroupBy;
        else if (state.viewType === 'calendar') viewId = 'calendar_' + state.calendarDateCol;
        else if (state.viewType === 'timeline') viewId = 'timeline_' + state.timelineDateCol;

        const hiddenList = state.viewConfig && state.viewConfig[viewId] ? state.viewConfig[viewId].hiddenCols : [];
        const visibleItems = [];
        const hiddenItems = [];

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
        // ----------------------------------

        const menuItems =[
            { icon: Icons.eye, label: 'Visualizza campo', type: 'submenu', items: visibilityItems },
            { type: 'divider' },
            { icon: Icons.widthFit, label: widthLabel, onClick: () => AdvancedTable.toggleFreeWidth(tableId) },
            { icon: Icons.zebra, label: zebraLabel, onClick: () => AdvancedPivotMenus.toggleZebra(tableId) }
        ];

        // FIX: Reintegrato il toggle per i controlli a pié di pagina (Solo per Viste normali, non Pivot)
        if (!state.isPivot) {
            menuItems.push({ icon: Icons.layoutAuto, label: footerLabel, onClick: () => AdvancedTableMenus.toggleFooterControls(tableId) });
        }

        menuItems.push({ type: 'divider' });

        if (state.isPivot) {
            menuItems.push({ icon: Icons.settings, label: 'Modifica Vista Analitica', onClick: () => AdvancedPivotMenus.openCreateWizard(tableId, false) });
            menuItems.push({ type: 'divider' });
        }

        if (state.sourceTableId) {
            menuItems.push({ icon: Icons.tableDatabase, label: 'Vai al Database Originale', onClick: () => UI.jumpToWidget(state.sourceTableId) });
            menuItems.push({ type: 'divider' });
        }

        menuItems.push({ icon: Icons.export, label: 'Esporta come CSV', onClick: () => AdvancedTable.exportCSV(tableId) });
        menuItems.push({ type: 'divider' });
        
        menuItems.push({ 
            icon: Icons.trash, 
            label: state.isPivot ? 'Elimina Tabella Pivot' : 'Rimuovi Vista Collegata', 
            danger: true, 
            onClick: () => AdvancedTable.deleteTable(tableId) 
        });

        const anchor = e ? e.currentTarget.id : `adv-opt-btn-${tableId}`;
        UI.Menu.buildContextMenu(anchor, menuItems);
    },

    toggleZebra: (tableId) => {
        let state = AdvancedTable.getState(tableId);
        state.striped = state.striped === false ? true : false;
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
    },

    selectChartType: (type) => {
        document.getElementById('pivotChartStyle').value = type;
        document.querySelectorAll('.chart-type-card').forEach(card => {
            if (card.dataset.type === type) {
                card.style.borderColor = 'var(--accent-color)';
                card.style.backgroundColor = 'rgba(37, 99, 235, 0.05)';
                card.querySelector('.chart-type-icon').style.color = 'var(--accent-color)';
            } else {
                card.style.borderColor = 'var(--border-color)';
                card.style.backgroundColor = 'var(--bg-color)';
                card.querySelector('.chart-type-icon').style.color = 'var(--text-secondary)';
            }
        });
    },

    selectPalette: (paletteKey) => {
        document.getElementById('chartColorPalette').value = paletteKey;
        document.querySelectorAll('.palette-card').forEach(card => {
            if (card.dataset.palette === paletteKey) {
                card.style.borderColor = 'var(--accent-color)';
                card.style.backgroundColor = 'rgba(37, 99, 235, 0.05)';
                card.querySelector('.palette-label').style.fontWeight = 'bold';
                card.querySelector('.palette-label').style.color = 'var(--accent-color)';
            } else {
                card.style.borderColor = 'var(--border-color)';
                card.style.backgroundColor = 'transparent';
                card.querySelector('.palette-label').style.fontWeight = 'normal';
                card.querySelector('.palette-label').style.color = 'var(--text-primary)';
            }
        });
    },

    openCreateWizard: (editTableId = null, chartOnlyMode = false) => {
        AdvancedTable.closeDropdowns(true);
        const dbList =[];
        let sourceDbTitle = '';
        let sourceState = null;

        if (AppState.databases) {
            Object.keys(AppState.databases).forEach(id => {
                const s = AppState.databases[id];
                if (s && !s.isPivot && !s.isLinkedView && s.columns && !id.includes('adv_code_') && !id.includes('adv_btnbar_') && !id.includes('adv_cols_') && !id.includes('adv_journal_')) {
                    dbList.push({ id: id, title: s.title || 'Database' });
                }
            });
        }

        AdvancedPivotMenus.pendingConfig = {
            tableId: editTableId,
            sourceId: null,
            groupBy: [],
            aggregations:[],
            chartConfig: { visible: false, type: 'bar', stacked: false, showLabels: true, centerTotal: true, legendPos: 'bottom', colorPalette: 'default' }
        };

        let isEditing = false;
        if (editTableId) {
            const state = AdvancedTable.getState(editTableId);
            if (state && state.isPivot) {
                isEditing = true;
                AdvancedPivotMenus.pendingConfig.sourceId = state.sourceTableId;
                AdvancedPivotMenus.pendingConfig.groupBy = [...state.groupBy];
                AdvancedPivotMenus.pendingConfig.aggregations = JSON.parse(JSON.stringify(state.aggregations));
                
                if (state.chartConfig) {
                    AdvancedPivotMenus.pendingConfig.chartConfig = Object.assign(
                        AdvancedPivotMenus.pendingConfig.chartConfig, 
                        JSON.parse(JSON.stringify(state.chartConfig))
                    );
                }

                const dbRef = dbList.find(d => d.id === state.sourceTableId);
                sourceDbTitle = dbRef ? dbRef.title : "Sorgente Eliminata o Non Trovata";
                sourceState = AdvancedTable.getTableState(state.sourceTableId);
            }
        }

        const cCfg = AdvancedPivotMenus.pendingConfig.chartConfig;
        const isChart = cCfg.visible;
        const chartType = cCfg.type || 'bar';
        const legendPos = cCfg.legendPos || 'bottom';
        const currentPalette = cCfg.colorPalette || 'default';

        const svgBar = `<svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="18" y="3" width="4" height="18"></rect><rect x="10" y="8" width="4" height="13"></rect><rect x="2" y="13" width="4" height="8"></rect></svg>`;
        const svgHBar = `<svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="3" y="2" width="18" height="4"></rect><rect x="3" y="10" width="13" height="4"></rect><rect x="3" y="18" width="8" height="4"></rect></svg>`;
        const svgLine = `<svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="1.5" fill="none"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline></svg>`;
        const svgDoughnut = `<svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="4"></circle></svg>`;
        const svgPie = `<svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="9"></circle><path d="M12 12 L12 3 A9 9 0 0 1 21 12 Z" fill="currentColor" opacity="0.3"></path><path d="M12 3v9h9"></path></svg>`;

        const style = getComputedStyle(document.body);
        const palettes = {
            default: [
                style.getPropertyValue('--accent-color').trim() || '#2563eb',
                style.getPropertyValue('--tx-c4').trim() || '#ff8600',
                style.getPropertyValue('--tx-c6').trim() || '#00a856',
                style.getPropertyValue('--tx-c8').trim() || '#853bc7',
                style.getPropertyValue('--tx-c9').trim() || '#c52779',
                style.getPropertyValue('--tx-c3').trim() || '#b15a35'
            ],
            pastel: [1, 2, 3, 4, 5, 6].map(i => style.getPropertyValue(`--chart-pastel-${i}`).trim()),
            vibrant: [1, 2, 3, 4, 5, 6].map(i => style.getPropertyValue(`--chart-vibrant-${i}`).trim()),
            ocean: [1, 2, 3, 4, 5, 6].map(i => style.getPropertyValue(`--chart-ocean-${i}`).trim()),
            sunset: [1, 2, 3, 4, 5, 6].map(i => style.getPropertyValue(`--chart-sunset-${i}`).trim())
        };

        const paletteNames = { default: "Predefinita (Tema App)", pastel: "Morbida (Pastello)", vibrant: "Vibrante (Satura)", ocean: "Oceano (Freddi)", sunset: "Tramonto (Caldi)" };

        let paletteHTML = `<div style="display:flex; flex-direction:column; gap:5px; margin-bottom:15px;">
            <input type="hidden" id="chartColorPalette" value="${currentPalette}">`;

        for (const [key, colors] of Object.entries(palettes)) {
            const isActive = currentPalette === key;
            const colorSquares = colors.map(c => `<div style="width:16px; height:16px; border-radius:3px; background-color:${c}; border:1px solid rgba(0,0,0,0.1);"></div>`).join('');
            
            paletteHTML += `
            <div class="palette-card" data-palette="${key}" onclick="AdvancedPivotMenus.selectPalette('${key}')"
                 style="display:flex; align-items:center; gap:10px; padding:6px 10px; border-radius:4px; border:1px solid ${isActive ? 'var(--accent-color)' : 'var(--border-color)'}; background:${isActive ? 'rgba(37,99,235,0.05)' : 'transparent'}; cursor:pointer; transition:all 0.1s;">
                <div class="palette-label" style="flex:1; font-size:0.8rem; font-weight:${isActive ? 'bold' : 'normal'}; color:${isActive ? 'var(--accent-color)' : 'var(--text-primary)'};">${paletteNames[key]}</div>
                <div style="display:flex; gap:2px;">${colorSquares}</div>
            </div>`;
        }
        paletteHTML += `</div>`;

        let summaryHTML = '';
        if (chartOnlyMode && isEditing) {
            let xLabels = AdvancedPivotMenus.pendingConfig.groupBy.map(id => {
                const c = sourceState?.columns.find(col => col.id === id);
                return c ? c.name : 'Sconosciuta';
            }).join(' + ');

            let yLabels = AdvancedPivotMenus.pendingConfig.aggregations.map(agg => agg.label).join(', ');

            summaryHTML = `
                <div style="background: rgba(0,0,0,0.02); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 20px; font-size:0.8rem;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                        <span style="opacity:0.6; display:inline-flex;">${Icons.tableDatabase}</span> 
                        <span style="color:var(--text-secondary);">Sorgente:</span> <b>${sourceDbTitle}</b>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                        <span style="color:var(--accent-color); display:inline-flex;">${Icons.folder}</span> 
                        <span style="color:var(--text-secondary);">Asse X (Gruppi):</span> <b>${xLabels || 'Nessuno'}</b>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="color:var(--tx-c4); display:inline-flex;">${Icons.formula}</span> 
                        <span style="color:var(--text-secondary);">Asse Y (Metriche):</span> <b>${yLabels || 'Nessuna'}</b>
                    </div>
                </div>
            `;
        }

        const bodyHTML = `
            <div style="display: ${chartOnlyMode ? 'none' : 'block'};">
                <div id="linkedStep1" style="${isEditing ? 'display:none;' : ''}">
                    <label style="font-size:0.8rem; font-weight:bold; color:var(--text-secondary);">1. Scegli il Database Originale:</label>
                    <select id="pivotSourceSelect" class="modern-input" style="margin-bottom:20px; margin-top:5px; width:100%;" onchange="AdvancedPivotMenus.loadSchemaForStep2()">
                        <option value="">-- Seleziona Database --</option>
                        ${dbList.map(db => `<option value="${db.id}">➔ ${db.title}</option>`).join('')}
                    </select>
                </div>

                <div id="linkedStep2" style="display:none;">
                    <label style="font-size:0.8rem; font-weight:bold; color:var(--text-secondary); margin-bottom:10px; display:block;">2. Seleziona il Layout per la Vista Sincronizzata:</label>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom: 20px;" id="linkedViewButtonsArea"></div>
                    <div class="separator-h" style="margin:20px 0;"></div>
                    <label style="font-size:0.8rem; font-weight:bold; color:var(--tx-c4); margin-bottom:10px; display:block;">Vista Analitica (Somme, Raggruppamenti e KPI):</label>
                    <button class="btn" style="width:100%; justify-content:center; padding:15px; border-radius:8px; border:1px dashed var(--tx-c4); background:rgba(255, 134, 0, 0.05);" onclick="AdvancedPivotMenus.showPivotConfig()">
                        <span style="display:flex; flex-direction:column; align-items:center; gap:5px; color:var(--tx-c4);">
                            <span style="font-size:1.5rem; display:inline-flex;">${Icons.tablePivot}</span> Crea Tabella Pivot / Grafico
                        </span>
                    </button>
                </div>

                <div id="pivotStep2" style="${isEditing ? 'display:block;' : 'display:none;'}">
                    ${isEditing ? `
                    <div style="background: rgba(0,0,0,0.02); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border-color); margin-bottom: 15px; font-size:0.8rem;">
                        <span style="color:var(--text-secondary);">Origine Dati Connessa:</span> <b><span style="display:inline-flex; align-items:center; vertical-align:middle; gap:5px;">${Icons.tableDatabase} ${sourceDbTitle}</span></b>
                    </div>
                    ` : ''}

                    <div style="background: rgba(37, 99, 235, 0.05); padding: 15px; border-radius:6px; margin-bottom:15px; border: 1px solid rgba(37, 99, 235, 0.2);">
                        <label style="font-size:0.8rem; font-weight:bold; color:var(--accent-color); display:flex; align-items:center; gap:5px;"><span style="display:inline-flex;">${Icons.folder}</span> Raggruppamenti (Asse X)</label>
                        <div style="display:flex; gap:5px; margin-top:5px; margin-bottom:10px;">
                            <select id="pivotGroupSelect" class="modern-input" style="flex:1; margin:0;"></select>
                            <button class="btn" onclick="AdvancedPivotMenus.addGroup()">+ Aggiungi</button>
                        </div>
                        <div id="pivotGroupList" style="display:flex; flex-direction:column; gap:5px;"></div>
                    </div>

                    <div style="background: rgba(0,0,0,0.02); padding: 15px; border-radius:6px; margin-bottom:20px; border: 1px solid var(--border-color);">
                        <label style="font-size:0.8rem; font-weight:bold; color:var(--text-primary); display:flex; align-items:center; gap:5px;"><span style="display:inline-flex;">${Icons.formula}</span> Metriche Calcolate (Asse Y)</label>
                        <div style="display:flex; gap:5px; margin-top:5px; margin-bottom:10px; align-items:center;">
                            <span style="font-size:0.8rem; color:var(--text-secondary);">Elabora:</span>
                            <select id="pivotAggCol" class="modern-input" style="flex:2; margin:0;" onchange="AdvancedPivotMenus.updateAggTypeOptions()"></select>
                            <span style="font-size:0.8rem; color:var(--text-secondary);">con:</span>
                            <select id="pivotAggType" class="modern-input" style="flex:1; margin:0;"></select>
                            <button class="btn" onclick="AdvancedPivotMenus.addAgg()">+ Aggiungi</button>
                        </div>
                        <div id="pivotAggList" style="display:flex; flex-direction:column; gap:5px;"></div>
                    </div>
                </div> 
            </div> 

            <div style="background: rgba(0,0,0,0.02); padding: 15px; border-radius:6px; margin-bottom:20px; border: 1px solid var(--border-color); ${!isEditing && !chartOnlyMode ? 'display:none;' : ''}" id="pivotVisualSettings">
                
                ${summaryHTML}
                
                <label style="font-size:0.8rem; font-weight:bold; color:var(--text-primary); display:block; margin-bottom:10px;">Visualizzazione Risultato</label>
                
                <select id="pivotDisplayType" class="modern-input" style="width:100%; margin-bottom:10px; font-weight:bold; ${chartOnlyMode ? 'display:none;' : ''}" onchange="AdvancedPivotMenus.toggleChartOptions(this.value)">
                    <option value="table" ${!isChart && !chartOnlyMode ? 'selected' : ''}>🔲 Mostra come Tabella Pivot</option>
                    <option value="chart" ${isChart || chartOnlyMode ? 'selected' : ''}>📊 Mostra come Grafico Visivo</option>
                </select>

                <div id="pivotChartOptions" style="${isChart || chartOnlyMode ? 'display:block;' : 'display:none;'} margin-top:10px; border-top:1px dashed var(--border-color); padding-top:10px;">
                    
                    <label style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-bottom:10px;">Seleziona lo stile del grafico:</label>
                    
                    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px;">
                        <input type="hidden" id="pivotChartStyle" value="${chartType}">
                        <div class="chart-type-card" data-type="bar" onclick="AdvancedPivotMenus.selectChartType('bar')" style="border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: all 0.2s; background: var(--bg-color);">
                            <span class="chart-type-icon" style="color:var(--text-secondary); margin-bottom:5px;">${svgBar}</span><span style="font-size:0.7rem; font-weight:bold; text-align:center;">Barre</span>
                        </div>
                        <div class="chart-type-card" data-type="horizontalBar" onclick="AdvancedPivotMenus.selectChartType('horizontalBar')" style="border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: all 0.2s; background: var(--bg-color);">
                            <span class="chart-type-icon" style="color:var(--text-secondary); margin-bottom:5px;">${svgHBar}</span><span style="font-size:0.7rem; font-weight:bold; text-align:center;">Orizzontali</span>
                        </div>
                        <div class="chart-type-card" data-type="line" onclick="AdvancedPivotMenus.selectChartType('line')" style="border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: all 0.2s; background: var(--bg-color);">
                            <span class="chart-type-icon" style="color:var(--text-secondary); margin-bottom:5px;">${svgLine}</span><span style="font-size:0.7rem; font-weight:bold; text-align:center;">Linea</span>
                        </div>
                        <div class="chart-type-card" data-type="doughnut" onclick="AdvancedPivotMenus.selectChartType('doughnut')" style="border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: all 0.2s; background: var(--bg-color);">
                            <span class="chart-type-icon" style="color:var(--text-secondary); margin-bottom:5px;">${svgDoughnut}</span><span style="font-size:0.7rem; font-weight:bold; text-align:center;">Ciambella</span>
                        </div>
                        <div class="chart-type-card" data-type="pie" onclick="AdvancedPivotMenus.selectChartType('pie')" style="border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: all 0.2s; background: var(--bg-color);">
                            <span class="chart-type-icon" style="color:var(--text-secondary); margin-bottom:5px;">${svgPie}</span><span style="font-size:0.7rem; font-weight:bold; text-align:center;">Torta</span>
                        </div>
                    </div>

                    <label style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-bottom:10px;">Palette Cromatiche:</label>
                    ${paletteHTML}

                    <div style="display:flex; flex-direction:column; gap:12px; border-top: 1px solid var(--border-color); padding-top:15px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:0.8rem; cursor:pointer;">
                            <input type="checkbox" id="chartStacked" style="transform:scale(1.1);" ${cCfg.stacked ? 'checked' : ''}>
                            Raggruppa a blocchi (Stacking) <span style="color:var(--text-secondary); font-size:0.7rem;">(Richiede 2 Raggruppamenti)</span>
                        </label>
                        
                        <label style="display:flex; align-items:center; gap:8px; font-size:0.8rem; cursor:pointer;">
                            <input type="checkbox" id="chartShowLabels" style="transform:scale(1.1);" ${cCfg.showLabels !== false ? 'checked' : ''}>
                            Mostra Valori e Linee guida sul grafico
                        </label>
                        
                        <label style="display:flex; align-items:center; gap:8px; font-size:0.8rem; cursor:pointer;">
                            <input type="checkbox" id="chartCenterTotal" style="transform:scale(1.1);" ${cCfg.centerTotal !== false ? 'checked' : ''}>
                            Mostra Somma Totale al centro <span style="color:var(--text-secondary); font-size:0.7rem;">(Solo Ciambella)</span>
                        </label>

                        <div style="display:flex; align-items:center; gap:8px; margin-top: 5px;">
                            <label style="font-size:0.8rem; color:var(--text-secondary); width:120px;">Posizione Legenda:</label>
                            <select id="chartLegendPos" class="modern-input" style="padding: 4px; font-size: 0.8rem; flex:1;">
                                <option value="bottom" ${legendPos === 'bottom' ? 'selected' : ''}>In Basso</option>
                                <option value="right" ${legendPos === 'right' ? 'selected' : ''}>A Destra</option>
                                <option value="left" ${legendPos === 'left' ? 'selected' : ''}>A Sinistra</option>
                                <option value="none" ${legendPos === 'none' ? 'selected' : ''}>Nascosta</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">Annulla</button>
            <button class="btn btn-primary" onclick="AdvancedPivotMenus.finalizePivot()">${isEditing && !chartOnlyMode ? 'Salva Configurazione' : 'Salva Grafico'}</button>
        `;

        const titleHTML = `<span style="display:flex; align-items:center; gap:5px;"><span style="display:inline-flex;">${Icons.link}</span> ${chartOnlyMode ? 'Personalizza Grafico' : (isEditing ? 'Modifica Vista Analitica' : 'Crea Vista Collegata')}</span>`;
        UI.openDrawer(titleHTML, bodyHTML, footerHTML);

        if (isEditing) {
            setTimeout(() => {
                AdvancedPivotMenus.populateSelectors();
                AdvancedPivotMenus.updateAggTypeOptions();
                AdvancedPivotMenus.renderLists();
                AdvancedPivotMenus.selectChartType(chartType);
                if (!chartOnlyMode) document.getElementById('pivotVisualSettings').style.display = 'block';
            }, 50);
        } else {
            setTimeout(() => {
                AdvancedPivotMenus.selectChartType('bar');
            }, 50);
        }
    },

    toggleChartOptions: (val) => {
        const optDiv = document.getElementById('pivotChartOptions');
        if (optDiv) {
            optDiv.style.display = val === 'chart' ? 'block' : 'none';
        }
    },

    loadSchemaForStep2: () => {
        const sourceId = document.getElementById('pivotSourceSelect').value;
        if (!sourceId) {
            document.getElementById('linkedStep2').style.display = 'none';
            return;
        }

        const sourceState = AdvancedTable.getTableState(sourceId);
        if(!sourceState) return;

        AdvancedPivotMenus.pendingConfig.sourceId = sourceId;
        AdvancedPivotMenus.pendingConfig.groupBy =[];
        AdvancedPivotMenus.pendingConfig.aggregations =[];

        const hasSelect = sourceState.columns.some(c => c.type === 'select');
        const hasCalendarDate = sourceState.columns.some(c => c.type === 'date' || c.type === 'datetime');
        const hasTimelineDate = sourceState.columns.some(c => (c.type === 'date' || c.type === 'datetime') && c.hasEndDate);

        let buttonsHTML = `
            <button class="btn" style="justify-content:center; padding:15px; border-radius:8px; border:1px solid var(--accent-color);" onclick="AdvancedPivotMenus.createLinkedView('table')">
                <span style="display:flex; flex-direction:column; align-items:center; gap:5px; color:var(--accent-color);">
                    <span style="font-size:1.5rem; display:inline-flex;">${Icons.tableDatabase}</span> Tabella
                </span>
            </button>
        `;

        if (hasSelect) {
            buttonsHTML += `
            <button class="btn" style="justify-content:center; padding:15px; border-radius:8px; border:1px solid var(--accent-color);" onclick="AdvancedPivotMenus.createLinkedView('board')">
                <span style="display:flex; flex-direction:column; align-items:center; gap:5px; color:var(--accent-color);">
                    <span style="font-size:1.5rem; display:inline-flex;">${Icons.viewBoard}</span> Bacheca
                </span>
            </button>`;
        } else {
            buttonsHTML += `
            <button class="btn" disabled style="justify-content:center; padding:15px; border-radius:8px; border:1px solid var(--border-color); opacity:0.5;" title="Nessuna colonna 'Select Singola' presente">
                <span style="display:flex; flex-direction:column; align-items:center; gap:5px; color:var(--text-secondary);">
                    <span style="font-size:1.5rem; display:inline-flex;">${Icons.viewBoard}</span> Bacheca
                </span>
            </button>`;
        }

        if (hasCalendarDate) {
            buttonsHTML += `
            <button class="btn" style="justify-content:center; padding:15px; border-radius:8px; border:1px solid var(--accent-color);" onclick="AdvancedPivotMenus.createLinkedView('calendar')">
                <span style="display:flex; flex-direction:column; align-items:center; gap:5px; color:var(--accent-color);">
                    <span style="font-size:1.5rem; display:inline-flex;">${Icons.viewCalendar}</span> Calendario
                </span>
            </button>`;
        } else {
            buttonsHTML += `
            <button class="btn" disabled style="justify-content:center; padding:15px; border-radius:8px; border:1px solid var(--border-color); opacity:0.5;" title="Nessuna colonna 'Data' presente">
                <span style="display:flex; flex-direction:column; align-items:center; gap:5px; color:var(--text-secondary);">
                    <span style="font-size:1.5rem; display:inline-flex;">${Icons.viewCalendar}</span> Calendario
                </span>
            </button>`;
        }

        if (hasTimelineDate) {
            buttonsHTML += `
            <button class="btn" style="justify-content:center; padding:15px; border-radius:8px; border:1px solid var(--accent-color);" onclick="AdvancedPivotMenus.createLinkedView('timeline')">
                <span style="display:flex; flex-direction:column; align-items:center; gap:5px; color:var(--accent-color);">
                    <span style="font-size:1.5rem; display:inline-flex;">${Icons.viewTimeline}</span> Timeline
                </span>
            </button>`;
        } else {
            buttonsHTML += `
            <button class="btn" disabled style="justify-content:center; padding:15px; border-radius:8px; border:1px solid var(--border-color); opacity:0.5;" title="Nessuna colonna 'Data' con opzione 'Data di fine' attivata">
                <span style="display:flex; flex-direction:column; align-items:center; gap:5px; color:var(--text-secondary);">
                    <span style="font-size:1.5rem; display:inline-flex;">${Icons.viewTimeline}</span> Timeline
                </span>
            </button>`;
        }

        document.getElementById('linkedViewButtonsArea').innerHTML = buttonsHTML;
        document.getElementById('linkedStep2').style.display = 'block';
    },

    showPivotConfig: () => {
        document.getElementById('linkedStep2').style.display = 'none';
        document.getElementById('pivotStep2').style.display = 'block';
        document.getElementById('pivotVisualSettings').style.display = 'block';
        AdvancedPivotMenus.populateSelectors();
        AdvancedPivotMenus.updateAggTypeOptions();
        AdvancedPivotMenus.renderLists();
    },

    createLinkedView: (type) => {
        const sourceId = AdvancedPivotMenus.pendingConfig.sourceId;
        if (!sourceId) return;

        const sourceState = AdvancedTable.getTableState(sourceId);
        if (!sourceState) return;

        const tableId = 'adv_link_' + Store.generateId();
        
        let linkedState = {
            title: `Vista di: ${sourceState.title}`,
            isLinkedView: true,
            sourceTableId: sourceId,
            viewType: type,
            freeWidth: false,
            striped: true,
            textClamp: 1,
            filters: {},
            sorts:[],
            viewConfig: {},
            hideFooterControls: true 
        };

        if (type === 'board') {
            const selectCol = sourceState.columns.find(c => c.type === 'select');
            if (selectCol) linkedState.boardGroupBy = selectCol.id;
        } else if (type === 'calendar') {
            const dateCol = sourceState.columns.find(c => c.type === 'date' || c.type === 'datetime');
            if (dateCol) {
                linkedState.calendarDateCol = dateCol.id;
            }
        } else if (type === 'timeline') {
            const timelineDateCol = sourceState.columns.find(c => (c.type === 'date' || c.type === 'datetime') && c.hasEndDate);
            if (timelineDateCol) {
                linkedState.timelineDateCol = timelineDateCol.id;
            }
        }

        let wrapper;
        if (typeof WidgetManager !== 'undefined') {
            wrapper = WidgetManager.createShell('database', tableId);
        } else {
            wrapper = document.createElement('div');
            wrapper.className = 'adv-table-wrapper';
            wrapper.id = tableId;
            wrapper.contentEditable = "false";
        }

        AdvancedTable.setState(tableId, linkedState);

        Editor.restoreSelection();
        const sel = window.getSelection();
        if (sel.rangeCount) {
            let range = sel.getRangeAt(0);
            range.insertNode(wrapper);
            const p = document.createElement('p'); p.innerHTML = '<br>';
            wrapper.parentNode.insertBefore(p, wrapper.nextSibling);
        }

        UI.closeDrawer();
        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
    },

    populateSelectors: () => {
        const sourceState = AdvancedTable.getTableState(AdvancedPivotMenus.pendingConfig.sourceId);
        if (!sourceState || !sourceState.columns) {
            document.getElementById('pivotGroupSelect').innerHTML = '<option value="">-- Non Disponibile --</option>';
            document.getElementById('pivotAggCol').innerHTML = '<option value="">-- Non Disponibile --</option>';
            return;
        }

        let opts = '';
        sourceState.columns.forEach(c => {
            opts += `<option value="${c.id}" data-type="${c.type}">${c.name}</option>`;
        });
        document.getElementById('pivotGroupSelect').innerHTML = opts;
        document.getElementById('pivotAggCol').innerHTML = opts;
    },

    updateAggTypeOptions: () => {
        const colSelect = document.getElementById('pivotAggCol');
        if (!colSelect || colSelect.selectedIndex === -1) return;

        const colType = colSelect.options[colSelect.selectedIndex].getAttribute('data-type');
        const typeSelect = document.getElementById('pivotAggType');

        let html = `<option value="count">Conteggio (N. Record)</option>`;

        if (colType === 'number' || colType === 'formula' || colType === 'rollup') {
            html += `
                <option value="sum">Somma Aritmetica</option>
                <option value="avg">Media Aritmetica</option>
            `;
        }

        html += `
            <option value="max">Trova Valore Massimo</option>
            <option value="min">Trova Valore Minimo</option>
            <option value="list">Uniscili in una Lista Testuale</option>
        `;

        typeSelect.innerHTML = html;
    },

    addGroup: () => {
        const colId = document.getElementById('pivotGroupSelect').value;
        if (!colId) return;
        if (AdvancedPivotMenus.pendingConfig.groupBy.includes(colId)) {
            alert("Questa colonna è già usata per raggruppare."); return;
        }
        AdvancedPivotMenus.pendingConfig.groupBy.push(colId);
        AdvancedPivotMenus.renderLists();
    },

    addAgg: () => {
        const type = document.getElementById('pivotAggType').value;
        const colId = document.getElementById('pivotAggCol').value;
        if (!colId) return;

        const sourceState = AdvancedTable.getTableState(AdvancedPivotMenus.pendingConfig.sourceId);
        const colDef = sourceState.columns.find(c => c.id === colId);

        let label = '';
        if (type === 'count') label = `N. Totale di ${colDef.name}`;
        else if (type === 'sum') label = `Somma di ${colDef.name}`;
        else if (type === 'avg') label = `Media di ${colDef.name}`;
        else if (type === 'max') label = `Max ${colDef.name}`;
        else if (type === 'min') label = `Min ${colDef.name}`;
        else if (type === 'list') label = `Lista di ${colDef.name}`;

        AdvancedPivotMenus.pendingConfig.aggregations.push({
            type: type,
            sourceColId: colId,
            label: label
        });
        AdvancedPivotMenus.renderLists();
    },

    removeItem: (listName, index) => {
        AdvancedPivotMenus.pendingConfig[listName].splice(index, 1);
        AdvancedPivotMenus.renderLists();
    },

    onDragStart: (e, listName, index) => {
        AdvancedPivotMenus.draggedIndex = index;
        AdvancedPivotMenus.draggedType = listName;
        e.dataTransfer.effectAllowed = 'move';
        e.target.closest('.drag-item').style.opacity = '0.4';
    },

    onDragOver: (e, listName) => {
        e.preventDefault();
        if (AdvancedPivotMenus.draggedType !== listName) return;
        const target = e.target.closest('.drag-item');
        if (target) target.style.borderTop = '2px solid var(--accent-color)';
    },

    onDragLeave: (e) => {
        const target = e.target.closest('.drag-item');
        if (target) target.style.borderTop = '1px solid var(--border-color)';
    },

    onDrop: (e, listName, targetIndex) => {
        e.preventDefault();
        const srcIndex = AdvancedPivotMenus.draggedIndex;
        AdvancedPivotMenus.draggedIndex = null;

        if (AdvancedPivotMenus.draggedType !== listName || srcIndex === null || srcIndex === targetIndex) {
            AdvancedPivotMenus.renderLists();
            return;
        }

        const arr = AdvancedPivotMenus.pendingConfig[listName];
        const [item] = arr.splice(srcIndex, 1);

        let newTarget = targetIndex;
        if (srcIndex < targetIndex) newTarget--;

        arr.splice(newTarget, 0, item);
        AdvancedPivotMenus.renderLists();
    },

    renderLists: () => {
        const gList = document.getElementById('pivotGroupList');
        const aList = document.getElementById('pivotAggList');
        const config = AdvancedPivotMenus.pendingConfig;
        const sourceState = AdvancedTable.getTableState(config.sourceId);

        if (config.groupBy.length === 0) {
            if(gList) gList.innerHTML = `<div style="text-align:center; color:var(--danger-color); font-size:0.8rem; padding:10px;">Aggiungi almeno un Raggruppamento per usare i grafici o le pivot!</div>`;
        } else {
            let gHtml = '';
            config.groupBy.forEach((colId, idx) => {
                const name = sourceState?.columns.find(c => c.id === colId)?.name || 'Colonna Non Trovata';
                gHtml += `
                    <div class="drag-item" draggable="true" ondragstart="AdvancedPivotMenus.onDragStart(event, 'groupBy', ${idx})" ondragover="AdvancedPivotMenus.onDragOver(event, 'groupBy')" ondragleave="AdvancedPivotMenus.onDragLeave(event)" ondrop="AdvancedPivotMenus.onDrop(event, 'groupBy', ${idx})" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-color); padding:8px 12px; border:1px solid var(--border-color); border-radius:4px; font-size:0.8rem;">
                        <span style="display:flex; align-items:center;">
                            <span class="widget-drag-handle" style="cursor:grab; opacity:0.3; margin-right:5px; padding:0 4px;" title="Trascina per riordinare">${Icons.dragHandle}</span>
                            <span style="opacity:0.5; font-family:monospace; margin-right:5px; width:15px;">${idx + 1}.</span> 
                            <b>${name}</b>
                        </span>
                        <button class="adv-icon-btn danger" style="padding: 2px 4px; margin: 0;" onclick="AdvancedPivotMenus.removeItem('groupBy', ${idx})">${Icons.close}</button>
                    </div>`;
            });
            gHtml += `<div class="drag-item" ondragover="AdvancedPivotMenus.onDragOver(event, 'groupBy')" ondragleave="AdvancedPivotMenus.onDragLeave(event)" ondrop="AdvancedPivotMenus.onDrop(event, 'groupBy', ${config.groupBy.length})" style="height:10px;"></div>`;
            if(gList) gList.innerHTML = gHtml;
        }

        if (config.aggregations.length === 0) {
            if(aList) aList.innerHTML = `<span style="color:var(--text-secondary); font-size:0.8rem; text-align:center;">Seleziona la metrica da calcolare.</span>`;
        } else {
            let aHtml = '';
            config.aggregations.forEach((agg, idx) => {
                aHtml += `
                    <div class="drag-item" draggable="true" ondragstart="AdvancedPivotMenus.onDragStart(event, 'aggregations', ${idx})" ondragover="AdvancedPivotMenus.onDragOver(event, 'aggregations')" ondragleave="AdvancedPivotMenus.onDragLeave(event)" ondrop="AdvancedPivotMenus.onDrop(event, 'aggregations', ${idx})" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-color); padding:8px 12px; border:1px solid var(--border-color); border-radius:4px; font-size:0.8rem;">
                        <span style="display:flex; align-items:center;">
                            <span class="widget-drag-handle" style="cursor:grab; opacity:0.3; margin-right:5px; padding:0 4px;" title="Trascina per riordinare">${Icons.dragHandle}</span>
                            <span style="opacity:0.5; font-family:monospace; margin-right:5px; width:15px;">${idx + 1}.</span> 
                            <b>${agg.label}</b>
                        </span>
                        <button class="adv-icon-btn danger" style="padding: 2px 4px; margin: 0;" onclick="AdvancedPivotMenus.removeItem('aggregations', ${idx})">${Icons.close}</button>
                    </div>`;
            });
            aHtml += `<div class="drag-item" ondragover="AdvancedPivotMenus.onDragOver(event, 'aggregations')" ondragleave="AdvancedPivotMenus.onDragLeave(event)" ondrop="AdvancedPivotMenus.onDrop(event, 'aggregations', ${config.aggregations.length})" style="height:10px;"></div>`;
            if(aList) aList.innerHTML = aHtml;
        }
    },

    finalizePivot: () => {
        const config = AdvancedPivotMenus.pendingConfig;
        if (config.groupBy.length === 0) { alert('Scegli almeno una colonna per raggruppare i dati.'); return; }
        if (config.aggregations.length === 0) { alert('Scegli almeno una metrica per visualizzare i dati.'); return; }

        const displaySelect = document.getElementById('pivotDisplayType');
        const chartTypeInput = document.getElementById('pivotChartStyle');
        const stackCheck = document.getElementById('chartStacked');
        const labelsCheck = document.getElementById('chartShowLabels');
        const centerCheck = document.getElementById('chartCenterTotal');
        const legendPosSel = document.getElementById('chartLegendPos');
        const paletteSel = document.getElementById('chartColorPalette');
        
        const isChart = displaySelect ? displaySelect.value === 'chart' : true;

        config.chartConfig = {
            visible: isChart,
            type: chartTypeInput ? chartTypeInput.value : 'bar',
            stacked: stackCheck ? stackCheck.checked : false,
            showLabels: labelsCheck ? labelsCheck.checked : true,
            centerTotal: centerCheck ? centerCheck.checked : true,
            legendPos: legendPosSel ? legendPosSel.value : 'bottom',
            colorPalette: paletteSel ? paletteSel.value : 'default'
        };

        AdvancedPivot.createOrUpdate(config.tableId, config.sourceId, config.groupBy, config.aggregations, null, config.chartConfig);
        UI.closeDrawer();
    }
};