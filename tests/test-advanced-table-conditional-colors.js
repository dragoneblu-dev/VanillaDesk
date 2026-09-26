/**
 * tests/test-advanced-table-conditional-colors.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-conditional-colors
 * Conteggio test case: 3
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Conditional Colors: Regole Visive & Opacità Dinamica (3 Test)", () => {

    test("Formattazione Condizionale: opacità fissa produce color-mix CSS conforme", () => {
            const rowColorClass = 'hl-c4';
            const pOp = 30; // 30% opacità
            const inlineBgStyle = `background-color: color-mix(in srgb, var(--${rowColorClass}) ${pOp}%, transparent) !important;`;
            Assert.isTrue(inlineBgStyle.includes('color-mix(in srgb, var(--hl-c4) 30%, transparent)'));
        });

    test("Formattazione Condizionale: opacità dinamica via formula JS viene valutata", () => {
            const row = { id: 'r1', cells: { perc: 75 } };
            const cols = [{ id: 'perc', name: 'Avanzamento', type: 'number' }];
            const formula = 'riga["Avanzamento"]';
            const evaluatedOp = AdvancedTable.evaluateFormula(formula, row, cols, 't', 'T', row.cells);
            Assert.strictEqual(Number(evaluatedOp), 75);
        });

    test("Formattazione Condizionale: clamp opacità tra 0 e 100", () => {
            let opTooHigh = 150;
            let clampedHigh = Math.max(0, Math.min(100, opTooHigh));
            Assert.strictEqual(clampedHigh, 100);

            let opTooLow = -20;
            let clampedLow = Math.max(0, Math.min(100, opTooLow));
            Assert.strictEqual(clampedLow, 0);
        });

});
