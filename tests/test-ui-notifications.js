/**
 * tests/test-ui-notifications.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-notifications
 */

describe("UI Notifications: Toast System, Web Audio Beep & Allarmi (test-ui-notifications.js)", () => {

    afterEach(() => {
        UI.Alarm.stopAll();
        UI.ProgressModal.hide();
        const container = document.getElementById('adv-toast-container');
        if (container) container.innerHTML = '';
    });

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

    test("UI Notifications: showToast applica i bordi colorati conformi per success, warning, error e auto", () => {
        const sId = UI.showToast("Operazione riuscita", "success");
        const wId = UI.showToast("Attenzione richiesta", "warning");
        const eId = UI.showToast("Errore critico", "error");

        const sEl = document.getElementById(sId);
        const wEl = document.getElementById(wId);
        const eEl = document.getElementById(eId);

        Assert.strictEqual(sEl.style.borderLeftColor, "rgb(34, 197, 94)");
        Assert.strictEqual(wEl.style.borderLeftColor, "rgb(234, 179, 8)");
        Assert.strictEqual(eEl.style.borderLeftColor, "rgb(239, 68, 68)");
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

    test("UI Alarm: stopAll arresta tutti gli allarmi contemporanei e cancella il loop sonoro", () => {
        UI.Alarm.trigger("Allarme 1");
        UI.Alarm.trigger("Allarme 2");
        Assert.strictEqual(UI.Alarm.activeToasts.size, 2);

        UI.Alarm.stopAll();

        Assert.strictEqual(UI.Alarm.activeToasts.size, 0);
        Assert.isNull(UI.Alarm.beepInterval);
    });

    test("UI.Alarm: audioCtx viene inizializzato al primo evento interattivo", () => {
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

    test("UI.Alarm: snooze su segnalibro associato delega a Editor.snoozeBookmark", () => {
        const tId = 'toast_bkm_snooze';
        UI.Alarm._alarmData[tId] = { noteId: 'n_target_snooze', bookmarkId: 'bkm_99' };
        UI.Alarm.activeToasts.add(tId);

        let snoozedNoteId = null;
        let snoozedBkmId = null;
        let snoozedMins = null;

        const origSnoozeBkm = Editor.snoozeBookmark;
        Editor.snoozeBookmark = (nId, bId, m) => {
            snoozedNoteId = nId;
            snoozedBkmId = bId;
            snoozedMins = m;
        };

        try {
            UI.Alarm.snooze(tId, 15);
            Assert.strictEqual(snoozedNoteId, 'n_target_snooze');
            Assert.strictEqual(snoozedBkmId, 'bkm_99');
            Assert.strictEqual(snoozedMins, 15);
        } finally {
            Editor.snoozeBookmark = origSnoozeBkm;
        }
    });

    test("UI ProgressModal: show, update e hide visualizzano correttamente il progresso matematico", () => {
        UI.ProgressModal.show("Elaborazione File", "Inizio...", 0, 100);

        let overlay = document.getElementById('adv-progress-modal-overlay');
        Assert.isNotNull(overlay);
        Assert.strictEqual(document.getElementById('advProgressModalCounter').innerText, "0 / 100");
        Assert.strictEqual(document.getElementById('advProgressModalPct').innerText, "0%");

        UI.ProgressModal.update("Avanzamento...", 50, 100);
        Assert.strictEqual(document.getElementById('advProgressModalCounter').innerText, "50 / 100");
        Assert.strictEqual(document.getElementById('advProgressModalPct').innerText, "50%");
        Assert.strictEqual(document.getElementById('advProgressModalBar').style.width, "50%");

        UI.ProgressModal.hide();
        overlay = document.getElementById('adv-progress-modal-overlay');
        Assert.isNull(overlay);
    });

});