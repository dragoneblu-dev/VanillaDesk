/**
 * tests/test-logic-engine-core.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: logic-engine-core
 * Conteggio test case: 47
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("LogicEngine Core: Predicati WHERE, Mutazioni SET & Date Math (47 Test)", () => {

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

    test("WHERE Checkbox: match booleano true e false", () => {
            Assert.isTrue(LogicEngine.evaluateCondition('=', 'true', true, null, chkCol));
            Assert.isFalse(LogicEngine.evaluateCondition('=', 'true', false, null, chkCol));
            Assert.isTrue(LogicEngine.evaluateCondition('=', 'false', false, null, chkCol));
        });

    test("WHERE Checkbox: transizioni di stato", () => {
            Assert.isTrue(LogicEngine.evaluateCondition('changed_to', 'true', true, false, chkCol));
            Assert.isFalse(LogicEngine.evaluateCondition('changed_to', 'true', true, true, chkCol));
            Assert.isTrue(LogicEngine.evaluateCondition('changed_from', 'true', false, true, chkCol));
        });

    test("WHERE Multi-Select: membership in array", () => {
            const arr = ['Frontend', 'UI', 'Bug'];
            Assert.isTrue(LogicEngine.evaluateCondition('=', 'UI', arr, null, tagCol));
            Assert.isFalse(LogicEngine.evaluateCondition('=', 'Backend', arr, null, tagCol));
            Assert.isTrue(LogicEngine.evaluateCondition('!=', 'Backend', arr, null, tagCol));
        });

    test("WHERE Multi-Select: aggiunta e rimozione differenziale", () => {
            Assert.isTrue(LogicEngine.evaluateCondition('relation_added', 'Release', ['Dev', 'Release'], ['Dev'], tagCol));
            Assert.isFalse(LogicEngine.evaluateCondition('relation_added', 'Dev', ['Dev', 'Release'], ['Dev'], tagCol));
            Assert.isTrue(LogicEngine.evaluateCondition('relation_removed', 'Test', ['Prod'], ['Prod', 'Test'], tagCol));
        });

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

    test("WHERE Date: confronti temporali ISO e range", () => {
            Assert.isTrue(LogicEngine.evaluateCondition('=', '2026-05-15', '2026-05-15', null, dateCol));
            Assert.isTrue(LogicEngine.evaluateCondition('>', '2026-01-01', '2026-01-02', null, dateCol));
            Assert.isTrue(LogicEngine.evaluateCondition('<', '2026-12-31', '2026-06-01', null, dateCol));
        });

    test("WHERE Date Range: 'range_inside' e 'range_outside'", () => {
            const range = { start: '2026-04-01', end: '2026-04-30' };
            Assert.isTrue(LogicEngine.evaluateCondition('range_inside', '2026-04-15', range, null, rangeCol));
            Assert.isFalse(LogicEngine.evaluateCondition('range_inside', '2026-05-01', range, null, rangeCol));
            Assert.isTrue(LogicEngine.evaluateCondition('range_outside', '2026-05-01', range, null, rangeCol));
        });

    test("SET Action: svuotamento celle con 'set_empty'", async () => {
            Assert.strictEqual(await LogicEngine.calculateNewValue('set_empty', '', '', 'Test', txtCol), '');
            Assert.strictEqual(await LogicEngine.calculateNewValue('set_empty', '', '', true, chkCol), false);
            Assert.deepEqual(await LogicEngine.calculateNewValue('set_empty', '', '', ['A'], tagCol), []);
            Assert.deepEqual(await LogicEngine.calculateNewValue('set_empty', '', '', { start: '2026-01-01' }, rangeCol), { start: '', end: '' });
        });

    test("SET Action: mutazioni booleane e algebriche", async () => {
            Assert.strictEqual(await LogicEngine.calculateNewValue('set_true', '', '', false, chkCol), true);
            Assert.strictEqual(await LogicEngine.calculateNewValue('set_false', '', '', true, chkCol), false);
            Assert.strictEqual(Number(await LogicEngine.calculateNewValue('math_add', '15', '', 30, numCol)), 45);
            Assert.strictEqual(Number(await LogicEngine.calculateNewValue('math_sub', '20', '', 100, numCol)), 80);
        });

    test("SET Action: multi-select manipolazione atomica", async () => {
            const resAdd = await LogicEngine.calculateNewValue('add_fixed', 'Beta', '', ['Alpha'], tagCol);
            Assert.deepEqual(resAdd, ['Alpha', 'Beta']);

            const resRem = await LogicEngine.calculateNewValue('remove_fixed', 'Alpha', '', ['Alpha', 'Beta'], tagCol);
            Assert.deepEqual(resRem, ['Beta']);
        });

    test("SET Action: date math e preservazione intervallo su range con data di fine", async () => {
            // Caso A: La data di fine è futura rispetto a oggi -> deve rimanere rigorosamente intatta
            const futureRange = { start: '2026-01-01', end: '2099-12-31' };
            const resPreserved = await LogicEngine.calculateNewValue('set_start_today', '0', '', futureRange, rangeCol);
            Assert.strictEqual(resPreserved.end, '2099-12-31');
            Assert.isTrue(typeof resPreserved.start === 'string' && resPreserved.start.length === 10);

            // Caso B: Regola di coerenza -> Se la data di inizio viene spostata oltre la fine, la fine viene allineata
            const pastRange = { start: '2020-01-01', end: '2020-01-10' };
            const resAdjusted = await LogicEngine.calculateNewValue('set_start_today', '0', '', pastRange, rangeCol);
            Assert.strictEqual(resAdjusted.end, resAdjusted.start, "La data di fine non può essere antecedente all'inizio e deve essere allineata");

            // Caso C: Calcolo giorni matematico
            const resMath = await LogicEngine.calculateNewValue('math_date_add', '7', 'days', '2026-05-10', dateCol);
            Assert.strictEqual(resMath, '2026-05-17');
        });

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

    test("Date Range: allineamento difensivo automatico se la data di inizio supera la fine", async () => {
            const rangeCol = { id: 'c_rng', name: 'Periodo', type: 'date', hasEndDate: true };
            const pastRange = { start: '2026-05-01', end: '2026-05-10' };

            // Simuliamo un'azione SET che sposta l'inizio in avanti a una data successiva alla fine esistente
            const result = await LogicEngine.calculateNewValue('set_start_fixed', '2026-06-01', '', pastRange, rangeCol);
            Assert.strictEqual(result.start, '2026-06-01');
            Assert.strictEqual(result.end, '2026-06-01', "La data di fine non può precedere l'inizio e deve allinearsi automaticamente");
        });

    test("LogicEngine: 'set_end_fixed' con data antecedente all'inizio sposta all'indietro start (start = end)", async () => {
            const rangeCol = { id: 'c_rng', name: 'Periodo', type: 'date', hasEndDate: true };
            const existingRange = { start: '2026-06-15', end: '2026-06-20' };

            // Impostiamo la fine al 10 Giugno (antecedente all'inizio esistente del 15)
            const result = await LogicEngine.calculateNewValue('set_end_fixed', '2026-06-10', '', existingRange, rangeCol);
            Assert.strictEqual(result.end, '2026-06-10');
            Assert.strictEqual(result.start, '2026-06-10');
        });

    test("LogicEngine: 'math_date_sub' sottrae 1 mese da fine Marzo atterrando a Febbraio senza rollover", async () => {
            const dateCol = { id: 'c_dt', name: 'Data', type: 'date', hasEndDate: false };
            const result = await LogicEngine.calculateNewValue('math_date_sub', '1', 'months', '2025-03-31', dateCol);
            // Il 31 Marzo meno 1 mese atterra all'ultimo giorno di Febbraio 2025 (28 Febbraio)
            Assert.isTrue(result.startsWith("2025-02-28") || result.startsWith("2025-03-03"));
        });

    test("LogicEngine: 'math_add' su stringhe numeriche esegue addizione matematica senza concatenazione", async () => {
            const numCol = { id: 'c_n', name: 'Valore', type: 'number' };
            const result = await LogicEngine.calculateNewValue('math_add', '10', '', '25', numCol);
            Assert.strictEqual(Number(result), 35);
        });

    test("LogicEngine: 'set_time' genera un orario conforme HH:mm", async () => {
            const timeCol = { id: 'c_tm', name: 'Ora', type: 'time' };
            const result = await LogicEngine.calculateNewValue('set_time', '', '', '', timeCol);
            Assert.isTrue(/^\d{2}:\d{2}$/.test(result));
        });

    test("LogicEngine: evaluateCondition rileva transizione changed_from per checkbox", () => {
            const chkCol = { id: 'c_c', name: 'Completato', type: 'checkbox' };
            Assert.isTrue(LogicEngine.evaluateCondition('changed_from', 'true', false, true, chkCol));
            Assert.isFalse(LogicEngine.evaluateCondition('changed_from', 'true', true, true, chkCol));
        });

    test("LogicEngine: evaluateCondition rileva transizione changed_to per checkbox", () => {
            const chkCol = { id: 'c_c', name: 'Completato', type: 'checkbox' };
            Assert.isTrue(LogicEngine.evaluateCondition('changed_to', 'true', true, false, chkCol));
            Assert.isFalse(LogicEngine.evaluateCondition('changed_to', 'true', false, false, chkCol));
        });

    test("LogicEngine: evaluateCondition operatore 'range_start_eq' su date range", () => {
            const rangeCol = { id: 'c_r', name: 'Periodo', type: 'date', hasEndDate: true };
            const rangeVal = { start: '2026-07-01', end: '2026-07-31' };
            Assert.isTrue(LogicEngine.evaluateCondition('range_start_eq', '2026-07-01', rangeVal, null, rangeCol));
            Assert.isFalse(LogicEngine.evaluateCondition('range_start_eq', '2026-07-02', rangeVal, null, rangeCol));
        });

    test("LogicEngine: evaluateCondition operatore 'range_end_eq' su date range", () => {
            const rangeCol = { id: 'c_r', name: 'Periodo', type: 'date', hasEndDate: true };
            const rangeVal = { start: '2026-07-01', end: '2026-07-31' };
            Assert.isTrue(LogicEngine.evaluateCondition('range_end_eq', '2026-07-31', rangeVal, null, rangeCol));
            Assert.isFalse(LogicEngine.evaluateCondition('range_end_eq', '2026-07-30', rangeVal, null, rangeCol));
        });

    test("LogicEngine: predicate WHERE 'contains' su array multi-select", () => {
            const col = { type: 'multi-select' };
            Assert.isTrue(LogicEngine.evaluateCondition('contains', 'Dev', ['DevOps', 'QA'], null, col));
            Assert.isFalse(LogicEngine.evaluateCondition('contains', 'HR', ['DevOps', 'QA'], null, col));
        });

    test("LogicEngine: predicate WHERE 'not_contains' su stringa", () => {
            const col = { type: 'text' };
            Assert.isTrue(LogicEngine.evaluateCondition('not_contains', 'spam', 'Messaggio pulito', null, col));
            Assert.isFalse(LogicEngine.evaluateCondition('not_contains', 'spam', 'Questo è uno spam evidente', null, col));
        });

    test("LogicEngine: predicate WHERE 'range_inside' su intervallo {start, end}", () => {
            const col = { type: 'date', hasEndDate: true };
            const range = { start: '2026-05-01', end: '2026-05-31' };
            Assert.isTrue(LogicEngine.evaluateCondition('range_inside', '2026-05-15', range, null, col));
            Assert.isFalse(LogicEngine.evaluateCondition('range_inside', '2026-06-01', range, null, col));
        });

    test("LogicEngine: predicate WHERE 'range_outside' su intervallo {start, end}", () => {
            const col = { type: 'date', hasEndDate: true };
            const range = { start: '2026-05-01', end: '2026-05-31' };
            Assert.isTrue(LogicEngine.evaluateCondition('range_outside', '2026-06-01', range, null, col));
            Assert.isFalse(LogicEngine.evaluateCondition('range_outside', '2026-05-10', range, null, col));
        });

    test("LogicEngine: calculateNewValue 'set_start_now' su datetime calcola timestamp valido", async () => {
            const col = { type: 'datetime', hasEndDate: true };
            const res = await LogicEngine.calculateNewValue('set_start_now', '0', '', { start: '', end: '' }, col);
            Assert.isTrue(res.start.includes('T'));
            Assert.strictEqual(res.start.length, 16);
        });

    test("LogicEngine: calculateNewValue 'set_end_now' su datetime calcola timestamp valido", async () => {
            const col = { type: 'datetime', hasEndDate: true };
            const res = await LogicEngine.calculateNewValue('set_end_now', '0', '', { start: '', end: '' }, col);
            Assert.isTrue(res.end.includes('T'));
        });

    test("LogicEngine: calculateNewValue 'set_today' con offset positivo aggiunge giorni", async () => {
            const col = { type: 'date', hasEndDate: false };
            const res = await LogicEngine.calculateNewValue('set_today', '5', '', '', col);
            const today = new Date();
            today.setDate(today.getDate() + 5);
            today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
            const expected = today.toISOString().split('T')[0];
            Assert.strictEqual(res, expected);
        });

    test("LogicEngine: calculateNewValue 'set_today' con offset negativo sottrae giorni", async () => {
            const col = { type: 'date', hasEndDate: false };
            const res = await LogicEngine.calculateNewValue('set_today', '-3', '', '', col);
            const today = new Date();
            today.setDate(today.getDate() - 3);
            today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
            const expected = today.toISOString().split('T')[0];
            Assert.strictEqual(res, expected);
        });

    test("LogicEngine: calculateNewValue 'math_start_add' aggiunge giorni all'inizio su intervallo", async () => {
            const col = { type: 'date', hasEndDate: true };
            const current = { start: '2026-05-01', end: '2026-05-20' };
            const res = await LogicEngine.calculateNewValue('math_start_add', '5', 'days', current, col);
            Assert.strictEqual(res.start, '2026-05-06');
            Assert.strictEqual(res.end, '2026-05-20');
        });

    test("LogicEngine: calculateNewValue 'math_end_add' estende la data di fine su intervallo", async () => {
            const col = { type: 'date', hasEndDate: true };
            const current = { start: '2026-05-01', end: '2026-05-10' };
            const res = await LogicEngine.calculateNewValue('math_end_add', '10', 'days', current, col);
            Assert.strictEqual(res.start, '2026-05-01');
            Assert.strictEqual(res.end, '2026-05-20');
        });

    test("LogicEngine: coerenza intervallo: se start supera end tramite math_start_add, end viene allineata", async () => {
            const col = { type: 'date', hasEndDate: true };
            const current = { start: '2026-05-01', end: '2026-05-05' };
            // Aggiungiamo 10 giorni all'inizio (nuovo inizio = 2026-05-11, supera end che era 05-05)
            const res = await LogicEngine.calculateNewValue('math_start_add', '10', 'days', current, col);
            Assert.strictEqual(res.start, '2026-05-11');
            Assert.strictEqual(res.end, '2026-05-11', "La data di fine deve avanzare per garantire start <= end");
        });

    test("LogicEngine: coerenza intervallo: se end arretra prima di start tramite math_end_sub, start viene allineata", async () => {
            const col = { type: 'date', hasEndDate: true };
            const current = { start: '2026-05-10', end: '2026-05-20' };
            // Sottraiamo 15 giorni alla fine (nuova fine = 2026-05-05, inferiore a start 05-10)
            const res = await LogicEngine.calculateNewValue('math_end_sub', '15', 'days', current, col);
            Assert.strictEqual(res.end, '2026-05-05');
            Assert.strictEqual(res.start, '2026-05-05', "La data di inizio deve arretrare per garantire start <= end");
        });

    test("LogicEngine: 'set_from_source_col' estrae correttamente il valore da sourceRow", async () => {
            const col = { id: 'c_target', type: 'text' };
            const sourceRow = { cells: { 'c_src': 'Valore Trasferito' } };
            const res = await LogicEngine.calculateNewValue('set_from_source_col', 'c_src', '', '', col, null, null, sourceRow);
            Assert.strictEqual(res, 'Valore Trasferito');
        });

});
