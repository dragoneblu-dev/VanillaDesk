/**
 * advanced-table-tree.js
 * Modulo per la Vista Tabella Gerarchica ad Albero (Tree Table / WBS) nei Database Avanzati.
 * Implementa:
 * - 1.C: Direzione flessibile (Genitore vs Figli) per auto-relazioni.
 * - 3: Ordinamento gerarchico tra fratelli dello stesso livello e conservazione degli antenati nei filtri.
 * - 4.A: Paginazione basata sul conteggio delle sole Radici (Livello 0).
 * - Collasso automatico di tutti i rami genitore alla prima apertura della vista WBS.
 * - Tasto rapido Espandi Tutto / Comprimi Tutto nella barra della tabella.
 * - Differenziazione cromatica per livelli di profondità (Livello 0..4) applicata a freccia, pallino e badge.
 * - FIX HEADER TOOLTIPS & COMMENTS: Mostra i tooltip informativi dei campi, i commenti colonna e l'icona informativa nell'intestazione <th>.
 */

const AdvancedTree = {

    setView: (tableId, relColId, direction = 'children') => {
        let state = AdvancedTable.getState(tableId);
        if (!state) return;

        state.viewType = 'tree';
        state.treeRelationColId = relColId;
        state.treeRelationDirection = direction; // 'children' | 'parent'

        // All'attivazione iniziale della vista WBS, collassa tutti i rami di default per non disorientare l'utente
        const allParentIds = new Set();
        state.rows.forEach(r => {
            let targets = r.cells[relColId];
            if (!targets) return;
            if (!Array.isArray(targets)) targets = [targets];
            if (direction === 'children') {
                if (targets.length > 0) allParentIds.add(r.id);
            } else {
                targets.forEach(pId => { if (pId) allParentIds.add(pId); });
            }
        });
        state.treeCollapsedNodes = Array.from(allParentIds);

        AdvancedTable.setState(tableId, state);
        Store.triggerAutoSave();
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
        AdvancedTable.renderTable(tableId);
    },

    toggleNode: (tableId, rowId) => {
        let state = AdvancedTable.getState(tableId);
        if (!state) return;
        if (!state.treeCollapsedNodes) state.treeCollapsedNodes = [];

        const idx = state.treeCollapsedNodes.indexOf(rowId);
        if (idx > -1) {
            state.treeCollapsedNodes.splice(idx, 1);
        } else {
            state.treeCollapsedNodes.push(rowId);
        }

        AdvancedTable.setState(tableId, state);
        Store.triggerAutoSave();
        AdvancedTable.renderTable(tableId);
    },

    toggleCollapseAll: (tableId) => {
        let state = AdvancedTable.getState(tableId);
        if (!state) return;

        const relColId = state.treeRelationColId;
        const direction = state.treeRelationDirection || 'children';

        // Identifica tutti i nodi genitore effettivi
        const allParentIds = new Set();
        state.rows.forEach(r => {
            let targets = r.cells[relColId];
            if (!targets) return;
            if (!Array.isArray(targets)) targets = [targets];
            if (direction === 'children') {
                if (targets.length > 0) allParentIds.add(r.id);
            } else {
                targets.forEach(pId => { if (pId) allParentIds.add(pId); });
            }
        });

        const currentCollapsed = new Set(state.treeCollapsedNodes || []);
        const hasOpenParents = Array.from(allParentIds).some(id => !currentCollapsed.has(id));

        if (hasOpenParents) {
            // Se c'è almeno un ramo aperto, collassa tutto
            state.treeCollapsedNodes = Array.from(allParentIds);
        } else {
            // Altrimenti espandi tutto
            state.treeCollapsedNodes = [];
        }

        AdvancedTable.setState(tableId, state);
        Store.triggerAutoSave();
        AdvancedTable.renderTable(tableId);
    },

    addSubtask: (tableId, parentRowId) => {
        if (!AppState.isEditMode) return;
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);
        if (!state) return;

        const relColId = state.treeRelationColId;
        const direction = state.treeRelationDirection || 'children';
        const parentRow = state.rows.find(r => r.id === parentRowId);
        if (!parentRow) return;

        if (typeof Editor !== 'undefined' && Editor.saveSnapshot) Editor.saveSnapshot();

        const now = Date.now();
        const newRowId = 'r' + Store.generateId();
        const newRow = { id: newRowId, createdAt: now, updatedAt: now, cells: {} };

        // Inizializza tutte le colonne del nuovo record
        state.columns.forEach(c => {
            if (c.type === 'checkbox') newRow.cells[c.id] = false;
            else if (['multi-select', 'relation'].includes(c.type)) newRow.cells[c.id] = [];
            else newRow.cells[c.id] = '';
        });

        // Collega gerarchicamente il nuovo record in base alla direzione scelta (1.C)
        if (direction === 'children') {
            let currentChildren = parentRow.cells[relColId];
            if (!Array.isArray(currentChildren)) currentChildren = currentChildren ? [currentChildren] : [];
            currentChildren.push(newRowId);
            parentRow.cells[relColId] = currentChildren;
            parentRow.updatedAt = now;
        } else {
            const relCol = state.columns.find(c => c.id === relColId);
            newRow.cells[relColId] = (relCol && relCol.singleRecord) ? parentRowId : [parentRowId];
        }

        state.rows.push(newRow);

        // Se il genitore era collassato, espandilo per mostrare il nuovo subtask
        if (state.treeCollapsedNodes) {
            state.treeCollapsedNodes = state.treeCollapsedNodes.filter(id => id !== parentRowId);
        }

        AdvancedTable.setState(realTableId, state);
        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();

        // Metti a fuoco il titolo del nuovo sotto-task appena inserito
        setTimeout(() => {
            const tableEl = document.getElementById(tableId);
            if (tableEl) {
                const titleColId = state.columns[0]?.id;
                const newCellInput = tableEl.querySelector(`td [data-row="${newRowId}"][data-col="${titleColId}"]`);
                if (newCellInput) {
                    newCellInput.focus();
                }
            }
        }, 120);
    },

    render: (tableId, wrapper, state) => {
        const isCited = tableId.includes('_cited_');
        const isEdit = AppState.isEditMode && !isCited;

        let bodyContainer = wrapper.querySelector('.widget-body');
        if (!bodyContainer) {
            wrapper.innerHTML = `
                <div class="widget-header adv-table-header">
                    <span class="widget-drag-handle adv-drag-handle" title="Trascina per spostare" draggable="true" style="${isEdit ? 'display:flex;' : 'display:none;'}">${Icons.dragHandle}</span>
                    <span class="widget-options-btn adv-drag-handle" title="Opzioni" style="${isEdit ? 'display:flex;' : 'display:none;'}">${Icons.dotsVertical}</span>
                    <span class="widget-icon" style="display:inline-flex;"></span>
                    <span class="widget-title adv-table-title" contenteditable="${isEdit ? 'true' : 'false'}" style="flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 50px;">Caricamento...</span>
                    <div class="widget-tools adv-tools" style="flex-shrink: 0;"></div>
                </div>
                <div class="widget-body"></div>
            `;
            bodyContainer = wrapper.querySelector('.widget-body');
        }

        let prevScrollX = 0, prevScrollY = 0;
        const existingScroll = bodyContainer.querySelector('.adv-scroll-container');
        if (existingScroll) {
            prevScrollX = existingScroll.scrollLeft;
            prevScrollY = existingScroll.scrollTop;
        }

        const realTableId = AdvancedTable._resolveSourceId(tableId);
        const isSysDB = realTableId === 'SYS_PROPERTIES_DB';

        // 1. Identificazione Colonna Auto-Relazione
        let relColId = state.treeRelationColId;
        let relCol = (state.columns || []).find(c => c.id === relColId);
        
        if (!relCol) {
            relCol = (state.columns || []).find(c => c.type === 'relation' && (c.targetTableId === tableId || c.targetTableId === realTableId));
            if (relCol) {
                relColId = relCol.id;
                state.treeRelationColId = relColId;
            }
        }

        // Se non esiste alcuna relazione con se stesso, torna alla vista tabella classica
        if (!relCol) {
            state.viewType = 'table';
            AdvancedTable.setState(tableId, state);
            return AdvancedTable._renderAsTable(wrapper, state, tableId);
        }

        const direction = state.treeRelationDirection || 'children'; // 'children' | 'parent'
        if (!state.treeCollapsedNodes) state.treeCollapsedNodes = [];

        // 2. Toolbar Tools
        const hasFilter = state.filters && Object.keys(state.filters).some(k => state.filters[k].trim() !== '');
        const hasSavedFilters = state.savedFilters && state.savedFilters.length > 0;
        const hasSort = state.sorts && state.sorts.length > 0;
        const hasCalculatedFields = state.columns.some(c => ['formula', 'relation', 'relation_backlink', 'rollup'].includes(c.type));
        const hasActiveAuto = state.automations && state.automations.some(a => a.active);

        const allParentIds = new Set();
        state.rows.forEach(r => {
            let targets = r.cells[relColId];
            if (!targets) return;
            if (!Array.isArray(targets)) targets = [targets];
            if (direction === 'children') {
                if (targets.length > 0) allParentIds.add(r.id);
            } else {
                targets.forEach(pId => { if (pId) allParentIds.add(pId); });
            }
        });
        const hasOpenParents = Array.from(allParentIds).some(id => !state.treeCollapsedNodes.includes(id));

        if (typeof WidgetManager !== 'undefined') {
            const tools = [];
            tools.push({ id: `adv-view-btn-${tableId}`, icon: Icons.treeNode, title: 'Cambia visualizzazione', label: 'WBS', onClick: AdvancedBoard.openViewMenu });
            
            // Pulsante di Usabilità 1: Espandi / Collassa Tutti i Rami
            if (allParentIds.size > 0) {
                tools.push({
                    icon: hasOpenParents ? Icons.chevronDown : Icons.chevronRight,
                    label: hasOpenParents ? 'Comprimi Tutto' : 'Espandi Tutto',
                    title: hasOpenParents ? 'Comprimi tutti i rami aperti' : 'Espandi tutti i rami',
                    onClick: () => AdvancedTree.toggleCollapseAll(tableId)
                });
            }

            if (!state.isLinkedView && !isSysDB) {
                tools.push({ icon: Icons.lightning, active: hasActiveAuto, editOnly: true, title: 'Automazioni', onClick: AdvancedAutomations.openPanel });
            }
            tools.push({ id: `adv-sort-btn-${tableId}`, icon: Icons.sort, title: 'Ordina Database (tra fratelli)', active: hasSort, editOnly: false, onClick: AdvancedTable.openSortMenu });
            tools.push({ id: `adv-filter-btn-${tableId}`, icon: Icons.filter, title: 'Filtra Dati (Campi)', active: hasFilter, editOnly: false, onClick: AdvancedTable.openFilterMenu });

            const bookmarkIconToUse = hasSavedFilters ? Icons.bookmarkFilled : Icons.bookmark;
            tools.push({ id: `adv-saved-filters-btn-${tableId}`, icon: bookmarkIconToUse, title: 'Viste / Filtri Salvati', active: hasFilter, editOnly: false, onClick: AdvancedTable.openSavedFiltersMenu });

            if (hasCalculatedFields) {
                tools.push({ icon: Icons.refresh, title: 'Aggiorna Dati Calcolati', onClick: () => AdvancedTable.forceRecalculate(tableId) });
            }

            WidgetManager.updateShellUI(tableId, {
                icon: state.isLinkedView ? Icons.link : '',
                title: state.title || 'Database',
                optionsId: `adv-opt-btn-${tableId}`,
                tools: tools,
                onTitleChange: AdvancedTable.updateTitle,
                onOptionsClick: state.isLinkedView ? AdvancedPivotMenus.openOptions : AdvancedTableMenus.openTableOptions,
                onDragStart: AdvancedTable.onTableDragStart,
                onDragEnd: AdvancedTable.onTableDragEnd
            });
        }

        // 3. Calcolo Colonne Visibili
        const viewId = 'table';
        const hiddenList = state.viewConfig && state.viewConfig[viewId] ? state.viewConfig[viewId].hiddenCols : [];
        const visibleCols = state.columns.filter(c => !c.hidden && !hiddenList.includes(c.id));
        const hasHiddenCols = state.columns.length > visibleCols.length;
        const titleCol = visibleCols.length > 0 ? visibleCols[0] : state.columns[0];

        // 4. Mappatura Virtuale delle Righe
        const renderCache = {};
        const virtualRowsMap = new Map();
        state.rows.forEach(r => {
            const vRow = AdvancedTable.buildVirtualRow(tableId, r, state, renderCache);
            virtualRowsMap.set(r.id, vRow);
        });

        // 5. Costruzione Mappa Antenati e Discendenti
        const childrenMap = new Map();
        const parentMap = new Map();
        const allRowIds = new Set(state.rows.map(r => r.id));

        state.rows.forEach(r => {
            childrenMap.set(r.id, []);
        });

        state.rows.forEach(r => {
            let targets = r.cells[relColId];
            if (!targets) return;
            if (!Array.isArray(targets)) targets = [targets];

            targets.forEach(targetId => {
                if (!allRowIds.has(targetId) || targetId === r.id) return;

                if (direction === 'children') {
                    childrenMap.get(r.id).push(targetId);
                    parentMap.set(targetId, r.id);
                } else {
                    childrenMap.get(targetId).push(r.id);
                    parentMap.set(r.id, targetId);
                }
            });
        });

        // 6. Rilevamento Nodi Radice (Level 0)
        let rootRowIds = [];
        state.rows.forEach(r => {
            if (!parentMap.has(r.id)) {
                rootRowIds.push(r.id);
            }
        });

        // 7. Filtro e Conservazione Percorso Antenati (Decisione 3)
        let matchingRowIds = null;
        let visibleInTreeSet = null;

        if (hasFilter) {
            const allVirtualList = Array.from(virtualRowsMap.values());
            const filteredRows = AdvancedTable.filterRows(allVirtualList, state);
            matchingRowIds = new Set(filteredRows.map(r => r.id));
            visibleInTreeSet = new Set();

            matchingRowIds.forEach(id => {
                let curr = id;
                while (curr) {
                    visibleInTreeSet.add(curr);
                    curr = parentMap.get(curr);
                }
            });
        }

        // 8. Ordinamento Gerarchico tra Fratelli (Decisione 3)
        const sortSiblingRowIds = (idList) => {
            if (!hasSort || idList.length <= 1) return idList;
            const rowsToSort = idList.map(id => virtualRowsMap.get(id)).filter(Boolean);
            const sortedRows = AdvancedTable.sortRows(rowsToSort, state);
            return sortedRows.map(r => r.id);
        };

        rootRowIds = sortSiblingRowIds(rootRowIds);

        if (hasFilter) {
            rootRowIds = rootRowIds.filter(id => visibleInTreeSet.has(id));
        }

        // 9. Paginazione basata sulle sole Radici di Livello 0
        let pageSize = state.pageSize || 'all';
        let currentPage = state.currentPage || 1;
        let totalRoots = rootRowIds.length;
        let totalPages = 1;
        let pagedRootIds = rootRowIds;

        if (pageSize !== 'all') {
            pageSize = parseInt(pageSize, 10);
            totalPages = Math.max(1, Math.ceil(totalRoots / pageSize));
            if (currentPage > totalPages) currentPage = totalPages;
            if (currentPage < 1) currentPage = 1;
            state.currentPage = currentPage;

            const startIdx = (currentPage - 1) * pageSize;
            pagedRootIds = rootRowIds.slice(startIdx, startIdx + pageSize);
        }

        // 10. Appiattimento Ricorsivo con Protezione da Cicli
        const flatTreeRows = [];
        const visitedCycles = new Set();

        const traverseTree = (rowId, level) => {
            if (visitedCycles.has(rowId)) return;
            visitedCycles.add(rowId);

            const vRow = virtualRowsMap.get(rowId);
            if (!vRow) return;

            let children = childrenMap.get(rowId) || [];
            if (hasFilter) {
                children = children.filter(cId => visibleInTreeSet.has(cId));
            }
            children = sortSiblingRowIds(children);

            const hasChildren = children.length > 0;
            const forceExpandedByFilter = hasFilter && children.some(cId => visibleInTreeSet.has(cId));
            const isCollapsed = !forceExpandedByFilter && (state.treeCollapsedNodes && state.treeCollapsedNodes.includes(rowId));

            flatTreeRows.push({
                row: vRow,
                level: level,
                hasChildren: hasChildren,
                childrenCount: (childrenMap.get(rowId) || []).length,
                isCollapsed: isCollapsed,
                isMatchDirect: !hasFilter || matchingRowIds.has(rowId)
            });

            if (hasChildren && !isCollapsed) {
                children.forEach(childId => {
                    traverseTree(childId, level + 1);
                });
            }

            visitedCycles.delete(rowId);
        };

        pagedRootIds.forEach(rootId => {
            traverseTree(rootId, 0);
        });

        // 11. Costruzione Markup Tabella
        let html = '';
        const zebraClass = (state.striped !== false) ? 'table-striped' : '';
        const tableWidthClass = state.freeWidth ? '' : 'adv-table-full-width';

        html += `<div class="adv-scroll-container"><table class="adv-table ${zebraClass} ${tableWidthClass}"><thead><tr>`;

        visibleCols.forEach(col => {
            let icon = Icons.text;
            if (col.type === 'checkbox') icon = Icons.checkbox;
            if (col.type === 'select') icon = Icons.select;
            if (col.type === 'multi-select') icon = Icons.multiSelect;
            if (col.type === 'date' || col.type === 'datetime') icon = Icons.date;
            if (col.type === 'number') icon = Icons.number;
            if (col.type === 'formula') icon = Icons.formula;
            if (col.type === 'relation' || col.type === 'relation_backlink') icon = Icons.relation;
            if (col.type === 'rollup') icon = Icons.rollup;
            if (col.type === 'url') icon = Icons.url;
            if (col.type === 'record_note') icon = Icons.recordPage;
            if (col.type === 'note_link') icon = Icons.link;
            if (col.type === 'button') icon = Icons.play;

            let sortIndicator = '';
            const sortRule = state.sorts.find(s => s.colId === col.id);
            if (sortRule) sortIndicator = sortRule.dir === 1 ? ' ↑' : ' ↓';

            const isFiltered = state.filters && state.filters[col.id] && String(state.filters[col.id]).trim() !== '';
            const thStyleOverrides = isFiltered ? `background: rgba(37, 99, 235, 0.15); color: var(--accent-color); border-bottom: 2px solid var(--accent-color);` : '';
            const filterIconHtml = isFiltered ? `<span style="opacity:0.5; color:var(--accent-color); margin-left:2px; font-size:0.8rem;">${Icons.filter}</span>` : '';

            const safeColName = String(col.name || 'Senza Nome').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            
            // GESTIONE TOOLTIP, COMMENTO E FILTRO ATTIVO NELL'INTESTAZIONE
            let tooltipHTML = `<div style='margin-bottom:4px; font-size:1.1em;'><b>${safeColName}</b></div>`;
            let hasTooltipInfo = false;

            if (col.comment) {
                const safeComment = col.comment.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                tooltipHTML += `<div style='color:var(--text-secondary); margin-bottom:4px;'>${safeComment}</div>`;
                hasTooltipInfo = true;
            }

            if (isFiltered) {
                const safeFilterTerm = state.filters[col.id].replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                tooltipHTML += `<div style='color:var(--accent-color); border-top:1px solid rgba(150,150,150,0.2); padding-top:4px;'><b>Filtro attivo:</b> ${safeFilterTerm}</div>`;
                hasTooltipInfo = true;
            }

            const tooltipAttr = hasTooltipInfo ? `data-tooltip="${tooltipHTML}"` : '';
            const commentIcon = col.comment ? `<span style="opacity:0.5; margin-left:4px; display:inline-flex; align-items:center;">${Icons.info}</span>` : '';

            const isReadonlySystemCol = isSysDB && col.id === 'sys_c_note';
            const pointerStyle = isEdit && !isReadonlySystemCol ? 'cursor:pointer;' : 'cursor:default;';
            const clickEvent = isEdit && !isReadonlySystemCol ? `onclick="AdvancedTableColumnMenus.openColMenu(event, '${tableId}', '${col.id}')"` : '';

            html += `<th id="adv-th-${tableId}-${col.id}" style="width: ${col.width || 150}px; ${pointerStyle} ${thStyleOverrides}" data-col="${col.id}" ${clickEvent} ${tooltipAttr}>
                        <div class="adv-th-content">
                            <span style="display:flex; align-items:center; gap:5px;">
                                <span style="display:inline-flex;">${icon}</span> 
                                ${safeColName} 
                                ${commentIcon}
                                ${col.id === titleCol.id ? '<span style="font-size:0.7rem; color:var(--accent-color); margin-left:4px;">(WBS)</span>' : ''}
                                ${filterIconHtml}
                            </span>
                            <span>${sortIndicator}</span>
                        </div>
                        ${isEdit ? `<div class="adv-col-resizer" onmousedown="AdvancedTable.startResize(event, '${tableId}', '${col.id}')"></div>` : ''}
                     </th>`;
        });

        let lastColWidth = (isEdit && hasHiddenCols) ? 60 : 40;
        let lastColIcon = isEdit ? `<button class="adv-add-btn" style="padding:4px; margin:0 auto; display:flex; align-items:center; justify-content:center;" onclick="AdvancedTableColumnMenus.openAddColumnMenu(event, '${tableId}')">${Icons.plus}</button>` : '';

        html += `<th id="adv-th-add-${tableId}" style="width: ${lastColWidth}px; text-align:center; padding:0; vertical-align:middle;">${lastColIcon}</th></tr></thead><tbody>`;

        if (flatTreeRows.length === 0) {
            html += `<tr><td colspan="${visibleCols.length + 1}" style="text-align:center; color:var(--text-secondary); padding:25px;">Nessun record corrisponde ai filtri impostati.</td></tr>`;
        } else {
            flatTreeRows.forEach(item => {
                const row = item.row;
                const isMatchDirect = item.isMatchDirect;
                const isRowSelected = state.selectedRows && state.selectedRows.includes(row.id);
                const selectedClass = isRowSelected ? 'adv-row-selected' : '';
                const ghostClass = !isMatchDirect ? 'tree-ancestor-dimmed' : '';

                let rowColorClass = row.color && row.color !== 'none' ? row.color : '';
                let rowOpacity = row.opacity !== undefined ? row.opacity : '100';

                // Valutazione regole condizionali
                if (state.conditionalColors && state.conditionalColors.length > 0) {
                    for (const rule of state.conditionalColors) {
                        if (!rule.active || !rule.conditions || rule.conditions.length === 0) continue;
                        let allMatch = true;
                        for (const cond of rule.conditions) {
                            const colDef = state.columns.find(c => c.id === cond.colId);
                            if (!colDef) { allMatch = false; break; }
                            let cellVal = row.virtualCells[cond.colId];
                            let targetVal = cond.value;
                            if (typeof targetVal === 'string' && targetVal.startsWith('=')) {
                                targetVal = AdvancedTable.evaluateFormula(targetVal.substring(1), row, state.columns, tableId, state.title, row.virtualCells, renderCache);
                            }
                            if (!LogicEngine.evaluateCondition(cond.operator, targetVal, cellVal, null, colDef, { mode: cond.dateMode, shift: cond.dateShift })) {
                                allMatch = false;
                                break;
                            }
                        }
                        if (allMatch) {
                            rowColorClass = rule.color && rule.color !== 'none' ? rule.color : '';
                            let opVal = rule.opacity !== undefined ? rule.opacity : '100';
                            if (rule.opacityType === 'formula' || (typeof opVal === 'string' && opVal.startsWith('='))) {
                                let fStr = String(opVal).replace(/^=/, '');
                                opVal = AdvancedTable.evaluateFormula(fStr, row, state.columns, tableId, state.title, row.virtualCells, renderCache);
                            }
                            rowOpacity = opVal;
                            break;
                        }
                    }
                }

                let pOp = parseFloat(rowOpacity);
                if (isNaN(pOp)) pOp = 100;
                pOp = Math.max(0, Math.min(100, pOp));

                let inlineBgStyle = '';
                if (rowColorClass && pOp < 100) {
                    inlineBgStyle = `background-color: color-mix(in srgb, var(--${rowColorClass}) ${pOp}%, transparent) !important;`;
                    rowColorClass = '';
                }

                const dblClickEvent = isEdit ? `ondblclick="AdvancedTable.openRecordView('${tableId}', '${row.id}')"` : '';

                html += `<tr class="${rowColorClass} ${selectedClass} ${ghostClass} adv-tree-row" data-row-id="${row.id}" ${dblClickEvent} style="${inlineBgStyle}">`;

                visibleCols.forEach(col => {
                    const isTitle = (col.id === titleCol.id);
                    const val = row.virtualCells[col.id] !== undefined ? row.virtualCells[col.id] : '';

                    if (isTitle) {
                        const indentPx = Math.max(8, 8 + (item.level * 22));
                        // Applica la classe cromatica corrispondente al livello di profondità (0..4)
                        const levelColorClass = `adv-tree-level-${Math.min(item.level, 4)}`;

                        let toggleHtml = '';
                        if (item.hasChildren) {
                            const iconSvg = item.isCollapsed ? Icons.chevronRight : Icons.chevronDown;
                            const badgeCountHtml = item.isCollapsed ? `<span class="adv-tree-badge-count" title="${item.childrenCount} sotto-attività">${item.childrenCount}</span>` : '';

                            toggleHtml = `
                                <span class="adv-tree-toggle ${levelColorClass}" onclick="event.stopPropagation(); AdvancedTree.toggleNode('${tableId}', '${row.id}')" title="${item.isCollapsed ? 'Espandi ramo' : 'Collassa ramo'}">
                                    ${iconSvg}
                                </span>
                                ${badgeCountHtml}
                            `;
                        } else {
                            toggleHtml = `<span class="adv-tree-leaf-bullet ${levelColorClass}">•</span>`;
                        }

                        const quickAddSubtaskBtn = isEdit ? `
                            <button class="adv-tree-quick-add" onclick="event.stopPropagation(); AdvancedTree.addSubtask('${tableId}', '${row.id}')" title="Aggiungi sotto-attività a questo task">+</button>
                        ` : '';

                        const cellRendererHtml = AdvancedTable.renderCell(tableId, row, col, val, state, isEdit);

                        html += `
                            <td style="width: ${col.width || 150}px; max-width: ${col.width || 150}px; padding-left: 0 !important;">
                                <div class="adv-tree-cell-wrapper" style="padding-left: ${indentPx}px;">
                                    ${toggleHtml}
                                    <div class="adv-tree-content-inner" style="flex: 1; min-width: 0;">
                                        ${cellRendererHtml}
                                    </div>
                                    ${quickAddSubtaskBtn}
                                </div>
                            </td>
                        `;
                    } else {
                        html += `<td style="width: ${col.width || 150}px; max-width: ${col.width || 150}px;">${AdvancedTable.renderCell(tableId, row, col, val, state, isEdit)}</td>`;
                    }
                });

                let actionCell = `<button class="adv-icon-btn" title="Apri Record" onclick="AdvancedTable.openRecordView('${tableId}', '${row.id}')" style="padding:2px; color:currentColor;">${Icons.recordView}</button>`;
                html += `<td class="adv-action-cell"><div class="adv-action-cell-content">${actionCell}</div></td></tr>`;
            });
        }

        html += `</tbody></table></div>`;

        // 12. Footer Controls (Paginazione per sole Radici)
        if (!state.hideFooterControls && (isEdit || pageSize !== 'all')) {
            html += `<div class="adv-table-footer-controls">`;
            html += `<div class="adv-footer-left">`;

            if (isEdit && !isSysDB) {
                html += `<button class="adv-add-btn" onclick="AdvancedTable.addRow(event, '${tableId}')"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.plus} Nuova Attività Radice</span></button>`;

                if (state.selectedRows && state.selectedRows.length > 0) {
                    const btnLabel = state.selectedRows.length === 1 ? 'Elimina 1 riga' : `Elimina ${state.selectedRows.length} righe`;
                    html += `<button class="adv-add-btn danger" onclick="AdvancedTable.deleteSelectedRows('${tableId}')"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.trash} ${btnLabel}</span></button>`;
                }
            }

            html += `</div><div class="adv-footer-right">`;

            if (pageSize === 'all') {
                if (isEdit) html += `<div id="adv-page-btn-${tableId}" class="adv-add-btn" style="cursor:pointer; margin:0; font-weight:normal;" onclick="AdvancedTable.togglePageSizeMenu(event, '${tableId}')">Tutte le Radici (${totalRoots})</div>`;
            } else {
                let prevDisabled = (currentPage === 1) ? 'opacity:0.3; pointer-events:none;' : ``;
                let nextDisabled = (currentPage >= totalPages) ? 'opacity:0.3; pointer-events:none;' : ``;
                html += `<button class="adv-add-btn" style="padding:4px 8px; ${prevDisabled}" onclick="AdvancedTable.changePage('${tableId}', -1)">${Icons.chevronLeft}</button>
                         <div id="adv-page-btn-${tableId}" class="adv-add-btn" style="cursor:${isEdit ? 'pointer' : 'default'}; margin:0; font-weight:normal;" ${isEdit ? `onclick="AdvancedTable.togglePageSizeMenu(event, '${tableId}')"` : ''}>Radici: Pag. ${currentPage} di ${totalPages} (${totalRoots})</div>
                         <button class="adv-add-btn" style="padding:4px 8px; ${nextDisabled}" onclick="AdvancedTable.changePage('${tableId}', 1)">${Icons.chevronRight}</button>`;
            }
            html += `</div></div>`;
        }

        bodyContainer.innerHTML = html;

        if (isEdit && typeof AdvancedTable.attachCellEvents !== 'undefined') {
            AdvancedTable.attachCellEvents(bodyContainer, tableId);
        }

        if (prevScrollX > 0 || prevScrollY > 0) {
            const newScroll = bodyContainer.querySelector('.adv-scroll-container');
            if (newScroll) {
                newScroll.scrollLeft = prevScrollX;
                newScroll.scrollTop = prevScrollY;
            }
        }
    }
};