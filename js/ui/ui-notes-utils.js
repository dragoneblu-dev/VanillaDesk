/**
 * ui-notes-utils.js
 * Sottomodulo di UI.
 * Funzioni di supporto, formattazione, Breadcrumb e segnalibri della Nota (Utilities).
 * Integrazione del badge Cestino nel breadcrumb per le note eliminate e marcatura dirty su toggle preferiti.
 * Aggiunta voce "Modifica Sorgente HTML..." nel menu contestuale della nota.
 * FEAT HEADER PROPERTIES INDEPENDENT TOGGLES: Voci nel menu Opzioni Nota gestite tramite I18n.t
 * per abilitare/disabilitare indipendentemente i Campi del Record e le Proprietà Pagina.
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
                label: I18n.t('notes_utils.menu_restore_trash'),
                onClick: () => UI.restoreNoteFromBanner(AppState.currentNoteId)
            });
            items.push({ type: 'divider' });
            items.push({
                icon: Icons.trash,
                label: I18n.t('notes_utils.menu_hard_delete'),
                danger: true,
                onClick: () => {
                    if (confirm(I18n.t('notes_utils.confirm_hard_delete'))) {
                        UI.Trash.hardDelete(AppState.currentNoteId, true);
                        UI.goHome();
                    }
                }
            });
        } else {
            // GESTIONE INDIPENDENTE DEI DUE SET DI PROPRIETÀ IN CIMA ALLA PAGINA
            if (currentNote && currentNote.isRecordNote && currentNote.linkedTableId) {
                const realTableId = typeof AdvancedTable !== 'undefined' ? AdvancedTable._resolveSourceId(currentNote.linkedTableId) : currentNote.linkedTableId;
                const dbState = typeof AdvancedTable !== 'undefined' ? AdvancedTable.getState(realTableId) : null;
                
                const isRecordFieldsEnabled = dbState ? dbState.showHeaderRecordFields !== false : true;
                const chkRecord = isRecordFieldsEnabled ? ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>' : '';

                const isPagePropsEnabled = dbState ? dbState.showHeaderPageProps === true : false;
                const chkProps = isPagePropsEnabled ? ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>' : '';

                const labelRecordFields = I18n.t('notes_utils.menu_header_record_fields') || "Campi Record Database in Cima";
                const labelPageProps = I18n.t('notes_utils.menu_header_page_props') || "Proprietà / Tag Pagina in Cima";

                items.push({
                    icon: Icons.tableDatabase,
                    label: labelRecordFields + chkRecord,
                    onClick: () => {
                        if (dbState) {
                            dbState.showHeaderRecordFields = !isRecordFieldsEnabled;
                            AdvancedTable.setState(realTableId, dbState);
                            Store.triggerAutoSave();
                            if (typeof UI.renderPageHeaderProperties === 'function') {
                                UI.renderPageHeaderProperties(currentNote);
                            }
                        }
                    }
                });

                items.push({
                    icon: Icons.tag,
                    label: labelPageProps + chkProps,
                    onClick: () => {
                        if (dbState) {
                            dbState.showHeaderPageProps = !isPagePropsEnabled;
                            AdvancedTable.setState(realTableId, dbState);
                            Store.triggerAutoSave();
                            if (typeof UI.renderPageHeaderProperties === 'function') {
                                UI.renderPageHeaderProperties(currentNote);
                            }
                        }
                    }
                });

                items.push({ type: 'divider' });
            } else if (currentNote) {
                // Per le note libere standard
                const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
                const isPropsEnabled = propsDb ? propsDb.showHeaderOnNotes === true : false;
                const chk = isPropsEnabled ? ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>' : '';
                const labelPageProps = I18n.t('notes_utils.menu_header_page_props') || "Proprietà / Tag Pagina in Cima";

                items.push({
                    icon: Icons.tag,
                    label: labelPageProps + chk,
                    onClick: () => {
                        if (propsDb) {
                            propsDb.showHeaderOnNotes = !isPropsEnabled;
                            AdvancedTable.setState('SYS_PROPERTIES_DB', propsDb);
                            Store.triggerAutoSave();
                            if (typeof UI.renderPageHeaderProperties === 'function') {
                                UI.renderPageHeaderProperties(currentNote);
                            }
                        }
                    }
                });

                items.push({ type: 'divider' });
            }

            items.push({ icon: Icons.save, label: I18n.t('notes_utils.menu_save_template'), onClick: () => TemplateManager.saveCurrentNoteAsTemplate() });
            items.push({ icon: Icons.tableSimple, label: I18n.t('notes_utils.menu_manage_templates'), onClick: () => TemplateManager.openManager() });
            items.push({ type: 'divider' });
            items.push({
                icon: typeof Icons !== 'undefined' ? Icons.code : '</>',
                label: I18n.t('notes_utils.menu_raw_html') || 'Modifica Sorgente HTML...',
                onClick: () => {
                    if (typeof Editor !== 'undefined' && typeof Editor.openRawHtmlEditor === 'function') {
                        Editor.openRawHtmlEditor();
                    }
                }
            });
            items.push({ type: 'divider' });
            items.push({ icon: Icons.download, label: I18n.t('notes_utils.menu_export_modpack'), onClick: () => PackageManager.exportNoteAsModpack(AppState.currentNoteId) });
            items.push({ type: 'divider' });
            items.push({ icon: Icons.trash, label: I18n.t('notes_utils.menu_move_trash'), danger: true, onClick: () => UI.deleteCurrentNote() });
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
            breadcrumbHTML += `<span style="background: rgba(239, 68, 68, 0.1); color: var(--danger-color); padding: 1px 6px; border-radius: 4px; font-weight: bold; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;">${Icons.trash} ${I18n.t('notes_utils.breadcrumb_trash')}</span><span style="opacity:0.5;"> / </span>`;
        }

        breadcrumbHTML += path.map((n, i) => {
            const isLast = i === path.length - 1;
            const safeTitle = n.title || I18n.t('editor.untitled');
            const colorStyle = n.deletedAt ? 'color: var(--danger-color);' : '';
            return `<span style="cursor:pointer; color:var(--text-secondary); ${colorStyle} ${isLast ? 'font-weight:bold; color:var(--text-primary);' : ''}" onclick="UI.selectNote('${n.id}')">${safeTitle}</span>`;
        }).join('<span style="opacity:0.5;"> / </span>');

        bc.innerHTML = breadcrumbHTML;
    }
});