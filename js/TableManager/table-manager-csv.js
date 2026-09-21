/**
 * table-manager-csv.js
 * Import, Export, Conversione in Database e Copia Clipboard per Tabelle Semplici.
 * FIX CONVERSIONE DB: Aggiunto blocco severo per prevenire la conversione di tabelle
 * contenenti immagini, audio, o iframes, che distruggerebbero i dati e orfanerebbero i file fisici.
 * FEAT PRESERVAZIONE FORMATTAZIONE: Nella funzione "Modifica Massiva dati (CSV/Testo)",
 * aggiunta opzione e algoritmo _updateTablePreservingFormatting per mantenere stili,
 * classi colore (hl-c*), allineamenti e tag d'intestazione (th/td) esistenti.
 */

Object.assign(TableManager.CSV, {
    openCreationModal: () => {
        if (typeof Editor !== 'undefined') Editor.saveSelection();
        TableManager.editingTable = null;

        const bodyHTML = `
            <div id="tblCreationOptions">
                <h3 style="font-size: 0.9rem; margin-bottom: 10px; color:var(--text-primary);">Opzione 1: Da Dimensioni</h3>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <div style="flex:1"><label style="font-size: 0.8rem; color:var(--text-secondary);">Righe:</label><input type="number" id="tblRows" class="modern-input" value="3" min="2"></div>
                    <div style="flex:1"><label style="font-size: 0.8rem; color:var(--text-secondary);">Colonne:</label><input type="number" id="tblCols" class="modern-input" value="3" min="2"></div>
                    <button class="btn btn-primary" onclick="TableManager.CSV.createFromDimensions()" style="margin-top: 18px;">Crea Griglia</button>
                </div>
            </div>
            <div class="separator-h" style="margin:20px 0;"></div>
            <div>
                <h3 style="font-size: 0.9rem; margin-bottom: 10px; color:var(--text-primary); display:flex; justify-content:space-between; align-items:center;">
                    Opzione 2: Importa Dati
                    <select id="tblCsvSeparator" class="modern-input" style="font-weight:normal; font-size:0.8rem; padding:2px 5px;">
                        <option value=";">Separatore: Punto e Virgola (;)</option>
                        <option value="TAB">Separatore: Tabulazione (TAB)</option>
                    </select>
                </h3>
                <textarea id="tblCsvInput" class="modern-input" rows="8" placeholder="Incolla qui i tuoi dati..." style="font-family: monospace; resize:vertical; min-height: 150px; width:100%; white-space: pre;"></textarea>
                <div style="display:flex; gap:10px; margin-top:10px;">
                    <button class="btn btn-primary" onclick="TableManager.CSV.createFromCSV()" style="flex:1;"><span style="display:inline-flex; align-items:center; gap:5px;">${typeof Icons !== 'undefined' ? Icons.import : '📥'} Genera da Testo</span></button>
                </div>
            </div>
        `;

        UI.openDrawer('🔲 Nuova Tabella', bodyHTML, null);
    },

    createFromDimensions: () => {
        const rows = parseInt(document.getElementById('tblRows').value, 10);
        const cols = parseInt(document.getElementById('tblCols').value, 10);

        if (isNaN(rows) || isNaN(cols) || rows < 1 || cols < 1) {
            alert("Inserisci valori validi per righe e colonne (minimo 1).");
            return;
        }

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();

        const stblId = 'stbl_' + Store.generateId();
        let html = `<div class="adv-widget-shell simple-table-wrapper" data-widget-type="simple-table" id="${stblId}" contenteditable="false">`;
        html += '<table class="table-striped" style="width:100%; table-layout:auto;"><tbody>';
        for (let r = 0; r < rows; r++) {
            html += '<tr>';
            for (let c = 0; c < cols; c++) {
                if (r === 0) html += `<th contenteditable="true">Intestazione</th>`;
                else html += '<td contenteditable="true"><br></td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table></div><p><br></p>';

        UI.closeDrawer();
        
        if (typeof Editor !== 'undefined') {
            Editor.restoreSelection();
            document.execCommand('insertHTML', false, html);
        }
        
        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    },

    createFromCSV: () => {
        const sepVal = document.getElementById('tblCsvSeparator').value;
        const html = TableManager.CSV._generateHTMLFromCSV(sepVal === 'TAB' ? '\t' : ';');
        if (!html) return;

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();

        UI.closeDrawer();
        if (typeof Editor !== 'undefined') Editor.restoreSelection();
        document.execCommand('insertHTML', false, html);
    },

    _updateTablePreservingFormatting: (table, rows) => {
        const validRows = rows.filter(r => r.length > 0 && !(r.length === 1 && r[0].trim() === ''));
        if (validRows.length === 0) return;

        const oldRows = Array.from(table.rows);
        const oldRow0 = oldRows[0];
        const oldRow0IsHeader = oldRow0 ? Array.from(oldRow0.cells).every(c => c.tagName.toLowerCase() === 'th') : true;

        const newTable = document.createElement('table');
        newTable.className = table.className; // Preserva classi di stile generali come table-striped
        if (table.style.cssText) newTable.style.cssText = table.style.cssText;

        const tbody = document.createElement('tbody');
        newTable.appendChild(tbody);

        validRows.forEach((rowCells, rIdx) => {
            const tr = document.createElement('tr');
            const oldRow = oldRows[rIdx];

            rowCells.forEach((cellText, cIdx) => {
                const oldCell = oldRow ? oldRow.cells[cIdx] : null;

                let tag = 'td';
                if (oldCell) {
                    tag = oldCell.tagName.toLowerCase();
                } else if (rIdx === 0 && oldRow0IsHeader) {
                    tag = 'th';
                } else {
                    tag = 'td';
                }

                const cellEl = document.createElement(tag);
                cellEl.setAttribute('contenteditable', 'true');

                // Preserva classi CSS esistenti (colori di sfondo hl-c*, allineamenti text-*)
                if (oldCell && oldCell.className) {
                    const cleanClasses = oldCell.className.replace(/\badv-cell-selected\b/g, '').trim();
                    if (cleanClasses) cellEl.className = cleanClasses;
                }

                // Preserva stili inline specifici della cella
                if (oldCell && oldCell.style.cssText) {
                    cellEl.style.cssText = oldCell.style.cssText;
                }

                let cellContent = cellText.replace(/\n/g, '<br>').trim();
                if (!cellContent) cellContent = "<br>";
                cellEl.innerHTML = cellContent;

                tr.appendChild(cellEl);
            });

            tbody.appendChild(tr);
        });

        // Gestione coerente del <colgroup> per il dimensionamento delle colonne
        const oldColgroup = table.querySelector('colgroup');
        const newColCount = validRows[0] ? validRows[0].length : 0;

        if (oldColgroup && oldColgroup.children.length === newColCount) {
            newTable.insertBefore(oldColgroup.cloneNode(true), tbody);
        } else if (oldColgroup && oldColgroup.children.length !== newColCount) {
            // Se il numero di colonne è mutato, adatta il layout per evitare sfasamenti
            newTable.style.tableLayout = 'auto';
            newTable.style.width = '100%';
        }

        table.parentNode.replaceChild(newTable, table);
        TableManager.currentTable = newTable;
    },

    updateCurrentTableFromCSV: () => {
        const table = TableManager.editingTable;
        if (!table) return;

        const sepVal = document.getElementById('tblCsvSeparator').value;
        const keepFormatting = document.getElementById('tblCsvKeepFormatting') ? document.getElementById('tblCsvKeepFormatting').checked : false;
        const csvText = document.getElementById('tblCsvInput').value.trim();
        if (!csvText) return;

        const separatorChar = sepVal === 'TAB' ? '\t' : ';';
        const rows = TableManager.CSV.parseFullCSV(csvText, separatorChar);
        if (rows.length < 1) return;

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();

        if (keepFormatting) {
            TableManager.CSV._updateTablePreservingFormatting(table, rows);
        } else {
            const html = TableManager.CSV._generateHTMLFromCSV(separatorChar, false); 
            if (!html) return;
            table.outerHTML = html;
        }

        UI.closeDrawer();
        TableManager.editingTable = null;
        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    },

    _generateHTMLFromCSV: (separatorChar = ';', includeWrapper = true) => {
        const csvText = document.getElementById('tblCsvInput').value.trim();
        if (!csvText) return null;

        const rows = TableManager.CSV.parseFullCSV(csvText, separatorChar);
        if (rows.length < 1) return null;

        const stblId = 'stbl_' + Store.generateId();
        let html = includeWrapper ? `<div class="adv-widget-shell simple-table-wrapper" data-widget-type="simple-table" id="${stblId}" contenteditable="false">` : '';
        html += '<table class="table-striped" style="width:100%; table-layout:auto;"><tbody>';
        
        rows.forEach((cells, index) => {
            if (cells.length === 0 || (cells.length === 1 && cells[0].trim() === '')) return;

            html += '<tr>';
            cells.forEach(cell => {
                let cellContent = cell.replace(/\n/g, '<br>').trim();
                if (!cellContent) cellContent = "<br>";

                if (index === 0) html += `<th contenteditable="true">${cellContent}</th>`;
                else html += `<td contenteditable="true">${cellContent}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table>';
        if (includeWrapper) html += '</div><p><br></p>';
        return html;
    },

    parseFullCSV: (text, separator = ';') => {
        const rows = [];
        let currentRow = [];
        let currentCell = '';
        let insideQuote = false;

        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (char === '"') {
                if (insideQuote && nextChar === '"') {
                    currentCell += '"';
                    i++;
                } else {
                    insideQuote = !insideQuote;
                }
            } else if (char === separator && !insideQuote) {
                currentRow.push(currentCell);
                currentCell = '';
            } else if (char === '\n' && !insideQuote) {
                currentRow.push(currentCell);
                rows.push(currentRow);
                currentRow = [];
                currentCell = '';
            } else {
                currentCell += char;
            }
        }

        if (currentCell || currentRow.length > 0) {
            currentRow.push(currentCell);
            rows.push(currentRow);
        }
        return rows;
    },

    escapeCSV: (text, separator = ';') => {
        if (!text) return "";
        text = text.trim();
        let tempDiv = document.createElement('div');
        tempDiv.innerHTML = text;
        let cleanText = tempDiv.innerText || tempDiv.textContent;

        if (cleanText.includes(separator) || cleanText.includes('"') || cleanText.includes('\n') || cleanText.includes('\r')) {
            return `"${cleanText.replace(/"/g, '""')}"`;
        }
        return cleanText;
    },

    getTableAsCSVText: (table, separatorChar) => {
        let csvLines = [];
        const rows = table.rows;

        for (let i = 0; i < rows.length; i++) {
            let rowData = [];
            const cells = rows[i].cells;
            for (let j = 0; j < cells.length; j++) {
                let cellHtml = cells[j].innerHTML;
                cellHtml = cellHtml.replace(/<br\s*[\/]?>/gi, '\n');
                rowData.push(TableManager.CSV.escapeCSV(cellHtml, separatorChar));
            }
            csvLines.push(rowData.join(separatorChar));
        }
        return csvLines.join('\n');
    },

    refreshCsvTextarea: (separatorRaw) => {
        const table = TableManager.editingTable;
        if (!table) return;
        const textarea = document.getElementById('tblCsvInput');
        if (textarea) {
            const sepChar = separatorRaw === 'TAB' ? '\t' : ';';
            textarea.value = TableManager.CSV.getTableAsCSVText(table, sepChar);
        }
    },

    editDataAsCSV: () => {
        const table = TableManager.currentTable;
        if (!table) return;

        // 1. Controllo di sicurezza: Presenza di Widget o Elementi complessi.
        if (table.querySelector('ul, ol, img, audio, video, iframe, pre, table, .adv-checklist, .inline-note-marker')) {
            alert("⚠️ IMPOSSIBILE UTILIZZARE L'EDITOR TESTUALE\n\nQuesta tabella contiene elementi complessi (immagini, audio, elenchi, codice, note inline o altre tabelle).\nModificando i dati tramite testo, tutti questi elementi andrebbero distrutti e perderesti i file ad essi collegati.\n\nPer favore, modifica le celle direttamente dall'editor visivo.");
            return;
        }

        // 2. Controllo di sicurezza: Presenza di celle fuse (Rowspan o Colspan).
        let hasMergedCells = false;
        table.querySelectorAll('td, th').forEach(cell => {
            if ((parseInt(cell.getAttribute('colspan')) || 1) > 1 || (parseInt(cell.getAttribute('rowspan')) || 1) > 1) {
                hasMergedCells = true;
            }
        });

        if (hasMergedCells) {
            alert("⚠️ IMPOSSIBILE UTILIZZARE L'EDITOR TESTUALE\n\nQuesta tabella contiene celle unite (funzione Unisci Celle). L'editor testuale (CSV) supporta solo griglie perfettamente lineari e simmetriche.\nSe applicato, l'editor distruggerebbe in modo irreversibile l'impaginazione e la fusione delle celle.\n\nPer favore, modifica i dati direttamente dalla tabella oppure dividi prima le celle unite.");
            return;
        }

        TableManager.editingTable = table;
        const initialCsvContent = TableManager.CSV.getTableAsCSVText(table, ';');

        const bodyHTML = `
            <div style="background: rgba(234, 179, 8, 0.1); border: 1px solid rgba(234, 179, 8, 0.3); padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 0.85rem; color: var(--text-primary);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span><b>Attenzione:</b> Modifica i dati mantenendo il separatore di colonna.</span>
                    <select id="tblCsvSeparator" class="modern-input" style="padding:2px 5px;" onchange="TableManager.CSV.refreshCsvTextarea(this.value)">
                        <option value=";">Usa Punto e Virgola (;)</option>
                        <option value="TAB">Usa Tabulazione (TAB)</option>
                    </select>
                </div>
            </div>
            <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer; color: var(--text-primary); font-weight: 500;">
                    <input type="checkbox" id="tblCsvKeepFormatting" checked style="transform: scale(1.15); cursor: pointer;">
                    Mantieni formattazione celle (colori, allineamenti e intestazioni)
                </label>
            </div>
            <textarea id="tblCsvInput" class="modern-input" placeholder="Dati in formato testuale..." style="font-family: monospace; resize:vertical; min-height: 250px; width:100%; white-space: pre;">${initialCsvContent}</textarea>
        `;

        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">Annulla</button>
            <button class="btn btn-primary" onclick="TableManager.CSV.updateCurrentTableFromCSV()">Aggiorna Dati</button>
        `;

        UI.openDrawer('📝 Modifica Massiva Dati (CSV / Testo)', bodyHTML, footerHTML);
    },

    exportToCSV: () => {
        const table = TableManager.editingTable || TableManager.currentTable;
        if (!table) return;

        const csvContent = TableManager.CSV.getTableAsCSVText(table, ';');

        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tabella_semplice.csv';
        a.click();
        
        UI.Menu.closeAll(true);
    },
    
    copyToClipboardAsExcel: () => {
        const table = TableManager.currentTable;
        if (!table) return;

        const tsvContent = TableManager.CSV.getTableAsCSVText(table, '\t');

        navigator.clipboard.writeText(tsvContent).then(() => {
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast("Copiata negli appunti! Pronta per essere incollata su Excel.", "success");
            }
            UI.Menu.closeAll(true);
        }).catch(err => {
            console.error("Errore copia tabella: ", err);
            alert("Impossibile copiare negli appunti.");
        });
    },

    convertToDatabase: () => {
        const table = TableManager.currentTable;
        if (!table) return;

        // FIX BLOCCO CONVERSIONE: Esclusione netta di Immagini e Audio per prevenire la perdita dei record in background (assets).
        if (table.querySelector('img, audio, video, iframe')) {
            alert("⚠️ CONVERSIONE BLOCCATA\n\nQuesta tabella contiene file multimediali (Immagini, Audio o Video). I Database Avanzati memorizzano unicamente testo crudo e date all'interno delle loro celle.\nConvertendo questa tabella, tutti i riferimenti a questi file verrebbero distrutti per sempre.\n\nPer procedere, elimina prima gli elementi multimediali.");
            return;
        }

        // Se la tabella ha celle fuse, l'RDBMS (AdvancedTable) non può mapparle.
        let hasMergedCells = false;
        table.querySelectorAll('td, th').forEach(cell => {
            if ((parseInt(cell.getAttribute('colspan')) || 1) > 1 || (parseInt(cell.getAttribute('rowspan')) || 1) > 1) {
                hasMergedCells = true;
            }
        });

        if (hasMergedCells) {
            alert("⚠️ CONVERSIONE BLOCCATA\n\nI Database Avanzati richiedono una struttura dati rigida (ogni colonna ha lo stesso numero di celle). La tua tabella attualmente contiene delle Celle Unite (Fuso), che il Database non può elaborare.\n\nPer procedere, dividi tutte le celle unite prima di convertire la tabella.");
            return;
        }

        if (!confirm("Sei sicuro di voler convertire questa tabella in un Database Avanzato?\nQuesta operazione modificherà l'architettura della tabella in modo irreversibile.")) {
            return;
        }

        const rowsData = [];
        const rows = table.rows;

        for (let i = 0; i < rows.length; i++) {
            let rowData = [];
            const cells = rows[i].cells;
            for (let j = 0; j < cells.length; j++) {
                let textContent = cells[j].innerHTML.replace(/<br\s*[\/]?>/gi, '\n');
                let tempDiv = document.createElement('div');
                tempDiv.innerHTML = textContent;
                rowData.push((tempDiv.innerText || tempDiv.textContent).trim());
            }
            rowsData.push(rowData);
        }

        if (rowsData.length < 1) return;

        const tableId = 'adv_tbl_' + Store.generateId();
        const now = Date.now();
        const state = {
            title: 'Database Convertito',
            freeWidth: false,
            striped: true,
            columns: [],
            rows: [],
            selectOptions: {},
            selectColors: {},
            sorts: [],
            filters: {},
            selectedRows: []
        };

        const headers = rowsData[0];
        headers.forEach((h, index) => {
            const cleanHeader = h.replace(/\n/g, ' ') || `Colonna ${index + 1}`;
            state.columns.push({ id: 'c' + index, name: cleanHeader, type: 'text', width: 150 });
        });

        for (let i = 1; i < rowsData.length; i++) {
            const rowData = rowsData[i];
            if (rowData.length === 1 && rowData[0] === '') continue;

            const newRow = { id: 'r' + Store.generateId(), createdAt: now, updatedAt: now, cells: {} };
            state.columns.forEach((c, idx) => {
                newRow.cells[c.id] = rowData[idx] || '';
            });
            state.rows.push(newRow);
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'adv-table-wrapper';
        wrapper.id = tableId;
        wrapper.contentEditable = "false";

        if (!AppState.databases) AppState.databases = {};
        AppState.databases[tableId] = state;

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();

        const stblWrap = table.closest('.simple-table-wrapper');
        if (stblWrap) stblWrap.parentNode.replaceChild(wrapper, stblWrap);
        else table.parentNode.replaceChild(wrapper, table);
        
        TableManager.UI.hideTriggers();

        if (typeof AdvancedTable !== 'undefined') AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
    }
});