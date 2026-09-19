/**
 * workflow-ui.js
 * Modulo Interfaccia Utente per Workflow Studio:
 * - Menu contestuali compatti con sottomenù gerarchici.
 * - Cassetto laterale unificato per la Personalizzazione Colori (Sfondo Canvas & Bordi Schede).
 * - Sincronizzazione delle classi di contrasto (.canvas-dark-theme / .canvas-light-theme).
 * - Cassetti laterali per Filtri Colonne Visibili e Dettaglio Record.
 * - Delega nativa ad AdvancedTable.openRecordView per il Dettaglio Record (Sola Lettura).
 * - Ricerca istantanea Like con suggerimenti e navigazione nodi.
 * - Esportazione del Grafo in formato Vettoriale SVG (Fedele 1:1, risoluzione infinita).
 * - Innesco finale DOMContentLoaded al termine della catena di montaggio.
 */

Object.assign(WorkflowApp, {

    // =========================================================================
    // COLORI PERSONALIZZATI: SFONDO & BORDI SCHEDE (PANNELLO UNIFICATO)
    // =========================================================================
    applyCanvasBackground: (color) => {
        WorkflowApp.layout.backgroundColor = color || null;
        const vp = document.getElementById('canvasViewport');
        if (vp) {
            vp.style.backgroundColor = color || '';
            const isDark = typeof WorkflowApp.isCanvasDark === 'function' ? WorkflowApp.isCanvasDark() : false;
            vp.classList.toggle('canvas-dark-theme', isDark);
            vp.classList.toggle('canvas-light-theme', !isDark);
        }

        if (WorkflowApp.selectedNodeId) {
            WorkflowApp.focusBranch(WorkflowApp.selectedNodeId);
        }
    },

    applyBlockBorderColor: (color) => {
        WorkflowApp.layout.borderColor = color || null;

        const db = WorkflowApp.currentDbState;
        if (!db || !db.rows) return;

        const existingNodes = document.querySelectorAll('.wf-node');
        if (existingNodes.length === 0) {
            WorkflowApp.buildNodesDOM();
            WorkflowApp.renderConnections();
            WorkflowApp.renderClusters();
            WorkflowApp.updateMinimap();
            return;
        }

        const renderCache = {};
        let updatedCount = 0;

        db.rows.forEach(row => {
            const node = document.getElementById(`wf_node_${row.id}`);
            if (!node) return;
            updatedCount++;

            const colorStyles = WorkflowApp.getComputedNodeStyles(row, db, renderCache);

            if (colorStyles && colorStyles.border) {
                node.style.setProperty('border-color', colorStyles.border, 'important');
            } else if (color) {
                node.style.setProperty('border-color', color, 'important');
            } else {
                node.style.removeProperty('border-color');
            }
        });

        WorkflowApp.updateMinimap();
    },

    openColorsDrawer: () => {
        const currentBg = WorkflowApp.layout.backgroundColor || '';
        const currentBorder = WorkflowApp.layout.borderColor || '';

        const bgPresets = [
            { name: 'Predefinito (Tema)', val: '' },
            { name: 'Bianco Puro', val: '#ffffff' },
            { name: 'Carta Avorio', val: '#f9f8f3' },
            { name: 'Grigio Studio', val: '#f3f4f6' },
            { name: 'Menta Soft', val: '#f0fdf4' },
            { name: 'Celeste Soft', val: '#f0f9ff' },
            { name: 'Blu Notte', val: '#1e293b' },
            { name: 'Lavagna Scura', val: '#212732' },
            { name: 'Notte Stellata', val: '#191919' },
            { name: 'Nero Profondo', val: '#0a0a0a' }
        ];

        const borderPresets = [
            { name: 'Predefinito (Tema)', val: '' },
            { name: 'Blu Accent', val: '#2563eb' },
            { name: 'Smeraldo', val: '#10b981' },
            { name: 'Ambra / Arancio', val: '#f59e0b' },
            { name: 'Rosso Corallo', val: '#ef4444' },
            { name: 'Viola Indaco', val: '#8b5cf6' },
            { name: 'Rosa Magenta', val: '#ec4899' },
            { name: 'Ardesia Neutro', val: '#64748b' },
            { name: 'Bianco Perla', val: '#ffffff' },
            { name: 'Nero Inchiostro', val: '#111827' }
        ];

        let bgSwatchesHtml = `<div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:8px; margin-bottom: 12px;">`;
        bgPresets.forEach(p => {
            const isSel = (currentBg === p.val) || (!currentBg && !p.val);
            const border = isSel 
                ? 'border: 2px solid var(--accent-color); transform:scale(1.08); box-shadow:0 0 8px rgba(37,99,235,0.4);' 
                : 'border: 1px solid var(--border-color);';
            const bg = p.val || 'var(--editor-bg)';
            bgSwatchesHtml += `
                <div style="width:100%; height:34px; border-radius:6px; background:${bg}; ${border} cursor:pointer; display:flex; align-items:center; justify-content:center; transition: transform 0.1s;"
                     onclick="WorkflowApp.applyCanvasBackground('${p.val}'); WorkflowApp.openColorsDrawer();"
                     title="${p.name}">
                     ${isSel ? '<span style="color:var(--accent-color); font-weight:bold; font-size:0.9rem;">✓</span>' : ''}
                </div>
            `;
        });
        bgSwatchesHtml += `</div>`;

        let borderSwatchesHtml = `<div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:8px; margin-bottom: 12px;">`;
        borderPresets.forEach(p => {
            const isSel = (currentBorder === p.val) || (!currentBorder && !p.val);
            const border = isSel 
                ? 'border: 2px solid var(--accent-color); transform:scale(1.08); box-shadow:0 0 8px rgba(37,99,235,0.4);' 
                : 'border: 1px solid var(--border-color);';
            const bg = p.val || 'var(--border-color)';
            borderSwatchesHtml += `
                <div style="width:100%; height:34px; border-radius:6px; background:${bg}; ${border} cursor:pointer; display:flex; align-items:center; justify-content:center; transition: transform 0.1s;"
                     onclick="WorkflowApp.applyBlockBorderColor('${p.val}'); WorkflowApp.openColorsDrawer();"
                     title="${p.name}">
                     ${isSel ? '<span style="color:var(--accent-color); font-weight:bold; font-size:0.9rem;">✓</span>' : ''}
                </div>
            `;
        });
        borderSwatchesHtml += `</div>`;

        const bodyHTML = `
            <div style="display:flex; flex-direction:column; gap:20px; font-size:0.85rem;">
                <!-- SEZIONE 1: SFONDO CANVAS -->
                <div>
                    <h4 style="margin:0 0 6px 0; font-size:0.92rem; color:var(--accent-color); display:flex; align-items:center; gap:6px;">
                        ${Icons.palette} Colore Sfondo Canvas
                    </h4>
                    <p style="color:var(--text-secondary); margin-bottom:10px; font-size:0.8rem; line-height:1.4;">
                        Personalizza la tinta dello sfondo dell'area di lavoro.
                    </p>
                    ${bgSwatchesHtml}
                    <div style="display:flex; gap:8px; align-items:center;">
                        <input type="color" id="wfCustomColorPicker" value="${currentBg || '#f3f4f6'}" style="width:40px; height:32px; border:1px solid var(--border-color); border-radius:4px; cursor:pointer; background:transparent;" onchange="WorkflowApp.applyCanvasBackground(this.value); document.getElementById('wfCustomColorHex').value = this.value;">
                        <input type="text" id="wfCustomColorHex" class="modern-input" value="${currentBg || ''}" placeholder="#hex o vuoto per default" style="flex:1;" oninput="WorkflowApp.applyCanvasBackground(this.value);">
                        <button class="btn" onclick="WorkflowApp.applyCanvasBackground(''); document.getElementById('wfCustomColorHex').value = ''; WorkflowApp.openColorsDrawer();">Ripristina</button>
                    </div>
                </div>

                <div class="adv-menu-divider" style="margin:0;"></div>

                <!-- SEZIONE 2: BORDI SCHEDE -->
                <div>
                    <h4 style="margin:0 0 6px 0; font-size:0.92rem; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
                        ${Icons.square} Colore Bordi Schede
                    </h4>
                    <p style="color:var(--text-secondary); margin-bottom:10px; font-size:0.8rem; line-height:1.4;">
                        Definisci il colore primario del contorno di tutti i blocchi del grafo. I nodi con regole condizionali mantengono la loro priorità.
                    </p>
                    ${borderSwatchesHtml}
                    <div style="display:flex; gap:8px; align-items:center;">
                        <input type="color" id="wfCustomBorderPicker" value="${currentBorder || '#64748b'}" style="width:40px; height:32px; border:1px solid var(--border-color); border-radius:4px; cursor:pointer; background:transparent;" onchange="WorkflowApp.applyBlockBorderColor(this.value); document.getElementById('wfCustomBorderHex').value = this.value;">
                        <input type="text" id="wfCustomBorderHex" class="modern-input" value="${currentBorder || ''}" placeholder="#hex o vuoto per default" style="flex:1;" oninput="WorkflowApp.applyBlockBorderColor(this.value);">
                        <button class="btn" onclick="WorkflowApp.applyBlockBorderColor(''); document.getElementById('wfCustomBorderHex').value = ''; WorkflowApp.openColorsDrawer();">Ripristina</button>
                    </div>
                </div>
            </div>
        `;

        const footerHTML = `
            <button class="btn btn-primary" onclick="UI.closeDrawer(); WorkflowApp.saveWorkflowAuto();">Salva Configurazione</button>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.palette} Personalizzazione Colori</span>`, bodyHTML, footerHTML);
    },

    openCanvasBackgroundDrawer: () => WorkflowApp.openColorsDrawer(),
    openBlockBorderDrawer: () => WorkflowApp.openColorsDrawer(),

    // =========================================================================
    // MENU AD HAMBURGER CON SOTTOMENÙ ACCORPATI
    // =========================================================================
    openMainMenu: (e) => {
        if (e) e.stopPropagation();
        const existing = document.querySelector('.adv-dropdown.main-menu-portal');
        UI.Menu.closeAll(true);
        if (existing && e) return;

        const chk = ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>';
        const style = WorkflowApp.layout.connectionStyle;
        const dir = WorkflowApp.layout.relationDirection;
        const isLocked = !!WorkflowApp.layout.locked;

        const items = [
            // 1. SOTTOMENÙ: Disposizione & Layout
            {
                icon: Icons.layoutAuto || Icons.tablePivot,
                label: 'Disposizione & Layout',
                type: 'submenu',
                items: [
                    {
                        icon: Icons.tablePivot,
                        label: 'Auto-Disponi Organico',
                        disabled: isLocked,
                        onClick: () => WorkflowApp.runOrganicAutoLayout(true)
                    },
                    {
                        icon: Icons.focus,
                        label: 'Centra e Adatta Grafo (Fit)',
                        onClick: () => WorkflowApp.fitToView()
                    },
                    {
                        icon: Icons.group || Icons.folder,
                        label: 'Raggruppa in Cluster (Box)...',
                        disabled: isLocked,
                        onClick: () => WorkflowApp.openClusterDrawer()
                    },
                    { type: 'divider' },
                    {
                        icon: Icons.lock,
                        label: 'Blocca Disposizione (Lock)' + (isLocked ? chk : ''),
                        onClick: () => WorkflowApp.toggleLayoutLock()
                    }
                ]
            },

            // 2. SOTTOMENÙ: Stile Connessioni & Flusso
            {
                icon: Icons.relation || Icons.link,
                label: 'Stile Connessioni & Flusso',
                type: 'submenu',
                items: [
                    {
                        label: 'Curve Morbide (Bézier)' + (style === 'bezier' ? chk : ''),
                        onClick: () => WorkflowApp.setConnectionStyle('bezier')
                    },
                    {
                        label: 'Linee Ortogonali (Canalizzate R12)' + (style === 'orthogonal' ? chk : ''),
                        onClick: () => WorkflowApp.setConnectionStyle('orthogonal')
                    },
                    {
                        label: 'Ortogonali (Evita Ostacoli R12)' + (style === 'avoidance' ? chk : ''),
                        onClick: () => WorkflowApp.setConnectionStyle('avoidance')
                    },
                    { type: 'divider' },
                    {
                        label: 'Verso: A ➔ B (Successore)' + (dir === 'successor' ? chk : ''),
                        onClick: () => WorkflowApp.setRelationDirection('successor')
                    },
                    {
                        label: 'Verso: B ➔ A (Predecessore)' + (dir === 'predecessor' ? chk : ''),
                        onClick: () => WorkflowApp.setRelationDirection('predecessor')
                    }
                ]
            },

            { type: 'divider' },

            // 3. SOTTOMENÙ: Personalizzazione Visiva
            {
                icon: Icons.palette,
                label: 'Personalizzazione Visiva',
                type: 'submenu',
                items: [
                    {
                        icon: Icons.palette,
                        label: 'Colori (Sfondo & Bordi Schede)...',
                        onClick: () => WorkflowApp.openColorsDrawer()
                    },
                    { type: 'divider' },
                    {
                        icon: Icons.filter,
                        label: 'Campi Visibili sulle Card...',
                        onClick: () => WorkflowApp.openPropertiesDrawer()
                    }
                ]
            },

            { type: 'divider' },

            // 4. SOTTOMENÙ: Esportazione Vettoriale & File
            {
                icon: Icons.export || Icons.file,
                label: 'Esporta & Condividi',
                type: 'submenu',
                items: [
                    {
                        icon: Icons.image || Icons.export,
                        label: 'Esporta Grafo Vettoriale (SVG)...',
                        onClick: () => WorkflowApp.exportGraphToSVG()
                    },
                    { type: 'divider' },
                    {
                        icon: Icons.save,
                        label: 'Esporta Copia Layout JSON',
                        onClick: () => WorkflowApp.saveLayoutFileManualDownload()
                    },
                    {
                        icon: Icons.download,
                        label: 'Carica Layout JSON Esterno...',
                        onClick: () => {
                            const inp = document.createElement('input');
                            inp.type = 'file';
                            inp.accept = '.json';
                            inp.onchange = (ev) => WorkflowApp.loadLegacyLayoutFile(ev);
                            inp.click();
                        }
                    }
                ]
            }
        ];

        UI.Menu.buildContextMenu('btnHamburgerMenu', items);
        
        const menuEl = document.querySelector('.adv-dropdown.adv-context-menu:last-child');
        if (menuEl) {
            menuEl.classList.add('main-menu-portal');
        }
    },

    saveLayoutFileManualDownload: () => {
        if (!WorkflowApp.currentDbState) return;

        const exportObj = {
            type: "vanilladesk_workflow_layout",
            version: "3.0",
            databaseId: WorkflowApp.currentDbId,
            databaseTitle: WorkflowApp.currentDbState.title,
            relationColId: WorkflowApp.selfRelCol ? WorkflowApp.selfRelCol.id : null,
            layout: WorkflowApp.layout
        };

        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        const cleanName = (WorkflowApp.currentDbState.title || 'database')
            .replace(/[^a-zA-Z0-9_\-]/g, '_')
            .toLowerCase();
        a.download = `${cleanName}_workflow.json`;
        
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 200);
    },

    // =========================================================================
    // RICERCA RAPIDA NODO CON AUTOCOMPLETE
    // =========================================================================
    handleSearchInput: (value) => {
        const term = value.trim().toLowerCase();
        const dropdown = document.getElementById('workflowSearchDropdown');
        if (!dropdown) return;

        if (!term) {
            WorkflowApp.closeSearchDropdown();
            WorkflowApp.clearFocusBranch();
            return;
        }

        const db = WorkflowApp.currentDbState;
        if (!db || !db.rows) return;

        const titleColId = db.columns[0]?.id;
        const matches = [];

        db.rows.forEach(r => {
            if (!r.cells) return;
            const titleText = String(r.cells[titleColId] || '').trim();
            let matchedField = null;

            if (titleText.toLowerCase().includes(term)) {
                matchedField = 'Titolo';
            } else {
                for (const c of db.columns) {
                    const val = String(r.cells[c.id] || '').toLowerCase();
                    if (val.includes(term)) {
                        matchedField = c.name;
                        break;
                    }
                }
            }

            if (matchedField) {
                matches.push({ rowId: r.id, title: titleText || 'Senza Titolo', field: matchedField });
            }
        });

        if (matches.length === 0) {
            dropdown.innerHTML = `<div style="padding:10px; font-size:0.8rem; color:var(--text-secondary); text-align:center;">Nessun riscontro per "${UI.escapeHTML(value)}"</div>`;
            dropdown.classList.add('active');
            return;
        }

        let html = '';
        matches.slice(0, 10).forEach(m => {
            html += `
                <div class="search-autocomplete-item" onclick="WorkflowApp.selectSearchResult('${m.rowId}')">
                    <span style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${UI.escapeHTML(m.title)}</span>
                    <span class="match-type">${UI.escapeHTML(m.field)}</span>
                </div>
            `;
        });

        dropdown.innerHTML = html;
        dropdown.classList.add('active');
    },

    handleSearchKeydown: (e, value) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            WorkflowApp.executeSearchFilter(value);
            WorkflowApp.closeSearchDropdown();
        } else if (e.key === 'Escape') {
            WorkflowApp.closeSearchDropdown();
            WorkflowApp.clearFocusBranch();
        }
    },

    selectSearchResult: (rowId) => {
        const db = WorkflowApp.currentDbState;
        const r = db?.rows?.find(x => x.id === rowId);
        if (r && r.cells) {
            const input = document.getElementById('workflowSearchInput');
            if (input) input.value = r.cells[db.columns[0]?.id] || '';
        }
        WorkflowApp.closeSearchDropdown();
        WorkflowApp.clearSelection();
        WorkflowApp.selectedNodeIds.add(rowId);
        const el = document.getElementById(`wf_node_${rowId}`);
        if (el) el.classList.add('selected');
        WorkflowApp.focusBranch(rowId);
        WorkflowApp.centerOnNode(rowId);
    },

    closeSearchDropdown: () => {
        const dropdown = document.getElementById('workflowSearchDropdown');
        if (dropdown) dropdown.classList.remove('active');
    },

    executeSearchFilter: (query) => {
        if (!query || !query.trim()) {
            WorkflowApp.clearFocusBranch();
            return;
        }

        const q = query.trim().toLowerCase();
        const db = WorkflowApp.currentDbState;
        if (!db || !db.rows) return;

        const titleColId = db.columns[0]?.id;
        const matchingRows = db.rows.filter(r => {
            if (!r.cells) return false;
            const title = String(r.cells[titleColId] || '').toLowerCase();
            if (title.includes(q)) return true;
            return db.columns.some(c => String(r.cells[c.id] || '').toLowerCase().includes(q));
        });

        if (matchingRows.length === 0) {
            UI.showToast(`Nessun elemento trovato per "${query}".`, "warning");
            WorkflowApp.clearFocusBranch();
            return;
        }

        WorkflowApp.clearSelection();
        WorkflowApp.clearFocusBranch();

        matchingRows.forEach(r => {
            WorkflowApp.selectedNodeIds.add(r.id);
            const el = document.getElementById(`wf_node_${r.id}`);
            if (el) el.classList.add('selected');
        });

        if (matchingRows.length === 1) {
            WorkflowApp.focusBranch(matchingRows[0].id);
            WorkflowApp.centerOnNode(matchingRows[0].id);
            UI.showToast(`1 elemento trovato.`, "info");
        } else {
            const matchingIds = new Set(matchingRows.map(r => r.id));
            WorkflowApp.fitMatchingNodes(matchingIds);
            UI.showToast(`Trovati ${matchingRows.length} elementi corrispondenti.`, "info");
        }
    },

    centerOnNode: (rowId) => {
        const pos = WorkflowApp.layout.nodes[rowId];
        const el = document.getElementById(`wf_node_${rowId}`);
        if (!pos || !el) return;

        const viewport = document.getElementById('canvasViewport');
        const vw = viewport ? (viewport.clientWidth || window.innerWidth) : window.innerWidth;
        const vh = viewport ? (viewport.clientHeight || (window.innerHeight - 52)) : (window.innerHeight - 52);
        const zoom = 1.0;

        const nodeW = 288;
        const nodeH = el.offsetHeight || 80;

        const newPanX = Math.round((vw / 2) - (pos.x + nodeW / 2) * zoom);
        const newPanY = Math.round((vh / 2) - (pos.y + nodeH / 2) * zoom);

        if (isFinite(newPanX) && isFinite(newPanY)) {
            WorkflowApp.layout.zoom = zoom;
            WorkflowApp.layout.pan.x = newPanX;
            WorkflowApp.layout.pan.y = newPanY;
            WorkflowApp.updateCanvasTransform();
            WorkflowApp._pulseNode(el);
        }
    },

    _pulseNode: (nodeEl) => {
        nodeEl.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
        nodeEl.style.transform = 'scale(1.08)';
        nodeEl.style.boxShadow = '0 0 0 4px var(--accent-color), 0 0 25px var(--accent-color)';
        setTimeout(() => {
            nodeEl.style.transform = '';
            nodeEl.style.boxShadow = '';
            setTimeout(() => nodeEl.style.transition = '', 300);
        }, 800);
    },

    // =========================================================================
    // CASSETTI LATERALI: PROPRIETÀ CARD & DETTAGLIO RECORD
    // =========================================================================
    openPropertiesDrawer: () => {
        const db = WorkflowApp.currentDbState;
        if (!db) return;

        let html = `
            <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:10px;">
                Scegli quali proprietà visualizzare all'interno dei singoli blocchi del workflow:
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
        `;

        db.columns.forEach((c, idx) => {
            if (idx === 0) return;
            const isChecked = WorkflowApp.layout.visibleColumns.includes(c.id);
            html += `
                <label style="display:flex; align-items:center; gap:10px; font-size:0.9rem; padding:8px; background:var(--sidebar-bg); border:1px solid var(--border-color); border-radius:6px; cursor:pointer;">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="WorkflowApp.toggleColumnVisibility('${c.id}', this.checked)">
                    <b>${UI.escapeHTML(c.name)}</b> <span style="font-size:0.75rem; color:var(--text-secondary);">(${c.type})</span>
                </label>
            `;
        });

        html += `</div>`;
        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.filter} Campi Visibili sulle Card</span>`, html, null);
    },

    toggleColumnVisibility: (colId, isVisible) => {
        let list = WorkflowApp.layout.visibleColumns;
        if (isVisible && !list.includes(colId)) list.push(colId);
        if (!isVisible) WorkflowApp.layout.visibleColumns = list.filter(id => id !== colId);

        WorkflowApp.buildNodesDOM();
        WorkflowApp.renderConnections();
        WorkflowApp.renderClusters();
        WorkflowApp.saveWorkflowAuto();
    },

    openRecordDrawer: (rowId) => {
        if (!WorkflowApp.currentDbId) return;
        if (typeof AdvancedTable !== 'undefined' && typeof AdvancedTable.openRecordView === 'function') {
            AdvancedTable.openRecordView(WorkflowApp.currentDbId, rowId);
        } else {
            console.warn("Modulo AdvancedTable.openRecordView non disponibile.");
        }
    }
});

// INIZIALIZZAZIONE SICURA: Esegue solo dopo il caricamento completo di tutti e 6 i moduli
document.addEventListener('DOMContentLoaded', WorkflowApp.init);