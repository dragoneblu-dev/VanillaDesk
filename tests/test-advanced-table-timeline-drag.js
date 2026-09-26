/**
 * tests/test-advanced-table-timeline-drag.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-timeline-drag
 * Conteggio test case: 2
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Timeline Drag: Dragging, Pan, Snap & Tooltip (2 Test)", () => {

    test("Timeline: startPan attiva grabbing e registra coordinate", () => {
            const dummy = document.createElement('div');
            dummy.id = 'timeline-scroll-db_pan';
            document.body.appendChild(dummy);

            const evMock = { target: dummy, currentTarget: dummy, pageX: 150 };
            AdvancedTimeline.startPan(evMock);

            Assert.isNotNull(AdvancedTimeline.panState);
            Assert.strictEqual(AdvancedTimeline.panState.startX, 150);
            Assert.strictEqual(dummy.style.cursor, 'grabbing');

            AdvancedTimeline.onPanEnd();
            Assert.isNull(AdvancedTimeline.panState);
            dummy.remove();
        });

    test("Timeline: onPanMove aggiorna scrollLeft con delta negativo", () => {
            const dummy = { scrollLeft: 200 };
            AdvancedTimeline.panState = { el: dummy, startX: 100, scrollLeft: 200 };

            AdvancedTimeline.onPanMove({ pageX: 150, preventDefault: () => {} });
            Assert.strictEqual(dummy.scrollLeft, 150); // 200 - (150 - 100) = 150
            AdvancedTimeline.panState = null;
        });

});
