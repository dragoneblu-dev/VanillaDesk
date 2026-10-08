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
 * - FEAT MULTI-RELATION MENU: Selezione del campo relazione attivo direttamente dal menu ad hamburger.
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
            { name: I18n.t('workflow.preset_default'), val: '' },
            { name: I18n.t('workflow.preset_pure_white'), val: '#ffffff' },
            { name: I18n.t('workflow.preset_ivory'), val: '#f9f8f3' },
            { name: I18n.t('workflow.preset_studio_gray'), val: '#f3f4f6' },
            { name: I18n.t('workflow.preset_soft_mint'), val: '#f0fdf4' },
            { name: I18n.t('workflow.preset_soft_sky'), val: '#f0f9ff' },
            { name: I18n.t('workflow.preset_night_blue'), val: '#1e293b' },
            { name: I18n.t('workflow.preset_dark_slate'), val: '#212732' },
            { name: I18n.t('workflow.preset_starry_night'), val: '#191919' },
            { name: I18n.t('workflow.preset_deep_black'), val: '#0a0a0a' }
        ];

        const borderPresets = [
            { name: I18n.t('workflow.preset_default'), val: '' },
            { name: I18n.t('workflow.preset_blue_accent'), val: '#2563eb' },
            { name: I18n.t('workflow.preset_emerald'), val: '#10b981' },
            { name: I18n.t('workflow.preset_amber'), val: '#f59e0b' },
            { name: I18n.t('workflow.preset_coral_red'), val: '#ef4444' },
            { name: I18n.t('workflow.preset_purple_indigo'), val: '#8b5cf6' },
            { name: I18n.t('workflow.preset_magenta'), val: '#ec4899' },
            { name: I18n.t('workflow.preset_neutral_slate'), val: '#64748b' },
            { name: I18n.t('workflow.preset_pearl_white'), val: '#ffffff' },
            { name: I18n.t('workflow.preset_ink_black'), val: '#111827' }
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
                        ${Icons.palette} ${I18n.t('workflow.colors_bg_title')}
                    </h4>
                    <p style="color:var(--text-secondary); margin-bottom:10px; font-size:0.8rem; line-height:1.4;">
                        ${I18n.t('workflow.colors_bg_desc')}
                    </p>
                    ${bgSwatchesHtml}
                    <div style="display:flex; gap:8px; align-items:center;">
                        <input type="color" id="wfCustomColorPicker" value="${currentBg || '#f3f4f6'}" style="width:40px; height:32px; border:1px solid var(--border-color); border-radius:4px; cursor:pointer; background:transparent;" onchange="WorkflowApp.applyCanvasBackground(this.value); document.getElementById('wfCustomColorHex').value = this.value;">
                        <input type="text" id="wfCustomColorHex" class="modern-input" value="${currentBg || ''}" placeholder="#hex" style="flex:1;" oninput="WorkflowApp.applyCanvasBackground(this.value);">
                        <button class="btn" onclick="WorkflowApp.applyCanvasBackground(''); document.getElementById('wfCustomColorHex').value = ''; WorkflowApp.openColorsDrawer();">${I18n.t('workflow.colors_reset')}</button>
                    </div>
                </div>

                <div class="adv-menu-divider" style="margin:0;"></div>

                <!-- SEZIONE 2: BORDI SCHEDE -->
                <div>
                    <h4 style="margin:0 0 6px 0; font-size:0.92rem; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
                        ${Icons.square} ${I18n.t('workflow.colors_border_title')}
                    </h4>
                    <p style="color:var(--text-secondary); margin-bottom:10px; font-size:0.8rem; line-height:1.4;">
                        ${I18n.t('workflow.colors_border_desc')}
                    </p>
                    ${borderSwatchesHtml}
                    <div style="display:flex; gap:8px; align-items:center;">
                        <input type="color" id="wfCustomBorderPicker" value="${currentBorder || '#64748b'}" style="width:40px; height:32px; border:1px solid var(--border-color); border-radius:4px; cursor:pointer; background:transparent;" onchange="WorkflowApp.applyBlockBorderColor(this.value); document.getElementById('wfCustomBorderHex').value = this.value;">
                        <input type="text" id="wfCustomBorderHex" class="modern-input" value="${currentBorder || ''}" placeholder="#hex" style="flex:1;" oninput="WorkflowApp.applyBlockBorderColor(this.value);">
                        <button class="btn" onclick="WorkflowApp.applyBlockBorderColor(''); document.getElementById('wfCustomBorderHex').value = ''; WorkflowApp.openColorsDrawer();">${I18n.t('workflow.colors_reset')}</button>
                    </div>
                </div>
            </div>
        `;

        const footerHTML = `
            <button class="btn btn-primary" onclick="UI.closeDrawer(); WorkflowApp.saveWorkflowAuto();">${I18n.t('workflow.colors_save')}</button>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.palette} ${I18n.t('workflow.colors_drawer_title')}</span>`, bodyHTML, footerHTML);
    },

    openCanvasBackgroundDrawer: () => WorkflowApp.openColorsDrawer(),
    openBlockBorderDrawer: () => WorkflowApp.openColorsDrawer(),

    // =========================================================================
    // MENU AD HAMBURGER CON SOTTOMENÙ ACCORPATI & SELETTORE MULTI-RELAZIONE
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

        // Tutte le relazioni auto-referenziali disponibili in questo database
        const selfRels = (WorkflowApp.currentDbState?.columns || []).filter(c => 
            c.type === 'relation' && (c.targetTableId === WorkflowApp.currentDbId || c.targetTableId === WorkflowApp.currentDbState.id)
        );

        const items = [];

        // 1. SOTTOMENÙ: Selezione Campo Relazione (solo se sono presenti auto-relazioni)
        if (selfRels.length > 0) {
            const currentRelName = WorkflowApp.selfRelCol ? WorkflowApp.selfRelCol.name : I18n.t('common.none');
            items.push({
                icon: Icons.relation || Icons.link,
                label: I18n.t('workflow.menu_rel_workflow', { name: currentRelName }),
                type: 'submenu',
                items: selfRels.map(rel => ({
                    label: rel.name + (WorkflowApp.selfRelCol?.id === rel.id ? chk : ''),
                    onClick: () => WorkflowApp.switchRelation(rel.id)
                }))
            });
            items.push({ type: 'divider' });
        }

        // 2. SOTTOMENÙ: Disposizione & Layout
        items.push({
            icon: Icons.layoutAuto || Icons.tablePivot,
            label: I18n.t('workflow.menu_layout'),
            type: 'submenu',
            items: [
                {
                    icon: Icons.tablePivot,
                    label: I18n.t('workflow.menu_auto_organic'),
                    disabled: isLocked,
                    onClick: () => WorkflowApp.runOrganicAutoLayout(true)
                },
                {
                    icon: Icons.focus,
                    label: I18n.t('workflow.menu_fit_view'),
                    onClick: () => WorkflowApp.fitToView()
                },
                {
                    icon: Icons.group || Icons.folder,
                    label: I18n.t('workflow.menu_cluster'),
                    disabled: isLocked,
                    onClick: () => WorkflowApp.openClusterDrawer()
                },
                { type: 'divider' },
                {
                    icon: Icons.lock,
                    label: I18n.t('workflow.menu_lock') + (isLocked ? chk : ''),
                    onClick: () => WorkflowApp.toggleLayoutLock()
                }
            ]
        });

        // 3. SOTTOMENÙ: Stile Connessioni & Flusso
        items.push({
            icon: Icons.relation || Icons.link,
            label: I18n.t('workflow.menu_conn_style'),
            type: 'submenu',
            items: [
                {
                    label: I18n.t('workflow.menu_bezier') + (style === 'bezier' ? chk : ''),
                    onClick: () => WorkflowApp.setConnectionStyle('bezier')
                },
                {
                    label: I18n.t('workflow.menu_orthogonal') + (style === 'orthogonal' ? chk : ''),
                    onClick: () => WorkflowApp.setConnectionStyle('orthogonal')
                },
                {
                    label: I18n.t('workflow.menu_avoidance') + (style === 'avoidance' ? chk : ''),
                    onClick: () => WorkflowApp.setConnectionStyle('avoidance')
                },
                { type: 'divider' },
                {
                    label: I18n.t('workflow.menu_dir_successor') + (dir === 'successor' ? chk : ''),
                    onClick: () => WorkflowApp.setRelationDirection('successor')
                },
                {
                    label: I18n.t('workflow.menu_dir_predecessor') + (dir === 'predecessor' ? chk : ''),
                    onClick: () => WorkflowApp.setRelationDirection('predecessor')
                }
            ]
        });

        items.push({ type: 'divider' });

        // 4. SOTTOMENÙ: Personalizzazione Visiva
        items.push({
            icon: Icons.palette,
            label: I18n.t('workflow.menu_visual'),
            type: 'submenu',
            items: [
                {
                    icon: Icons.palette,
                    label: I18n.t('workflow.menu_colors'),
                    onClick: () => WorkflowApp.openColorsDrawer()
                },
                { type: 'divider' },
                {
                    icon: Icons.filter,
                    label: I18n.t('workflow.menu_visible_fields'),
                    onClick: () => WorkflowApp.openPropertiesDrawer()
                }
            ]
        });

        items.push({ type: 'divider' });

        // 6. SOTTOMENÙ: Esportazione Vettoriale & File
        items.push({
            icon: Icons.export || Icons.file,
            label: I18n.t('workflow.menu_export_share'),
            type: 'submenu',
            items: [
                {
                    icon: Icons.image || Icons.export,
                    label: I18n.t('workflow.menu_export_svg'),
                    onClick: () => WorkflowApp.exportGraphToSVG()
                },
                { type: 'divider' },
                {
                    icon: Icons.save,
                    label: I18n.t('workflow.menu_export_layout_json'),
                    onClick: () => WorkflowApp.saveLayoutFileManualDownload()
                },
                {
                    icon: Icons.download,
                    label: I18n.t('workflow.menu_import_layout_json'),
                    onClick: () => {
                        const inp = document.createElement('input');
                        inp.type = 'file';
                        inp.accept = '.json';
                        inp.onchange = (ev) => WorkflowApp.loadLegacyLayoutFile(ev);
                        inp.click();
                    }
                }
            ]
        });

        UI.Menu.buildContextMenu('btnHamburgerMenu', items);
        
        const menuEl = document.querySelector('.adv-dropdown.adv-context-menu:last-child');
        if (menuEl) {
            menuEl.classList.add('main-menu-portal');
        }
    },

    saveLayoutFileManualDownload: () => {
        if (!WorkflowApp.currentDbState) return;

        WorkflowApp.saveCurrentRelationLayout();

        const exportObj = {
            type: "vanilladesk_workflow_layout",
            version: "3.1",
            databaseId: WorkflowApp.currentDbId,
            databaseTitle: WorkflowApp.currentDbState.title,
            activeRelationColId: WorkflowApp.selfRelCol ? WorkflowApp.selfRelCol.id : null,
            relationColId: WorkflowApp.selfRelCol ? WorkflowApp.selfRelCol.id : null,
            layout: WorkflowApp.layout,
            layoutsByRelation: WorkflowApp.layoutsByRelation || {}
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

        // Cerca prioritariamente nel campo impostato come Titolo Principale del blocco
        const configuredTitleColId = WorkflowApp.layout.titleColId || db.columns[0]?.id;
        const titleCol = (db.columns || []).find(c => c.id === configuredTitleColId) || db.columns[0];
        const matches = [];

        db.rows.forEach(r => {
            if (!r.cells) return;
            const titleText = String(r.cells[titleCol?.id] || '').trim();
            let matchedField = null;

            if (titleText.toLowerCase().includes(term)) {
                matchedField = titleCol?.name || I18n.t('workflow.search_field_title');
            } else {
                for (const c of db.columns) {
                    if (c.id === titleCol?.id) continue;
                    const val = String(r.cells[c.id] || '').toLowerCase();
                    if (val.includes(term)) {
                        matchedField = c.name;
                        break;
                    }
                }
            }

            if (matchedField) {
                matches.push({ rowId: r.id, title: titleText || I18n.t('editor.untitled'), field: matchedField });
            }
        });

        if (matches.length === 0) {
            dropdown.innerHTML = `<div style="padding:10px; font-size:0.8rem; color:var(--text-secondary); text-align:center;">${I18n.t('workflow.search_no_matches', { term: UI.escapeHTML(value) })}</div>`;
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
            const configuredTitleColId = WorkflowApp.layout.titleColId || db.columns[0]?.id;
            if (input) input.value = r.cells[configuredTitleColId] || '';
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

        const configuredTitleColId = WorkflowApp.layout.titleColId || db.columns[0]?.id;
        const matchingRows = db.rows.filter(r => {
            if (!r.cells) return false;
            const title = String(r.cells[configuredTitleColId] || '').toLowerCase();
            if (title.includes(q)) return true;
            return db.columns.some(c => String(r.cells[c.id] || '').toLowerCase().includes(q));
        });

        if (matchingRows.length === 0) {
            UI.showToast(I18n.t('workflow.search_none_found', { query }), "warning");
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
            UI.showToast(I18n.t('workflow.search_one_found'), "info");
        } else {
            const matchingIds = new Set(matchingRows.map(r => r.id));
            WorkflowApp.fitMatchingNodes(matchingIds);
            UI.showToast(I18n.t('workflow.search_multiple_found', { count: matchingRows.length }), "info");
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

        const currentTitleColId = WorkflowApp.layout.titleColId || (db.columns && db.columns[0]?.id);

        let titleColOptions = '';
        (db.columns || []).forEach(c => {
            const isSelected = c.id === currentTitleColId ? 'selected' : '';
            titleColOptions += `<option value="${c.id}" ${isSelected}>${UI.escapeHTML(c.name)} (${c.type})</option>`;
        });

        const titleLabel = (typeof I18n !== 'undefined' && I18n.t('workflow.props_title_col_label')) || "Proprietà Principale (Titolo Scheda):";

        let html = `
            <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px solid var(--border-color);">
                <label style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:var(--accent-color); display:block; margin-bottom:6px;">
                    ${titleLabel}
                </label>
                <select class="modern-input" style="width:100%; font-weight:600;" onchange="WorkflowApp.setTitleColumn(this.value)">
                    ${titleColOptions}
                </select>
            </div>
            <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:10px;">
                ${I18n.t('workflow.props_drawer_desc')}
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
        `;

        db.columns.forEach((c) => {
            // Non visualizzare come proprietà secondaria il campo scelto come titolo
            if (c.id === currentTitleColId) return;

            const isChecked = WorkflowApp.layout.visibleColumns.includes(c.id);
            html += `
                <label style="display:flex; align-items:center; gap:10px; font-size:0.9rem; padding:8px; background:var(--sidebar-bg); border:1px solid var(--border-color); border-radius:6px; cursor:pointer;">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="WorkflowApp.toggleColumnVisibility('${c.id}', this.checked)">
                    <b>${UI.escapeHTML(c.name)}</b> <span style="font-size:0.75rem; color:var(--text-secondary);">(${c.type})</span>
                </label>
            `;
        });

        html += `</div>`;
        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.filter} ${I18n.t('workflow.props_drawer_title')}</span>`, html, null);
    },

    setTitleColumn: (colId) => {
        WorkflowApp.layout.titleColId = colId || null;
        WorkflowApp.buildNodesDOM();
        WorkflowApp.renderConnections();
        WorkflowApp.renderClusters();
        WorkflowApp.saveWorkflowAuto();
        WorkflowApp.openPropertiesDrawer();
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