/**
 * table-manager-selection.js
 * Motore per la selezione multipla (Range Selection) delle celle nelle tabelle semplici.
 * FIX SELEZIONE CELLE UNITE: Gestione precisa del Bounding Box visivo tramite Grid Map 2D.
 * FIX UX: Aggiunto pulsante rapido per il Grassetto coerente con la toolbar principale.
 * FEATURE CTRL+CLICK: Supporto per la selezione multipla non adiacente (Sparse Selection).
 * FIX DRAWER CONFLICT: Il motore di selezione ignora totalmente le tabelle presenti nel pannello laterale (Drawer).
 * REFACTOR UX CONTESTO: La toolbar fluttuante orizzontale compare ESCLUSIVAMENTE quando sono selezionate 
 * due o più celle, rimanendo perfettamente opaca e ad alto contrasto. Su cella singola la toolbar viene nascosta.
 * FIX DIFENSIVO: Verifica sicura sull'esistenza di Editor.saveSnapshot per evitare eccezioni in ambienti modulari o headless.
 */

Object.assign(TableManager.Selection, {
    isSelecting: false,
    startCell: null,
    selectedCells: [],
    _baseSelection: [], // Salva lo stato precedente durante il drag con CTRL

    init: () => {
        document.addEventListener('mousedown', TableManager.Selection.handleMouseDown);
        document.addEventListener('mouseover', TableManager.Selection.handleMouseOver);
        document.addEventListener('mouseup', TableManager.Selection.handleMouseUp);
        document.addEventListener('click', TableManager.Selection.handleClickOutside);
        
        document.addEventListener('keydown', (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                if (TableManager.Selection.selectedCells.length > 0) {
                    TableManager.Selection.clearSelection();
                }
            }
        });
    },

    handleMouseDown: (e) => {
        if (!AppState.isEditMode) return;
        const cell = e.target.closest('td, th');
        
        // Ignora sia i Database Avanzati che qualsiasi tabella dentro il Drawer laterale
        if (!cell || cell.closest('.adv-table') || cell.closest('.adv-drawer')) {
            if (!e.target.closest('#adv-tbl-selection-popover') && !e.target.closest('.color-swatch')) {
                TableManager.Selection.clearSelection();
            }
            return;
        }

        const isCtrlPressed = e.ctrlKey || e.metaKey;

        if (isCtrlPressed) {
            // Se la cella è già selezionata, la rimuoviamo (Toggle OFF)
            if (TableManager.Selection.selectedCells.includes(cell)) {
                TableManager.Selection.selectedCells = TableManager.Selection.selectedCells.filter(c => c !== cell);
                cell.classList.remove('adv-cell-selected');
                TableManager.Selection.isSelecting = false;
                
                if (TableManager.Selection.selectedCells.length > 1) {
                    TableManager.Selection.showFloatingMenu();
                } else {
                    TableManager.Selection.hideFloatingMenu();
                }
                return;
            } else {
                // Iniziamo un'aggiunta alla selezione (Toggle ON / Drag Additivo)
                TableManager.Selection.isSelecting = true;
                TableManager.Selection.startCell = cell;
                TableManager.Selection._baseSelection = [...TableManager.Selection.selectedCells];
                cell.classList.add('adv-cell-selected');
                TableManager.Selection.selectedCells.push(cell);
                document.body.style.userSelect = 'none';
            }
        } else {
            // Comportamento Standard (Pulisce tutto e inizia da capo)
            TableManager.Selection.clearSelection();
            TableManager.Selection.isSelecting = true;
            TableManager.Selection.startCell = cell;
            TableManager.Selection._baseSelection = [];
            cell.classList.add('adv-cell-selected');
            TableManager.Selection.selectedCells.push(cell);
            document.body.style.userSelect = 'none';
        }
    },

    handleMouseOver: (e) => {
        if (!TableManager.Selection.isSelecting || !TableManager.Selection.startCell) return;
        
        const cell = e.target.closest('td, th');
        if (!cell || cell.closest('table') !== TableManager.Selection.startCell.closest('table')) return;

        TableManager.Selection.updateSelection(cell);

        if (TableManager.Selection.selectedCells.length === 1) {
            TableManager.Selection.clearStyles();
            TableManager.Selection.selectedCells[0].classList.add('adv-cell-selected');
        }
    },

    handleMouseUp: () => {
        if (TableManager.Selection.isSelecting) {
            TableManager.Selection.isSelecting = false;
            document.body.style.userSelect = '';
            
            // La toolbar orizzontale compare SOLTANTO se sono selezionate 2 o più celle
            if (TableManager.Selection.selectedCells.length > 1) {
                TableManager.Selection.showFloatingMenu();
                // Durante la selezione multipla nascondiamo i trigger singoli (ingranaggio, riga, colonna)
                if (typeof TableManager.UI.hideTriggers === 'function') {
                    TableManager.UI.hideTriggers();
                }
            } else {
                TableManager.Selection.hideFloatingMenu();
                // Su cella singola ripristiniamo i trigger normali
                if (TableManager.activeCell && TableManager.currentTable) {
                    TableManager.UI.showTriggers(TableManager.activeCell, TableManager.currentTable);
                }
            }
        }
    },

    handleClickOutside: (e) => {
        if (!e.target.closest('table:not(.adv-table)') && !e.target.closest('#adv-tbl-selection-popover')) {
            TableManager.Selection.clearSelection();
        }
    },

    updateSelection: (endCell) => {
        const table = TableManager.Selection.startCell.closest('table');
        TableManager.Selection.clearStyles();

        const { grid, cellData } = TableManager.getGridMap(table);
        
        const startData = cellData.get(TableManager.Selection.startCell);
        const endData = cellData.get(endCell);
        
        if (!startData || !endData) return;

        let minX = Math.min(startData.x, endData.x);
        let maxX = Math.max(startData.maxX, endData.maxX);
        let minY = Math.min(startData.y, endData.y);
        let maxY = Math.max(startData.maxY, endData.maxY);

        let expanding = true;
        while (expanding) {
            expanding = false;
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    const cellInGrid = grid[y] && grid[y][x];
                    if (cellInGrid) {
                        const d = cellData.get(cellInGrid);
                        if (d.x < minX) { minX = d.x; expanding = true; }
                        if (d.maxX > maxX) { maxX = d.maxX; expanding = true; }
                        if (d.y < minY) { minY = d.y; expanding = true; }
                        if (d.maxY > maxY) { maxY = d.maxY; expanding = true; }
                    }
                }
            }
        }

        const newBoxCells = new Set();
        
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const cellInGrid = grid[y] && grid[y][x];
                if (cellInGrid) {
                    newBoxCells.add(cellInGrid);
                }
            }
        }

        // Unisce la selezione base (fatta coi click precedenti) con il nuovo blocco trascinato
        const baseSet = new Set(TableManager.Selection._baseSelection || []);
        const combined = new Set([...baseSet, ...newBoxCells]);

        TableManager.Selection.selectedCells = Array.from(combined);
        TableManager.Selection.selectedCells.forEach(c => c.classList.add('adv-cell-selected'));
    },

    clearStyles: () => {
        document.querySelectorAll('.adv-cell-selected').forEach(c => c.classList.remove('adv-cell-selected'));
    },

    clearSelection: () => {
        TableManager.Selection.clearStyles();
        TableManager.Selection.selectedCells = [];
        TableManager.Selection._baseSelection = [];
        TableManager.Selection.hideFloatingMenu();
    },

    // FUNZIONE HELPER: Valuta se l'array di celle forma un rettangolo perfetto
    isContiguous: (cells, table) => {
        if (!cells || cells.length <= 1) return true;
        
        const { grid, cellData } = TableManager.getGridMap(table);
        let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;

        cells.forEach(c => {
            const pos = cellData.get(c);
            if (!pos) return;
            if (pos.x < minX) minX = pos.x;
            if (pos.y < minY) minY = pos.y;
            if (pos.maxX > maxX) maxX = pos.maxX;
            if (pos.maxY > maxY) maxY = pos.maxY;
        });

        let expectedCount = 0;
        const processed = new Set();
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const cellInGrid = grid[y] && grid[y][x];
                if (cellInGrid && !processed.has(cellInGrid)) {
                    processed.add(cellInGrid);
                    expectedCount++;
                }
            }
        }
        
        // Se il numero di celle selezionate dall'utente coincide esattamente 
        // col numero di celle fisiche presenti in quell'area, la selezione è contigua.
        return cells.length === expectedCount;
    },

    copySelectedAsExcel: () => {
        if (!TableManager.Selection.selectedCells || TableManager.Selection.selectedCells.length === 0) return;

        const table = TableManager.Selection.selectedCells[0].closest('table');
        if (!table) return;

        let minRow = Infinity, maxRow = -1;
        let minCol = Infinity, maxCol = -1;

        TableManager.Selection.selectedCells.forEach(cell => {
            const rIdx = cell.parentElement.rowIndex;
            const cIdx = cell.cellIndex;
            if (rIdx < minRow) minRow = rIdx;
            if (rIdx > maxRow) maxRow = rIdx;
            if (cIdx < minCol) minCol = cIdx;
            if (cIdx > maxCol) maxCol = cIdx;
        });

        const rowsData = [];
        for (let r = minRow; r <= maxRow; r++) {
            const rowObj = table.rows[r];
            if (!rowObj) continue;
            let rowValues = [];
            
            for (let c = minCol; c <= maxCol; c++) {
                const cell = rowObj.cells[c];
                let text = cell ? cell.innerHTML.replace(/<br\s*[\/]?>/gi, '\n') : "";
                
                if (TableManager.CSV && typeof TableManager.CSV.escapeCSV === 'function') {
                    text = TableManager.CSV.escapeCSV(text, '\t');
                } else {
                    let tempDiv = document.createElement('div');
                    tempDiv.innerHTML = text;
                    text = tempDiv.innerText || tempDiv.textContent;
                }
                
                rowValues.push(text);
            }
            rowsData.push(rowValues.join('\t'));
        }

        const tsvContent = rowsData.join('\n');

        navigator.clipboard.writeText(tsvContent).then(() => {
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast("Selezione copiata per Excel!", "success");
            }
            TableManager.Selection.clearSelection();
        }).catch(err => {
            console.error("Errore copia selezione: ", err);
            alert("Impossibile copiare negli appunti.");
        });
    },

    mergeCells: () => {
        const cells = TableManager.Selection.selectedCells;
        if (!cells || cells.length < 2) return;

        const table = cells[0].closest('table');
        if (!table) return;

        if (typeof Editor !== 'undefined' && typeof Editor.saveSnapshot === 'function') {
            Editor.saveSnapshot();
        }

        const { cellData } = TableManager.getGridMap(table);

        let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
        let targetCell = null;

        cells.forEach(c => {
            const pos = cellData.get(c);
            if (pos.x < minX) minX = pos.x;
            if (pos.y < minY) minY = pos.y;
            if (pos.maxX > maxX) maxX = pos.maxX;
            if (pos.maxY > maxY) maxY = pos.maxY;
            
            if (pos.x === minX && pos.y === minY) {
                targetCell = c;
            }
        });

        if (!targetCell) targetCell = cells[0];

        let mergedContent = "";
        
        const sortedCells = [...cells].sort((a,b) => {
            const pA = cellData.get(a);
            const pB = cellData.get(b);
            if (pA.y === pB.y) return pA.x - pB.x;
            return pA.y - pB.y;
        });

        sortedCells.forEach(c => {
            let content = c.innerHTML;
            
            content = content.replace(/(<br\s*\/?>|\s|&nbsp;)+$/i, '');
            if (content === '<br>' || content === '<br/>') content = '';
            content = content.trim();

            if (content) {
                if (mergedContent) mergedContent += '<br>' + content;
                else mergedContent = content;
            }
            if (c !== targetCell) c.remove();
        });

        if (!mergedContent) mergedContent = "<br>";

        const finalRowSpan = maxY - minY + 1;
        const finalColSpan = maxX - minX + 1;

        if (finalRowSpan > 1) targetCell.setAttribute('rowspan', finalRowSpan);
        else targetCell.removeAttribute('rowspan');

        if (finalColSpan > 1) targetCell.setAttribute('colspan', finalColSpan);
        else targetCell.removeAttribute('colspan');
        
        targetCell.innerHTML = mergedContent;

        TableManager.Selection.clearSelection();
        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    },

    splitCell: () => {
        const cells = TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 0 
            ? TableManager.Selection.selectedCells 
            : (TableManager.activeCell ? [TableManager.activeCell] : []);
            
        if (!cells || cells.length !== 1) return;
        
        const cell = cells[0];
        const rs = parseInt(cell.getAttribute('rowspan')) || 1;
        const cs = parseInt(cell.getAttribute('colspan')) || 1;
        
        if (rs === 1 && cs === 1) return;

        const table = cell.closest('table');
        if (!table) return;

        if (typeof Editor !== 'undefined' && typeof Editor.saveSnapshot === 'function') {
            Editor.saveSnapshot();
        }

        // Estraiamo la mappa della griglia *prima* di rimuovere gli attributi
        // per avere le coordinate fisiche (x, y) della cella da dividere.
        const { cellData } = TableManager.getGridMap(table);
        const pos = cellData.get(cell);

        const startX = pos ? pos.x : 0;
        const startY = pos ? pos.y : cell.parentNode.rowIndex;
        const cellType = cell.tagName.toLowerCase();

        cell.removeAttribute('rowspan');
        cell.removeAttribute('colspan');

        // Aggiunta celle mancanti sulla stessa riga
        for (let c = 1; c < cs; c++) {
            const newCell = document.createElement(cellType);
            newCell.innerHTML = '<br>';
            newCell.setAttribute('contenteditable', 'true');
            cell.parentNode.insertBefore(newCell, cell.nextSibling);
        }

        // Aggiunta celle mancanti sulle righe sottostanti generate dal rowspan
        for (let r = 1; r < rs; r++) {
            const targetRow = table.rows[startY + r];
            if (!targetRow) continue;

            // Troviamo il punto di inserimento corretto:
            // Cerchiamo la prima cella fisica della riga target che, nella mappa originale,
            // si trovava a destra o nella stessa posizione (x >= startX) rispetto alla cella divisa.
            let insertBeforeNode = null;
            for (let i = 0; i < targetRow.cells.length; i++) {
                const cNode = targetRow.cells[i];
                const cPos = cellData.get(cNode);
                if (cPos && cPos.x >= startX) {
                    insertBeforeNode = cNode;
                    break;
                }
            }
            
            for (let c = 0; c < cs; c++) {
                const newCell = document.createElement(cellType);
                newCell.innerHTML = '<br>';
                newCell.setAttribute('contenteditable', 'true');
                
                if (insertBeforeNode) {
                    targetRow.insertBefore(newCell, insertBeforeNode);
                } else {
                    targetRow.appendChild(newCell);
                }
            }
        }
        
        TableManager.Selection.clearSelection();
        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    },

    showFloatingMenu: () => {
        TableManager.Selection.hideFloatingMenu();

        // La toolbar compare ESCLUSIVAMENTE per selezioni multiple (2 o più celle)
        if (!TableManager.Selection.selectedCells || TableManager.Selection.selectedCells.length < 2) {
            return;
        }

        const singleCell = TableManager.Selection.selectedCells[0];
        const table = singleCell.closest('table');
        
        // Controlla se la selezione forma un blocco perfetto o se sono celle sparse (CTRL+Click)
        const isContiguous = TableManager.Selection.isContiguous(TableManager.Selection.selectedCells, table);

        let isMergeSafe = true;
        if (isContiguous) {
            const isHorizontalOnly = TableManager.Selection.selectedCells.every(c => c.parentNode === singleCell.parentNode);
            let isVerticalOnly = true;
            let currentCellIndex = singleCell.cellIndex;
            TableManager.Selection.selectedCells.forEach(c => { if(c.cellIndex !== currentCellIndex) isVerticalOnly = false; });
            
            const containsMergedCell = TableManager.Selection.selectedCells.some(c => parseInt(c.getAttribute('rowspan')||1) > 1 || parseInt(c.getAttribute('colspan')||1) > 1);

            if (containsMergedCell) {
                if (isHorizontalOnly) {
                    isMergeSafe = !TableManager.Selection.selectedCells.some(c => parseInt(c.getAttribute('rowspan')||1) > 1);
                } else if (isVerticalOnly) {
                    isMergeSafe = !TableManager.Selection.selectedCells.some(c => parseInt(c.getAttribute('colspan')||1) > 1);
                } else {
                    isMergeSafe = false;
                }
            }
        }

        const popover = document.createElement('div');
        popover.id = 'adv-tbl-selection-popover';
        popover.className = 'adv-floating-popover';
        
        let extraButtons = '';
        if (isContiguous) {
            extraButtons = `
                <div style="width:1px; height:16px; background:var(--border-color); margin: 0 4px;"></div>
                ${isMergeSafe ? `<button onclick="TableManager.Selection.mergeCells()" title="Unisci Celle Selezionate">${Icons.merge}</button>` : `<button disabled style="opacity:0.3; cursor:not-allowed;" title="Azione bloccata: Unione mista di celle rischierebbe di corrompere la struttura della tabella.">${Icons.merge}</button>`}
                <button onclick="TableManager.Selection.copySelectedAsExcel()" title="Copia selezione per Excel">${Icons.clipboard}</button>
            `;
        }

        popover.innerHTML = `
            <button onclick="TableManager.UI.performAction('toggleBold')" title="Grassetto (Tutte le celle selezionate)"><b style="font-size:0.9rem; line-height:1;">B</b></button>
            <div style="width:1px; height:16px; background:var(--border-color); margin: 0 4px;"></div>

            <button onclick="TableManager.UI.performAction('alignCell', 'text-left')" title="Allinea a Sinistra">${Icons.alignLeft}</button>
            <button onclick="TableManager.UI.performAction('alignCell', 'text-center')" title="Allinea al Centro">${Icons.alignCenter}</button>
            <button onclick="TableManager.UI.performAction('alignCell', 'text-right')" title="Allinea a Destra">${Icons.alignRight}</button>
            
            <div style="width:1px; height:16px; background:var(--border-color); margin: 0 4px;"></div>
            
            <div style="display:flex; align-items:center; position:relative;" id="tblSelectionColorBtn">
                <button title="Colore Sfondo Selezione" onclick="event.stopPropagation(); document.getElementById('tblSelectionColorDrop').classList.toggle('hidden')">
                    <span style="color:var(--accent-color);">${typeof Icons !== 'undefined' ? Icons.palette : '🎨'}</span> Sfondo
                </button>
                <div id="tblSelectionColorDrop" class="hidden" style="position:absolute; bottom:100%; margin-bottom:5px; right:0; padding:8px; width:max-content; z-index:10000; background:var(--sidebar-bg); border:1px solid var(--border-color); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.25);">
                    ${TableManager.getColorGridHTML('colorCell')}
                </div>
            </div>
            ${extraButtons}
        `;

        document.body.appendChild(popover);

        let maxBottom = 0;
        let maxRight = 0;
        TableManager.Selection.selectedCells.forEach(cell => {
            const rect = cell.getBoundingClientRect();
            if (rect.bottom > maxBottom) maxBottom = rect.bottom;
            if (rect.right > maxRight) maxRight = rect.right;
        });

        let top = maxBottom + window.scrollY + 5;
        let left = maxRight + window.scrollX - popover.offsetWidth;

        if (left < window.scrollX) left = window.scrollX + 10;

        popover.style.top = top + 'px';
        popover.style.left = left + 'px';

        popover.addEventListener('mousedown', e => e.stopPropagation());
        popover.addEventListener('click', e => e.stopPropagation());
    },

    hideFloatingMenu: () => {
        const existing = document.getElementById('adv-tbl-selection-popover');
        if (existing) existing.remove();
    }
});