/**
 * AdvancedTableActions.js
 * Modifiche strutturali, Geometria della griglia, Drag&Drop, Resize, Modali e Navigazione Record Note.
 * NOTA ARCHITETTURALE: Le Relazioni/Rollup sono state isolate in 'advanced-table-relations.js'
 * e i Pulsanti Macro di colonna in 'advanced-table-column-buttons.js'.
 * FIX RENAME PROPAGATION: updateTitle propaga la rinomina del titolo anche ad automazioni e macro buttons,
 * garantendo che le formule continuino a funzionare anche se non avevano ancora migrato all'ID immutabile.
 * REFACTOR TYPE GUARDS: Sfrutta AppState.getRelationalDatabaseIds() per isolare le scansioni dei database.
 */

Object.assign(AdvancedTable, {

    onTableDragStart: (e, tableId) => {
        if (!AppState.isEditMode) return;
        AppState.draggedBlockId = tableId;
        AppState.draggedBlockType = 'table';
        e.dataTransfer.effectAllowed = 'move';
        
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll();

        const wrapper = document.getElementById(tableId);
        if (wrapper) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNode(wrapper);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    },

    onTableDragEnd: (e) => {
        AppState.draggedBlockId = null;
        AppState.draggedBlockType = null;
        document.querySelectorAll('.node-content').forEach(el => el.classList.remove('drag-middle', 'drag-top', 'drag-bottom'));
        const tc = document.getElementById('treeContainer');
        if (tc) tc.classList.remove('drag-over-root');
    },

    updateTitle: (tableId, newTitle) => {
        if (!AppState.databases) return;
        let state = AppState.databases[tableId];
        if (!state) return;
        
        let oldTitle = state.title;
        let cleanTitle = newTitle.trim() || I18n.t('editor.untitled');

        let allNames = [];
        AppState.getRelationalDatabaseIds().forEach(id => {
            if (id !== tableId && AppState.databases[id] && AppState.databases[id].title) {
                allNames.push(AppState.databases[id].title);
            }
        });

        let finalTitle = cleanTitle;
        let counter = 1;
        while (allNames.includes(finalTitle)) {
            finalTitle = `${cleanTitle} (${counter})`;
            counter++;
        }

        state.title = finalTitle;
        AdvancedTable.setState(tableId, state);

        if (oldTitle && oldTitle !== finalTitle && !state.isLinkedView && !state.isPivot) {
            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex1 = new RegExp(`tabella\\[['"]${escapeRegExp(oldTitle)}['"]\\]`, 'g');
            const replace1 = `tabella["${finalTitle.replace(/"/g, '\\"')}"]`;

            AppState.getRelationalDatabaseIds().forEach(id => {
                let s = AppState.databases[id];
                if (!s) return;
                let sChanged = false;
                
                // 1. Aggiorna colonne Formula
                if (Array.isArray(s.columns)) {
                    s.columns.forEach(c => {
                        if (c.type === 'formula' && c.formula && c.formula.match(regex1)) {
                            c.formula = c.formula.replace(regex1, replace1);
                            sChanged = true;
                        }
                    });
                }

                // 2. Aggiorna Formule nelle Automazioni
                if (Array.isArray(s.automations)) {
                    s.automations.forEach(auto => {
                        if (Array.isArray(auto.triggers)) {
                            auto.triggers.forEach(t => {
                                if (t.colId === 'SYS_JS_FORMULA' && t.value && t.value.match(regex1)) {
                                    t.value = t.value.replace(regex1, replace1);
                                    sChanged = true;
                                }
                            });
                        }
                        if (Array.isArray(auto.actions)) {
                            auto.actions.forEach(a => {
                                if (a.type && a.type.includes('formula') && a.value && a.value.match(regex1)) {
                                    a.value = a.value.replace(regex1, replace1);
                                    sChanged = true;
                                }
                            });
                        }
                    });
                }

                // 3. Aggiorna Formule nei Pulsanti Macro
                if (Array.isArray(s.columns)) {
                    s.columns.forEach(c => {
                        if (c.type === 'button' && Array.isArray(c.actionBlocks)) {
                            c.actionBlocks.forEach(blk => {
                                if (Array.isArray(blk.filters)) {
                                    blk.filters.forEach(f => {
                                        if (f.colId === 'SYS_JS_FORMULA' && f.value && f.value.match(regex1)) {
                                            f.value = f.value.replace(regex1, replace1);
                                            sChanged = true;
                                        }
                                    });
                                }
                                if (Array.isArray(blk.actions)) {
                                    blk.actions.forEach(act => {
                                        if (act.type && act.type.includes('formula') && act.value && act.value.match(regex1)) {
                                            act.value = act.value.replace(regex1, replace1);
                                            sChanged = true;
                                        }
                                    });
                                }
                            });
                        }
                    });
                }

                if (sChanged) {
                    AdvancedTable.setState(id, s);
                }
            });
        }

        const titleEl = document.querySelector(`#${tableId} .adv-table-title`);
        if (titleEl && titleEl.innerText !== finalTitle) titleEl.innerText = finalTitle;

        Store.triggerAutoSave();

        // Sincronizza reattivamente la colonna/albero laterale con il nuovo titolo del database o della vista
        UI.renderTree();
    },

    onColDragStart: (e, tableId, colId) => {
        e.stopPropagation();
        
        AdvancedTable.draggedColId = colId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'col_drag_' + colId);
        
        setTimeout(() => { e.target.style.opacity = '0.5'; }, 0);
    },

    onColDragEnter: (e) => {
        if (!AdvancedTable.draggedColId) return;
        e.preventDefault(); 
    },

    onColDragOver: (e) => {
        if (!AdvancedTable.draggedColId) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        
        const target = e.target.closest('th');
        if (target && target.getAttribute('data-col') !== AdvancedTable.draggedColId) {
            target.style.borderLeft = '3px solid var(--accent-color)';
        }
    },

    onColDragLeave: (e) => {
        if (!AdvancedTable.draggedColId) return;
        e.stopPropagation();
        const target = e.target.closest('th');
        if (target) target.style.borderLeft = '';
    },

    onColDrop: (e, tableId, targetColId) => {
        e.preventDefault();
        e.stopPropagation();
        
        const sourceColId = AdvancedTable.draggedColId;
        AdvancedTable.draggedColId = null;

        document.querySelectorAll('th').forEach(th => {
            th.style.opacity = '1';
            th.style.borderLeft = '';
        });

        if (!sourceColId || sourceColId === targetColId) return;

        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);

        const srcIdx = state.columns.findIndex(c => c.id === sourceColId);
        const tgtIdx = state.columns.findIndex(c => c.id === targetColId);

        if (srcIdx > -1 && tgtIdx > -1) {
            const [col] = state.columns.splice(srcIdx, 1);
            let insertIdx = tgtIdx;
            if (srcIdx < tgtIdx) insertIdx = tgtIdx - 1;
            
            state.columns.splice(insertIdx, 0, col);
            
            AdvancedTable.setState(realTableId, state);
            AdvancedTable.updateDependentViews(realTableId);
            Store.triggerAutoSave();
        }
    },

    startResize: (e, tableId, colId) => {
        e.preventDefault(); e.stopPropagation();
        let state = AdvancedTable.getState(tableId);
        
        if (!state.freeWidth) {
            state.freeWidth = true;
            const tableEl = document.querySelector(`#${tableId} .adv-table`);
            if (tableEl) tableEl.classList.remove('adv-table-full-width');
        }

        AdvancedTable.resizingCol = { tableId, colId, state };
        AdvancedTable.startX = e.pageX;

        const thEl = document.querySelector(`#adv-th-${tableId}-${colId}`);
        if (thEl) {
            AdvancedTable.startWidth = thEl.getBoundingClientRect().width;
        } else {
            const col = state.columns.find(c => c.id === colId);
            AdvancedTable.startWidth = col.width || 150; 
        }

        e.target.classList.add('resizing');
    },

    handleGlobalMouseMove: (e) => {
        if (!AdvancedTable.resizingCol) return;
        
        e.preventDefault(); 
        
        const diff = e.pageX - AdvancedTable.startX;
        let newWidth = AdvancedTable.startWidth + diff;
        if (newWidth < 50) newWidth = 50;

        const tableId = AdvancedTable.resizingCol.tableId;
        const colId = AdvancedTable.resizingCol.colId;
        const th = document.querySelector(`#${tableId} th[data-col="${colId}"]`);

        if (th) {
            th.style.width = newWidth + 'px';
            th.style.maxWidth = newWidth + 'px'; 
            
            const colIndex = Array.from(th.parentNode.children).indexOf(th);
            const table = th.closest('table');

            if (table) {
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(tr => {
                    const td = tr.children[colIndex];
                    if (td) {
                        td.style.width = newWidth + 'px';
                        td.style.maxWidth = newWidth + 'px';
                    }
                });
            }
        }
    },

    handleGlobalMouseUp: (e) => {
        if (!AdvancedTable.resizingCol) return;
        const { tableId, colId, state } = AdvancedTable.resizingCol;
        
        const diff = e.pageX - AdvancedTable.startX;
        let newWidth = AdvancedTable.startWidth + diff;
        if (newWidth < 50) newWidth = 50;

        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let realState = AdvancedTable.getState(realTableId);

        const colToUpdate = realState.columns.find(c => c.id === colId);
        if (colToUpdate) colToUpdate.width = newWidth;
        AdvancedTable.setState(realTableId, realState);

        if (state.isLinkedView) {
            AdvancedTable.setState(tableId, state);
        }

        document.querySelectorAll('.adv-col-resizer').forEach(el => el.classList.remove('resizing'));
        AdvancedTable.resizingCol = null;
        
        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();
    },

    autoFitColumn: (e, tableId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);
        const col = state.columns.find(c => c.id === colId);
        if (!col) return;

        let maxWidth = 80; 
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Misura l'intestazione della colonna
        ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'; 
        maxWidth = Math.max(maxWidth, ctx.measureText(col.name).width + 60);

        // Misura il contenuto di tutte le celle
        ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const renderCache = {};
        
        state.rows.forEach(r => {
            let vRow = AdvancedTable.buildVirtualRow(realTableId, r, state, renderCache);
            let val = vRow.virtualCells[colId];
            
            // Usa il formatter centrale per avere il testo esatto che l'utente vede a schermo
            let strVal = AdvancedTable.getFormatDisplayValue(col, val);
            
            if (strVal !== undefined && strVal !== null && strVal !== '') {
                if (strVal.includes('\n')) {
                    const lines = strVal.split('\n');
                    lines.forEach(l => {
                        let w = ctx.measureText(l).width + 30;
                        if (w > maxWidth) maxWidth = w;
                    });
                } else {
                    let w = ctx.measureText(strVal).width + 30; 
                    
                    if (col.type === 'select' || col.type === 'multi-select' || col.type === 'relation' || col.type === 'relation_backlink') w += 20; 
                    if (col.type === 'record_note' || col.type === 'note_link') w += 25; 
                    
                    if (w > maxWidth) maxWidth = w;
                }
            }
        });

        if (maxWidth > 600) maxWidth = 600;

        col.width = Math.round(maxWidth);
        if (!state.freeWidth) state.freeWidth = true;

        AdvancedTable.setState(realTableId, state);
        
        if (tableId !== realTableId) {
            let localState = AdvancedTable.getState(tableId);
            localState.freeWidth = true;
            AdvancedTable.setState(tableId, localState);
        }

        AdvancedTable.updateDependentViews(realTableId);
        Store.triggerAutoSave();
    },

    toggleFreeWidth: (tableId) => {
        let state = AdvancedTable.getState(tableId);
        state.freeWidth = !state.freeWidth;
        AdvancedTable.setState(tableId, state);

        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
        AdvancedTable.closeDropdowns(true);
    },

    moveTableToNote: (tableId, targetNoteId) => {
        // Delega al gestore universale dei widget per garantire l'uniformità del salvataggio e della minificazione
        if (typeof WidgetManager !== 'undefined' && typeof WidgetManager.moveWidgetToNote === 'function') {
            WidgetManager.moveWidgetToNote(tableId, targetNoteId);
            AdvancedTable.closeDropdowns(true);
        }
    },

    openLongTextModal: (tableId, rowId, colId, initialCaretPos = null) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        const state = AdvancedTable.getState(realTableId);
        if (!state) return;
        
        const row = state.rows.find(r => r.id === rowId);
        const col = state.columns.find(c => c.id === colId);
        if (!row || !col) return;

        const isComputed = ['formula', 'rollup', 'relation_backlink', 'created_time', 'last_edited_time'].includes(col.type);

        let val = '';
        if (isComputed) {
            const vRow = AdvancedTable.buildVirtualRow(realTableId, row, state);
            val = AdvancedTable.getFormatDisplayValue(col, vRow.virtualCells[colId]);
        } else {
            val = row.cells[colId] || '';
        }

        const readonlyAttr = (!AppState.isEditMode || isComputed) ? 'readonly' : '';
        const modalTitle = isComputed ? I18n.t('adv_actions.view_text_title', { colName: col.name }) : I18n.t('adv_actions.edit_text_title', { colName: col.name });

        const bodyHTML = `
            <textarea id="advLongTextInput" class="modern-input" ${readonlyAttr} style="width:100%; height:100%; min-height: 300px; resize:vertical; font-family:inherit; font-size:0.95rem; line-height:1.5; padding:10px; ${isComputed ? 'cursor:default;' : ''}">${UI.escapeHTML(String(val))}</textarea>
        `;
        
        const footerHTML = (isComputed || !AppState.isEditMode) ? `
            <button class="btn btn-primary" onclick="UI.closeDrawer()">${I18n.t('common.close')}</button>
        ` : `
            <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.cancel')}</button>
            <button class="btn btn-primary" onclick="AdvancedTable.saveLongText('${tableId}', '${rowId}', '${colId}')">${I18n.t('adv_actions.save_text')}</button>
        `;

        if (typeof UI !== 'undefined') {
            UI.openDrawer(`${Icons.recordView} ${modalTitle}`, bodyHTML, footerHTML);
        }
        
        setTimeout(() => {
            const input = document.getElementById('advLongTextInput');
            if (input && !isComputed) {
                input.focus();
                if (initialCaretPos !== null) {
                    const pos = Math.min(initialCaretPos, input.value.length);
                    input.setSelectionRange(pos, pos);
                }
            }
        }, 50);
    },

    saveLongText: (tableId, rowId, colId) => {
        const input = document.getElementById('advLongTextInput');
        if (input) {
            AdvancedTable.updateData(tableId, rowId, colId, input.value);
            if (typeof UI !== 'undefined') UI.closeDrawer();
        }
    },

    openRecordNote: (tableId, rowId, colId) => {
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        let state = AdvancedTable.getState(realTableId);
        if (!state) return;
        
        const row = state.rows.find(r => r.id === rowId);
        if (!row) return;

        let noteId = row.cells[colId];
        let newlyCreated = false;

        if (!noteId || !Store.getNote(noteId) || Store.getNote(noteId).deletedAt) {
            noteId = Store.generateId();
            const now = new Date().toISOString();
            const initialRevId = Store.generateId();
            
            const newNote = {
                id: noteId,
                parentId: AppState.currentNoteId, 
                title: "", 
                content: `<p><br></p>`,
                isMarked: false,
                expanded: true,
                createdAt: now,
                updatedAt: now,
                revId: initialRevId,
                _baseRevId: initialRevId,
                _isDraft: true,
                _isDirty: true,
                isRecordNote: true, 
                linkedTableId: realTableId,
                linkedRowId: rowId
            };
            
            AppState.notes.push(newNote);
            row.cells[colId] = noteId;
            AdvancedTable.setState(realTableId, state);
            if (typeof AdvancedTable.syncSystemPropertiesRow === 'function') {
                AdvancedTable.syncSystemPropertiesRow(noteId);
            }
            Store.triggerAutoSave();
            newlyCreated = true;
        }

        if (typeof UI !== 'undefined' && UI.selectNote) {
            UI.selectNote(noteId);
        }

        if (newlyCreated || !Store.getNote(noteId).title) {
            if (typeof UI !== 'undefined' && UI.toggleEditMode) UI.toggleEditMode(true);
            setTimeout(() => {
                const titleInput = document.getElementById('noteTitle');
                if (titleInput) titleInput.focus();
            }, 100);
        }
    },
    
    deleteTable: (tableId, force = false) => {
        // GESTIONE CITAZIONE (Transclusion): Se l'elemento rimosso è una citazione di un database,
        // rimuove solo il contenitore visivo senza distruggere lo stato del database originale né le sue pagine record!
        const isCitation = tableId.includes('_cited_') || (document.getElementById(tableId) && document.getElementById(tableId).closest('.block-citation'));
        if (isCitation) {
            if (!force && !confirm(I18n.t('adv_actions.confirm_remove_cited_db'))) return;
            const wrapper = document.getElementById(tableId);
            if (wrapper) wrapper.remove();
            AdvancedTable.closeDropdowns(true);
            if (typeof Editor !== 'undefined') Editor.sanitizeContent();
            if (typeof Store !== 'undefined') Store.triggerAutoSave();
            return;
        }

        let state = AdvancedTable.getState(tableId);
        
        // --- SYSTEM DB PROTECTION: Soft Delete (Delete DOM, Keep Data) ---
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        if (realTableId === 'SYS_PROPERTIES_DB') {
            const wrapper = document.getElementById(tableId);
            if (wrapper) wrapper.remove();
            
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast(I18n.t('adv_actions.sys_db_soft_delete_toast'), "info");
            }
            AdvancedTable.closeDropdowns(true);
            return;
        }

        let msg = I18n.t('adv_actions.confirm_delete_db');
        if (state.isPivot) msg = I18n.t('adv_menus.remove_pivot');
        else if (state.isLinkedView) msg = I18n.t('adv_actions.confirm_remove_linked_view');

        if (typeof AppState !== 'undefined' && !state.isPivot && !state.isLinkedView) {
            let isTargetOfRelation = false;
            let pointingTableName = "";

            AppState.getRelationalDatabaseIds().forEach(id => {
                const s = AppState.databases[id];
                if (id === tableId || !s || !Array.isArray(s.columns)) return;
                
                s.columns.forEach(c => {
                    if ((c.type === 'relation' || c.type === 'relation_backlink') && (c.targetTableId === tableId || c.linkedTableId === tableId)) {
                        isTargetOfRelation = true;
                        pointingTableName = s.title;
                    }
                });
            });

            if (isTargetOfRelation) {
                alert(I18n.t('adv_actions.cannot_delete_target_of_relation', { tableName: pointingTableName }));
                AdvancedTable.closeDropdowns(true);
                return;
            }
        }

        if (!force && !confirm(msg)) return;

        // Controllo rigoroso Array.isArray(state.columns)
        if (!state.isLinkedView && !state.isPivot && Array.isArray(state.columns)) {
            state.columns.filter(c => c.type === 'record_note').forEach(c => {
                state.rows.forEach(r => {
                    const noteId = r.cells[c.id];
                    if (noteId && typeof UI !== 'undefined') UI.Trash.forceHardDeleteRecursive(noteId);
                });
            });
        }

        const wrapper = document.getElementById(tableId);
        if (wrapper) wrapper.remove();

        if (AppState.databases && AppState.databases[tableId]) {
            delete AppState.databases[tableId];
        }

        if (!state.isLinkedView && !state.isPivot) {
            AdvancedTable.updateDependentViews(tableId);
        }

        AdvancedTable.closeDropdowns(true);
        if (typeof Editor !== 'undefined') Editor.sanitizeContent();
        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    },

    // =========================================================================
    // GESTORI COLLEGAMENTO A NOTA (note_link)
    // =========================================================================
    openNoteLinkSelector: (e, tableId, rowId, colId) => {
        if (e) e.stopPropagation();
        const realTableId = AdvancedTable._resolveSourceId(tableId);
        const state = AdvancedTable.getState(realTableId);
        const row = state.rows.find(r => r.id === rowId);
        const currentVal = row ? row.cells[colId] : null;

        let targetNoteId = null;
        let targetRefId = null;

        if (currentVal && typeof currentVal === 'object') {
            targetNoteId = currentVal.noteId;
            targetRefId = currentVal.refId;
        } else if (typeof currentVal === 'string' && currentVal) {
            targetNoteId = currentVal;
        }

        UI.DocumentBrowser.open('link', `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.link} ${I18n.t('adv_col_menu.type_note_link')}</span>`, (item) => {
            const anchor = (item.refType === 'chapter') ? item.title : null;
            let displayTitle = item.noteTitle || item.title;
            if (item.refType !== 'note' && item.refType !== 'chapter') {
                displayTitle = item.title;
            }

            const linkData = {
                noteId: item.noteId,
                title: displayTitle,
                anchor: anchor,
                refId: item.refId
            };

            AdvancedTable.updateData(tableId, rowId, colId, linkData);
            UI.closeDrawer();
        }, { noteId: targetNoteId, refId: targetRefId });
    },

    clearNoteLink: (e, tableId, rowId, colId) => {
        if (e) e.stopPropagation();
        AdvancedTable.updateData(tableId, rowId, colId, null);
    }
});