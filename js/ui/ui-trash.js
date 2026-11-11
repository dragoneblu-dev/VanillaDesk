/**
 * ui-trash.js
 * Modulo dedicato alla gestione del Cestino e alla Garbage Collection.
 * Impostazione del flag _isDirty su ripristino per consentire a saveToFile di propagare la rimozione di deletedAt.
 * Elaborazione atomica in batch per svuotamento massivo (2000+ note) senza deadlock di I/O su File System Access API.
 * FEAT PHYSICAL DELETION PROGRESS: Notifica all'utente della cancellazione fisica da disco tramite UI.ProgressModal.
 * FEAT HARD DELETE BRANCH WARNING (4A): Quantificazione esatta delle sotto-note rimosse definitivamente.
 * FEAT ORPHAN ATTACHMENTS AUDITING & PURGE: Rilevamento trasparente degli allegati orfani (immagini/audio rimossi dalle note)
 * con calcolo dimensione risparmiabile e pulsante dedicato per la pulizia selettiva dal disco o da IndexedDB (idb_assets).
 * CLEAN I18N CALLS: Chiamate dirette a I18n.t() senza controlli ternari o stringhe di fallback duplicate.
 */

Object.assign(UI, {
    Trash: {
        open: async () => {
            const deletedNotes = AppState.notes.filter(n => n.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);

            // Audit degli allegati orfani su disco (assets/) o in IndexedDB (idb_assets)
            let orphanStats = { count: 0, formattedSize: '0 Bytes', files: [] };
            if ((AppState.workspaceHandle || AppState.storageMode === 'idb') && typeof Store.getOrphanedAssets === 'function') {
                orphanStats = await Store.getOrphanedAssets();
            }

            let bodyHTML = `
                <div class="ui-info-banner">
                    ${I18n.t('trash.banner_info')}
                </div>
            `;

            // Sezione dedicata agli allegati orfani presenti nella cartella assets/ o in idb_assets
            if (orphanStats.count > 0) {
                const titleOrphans = I18n.t('trash.orphans_title', { count: orphanStats.count });
                const descOrphans = I18n.t('trash.orphans_desc', { size: orphanStats.formattedSize });
                const btnOrphans = I18n.t('trash.btn_clean_orphans');

                bodyHTML += `
                    <div style="background: rgba(37,99,235,0.06); border: 1px solid rgba(37,99,235,0.25); border-radius: 6px; padding: 12px 14px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; gap: 10px; box-sizing: border-box;">
                        <div>
                            <div style="font-weight: bold; font-size: 0.85rem; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                                <span>📦</span> <span>${titleOrphans}</span>
                            </div>
                            <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 2px;">
                                ${descOrphans}
                            </div>
                        </div>
                        <button class="btn" style="padding: 5px 12px; font-size: 0.8rem; border-color: var(--border-color); color: var(--text-primary); cursor: pointer; flex-shrink: 0;" onclick="UI.Trash.cleanOrphanAttachments()">
                            ${btnOrphans}
                        </button>
                    </div>
                `;
            }

            if (deletedNotes.length === 0 && orphanStats.count === 0) {
                bodyHTML += `<div class="ui-empty-state">${I18n.t('trash.empty_state')}</div>`;
            } else if (deletedNotes.length === 0 && orphanStats.count > 0) {
                bodyHTML += `<div class="ui-empty-state" style="padding: 20px; font-size: 0.85rem; color: var(--text-secondary);">${I18n.t('trash.empty_state')}</div>`;
            } else {
                bodyHTML += `<div class="ui-list-container">`;
                deletedNotes.forEach(n => {
                    const dateStr = new Date(n.deletedAt).toLocaleDateString('it-IT') + ' ' + new Date(n.deletedAt).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
                    const deletedLabel = I18n.t('trash.deleted_at', { date: dateStr });
                    bodyHTML += `
                        <div class="ui-list-item">
                            <div class="ui-list-item-content">
                                <div class="ui-list-item-title">
                                    <span style="opacity:0.7; display:inline-flex;">${Icons.file}</span> ${n.title || I18n.t('editor.untitled')}
                                </div>
                                <div class="ui-list-item-subtitle">${deletedLabel}</div>
                            </div>
                            <div class="ui-list-item-actions">
                                <button class="btn" style="padding:4px 8px; font-size:0.8rem;" onclick="UI.Trash.restore('${n.id}')">
                                    <span style="margin-right:4px; display:inline-flex; align-items:center;">${Icons.restore}</span> ${I18n.t('trash.restore_btn')}
                                </button>
                                <button class="adv-icon-btn danger" style="padding:4px 8px; background:rgba(239,68,68,0.1);" onclick="UI.Trash.hardDelete('${n.id}')" title="${I18n.t('trash.delete_forever_btn')}">${Icons.close}</button>
                            </div>
                        </div>
                    `;
                });
                bodyHTML += `</div>`;
            }

            const canEmpty = deletedNotes.length > 0 || orphanStats.count > 0;
            const footerHTML = canEmpty ? `
                <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.close')}</button>
                <button class="btn" style="background:var(--danger-color); border-color:var(--danger-color);" onclick="UI.Trash.empty()"><span style="margin-right:5px; display:inline-flex; align-items:center;">${Icons.trash}</span> ${I18n.t('trash.empty_trash_btn')}</button>
            ` : `<button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.close')}</button>`;

            UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.trash} ${I18n.t('trash.title')}</span>`, bodyHTML, footerHTML);
        },

        cleanOrphanAttachments: async () => {
            const confirmMsg = I18n.t('trash.confirm_clean_orphans');
            if (!confirm(confirmMsg)) return;

            const deletedCount = await Store.deleteOrphanedAssets();
            if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') {
                const toastMsg = I18n.t('trash.toast_orphans_cleaned', { count: deletedCount });
                UI.showToast(toastMsg, "success");
            }
            UI.Trash.open();
        },

        restore: (id) => {
            const note = Store.getNote(id);
            if (!note) return;
            
            delete note.deletedAt;
            note._isDirty = true;
            
            const parent = Store.getNote(note.parentId);
            if (!parent || parent.deletedAt) {
                note.parentId = null;
            }

            if (typeof Store !== 'undefined') Store.triggerAutoSave();
            if (typeof UI !== 'undefined' && UI.renderTree) UI.renderTree();
            UI.Trash.open();
            UI.showToast(I18n.t('trash.restore_toast', { title: note.title || I18n.t('editor.untitled') }), "success");
        },

        hardDelete: async (id, force = false) => {
            const note = Store.getNote(id);
            const subnotes = [];
            const traverse = (pId) => {
                const ch = AppState.notes.filter(c => c.parentId === pId);
                ch.forEach(c => { subnotes.push(c); traverse(c.id); });
            };
            if (note) traverse(id);
            const count = subnotes.length;

            const msg = count > 0 
                ? I18n.t('trash.confirm_hard_delete_branch', { count: count + 1, subnotes: count })
                : I18n.t('trash.confirm_hard_delete');

            if (!force && !confirm(msg)) return;
            
            await UI.Trash.forceHardDeleteRecursive(id);
            if (!force) UI.Trash.open(); 
        },

        forceHardDeleteRecursive: async (id) => {
            if (!id) return;
            const toDelete = new Set();
            const traverse = (parentId) => {
                toDelete.add(parentId);
                AppState.notes.filter(c => c.parentId === parentId).forEach(c => traverse(c.id));
            };
            traverse(id);

            const count = toDelete.size;
            AppState.notes = AppState.notes.filter(n => !toDelete.has(n.id));
            
            if (typeof AdvancedTable !== 'undefined') {
                toDelete.forEach(noteId => AdvancedTable.deleteSystemPropertiesRow(noteId));
            }

            if (typeof Editor !== 'undefined' && Editor.cleanOrphanedCaches) {
                Editor.cleanOrphanedCaches();
            }

            // Segnalazione atomica per Garbage Collection fisica coordinata da saveToFile o saveToIndexedDB
            if (typeof Store !== 'undefined') {
                Store.markNeedsPhysicalGC();
                
                const showModal = count > 3 && AppState.workspaceHandle;
                if (showModal) {
                    UI.ProgressModal.show(
                        I18n.t('progress.deleting_files'),
                        I18n.t('progress.do_not_close'),
                        0,
                        count
                    );
                }

                try {
                    await Store.saveToFile((p) => {
                        if (showModal) {
                            UI.ProgressModal.update(p.message, p.current, p.total);
                        }
                    });
                } finally {
                    if (showModal) {
                        UI.ProgressModal.hide();
                    }
                }
            }
        },

        empty: async () => {
            if (!confirm(I18n.t('trash.confirm_empty'))) return;

            const trashedNotes = AppState.notes.filter(n => n.deletedAt);

            // 1. Raccoglie in un unico set atomico tutti gli ID di note da eliminare
            const toDelete = new Set();
            const traverse = (parentId) => {
                toDelete.add(parentId);
                AppState.notes.filter(c => c.parentId === parentId).forEach(c => traverse(c.id));
            };
            trashedNotes.forEach(n => traverse(n.id));

            const totalCount = toDelete.size;

            // 2. Eliminazione atomica in RAM delle note
            AppState.notes = AppState.notes.filter(n => !toDelete.has(n.id));

            // 3. Rimozione dei riferimenti dal database di sistema delle proprietà
            if (typeof AdvancedTable !== 'undefined') {
                toDelete.forEach(noteId => AdvancedTable.deleteSystemPropertiesRow(noteId));
            }

            // 4. Pulizia centralizzata delle cache RAM
            if (typeof Editor !== 'undefined' && Editor.cleanOrphanedCaches) {
                Editor.cleanOrphanedCaches();
            }

            // 5. Eliminazione fisica contestuale di tutti gli allegati orfani su disco o in idb_assets
            if (typeof Store !== 'undefined' && typeof Store.deleteOrphanedAssets === 'function') {
                await Store.deleteOrphanedAssets();
            }

            // 6. Esecuzione coordinata della rimozione fisica dei file su disco o in IndexedDB
            if (typeof Store !== 'undefined') {
                Store.markNeedsPhysicalGC();
                
                const showModal = totalCount > 3 && AppState.workspaceHandle;
                if (showModal) {
                    UI.ProgressModal.show(
                        I18n.t('progress.deleting_files'),
                        I18n.t('progress.do_not_close'),
                        0,
                        totalCount
                    );
                }

                try {
                    await Store.saveToFile((p) => {
                        if (showModal) {
                            UI.ProgressModal.update(p.message, p.current, p.total);
                        }
                    });
                } finally {
                    if (showModal) {
                        UI.ProgressModal.hide();
                    }
                }
            }

            if (typeof UI.renderTree !== 'undefined') UI.renderTree();
            UI.Trash.open();
            
            if (typeof UI.showToast !== 'undefined') {
                UI.showToast(I18n.t('progress.completed'), "success");
            }
        }
    }
});