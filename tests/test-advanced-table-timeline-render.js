/**
 * tests/test-advanced-table-timeline-render.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-timeline-render
 * Conteggio test case: 3
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Timeline Render: Raccordi Ortogonali & Corsie (3 Test)", () => {

    test("Timeline: _drawRoundedOrthogonalPath genera linea dritta per ordinate identiche (y1 === y2)", () => {
            const path = AdvancedTimeline._drawRoundedOrthogonalPath(100, 50, 300, 50, false);
            Assert.strictEqual(path, 'M 100 50 L 298 50');
        });

    test("Timeline: _drawRoundedOrthogonalPath applica raccordo quadratico Q tra punti ortogonali", () => {
            const path = AdvancedTimeline._drawRoundedOrthogonalPath(50, 50, 200, 150, false);
            Assert.isTrue(path.includes('Q'), "Il tracciato deve contenere raccordi morbidi quadratici");
        });

    test("Timeline: _drawRoundedOrthogonalPath calcola gutter offset di deviazione per conflitti temporali", () => {
            // p1 a destra di p2 (conflitto temporale: il successore inizia prima della fine del predecessore)
            const pathConflict = AdvancedTimeline._drawRoundedOrthogonalPath(300, 50, 100, 100, true);
            Assert.isTrue(pathConflict.length > 20);
            Assert.isTrue(pathConflict.includes('Q'));
        });

});
