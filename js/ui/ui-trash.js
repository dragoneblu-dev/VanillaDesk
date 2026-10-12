/**
 * ui-trash.js
 * Modulo dedicato alla gestione del Cestino e alla Garbage Collection.
 * Impostazione del flag _isDirty su ripristino per consentire a saveToFile di propagare la rimozione di deletedAt.
 * Elaborazione atomica in batch per svuotamento massivo (2000+ note) senza deadlock di I/O su File System Access API.
 */

Object.assign(UI, {
    Trash: {
        open: () => {
            const deletedNotes = AppState.notes.filter(n => n.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);

            let bodyHTML = `
                <div class="ui-info-banner">
                    ${I18n.t('trash.banner_info')}
                </div>
            `;

            if (deletedNotes.length === 0) {
                bodyHTML += `<div class="ui-empty-state">${I18n.t('trash.empty_state')}</div>`;
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

            const footerHTML = deletedNotes.length > 0 ? `
                <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.close')}</button>
                <button class="btn btn-primary" style="background:var(--danger-color); border-color:var(--danger-color);" onclick="UI.Trash.empty()"><span style="margin-right:5px; display:inline-flex; align-items:center;">${Icons.trash}</span> ${I18n.t('trash.empty_trash_btn')}</button>
            ` : `<button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.close')}</button>`;

            UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.trash} ${I18n.t('trash.title')}</span>`, bodyHTML, footerHTML);
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

        hardDelete: (id, force = false) => {
            if (!force && !confirm(I18n.t('trash.confirm_hard_delete'))) return;
            
            UI.Trash.forceHardDeleteRecursive(id);
            if (!force) UI.Trash.open(); 
        },

        forceHardDeleteRecursive: (id) => {
            if (!id) return;
            const toDelete = new Set();
            const traverse = (parentId) => {
                toDelete.add(parentId);
                AppState.notes.filter(c => c.parentId === parentId).forEach(c => traverse(c.id));
            };
            traverse(id);

            AppState.notes = AppState.notes.filter(n => !toDelete.has(n.id));
            
            if (typeof AdvancedTable !== 'undefined') {
                toDelete.forEach(noteId => AdvancedTable.deleteSystemPropertiesRow(noteId));
            }

            if (typeof Editor !== 'undefined' && Editor.cleanOrphanedCaches) {
                Editor.cleanOrphanedCaches();
            }

            // Segnalazione atomica per Garbage Collection fisica coordinata da saveToFile
            if (typeof Store !== 'undefined') {
                Store.markNeedsPhysicalGC();
                Store.triggerAutoSave(true);
            }
        },

        empty: async () => {
            if (!confirm(I18n.t('trash.confirm_empty'))) return;

            const trashedNotes = AppState.notes.filter(n => n.deletedAt);
            if (trashedNotes.length === 0) return;

            // 1. Raccoglie in un unico set atomico tutti gli ID da eliminare
            const toDelete = new Set();
            const traverse = (parentId) => {
                toDelete.add(parentId);
                AppState.notes.filter(c => c.parentId === parentId).forEach(c => traverse(c.id));
            };
            trashedNotes.forEach(n => traverse(n.id));

            // 2. Eliminazione atomica in RAM in un solo ciclo
            AppState.notes = AppState.notes.filter(n => !toDelete.has(n.id));

            // 3. Rimozione dei riferimenti dal database di sistema delle proprietà
            if (typeof AdvancedTable !== 'undefined') {
                toDelete.forEach(noteId => AdvancedTable.deleteSystemPropertiesRow(noteId));
            }

            // 4. Pulizia centralizzata delle cache RAM
            if (typeof Editor !== 'undefined' && Editor.cleanOrphanedCaches) {
                Editor.cleanOrphanedCaches();
            }

            // 5. Esecuzione coordinata della rimozione fisica dei file su disco senza deadlock
            if (typeof Store !== 'undefined') {
                Store.markNeedsPhysicalGC();
                await Store.saveToFile();
            }

            if (typeof UI.renderTree !== 'undefined') UI.renderTree();
            UI.Trash.open();
            
            if (typeof UI.showToast !== 'undefined') {
                UI.showToast("Cestino svuotato ed eliminazione fisica completata.", "success");
            }
        }
    }
});