/**
 * workflow-canvas.js
 * Modulo Canvas per Workflow Studio:
 * - Navigazione, Pan e Zoom centrato sul puntatore.
 * - Rilevamento fotometrico del contrasto del canvas (isCanvasDark).
 * - Minimappa Radar interattiva con viewport rectangle e rendering colori dei blocchi.
 * - Smart Guides di allineamento magnetico con snap assistito.
 * - Esportazione Grafica Vettoriale Fedele 1:1 in SVG puro (Zero Tainted Canvas, Zero imperfezioni).
 */

Object.assign(WorkflowApp, {

    /**
     * Valuta la luminanza effettiva dello sfondo del canvas
     * per stabilire se si stia operando su tema/sfondo scuro o chiaro.
     */
    isCanvasDark: () => {
        let color = WorkflowApp.layout.backgroundColor;
        if (!color) {
            const vp = document.getElementById('canvasViewport');
            if (vp) {
                color = window.getComputedStyle(vp).backgroundColor;
            }
        }
        if (!color) {
            const theme = document.body.getAttribute('data-theme') || localStorage.getItem('theme') || 'light';
            return theme.includes('dark');
        }

        if (color.startsWith('#')) {
            let hex = color.replace('#', '').trim();
            if (hex.length === 3) {
                hex = hex.split('').map(c => c + c).join('');
            }
            if (hex.length === 6) {
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                return lum < 0.5;
            }
        }

        const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1], 10);
            const g = parseInt(rgbMatch[2], 10);
            const b = parseInt(rgbMatch[3], 10);
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return lum < 0.5;
        }

        const currentTheme = document.body.getAttribute('data-theme') || localStorage.getItem('theme') || 'light';
        return currentTheme.includes('dark');
    },

    zoomAtPoint: (clientX, clientY, factor) => {
        const vp = document.getElementById('canvasViewport');
        if (!vp) return;

        const rect = vp.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;

        const oldZoom = WorkflowApp.layout.zoom || 1;
        let newZoom = Math.min(2.5, Math.max(0.15, oldZoom * factor));
        newZoom = Math.round(newZoom * 100) / 100;

        if (newZoom === oldZoom) return;

        const panX = isFinite(WorkflowApp.layout.pan.x) ? WorkflowApp.layout.pan.x : 72;
        const panY = isFinite(WorkflowApp.layout.pan.y) ? WorkflowApp.layout.pan.y : 72;

        const newPanX = mouseX - ((mouseX - panX) / oldZoom) * newZoom;
        const newPanY = mouseY - ((mouseY - panY) / oldZoom) * newZoom;

        if (isFinite(newPanX) && isFinite(newPanY) && isFinite(newZoom)) {
            WorkflowApp.layout.zoom = newZoom;
            WorkflowApp.layout.pan.x = Math.round(newPanX);
            WorkflowApp.layout.pan.y = Math.round(newPanY);
            WorkflowApp.updateCanvasTransform();
        }
    },

    adjustZoom: (delta) => {
        const vp = document.getElementById('canvasViewport');
        const cx = vp ? (vp.clientWidth / 2) : (window.innerWidth / 2);
        const cy = vp ? (vp.clientHeight / 2) : (window.innerHeight / 2);
        const factor = delta > 0 ? 1.15 : 0.85;
        WorkflowApp.zoomAtPoint(cx, cy, factor);
    },

    resetZoom: () => {
        const vp = document.getElementById('canvasViewport');
        const cx = vp ? (vp.clientWidth / 2) : (window.innerWidth / 2);
        const cy = vp ? (vp.clientHeight / 2) : (window.innerHeight / 2);

        const oldZoom = WorkflowApp.layout.zoom || 1;
        const newZoom = 1.0;

        const panX = isFinite(WorkflowApp.layout.pan.x) ? WorkflowApp.layout.pan.x : 72;
        const panY = isFinite(WorkflowApp.layout.pan.y) ? WorkflowApp.layout.pan.y : 72;

        const newPanX = cx - ((cx - panX) / oldZoom) * newZoom;
        const newPanY = cy - ((cy - panY) / oldZoom) * newZoom;

        if (isFinite(newPanX) && isFinite(newPanY)) {
            WorkflowApp.layout.zoom = newZoom;
            WorkflowApp.layout.pan.x = Math.round(newPanX);
            WorkflowApp.layout.pan.y = Math.round(newPanY);
            WorkflowApp.updateCanvasTransform();
        }
    },

    updateCanvasTransform: () => {
        const plane = document.getElementById('canvasPlane');
        if (!plane) return;
        const px = isFinite(WorkflowApp.layout.pan.x) ? WorkflowApp.layout.pan.x : 72;
        const py = isFinite(WorkflowApp.layout.pan.y) ? WorkflowApp.layout.pan.y : 72;
        const pz = isFinite(WorkflowApp.layout.zoom) ? WorkflowApp.layout.zoom : 1;
        plane.style.transform = `translate(${px}px, ${py}px) scale(${pz})`;
        WorkflowApp.updateMinimap();
    },

    // =========================================================================
    // RADAR MINIMAP ENGINE
    // =========================================================================
    updateMinimap: () => {
        const svg = document.getElementById('minimapSvg');
        if (!svg) return;

        const nodeKeys = Object.keys(WorkflowApp.layout.nodes || {});
        if (nodeKeys.length === 0) {
            svg.innerHTML = '';
            WorkflowApp._minimapMeta = null;
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodeKeys.forEach(id => {
            const pos = WorkflowApp.layout.nodes[id];
            if (pos && isFinite(pos.x) && isFinite(pos.y)) {
                if (pos.x < minX) minX = pos.x;
                if (pos.y < minY) minY = pos.y;
                if (pos.x + 288 > maxX) maxX = pos.x + 288;
                if (pos.y + 120 > maxY) maxY = pos.y + 120;
            }
        });

        if (!isFinite(minX) || !isFinite(maxX)) {
            svg.innerHTML = '';
            WorkflowApp._minimapMeta = null;
            return;
        }

        const pad = 120;
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        const graphW = Math.max(300, maxX - minX);
        const graphH = Math.max(200, maxY - minY);

        const mw = 200;
        const mh = 130;
        const scale = Math.min(mw / graphW, mh / graphH);
        if (!isFinite(scale) || scale <= 0) return;

        const db = WorkflowApp.currentDbState;
        const renderCache = {};

        let nodesSvg = '';
        nodeKeys.forEach(id => {
            const pos = WorkflowApp.layout.nodes[id];
            if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) return;

            const nx = (pos.x - minX) * scale;
            const ny = (pos.y - minY) * scale;
            const isSel = WorkflowApp.selectedNodeIds.has(id);

            const row = db?.rows?.find(r => r.id === id);
            const colorStyles = row ? WorkflowApp.getComputedNodeStyles(row, db, renderCache) : null;

            let fillColor = WorkflowApp.layout.borderColor || 'var(--text-secondary)';
            let fillOpacity = 0.55;

            if (colorStyles && colorStyles.border) {
                fillColor = colorStyles.border;
                fillOpacity = 0.85;
            }

            if (isSel) {
                fillColor = 'var(--accent-color)';
                fillOpacity = 1.0;
            }

            const nw = Math.max(4, 288 * scale);
            const nh = Math.max(3, 70 * scale);

            nodesSvg += `<rect x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" width="${nw.toFixed(1)}" height="${nh.toFixed(1)}" rx="1.5" fill="${fillColor}" opacity="${fillOpacity}"/>`;
        });

        const vp = document.getElementById('canvasViewport');
        const curZoom = WorkflowApp.layout.zoom || 1;
        const curPan = WorkflowApp.layout.pan || { x: 0, y: 0 };

        const vpW = vp ? (vp.clientWidth || window.innerWidth) : window.innerWidth;
        const vpH = vp ? (vp.clientHeight || (window.innerHeight - 52)) : (window.innerHeight - 52);

        const vx = ((-curPan.x / curZoom - minX) * scale);
        const vy = ((-curPan.y / curZoom - minY) * scale);
        const vw = ((vpW / curZoom) * scale);
        const vh = ((vpH / curZoom) * scale);

        let viewRectSvg = '';
        if (isFinite(vx) && isFinite(vy) && isFinite(vw) && isFinite(vh)) {
            viewRectSvg = `<rect id="minimapViewRect" x="${vx.toFixed(1)}" y="${vy.toFixed(1)}" width="${Math.max(6, vw).toFixed(1)}" height="${Math.max(6, vh).toFixed(1)}" fill="rgba(37,99,235,0.18)" stroke="var(--accent-color)" stroke-width="1.5" rx="2" style="pointer-events:none;"/>`;
        }

        svg.innerHTML = nodesSvg + viewRectSvg;
        WorkflowApp._minimapMeta = { minX, minY, scale, mw, mh };
    },

    handleMinimapClick: (e) => {
        const meta = WorkflowApp._minimapMeta;
        if (!meta || !meta.scale || !isFinite(meta.scale) || meta.scale <= 0) return;

        const mEl = document.getElementById('workflowMinimap');
        if (!mEl) return;
        const rect = mEl.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const worldX = meta.minX + (clickX / meta.scale);
        const worldY = meta.minY + (clickY / meta.scale);

        const vp = document.getElementById('canvasViewport');
        const zoom = WorkflowApp.layout.zoom || 1;

        const vpWidth = vp ? (vp.clientWidth || window.innerWidth) : window.innerWidth;
        const vpHeight = vp ? (vp.clientHeight || (window.innerHeight - 52)) : (window.innerHeight - 52);

        const newPanX = Math.round((vpWidth / 2) - (worldX * zoom));
        const newPanY = Math.round((vpHeight / 2) - (worldY * zoom));

        if (isFinite(newPanX) && isFinite(newPanY)) {
            WorkflowApp.layout.pan.x = newPanX;
            WorkflowApp.layout.pan.y = newPanY;
            WorkflowApp.updateCanvasTransform();
        }
    },

    // =========================================================================
    // SMART GUIDES DI ALLINEAMENTO MAGNETICO
    // =========================================================================
    calculateSmartGuides: (masterId, targetX, targetY) => {
        const db = WorkflowApp.currentDbState;
        if (!db || !db.rows) return { snappedX: WorkflowApp.snapToGrid(targetX), snappedY: WorkflowApp.snapToGrid(targetY), guides: [] };

        const masterEl = document.getElementById(`wf_node_${masterId}`);
        const mW = 288;
        const mH = masterEl ? masterEl.offsetHeight : 80;

        const SNAP_THRESHOLD = 8;

        let snappedX = targetX;
        let snappedY = targetY;
        let matchedGuideX = null;
        let matchedGuideY = null;

        const guides = [];

        const otherNodes = [];
        db.rows.forEach(r => {
            if (!WorkflowApp.selectedNodeIds.has(r.id)) {
                const pos = WorkflowApp.layout.nodes[r.id];
                const el = document.getElementById(`wf_node_${r.id}`);
                if (pos && el) {
                    otherNodes.push({
                        id: r.id,
                        x: pos.x,
                        y: pos.y,
                        w: 288,
                        h: el.offsetHeight,
                        midX: pos.x + (288 / 2),
                        rightX: pos.x + 288,
                        midY: pos.y + (el.offsetHeight / 2),
                        bottomY: pos.y + el.offsetHeight
                    });
                }
            }
        });

        const masterMidX = targetX + (mW / 2);
        const masterRightX = targetX + mW;

        const masterMidY = targetY + (mH / 2);
        const masterBottomY = targetY + mH;

        let minDiffX = SNAP_THRESHOLD + 1;
        for (const other of otherNodes) {
            if (Math.abs(targetX - other.x) < minDiffX) {
                minDiffX = Math.abs(targetX - other.x);
                snappedX = other.x;
                matchedGuideX = { x: other.x, y1: Math.min(targetY, other.y) - 30, y2: Math.max(masterBottomY, other.bottomY) + 30 };
            }
            if (Math.abs(masterMidX - other.midX) < minDiffX) {
                minDiffX = Math.abs(masterMidX - other.midX);
                snappedX = other.midX - (mW / 2);
                matchedGuideX = { x: other.midX, y1: Math.min(targetY, other.y) - 30, y2: Math.max(masterBottomY, other.bottomY) + 30 };
            }
            if (Math.abs(masterRightX - other.rightX) < minDiffX) {
                minDiffX = Math.abs(masterRightX - other.rightX);
                snappedX = other.rightX - mW;
                matchedGuideX = { x: other.rightX, y1: Math.min(targetY, other.y) - 30, y2: Math.max(masterBottomY, other.bottomY) + 30 };
            }
        }

        let minDiffY = SNAP_THRESHOLD + 1;
        for (const other of otherNodes) {
            if (Math.abs(targetY - other.y) < minDiffY) {
                minDiffY = Math.abs(targetY - other.y);
                snappedY = other.y;
                matchedGuideY = { y: other.y, x1: Math.min(targetX, other.x) - 30, x2: Math.max(masterRightX, other.rightX) + 30 };
            }
            if (Math.abs(masterMidY - other.midY) < minDiffY) {
                minDiffY = Math.abs(masterMidY - other.midY);
                snappedY = other.midY - (mH / 2);
                matchedGuideY = { y: other.midY, x1: Math.min(targetX, other.x) - 30, x2: Math.max(masterRightX, other.rightX) + 30 };
            }
            if (Math.abs(masterBottomY - other.bottomY) < minDiffY) {
                minDiffY = Math.abs(masterBottomY - other.bottomY);
                snappedY = other.bottomY - mH;
                matchedGuideY = { y: other.bottomY, x1: Math.min(targetX, other.x) - 30, x2: Math.max(masterRightX, other.rightX) + 30 };
            }
        }

        if (matchedGuideX) guides.push(matchedGuideX);
        else snappedX = WorkflowApp.snapToGrid(snappedX);

        if (matchedGuideY) guides.push(matchedGuideY);
        else snappedY = WorkflowApp.snapToGrid(snappedY);

        return { snappedX, snappedY, guides };
    },

    drawSmartGuides: (guides) => {
        WorkflowApp.clearSmartGuides();
        const svg = document.getElementById('canvasSvgLayer');
        if (!svg || !guides || guides.length === 0) return;

        guides.forEach(g => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('class', 'wf-smart-guide');
            if (g.x !== undefined) {
                line.setAttribute('x1', g.x);
                line.setAttribute('y1', g.y1);
                line.setAttribute('x2', g.x);
                line.setAttribute('y2', g.y2);
            } else {
                line.setAttribute('x1', g.x1);
                line.setAttribute('y1', g.y);
                line.setAttribute('x2', g.x2);
                line.setAttribute('y2', g.y);
            }
            svg.appendChild(line);
        });
    },

    clearSmartGuides: () => {
        const svg = document.getElementById('canvasSvgLayer');
        if (svg) svg.querySelectorAll('.wf-smart-guide').forEach(l => l.remove());
    },

    // =========================================================================
    // CALCOLO BOUNDING BOX DEL GRAFO
    // =========================================================================
    _getGraphBounds: (padding = 60) => {
        const nodeKeys = Object.keys(WorkflowApp.layout.nodes || {});
        if (nodeKeys.length === 0) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const nodeW = 288;

        nodeKeys.forEach(id => {
            const pos = WorkflowApp.layout.nodes[id];
            const el = document.getElementById(`wf_node_${id}`);
            if (pos && isFinite(pos.x) && isFinite(pos.y)) {
                const h = el ? el.offsetHeight : 80;
                if (pos.x < minX) minX = pos.x;
                if (pos.y < minY) minY = pos.y;
                if (pos.x + nodeW > maxX) maxX = pos.x + nodeW;
                if (pos.y + h > maxY) maxY = pos.y + h;
            }
        });

        const clusterContainer = document.getElementById('canvasClustersContainer');
        if (clusterContainer) {
            clusterContainer.querySelectorAll('.wf-cluster-card').forEach(card => {
                const l = parseFloat(card.style.left) || 0;
                const t = parseFloat(card.style.top) || 0;
                const w = parseFloat(card.style.width) || 0;
                const h = parseFloat(card.style.height) || 0;
                if (l < minX) minX = l;
                if (t < minY) minY = t;
                if (l + w > maxX) maxX = l + w;
                if (t + h > maxY) maxY = t + h;
            });
        }

        if (!isFinite(minX) || !isFinite(maxX)) return null;

        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        return {
            minX,
            minY,
            maxX,
            maxY,
            width: Math.round(maxX - minX),
            height: Math.round(maxY - minY)
        };
    },

    // =========================================================================
    // ESPORTAZIONE VETTORIALE PURA (SVG) - FEDELE 1:1, ZERO CODICE SUPERFLUO
    // =========================================================================
    exportGraphToSVG: () => {
        const bounds = WorkflowApp._getGraphBounds(60);
        if (!bounds) {
            UI.showToast("Nessuna scheda presente sul canvas da esportare.", "warning");
            return;
        }

        const vp = document.getElementById('canvasViewport');
        const vpStyle = window.getComputedStyle(vp);
        const bg = WorkflowApp.layout.backgroundColor || vpStyle.backgroundColor || '#1e1e1e';

        // Estrazione delle connessioni SVG esistenti
        const svgLayer = document.getElementById('canvasSvgLayer');
        let pathsSvg = '';
        let defsSvg = '';
        if (svgLayer) {
            const defs = svgLayer.querySelector('defs');
            if (defs) defsSvg = defs.outerHTML;
            svgLayer.querySelectorAll('path.wf-connection-line').forEach(p => {
                const cloneP = p.cloneNode(true);
                cloneP.classList.remove('wf-path-highlighted');
                cloneP.setAttribute('marker-end', 'url(#wfArrow)');
                pathsSvg += cloneP.outerHTML + '\n';
            });
        }

        // Estrazione dei fogli di stile attivi dell'applicazione
        let cssRules = '';
        for (const sheet of document.styleSheets) {
            try {
                for (const rule of sheet.cssRules) cssRules += rule.cssText + '\n';
            } catch (e) {}
        }

        // Iniezione esplicita di tutte le variabili cromatiche :root
        const computedRoot = window.getComputedStyle(document.documentElement);
        let rootVars = ':root {\n';
        const varNames = [
            '--bg-color', '--sidebar-bg', '--editor-bg', '--text-primary', '--text-secondary', 
            '--border-color', '--accent-color', '--item-hover', '--item-active', '--danger-color',
            '--hl-c1', '--hl-c2', '--hl-c3', '--hl-c4', '--hl-c5', '--hl-c6', '--hl-c7', '--hl-c8', '--hl-c9', '--hl-c10',
            '--tx-c1', '--tx-c2', '--tx-c3', '--tx-c4', '--tx-c5', '--tx-c6', '--tx-c7', '--tx-c8', '--tx-c9', '--tx-c10'
        ];
        for (const v of varNames) {
            rootVars += `  ${v}: ${computedRoot.getPropertyValue(v)};\n`;
        }
        rootVars += '}\n';

        // Clonazione del DOM reale dei nodi escludendo gli stati temporanei di selezione
        const nodesContainer = document.getElementById('canvasNodesContainer');
        let nodesHTML = '';
        if (nodesContainer) {
            const cloneNodes = nodesContainer.cloneNode(true);
            cloneNodes.querySelectorAll('.wf-node').forEach(node => {
                node.classList.remove('selected', 'highlighted');
            });
            nodesHTML = cloneNodes.innerHTML;
        }

        const clustersContainer = document.getElementById('canvasClustersContainer');
        const clustersHTML = clustersContainer ? clustersContainer.innerHTML : '';

        const isDark = typeof WorkflowApp.isCanvasDark === 'function' ? WorkflowApp.isCanvasDark() : false;
        const themeAttr = document.body.getAttribute('data-theme') || (isDark ? 'dark' : 'light');

        const worldW = Math.round(bounds.maxX + 200);
        const worldH = Math.round(bounds.maxY + 200);

        const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">
    <defs>
        <style type="text/css"><![CDATA[
            ${rootVars}
            ${cssRules}
            .wf-port { display: none !important; }
            .wf-node { box-shadow: 0 4px 14px rgba(0,0,0,0.1) !important; }
        ]]></style>
        ${defsSvg}
    </defs>
    <rect width="100%" height="100%" fill="${bg}" />
    <g transform="translate(${-bounds.minX}, ${-bounds.minY})">
        <foreignObject x="0" y="0" width="${worldW}" height="${worldH}">
            <div xmlns="http://www.w3.org/1999/xhtml" data-theme="${themeAttr}" class="${isDark ? 'canvas-dark-theme' : 'canvas-light-theme'}" style="position:relative; width:${worldW}px; height:${worldH}px;">
                ${clustersHTML}
            </div>
        </foreignObject>
        <g class="wf-svg-connections">
            ${pathsSvg}
        </g>
        <foreignObject x="0" y="0" width="${worldW}" height="${worldH}">
            <div xmlns="http://www.w3.org/1999/xhtml" data-theme="${themeAttr}" class="${isDark ? 'canvas-dark-theme' : 'canvas-light-theme'}" style="position:relative; width:${worldW}px; height:${worldH}px;">
                ${nodesHTML}
            </div>
        </foreignObject>
    </g>
</svg>`;

        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = dlUrl;
        
        const dbTitle = (WorkflowApp.currentDbState?.title || 'workflow')
            .replace(/[^a-zA-Z0-9_\-]/g, '_')
            .toLowerCase();
        a.download = `${dbTitle}_workflow.svg`;
        
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(dlUrl);
        }, 300);

        UI.showToast("Grafico Vettoriale SVG esportato!", "success");
    }
});