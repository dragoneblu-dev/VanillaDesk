/**
 * ui-core.js
 * Core dell'Interfaccia Utente: Handler Base dell'Editor e dell'oggetto window.UI.
 * FEEDBACK VISIVO HEADER: Sincronizzazione automatica della classe header-unsaved
 * per colorare l'intera prima riga di rosso quando la sessione è ripristinata o non salvata su disco.
 * FEAT WORKSPACE GUIDE: Modale esplicativo guidato per nuovi utenti prima della selezione della cartella.
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
    },

    promptWorkspaceGuide: () => {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'link-modal-overlay';
            overlay.style.zIndex = '9999';

            overlay.innerHTML = `
                <div class="link-modal modal-animate" style="width: 560px; max-width: 95vw; padding: 25px; border-radius: 8px;">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px;">
                        <span style="color:var(--accent-color); display:inline-flex; transform:scale(1.2);">${typeof Icons !== 'undefined' ? Icons.folderOpen : '📁'}</span>
                        <h2 style="margin:0; font-size: 1.25rem; color:var(--text-primary);">Cos'è un Workspace e come iniziare</h2>
                    </div>
                    <div style="font-size: 0.9rem; line-height: 1.6; color: var(--text-primary); margin-bottom: 20px;">
                        <p style="margin-bottom: 12px;">
                            In VanillaDesk <b>non esistono server cloud o account remoti</b>: tutti i tuoi dati risiedono esclusivamente sul tuo computer.
                        </p>
                        <p style="margin-bottom: 15px;">
                            Un <b>Workspace</b> è semplicemente una <b>cartella sul tuo disco fisso</b> (ad esempio nella cartella <i>Documenti</i> o sul <i>Desktop</i>) che conterrà in modo trasparente e permanente le tue note, i database e gli allegati.
                        </p>
                        <div style="background: rgba(37, 99, 235, 0.05); border: 1px solid rgba(37, 99, 235, 0.2); border-radius: 6px; padding: 12px 16px; margin-bottom: 10px;">
                            <div style="font-weight: bold; font-size: 0.8rem; color: var(--accent-color); text-transform: uppercase; margin-bottom: 6px;">Cosa fare adesso:</div>
                            <ol style="padding-left: 20px; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6;">
                                <li>Clicca su <b>"Procedi e Scegli Cartella"</b> qui sotto.</li>
                                <li>Nella finestra di sistema, seleziona una cartella dedicata (ti consigliamo di crearne una nuova vuota, ad esempio <i>"Note Personali"</i>).</li>
                                <li>Quando il browser ti chiede la conferma dei permessi per salvare i file, clicca su <b>"Visualizza file"</b> o <b>"Salva modifiche"</b>.</li>
                            </ol>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px;">
                        <button class="btn" id="btnCancelWorkspaceGuide">Annulla</button>
                        <button class="btn btn-primary" id="btnConfirmWorkspaceGuide" style="padding: 8px 18px;">
                            <span style="display:inline-flex; align-items:center; gap:6px;">${typeof Icons !== 'undefined' ? Icons.folderOpen : '📁'} Procedi e Scegli Cartella</span>
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            document.getElementById('btnCancelWorkspaceGuide').onclick = () => {
                overlay.remove();
                resolve(false);
            };

            document.getElementById('btnConfirmWorkspaceGuide').onclick = () => {
                overlay.remove();
                resolve(true);
            };
        });
    }
};