/**
 * ui-notifications.js
 * Modulo UI per i popup (Toast) temporanei e il Sintetizzatore Audio (Allarmi).
 * Gestione dello Snooze resiliente per i promemoria da segnalibro tramite registro dati sicuro.
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

        const existingToasts = Array.from(container.querySelectorAll('.toast-msg'));
        const isDuplicate = existingToasts.some(t => t.innerText.includes(message.replace(/<[^>]*>?/gm, '')));
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
                    toast.classList.remove('show');
                    setTimeout(() => { if (document.body.contains(toast)) toast.remove(); }, 300);
                }
            }, 4000);
        }

        return toastId; 
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

        stop: (toastId) => {
            delete UI.Alarm._alarmData[toastId];
            UI.Alarm._removeToastAndCheckAudio(toastId);
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