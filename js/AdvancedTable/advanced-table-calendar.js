/**
 * AdvancedTableCalendar.js
 * Modulo per la Vista Calendario dei Database.
 * FIX COLONNE NASCOSTE: L'etichetta dell'evento è ora dinamicamente assegnata alla PRIMA COLONNA VISIBILE e non hardcodata.
 * FEAT UX: Nomi dei mesi cliccabili nella Vista Annuale per navigare rapidamente alla Vista Mensile corrispondente.
 * FIX ALLINEAMENTO: Risolto bug delle Regex in _cleanFormulaRendering che lasciava Select e Pulsanti disallineati a sinistra nelle Card temporali.
 * FEAT QUICK SEARCH: Integrata la ricerca rapida universale 'Cerca in tutti i campi' con riuso atomico delle virtualCells.
 * FIX LAYOUT CARD & SCROLLBARS: Rimozione del pulsante di espansione testo nelle card, layout verticale per testi lunghi,
 * troncamento a 200 caratteri in vista settimanale, scroll automatico al mese corrente in vista Anno, rimozione limite 800px
 * e padding 5px in vista Giorno, scrollbar coerenti col tema e isolamento Drag & Drop su date con intervallo.
 * FEAT CHRONO & DAY JUMP: Ordinamento cronologico rigoroso per ora in tutte le viste, apertura del giorno al click su
 * etichetta/header in vista Mensile e Settimanale, e auto-scroll intelligente sugli orari degli eventi in vista Settimanale e Giornaliera.
 */

