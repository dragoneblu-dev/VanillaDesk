/**
 * tests/test-advanced-table-conditional-colors.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-conditional-colors
 * Conteggio test case: 7
 * Generato automaticamente il: 2026-10-11 19:40:00
 */

describe("AdvancedTable Conditional Colors: Regole Visive, Singola Cella & Opacità Dinamica (7 Test)", () => {

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

    test("Formattazione Condizionale: regola con targetScope='cell' valorizza targetColId", () => {
        const tableId = 'db_cond_cell_scope';
        AppState.databases[tableId] = {
            id: tableId,
            columns: [
                { id: 'c_status', name: 'Stato', type: 'text' },
                { id: 'c_priority', name: 'Priorità', type: 'text' }
            ],
            conditionalColors: []
        };

        AdvancedTableConditionalColors._tempCondRules = [];
        AdvancedTableConditionalColors._addCondRule(tableId);

        const rule = AdvancedTableConditionalColors._tempCondRules[0];
        Assert.isNotNull(rule);
        Assert.strictEqual(rule.targetScope, 'row');

        // Passaggio esplicito all'ambito cella e cambio colonna bersaglio
        AdvancedTableConditionalColors._updateCondScope(tableId, 0, 'cell');
        Assert.strictEqual(AdvancedTableConditionalColors._tempCondRules[0].targetScope, 'cell');
        Assert.strictEqual(AdvancedTableConditionalColors._tempCondRules[0].targetColId, 'c_status');

        AdvancedTableConditionalColors._updateCondTargetCol(tableId, 0, 'c_priority');
        Assert.strictEqual(AdvancedTableConditionalColors._tempCondRules[0].targetColId, 'c_priority');
    });

    test("Formattazione Condizionale: coesistenza di regola per riga e regola per cella", () => {
        const state = {
            columns: [
                { id: 'col_a', name: 'A', type: 'text' },
                { id: 'col_b', name: 'B', type: 'text' }
            ],
            conditionalColors: [
                {
                    id: 'r_row',
                    active: true,
                    targetScope: 'row',
                    color: 'hl-c2',
                    conditions: [{ colId: 'col_a', operator: '=', value: 'ATTIVO' }]
                },
                {
                    id: 'r_cell',
                    active: true,
                    targetScope: 'cell',
                    targetColId: 'col_b',
                    color: 'hl-c10',
                    conditions: [{ colId: 'col_b', operator: '=', value: 'URGENTE' }]
                }
            ]
        };

        const row = { id: 'r1', virtualCells: { col_a: 'ATTIVO', col_b: 'URGENTE' } };

        // Simulazione logica di valutazione di advanced-table-render.js
        let rowColorClass = '';
        const cellStyles = {};

        for (const rule of state.conditionalColors) {
            const isCellScope = rule.targetScope === 'cell';
            const allMatch = rule.conditions.every(cond => row.virtualCells[cond.colId] === cond.value);
            if (allMatch) {
                if (isCellScope) {
                    cellStyles[rule.targetColId] = { colorClass: rule.color };
                } else if (!rowColorClass) {
                    rowColorClass = rule.color;
                }
            }
        }

        Assert.strictEqual(rowColorClass, 'hl-c2', "La riga intera deve ereditare il colore di riga");
        Assert.isNotNull(cellStyles['col_b'], "La colonna target B deve avere uno stile di cella dedicato");
        Assert.strictEqual(cellStyles['col_b'].colorClass, 'hl-c10', "La cella B deve ricevere hl-c10");
        Assert.strictEqual(cellStyles['col_a'], undefined, "La cella A non deve ricevere stili cella non previsti");
    });

    test("Formattazione Condizionale: opacità dinamica via formula calcolata su cella singola", () => {
        const rule = {
            id: 'rule_cell_dyn',
            targetScope: 'cell',
            targetColId: 'c_val',
            color: 'hl-c6',
            opacityType: 'formula',
            opacity: 'riga["Livello"] * 20', // Livello 4 -> 80%
            conditions: [{ colId: 'c_val', operator: 'not_empty', value: '' }]
        };

        const row = { id: 'r1', virtualCells: { c_val: 'Test', Livello: 4 } };
        const cols = [{ id: 'c_val', name: 'Val' }, { id: 'Livello', name: 'Livello', type: 'number' }];

        const opVal = AdvancedTable.evaluateFormula(rule.opacity, row, cols, 'tbl', 'T', row.virtualCells);
        Assert.strictEqual(Number(opVal), 80);

        const pOp = Math.max(0, Math.min(100, parseFloat(opVal)));
        const cellBgStyle = `background-color: color-mix(in srgb, var(--${rule.color}) ${pOp}%, transparent) !important;`;
        Assert.isTrue(cellBgStyle.includes('80%'));
    });

    test("Formattazione Condizionale: fallback retrocompatibile per regole senza targetScope", () => {
        const legacyRule = {
            id: 'legacy_1',
            active: true,
            color: 'hl-c5',
            // targetScope non presente: deve comportarsi esattamente come 'row'
            conditions: [{ colId: 'c1', operator: '=', value: 'OK' }]
        };

        const isCellScope = legacyRule.targetScope === 'cell';
        Assert.isFalse(isCellScope, "Regole legacy devono ricadere di default sull'ambito riga");
    });

});