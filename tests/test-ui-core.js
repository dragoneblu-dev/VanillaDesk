/**
 * tests/test-ui-core.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-core
 * Conteggio test case: 1
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("UI Core: Interfaccia Base, Status Pill & Header Unsaved (1 Test)", () => {

    test("UI: formatDate produce una stringa temporale formattata conforme", () => {
            const iso = "2026-05-15T14:30:00.000Z";
            const formatted = UI.formatDate(iso);
            Assert.isTrue(formatted.includes("15/05") || formatted.includes("05/15"));
            Assert.isTrue(formatted.includes(":30"));
        });

});
