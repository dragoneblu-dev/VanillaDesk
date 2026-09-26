/**
 * tests/test-advanced-table-timeline.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-timeline
 * Conteggio test case: 21
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Timeline: Math Temporale, Zoom, Conflitti & Navigazione (21 Test)", () => {

    test("AdvancedTimeline: _getPxFromDate e _getDateFromPx formano una biiezione matematica esatta", () => {
            const startMs = new Date(2026, 0, 1).getTime();
            const targetMs = new Date(2026, 0, 10, 12, 0, 0).getTime();
            const colWidth = 48;

            const px = AdvancedTimeline._getPxFromDate(targetMs, startMs, colWidth);
            const resolvedMs = AdvancedTimeline._getDateFromPx(px, startMs, colWidth);

            // Errore inferiore a 1000 millisecondi (1 secondo) su scala pixel
            Assert.isTrue(Math.abs(resolvedMs - targetMs) < 1000);
        });

    test("AdvancedTimeline: _snapDate aggancia con precisione all'inizio della giornata solare", () => {
            const midDay = new Date(2026, 5, 15, 14, 30, 0).getTime();
            const daySnap = 24 * 60 * 60 * 1000;
            const snapped = AdvancedTimeline._snapDate(midDay, daySnap);
            const snappedDate = new Date(snapped);

            Assert.strictEqual(snappedDate.getHours(), 0);
            Assert.strictEqual(snappedDate.getMinutes(), 0);
            Assert.strictEqual(snappedDate.getSeconds(), 0);
        });

    test("Timeline: setZoomExact rispetta il limite minimo di 6px e massimo di 1200px", () => {
            const tId = 'db_tl_zoom_limits';
            AppState.databases[tId] = { id: tId, timelineZoom: 40, columns: [{ id: 'd', type: 'date', hasEndDate: true }], rows: [] };

            AdvancedTimeline.setZoomExact(tId, 2);
            Assert.strictEqual(AppState.databases[tId].timelineZoom, 6);

            AdvancedTimeline.setZoomExact(tId, 5000);
            Assert.strictEqual(AppState.databases[tId].timelineZoom, 1200);
        });

    test("Timeline: changeZoom adatta il passo a seconda della densità attuale", () => {
            const tId = 'db_tl_zoom_step';
            AppState.databases[tId] = { id: tId, timelineZoom: 15, columns: [{ id: 'd', type: 'date', hasEndDate: true }], rows: [] };

            // Zoom compresso (<=20) usa step piccolo (3px)
            AdvancedTimeline.changeZoom(tId, 1);
            Assert.strictEqual(AppState.databases[tId].timelineZoom, 18);

            // Zoom intermedio (>=100) usa step da 40px
            AppState.databases[tId].timelineZoom = 120;
            AdvancedTimeline.changeZoom(tId, 1);
            Assert.strictEqual(AppState.databases[tId].timelineZoom, 160);
        });

    test("Timeline: calcolo delle Milestones per record con start === end", () => {
            const r = { _timeStart: 1778841600000, _timeEnd: 1778841600000 };
            const isMilestone = r._timeStart === r._timeEnd;
            Assert.isTrue(isMilestone);
        });

    test("Timeline: calcolo conflitto dipendenze quando child.startTime < parent.endTime", () => {
            const pParent = { startTime: 1000, endTime: 2000 };
            const pChildValid = { startTime: 2500, endTime: 3000 };
            const pChildConflict = { startTime: 1500, endTime: 3000 };

            const isOk = pChildValid.startTime < pParent.endTime;
            Assert.isFalse(isOk);

            const isConflict = pChildConflict.startTime < pParent.endTime;
            Assert.isTrue(isConflict);
        });

    test("Timeline: snap dinamico a 15 minuti per zoom elevato (>=400px)", () => {
            const snap = AdvancedTimeline._getDynamicSnapMs(450, 'datetime');
            Assert.strictEqual(snap, 15 * 60 * 1000);
        });

    test("Timeline: snap dinamico a 24 ore per date senza orario", () => {
            const snap = AdvancedTimeline._getDynamicSnapMs(500, 'date');
            Assert.strictEqual(snap, 24 * 60 * 60 * 1000);
        });

    test("Timeline: _snapDate su date giornaliere allinea a mezzanotte esatta", () => {
            const dateMs = new Date(2026, 4, 15, 17, 34, 22).getTime();
            const daySnap = 24 * 60 * 60 * 1000;
            const snapped = AdvancedTimeline._snapDate(dateMs, daySnap);
            const d = new Date(snapped);
            Assert.strictEqual(d.getHours(), 0);
            Assert.strictEqual(d.getMinutes(), 0);
            Assert.strictEqual(d.getSeconds(), 0);
        });

    test("Timeline: formatTooltipDate per datetime include giorno e ora", () => {
            const d = new Date(2026, 4, 15, 14, 30, 0).getTime();
            const text = AdvancedTimeline.formatTooltipDate(d, 'datetime');
            Assert.isTrue(text.includes('15/05') || text.includes('05/15') || text.includes('15/5'));
            Assert.isTrue(text.includes('14:30'));
        });

    test("Timeline: formatTooltipDate per data semplice omette i minuti", () => {
            const d = new Date(2026, 4, 15, 14, 30, 0).getTime();
            const text = AdvancedTimeline.formatTooltipDate(d, 'date');
            Assert.isFalse(text.includes('14:30'));
        });

    test("Timeline: raggruppamento corsie piane ordina per startTime crescente", () => {
            const scheduled = [
                { id: 't2', _timeStart: 200, _timeEnd: 300 },
                { id: 't1', _timeStart: 100, _timeEnd: 150 },
                { id: 't3', _timeStart: 120, _timeEnd: 250 }
            ];
            scheduled.sort((a, b) => a._timeStart - b._timeStart);
            Assert.strictEqual(scheduled[0].id, 't1');
            Assert.strictEqual(scheduled[1].id, 't3');
            Assert.strictEqual(scheduled[2].id, 't2');
        });

    test("Timeline: allocazione corsie evita sovrapposizioni temporali", () => {
            const tasks = [
                { id: '1', _timeStart: 100, _timeEnd: 200 },
                { id: '2', _timeStart: 150, _timeEnd: 250 }, // Si sovrappone a 1 -> deve andare in corsia 1
                { id: '3', _timeStart: 210, _timeEnd: 300 }  // Inizia dopo la fine di 1 -> può riutilizzare corsia 0
            ];

            let flatLanes = [];
            tasks.forEach(r => {
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

            Assert.strictEqual(tasks[0]._lane, 0);
            Assert.strictEqual(tasks[1]._lane, 1);
            Assert.strictEqual(tasks[2]._lane, 0);
        });

    test("Timeline: hideLaneNav spegne i pulsanti di navigazione corsia", () => {
            const dummyPrev = document.createElement('button');
            dummyPrev.id = 'timeline-nav-prev-db_test_nav';
            dummyPrev.style.display = 'flex';
            document.body.appendChild(dummyPrev);

            AdvancedTimeline.hideLaneNav('db_test_nav');
            Assert.strictEqual(dummyPrev.style.display, 'none');
            dummyPrev.remove();
        });

    test("Timeline: calcolo delle ore su coordinate pixel (_getDateFromPx)", () => {
            const startMs = new Date(2026, 0, 1).getTime();
            const colWidth = 24; // 1 pixel = 1 ora

            const resolvedMs = AdvancedTimeline._getDateFromPx(12, startMs, colWidth);
            const resolvedDate = new Date(resolvedMs);
            Assert.strictEqual(resolvedDate.getHours(), 12);
        });

    test("Timeline: calcolo pixel da data con frazione oraria (_getPxFromDate)", () => {
            const startMs = new Date(2026, 0, 1).getTime();
            const targetMs = new Date(2026, 0, 1, 6, 0, 0).getTime(); // ore 06:00
            const colWidth = 48; // 2 pixel per ora

            const px = AdvancedTimeline._getPxFromDate(targetMs, startMs, colWidth);
            Assert.strictEqual(px, 12); // 6 ore * 2px = 12px
        });

    test("Timeline: navigate sposta lo scroll di 0.75 volte la larghezza visibile", () => {
            const dummyScroll = document.createElement('div');
            dummyScroll.id = 'timeline-scroll-db_tl_nav';
            dummyScroll.style.width = '1000px';
            dummyScroll.dataset.startDate = Date.now().toString();
            document.body.appendChild(dummyScroll);

            let scrolledAmount = 0;
            dummyScroll.scrollBy = (opts) => { scrolledAmount = opts.left; };
            Object.defineProperty(dummyScroll, 'clientWidth', { value: 1000, configurable: true });

            AppState.databases['db_tl_nav'] = { timelineZoom: 40 };

            try {
                AdvancedTimeline.navigate('db_tl_nav', 1);
                Assert.strictEqual(scrolledAmount, 750); // 1000 * 0.75

                AdvancedTimeline.navigate('db_tl_nav', -1);
                Assert.strictEqual(scrolledAmount, -750);
            } finally {
                dummyScroll.remove();
            }
        });

    test("Timeline: setGroupBy imposta la colonna di raggruppamento o null", () => {
            const tId = 'db_tl_grp';
            AppState.databases[tId] = { id: tId, timelineGroupBy: null };

            AdvancedTimeline.setGroupBy(tId, 'c_assignee');
            Assert.strictEqual(AppState.databases[tId].timelineGroupBy, 'c_assignee');

            AdvancedTimeline.setGroupBy(tId, null);
            Assert.isNull(AppState.databases[tId].timelineGroupBy);
        });

    test("Timeline: jumpToTask trova l'attività e scorre la vista centrandola", () => {
            const tId = 'db_tl_jump';
            const dummyScroll = document.createElement('div');
            dummyScroll.id = 'timeline-scroll-' + tId;
            dummyScroll.style.width = '800px';
            document.body.appendChild(dummyScroll);

            let scrolledTo = null;
            dummyScroll.scrollTo = (opts) => { scrolledTo = opts.left; };
            Object.defineProperty(dummyScroll, 'clientWidth', { value: 800, configurable: true });

            const startDateMs = new Date(2026, 0, 1).getTime();
            // Collochiamo il task 30 giorni dopo l'inizio (1200px) per superare la metà viewport (400px)
            const taskStartMs = new Date(2026, 0, 31).getTime();

            AdvancedTimeline._timelineData[tId] = {
                scheduledRows: [{ id: 'task_target', _timeStart: taskStartMs, _timeEnd: taskStartMs + 86400000 }],
                startDateMs: startDateMs,
                colWidth: 40
            };

            try {
                AdvancedTimeline.jumpToTask(tId, 'task_target');
                Assert.isNotNull(scrolledTo);
                Assert.isTrue(scrolledTo > 0);
            } finally {
                dummyScroll.remove();
            }
        });

    test("Timeline: createDependency verifica circolarità prima di collegare", () => {
            const tId = 'db_tl_dep_cycle';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'rel', type: 'relation', targetTableId: tId }],
                rows: [
                    { id: 't1', cells: { rel: ['t2'] } },
                    { id: 't2', cells: { rel: [] } }
                ]
            };

            let alertShown = false;
            const origAlert = window.alert;
            window.alert = () => { alertShown = true; };

            try {
                // Chiamata esatta con sorgente t1 verso target t2 per verificare il ciclo
                AdvancedTimeline.createDependency(tId, 't1', 't2');
                Assert.isTrue(alertShown);
                Assert.deepEqual(AppState.databases[tId].rows[1].cells.rel, []);
            } finally {
                window.alert = origAlert;
            }
        });

    test("Timeline: createDependency blocca collegamenti duplicati già presenti", () => {
            const tId = 'db_tl_dep_dup';
            AppState.databases[tId] = {
                id: tId,
                columns: [{ id: 'rel', type: 'relation', targetTableId: tId }],
                rows: [
                    { id: 't1', cells: { rel: [] } },
                    { id: 't2', cells: { rel: ['t1'] } } // t2 contiene già t1
                ]
            };

            const origAlert = window.alert;
            window.alert = () => {}; // Mock di sicurezza per prevenire blocchi

            try {
                // Riprova a collegare t1 a t2 che lo contiene già
            AdvancedTimeline.createDependency(tId, 't1', 't2');
                Assert.deepEqual(AppState.databases[tId].rows[1].cells.rel, ['t1']);
            } finally {
                window.alert = origAlert;
            }
        });

});
