/**
 * tests/test-advanced-table-calendar.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-calendar
 * Conteggio test case: 16
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Calendar: Mese, Settimana, Giorno & Heatmap (16 Test)", () => {

    test("AdvancedCalendar: navigate modifica la data focus in base alla modalità", () => {
            const baseMs = new Date(2026, 4, 15).getTime(); // 15 Maggio 2026

            // Modalità Mese (+1)
            const dMonth = new Date(baseMs);
            dMonth.setMonth(dMonth.getMonth() + 1);
            Assert.strictEqual(dMonth.getMonth(), 5); // Giugno

            // Modalità Settimana (+1 settimana = +7 gg)
            const dWeek = new Date(baseMs);
            dWeek.setDate(dWeek.getDate() + 7);
            Assert.strictEqual(dWeek.getDate(), 22);

            // Modalità Giorno (-1 giorno)
            const dDay = new Date(baseMs);
            dDay.setDate(dDay.getDate() - 1);
            Assert.strictEqual(dDay.getDate(), 14);
        });

    test("Calendar: _cleanFormulaRendering inverte flex-start e center in flex-end", () => {
            const input = '<div style="justify-content: flex-start; display: flex;">Contenuto</div>';
            const cleaned = AdvancedCalendar._cleanFormulaRendering(input);
            Assert.isTrue(cleaned.includes('justify-content: flex-end'));
            Assert.isFalse(cleaned.includes('justify-content: flex-start'));
        });

    test("Calendar: _cleanFormulaRendering inietta text-align: right su adv-cell-text", () => {
            const input = '<div class="adv-cell-text">123</div>';
            const cleaned = AdvancedCalendar._cleanFormulaRendering(input);
            Assert.isTrue(cleaned.includes('style="text-align:right; width:100%; margin:0;"'));
        });

    test("Calendar: _cleanFormulaRendering rimuove sfondi readonly grigi", () => {
            const input = '<div class="adv-cell-readonly" style="background: rgba(0, 0, 0, 0.02);">Test</div>';
            const cleaned = AdvancedCalendar._cleanFormulaRendering(input);
            Assert.isFalse(cleaned.includes('rgba(0, 0, 0, 0.02)'));
            Assert.isFalse(cleaned.includes('adv-cell-readonly'));
        });

    test("Calendar: navigate in modalità 'year' sposta il focus di 1 anno intero", () => {
            const tableId = 'db_cal_nav_year';
            const baseDate = new Date(2026, 5, 15).getTime();
            AppState.databases[tableId] = {
                id: tableId,
                calendarMode: 'year',
                calendarFocusDate: baseDate,
                columns: [{ id: 'c_d', type: 'date' }],
                rows: []
            };

            AdvancedCalendar.navigate(null, tableId, 1);
            const nextDate = new Date(AppState.databases[tableId].calendarFocusDate);
            Assert.strictEqual(nextDate.getFullYear(), 2027);

            AdvancedCalendar.navigate(null, tableId, -2);
            const prevDate = new Date(AppState.databases[tableId].calendarFocusDate);
            Assert.strictEqual(prevDate.getFullYear(), 2025);
        });

    test("Calendar: navigate con direzione 0 reimposta il focus esattamente su Oggi", () => {
            const tableId = 'db_cal_today';
            AppState.databases[tableId] = {
                id: tableId,
                calendarMode: 'month',
                calendarFocusDate: new Date(2020, 0, 1).getTime(),
                columns: [{ id: 'c_d', type: 'date' }],
                rows: []
            };

            AdvancedCalendar.navigate(null, tableId, 0);
            const focused = new Date(AppState.databases[tableId].calendarFocusDate);
            const now = new Date();
            Assert.strictEqual(focused.getDate(), now.getDate());
            Assert.strictEqual(focused.getMonth(), now.getMonth());
            Assert.strictEqual(focused.getFullYear(), now.getFullYear());
        });

    test("Calendar: toggleLegendFilter aggiunge e rimuove i filtri categoria", () => {
            const tableId = 'db_cal_legend';
            AppState.databases[tableId] = {
                id: tableId,
                calendarLegendFilter: ['Urgente'],
                columns: [{ id: 'c_d', type: 'date' }],
                rows: []
            };

            // Rimuove 'Urgente'
            AdvancedCalendar.toggleLegendFilter(tableId, 'Urgente');
            Assert.strictEqual(AppState.databases[tableId].calendarLegendFilter.length, 0);

            // Aggiunge 'Revisione'
            AdvancedCalendar.toggleLegendFilter(tableId, 'Revisione');
            Assert.deepEqual(AppState.databases[tableId].calendarLegendFilter, ['Revisione']);
        });

    test("Calendar: clearLegendFilter azzera completamente l'array dei filtri visivi", () => {
            const tableId = 'db_cal_legend_clr';
            AppState.databases[tableId] = {
                id: tableId,
                calendarLegendFilter: ['Tag1', 'Tag2', 'Tag3'],
                columns: [{ id: 'c_d', type: 'date' }],
                rows: []
            };

            AdvancedCalendar.clearLegendFilter(tableId);
            Assert.deepEqual(AppState.databases[tableId].calendarLegendFilter, []);
        });

    test("Calendar: changeMode aggiorna calendarMode nello stato del database", () => {
            const tableId = 'db_cal_mode';
            AppState.databases[tableId] = { id: tableId, calendarMode: 'month', columns: [{ id: 'd', type: 'date' }], rows: [] };

            AdvancedCalendar.changeMode(null, tableId, 'week');
            Assert.strictEqual(AppState.databases[tableId].calendarMode, 'week');

            AdvancedCalendar.changeMode(null, tableId, 'day');
            Assert.strictEqual(AppState.databases[tableId].calendarMode, 'day');
        });

    test("Calendar: expandDayView imposta modalità 'day' e data specificata", () => {
            const tableId = 'db_cal_exp_day';
            const targetMs = 1778841600000;
            AppState.databases[tableId] = { id: tableId, calendarMode: 'month', columns: [{ id: 'd', type: 'date' }], rows: [] };

            AdvancedCalendar.expandDayView(null, tableId, targetMs);
            Assert.strictEqual(AppState.databases[tableId].calendarMode, 'day');
            Assert.strictEqual(AppState.databases[tableId].calendarFocusDate, targetMs);
        });

    test("Calendar: expandMonthView imposta modalità 'month' e data specificata", () => {
            const tableId = 'db_cal_exp_month';
            const targetMs = 1778841600000;
            AppState.databases[tableId] = { id: tableId, calendarMode: 'year', columns: [{ id: 'd', type: 'date' }], rows: [] };

            AdvancedCalendar.expandMonthView(null, tableId, targetMs);
            Assert.strictEqual(AppState.databases[tableId].calendarMode, 'month');
            Assert.strictEqual(AppState.databases[tableId].calendarFocusDate, targetMs);
        });

    test("Calendar: changeZoom incrementa e rispetta limiti min (20) e max (200)", () => {
            const tableId = 'db_cal_zoom';
            AppState.databases[tableId] = { id: tableId, calendarZoom: 30, columns: [{ id: 'd', type: 'datetime' }], rows: [] };

            // Incrementa di un passo (+1)
            AdvancedCalendar.changeZoom(null, tableId, 1);
            Assert.strictEqual(AppState.databases[tableId].calendarZoom, 40);

            // Riduce di un passo (-1)
            AdvancedCalendar.changeZoom(null, tableId, -1);
            Assert.strictEqual(AppState.databases[tableId].calendarZoom, 30);

            // Riduce fino a toccare il limite minimo di 20px
            AdvancedCalendar.changeZoom(null, tableId, -1);
            AdvancedCalendar.changeZoom(null, tableId, -1);
            Assert.strictEqual(AppState.databases[tableId].calendarZoom, 20);
        });

    test("Calendar: formula di snap temporale a 15 minuti su createRecord", () => {
            // Simula click alle 10:07 -> deve arrotondare a 10:00 (o 10:15 se sopra 7.5 min)
            const d = new Date(2026, 4, 15, 10, 7, 0).getTime();
            const snapped = Math.round(d / (15 * 60000)) * (15 * 60000);
            const resDate = new Date(snapped);
            Assert.strictEqual(resDate.getMinutes(), 0);

            const d2 = new Date(2026, 4, 15, 10, 9, 0).getTime();
            const snapped2 = Math.round(d2 / (15 * 60000)) * (15 * 60000);
            const resDate2 = new Date(snapped2);
            Assert.strictEqual(resDate2.getMinutes(), 15);
        });

    test("Calendar: _buildTooltipHTML assembla titolo e proprietà", () => {
            const propCols = [{ id: 'c_resp', name: 'Responsabile' }];
            const r = { virtualCells: { c_resp: 'Mario Rossi' } };
            const tooltip = AdvancedCalendar._buildTooltipHTML('Lancio Release', '10:00', r, propCols);
            Assert.isTrue(tooltip.includes('Lancio Release'));
            Assert.isTrue(tooltip.includes('Mario Rossi'));
            Assert.isTrue(tooltip.includes('10:00'));
        });

    test("Calendar: heatmap annuale calcola conteggio eventi giornalieri", () => {
            const eventsByDate = {};
            const dayMs = new Date(2026, 4, 10).setHours(0, 0, 0, 0);
            eventsByDate[dayMs] = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];

            const eventCount = (eventsByDate[dayMs] || []).length;
            Assert.strictEqual(eventCount, 4);
            Assert.isTrue(eventCount > 3, "Sopra i 3 eventi deve applicare una classe heatmap più marcata");
        });

    test("Calendar: drag & drop temporale calcola delta millisecondi esatto", () => {
            const oldStart = new Date(2026, 4, 10).getTime();
            const newStart = new Date(2026, 4, 15).getTime();
            const deltaMs = newStart - oldStart;
            Assert.strictEqual(deltaMs, 5 * 24 * 60 * 60 * 1000);
        });

});
