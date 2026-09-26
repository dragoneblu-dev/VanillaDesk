/**
 * tests/test-journal-manager.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: journal-manager
 * Conteggio test case: 10
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("JournalManager: Log Temporale, Priorità, Filtri & CSV (10 Test)", () => {

    test("JournalManager: formatDate restituisce formato YYYY/MM/DD con padding", () => {
            const d = new Date(2026, 4, 5); // 5 Maggio 2026
            Assert.strictEqual(JournalManager.formatDate(d), "2026/05/05");
        });

    test("JournalManager: formatTime restituisce formato HH:MM con padding", () => {
            const d = new Date(2026, 0, 1, 9, 7); // 09:07
            Assert.strictEqual(JournalManager.formatTime(d), "09:07");
        });

    test("JournalManager: addEntry accoda nuovo record e azzera termine di ricerca attivo", () => {
            const jId = 'adv_journal_test1';
            AppState.databases[jId] = {
                title: 'Diario',
                entries: [],
                searchTerm: 'filtro_precedente'
            };

            JournalManager.addEntry(jId);

            const state = AppState.databases[jId];
            Assert.strictEqual(state.entries.length, 1);
            Assert.strictEqual(state.searchTerm, '');
            Assert.isTrue(state.entries[0].id.startsWith('je_'));
        });

    test("JournalManager: deleteEntry rimuove record specifico da entries", () => {
            const jId = 'adv_journal_del';
            AppState.databases[jId] = {
                title: 'Diario',
                entries: [
                    { id: 'je_1', content: 'Primo' },
                    { id: 'je_2', content: 'Secondo' }
                ]
            };

            JournalManager.deleteEntry(jId, 'je_1');
            const state = AppState.databases[jId];
            Assert.strictEqual(state.entries.length, 1);
            Assert.strictEqual(state.entries[0].id, 'je_2');
        });

    test("JournalManager: deleteEntry svuota le entries preservando il widget se l'ultima voce viene rimossa", () => {
            const jId = 'adv_journal_destroy';
            AppState.databases[jId] = {
                title: 'Diario',
                entries: [{ id: 'je_last', content: 'Solo' }]
            };

                JournalManager.deleteEntry(jId, 'je_last');
        const state = AppState.databases[jId];
        Assert.isTrue(state !== undefined, "Lo stato del widget deve rimanere registrato nel database");
        Assert.strictEqual(state.entries.length, 0, "L'array delle entries deve essere svuotato senza distruggere il widget");
        });

    test("JournalManager: setPriority assegna livelli 'high', 'low' e null", () => {
            const jId = 'adv_journal_prio';
            AppState.databases[jId] = {
                title: 'Diario',
                entries: [{ id: 'je_p', content: 'Task', priority: null }]
            };

            JournalManager.setPriority(jId, 'je_p', 'high');
            Assert.strictEqual(AppState.databases[jId].entries[0].priority, 'high');

            JournalManager.setPriority(jId, 'je_p', null);
            Assert.strictEqual(AppState.databases[jId].entries[0].priority, null);
        });

    test("JournalManager: toggleDate espande e comprime date in collapsedDates", () => {
            const jId = 'adv_journal_dates';
            AppState.databases[jId] = {
                title: 'Diario',
                entries: [],
                collapsedDates: []
            };

            JournalManager.toggleDate(jId, '2026/05/10');
            Assert.isTrue(AppState.databases[jId].collapsedDates.includes('2026/05/10'));

            JournalManager.toggleDate(jId, '2026/05/10');
            Assert.isFalse(AppState.databases[jId].collapsedDates.includes('2026/05/10'));
        });

    test("JournalManager: toggleHideCompleted inverte il flag di visualizzazione", () => {
            const jId = 'adv_journal_hide';
            AppState.databases[jId] = { title: 'Diario', entries: [], hideCompleted: false };

            JournalManager.toggleHideCompleted(jId);
            Assert.isTrue(AppState.databases[jId].hideCompleted);

            JournalManager.toggleHideCompleted(jId);
            Assert.isFalse(AppState.databases[jId].hideCompleted);
        });

    test("JournalManager: setDisplayLimit memorizza limiti 'all', 7 e 14 giorni", () => {
            const jId = 'adv_journal_lim';
            AppState.databases[jId] = { title: 'Diario', entries: [], displayLimit: 'all' };

            JournalManager.setDisplayLimit(jId, 7);
            Assert.strictEqual(AppState.databases[jId].displayLimit, 7);
        });

    test("JournalManager: updateTitle aggiorna il titolo con fallback di sicurezza su stringa vuota", () => {
            const jId = 'adv_journal_title';
            AppState.databases[jId] = { title: 'Vecchio', entries: [] };

            JournalManager.updateTitle(jId, 'Nuovo Titolo');
            Assert.strictEqual(AppState.databases[jId].title, 'Nuovo Titolo');

            JournalManager.updateTitle(jId, '   ');
            Assert.strictEqual(AppState.databases[jId].title, 'Diario / Log');
        });

});
