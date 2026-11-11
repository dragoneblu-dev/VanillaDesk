/**
 * ui-core.js
 * Core dell'Interfaccia Utente: Handler Base dell'Editor e dell'oggetto window.UI.
 * FEEDBACK VISIVO HEADER: Sincronizzazione automatica della classe header-unsaved
 * per colorare l'intera prima riga di rosso quando la sessione è ripristinata o non salvata su disco.
 * FEAT WORKSPACE GUIDE ADATTIVA: Modale contestuale rassicurante in caso di salvataggio sessione / recovery,
 * distinguendo chiaramente tra ricollegamento del workspace esistente e creazione da zero.
 * FEAT GRAPH VIEW DISPATCH: Apertura nativa a schermo intero (In-App Fullscreen) con zero latenza,
 * focalizzazione automatica del nodo corrente e chiusura istantanea su selezione.
 * FEAT DUAL TITLE HEADER & AZURE BADGE: Metodo updateHeaderTitles per visualizzare Workspace (riga 1)
 * con badge azzurro e icona vettoriale Icons.globe quando attivo in memoria browser, e Documento attivo (riga 2).
 * FEAT BROWSER WORKSPACE MANAGER: Gestione e Drawer per i Workspace memorizzati nel Browser (IndexedDB)
 * con rendering condizionale rigoroso del workspace attivo, data ultimo backup fisico, pulsante aggiorna
 * e rimozione della card fittizia "Nessun Workspace".
 * CLEAN I18N CALLS: Chiamate dirette a I18n.t() senza controlli ternari o stringhe di fallback duplicate.
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
        if (typeof Store !== 'undefined' && Store.isDirty) {
            if (AppState.workspaceHandle) Store.saveToFile();
            else if (AppState.storageMode === 'idb') Store.saveToIndexedDB();
        }

        const noteParam = targetNoteId || AppState.currentNoteId;

        // Apertura nativa a schermo intero integrata dentro VanillaDesk
        if (typeof GraphApp !== 'undefined' && typeof GraphApp.open === 'function') {
            GraphApp.open(noteParam);
        } else {
            // Fallback finestra esterna in caso di caricamento differito degli script
            const targetUrl = noteParam ? `graph/index.html#note=${encodeURIComponent(noteParam)}` : `graph/index.html`;
            window.open(targetUrl, 'VanillaDeskGraph');
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

        if (headerEl) {
            if (state === 'unsaved' && AppState.storageMode !== 'idb') {
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
            if (AppState.storageMode === 'idb') {
                el.textContent = I18n.t('common.saved');
                el.classList.add('status-saved');
            } else {
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
        }
    },

    updateHeaderTitles: (workspaceName = null, noteTitle = null) => {
        const container = document.getElementById('fileNameDisplay');
        if (!container) return;

        const defaultNoWs = I18n.t('common.no_workspace');
        const ws = (workspaceName !== null && workspaceName !== undefined) 
            ? workspaceName 
            : (AppState.fileName || defaultNoWs);

        let noteText = '';
        if (noteTitle !== null && noteTitle !== undefined) {
            noteText = noteTitle.trim() || I18n.t('editor.untitled');
        } else if (AppState.currentNoteId) {
            const currentNote = typeof Store !== 'undefined' ? Store.getNote(AppState.currentNoteId) : null;
            noteText = currentNote ? (currentNote.title || I18n.t('editor.untitled')) : '';
        } else {
            noteText = I18n.t('home_dashboard.title');
        }

        // Se in modalità browser con workspace attivo, applica l'evidenziazione in azzurro e l'icona SVG vettoriale Icons.globe
        const isIdbActive = AppState.storageMode === 'idb' && AppState.workspaceId && ws !== defaultNoWs;
        const wsContentHtml = isIdbActive
            ? `<span class="header-workspace-idb-badge" title="${I18n.t('idb_storage.active_badge_tooltip')}">
                    <span style="display:inline-flex; align-items:center;">${Icons.globe}</span>
                    <span>${UI.escapeHTML(ws)}</span>
               </span>`
            : UI.escapeHTML(ws);

        container.innerHTML = `
            <span class="header-workspace-name">${wsContentHtml}</span>
            <span class="header-note-name">${UI.escapeHTML(noteText)}</span>
        `;

        container.title = I18n.t('toolbar.breadcrumb_home');
    },

    updateFileName: (name) => { 
        UI.updateHeaderTitles(name, null);
    },

    // DRAWER DI GESTIONE DEI WORKSPACE NEL BROWSER (INDEXEDDB)
    openBrowserWorkspaceManager: async () => {
        UI.closeDrawer();

        const workspaces = await Store.idbListWorkspaces();
        const isCurrentIdbActive = AppState.storageMode === 'idb' && !!AppState.workspaceId;
        const activeWs = isCurrentIdbActive ? workspaces.find(w => w.id === AppState.workspaceId) : null;

        let activeWorkspaceSectionHtml = '';

        // Mostra la card azzurra del Workspace Attivo ESCLUSIVAMENTE se c'è un workspace reale aperto
        if (activeWs) {
            const activeNotesCount = AppState.notes ? AppState.notes.filter(n => !n.deletedAt).length : 0;
            const activeDbsCount = AppState.databases ? Object.keys(AppState.databases).filter(id => id !== 'SYS_PROPERTIES_DB').length : 0;
            
            const backupDateStr = activeWs.lastBackupAt || AppState.lastBackupAt;
            const backupBadgeHtml = backupDateStr
                ? `<span style="color:#059669; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                        <span style="display:inline-flex;">${Icons.save || Icons.file}</span> ${I18n.t('idb_storage.backup_recent', { date: UI.formatDate(backupDateStr) })}
                   </span>`
                : `<span style="color:#d97706; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:4px;" title="${I18n.t('idb_storage.backup_none_title')}">
                        <span style="display:inline-flex;">${Icons.alertTriangle}</span> ${I18n.t('idb_storage.no_backup_warning')}
                   </span>`;

            activeWorkspaceSectionHtml = `
                <div style="background:rgba(2, 132, 199, 0.08); border:1px solid var(--col_memBro); border-radius:8px; padding:14px; box-sizing:border-box;">
                    <div style="font-size:0.72rem; font-weight:bold; color:var(--col_memBro); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; display:flex; align-items:center; gap:5px;">
                        <span style="display:inline-flex; color:var(--col_memBro);">${Icons.globe}</span>
                        <span>${I18n.t('idb_storage.active_workspace')}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-size:1.15rem; font-weight:bold; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${UI.escapeHTML(activeWs.name)}</span>
                        <button class="btn" style="padding:3px 8px; font-size:0.75rem; flex-shrink:0;" onclick="
                            const newN = prompt('${I18n.t('idb_storage.rename_ws_prompt')}', '${UI.escapeHTML(activeWs.name)}');
                            if(newN) { Store.renameBrowserWorkspace('${activeWs.id}', newN); UI.openBrowserWorkspaceManager(); }
                        "><span style="display:inline-flex; align-items:center; gap:4px;">${Icons.edit} ${I18n.t('idb_storage.rename')}</span></button>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                        <div style="display:flex; gap:12px; font-size:0.8rem; color:var(--text-secondary);">
                            <span style="display:inline-flex; align-items:center; gap:4px;">${Icons.file} <b>${I18n.t('idb_storage.notes_count', { count: activeNotesCount })}</b></span>
                            <span style="display:inline-flex; align-items:center; gap:4px;">${Icons.tableDatabase} <b>${I18n.t('idb_storage.dbs_count', { count: activeDbsCount })}</b></span>
                        </div>
                        <div style="display:flex; gap:6px;">
                            <button class="btn" style="padding:4px 10px; font-size:0.75rem;" onclick="Store.loadSnapshot(); UI.closeDrawer();" title="${I18n.t('idb_storage.btn_update_backup_title')}">
                                <span style="display:inline-flex; align-items:center; gap:4px;">${Icons.import} ${I18n.t('idb_storage.btn_update_backup')}</span>
                            </button>
                            <button class="btn btn-primary" style="padding:4px 10px; font-size:0.75rem;" onclick="Store.downloadSnapshot();" title="${I18n.t('idb_storage.btn_download_backup')}">
                                <span style="display:inline-flex; align-items:center; gap:4px;">${Icons.download} ${I18n.t('idb_storage.btn_download_backup')}</span>
                            </button>
                        </div>
                    </div>
                    <div style="border-top:1px dashed rgba(2, 132, 199, 0.3); padding-top:6px;">
                        ${backupBadgeHtml}
                    </div>
                </div>
            `;
        }

        // Elenco dei workspace memorizzati nel browser
        let otherWorkspacesHtml = '';
        const otherList = activeWs ? workspaces.filter(w => w.id !== activeWs.id) : workspaces;

        if (otherList.length > 0) {
            otherList.forEach(w => {
                const safeName = UI.escapeHTML(w.name || "Workspace");
                const dateStr = w.updatedAt ? UI.formatDate(new Date(w.updatedAt).toISOString()) : "";
                const backupInfo = w.lastBackupAt 
                    ? `<span style="color:#059669; font-size:0.7rem; display:inline-flex; align-items:center; gap:3px;">${Icons.save || Icons.file} ${I18n.t('idb_storage.last_backup_label')}: ${UI.formatDate(w.lastBackupAt)}</span>` 
                    : `<span style="color:#d97706; font-size:0.7rem; display:inline-flex; align-items:center; gap:3px;">${Icons.alertTriangle} ${I18n.t('idb_storage.no_backup_warning')}</span>`;

                otherWorkspacesHtml += `
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; margin-bottom:8px;">
                        <div style="overflow:hidden; padding-right:10px;">
                            <div style="font-weight:bold; font-size:0.9rem; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; display:flex; align-items:center; gap:6px;">
                                <span style="color:var(--col_memBro); display:inline-flex;">${Icons.globe}</span>
                                <span>${safeName}</span>
                            </div>
                            <div style="display:flex; gap:10px; align-items:center; margin-top:3px; flex-wrap:wrap;">
                                <span style="font-size:0.75rem; color:var(--text-secondary);">${I18n.t('idb_storage.modified_at', { date: dateStr })}</span>
                                <span style="font-size:0.75rem; opacity:0.3;">•</span>
                                ${backupInfo}
                            </div>
                        </div>
                        <div style="display:flex; gap:6px; flex-shrink:0;">
                            <button class="btn btn-primary" style="padding:4px 12px; font-size:0.8rem;" onclick="Store.openBrowserWorkspace('${w.id}'); UI.closeDrawer();">${I18n.t('idb_storage.btn_open')}</button>
                            <button class="adv-icon-btn danger" style="padding:4px 8px;" onclick="if(confirm('${I18n.t('idb_storage.confirm_delete')}')) { Store.deleteBrowserWorkspace('${w.id}'); UI.openBrowserWorkspaceManager(); }">${Icons.trash}</button>
                        </div>
                    </div>
                `;
            });
        } else {
            const emptyNotice = activeWs 
                ? I18n.t('idb_storage.empty_other_list')
                : I18n.t('idb_storage.empty_all_list');
            otherWorkspacesHtml = `<div style="font-size:0.82rem; color:var(--text-secondary); font-style:italic; padding:14px; text-align:center; background:rgba(0,0,0,0.02); border:1px dashed var(--border-color); border-radius:6px;">${emptyNotice}</div>`;
        }

        const sectionListTitle = activeWs ? I18n.t('idb_storage.other_workspaces_title') : I18n.t('idb_storage.saved_workspaces_title');

        const bodyHTML = `
            <div style="display:flex; flex-direction:column; gap:18px; padding-bottom:15px;">
                
                ${activeWorkspaceSectionHtml}

                <!-- AZIONI RAPIDE: CREA O IMPORTA NUOVO -->
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <button class="btn" style="justify-content:center; padding:10px; font-weight:600; border-color:var(--accent-color); color:var(--accent-color);" onclick="Store.createBrowserWorkspace(); UI.closeDrawer();">
                        <span style="display:inline-flex; align-items:center; gap:6px;">+ ${I18n.t('idb_storage.btn_new_workspace')}</span>
                    </button>
                </div>

                <!-- LISTA DEI WORKSPACE SALVATI -->
                <div>
                    <div style="font-size:0.8rem; font-weight:bold; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; border-bottom:1px solid var(--border-color); padding-bottom:4px;">
                        ${sectionListTitle}
                    </div>
                    ${otherWorkspacesHtml}
                </div>
            </div>
        `;

        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.close')}</button>
        `;

        UI.openDrawer(
            `<span style="display:inline-flex; align-items:center; gap:6px; color:var(--col_memBro);">${Icons.globe} ${I18n.t('idb_storage.drawer_title')}</span>`,
            bodyHTML,
            footerHTML
        );
    },

    promptWorkspaceGuide: (isSavingSession = false) => {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'link-modal-overlay';
            overlay.style.zIndex = '9999';

            let titleTxt = '';
            let introHtml = '';
            let boxTitle = '';
            let stepsHtml = '';
            let btnTxt = '';

            if (isSavingSession) {
                // MODALITÀ RASSICURANTE: L'utente sta salvando/aggiornando dati già esistenti in memoria
                titleTxt = I18n.t('workspace_guide.save_title');
                introHtml = `
                    <p style="margin-bottom: 14px;">
                        ${I18n.t('workspace_guide.save_p1')}
                    </p>
                `;
                boxTitle = I18n.t('workspace_guide.save_box_title');
                stepsHtml = `
                    <li>${I18n.t('workspace_guide.save_step_existing')}</li>
                    <li>${I18n.t('workspace_guide.save_step_new')}</li>
                    <li>${I18n.t('workspace_guide.save_step_permissions')}</li>
                `;
                btnTxt = I18n.t('workspace_guide.btn_save_confirm');
            } else {
                // MODALITÀ INTRODUTTIVA: Utente alle prime armi o creazione nuovo workspace da zero
                titleTxt = I18n.t('workspace_guide.title');
                introHtml = `
                    <p style="margin-bottom: 12px;">
                        ${I18n.t('workspace_guide.p1')}
                    </p>
                    <p style="margin-bottom: 15px;">
                        ${I18n.t('workspace_guide.p2')}
                    </p>
                `;
                boxTitle = I18n.t('workspace_guide.box_title');
                stepsHtml = `
                    <li>${I18n.t('workspace_guide.step1')}</li>
                    <li>${I18n.t('workspace_guide.step2')}</li>
                    <li>${I18n.t('workspace_guide.step3')}</li>
                `;
                btnTxt = I18n.t('workspace_guide.btn_confirm');
            }

            overlay.innerHTML = `
                <div class="link-modal modal-animate" style="width: 580px; max-width: 95vw; padding: 25px; border-radius: 8px;">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px;">
                        <span style="color:var(--accent-color); display:inline-flex; transform:scale(1.2);">${typeof Icons !== 'undefined' ? Icons.folderOpen : '📁'}</span>
                        <h2 style="margin:0; font-size: 1.25rem; color:var(--text-primary);">${titleTxt}</h2>
                    </div>
                    <div style="font-size: 0.9rem; line-height: 1.6; color: var(--text-primary); margin-bottom: 20px;">
                        ${introHtml}
                        <div style="background: rgba(37, 99, 235, 0.05); border: 1px solid rgba(37, 99, 235, 0.2); border-radius: 6px; padding: 12px 16px; margin-bottom: 10px;">
                            <div style="font-weight: bold; font-size: 0.8rem; color: var(--accent-color); text-transform: uppercase; margin-bottom: 6px;">${boxTitle}</div>
                            <ol style="padding-left: 20px; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6;">
                                ${stepsHtml}
                            </ol>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px;">
                        <button class="btn" id="btnCancelWorkspaceGuide">${I18n.t('common.cancel')}</button>
                        <button class="btn btn-primary" id="btnConfirmWorkspaceGuide" style="padding: 8px 18px;">
                            <span style="display:inline-flex; align-items:center; gap:6px;">${typeof Icons !== 'undefined' ? Icons.folderOpen : '📁'} ${btnTxt}</span>
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