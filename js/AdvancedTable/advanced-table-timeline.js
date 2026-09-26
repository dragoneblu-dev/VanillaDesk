/**
 * AdvancedTableTimeline.js
 * Core Modulo Timeline: Gestione Math (Date->Pixel), Zoom, Menu e Navigazione Rapida Eventi.
 * FIX ZOOM: Abbassato il clamp minimo a 6px per consentire una visualizzazione trimestrale/annuale fluida.
 * FIX OGGI: Garantito lo scorrimento accurato della data corrente anche su scale temporali ampie.
 */

const AdvancedTimeline = {
    dragState: null,
    dragTooltip: null,
    panState: null,
    preservedCenterMs: undefined,
    linkDragState: null,

    // Cache dati per navigazione rapida e hover corsie
    _timelineData: {},
    _currentHoveredLane: {},

    _getPxFromDate: (targetMs, startDateMs, colWidth) => {
        const dTarget = new Date(targetMs);
        const dStart = new Date(startDateMs);
        const utcStart = Date.UTC(dStart.getFullYear(), dStart.getMonth(), dStart.getDate());
        const utcTarget = Date.UTC(dTarget.getFullYear(), dTarget.getMonth(), dTarget.getDate());
        const daysDiff = (utcTarget - utcStart) / 86400000;
        const fraction = (dTarget.getHours() + dTarget.getMinutes() / 60 + dTarget.getSeconds() / 3600) / 24;
        return (daysDiff + fraction) * colWidth;
    },

    _getDateFromPx: (px, startDateMs, colWidth) => {
        const dStart = new Date(startDateMs);
        const daysDiff = Math.floor(px / colWidth);
        const fraction = (px % colWidth) / colWidth;
        const target = new Date(dStart.getFullYear(), dStart.getMonth(), dStart.getDate() + daysDiff);
        const totalHours = fraction * 24;
        const hours = Math.floor(totalHours);
        const minutes = Math.round((totalHours - hours) * 60);
        target.setHours(hours, minutes, 0, 0);
        return target.getTime();
    },

    _snapDate: (dateMs, snapMs) => {
        const d = new Date(dateMs);
        if (snapMs >= 86400000) { 
            d.setHours(0, 0, 0, 0);
            if (d.getHours() === 23) {
                d.setHours(d.getHours() + 2);
                d.setHours(0, 0, 0, 0);
            }
            return d.getTime();
        }
        const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const msSinceStartOfDay = dateMs - startOfDay;
        const snappedMs = Math.round(msSinceStartOfDay / snapMs) * snapMs;
        return startOfDay + snappedMs;
    },

    _getDynamicSnapMs: (colWidth, colType) => {
        const dayMs = 24 * 60 * 60 * 1000;
        if (colType !== 'datetime') return dayMs; 
        if (colWidth >= 400) return 15 * 60 * 1000;        
        if (colWidth >= 200) return 30 * 60 * 1000;        
        if (colWidth >= 100) return 60 * 60 * 1000;        
        if (colWidth >= 80)  return 3 * 60 * 60 * 1000;    
        if (colWidth >= 50)  return 6 * 60 * 60 * 1000;    
        return 12 * 60 * 60 * 1000;                        
    },

    navigate: (tableId, direction) => {
        const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
        if (!scrollArea) return;
        const shiftAmount = scrollArea.clientWidth * 0.75 * direction;
        
        const state = AdvancedTable.getState(tableId);
        const colWidth = state.timelineZoom || 40;
        const startDateMs = Number(scrollArea.dataset.startDate);
        
        const targetScrollLeft = scrollArea.scrollLeft + shiftAmount;
        const centerPx = targetScrollLeft + (scrollArea.clientWidth / 2);
        AdvancedTimeline.preservedCenterMs = AdvancedTimeline._getDateFromPx(centerPx, startDateMs, colWidth);
        
        scrollArea.scrollBy({ left: shiftAmount, behavior: 'smooth' });
    },

    scrollToToday: (tableId) => {
        const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
        if (!scrollArea) return;
        const state = AdvancedTable.getState(tableId);
        const colWidth = state.timelineZoom || 40;
        const startDateMs = Number(scrollArea.dataset.startDate);
        const todayMs = new Date().setHours(12, 0, 0, 0); // Posiziona al centro della giornata odierna
        const targetPx = AdvancedTimeline._getPxFromDate(todayMs, startDateMs, colWidth);
        scrollArea.scrollTo({ left: Math.max(0, targetPx - (scrollArea.clientWidth / 2)), behavior: 'smooth' });
    },

    openZoomMenu: (e, tableId) => {
        e.stopPropagation();
        UI.Menu.closeAll(true);
        const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
        const viewWidth = scrollArea ? scrollArea.clientWidth : window.innerWidth * 0.8;
        
        const presetDay = Math.round(viewWidth / 1);
        const presetWeek = Math.round(viewWidth / 7);
        const presetMonth = Math.round(viewWidth / 30);
        const presetQuarter = Math.max(6, Math.round(viewWidth / 92)); // Calcolo reale per 3 mesi completi

        const menuItems =[
            { type: 'custom', html: '<div class="adv-dropdown-title" style="padding:0 4px; margin-bottom:4px;">Zoom Preimpostato:</div>' },
            { icon: Icons.time, label: 'Vista a 1 Giorno (24h)', onClick: () => AdvancedTimeline.setZoomExact(tableId, presetDay) },
            { icon: Icons.viewCalendar, label: 'Vista a 1 Settimana', onClick: () => AdvancedTimeline.setZoomExact(tableId, presetWeek) },
            { icon: Icons.viewTimeline, label: 'Vista a 1 Mese', onClick: () => AdvancedTimeline.setZoomExact(tableId, presetMonth) },
            { icon: Icons.viewBoard, label: 'Vista a 1 Trimestre', onClick: () => AdvancedTimeline.setZoomExact(tableId, presetQuarter) }
        ];

        UI.Menu.buildContextMenu(e.currentTarget.id, menuItems);
    },

    setZoomExact: (tableId, exactPx) => {
        let state = AdvancedTable.getState(tableId);
        const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
        
        if (scrollArea) {
            const colWidth = state.timelineZoom || 40;
            const startDateMs = Number(scrollArea.dataset.startDate);
            const centerPx = scrollArea.scrollLeft + (scrollArea.clientWidth / 2);
            AdvancedTimeline.preservedCenterMs = AdvancedTimeline._getDateFromPx(centerPx, startDateMs, colWidth);
        }

        let newZoom = exactPx;
        if (newZoom < 6) newZoom = 6; // Permette la visualizzazione completa di trimestri su qualsiasi display
        if (newZoom > 1200) newZoom = 1200;

        state.timelineZoom = newZoom;
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
    },

    changeZoom: (tableId, delta) => {
        const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
        let centerMs = null;
        let startDateMs = null;
        let state = AdvancedTable.getState(tableId);
        let currentZoom = state.timelineZoom || 40;

        if (scrollArea) {
            startDateMs = Number(scrollArea.dataset.startDate);
            const centerPx = scrollArea.scrollLeft + (scrollArea.clientWidth / 2);
            centerMs = AdvancedTimeline._getDateFromPx(centerPx, startDateMs, currentZoom);
        }

        let step = 10;
        if (currentZoom >= 100) step = 40;
        if (currentZoom >= 300) step = 100;
        if (currentZoom <= 20) step = 3;

        currentZoom += (delta > 0 ? step : -step);

        if (currentZoom < 6) currentZoom = 6;
        if (currentZoom > 1200) currentZoom = 1200;

        state.timelineZoom = currentZoom;
        AdvancedTable.setState(tableId, state);
        if (centerMs) AdvancedTimeline.preservedCenterMs = centerMs;
        AdvancedTable.renderTable(tableId);
    },

    openGroupMenu: (e, tableId) => {
        e.stopPropagation();
        const state = AdvancedTable.getState(tableId);
        const chk = '<span style="color:var(--accent-color); font-weight:bold; float:right; margin-left:10px;">✓</span>';

        const menuItems =[
            { type: 'custom', html: '<div class="adv-dropdown-title" style="padding:0 4px; margin-bottom:4px;">Raggruppa Timeline per:</div>' },
            { icon: Icons.viewList, label: 'Nessun Raggruppamento' + (!state.timelineGroupBy ? chk : ''), onClick: () => AdvancedTimeline.setGroupBy(tableId, null) },
            { type: 'divider' }
        ];

        const groupableCols = state.columns.filter(c => c.id === state.columns[0].id || c.type === 'select' || c.type === 'relation');
        if (groupableCols.length === 0) {
            menuItems.push({ type: 'custom', html: '<div style="font-size:0.75rem; color:var(--text-secondary); padding:4px;">Nessuna colonna adatta trovata.</div>' });
        } else {
            groupableCols.forEach(c => {
                const isActive = state.timelineGroupBy === c.id;
                let icon = c.type === 'select' ? Icons.select : Icons.relation;
                if (c.id === state.columns[0].id) icon = Icons.text;
                menuItems.push({ icon: icon, label: c.name + (isActive ? chk : ''), onClick: () => AdvancedTimeline.setGroupBy(tableId, c.id) });
            });
        }
        UI.Menu.buildContextMenu(e.currentTarget.id, menuItems);
    },

    setGroupBy: (tableId, colId) => {
        let state = AdvancedTable.getState(tableId);
        state.timelineGroupBy = colId;
        AdvancedTable.setState(tableId, state);
        Store.triggerAutoSave();
        UI.Menu.closeAll(true);
        AdvancedTable.renderTable(tableId);
    },

    // =========================================================================
    // MOTORE DI NAVIGAZIONE RAPIDA: FRECCE PER EVENTI FUORI VISTA
    // =========================================================================

    handleLaneHover: (e, tableId) => {
        if (AdvancedTimeline.dragState || AdvancedTimeline.panState || AdvancedTimeline.linkDragState) {
            AdvancedTimeline.hideLaneNav(tableId);
            return;
        }

        const data = AdvancedTimeline._timelineData[tableId];
        const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
        if (!data || !scrollArea) return;

        const rect = scrollArea.getBoundingClientRect();
        const relativeY = e.clientY - rect.top + scrollArea.scrollTop;

        // Se siamo nell'header temporale sticky (i primi 60px), nascondi le frecce
        if (relativeY < 60) {
            AdvancedTimeline.hideLaneNav(tableId);
            return;
        }

        const hoveredLane = Math.floor((relativeY - 60) / data.rowHeight);
        if (hoveredLane < 0 || hoveredLane >= data.totalLanes) {
            AdvancedTimeline.hideLaneNav(tableId);
            return;
        }

        AdvancedTimeline._currentHoveredLane[tableId] = hoveredLane;
        AdvancedTimeline.updateLaneNav(tableId);
    },

    updateLaneNav: (tableId) => {
        const data = AdvancedTimeline._timelineData[tableId];
        const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
        const prevBtn = document.getElementById(`timeline-nav-prev-${tableId}`);
        const nextBtn = document.getElementById(`timeline-nav-next-${tableId}`);

        if (!data || !scrollArea || !prevBtn || !nextBtn) return;

        const hoveredLane = AdvancedTimeline._currentHoveredLane[tableId];
        if (hoveredLane === undefined || hoveredLane === null || hoveredLane < 0) {
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
            return;
        }

        const laneTasks = data.scheduledRows.filter(r => r._lane === hoveredLane);
        if (laneTasks.length === 0) {
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
            return;
        }

        const viewLeft = scrollArea.scrollLeft;
        const viewRight = scrollArea.scrollLeft + scrollArea.clientWidth;

        let prevTask = null;
        let maxEndPx = -Infinity;

        let nextTask = null;
        let minStartPx = Infinity;

        for (const t of laneTasks) {
            const startPx = AdvancedTimeline._getPxFromDate(t._timeStart, data.startDateMs, data.colWidth);
            const endPx = t._timeStart === t._timeEnd ? startPx + 14 : AdvancedTimeline._getPxFromDate(t._timeEnd, data.startDateMs, data.colWidth);

            // Evento precedente non visibile (termina prima o a ridosso del margine sinistro)
            if (endPx <= viewLeft + 15) {
                if (endPx > maxEndPx) {
                    maxEndPx = endPx;
                    prevTask = t;
                }
            }

            // Evento successivo non visibile (inizia dopo o a ridosso del margine destro)
            if (startPx >= viewRight - 15) {
                if (startPx < minStartPx) {
                    minStartPx = startPx;
                    nextTask = t;
                }
            }
        }

        const btnY = 60 + (hoveredLane * data.rowHeight) + (data.rowHeight - 26) / 2;

        // Gestione Freccia Sinistra
        if (prevTask) {
            const titleCol = data.titleCol;
            let tName = prevTask.virtualCells[titleCol.id] || 'Senza Titolo';
            if (titleCol.type === 'record_note') {
                const noteObj = typeof Store !== 'undefined' ? Store.getNote(tName) : null;
                if (noteObj) tName = noteObj.title || 'Senza Titolo';
            }
            const dateFmt = AdvancedTimeline.formatTooltipDate(prevTask._timeStart, data.dateColType);

            prevBtn.style.display = 'flex';
            prevBtn.style.top = `${btnY}px`;
            prevBtn.style.left = `${viewLeft + 8}px`;
            prevBtn.title = `Precedente: ${tName} (${dateFmt})`;
            prevBtn.onclick = (ev) => {
                ev.stopPropagation();
                AdvancedTimeline.jumpToTask(tableId, prevTask.id);
            };
        } else {
            prevBtn.style.display = 'none';
        }

        // Gestione Freccia Destra
        if (nextTask) {
            const titleCol = data.titleCol;
            let tName = nextTask.virtualCells[titleCol.id] || 'Senza Titolo';
            if (titleCol.type === 'record_note') {
                const noteObj = typeof Store !== 'undefined' ? Store.getNote(tName) : null;
                if (noteObj) tName = noteObj.title || 'Senza Titolo';
            }
            const dateFmt = AdvancedTimeline.formatTooltipDate(nextTask._timeStart, data.dateColType);

            nextBtn.style.display = 'flex';
            nextBtn.style.top = `${btnY}px`;
            nextBtn.style.left = `${viewRight - 34}px`;
            nextBtn.title = `Successivo: ${tName} (${dateFmt})`;
            nextBtn.onclick = (ev) => {
                ev.stopPropagation();
                AdvancedTimeline.jumpToTask(tableId, nextTask.id);
            };
        } else {
            nextBtn.style.display = 'none';
        }
    },

    hideLaneNav: (tableId) => {
        AdvancedTimeline._currentHoveredLane[tableId] = null;
        const prevBtn = document.getElementById(`timeline-nav-prev-${tableId}`);
        const nextBtn = document.getElementById(`timeline-nav-next-${tableId}`);
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
    },

    jumpToTask: (tableId, taskId) => {
        const data = AdvancedTimeline._timelineData[tableId];
        const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
        if (!data || !scrollArea) return;

        const task = data.scheduledRows.find(r => r.id === taskId);
        if (!task) return;

        const startPx = AdvancedTimeline._getPxFromDate(task._timeStart, data.startDateMs, data.colWidth);
        const endPx = task._timeStart === task._timeEnd ? startPx + 14 : AdvancedTimeline._getPxFromDate(task._timeEnd, data.startDateMs, data.colWidth);
        const taskWidth = Math.max(14, endPx - startPx);

        // Centra l'evento nella visuale della timeline
        let targetScrollLeft = startPx - (scrollArea.clientWidth / 2) + (taskWidth / 2);
        if (targetScrollLeft < 0) targetScrollLeft = 0;

        scrollArea.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });

        setTimeout(() => {
            const bar = document.getElementById(`bar-${task.id}`);
            if (bar) {
                AdvancedTimeline._pulseBar(bar);
            }
            AdvancedTimeline.updateLaneNav(tableId);
        }, 350);
    },

    _pulseBar: (bar) => {
        bar.style.transition = 'box-shadow 0.3s ease, transform 0.3s ease';
        bar.style.boxShadow = '0 0 0 3px var(--bg-color), 0 0 0 6px var(--accent-color), 0 0 20px var(--accent-color)';
        bar.style.transform = 'scale(1.05)';
        bar.style.zIndex = '50';
        setTimeout(() => {
            bar.style.boxShadow = '';
            bar.style.transform = '';
            setTimeout(() => { 
                bar.style.transition = ''; 
                bar.style.zIndex = '';
            }, 300);
        }, 900);
    }
};