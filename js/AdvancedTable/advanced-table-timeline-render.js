/**
 * AdvancedTableTimeline-Render.js
 * Motore Grafico HTML/SVG per la Timeline.
 * FIX DATE SINGOLE: I record con sola data di fine (o inizio) vengono inclusi come Milestone (start = end).
 * FIX CALENDARIO DINAMICO: Inclusione garantita della data odierna (Oggi) e finestra minima di 120 giorni per la vista Trimestre.
 * FIX HEADER TRIMESTRE: Salto dinamico delle etichette dei giorni con zoom compresso (<22px) per evitare sovrapposizioni.
 * FIX RIGHE PHANTOM: Le righe della griglia coincidono esattamente con le corsie necessarie, senza corsie vuote residue.
 */

Object.assign(AdvancedTimeline, {
    
    _drawRoundedOrthogonalPath: (x1, y1, x2, y2, isConflict) => {
        const r = 6; 
        const exitOffset = 16;
        const entryOffset = 16;
        const gutterOffset = 18; 
        
        let points = [];
        points.push({x: x1, y: y1});
        
        if (y1 === y2) {
            points.push({x: x2 - 2, y: y2});
        } else if (!isConflict && (x1 + exitOffset) <= (x2 - entryOffset)) {
            let midX = x1 + (x2 - x1) / 2;
            points.push({x: midX, y: y1});
            points.push({x: midX, y: y2});
            points.push({x: x2 - 2, y: y2});
        } else {
            let gutterY = y1 < y2 ? y1 + gutterOffset : y1 - gutterOffset;
            let backX = x2 - entryOffset;
            points.push({x: x1 + exitOffset, y: y1});
            points.push({x: x1 + exitOffset, y: gutterY});
            points.push({x: backX, y: gutterY});
            points.push({x: backX, y: y2});
            points.push({x: x2 - 2, y: y2});
        }
        
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];

            const dir1 = { x: Math.sign(curr.x - prev.x), y: Math.sign(curr.y - prev.y) };
            const dir2 = { x: Math.sign(next.x - curr.x), y: Math.sign(next.y - curr.y) };

            const len1 = Math.abs(curr.x - prev.x) || Math.abs(curr.y - prev.y);
            const len2 = Math.abs(next.x - curr.x) || Math.abs(next.y - curr.y);
            const actualR = Math.min(r, len1 / 2, len2 / 2);

            const pStart = { x: curr.x - dir1.x * actualR, y: curr.y - dir1.y * actualR };
            const pEnd = { x: curr.x + dir2.x * actualR, y: curr.y + dir2.y * actualR };

            d += ` L ${pStart.x} ${pStart.y} Q ${curr.x} ${curr.y} ${pEnd.x} ${pEnd.y}`;
        }
        const last = points[points.length - 1];
        d += ` L ${last.x} ${last.y}`;
        
        return d;
    },

    render: (tableId, wrapper, state) => {
        const dateColId = state.timelineDateCol;
        const dateCol = state.columns.find(c => c.id === dateColId);

        if (!dateCol || !['date', 'datetime'].includes(dateCol.type) || !dateCol.hasEndDate) {
            state.viewType = 'table';
            AdvancedTable.setState(tableId, state);
            return AdvancedTable._renderAsTable(wrapper, state, tableId);
        }

        const isCited = tableId.includes('_cited_');
        const isEdit = AppState.isEditMode && !isCited;

        let bodyContainer = wrapper.querySelector('.widget-body');
        if (!bodyContainer) {
            wrapper.innerHTML = `
                <div class="widget-header adv-table-header">
                    <span class="widget-drag-handle adv-drag-handle" title="Trascina per spostare" draggable="true" style="${isEdit ? 'display:flex;' : 'display:none;'}">${Icons.dragHandle}</span>
                    <span class="widget-options-btn adv-drag-handle" title="Opzioni" style="${isEdit ? 'display:flex;' : 'display:none;'}">${Icons.dotsVertical}</span>
                    <span class="widget-icon" style="display:inline-flex;"></span>
                    <span class="widget-title adv-table-title" contenteditable="${isEdit ? 'true' : 'false'}" style="flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 50px;">Caricamento...</span>
                    <div class="widget-tools adv-tools" style="flex-shrink: 0;"></div>
                </div>
                <div class="widget-body"></div>
            `;
            bodyContainer = wrapper.querySelector('.widget-body');
        }

        const hasFilter = state.filters && Object.keys(state.filters).some(k => state.filters[k].trim() !== '');
        const hasSort = state.sorts && state.sorts.length > 0;
        let hasActiveAuto = state.automations && state.automations.some(a => a.active);
        const isGrouped = state.timelineGroupBy ? true : false;

        if (typeof WidgetManager !== 'undefined') {
            const tools =[];
            tools.push({ id: `adv-view-btn-${tableId}`, icon: Icons.viewTimeline, label: 'Timeline', onClick: AdvancedBoard.openViewMenu });
            tools.push({ id: `adv-timeline-group-btn-${tableId}`, icon: Icons.group, label: 'Raggruppa', active: isGrouped, onClick: AdvancedTimeline.openGroupMenu });
            if (!state.isLinkedView) {
                tools.push({ icon: Icons.lightning, active: hasActiveAuto, editOnly: true, title: 'Automazioni', onClick: AdvancedAutomations.openPanel });
            }
            tools.push({ id: `adv-sort-btn-${tableId}`, icon: Icons.sort, title: 'Ordina', active: hasSort, onClick: AdvancedTable.openSortMenu });
            tools.push({ id: `adv-filter-btn-${tableId}`, icon: Icons.filter, title: 'Filtra', active: hasFilter, onClick: AdvancedTable.openFilterMenu });

            WidgetManager.updateShellUI(tableId, {
                icon: state.isLinkedView ? Icons.link : '',
                title: state.title || 'Database',
                optionsId: `adv-opt-btn-${tableId}`,
                tools: tools,
                onTitleChange: AdvancedTable.updateTitle,
                onOptionsClick: state.isLinkedView ? AdvancedPivotMenus.openOptions : AdvancedTableMenus.openTableOptions,
                onDragStart: AdvancedTable.onTableDragStart,
                onDragEnd: AdvancedTable.onTableDragEnd
            });
        }

        let viewRows =[];
        let minTime = Infinity;
        let maxTime = -Infinity;

        const renderCache = {};
        state.rows.forEach(r => {
            let vRow = AdvancedTable.buildVirtualRow(tableId, r, state, renderCache);

            let rawDate = vRow.virtualCells[dateColId];
            let start = null, end = null;

            if (rawDate && typeof rawDate === 'object') {
                if (rawDate.start) {
                    let s = String(rawDate.start);
                    if(s.length === 10) s += 'T00:00:00';
                    const parsed = new Date(s).getTime();
                    if (!isNaN(parsed)) start = parsed;
                }
                if (rawDate.end) {
                    let e = String(rawDate.end);
                    if(e.length === 10) e += 'T00:00:00';
                    const parsed = new Date(e).getTime();
                    if (!isNaN(parsed)) end = parsed;
                }
            } else if (rawDate) {
                let s = String(rawDate);
                if(s.length === 10) s += 'T00:00:00';
                const parsed = new Date(s).getTime();
                if (!isNaN(parsed)) start = parsed;
            }

            // Se è presente una sola delle due date, promuoviamo l'evento a Milestone valida
            const validStart = start !== null ? start : end;
            const validEnd = end !== null ? end : start;

            vRow._timeStart = validStart;
            vRow._timeEnd = validEnd;

            if (vRow._timeStart !== null && vRow._timeEnd !== null && vRow._timeStart > vRow._timeEnd) {
                let temp = vRow._timeStart;
                vRow._timeStart = vRow._timeEnd;
                vRow._timeEnd = temp;
            }
            viewRows.push(vRow);
        });

        viewRows = AdvancedTable.filterRows(viewRows, state);
        viewRows = AdvancedTable.sortRows(viewRows, state);

        let scheduledRows =[];
        let unscheduledRows =[];

        viewRows.forEach(r => {
            if (r._timeStart !== null && !isNaN(r._timeStart)) {
                scheduledRows.push(r);
                if (r._timeStart < minTime) minTime = r._timeStart;
                if (r._timeEnd > maxTime) maxTime = r._timeEnd;
            } else {
                unscheduledRows.push(r);
            }
        });

        scheduledRows.sort((a, b) => a._timeStart - b._timeStart);

        // Calcolo Dinamico dei Limiti Temporali con Inclusione di OGGI
        const dayMs = 24 * 60 * 60 * 1000;
        const todayMs = new Date().setHours(0, 0, 0, 0);

        let effectiveMin = minTime !== Infinity ? minTime : todayMs;
        let effectiveMax = maxTime !== -Infinity ? maxTime : todayMs;

        // Includiamo sempre Oggi nella timeline per permettere la navigazione con il tasto "Oggi"
        effectiveMin = Math.min(effectiveMin, todayMs);
        effectiveMax = Math.max(effectiveMax, todayMs);

        // Margine di respiro prima e dopo
        effectiveMin -= 25 * dayMs;
        effectiveMax += 35 * dayMs;

        // Garantiamo una finestra temporale minima di 120 giorni (~4 mesi) per sostenere la vista a Trimestre
        const currentSpanDays = Math.round((effectiveMax - effectiveMin) / dayMs);
        if (currentSpanDays < 120) {
            const missingDays = 120 - currentSpanDays;
            effectiveMin -= Math.floor(missingDays / 2) * dayMs;
            effectiveMax += Math.ceil(missingDays / 2) * dayMs;
        }

        const startDate = new Date(effectiveMin);
        const endDate = new Date(effectiveMax);

        startDate.setDate(1); // Primo del mese
        endDate.setMonth(endDate.getMonth() + 1, 0); // Ultimo giorno del mese di chiusura

        const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / dayMs) + 1;
        const colWidth = state.timelineZoom || 40;
        const rowHeight = 36;
        const timelineWidth = totalDays * colWidth;
        const leftPanelWidth = 200; 
        
        let totalLanesNeeded = 0;

        let prevScrollX = 0;
        const existingScroll = bodyContainer.querySelector('.adv-scroll-container');
        if (existingScroll) {
            prevScrollX = existingScroll.scrollLeft;
        }

        let html = '';
        html += `<div class="adv-timeline-toolbar" style="display:flex; justify-content:space-between; align-items:center; width:100%; padding: 5px 0;">
                    <div class="adv-cal-nav-group" style="display:flex; gap:5px;">
                        <button class="adv-add-btn" style="padding:4px 8px; border:1px solid var(--border-color); color:currentColor;" onclick="AdvancedTimeline.navigate('${tableId}', -1)" title="Indietro">${Icons.chevronLeft}</button>
                        <button class="adv-add-btn" style="border:1px solid var(--border-color); padding:2px 10px; color:currentColor; font-weight:bold;" onclick="AdvancedTimeline.scrollToToday('${tableId}')" title="Centra sulla data di oggi">Oggi</button>
                        <button class="adv-add-btn" style="padding:4px 8px; border:1px solid var(--border-color); color:currentColor;" onclick="AdvancedTimeline.navigate('${tableId}', 1)" title="Avanti">${Icons.chevronRight}</button>
                    </div>
                    <div style="display:flex; gap:5px;">
                        <button class="adv-add-btn" style="border:1px solid var(--border-color); padding:2px 8px; color:currentColor;" onclick="AdvancedTimeline.changeZoom('${tableId}', -10)" title="Riduci Zoom">${Icons.zoomOut}</button>
                        <button id="adv-zoom-menu-${tableId}" class="adv-add-btn" style="border:1px solid var(--border-color); padding:2px 8px; color:currentColor;" onclick="AdvancedTimeline.openZoomMenu(event, '${tableId}')" title="Zoom Preimpostati (Giorno, Mese, Trimestre...)">${Icons.chevronDown}</button>
                        <button class="adv-add-btn" style="border:1px solid var(--border-color); padding:2px 8px; color:currentColor;" onclick="AdvancedTimeline.changeZoom('${tableId}', 10)" title="Aumenta Zoom">${Icons.zoomIn}</button>
                    </div>
                 </div>`;

        html += `<div class="adv-timeline-wrapper" style="display:flex; flex-direction:row; background:var(--bg-color); border:1px solid var(--border-color); overflow:hidden;" onmouseleave="AdvancedTimeline.hideLaneNav('${tableId}')">`;

        let headerMonths = '';
        let headerDays = '';
        let currDate = new Date(startDate);
        
        let hourSteps =[];
        if (dateCol.type === 'datetime') {
            if (colWidth >= 600) hourSteps =[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
            else if (colWidth >= 300) hourSteps =[2, 4, 6, 8, 10, 14, 16, 18, 20, 22]; 
            else if (colWidth >= 150) hourSteps =[3, 6, 9, 15, 18, 21];
            else if (colWidth >= 80) hourSteps =[6, 18]; 
        }

        const todayTimestamp = new Date().setHours(0,0,0,0);

        while (currDate <= endDate) {
            let daysInMonth = new Date(currDate.getFullYear(), currDate.getMonth() + 1, 0).getDate();
            if (currDate.getTime() + (daysInMonth * dayMs) > endDate.getTime()) {
                daysInMonth = Math.round((endDate.getTime() - currDate.getTime()) / dayMs) + 1;
            }

            const monthName = currDate.toLocaleString('it-IT', { month: 'long', year: 'numeric' }).toUpperCase();
            let printedMonthName = monthName;
            if(currDate.getDate() > 1 && currDate.getTime() === startDate.getTime()) {
               printedMonthName = currDate.toLocaleString('it-IT', { month: 'long', year: 'numeric' }).toUpperCase();
            }

            headerMonths += `<div class="adv-timeline-month-block" style="width:${daysInMonth * colWidth}px;"><span style="position:sticky; left:10px;">${printedMonthName}</span></div>`;

            for (let d = 1; d <= daysInMonth; d++) {
                const isWeekend = currDate.getDay() === 0 || currDate.getDay() === 6;
                const isToday = currDate.getTime() === todayTimestamp;

                let subLabels = '';
                if (hourSteps.length > 0) {
                    hourSteps.forEach(h => {
                        const leftPct = (h / 24) * 100;
                        subLabels += `<span style="position:absolute; left:${leftPct}%; transform:translateX(-50%); font-size:0.55rem; color:var(--text-secondary); opacity:0.7; bottom:2px;">${String(h).padStart(2,'0')}</span>`;
                    });
                }

                // In caso di zoom compresso (Trimestre/Mese denso), evita sovrapposizioni visive saltando i giorni pari o minori
                let showDayNumber = true;
                if (colWidth < 14) {
                    showDayNumber = (d === 1 || d === 15);
                } else if (colWidth < 22) {
                    showDayNumber = (d === 1 || d % 5 === 0);
                }

                const dayText = showDayNumber ? currDate.getDate() : '';
                const dayStr = isToday && colWidth >= 16 
                    ? `<span style="background:var(--accent-color); color:white; border-radius:50%; width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; margin-top:2px;">${currDate.getDate()}</span>` 
                    : `<div style="padding-top:2px; font-size:${colWidth < 20 ? '0.65rem' : '0.75rem'};">${dayText}</div>`;

                headerDays += `<div class="adv-timeline-day-block" style="width:${colWidth}px; background:transparent; border-right:1px solid var(--border-color); position:relative;">
                                    <div style="font-weight:${isWeekend ? 'normal' : 'bold'}; color:${isToday ? 'var(--accent-color)' : 'var(--text-primary)'}; display:flex; justify-content:center;">${dayStr}</div>
                                    ${subLabels}
                               </div>`;
                currDate.setDate(currDate.getDate() + 1);
            }
        }

        let subGridStyle = '';
        if (dateCol.type === 'datetime') {
            if (colWidth >= 600) subGridStyle = `background-image: repeating-linear-gradient(to right, transparent, transparent calc(${colWidth / 24}px - 1px), rgba(150,150,150,0.15) calc(${colWidth / 24}px - 1px), rgba(150,150,150,0.15) calc(${colWidth / 24}px));`;
            else if (colWidth >= 300) subGridStyle = `background-image: repeating-linear-gradient(to right, transparent, transparent calc(${colWidth / 12}px - 1px), rgba(150,150,150,0.15) calc(${colWidth / 12}px - 1px), rgba(150,150,150,0.15) calc(${colWidth / 12}px));`;
            else if (colWidth >= 150) subGridStyle = `background-image: repeating-linear-gradient(to right, transparent, transparent calc(${colWidth / 8}px - 1px), rgba(150,150,150,0.15) calc(${colWidth / 8}px - 1px), rgba(150,150,150,0.15) calc(${colWidth / 8}px));`;
            else if (colWidth >= 80) subGridStyle = `background-image: repeating-linear-gradient(to right, transparent, transparent calc(${colWidth / 4}px - 1px), rgba(150,150,150,0.15) calc(${colWidth / 4}px - 1px), rgba(150,150,150,0.15) calc(${colWidth / 4}px));`;
        }

        let verticalLinesHTML = `<div style="position:absolute; top:60px; left:0; right:0; bottom:0; display:flex; pointer-events:none; opacity:0.5; z-index:1;">`;
        currDate = new Date(startDate);
        for (let i = 0; i < totalDays; i++) {
            verticalLinesHTML += `<div style="width:${colWidth}px; border-right:1px dashed var(--border-color); box-sizing:border-box; background:transparent; ${subGridStyle} flex-shrink:0;"></div>`;
            currDate.setDate(currDate.getDate() + 1);
        }
        
        // Indicatore verticale della data odierna (linea rossa)
        if (todayTimestamp >= startDate.getTime() && todayTimestamp <= endDate.getTime()) {
            const todayAbsolutePx = AdvancedTimeline._getPxFromDate(todayTimestamp, startDate.getTime(), colWidth);
            verticalLinesHTML += `<div style="position:absolute; left:${todayAbsolutePx}px; top:0; bottom:0; width:2px; background:var(--danger-color); opacity:0.8; z-index:10; pointer-events:none;" title="Oggi"></div>`;
        }

        verticalLinesHTML += `</div>`;
        
        let leftPanelHTML = '';
        let ganttAreaHTML = '';
        
        // -------------------------------------------------------------
        // CALCOLO DELLE COLONNE VISIBILI (Timeline)
        // -------------------------------------------------------------
        const viewId = 'timeline_' + dateColId;
        const hiddenList = state.viewConfig && state.viewConfig[viewId] ? state.viewConfig[viewId].hiddenCols : [];
        const visibleCols = state.columns.filter(c => !c.hidden && !hiddenList.includes(c.id));
        const titleCol = visibleCols.length > 0 ? visibleCols[0] : state.columns[0];

        // FUNZIONE INTERNA: Rendering delle singole attività
        const renderScheduledRows = () => {
            scheduledRows.forEach((r) => {
                
                // Risolve dinamicamente il titolo se è una pagina dedicata
                let tVal = r.virtualCells[titleCol.id] || 'Senza Titolo';
                if (titleCol.type === 'record_note') {
                    const noteObj = typeof Store !== 'undefined' ? Store.getNote(tVal) : null;
                    if (noteObj) tVal = noteObj.title || 'Senza Titolo';
                }
                tVal = String(tVal).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                
                let startPx = AdvancedTimeline._getPxFromDate(r._timeStart, startDate.getTime(), colWidth);
                let endPx = AdvancedTimeline._getPxFromDate(r._timeEnd, startDate.getTime(), colWidth);
                let widthPx = endPx - startPx;
                
                const isMilestone = r._timeStart === r._timeEnd;
                let milestoneStyles = '';

                if (isMilestone) {
                    widthPx = 14;
                    startPx -= 7; 
                    milestoneStyles = `border-radius: 50% !important; height: 14px !important; margin-top: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);`;
                } else if (widthPx < 4) {
                    widthPx = 4;
                }

                const topPx = 60 + (r._lane * rowHeight) + 5;

                let barColor = 'var(--accent-color)';
                let barBg = 'rgba(37, 99, 235, 0.5)';
                let textCol = 'var(--text-primary)';

                const selectCol = state.columns.find(c => c.type === 'select');
                if (selectCol && r.virtualCells[selectCol.id]) {
                    const optVal = r.virtualCells[selectCol.id];
                    const colorClass = state.selectColors && state.selectColors[selectCol.id] && state.selectColors[selectCol.id][optVal] ? state.selectColors[selectCol.id][optVal] : '';

                    if (colorClass.includes('c1')) { barColor = 'var(--tx-c1)'; barBg = isMilestone ? 'var(--tx-c1)' : 'var(--hl-c1)'; }
                    if (colorClass.includes('c2')) { barColor = 'var(--tx-c2)'; barBg = isMilestone ? 'var(--tx-c2)' : 'var(--hl-c2)'; }
                    if (colorClass.includes('c3')) { barColor = 'var(--tx-c3)'; barBg = isMilestone ? 'var(--tx-c3)' : 'var(--hl-c3)'; }
                    if (colorClass.includes('c4')) { barColor = 'var(--tx-c4)'; barBg = isMilestone ? 'var(--tx-c4)' : 'var(--hl-c4)'; }
                    if (colorClass.includes('c5')) { barColor = 'var(--tx-c5)'; barBg = isMilestone ? 'var(--tx-c5)' : 'var(--hl-c5)'; }
                    if (colorClass.includes('c6')) { barColor = '#000'; barBg = isMilestone ? '#000' : '#555'; textCol = '#fff'; }
                    if (colorClass.includes('c7')) { barColor = 'var(--tx-c7)'; barBg = isMilestone ? 'var(--tx-c7)' : 'var(--hl-c7)'; }
                    if (colorClass.includes('c8')) { barColor = 'var(--tx-c8)'; barBg = isMilestone ? 'var(--tx-c8)' : 'var(--hl-c8)'; }
                    if (colorClass.includes('c9')) { barColor = 'var(--tx-c9)'; barBg = isMilestone ? 'var(--tx-c9)' : 'var(--hl-c9)'; }
                    if (colorClass.includes('c10')) { barColor = 'var(--tx-c10)'; barBg = isMilestone ? 'var(--tx-c10)' : 'var(--hl-c10)'; }
                    
                    if (isMilestone && !barColor) barBg = 'var(--accent-color)';
                } else if (isMilestone) {
                    barBg = 'var(--accent-color)';
                }

                const cursorStyle = isEdit ? 'cursor:grab;' : 'cursor:pointer;';
                const moveHandler = isEdit ? `onmousedown="AdvancedTimeline.startDrag(event, '${tableId}', '${r.id}', 'move')"` : '';
                
                const leftHandle = (isEdit && !isMilestone) ? `<div style="position:absolute; left:0; top:0; bottom:0; width:10px; cursor:ew-resize; z-index:10;" onmousedown="AdvancedTimeline.startDrag(event, '${tableId}', '${r.id}', 'start')"></div>` : '';
                const rightHandle = (isEdit && !isMilestone) ? `<div style="position:absolute; right:0; top:0; bottom:0; width:10px; cursor:ew-resize; z-index:10;" onmousedown="AdvancedTimeline.startDrag(event, '${tableId}', '${r.id}', 'end')"></div>` : '';

                const linkHandle = (isEdit) ? `
                    <span id="link-handle-${r.id}" class="timeline-link-handle" title="Trascina per collegare" onmousedown="AdvancedTimeline.startLinkDrag(event, '${tableId}', '${r.id}')"
                         style="position:absolute; left:${startPx + widthPx}px; top:${topPx + 13}px; transform:translateY(-50%); width:16px; height:16px; min-height:16px !important; padding:0 !important; display:flex; align-items:center; justify-content:flex-start; opacity:0; pointer-events:none; transition:opacity 0.2s, filter 0.2s; z-index:30; cursor:crosshair;"
                         onmouseenter="this.style.opacity='1'; this.style.pointerEvents='auto'; const b=document.getElementById('bar-${r.id}'); if(b) b.style.filter='brightness(1.1)';"
                         onmouseleave="this.style.opacity='0'; this.style.pointerEvents='none'; const b=document.getElementById('bar-${r.id}'); if(b) b.style.filter='none';">
                         <span style="width:8px !important; min-width:8px !important; height:2px !important; min-height:2px !important; padding:0 !important; margin:0 !important; background:var(--text-secondary); flex-shrink:0; display:block;"></span>
                         <span style="width:8px !important; min-width:8px !important; height:8px !important; min-height:8px !important; padding:0 !important; margin:0 0 0 -1px !important; border:2px solid var(--text-secondary); border-radius:50%; background:var(--bg-color); box-sizing:border-box; flex-shrink:0; display:block;"></span>
                    </span>
                ` : '';

                const isActiveRecord = (typeof AdvancedTable !== 'undefined' && AdvancedTable.activeRecordId === r.id);
                const highlightStyle = isActiveRecord ? 'box-shadow: 0 0 0 2px var(--bg-color), 0 0 0 4px var(--accent-color); z-index: 20;' : 'z-index:5;';

                let textInsideBar = '';
                const isGroupedByTitle = isGrouped && state.timelineGroupBy === titleCol.id;

                if (isMilestone) {
                    textInsideBar = `<span style="position:absolute; left:20px; top:-4px; font-size:0.75rem; font-weight:bold; white-space:nowrap; color:var(--text-primary); pointer-events:none;">${tVal}</span>`;
                } else if (!isGroupedByTitle && widthPx >= 30) {
                    textInsideBar = `<span style="font-size:0.75rem; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; pointer-events:none;">${tVal}</span>`;
                }

                ganttAreaHTML += `
                    <div id="bar-${r.id}" class="adv-timeline-bar" style="position:absolute; top:${topPx}px; left:${startPx}px; width:${widthPx}px; background:${barBg}; border:1px solid ${barColor}; color:${textCol}; ${cursorStyle} ${highlightStyle} ${milestoneStyles} transition: filter 0.2s;"
                         ondblclick="event.stopPropagation(); AdvancedTable.openRecordView('${tableId}', '${r.id}')"
                         ${moveHandler}
                         onmouseenter="const h = document.getElementById('link-handle-${r.id}'); if(h) { h.style.opacity='0.7'; h.style.pointerEvents='auto'; }"
                         onmouseleave="const h = document.getElementById('link-handle-${r.id}'); if(h) { h.style.opacity='0'; h.style.pointerEvents='none'; }"
                         data-row-id="${r.id}"
                         title="${tVal} (Doppio click per aprire)">
                        ${leftHandle}
                        ${textInsideBar}
                        ${rightHandle}
                    </div>
                    ${linkHandle}
                `;
            });
        };

        if (isGrouped) {
            const groupCol = state.columns.find(c => c.id === state.timelineGroupBy);
            if(!groupCol) return AdvancedTimeline.setGroupBy(tableId, null);

            let groupedRows = {};
            scheduledRows.forEach(r => {
                let gVal = r.virtualCells[groupCol.id];
                if(groupCol.type === 'relation' && Array.isArray(gVal)) {
                    const tState = AdvancedTable.getTableState(groupCol.targetTableId);
                    if(tState && gVal.length > 0) {
                        gVal = gVal.map(tid => {
                            const tr = tState.rows.find(tx => tx.id === tid);
                            return tr ? tr.cells[groupCol.targetColId] : 'Orfano';
                        }).join(', ');
                    } else gVal = 'Senza Gruppo';
                } else if(Array.isArray(gVal)) {
                    gVal = gVal.join(', ');
                }
                
                gVal = String(gVal || 'Senza Gruppo').trim();
                if(!groupedRows[gVal]) groupedRows[gVal] = [];
                groupedRows[gVal].push(r);
            });

            const groupsConfig = [];

            for (const [gName, rowsInGroup] of Object.entries(groupedRows)) {
                rowsInGroup.sort((a, b) => a._timeStart - b._timeStart);
                
                let groupLanes =[];
                rowsInGroup.forEach(r => {
                    let placed = false;
                    for (let i = 0; i < groupLanes.length; i++) {
                        if (r._timeStart > groupLanes[i]) {
                            r._lane = totalLanesNeeded + i; 
                            groupLanes[i] = r._timeEnd;
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) {
                        r._lane = totalLanesNeeded + groupLanes.length;
                        groupLanes.push(r._timeEnd);
                    }
                });

                const groupCount = Math.max(1, groupLanes.length);
                groupsConfig.push({ name: gName, rows: rowsInGroup, lanesCount: groupCount });
                totalLanesNeeded += groupCount;
            }

            const totalRowsForGrid = totalLanesNeeded;
            const timelineHeight = totalRowsForGrid * rowHeight;

            leftPanelHTML = `
                <div style="width:${leftPanelWidth}px; flex-shrink:0; border-right:1px solid var(--border-color); background:var(--sidebar-bg); z-index:10; display:flex; flex-direction:column; overflow:hidden;">
                    <div style="height:60px; border-bottom:1px solid var(--border-color); background:var(--sidebar-bg); display:flex; align-items:center; padding:10px; font-weight:bold; font-size:0.8rem; color:var(--text-secondary); text-transform:uppercase;">
                        ${groupCol.name}
                    </div>
                    <div style="flex:1; overflow-y:hidden; overflow-x:hidden;" id="timeline-titles-${tableId}">
            `;
            
            ganttAreaHTML += `<div style="position:absolute; top:60px; left:0; right:0; bottom:0; z-index:2;">`;

            groupsConfig.forEach(grp => {
                const safeGrpName = String(grp.name).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                
                leftPanelHTML += `
                    <div style="height:${grp.lanesCount * rowHeight}px; border-bottom:1px solid var(--border-color); padding:10px; display:flex; align-items:flex-start; font-size:0.85rem; font-weight:bold; color:var(--text-primary); background:transparent;">
                        <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${safeGrpName.replace(/"/g, '&quot;')}">${safeGrpName}</span>
                    </div>
                `;

                for(let i=0; i<grp.lanesCount; i++) {
                    const clickHandler = isEdit ? `ondblclick="event.stopPropagation(); AdvancedTimeline.createRecord(event, '${tableId}', '${safeGrpName.replace(/'/g, "\\'")}')"` : '';
                    ganttAreaHTML += `<div ${clickHandler} style="width:100%; height:${rowHeight}px; border-bottom:1px solid var(--border-color); box-sizing:border-box; cursor:pointer;"></div>`;
                }
            });
            leftPanelHTML += `</div></div>`;
            ganttAreaHTML += `</div>`;

            renderScheduledRows();

        } else {
            let flatLanes = [];
            scheduledRows.forEach(r => {
                let placed = false;
                for (let i = 0; i < flatLanes.length; i++) {
                    if (r._timeStart > flatLanes[i]) {
                        r._lane = i;
                        flatLanes[i] = r._timeEnd;
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    r._lane = flatLanes.length;
                    flatLanes.push(r._timeEnd);
                }
            });

            totalLanesNeeded = Math.max(flatLanes.length, scheduledRows.length > 0 ? flatLanes.length : 1);
            const totalRowsForGrid = totalLanesNeeded;
            const timelineHeight = totalRowsForGrid * rowHeight;
            
            ganttAreaHTML += `<div style="position:absolute; top:60px; left:0; right:0; bottom:0; z-index:2;">`;
            for (let i = 0; i < totalRowsForGrid; i++) {
                const clickHandler = isEdit ? `ondblclick="event.stopPropagation(); AdvancedTimeline.createRecord(event, '${tableId}', null)"` : '';
                ganttAreaHTML += `<div ${clickHandler} style="width:100%; height:${rowHeight}px; border-bottom:1px solid var(--border-color); box-sizing:border-box; cursor:pointer;"></div>`;
            }
            ganttAreaHTML += `</div>`;

            renderScheduledRows();
        }

        // Dati salvati in memoria per consentire alla navigazione di calcolare istantaneamente le corsie
        AdvancedTimeline._timelineData[tableId] = {
            scheduledRows: scheduledRows,
            startDateMs: startDate.getTime(),
            colWidth: colWidth,
            rowHeight: rowHeight,
            totalLanes: totalLanesNeeded,
            titleCol: titleCol,
            dateColType: dateCol.type
        };

        const arrowSvgLeft = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
        const arrowSvgRight = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

        const actualTimelineHeight = Math.max(totalLanesNeeded * rowHeight, rowHeight);

        html += leftPanelHTML;
        html += `<div class="adv-scroll-container" style="flex:1; overflow-x:auto; overflow-y:auto; position:relative; background:var(--bg-color);" id="timeline-scroll-${tableId}" data-start-date="${startDate.getTime()}" onmousedown="AdvancedTimeline.startPan(event)" onmousemove="AdvancedTimeline.handleLaneHover(event, '${tableId}')" onscroll="const t = document.getElementById('timeline-titles-${tableId}'); if(t) t.scrollTop = this.scrollTop; AdvancedTimeline.updateLaneNav('${tableId}');">`;
        html += `<div style="width:${timelineWidth}px; position:relative; min-height:${actualTimelineHeight + 60}px;">`;
        html += `<div class="adv-timeline-header-sticky"><div style="display:flex; height:30px;">${headerMonths}</div><div style="display:flex; height:30px;">${headerDays}</div></div>`;
        html += verticalLinesHTML;
        
        // Elementi Fluttuanti di Navigazione Corsia
        html += `<button id="timeline-nav-prev-${tableId}" class="adv-timeline-nav-arrow" style="display:none;" title="Attività precedente fuori vista">${arrowSvgLeft}</button>`;
        html += `<button id="timeline-nav-next-${tableId}" class="adv-timeline-nav-arrow" style="display:none;" title="Attività successiva fuori vista">${arrowSvgRight}</button>`;

        const relationCols = state.columns.filter(c => c.type === 'relation' && c.targetTableId === tableId);
        
        if (relationCols.length > 0 || isEdit) {
            let svgPaths = '';
            
            if (relationCols.length > 0) {
                let taskCoords = {};
                scheduledRows.forEach(r => {
                    let startPx = AdvancedTimeline._getPxFromDate(r._timeStart, startDate.getTime(), colWidth);
                    let endPx = AdvancedTimeline._getPxFromDate(r._timeEnd, startDate.getTime(), colWidth);
                    let widthPx = endPx - startPx;
                    
                    const isMilestone = r._timeStart === r._timeEnd;
                    if (isMilestone) { widthPx = 14; startPx -= 7; }
                    else if (widthPx < 4) { widthPx = 4; }
                    
                    const topPx = 60 + (r._lane * rowHeight) + 18; 

                    taskCoords[r.id] = {
                        left: startPx,
                        right: startPx + widthPx,
                        yCenter: topPx, 
                        startTime: r._timeStart,
                        endTime: r._timeEnd
                    };
                });

                scheduledRows.forEach(r => {
                    relationCols.forEach(relCol => {
                        let relatedIds = r.virtualCells[relCol.id];
                        if (!relatedIds) return;
                        if (!Array.isArray(relatedIds)) relatedIds = [relatedIds];

                        relatedIds.forEach(targetId => {
                            if (taskCoords[targetId] && taskCoords[r.id]) {
                                const pParent = taskCoords[targetId];
                                const pChild = taskCoords[r.id];

                                const isConflict = pChild.startTime < pParent.endTime;
                                const strokeColor = isConflict ? 'var(--danger-color)' : 'var(--text-secondary)';
                                const markerId = isConflict ? 'arrowhead-danger' : 'arrowhead';
                                const strokeWidth = isConflict ? '2' : '1.5';
                                const opacity = isConflict ? '0.9' : '0.6';

                                const d = AdvancedTimeline._drawRoundedOrthogonalPath(
                                    pParent.right, pParent.yCenter,
                                    pChild.left, pChild.yCenter,
                                    isConflict
                                );

                                svgPaths += `<path d="${d}" fill="transparent" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="${opacity}" marker-end="url(#${markerId})"/>`;
                            }
                        });
                    });
                });
            }

            html += `
            <svg id="timeline-svg-${tableId}" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:4;">
                <defs>
                    <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                        <polygon points="0 0, 6 3, 0 6" fill="var(--text-secondary)" opacity="0.8" />
                    </marker>
                    <marker id="arrowhead-danger" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                        <polygon points="0 0, 6 3, 0 6" fill="var(--danger-color)" opacity="0.9" />
                    </marker>
                </defs>
                ${svgPaths}
            </svg>`;
        }

        html += ganttAreaHTML;

        html += `</div></div></div>`; 

        if (unscheduledRows.length > 0) {
            html += `<div style="margin-top:10px; font-size:0.8rem; color:var(--text-secondary); padding: 5px;">
                        <b><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.alertTriangle} Record senza data (${unscheduledRows.length}):</b></span> 
                        ${unscheduledRows.map(r => {
                            let tTitle = r.virtualCells[titleCol.id] || 'Senza Titolo';
                            if (titleCol.type === 'record_note') {
                                const noteObj = typeof Store !== 'undefined' ? Store.getNote(tTitle) : null;
                                if (noteObj) tTitle = noteObj.title || 'Senza Titolo';
                            }
                            tTitle = String(tTitle).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            
                            return `<span draggable="${isEdit ? 'true' : 'false'}" 
                                  ${isEdit ? `ondragstart="AdvancedCalendar.onDragStart(event, '${tableId}', '${r.id}')"` : ''}
                                  style="cursor:${isEdit ? 'grab' : 'pointer'}; color:var(--accent-color); margin-right:8px; display:inline-block;" 
                                  onclick="AdvancedTable.openRecordView('${tableId}', '${r.id}')">
                                ${tTitle}
                            </span>`;
                        }).join('')}
                     </div>`;
        }

        bodyContainer.innerHTML = html;

        setTimeout(() => {
            const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
            if (scrollArea) {
                if (AdvancedTimeline.preservedCenterMs !== undefined) {
                    const centerPx = AdvancedTimeline._getPxFromDate(AdvancedTimeline.preservedCenterMs, startDate.getTime(), colWidth);
                    scrollArea.scrollLeft = centerPx - (scrollArea.clientWidth / 2);
                    AdvancedTimeline.preservedCenterMs = undefined; 
                } else if (prevScrollX > 0) {
                    scrollArea.scrollLeft = prevScrollX;
                } else {
                    const today = new Date().getTime();
                    if (today >= startDate.getTime() && today <= endDate.getTime()) {
                        const todayPx = AdvancedTimeline._getPxFromDate(today, startDate.getTime(), colWidth);
                        scrollArea.scrollLeft = Math.max(0, todayPx - (scrollArea.clientWidth * 0.2));
                    } else {
                        const firstTask = Math.min(...scheduledRows.map(r => r._timeStart));
                        if (firstTask && firstTask !== Infinity) {
                            const firstPx = AdvancedTimeline._getPxFromDate(firstTask, startDate.getTime(), colWidth);
                            scrollArea.scrollLeft = Math.max(0, firstPx - 50);
                        }
                    }
                }
            }
        }, 10);
    }
});