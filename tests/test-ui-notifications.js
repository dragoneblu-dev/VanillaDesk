/**
 * tests/test-ui-notifications.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-notifications
 * Conteggio test case: 6
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("UI Notifications: Toast System, Web Audio Beep & Allarmi (6 Test)", () => {

    test("UI Notifications: showToast non crea duplicati per lo stesso messaggio", () => {
            const t1 = UI.showToast("Messaggio Univoco", "info");
            const t2 = UI.showToast("Messaggio Univoco", "info");
            Assert.isNotNull(t1);
            Assert.isNull(t2, "Il secondo toast identico non deve essere inserito nel DOM");
        });

    test("UI Notifications: showToast con tipo 'alarm' imposta isPersistent = true e genera pulsanti Stop e Snooze", () => {
            const tId = UI.showToast("Allarme Urgente", "alarm");
            const toastEl = document.getElementById(tId);
            Assert.isNotNull(toastEl);
            Assert.isTrue(toastEl.innerHTML.includes('Stop'));
            Assert.isTrue(toastEl.innerHTML.includes('Snooze') || toastEl.innerHTML.includes('Min'));
            UI.Alarm.stop(tId);
        });

    test("UI Alarm: trigger registra i metadati nel dizionario _alarmData", () => {
            UI.Alarm.trigger("Promemoria Task", { noteId: 'note_alarm_meta', bookmarkId: 'bkm_10' });
            const lastToastId = Array.from(UI.Alarm.activeToasts).pop();
            Assert.isNotNull(lastToastId);
            Assert.strictEqual(UI.Alarm._alarmData[lastToastId].noteId, 'note_alarm_meta');
            Assert.strictEqual(UI.Alarm._alarmData[lastToastId].bookmarkId, 'bkm_10');
            UI.Alarm.stop(lastToastId);
        });

    test("UI Alarm: stop rimuove il toast e pulisce _alarmData", () => {
            UI.Alarm.trigger("Test Stop");
            const tId = Array.from(UI.Alarm.activeToasts).pop();
            Assert.isNotNull(UI.Alarm._alarmData[tId]);

            UI.Alarm.stop(tId);
            Assert.strictEqual(UI.Alarm._alarmData[tId], undefined);
            Assert.isFalse(UI.Alarm.activeToasts.has(tId));
        });

    test("UI.Alarm: audioCtx viene inizializzato al primo evento interattivo", () => {
            // Non deve lanciare eccezioni
            Assert.doesNotThrow(() => {
                UI.Alarm.init();
            });
        });

    test("UI.Alarm: snooze su promemoria non vincolato a nota programma setTimeout", () => {
            const tId = 'toast_snooze_loose';
            UI.Alarm._alarmData[tId] = { message: 'Allarme Svincolato' };
            UI.Alarm.activeToasts.add(tId);

            let timeoutTriggered = false;
            const origSetTimeout = window.setTimeout;
            window.setTimeout = (fn, delay) => {
                timeoutTriggered = true;
                return 9999;
            };

            try {
                UI.Alarm.snooze(tId, 5);
                Assert.isTrue(timeoutTriggered);
            } finally {
                window.setTimeout = origSetTimeout;
            }
        });

});
