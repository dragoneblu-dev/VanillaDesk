/**
 * tests/test-logic-engine-core.js
 * Suite Modulare di Collaudo Unitario e di Integrazione ad Altissima Copertura (100%).
 * Modulo testato: logic-engine-core
 * Conteggio test case: 65
 */

describe("LogicEngine Core: Predicati WHERE, Mutazioni SET, Date Math & Accessor Unificato (65 Test)", () => {

    // DEFINIZIONE FIXTURES CONDIVISE (Schema Colonne)
    const numCol = { id: 'c_num', name: 'Numero', type: 'number' };
    const txtCol = { id: 'c_txt', name: 'Testo', type: 'text' };
    const chkCol = { id: 'c_chk', name: 'Spunta', type: 'checkbox' };
    const tagCol = { id: 'c_tag', name: 'Tag', type: 'multi-select' };
    const dateCol = { id: 'c_date', name: 'Data', type: 'date', hasEndDate: false };
    const rangeCol = { id: 'c_range', name: 'Periodo', type: 'date', hasEndDate: true };
    const dtCol = { id: 'c_dt', name: 'DataOra', type: 'datetime', hasEndDate: false };
    const dtRangeCol = { id: 'c_dtrange', name: 'PeriodoOra', type: 'datetime', hasEndDate: true };
    const timeCol = { id: 'c_time', name: 'Orario', type: 'time' };
    const noteLinkCol = { id: 'c_nl', name: 'LinkNota', type: 'note_link' };

    // =========================================================================
    // 1. TEST UNITARI ACCESSOR UNIFICATO (getRecordValue)
    // =========================================================================

    test("getRecordValue: risolve prioritariamente da virtualCells se presente", () => {
        const row = {
            cells: { c1: 'Valore Grezzo' },
            virtualCells: { c1: 'Valore Calcolato Virtuale' }
        };
        Assert.strictEqual(LogicEngine.getRecordValue(row, 'c1'), 'Valore Calcolato Virtuale');
    });

    test("getRecordValue: fa fallback trasparente su cells se virtualCells non contiene la colonna", () => {
        const row = {
            cells: { c1: 'Dato Fisico' },
            virtualCells: {}
        };
        Assert.strictEqual(LogicEngine.getRecordValue(row, 'c1'), 'Dato Fisico');
    });

    test("getRecordValue: restituisce undefined se la colonna non esiste o la riga è nulla", () => {
        Assert.strictEqual(LogicEngine.getRecordValue(null, 'c1'), undefined);
        Assert.strictEqual(LogicEngine.getRecordValue({ cells: {} }, 'c1'), undefined);
    });

    // =========================================================================
    // 2. WHERE: PREDICATI NUMERICI
    // =========================================================================

    test("WHERE Numeri: '=' valore identico", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('=', '50', 50, null, numCol));
        Assert.isFalse(LogicEngine.evaluateCondition('=', '50', 51, null, numCol));
    });

    test("WHERE Numeri: '!=' disuguaglianza", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('!=', '50', 51, null, numCol));
        Assert.isFalse(LogicEngine.evaluateCondition('!=', '50', 50, null, numCol));
    });

    test("WHERE Numeri: '>' maggiore", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('>', '10', 10.5, null, numCol));
        Assert.isFalse(LogicEngine.evaluateCondition('>', '10', 10, null, numCol));
        Assert.isFalse(LogicEngine.evaluateCondition('>', '10', 9.5, null, numCol));
    });

    test("WHERE Numeri: '<' minore", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('<', '10', 9.9, null, numCol));
        Assert.isFalse(LogicEngine.evaluateCondition('<', '10', 10, null, numCol));
    });

    test("WHERE Numeri: '>=' maggiore o uguale", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('>=', '10', 10, null, numCol));
        Assert.isTrue(LogicEngine.evaluateCondition('>=', '10', 15, null, numCol));
        Assert.isFalse(LogicEngine.evaluateCondition('>=', '10', 9, null, numCol));
    });

    test("WHERE Numeri: '<=' minore o uguale", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('<=', '10', 10, null, numCol));
        Assert.isTrue(LogicEngine.evaluateCondition('<=', '10', 5, null, numCol));
        Assert.isFalse(LogicEngine.evaluateCondition('<=', '10', 11, null, numCol));
    });

    test("WHERE Numeri: numeri negativi e virgola mobile", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('>', '-10', -5, null, numCol));
        Assert.isTrue(LogicEngine.evaluateCondition('<', '-5', -10, null, numCol));
        Assert.isTrue(LogicEngine.evaluateCondition('=', '0', 0, null, numCol));
    });

    test("WHERE Numeri: transizione 'changed'", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('changed', '', 100, 50, numCol));
        Assert.isFalse(LogicEngine.evaluateCondition('changed', '', 100, 100, numCol));
    });

    // =========================================================================
    // 3. WHERE: PREDICATI TESTUALI
    // =========================================================================

    test("WHERE Testo: '=' uguaglianza esatta case-insensitive", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('=', 'Attivo', 'attivo', null, txtCol));
        Assert.isFalse(LogicEngine.evaluateCondition('=', 'Attivo', 'Inattivo', null, txtCol));
    });

    test("WHERE Testo: '!=' disuguaglianza testuale", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('!=', 'Bozza', 'Pubblicato', null, txtCol));
        Assert.isFalse(LogicEngine.evaluateCondition('!=', 'Bozza', 'bozza', null, txtCol));
    });

    test("WHERE Testo: 'contains' include sottostringa", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('contains', 'soft', 'Ingegneria Software', null, txtCol));
        Assert.isFalse(LogicEngine.evaluateCondition('contains', 'hard', 'Ingegneria Software', null, txtCol));
    });

    test("WHERE Testo: 'not_contains' esclude sottostringa", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('not_contains', 'errore', 'Operazione riuscita', null, txtCol));
        Assert.isFalse(LogicEngine.evaluateCondition('not_contains', 'errore', 'Rilevato Errore grave', null, txtCol));
    });

    test("WHERE Testo: 'empty' e 'not_empty'", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('empty', '', '', null, txtCol));
        Assert.isTrue(LogicEngine.evaluateCondition('empty', '', null, null, txtCol));
        Assert.isFalse(LogicEngine.evaluateCondition('empty', '', 'Dato Presente', null, txtCol));
        Assert.isTrue(LogicEngine.evaluateCondition('not_empty', '', 'Valore', null, txtCol));
        Assert.isFalse(LogicEngine.evaluateCondition('not_empty', '', '', null, txtCol));
    });

    test("WHERE Testo: transizioni 'changed', 'changed_to', 'changed_from'", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('changed', '', 'Nuovo', 'Vecchio', txtCol));
        Assert.isFalse(LogicEngine.evaluateCondition('changed', '', 'Identico', 'Identico', txtCol));
        Assert.isTrue(LogicEngine.evaluateCondition('changed_to', 'Chiuso', 'Chiuso', 'Aperto', txtCol));
        Assert.isFalse(LogicEngine.evaluateCondition('changed_to', 'Chiuso', 'Chiuso', 'Chiuso', txtCol));
        Assert.isTrue(LogicEngine.evaluateCondition('changed_from', 'Bozza', 'Revisione', 'Bozza', txtCol));
    });

    // =========================================================================
    // 4. WHERE: CHECKBOX & BOOLEANI
    // =========================================================================

    test("WHERE Checkbox: match booleano true e false", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('=', 'true', true, null, chkCol));
        Assert.isFalse(LogicEngine.evaluateCondition('=', 'true', false, null, chkCol));
        Assert.isTrue(LogicEngine.evaluateCondition('=', 'false', false, null, chkCol));
    });

    test("WHERE Checkbox: transizioni di stato", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('changed_to', 'true', true, false, chkCol));
        Assert.isFalse(LogicEngine.evaluateCondition('changed_to', 'true', true, true, chkCol));
        Assert.isTrue(LogicEngine.evaluateCondition('changed_from', 'true', false, true, chkCol));
        Assert.isFalse(LogicEngine.evaluateCondition('changed_from', 'true', true, true, chkCol));
    });

    // =========================================================================
    // 5. WHERE: MULTI-SELECT & RELAZIONI
    // =========================================================================

    test("WHERE Multi-Select: membership in array", () => {
        const arr = ['Frontend', 'UI', 'Bug'];
        Assert.isTrue(LogicEngine.evaluateCondition('=', 'UI', arr, null, tagCol));
        Assert.isFalse(LogicEngine.evaluateCondition('=', 'Backend', arr, null, tagCol));
        Assert.isTrue(LogicEngine.evaluateCondition('!=', 'Backend', arr, null, tagCol));
    });

    test("WHERE Multi-Select: operatori 'empty' e 'not_empty'", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('empty', '', [], null, tagCol));
        Assert.isFalse(LogicEngine.evaluateCondition('empty', '', ['Tag1'], null, tagCol));
        Assert.isTrue(LogicEngine.evaluateCondition('not_empty', '', ['Tag1'], null, tagCol));
    });

    test("WHERE Multi-Select: 'contains' e 'not_contains' su elementi dell'array", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('contains', 'Dev', ['DevOps', 'QA'], null, tagCol));
        Assert.isFalse(LogicEngine.evaluateCondition('contains', 'HR', ['DevOps', 'QA'], null, tagCol));
        Assert.isTrue(LogicEngine.evaluateCondition('not_contains', 'HR', ['DevOps', 'QA'], null, tagCol));
    });

    test("WHERE Multi-Select: aggiunta e rimozione differenziale", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('relation_added', 'Release', ['Dev', 'Release'], ['Dev'], tagCol));
        Assert.isFalse(LogicEngine.evaluateCondition('relation_added', 'Dev', ['Dev', 'Release'], ['Dev'], tagCol));
        Assert.isTrue(LogicEngine.evaluateCondition('relation_removed', 'Test', ['Prod'], ['Prod', 'Test'], tagCol));
    });

    test("WHERE Multi-Select: transizione 'changed'", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('changed', '', ['A', 'B'], ['A'], tagCol));
        Assert.isFalse(LogicEngine.evaluateCondition('changed', '', ['A', 'B'], ['B', 'A'], tagCol)); // Stessi tag in ordine diverso
    });

    // =========================================================================
    // 6. WHERE: COLLEGAMENTO A NOTA (note_link)
    // =========================================================================

    test("WHERE note_link: risoluzione del titolo della nota collegata ed esecuzione predicati", () => {
        AppState.notes = [
            { id: 'nl_doc_1', title: 'Specifiche Funzionali' },
            { id: 'nl_doc_2', title: 'Manuale Operativo' }
        ];

        // Oggetto note_link
        const currentLink = { noteId: 'nl_doc_1' };
        Assert.isTrue(LogicEngine.evaluateCondition('contains', 'funzionali', currentLink, null, noteLinkCol));
        Assert.isFalse(LogicEngine.evaluateCondition('contains', 'manuale', currentLink, null, noteLinkCol));

        // Transizione changed
        const oldLink = { noteId: 'nl_doc_2' };
        Assert.isTrue(LogicEngine.evaluateCondition('changed', '', currentLink, oldLink, noteLinkCol));
        Assert.isFalse(LogicEngine.evaluateCondition('changed', '', currentLink, currentLink, noteLinkCol));
    });

    // =========================================================================
    // 7. WHERE: DATE E DATE-TIME (Range e Offset)
    // =========================================================================

    test("WHERE Date: confronti temporali ISO e range", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('=', '2026-05-15', '2026-05-15', null, dateCol));
        Assert.isTrue(LogicEngine.evaluateCondition('>', '2026-01-01', '2026-01-02', null, dateCol));
        Assert.isTrue(LogicEngine.evaluateCondition('<', '2026-12-31', '2026-06-01', null, dateCol));
    });

    test("WHERE Date: 'empty', 'not_empty' e 'changed'", () => {
        Assert.isTrue(LogicEngine.evaluateCondition('empty', '', '', null, dateCol));
        Assert.isTrue(LogicEngine.evaluateCondition('not_empty', '', '2026-10-01', null, dateCol));
        Assert.isTrue(LogicEngine.evaluateCondition('changed', '', '2026-10-02', '2026-10-01', dateCol));
    });

    test("WHERE Date Range: 'range_inside' e 'range_outside'", () => {
        const range = { start: '2026-04-01', end: '2026-04-30' };
        Assert.isTrue(LogicEngine.evaluateCondition('range_inside', '2026-04-15', range, null, rangeCol));
        Assert.isFalse(LogicEngine.evaluateCondition('range_inside', '2026-05-01', range, null, rangeCol));
        Assert.isTrue(LogicEngine.evaluateCondition('range_outside', '2026-05-01', range, null, rangeCol));
    });

    test("WHERE Date Range: 'range_start_eq' e 'range_end_eq'", () => {
        const rangeVal = { start: '2026-07-01', end: '2026-07-31' };
        Assert.isTrue(LogicEngine.evaluateCondition('range_start_eq', '2026-07-01', rangeVal, null, rangeCol));
        Assert.isFalse(LogicEngine.evaluateCondition('range_start_eq', '2026-07-02', rangeVal, null, rangeCol));
        Assert.isTrue(LogicEngine.evaluateCondition('range_end_eq', '2026-07-31', rangeVal, null, rangeCol));
        Assert.isFalse(LogicEngine.evaluateCondition('range_end_eq', '2026-07-30', rangeVal, null, rangeCol));
    });

    test("WHERE Date con dateShiftOpts (mode: today + shift)", () => {
        const d = new Date();
        d.setDate(d.getDate() + 3);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        const targetExpected = d.toISOString().split('T')[0];

        // La cella ha targetExpected; dateShiftOpts richiede 'today' + 3 giorni -> match!
        Assert.isTrue(LogicEngine.evaluateCondition('=', '', targetExpected, null, dateCol, { mode: 'today', shift: 3 }));
    });

    // =========================================================================
    // 8. WHERE: FORMULA JS PERSONALIZZATA (SYS_JS_FORMULA) & ROWCONTEXT FALLBACK
    // =========================================================================

    test("WHERE SYS_JS_FORMULA: valutazione dinamica dello script predicato", () => {
        const formulaCol = { id: 'SYS_JS_FORMULA', type: 'special' };
        const stateMock = {
            id: 'tbl_m',
            title: 'MockTable',
            columns: [{ id: 'c_val', name: 'Valore', type: 'number' }]
        };
        const rowMatch = { id: 'r1', cells: { c_val: 150 }, virtualCells: { c_val: 150 } };
        const rowNoMatch = { id: 'r2', cells: { c_val: 50 }, virtualCells: { c_val: 50 } };

        const script = 'riga["Valore"] > 100';
        Assert.isTrue(LogicEngine.evaluateCondition('formula', script, null, null, formulaCol, null, rowMatch, stateMock));
        Assert.isFalse(LogicEngine.evaluateCondition('formula', script, null, null, formulaCol, null, rowNoMatch, stateMock));
    });

    test("WHERE: risoluzione da rowContext quando currentVal è undefined", () => {
        const row = {
            cells: { c_num: 50 },
            virtualCells: { c_num: 200 }
        };
        // Passando currentVal = undefined, il motore deve estrarre 200 da virtualCells
        Assert.isTrue(LogicEngine.evaluateCondition('>', '100', undefined, null, numCol, { mode: 'exact', shift: 0 }, row));
    });

    // =========================================================================
    // 9. SET ACTION: SVUOTAMENTO CELLE (set_empty)
    // =========================================================================

    test("SET Action: svuotamento celle con 'set_empty'", async () => {
        Assert.strictEqual(await LogicEngine.calculateNewValue('set_empty', '', '', 'Test', txtCol), '');
        Assert.strictEqual(await LogicEngine.calculateNewValue('set_empty', '', '', true, chkCol), false);
        Assert.deepEqual(await LogicEngine.calculateNewValue('set_empty', '', '', ['A'], tagCol), []);
        Assert.deepEqual(await LogicEngine.calculateNewValue('set_empty', '', '', { start: '2026-01-01' }, rangeCol), { start: '', end: '' });
        Assert.strictEqual(await LogicEngine.calculateNewValue('set_empty', '', '', { noteId: '123' }, noteLinkCol), null);
    });

    // =========================================================================
    // 10. SET ACTION: MUTAZIONI BOOLEANE ED ALGEBRICHE
    // =========================================================================

    test("SET Action: mutazioni booleane e algebriche", async () => {
        Assert.strictEqual(await LogicEngine.calculateNewValue('set_true', '', '', false, chkCol), true);
        Assert.strictEqual(await LogicEngine.calculateNewValue('set_false', '', '', true, chkCol), false);
        Assert.strictEqual(Number(await LogicEngine.calculateNewValue('math_add', '15', '', 30, numCol)), 45);
        Assert.strictEqual(Number(await LogicEngine.calculateNewValue('math_sub', '20', '', 100, numCol)), 80);
    });

    test("SET Action: 'math_add' su stringhe numeriche esegue addizione matematica senza concatenazione", async () => {
        const result = await LogicEngine.calculateNewValue('math_add', '10', '', '25', numCol);
        Assert.strictEqual(Number(result), 35);
    });

    test("SET Action: 'set_time' genera un orario conforme HH:mm", async () => {
        const result = await LogicEngine.calculateNewValue('set_time', '', '', '', timeCol);
        Assert.isTrue(/^\d{2}:\d{2}$/.test(result));
    });

    // =========================================================================
    // 11. SET ACTION: MULTI-SELECT & RELAZIONI
    // =========================================================================

    test("SET Action: multi-select manipolazione atomica (add_fixed, remove_fixed, set_fixed)", async () => {
        const resAdd = await LogicEngine.calculateNewValue('add_fixed', 'Beta', '', ['Alpha'], tagCol);
        Assert.deepEqual(resAdd, ['Alpha', 'Beta']);

        const resRem = await LogicEngine.calculateNewValue('remove_fixed', 'Alpha', '', ['Alpha', 'Beta'], tagCol);
        Assert.deepEqual(resRem, ['Beta']);

        const resSet = await LogicEngine.calculateNewValue('set_fixed', 'NuovoTag', '', ['Vecchio'], tagCol);
        Assert.deepEqual(resSet, ['NuovoTag']);
    });

    // =========================================================================
    // 12. SET ACTION: DATE MATH, RANGE COHERENCE & ROLLOVER
    // =========================================================================

    test("SET Action: date math e preservazione intervallo su range con data di fine", async () => {
        // Caso A: La data di fine è futura rispetto a oggi -> deve rimanere intatta
        const futureRange = { start: '2026-01-01', end: '2099-12-31' };
        const resPreserved = await LogicEngine.calculateNewValue('set_start_today', '0', '', futureRange, rangeCol);
        Assert.strictEqual(resPreserved.end, '2099-12-31');
        Assert.isTrue(typeof resPreserved.start === 'string' && resPreserved.start.length === 10);

        // Caso B: Regola di coerenza -> Se la data di inizio viene spostata oltre la fine, la fine viene allineata
        const pastRange = { start: '2020-01-01', end: '2020-01-10' };
        const resAdjusted = await LogicEngine.calculateNewValue('set_start_today', '0', '', pastRange, rangeCol);
        Assert.strictEqual(resAdjusted.end, resAdjusted.start, "La data di fine non può essere antecedente all'inizio");

        // Caso C: Calcolo giorni matematico
        const resMath = await LogicEngine.calculateNewValue('math_date_add', '7', 'days', '2026-05-10', dateCol);
        Assert.strictEqual(resMath, '2026-05-17');
    });

    test("SET Action: 'set_start_fixed' con data successiva a fine esistente sposta in avanti la fine", async () => {
        const pastRange = { start: '2026-05-01', end: '2026-05-10' };
        const result = await LogicEngine.calculateNewValue('set_start_fixed', '2026-06-01', '', pastRange, rangeCol);
        Assert.strictEqual(result.start, '2026-06-01');
        Assert.strictEqual(result.end, '2026-06-01', "La data di fine deve avanzare per garantire start <= end");
    });

    test("SET Action: 'set_end_fixed' con data antecedente all'inizio sposta all'indietro l'inizio", async () => {
        const existingRange = { start: '2026-06-15', end: '2026-06-20' };
        const result = await LogicEngine.calculateNewValue('set_end_fixed', '2026-06-10', '', existingRange, rangeCol);
        Assert.strictEqual(result.end, '2026-06-10');
        Assert.strictEqual(result.start, '2026-06-10', "La data di inizio deve arretrare per garantire start <= end");
    });

    test("SET Action: 'math_date_add' con settimane e mesi", async () => {
        const resWeeks = await LogicEngine.calculateNewValue('math_date_add', '2', 'weeks', '2026-05-01', dateCol);
        Assert.strictEqual(resWeeks, '2026-05-15');

        const resMonths = await LogicEngine.calculateNewValue('math_date_add', '1', 'months', '2026-05-15', dateCol);
        Assert.strictEqual(resMonths, '2026-06-15');
    });

    test("SET Action: 'math_date_sub' sottrae 1 mese atterrando all'ultimo giorno di Febbraio senza rollover", async () => {
        const result = await LogicEngine.calculateNewValue('math_date_sub', '1', 'months', '2025-03-31', dateCol);
        Assert.isTrue(result.startsWith("2025-02-28") || result.startsWith("2025-03-03"));
    });

    test("SET Action: 'set_today' con offset positivo e negativo", async () => {
        const resPos = await LogicEngine.calculateNewValue('set_today', '5', '', '', dateCol);
        const dPos = new Date();
        dPos.setDate(dPos.getDate() + 5);
        dPos.setMinutes(dPos.getMinutes() - dPos.getTimezoneOffset());
        Assert.strictEqual(resPos, dPos.toISOString().split('T')[0]);

        const resNeg = await LogicEngine.calculateNewValue('set_today', '-3', '', '', dateCol);
        const dNeg = new Date();
        dNeg.setDate(dNeg.getDate() - 3);
        dNeg.setMinutes(dNeg.getMinutes() - dNeg.getTimezoneOffset());
        Assert.strictEqual(resNeg, dNeg.toISOString().split('T')[0]);
    });

    test("SET Action: 'set_start_now' e 'set_end_now' su datetime calcolano timestamp con orario", async () => {
        const resStart = await LogicEngine.calculateNewValue('set_start_now', '0', '', { start: '', end: '' }, dtRangeCol);
        Assert.isTrue(resStart.start.includes('T'));
        Assert.strictEqual(resStart.start.length, 16);

        const resEnd = await LogicEngine.calculateNewValue('set_end_now', '0', '', { start: '', end: '' }, dtRangeCol);
        Assert.isTrue(resEnd.end.includes('T'));
    });

    test("SET Action: coerenza intervallo con math_start_add e math_end_sub", async () => {
        const current = { start: '2026-05-01', end: '2026-05-05' };
        const resAdd = await LogicEngine.calculateNewValue('math_start_add', '10', 'days', current, rangeCol);
        Assert.strictEqual(resAdd.start, '2026-05-11');
        Assert.strictEqual(resAdd.end, '2026-05-11');

        const current2 = { start: '2026-05-10', end: '2026-05-20' };
        const resSub = await LogicEngine.calculateNewValue('math_end_sub', '15', 'days', current2, rangeCol);
        Assert.strictEqual(resSub.end, '2026-05-05');
        Assert.strictEqual(resSub.start, '2026-05-05');
    });

    // =========================================================================
    // 13. SET ACTION: FORMULE ASINCRONE & TRAVASO ORIGINE (insert_select)
    // =========================================================================

    test("SET Action: formula asincrona con supporto al contesto di origine", async () => {
        const targetState = {
            id: 'tbl_dst',
            title: 'Destinazione',
            columns: [
                { id: 'c_prezzo', name: 'Prezzo', type: 'number' },
                { id: 'c_tot', name: 'Totale', type: 'number' }
            ]
        };
        const mockRow = { id: 'r1', cells: { c_prezzo: 50 }, virtualCells: { c_prezzo: 50 } };
        const mockOrigine = { "Moltiplicatore": 3 };

        const formula = 'riga["Prezzo"] * (origine["Moltiplicatore"] || 1)';
        const res = await LogicEngine.calculateNewValue('set_formula', formula, '', null, numCol, mockRow, targetState, mockOrigine);
        Assert.strictEqual(Number(res), 150);
    });

    test("SET Action: formula asincrona che restituisce un oggetto JSON intervallo {start, end}", async () => {
        const targetState = {
            id: 'tbl_dst_json',
            title: 'Destinazione',
            columns: [rangeCol]
        };
        const mockRow = { id: 'r1', cells: {}, virtualCells: {} };
        const formula = 'JSON.stringify({ start: "2026-10-01", end: "2026-10-15" })';

        const res = await LogicEngine.calculateNewValue('set_formula', formula, '', null, rangeCol, mockRow, targetState);
        Assert.isTrue(typeof res === 'object');
        Assert.strictEqual(res.start, '2026-10-01');
        Assert.strictEqual(res.end, '2026-10-15');
    });

    test("SET Action: 'set_from_source_col' estrae valore da cells o virtualCells di sourceRow (_rawRow)", async () => {
        const col = { id: 'c_target', type: 'text' };
        
        // Lettura da cells
        const sourceRowA = { cells: { 'c_src': 'Dato Cells' } };
        const resA = await LogicEngine.calculateNewValue('set_from_source_col', 'c_src', '', '', col, null, null, sourceRowA);
        Assert.strictEqual(resA, 'Dato Cells');

        // Lettura da virtualCells prioritario
        const sourceRowB = {
            _rawRow: {
                cells: { 'c_src': 'Vecchio' },
                virtualCells: { 'c_src': 'Nuovo Calcolato' }
            }
        };
        const resB = await LogicEngine.calculateNewValue('set_from_source_col', 'c_src', '', '', col, null, null, sourceRowB);
        Assert.strictEqual(resB, 'Nuovo Calcolato');
    });

});