/**
 * table-manager-ui.js
 * Trigger visivi e Context Menus (Tasti ingranaggio, righe e colonne).
 * FIX MOUSEMOVE: Corretto il riferimento alla variabile di stato (resizingTable) per
 * sbloccare il passaggio delle coordinate al motore di trascinamento.
 * FIX SELEZIONE: Aggiunta logica per forzare il grassetto programmatico su un array di celle.
 * FIX DRAWER CONFLICT: I controlli e i trigger ignorano completamente le tabelle incluse nel pannello laterale.
 * REFACTOR INTEGRATO: Il menu dell'ingranaggio (openMainMenu) gestisce sia la Cella Corrente 
 * (Allineamento Sinistra/Centro/Destra compatto, Sfondo Cella, Dividi se fusa) sia l'intera Tabella,
 * disattivandosi automaticamente durante la selezione multipla per dare priorità alla toolbar dedicata.
 */

Object.assign(TableManager, {
    UI: {
        triggerMain: null,
        triggerRow: null,
        triggerCol: null,
        triggerMove: null,

        initTriggers: () => {
            if (!document.getElementById('tableTriggerBtn')) {
                const t = document.createElement('div'); 
                t.id = 'tableTriggerBtn'; 
                t.className = 'table-trigger-common table-trigger-btn'; 
                t.innerHTML = typeof Icons !== 'undefined' ? Icons.gear : '⚙️'; 
                t.onclick = (e) => TableManager.UI.openMainMenu(e); 
                document.body.appendChild(t); 
                TableManager.UI.triggerMain = t;
            }

            if (!document.getElementById('tableMoveTrigger')) {
                const t = document.createElement('div'); 
                t.id = 'tableMoveTrigger'; 
                t.className = 'table-trigger-common table-move-trigger'; 
                t.innerHTML = typeof Icons !== 'undefined' ? Icons.dragHandle : '⠿'; 
                t.draggable = true;
                
                t.ondragstart = (e) => TableManager.Drag.handleGlobalTableDrag(e);
                t.ondragend = (e) => TableManager.Drag.handleDragEnd(e);
                
                document.body.appendChild(t); 
                TableManager.UI.triggerMove = t;
            }

            if (!document.getElementById('tableRowTrigger')) {
                const t = document.createElement('div'); 
                t.id = 'tableRowTrigger'; 
                t.className = 'table-trigger-common table-row-trigger'; 
                t.innerHTML = typeof Icons !== 'undefined' ? Icons.rowDots : '⋮'; 
                t.draggable = true;
                t.onclick = (e) => TableManager.UI.openRowMenu(e); 
                t.ondragstart = (e) => TableManager.Drag.handleDragStart(e, 'row');
                t.ondragend = (e) => TableManager.Drag.handleDragEnd(e);
                document.body.appendChild(t); 
                TableManager.UI.triggerRow = t;
            }

            if (!document.getElementById('tableColTrigger')) {
                const t = document.createElement('div'); 
                t.id = 'tableColTrigger'; 
                t.className = 'table-trigger-common table-col-trigger'; 
                t.innerHTML = typeof Icons !== 'undefined' ? Icons.colDots : '⋯'; 
                t.draggable = true;
                t.onclick = (e) => TableManager.UI.openColMenu(e); 
                t.ondragstart = (e) => TableManager.Drag.handleDragStart(e, 'col');
                t.ondragend = (e) => TableManager.Drag.handleDragEnd(e);
                document.body.appendChild(t); 
                TableManager.UI.triggerCol = t;
            }

            // INIZIALIZZAZIONE HOVER RESIZER UNIVERSALE (Celle Tabella Semplice)
            if (!document.getElementById('std-table-hover-resizer')) {
                const resizer = document.createElement('div');
                resizer.id = 'std-table-hover-resizer';
                resizer.style.position = 'absolute';
                resizer.style.width = '8px';
                resizer.style.cursor = 'col-resize';
                resizer.style.zIndex = '95';
                resizer.style.backgroundColor = 'transparent';
                resizer.style.display = 'none';
                resizer.style.transition = 'background-color 0.2s';

                resizer.addEventListener('mouseenter', () => { 
                    resizer.style.backgroundColor = 'var(--accent-color)'; 
                });
                resizer.addEventListener('mouseleave', () => { 
                    if (!TableManager.resizingTable) resizer.style.backgroundColor = 'transparent'; 
                });
                
                resizer.addEventListener('mousedown', (e) => {
                    if (!resizer.targetCell || !resizer.targetTable) return;
                    e.preventDefault();
                    resizer.style.backgroundColor = 'var(--accent-color)';
                    TableManager.Drag.startResize(e, resizer.targetCell, resizer.targetTable);
                });

                document.body.appendChild(resizer);
            }

            // Chiusura immediata dei trigger se l'utente clicca fuori dalla tabella
            document.addEventListener('mousedown', (e) => {
                if (!e.target.closest('table:not(.adv-table)') && 
                    !e.target.closest('.table-trigger-common') && 
                    !e.target.closest('.adv-dropdown') &&
                    e.target.id !== 'std-table-hover-resizer') {
                    TableManager.UI.hideTriggers();
                }
            });

            // MOTORE GLOBALE MOVIMENTO MOUSE (Drag + Hover Resizer)
            document.addEventListener('mousemove', (e) => {
                const resizer = document.getElementById('std-table-hover-resizer');

                // 1. Se stiamo trascinando una colonna, passa il controllo al modulo Drag
                if (TableManager.resizingTable) {
                    if (resizer) {
                        resizer.style.left = (e.pageX - 4) + 'px'; 
                    }
                    if (typeof TableManager.Drag.handleMouseMove === 'function') {
                        TableManager.Drag.handleMouseMove(e);
                    }
                    return;
                }

                // 2. Se non stiamo trascinando, calcoliamo la comparsa della maniglia On-Hover
                if (!resizer || !AppState.isEditMode) return;

                const cell = e.target.closest('.simple-table-wrapper td, .simple-table-wrapper th');
                
                if (cell && !cell.closest('.adv-drawer')) {
                    const rect = cell.getBoundingClientRect();
                    const table = cell.closest('table');
                    const is100Percent = table.style.width === '100%' || !table.style.width;
                    
                    const isLastCell = !cell.nextElementSibling;
                    if (is100Percent && isLastCell) {
                        resizer.style.display = 'none';
                        return;
                    }

                    // Area di attivazione: margine di 8 pixel dal bordo esatto della cella
                    if (Math.abs(e.clientX - rect.right) <= 8) {
                        resizer.style.display = 'block';
                        resizer.style.top = (rect.top + window.scrollY) + 'px';
                        resizer.style.left = (rect.right + window.scrollX - 4) + 'px'; 
                        resizer.style.height = rect.height + 'px'; 
                        
                        resizer.targetCell = cell;
                        resizer.targetTable = table;
                    } else if (e.target !== resizer) {
                        resizer.style.display = 'none';
                    }
                } else if (e.target !== resizer) {
                    resizer.style.display = 'none';
                }
            });

            document.addEventListener('mouseup', (e) => {
                if (typeof TableManager.Drag.handleMouseUp === 'function') {
                    TableManager.Drag.handleMouseUp(e);
                }
            });

            document.addEventListener('mouseleave', (e) => {
                if (e.clientY <= 0 || e.clientX <= 0 || (e.clientX >= window.innerWidth || e.clientY >= window.innerHeight)) {
                    if (typeof TableManager.Drag.handleMouseUp === 'function') {
                        TableManager.Drag.handleMouseUp(e);
                    }
                }
            });
        },

        checkSelection: () => {
            if (!AppState.isEditMode) return;

            // Se sono selezionate 2 o più celle, i trigger singoli non devono interferire con la toolbar di selezione
            if (TableManager.Selection && TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 1) {
                TableManager.UI.hideTriggers();
                return;
            }

            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                let node = selection.getRangeAt(0).startContainer;
                if (node.nodeType === 3) node = node.parentNode;
                
                const cell = node.closest('td, th');
                if (cell) {
                    const table = cell.closest('table');
                    
                    // FIX DRAWER CONFLICT: Ignora le tabelle RDBMS E tutte le tabelle nel cassetto laterale.
                    if (table && (table.classList.contains('adv-table') || table.closest('.adv-drawer'))) {
                        TableManager.UI.hideTriggers();
                        return;
                    }
                    
                    if (TableManager.currentTable !== table) {
                        TableManager.UI.hideTriggers(); 
                        TableManager.currentTable = table;
                    }
                    TableManager.UI.showTriggers(cell, table);
                } else {
                    if (!TableManager.UI.isInteractingWithMenu() && !TableManager.Drag.dragState) {
                        TableManager.UI.hideTriggers();
                        if (typeof TableManager.Selection !== 'undefined' && typeof TableManager.Selection.clearSelection === 'function') {
                            TableManager.Selection.clearSelection();
                        }
                    }
                }
            }
        },

        isInteractingWithMenu: () => {
            const els = [...document.querySelectorAll('.notion-table-menu, .table-trigger-common, #adv-table-drop-indicator, .adv-floating-popover, #std-table-hover-resizer')];
            return els.some(el => el && (el.matches(':hover') || el.matches(':active') || el.style.display === 'block' || el.classList.contains('visible')));
        },

        showTriggers: (cell, table) => {
            // Se c'è una selezione estesa attiva a blocchi, non mostrare i controlli di singola cella
            if (TableManager.Selection && TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 1) {
                TableManager.UI.hideTriggers();
                return;
            }

            TableManager.activeCell = cell;
            const cellRect = cell.getBoundingClientRect();
            const tableRect = table.getBoundingClientRect();
            const scrollX = window.scrollX;
            const scrollY = window.scrollY;

            const tm = TableManager.UI.triggerMain;
            tm.style.top = (cellRect.top + scrollY - 10) + 'px';
            tm.style.left = (cellRect.right + scrollX - 15) + 'px';
            tm.classList.add('visible');

            const tr = TableManager.UI.triggerRow;
            tr.style.top = (cellRect.top + scrollY) + 'px';
            tr.style.height = cellRect.height + 'px';
            tr.style.left = (tableRect.left + scrollX - 22) + 'px';
            tr.classList.add('visible');

            const tc = TableManager.UI.triggerCol;
            tc.style.top = (tableRect.top + scrollY - 22) + 'px';
            tc.style.left = (cellRect.left + scrollX) + 'px';
            tc.style.width = cellRect.width + 'px';
            tc.classList.add('visible');

            const tMove = TableManager.UI.triggerMove;
            tMove.style.top = (tableRect.top + scrollY - 22) + 'px';
            tMove.style.left = (tableRect.left + scrollX - 22) + 'px';
            tMove.classList.add('visible');
        },

        hideTriggers: () => {
            if (TableManager.UI.triggerMain) TableManager.UI.triggerMain.classList.remove('visible');
            if (TableManager.UI.triggerRow) TableManager.UI.triggerRow.classList.remove('visible');
            if (TableManager.UI.triggerCol) TableManager.UI.triggerCol.classList.remove('visible');
            if (TableManager.UI.triggerMove) TableManager.UI.triggerMove.classList.remove('visible');
            
            const hoverResizer = document.getElementById('std-table-hover-resizer');
            if (hoverResizer && !TableManager.resizingTable) {
                hoverResizer.style.display = 'none';
            }

            document.querySelectorAll('.std-col-resizer, .floating-std-col-resizer').forEach(el => {
                const parent = el.parentElement;
                el.remove();
                if (parent && parent.style.position === 'relative') {
                    parent.style.position = '';
                    if (parent.getAttribute('style') === '') parent.removeAttribute('style');
                }
            });
        },

        hideMenus: () => {
            if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll();
        },

        openMainMenu: (e) => {
            if (e) e.stopPropagation();
            const table = TableManager.currentTable;
            if (!table) return;

            const cell = TableManager.activeCell;
            const currentLayout = table.style.tableLayout;
            const currentWidth = table.style.width;
            let mode = 'auto';
            if (currentLayout === 'fixed') mode = currentWidth === 'max-content' ? 'pixel' : 'percent';
            const isStriped = table.classList.contains('table-striped');

            const chk = ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>';

            const svgLeft = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 6h18v2H3V6zm0 5h12v2H3v-2zm0 5h18v2H3v-2z"/></svg>`;
            const svgCenter = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 6h18v2H3V6zm4 5h10v2H7v-2zm-4 5h18v2H3v-2z"/></svg>`;
            const svgRight = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 6h18v2H3V6zm6 5h12v2H9v-2zm-6 5h18v2H3v-2z"/></svg>`;

            const menuItems = [];

            // =========================================================================
            // 1. SEZIONE CELLA CORRENTE (Allineamento, Sfondo, Dividi se unita)
            // =========================================================================
            if (cell) {
                const isMergedCell = (parseInt(cell.getAttribute('rowspan')) || 1) > 1 || (parseInt(cell.getAttribute('colspan')) || 1) > 1;

                menuItems.push({ 
                    type: 'custom', 
                    html: '<div class="adv-dropdown-title" style="margin-bottom:4px;">Cella Attiva</div>' 
                });

                if (isMergedCell) {
                    menuItems.push({
                        icon: Icons.split,
                        label: 'Dividi Cella Unita',
                        onClick: () => {
                            TableManager.Selection.selectedCells = [cell];
                            TableManager.Selection.splitCell();
                        }
                    });
                }

                menuItems.push({
                    type: 'custom',
                    html: `
                        <div style="display:flex; justify-content:space-between; padding:0 4px; gap:5px; margin-bottom:5px;">
                            <button class="adv-icon-btn" onclick="TableManager.UI.performAction('alignCell', 'text-left')" title="Allinea Testo a Sinistra" style="flex:1; justify-content:center; border:1px solid var(--border-color); border-radius:4px; padding:4px; color:var(--text-primary);">${svgLeft}</button>
                            <button class="adv-icon-btn" onclick="TableManager.UI.performAction('alignCell', 'text-center')" title="Allinea Testo al Centro" style="flex:1; justify-content:center; border:1px solid var(--border-color); border-radius:4px; padding:4px; color:var(--text-primary);">${svgCenter}</button>
                            <button class="adv-icon-btn" onclick="TableManager.UI.performAction('alignCell', 'text-right')" title="Allinea Testo a Destra" style="flex:1; justify-content:center; border:1px solid var(--border-color); border-radius:4px; padding:4px; color:var(--text-primary);">${svgRight}</button>
                        </div>
                    `
                });

                menuItems.push({
                    icon: Icons.palette,
                    label: 'Sfondo Cella',
                    type: 'submenu',
                    items: [
                        { type: 'custom', html: TableManager.getColorGridHTML('colorCell') }
                    ]
                });

                menuItems.push({ type: 'divider' });
            }

            // =========================================================================
            // 2. SEZIONE TABELLA INTERA
            // =========================================================================
            menuItems.push({ 
                type: 'custom', 
                html: '<div class="adv-dropdown-title" style="margin-bottom:4px;">Tabella Intera</div>' 
            });

            menuItems.push({
                icon: Icons.layoutAuto, 
                label: 'Layout Tabella', 
                type: 'submenu',
                items: [
                    { icon: Icons.layoutAuto, label: 'Adattivo (Testo)' + (mode === 'auto' ? chk : ''), onClick: () => TableManager.setLayoutMode('auto') },
                    { icon: Icons.percent, label: 'Percentuale (Schermo)' + (mode === 'percent' ? chk : ''), onClick: () => TableManager.setLayoutMode('percent') },
                    { icon: Icons.pixel, label: 'Libera (Scroll Orizz.)' + (mode === 'pixel' ? chk : ''), onClick: () => TableManager.setLayoutMode('pixel') }
                ]
            });

            menuItems.push({ 
                icon: Icons.zebraTbl, 
                label: 'Righe alternate' + (isStriped ? chk : ''), 
                onClick: () => TableManager.toggleZebraCurrent() 
            });

            menuItems.push({ type: 'divider' });

            menuItems.push({
                icon: Icons.file, 
                label: 'Importa / Esporta Dati', 
                type: 'submenu',
                items: [
                    { icon: Icons.clipboard, label: 'Copia negli Appunti (per Excel)', onClick: () => TableManager.CSV.copyToClipboardAsExcel() },
                    { type: 'divider' },
                    { icon: Icons.editTbl, label: 'Modifica Dati con Editor di Testo', onClick: () => TableManager.CSV.editDataAsCSV() },
                    { icon: Icons.exportCSV, label: 'Esporta Tabella in file CSV', onClick: () => TableManager.CSV.exportToCSV() }
                ]
            });

            menuItems.push({ type: 'divider' });
            menuItems.push({ 
                icon: Icons.tableDatabase, 
                label: 'Converti in Database', 
                onClick: () => TableManager.CSV.convertToDatabase() 
            });
            menuItems.push({ 
                icon: Icons.trash, 
                label: 'Elimina Tabella', 
                danger: true, 
                onClick: () => TableManager.UI.performAction('deleteTable') 
            });

            UI.Menu.buildContextMenu(e.currentTarget.id, menuItems);
        },

        openRowMenu: (e) => {
            if (e) e.stopPropagation();
            const cell = TableManager.activeCell;
            if (!cell) return;
            const row = cell.parentElement;
            const isHeaderRow = Array.from(row.children).every(c => c.tagName.toLowerCase() === 'th');
            const chk = ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>';

            const menuItems = [
                { icon: Icons.up, label: 'Inserisci Sopra', onClick: () => TableManager.UI.performAction('insertRow', -1) },
                { icon: Icons.down, label: 'Inserisci Sotto', onClick: () => TableManager.UI.performAction('insertRow', 1) },
                { type: 'divider' },
                { icon: Icons.h, label: 'Intestazione (Titoli)' + (isHeaderRow ? chk : ''), onClick: () => TableManager.UI.performAction('setRowType', isHeaderRow ? 'td' : 'th') },
                { type: 'divider' },
                { icon: Icons.palette, label: 'Sfondo Riga', type: 'submenu', items: [
                    { type: 'custom', html: TableManager.getColorGridHTML('colorRow') }
                ]},
                { type: 'divider' },
                { icon: Icons.trash, label: 'Elimina Riga', danger: true, onClick: () => TableManager.UI.performAction('deleteRow') }
            ];
            UI.Menu.buildContextMenu(e.currentTarget.id, menuItems);
        },

        openColMenu: (e) => {
            if (e) e.stopPropagation();

            const svgLeft = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 6h18v2H3V6zm0 5h12v2H3v-2zm0 5h18v2H3v-2z"/></svg>`;
            const svgCenter = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 6h18v2H3V6zm4 5h10v2H7v-2zm-4 5h18v2H3v-2z"/></svg>`;
            const svgRight = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 6h18v2H3V6zm6 5h12v2H9v-2zm-6 5h18v2H3v-2z"/></svg>`;

            const cell = TableManager.activeCell;
            if (!cell) return;
            const row = cell.parentElement;
            const table = row.parentElement.closest('table');
            const colIndex = Array.from(row.children).indexOf(cell);
            
            const isHeaderCol = Array.from(table.rows).every(r => r.cells[colIndex] && r.cells[colIndex].tagName.toLowerCase() === 'th');
            const chk = ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>';

            const menuItems = [
                { icon: Icons.left, label: 'Inserisci a Sinistra', onClick: () => TableManager.UI.performAction('insertCol', -1) },
                { icon: Icons.right, label: 'Inserisci a Destra', onClick: () => TableManager.UI.performAction('insertCol', 1) },
                { type: 'divider' },
                { type: 'custom', html: '<div class="adv-dropdown-title" style="margin-bottom:4px;">Allineamento Testo</div>' },
                { type: 'custom', html: `
                    <div style="display:flex; justify-content:space-between; padding:0 4px; gap:5px; margin-bottom:5px;">
                        <button class="adv-icon-btn" onclick="TableManager.UI.performAction('setColAlign', 'text-left')" title="Sinistra" style="flex:1; justify-content:center; border:1px solid var(--border-color); border-radius:4px; padding:4px; color:var(--text-primary);">${svgLeft}</button>
                        <button class="adv-icon-btn" onclick="TableManager.UI.performAction('setColAlign', 'text-center')" title="Centro" style="flex:1; justify-content:center; border:1px solid var(--border-color); border-radius:4px; padding:4px; color:var(--text-primary);">${svgCenter}</button>
                        <button class="adv-icon-btn" onclick="TableManager.UI.performAction('setColAlign', 'text-right')" title="Destra" style="flex:1; justify-content:center; border:1px solid var(--border-color); border-radius:4px; padding:4px; color:var(--text-primary);">${svgRight}</button>
                    </div>
                ` },
                { type: 'divider' },
                { icon: Icons.h, label: 'Intestazione (Titoli)' + (isHeaderCol ? chk : ''), onClick: () => TableManager.UI.performAction('setColType', isHeaderCol ? 'td' : 'th') },
                { type: 'divider' },
                { icon: Icons.palette, label: 'Sfondo Colonna', type: 'submenu', items: [
                    { type: 'custom', html: TableManager.getColorGridHTML('colorCol') }
                ]},
                { type: 'divider' },
                { icon: Icons.trash, label: 'Elimina Colonna', danger: true, onClick: () => TableManager.UI.performAction('deleteCol') }
            ];

            UI.Menu.buildContextMenu(e.currentTarget.id, menuItems);
        },

        performAction: (actionType, param) => {
            if (!TableManager.activeCell && (!TableManager.Selection.selectedCells || TableManager.Selection.selectedCells.length === 0)) return;
            if (typeof Editor !== 'undefined') Editor.saveSnapshot();

            const isMultiSelect = TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 0;
            const cellsToProcess = isMultiSelect ? TableManager.Selection.selectedCells : [TableManager.activeCell];

            if (['insertRow', 'deleteRow', 'setRowType', 'insertCol', 'deleteCol', 'setColType', 'deleteTable', 'colorRow', 'colorCol', 'setColAlign'].includes(actionType)) {
                
                const cell = TableManager.activeCell;
                const row = cell.parentElement;
                const table = row.parentElement.closest('table');
                const colIndex = Array.from(row.children).indexOf(cell);
                const rowIndex = row.rowIndex;

                if (actionType === 'insertRow') {
                    const newIndex = rowIndex + (param === 1 ? 1 : 0);
                    const newRow = table.insertRow(newIndex);
                    for (let i = 0; i < row.children.length; i++) {
                        const c = newRow.insertCell(i);
                        c.innerHTML = "<br>";
                        const refCell = row.children[i];
                        if (refCell.className) c.className = refCell.className;
                        if (refCell.style.textAlign) c.style.textAlign = refCell.style.textAlign;
                        c.setAttribute('contenteditable', 'true'); 
                        if (c.getAttribute('class') === '') c.removeAttribute('class');
                    }
                }
                else if (actionType === 'deleteRow') {
                    if (table.rows.length > 1) table.deleteRow(rowIndex);
                    else {
                        const wrap = table.closest('.simple-table-wrapper');
                        if (wrap) wrap.remove(); else table.remove();
                    }
                }
                else if (actionType === 'setRowType') {
                    const newTag = param.toLowerCase();
                    const cells = Array.from(row.children);
                    const newRow = document.createElement('tr');
                    cells.forEach(oldCell => {
                        const newCell = document.createElement(newTag);
                        newCell.innerHTML = oldCell.innerHTML;
                        if (oldCell.className) newCell.className = oldCell.className;
                        newCell.setAttribute('contenteditable', 'true');
                        if (oldCell.style.textAlign) newCell.style.textAlign = oldCell.style.textAlign;
                        if (newCell.getAttribute('class') === '') newCell.removeAttribute('class');
                        newRow.appendChild(newCell);
                    });
                    row.parentNode.replaceChild(newRow, row);
                }
                else if (actionType === 'colorRow') {
                    Array.from(row.children).forEach(c => {
                        c.className = c.className.replace(/hl-c\d+/g, '');
                        if (param) c.classList.add(param);
                    });
                }
                else if (actionType === 'insertCol') {
                    const index = colIndex + (param === 1 ? 1 : 0);
                    for (let i = 0; i < table.rows.length; i++) {
                        const tr = table.rows[i];
                        const refCell = tr.cells[colIndex];
                        const type = refCell ? refCell.tagName.toLowerCase() : 'td';
                        
                        const c = document.createElement(type);
                        c.innerHTML = "<br>";
                        
                        if (refCell && refCell.className) c.className = refCell.className;
                        if (refCell && refCell.style.textAlign) c.style.textAlign = refCell.style.textAlign;
                        
                        c.setAttribute('contenteditable', 'true');
                        if (c.getAttribute('class') === '') c.removeAttribute('class');
                        
                        if (index >= tr.cells.length) tr.appendChild(c);
                        else tr.insertBefore(c, tr.cells[index]);
                    }
                    TableManager.currentTable = table;
                    TableManager.setLayoutMode('auto');
                }
                else if (actionType === 'deleteCol') {
                    if (row.children.length > 1) {
                        for (let i = 0; i < table.rows.length; i++) {
                            if (table.rows[i].cells[colIndex]) table.rows[i].deleteCell(colIndex);
                        }
                        TableManager.currentTable = table;
                        TableManager.setLayoutMode('auto');
                    } else {
                        const wrap = table.closest('.simple-table-wrapper');
                        if (wrap) wrap.remove(); else table.remove();
                    }
                }
                else if (actionType === 'setColType') {
                    const newTag = param.toLowerCase();
                    for (let i = 0; i < table.rows.length; i++) {
                        const tr = table.rows[i];
                        const oldCell = tr.cells[colIndex];
                        if (oldCell) {
                            const newCell = document.createElement(newTag);
                            newCell.innerHTML = oldCell.innerHTML;
                            if (oldCell.className) newCell.className = oldCell.className;
                            newCell.setAttribute('contenteditable', 'true');
                            if (oldCell.style.textAlign) newCell.style.textAlign = oldCell.style.textAlign;
                            if (newCell.getAttribute('class') === '') newCell.removeAttribute('class');
                            tr.replaceChild(newCell, oldCell);
                        }
                    }
                }
                else if (actionType === 'colorCol') {
                    for (let i = 0; i < table.rows.length; i++) {
                        const c = table.rows[i].cells[colIndex];
                        if (c) {
                            c.className = c.className.replace(/hl-c\d+/g, '');
                            if (param) c.classList.add(param);
                        }
                    }
                }
                else if (actionType === 'setColAlign') {
                    for (let i = 0; i < table.rows.length; i++) {
                        const c = table.rows[i].cells[colIndex];
                        if (c) {
                            c.classList.remove('text-left', 'text-center', 'text-right');
                            if (param) c.classList.add(param);
                        }
                    }
                }
                else if (actionType === 'deleteTable') {
                    if (confirm("Eliminare l'intera tabella?")) {
                        const wrap = table.closest('.simple-table-wrapper');
                        if (wrap) wrap.remove();
                        else table.remove();
                    }
                }
            } 
            else if (actionType === 'colorCell') {
                cellsToProcess.forEach(c => {
                    c.className = c.className.replace(/hl-c\d+/g, '');
                    if (param) c.classList.add(param);
                });
            }
            else if (actionType === 'alignCell') {
                cellsToProcess.forEach(c => {
                    c.classList.remove('text-left', 'text-center', 'text-right');
                    if (param) c.classList.add(param);
                });
            }
            else if (actionType === 'toggleBold') {
                const sel = window.getSelection();
                cellsToProcess.forEach(c => {
                    const range = document.createRange();
                    range.selectNodeContents(c);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    document.execCommand('bold', false, null);
                });
                sel.removeAllRanges();
            }

            UI.Menu.closeAll(true);
            TableManager.UI.hideTriggers();
            if (typeof TableManager.Selection.clearSelection === 'function') TableManager.Selection.clearSelection();
            if (typeof Store !== 'undefined') Store.triggerAutoSave();
        }
    }
});