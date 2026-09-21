/**
 * ui-core.js
 * Core dell'Interfaccia Utente: Handler Base dell'Editor e dell'oggetto window.UI.
 * FEEDBACK VISIVO HEADER: Sincronizzazione automatica della classe header-unsaved
 * per colorare l'intera prima riga di rosso quando la sessione è ripristinata o non salvata su disco.
 */

window.UI = {
    currentFontSize: 16,
    tooltipTimeout: null,
    _drawerCloseTimer: null,

    toggleMinimap: () => {
        if (typeof UI.Minimap !== 'undefined') {
            UI.Minimap.toggle();
        }
    },

    goHome: () => {
        AppState.isSwitchingNote = true;
        if (typeof UI.updateCurrentNoteTimer !== 'undefined') clearTimeout(UI.updateCurrentNoteTimer);

        if (AppState.currentNoteId) {
            const scrollArea = document.querySelector('.editor-scroll-content');
            if (scrollArea) {
                const currentNote = Store.getNote(AppState.currentNoteId);
                if (currentNote) currentNote._lastScroll = scrollArea.scrollTop;
            }
            if (typeof Editor !== 'undefined') Editor.sanitizeContent();
            if (typeof Store !== 'undefined') Store.triggerAutoSave(true);
        }

        UI.closeDrawer();
        if (typeof UI.Menu !== 'undefined') UI.Menu.closeAll(true);
        if (typeof TableManager !== 'undefined') {
            TableManager.hideTriggers();
            TableManager.hideMenus();
        }

        AppState.currentNoteId = null;
        AppState.isEditMode = false;

        document.querySelectorAll('.node-content').forEach(el => el.classList.remove('active'));

        UI.showEditor(false);
        if (typeof UI.Minimap !== 'undefined') UI.Minimap.sync(); 
        
        setTimeout(() => {
            AppState.isSwitchingNote = false;
        }, 150);
    },

    formatDate: (isoString) => {
        if (!isoString) return "";
        const d = new Date(isoString);
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) +
            " " + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    },

    showStatus: (state) => {
        const el = document.getElementById('saveStatus');
        const headerEl = document.querySelector('header');

        // Colorazione dell'intera prima riga (Header) in caso di sessione temporanea in RAM
        if (headerEl) {
            if (state === 'unsaved') {
                headerEl.classList.add('header-unsaved');
            } else {
                headerEl.classList.remove('header-unsaved');
            }
        }

        if (!el) return;

        el.className = 'status-pill';
        el.classList.remove('hidden');
        el.onclick = null;
        el.style.cursor = 'default';

        if (state === 'pending') {
            el.textContent = 'Modificato...';
            el.classList.add('status-saving');
        } else if (state === 'saving') {
            el.textContent = 'Salvataggio in corso...';
            el.classList.add('status-saving');
        } else if (state === 'saved') {
            el.textContent = 'Salvato';
            el.classList.add('status-saved');
        } else if (state === 'error') {
            el.textContent = 'Errore Salvataggio';
            el.classList.add('status-error');
        } else if (state === 'unsaved') {
            el.textContent = '⚠️ Salva File (Solo RAM)';
            el.classList.add('status-error');
            el.style.cursor = 'pointer';
            el.title = 'I dati sono salvati solo nella memoria temporanea. Clicca per scegliere una cartella e salvare l\'intero Workspace su disco.';
            el.onclick = () => {
                if (typeof Store !== 'undefined' && Store.createWorkspace) {
                    Store.createWorkspace(false);
                }
            };
        }
    },

    updateFileName: (name) => { 
        const el = document.getElementById('fileNameDisplay'); 
        if (el) el.textContent = name; 
    }
};