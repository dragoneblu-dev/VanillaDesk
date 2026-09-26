/**
 * table-manager-drag.js
 * Logiche HTML5 Drag & Drop (Trascinamento Righe, Colonne e intera Tabella Semplice).
 * FIX COLGROUP RESIZER: L'algoritmo non imposta più stili sui TD/TH. Aggiorna
 * esclusivamente gli attributi width dei tag <col> presenti nel <colgroup>,
 * risolvendo in modo assoluto i problemi con intestazioni unite (colspan).
 * RESTORE DRAG RIGHE/COLONNE: Reintegrati e blindati i listener document su dragenter, dragover e drop.
 */

Object.assign(TableManager.Drag, {
    dragState: null,

    init: () => {
        document.addEventListener('dragenter', (e) => TableManager.Drag.handleDragEnter(e));
        document.addEventListener('dragover', (e) => TableManager.Drag.handleDragOver(e));
        document.addEventListener('drop', (e) => TableManager.Drag.handleDrop(e));
    },

    handleGlobalTableDrag: (e) => {
        const table = TableManager.currentTable;
        if (!table) { e.preventDefault(); return; }

        const wrapper = table.closest('.simple-table-wrapper');
        if (!wrapper) { e.preventDefault(); return; }

        UI.Menu.closeAll(true);
        if (TableManager.UI.triggerMain) TableManager.UI.triggerMain.classList.remove('visible');
        if (TableManager.UI.triggerRow) TableManager.UI.triggerRow.classList.remove('visible');
        if (TableManager.UI.triggerCol) TableManager.UI.triggerCol.classList.remove('visible');
        
        const hoverResizer = document.getElementById('std-table-hover-resizer');
        if (hoverResizer) hoverResizer.style.display = 'none';

        AppState.draggedBlockId = wrapper.id;
        AppState.draggedBlockType = 'simple-table';
        
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', wrapper.id);
        e.dataTransfer.setDragImage(wrapper, 10, 10);
    },

    handleDragStart: (e, type) => {
        if (!TableManager.activeCell || !TableManager.currentTable) {
            e.preventDefault();
            return;
        }
        
        UI.Menu.closeAll(true);

        const table = TableManager.currentTable;
        const cell = TableManager.activeCell;
        
        const { grid, cellData } = TableManager.getGridMap(table);
        const cellPos = cellData.get(cell);

        if (!cellPos) {
            e.preventDefault();
            return;
        }

        const sourceIndex = type === 'row' ? cellPos.y : cellPos.x;

        let isSourceSpanIntersecting = false;
        for (let c of cellData.values()) {
            if (type === 'row') {
                if (c.y <= sourceIndex && c.maxY >= sourceIndex) {
                    if (c.y < sourceIndex || c.maxY > sourceIndex) {
                        isSourceSpanIntersecting = true; break;
                    }
                }
            } else {
                if (c.x <= sourceIndex && c.maxX >= sourceIndex) {
                    if (c.x < sourceIndex || c.maxX > sourceIndex) {
                        isSourceSpanIntersecting = true; break;
                    }
                }
            }
        }

        if (isSourceSpanIntersecting) {
            e.preventDefault();
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast("Impossibile spostare: La riga o colonna contiene celle unite che si estendono oltre. Dividi le celle prima di spostare.", "warning");
            }
            return;
        }

        TableManager.Drag.dragState = {
            active: true,
            type: type,
            table: table,
            sourceIndex: sourceIndex,
            targetIndex: -1,
            targetPlacement: '' 
        };

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'table_internal_drag');
        
        const emptyImage = new Image();
        emptyImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(emptyImage, 0, 0);
    },

    handleDragEnd: (e) => {
        const ind = document.getElementById('adv-table-drop-indicator');
        if (ind) ind.style.display = 'none';
        TableManager.Drag.dragState = null;
        if (typeof TableManager.UI.hideTriggers === 'function') TableManager.UI.hideTriggers();
        
        AppState.draggedBlockId = null;
        AppState.draggedBlockType = null;
    },

    // ==========================================================
    // RESIZER COLONNE BASATO SU COLGROUP
    // ==========================================================
    startResize: (e, cell, table) => {
        e.preventDefault(); 
        e.stopPropagation();

        TableManager._stripLegacyWidths(table);

        const { grid, cellData } = TableManager.getGridMap(table);
        const cellPos = cellData.get(cell);

        if (!cellPos) return;

        // Identifica l'indice matematico della colonna trascinata
        const targetColIndex = cellPos.maxX; 

        TableManager.resizingTable = table;
        TableManager.resizeColIndex = targetColIndex;
        TableManager.startX = e.pageX;
        TableManager.tableWidth = table.getBoundingClientRect().width;
        TableManager.isPercent = table.style.width === '100%' || !table.style.width;

        if (table.style.tableLayout !== 'fixed' || !table.querySelector('colgroup')) {
            TableManager.currentTable = table;
            TableManager.setLayoutMode(TableManager.isPercent ? 'percent' : 'pixel', true);
        }

        const colgroup = table.querySelector('colgroup');
        if (!colgroup || !colgroup.children[targetColIndex]) {
            TableManager.resizingTable = null;
            return;
        }

        const targetColEl = colgroup.children[targetColIndex];

        if (TableManager.isPercent) {
            TableManager.resizeNextColIndex = targetColIndex + 1;
            const nextColEl = colgroup.children[TableManager.resizeNextColIndex];
            
            if (!nextColEl) {
                TableManager.resizingTable = null;
                return;
            }

            TableManager.startPctLeft = parseFloat(targetColEl.style.width) || (targetColEl.getBoundingClientRect().width / TableManager.tableWidth * 100);
            TableManager.startPctRight = parseFloat(nextColEl.style.width) || (nextColEl.getBoundingClientRect().width / TableManager.tableWidth * 100);
        } else {
            TableManager.startWidthPx = parseFloat(targetColEl.style.width) || targetColEl.getBoundingClientRect().width;
        }

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    },

    handleMouseMove: (e) => {
        if (!TableManager.resizingTable) return;
        
        const diff = e.pageX - TableManager.startX;
        const table = TableManager.resizingTable;
        const colgroup = table.querySelector('colgroup');
        
        if (!colgroup) return;

        if (TableManager.isPercent && TableManager.resizeNextColIndex !== undefined) {
            let deltaPct = (diff / TableManager.tableWidth) * 100;
            let newLeft = TableManager.startPctLeft + deltaPct;
            let newRight = TableManager.startPctRight - deltaPct;

            if (newLeft > 5 && newRight > 5) {
                colgroup.children[TableManager.resizeColIndex].style.width = newLeft + '%';
                colgroup.children[TableManager.resizeNextColIndex].style.width = newRight + '%';
            }
        } else if (!TableManager.isPercent) {
            let newWidth = TableManager.startWidthPx + diff;
            if (newWidth < 30) newWidth = 30;
            colgroup.children[TableManager.resizeColIndex].style.width = newWidth + 'px';
        }
    },

    handleMouseUp: (e) => {
        if (!TableManager.resizingTable) return;
        
        const hoverResizer = document.getElementById('std-table-hover-resizer');
        if (hoverResizer) {
            hoverResizer.classList.remove('resizing');
            hoverResizer.style.backgroundColor = 'transparent';
            hoverResizer.style.display = 'none';
        }
        
        TableManager.resizingTable = null;
        TableManager.resizeColIndex = undefined;
        TableManager.resizeNextColIndex = undefined;
        
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();
        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    },

    // ==========================================================
    // OVER & DROP - CALCOLI GEOMETRICI DRAG (Righe/Colonne)
    // ==========================================================
    
    _getDropIndicator: () => {
        let ind = document.getElementById('adv-table-drop-indicator');
        if (!ind) {
            ind = document.createElement('div');
            ind.id = 'adv-table-drop-indicator';
            ind.style.position = 'absolute';
            ind.style.backgroundColor = 'var(--accent-color)';
            ind.style.zIndex = '1000';
            ind.style.pointerEvents = 'none';
            document.body.appendChild(ind);
        }
        return ind;
    },

    handleDragEnter: (e) => {
        const ds = TableManager.Drag.dragState;
        if (!ds || !ds.active) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
    },

    handleDragOver: (e) => {
        const ds = TableManager.Drag.dragState;
        if (!ds || !ds.active) return;

        e.preventDefault(); 
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        const table = ds.table;
        const ind = TableManager.Drag._getDropIndicator();

        const cell = e.target.closest('td, th');
        if (!cell || !table.contains(cell)) {
            ind.style.display = 'none';
            e.dataTransfer.dropEffect = 'none';
            return;
        }

        const { cellData } = TableManager.getGridMap(table);
        const cellPos = cellData.get(cell);
        if (!cellPos) return;

        const rect = cell.getBoundingClientRect();
        
        if (ds.type === 'row') {
            const isBottom = e.clientY > rect.top + (rect.height / 2);
            ds.targetIndex = isBottom ? cellPos.maxY + 1 : cellPos.y;
            ds.targetPlacement = isBottom ? 'after' : 'before';
            
            let isTargetIntersecting = false;
            for (let c of cellData.values()) {
                if (c.y < ds.targetIndex && c.maxY >= ds.targetIndex) {
                    isTargetIntersecting = true; break;
                }
            }

            if (isTargetIntersecting) {
                ind.style.display = 'none';
                e.dataTransfer.dropEffect = 'none';
                return;
            }

            const topPos = isBottom ? rect.bottom : rect.top;
            ind.style.top = (topPos + window.scrollY - 2) + 'px';
            ind.style.left = (table.getBoundingClientRect().left + window.scrollX) + 'px';
            ind.style.width = table.getBoundingClientRect().width + 'px';
            ind.style.height = '4px';
            ind.style.display = 'block';
        } 
        else if (ds.type === 'col') {
            const isRight = e.clientX > rect.left + (rect.width / 2);
            ds.targetIndex = isRight ? cellPos.maxX + 1 : cellPos.x;
            ds.targetPlacement = isRight ? 'after' : 'before';

            let isTargetIntersecting = false;
            for (let c of cellData.values()) {
                if (c.x < ds.targetIndex && c.maxX >= ds.targetIndex) {
                    isTargetIntersecting = true; break;
                }
            }

            if (isTargetIntersecting) {
                ind.style.display = 'none';
                e.dataTransfer.dropEffect = 'none';
                return;
            }

            const leftPos = isRight ? rect.right : rect.left;
            ind.style.left = (leftPos + window.scrollX - 2) + 'px';
            ind.style.top = (table.getBoundingClientRect().top + window.scrollY) + 'px';
            ind.style.height = table.getBoundingClientRect().height + 'px';
            ind.style.width = '4px';
            ind.style.display = 'block';
        }
    },

    handleDrop: (e) => {
        const ds = TableManager.Drag.dragState;
        if (!ds || !ds.active) return;

        e.preventDefault();
        e.stopPropagation();

        const ind = document.getElementById('adv-table-drop-indicator');
        if (ind) ind.style.display = 'none';

        if (ds.targetIndex === -1 || ds.sourceIndex === ds.targetIndex) {
            TableManager.Drag.dragState = null;
            if (typeof TableManager.UI.hideTriggers === 'function') TableManager.UI.hideTriggers();
            return;
        }

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();

        const table = ds.table;
        const { grid, cellData } = TableManager.getGridMap(table);

        if (ds.type === 'row') {
            const sourceRow = Array.from(table.rows).find(r => r.rowIndex === ds.sourceIndex);
            
            if (sourceRow) {
                const tbody = table.querySelector('tbody') || table;
                if (ds.targetIndex >= table.rows.length) {
                    tbody.appendChild(sourceRow);
                } else {
                    const refRow = Array.from(table.rows).find(r => r.rowIndex === ds.targetIndex);
                    if (refRow) refRow.parentNode.insertBefore(sourceRow, refRow);
                }
            }
        } 
        else if (ds.type === 'col') {
            const rows = Array.from(table.rows);
            for (let r = 0; r < rows.length; r++) {
                const rowObj = rows[r];
                const sourceCell = grid[r][ds.sourceIndex];
                if (!sourceCell) continue;
                
                const cellInfo = cellData.get(sourceCell);
                if (cellInfo.y !== r) continue; 
                
                if (sourceCell.parentNode === rowObj) {
                    rowObj.removeChild(sourceCell);
                }

                const targetCell = grid[r][ds.targetIndex];
                if (targetCell) {
                    rowObj.insertBefore(sourceCell, targetCell);
                } else {
                    rowObj.appendChild(sourceCell);
                }
            }
        }

        // Una volta spostata la riga/colonna, il colgroup non combacia più, quindi
        // diciamo al layout di riconfigurarsi
        TableManager.setLayoutMode('auto');

        TableManager.Drag.dragState = null;
        if (typeof TableManager.UI.hideTriggers === 'function') TableManager.UI.hideTriggers();
        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    }
});