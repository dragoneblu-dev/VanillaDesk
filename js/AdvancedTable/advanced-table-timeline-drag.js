/**
 * AdvancedTableTimeline-Drag.js
 * Modulo Timeline: Gestisce il Pan dello scroll, il Drag & Drop dei blocchi (Spostamento e Resize)
 * e la UI innovativa del "Drag To Connect" per le relazioni padre-figlio.
 * FIX NAVIGAZIONE: Spegnimento tempestivo delle frecce durante l'interazione drag/pan.
 */

Object.assign(AdvancedTimeline, {
    createTooltip: () => {
        let tooltip = document.getElementById('timeline-drag-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'timeline-drag-tooltip';
            tooltip.style.position = 'fixed';
            tooltip.style.background = 'var(--text-primary)';
            tooltip.style.color = 'var(--bg-color)';
            tooltip.style.padding = '4px 8px';
            tooltip.style.borderRadius = '4px';
            tooltip.style.fontSize = '0.75rem';
            tooltip.style.fontWeight = 'bold';
            tooltip.style.pointerEvents = 'none';
            tooltip.style.zIndex = '9999';
            tooltip.style.display = 'none';
            tooltip.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
            document.body.appendChild(tooltip);
        }
        return tooltip;
    },

    formatTooltipDate: (ms, type) => {
        const d = new Date(ms);
        if (type === 'datetime') {
            return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    },

    // --- PANNING (Scorrimento afferrando lo sfondo vuoto) ---
    startPan: (e) => {
        if (e.target.closest('.adv-timeline-bar, .timeline-link-handle, .adv-cal-event-abs, button, a')) return;
        const container = e.currentTarget;
        const tableId = container.id.replace('timeline-scroll-', '');
        AdvancedTimeline.hideLaneNav(tableId);

        AdvancedTimeline.panState = { el: container, startX: e.pageX, scrollLeft: container.scrollLeft };
        container.style.cursor = 'grabbing';
        document.addEventListener('mousemove', AdvancedTimeline.onPanMove);
        document.addEventListener('mouseup', AdvancedTimeline.onPanEnd);
        document.addEventListener('mouseleave', AdvancedTimeline.onPanEnd);
    },

    onPanMove: (e) => {
        if (!AdvancedTimeline.panState) return;
        e.preventDefault();
        const diff = e.pageX - AdvancedTimeline.panState.startX;
        AdvancedTimeline.panState.el.scrollLeft = AdvancedTimeline.panState.scrollLeft - diff;
    },

    onPanEnd: () => {
        if (!AdvancedTimeline.panState) return;
        AdvancedTimeline.panState.el.style.cursor = 'auto'; 
        AdvancedTimeline.panState = null;
        document.removeEventListener('mousemove', AdvancedTimeline.onPanMove);
        document.removeEventListener('mouseup', AdvancedTimeline.onPanEnd);
        document.removeEventListener('mouseleave', AdvancedTimeline.onPanEnd);
    },

    // --- CREAZIONE RECORD VUOTO (Doppio Click sullo sfondo) ---
    createRecord: (e, tableId, groupVal) => {
        if (!AppState.isEditMode) return;
        if (e.target.closest('.adv-timeline-bar')) return;

        const state = AdvancedTable.getState(tableId);
        const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
        if (!scrollArea) return;

        const centerPx = scrollArea.scrollLeft + (scrollArea.clientWidth / 2);
        AdvancedTimeline.preservedCenterMs = AdvancedTimeline._getDateFromPx(centerPx, Number(scrollArea.dataset.startDate), state.timelineZoom || 40);

        const colWidth = state.timelineZoom || 40;
        const startDateMs = Number(scrollArea.dataset.startDate);
        const rect = scrollArea.getBoundingClientRect();
        const clickX = e.clientX - rect.left + scrollArea.scrollLeft;
        
        const exactMs = AdvancedTimeline._getDateFromPx(clickX, startDateMs, colWidth);
        const dateCol = state.columns.find(c => c.id === state.timelineDateCol);
        
        const snapMs = AdvancedTimeline._getDynamicSnapMs(colWidth, dateCol ? dateCol.type : 'date');
        const snappedMs = AdvancedTimeline._snapDate(exactMs, snapMs);

        let groupColId = state.timelineGroupBy || null;
        if (groupVal === 'Senza Gruppo') groupVal = null;

        AdvancedTable.createRecordAtDate(tableId, snappedMs, state.timelineDateCol, groupColId, groupVal);
    },

    // --- DRAG DEI BLOCCHI O DELLE MANIGLIE (Spostamento/Resize nel tempo) ---
    startDrag: (e, tableId, rowId, action) => {
        if (!AppState.isEditMode) return;
        e.preventDefault();
        e.stopPropagation();

        AdvancedTimeline.hideLaneNav(tableId);

        const state = AdvancedTable.getState(tableId);
        const row = state.rows.find(r => r.id === rowId);
        const dateColId = state.timelineDateCol;
        const dateCol = state.columns.find(c => c.id === dateColId);

        let startStr = row.cells[dateColId] ? row.cells[dateColId].start || row.cells[dateColId] : null;
        let endStr = row.cells[dateColId] ? row.cells[dateColId].end : null;
        
        if(startStr && startStr.length === 10) startStr += 'T00:00:00';
        if(endStr && endStr.length === 10) endStr += 'T00:00:00';

        if (!endStr && startStr) {
            const d = new Date(startStr);
            d.setDate(d.getDate() + 1);
            endStr = d.toISOString();
        }

        const timelineScroll = document.getElementById(`timeline-scroll-${tableId}`);
        const timelineStartMs = Number(timelineScroll.dataset.startDate);
        const colWidth = state.timelineZoom || 40;

        AdvancedTimeline.dragState = {
            tableId: tableId,
            rowId: rowId,
            action: action,
            colType: dateCol.type,
            startX: e.pageX,
            colWidth: colWidth,
            timelineStartMs: timelineStartMs,
            originalStartPx: AdvancedTimeline._getPxFromDate(new Date(startStr).getTime(), timelineStartMs, colWidth),
            originalEndPx: AdvancedTimeline._getPxFromDate(new Date(endStr).getTime(), timelineStartMs, colWidth),
            el: e.currentTarget.closest('.adv-timeline-bar'),
            hasMoved: false
        };

        AdvancedTimeline.dragTooltip = AdvancedTimeline.createTooltip();
        document.addEventListener('mousemove', AdvancedTimeline.onDragMove);
        document.addEventListener('mouseup', AdvancedTimeline.onDragEnd);
    },

    onDragMove: (e) => {
        if (!AdvancedTimeline.dragState) return;
        const ds = AdvancedTimeline.dragState;

        const deltaPx = e.pageX - ds.startX;
        if (Math.abs(deltaPx) > 3) ds.hasMoved = true;

        let newStartPx = ds.originalStartPx;
        let newEndPx = ds.originalEndPx;

        if (ds.action === 'move') {
            newStartPx += deltaPx;
            newEndPx += deltaPx;
        } else if (ds.action === 'start') {
            newStartPx += deltaPx;
            if (newStartPx >= newEndPx) newStartPx = newEndPx - 5;
        } else if (ds.action === 'end') {
            newEndPx += deltaPx;
            if (newEndPx <= newStartPx) newEndPx = newStartPx + 5;
        }

        const exactStartMs = AdvancedTimeline._getDateFromPx(newStartPx, ds.timelineStartMs, ds.colWidth);
        const exactEndMs = AdvancedTimeline._getDateFromPx(newEndPx, ds.timelineStartMs, ds.colWidth);
        const snapMs = AdvancedTimeline._getDynamicSnapMs(ds.colWidth, ds.colType);
        const snappedStartMs = AdvancedTimeline._snapDate(exactStartMs, snapMs);
        const snappedEndMs = AdvancedTimeline._snapDate(exactEndMs, snapMs);

        if (AdvancedTimeline.dragTooltip) {
            AdvancedTimeline.dragTooltip.style.display = 'block';
            AdvancedTimeline.dragTooltip.style.left = (e.pageX + 15) + 'px';
            AdvancedTimeline.dragTooltip.style.top = (e.pageY - 25) + 'px';

            let tipText = '';
            if (ds.action === 'move') tipText = `Sposta: ${AdvancedTimeline.formatTooltipDate(snappedStartMs, ds.colType)}`;
            else if (ds.action === 'start') tipText = `Inizio: ${AdvancedTimeline.formatTooltipDate(snappedStartMs, ds.colType)}`;
            else if (ds.action === 'end') tipText = `Fine: ${AdvancedTimeline.formatTooltipDate(snappedEndMs, ds.colType)}`;

            AdvancedTimeline.dragTooltip.innerText = tipText;
        }

        const finalStartPx = AdvancedTimeline._getPxFromDate(snappedStartMs, ds.timelineStartMs, ds.colWidth);
        const finalEndPx = AdvancedTimeline._getPxFromDate(snappedEndMs, ds.timelineStartMs, ds.colWidth);
        
        let widthPx = finalEndPx - finalStartPx;
        if (widthPx < 4) widthPx = 4;

        if (snappedStartMs === snappedEndMs) {
            widthPx = 14; 
            ds.el.style.left = (finalStartPx - 7) + 'px';
        } else {
            ds.el.style.left = finalStartPx + 'px';
        }
        
        ds.el.style.width = widthPx + 'px';
        ds.el.style.opacity = '0.7';

        // Nasconde il livello SVG e i Link Handle durante il drag per performance
        const svgLayer = document.getElementById(`timeline-svg-${ds.tableId}`);
        if (svgLayer) svgLayer.style.display = 'none';
        const handles = document.querySelectorAll('.timeline-link-handle');
        handles.forEach(h => h.style.display = 'none');
    },

    onDragEnd: (e) => {
        document.removeEventListener('mousemove', AdvancedTimeline.onDragMove);
        document.removeEventListener('mouseup', AdvancedTimeline.onDragEnd);

        if (AdvancedTimeline.dragTooltip) AdvancedTimeline.dragTooltip.style.display = 'none';
        if (!AdvancedTimeline.dragState) return;
        const ds = AdvancedTimeline.dragState;

        // Se l'utente non ha spostato l'elemento non facciamo nulla (era solo un click)
        if (!ds.hasMoved) {
            ds.el.style.opacity = '1';
            AdvancedTimeline.dragState = null;
            return;
        }

        const deltaPx = e.pageX - ds.startX;
        let newStartPx = ds.originalStartPx;
        let newEndPx = ds.originalEndPx;

        if (ds.action === 'move') {
            newStartPx += deltaPx; newEndPx += deltaPx;
        } else if (ds.action === 'start') {
            newStartPx += deltaPx; if (newStartPx >= newEndPx) newStartPx = newEndPx - 5;
        } else if (ds.action === 'end') {
            newEndPx += deltaPx; if (newEndPx <= newStartPx) newEndPx = newStartPx + 5;
        }

        const exactStartMs = AdvancedTimeline._getDateFromPx(newStartPx, ds.timelineStartMs, ds.colWidth);
        const exactEndMs = AdvancedTimeline._getDateFromPx(newEndPx, ds.timelineStartMs, ds.colWidth);
        const snapMs = AdvancedTimeline._getDynamicSnapMs(ds.colWidth, ds.colType);
        const newStartMs = AdvancedTimeline._snapDate(exactStartMs, snapMs);
        const newEndMs = AdvancedTimeline._snapDate(exactEndMs, snapMs);

        AdvancedTimeline.dragState = null;

        const dStart = new Date(newStartMs);
        const dEnd = new Date(newEndMs);
        const offset = dStart.getTimezoneOffset() * 60000;
        const startLocalISO = new Date(dStart.getTime() - offset).toISOString().slice(0, 16);
        const endLocalISO = new Date(dEnd.getTime() - offset).toISOString().slice(0, 16);

        const formatDate = (isoFull, type) => { if (type === 'datetime') return isoFull; return isoFull.split('T')[0]; };

        const state = AdvancedTable.getState(ds.tableId);
        const row = state.rows.find(r => r.id === ds.rowId);

        if (!row.cells[state.timelineDateCol] || typeof row.cells[state.timelineDateCol] !== 'object') {
            row.cells[state.timelineDateCol] = { start: '', end: '' };
        }

        row.cells[state.timelineDateCol].start = formatDate(startLocalISO, ds.colType);
        row.cells[state.timelineDateCol].end = formatDate(endLocalISO, ds.colType);
        row.updatedAt = Date.now();

        const scrollArea = document.getElementById(`timeline-scroll-${ds.tableId}`);
        if(scrollArea) {
            const centerPx = scrollArea.scrollLeft + (scrollArea.clientWidth / 2);
            AdvancedTimeline.preservedCenterMs = AdvancedTimeline._getDateFromPx(centerPx, ds.timelineStartMs, ds.colWidth);
        }

        AdvancedTable.setState(ds.tableId, state);
        Store.triggerAutoSave();
        AdvancedTable.renderTable(ds.tableId);
    },

    // --- DRAG TO CONNECT (Disegno della linea di dipendenza) ---
    startLinkDrag: (e, tableId, sourceRowId) => {
        if (!AppState.isEditMode) return;
        e.preventDefault();
        e.stopPropagation();

        AdvancedTimeline.hideLaneNav(tableId);

        let svgLayer = document.getElementById(`timeline-svg-${tableId}`);
        
        // Se il livello SVG non esiste (perché non ci sono ancora dipendenze), creiamolo al volo
        if (!svgLayer) {
            const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
            if(!scrollArea) return;
            
            // Trova il div interno che contiene le grid line
            const innerDiv = scrollArea.children[0]; 
            const newSvgHtml = `
                <svg id="timeline-svg-${tableId}" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:4;">
                    <defs>
                        <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                            <polygon points="0 0, 6 3, 0 6" fill="var(--text-secondary)" opacity="0.8" />
                        </marker>
                    </defs>
                </svg>
            `;
            innerDiv.insertAdjacentHTML('beforeend', newSvgHtml);
            svgLayer = document.getElementById(`timeline-svg-${tableId}`);
        }

        const rect = svgLayer.getBoundingClientRect();
        const handleRect = e.currentTarget.getBoundingClientRect();
        
        const startX = handleRect.left - rect.left;
        const startY = handleRect.top + (handleRect.height / 2) - rect.top;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.id = 'temp-link-drag';
        path.setAttribute('stroke', 'var(--accent-color)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '4');
        path.setAttribute('fill', 'none');
        path.setAttribute('marker-end', 'url(#arrowhead)');
        svgLayer.appendChild(path);

        AdvancedTimeline.linkDragState = {
            tableId,
            sourceRowId,
            svgRect: rect,
            startX,
            startY,
            path
        };

        document.addEventListener('mousemove', AdvancedTimeline.onLinkDragMove);
        document.addEventListener('mouseup', AdvancedTimeline.onLinkDragEnd);
    },

    onLinkDragMove: (e) => {
        const state = AdvancedTimeline.linkDragState;
        if (!state) return;
        
        const x2 = e.clientX - state.svgRect.left;
        const y2 = e.clientY - state.svgRect.top;
        
        // Curva elastica di interazione morbida
        const d = `M ${state.startX} ${state.startY} C ${state.startX + 60} ${state.startY}, ${x2 - 60} ${y2}, ${x2} ${y2}`;
        state.path.setAttribute('d', d);
    },

    onLinkDragEnd: (e) => {
        document.removeEventListener('mousemove', AdvancedTimeline.onLinkDragMove);
        document.removeEventListener('mouseup', AdvancedTimeline.onLinkDragEnd);
        
        const state = AdvancedTimeline.linkDragState;
        if (!state) return;
        
        if (state.path) state.path.remove();
        AdvancedTimeline.linkDragState = null;
        
        // Nascondiamo i tooltip per non interferire con il detection del mouse
        const tooltip = document.getElementById('advCustomTooltip');
        if (tooltip) tooltip.style.display = 'none';

        const targetEl = document.elementFromPoint(e.clientX, e.clientY);
        if (tooltip) tooltip.style.display = '';

        const bar = targetEl ? targetEl.closest('.adv-timeline-bar') : null;
        
        if (bar) {
            const targetRowId = bar.getAttribute('data-row-id');
            if (targetRowId && targetRowId !== state.sourceRowId) {
                AdvancedTimeline.createDependency(state.tableId, state.sourceRowId, targetRowId);
            }
        }
    },

    createDependency: (tableId, sourceRowId, targetRowId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        const dbState = AdvancedTable.getState(realTableId);
        
        const relationCols = dbState.columns.filter(c => c.type === 'relation' && c.targetTableId === realTableId);
        if (relationCols.length === 0) {
            alert("Non esiste una colonna 'Relazione' che punti a questo stesso database.\nPer collegare due attività tra loro, crea prima una colonna Relazione dalle Opzioni del DB e falla puntare a se stesso.");
            return;
        }
        
        const relColId = relationCols[0].id;
        const targetRow = dbState.rows.find(r => r.id === targetRowId);
        
        if (targetRow) {
            let currentVals = targetRow.cells[relColId];
            if (!Array.isArray(currentVals)) currentVals = currentVals ? [currentVals] : [];
            
            if (!currentVals.includes(sourceRowId)) {
                if (AdvancedTable.checkCircularRelation(realTableId, targetRowId, realTableId, sourceRowId)) {
                    alert("Impossibile creare il collegamento: Paradosso Temporale Rilevato (Riferimento Circolare).");
                    return;
                }
                
                if (relationCols[0].singleRecord) currentVals = [sourceRowId];
                else currentVals.push(sourceRowId);
                
                AdvancedTable.updateData(tableId, targetRowId, relColId, currentVals);
            }
        }
    }
});