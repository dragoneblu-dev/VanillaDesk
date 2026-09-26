/**
 * table-manager-core.js
 * Inizializzazione, Isolamento Leggero e funzioni di utilità base per Tabelle Semplici.
 * FIX LAYOUT W3C: Introdotto l'uso di <colgroup> e <col> per il dimensionamento. 
 * Questo scavalca il limite nativo dei browser che bloccava il ridimensionamento
 * se la prima riga della tabella conteneva celle unite (colspan).
 * RESTORE DRAG LISTENERS: Invocazione esplicita di TableManager.Drag.init() al caricamento.
 */

window.TableManager = {
    activeCell: null,
    currentTable: null,
    editingTable: null,

    UI: {},
    Selection: {},
    Drag: {},
    CSV: {},

    init: () => {
        try { document.execCommand("enableObjectResizing", false, false); } catch (e) {}
        
        if (typeof WidgetManager !== 'undefined') {
            WidgetManager.register('simple-table', TableManager);
        }

        setTimeout(() => {
            if (typeof TableManager.UI.initTriggers === 'function') TableManager.UI.initTriggers();
            if (typeof TableManager.Selection.init === 'function') TableManager.Selection.init();
            if (typeof TableManager.Drag.init === 'function') TableManager.Drag.init();
        }, 50);
    },

    hideTriggers: () => { if (typeof TableManager.UI.hideTriggers === 'function') TableManager.UI.hideTriggers(); },
    hideMenus: () => { if (typeof TableManager.UI.hideMenus === 'function') TableManager.UI.hideMenus(); },
    checkSelection: () => { if (typeof TableManager.UI.checkSelection === 'function') TableManager.UI.checkSelection(); },
    
    openCreationModal: () => {
        if (typeof TableManager.CSV.openCreationModal === 'function') {
            TableManager.CSV.openCreationModal();
        }
    },
    
    editCurrentTable: (tableNode) => {
        TableManager.currentTable = tableNode;
        if (typeof TableManager.CSV.editDataAsCSV === 'function') {
            TableManager.CSV.editDataAsCSV();
        }
    },

    getGridMap: (table) => {
        const grid = [];
        const cellData = new Map();
        
        // Raccogliamo solo le righe vere (ignorando eventuali colgroup)
        const rows = Array.from(table.rows);
        
        for (let r = 0; r < rows.length; r++) {
            if (!grid[r]) grid[r] = [];
            const row = rows[r];
            let x = 0;
            
            for (let c = 0; c < row.cells.length; c++) {
                const cell = row.cells[c];
                
                while (grid[r][x]) { x++; }
                
                const rs = parseInt(cell.getAttribute('rowspan')) || 1;
                const cs = parseInt(cell.getAttribute('colspan')) || 1;
                
                cellData.set(cell, { 
                    x: x, 
                    y: r, 
                    w: cs, 
                    h: rs, 
                    maxX: x + cs - 1, 
                    maxY: r + rs - 1 
                });
                
                for (let yy = 0; yy < rs; yy++) {
                    if (!grid[r + yy]) grid[r + yy] = [];
                    for (let xx = 0; xx < cs; xx++) {
                        grid[r + yy][x + xx] = cell;
                    }
                }
                x += cs;
            }
        }
        return { grid, cellData };
    },

    mountAll: (container = document) => {
        const root = container.id === 'noteContent' ? container : (container.querySelector ? container.querySelector('#noteContent') || container : document);
        
        const nakedTables = root.querySelectorAll('table:not(.adv-table)');
        nakedTables.forEach(table => {
            if (table.closest('.simple-table-wrapper')) return; 
            
            const wrapper = document.createElement('div');
            wrapper.className = 'adv-widget-shell simple-table-wrapper';
            wrapper.setAttribute('data-widget-type', 'simple-table');
            
            const uniqueId = 'stbl_' + (typeof Store !== 'undefined' ? Store.generateId() : Date.now());
            wrapper.id = uniqueId;
            
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        });

        const wrappers = root.querySelectorAll('.simple-table-wrapper, [data-widget-type="simple-table"]');
        wrappers.forEach(wrapper => {
            const isEdit = typeof AppState !== 'undefined' ? AppState.isEditMode : false;
            if (!wrapper.id) wrapper.id = 'stbl_' + (typeof Store !== 'undefined' ? Store.generateId() : Date.now());
            
            wrapper.setAttribute('contenteditable', 'false'); 
            
            wrapper.querySelectorAll('td, th').forEach(cell => {
                cell.setAttribute('contenteditable', isEdit ? 'true' : 'false');
            });
        });
    },

    getColorGridHTML: (actionType) => `
        <div class="color-grid" style="padding:5px; display:grid; grid-template-columns: repeat(5, 1fr); gap:6px;">
            <div class="color-swatch bg-none" onclick="TableManager.UI.performAction('${actionType}', '')" title="Nessuno (Pulisci)"></div>
            <div class="color-swatch hl-c1" onclick="TableManager.UI.performAction('${actionType}', 'hl-c1')" title="Grigio"></div>
            <div class="color-swatch hl-c2" onclick="TableManager.UI.performAction('${actionType}', 'hl-c2')" title="Grigio Scuro"></div>
            <div class="color-swatch hl-c3" onclick="TableManager.UI.performAction('${actionType}', 'hl-c3')" title="Marrone"></div>
            <div class="color-swatch hl-c4" onclick="TableManager.UI.performAction('${actionType}', 'hl-c4')" title="Arancione"></div>
            <div class="color-swatch hl-c5" onclick="TableManager.UI.performAction('${actionType}', 'hl-c5')" title="Giallo"></div>
            <div class="color-swatch hl-c6" onclick="TableManager.UI.performAction('${actionType}', 'hl-c6')" title="Verde"></div>
            <div class="color-swatch hl-c7" onclick="TableManager.UI.performAction('${actionType}', 'hl-c7')" title="Blu"></div>
            <div class="color-swatch hl-c8" onclick="TableManager.UI.performAction('${actionType}', 'hl-c8')" title="Viola"></div>
            <div class="color-swatch hl-c9" onclick="TableManager.UI.performAction('${actionType}', 'hl-c9')" title="Rosa"></div>
            <div class="color-swatch hl-c10" onclick="TableManager.UI.performAction('${actionType}', 'hl-c10')" title="Rosso"></div>
        </div>
    `,

    _stripLegacyWidths: (table) => {
        // Pulisce brutalmente tutti gli stili width dalle celle, lasciando il controllo al <colgroup>
        const allCells = table.querySelectorAll('td, th');
        allCells.forEach(c => {
            c.removeAttribute('width');
            c.removeAttribute('height');
            c.style.width = '';
            c.style.maxWidth = '';
            c.style.minWidth = '';
        });
    },

    _ensureColgroup: (table, colCount) => {
        let colgroup = table.querySelector('colgroup');
        if (!colgroup || colgroup.children.length !== colCount) {
            if (colgroup) colgroup.remove();
            colgroup = document.createElement('colgroup');
            for (let i = 0; i < colCount; i++) {
                colgroup.appendChild(document.createElement('col'));
            }
            table.insertBefore(colgroup, table.firstChild);
        }
        return colgroup;
    },

    setLayoutMode: (mode, silent = false) => {
        const table = TableManager.editingTable || TableManager.currentTable;
        if (!table) return;

        TableManager._stripLegacyWidths(table);

        const tableWidth = table.getBoundingClientRect().width;
        const { grid, cellData } = TableManager.getGridMap(table);
        const colCount = grid[0] ? grid[0].length : 0;

        if (mode === 'auto') {
            table.style.width = '100%';
            table.style.tableLayout = 'auto';
            const existingColgroup = table.querySelector('colgroup');
            if (existingColgroup) existingColgroup.remove();
        }
        else if (mode === 'percent' || mode === 'pixel') {
            table.style.width = mode === 'percent' ? '100%' : 'max-content';
            table.style.tableLayout = 'fixed';

            const colgroup = TableManager._ensureColgroup(table, colCount);

            // Troviamo la larghezza naturale per ogni colonna
            const colWidths = [];
            for (let x = 0; x < colCount; x++) {
                let repCell = null;
                // Cerca una cella pura (colspan=1) per misurarne l'ampiezza
                for (let y = 0; y < grid.length; y++) {
                    let cell = grid[y][x];
                    if (cell && cellData.get(cell).x === x && cellData.get(cell).w === 1) {
                        repCell = cell; break;
                    }
                }
                
                // Se la colonna non ha celle pure (es. tutto fuso), calcola una media proporzionale
                if (repCell) {
                    colWidths[x] = repCell.getBoundingClientRect().width;
                } else {
                    colWidths[x] = tableWidth / colCount; 
                }
            }

            // Applichiamo le larghezze ESCLUSIVAMENTE al tag <col>
            for (let x = 0; x < colCount; x++) {
                let wStr = mode === 'percent' ? ((colWidths[x] / tableWidth) * 100) + '%' : colWidths[x] + 'px';
                colgroup.children[x].style.width = wStr;
            }
        }

        if (!silent) {
            if (typeof Editor !== 'undefined') Editor.saveSnapshot();
            if (typeof Store !== 'undefined') Store.triggerAutoSave();
            if (typeof TableManager.UI.hideTriggers === 'function') TableManager.UI.hideTriggers();
        }
    },

    toggleZebraCurrent: () => {
        const table = TableManager.currentTable;
        if (table) {
            table.classList.toggle('table-striped');
            if (typeof Editor !== 'undefined') Editor.saveSnapshot();
            if (typeof Store !== 'undefined') Store.triggerAutoSave();
        }
    }
};

document.addEventListener('DOMContentLoaded', TableManager.init);