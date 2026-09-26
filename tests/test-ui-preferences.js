/**
 * tests/test-ui-preferences.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-preferences
 * Conteggio test case: 2
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("UI Preferences: Temi, Zoom Font, WordWrap & Continuous Edit (2 Test)", () => {

    test("UI Preferences: togglePageWidth alterna tra 900px e 100%", () => {
            document.documentElement.style.setProperty('--page-max-width', '900px');

            UI.togglePageWidth();
            Assert.strictEqual(document.documentElement.style.getPropertyValue('--page-max-width'), '100%');

            UI.togglePageWidth();
            Assert.strictEqual(document.documentElement.style.getPropertyValue('--page-max-width'), '900px');
        });

    test("UI Preferences: changeFontSize incrementa e rispetta limiti min (10px) e max (32px)", () => {
            UI.currentFontSize = 16;
            UI.changeFontSize(2);
            Assert.strictEqual(UI.currentFontSize, 18);
            Assert.strictEqual(document.documentElement.style.getPropertyValue('--reading-font-size'), '18px');

            UI.changeFontSize(-30);
            Assert.strictEqual(UI.currentFontSize, 10); // Min clamp

            UI.changeFontSize(50);
            Assert.strictEqual(UI.currentFontSize, 32); // Max clamp
        });

});
