/**
 * tests/test-advanced-table-actions.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-actions
 * Conteggio test case: 13
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Actions: Circolarità Grafo, Drag Colonne & Resizing (13 Test)", () => {

    test("Circolarità: auto-riferimento diretto (Task 1 -> Task 1)", () => {
            AppState.databases['db_cycle'] = {
                id: 'db_cycle',
                columns: [{ id: 'p_rel', name: 'Padre', type: 'relation', targetTableId: 'db_cycle' }],
                rows: [{ id: 't1', cells: { p_rel: [] } }]
            };
            Assert.isTrue(AdvancedTable.checkCircularRelation('db_cycle', 't1', 'db_cycle', 't1'));
        });

    test("Circolarità: ciclo a 2 stadi (A -> B -> A)", () => {
            AppState.databases['db_cycle'].rows = [
                { id: 't1', cells: { p_rel: ['t2'] } },
                { id: 't2', cells: { p_rel: [] } }
            ];
            Assert.isTrue(AdvancedTable.checkCircularRelation('db_cycle', 't2', 'db_cycle', 't1'));
        });

    test("Circolarità: ciclo profondo a 4 stadi (A -> B -> C -> D -> A)", () => {
            AppState.databases['db_cycle'].rows = [
                { id: 't1', cells: { p_rel: ['t2'] } },
                { id: 't2', cells: { p_rel: ['t3'] } },
                { id: 't3', cells: { p_rel: ['t4'] } },
                { id: 't4', cells: { p_rel: [] } }
            ];
            Assert.isTrue(AdvancedTable.checkCircularRelation('db_cycle', 't4', 'db_cycle', 't1'));
        });

    test("Circolarità: connessione legittima in un grafo ad albero aciclico", () => {
            AppState.databases['db_cycle'].rows.push({ id: 't5', cells: { p_rel: [] } });
            Assert.isFalse(AdvancedTable.checkCircularRelation('db_cycle', 't5', 'db_cycle', 't3'));
        });

    test("Circolarità: auto-riferimento riflessivo diretto (A -> A) viene sempre bloccato", () => {
            AppState.databases['db_multi_rel'] = {
                id: 'db_multi_rel',
                columns: [
                    { id: 'c_padre', name: 'Padre', type: 'relation', targetTableId: 'db_multi_rel' },
                    { id: 'c_figlio', name: 'Figlio', type: 'relation', targetTableId: 'db_multi_rel' }
                ],
                rows: [{ id: 'rec_1', cells: { c_padre: [], c_figlio: [] } }]
            };
            Assert.isTrue(AdvancedTable.checkCircularRelation('db_multi_rel', 'rec_1', 'db_multi_rel', 'rec_1', 'c_padre'));
            Assert.isTrue(AdvancedTable.checkCircularRelation('db_multi_rel', 'rec_1', 'db_multi_rel', 'rec_1', 'c_figlio'));
        });

    test("Circolarità: relazioni inverse 'Padre' e 'Figlio' sullo stesso DB non generano falsi positivi", () => {
            // Record A ha come figlio B (A -> B su c_figlio)
            AppState.databases['db_multi_rel'].rows = [
                { id: 'rec_A', cells: { c_padre: [], c_figlio: ['rec_B'] } },
                { id: 'rec_B', cells: { c_padre: [], c_figlio: [] } }
            ];

            // Tentativo di impostare che B ha come padre A (B -> A su c_padre)
            // Deve essere PERMESSO (false) poiché i campi c_padre e c_figlio sono semanticamente distinti
            const isBlocked = AdvancedTable.checkCircularRelation('db_multi_rel', 'rec_B', 'db_multi_rel', 'rec_A', 'c_padre');
            Assert.isFalse(isBlocked, "Relazioni inverse su campi distinti non devono essere scambiate per cicli");
        });

    test("Circolarità: ciclo reale lungo la STESSA colonna (A -> B -> A su 'Padre') viene intercettato", () => {
            // A ha come padre B (A.c_padre = ['rec_B'])
            AppState.databases['db_multi_rel'].rows = [
                { id: 'rec_A', cells: { c_padre: ['rec_B'], c_figlio: [] } },
                { id: 'rec_B', cells: { c_padre: [], c_figlio: [] } }
            ];

            // Tentativo di impostare che B ha come padre A (B.c_padre = ['rec_A']) lungo lo stesso campo
            const isLoop = AdvancedTable.checkCircularRelation('db_multi_rel', 'rec_B', 'db_multi_rel', 'rec_A', 'c_padre');
            Assert.isTrue(isLoop, "Un ciclo chiuso lungo la stessa colonna relazionale deve essere bloccato");
        });

    test("Circolarità: ciclo reale lungo la STESSA colonna (A -> B -> C -> A su 'Figlio') viene intercettato", () => {
            AppState.databases['db_multi_rel'].rows = [
                { id: 'rec_1', cells: { c_padre: [], c_figlio: ['rec_2'] } },
                { id: 'rec_2', cells: { c_padre: [], c_figlio: ['rec_3'] } },
                { id: 'rec_3', cells: { c_padre: [], c_figlio: [] } }
            ];

            // Tentativo di impostare 3 -> 1 su c_figlio
            const isLoop = AdvancedTable.checkCircularRelation('db_multi_rel', 'rec_3', 'db_multi_rel', 'rec_1', 'c_figlio');
            Assert.isTrue(isLoop);
        });

    test("Circolarità: collegamenti ortogonali indipendenti nello stesso DB (Supervisore vs Sostituto)", () => {
            const dbHR = {
                id: 'db_hr',
                columns: [
                    { id: 'c_boss', name: 'Supervisore', type: 'relation', targetTableId: 'db_hr' },
                    { id: 'c_sub', name: 'Sostituto', type: 'relation', targetTableId: 'db_hr' }
                ],
                rows: [
                    { id: 'emp_A', cells: { c_boss: [], c_sub: ['emp_B'] } }, // A ha come sostituto B
                    { id: 'emp_B', cells: { c_boss: [], c_sub: [] } }
                ]
            };
            AppState.databases['db_hr'] = dbHR;

            // B imposta A come proprio Supervisore: deve essere consentito!
            const isBlocked = AdvancedTable.checkCircularRelation('db_hr', 'emp_B', 'db_hr', 'emp_A', 'c_boss');
            Assert.isFalse(isBlocked);
        });

    test("Circolarità: relazioni bidirezionali tra DB DIVERSI non vengono bloccate", () => {
            // Azienda -> Persona e Persona -> Azienda
            AppState.databases['db_companies'] = {
                id: 'db_companies',
                columns: [{ id: 'c_emps', name: 'Dipendenti', type: 'relation', targetTableId: 'db_people' }],
                rows: [{ id: 'comp_1', cells: { c_emps: ['person_1'] } }]
            };
            AppState.databases['db_people'] = {
                id: 'db_people',
                columns: [{ id: 'c_employer', name: 'Datore', type: 'relation', targetTableId: 'db_companies' }],
                rows: [{ id: 'person_1', cells: { c_employer: [] } }]
            };

            // person_1 imposta comp_1 come proprio Datore
            const isBlocked = AdvancedTable.checkCircularRelation('db_people', 'person_1', 'db_companies', 'comp_1', 'c_employer');
            Assert.isFalse(isBlocked, "Relazioni tra database diversi non devono produrre falsi positivi di circolarità");
        });

    test("Circolarità: fallback di sicurezza se colId non viene fornito", () => {
            // Se colId è nullo, controlla solo l'auto-riferimento riflessivo diretto A -> A
            Assert.isTrue(AdvancedTable.checkCircularRelation('db_any', 'row_1', 'db_any', 'row_1', null));
        });

    test("Timeline Drag: createDependency rispetta la colonna auto-referenziale esatta", () => {
            const dbTl = {
                id: 'db_tl_cycle',
                columns: [
                    { id: 'c_gantt_dep', name: 'Dipendenza', type: 'relation', targetTableId: 'db_tl_cycle' }
                ],
                rows: [
                    { id: 'task_1', cells: { c_gantt_dep: ['task_2'] } },
                    { id: 'task_2', cells: { c_gantt_dep: [] } }
                ]
            };
            AppState.databases['db_tl_cycle'] = dbTl;

            // Modificando task_2 per aggiungere task_1 come dipendenza (creerebbe il ciclo task_2 -> task_1 -> task_2)
            const isCycle = AdvancedTable.checkCircularRelation('db_tl_cycle', 'task_2', 'db_tl_cycle', 'task_1', 'c_gantt_dep');
            Assert.isTrue(isCycle);
        });

    test("Auto-relazione: isolamento del grafo quando una riga ha collegamenti nulli o non-array", () => {
            const dbSafe = {
                id: 'db_safe',
                columns: [{ id: 'rel', type: 'relation', targetTableId: 'db_safe' }],
                rows: [
                    { id: 'r1', cells: { rel: null } },
                    { id: 'r2', cells: { rel: 'stringa_singola_malformata' } }
                ]
            };
            AppState.databases['db_safe'] = dbSafe;

            // Non deve lanciare eccezioni
            Assert.doesNotThrow(() => {
                AdvancedTable.checkCircularRelation('db_safe', 'r1', 'db_safe', 'r2', 'rel');
            });
        });

});
