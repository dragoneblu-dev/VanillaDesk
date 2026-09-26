/**
 * AdvancedTableCalendar.js
 * Modulo per la Vista Calendario dei Database.
 * FIX COLONNE NASCOSTE: L'etichetta dell'evento è ora dinamicamente assegnata alla PRIMA COLONNA VISIBILE e non hardcodata.
 * FEAT UX: Nomi dei mesi cliccabili nella Vista Annuale per navigare rapidamente alla Vista Mensile corrispondente.
 * FIX ALLINEAMENTO: Risolto bug delle Regex in _cleanFormulaRendering che lasciava Select e Pulsanti disallineati a sinistra nelle Card temporali.
 */

const AdvancedCalendar = {
    resizeState: null,
    touchStartX: 0,
    touchStartY: 0,

    changeMode: (e, tableId, mode) => {
        if (e) e.stopPropagation();
        let state = AdvancedTable.getState(tableId);
        state.calendarMode = mode;
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
    },

    navigate: (e, tableId, direction) => {
        if (e) e.stopPropagation();
        let state = AdvancedTable.getState(tableId);
        const currentMs = state.calendarFocusDate ? Number(state.calendarFocusDate) : Date.now();
        let focusDate = new Date(currentMs);
        const mode = state.calendarMode || 'month';

        if (direction === 0) {
            focusDate = new Date();
        } else if (mode === 'month') {
            focusDate.setMonth(focusDate.getMonth() + direction);
        } else if (mode === 'week') {
            focusDate.setDate(focusDate.getDate() + (direction * 7));
        } else if (mode === 'day') {
            focusDate.setDate(focusDate.getDate() + direction);
        } else if (mode === 'year') {
            focusDate.setFullYear(focusDate.getFullYear() + direction);
        }

        state.calendarFocusDate = focusDate.getTime();
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
    },

    handlePointerDown: (e) => {
        if (e.target.closest('.adv-cal-event-std, .adv-cal-event-abs, button, .adv-add-btn, .adv-cal-more-btn, .adv-select-pill')) return;
        AdvancedCalendar.touchStartX = e.clientX;
        AdvancedCalendar.touchStartY = e.clientY;
    },

    handlePointerUp: (e, tableId) => {
        if (!AdvancedCalendar.touchStartX && !AdvancedCalendar.touchStartY) return;

        let touchEndX = e.clientX;
        let touchEndY = e.clientY;
        let diffX = touchEndX - AdvancedCalendar.touchStartX;
        let diffY = touchEndY - AdvancedCalendar.touchStartY;
        
        AdvancedCalendar.touchStartX = 0;
        AdvancedCalendar.touchStartY = 0;
        
        if (Math.abs(diffX) > 50 && Math.abs(diffY) < 60) {
            if (diffX < 0) AdvancedCalendar.navigate(null, tableId, 1);
            if (diffX > 0) AdvancedCalendar.navigate(null, tableId, -1);
        }
    },

    toggleLegendFilter: (tableId, option) => {
        let state = AdvancedTable.getState(tableId);
        if (!state.calendarLegendFilter) state.calendarLegendFilter =[];
        
        const idx = state.calendarLegendFilter.indexOf(option);
        if (idx > -1) state.calendarLegendFilter.splice(idx, 1);
        else state.calendarLegendFilter.push(option);
        
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
    },

    clearLegendFilter: (tableId) => {
        let state = AdvancedTable.getState(tableId);
        state.calendarLegendFilter =[];
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
    },

    expandDayView: (e, tableId, ms) => {
        if (e) e.stopPropagation();
        let state = AdvancedTable.getState(tableId);
        state.calendarMode = 'day';
        state.calendarFocusDate = ms;
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
    },

    expandMonthView: (e, tableId, ms) => {
        if (e) e.stopPropagation();
        let state = AdvancedTable.getState(tableId);
        state.calendarMode = 'month';
        state.calendarFocusDate = ms;
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
    },

    changeZoom: (e, tableId, delta) => {
        if (e) e.stopPropagation();
        
        let state = AdvancedTable.getState(tableId);
        let currentZoom = state.calendarZoom || 40;

        let step = 10;
        if (currentZoom >= 100) step = 20;

        currentZoom += (delta > 0 ? step : -step);

        if (currentZoom < 20) currentZoom = 20;
        if (currentZoom > 200) currentZoom = 200;

        state.calendarZoom = currentZoom;
        AdvancedTable.setState(tableId, state);
        
        AdvancedTable.renderTable(tableId);
    },

    createRecord: (e, tableId, baseTimeMs, pxPerHour = null) => {
        if (!AppState.isEditMode) return;
        if (e.target.closest('.adv-cal-event-std, .adv-cal-event-abs, .adv-cal-more-btn')) return;
        
        let finalMs = Number(baseTimeMs);
        if (pxPerHour) {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickY = e.clientY - rect.top;
            const hours = clickY / pxPerHour;
            finalMs += hours * 3600000;
        }
        
        finalMs = Math.round(finalMs / (15*60000)) * (15*60000);
        AdvancedTable.createRecordAtDate(tableId, finalMs);
    },

    onDragStart: (e, tableId, rowId) => {
        if (!AppState.isEditMode) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({ tableId, rowId, offsetY }));
        e.currentTarget.style.opacity = '0.5';
    },

    onDragOver: (e) => {
        e.preventDefault();
        if (e.currentTarget.classList.contains('adv-cal-droppable')) {
            e.currentTarget.style.boxShadow = 'inset 0 0 0 2px var(--accent-color)';
        }
    },

    onDragLeave: (e) => {
        if (e.currentTarget.classList.contains('adv-cal-droppable')) {
            e.currentTarget.style.boxShadow = 'none';
        }
    },

    onDrop: (e, targetTableId, timestampMs) => {
        e.preventDefault();
        if (e.currentTarget.classList.contains('adv-cal-droppable')) {
            e.currentTarget.style.boxShadow = 'none';
        }

        try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            if (data.tableId !== targetTableId) return;

            const state = AdvancedTable.getState(targetTableId);
            const row = state.rows.find(r => r.id === data.rowId);
            if (!row) return;

            const dateCol = state.columns.find(c => c.id === state.calendarDateCol);
            const newDate = new Date(Number(timestampMs));

            let oldStartMs = null;
            let oldEndMs = null;
            const currentCell = row.cells[dateCol.id];

            if (currentCell && typeof currentCell === 'object') {
                if (currentCell.start) oldStartMs = new Date(currentCell.start).getTime();
                if (currentCell.end) oldEndMs = new Date(currentCell.end).getTime();
            } else if (currentCell) {
                oldStartMs = new Date(currentCell).getTime();
            }

            let deltaMs = 0;

            if (dateCol.type === 'datetime' && state.calendarMode !== 'month' && state.calendarMode !== 'year') {
                const pxPerHour = state.calendarZoom || 40;
                const rect = e.currentTarget.getBoundingClientRect();
                const dropY = e.clientY - rect.top;

                const targetTopY = dropY - (data.offsetY || 0);
                const droppedHourFloat = targetTopY / pxPerHour;
                const snappedHourFloat = Math.round(droppedHourFloat * 4) / 4;

                const dropHours = Math.floor(snappedHourFloat);
                const dropMinutes = Math.round((snappedHourFloat - dropHours) * 60);

                newDate.setHours(dropHours, dropMinutes, 0, 0);
            }
            else if (dateCol.type === 'datetime') {
                const oldDateObj = oldStartMs ? new Date(oldStartMs) : new Date();
                newDate.setHours(oldDateObj.getHours(), oldDateObj.getMinutes(), 0, 0);
            }

            if (oldStartMs) {
                deltaMs = newDate.getTime() - oldStartMs;
            }

            newDate.setMinutes(newDate.getMinutes() - newDate.getTimezoneOffset());
            const formattedStart = dateCol.type === 'datetime' ? newDate.toISOString().slice(0, 16) : newDate.toISOString().split('T')[0];

            if (!currentCell || typeof currentCell !== 'object') {
                if (dateCol.hasEndDate) {
                    row.cells[dateCol.id] = { start: formattedStart, end: formattedStart };
                } else {
                    row.cells[dateCol.id] = formattedStart;
                }
            } else {
                row.cells[dateCol.id].start = formattedStart;
                if (oldEndMs && dateCol.hasEndDate) {
                    const newEnd = new Date(oldEndMs + deltaMs);
                    newEnd.setMinutes(newEnd.getMinutes() - newEnd.getTimezoneOffset());
                    row.cells[dateCol.id].end = newEnd.toISOString().slice(0, 16);
                }
            }

            row.updatedAt = Date.now();
            AdvancedTable.setState(targetTableId, state);
            Store.triggerAutoSave();
            AdvancedTable.renderTable(targetTableId);

        } catch (err) {
            console.error("Errore drag & drop calendario:", err);
        }
    },

    startResize: (e, tableId, rowId) => {
        if (!AppState.isEditMode) return;
        e.preventDefault();
        e.stopPropagation();

        const state = AdvancedTable.getState(tableId);
        const row = state.rows.find(r => r.id === rowId);
        const dateCol = state.columns.find(c => c.id === state.calendarDateCol);

        let endMs = null;
        let startMs = null;
        const val = row.cells[dateCol.id];

        if (val && typeof val === 'object') {
            startMs = val.start ? new Date(val.start).getTime() : Date.now();
            endMs = val.end ? new Date(val.end).getTime() : startMs;
        } else {
            startMs = val ? new Date(val).getTime() : Date.now();
            endMs = startMs;
        }

        AdvancedCalendar.resizeState = {
            tableId: tableId,
            rowId: rowId,
            startY: e.pageY,
            originalEndMs: endMs,
            pxPerHour: state.calendarZoom || 40,
            el: e.currentTarget.closest('.adv-cal-event-abs')
        };

        document.addEventListener('mousemove', AdvancedCalendar.onResizeMove);
        document.addEventListener('mouseup', AdvancedCalendar.onResizeEnd);
    },

    onResizeMove: (e) => {
        if (!AdvancedCalendar.resizeState) return;
        const rs = AdvancedCalendar.resizeState;

        const deltaY = e.pageY - rs.startY;
        const snapPx = rs.pxPerHour / 4;
        const snappedDeltaY = Math.round(deltaY / snapPx) * snapPx;

        if (rs.el) {
            let currentHeight = parseFloat(rs.el.getAttribute('data-base-height')) || parseFloat(rs.el.style.height);
            let newHeight = currentHeight + snappedDeltaY;
            if (newHeight < snapPx) newHeight = snapPx;

            rs.el.style.height = newHeight + 'px';
            rs.el.style.opacity = '0.8';
            rs.el.style.zIndex = '50';
        }
    },

    onResizeEnd: (e) => {
        document.removeEventListener('mousemove', AdvancedCalendar.onResizeMove);
        document.removeEventListener('mouseup', AdvancedCalendar.onResizeEnd);

        if (!AdvancedCalendar.resizeState) return;
        const rs = AdvancedCalendar.resizeState;

        const deltaY = e.pageY - rs.startY;
        const snapPx = rs.pxPerHour / 4;
        const snappedDeltaY = Math.round(deltaY / snapPx) * snapPx;
        const deltaMs = (snappedDeltaY / rs.pxPerHour) * 60 * 60 * 1000;

        let newEndMs = rs.originalEndMs + deltaMs;

        const state = AdvancedTable.getState(rs.tableId);
        const row = state.rows.find(r => r.id === rs.rowId);
        const dateCol = state.columns.find(c => c.id === state.calendarDateCol);

        const d = new Date(newEndMs);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        const formattedEnd = dateCol.type === 'datetime' ? d.toISOString().slice(0, 16) : d.toISOString().split('T')[0];

        if (!row.cells[dateCol.id] || typeof row.cells[dateCol.id] !== 'object') {
            const startVal = row.cells[dateCol.id] || formattedEnd;
            row.cells[dateCol.id] = { start: startVal, end: formattedEnd };
        } else {
            row.cells[dateCol.id].end = formattedEnd;
        }

        row.updatedAt = Date.now();
        AdvancedTable.setState(rs.tableId, state);
        Store.triggerAutoSave();

        AdvancedCalendar.resizeState = null;
        AdvancedTable.renderTable(rs.tableId);
    },

    _buildTooltipHTML: (title, timeLabelText, r, propCols) => {
        let tooltipHtml = `<b>${String(title).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b>`;
        if (timeLabelText) tooltipHtml += `<br><span style="color:var(--text-secondary); font-size:0.85rem;">🕒 ${timeLabelText}</span>`;
        
        if (propCols && propCols.length > 0) {
            tooltipHtml += `<div style="margin-top:6px; border-top:1px solid rgba(150,150,150,0.3); padding-top:6px; font-size:0.8rem;">`;
            propCols.forEach(p => {
                let rawV = r.virtualCells[p.id];
                
                if (rawV !== '' && rawV !== null && rawV !== undefined && !(Array.isArray(rawV) && rawV.length === 0)) {
                    let displayV = AdvancedTable.getFormatDisplayValue(p, rawV);
                    const safeName = String(p.name).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const safeVal = displayV.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    tooltipHtml += `<div style="margin-bottom:2px;"><span style="color:var(--text-secondary);">${safeName}:</span> ${safeVal}</div>`;
                }
            });
            tooltipHtml += `</div>`;
        }
        return tooltipHtml.replace(/"/g, '&quot;'); 
    },

    /**
     * CLEAN FORMULA RENDERING (CSS Injection)
     * Riscrive l'HTML generato da renderCell() per forzare gli allineamenti a destra 
     * e sovrascrivere i comportamenti di default (flex-start/center) delle tabelle.
     */
    _cleanFormulaRendering: (htmlStr) => {
        let cleaned = htmlStr;
        
        // 1. Forza i flexbox generici a spostarsi a destra (es. Bottoni)
        cleaned = cleaned.replace(/justify-content:\s*flex-start/gi, 'justify-content: flex-end');
        cleaned = cleaned.replace(/justify-content:\s*center/gi, 'justify-content: flex-end');
        
        // 2. Inietta esplicitamente l'allineamento sulle classi di base usando Regex tolleranti agli spazi
        cleaned = cleaned.replace(/class=["']([^"']*?\badv-select-container\b[^"']*)["']/g, 'class="$1" style="justify-content:flex-end; width:100%; margin:0;"');
        cleaned = cleaned.replace(/class=["']([^"']*?\badv-cell-text\b[^"']*)["']/g, 'class="$1" style="text-align:right; width:100%; margin:0;"');
        cleaned = cleaned.replace(/class=["']([^"']*?\badv-cell-number\b[^"']*)["']/g, 'class="$1" style="text-align:right; width:100%; margin:0;"');
        
        // 3. Pulisce eventuali sfondi ereditati dalla griglia ReadOnly
        cleaned = cleaned.replace(/background:\s*rgba\(0,\s*0,\s*0,\s*0\.02\);?/gi, '');
        cleaned = cleaned.replace(/adv-cell-readonly/g, '');
        
        return cleaned;
    },

    render: (tableId, wrapper, state) => {
        const dateColId = state.calendarDateCol;
        const dateCol = state.columns.find(c => c.id === dateColId);

        if (!dateCol || !['date', 'datetime'].includes(dateCol.type)) {
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

        let prevScrollX = 0, prevScrollY = 0;
        const existingScroll = bodyContainer.querySelector('.adv-scroll-container, .adv-cal-week-container .adv-scroll-container,[style*="overflow-y:auto"]');
        if (existingScroll) {
            prevScrollX = existingScroll.scrollLeft;
            prevScrollY = existingScroll.scrollTop;
        }

        const mode = state.calendarMode || 'month';
        const currentMs = state.calendarFocusDate ? Number(state.calendarFocusDate) : Date.now();
        const focusDate = new Date(currentMs);
        const isTimeCol = dateCol.type === 'datetime';

        const hasFilter = state.filters && Object.keys(state.filters).some(k => state.filters[k].trim() !== '');
        const hasSort = state.sorts && state.sorts.length > 0;
        let hasActiveAuto = state.automations && state.automations.some(a => a.active);

        if (typeof WidgetManager !== 'undefined') {
            const tools =[];
            tools.push({ id: `adv-view-btn-${tableId}`, icon: Icons.viewCalendar, label: 'Calendario', onClick: AdvancedBoard.openViewMenu });
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

        let html = '';

        let viewRows =[];
        const renderCache = {};
        state.rows.forEach(r => {
            let vRow = AdvancedTable.buildVirtualRow(tableId, r, state, renderCache);
            let rawDate = vRow.virtualCells[dateColId];
            let parsedStart = null, parsedEnd = null;

            if (rawDate && typeof rawDate === 'string') {
                parsedStart = new Date(rawDate).getTime();
                parsedEnd = parsedStart;
            } else if (rawDate && typeof rawDate === 'object') {
                if (rawDate.start) parsedStart = new Date(rawDate.start).getTime();
                if (rawDate.end) parsedEnd = new Date(rawDate.end).getTime();
                else parsedEnd = parsedStart;
            }

            if (parsedStart && !isNaN(parsedStart)) {
                vRow._timeStart = parsedStart;
                vRow._timeEnd = parsedEnd && !isNaN(parsedEnd) ? parsedEnd : parsedStart;
                if (vRow._timeEnd < vRow._timeStart) {
                    let temp = vRow._timeStart; vRow._timeStart = vRow._timeEnd; vRow._timeEnd = temp;
                }
            }
            viewRows.push(vRow);
        });

        viewRows = AdvancedTable.filterRows(viewRows, state);
        viewRows = AdvancedTable.sortRows(viewRows, state);

        const selectCol = state.columns.find(c => c.type === 'select');
        
        if (selectCol && state.calendarLegendFilter && state.calendarLegendFilter.length > 0) {
            viewRows = viewRows.filter(r => {
                const val = r.virtualCells[selectCol.id];
                if (!val) return false;
                if (Array.isArray(val)) return val.some(v => state.calendarLegendFilter.includes(v));
                return state.calendarLegendFilter.includes(val);
            });
        }

        const eventsByDate = {};
        let unscheduledRows =[];

        viewRows.forEach(r => {
            if (!r._timeStart) {
                unscheduledRows.push(r);
            } else {
                let startDay = new Date(r._timeStart).setHours(0, 0, 0, 0);
                let endDay = new Date(r._timeEnd).setHours(0, 0, 0, 0);
                let iter = new Date(startDay);
                while (iter.getTime() <= endDay) {
                    let t = iter.getTime();
                    if (!eventsByDate[t]) eventsByDate[t] = [];
                    eventsByDate[t].push(r);
                    iter.setDate(iter.getDate() + 1);
                }
            }
        });

        let monthName = focusDate.toLocaleString('it-IT', { month: 'long', year: 'numeric' }).toUpperCase();
        if (mode === 'year') {
            monthName = `ANNO: ${focusDate.getFullYear()}`;
        } else if (mode === 'week') {
            const startOfWeek = new Date(focusDate);
            const day = startOfWeek.getDay();
            const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
            startOfWeek.setDate(diff);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            monthName = `SETTIMANA: ${startOfWeek.getDate()} ${startOfWeek.toLocaleString('it-IT', { month: 'short' })} - ${endOfWeek.getDate()} ${endOfWeek.toLocaleString('it-IT', { month: 'short', year: 'numeric' })}`;
        } else if (mode === 'day') {
            monthName = focusDate.toLocaleString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
        }

        let zoomControls = '';
        if ((mode === 'week' || mode === 'day') && isTimeCol) {
            zoomControls = `
                <button class="adv-add-btn" style="border:1px solid var(--border-color); padding:2px 8px; margin-right:10px; color:currentColor;" onclick="AdvancedCalendar.changeZoom(event, '${tableId}', -10)" title="Riduci Zoom Ore">${Icons.zoomOut}</button>
                <button class="adv-add-btn" style="border:1px solid var(--border-color); padding:2px 8px; margin-right:10px; color:currentColor;" onclick="AdvancedCalendar.changeZoom(event, '${tableId}', 10)" title="Aumenta Zoom Ore">${Icons.zoomIn}</button>
            `;
        }

        html += `<div class="adv-cal-nav-bar">
            <div class="adv-cal-nav-group">
                <button class="adv-add-btn" style="padding:4px 8px; border:1px solid var(--border-color); color:currentColor;" onclick="AdvancedCalendar.navigate(event, '${tableId}', -1)">${Icons.chevronLeft}</button>
                <button class="adv-add-btn" style="padding:4px 10px; border:1px solid var(--border-color);" onclick="AdvancedCalendar.navigate(event, '${tableId}', 0)">Oggi</button>
                <button class="adv-add-btn" style="padding:4px 8px; border:1px solid var(--border-color); color:currentColor;" onclick="AdvancedCalendar.navigate(event, '${tableId}', 1)">${Icons.chevronRight}</button>
                <span style="margin-left:10px; font-weight:bold; font-size:1.1rem; color:var(--text-primary);">${monthName}</span>
            </div>
            <div class="adv-cal-view-group">
                ${zoomControls}
                <button class="adv-add-btn" style="border-radius:0; border:none; ${mode === 'year' ? 'background:var(--item-active); color:var(--accent-color); font-weight:bold;' : ''}" onclick="AdvancedCalendar.changeMode(event, '${tableId}', 'year')">Anno</button>
                <button class="adv-add-btn" style="border-radius:0; border:none; border-left:1px solid var(--border-color); border-right:1px solid var(--border-color); ${mode === 'month' ? 'background:var(--item-active); color:var(--accent-color); font-weight:bold;' : ''}" onclick="AdvancedCalendar.changeMode(event, '${tableId}', 'month')">Mese</button>
                <button class="adv-add-btn" style="border-radius:0; border:none; border-right:1px solid var(--border-color); ${mode === 'week' ? 'background:var(--item-active); color:var(--accent-color); font-weight:bold;' : ''}" onclick="AdvancedCalendar.changeMode(event, '${tableId}', 'week')">Settimana</button>
                <button class="adv-add-btn" style="border-radius:0; border:none; ${mode === 'day' ? 'background:var(--item-active); color:var(--accent-color); font-weight:bold;' : ''}" onclick="AdvancedCalendar.changeMode(event, '${tableId}', 'day')">Giorno</button>
            </div>
        </div>`;

        if (selectCol && state.selectOptions[selectCol.id] && mode !== 'year') {
            const activeFilters = state.calendarLegendFilter ||[];
            html += `<div style="display:flex; flex-wrap:wrap; gap:5px; padding:5px 10px; border:1px solid var(--border-color); border-bottom:none; background:var(--sidebar-bg); border-radius:6px 6px 0 0;">`;
            html += `<span style="font-size:0.75rem; color:var(--text-secondary); margin-right:5px; align-self:center;">Filtra per ${selectCol.name}:</span>`;

            state.selectOptions[selectCol.id].forEach(opt => {
                const isActive = activeFilters.includes(opt);
                const colorClass = (state.selectColors && state.selectColors[selectCol.id]) ? state.selectColors[selectCol.id][opt] : '';
                const opacity = (activeFilters.length === 0 || isActive) ? '1' : '0.4';
                const outline = isActive ? 'outline: 2px solid var(--text-primary); outline-offset: 1px;' : '';
                
                const safeOpt = opt.replace(/'/g, "\\'");
                html += `<span class="adv-select-pill ${colorClass}" style="cursor:pointer; opacity:${opacity}; ${outline}" onclick="AdvancedCalendar.toggleLegendFilter('${tableId}', '${safeOpt}')">${opt}</span>`;
            });
            if (activeFilters.length > 0) {
                 html += `<span style="font-size:0.75rem; color:var(--danger-color); cursor:pointer; align-self:center; margin-left:5px;" onclick="AdvancedCalendar.clearLegendFilter('${tableId}')">✕ Rimuovi filtri</span>`;
            }
            html += `</div>`;
        }

        html += `<div class="adv-cal-wrapper" style="touch-action: pan-y; ${selectCol && mode !== 'year' ? 'border-top-left-radius:0; border-top-right-radius:0;' : ''}" onpointerdown="AdvancedCalendar.handlePointerDown(event)" onpointerup="AdvancedCalendar.handlePointerUp(event, '${tableId}')">`;

        // -------------------------------------------------------------
        // CALCOLO DELLE COLONNE VISIBILI (Usato da Month, Week e Day)
        // -------------------------------------------------------------
        const viewId = 'calendar_' + dateColId;
        const hiddenList = state.viewConfig && state.viewConfig[viewId] ? state.viewConfig[viewId].hiddenCols : [];
        const visibleCols = state.columns.filter(c => !c.hidden && !hiddenList.includes(c.id));
        
        // FIX BUG 1: Il titolo è la prima colonna VISIBILE, non la prima assoluta!
        const titleCol = visibleCols.length > 0 ? visibleCols[0] : state.columns[0];
        
        // Le proprietà da mostrare sono tutte le visibili TRANNE il titolo e la data corrente
        const propCols = visibleCols.filter(c => c.id !== titleCol.id && c.id !== dateColId);


        // --- VISTA ANNUALE ---
        if (mode === 'year') {
            const year = focusDate.getFullYear();
            const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
            
            html += `<div class="adv-scroll-container" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 15px; padding: 15px; background: var(--bg-color); max-height: 600px; overflow-y: auto;">`;

            for (let m = 0; m < 12; m++) {
                const firstDay = new Date(year, m, 1);
                const lastDay = new Date(year, m + 1, 0).getDate();
                let startOffset = firstDay.getDay() - 1;
                if (startOffset === -1) startOffset = 6;

                html += `<div style="border: 1px solid var(--border-color); border-radius: 6px; background: var(--sidebar-bg); overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">`;
                
                const targetMs = firstDay.getTime();
                html += `<div onclick="AdvancedCalendar.expandMonthView(event, '${tableId}', ${targetMs})" title="Passa alla vista Mese" style="text-align:center; font-weight:bold; font-size: 0.9rem; padding: 6px; background: rgba(0,0,0,0.03); border-bottom: 1px solid var(--border-color); color: var(--accent-color); cursor: pointer; transition: background 0.2s, opacity 0.2s;" onmouseenter="this.style.opacity='0.7'" onmouseleave="this.style.opacity='1'">${monthNames[m]}</div>`;
                
                html += `<div style="display:grid; grid-template-columns: repeat(7, 1fr); text-align:center; font-size:0.6rem; color:var(--text-secondary); padding: 4px 0; border-bottom: 1px solid var(--border-color);">
                            <div>L</div><div>M</div><div>M</div><div>G</div><div>V</div><div>S</div><div>D</div>
                         </div>`;
                html += `<div style="display:grid; grid-template-columns: repeat(7, 1fr); padding: 4px; gap: 2px;">`;

                // Spazi vuoti per inizio mese
                for (let i = 0; i < startOffset; i++) {
                    html += `<div></div>`;
                }

                // Giorni
                for (let d = 1; d <= lastDay; d++) {
                    const currentGridDate = new Date(year, m, d).setHours(0,0,0,0);
                    const isToday = currentGridDate === new Date().setHours(0,0,0,0);
                    const events = eventsByDate[currentGridDate] || [];
                    const eventCount = events.length;

                    let bgStyle = 'transparent';
                    let textStyle = 'var(--text-primary)';
                    let fw = isToday ? 'bold' : 'normal';
                    let borderStyle = isToday ? '1px solid var(--accent-color)' : '1px solid transparent';
                    let cursorStyle = 'default';
                    let clickEvent = '';

                    if (eventCount > 0) {
                        bgStyle = 'rgba(37, 99, 235, 0.1)';
                        textStyle = 'var(--accent-color)';
                        fw = 'bold';
                        cursorStyle = 'pointer';
                        clickEvent = `onclick="AdvancedCalendar.expandDayView(event, '${tableId}', ${currentGridDate})"`;
                        
                        // Heatmap effect: se ci sono più di 3 eventi, lo sfondo diventa più scuro
                        if (eventCount > 3) bgStyle = 'rgba(37, 99, 235, 0.2)';
                        if (eventCount > 6) bgStyle = 'rgba(37, 99, 235, 0.3)';
                    }

                    html += `
                        <div ${clickEvent} style="aspect-ratio: 1; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:4px; font-size:0.75rem; font-weight:${fw}; color:${textStyle}; background:${bgStyle}; border:${borderStyle}; cursor:${cursorStyle}; transition: transform 0.1s;"
                             ${eventCount > 0 ? `onmouseenter="this.style.transform='scale(1.1)'" onmouseleave="this.style.transform='scale(1)'"` : ''}>
                            ${d}
                            ${eventCount > 0 ? `<div style="font-size:0.5rem; background:var(--danger-color); color:white; border-radius:10px; padding:1px 4px; line-height:1; margin-top:1px;">${eventCount}</div>` : ''}
                        </div>
                    `;
                }

                html += `</div></div>`;
            }

            html += `</div></div>`;
            bodyContainer.innerHTML = html;
            return;
        }

        const renderEventStandard = (r) => {
            let tVal = r.virtualCells[titleCol.id] || 'Senza Titolo';
            if (titleCol.type === 'record_note') {
                const noteObj = typeof Store !== 'undefined' ? Store.getNote(tVal) : null;
                if (noteObj) tVal = noteObj.title || 'Senza Titolo';
            }
            tVal = String(tVal).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            let barColor = 'var(--accent-color)';
            let barBg = 'rgba(37, 99, 235, 0.1)';

            if (selectCol && r.virtualCells[selectCol.id]) {
                const optVal = r.virtualCells[selectCol.id];
                const colorClass = state.selectColors && state.selectColors[selectCol.id] && state.selectColors[selectCol.id][optVal] ? state.selectColors[selectCol.id][optVal] : '';
                if (colorClass.includes('c1')) { barColor = 'var(--tx-c1)'; barBg = 'var(--hl-c1)'; }
                if (colorClass.includes('c2')) { barColor = 'var(--tx-c2)'; barBg = 'var(--hl-c2)'; }
                if (colorClass.includes('c3')) { barColor = 'var(--tx-c3)'; barBg = 'var(--hl-c3)'; }
                if (colorClass.includes('c4')) { barColor = 'var(--tx-c4)'; barBg = 'var(--hl-c4)'; }
                if (colorClass.includes('c5')) { barColor = 'var(--tx-c5)'; barBg = 'var(--hl-c5)'; }
                if (colorClass.includes('c6')) { barColor = 'var(--tx-c6)'; barBg = 'var(--hl-c6)'; }
                if (colorClass.includes('c7')) { barColor = 'var(--tx-c7)'; barBg = 'var(--hl-c7)'; }
                if (colorClass.includes('c8')) { barColor = 'var(--tx-c8)'; barBg = 'var(--hl-c8)'; }
                if (colorClass.includes('c9')) { barColor = 'var(--tx-c9)'; barBg = 'var(--hl-c9)'; }
                if (colorClass.includes('c10')) { barColor = 'var(--tx-c10)'; barBg = 'var(--hl-c10)'; }
            }

            const dragAttrs = isEdit ? `draggable="true" ondragstart="AdvancedCalendar.onDragStart(event, '${tableId}', '${r.id}')"` : '';
            const cursor = isEdit ? 'cursor:grab;' : 'cursor:pointer;';

            let timeLabelHtml = '';
            let timeLabelText = '';
            if (isTimeCol && r._timeStart) {
                const d = new Date(r._timeStart);
                timeLabelText = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                timeLabelHtml = `<span style="opacity:0.6; margin-right:4px;">${timeLabelText}</span>`;
            }

            const tooltipHtml = AdvancedCalendar._buildTooltipHTML(tVal, timeLabelText, r, propCols);

            let wrapperStyle = (mode === 'month') 
                ? 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' 
                : 'white-space: normal; word-break: break-word; line-height: 1.3; height: auto; display: block;';

            let extraPropsHtml = '';
            if (mode !== 'month' && propCols.length > 0) {
                 extraPropsHtml += `<div style="margin-top:4px; border-top:1px solid rgba(0,0,0,0.1); padding-top:4px; display:flex; flex-direction:column; gap:2px;">`;
                 propCols.forEach(pCol => {
                    let pVal = r.virtualCells[pCol.id];
                    if (pVal !== '' && pVal !== null && pVal !== undefined && !(Array.isArray(pVal) && pVal.length === 0)) {
                        let rendered = AdvancedTable.renderCell(tableId, r, pCol, pVal, state, false);
                        rendered = AdvancedCalendar._cleanFormulaRendering(rendered);
                        
                        const safePColName = String(pCol.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        
                        // FIX: Aggiunto display:flex e justify-content:flex-end al wrapper interno per incollare Select e Bottoni a destra
                        extraPropsHtml += `<div style="display:flex; justify-content:space-between; align-items:center; gap:5px; font-size:0.65rem;">
                                            <span style="opacity:0.7; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:40%;">${safePColName}</span>
                                            <div style="flex:1; text-align:right; overflow:hidden; display:flex; justify-content:flex-end; align-items:center;">${rendered}</div>
                                           </div>`;
                    }
                 });
                 extraPropsHtml += `</div>`;
            }

            return `
                <div class="adv-cal-event-std" ${dragAttrs} style="background:${barBg}; border-left:3px solid ${barColor}; ${cursor} ${wrapperStyle}"
                     onclick="AdvancedTable.openRecordView('${tableId}', '${r.id}')" data-tooltip="${tooltipHtml}">
                    ${timeLabelHtml}${tVal}
                    ${extraPropsHtml}
                </div>
            `;
        };

        const renderEventAbsolute = (r, gridDateMs, pxPerHour, colIdx, colCount) => {
            let tVal = r.virtualCells[titleCol.id] || 'Senza Titolo';
            if (titleCol.type === 'record_note') {
                const noteObj = typeof Store !== 'undefined' ? Store.getNote(tVal) : null;
                if (noteObj) tVal = noteObj.title || 'Senza Titolo';
            }
            tVal = String(tVal).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            let barColor = 'var(--accent-color)';
            let barBg = 'rgba(37, 99, 235, 0.15)';
            let textCol = 'var(--text-primary)';

            if (selectCol && r.virtualCells[selectCol.id]) {
                const optVal = r.virtualCells[selectCol.id];
                const colorClass = state.selectColors && state.selectColors[selectCol.id] && state.selectColors[selectCol.id][optVal] ? state.selectColors[selectCol.id][optVal] : '';
                if (colorClass.includes('c1')) { barColor = 'var(--tx-c1)'; barBg = 'var(--hl-c1)'; }
                if (colorClass.includes('c2')) { barColor = 'var(--tx-c2)'; barBg = 'var(--hl-c2)'; }
                if (colorClass.includes('c3')) { barColor = 'var(--tx-c3)'; barBg = 'var(--hl-c3)'; }
                if (colorClass.includes('c4')) { barColor = 'var(--tx-c4)'; barBg = 'var(--hl-c4)'; }
                if (colorClass.includes('c5')) { barColor = 'var(--tx-c5)'; barBg = 'var(--hl-c5)'; }
                if (colorClass.includes('c6')) { barColor = 'var(--tx-c6)'; barBg = 'var(--hl-c6)'; }
                if (colorClass.includes('c7')) { barColor = 'var(--tx-c7)'; barBg = 'var(--hl-c7)'; }
                if (colorClass.includes('c8')) { barColor = 'var(--tx-c8)'; barBg = 'var(--hl-c8)'; }
                if (colorClass.includes('c9')) { barColor = 'var(--tx-c9)'; barBg = 'var(--hl-c9)'; }
                if (colorClass.includes('c10')) { barColor = 'var(--tx-c10)'; barBg = 'var(--hl-c10)'; }
            }

            let sMs = Math.max(r._timeStart, gridDateMs);
            let eMs = Math.min(r._timeEnd, gridDateMs + 86400000);

            let durationHours = (eMs - sMs) / 3600000;
            if (durationHours <= 0) durationHours = 0.5;

            let startHour = (sMs - gridDateMs) / 3600000;

            const topPx = startHour * pxPerHour;
            const heightPx = durationHours * pxPerHour;

            let widthPct = 100 / colCount;
            let leftPct = colIdx * widthPct;

            widthPct = `calc(${widthPct}% - 2px)`;
            leftPct = `calc(${leftPct}% + 1px)`;

            const dragAttrs = isEdit ? `draggable="true" ondragstart="AdvancedCalendar.onDragStart(event, '${tableId}', '${r.id}')"` : '';
            const cursor = isEdit ? 'cursor:grab;' : 'cursor:pointer;';
            const resizeHandle = (isEdit && dateCol.hasEndDate && eMs === r._timeEnd) ?
                `<div style="position:absolute; bottom:0; left:0; right:0; height:8px; cursor:ns-resize; z-index:20;" onmousedown="AdvancedCalendar.startResize(event, '${tableId}', '${r.id}')"></div>` : '';

            const timeLabelText = new Date(sMs).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

            let extraPropsHtml = '';
            if (propCols.length > 0) {
                extraPropsHtml += `<div style="margin-top:4px; border-top:1px solid rgba(0,0,0,0.1); padding-top:4px; display:flex; flex-direction:column; gap:2px; flex-shrink: 0; overflow: hidden;">`;
                propCols.forEach(pCol => {
                    let pVal = r.virtualCells[pCol.id];
                    if (pVal !== '' && pVal !== null && pVal !== undefined && !(Array.isArray(pVal) && pVal.length === 0)) {
                        let rendered = AdvancedTable.renderCell(tableId, r, pCol, pVal, state, false);
                        rendered = AdvancedCalendar._cleanFormulaRendering(rendered);
                        
                        const safePColName = String(pCol.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        
                        // FIX: Aggiunto display:flex e justify-content:flex-end al wrapper interno
                        extraPropsHtml += `<div style="display:flex; justify-content:space-between; align-items:center; gap:5px; font-size:0.65rem;">
                                            <span style="opacity:0.7; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:40%;">${safePColName}</span>
                                            <div style="flex:1; text-align:right; overflow:hidden; display:flex; justify-content:flex-end; align-items:center;">${rendered}</div>
                                           </div>`;
                    }
                });
                extraPropsHtml += `</div>`;
            }

            const tooltipHtml = AdvancedCalendar._buildTooltipHTML(tVal, timeLabelText, r, propCols);

            return `
                <div class="adv-cal-event-abs" ${dragAttrs} style="top:${topPx}px; left:${leftPct}; width:${widthPct}; height:${heightPx}px; background:${barBg}; border:1px solid ${barColor}; color:${textCol}; ${cursor}; display: flex; flex-direction: column; overflow: hidden; justify-content: flex-start;"
                     data-base-height="${heightPx}"
                     onclick="AdvancedTable.openRecordView('${tableId}', '${r.id}')" data-tooltip="${tooltipHtml}">
                    <div class="adv-cal-abs-time" style="flex-shrink:0;">${timeLabelText}</div>
                    <div class="adv-cal-abs-title" style="white-space: normal; word-break: break-word; line-height: 1.2; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis;">${tVal}</div>
                    ${extraPropsHtml}
                    ${resizeHandle}
                </div>
            `;
        };

        const layoutDayEvents = (events) => {
            if (events.length === 0) return[];
            events.sort((a, b) => a._timeStart - b._timeStart || b._timeEnd - a._timeEnd);
            let columns =[];
            events.forEach(ev => {
                let placed = false;
                for (let i = 0; i < columns.length; i++) {
                    const colLastEvent = columns[i][columns[i].length - 1];
                    if (ev._timeStart >= colLastEvent._timeEnd) {
                        columns[i].push(ev);
                        placed = true;
                        break;
                    }
                }
                if (!placed) columns.push([ev]);
            });
            let formattedEvents =[];
            const colCount = columns.length;
            columns.forEach((col, idx) => {
                col.forEach(ev => {
                    formattedEvents.push({ record: ev, colIdx: idx, colCount: colCount });
                });
            });
            return formattedEvents;
        };

        const buildTimeGrid = (pxPerHour) => {
            let gridHtml = `<div style="position:absolute; top:0; left:0; right:0; bottom:0; display:flex; flex-direction:column; pointer-events:none; opacity:0.3; z-index:1;">`;
            for (let h = 0; h < 24; h++) {
                gridHtml += `<div style="height:${pxPerHour}px; min-height:${pxPerHour}px; border-bottom:1px dashed var(--border-color); box-sizing:border-box;"></div>`;
            }
            gridHtml += `</div>`;
            return gridHtml;
        };

        const buildTimeAxis = (pxPerHour) => {
            let axisHtml = `<div style="width:45px; border-right:1px solid var(--border-color); background:var(--sidebar-bg); flex-shrink:0; display:flex; flex-direction:column; min-height:100%;">`;
            for (let h = 0; h < 24; h++) {
                axisHtml += `<div style="height:${pxPerHour}px; min-height:${pxPerHour}px; position:relative; box-sizing:border-box;">
                                <span style="position:absolute; top:-7px; left:0; width:100%; text-align:center; font-size:0.65rem; color:var(--text-secondary);">${h === 0 ? '' : h + ':00'}</span>
                             </div>`;
            }
            axisHtml += `</div>`;
            return axisHtml;
        };

        if (mode === 'month') {
            const year = focusDate.getFullYear();
            const month = focusDate.getMonth();
            const firstDay = new Date(year, month, 1);

            let startOffset = firstDay.getDay() - 1;
            if (startOffset === -1) startOffset = 6;

            const startDate = new Date(firstDay);
            startDate.setDate(startDate.getDate() - startOffset);

            html += `<div class="adv-cal-month-header">
                        <div>LUN</div><div>MAR</div><div>MER</div><div>GIO</div><div>VEN</div><div>SAB</div><div>DOM</div>
                     </div>`;

            html += `<div class="adv-cal-month-grid">`;

            const MAX_MONTH_EVENTS = 3;

            for (let i = 0; i < 42; i++) {
                const currentGridDate = new Date(startDate);
                currentGridDate.setDate(startDate.getDate() + i);
                currentGridDate.setHours(0, 0, 0, 0);

                const isCurrentMonth = currentGridDate.getMonth() === month;
                const isToday = currentGridDate.getTime() === new Date().setHours(0, 0, 0, 0);
                const bg = isCurrentMonth ? 'var(--bg-color)' : 'rgba(0,0,0,0.03)';
                const dayStr = isToday ? `<span style="background:var(--accent-color); color:white; border-radius:50%; width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center;">${currentGridDate.getDate()}</span>` : currentGridDate.getDate();

                const events = eventsByDate[currentGridDate.getTime()] ||[];
                
                const dblClick = isEdit ? `ondblclick="AdvancedCalendar.createRecord(event, '${tableId}', '${currentGridDate.getTime()}')"` : '';
                const dropHandlers = isEdit ? `class="adv-cal-droppable" ondragover="AdvancedCalendar.onDragOver(event)" ondragleave="AdvancedCalendar.onDragLeave(event)" ondrop="AdvancedCalendar.onDrop(event, '${tableId}', '${currentGridDate.getTime()}')"` : '';

                let eventsHtml = '';
                for(let k = 0; k < Math.min(events.length, MAX_MONTH_EVENTS); k++) {
                    eventsHtml += renderEventStandard(events[k]);
                }
                
                if (events.length > MAX_MONTH_EVENTS) {
                    eventsHtml += `<div class="adv-cal-more-btn" style="font-size:0.75rem; color:var(--text-secondary); cursor:pointer; padding:2px; text-align:center; font-weight:bold; background: rgba(0,0,0,0.05); border-radius:3px; margin-top:2px;" onclick="AdvancedCalendar.expandDayView(event, '${tableId}', ${currentGridDate.getTime()})">+ ${events.length - MAX_MONTH_EVENTS} altri...</div>`;
                }

                html += `<div class="adv-cal-day-cell" ${dropHandlers} ${dblClick} style="background:${bg};">
                            <div class="adv-cal-day-label" style="color:${isCurrentMonth ? 'var(--text-primary)' : 'var(--text-secondary)'}; font-weight:${isToday ? 'bold' : 'normal'};">${dayStr}</div>
                            <div class="adv-cal-day-content">
                                ${eventsHtml}
                            </div>
                         </div>`;
            }
            html += `</div>`;
        }
        else if (mode === 'week') {
            const pxPerHour = state.calendarZoom || 40;
            const startOfWeek = new Date(focusDate);
            const day = startOfWeek.getDay();
            const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
            startOfWeek.setDate(diff);
            startOfWeek.setHours(0, 0, 0, 0);

            html += `<div class="adv-cal-week-container">`;

            html += `<div class="adv-cal-week-header">`;
            if (isTimeCol) html += `<div style="width:45px; flex-shrink:0; border-right:1px solid var(--border-color);"></div>`;
            html += `<div class="adv-cal-week-days">`;

            const daysNames =['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
            for (let i = 0; i < 7; i++) {
                const currentGridDate = new Date(startOfWeek);
                currentGridDate.setDate(startOfWeek.getDate() + i);
                const isToday = currentGridDate.getTime() === new Date().setHours(0, 0, 0, 0);
                const dayStr = isToday ? `<span style="background:var(--accent-color); color:white; border-radius:50%; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center;">${currentGridDate.getDate()}</span>` : currentGridDate.getDate();

                html += `<div style="padding:10px; text-align:center; background:var(--sidebar-bg);">
                            <div style="font-size:0.75rem; font-weight:bold; color:var(--text-secondary); text-transform:uppercase;">${daysNames[i]}</div>
                            <div style="font-size:1.2rem; font-weight:${isToday ? 'bold' : 'normal'}; color:${isToday ? 'var(--accent-color)' : 'var(--text-primary)'}; display:flex; justify-content:center; align-items:center; margin-top:2px;">${dayStr}</div>
                         </div>`;
            }
            html += `</div></div>`;

            html += `<div class="adv-scroll-container" style="display:flex; flex:1; overflow-y:auto; background:var(--bg-color); position:relative;">`;
            if (isTimeCol) html += buildTimeAxis(pxPerHour);

            html += `<div class="adv-cal-week-body" style="${isTimeCol ? `height:${pxPerHour * 24}px;` : 'height:100%;'}">`;

            for (let i = 0; i < 7; i++) {
                const currentGridDate = new Date(startOfWeek);
                currentGridDate.setDate(startOfWeek.getDate() + i);
                const events = eventsByDate[currentGridDate.getTime()] ||[];
                
                const dblClick = isEdit ? `ondblclick="AdvancedCalendar.createRecord(event, '${tableId}', '${currentGridDate.getTime()}', ${isTimeCol ? pxPerHour : 'null'})"` : '';
                const dropHandlers = isEdit ? `class="adv-cal-droppable" ondragover="AdvancedCalendar.onDragOver(event)" ondragleave="AdvancedCalendar.onDragLeave(event)" ondrop="AdvancedCalendar.onDrop(event, '${tableId}', '${currentGridDate.getTime()}')"` : '';

                html += `<div ${dropHandlers} ${dblClick} style="background:var(--bg-color); position:relative; transition:box-shadow 0.2s;">`;
                if (isTimeCol) {
                    html += buildTimeGrid(pxPerHour);
                    const formattedEvents = layoutDayEvents(events);
                    html += `<div style="position:relative; width:100%; height:100%; z-index:5;">${formattedEvents.map(e => renderEventAbsolute(e.record, currentGridDate.getTime(), pxPerHour, e.colIdx, e.colCount)).join('')}</div>`;
                } else {
                    html += `<div style="padding:10px; height:100%; overflow-y:auto;">${events.map(e => renderEventStandard(e)).join('')}</div>`;
                }
                html += `</div>`;
            }
            html += `</div></div></div>`;
        }
        else if (mode === 'day') {
            const pxPerHour = state.calendarZoom || 40;
            const targetTime = new Date(focusDate).setHours(0, 0, 0, 0);
            const events = eventsByDate[targetTime] ||[];

            html += `<div style="display:flex; flex-direction:row; height:600px; overflow-y:auto; border-top:1px solid var(--border-color);">`;

            if (isTimeCol) html += buildTimeAxis(pxPerHour);

            const dblClick = isEdit ? `ondblclick="AdvancedCalendar.createRecord(event, '${tableId}', '${targetTime}', ${isTimeCol ? pxPerHour : 'null'})"` : '';

            html += `<div style="flex:1; position:relative; background:var(--bg-color);" ${dblClick} ${isEdit ? `class="adv-cal-droppable" ondragover="AdvancedCalendar.onDragOver(event)" ondragleave="AdvancedCalendar.onDragLeave(event)" ondrop="AdvancedCalendar.onDrop(event, '${tableId}', '${targetTime}')"` : ''}>`;

            if (isTimeCol) {
                html += buildTimeGrid(pxPerHour);
                const formattedEvents = layoutDayEvents(events);
                html += `<div style="position:relative; width:100%; height:${pxPerHour * 24}px; z-index:5;">${formattedEvents.map(e => renderEventAbsolute(e.record, targetTime, pxPerHour, e.colIdx, e.colCount)).join('')}</div>`;
            } else {
                if (events.length === 0) {
                    html += `<div style="text-align:center; color:var(--text-secondary); margin-top:40px; pointer-events:none;">Nessun elemento programmato per questa data. Clicca due volte per aggiungerne uno.</div>`;
                } else {
                    html += `<div style="display:flex; flex-direction:column; gap:10px; max-width:800px; margin:20px auto; pointer-events:auto;">${events.map(e => renderEventStandard(e)).join('')}</div>`;
                }
            }

            html += `</div></div>`;
        }

        html += `</div>`;

        if (unscheduledRows.length > 0) {
            html += `<div style="margin-top:15px; font-size:0.8rem; color:var(--text-secondary);">
                        <b><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.alertTriangle} Elementi senza data (${unscheduledRows.length}):</b></span> 
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

        if (prevScrollX > 0 || prevScrollY > 0) {
            const newScroll = bodyContainer.querySelector('.adv-scroll-container, .adv-cal-week-container .adv-scroll-container,[style*="overflow-y:auto"]');
            if (newScroll) {
                newScroll.scrollLeft = prevScrollX;
                newScroll.scrollTop = prevScrollY;
            }
        }
    }
};