const AdvancedCalendar = {
    resizeState: null,
    touchStartX: 0,
    touchStartY: 0,
    _resetScrollOnNextRender: false,

    changeMode: (e, tableId, mode) => {
        if (e) e.stopPropagation();
        let state = AdvancedTable.getState(tableId);
        state.calendarMode = mode;
        AdvancedCalendar._resetScrollOnNextRender = true;
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
        AdvancedCalendar._resetScrollOnNextRender = true;
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
    },

    handlePointerDown: (e) => {
        if (e.target.closest('.adv-cal-event-std, .adv-cal-event-abs, button, .adv-add-btn, .adv-cal-more-btn, .adv-select-pill, .adv-quick-search-wrapper')) return;
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
        if (!state.calendarLegendFilter) state.calendarLegendFilter = [];
        
        const idx = state.calendarLegendFilter.indexOf(option);
        if (idx > -1) state.calendarLegendFilter.splice(idx, 1);
        else state.calendarLegendFilter.push(option);
        
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
    },

    clearLegendFilter: (tableId) => {
        let state = AdvancedTable.getState(tableId);
        state.calendarLegendFilter = [];
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
    },

    expandDayView: (e, tableId, ms) => {
        if (e) e.stopPropagation();
        let state = AdvancedTable.getState(tableId);
        state.calendarMode = 'day';
        state.calendarFocusDate = ms;
        AdvancedCalendar._resetScrollOnNextRender = true;
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
    },

    expandMonthView: (e, tableId, ms) => {
        if (e) e.stopPropagation();
        let state = AdvancedTable.getState(tableId);
        state.calendarMode = 'month';
        state.calendarFocusDate = ms;
        AdvancedCalendar._resetScrollOnNextRender = true;
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
        if (e.target.closest('.adv-cal-event-std, .adv-cal-event-abs, .adv-cal-more-btn, .adv-cal-day-label, .adv-quick-search-wrapper')) return;
        
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
        e.stopPropagation();

        const rect = e.currentTarget.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({ tableId, rowId, offsetY }));
        e.currentTarget.style.opacity = '0.5';
    },

    onDragEnd: (e) => {
        if (e && e.currentTarget) e.currentTarget.style.opacity = '1';
        document.querySelectorAll('.adv-cal-droppable').forEach(el => {
            el.style.boxShadow = 'none';
        });
    },

    onDragOver: (e) => {
        e.preventDefault();
        e.stopPropagation();
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
        e.stopPropagation();
        if (e.currentTarget.classList.contains('adv-cal-droppable')) {
            e.currentTarget.style.boxShadow = 'none';
        }

        try {
            const rawData = e.dataTransfer.getData('text/plain');
            if (!rawData) return;
            const data = JSON.parse(rawData);
            if (!data || data.tableId !== targetTableId) return;

            const realTableId = AdvancedTable._resolveSourceId(targetTableId);
            const state = AdvancedTable.getState(realTableId);
            const viewState = AdvancedTable.getState(targetTableId);
            if (!state || !viewState) return;

            const row = state.rows.find(r => r.id === data.rowId);
            if (!row) return;

            const dateCol = state.columns.find(c => c.id === viewState.calendarDateCol);
            if (!dateCol) return;

            const parseLocalMs = (val) => {
                if (!val) return null;
                const str = String(val).trim();
                const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (m) {
                    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)).getTime();
                }
                const t = new Date(str).getTime();
                return isNaN(t) ? null : t;
            };

            const formatDateValue = (dObj, colType) => {
                if (colType === 'datetime') {
                    const c = new Date(dObj.getTime());
                    c.setMinutes(c.getMinutes() - c.getTimezoneOffset());
                    return c.toISOString().slice(0, 16);
                }
                const yyyy = dObj.getFullYear();
                const mm = String(dObj.getMonth() + 1).padStart(2, '0');
                const dd = String(dObj.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            };

            const newDate = new Date(Number(timestampMs));
            const viewMode = viewState.calendarMode || 'month';

            let oldStartMs = null;
            let oldEndMs = null;
            const currentCell = row.cells[dateCol.id];

            if (currentCell && typeof currentCell === 'object') {
                if (currentCell.start) oldStartMs = parseLocalMs(currentCell.start);
                if (currentCell.end) oldEndMs = parseLocalMs(currentCell.end);
            } else if (currentCell) {
                oldStartMs = parseLocalMs(currentCell);
            }

            let deltaMs = 0;

            if (dateCol.type === 'datetime' && viewMode !== 'month' && viewMode !== 'year') {
                const pxPerHour = viewState.calendarZoom || 40;
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

            if (oldStartMs !== null) {
                deltaMs = newDate.getTime() - oldStartMs;
            }

            const formattedStart = formatDateValue(newDate, dateCol.type);

            if (!currentCell || typeof currentCell !== 'object') {
                if (dateCol.hasEndDate) {
                    row.cells[dateCol.id] = { start: formattedStart, end: formattedStart };
                } else {
                    row.cells[dateCol.id] = formattedStart;
                }
            } else {
                row.cells[dateCol.id].start = formattedStart;
                if (oldEndMs !== null && dateCol.hasEndDate) {
                    if (dateCol.type === 'date') {
                        const daysDiff = Math.round(deltaMs / 86400000);
                        const newEnd = new Date(oldEndMs);
                        newEnd.setDate(newEnd.getDate() + daysDiff);
                        row.cells[dateCol.id].end = formatDateValue(newEnd, 'date');
                    } else {
                        const newEnd = new Date(oldEndMs + deltaMs);
                        row.cells[dateCol.id].end = formatDateValue(newEnd, 'datetime');
                    }
                }
            }

            row.updatedAt = Date.now();
            if (typeof AdvancedTable.buildVirtualRow === 'function') {
                const freshVRow = AdvancedTable.buildVirtualRow(realTableId, row, state);
                row.virtualCells = freshVRow.virtualCells;
            }

            AdvancedTable.setState(realTableId, state);
            AdvancedTable.updateDependentViews(realTableId);
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
     * CLEAN FORMULA RENDERING (CSS Injection & Action Cleanup)
     * Riscrive l'HTML generato da renderCell() per adattarlo alle card temporali:
     * rimuove il pulsante di espansione testo lungo, rimuove il line-clamp e gestisce l'allineamento.
     */
    _cleanFormulaRendering: (htmlStr, alignLeft = false) => {
        let cleaned = htmlStr;

        // 1. Rimuove il pulsante di espansione testo lungo (ridondante nella card calendario)
        cleaned = cleaned.replace(/<button[^>]*openLongTextModal[^>]*>[\s\S]*?<\/button>/gi, '');

        // 2. Rimuove il troncamento forzato (-webkit-line-clamp) per permettere la lettura del contenuto
        cleaned = cleaned.replace(/-webkit-line-clamp\s*:\s*[^;]+;?/gi, '');
        cleaned = cleaned.replace(/-webkit-box-orient\s*:\s*[^;]+;?/gi, '');
        cleaned = cleaned.replace(/display\s*:\s*-webkit-box;?/gi, 'display: block;');

        // 3. Gestione allineamento (a sinistra per testi lunghi impilati sotto la label, a destra per valori compatti)
        if (alignLeft) {
            cleaned = cleaned.replace(/justify-content:\s*flex-end/gi, 'justify-content: flex-start');
            cleaned = cleaned.replace(/class=["']([^"']*?\badv-select-container\b[^"']*)["']/g, 'class="$1" style="justify-content:flex-start; width:100%; margin:0;"');
            cleaned = cleaned.replace(/class=["']([^"']*?\badv-cell-text\b[^"']*)["']/g, 'class="$1" style="text-align:left; width:100%; margin:0; white-space:pre-wrap; word-break:break-word;"');
            cleaned = cleaned.replace(/class=["']([^"']*?\badv-cell-number\b[^"']*)["']/g, 'class="$1" style="text-align:left; width:100%; margin:0;"');
        } else {
            cleaned = cleaned.replace(/justify-content:\s*flex-start/gi, 'justify-content: flex-end');
            cleaned = cleaned.replace(/justify-content:\s*center/gi, 'justify-content: flex-end');
            cleaned = cleaned.replace(/class=["']([^"']*?\badv-select-container\b[^"']*)["']/g, 'class="$1" style="justify-content:flex-end; width:100%; margin:0;"');
            cleaned = cleaned.replace(/class=["']([^"']*?\badv-cell-text\b[^"']*)["']/g, 'class="$1" style="text-align:right; width:100%; margin:0;"');
            cleaned = cleaned.replace(/class=["']([^"']*?\badv-cell-number\b[^"']*)["']/g, 'class="$1" style="text-align:right; width:100%; margin:0;"');
        }

        // 4. Pulisce eventuali sfondi ereditati dalla griglia ReadOnly
        cleaned = cleaned.replace(/background:\s*rgba\(0,\s*0,\s*0,\s*0\.02\);?/gi, '');
        cleaned = cleaned.replace(/adv-cell-readonly/g, '');
        return cleaned;
    },

    _renderPropRowsHtml: (tableId, r, propCols, state, mode) => {
        if (!propCols || propCols.length === 0) return '';
        let rowsHtml = '';

        propCols.forEach(pCol => {
            let pVal = r.virtualCells[pCol.id];
            if (pVal === '' || pVal === null || pVal === undefined || (Array.isArray(pVal) && pVal.length === 0)) return;

            const displayStr = AdvancedTable.getFormatDisplayValue(pCol, pVal) || '';
            const isErrorToken = typeof pVal === 'string' && pVal.startsWith('ERROR:');
            const isTextualType = ['text', 'url', 'formula', 'rollup'].includes(pCol.type);
            const isLongTextProp = isTextualType &&
                !isErrorToken &&
                (displayStr.length > 50 || displayStr.includes('\n'));

            // Nella visualizzazione settimanale tronca i testi oltre 200 caratteri (il testo integrale resta in tooltip e pannello record)
            let cellValToRender = pVal;
            let cellColToRender = pCol;
            if (mode === 'week' && isTextualType && !isErrorToken && displayStr.length > 200) {
                cellValToRender = displayStr.slice(0, 200).trimEnd() + '...';
                if (pCol.type === 'url') {
                    cellColToRender = { ...pCol, type: 'text' };
                }
            }

            let rendered = AdvancedTable.renderCell(tableId, r, cellColToRender, cellValToRender, state, false);
            rendered = AdvancedCalendar._cleanFormulaRendering(rendered, isLongTextProp);

            const safePColName = String(pCol.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            if (isLongTextProp) {
                rowsHtml += `
                    <div style="display:flex; flex-direction:column; align-items:stretch; gap:2px; font-size:0.65rem;">
                        <span style="opacity:0.7; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${safePColName}</span>
                        <div style="width:100%; text-align:left; overflow:hidden;">${rendered}</div>
                    </div>
                `;
            } else {
                rowsHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:5px; font-size:0.65rem;">
                        <span style="opacity:0.7; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:40%;">${safePColName}</span>
                        <div style="flex:1; text-align:right; overflow:hidden; display:flex; justify-content:flex-end; align-items:center;">${rendered}</div>
                    </div>
                `;
            }
        });

        return rowsHtml;
    },

    render: (tableId, wrapper, state) => {
        const dateColId = state.calendarDateCol;
        const dateCol = state.columns.find(c => c.id === dateColId);

        if (!dateCol || !['date', 'datetime'].includes(dateCol.type)) {
            state.viewType = 'table';
            AdvancedTable.setState(tableId, state);
            return AdvancedTable._renderAsTable(wrapper, state, tableId);
        }

        const currentLocale = (typeof I18n !== 'undefined' && I18n.currentLang) ? I18n.currentLang : 'it';
        const isCited = tableId.includes('_cited_');
        const isEdit = AppState.isEditMode && !isCited;

        let bodyContainer = wrapper.querySelector('.widget-body');
        if (!bodyContainer) {
            wrapper.innerHTML = `
                <div class="widget-header adv-table-header">
                    <span class="widget-drag-handle adv-drag-handle" title="${I18n.t('widget_manager.drag_to_move')}" draggable="true" style="${isEdit ? 'display:flex;' : 'display:none;'}">${Icons.dragHandle}</span>
                    <span class="widget-options-btn adv-drag-handle" title="${I18n.t('widget_manager.options')}" style="${isEdit ? 'display:flex;' : 'display:none;'}">${Icons.dotsVertical}</span>
                    <span class="widget-icon" style="display:inline-flex;"></span>
                    <span class="widget-title adv-table-title" contenteditable="${isEdit ? 'true' : 'false'}" style="flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 50px;">${I18n.t('widget_manager.loading')}</span>
                    <div class="widget-tools adv-tools" style="flex-shrink: 0;"></div>
                </div>
                <div class="widget-body"></div>
            `;
            bodyContainer = wrapper.querySelector('.widget-body');
        }

        let prevScrollX = 0, prevScrollY = 0;
        if (AdvancedCalendar._resetScrollOnNextRender) {
            AdvancedCalendar._resetScrollOnNextRender = false;
        } else {
            const existingScroll = bodyContainer.querySelector('.adv-scroll-container, .adv-cal-week-container .adv-scroll-container,[style*="overflow-y:auto"]');
            if (existingScroll) {
                prevScrollX = existingScroll.scrollLeft;
                prevScrollY = existingScroll.scrollTop;
            }
        }

        const mode = state.calendarMode || 'month';
        const currentMs = state.calendarFocusDate ? Number(state.calendarFocusDate) : Date.now();
        const focusDate = new Date(currentMs);
        const isTimeCol = dateCol.type === 'datetime';

        const hasFilter = state.filters && Object.keys(state.filters).some(k => state.filters[k].trim() !== '');
        const hasSort = state.sorts && state.sorts.length > 0;
        let hasActiveAuto = state.automations && state.automations.some(a => a.active);

        if (typeof WidgetManager !== 'undefined') {
            const tools = [];
            tools.push({ id: `adv-view-btn-${tableId}`, icon: Icons.viewCalendar, label: I18n.t('adv_board.calendar_view'), onClick: AdvancedBoard.openViewMenu });
            if (!state.isLinkedView) {
                tools.push({ icon: Icons.lightning, active: hasActiveAuto, editOnly: true, title: I18n.t('table.automations'), onClick: AdvancedAutomations.openPanel });
            }

            // TOOL: RICERCA RAPIDA UNIVERSALE (FULL-TEXT OR)
            tools.push({ 
                id: `adv-search-btn-${tableId}`, 
                icon: Icons.search, 
                title: I18n.t('adv_search.title'), 
                active: !!state.showQuickSearch, 
                editOnly: false, 
                onClick: () => AdvancedTable.toggleQuickSearch(tableId) 
            });

            tools.push({ id: `adv-sort-btn-${tableId}`, icon: Icons.sort, title: I18n.t('table.sort'), active: hasSort, onClick: AdvancedTable.openSortMenu });
            tools.push({ id: `adv-filter-btn-${tableId}`, icon: Icons.filter, title: I18n.t('table.filter'), active: hasFilter, onClick: AdvancedTable.openFilterMenu });

            WidgetManager.updateShellUI(tableId, {
                icon: state.isLinkedView ? Icons.link : '',
                title: state.title || I18n.t('editor.database'),
                optionsId: `adv-opt-btn-${tableId}`,
                tools: tools,
                onTitleChange: AdvancedTable.updateTitle,
                onOptionsClick: state.isLinkedView ? AdvancedPivotMenus.openOptions : AdvancedTableMenus.openTableOptions,
                onDragStart: AdvancedTable.onTableDragStart,
                onDragEnd: AdvancedTable.onTableDragEnd
            });
        }

        let html = '';

        // Iniezione barra di ricerca rapida a scomparsa
        html += AdvancedTable.renderQuickSearchBar(tableId, state);

        const parseCalendarDateMs = (val) => {
            if (!val) return NaN;
            const str = String(val).trim();
            const dateOnly = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (dateOnly) {
                return new Date(parseInt(dateOnly[1], 10), parseInt(dateOnly[2], 10) - 1, parseInt(dateOnly[3], 10)).getTime();
            }
            return new Date(str).getTime();
        };

        let viewRows = [];
        const renderCache = {};
        state.rows.forEach(r => {
            let vRow = r.virtualCells ? r : AdvancedTable.buildVirtualRow(tableId, r, state, renderCache);
            if (!r.virtualCells) r.virtualCells = vRow.virtualCells;

            let rawDate = vRow.virtualCells[dateColId];
            let parsedStart = null, parsedEnd = null;

            if (rawDate && typeof rawDate === 'string') {
                parsedStart = parseCalendarDateMs(rawDate);
                parsedEnd = parsedStart;
            } else if (rawDate && typeof rawDate === 'object') {
                if (rawDate.start) parsedStart = parseCalendarDateMs(rawDate.start);
                if (rawDate.end) parsedEnd = parseCalendarDateMs(rawDate.end);
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
        let unscheduledRows = [];

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

        // Ordinamento cronologico garantito per orario di inizio in ogni giornata (per tutte le viste)
        Object.keys(eventsByDate).forEach(dayKey => {
            eventsByDate[dayKey].sort((a, b) => a._timeStart - b._timeStart || a._timeEnd - b._timeEnd);
        });

        let monthName = focusDate.toLocaleString(currentLocale, { month: 'long', year: 'numeric' }).toUpperCase();
        if (mode === 'year') {
            monthName = I18n.t('calendar_view.year_header', { year: focusDate.getFullYear() });
        } else if (mode === 'week') {
            const startOfWeek = new Date(focusDate);
            const day = startOfWeek.getDay();
            const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
            startOfWeek.setDate(diff);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            const rangeStr = `${startOfWeek.getDate()} ${startOfWeek.toLocaleString(currentLocale, { month: 'short' })} - ${endOfWeek.getDate()} ${endOfWeek.toLocaleString(currentLocale, { month: 'short', year: 'numeric' })}`;
            monthName = I18n.t('calendar_view.week_header', { range: rangeStr });
        } else if (mode === 'day') {
            monthName = focusDate.toLocaleString(currentLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
        }

        let zoomControls = '';
        if ((mode === 'week' || mode === 'day') && isTimeCol) {
            zoomControls = `
                <button class="adv-add-btn" style="border:1px solid var(--border-color); padding:2px 8px; margin-right:10px; color:currentColor;" onclick="AdvancedCalendar.changeZoom(event, '${tableId}', -10)" title="${I18n.t('calendar_view.zoom_out_hours')}">${Icons.zoomOut}</button>
                <button class="adv-add-btn" style="border:1px solid var(--border-color); padding:2px 8px; margin-right:10px; color:currentColor;" onclick="AdvancedCalendar.changeZoom(event, '${tableId}', 10)" title="${I18n.t('calendar_view.zoom_in_hours')}">${Icons.zoomIn}</button>
            `;
        }

        html += `<div class="adv-cal-nav-bar">
            <div class="adv-cal-nav-group">
                <button class="adv-add-btn" style="padding:4px 8px; border:1px solid var(--border-color); color:currentColor;" onclick="AdvancedCalendar.navigate(event, '${tableId}', -1)">${Icons.chevronLeft}</button>
                <button class="adv-add-btn" style="padding:4px 10px; border:1px solid var(--border-color);" onclick="AdvancedCalendar.navigate(event, '${tableId}', 0)">${I18n.t('calendar_view.today')}</button>
                <button class="adv-add-btn" style="padding:4px 8px; border:1px solid var(--border-color); color:currentColor;" onclick="AdvancedCalendar.navigate(event, '${tableId}', 1)">${Icons.chevronRight}</button>
                <span style="margin-left:10px; font-weight:bold; font-size:1.1rem; color:var(--text-primary);">${monthName}</span>
            </div>
            <div class="adv-cal-view-group">
                ${zoomControls}
                <button class="adv-add-btn" style="border-radius:0; border:none; ${mode === 'year' ? 'background:var(--item-active); color:var(--accent-color); font-weight:bold;' : ''}" onclick="AdvancedCalendar.changeMode(event, '${tableId}', 'year')">${I18n.t('calendar_view.year')}</button>
                <button class="adv-add-btn" style="border-radius:0; border:none; border-left:1px solid var(--border-color); border-right:1px solid var(--border-color); ${mode === 'month' ? 'background:var(--item-active); color:var(--accent-color); font-weight:bold;' : ''}" onclick="AdvancedCalendar.changeMode(event, '${tableId}', 'month')">${I18n.t('calendar_view.month')}</button>
                <button class="adv-add-btn" style="border-radius:0; border:none; border-right:1px solid var(--border-color); ${mode === 'week' ? 'background:var(--item-active); color:var(--accent-color); font-weight:bold;' : ''}" onclick="AdvancedCalendar.changeMode(event, '${tableId}', 'week')">${I18n.t('calendar_view.week')}</button>
                <button class="adv-add-btn" style="border-radius:0; border:none; ${mode === 'day' ? 'background:var(--item-active); color:var(--accent-color); font-weight:bold;' : ''}" onclick="AdvancedCalendar.changeMode(event, '${tableId}', 'day')">${I18n.t('calendar_view.day')}</button>
            </div>
        </div>`;

        if (selectCol && state.selectOptions[selectCol.id] && mode !== 'year') {
            const activeFilters = state.calendarLegendFilter || [];
            html += `<div style="display:flex; flex-wrap:wrap; gap:5px; padding:5px 10px; border:1px solid var(--border-color); border-bottom:none; background:var(--sidebar-bg); border-radius:6px 6px 0 0;">`;
            html += `<span style="font-size:0.75rem; color:var(--text-secondary); margin-right:5px; align-self:center;">${I18n.t('calendar_view.filter_by', { name: selectCol.name })}</span>`;

            state.selectOptions[selectCol.id].forEach(opt => {
                const isActive = activeFilters.includes(opt);
                const colorClass = (state.selectColors && state.selectColors[selectCol.id]) ? state.selectColors[selectCol.id][opt] : '';
                const opacity = (activeFilters.length === 0 || isActive) ? '1' : '0.4';
                const outline = isActive ? 'outline: 2px solid var(--text-primary); outline-offset: 1px;' : '';
                
                const safeOpt = opt.replace(/'/g, "\\'");
                html += `<span class="adv-select-pill ${colorClass}" style="cursor:pointer; opacity:${opacity}; ${outline}" onclick="AdvancedCalendar.toggleLegendFilter('${tableId}', '${safeOpt}')">${opt}</span>`;
            });
            if (activeFilters.length > 0) {
                 html += `<span style="font-size:0.75rem; color:var(--danger-color); cursor:pointer; align-self:center; margin-left:5px;" onclick="AdvancedCalendar.clearLegendFilter('${tableId}')">${I18n.t('calendar_view.clear_filters')}</span>`;
            }
            html += `</div>`;
        }

        html += `<div class="adv-cal-wrapper" style="touch-action: pan-y; ${selectCol && mode !== 'year' ? 'border-top-left-radius:0; border-top-right-radius:0;' : ''}" onpointerdown="AdvancedCalendar.handlePointerDown(event)" onpointerup="AdvancedCalendar.handlePointerUp(event, '${tableId}')">`;

        // Calcolo delle colonne visibili
        const viewId = 'calendar_' + dateColId;
        const hiddenList = state.viewConfig && state.viewConfig[viewId] ? state.viewConfig[viewId].hiddenCols : [];
        const visibleCols = state.columns.filter(c => !c.hidden && !hiddenList.includes(c.id));
        const titleCol = visibleCols.length > 0 ? visibleCols[0] : state.columns[0];
        const propCols = visibleCols.filter(c => c.id !== titleCol.id && c.id !== dateColId);

        // --- VISTA ANNUALE ---
        if (mode === 'year') {
            const year = focusDate.getFullYear();
            const daysInitials = (I18n.dict[currentLocale]?.calendar_view?.days_initials) || ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
            
            html += `<div class="adv-scroll-container adv-cal-year-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 15px; padding: 15px; background: var(--bg-color); max-height: 600px; overflow-y: auto; position: relative;">`;

            for (let m = 0; m < 12; m++) {
                const firstDay = new Date(year, m, 1);
                const monthDisplayTitle = firstDay.toLocaleString(currentLocale, { month: 'long' });
                const capitalMonthTitle = monthDisplayTitle.charAt(0).toUpperCase() + monthDisplayTitle.slice(1);
                const lastDay = new Date(year, m + 1, 0).getDate();
                let startOffset = firstDay.getDay() - 1;
                if (startOffset === -1) startOffset = 6;

                html += `<div data-cal-month="${m}" style="border: 1px solid var(--border-color); border-radius: 6px; background: var(--sidebar-bg); overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">`;
                
                const targetMs = firstDay.getTime();
                html += `<div onclick="AdvancedCalendar.expandMonthView(event, '${tableId}', ${targetMs})" title="${I18n.t('calendar_view.switch_to_month')}" style="text-align:center; font-weight:bold; font-size: 0.9rem; padding: 6px; background: rgba(0,0,0,0.03); border-bottom: 1px solid var(--border-color); color: var(--accent-color); cursor: pointer; transition: background 0.2s, opacity 0.2s;" onmouseenter="this.style.opacity='0.7'" onmouseleave="this.style.opacity='1'">${capitalMonthTitle}</div>`;
                
                html += `<div style="display:grid; grid-template-columns: repeat(7, 1fr); text-align:center; font-size:0.6rem; color:var(--text-secondary); padding: 4px 0; border-bottom: 1px solid var(--border-color);">
                            ${daysInitials.map(di => `<div>${di}</div>`).join('')}
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

            // Scorrimento automatico al mese corrente (o preservazione dello scroll manuale precedente)
            const yearScroll = bodyContainer.querySelector('.adv-cal-year-grid');
            if (yearScroll) {
                if (prevScrollY > 0) {
                    yearScroll.scrollTop = prevScrollY;
                } else {
                    const now = new Date();
                    if (year === now.getFullYear()) {
                        const currentMonthCard = yearScroll.querySelector(`[data-cal-month="${now.getMonth()}"]`);
                        if (currentMonthCard) {
                            yearScroll.scrollTop = Math.max(0, currentMonthCard.offsetTop - 15);
                        }
                    }
                }
            }
            return;
        }

        const renderEventStandard = (r) => {
            let tVal = r.virtualCells[titleCol.id] || I18n.t('editor.untitled');
            if (titleCol.type === 'record_note') {
                const noteObj = typeof Store !== 'undefined' ? Store.getNote(tVal) : null;
                if (noteObj) tVal = noteObj.title || I18n.t('editor.untitled');
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

            const dragAttrs = isEdit ? `draggable="true" ondragstart="AdvancedCalendar.onDragStart(event, '${tableId}', '${r.id}')" ondragend="AdvancedCalendar.onDragEnd(event)"` : '';
            const cursor = isEdit ? 'cursor:grab;' : 'cursor:pointer;';

            let timeLabelHtml = '';
            let timeLabelText = '';
            if (isTimeCol && r._timeStart) {
                const d = new Date(r._timeStart);
                timeLabelText = d.toLocaleTimeString(currentLocale, { hour: '2-digit', minute: '2-digit' });
                timeLabelHtml = `<span style="opacity:0.6; margin-right:4px;">${timeLabelText}</span>`;
            }

            const tooltipHtml = AdvancedCalendar._buildTooltipHTML(tVal, timeLabelText, r, propCols);

            let wrapperStyle = (mode === 'month') 
                ? 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' 
                : 'white-space: normal; word-break: break-word; line-height: 1.3; height: auto; display: block;';
            if (mode === 'day') wrapperStyle += ' padding: 5px;';

            let extraPropsHtml = '';
            if (mode !== 'month' && propCols.length > 0) {
                const rowsInner = AdvancedCalendar._renderPropRowsHtml(tableId, r, propCols, state, mode);
                if (rowsInner) {
                    extraPropsHtml = `<div style="margin-top:4px; border-top:1px solid rgba(0,0,0,0.1); padding-top:4px; display:flex; flex-direction:column; gap:3px;">${rowsInner}</div>`;
                }
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
            let tVal = r.virtualCells[titleCol.id] || I18n.t('editor.untitled');
            if (titleCol.type === 'record_note') {
                const noteObj = typeof Store !== 'undefined' ? Store.getNote(tVal) : null;
                if (noteObj) tVal = noteObj.title || I18n.t('editor.untitled');
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

            const dragAttrs = isEdit ? `draggable="true" ondragstart="AdvancedCalendar.onDragStart(event, '${tableId}', '${r.id}')" ondragend="AdvancedCalendar.onDragEnd(event)"` : '';
            const cursor = isEdit ? 'cursor:grab;' : 'cursor:pointer;';
            const paddingOverride = mode === 'day' ? 'padding:5px;' : '';
            const resizeHandle = (isEdit && dateCol.hasEndDate && eMs === r._timeEnd) ?
                `<div style="position:absolute; bottom:0; left:0; right:0; height:8px; cursor:ns-resize; z-index:20;" onmousedown="AdvancedCalendar.startResize(event, '${tableId}', '${r.id}')"></div>` : '';

            const timeLabelText = new Date(sMs).toLocaleTimeString(currentLocale, { hour: '2-digit', minute: '2-digit' });

            let extraPropsHtml = '';
            if (propCols.length > 0) {
                const rowsInner = AdvancedCalendar._renderPropRowsHtml(tableId, r, propCols, state, mode);
                if (rowsInner) {
                    extraPropsHtml = `<div style="margin-top:4px; border-top:1px solid rgba(0,0,0,0.1); padding-top:4px; display:flex; flex-direction:column; gap:3px; flex-shrink: 0; overflow: hidden;">${rowsInner}</div>`;
                }
            }

            const tooltipHtml = AdvancedCalendar._buildTooltipHTML(tVal, timeLabelText, r, propCols);

            return `
                <div class="adv-cal-event-abs" ${dragAttrs} style="top:${topPx}px; left:${leftPct}; width:${widthPct}; height:${heightPx}px; background:${barBg}; border:1px solid ${barColor}; color:${textCol}; ${cursor} ${paddingOverride} display: flex; flex-direction: column; overflow: hidden; justify-content: flex-start;"
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
            if (events.length === 0) return [];
            events.sort((a, b) => a._timeStart - b._timeStart || b._timeEnd - a._timeEnd);
            let columns = [];
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
            let formattedEvents = [];
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

        const daysShort = (I18n.dict[currentLocale]?.calendar_view?.days_short) || ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];

        // Intervallo orario complessivo degli eventi nel periodo visualizzato (per auto-scroll intelligente in week/day)
        let periodMinHour = Infinity;
        let periodMaxHour = -Infinity;
        const trackDayHourBounds = (dayEvents, dayStartMs) => {
            dayEvents.forEach(ev => {
                const sMs = Math.max(ev._timeStart, dayStartMs);
                const eMs = Math.min(ev._timeEnd, dayStartMs + 86400000);
                const sHour = (sMs - dayStartMs) / 3600000;
                const eHour = Math.max(sHour + 0.5, (eMs - dayStartMs) / 3600000);
                if (sHour < periodMinHour) periodMinHour = sHour;
                if (eHour > periodMaxHour) periodMaxHour = eHour;
            });
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
                        ${daysShort.map(ds => `<div>${ds}</div>`).join('')}
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
                const dayStr = isToday ? `<span style="background:var(--accent-color); color:var(--accent-color-tx); border-radius:50%; width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center;">${currentGridDate.getDate()}</span>` : currentGridDate.getDate();

                const events = eventsByDate[currentGridDate.getTime()] || [];
                
                const dblClick = isEdit ? `ondblclick="AdvancedCalendar.createRecord(event, '${tableId}', '${currentGridDate.getTime()}')"` : '';
                const dropHandlers = isEdit ? `class="adv-cal-droppable" ondragover="AdvancedCalendar.onDragOver(event)" ondragleave="AdvancedCalendar.onDragLeave(event)" ondrop="AdvancedCalendar.onDrop(event, '${tableId}', '${currentGridDate.getTime()}')"` : '';

                let eventsHtml = '';
                for(let k = 0; k < Math.min(events.length, MAX_MONTH_EVENTS); k++) {
                    eventsHtml += renderEventStandard(events[k]);
                }
                
                if (events.length > MAX_MONTH_EVENTS) {
                    eventsHtml += `<div class="adv-cal-more-btn" style="font-size:0.75rem; color:var(--text-secondary); cursor:pointer; padding:2px; text-align:center; font-weight:bold; background: rgba(0,0,0,0.05); border-radius:3px; margin-top:2px;" onclick="AdvancedCalendar.expandDayView(event, '${tableId}', ${currentGridDate.getTime()})">${I18n.t('calendar_view.more_events', { count: events.length - MAX_MONTH_EVENTS })}</div>`;
                }

                html += `<div class="adv-cal-day-cell" ${dropHandlers} ${dblClick} style="background:${bg};">
                            <div class="adv-cal-day-label" style="pointer-events:auto; cursor:pointer; color:${isCurrentMonth ? 'var(--text-primary)' : 'var(--text-secondary)'}; font-weight:${isToday ? 'bold' : 'normal'};" onclick="AdvancedCalendar.expandDayView(event, '${tableId}', ${currentGridDate.getTime()})" title="${I18n.t('calendar_view.day')}">${dayStr}</div>
                            <div class="adv-cal-day-content adv-scroll-container">
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

            const daysNames = (I18n.dict[currentLocale]?.calendar_view?.days_long) || ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
            for (let i = 0; i < 7; i++) {
                const currentGridDate = new Date(startOfWeek);
                currentGridDate.setDate(startOfWeek.getDate() + i);
                const isToday = currentGridDate.getTime() === new Date().setHours(0, 0, 0, 0);
                const dayStr = isToday ? `<span style="background:var(--accent-color); color:var(--accent-color-tx); border-radius:50%; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center;">${currentGridDate.getDate()}</span>` : currentGridDate.getDate();

                html += `<div onclick="AdvancedCalendar.expandDayView(event, '${tableId}', ${currentGridDate.getTime()})" title="${I18n.t('calendar_view.day')}" style="padding:10px; text-align:center; background:var(--sidebar-bg); cursor:pointer;" onmouseenter="this.style.background='var(--item-hover)'" onmouseleave="this.style.background='var(--sidebar-bg)'">
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
                const dayMs = currentGridDate.getTime();
                const events = eventsByDate[dayMs] || [];
                if (isTimeCol && events.length > 0) trackDayHourBounds(events, dayMs);
                
                const dblClick = isEdit ? `ondblclick="AdvancedCalendar.createRecord(event, '${tableId}', '${dayMs}', ${isTimeCol ? pxPerHour : 'null'})"` : '';
                const dropHandlers = isEdit ? `class="adv-cal-droppable" ondragover="AdvancedCalendar.onDragOver(event)" ondragleave="AdvancedCalendar.onDragLeave(event)" ondrop="AdvancedCalendar.onDrop(event, '${tableId}', '${dayMs}')"` : '';

                html += `<div ${dropHandlers} ${dblClick} style="background:var(--bg-color); position:relative; transition:box-shadow 0.2s;">`;
                if (isTimeCol) {
                    html += buildTimeGrid(pxPerHour);
                    const formattedEvents = layoutDayEvents(events);
                    html += `<div style="position:relative; width:100%; height:100%; z-index:5;">${formattedEvents.map(e => renderEventAbsolute(e.record, dayMs, pxPerHour, e.colIdx, e.colCount)).join('')}</div>`;
                } else {
                    html += `<div class="adv-scroll-container" style="padding:10px; height:100%; overflow-y:auto;">${events.map(e => renderEventStandard(e)).join('')}</div>`;
                }
                html += `</div>`;
            }
            html += `</div></div></div>`;
        }
        else if (mode === 'day') {
            const pxPerHour = state.calendarZoom || 40;
            const targetTime = new Date(focusDate).setHours(0, 0, 0, 0);
            const events = eventsByDate[targetTime] || [];
            if (isTimeCol && events.length > 0) trackDayHourBounds(events, targetTime);

            html += `<div class="adv-scroll-container" style="display:flex; flex-direction:row; height:600px; overflow-y:auto; border-top:1px solid var(--border-color);">`;

            if (isTimeCol) html += buildTimeAxis(pxPerHour);

            const dblClick = isEdit ? `ondblclick="AdvancedCalendar.createRecord(event, '${tableId}', '${targetTime}', ${isTimeCol ? pxPerHour : 'null'})"` : '';

            html += `<div style="flex:1; position:relative; background:var(--bg-color);" ${dblClick} ${isEdit ? `class="adv-cal-droppable" ondragover="AdvancedCalendar.onDragOver(event)" ondragleave="AdvancedCalendar.onDragLeave(event)" ondrop="AdvancedCalendar.onDrop(event, '${tableId}', '${targetTime}')"` : ''}>`;

            if (isTimeCol) {
                html += buildTimeGrid(pxPerHour);
                const formattedEvents = layoutDayEvents(events);
                html += `<div style="position:relative; width:100%; height:${pxPerHour * 24}px; z-index:5;">${formattedEvents.map(e => renderEventAbsolute(e.record, targetTime, pxPerHour, e.colIdx, e.colCount)).join('')}</div>`;
            } else {
                if (events.length === 0) {
                    html += `<div style="text-align:center; color:var(--text-secondary); margin-top:40px; pointer-events:none;">${I18n.t('calendar_view.no_events_day')}</div>`;
                } else {
                    html += `<div style="display:flex; flex-direction:column; gap:10px; padding:5px; width:100%; box-sizing:border-box; pointer-events:auto;">${events.map(e => renderEventStandard(e)).join('')}</div>`;
                }
            }

            html += `</div></div>`;
        }

        html += `</div>`;

        if (unscheduledRows.length > 0) {
            html += `<div style="margin-top:15px; font-size:0.8rem; color:var(--text-secondary);">
                        <b><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.alertTriangle} ${I18n.t('calendar_view.unscheduled_records', { count: unscheduledRows.length })}</b></span> 
                        ${unscheduledRows.map(r => {
                            let tTitle = r.virtualCells[titleCol.id] || I18n.t('editor.untitled');
                            if (titleCol.type === 'record_note') {
                                const noteObj = typeof Store !== 'undefined' ? Store.getNote(tTitle) : null;
                                if (noteObj) tTitle = noteObj.title || I18n.t('editor.untitled');
                            }
                            tTitle = String(tTitle).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            
                            return `<span draggable="${isEdit ? 'true' : 'false'}" 
                                  ${isEdit ? `ondragstart="AdvancedCalendar.onDragStart(event, '${tableId}', '${r.id}')" ondragend="AdvancedCalendar.onDragEnd(event)"` : ''}
                                  style="cursor:${isEdit ? 'grab' : 'pointer'}; color:var(--accent-color); margin-right:8px; display:inline-block;" 
                                  onclick="AdvancedTable.openRecordView('${tableId}', '${r.id}')">
                                ${tTitle}
                            </span>`;
                        }).join('')}
                     </div>`;
        }

        bodyContainer.innerHTML = html;

        const targetScroll = bodyContainer.querySelector('.adv-scroll-container, .adv-cal-week-container .adv-scroll-container,[style*="overflow-y:auto"]');
        if (targetScroll) {
            if (prevScrollX > 0 || prevScrollY > 0) {
                targetScroll.scrollLeft = prevScrollX;
                targetScroll.scrollTop = prevScrollY;
            } else if ((mode === 'week' || mode === 'day') && isTimeCol && periodMinHour < Infinity) {
                const pxPerHour = state.calendarZoom || 40;
                const viewHeight = targetScroll.clientHeight || 550;
                const visibleHours = viewHeight / pxPerHour;

                let idealTopHour = Math.max(0, periodMinHour - 0.5);
                if (periodMaxHour + 0.5 - idealTopHour > visibleHours && (periodMaxHour - periodMinHour + 1) <= visibleHours) {
                    idealTopHour = Math.max(0, periodMaxHour + 0.5 - visibleHours);
                }
                targetScroll.scrollTop = Math.round(idealTopHour * pxPerHour);
            }
        }
    }
};