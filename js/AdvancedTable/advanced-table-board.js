/**
 * AdvancedTableBoard.js
 * Modulo Kanban (Bacheca Trello-style) e selettore viste per Tabelle Database.
 * FEAT: Integrazione della Vista ad Albero (WBS) con selettore colonna e direzione gerarchica.
 * FIX: Messaggio informativo in rosso quando non è presente alcuna colonna di relazione con se stesso.
 * PERF: Lazy Rendering Incrementale per Colonna (Pulsante "Mostra altri 30 di [totale]").
 * Protegge le prestazioni del browser con migliaia di record e mantiene intatta la posizione di scroll.
 * FEAT: Lancio diretto di Workflow Studio con ancoraggio al database e relazione selezionata.
 */

const AdvancedBoard = {
    draggedCardRowId: null,
    draggedFromTableId: null,
    ghostElement: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    _columnLimits: {}, // Memorizza il limite visibile per ogni colonna (tableId + '_' + groupVal)

    openViewMenu: (e, tableId) => {
        if (e) e.stopPropagation();
        
        let state = AdvancedTable.getState(tableId);
        if (!state) return;

        const realTableId = AdvancedTable._resolveSourceId(tableId);
        const realState = AdvancedTable.getState(realTableId);

        const selectCols = state.columns.filter(c => c.type === 'select');
        const dateCols = state.columns.filter(c => c.type === 'date' || c.type === 'datetime');
        
        // Cerca tutte le colonne di auto-relazione (puntano alla tabella stessa)
        const selfRelCols = (state.columns || []).filter(c => c.type === 'relation' && (c.targetTableId === tableId || c.targetTableId === realTableId));

        const chk = '<span style="color:var(--accent-color); font-weight:bold; float:right; margin-left:10px;">✓</span>';

        const menuItems = [
            { type: 'custom', html: '<div class="adv-dropdown-title" style="padding:0 4px; margin-bottom:2px;">Seleziona Vista</div>' },
            { 
                icon: Icons.viewList, 
                label: 'Vista formato Tabella' + ((state.viewType === 'table' || !state.viewType) ? chk : ''), 
                onClick: () => AdvancedBoard.setView(tableId, 'table') 
            }
        ];

        // Sezione Vista ad Albero (WBS) con avviso di coerenza se assente
        menuItems.push({ type: 'divider' });
        menuItems.push({ type: 'custom', html: '<div class="adv-dropdown-title" style="padding:0 4px; margin-top:2px; margin-bottom:2px;">Gerarchia ad Albero (WBS)</div>' });

        if (selfRelCols.length === 0) {
            menuItems.push({ 
                type: 'custom', 
                html: '<div style="font-size:0.75rem; color:var(--danger-color); padding:4px;">Crea una colonna "Relazione" che punti a questo stesso DB</div>' 
            });
        } else {
            selfRelCols.forEach(c => {
                const isTreeActive = state.viewType === 'tree' && state.treeRelationColId === c.id;
                const isChildrenDir = isTreeActive && state.treeRelationDirection === 'children';
                const isParentDir = isTreeActive && state.treeRelationDirection === 'parent';

                let treeSubMenu = [
                    { 
                        icon: Icons.treeNode, 
                        label: `Il campo "${c.name}" indica i Figli` + (isChildrenDir ? chk : ''), 
                        onClick: () => {
                            if (typeof AdvancedTree !== 'undefined') {
                                AdvancedTree.setView(tableId, c.id, 'children');
                            }
                        } 
                    },
                    { 
                        icon: Icons.treeNode, 
                        label: `Il campo "${c.name}" indica il Genitore` + (isParentDir ? chk : ''), 
                        onClick: () => {
                            if (typeof AdvancedTree !== 'undefined') {
                                AdvancedTree.setView(tableId, c.id, 'parent');
                            }
                        } 
                    },
                    { type: 'divider' },
                    {
                        icon: Icons.data || Icons.tablePivot,
                        label: 'Apri in Workflow Graph Studio ↗',
                        onClick: () => {
                            AdvancedBoard.openInWorkflowStudio(tableId, c.id, state.treeRelationDirection || 'children');
                        }
                    }
                ];

                menuItems.push({
                    icon: Icons.treeNode,
                    label: c.name + (isTreeActive ? chk : ''),
                    type: 'submenu',
                    items: treeSubMenu
                });
            });
        }

        menuItems.push({ type: 'divider' });
        menuItems.push({ type: 'custom', html: '<div class="adv-dropdown-title" style="padding:0 4px; margin-top:2px; margin-bottom:2px;">Bacheca (Raggruppa per...)</div>' });

        if (selectCols.length === 0) {
            menuItems.push({ type: 'custom', html: '<div style="font-size:0.75rem; color:var(--danger-color); padding:4px;">Crea una colonna "Select Singola"</div>' });
        } else {
            selectCols.forEach(c => {
                const isActive = state.viewType === 'board' && state.boardGroupBy === c.id;
                menuItems.push({
                    icon: Icons.viewBoard,
                    label: c.name + (isActive ? chk : ''),
                    onClick: () => AdvancedBoard.setView(tableId, 'board', c.id, null, null)
                });
            });
        }

        menuItems.push({ type: 'divider' });
        menuItems.push({ type: 'custom', html: '<div class="adv-dropdown-title" style="padding:0 4px; margin-top:2px; margin-bottom:2px;">Viste Temporali (per Colonna)</div>' });

        if (dateCols.length === 0) {
            menuItems.push({ type: 'custom', html: '<div style="font-size:0.75rem; color:var(--danger-color); padding:4px;">Crea almeno una colonna "Data"</div>' });
        } else {
            dateCols.forEach(c => {
                const isCalActive = state.viewType === 'calendar' && state.calendarDateCol === c.id;
                const isTlActive = state.viewType === 'timeline' && state.timelineDateCol === c.id;

                let timeSubMenu = [
                    { icon: Icons.viewCalendar, label: 'Calendario' + (isCalActive ? chk : ''), onClick: () => AdvancedBoard.setView(tableId, 'calendar', null, null, c.id) }
                ];

                if (c.hasEndDate) {
                    timeSubMenu.push({ icon: Icons.viewTimeline, label: 'Timeline' + (isTlActive ? chk : ''), onClick: () => AdvancedBoard.setView(tableId, 'timeline', null, c.id, null) });
                }

                menuItems.push({
                    icon: Icons.time,
                    label: c.name,
                    type: 'submenu',
                    items: timeSubMenu
                });
            });
        }

        const anchorId = e && e.currentTarget ? e.currentTarget.id : `adv-view-btn-${tableId}`;
        UI.Menu.buildContextMenu(anchorId, menuItems);
    },

    openInWorkflowStudio: (tableId, relColId, direction = 'children') => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        
        // Salva le modifiche pendenti su disco in VanillaDesk prima dell'apertura
        if (typeof Store !== 'undefined' && Store.isDirty && AppState.workspaceHandle) {
            Store.saveToFile();
        }

        const dirParam = direction === 'parent' ? 'parent' : 'children';
        const hash = `db=${encodeURIComponent(realTableId)}&rel=${encodeURIComponent(relColId)}&dir=${encodeURIComponent(dirParam)}`;
        const targetUrl = `workflow/index.html#${hash}`;

        window.open(targetUrl, 'VanillaDeskWorkflow');
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
    },

    setView: (tableId, type, groupColId = null, timelineDateColId = null, calendarDateColId = null) => {
        let state = AdvancedTable.getState(tableId);
        state.viewType = type;
        if (groupColId) state.boardGroupBy = groupColId;
        if (timelineDateColId) state.timelineDateCol = timelineDateColId;
        if (calendarDateColId) state.calendarDateCol = calendarDateColId;

        AdvancedTable.setState(tableId, state);
        Store.triggerAutoSave();
        UI.Menu.closeAll(true);
        AdvancedTable.renderTable(tableId);
    },

    loadMoreCards: (e, tableId, colValue, step = 30) => {
        if (e) e.stopPropagation();
        AdvancedBoard._columnLimits = AdvancedBoard._columnLimits || {};
        const key = `${tableId}_${colValue}`;
        const currentLimit = AdvancedBoard._columnLimits[key] || 30;
        AdvancedBoard._columnLimits[key] = currentLimit + step;
        AdvancedTable.renderTable(tableId);
    },

    render: (tableId, wrapper, state) => {
        const groupColId = state.boardGroupBy;
        const groupCol = state.columns.find(c => c.id === groupColId);

        if (!groupCol || groupCol.type !== 'select') {
            state.viewType = 'table';
            AdvancedTable.setState(tableId, state);
            return AdvancedTable._renderAsTable(wrapper, state, tableId);
        }

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

        // Memorizza la posizione di scroll orizzontale della bacheca e verticale di ciascuna colonna
        let prevScrollX = 0;
        const existingScroll = bodyContainer.querySelector('.adv-scroll-container');
        if (existingScroll) prevScrollX = existingScroll.scrollLeft;

        const colScrollTops = {};
        bodyContainer.querySelectorAll('.adv-kanban-col').forEach(colEl => {
            const colVal = colEl.getAttribute('data-col-val');
            if (colVal !== null) {
                colScrollTops[colVal] = colEl.scrollTop;
            }
        });

        const hasFilter = state.filters && Object.keys(state.filters).some(k => state.filters[k].trim() !== '');
        const hasSort = state.sorts && state.sorts.length > 0;
        let hasActiveAuto = state.automations && state.automations.some(a => a.active);
        
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        const isSysDB = realTableId === 'SYS_PROPERTIES_DB';

        if (typeof WidgetManager !== 'undefined') {
            const tools =[];
            tools.push({ id: `adv-view-btn-${tableId}`, icon: Icons.viewBoard, title: 'Cambia visualizzazione', label: 'Vista', onClick: AdvancedBoard.openViewMenu });
            if (!state.isLinkedView && !isSysDB) {
                tools.push({ icon: Icons.lightning, active: hasActiveAuto, editOnly: true, title: 'Automazioni', onClick: AdvancedAutomations.openPanel });
            }
            tools.push({ id: `adv-sort-btn-${tableId}`, icon: Icons.sort, title: 'Ordina Database', active: hasSort, onClick: AdvancedTable.openSortMenu });
            tools.push({ id: `adv-filter-btn-${tableId}`, icon: Icons.filter, title: 'Filtra Database', active: hasFilter, onClick: AdvancedTable.openFilterMenu });

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

        let viewRows =[];
        const renderCache = {};
        state.rows.forEach(r => {
            viewRows.push(AdvancedTable.buildVirtualRow(tableId, r, state, renderCache));
        });

        viewRows = AdvancedTable.filterRows(viewRows, state);
        viewRows = AdvancedTable.sortRows(viewRows, state);

        const options = state.selectOptions[groupColId] ||[];
        const columnsData =[];
        options.forEach(opt => columnsData.push({ name: opt, value: opt }));
        columnsData.push({ name: 'Senza Stato', value: '' });

        const boardData = {};
        columnsData.forEach(c => boardData[c.value] =[]);

        viewRows.forEach(r => {
            let val = String(r.virtualCells[groupColId] || '').trim();
            if (boardData[val] !== undefined) boardData[val].push(r);
            else boardData[''].push(r);
        });

        let html = `<div class="adv-scroll-container adv-board-container">`;

        const viewId = 'board_' + groupColId;
        const hiddenList = state.viewConfig && state.viewConfig[viewId] ? state.viewConfig[viewId].hiddenCols :[];

        const allVisible = state.columns.filter(c => !c.hidden && !hiddenList.includes(c.id));
        const titleCol = allVisible.length > 0 ? allVisible[0] : state.columns[0];
        const propCols = allVisible.filter(c => c.id !== titleCol.id && c.id !== groupColId);

        AdvancedBoard._columnLimits = AdvancedBoard._columnLimits || {};

        columnsData.forEach(colData => {
            const totalInCol = boardData[colData.value].length;
            const colorClass = colData.value ? (state.selectColors[groupColId]?.[colData.value] || 'default-color') : '';
            const safeGrpName = String(colData.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const colLimitKey = `${tableId}_${colData.value}`;
            const currentLimit = AdvancedBoard._columnLimits[colLimitKey] || 30;

            const visibleCards = boardData[colData.value].slice(0, currentLimit);
            const hasMoreCards = totalInCol > currentLimit;

            html += `
                <div class="adv-board-col-wrapper">
                    <div class="adv-board-col-header">
                        ${colData.value ? `<span class="adv-select-pill ${colorClass}" style="margin:0;">${safeGrpName}</span>` : `<span style="font-weight:bold; color:var(--text-secondary); font-size:0.85rem;">Senza Stato</span>`}
                        <span style="color:var(--text-secondary); font-size:0.75rem; opacity:0.7;">${totalInCol}</span>
                    </div>
                    
                    <div class="adv-kanban-col"
                         data-col-val="${colData.value.replace(/"/g, '&quot;')}"
                         ondragover="AdvancedBoard.onDragOver(event)"
                         ondragleave="AdvancedBoard.onDragLeave(event)"
                         ondrop="AdvancedBoard.onDrop(event, '${tableId}', '${colData.value.replace(/'/g, "\\'")}')">
            `;

            visibleCards.forEach(row => {
                let tVal = row.virtualCells[titleCol.id] || 'Senza Titolo';
                if (titleCol.type === 'record_note') {
                    const noteObj = typeof Store !== 'undefined' ? Store.getNote(tVal) : null;
                    if (noteObj) tVal = noteObj.title || 'Senza Titolo';
                }
                tVal = String(tVal).replace(/</g, '&lt;').replace(/>/g, '&gt;');

                html += `
                    <div class="adv-board-card" draggable="${isEdit ? 'true' : 'false'}" 
                         ondragstart="AdvancedBoard.onDragStart(event, '${row.id}', '${tableId}')"
                         ondragend="AdvancedBoard.onDragEnd(event)"
                         style="cursor:${isEdit ? 'grab' : 'pointer'};">
                        
                        <div class="adv-board-card-header">
                            <div class="adv-board-card-title">${tVal}</div>
                            <button class="adv-icon-btn" title="Apri Record" style="margin:0; padding:2px; color:currentColor;" onclick="event.stopPropagation(); AdvancedTable.openRecordView('${tableId}', '${row.id}')">${Icons.recordView}</button>
                        </div>

                        <div class="adv-board-card-props">
                `;

                propCols.forEach(pCol => {
                    let pVal = row.virtualCells[pCol.id];

                    if (pCol.type === 'created_time') pVal = row.createdAt;
                    if (pCol.type === 'last_edited_time') pVal = row.updatedAt;

                    if (pVal === '' || pVal === null || pVal === undefined || (Array.isArray(pVal) && pVal.length === 0)) return;

                    const rendered = AdvancedTable.renderCell(tableId, row, pCol, pVal, state, false);

                    let pValStr = '';
                    if (typeof pVal === 'string') pValStr = pVal;
                    if (typeof pVal === 'number') pValStr = String(pVal);
                    if (typeof pVal === 'object' && pVal !== null && pVal.start) pValStr = pVal.start;

                    let isLongText = (pCol.type === 'text' || pCol.type === 'url') && (pValStr.length > 30 || pValStr.includes('\n'));
                    let forceColumnLayout = isLongText;

                    const safePColName = String(pCol.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

                    if (forceColumnLayout) {
                        html += `
                            <div class="adv-board-prop-col">
                                <span class="adv-board-prop-label">${safePColName}</span>
                                <div class="adv-board-prop-val-col">${rendered}</div>
                            </div>
                        `;
                    } else {
                        html += `
                            <div class="adv-board-prop-row">
                                <span class="adv-board-prop-label">${safePColName}</span>
                                <div class="adv-board-prop-val-row">${rendered}</div>
                            </div>
                        `;
                    }
                });

                html += `</div></div>`;
            });

            // Pulsante "Mostra altri 30 di [totale]" per lazy rendering incrementale
            if (hasMoreCards) {
                const remaining = totalInCol - currentLimit;
                const nextBatch = Math.min(30, remaining);
                html += `
                    <button class="adv-add-btn" 
                            style="text-align:center; justify-content:center; margin-top:4px; margin-bottom:4px; font-weight:bold; border: 1px dashed var(--border-color); background: var(--bg-color); font-size:0.75rem;" 
                            onclick="AdvancedBoard.loadMoreCards(event, '${tableId}', '${colData.value.replace(/'/g, "\\'")}', 30)">
                        Mostra altri ${nextBatch} di ${totalInCol} (${remaining} rimanenti)
                    </button>
                `;
            }

            if (isEdit && !hasFilter && !isSysDB) {
                html += `<button class="adv-add-btn" style="text-align:left; justify-content:flex-start; margin-top:5px; opacity:0.6; flex-shrink:0;" onclick="AdvancedBoard.addCard(event, '${tableId}', '${colData.value.replace(/'/g, "\\'")}')"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.plus} Nuova scheda</span></button>`;
            }

            html += `</div></div>`;
        });

        html += `</div>`;
        
        bodyContainer.innerHTML = html;

        // Ripristina lo scroll orizzontale generale della bacheca
        if (prevScrollX > 0) {
            const newScroll = bodyContainer.querySelector('.adv-scroll-container');
            if (newScroll) newScroll.scrollLeft = prevScrollX;
        }

        // Ripristina la posizione verticale di scroll di ciascuna colonna Kanban
        bodyContainer.querySelectorAll('.adv-kanban-col').forEach(colEl => {
            const colVal = colEl.getAttribute('data-col-val');
            if (colVal !== null && colScrollTops[colVal]) {
                colEl.scrollTop = colScrollTops[colVal];
            }
        });
    },

    onDragStart: (e, rowId, tableId) => {
        AdvancedBoard.draggedCardRowId = rowId;
        AdvancedBoard.draggedFromTableId = tableId;
        e.dataTransfer.effectAllowed = 'move';

        const target = e.currentTarget;
        const rect = target.getBoundingClientRect();
        
        AdvancedBoard.dragOffsetX = e.clientX - rect.left;
        AdvancedBoard.dragOffsetY = e.clientY - rect.top;

        const emptyImage = new Image();
        emptyImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(emptyImage, 0, 0);

        const clone = target.cloneNode(true);
        clone.style.position = 'fixed';
        clone.style.pointerEvents = 'none';
        clone.style.zIndex = '99999';
        clone.style.width = rect.width + 'px';
        clone.style.transform = 'rotate(3deg) scale(1.02)';
        clone.style.boxShadow = '0 15px 30px rgba(0,0,0,0.4)';
        clone.style.opacity = '1';
        clone.style.backgroundColor = getComputedStyle(document.body).getPropertyValue('--bg-color');
        clone.style.border = '2px solid var(--accent-color)';
        clone.style.left = (e.clientX - AdvancedBoard.dragOffsetX) + 'px';
        clone.style.top = (e.clientY - AdvancedBoard.dragOffsetY) + 'px';
        
        document.body.appendChild(clone);
        AdvancedBoard.ghostElement = clone;

        setTimeout(() => {
            target.style.opacity = '0.3';
            target.style.border = '2px dashed var(--accent-color)';
            target.style.backgroundColor = 'var(--item-active)';
        }, 0);

        document.addEventListener('dragover', AdvancedBoard.updateGhostPosition);
    },

    updateGhostPosition: (e) => {
        if (AdvancedBoard.ghostElement) {
            AdvancedBoard.ghostElement.style.left = (e.clientX - AdvancedBoard.dragOffsetX) + 'px';
            AdvancedBoard.ghostElement.style.top = (e.clientY - AdvancedBoard.dragOffsetY) + 'px';
        }
    },

    onDragEnd: (e) => {
        e.currentTarget.style.opacity = '1';
        e.currentTarget.style.border = '1px solid var(--border-color)';
        e.currentTarget.style.backgroundColor = 'var(--bg-color)';
        
        if (AdvancedBoard.ghostElement) {
            AdvancedBoard.ghostElement.remove();
            AdvancedBoard.ghostElement = null;
        }
        
        document.removeEventListener('dragover', AdvancedBoard.updateGhostPosition);
        document.querySelectorAll('.adv-kanban-col').forEach(el => el.style.backgroundColor = 'transparent');
        
        document.querySelectorAll('.node-content').forEach(el => el.classList.remove('drag-middle', 'drag-top', 'drag-bottom'));
        const tc = document.getElementById('treeContainer');
        if (tc) tc.classList.remove('drag-over-root');
    },

    onDragOver: (e) => {
        e.preventDefault();
        const target = e.currentTarget;
        target.style.backgroundColor = 'rgba(37, 99, 235, 0.05)';
    },

    onDragLeave: (e) => {
        const target = e.currentTarget;
        target.style.backgroundColor = 'transparent';
    },

    onDrop: (e, tableId, newGroupValue) => {
        e.preventDefault();
        
        const target = e.currentTarget;
        target.style.backgroundColor = 'transparent';

        const rowId = AdvancedBoard.draggedCardRowId;
        const sourceTableId = AdvancedBoard.draggedFromTableId;

        AdvancedBoard.draggedCardRowId = null;
        AdvancedBoard.draggedFromTableId = null;

        if (AdvancedBoard.ghostElement) {
            AdvancedBoard.ghostElement.remove();
            AdvancedBoard.ghostElement = null;
        }
        document.removeEventListener('dragover', AdvancedBoard.updateGhostPosition);

        if (!rowId || sourceTableId !== tableId) return;

        let state = AdvancedTable.getState(tableId);
        const groupColId = state.boardGroupBy;

        AdvancedTable.updateData(tableId, rowId, groupColId, newGroupValue);
    },

    addCard: (e, tableId, groupValue) => {
        e.stopPropagation();
        let state = AdvancedTable.getState(tableId);
        const groupColId = state.boardGroupBy;

        const now = Date.now();
        const newRow = { id: 'r_' + Store.generateId(), createdAt: now, updatedAt: now, cells: {} };

        state.columns.forEach(c => {
            if (c.id === groupColId) {
                newRow.cells[c.id] = groupValue;
            } else if (c.type === 'checkbox') {
                newRow.cells[c.id] = false;
            } else if (c.type === 'multi-select' || c.type === 'relation') {
                newRow.cells[c.id] =[];
            } else {
                newRow.cells[c.id] = '';
            }
        });

        state.rows.push(newRow);

        // Assicura che la nuova scheda rientri nel limite di visualizzazione della colonna di destinazione
        AdvancedBoard._columnLimits = AdvancedBoard._columnLimits || {};
        const colKey = `${tableId}_${groupValue}`;
        const currentLimit = AdvancedBoard._columnLimits[colKey] || 30;
        const currentCountInGroup = state.rows.filter(r => (r.cells[groupColId] || '') === groupValue).length;
        if (currentCountInGroup > currentLimit) {
            AdvancedBoard._columnLimits[colKey] = currentCountInGroup;
        }

        if (typeof AdvancedAutomations !== 'undefined') {
            AdvancedAutomations.evaluate(tableId, newRow.id, true);
        }

        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();

        AdvancedTable.openRecordView(tableId, newRow.id);
    }
};