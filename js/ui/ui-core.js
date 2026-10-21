/**
 * ui-core.js
 * Core dell'Interfaccia Utente: Handler Base dell'Editor e dell'oggetto window.UI.
 * FEEDBACK VISIVO HEADER: Sincronizzazione automatica della classe header-unsaved
 * per colorare l'intera prima riga di rosso quando la sessione è ripristinata o non salvata su disco.
 * FEAT WORKSPACE GUIDE: Modale esplicativo guidato per nuovi utenti prima della selezione della cartella.
 * FEAT GRAPH VIEW DISPATCH: Metodo openGraphView per aprire la mappa delle connessioni in una finestra standalone
 * con targeting nominale bidirezionale e notifica via BroadcastChannel per finestre già attive.
 */

window.UI = {
    currentFontSize: 16,
    tooltipTimeout: null,
    _drawerCloseTimer: null,

    escapeHTML: (str) => {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    openGraphView: (targetNoteId = null) => {
        // Se vi sono modifiche non salvate nel workspace su disco, salva preventivamente
        if (typeof Store !== 'undefined' && Store.isDirty && AppState.workspaceHandle) {
            Store.saveToFile();
        }

        // Assegna il nome univoco alla finestra principale per consentire alle schede figlie di riportarvi il focus
        if (!window.name) {
            window.name = 'VanillaDeskMain';
        }

        const noteParam = targetNoteId || AppState.currentNoteId;
        const targetUrl = noteParam ? `graph/index.html#note=${encodeURIComponent(noteParam)}` : `graph/index.html`;

        const graphWin = window.open(targetUrl, 'VanillaDeskGraph');
        if (graphWin) {
            try {
                graphWin.focus();
                // Se la finestra era già aperta ed è accessibile via script, centra immediatamente il nodo
                if (graphWin.GraphCanvas && typeof graphWin.GraphCanvas.focusNode === 'function' && noteParam) {
                    graphWin.GraphCanvas.focusNode(noteParam);
                }
            } catch (_) {}
        }

        // Notifica asincrona via BroadcastChannel: garantisce la selezione anche se il riferimento window è differito
        if (noteParam) {
            try {
                const channel = new BroadcastChannel('vanilladesk_sync');
                channel.postMessage({
                    type: 'focus_graph_node',
                    noteId: noteParam
                });
                channel.close();
            } catch (_) {}
        }

        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
    },

    toggleMinimap: () => {
        if (typeof UI.Minimap !== 'undefined') {
            UI.Minimap.toggle();
        }
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
            el.textContent = I18n.t('common.pending');
            el.classList.add('status-saving');
        } else if (state === 'saving') {
            el.textContent = I18n.t('common.saving');
            el.classList.add('status-saving');
        } else if (state === 'loading') {
            el.textContent = I18n.t('common.loading');
            el.classList.add('status-saving');
        } else if (state === 'saved') {
            el.textContent = I18n.t('common.saved');
            el.classList.add('status-saved');
        } else if (state === 'error') {
            el.textContent = I18n.t('common.error');
            el.classList.add('status-error');
        } else if (state === 'unsaved') {
            el.textContent = I18n.t('preferences.status_unsaved');
            el.classList.add('status-error');
            el.style.cursor = 'pointer';
            el.title = I18n.t('preferences.status_unsaved_title');
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
                        <h2 style="margin:0; font-size: 1.25rem; color:var(--text-primary);">${I18n.t('workspace_guide.title')}</h2>
                    </div>
                    <div style="font-size: 0.9rem; line-height: 1.6; color: var(--text-primary); margin-bottom: 20px;">
                        <p style="margin-bottom: 12px;">
                            ${I18n.t('workspace_guide.p1')}
                        </p>
                        <p style="margin-bottom: 15px;">
                            ${I18n.t('workspace_guide.p2')}
                        </p>
                        <div style="background: rgba(37, 99, 235, 0.05); border: 1px solid rgba(37, 99, 235, 0.2); border-radius: 6px; padding: 12px 16px; margin-bottom: 10px;">
                            <div style="font-weight: bold; font-size: 0.8rem; color: var(--accent-color); text-transform: uppercase; margin-bottom: 6px;">${I18n.t('workspace_guide.box_title')}</div>
                            <ol style="padding-left: 20px; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6;">
                                <li>${I18n.t('workspace_guide.step1')}</li>
                                <li>${I18n.t('workspace_guide.step2')}</li>
                                <li>${I18n.t('workspace_guide.step3')}</li>
                            </ol>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px;">
                        <button class="btn" id="btnCancelWorkspaceGuide">${I18n.t('common.cancel')}</button>
                        <button class="btn btn-primary" id="btnConfirmWorkspaceGuide" style="padding: 8px 18px;">
                            <span style="display:inline-flex; align-items:center; gap:6px;">${typeof Icons !== 'undefined' ? Icons.folderOpen : '📁'} ${I18n.t('workspace_guide.btn_confirm')}</span>
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
    },

    promptModpackGuide: () => {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'link-modal-overlay';
            overlay.style.zIndex = '9999';

            overlay.innerHTML = `
                <div class="link-modal modal-animate" style="width: 580px; max-width: 95vw; padding: 25px; border-radius: 8px;">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px;">
                        <span style="color:var(--accent-color); display:inline-flex; transform:scale(1.3);">${typeof Icons !== 'undefined' ? Icons.lightning : '📦'}</span>
                        <h2 style="margin:0; font-size: 1.25rem; color:var(--text-primary);">${I18n.t('modpack_guide.title')}</h2>
                    </div>
                    <div style="font-size: 0.9rem; line-height: 1.6; color: var(--text-primary); margin-bottom: 20px;">
                        <p style="margin-bottom: 12px;">
                            ${I18n.t('modpack_guide.p1')}
                        </p>
                        <p style="margin-bottom: 15px;">
                            ${I18n.t('modpack_guide.p2')}
                        </p>
                        <div style="background: rgba(37, 99, 235, 0.05); border: 1px solid rgba(37, 99, 235, 0.2); border-radius: 6px; padding: 12px 16px; margin-bottom: 10px;">
                            <div style="font-weight: bold; font-size: 0.8rem; color: var(--accent-color); text-transform: uppercase; margin-bottom: 6px;">${I18n.t('modpack_guide.box_title')}</div>
                            <ol style="padding-left: 20px; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6;">
                                <li>${I18n.t('modpack_guide.step1')}</li>
                                <li>${I18n.t('modpack_guide.step2')}</li>
                                <li>${I18n.t('modpack_guide.step3')}</li>
                            </ol>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px;">
                        <button class="btn" id="btnCancelModpackGuide">${I18n.t('common.cancel')}</button>
                        <button class="btn btn-primary" id="btnConfirmModpackGuide" style="padding: 8px 18px;">
                            <span style="display:inline-flex; align-items:center; gap:6px;">${typeof Icons !== 'undefined' ? Icons.import : '📥'} ${I18n.t('modpack_guide.btn_confirm')}</span>
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            document.getElementById('btnCancelModpackGuide').onclick = () => {
                overlay.remove();
                resolve(false);
            };

            document.getElementById('btnConfirmModpackGuide').onclick = () => {
                overlay.remove();
                resolve(true);
            };
        });
    }
};