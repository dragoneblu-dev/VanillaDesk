/**
 * tests/test-ui-notes-utils.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-notes-utils
 * Conteggio test case: 1
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("UI Notes Utils: Breadcrumb, Preferiti, Badge & Controlli (1 Test)", () => {

    test("UI: checkAndUpdatePropertiesIcon disattiva il pulsante se non ci sono proprietà", () => {
            const btn = document.getElementById('btnNoteProperties');
            UI.checkAndUpdatePropertiesIcon('note_untagged');
            Assert.isFalse(btn.classList.contains('active'));
        });

});
