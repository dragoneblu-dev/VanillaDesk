/**
 * workflow-layout.js
 * Modulo Layout per Workflow Studio:
 * - Calcolo fit-to-view per centrare il grafo.
 * - Auto-layout organico ad albero su coordinate discrete con supporto a cluster.
 * - Gestione dei cluster (riquadri visivi delimitati) sul canvas.
 * - Toolbar Flottante e Motore di Allineamento e Distribuzione Multipla (Align & Distribute).
 */

Object.assign(WorkflowApp, {

    fitToView: () => {
        const nodeKeys = Object.keys(WorkflowApp.layout.nodes || {});
        if (nodeKeys.length === 0) return;

        const viewport = document.getElementById('canvasViewport');
        const vw = viewport ? (viewport.clientWidth || window.innerWidth) : window.innerWidth;
        const vh = viewport ? (viewport.clientHeight || (window.innerHeight - 52)) : (window.innerHeight - 52);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        nodeKeys.forEach(id => {
            const pos = WorkflowApp.layout.nodes[id];
            const el = document.getElementById(`wf_node_${id}`);
            const w = 288;
            const h = el ? el.offsetHeight : 85;

            if (pos && isFinite(pos.x) && isFinite(pos.y)) {
                if (pos.x < minX) minX = pos.x;
                if (pos.y < minY) minY = pos.y;
                if (pos.x + w > maxX) maxX = pos.x + w;
                if (pos.y + h > maxY) maxY = pos.y + h;
            }
        });

        if (!isFinite(minX) || !isFinite(maxX)) return;

        const graphW = Math.max(300, maxX - minX + 160);
        const graphH = Math.max(200, maxY - minY + 160);

        let scale = Math.min(vw / graphW, vh / graphH);
        scale = Math.max(0.2, Math.min(1.1, scale));

        const newZoom = Math.round(scale * 100) / 100;
        const newPanX = Math.round((vw - (maxX + minX) * newZoom) / 2);
        const newPanY = Math.round((vh - (maxY + minY) * newZoom) / 2);

        if (isFinite(newZoom) && isFinite(newPanX) && isFinite(newPanY)) {
            WorkflowApp.layout.zoom = newZoom;
            WorkflowApp.layout.pan.x = newPanX;
            WorkflowApp.layout.pan.y = newPanY;
            WorkflowApp.updateCanvasTransform();
        }
    },

    fitMatchingNodes: (matchingIds) => {
        if (!matchingIds || matchingIds.size === 0) return;

        const viewport = document.getElementById('canvasViewport');
        const vw = viewport ? (viewport.clientWidth || window.innerWidth) : window.innerWidth;
        const vh = viewport ? (viewport.clientHeight || (window.innerHeight - 52)) : (window.innerHeight - 52);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        matchingIds.forEach(id => {
            const pos = WorkflowApp.layout.nodes[id];
            const el = document.getElementById(`wf_node_${id}`);
            const w = 288;
            const h = el ? el.offsetHeight : 72;

            if (pos && isFinite(pos.x) && isFinite(pos.y)) {
                if (pos.x < minX) minX = pos.x;
                if (pos.y < minY) minY = pos.y;
                if (pos.x + w > maxX) maxX = pos.x + w;
                if (pos.y + h > maxY) maxY = pos.y + h;
            }
        });

        if (!isFinite(minX) || !isFinite(maxX)) return;

        const graphW = Math.max(300, maxX - minX + 160);
        const graphH = Math.max(200, maxY - minY + 160);

        let scale = Math.min(vw / graphW, vh / graphH);
        scale = Math.max(0.25, Math.min(1.15, scale));

        const newZoom = Math.round(scale * 100) / 100;
        const newPanX = Math.round((vw - (maxX + minX) * newZoom) / 2);
        const newPanY = Math.round((vh - (maxY + minY) * newZoom) / 2);

        if (isFinite(newZoom) && isFinite(newPanX) && isFinite(newPanY)) {
            WorkflowApp.layout.zoom = newZoom;
            WorkflowApp.layout.pan.x = newPanX;
            WorkflowApp.layout.pan.y = newPanY;
            WorkflowApp.updateCanvasTransform();
        }
    },

    runOrganicAutoLayout: (forceAll = true) => {
        const db = WorkflowApp.currentDbState;
        const relCol = WorkflowApp.selfRelCol;
        if (!db || !db.rows || db.rows.length === 0) return;

        const nodeWidth = 288;
        const gapX = 144;  
        const gapY = 48;  
        
        const rows = db.rows;
        const rowIds = new Set(rows.map(r => r.id));
        const isPredecessorMode = WorkflowApp.layout.relationDirection === 'predecessor';

        const outgoing = new Map();
        const incoming = new Map();

        rows.forEach(r => {
            outgoing.set(r.id, new Set());
            incoming.set(r.id, new Set());
        });

        if (relCol) {
            rows.forEach(r => {
                if (!r.cells) return;
                let targets = r.cells[relCol.id];
                if (!targets) return;
                if (!Array.isArray(targets)) targets = [targets];

                targets.forEach(tgtId => {
                    if (rowIds.has(tgtId) && tgtId !== r.id) {
                        const from = isPredecessorMode ? tgtId : r.id;
                        const to = isPredecessorMode ? r.id : tgtId;
                        outgoing.get(from).add(to);
                        incoming.get(to).add(from);
                    }
                });
            });
        }

        const partitions = [];
        if (WorkflowApp.layout.clusterColId) {
            const cCol = (db.columns || []).find(c => c.id === WorkflowApp.layout.clusterColId);
            const groups = new Map();
            rows.forEach(r => {
                const rawVal = r.cells ? r.cells[cCol.id] : null;
                const key = (rawVal === undefined || rawVal === null || rawVal === '') ? 'Senza Valore' : (Array.isArray(rawVal) ? rawVal.join(', ') : String(rawVal));
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(r.id);
            });
            groups.forEach((ids) => partitions.push(ids));
        } else {
            const visited = new Set();
            rows.forEach(r => {
                if (!visited.has(r.id)) {
                    const comp = [];
                    const queue = [r.id];
                    visited.add(r.id);
                    while (queue.length > 0) {
                        const curr = queue.shift();
                        comp.push(curr);
                        [...outgoing.get(curr), ...incoming.get(curr)].forEach(nbr => {
                            if (!visited.has(nbr)) {
                                visited.add(nbr);
                                queue.push(nbr);
                            }
                        });
                    }
                    partitions.push(comp);
                }
            });
            partitions.sort((a, b) => b.length - a.length);
        }

        let globalOffsetMajor = 72;

        partitions.forEach(compNodeIds => {
            const compSet = new Set(compNodeIds);
            const ranks = new Map();
            const visiting = new Set();
            const visitedRank = new Set();

            const getRank = (u) => {
                if (visiting.has(u)) return 0;
                if (visitedRank.has(u)) return ranks.get(u) || 0;

                visiting.add(u);
                let maxParentRank = -1;

                const parents = incoming.get(u) || [];
                parents.forEach(p => {
                    if (compSet.has(p)) {
                        const pRank = getRank(p);
                        if (pRank > maxParentRank) maxParentRank = pRank;
                    }
                });

                visiting.delete(u);
                visitedRank.add(u);
                const myRank = maxParentRank + 1;
                ranks.set(u, myRank);
                return myRank;
            };

            compNodeIds.forEach(id => getRank(id));

            const layers = [];
            compNodeIds.forEach(id => {
                const rk = ranks.get(id) || 0;
                if (!layers[rk]) layers[rk] = [];
                layers[rk].push(id);
            });

            for (let l = 1; l < layers.length; l++) {
                if (!layers[l]) continue;
                layers[l].sort((a, b) => {
                    const parentsA = [...(incoming.get(a) || [])].filter(p => compSet.has(p));
                    const parentsB = [...(incoming.get(b) || [])].filter(p => compSet.has(p));
                    const avgA = parentsA.length > 0 ? parentsA.reduce((sum, p) => sum + (layers[l - 1]?.indexOf(p) ?? 0), 0) / parentsA.length : 0;
                    const avgB = parentsB.length > 0 ? parentsB.reduce((sum, p) => sum + (layers[l - 1]?.indexOf(p) ?? 0), 0) / parentsB.length : 0;
                    return avgA - avgB;
                });
            }

            const tempCoords = new Map();
            let maxMinor = 0;

            layers.forEach((layerNodes, rankIdx) => {
                const x = WorkflowApp.snapToGrid(72 + rankIdx * (nodeWidth + gapX));
                let currentY = globalOffsetMajor;

                layerNodes.forEach(nodeId => {
                    const el = document.getElementById(`wf_node_${nodeId}`);
                    const h = el ? el.offsetHeight : 72;

                    const parents = [...(incoming.get(nodeId) || [])].filter(p => tempCoords.has(p));
                    let targetY = currentY;

                    if (parents.length > 0) {
                        const parentYs = parents.map(p => tempCoords.get(p).y);
                        const avgParentY = parentYs.reduce((a, b) => a + b, 0) / parentYs.length;
                        targetY = Math.max(currentY, avgParentY - (h / 4));
                    }

                    targetY = WorkflowApp.snapToGrid(Math.max(currentY, targetY));
                    tempCoords.set(nodeId, { x, y: targetY });

                    if (forceAll || !WorkflowApp.layout.nodes[nodeId]) {
                        WorkflowApp.layout.nodes[nodeId] = { x, y: targetY };
                    }

                    currentY = WorkflowApp.snapToGrid(targetY + h + gapY);
                });

                if (currentY > maxMinor) maxMinor = currentY;
            });

            globalOffsetMajor = WorkflowApp.snapToGrid(maxMinor + 72);
        });

        rows.forEach(r => {
            const pos = WorkflowApp.layout.nodes[r.id];
            const el = document.getElementById(`wf_node_${r.id}`);
            if (pos && el) {
                el.style.left = `${pos.x}px`;
                el.style.top = `${pos.y}px`;
            }
        });

        WorkflowApp.renderConnections();
        WorkflowApp.renderClusters();
    },

    openClusterDrawer: () => {
        const db = WorkflowApp.currentDbState;
        if (!db) return;

        let html = `
            <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:15px;">
                Avvolgi automaticamente i blocchi correlati all'interno di riquadri sul canvas in base a una proprietà:
            </div>
            <select id="clusterColSelect" class="modern-input" style="width:100%; margin-bottom:20px; font-weight:bold;">
                <option value="">-- Nessun Raggruppamento (Canvas Libero) --</option>
        `;

        db.columns.forEach(c => {
            const isSel = WorkflowApp.layout.clusterColId === c.id ? 'selected' : '';
            html += `<option value="${c.id}" ${isSel}>➔ Raggruppa per "${UI.escapeHTML(c.name)}" (${c.type})</option>`;
        });

        html += `</select>`;
        
        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">Annulla</button>
            <button class="btn btn-primary" onclick="WorkflowApp.applyClusterGroup(document.getElementById('clusterColSelect').value)">Applica Raggruppamento</button>
        `;
        
        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.group || Icons.folder} Raggruppamento in Cluster</span>`, html, footerHTML);
    },

    applyClusterGroup: (colId) => {
        WorkflowApp.layout.clusterColId = colId || null;
        UI.closeDrawer();
        WorkflowApp.runOrganicAutoLayout(true);
        WorkflowApp.fitToView();
        WorkflowApp.saveWorkflowAuto();
    },

    renderClusters: () => {
        const container = document.getElementById('canvasClustersContainer');
        if (!container) return;
        container.innerHTML = '';

        const clusterColId = WorkflowApp.layout.clusterColId;
        const db = WorkflowApp.currentDbState;
        if (!clusterColId || !db || !db.rows) return;

        const colDef = (db.columns || []).find(c => c.id === clusterColId);
        if (!colDef) return;

        const groups = new Map();
        db.rows.forEach(r => {
            const rawVal = r.cells ? r.cells[clusterColId] : null;
            let key = 'Senza Valore';
            if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
                key = Array.isArray(rawVal) ? rawVal.join(', ') : String(rawVal);
            }
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(r.id);
        });

        const pad = 24;

        groups.forEach((rowIds, groupName) => {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            rowIds.forEach(id => {
                const pos = WorkflowApp.layout.nodes[id];
                const el = document.getElementById(`wf_node_${id}`);
                if (pos && el) {
                    const w = 288;
                    const h = el.offsetHeight;
                    if (pos.x < minX) minX = pos.x;
                    if (pos.y < minY) minY = pos.y;
                    if (pos.x + w > maxX) maxX = pos.x + w;
                    if (pos.y + h > maxY) maxY = pos.y + h;
                }
            });

            if (minX === Infinity) return;

            const boxX = minX - pad;
            const boxY = minY - pad;
            const boxW = (maxX - minX) + (pad * 2);
            const boxH = (maxY - minY) + (pad * 2);

            const clusterCard = document.createElement('div');
            clusterCard.className = 'wf-cluster-card';
            clusterCard.style.left = `${boxX}px`;
            clusterCard.style.top = `${boxY}px`;
            clusterCard.style.width = `${boxW}px`;
            clusterCard.style.height = `${boxH}px`;

            const header = document.createElement('div');
            header.className = 'wf-cluster-header';
            header.innerText = `${groupName} (${rowIds.length})`;

            clusterCard.appendChild(header);
            container.appendChild(clusterCard);
        });
    },

    setRelationDirection: (dir) => {
        if (WorkflowApp.layout.relationDirection === dir) return;
        WorkflowApp.layout.relationDirection = dir;
        WorkflowApp.runOrganicAutoLayout(true);
        WorkflowApp.fitToView();
        WorkflowApp.saveWorkflowAuto();
    },

    setConnectionStyle: (style) => {
        WorkflowApp.layout.connectionStyle = style;
        WorkflowApp.renderConnections();
        WorkflowApp.saveWorkflowAuto();
    },

    // =========================================================================
    // MOTORE ALLINEAMENTO E DISTRIBUZIONE MULTIPLA RAPIDA (ALIGN & DISTRIBUTE)
    // =========================================================================
    _getSelectedNodesGeometry: () => {
        const ids = Array.from(WorkflowApp.selectedNodeIds || []);
        if (ids.length < 2) return [];

        const items = [];
        ids.forEach(id => {
            const pos = WorkflowApp.layout.nodes[id];
            const el = document.getElementById(`wf_node_${id}`);
            if (pos && isFinite(pos.x) && isFinite(pos.y) && el) {
                items.push({
                    id,
                    x: pos.x,
                    y: pos.y,
                    w: 288,
                    h: el.offsetHeight || 80,
                    el
                });
            }
        });
        return items;
    },

    alignSelectedNodes: (mode) => {
        if (WorkflowApp.layout.locked) {
            UI.showToast("Layout Bloccato: sblocca per allineare i blocchi.", "warning");
            return;
        }

        const nodes = WorkflowApp._getSelectedNodesGeometry();
        if (nodes.length < 2) return;

        if (mode === 'left') {
            const minX = Math.min(...nodes.map(n => n.x));
            const snappedX = WorkflowApp.snapToGrid(minX);
            nodes.forEach(n => {
                WorkflowApp.layout.nodes[n.id].x = snappedX;
                n.el.style.left = `${snappedX}px`;
            });
            UI.showToast(`Allineati ${nodes.length} blocchi a sinistra`, "info");
        } else if (mode === 'centerH') {
            const minX = Math.min(...nodes.map(n => n.x));
            const maxX = Math.max(...nodes.map(n => n.x + n.w));
            const centerX = (minX + maxX) / 2;
            nodes.forEach(n => {
                const targetX = WorkflowApp.snapToGrid(centerX - (n.w / 2));
                WorkflowApp.layout.nodes[n.id].x = targetX;
                n.el.style.left = `${targetX}px`;
            });
            UI.showToast(`Centrati orizzontalmente ${nodes.length} blocchi`, "info");
        } else if (mode === 'right') {
            const maxX = Math.max(...nodes.map(n => n.x + n.w));
            nodes.forEach(n => {
                const targetX = WorkflowApp.snapToGrid(maxX - n.w);
                WorkflowApp.layout.nodes[n.id].x = targetX;
                n.el.style.left = `${targetX}px`;
            });
            UI.showToast(`Allineati ${nodes.length} blocchi a destra`, "info");
        } else if (mode === 'top') {
            const minY = Math.min(...nodes.map(n => n.y));
            const snappedY = WorkflowApp.snapToGrid(minY);
            nodes.forEach(n => {
                WorkflowApp.layout.nodes[n.id].y = snappedY;
                n.el.style.top = `${snappedY}px`;
            });
            UI.showToast(`Allineati ${nodes.length} blocchi in alto`, "info");
        } else if (mode === 'centerV') {
            const minY = Math.min(...nodes.map(n => n.y));
            const maxY = Math.max(...nodes.map(n => n.y + n.h));
            const centerY = (minY + maxY) / 2;
            nodes.forEach(n => {
                const targetY = WorkflowApp.snapToGrid(centerY - (n.h / 2));
                WorkflowApp.layout.nodes[n.id].y = targetY;
                n.el.style.top = `${targetY}px`;
            });
            UI.showToast(`Centrati verticalmente ${nodes.length} blocchi`, "info");
        } else if (mode === 'bottom') {
            const maxY = Math.max(...nodes.map(n => n.y + n.h));
            nodes.forEach(n => {
                const targetY = WorkflowApp.snapToGrid(maxY - n.h);
                WorkflowApp.layout.nodes[n.id].y = targetY;
                n.el.style.top = `${targetY}px`;
            });
            UI.showToast(`Allineati ${nodes.length} blocchi in basso`, "info");
        }

        WorkflowApp.renderConnections();
        WorkflowApp.renderClusters();
        WorkflowApp.updateMinimap();
        WorkflowApp.saveWorkflowAuto();
    },

    distributeSelectedNodes: (axis) => {
        if (WorkflowApp.layout.locked) {
            UI.showToast("Layout Bloccato: sblocca per distribuire i blocchi.", "warning");
            return;
        }

        const nodes = WorkflowApp._getSelectedNodesGeometry();
        if (nodes.length < 3) {
            UI.showToast("Seleziona almeno 3 blocchi per distribuirli equamente.", "warning");
            return;
        }

        if (axis === 'horizontal') {
            nodes.sort((a, b) => a.x - b.x);
            const first = nodes[0];
            const last = nodes[nodes.length - 1];

            const span = (last.x + last.w) - first.x;
            const totalW = nodes.reduce((acc, n) => acc + n.w, 0);
            const freeSpace = span - totalW;
            const gap = freeSpace > 0 ? (freeSpace / (nodes.length - 1)) : 48;

            let currentX = first.x;
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                const snappedX = WorkflowApp.snapToGrid(currentX);
                WorkflowApp.layout.nodes[n.id].x = snappedX;
                n.el.style.left = `${snappedX}px`;
                currentX += n.w + gap;
            }
            UI.showToast(`Distribuiti orizzontalmente ${nodes.length} blocchi`, "info");
        } else if (axis === 'vertical') {
            nodes.sort((a, b) => a.y - b.y);
            const first = nodes[0];
            const last = nodes[nodes.length - 1];

            const span = (last.y + last.h) - first.y;
            const totalH = nodes.reduce((acc, n) => acc + n.h, 0);
            const freeSpace = span - totalH;
            const gap = freeSpace > 0 ? (freeSpace / (nodes.length - 1)) : 24;

            let currentY = first.y;
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                const snappedY = WorkflowApp.snapToGrid(currentY);
                WorkflowApp.layout.nodes[n.id].y = snappedY;
                n.el.style.top = `${snappedY}px`;
                currentY += n.h + gap;
            }
            UI.showToast(`Distribuiti verticalmente ${nodes.length} blocchi`, "info");
        }

        WorkflowApp.renderConnections();
        WorkflowApp.renderClusters();
        WorkflowApp.updateMinimap();
        WorkflowApp.saveWorkflowAuto();
    },

    snapSelectedNodesToGrid: () => {
        if (WorkflowApp.layout.locked) {
            UI.showToast("Layout Bloccato: impossibile modificare le posizioni.", "warning");
            return;
        }

        const nodes = WorkflowApp._getSelectedNodesGeometry();
        if (nodes.length === 0) return;

        nodes.forEach(n => {
            const sx = WorkflowApp.snapToGrid(n.x);
            const sy = WorkflowApp.snapToGrid(n.y);
            WorkflowApp.layout.nodes[n.id].x = sx;
            WorkflowApp.layout.nodes[n.id].y = sy;
            n.el.style.left = `${sx}px`;
            n.el.style.top = `${sy}px`;
        });

        WorkflowApp.renderConnections();
        WorkflowApp.renderClusters();
        WorkflowApp.updateMinimap();
        WorkflowApp.saveWorkflowAuto();
        UI.showToast(`Agganciati a griglia ${nodes.length} blocchi`, "info");
    },

    updateSelectionToolbar: () => {
        const toolbar = document.getElementById('wfSelectionToolbar');
        if (!toolbar) return;

        const count = WorkflowApp.selectedNodeIds ? WorkflowApp.selectedNodeIds.size : 0;
        if (count < 2) {
            toolbar.classList.remove('active');
            toolbar.innerHTML = '';
            return;
        }

        const isLocked = !!WorkflowApp.layout.locked;
        const disabledAttr = isLocked ? 'disabled' : '';

        toolbar.innerHTML = `
            <span class="wf-toolbar-badge">${count} selezionati</span>

            <!-- ALLINEAMENTO ORIZZONTALE -->
            <button class="wf-toolbar-btn" ${disabledAttr} onclick="WorkflowApp.alignSelectedNodes('left')" title="Allinea a Sinistra">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="1" y="1" width="2" height="14" rx="0.5"/>
                    <rect x="5" y="3" width="9" height="4" rx="1" fill-opacity="0.8"/>
                    <rect x="5" y="9" width="6" height="4" rx="1" fill-opacity="0.8"/>
                </svg>
            </button>
            <button class="wf-toolbar-btn" ${disabledAttr} onclick="WorkflowApp.alignSelectedNodes('centerH')" title="Allinea al Centro Orizzontale">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                    <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 1"/>
                    <rect x="3" y="3" width="10" height="4" rx="1" fill-opacity="0.8"/>
                    <rect x="4.5" y="9" width="7" height="4" rx="1" fill-opacity="0.8"/>
                </svg>
            </button>
            <button class="wf-toolbar-btn" ${disabledAttr} onclick="WorkflowApp.alignSelectedNodes('right')" title="Allinea a Destra">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="13" y="1" width="2" height="14" rx="0.5"/>
                    <rect x="2" y="3" width="9" height="4" rx="1" fill-opacity="0.8"/>
                    <rect x="5" y="9" width="6" height="4" rx="1" fill-opacity="0.8"/>
                </svg>
            </button>

            <div class="wf-toolbar-sep"></div>

            <!-- ALLINEAMENTO VERTICALE -->
            <button class="wf-toolbar-btn" ${disabledAttr} onclick="WorkflowApp.alignSelectedNodes('top')" title="Allinea in Alto">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="1" y="1" width="14" height="2" rx="0.5"/>
                    <rect x="3" y="5" width="4" height="9" rx="1" fill-opacity="0.8"/>
                    <rect x="9" y="5" width="4" height="6" rx="1" fill-opacity="0.8"/>
                </svg>
            </button>
            <button class="wf-toolbar-btn" ${disabledAttr} onclick="WorkflowApp.alignSelectedNodes('centerV')" title="Allinea al Centro Verticale">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                    <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 1"/>
                    <rect x="3" y="3" width="4" height="10" rx="1" fill-opacity="0.8"/>
                    <rect x="9" y="4.5" width="4" height="7" rx="1" fill-opacity="0.8"/>
                </svg>
            </button>
            <button class="wf-toolbar-btn" ${disabledAttr} onclick="WorkflowApp.alignSelectedNodes('bottom')" title="Allinea in Basso">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="1" y="13" width="14" height="2" rx="0.5"/>
                    <rect x="3" y="2" width="4" height="9" rx="1" fill-opacity="0.8"/>
                    <rect x="9" y="5" width="4" height="6" rx="1" fill-opacity="0.8"/>
                </svg>
            </button>

            <div class="wf-toolbar-sep"></div>

            <!-- DISTRIBUZIONE EQUIDISTANTE -->
            <button class="wf-toolbar-btn" ${disabledAttr} onclick="WorkflowApp.distributeSelectedNodes('horizontal')" title="Distribuisci Equamente in Orizzontale">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="1" y="3" width="2" height="10" rx="0.5"/>
                    <rect x="7" y="5" width="2" height="6" rx="0.5"/>
                    <rect x="13" y="3" width="2" height="10" rx="0.5"/>
                </svg>
            </button>
            <button class="wf-toolbar-btn" ${disabledAttr} onclick="WorkflowApp.distributeSelectedNodes('vertical')" title="Distribuisci Equamente in Verticale">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="3" y="1" width="10" height="2" rx="0.5"/>
                    <rect x="5" y="7" width="6" height="2" rx="0.5"/>
                    <rect x="3" y="13" width="10" height="2" rx="0.5"/>
                </svg>
            </button>

            <div class="wf-toolbar-sep"></div>

            <!-- SNAP TO GRID RAPIDO -->
            <button class="wf-toolbar-btn" ${disabledAttr} onclick="WorkflowApp.snapSelectedNodesToGrid()" title="Aggancia Nodi Selezionati alla Griglia">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="4" cy="4" r="1.5"/>
                    <circle cx="12" cy="4" r="1.5"/>
                    <circle cx="4" cy="12" r="1.5"/>
                    <circle cx="12" cy="12" r="1.5"/>
                </svg>
            </button>

            <button class="wf-toolbar-btn" onclick="WorkflowApp.clearSelection()" title="Deseleziona Tutto">✕</button>
        `;

        toolbar.classList.add('active');
    }
});