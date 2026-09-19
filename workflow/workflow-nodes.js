/**
 * workflow-nodes.js
 * Modulo Nodi per Workflow Studio:
 * - Creazione e popolamento delle card sul canvas.
 * - Risoluzione coerente tramite il motore VanillaDesk (AdvancedTable.buildVirtualRow, 
 *   AdvancedTable.getFormatDisplayValue, AdvancedTable.resolveRelationDetails).
 * - Utilizzo del motore logico nativo LogicEngine.evaluateCondition per la formattazione condizionale.
 * - Selezione singola, multipla e marquee selection ad area con sincronizzazione Toolbar Allineamento.
 * - Focus e isolamento visivo del ramo di dipendenze (focusBranch / clearFocusBranch)
 *   con frecce e contorni dinamici ad alto contrasto (bianco su scuro, nero su chiaro).
 * - Gestione delle 4 porte cardinali (top, right, bottom, left) per ciascun blocco.
 */

Object.assign(WorkflowApp, {

    clearSelection: () => {
        WorkflowApp.selectedNodeIds.clear();
        document.querySelectorAll('.wf-node').forEach(n => n.classList.remove('selected'));
        if (typeof WorkflowApp.updateSelectionToolbar === 'function') {
            WorkflowApp.updateSelectionToolbar();
        }
    },

    clearFocusBranch: () => {
        WorkflowApp.selectedNodeId = null;
        document.querySelectorAll('.wf-node').forEach(n => n.classList.remove('highlighted'));
        document.querySelectorAll('#canvasSvgLayer path').forEach(p => {
            p.classList.remove('wf-path-highlighted');
            p.setAttribute('marker-end', 'url(#wfArrow)');
        });
    },

    // =========================================================================
    // FOCUS RAMO (ATTIVO SU SELEZIONE SINGOLA)
    // =========================================================================
    focusBranch: (nodeId) => {
        WorkflowApp.selectedNodeId = nodeId;
        const db = WorkflowApp.currentDbState;
        const relCol = WorkflowApp.selfRelCol;
        if (!db || !relCol) return;

        const isPredecessorMode = WorkflowApp.layout.relationDirection === 'predecessor';

        const outgoing = new Map();
        const incoming = new Map();
        (db.rows || []).forEach(r => {
            outgoing.set(r.id, new Set());
            incoming.set(r.id, new Set());
        });

        db.rows.forEach(r => {
            if (!r.cells) return;
            let targets = r.cells[relCol.id];
            if (!targets) return;
            if (!Array.isArray(targets)) targets = [targets];

            targets.forEach(tgtId => {
                const from = isPredecessorMode ? tgtId : r.id;
                const to = isPredecessorMode ? r.id : tgtId;
                if (outgoing.has(from) && incoming.has(to)) {
                    outgoing.get(from).add(to);
                    incoming.get(to).add(from);
                }
            });
        });

        const connectedNodes = new Set([nodeId]);
        const highlightedEdges = new Set();

        const traverseAncestors = (currId) => {
            const parents = incoming.get(currId) || [];
            parents.forEach(pId => {
                highlightedEdges.add(`${pId}->${currId}`);
                if (!connectedNodes.has(pId)) {
                    connectedNodes.add(pId);
                    traverseAncestors(pId);
                }
            });
        };

        const traverseDescendants = (currId) => {
            const children = outgoing.get(currId) || [];
            children.forEach(cId => {
                highlightedEdges.add(`${currId}->${cId}`);
                if (!connectedNodes.has(cId)) {
                    connectedNodes.add(cId);
                    traverseDescendants(cId);
                }
            });
        };

        traverseAncestors(nodeId);
        traverseDescendants(nodeId);

        document.querySelectorAll('.wf-node').forEach(nodeEl => {
            const id = nodeEl.dataset.rowId;
            if (connectedNodes.has(id)) {
                nodeEl.classList.add('highlighted');
            } else {
                nodeEl.classList.remove('highlighted');
            }
        });

        // Selezione del marker appropriato per contrasto fotometrico (bianco su scuro, nero su chiaro)
        const isDark = typeof WorkflowApp.isCanvasDark === 'function' ? WorkflowApp.isCanvasDark() : false;
        const activeMarker = isDark ? 'url(#wfArrowHighlightedDark)' : 'url(#wfArrowHighlightedLight)';

        document.querySelectorAll('#canvasSvgLayer path').forEach(p => {
            const edgeKey = `${p.dataset.from}->${p.dataset.to}`;
            if (highlightedEdges.has(edgeKey)) {
                p.classList.add('wf-path-highlighted');
                p.setAttribute('marker-end', activeMarker);
                // Porta la linea del ramo evidenziato in primo piano assoluto nel layer SVG
                p.parentNode.appendChild(p);
            } else {
                p.classList.remove('wf-path-highlighted');
                p.setAttribute('marker-end', 'url(#wfArrow)');
            }
        });
    },

    buildNodesDOM: () => {
        const container = document.getElementById('canvasNodesContainer');
        if (!container) return;
        container.innerHTML = '';

        const db = WorkflowApp.currentDbState;
        if (!db || !db.rows) return;

        const titleCol = (db.columns && db.columns[0]) ? db.columns[0] : { id: 'c_title', name: 'Titolo' };
        const renderCache = {};
        let positionedCount = 0;

        db.rows.forEach(row => {
            try {
                // Risoluzione virtuale della riga con il motore centrale di VanillaDesk
                let vRow = row;
                if (typeof AdvancedTable !== 'undefined' && AdvancedTable.buildVirtualRow) {
                    try {
                        vRow = AdvancedTable.buildVirtualRow(WorkflowApp.currentDbId, row, db, renderCache);
                    } catch(e) {}
                }
                const virtualCells = vRow.virtualCells || row.cells || {};

                const node = document.createElement('div');
                node.className = 'wf-node';
                node.id = `wf_node_${row.id}`;
                node.dataset.rowId = row.id;

                const pos = WorkflowApp.layout.nodes ? WorkflowApp.layout.nodes[row.id] : null;
                if (pos && isFinite(pos.x) && isFinite(pos.y)) {
                    node.style.left = `${pos.x}px`;
                    node.style.top = `${pos.y}px`;
                    positionedCount++;
                } else {
                    console.warn(`[WORKFLOW DEBUG] Nodo ${row.id} privo di coordinate in layout.nodes.`);
                }

                if (WorkflowApp.selectedNodeIds && WorkflowApp.selectedNodeIds.has(row.id)) {
                    node.classList.add('selected');
                }

                // Titolo risolto tramite il motore di formattazione nativo (gestisce anche titoli da formule o record_note)
                const rawTitle = virtualCells[titleCol.id];
                const titleVal = (rawTitle !== undefined && rawTitle !== null && rawTitle !== '')
                    ? AdvancedTable.getFormatDisplayValue(titleCol, rawTitle, renderCache)
                    : 'Senza Titolo';

                const colorStyles = WorkflowApp.getComputedNodeStyles(row, db, renderCache);

                let headerStyle = '';
                let titleStyle = '';

                if (colorStyles) {
                    headerStyle = `background: ${colorStyles.headerBg} !important;`;
                    titleStyle = `color: ${colorStyles.text} !important; font-weight: 800;`;
                    if (colorStyles.cardBg) {
                        node.style.setProperty('background', colorStyles.cardBg, 'important');
                    }
                    if (colorStyles.border) {
                        node.style.setProperty('border-color', colorStyles.border, 'important');
                    }
                } else if (WorkflowApp.layout.borderColor) {
                    node.style.setProperty('border-color', WorkflowApp.layout.borderColor, 'important');
                }

                // Rendering delle proprietà visibili sul nodo tramite le funzioni centrali di VanillaDesk
                let propsHtml = '';
                (WorkflowApp.layout.visibleColumns || []).forEach(cId => {
                    const colDef = (db.columns || []).find(c => c.id === cId);
                    if (!colDef) return;

                    let rawVal = virtualCells[cId];
                    if (rawVal === undefined || rawVal === null || rawVal === '') return;

                    let formattedContent = '';

                    if (colDef.type === 'select' || colDef.type === 'multi-select') {
                        const tags = Array.isArray(rawVal) ? rawVal : [rawVal];
                        formattedContent = tags.map(tagText => {
                            const colorClass = (db.selectColors && db.selectColors[colDef.id]) 
                                ? (db.selectColors[colDef.id][tagText] || '') 
                                : '';
                            return `<span class="wf-pill ${colorClass}">${UI.escapeHTML(String(tagText))}</span>`;
                        }).join('');
                    } else if (colDef.type === 'relation' || colDef.type === 'relation_backlink') {
                        const details = (typeof AdvancedTable !== 'undefined' && AdvancedTable.resolveRelationDetails)
                            ? AdvancedTable.resolveRelationDetails(colDef, rawVal, renderCache)
                            : [];
                        if (details.length > 0) {
                            formattedContent = details.map(d => `<span class="wf-pill default-color">${UI.escapeHTML(d.name)}</span>`).join('');
                        } else {
                            formattedContent = UI.escapeHTML(AdvancedTable.getFormatDisplayValue(colDef, rawVal, renderCache));
                        }
                    } else if (colDef.type === 'date' || colDef.type === 'datetime' || (typeof rawVal === 'object' && rawVal !== null && (rawVal.start !== undefined || rawVal.end !== undefined))) {
                        const dateText = AdvancedTable.getFormatDisplayValue(colDef, rawVal, renderCache);
                        formattedContent = `<span class="wf-date-badge">${UI.escapeHTML(dateText)}</span>`;
                    } else if (colDef.type === 'checkbox') {
                        formattedContent = rawVal ? `<span class="wf-bool-true">✓ Sì</span>` : `<span class="wf-bool-false">✕ No</span>`;
                    } else {
                        formattedContent = UI.escapeHTML(AdvancedTable.getFormatDisplayValue(colDef, rawVal, renderCache));
                    }

                    if (!formattedContent) return;

                    propsHtml += `
                        <div class="wf-node-prop-row">
                            <span class="wf-node-prop-label">${UI.escapeHTML(colDef.name)}</span>
                            <span class="wf-node-prop-val">${formattedContent}</span>
                        </div>
                    `;
                });

                // Inserimento dei 4 punti di aggancio cardinali (Top, Right, Bottom, Left)
                node.innerHTML = `
                    <div class="wf-port top is-idle" data-port="top" title="Punto di connessione" onmousedown="WorkflowApp.startLinkDrag(event, '${row.id}', 'top')"></div>
                    <div class="wf-port right is-idle" data-port="right" title="Punto di connessione" onmousedown="WorkflowApp.startLinkDrag(event, '${row.id}', 'right')"></div>
                    <div class="wf-port bottom is-idle" data-port="bottom" title="Punto di connessione" onmousedown="WorkflowApp.startLinkDrag(event, '${row.id}', 'bottom')"></div>
                    <div class="wf-port left is-idle" data-port="left" title="Punto di connessione" onmousedown="WorkflowApp.startLinkDrag(event, '${row.id}', 'left')"></div>
                    <div class="wf-node-header" style="${headerStyle}">
                        <span class="wf-node-title" style="${titleStyle}">${UI.escapeHTML(String(titleVal))}</span>
                        <span style="opacity:0.6; font-size:0.75rem; cursor:pointer; flex-shrink:0; padding-top:2px;" onclick="event.stopPropagation(); WorkflowApp.openRecordDrawer('${row.id}')" title="Dettaglio Record">🔍</span>
                    </div>
                    ${propsHtml ? `<div class="wf-node-body">${propsHtml}</div>` : ''}
                `;

                node.addEventListener('mousedown', (e) => {
                    if (e.button !== 0 || e.target.classList.contains('wf-port')) return;
                    e.stopPropagation();

                    const isModifierPressed = e.ctrlKey || e.metaKey || e.shiftKey;

                    if (isModifierPressed) {
                        if (WorkflowApp.selectedNodeIds.has(row.id)) {
                            WorkflowApp.selectedNodeIds.delete(row.id);
                            node.classList.remove('selected');
                        } else {
                            WorkflowApp.selectedNodeIds.add(row.id);
                            node.classList.add('selected');
                        }
                    } else {
                        if (!WorkflowApp.selectedNodeIds.has(row.id)) {
                            WorkflowApp.clearSelection();
                            WorkflowApp.selectedNodeIds.add(row.id);
                            node.classList.add('selected');
                        }
                    }

                    if (typeof WorkflowApp.updateSelectionToolbar === 'function') {
                        WorkflowApp.updateSelectionToolbar();
                    }

                    if (WorkflowApp.selectedNodeIds.size === 1) {
                        WorkflowApp.focusBranch(row.id);
                    } else {
                        WorkflowApp.clearFocusBranch();
                    }

                    if (WorkflowApp.layout.locked) return;

                    const initialPositions = {};
                    WorkflowApp.selectedNodeIds.forEach(id => {
                        const pos = WorkflowApp.layout.nodes[id] || { x: 0, y: 0 };
                        initialPositions[id] = { x: pos.x, y: pos.y };
                    });

                    WorkflowApp.dragNodeState = {
                        active: true,
                        masterId: row.id,
                        startMouseX: e.clientX,
                        startMouseY: e.clientY,
                        initialPositions: initialPositions
                    };
                });

                node.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    WorkflowApp.openRecordDrawer(row.id);
                });

                container.appendChild(node);
            } catch(nodeErr) {
                console.error("Errore durante la creazione del nodo:", nodeErr, row);
            }
        });

        console.log(`[WORKFLOW DEBUG] buildNodesDOM: generati ${db.rows.length} nodi (${positionedCount} posizionati alle coordinate salvate).`);
    },

    getComputedNodeStyles: (row, db, renderCache = {}) => {
        let rowColorClass = row.color && row.color !== 'none' ? row.color : '';
        let rowOpacity = row.opacity !== undefined && row.opacity !== '' ? row.opacity : '100';

        let virtualCells = row.cells || {};
        if (typeof AdvancedTable !== 'undefined' && AdvancedTable.buildVirtualRow) {
            try {
                const vRow = AdvancedTable.buildVirtualRow(WorkflowApp.currentDbId, row, db, renderCache);
                virtualCells = vRow.virtualCells || row.cells || {};
            } catch(e) {}
        }

        if (db.conditionalColors && Array.isArray(db.conditionalColors)) {
            for (const rule of db.conditionalColors) {
                if (!rule.active || !rule.conditions || rule.conditions.length === 0) continue;

                let allMatch = true;
                for (const cond of rule.conditions) {
                    if (cond.colId === 'SYS_JS_FORMULA') {
                        let condFormula = String(cond.value || '').trim();
                        if (condFormula.startsWith('=')) condFormula = condFormula.substring(1).trim();
                        const res = AdvancedTable.evaluateFormula(condFormula, row, db.columns, WorkflowApp.currentDbId, db.title, virtualCells, renderCache);
                        if (!(res === true || String(res).toLowerCase() === 'true')) {
                            allMatch = false;
                            break;
                        }
                        continue;
                    }

                    const colDef = (db.columns || []).find(c => c.id === cond.colId);
                    if (!colDef) { allMatch = false; break; }

                    let cellVal = virtualCells[cond.colId];
                    let targetVal = cond.value;

                    if (typeof targetVal === 'string' && targetVal.startsWith('=') && typeof AdvancedTable !== 'undefined' && AdvancedTable.evaluateFormula) {
                        targetVal = AdvancedTable.evaluateFormula(targetVal.substring(1), row, db.columns, WorkflowApp.currentDbId, db.title, virtualCells, renderCache);
                    }

                    // Valutazione condizionale delegata al motore nativo LogicEngine
                    if (typeof LogicEngine !== 'undefined' && LogicEngine.evaluateCondition) {
                        if (!LogicEngine.evaluateCondition(cond.operator, targetVal, cellVal, null, colDef, { mode: cond.dateMode, shift: cond.dateShift }, row, db)) {
                            allMatch = false;
                            break;
                        }
                    }
                }

                if (allMatch) {
                    rowColorClass = rule.color && rule.color !== 'none' ? rule.color : '';
                    let opVal = rule.opacity !== undefined && rule.opacity !== '' ? rule.opacity : '100';
                    
                    let cleanOpFormula = String(opVal).trim();
                    if (cleanOpFormula.startsWith('=')) cleanOpFormula = cleanOpFormula.substring(1).trim();

                    if ((rule.opacityType === 'formula' || isNaN(Number(cleanOpFormula))) && typeof AdvancedTable !== 'undefined' && AdvancedTable.evaluateFormula) {
                        opVal = AdvancedTable.evaluateFormula(cleanOpFormula, row, db.columns, WorkflowApp.currentDbId, db.title, virtualCells, renderCache);
                    }

                    rowOpacity = opVal;
                    break;
                }
            }
        }

        if (typeof rowOpacity === 'string' && (rowOpacity.startsWith('=') || isNaN(Number(rowOpacity))) && typeof AdvancedTable !== 'undefined' && AdvancedTable.evaluateFormula) {
            let cleanOp = rowOpacity.startsWith('=') ? rowOpacity.substring(1).trim() : rowOpacity.trim();
            rowOpacity = AdvancedTable.evaluateFormula(cleanOp, row, db.columns, WorkflowApp.currentDbId, db.title, virtualCells, renderCache);
        }

        let pOp = parseFloat(rowOpacity);
        if (isNaN(pOp)) pOp = 100;
        pOp = Math.max(0, Math.min(100, pOp));

        if (!rowColorClass) return null;

        let borderVar = '';
        let bgBaseVar = '';

        if (rowColorClass.startsWith('#') || rowColorClass.startsWith('rgb')) {
            borderVar = rowColorClass;
            bgBaseVar = rowColorClass;
        } else {
            const numMatch = rowColorClass.match(/\d+/);
            const num = numMatch ? numMatch[0] : '1';
            borderVar = `var(--tx-c${num})`;
            bgBaseVar = `var(--hl-c${num})`;
        }

        const effectiveHeaderBg = `color-mix(in srgb, ${bgBaseVar} ${pOp}%, var(--sidebar-bg))`;
        const effectiveCardBg = `color-mix(in srgb, ${bgBaseVar} ${Math.round(pOp * 0.2)}%, var(--sidebar-bg))`;

        return {
            border: borderVar,
            headerBg: effectiveHeaderBg,
            cardBg: effectiveCardBg,
            text: borderVar,
            opacityPct: pOp
        };
    },

    updateMarqueeBox: (e) => {
        const ms = WorkflowApp.marqueeState;
        const box = document.getElementById('canvasMarqueeBox');
        if (!ms.active || !box) return;

        const vp = document.getElementById('canvasViewport');
        const vpRect = vp.getBoundingClientRect();

        const x1 = Math.min(ms.startClientX, e.clientX) - vpRect.left;
        const y1 = Math.min(ms.startClientY, e.clientY) - vpRect.top;
        const w = Math.abs(e.clientX - ms.startClientX);
        const h = Math.abs(e.clientY - ms.startClientY);

        box.style.display = 'block';
        box.style.left = `${x1}px`;
        box.style.top = `${y1}px`;
        box.style.width = `${w}px`;
        box.style.height = `${h}px`;

        const zoom = WorkflowApp.layout.zoom || 1;
        const panX = isFinite(WorkflowApp.layout.pan.x) ? WorkflowApp.layout.pan.x : 72;
        const panY = isFinite(WorkflowApp.layout.pan.y) ? WorkflowApp.layout.pan.y : 72;

        const curWorldX = (e.clientX - vpRect.left - panX) / zoom;
        const curWorldY = (e.clientY - vpRect.top - panY) / zoom;

        const bMinX = Math.min(ms.startWorldX, curWorldX);
        const bMaxX = Math.max(ms.startWorldX, curWorldX);
        const bMinY = Math.min(ms.startWorldY, curWorldY);
        const bMaxY = Math.max(ms.startWorldY, curWorldY);

        const db = WorkflowApp.currentDbState;
        if (!db) return;

        const nodeWidth = 288;

        (db.rows || []).forEach(r => {
            const pos = WorkflowApp.layout.nodes[r.id];
            const el = document.getElementById(`wf_node_${r.id}`);
            if (!pos || !el) return;

            const nW = nodeWidth;
            const nH = el.offsetHeight;

            const intersects = !(pos.x + nW < bMinX || pos.x > bMaxX || pos.y + nH < bMinY || pos.y > bMaxY);
            if (intersects) {
                WorkflowApp.selectedNodeIds.add(r.id);
                el.classList.add('selected');
            } else if (!e.ctrlKey && !e.metaKey) {
                WorkflowApp.selectedNodeIds.delete(r.id);
                el.classList.remove('selected');
            }
        });

        WorkflowApp.updateMinimap();
        if (typeof WorkflowApp.updateSelectionToolbar === 'function') {
            WorkflowApp.updateSelectionToolbar();
        }
    },

    finishMarqueeSelection: (e) => {
        const box = document.getElementById('canvasMarqueeBox');
        if (box) box.style.display = 'none';
        WorkflowApp.marqueeState.active = false;
        if (typeof WorkflowApp.updateSelectionToolbar === 'function') {
            WorkflowApp.updateSelectionToolbar();
        }
        if (WorkflowApp.selectedNodeIds.size > 1) {
            UI.showToast(`Selezionati ${WorkflowApp.selectedNodeIds.size} blocchi.`, 'info');
        }
    }
});