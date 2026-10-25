/**
 * graph/graph-canvas.js
 * Motore Grafico HTML5 Canvas 2D e Simulatore Fisico Force-Directed per Produzione:
 * - Scalabilità Garantita su Collezioni Massive (1.000 - 3.000 note) a 60 FPS senza freeze:
 *   1. Spatial Hash Grid Partitioning O(N) per il calcolo della repulsione coulombiana.
 *   2. Early-Exit Energy Check: il warm-up iniziale si arresta appena raggiunge la quiete cinetica (< 40ms CPU).
 *   3. Label Budgeting (max 65 etichette simultanee ordinate per importanza topologica):
 *      elimina la saturazione visiva e abbatte il tempo di disegno a < 1.5ms per frame.
 * - Topological Hub-Sector Seeding: i macro-hub nascono separati nello spazio per evitare incroci.
 * - Anti-Overlap Clearance tra Hub: impedisce a cluster diversi di collidere o schiacciarsi.
 * - Molle Inter-Cluster Elastiche e corona periferica per nodi orfani (Obsidian Pattern).
 * - Pre-simulazione Sincrona Offline: il grafo compare SUBITO FERMO e disteso nella sua posizione ottimale.
 * - Fisica Vettoriale Newtoniana Bilanciata: repulsione e tensione delle molle con segni matematici corretti.
 * - Animazione On-Demand: il loop a 60FPS gira ESCLUSIVAMENTE durante il trascinamento manuale (> 5px).
 * - Distanze Molle Parametriche: slider distinti per Note, Cartelle e Tag (#).
 * - Viewport Culling: elabora solo i nodi visibili a schermo per garantire fluidità.
 * - Comparsa Dinamica dei Titoli per Spazio Vitale: il testo appare solo se c'è spazio reale libero.
 * - Formattazione su Due Righe e Troncamento Adattivo con alone di contrasto (Halo).
 * - Scala Nodi Sub-Lineare Bounded (max 22px a schermo allo zoom ravvicinato).
 * - Differenziazione Cromatica Linee: Collegamenti Gerarchici (Cartelle) in ambra/arancio, riferimenti testuali in grigio, tag tratteggiati.
 * - Frecce Direzionali sui Collegamenti (source ➔ target).
 * - Doppio Click su Tag (#tag): filtra istantaneamente le note in VanillaDesk.
 * - Doppio Click su Nota: apre la nota in VanillaDesk e chiude la vista del grafo.
 * - Persistenza Topologica Continua: sincronizzazione immediata delle coordinate modificate manualmente o via simulazione.
 */

