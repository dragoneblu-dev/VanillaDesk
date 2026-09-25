/**
 * ui-notes-utils.js
 * Sottomodulo di UI.
 * Funzioni di supporto, formattazione, Breadcrumb e segnalibri della Nota (Utilities).
 * Integrazione del badge Cestino nel breadcrumb per le note eliminate e marcatura dirty su toggle preferiti.
 */

Object.assign(UI, {

    checkAndUpdatePropertiesIcon: (noteId) => {
        const btn = document.getElementById('btnNoteProperties');
        if (!btn) return;
        
        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
        let hasProps = false;
        
        if (propsDb && propsDb.rows) {
            const sysRow = propsDb.rows.find(r => r.cells['sys_c_note'] === noteId);
            if (sysRow) {
                for (const col of propsDb.columns) {
                    if (col.id === 'sys_c_note') continue;
                    const val = sysRow.cells[col.id];
                    
                    if (val === true) { hasProps = true; break; }
                    if (Array.isArray(val) && val.length > 0) { hasProps = true; break; }
                    if (typeof val === 'string' && val.trim() !== '') { hasProps = true; break; }
                    if (typeof val === 'number') { hasProps = true; break; }
                    if (typeof val === 'object' && val !== null && val.start) { hasProps = true; break; }
                }
            }
        }
        
        if (hasProps) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    },

    goUpOneLevel: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        if (!note) return;

        if (note.isRecordNote && note.linkedTableId) {
            UI.jumpToWidget(note.linkedTableId);
            return;
        }

        if (note.parentId) {
            UI.selectNote(note.parentId);
            return;
        }

        UI.goHome();
    },

    openNoteOptionsMenu: (e, anchorId) => {
        if(e) e.stopPropagation();
        
        const currentNote = Store.getNote(AppState.currentNoteId);
        const isTrashed = currentNote && currentNote.deletedAt;

        const items = [];

        if (isTrashed) {
            items.push({
                icon: Icons.restore,
                label: 'Ripristina Nota dal Cestino',
                onClick: () => UI.restoreNoteFromBanner(AppState.currentNoteId)
            });
            items.push({ type: 'divider' });
            items.push({
                icon: Icons.trash,
                label: 'Elimina Definitivamente',
                danger: true,
                onClick: () => {
                    if (confirm("Eliminare DEFINITIVAMENTE questa nota e tutti i suoi dati? L'operazione non può essere annullata.")) {
                        UI.Trash.hardDelete(AppState.currentNoteId, true);
                        UI.goHome();
                    }
                }
            });
        } else {
            items.push({ icon: Icons.save, label: 'Salva come Template Locale', onClick: () => TemplateManager.saveCurrentNoteAsTemplate() });
            items.push({ icon: Icons.tableSimple, label: 'Gestisci Template...', onClick: () => TemplateManager.openManager() });
            items.push({ type: 'divider' });
            items.push({ icon: Icons.download, label: 'Esporta come Modulo (Modpack)', onClick: () => PackageManager.exportNoteAsModpack(AppState.currentNoteId) });
            items.push({ type: 'divider' });
            items.push({ icon: Icons.trash, label: 'Sposta nel Cestino', danger: true, onClick: () => UI.deleteCurrentNote() });
        }

        UI.Menu.buildContextMenu(anchorId, items);
    },

    toggleMark: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        if (!note || note.deletedAt) return;

        note.isMarked = !note.isMarked;
        note._isDirty = true;
        
        UI.updateMarkBtn(note.isMarked);
        if (typeof UI.renderTree !== 'undefined') UI.renderTree();
        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    },

    updateMarkBtn: (active) => {
        const btn = document.getElementById('markBtn');
        if (!btn) return;
        btn.innerHTML = active ? Icons.starFilled : Icons.starEmpty;
        if (active) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    },

    updateBreadcrumb: (note) => {
        const bc = document.getElementById('breadcrumb');
        if (!bc) return;
        
        let path = []; 
        let curr = note;
        while (curr) { 
            path.unshift(curr); 
            curr = Store.getNote(curr.parentId); 
        }

        let breadcrumbHTML = '';

        if (note && note.deletedAt) {
            breadcrumbHTML += `<span style="background: rgba(239, 68, 68, 0.1); color: var(--danger-color); padding: 1px 6px; border-radius: 4px; font-weight: bold; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;">${Icons.trash} Cestino</span><span style="opacity:0.5;"> / </span>`;
        }

        breadcrumbHTML += path.map((n, i) => {
            const isLast = i === path.length - 1;
            const safeTitle = n.title || 'Senza Titolo';
            const colorStyle = n.deletedAt ? 'color: var(--danger-color);' : '';
            return `<span style="cursor:pointer; color:var(--text-secondary); ${colorStyle} ${isLast ? 'font-weight:bold; color:var(--text-primary);' : ''}" onclick="UI.selectNote('${n.id}')">${safeTitle}</span>`;
        }).join('<span style="opacity:0.5;"> / </span>');

        bc.innerHTML = breadcrumbHTML;
    }
});