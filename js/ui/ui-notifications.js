/**
 * ui-notifications.js
 * Modulo UI per i popup (Toast) temporanei, il Sintetizzatore Audio (Allarmi)
 * e la finestra modale di avanzamento sincrono su disco (UI.ProgressModal).
 * Gestione dello Snooze resiliente per i promemoria da segnalibro tramite registro dati sicuro.
 * FIX LAYOUT PROGRESS MODAL: Forzatura esplicita di layout a colonna flessibile per centrare
 * stabilmente l'icona della clessidra all'interno del riquadro modale.
 * FIX ALARM BEEP INTERVAL LEAK: Assegnazione esplicita dell'ID di setInterval a UI.Alarm.beepInterval
 * e fail-safe con auto-estinzione quando activeToasts è vuoto per garantire l'interruzione immediata dell'audio su Stop/Snooze.
 * FIX DUPLICATE RACE CONDITION: Risolta finestra cieca dei 10ms nel rilevamento duplicati con querySelectorAll('.toast-msg:not(.toast-exit)')
 * garantendo il corretto rifiuto sincrono di toast identici.
 */

Object.assign(UI, {
    showToast: (message, type = 'info', isPersistent = false, meta = null) => {
        let container = document.getElementById('adv-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'adv-toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        // Seleziona tutti i toast attivi escludendo solo quelli già in fase di dissolvenza/uscita (.toast-exit)
        const existingToasts = Array.from(container.querySelectorAll('.toast-msg:not(.toast-exit)'));
        const cleanMessage = String(message).replace(/<[^>]*>?/gm, '').trim();
        const isDuplicate = existingToasts.some(t => {
            const existingText = (t.innerText || t.textContent || '').trim();
            return existingText.includes(cleanMessage);
        });

        if (isDuplicate) return null;

        const toastId = 'toast_' + Date.now() + Math.random().toString(36).substring(2, 5);
        const toast = document.createElement('div');
        toast.className = 'toast-msg';
        toast.id = toastId;
        
        let icon = Icons.info;
        let iconColor = 'currentColor';
        let extraHTML = '';

        if (type === 'success') { toast.style.borderLeftColor = '#22c55e'; icon = Icons.checkCircle; iconColor = '#22c55e'; }
        else if (type === 'warning') { toast.style.borderLeftColor = '#eab308'; icon = Icons.alertTriangle; iconColor = '#eab308'; }
        else if (type === 'error') { toast.style.borderLeftColor = '#ef4444'; icon = Icons.xCircle; iconColor = '#ef4444'; }
        else if (type === 'auto') { toast.style.borderLeftColor = '#2563eb'; icon = Icons.lightning; iconColor = '#2563eb'; }
        else if (type === 'alarm') { 
            toast.style.borderLeftColor = '#ef4444'; 
            icon = Icons.alarm; 
            iconColor = '#ef4444'; 
            isPersistent = true;

            extraHTML = `
                <div style="display:flex; gap:8px; margin-top:10px;">
                    <button class="btn danger" style="padding:4px 10px; font-weight:bold; background:rgba(239,68,68,0.1); color:var(--danger-color); border:1px solid rgba(239,68,68,0.2);" onclick="UI.Alarm.stop('${toastId}')">
                        <span style="display:inline-flex; align-items:center; gap:4px;">${Icons.stopSquare} Stop</span>
                    </button>
                    <button class="btn" style="padding:4px 10px; font-weight:bold; background:var(--sidebar-bg); color:var(--text-primary); border:1px solid var(--border-color);" onclick="UI.Alarm.snooze('${toastId}', 10)">
                        <span style="display:inline-flex; align-items:center; gap:4px;">${Icons.snooze} +10 Min</span>
                    </button>
                    <button class="btn" style="padding:4px 10px; font-weight:bold; background:var(--sidebar-bg); color:var(--text-primary); border:1px solid var(--border-color);" onclick="UI.Alarm.snooze('${toastId}', 30)">
                        +30 Min
                    </button>
                </div>
            `;
        }
        
        let messageHTML = `<div style="color: var(--text-primary);">${message}</div>`;
        if (extraHTML) messageHTML = `<div style="flex:1; color: var(--text-primary);">${message}${extraHTML}</div>`;

        toast.innerHTML = `<span style="color:${iconColor}; display:inline-flex; align-items:flex-start; margin-top:2px;">${icon}</span> ${messageHTML}`;
        container.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        
        if (!isPersistent) {
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    toast.classList.add('toast-exit');
                    toast.classList.remove('show');
                    setTimeout(() => { if (document.body.contains(toast)) toast.remove(); }, 300);
                }
            }, 4000);
        }

        return toastId; 
    },

    // =========================================================================
    // MODALE DI AVANZAMENTO SINCRONO SU DISCO (Anti-Chiusura Intempestiva)
    // =========================================================================
    ProgressModal: {
        _overlay: null,

        show: (title, message, current = 0, total = 100) => {
            UI.ProgressModal.hide();

            const overlay = document.createElement('div');
            overlay.id = 'adv-progress-modal-overlay';
            overlay.className = 'link-modal-overlay';
            overlay.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(0, 0, 0, 0.75);
                z-index: 10005;
                backdrop-filter: blur(2px);
            `;

            const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
            const safeTitle = UI.escapeHTML(title);
            const safeMsg = UI.escapeHTML(message);

            overlay.innerHTML = `
                <div class="link-modal modal-animate" style="width: 460px; max-width: 90vw; padding: 25px; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box;">
                    <div style="margin-bottom: 15px; display: flex; align-items: center; justify-content: center; width: 100%; color: var(--accent-color); transform: scale(1.4);">
                        ${typeof Icons !== 'undefined' ? Icons.hourglass : '⏳'}
                    </div>
                    <h3 id="advProgressModalTitle" style="margin: 0 0 10px 0; font-size: 1.15rem; color: var(--text-primary); text-align: center; width: 100%;">
                        ${safeTitle}
                    </h3>
                    <div id="advProgressModalMsg" style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 18px; line-height: 1.45; text-align: center; width: 100%;">
                        ${safeMsg}
                    </div>

                    <div style="width: 100%; height: 10px; background: rgba(0, 0, 0, 0.08); border-radius: 5px; overflow: hidden; margin-bottom: 8px; border: 1px solid var(--border-color);">
                        <div id="advProgressModalBar" style="width: ${pct}%; height: 100%; background: var(--accent-color); transition: width 0.15s ease;"></div>
                    </div>

                    <div style="display: flex; justify-content: space-between; width: 100%; font-size: 0.75rem; color: var(--text-secondary); font-family: monospace;">
                        <span id="advProgressModalCounter">${current} / ${total}</span>
                        <span id="advProgressModalPct">${pct}%</span>
                    </div>

                    <div style="margin-top: 15px; font-size: 0.75rem; color: var(--danger-color); font-weight: 600; text-align: center; width: 100%;">
                        ⚠️ ${I18n.t('progress.do_not_close') || "Non chiudere la finestra del browser fino al termine dell'operazione."}
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            UI.ProgressModal._overlay = overlay;
        },

        update: (message, current, total) => {
            const overlay = UI.ProgressModal._overlay || document.getElementById('adv-progress-modal-overlay');
            if (!overlay) return;

            const msgEl = overlay.querySelector('#advProgressModalMsg');
            const barEl = overlay.querySelector('#advProgressModalBar');
            const counterEl = overlay.querySelector('#advProgressModalCounter');
            const pctEl = overlay.querySelector('#advProgressModalPct');

            const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

            if (msgEl && message) msgEl.innerText = message;
            if (barEl) barEl.style.width = `${pct}%`;
            if (counterEl) counterEl.innerText = `${current} / ${total}`;
            if (pctEl) pctEl.innerText = `${pct}%`;
        },

        hide: () => {
            const overlay = UI.ProgressModal._overlay || document.getElementById('adv-progress-modal-overlay');
            if (overlay) {
                overlay.remove();
                UI.ProgressModal._overlay = null;
            }
        }
    },

    Alarm: {
        audioCtx: null,
        beepInterval: null,
        activeToasts: new Set(),
        _alarmData: {},

        init: () => {
            const unlockAudio = () => {
                try {
                    if (!UI.Alarm.audioCtx) {
                        const AudioContext = window.AudioContext || window.webkitAudioContext;
                        UI.Alarm.audioCtx = new AudioContext();
                    }
                    if (UI.Alarm.audioCtx.state === 'suspended') {
                        UI.Alarm.audioCtx.resume();
                    }
                } catch (e) {
                    console.warn("AudioContext non supportato.");
                }
                document.removeEventListener('click', unlockAudio);
                document.removeEventListener('keydown', unlockAudio);
            };

            document.addEventListener('click', unlockAudio);
            document.addEventListener('keydown', unlockAudio);
        },

        trigger: (message, meta = null) => {
            const msgToPush = message || 'Promemoria: Azione Richiesta!';
            const toastId = UI.showToast(msgToPush, 'alarm', true, meta);
            
            if (toastId) {
                UI.Alarm.activeToasts.add(toastId);
                UI.Alarm._alarmData[toastId] = {
                    message: msgToPush,
                    noteId: meta ? meta.noteId : null,
                    bookmarkId: meta ? meta.bookmarkId : null
                };
                UI.Alarm.play();
            }
        },

        play: () => {
            try {
                if (!UI.Alarm.audioCtx) {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    UI.Alarm.audioCtx = new AudioContext();
                }

                if (UI.Alarm.audioCtx.state === 'suspended') {
                    UI.Alarm.audioCtx.resume();
                }

                if (!UI.Alarm.beepInterval) {
                    UI.Alarm.beepInterval = setInterval(() => {
                        // Fail-safe difensivo: se non ci sono più toast di allarme attivi, interrompi il loop
                        if (!UI.Alarm.audioCtx || UI.Alarm.activeToasts.size === 0) {
                            if (UI.Alarm.beepInterval) {
                                clearInterval(UI.Alarm.beepInterval);
                                UI.Alarm.beepInterval = null;
                            }
                            return;
                        }

                        const osc = UI.Alarm.audioCtx.createOscillator();
                        const gain = UI.Alarm.audioCtx.createGain();
                        
                        osc.type = 'square';
                        osc.frequency.setValueAtTime(880, UI.Alarm.audioCtx.currentTime); 
                        
                        gain.gain.setValueAtTime(0.1, UI.Alarm.audioCtx.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.00001, UI.Alarm.audioCtx.currentTime + 0.3);
                        
                        osc.connect(gain);
                        gain.connect(UI.Alarm.audioCtx.destination);
                        
                        osc.start();
                        osc.stop(UI.Alarm.audioCtx.currentTime + 0.3);
                    }, 600);
                }

            } catch(e) {}
        },

        _removeToastAndCheckAudio: (toastId) => {
            if (!toastId) return; 
            const toast = document.getElementById(toastId);
            if (toast) {
                toast.classList.add('toast-exit');
                toast.classList.remove('show');
                setTimeout(() => { if (document.body.contains(toast)) toast.remove(); }, 300);
            }
            
            UI.Alarm.activeToasts.delete(toastId);
            
            if (UI.Alarm.activeToasts.size === 0) {
                if (UI.Alarm.beepInterval) {
                    clearInterval(UI.Alarm.beepInterval);
                    UI.Alarm.beepInterval = null;
                }
            }
        },

        stop: (toastId = null) => {
            if (toastId) {
                delete UI.Alarm._alarmData[toastId];
                UI.Alarm._removeToastAndCheckAudio(toastId);
            } else {
                UI.Alarm.stopAll();
            }
        },

        stopAll: () => {
            if (UI.Alarm.beepInterval) {
                clearInterval(UI.Alarm.beepInterval);
                UI.Alarm.beepInterval = null;
            }
            UI.Alarm.activeToasts.forEach(tId => {
                const toast = document.getElementById(tId);
                if (toast) {
                    toast.classList.add('toast-exit');
                    toast.classList.remove('show');
                    setTimeout(() => { if (document.body.contains(toast)) toast.remove(); }, 300);
                }
            });
            UI.Alarm.activeToasts.clear();
            UI.Alarm._alarmData = {};
        },

        snooze: (toastId, minutes = 5) => {
            const data = UI.Alarm._alarmData[toastId] || {};
            delete UI.Alarm._alarmData[toastId];
            UI.Alarm._removeToastAndCheckAudio(toastId);

            const noteId = data.noteId;
            const bookmarkId = data.bookmarkId;
            const message = data.message || 'Promemoria: Azione Richiesta!';

            // Se l'allarme proviene da un segnalibro fisico, posticipa direttamente sulla nota
            if (noteId && typeof Editor !== 'undefined' && typeof Editor.snoozeBookmark === 'function') {
                Editor.snoozeBookmark(noteId, bookmarkId, minutes);
                return;
            }

            // Fallback per promemoria non vincolati a un segnalibro specifico
            setTimeout(() => {
                UI.Alarm.trigger(message);
            }, minutes * 60 * 1000); 
        }
    }
});