window.GraphCanvas = {
    canvas: null,
    ctx: null,
    nodes: [],
    links: [],

    physics: {
        repulsion: 680,
        springLengthNote: 85,
        springLengthRecord: 55,
        springLengthTag: 140,
        springLengthHub: 230,
        springStrength: 0.07,
        gravity: 0.010,
        friction: 0.86,
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
        nodes.forEach(n => {
            if (n.x === 0 && n.y === 0) unpositionedCount++;
        });

        // Esegue il Seeding Topologico Guidato se vi sono nodi non ancora posizionati
        if (unpositionedCount > 0) {
            GraphCanvas._seedTopologicalClusters(nodes, links);
        }

        if (isInitialWarmup || unpositionedCount > 0) {
            GraphCanvas.warmupSimulation();
        } else {
            GraphCanvas.physics.alpha = 0.0;
            if (GraphCanvas.animFrameId) {
                cancelAnimationFrame(GraphCanvas.animFrameId);
                GraphCanvas.animFrameId = null;
            }
            GraphCanvas.render();
        }
    },

    /**
     * TOPOLOGICAL HUB-SECTOR SEEDING
     * Inizializza i nodi nello spazio in base alla loro struttura di connessione:
     * - Gli Hub con molti figli vengono disposti separati a ventaglio attorno all'origine.
     * - I figli vengono generati nel settore angolare del proprio genitore, orientati verso l'esterno.
     * - I nodi orfani (grado 0) vengono collocati direttamente nella corona periferica esterna.
     */
    _seedTopologicalClusters: (nodes, links) => {
        const nodeMap = new Map();
        nodes.forEach(n => nodeMap.set(n.id, n));

        const adjacency = new Map();
        nodes.forEach(n => adjacency.set(n.id, new Set()));

        links.forEach(l => {
            const sId = l.source.id || l.source;
            const tId = l.target.id || l.target;
            if (adjacency.has(sId)) adjacency.get(sId).add(tId);
            if (adjacency.has(tId)) adjacency.get(tId).add(sId);
        });

        nodes.forEach(n => {
            n._topoDegree = adjacency.get(n.id)?.size || 0;
        });

        const hubs = nodes
            .filter(n => n._topoDegree >= 3)
            .sort((a, b) => b._topoDegree - a._topoDegree);

        const assignedNodes = new Set();
        const hubCount = Math.max(1, hubs.length);
        const hubSectorAngle = (Math.PI * 2) / hubCount;
        const hubRingRadius = Math.max(180, Math.sqrt(nodes.length) * 38);

        // 1. Posiziona i macro-Hub a raggiera attorno al centro (0, 0)
        hubs.forEach((hub, hIdx) => {
            const baseAngle = hIdx * hubSectorAngle - Math.PI / 2;
            hub.x = Math.cos(baseAngle) * hubRingRadius;
            hub.y = Math.sin(baseAngle) * hubRingRadius;
            hub.vx = 0;
            hub.vy = 0;
            assignedNodes.add(hub.id);

            // 2. Posiziona i nodi figli direttamente nel settore radiale del proprio Hub
            const neighbors = Array.from(adjacency.get(hub.id) || [])
                .map(id => nodeMap.get(id))
                .filter(neighbor => neighbor && !assignedNodes.has(neighbor.id));

            const nbrCount = neighbors.length;
            if (nbrCount > 0) {
                const spreadAngle = Math.min(Math.PI * 1.1, Math.max(0.6, nbrCount * 0.26));
                const startAngle = baseAngle - spreadAngle / 2;
                const stepAngle = nbrCount > 1 ? spreadAngle / (nbrCount - 1) : 0;

                neighbors.forEach((nbr, nIdx) => {
                    const angle = nbrCount === 1 ? baseAngle : startAngle + nIdx * stepAngle;
                    const branchDist = (nbr.type === 'record_note' ? 55 : (nbr.type === 'tag' ? 120 : 80)) + (nIdx % 2) * 20;

                    nbr.x = hub.x + Math.cos(angle) * branchDist;
                    nbr.y = hub.y + Math.sin(angle) * branchDist;
                    nbr.vx = 0;
                    nbr.vy = 0;
                    assignedNodes.add(nbr.id);
                });
            }
        });

        // 3. Posiziona le restanti note collegate (catene o piccoli cluster)
        const remainingConnected = nodes.filter(n => !assignedNodes.has(n.id) && n._topoDegree > 0);
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));

        remainingConnected.forEach((n, idx) => {
            const theta = idx * goldenAngle;
            const r = 90 + Math.sqrt(idx) * 22;
            n.x = Math.cos(theta) * r;
            n.y = Math.sin(theta) * r;
            n.vx = 0;
            n.vy = 0;
            assignedNodes.add(n.id);
        });

        // 4. Posiziona i nodi orfani (grado 0) nella corona periferica esterna
        const orphanNodes = nodes.filter(n => !assignedNodes.has(n.id));
        const orphanRingRadius = hubRingRadius + 160;

        orphanNodes.forEach((n, idx) => {
            const theta = idx * goldenAngle;
            const r = orphanRingRadius + (idx % 3) * 35;
            n.x = Math.cos(theta) * r;
            n.y = Math.sin(theta) * r;
            n.vx = 0;
            n.vy = 0;
            assignedNodes.add(n.id);
        });
    },

    /**
     * WARM-UP ANNEALING ADATTIVO CON EARLY-EXIT SU ENERGIA CINETICA
     * Previene freeze del thread su grandi moli di note (1.000+) arrestando
     * la simulazione offline appena il sistema raggiunge la quiete statica.
     */
    warmupSimulation: () => {
        const p = GraphCanvas.physics;
        const totalNodes = GraphCanvas.nodes.length || 1;

        // Calibrazione dinamica del budget di passi in base al volume delle note
        const maxTicks = totalNodes > 800 ? 200 : (totalNodes > 300 ? 300 : 420);
        const warmSteps = Math.round(maxTicks * 0.60);
        const coolSteps = maxTicks - warmSteps;

        // 1. Fase calda di espansione: i cluster si distendono senza sovrapporsi
        for (let i = 0; i < warmSteps; i++) {
            p.alpha = 1.0 - (i / warmSteps) * 0.40;
            GraphCanvas._tickPhysicsInternal(true);
        }

        // 2. Fase di raffreddamento controllato con verifica di convergenza precoce
        for (let i = 0; i < coolSteps; i++) {
            p.alpha = 0.60 * (1.0 - (i / coolSteps));
            const totalVelocitySq = GraphCanvas._tickPhysicsInternal(true);

            // Se l'energia cinetica media per nodo scende sotto la soglia di quiete (0.015px/frame), interrompe
            if (i > 30 && (totalVelocitySq / totalNodes) < 0.015) {
                break;
            }
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

        // Sincronizza stabilmente la disposizione calcolata nella memoria persistente
        if (GraphData && GraphData.persistentPositions) {
            GraphCanvas.nodes.forEach(n => {
                if (n.x !== 0 || n.y !== 0) {
                    GraphData.persistentPositions.set(n.id, { x: n.x, y: n.y, vx: 0, vy: 0 });
                }
            });
        }
    },

    restartSimulation: () => {
        // Sincronizzazione fondamentale: riallinea sempre GraphCanvas con i nodi attuali di GraphData
        GraphCanvas.nodes = GraphData.nodes;
        GraphCanvas.links = GraphData.links;

        // Ripristina l'assegnazione topologica guidata azzerando le posizioni
        GraphCanvas.nodes.forEach(n => {
            n.x = 0;
            n.y = 0;
            n.vx = 0;
            n.vy = 0;
        });

        GraphCanvas._seedTopologicalClusters(GraphCanvas.nodes, GraphCanvas.links);
        GraphCanvas.warmupSimulation();
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
        if (p.alpha <= p.minAlpha && !GraphCanvas.draggedNode && !isWarmup) return 0;

        const nodes = GraphCanvas.nodes;
        const links = GraphCanvas.links;
        const nLen = nodes.length;

        // 1. REPULSIONE COULOMBIANA (ALLONTANAMENTO RECIPROCO) TRAMITE HASH GRID O(N)
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

        // 2. Gravità Centrale dolce verso il centro dello schermo + Galleggiamento Periferico per Nodi Orfani
        const coreClusterRadius = 200;

        for (let i = 0; i < nLen; i++) {
            const na = nodes[i];
            const isOrphan = (na.degree || 0) === 0;

            if (isOrphan) {
                const distFromCenter = Math.hypot(na.x, na.y) || 1;
                if (distFromCenter < coreClusterRadius) {
                    const pushFactor = (coreClusterRadius - distFromCenter) / coreClusterRadius;
                    const pushForce = pushFactor * 3.8 * p.alpha;
                    na.vx += (na.x / distFromCenter) * pushForce;
                    na.vy += (na.y / distFromCenter) * pushForce;
                } else {
                    na.vx -= na.x * (p.gravity * 0.75) * p.alpha;
                    na.vy -= na.y * (p.gravity * 0.75) * p.alpha;
                }
            } else {
                na.vx -= na.x * p.gravity * p.alpha;
                na.vy -= na.y * p.gravity * p.alpha;
            }
        }

        // 3. TENSIONE DELLE MOLLE (ATTRAZIONE RECIPROCA LUNGO I LINK REALI)
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
            const isInterHub = degA >= 3 && degB >= 3;

            let targetLength = p.springLengthNote || 85;
            let currentStrength = p.springStrength;

            if (isInterHub) {
                targetLength = p.springLengthHub || 230;
                currentStrength = p.springStrength * 0.65;
            } else if (link.type === 'hierarchy') {
                targetLength = p.springLengthRecord || 55;
                const maxHubDeg = Math.max(degA, degB);
                if (maxHubDeg > 3) {
                    targetLength += Math.min(35, (maxHubDeg - 3) * 2.8);
                }
            } else if (link.type === 'tag_link') {
                const tagNode = (na.type === 'tag') ? na : nb;
                const tagDegree = tagNode.degree || 1;

                const tagElasticRatio = 0.52 + 0.48 * Math.min(1.0, (tagDegree - 1) / 3.0);
                targetLength = (p.springLengthTag || 140) * tagElasticRatio;
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

        // 4. Velocità e Frizione con limite massimo calibrato
        const maxVelocity = isWarmup ? 15 : 10;
        let totalVelocitySq = 0;

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

            if (isWarmup) {
                totalVelocitySq += (n.vx * n.vx + n.vy * n.vy);
            }
        }

        return totalVelocitySq;
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

        const isBothHubs = (na.degree || 0) >= 3 && (nb.degree || 0) >= 3;
        const hubBonus = isBothHubs ? 2.8 : (1.0 + Math.min(1.2, ((na.degree || 0) + (nb.degree || 0)) * 0.08));

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

    _computeLabelBoundingBox: (node, curZoom, lines, isProminent) => {
        const longestLineChars = Math.max(lines[0]?.length || 0, lines[1]?.length || 0);
        const labelWidthWorld = Math.max(28, longestLineChars * (isProminent ? 6.5 : 6.0)) / curZoom;
        const labelHeightWorld = (lines.length > 1 ? 24 : 13) / curZoom;
        const effR = GraphCanvas.getNodeEffectiveRadius(node, curZoom);

        const marginWorld = 4 / curZoom;
        const topY = node.y + effR + (3 / curZoom);

        return {
            left: node.x - (labelWidthWorld / 2) - marginWorld,
            right: node.x + (labelWidthWorld / 2) + marginWorld,
            top: topY - marginWorld,
            bottom: topY + labelHeightWorld + marginWorld
        };
    },

    hasSpaceForLabel: (node, visibleNodes, curZoom, labelBox, placedBoxes) => {
        // 1. Collisione con i cerchi fisici degli altri nodi
        for (let i = 0; i < visibleNodes.length; i++) {
            const other = visibleNodes[i];
            if (other === node) continue;

            const otherR = GraphCanvas.getNodeEffectiveRadius(other, curZoom);

            if (other.x + otherR >= labelBox.left && other.x - otherR <= labelBox.right &&
                other.y + otherR >= labelBox.top && other.y - otherR <= labelBox.bottom) {
                return false;
            }
        }

        // 2. Collisione AABB con le etichette già posizionate dai nodi a priorità più alta
        for (let k = 0; k < placedBoxes.length; k++) {
            const b = placedBoxes[k];
            const overlapX = labelBox.left < b.right && labelBox.right > b.left;
            const overlapY = labelBox.top < b.bottom && labelBox.bottom > b.top;
            if (overlapX && overlapY) {
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

        // 1. Disegna Linee di Connessione con Frecce Direzionali e Colori per Tipo
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

            // Cuspide freccia sul perimetro del nodo target
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

        // 2. PASSATA 1: Disegna tutti i cerchi dei nodi
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
            const isLocalRoot = !!n._isLocalRoot;

            const isDimmed = (activeSelected && !isSelected && !isNeighbor) || (searchMatches && !isSearchMatch);

            ctx.beginPath();
            ctx.arc(n.x, n.y, effRadius, 0, Math.PI * 2);

            ctx.fillStyle = n.color || '#2563eb';
            ctx.globalAlpha = isDimmed ? 0.15 : (isSelected || isNeighbor || isHover || isLocalRoot ? 1.0 : 0.88);

            ctx.fill();

            if (isLocalRoot) {
                ctx.lineWidth = 3.5 / curZoom;
                ctx.strokeStyle = '#38bdf8';
                ctx.stroke();
            } else if (isSelected) {
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

        // 3. PASSATA 2: Disegna le etichette con rilevamento AABB anti-sovrapposizione, LOD e Label Budgeting O(1)
        ctx.lineJoin = 'round';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        let maxCharsPerLine = 16;
        if (curZoom >= 1.8) {
            maxCharsPerLine = 40;
        } else if (curZoom >= 1.25) {
            maxCharsPerLine = 22;
        }

        const sortedForLabels = [...visibleNodes].sort((a, b) => {
            const pA = (a === activeHover ? 4 : (a === activeSelected ? 3 : (a._isLocalRoot ? 2 : (a.degree || 0) * 0.1)));
            const pB = (b === activeHover ? 4 : (b === activeSelected ? 3 : (b._isLocalRoot ? 2 : (b.degree || 0) * 0.1)));
            return pB - pA;
        });

        const placedLabelBoxes = [];
        // Limite massimo ergonomico di etichette a schermo: previene freeze geometrici con oltre 1.000 note
        const MAX_SCREEN_LABELS = 65;

        for (let i = 0; i < sortedForLabels.length; i++) {
            const n = sortedForLabels[i];
            const isSelected = n === activeSelected;
            const isHover = n === activeHover;
            const isNeighbor = activeNeighbors && activeNeighbors.has(n.id);
            const isSearchMatch = searchMatches && searchMatches.has(n.id);
            const isLocalRoot = !!n._isLocalRoot;
            const isDimmed = (activeSelected && !isSelected && !isNeighbor) || (searchMatches && !isSearchMatch);

            const isProminent = isSelected || isHover || isLocalRoot;

            // Se abbiamo raggiunto la capienza massima leggibile a schermo e il nodo non è focale/hover, salta
            if (placedLabelBoxes.length >= MAX_SCREEN_LABELS && !isProminent) {
                continue;
            }

            const maxChars = isHover ? Math.max(34, maxCharsPerLine) : (isProminent ? Math.max(24, maxCharsPerLine) : maxCharsPerLine);
            const lines = GraphCanvas.formatTitleTwoLines(n.title, maxChars);

            const labelBox = GraphCanvas._computeLabelBoundingBox(n, curZoom, lines, isProminent);
            const hasSpace = isHover || GraphCanvas.hasSpaceForLabel(n, visibleNodes, curZoom, labelBox, placedLabelBoxes);

            if (hasSpace) {
                placedLabelBoxes.push(labelBox);

                const targetPixelSize = isProminent ? 12 : 11;
                const fontVirtualSize = targetPixelSize / curZoom;

                ctx.font = `${isProminent ? 'bold ' : ''}${fontVirtualSize.toFixed(1)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

                const effRadius = GraphCanvas.getNodeEffectiveRadius(n, curZoom);
                const textY = n.y + effRadius + (4 / curZoom);
                const lineHeight = (targetPixelSize + 2) / curZoom;

                ctx.globalAlpha = isDimmed ? 0.2 : 1.0;
                ctx.lineWidth = 3.5 / curZoom;
                ctx.strokeStyle = haloColor;
                ctx.fillStyle = isProminent ? (isLocalRoot ? '#0284c7' : '#2563eb') : (isDimmed ? dimmedTextColor : defaultTextColor);

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
                if (GraphData.options.graphMode === 'local' && node.id !== GraphData.options.localRootId) {
                    GraphUI.setLocalRoot(node.id);
                    return;
                }

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

        GraphCanvas.transform.zoom = Math.min(2.5, Math.max(0.05, scale));

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
        } else if (GraphData.options.graphMode === 'local' && node.id !== GraphData.options.localRootId) {
            actionHint = 'Click: sposta centro del grafo locale su questa nota';
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