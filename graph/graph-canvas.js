/**
 * graph/graph-canvas.js
 * Motore Grafico HTML5 Canvas 2D e Simulatore Fisico Force-Directed:
 * - Nucleo Relazionale Centrale + Corona Periferica per Nodi Isolati (Obsidian Pattern):
 *   i nodi privi di collegamenti orbitano ordinatamente all'esterno, liberando il centro della mappa.
 * - Fit To View Immediato all'apertura: occupa il 100% dello schermo senza rimpicciolire il grafo.
 * - Adaptive Degree-Based Springs: molle elastiche calibrate sul grado dei nodi e distensione a raggiera degli Hub.
 * - Warm-up Annealing Sincrono Completo (~420 passi in ~25ms): il grafo compare al primo fotogramma già perfetto e fermo.
 * - Zero-Jitter on Click: nessun movimento al tocco; la fisica si attiva solo su trascinamento manuale reale (> 5px).
 * - Spatial Hash Grid Partitioning O(N): simulazione fluida a 60FPS senza freeze anche con oltre 1.000 note.
 */

window.GraphCanvas = {
    canvas: null,
    ctx: null,
    nodes: [],
    links: [],

    physics: {
        repulsion: 650,
        springLengthNote: 85,
        springLengthRecord: 55,
        springLengthTag: 145,
        springStrength: 0.065,
        gravity: 0.010,
        friction: 0.87,
        alpha: 0.0,
        minAlpha: 0.001
    },

    transform: {
        x: 0,
        y: 0,
        zoom: 1.0
    },

    animFrameId: null,
    potentialDragNode: null,
    draggedNode: null,
    hoveredNode: null,
    selectedNode: null,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    lastMouse: { x: 0, y: 0 },
    dragDistance: 0,

    init: (canvasId) => {
        GraphCanvas.canvas = document.getElementById(canvasId);
        if (!GraphCanvas.canvas) return;
        GraphCanvas.ctx = GraphCanvas.canvas.getContext('2d');

        GraphCanvas.resize();
        window.addEventListener('resize', () => {
            if (typeof GraphApp !== 'undefined' && GraphApp.isOpen) {
                GraphCanvas.resize();
                GraphCanvas.fitToView();
            }
        });

        GraphCanvas.bindEvents();
        GraphCanvas.updateData(GraphData.nodes, GraphData.links, true);
        GraphCanvas.fitToView();
        GraphCanvas.render();
    },

    resize: () => {
        const c = GraphCanvas.canvas;
        if (!c || !c.parentElement) return;
        const rect = c.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        c.width = (rect.width || window.innerWidth) * dpr;
        c.height = (rect.height || (window.innerHeight - 52)) * dpr;
        GraphCanvas.render();
    },

    updateData: (nodes, links, isInitialWarmup = false) => {
        GraphCanvas.nodes = nodes;
        GraphCanvas.links = links;

        let unpositionedCount = 0;
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));

        // Separazione topologica iniziale: i nodi connessi formano il nucleo, gli orfani nascono nella corona esterna
        const connectedNodes = nodes.filter(n => (n.degree || 0) > 0);
        const orphanNodes = nodes.filter(n => (n.degree || 0) === 0);

        connectedNodes.forEach((n, idx) => {
            if (n.x === 0 && n.y === 0) {
                unpositionedCount++;
                const theta = idx * goldenAngle;
                const r = 15 + Math.sqrt(idx) * 22;
                n.x = Math.cos(theta) * r;
                n.y = Math.sin(theta) * r;
                n.vx = 0;
                n.vy = 0;
            }
        });

        // I nodi orfani vengono collocati direttamente nell'anello esterno della galassia
        const baseOuterRadius = Math.max(160, Math.sqrt(connectedNodes.length || 1) * 36);
        orphanNodes.forEach((n, idx) => {
            if (n.x === 0 && n.y === 0) {
                unpositionedCount++;
                const theta = idx * goldenAngle;
                const r = baseOuterRadius + (idx % 3) * 35;
                n.x = Math.cos(theta) * r;
                n.y = Math.sin(theta) * r;
                n.vx = 0;
                n.vy = 0;
            }
        });

        if (isInitialWarmup || unpositionedCount > 0) {
            GraphCanvas.warmupSimulation(420);
        } else {
            GraphCanvas.physics.alpha = 0.0;
            if (GraphCanvas.animFrameId) {
                cancelAnimationFrame(GraphCanvas.animFrameId);
                GraphCanvas.animFrameId = null;
            }
            GraphCanvas.render();
        }
    },

    warmupSimulation: (ticks = 420) => {
        const p = GraphCanvas.physics;
        
        const warmSteps = Math.round(ticks * 0.65);
        const coolSteps = ticks - warmSteps;

        // 1. Fase calda di espansione: i cluster si distendono e gli orfani scivolano all'esterno
        for (let i = 0; i < warmSteps; i++) {
            p.alpha = 1.0 - (i / warmSteps) * 0.40;
            GraphCanvas._tickPhysicsInternal(true);
        }

        // 2. Fase di raffreddamento controllato verso l'equilibrio definitivo
        for (let i = 0; i < coolSteps; i++) {
            p.alpha = 0.60 * (1.0 - (i / coolSteps));
            GraphCanvas._tickPhysicsInternal(true);
        }

        // 3. Congelamento finale a velocità zero
        p.alpha = 0.0;
        GraphCanvas.nodes.forEach(n => {
            n.vx = 0;
            n.vy = 0;
        });

        if (GraphCanvas.animFrameId) {
            cancelAnimationFrame(GraphCanvas.animFrameId);
            GraphCanvas.animFrameId = null;
        }

        if (GraphData && GraphData.persistentPositions) {
            GraphCanvas.nodes.forEach(n => {
                if (n.x !== 0 || n.y !== 0) {
                    GraphData.persistentPositions.set(n.id, { x: n.x, y: n.y, vx: 0, vy: 0 });
                }
            });
        }
    },

    restartSimulation: () => {
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const connectedNodes = GraphCanvas.nodes.filter(n => (n.degree || 0) > 0);
        const orphanNodes = GraphCanvas.nodes.filter(n => (n.degree || 0) === 0);

        connectedNodes.forEach((n, idx) => {
            const theta = idx * goldenAngle;
            const r = 20 + Math.sqrt(idx) * 22;
            n.x = Math.cos(theta) * r;
            n.y = Math.sin(theta) * r;
            n.vx = 0;
            n.vy = 0;
            if (GraphData && GraphData.persistentPositions) {
                GraphData.persistentPositions.set(n.id, { x: n.x, y: n.y, vx: 0, vy: 0 });
            }
        });

        const baseOuterRadius = Math.max(160, Math.sqrt(connectedNodes.length || 1) * 36);
        orphanNodes.forEach((n, idx) => {
            const theta = idx * goldenAngle;
            const r = baseOuterRadius + (idx % 3) * 35;
            n.x = Math.cos(theta) * r;
            n.y = Math.sin(theta) * r;
            n.vx = 0;
            n.vy = 0;
            if (GraphData && GraphData.persistentPositions) {
                GraphData.persistentPositions.set(n.id, { x: n.x, y: n.y, vx: 0, vy: 0 });
            }
        });

        GraphCanvas.warmupSimulation(420);
        GraphCanvas.fitToView();
        GraphCanvas.render();
    },

    startLoop: () => {
        const step = () => {
            GraphCanvas.tickPhysics();
            GraphCanvas.render();

            if (GraphCanvas.draggedNode || GraphCanvas.physics.alpha > GraphCanvas.physics.minAlpha) {
                GraphCanvas.animFrameId = requestAnimationFrame(step);
            } else {
                GraphCanvas.animFrameId = null;
                GraphCanvas.physics.alpha = 0.0;
                GraphCanvas.nodes.forEach(n => {
                    n.vx = 0;
                    n.vy = 0;
                });
                if (GraphData && GraphData.persistentPositions) {
                    GraphCanvas.nodes.forEach(n => {
                        if (n.x !== 0 || n.y !== 0) {
                            GraphData.persistentPositions.set(n.id, { x: n.x, y: n.y, vx: 0, vy: 0 });
                        }
                    });
                }
            }
        };
        if (GraphCanvas.animFrameId) cancelAnimationFrame(GraphCanvas.animFrameId);
        GraphCanvas.animFrameId = requestAnimationFrame(step);
    },

    tickPhysics: () => {
        GraphCanvas._tickPhysicsInternal(false);
        GraphCanvas.physics.alpha *= 0.97;
    },

    _tickPhysicsInternal: (isWarmup = false) => {
        const p = GraphCanvas.physics;
        if (p.alpha <= p.minAlpha && !GraphCanvas.draggedNode && !isWarmup) return;

        const nodes = GraphCanvas.nodes;
        const links = GraphCanvas.links;
        const nLen = nodes.length;

        // 1. REPULSIONE SPAZIALE O(N) TRAMITE HASH GRID
        const cellSize = 320;
        const grid = new Map();

        for (let i = 0; i < nLen; i++) {
            const n = nodes[i];
            const cx = Math.floor(n.x / cellSize);
            const cy = Math.floor(n.y / cellSize);
            const key = `${cx},${cy}`;
            let cell = grid.get(key);
            if (!cell) {
                cell = [];
                grid.set(key, cell);
            }
            cell.push(n);
        }

        for (const [key, cellNodes] of grid.entries()) {
            const [cxStr, cyStr] = key.split(',');
            const cx = parseInt(cxStr, 10);
            const cy = parseInt(cyStr, 10);

            const cLen = cellNodes.length;
            for (let i = 0; i < cLen; i++) {
                const na = cellNodes[i];
                for (let j = i + 1; j < cLen; j++) {
                    const nb = cellNodes[j];
                    GraphCanvas._applyRepulsionPair(na, nb, p);
                }
            }

            const neighborKeys = [
                `${cx + 1},${cy}`,
                `${cx + 1},${cy + 1}`,
                `${cx},${cy + 1}`,
                `${cx - 1},${cy + 1}`
            ];

            for (let k = 0; k < neighborKeys.length; k++) {
                const neighborCell = grid.get(neighborKeys[k]);
                if (!neighborCell) continue;
                const nLenB = neighborCell.length;
                for (let i = 0; i < cLen; i++) {
                    const na = cellNodes[i];
                    for (let j = 0; j < nLenB; j++) {
                        const nb = neighborCell[j];
                        GraphCanvas._applyRepulsionPair(na, nb, p);
                    }
                }
            }
        }

        // 2. GRAVITÀ CENTRALE + FORZA DI GALLEGGIAMENTO PERIFERICA PER NODI ORFANI
        // Raggio minimo della zona protetta centrale (il cluster interconnesso vive qui)
        const coreClusterRadius = 180;

        for (let i = 0; i < nLen; i++) {
            const na = nodes[i];
            const isOrphan = (na.degree || 0) === 0;

            if (isOrphan) {
                const distFromCenter = Math.hypot(na.x, na.y) || 1;
                
                // Se un nodo orfano si trova all'interno del nucleo centrale, una spinta radiale lo espelle verso la corona esterna
                if (distFromCenter < coreClusterRadius) {
                    const pushFactor = (coreClusterRadius - distFromCenter) / coreClusterRadius;
                    const pushForce = pushFactor * 3.5 * p.alpha;
                    na.vx += (na.x / distFromCenter) * pushForce;
                    na.vy += (na.y / distFromCenter) * pushForce;
                } else {
                    // All'esterno del cluster, una gravità dolce impedisce che fugga verso l'infinito
                    na.vx -= na.x * (p.gravity * 0.8) * p.alpha;
                    na.vy -= na.y * (p.gravity * 0.8) * p.alpha;
                }
            } else {
                // I nodi collegati gravitano naturalmente verso il baricentro (0, 0)
                na.vx -= na.x * p.gravity * p.alpha;
                na.vy -= na.y * p.gravity * p.alpha;
            }
        }

        // 3. TENSIONE DELLE MOLLE ELASTICHE ADATTIVE
        const lLen = links.length;
        for (let i = 0; i < lLen; i++) {
            const link = links[i];
            const na = link.source;
            const nb = link.target;
            let dx = nb.x - na.x;
            let dy = nb.y - na.y;

            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
                dx = (Math.random() - 0.5) * 2;
                dy = (Math.random() - 0.5) * 2;
            }

            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            const degA = na.degree || 1;
            const degB = nb.degree || 1;
            let targetLength = p.springLengthNote || 85;
            let currentStrength = p.springStrength;

            if (link.type === 'hierarchy') {
                targetLength = p.springLengthRecord || 55;
                const maxHubDeg = Math.max(degA, degB);
                if (maxHubDeg > 3) {
                    targetLength += Math.min(35, (maxHubDeg - 3) * 2.8);
                }
            } else if (link.type === 'tag_link') {
                const tagNode = (na.type === 'tag') ? na : nb;
                const tagDegree = tagNode.degree || 1;

                // Modulazione elastica per i tag: vicini se hanno 1 sola nota, distesi se condivisi
                const tagElasticRatio = 0.52 + 0.48 * Math.min(1.0, (tagDegree - 1) / 3.0);
                targetLength = (p.springLengthTag || 145) * tagElasticRatio;
                currentStrength = p.springStrength * 0.9;
            } else {
                const combinedDeg = degA + degB;
                const noteElasticRatio = 0.85 + Math.min(0.35, combinedDeg * 0.035);
                targetLength = (p.springLengthNote || 85) * noteElasticRatio;
            }

            const delta = dist - targetLength;
            const force = delta * currentStrength * p.alpha;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            na.vx += fx;
            na.vy += fy;
            nb.vx -= fx;
            nb.vy -= fy;
        }

        // 4. INTEGRAZIONE DELLA VELOCITÀ CON FRIZIONE
        const maxVelocity = isWarmup ? 15 : 10;
        for (let i = 0; i < nLen; i++) {
            const n = nodes[i];
            if (n === GraphCanvas.draggedNode) {
                n.vx = 0;
                n.vy = 0;
                continue;
            }

            n.vx *= p.friction;
            n.vy *= p.friction;

            n.vx = Math.max(-maxVelocity, Math.min(maxVelocity, n.vx));
            n.vy = Math.max(-maxVelocity, Math.min(maxVelocity, n.vy));

            n.x += n.vx;
            n.y += n.vy;
        }
    },

    _applyRepulsionPair: (na, nb, p) => {
        let dx = nb.x - na.x;
        let dy = nb.y - na.y;

        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
            dx = (Math.random() - 0.5) * 4;
            dy = (Math.random() - 0.5) * 4;
        }

        const distSqRaw = dx * dx + dy * dy;
        if (distSqRaw >= 102400) return;

        const dist = Math.sqrt(distSqRaw) || 1;
        const hubBonus = 1.0 + Math.min(1.2, ((na.degree || 0) + (nb.degree || 0)) * 0.08);
        const force = (p.repulsion * hubBonus * p.alpha) / (distSqRaw + 350);

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        na.vx -= fx;
        na.vy -= fy;
        nb.vx += fx;
        nb.vy += fy;
    },

    getNodeEffectiveRadius: (node, zoom) => {
        const baseR = node.radius || 6;
        const curZoom = zoom || GraphCanvas.transform.zoom || 1.0;

        if (curZoom <= 1.0) {
            return baseR;
        } else {
            const targetScreenR = Math.min(22, baseR * Math.pow(curZoom, 0.35));
            return targetScreenR / curZoom;
        }
    },

    hasSpaceForLabel: (node, visibleNodes, curZoom, lines) => {
        const longestLineChars = Math.max(lines[0]?.length || 0, lines[1]?.length || 0);
        const labelWidthWorld = Math.max(30, longestLineChars * 6.5) / curZoom;
        const labelHeightWorld = (lines.length > 1 ? 26 : 14) / curZoom;

        const effR = GraphCanvas.getNodeEffectiveRadius(node, curZoom);
        const boxLeft = node.x - labelWidthWorld / 2;
        const boxRight = node.x + labelWidthWorld / 2;
        const boxTop = node.y + effR + (2 / curZoom);
        const boxBottom = boxTop + labelHeightWorld;

        for (let i = 0; i < visibleNodes.length; i++) {
            const other = visibleNodes[i];
            if (other === node) continue;

            const otherR = GraphCanvas.getNodeEffectiveRadius(other, curZoom);

            if (other.x + otherR >= boxLeft && other.x - otherR <= boxRight &&
                other.y + otherR >= boxTop && other.y - otherR <= boxBottom) {
                return false;
            }
        }
        return true;
    },

    formatTitleTwoLines: (rawTitle, maxChars = null) => {
        let str = (rawTitle || '').trim();
        if (maxChars && str.length > maxChars) {
            str = str.slice(0, maxChars).trim() + '…';
        }

        if (str.length <= 13 || !str.includes(' ')) {
            return [str];
        }

        const words = str.split(/\s+/);
        if (words.length <= 1) return [str];

        const targetHalf = str.length / 2;
        let bestIndex = 1;
        let currentLen = words[0].length;
        let minDiff = Math.abs(currentLen - targetHalf);

        for (let i = 1; i < words.length; i++) {
            currentLen += 1 + words[i].length;
            const diff = Math.abs(currentLen - targetHalf);
            if (diff < minDiff) {
                minDiff = diff;
                bestIndex = i + 1;
            }
        }

        const line1 = words.slice(0, bestIndex).join(' ');
        const line2 = words.slice(bestIndex).join(' ');

        if (!line2) return [line1];
        return [line1, line2];
    },

    render: () => {
        const ctx = GraphCanvas.ctx;
        const c = GraphCanvas.canvas;
        if (!ctx || !c || !c.parentElement) return;

        const dpr = window.devicePixelRatio || 1;
        const w = c.parentElement.clientWidth || window.innerWidth;
        const h = c.parentElement.clientHeight || (window.innerHeight - 52);

        const isDark = document.body.getAttribute('data-theme')?.includes('dark');
        const defaultLinkColor = isDark ? 'rgba(156, 163, 175, 0.28)' : 'rgba(107, 114, 128, 0.35)';
        const hierarchyLinkColor = isDark ? 'rgba(245, 158, 11, 0.45)' : 'rgba(217, 119, 6, 0.55)';
        const defaultTextColor = isDark ? '#f3f4f6' : '#111827';
        const dimmedTextColor = isDark ? 'rgba(156, 163, 175, 0.2)' : 'rgba(107, 114, 128, 0.22)';
        const haloColor = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)';

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        ctx.translate(GraphCanvas.transform.x, GraphCanvas.transform.y);
        ctx.scale(GraphCanvas.transform.zoom, GraphCanvas.transform.zoom);

        const activeSelected = GraphCanvas.selectedNode;
        const activeNeighbors = activeSelected ? GraphData.neighborsMap.get(activeSelected.id) : null;
        const activeHover = GraphCanvas.hoveredNode;
        const searchMatches = (typeof GraphUI !== 'undefined') ? GraphUI.activeSearchMatches : null;
        const curZoom = GraphCanvas.transform.zoom;

        const viewLeft = -GraphCanvas.transform.x / curZoom - 50;
        const viewTop = -GraphCanvas.transform.y / curZoom - 50;
        const viewRight = (w - GraphCanvas.transform.x) / curZoom + 50;
        const viewBottom = (h - GraphCanvas.transform.y) / curZoom + 50;

        // 1. Linee di Connessione con Frecce Direzionali
        const links = GraphCanvas.links;
        const lLen = links.length;

        for (let i = 0; i < lLen; i++) {
            const l = links[i];
            const isHierarchy = l.type === 'hierarchy';
            const isConnectedToSelected = activeSelected && (l.source === activeSelected || l.target === activeSelected);
            const isConnectedToHover = !activeSelected && activeHover && (l.source === activeHover || l.target === activeHover);
            const isDimmed = activeSelected && !isConnectedToSelected;

            const dx = l.target.x - l.source.x;
            const dy = l.target.y - l.source.y;
            const dist = Math.hypot(dx, dy) || 1;

            ctx.beginPath();
            ctx.moveTo(l.source.x, l.source.y);
            ctx.lineTo(l.target.x, l.target.y);

            let strokeColor = isHierarchy ? hierarchyLinkColor : defaultLinkColor;
            let strokeWidth = (isHierarchy ? 1.3 : 1.0) / curZoom;
            let alpha = isHierarchy ? 0.85 : 0.75;

            if (isConnectedToSelected || isConnectedToHover) {
                strokeColor = isHierarchy ? '#f59e0b' : '#2563eb';
                strokeWidth = 2.2 / curZoom;
                alpha = 1.0;
            } else if (isDimmed) {
                strokeColor = isHierarchy ? hierarchyLinkColor : defaultLinkColor;
                strokeWidth = 0.5 / curZoom;
                alpha = 0.08;
            }

            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeWidth;
            ctx.globalAlpha = alpha;

            if (l.type === 'tag_link') {
                ctx.setLineDash([3 / curZoom, 3 / curZoom]);
            } else {
                ctx.setLineDash([]);
            }

            ctx.stroke();

            const targetEffR = GraphCanvas.getNodeEffectiveRadius(l.target, curZoom);
            const arrowOffsetFromCenter = targetEffR + (3 / curZoom);

            if (dist > arrowOffsetFromCenter + (8 / curZoom)) {
                const tipX = l.target.x - (dx / dist) * arrowOffsetFromCenter;
                const tipY = l.target.y - (dy / dist) * arrowOffsetFromCenter;
                const angle = Math.atan2(dy, dx);

                const arrowLen = 5.5 / curZoom;
                const arrowWingAngle = Math.PI / 6;

                ctx.setLineDash([]);
                ctx.fillStyle = strokeColor;
                ctx.beginPath();
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(
                    tipX - arrowLen * Math.cos(angle - arrowWingAngle),
                    tipY - arrowLen * Math.sin(angle - arrowWingAngle)
                );
                ctx.lineTo(
                    tipX - (arrowLen * 0.7) * Math.cos(angle),
                    tipY - (arrowLen * 0.7) * Math.sin(angle)
                );
                ctx.lineTo(
                    tipX - arrowLen * Math.cos(angle + arrowWingAngle),
                    tipY - arrowLen * Math.sin(angle + arrowWingAngle)
                );
                ctx.closePath();
                ctx.fill();
            }
        }
        ctx.setLineDash([]);

        // 2. Cerchi dei Nodi
        const nodes = GraphCanvas.nodes;
        const nLen = nodes.length;
        const visibleNodes = [];

        for (let i = 0; i < nLen; i++) {
            const n = nodes[i];
            const effRadius = GraphCanvas.getNodeEffectiveRadius(n, curZoom);

            if (n.x + effRadius >= viewLeft && n.x - effRadius <= viewRight &&
                n.y + effRadius >= viewTop && n.y - effRadius <= viewBottom) {
                visibleNodes.push(n);
            }

            const isSelected = n === activeSelected;
            const isHover = n === activeHover;
            const isNeighbor = activeNeighbors && activeNeighbors.has(n.id);
            const isSearchMatch = searchMatches && searchMatches.has(n.id);

            const isDimmed = (activeSelected && !isSelected && !isNeighbor) || (searchMatches && !isSearchMatch);

            ctx.beginPath();
            ctx.arc(n.x, n.y, effRadius, 0, Math.PI * 2);

            ctx.fillStyle = n.color || '#2563eb';
            ctx.globalAlpha = isDimmed ? 0.15 : (isSelected || isNeighbor || isHover ? 1.0 : 0.88);

            ctx.fill();

            if (isSelected) {
                ctx.lineWidth = 3.0 / curZoom;
                ctx.strokeStyle = '#2563eb';
                ctx.stroke();
            } else if (isHover) {
                ctx.lineWidth = 2.2 / curZoom;
                ctx.strokeStyle = '#38bdf8';
                ctx.stroke();
            } else if (isSearchMatch) {
                ctx.lineWidth = 2.5 / curZoom;
                ctx.strokeStyle = '#eab308';
                ctx.stroke();
            }
        }

        // 3. Etichette di Testo
        ctx.lineJoin = 'round';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const isDoubleZoom = curZoom >= 1.40;

        for (let i = 0; i < visibleNodes.length; i++) {
            const n = visibleNodes[i];
            const isSelected = n === activeSelected;
            const isHover = n === activeHover;
            const isNeighbor = activeNeighbors && activeNeighbors.has(n.id);
            const isSearchMatch = searchMatches && searchMatches.has(n.id);
            const isDimmed = (activeSelected && !isSelected && !isNeighbor) || (searchMatches && !isSearchMatch);

            const isProminent = isSelected || isHover;
            const maxChars = (isDoubleZoom || isProminent) ? null : 20;
            const lines = GraphCanvas.formatTitleTwoLines(n.title, maxChars);

            const hasSpace = isProminent || isSearchMatch || GraphCanvas.hasSpaceForLabel(n, visibleNodes, curZoom, lines);

            if (hasSpace) {
                const targetPixelSize = isProminent ? 12 : 11;
                const fontVirtualSize = targetPixelSize / curZoom;

                ctx.font = `${isProminent ? 'bold ' : ''}${fontVirtualSize.toFixed(1)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

                const effRadius = GraphCanvas.getNodeEffectiveRadius(n, curZoom);
                const textY = n.y + effRadius + (4 / curZoom);
                const lineHeight = (targetPixelSize + 2) / curZoom;

                ctx.globalAlpha = isDimmed ? 0.2 : 1.0;
                ctx.lineWidth = 3.5 / curZoom;
                ctx.strokeStyle = haloColor;
                ctx.fillStyle = isProminent ? '#2563eb' : (isDimmed ? dimmedTextColor : defaultTextColor);

                for (let lIdx = 0; lIdx < lines.length; lIdx++) {
                    const lineY = textY + (lIdx * lineHeight);
                    ctx.strokeText(lines[lIdx], n.x, lineY);
                    ctx.fillText(lines[lIdx], n.x, lineY);
                }
            }
        }

        ctx.restore();
    },

    bindEvents: () => {
        const c = GraphCanvas.canvas;
        if (!c) return;

        c.addEventListener('mousedown', (e) => {
            GraphCanvas.dragDistance = 0;
            GraphCanvas.lastMouse.x = e.clientX;
            GraphCanvas.lastMouse.y = e.clientY;

            const mouse = GraphCanvas.getMouseWorldPos(e);
            const node = GraphCanvas.getNodeAt(mouse.x, mouse.y);

            if (node) {
                GraphCanvas.potentialDragNode = node;
                GraphCanvas.draggedNode = null;
            } else {
                GraphCanvas.potentialDragNode = null;
                GraphCanvas.isPanning = true;
                GraphCanvas.panStart.x = e.clientX - GraphCanvas.transform.x;
                GraphCanvas.panStart.y = e.clientY - GraphCanvas.transform.y;
                c.parentElement.classList.add('is-dragging');
            }
        });

        window.addEventListener('mousemove', (e) => {
            const dx = e.clientX - GraphCanvas.lastMouse.x;
            const dy = e.clientY - GraphCanvas.lastMouse.y;
            GraphCanvas.dragDistance += Math.hypot(dx, dy);

            GraphCanvas.lastMouse.x = e.clientX;
            GraphCanvas.lastMouse.y = e.clientY;

            if (GraphCanvas.potentialDragNode && !GraphCanvas.draggedNode && GraphCanvas.dragDistance > 4) {
                GraphCanvas.draggedNode = GraphCanvas.potentialDragNode;
                GraphCanvas.draggedNode.fx = GraphCanvas.draggedNode.x;
                GraphCanvas.draggedNode.fy = GraphCanvas.draggedNode.y;
                c.parentElement.classList.add('is-dragging');
                GraphCanvas.physics.alpha = 0.28;
                GraphCanvas.startLoop();
            }

            if (GraphCanvas.draggedNode) {
                const mouse = GraphCanvas.getMouseWorldPos(e);
                GraphCanvas.draggedNode.x = mouse.x;
                GraphCanvas.draggedNode.y = mouse.y;
                GraphCanvas.physics.alpha = Math.max(GraphCanvas.physics.alpha, 0.18);
                if (!GraphCanvas.animFrameId) GraphCanvas.startLoop();
            } else if (GraphCanvas.isPanning) {
                GraphCanvas.transform.x = e.clientX - GraphCanvas.panStart.x;
                GraphCanvas.transform.y = e.clientY - GraphCanvas.panStart.y;
                GraphCanvas.render();
            } else {
                const mouse = GraphCanvas.getMouseWorldPos(e);
                const hovered = GraphCanvas.getNodeAt(mouse.x, mouse.y);

                if (hovered !== GraphCanvas.hoveredNode) {
                    GraphCanvas.hoveredNode = hovered;
                    GraphCanvas.updateTooltip(hovered, e.clientX, e.clientY);
                    GraphCanvas.render();
                } else if (hovered) {
                    GraphCanvas.updateTooltip(hovered, e.clientX, e.clientY);
                }
            }
        });

        window.addEventListener('mouseup', () => {
            if (GraphCanvas.draggedNode) {
                if (GraphData && GraphData.persistentPositions) {
                    GraphData.persistentPositions.set(GraphCanvas.draggedNode.id, {
                        x: GraphCanvas.draggedNode.x,
                        y: GraphCanvas.draggedNode.y,
                        vx: 0,
                        vy: 0
                    });
                }

                GraphCanvas.draggedNode.fx = null;
                GraphCanvas.draggedNode.fy = null;
                GraphCanvas.draggedNode = null;
            }

            GraphCanvas.potentialDragNode = null;
            GraphCanvas.isPanning = false;
            c.parentElement.classList.remove('is-dragging');
        });

        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
            GraphCanvas.zoomAt(e.clientX, e.clientY, zoomFactor);
        }, { passive: false });

        c.addEventListener('click', (e) => {
            if (GraphCanvas.dragDistance > 5) return;

            const mouse = GraphCanvas.getMouseWorldPos(e);
            const node = GraphCanvas.getNodeAt(mouse.x, mouse.y);

            if (node) {
                if (GraphCanvas.selectedNode === node) {
                    GraphCanvas.selectedNode = null;
                } else {
                    GraphCanvas.selectedNode = node;
                }
            } else {
                GraphCanvas.selectedNode = null;
            }

            GraphCanvas.render();
        });

        c.addEventListener('dblclick', (e) => {
            const mouse = GraphCanvas.getMouseWorldPos(e);
            const node = GraphCanvas.getNodeAt(mouse.x, mouse.y);

            if (node) {
                if (node.type === 'note' || node.type === 'record_note') {
                    GraphApp.openNoteInOpener(node.id);
                } else if (node.type === 'tag') {
                    GraphApp.filterTagInOpener(node.title);
                }
            }
        });
    },

    getMouseWorldPos: (e) => {
        const rect = GraphCanvas.canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        const t = GraphCanvas.transform;

        return {
            x: (clientX - t.x) / t.zoom,
            y: (clientY - t.y) / t.zoom
        };
    },

    getNodeAt: (x, y) => {
        const nodes = GraphCanvas.nodes;
        const curZoom = GraphCanvas.transform.zoom || 1.0;

        for (let i = nodes.length - 1; i >= 0; i--) {
            const n = nodes[i];
            const effR = GraphCanvas.getNodeEffectiveRadius(n, curZoom);
            const hitRadius = effR + (4 / curZoom);
            const dx = x - n.x;
            const dy = y - n.y;

            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                return n;
            }
        }
        return null;
    },

    zoomAt: (clientX, clientY, factor) => {
        const rect = GraphCanvas.canvas.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;
        const t = GraphCanvas.transform;

        const oldZoom = t.zoom;
        const newZoom = Math.min(4.0, Math.max(0.02, oldZoom * factor));
        if (newZoom === oldZoom) return;

        t.x = mouseX - ((mouseX - t.x) / oldZoom) * newZoom;
        t.y = mouseY - ((mouseY - t.y) / oldZoom) * newZoom;
        t.zoom = newZoom;

        GraphCanvas.render();
    },

    fitToView: () => {
        const nodes = GraphCanvas.nodes;
        if (!nodes || nodes.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let sumX = 0, sumY = 0;

        nodes.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x > maxX) maxX = n.x;
            if (n.y > maxY) maxY = n.y;
            sumX += n.x;
            sumY += n.y;
        });

        const c = GraphCanvas.canvas;
        const rect = (c && c.parentElement) ? c.parentElement.getBoundingClientRect() : null;
        const cw = (rect && rect.width > 0) ? rect.width : window.innerWidth;
        const ch = (rect && rect.height > 0) ? rect.height : (window.innerHeight - 52);

        const padX = Math.max(50, cw * 0.06);
        const padY = Math.max(50, ch * 0.06);

        const w = (maxX - minX) + padX * 2 || 300;
        const h = (maxY - minY) + padY * 2 || 300;

        const scale = Math.min(cw / w, ch / h);

        // Scala fino a riempire confortevolmente lo schermo
        GraphCanvas.transform.zoom = Math.min(2.5, Math.max(0.05, scale));

        // Centro ponderato combinato
        const bboxCenterX = (minX + maxX) / 2;
        const bboxCenterY = (minY + maxY) / 2;
        const massCenterX = sumX / nodes.length;
        const massCenterY = sumY / nodes.length;

        const finalCenterX = (bboxCenterX * 0.65) + (massCenterX * 0.35);
        const finalCenterY = (bboxCenterY * 0.65) + (massCenterY * 0.35);

        GraphCanvas.transform.x = (cw / 2) - (finalCenterX * GraphCanvas.transform.zoom);
        GraphCanvas.transform.y = (ch / 2) - (finalCenterY * GraphCanvas.transform.zoom);

        GraphCanvas.render();
    },

    focusNode: (nodeId) => {
        let node = GraphCanvas.nodes.find(n => n.id === nodeId);
        if (!node && typeof GraphData !== 'undefined' && typeof GraphData.buildGraph === 'function') {
            GraphData.buildGraph();
            GraphCanvas.updateData(GraphData.nodes, GraphData.links, false);
            node = GraphCanvas.nodes.find(n => n.id === nodeId);
        }
        if (!node) return;

        const c = GraphCanvas.canvas;
        const rect = (c && c.parentElement) ? c.parentElement.getBoundingClientRect() : null;
        const cw = (rect && rect.width > 0) ? rect.width : window.innerWidth;
        const ch = (rect && rect.height > 0) ? rect.height : (window.innerHeight - 52);

        GraphCanvas.transform.zoom = 1.25;
        GraphCanvas.transform.x = (cw / 2) - (node.x * GraphCanvas.transform.zoom);
        GraphCanvas.transform.y = (ch / 2) - (node.y * GraphCanvas.transform.zoom);

        GraphCanvas.selectedNode = node;
        GraphCanvas.hoveredNode = node;
        GraphCanvas.render();
    },

    updateTooltip: (node, clientX, clientY) => {
        const tip = document.getElementById('graphTooltip');
        if (!tip) return;

        if (!node) {
            tip.style.display = 'none';
            return;
        }

        const deg = node.degree || 0;
        let extraInfo = '';
        if (node.folderName) extraInfo += ` &bull; Cartella: <b>${UI.escapeHTML(node.folderName)}</b>`;
        if (node.primaryTag) extraInfo += ` &bull; Tag: <b>#${UI.escapeHTML(node.primaryTag)}</b>`;

        let actionHint = 'Click: isola connessioni &bull; Doppio Click: apri nota';
        if (node.type === 'tag') {
            actionHint = 'Doppio Click: filtra note con questo tag';
        }

        tip.innerHTML = `
            <div style="font-weight:bold; font-size:0.85rem; margin-bottom:2px;">${UI.escapeHTML(node.title)}</div>
            <div style="color:rgba(255,255,255,0.7); font-size:0.75rem; margin-bottom:4px;">
                Tipo: <b>${node.type}</b> &bull; Connessioni: <b>${deg}</b>${extraInfo}
            </div>
            <div style="color:rgba(255,255,255,0.6); font-size:0.7rem; border-top:1px solid rgba(255,255,255,0.15); padding-top:3px;">
                ${actionHint}
            </div>
        `;

        tip.style.transform = clientY < 75 ? 'translate(-50%, 20px)' : 'translate(-50%, -130%)';
        tip.style.display = 'block';
        tip.style.left = `${clientX}px`;
        tip.style.top = `${clientY}px`;
    }
};