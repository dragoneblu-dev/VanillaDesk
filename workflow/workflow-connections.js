/**
 * workflow-connections.js
 * Modulo Connessioni per Workflow Studio:
 * - Algoritmo di determinazione geometrica delle porte con Natural Vector Alignment.
 * - Connessione a segmento dritto per nodi allineati sull'asse orizzontale o verticale.
 * - Supporto completo a porte multiple (più uscite dalla stessa porta OUT, più ingressi nella porta IN).
 * - Confluenza Intelligente (Edge Bundling / Trunking): quando più collegamenti convergono sulla
 *   stessa porta, si uniscono in un unico tronco comune tramite raccordi morbidi (R >= 12px),
 *   eliminando doppie linee parallele e riducendo il disordine visivo.
 * - Rigoroso vincolo di esclusività: un punto IN non può diventare OUT e viceversa.
 * - Evitamento ostacoli reale tramite Channel Routing perimetrale a clearance fissa (R >= 12px).
 * - Selezione intelligente delle porte con penalità di collisione (Obstacle Crossing Penalty)
 *   e tangenti Bézier proiettate per impedire sovrapposizioni e sbandate su nodi intermedi.
 */

Object.assign(WorkflowApp, {

    // =========================================================================
    // GEOMETRIA DEI 4 PUNTI CARDINALI SULLE SCHEDE
    // =========================================================================
    getNodePortGeometry: (nodeId, side) => {
        const nodePos = WorkflowApp.layout.nodes[nodeId];
        const nodeEl = document.getElementById(`wf_node_${nodeId}`);
        const nodeW = 288;
        const nodeH = nodeEl ? nodeEl.offsetHeight : 80;

        if (!nodePos || !isFinite(nodePos.x) || !isFinite(nodePos.y)) {
            return { x: 0, y: 0, normal: { x: 1, y: 0 }, side };
        }

        switch (side) {
            case 'top':
                return { x: nodePos.x + (nodeW / 2), y: nodePos.y, normal: { x: 0, y: -1 }, side };
            case 'bottom':
                return { x: nodePos.x + (nodeW / 2), y: nodePos.y + nodeH, normal: { x: 0, y: 1 }, side };
            case 'left':
                return { x: nodePos.x, y: nodePos.y + (nodeH / 2), normal: { x: -1, y: 0 }, side };
            case 'right':
            default:
                return { x: nodePos.x + nodeW, y: nodePos.y + (nodeH / 2), normal: { x: 1, y: 0 }, side };
        }
    },

    // =========================================================================
    // INTERSEZIONI GEOMETRICHE E COLLISION DETECTION
    // =========================================================================
    _lineIntersectsLine: (x1, y1, x2, y2, x3, y3, x4, y4) => {
        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (Math.abs(denom) < 1e-6) return false;
        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
        return (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1);
    },

    _segmentIntersectsBox: (p1, p2, box) => {
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);

        if (maxX < box.x || minX > box.x + box.w || maxY < box.y || minY > box.y + box.h) {
            return false;
        }

        const inside = (p) => p.x > box.x + 2 && p.x < box.x + box.w - 2 && p.y > box.y + 2 && p.y < box.y + box.h - 2;
        if (inside(p1) || inside(p2)) return true;

        const bL = box.x, bR = box.x + box.w, bT = box.y, bB = box.y + box.h;
        return (
            WorkflowApp._lineIntersectsLine(p1.x, p1.y, p2.x, p2.y, bL, bT, bR, bT) ||
            WorkflowApp._lineIntersectsLine(p1.x, p1.y, p2.x, p2.y, bR, bT, bR, bB) ||
            WorkflowApp._lineIntersectsLine(p1.x, p1.y, p2.x, p2.y, bR, bB, bL, bB) ||
            WorkflowApp._lineIntersectsLine(p1.x, p1.y, p2.x, p2.y, bL, bB, bL, bT)
        );
    },

    /**
     * Verifica rapida ed efficiente delle collisioni di una traiettoria candidata
     * contro un insieme di ostacoli noti sul canvas.
     */
    _checkTrajectoryCollisions: (p1, n1, p2, n2, obstacles, styleMode) => {
        if (!obstacles || obstacles.length === 0) return 0;

        const minX = Math.min(p1.x, p2.x) - 40;
        const maxX = Math.max(p1.x, p2.x) + 40;
        const minY = Math.min(p1.y, p2.y) - 40;
        const maxY = Math.max(p1.y, p2.y) + 40;

        let collisions = 0;

        for (let i = 0; i < obstacles.length; i++) {
            const obs = obstacles[i];
            // Test rapido di esclusione Axis-Aligned Bounding Box (AABB)
            if (obs.x > maxX || obs.x + obs.w < minX || obs.y > maxY || obs.y + obs.h < minY) {
                continue;
            }

            if (styleMode === 'bezier') {
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const dist = Math.hypot(dx, dy) || 1;

                const proj1 = (dx * n1.x) + (dy * n1.y);
                const h1 = proj1 > 0 ? Math.max(24, Math.min(180, proj1 * 0.5)) : Math.max(40, Math.min(140, dist * 0.3));

                const proj2 = (dx * (-n2.x)) + (dy * (-n2.y));
                const h2 = proj2 > 0 ? Math.max(24, Math.min(180, proj2 * 0.5)) : Math.max(40, Math.min(140, dist * 0.3));

                const c1 = { x: p1.x + n1.x * h1, y: p1.y + n1.y * h1 };
                const c2 = { x: p2.x + n2.x * h2, y: p2.y + n2.y * h2 };

                let hit = false;
                let prevPt = p1;
                // Campionamento Bézier a 8 step: ultra-performante e accurato
                for (let step = 1; step <= 8; step++) {
                    const t = step / 8;
                    const it = 1 - t;
                    const curPt = {
                        x: (it * it * it * p1.x) + (3 * it * it * t * c1.x) + (3 * it * t * t * c2.x) + (t * t * t * p2.x),
                        y: (it * it * it * p1.y) + (3 * it * it * t * c1.y) + (3 * it * t * t * c2.y) + (t * t * t * p2.y)
                    };

                    if (WorkflowApp._segmentIntersectsBox(prevPt, curPt, obs)) {
                        hit = true;
                        break;
                    }
                    prevPt = curPt;
                }

                if (hit) collisions++;
            } else {
                const waypoints = WorkflowApp._buildOrthogonalWaypoints(p1, n1, p2, n2, []);
                let hit = false;
                for (let w = 0; w < waypoints.length - 1; w++) {
                    if (WorkflowApp._segmentIntersectsBox(waypoints[w], waypoints[w + 1], obs)) {
                        hit = true;
                        break;
                    }
                }
                if (hit) collisions++;
            }
        }

        return collisions;
    },

    // =========================================================================
    // TRASCINAMENTO INTERATTIVO COLLEGAMENTO (DRAG-TO-CONNECT)
    // =========================================================================
    startLinkDrag: (e, rowId, side = 'right') => {
        if (WorkflowApp.layout.locked) {
            UI.showToast("Layout Bloccato: sblocca per creare nuovi collegamenti.", "warning");
            return;
        }

        // Verifica vincolo esclusività: la porta non può emettere se è già usata come ingresso
        const portEl = document.querySelector(`#wf_node_${rowId} .wf-port.${side}`);
        if (portEl && portEl.classList.contains('is-in')) {
            UI.showToast("Questo punto di aggancio è già utilizzato come ingresso e non può essere usato come uscita.", "warning");
            e.stopPropagation();
            e.preventDefault();
            return;
        }

        e.stopPropagation();
        e.preventDefault();

        const nodeEl = document.getElementById(`wf_node_${rowId}`);
        if (!nodeEl) return;

        document.body.classList.add('is-linking');

        const geo = WorkflowApp.getNodePortGeometry(rowId, side);

        const svg = document.getElementById('canvasSvgLayer');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('stroke', 'var(--accent-color)');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('stroke-dasharray', '5');
        path.setAttribute('fill', 'none');
        path.setAttribute('marker-end', 'url(#wfArrow)');
        svg.appendChild(path);

        WorkflowApp.linkDragState = {
            active: true,
            fromRowId: rowId,
            fromPortSide: side,
            startX: geo.x,
            startY: geo.y,
            tempPath: path
        };

        WorkflowApp.runLinkAutoPan();
    },

    runLinkAutoPan: () => {
        if (!WorkflowApp.linkDragState.active) return;

        const viewport = document.getElementById('canvasViewport');
        const rect = viewport.getBoundingClientRect();
        const margin = 60;
        const maxSpeed = 16;

        const mx = WorkflowApp.lastMouseClient.x;
        const my = WorkflowApp.lastMouseClient.y;

        let panDx = 0;
        let panDy = 0;

        if (mx < rect.left + margin) panDx = ((margin - (mx - rect.left)) / margin) * maxSpeed;
        else if (mx > rect.right - margin) panDx = -((margin - (rect.right - mx)) / margin) * maxSpeed;

        if (my < rect.top + margin) panDy = ((margin - (my - rect.top)) / margin) * maxSpeed;
        else if (my > rect.bottom - margin) panDy = -((margin - (rect.bottom - my)) / margin) * maxSpeed;

        if (panDx !== 0 || panDy !== 0) {
            WorkflowApp.layout.pan.x += panDx;
            WorkflowApp.layout.pan.y += panDy;
            WorkflowApp.updateCanvasTransform();
            WorkflowApp.updateTempLinkPath();
        }

        requestAnimationFrame(WorkflowApp.runLinkAutoPan);
    },

    updateTempLinkPath: () => {
        if (!WorkflowApp.linkDragState.active || !WorkflowApp.linkDragState.tempPath) return;

        const plane = document.getElementById('canvasPlane');
        const rect = plane.getBoundingClientRect();
        const zoom = WorkflowApp.layout.zoom || 1;

        const curX = (WorkflowApp.lastMouseClient.x - rect.left) / zoom;
        const curY = (WorkflowApp.lastMouseClient.y - rect.top) / zoom;

        const sX = WorkflowApp.linkDragState.startX;
        const sY = WorkflowApp.linkDragState.startY;

        const dx = Math.max(40, Math.abs(curX - sX) * 0.4);
        const d = `M ${sX} ${sY} C ${sX + dx} ${sY}, ${curX - dx} ${curY}, ${curX} ${curY}`;
        WorkflowApp.linkDragState.tempPath.setAttribute('d', d);
    },

    finishLinkDrag: (e) => {
        document.body.classList.remove('is-linking');

        const state = WorkflowApp.linkDragState;
        if (!state || !state.active) return;
        
        const fromRowId = state.fromRowId;
        if (state.tempPath) state.tempPath.remove();
        WorkflowApp.linkDragState = { active: false, fromRowId: null, fromPortSide: null, startX: 0, startY: 0, tempPath: null };

        const clientX = e ? e.clientX : WorkflowApp.lastMouseClient.x;
        const clientY = e ? e.clientY : WorkflowApp.lastMouseClient.y;

        const elements = document.elementsFromPoint(clientX, clientY) || [];
        
        let targetNode = null;
        let targetPort = null;

        for (const el of elements) {
            if (el.classList && el.classList.contains('wf-port')) {
                targetPort = el;
            }
            const node = el.closest && el.closest('.wf-node');
            if (node) {
                targetNode = node;
                break;
            }
        }

        if (!targetNode) return;
        const targetRowId = targetNode.dataset.rowId;

        if (!targetRowId || targetRowId === fromRowId) return;

        if (targetPort && targetPort.classList.contains('is-out')) {
            UI.showToast("Il punto selezionato è già utilizzato come uscita e non può fungere da ingresso.", "warning");
            return;
        }

        WorkflowApp.connectNodes(fromRowId, targetRowId);
    },

    checkCycle: (fromId, toId) => {
        if (fromId === toId) return true;
        const db = WorkflowApp.currentDbState;
        const relCol = WorkflowApp.selfRelCol;
        if (!db || !relCol) return false;

        const visited = new Set();
        const queue = [toId];

        while (queue.length > 0) {
            const curr = queue.shift();
            if (curr === fromId) return true;
            if (visited.has(curr)) continue;
            visited.add(curr);

            const row = (db.rows || []).find(r => r.id === curr);
            if (row && row.cells) {
                let targets = row.cells[relCol.id];
                if (targets) {
                    if (!Array.isArray(targets)) targets = [targets];
                    targets.forEach(tId => {
                        if (!visited.has(tId)) queue.push(tId);
                    });
                }
            }
        }
        return false;
    },

    connectNodes: async (fromId, toId) => {
        if (WorkflowApp.layout.locked) {
            UI.showToast("Layout Bloccato: impossibile modificare i collegamenti.", "warning");
            return;
        }

        const db = WorkflowApp.currentDbState;
        const relCol = WorkflowApp.selfRelCol;
        if (!db || !relCol) {
            alert("Questo database non possiede una colonna Relazione configurata.");
            return;
        }

        const isPredecessor = WorkflowApp.layout.relationDirection === 'predecessor';
        const sourceRecordId = isPredecessor ? toId : fromId;
        const targetRecordId = isPredecessor ? fromId : toId;

        if (WorkflowApp.checkCycle(sourceRecordId, targetRecordId)) {
            alert("⚠️ Collegamento bloccato: creerebbe un Riferimento Circolare (Loop infinito).");
            return;
        }

        const row = db.rows.find(r => r.id === sourceRecordId);
        if (!row) return;

        let currentTargets = row.cells[relCol.id];
        if (!Array.isArray(currentTargets)) currentTargets = currentTargets ? [currentTargets] : [];

        if (currentTargets.includes(targetRecordId)) {
            UI.showToast("Le due schede sono già collegate.");
            return;
        }

        if (relCol.singleRecord) {
            currentTargets = [targetRecordId];
        } else {
            currentTargets.push(targetRecordId);
        }

        row.cells[relCol.id] = currentTargets;
        row.updatedAt = Date.now();

        await WorkflowApp.persistDatabaseToDisk();

        WorkflowApp.renderConnections();
        WorkflowApp.saveWorkflowAuto();
        UI.showToast("Collegamento creato e salvato!", "success");
    },

    disconnectNodes: async (fromId, toId) => {
        if (WorkflowApp.layout.locked) {
            UI.showToast("Layout Bloccato: impossibile eliminare i collegamenti.", "warning");
            return;
        }

        const db = WorkflowApp.currentDbState;
        const relCol = WorkflowApp.selfRelCol;
        if (!db || !relCol) return;

        const isPredecessor = WorkflowApp.layout.relationDirection === 'predecessor';
        const sourceRecordId = isPredecessor ? toId : fromId;
        const targetRecordId = isPredecessor ? fromId : toId;

        const row = db.rows.find(r => r.id === sourceRecordId);
        if (!row) return;

        let currentTargets = row.cells[relCol.id];
        if (!Array.isArray(currentTargets)) return;

        row.cells[relCol.id] = currentTargets.filter(id => id !== targetRecordId);
        row.updatedAt = Date.now();

        await WorkflowApp.persistDatabaseToDisk();

        WorkflowApp.renderConnections();
        WorkflowApp.saveWorkflowAuto();
        UI.showToast("Collegamento rimosso!", "info");
    },

    persistDatabaseToDisk: async () => {
        if (!AppState.workspaceHandle) return;
        try {
            const dbDir = await AppState.workspaceHandle.getDirectoryHandle('databases', { create: false });
            const fileHandle = await dbDir.getFileHandle(`${WorkflowApp.currentDbId}.json`, { create: false });
            const writable = await fileHandle.createWritable();
            const serialized = JSON.stringify(WorkflowApp.currentDbState, null, 2);
            await writable.write(serialized);
            await writable.close();
            WorkflowApp._lastDbContentHash = serialized;

            if (WorkflowApp.syncChannel) {
                WorkflowApp.syncChannel.postMessage({ type: 'db_saved', tableId: WorkflowApp.currentDbId });
            }
        } catch (e) {
            console.error("Errore salvataggio relazione:", e);
            UI.showToast("Impossibile scrivere sul disco locale.", "error");
        }
    },

    // =========================================================================
    // RACCORDO GEOMETRICO ARROTONDATO (R >= 12px) PER CURVE ORTOGONALI
    // =========================================================================
    _pointsToRoundedPath: (points, radius = 12) => {
        if (!points || points.length === 0) return '';
        if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
        if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

        // Rimozione punti collinearità ridondanti o duplicati
        const cleanPts = [points[0]];
        for (let i = 1; i < points.length; i++) {
            const prev = cleanPts[cleanPts.length - 1];
            const curr = points[i];
            if (Math.abs(curr.x - prev.x) > 0.5 || Math.abs(curr.y - prev.y) > 0.5) {
                cleanPts.push(curr);
            }
        }

        if (cleanPts.length < 3) {
            return `M ${cleanPts[0].x} ${cleanPts[0].y} L ${cleanPts[cleanPts.length - 1].x} ${cleanPts[cleanPts.length - 1].y}`;
        }

        let d = `M ${cleanPts[0].x} ${cleanPts[0].y}`;

        for (let i = 1; i < cleanPts.length - 1; i++) {
            const pPrev = cleanPts[i - 1];
            const pCurr = cleanPts[i];
            const pNext = cleanPts[i + 1];

            const dx1 = pCurr.x - pPrev.x;
            const dy1 = pCurr.y - pPrev.y;
            const len1 = Math.hypot(dx1, dy1);

            const dx2 = pNext.x - pCurr.x;
            const dy2 = pNext.y - pCurr.y;
            const len2 = Math.hypot(dx2, dy2);

            const r = Math.min(radius, len1 / 2, len2 / 2);

            if (r < 1) {
                d += ` L ${pCurr.x} ${pCurr.y}`;
                continue;
            }

            const startX = pCurr.x - (dx1 / len1) * r;
            const startY = pCurr.y - (dy1 / len1) * r;

            const endX = pCurr.x + (dx2 / len2) * r;
            const endY = pCurr.y + (dy2 / len2) * r;

            d += ` L ${startX} ${startY} Q ${pCurr.x} ${pCurr.y}, ${endX} ${endY}`;
        }

        const last = cleanPts[cleanPts.length - 1];
        d += ` L ${last.x} ${last.y}`;
        return d;
    },

    // =========================================================================
    // COSTRUZIONE WAYPOINTS ORTOGONALI CON CANALIZZAZIONE E TRUNKING CONDIVISO
    // =========================================================================
    _buildOrthogonalWaypoints: (p1, n1, p2, n2, obstacles = [], sharedTrunkFeeder = null) => {
        // 1. ASSE VERTICALE DIRETTO: se le porte si affacciano direttamente in verticale
        if (n1.x === 0 && n2.x === 0 && Math.abs(p1.x - p2.x) < 4) {
            const isDirectVertical = (n1.y === 1 && n2.y === -1 && p2.y > p1.y) || 
                                     (n1.y === -1 && n2.y === 1 && p1.y > p2.y);
            if (isDirectVertical) {
                return [p1, p2]; // Linea perfettamente dritta
            }
        }

        // 2. ASSE ORIZZONTALE DIRETTO: se le porte si affacciano direttamente in orizzontale
        if (n1.y === 0 && n2.y === 0 && Math.abs(p1.y - p2.y) < 4) {
            const isDirectHorizontal = (n1.x === 1 && n2.x === -1 && p2.x > p1.x) || 
                                       (n1.x === -1 && n2.x === 1 && p1.x > p2.x);
            if (isDirectHorizontal) {
                return [p1, p2]; // Linea perfettamente dritta
            }
        }

        const stub = 20;
        const q1 = { x: p1.x + n1.x * stub, y: p1.y + n1.y * stub };
        const q2 = { x: p2.x + n2.x * stub, y: p2.y + n2.y * stub };

        let waypoints = [p1, q1];

        // Se è specificato un corridoio di confluenza comune verso la porta di destinazione
        const feederX = (sharedTrunkFeeder && sharedTrunkFeeder.axis === 'x') ? sharedTrunkFeeder.coord : null;
        const feederY = (sharedTrunkFeeder && sharedTrunkFeeder.axis === 'y') ? sharedTrunkFeeder.coord : null;

        if (n1.y === 0 && n2.y === 0) {
            // Entrambi orizzontali
            const midX = feederX !== null ? feederX : (q1.x + q2.x) / 2;
            waypoints.push({ x: midX, y: q1.y }, { x: midX, y: q2.y });
        } else if (n1.x === 0 && n2.x === 0) {
            // Entrambi verticali
            const midY = feederY !== null ? feederY : (q1.y + q2.y) / 2;
            waypoints.push({ x: q1.x, y: midY }, { x: q2.x, y: midY });
        } else {
            // Un'uscita orizzontale e un arrivo verticale (o viceversa)
            if (n1.x !== 0) {
                const cornerX = feederX !== null ? feederX : q2.x;
                waypoints.push({ x: cornerX, y: q1.y });
                if (cornerX !== q2.x) {
                    waypoints.push({ x: cornerX, y: q2.y });
                }
            } else {
                const cornerY = feederY !== null ? feederY : q2.y;
                waypoints.push({ x: q1.x, y: cornerY });
                if (cornerY !== q2.y) {
                    waypoints.push({ x: q2.x, y: cornerY });
                }
            }
        }

        waypoints.push(q2, p2);

        // 3. AGGIRAMENTO PERIMETRALE DEGLI OSTACOLI INTERMEDI (CHANNEL ROUTER)
        if (obstacles && obstacles.length > 0) {
            let hitObstacle = null;
            for (let i = 0; i < waypoints.length - 1; i++) {
                for (const obs of obstacles) {
                    if (WorkflowApp._segmentIntersectsBox(waypoints[i], waypoints[i + 1], obs)) {
                        hitObstacle = obs;
                        break;
                    }
                }
                if (hitObstacle) break;
            }

            if (hitObstacle) {
                const pad = 24;
                const obsTop = hitObstacle.y - pad;
                const obsBottom = hitObstacle.y + hitObstacle.h + pad;
                const obsLeft = hitObstacle.x - pad;
                const obsRight = hitObstacle.x + hitObstacle.w + pad;

                if (n1.x !== 0) {
                    // Flusso orizzontale: devia attraverso il canale orizzontale libero
                    const goBelow = Math.abs(q2.y - obsBottom) <= Math.abs(q2.y - obsTop);
                    const bypassY = goBelow ? obsBottom : obsTop;

                    const clearStepX1 = n1.x > 0 ? Math.min(q1.x, obsLeft) : Math.max(q1.x, obsRight);
                    // Raccorda la deviazione direttamente nel corridoio feeder condiviso (se presente)
                    const clearStepX2 = feederX !== null ? feederX : (n1.x > 0 ? Math.max(q2.x, obsRight) : Math.min(q2.x, obsLeft));

                    waypoints = [
                        p1,
                        { x: clearStepX1, y: p1.y },
                        { x: clearStepX1, y: bypassY },
                        { x: clearStepX2, y: bypassY },
                        { x: clearStepX2, y: p2.y },
                        p2
                    ];
                } else if (n1.y !== 0) {
                    // Flusso verticale: devia attraverso il canale verticale libero
                    const goRight = q2.x >= hitObstacle.x + hitObstacle.w / 2;
                    const bypassX = goRight ? obsRight : obsLeft;

                    const clearStepY2 = feederY !== null ? feederY : q2.y;

                    waypoints = [
                        p1,
                        { x: p1.x, y: q1.y },
                        { x: bypassX, y: q1.y },
                        { x: bypassX, y: clearStepY2 },
                        { x: p2.x, y: clearStepY2 },
                        p2
                    ];
                }
            }
        }

        return waypoints;
    },

    // =========================================================================
    // CALCOLO TRAIETTORIA BÉZIER NATURALE CON TANGENTI PROIETTATE
    // =========================================================================
    _computeBezierPath: (p1, n1, p2, n2) => {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy) || 1;

        // Proiezione della direzione verso p2 sulla normale di uscita n1
        const proj1 = (dx * n1.x) + (dy * n1.y);
        let h1;
        if (proj1 > 0) {
            // Target davanti alla porta: ampiezza proporzionale alla proiezione utile
            h1 = Math.max(24, Math.min(180, proj1 * 0.5));
        } else {
            // Target dietro alla porta: ampiezza di curvatura morbida per l'inversione
            h1 = Math.max(40, Math.min(140, dist * 0.3));
        }

        // Proiezione della direzione di arrivo (-n2) rispetto al vettore tra p1 e p2
        const proj2 = (dx * (-n2.x)) + (dy * (-n2.y));
        let h2;
        if (proj2 > 0) {
            // Sorgente nella direzione di approccio naturale della porta
            h2 = Math.max(24, Math.min(180, proj2 * 0.5));
        } else {
            // Sorgente posizionata posteriormente alla porta di arrivo
            h2 = Math.max(40, Math.min(140, dist * 0.3));
        }

        const c1x = p1.x + n1.x * h1;
        const c1y = p1.y + n1.y * h1;

        const c2x = p2.x + n2.x * h2;
        const c2y = p2.y + n2.y * h2;

        return `M ${p1.x} ${p1.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    },

    // =========================================================================
    // ASSEGNAZIONE PORTE E RENDERING CONFLUENZA CONDIVISA (EDGE BUNDLING)
    // =========================================================================
    renderConnections: () => {
        const svg = document.getElementById('canvasSvgLayer');
        if (!svg) return;
        svg.querySelectorAll('path').forEach(p => p.remove());

        const db = WorkflowApp.currentDbState;
        const relCol = WorkflowApp.selfRelCol;
        if (!db || !relCol) return;

        const isPredecessorMode = WorkflowApp.layout.relationDirection === 'predecessor';
        const styleMode = WorkflowApp.layout.connectionStyle;

        // Bounding box degli ostacoli reali sul canvas (con clearance di 12px)
        const obstacles = [];
        db.rows.forEach(r => {
            const pos = WorkflowApp.layout.nodes[r.id];
            const el = document.getElementById(`wf_node_${r.id}`);
            if (pos && el) {
                obstacles.push({
                    id: r.id,
                    x: pos.x - 12,
                    y: pos.y - 12,
                    w: 288 + 24,
                    h: el.offsetHeight + 24
                });
            }
        });

        // Raccolta archi
        const rawEdges = [];
        db.rows.forEach(row => {
            if (!row.cells) return;
            let targets = row.cells[relCol.id];
            if (!targets) return;
            if (!Array.isArray(targets)) targets = [targets];

            targets.forEach(targetRowId => {
                const fromId = isPredecessorMode ? targetRowId : row.id;
                const toId = isPredecessorMode ? row.id : targetRowId;
                if (WorkflowApp.layout.nodes[fromId] && WorkflowApp.layout.nodes[toId]) {
                    rawEdges.push({ fromId, toId });
                }
            });
        });

        // Registro di esclusività delle porte (IN != OUT)
        const portRoles = {};
        db.rows.forEach(r => {
            portRoles[r.id] = { top: null, right: null, bottom: null, left: null };
        });

        const sides = ['top', 'right', 'bottom', 'left'];
        const resolvedEdges = [];

        rawEdges.forEach(edge => {
            const u = edge.fromId;
            const v = edge.toId;

            let validSourceSides = sides.filter(s => portRoles[u][s] !== 'in');
            if (validSourceSides.length === 0) validSourceSides = sides;

            let validTargetSides = sides.filter(s => portRoles[v][s] !== 'out');
            if (validTargetSides.length === 0) validTargetSides = sides;

            let bestSourceSide = validSourceSides[0];
            let bestTargetSide = validTargetSides[0];
            let lowestScore = Infinity;

            const candidateObstacles = obstacles.filter(o => o.id !== u && o.id !== v);

            for (const sU of validSourceSides) {
                const gU = WorkflowApp.getNodePortGeometry(u, sU);
                for (const sV of validTargetSides) {
                    const gV = WorkflowApp.getNodePortGeometry(v, sV);

                    const dx = gV.x - gU.x;
                    const dy = gV.y - gU.y;
                    const dist = Math.hypot(dx, dy) || 1;

                    const uX = dx / dist;
                    const uY = dy / dist;

                    const alignSource = (gU.normal.x * uX) + (gU.normal.y * uY);
                    const alignTarget = (-gV.normal.x * uX) + (-gV.normal.y * uY);

                    let penalty = 0;
                    if (alignSource < 0) penalty += 350 * Math.abs(alignSource);
                    if (alignTarget < 0) penalty += 350 * Math.abs(alignTarget);

                    if (portRoles[u][sU] === 'out') penalty -= 40;
                    if (portRoles[v][sV] === 'in') penalty -= 40;

                    // Calcolo penalità virtuale per attraversamento ostacoli (Obstacle Crossing Penalty)
                    const collisions = WorkflowApp._checkTrajectoryCollisions(
                        { x: gU.x, y: gU.y },
                        gU.normal,
                        { x: gV.x, y: gV.y },
                        gV.normal,
                        candidateObstacles,
                        styleMode
                    );

                    if (collisions > 0) {
                        penalty += collisions * 3000;
                    }

                    const totalScore = dist + penalty;

                    if (totalScore < lowestScore) {
                        lowestScore = totalScore;
                        bestSourceSide = sU;
                        bestTargetSide = sV;
                    }
                }
            }

            portRoles[u][bestSourceSide] = 'out';
            portRoles[v][bestTargetSide] = 'in';

            const g1 = WorkflowApp.getNodePortGeometry(u, bestSourceSide);
            const g2 = WorkflowApp.getNodePortGeometry(v, bestTargetSide);

            resolvedEdges.push({
                fromId: u,
                toId: v,
                sourceSide: bestSourceSide,
                targetSide: bestTargetSide,
                p1: { x: g1.x, y: g1.y },
                n1: g1.normal,
                p2: { x: g2.x, y: g2.y },
                n2: g2.normal
            });
        });

        // Aggiornamento classi di stato delle porte nel DOM
        db.rows.forEach(r => {
            const roles = portRoles[r.id];
            sides.forEach(s => {
                const portEl = document.querySelector(`#wf_node_${r.id} .wf-port.${s}`);
                if (portEl) {
                    portEl.classList.remove('is-in', 'is-out', 'is-idle');
                    if (roles[s] === 'in') {
                        portEl.classList.add('is-in');
                        portEl.title = "Punto di Ingresso (Esclusivo)";
                    } else if (roles[s] === 'out') {
                        portEl.classList.add('is-out');
                        portEl.title = "Punto di Uscita";
                    } else {
                        portEl.classList.add('is-idle');
                        portEl.title = "Punto di connessione libero";
                    }
                }
            });
        });

        // =====================================================================
        // TRUNKING: RAGGRUPPAMENTO E CONFLUENZA COMUNE PER PORTE CONDIVISE
        // =====================================================================
        const targetPortGroups = new Map();
        resolvedEdges.forEach(edge => {
            const key = `${edge.toId}:${edge.targetSide}`;
            if (!targetPortGroups.has(key)) targetPortGroups.set(key, []);
            targetPortGroups.get(key).push(edge);
        });

        const trunkFeederMap = new Map();
        targetPortGroups.forEach((group, key) => {
            if (group.length > 1) {
                const sample = group[0];
                const p2 = sample.p2;
                const n2 = sample.n2;

                if (n2.x !== 0) {
                    // Porta orizzontale (es. 'left'): tronco di approccio a 36px
                    trunkFeederMap.set(key, { axis: 'x', coord: p2.x + (n2.x * 36) });
                } else if (n2.y !== 0) {
                    // Porta verticale (es. 'top'): tronco di approccio a 36px
                    trunkFeederMap.set(key, { axis: 'y', coord: p2.y + (n2.y * 36) });
                }
            }
        });

        // Rendering effettivo degli archi SVG
        resolvedEdges.forEach(edge => {
            let d = '';

            if (styleMode === 'bezier') {
                d = WorkflowApp._computeBezierPath(edge.p1, edge.n1, edge.p2, edge.n2);
            } else {
                const candidateObstacles = (styleMode === 'avoidance')
                    ? obstacles.filter(o => o.id !== edge.fromId && o.id !== edge.toId)
                    : [];

                const trunkKey = `${edge.toId}:${edge.targetSide}`;
                const sharedTrunkFeeder = trunkFeederMap.get(trunkKey) || null;

                const waypoints = WorkflowApp._buildOrthogonalWaypoints(
                    edge.p1,
                    edge.n1,
                    edge.p2,
                    edge.n2,
                    candidateObstacles,
                    sharedTrunkFeeder
                );

                d = WorkflowApp._pointsToRoundedPath(waypoints, 12);
            }

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            path.setAttribute('stroke', 'var(--accent-color)');
            path.setAttribute('stroke-width', '1.5');
            path.setAttribute('fill', 'none');
            path.setAttribute('marker-end', 'url(#wfArrow)');
            path.setAttribute('opacity', '0.85');
            path.className.baseVal = 'wf-connection-line';
            path.dataset.from = edge.fromId;
            path.dataset.to = edge.toId;

            path.onclick = (e) => {
                e.stopPropagation();
                const fromRow = db.rows.find(r => r.id === edge.fromId);
                const toRow = db.rows.find(r => r.id === edge.toId);
                const fromName = fromRow?.cells ? (fromRow.cells[db.columns[0]?.id] || 'Elemento') : 'Elemento';
                const toName = toRow?.cells ? (toRow.cells[db.columns[0]?.id] || 'Elemento') : 'Elemento';

                if (confirm(`Rimuovere il collegamento tra "${fromName}" e "${toName}"?`)) {
                    WorkflowApp.disconnectNodes(edge.fromId, edge.toId);
                }
            };

            svg.appendChild(path);
        });

        WorkflowApp.updateMinimap();
    }
});