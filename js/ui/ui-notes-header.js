/**
 * ui-notes-header.js
 * Sottomodulo di UI.
 * Gestione dei componenti dell'Header della nota: Proprietà e Tag della pagina,
 * Banner e gestione delle note cestinate, modale di risoluzione dei conflitti di concorrenza.
 */

Object.assign(UI, {

    // MOTORE PROPRIETÀ NELL'HEADER DELLA NOTA
    renderPageHeaderProperties: (note) => {
        let container = document.getElementById('noteHeaderProperties');
        if (!container) {
            const titleInput = document.getElementById('noteTitle');
            const contentEl = document.getElementById('noteContent');
            if (titleInput && titleInput.parentNode) {
                container = document.createElement('div');
                container.id = 'noteHeaderProperties';
                container.className = 'note-header-properties';
                titleInput.parentNode.insertBefore(container, contentEl);
            }
        }
        if (!container) return;

        if (!note || note.deletedAt) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        const isRecordNote = note.isRecordNote && note.linkedTableId && note.linkedRowId;
        let htmlBlocks = '';

        // Helper robusto per verificare se un valore è vuoto (non considera vuoti gli array popolati di relazioni/select)
        const isFieldEmpty = (v) => {
            if (v === '' || v === null || v === undefined) return true;
            if (Array.isArray(v)) return v.length === 0;
            if (typeof v === 'object') {
                if (v.start || v.end) return false;
                if (v.noteId || v.title) return false;
                return Object.keys(v).length === 0;
            }
            return false;
        };

        // BLOCCO 1: CAMPI DEL RECORD DATABASE (Ricicla AdvancedTable.renderCell in sola lettura)
        if (isRecordNote) {
            const realTableId = typeof AdvancedTable !== 'undefined' ? AdvancedTable._resolveSourceId(note.linkedTableId) : note.linkedTableId;
            const dbState = typeof AdvancedTable !== 'undefined' ? AdvancedTable.getState(realTableId) : null;

            if (dbState && dbState.showHeaderRecordFields !== false) {
                const row = (dbState.rows || []).find(r => r.id === note.linkedRowId);
                if (row) {
                    const titleCol = dbState.columns[0];
                    const displayCols = (dbState.columns || []).filter(c => c.id !== titleCol?.id && c.type !== 'record_note' && !c.hidden);

                    let chipsHtml = '';
                    displayCols.forEach(col => {
                        let cellVal = (row.virtualCells && row.virtualCells[col.id] !== undefined) ? row.virtualCells[col.id] : (row.cells ? row.cells[col.id] : undefined);
                        
                        // Esclude le proprietà vuote per massimizzare lo spazio utile
                        if (isFieldEmpty(cellVal)) return;

                        // Riciclo al 100% della funzione nativa collaudata di VanillaDesk
                        const rendered = typeof AdvancedTable !== 'undefined' 
                            ? AdvancedTable.renderCell(realTableId, row, col, cellVal, dbState, false) 
                            : String(cellVal || '');

                        const safeColName = UI.escapeHTML(col.name);

                        chipsHtml += `
                            <div class="header-prop-chip" style="display:inline-flex; align-items:center; gap:6px; background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; padding:3px 8px; font-size:0.8rem; min-height:26px; box-sizing:border-box;">
                                <span style="color:var(--text-secondary); font-weight:600; white-space:nowrap;">${safeColName}:</span>
                                <span style="display:inline-flex; align-items:center;">${rendered}</span>
                            </div>
                        `;
                    });

                    if (chipsHtml) {
                        const dbTitle = UI.escapeHTML(dbState.title || I18n.t('editor.database'));
                        const recordBadgeLabel = I18n.t('notes_utils.header_record_badge');
                        const openTableTitle = I18n.t('notes_utils.header_record_open_table');

                        htmlBlocks += `
                            <div style="background:var(--box-bg); border:1px dashed var(--border-color); border-radius:6px; padding:8px 12px; margin-bottom:10px; max-width:var(--page-max-width); margin-left:auto; margin-right:auto; width:100%; box-sizing:border-box;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <span style="display:inline-flex; color:var(--accent-color);">${Icons.tableDatabase}</span>
                                        <span style="font-size:0.75rem; font-weight:bold; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">
                                            ${recordBadgeLabel} <b style="color:var(--accent-color);">${dbTitle}</b>
                                        </span>
                                    </div>
                                    
                                </div>
                                <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                                    ${chipsHtml}
                                </div>
                            </div>
                        `;
                    }
                }
            }
        }

        // BLOCCO 2: PROPRIETÀ E TAG PAGINA (SYS_PROPERTIES_DB)
        const realTableId = isRecordNote ? (typeof AdvancedTable !== 'undefined' ? AdvancedTable._resolveSourceId(note.linkedTableId) : note.linkedTableId) : null;
        const dbState = realTableId && typeof AdvancedTable !== 'undefined' ? AdvancedTable.getState(realTableId) : null;
        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];

        const isPagePropsActive = isRecordNote 
            ? (dbState ? dbState.showHeaderPageProps === true : false)
            : (propsDb ? propsDb.showHeaderOnNotes === true : false);

        if (isPagePropsActive && propsDb && propsDb.rows) {
            const sysRow = propsDb.rows.find(r => r.cells && r.cells['sys_c_note'] === note.id);
            if (sysRow) {
                const activeCols = (propsDb.columns || []).filter(c => c.id !== 'sys_c_note' && !c.hidden);
                let pagePropsChipsHtml = '';

                activeCols.forEach(col => {
                    let cellVal = sysRow.cells[col.id];
                    
                    // Esclude le proprietà vuote per massimizzare lo spazio utile
                    if (isFieldEmpty(cellVal)) return;

                    const rendered = typeof AdvancedTable !== 'undefined' 
                        ? AdvancedTable.renderCell('SYS_PROPERTIES_DB', sysRow, col, cellVal, propsDb, false) 
                        : String(cellVal || '');

                    const safeColName = UI.escapeHTML(col.name);

                    pagePropsChipsHtml += `
                        <div class="header-prop-chip" style="display:inline-flex; align-items:center; gap:6px; background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; padding:3px 8px; font-size:0.8rem; min-height:26px; box-sizing:border-box;">
                            <span style="color:var(--text-secondary); font-weight:600; white-space:nowrap;">${safeColName}:</span>
                            <span style="display:inline-flex; align-items:center;">${rendered}</span>
                        </div>
                    `;
                });

                if (pagePropsChipsHtml) {
                    const pagePropsBadgeLabel = I18n.t('notes_utils.header_page_props_badge');
                    const editPropsTitle = I18n.t('notes_utils.header_page_props_edit');

                    htmlBlocks += `
                        <div style="background:var(--box-bg); border:1px dashed var(--border-color); border-radius:6px; padding:8px 12px; margin-bottom:10px; max-width:var(--page-max-width); margin-left:auto; margin-right:auto; width:100%; box-sizing:border-box;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <span style="display:inline-flex; color:var(--accent-color);">${Icons.tag}</span>
                                    <span style="font-size:0.75rem; font-weight:bold; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">
                                        ${pagePropsBadgeLabel}
                                    </span>
                                </div>
                            </div>
                            <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                                ${pagePropsChipsHtml}
                            </div>
                        </div>
                    `;
                }
            }
        }

        if (htmlBlocks) {
            container.innerHTML = htmlBlocks;
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
            container.innerHTML = '';
        }
    },

    promptNoteConflict: (localNote, diskNote) => {
        // Pulizia preventiva di qualsiasi overlay di conflitto orfano
        const oldOverlay = document.getElementById('advNoteConflictOverlay');
        if (oldOverlay) oldOverlay.remove();

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.id = 'advNoteConflictOverlay';
            overlay.className = 'link-modal-overlay';
            overlay.style.zIndex = '10001';

            const localTitle = localNote.title || I18n.t('editor.untitled');
            const diskDateStr = diskNote.updatedAt ? UI.formatDate(diskNote.updatedAt) : 'Data sconosciuta';
            const localDateStr = localNote.updatedAt ? UI.formatDate(localNote.updatedAt) : 'Data sconosciuta';

            overlay.innerHTML = `
                <div class="link-modal modal-animate" style="width: 580px; max-width: 95vw; padding: 25px; border-radius: 8px; border: 1px solid var(--danger-color); box-shadow: 0 10px 30px rgba(0,0,0,0.35);">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px;">
                        <span style="color:var(--danger-color); display:inline-flex; transform:scale(1.3);">${typeof Icons !== 'undefined' ? Icons.alertTriangle : '⚠️'}</span>
                        <h2 style="margin:0; font-size: 1.25rem; color:var(--text-primary);">${I18n.t('conflict.title')}</h2>
                    </div>

                    <div style="font-size: 0.9rem; line-height: 1.6; color: var(--text-primary); margin-bottom: 20px;">
                        <p style="margin-bottom: 12px;">
                            ${I18n.t('conflict.desc', { title: UI.escapeHTML(localTitle) })}
                        </p>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                            <div style="background: rgba(37, 99, 235, 0.05); border: 1px solid rgba(37, 99, 235, 0.2); border-radius: 6px; padding: 10px;">
                                <div style="font-size: 0.75rem; font-weight: bold; color: var(--accent-color); text-transform: uppercase;">${I18n.t('conflict.disk_version')}:</div>
                                <div style="font-size: 0.85rem; margin-top: 4px; font-weight: 500;">Salvataggio: ${diskDateStr}</div>
                            </div>
                            <div style="background: rgba(234, 179, 8, 0.05); border: 1px solid rgba(234, 179, 8, 0.2); border-radius: 6px; padding: 10px;">
                                <div style="font-size: 0.75rem; font-weight: bold; color: #b45309; text-transform: uppercase;">${I18n.t('conflict.local_version')}:</div>
                                <div style="font-size: 0.85rem; margin-top: 4px; font-weight: 500;">Salvataggio: ${localDateStr}</div>
                            </div>
                        </div>

                        <div style="background: rgba(0, 0, 0, 0.02); border: 1px dashed var(--border-color); border-radius: 6px; padding: 12px; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5;">
                            ${I18n.t('conflict.safety_note')}
                        </div>
                    </div>

                    <div style="display:flex; justify-content:flex-end; gap:10px;">
                        <button class="btn" id="btnConflictOverwrite" style="border-color: var(--danger-color); color: var(--danger-color);">
                            ${I18n.t('conflict.btn_overwrite')}
                        </button>
                        <button class="btn btn-primary" id="btnConflictReload" style="padding: 8px 18px;">
                            <span style="display:inline-flex; align-items:center; gap:6px;">${typeof Icons !== 'undefined' ? Icons.restore : '↺'} ${I18n.t('conflict.btn_reload')}</span>
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            // BINDING SICURO SULL'ISTANZA SPECIFICA DELL'OVERLAY (Previene problemi con getElementById)
            const btnReload = overlay.querySelector('#btnConflictReload');
            const btnOverwrite = overlay.querySelector('#btnConflictOverwrite');

            btnReload.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                overlay.remove();
                resolve('reload');
            };

            btnOverwrite.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                overlay.remove();
                resolve('overwrite');
            };
        });
    },

    restoreNoteFromBanner: (noteId) => {
        if (typeof UI.Trash !== 'undefined' && typeof UI.Trash.restore === 'function') {
            UI.Trash.restore(noteId);
            UI.closeDrawer();
            const note = Store.getNote(noteId);
            if (note) {
                // Sincronizza immediatamente il banner e l'interfaccia di modifica prima di avviare il reload della pagina
                UI._updateTrashedNoteUI(note);
            }
            UI.selectNote(noteId);
        }
    },

    _updateTrashedNoteUI: (note) => {
        const titleInput = document.getElementById('noteTitle');
        const editToggleBtn = document.getElementById('editToggleBtn');
        let banner = document.getElementById('trashedNoteWarningBanner');

        if (note && note.deletedAt) {
            // 1. Iniezione o visualizzazione del Banner di Pericolo ancorato con certezza a titleInput.parentNode
            if (!banner && titleInput && titleInput.parentNode) {
                banner = document.createElement('div');
                banner.id = 'trashedNoteWarningBanner';
                banner.style.cssText = `
                    background: rgba(239, 68, 68, 0.08);
                    border: 1px solid var(--danger-color);
                    border-radius: 6px;
                    padding: 10px 15px;
                    margin-bottom: 15px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    width: 100%;
                    max-width: var(--page-max-width);
                    margin-left: auto;
                    margin-right: auto;
                    box-sizing: border-box;
                `;
                titleInput.parentNode.insertBefore(banner, titleInput);
            }

            if (banner) {
                banner.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; color: var(--danger-color); font-weight: bold; font-size: 0.85rem;">
                        <span style="display: inline-flex;">${typeof Icons !== 'undefined' ? Icons.trash : '🗑️'}</span>
                        <span>Questa nota si trova nel Cestino (Sola Lettura). I database al suo interno continuano a funzionare per i collegamenti esterni.</span>
                    </div>
                    <button class="btn" style="background: var(--danger-color); color: white; border: none; padding: 4px 10px; font-weight: bold; cursor: pointer; flex-shrink: 0;" onclick="UI.restoreNoteFromBanner('${note.id}')">
                        <span style="display: inline-flex; align-items: center; gap: 4px;">${typeof Icons !== 'undefined' ? Icons.restore : '↺'} ${I18n.t('trash.restore_btn')}</span>
                    </button>
                `;
                banner.style.display = 'flex';
            }

            // 2. Styling rosso del Titolo e blocco scrittura
            if (titleInput) {
                titleInput.style.color = 'var(--danger-color)';
                titleInput.setAttribute('readonly', 'true');
            }

            // 3. Occultamento pulsante Modifica nell'Header
            if (editToggleBtn) {
                editToggleBtn.style.display = 'none';
            }

        } else {
            // Rimozione del banner e ripristino stili per note attive
            if (banner) {
                banner.style.display = 'none';
                banner.innerHTML = '';
            }
            if (titleInput) {
                titleInput.style.color = '';
            }
            if (editToggleBtn) {
                editToggleBtn.style.display = '';
            }
        }
    }
});