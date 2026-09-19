/**
 * AdvancedTableRecord.js
 * Crea il Drawer a scorrimento laterale per visualizzare o editare un singolo Record.
 * FIX HISTORY: Supporto al ricaricamento del DOM post Back-Navigation.
 * FIX UX: Rinominato "Elimina Record" in "Elimina Definitivamente".
 * FIX MULTI-SELECT: I valori (Tag) vengono ora sempre visualizzati in ordine alfabetico crescente.
 * FIX TIPI DATO: La cella "Number" ora invia il dato in formato Float e non String.
 * FIX RELAZIONI FORMULE: Assicura che i nomi delle relazioni nel Drawer passino
 * per la decodifica delle Virtual Row se la colonna bersaglio è una Formula JS. (Sostituito con metodo del Core).
 * FEAT: Rendering e navigazione della colonna 'note_link' (Collegamento a Nota) sia in Edit che in Read-Only.
 * FIX COMPATIBILITÀ MODULARE: Verifica l'esistenza di AdvancedTable.renderTable prima dell'invocazione.
 * FIX VALUE EXTRACTION: Utilizzo universale di AdvancedTable.getFormatDisplayValue per formule/rollup/numeri
 * preservando l'accesso diretto a row.createdAt e row.updatedAt per i timestamp di sistema.
 */

Object.assign(AdvancedTable, {
    activeRecordId: null,
    activeTableId: null,

    openRecordView: (tableId, rowId, relationCtx = null) => {
        let state = null;
        let isReadOnlyForced = false;
        
        const isSysDB = tableId === 'SYS_PROPERTIES_DB';

        const wrapper = document.getElementById(tableId);
        if (wrapper) {
            state = AdvancedTable.getState(tableId);
        } else {
            state = AdvancedTable.getTableState(tableId);
            // Se non c'è il wrapper a schermo forza il ReadOnly, 
            // a meno che non sia il DB di Sistema che è invisibile per natura!
            if (!isSysDB) {
                isReadOnlyForced = true;
            }
        }

        if (!state) {
            alert("Database o Diario non trovato. L'operazione è stata annullata.");
            return;
        }

        // Calcolo reale dei campi nascosti nella VISTA corrente 
        let viewId = 'table';
        if (state.viewType === 'board') viewId = 'board_' + state.boardGroupBy;
        else if (state.viewType === 'calendar') viewId = 'calendar_' + state.calendarDateCol;
        else if (state.viewType === 'timeline') viewId = 'timeline_' + state.timelineDateCol;
        const hiddenList = state.viewConfig && state.viewConfig[viewId] ? state.viewConfig[viewId].hiddenCols : [];

        let row = state.rows.find(r => r.id === rowId);
        if (!row && state.isPivot) {
            const srcState = AdvancedTable.getTableState(state.sourceTableId);
            if (srcState) row = srcState.rows.find(r => r.id === rowId);
        }
        if (!row && state.isLinkedView) {
            const srcState = AdvancedTable.getTableState(state.sourceTableId);
            if (srcState) row = srcState.rows.find(r => r.id === rowId);
        }
        
        if (!row) {
            console.error(`[DEBUG] Il record ${rowId} non esiste all'interno del database ${tableId}.`);
            return;
        }

        AdvancedTable.activeRecordId = rowId;
        AdvancedTable.activeTableId = tableId;

        let vRow = AdvancedTable.buildVirtualRow(tableId, row, state);
        const isEdit = AppState.isEditMode && !isReadOnlyForced && !state.isPivot;
        const pointerEvent = !isEdit ? 'pointer-events: auto; cursor: pointer;' : '';

        let html = '<div style="display:flex; flex-direction:column; gap:10px; width:100%;">';

        state.columns.forEach(col => {
            const isBacklink = col.type === 'relation_backlink';
            const isSysNoteLink = isSysDB && col.id === 'sys_c_note';
            const isColCurrentlyHidden = hiddenList.includes(col.id) || col.hidden;
            
            let val = vRow.virtualCells[col.id];
            let displayVal = '';

            // Se siamo nel DB di sistema, la colonna di collegamento alla nota è sempre in sola lettura
            const isCellEdit = isEdit && !isBacklink && !isSysNoteLink;

            if (isCellEdit) {
                if (col.type === 'created_time') {
                    displayVal = `<span style="opacity:0.6; font-family:monospace; font-size:0.9rem;">${AdvancedTable.formatTime(row.createdAt)}</span>`;
                }
                else if (col.type === 'last_edited_time') {
                    displayVal = `<span style="opacity:0.6; font-family:monospace; font-size:0.9rem;">${AdvancedTable.formatTime(row.updatedAt)}</span>`;
                }
                else if (col.type === 'formula' || col.type === 'rollup') {
                    let displayValToUse = AdvancedTable.getFormatDisplayValue(col, val);
                    displayVal = `<span style="opacity:0.6; font-family:monospace; font-size:0.9rem;">${displayValToUse || '-'}</span>`;
                }
                else if (col.type === 'checkbox') {
                    displayVal = `<input type="checkbox" ${val ? 'checked' : ''} style="transform: scale(1.2); cursor:pointer;" onchange="AdvancedTable.updateData('${tableId}', '${rowId}', '${col.id}', this.checked); AdvancedTable.openRecordView('${tableId}', '${rowId}');">`;
                }
                else if (col.type === 'date' || col.type === 'datetime' || col.type === 'time') {
                    const inputType = col.type === 'datetime' ? 'datetime-local' : col.type === 'date' ? 'date' : 'time';

                    if (col.hasEndDate && col.type !== 'time') {
                        let startVal = val && typeof val === 'object' ? val.start : (val || '');
                        let endVal = val && typeof val === 'object' ? val.end : '';
                        
                        if (inputType === 'datetime-local') {
                            if (startVal && startVal.length === 10) startVal += 'T00:00';
                            if (endVal && endVal.length === 10) endVal += 'T00:00';
                        }
                        
                        displayVal = `
                            <div style="display:flex; align-items:center; gap:4px; width:100%;">
                                <input type="${inputType}" value="${startVal}" class="modern-input" style="flex:1; padding:2px; font-size:0.8rem; background:rgba(0,0,0,0.02); min-width:0;" onblur="AdvancedTable.updateDateRange('${tableId}', '${row.id}', '${col.id}', this.value, 'start')">
                                <span style="font-size:0.8rem; color:var(--text-secondary);">➔</span>
                                <input type="${inputType}" value="${endVal}" class="modern-input" style="flex:1; padding:2px; font-size:0.8rem; background:rgba(0,0,0,0.02); min-width:0;" onblur="AdvancedTable.updateDateRange('${tableId}', '${row.id}', '${col.id}', this.value, 'end')">
                            </div>
                        `;
                    } else {
                        let singleVal = val && typeof val === 'object' ? val.start : (val || '');
                        if (inputType === 'datetime-local' && singleVal && singleVal.length === 10) singleVal += 'T00:00';
                        displayVal = `<input type="${inputType}" value="${singleVal}" class="modern-input" style="margin:0; text-align:right;" onblur="AdvancedTable.updateData('${tableId}', '${rowId}', '${col.id}', this.value)">`;
                    }
                }
                else if (col.type === 'number') {
                    const rawVal = val !== null && val !== undefined ? val : '';
                    const formattedVal = AdvancedTable.formatDecimal(rawVal, col.decimals);
                    const decAttr = col.decimals !== undefined ? col.decimals : 'default';
                    
                    // FIX TIPI DATO: onblur invia a updateData il vero numero `n`, non la stringa formattata
                    const blurScript = `let v = this.value.trim(); let n = v === '' ? '' : parseFloat(v.replace(',', '.')); n = isNaN(n) ? '' : n; this.setAttribute('data-raw-value', n); this.type='text'; this.value=AdvancedTable.formatDecimal(n, this.getAttribute('data-decimals')); AdvancedTable.updateData('${tableId}', '${rowId}', '${col.id}', n);`;

                    displayVal = `
                        <input type="text" 
                               value="${formattedVal}" 
                               data-raw-value="${rawVal}" 
                               data-decimals="${decAttr}" 
                               class="modern-input adv-number-input" 
                               style="margin:0; text-align:right;" 
                               onfocus="this.type='number'; this.value=this.getAttribute('data-raw-value');" 
                               onblur="${blurScript}">
                    `;
                }
                else if (col.type === 'select' || col.type === 'multi-select') {
                    let content = '';
                    let vals = Array.isArray(val) ? [...val] : (val ? [val] : []);
                    
                    if (col.type === 'multi-select' && vals.length > 0) {
                        vals.sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true, sensitivity: 'base'}));
                    }

                    if (vals.length > 0) {
                        vals.forEach(v => {
                            let colorClass = state.selectColors && state.selectColors[col.id] && state.selectColors[col.id][v] ? state.selectColors[col.id][v] : '';
                            content += `<span class="adv-select-pill ${colorClass}" style="margin-right:4px;">${v}</span>`;
                        });
                    } else {
                        content = `<span class="adv-select-empty" style="color:var(--text-secondary);">Clicca per Selezionare...</span>`;
                    }
                    const cellId = `adv-sel-rec-${tableId}-${rowId}-${col.id}`;
                    displayVal = `<div id="${cellId}" class="adv-select-container" style="justify-content:flex-end; padding:6px; border:1px dashed var(--border-color); border-radius:4px; min-width:150px; cursor:pointer;" onclick="AdvancedTable.openSelectMenu(event, '${tableId}', '${rowId}', '${col.id}')">${content}</div>`;
                }
                else if (col.type === 'note_link') {
                    let linkObj = null;
                    if (val && typeof val === 'object') linkObj = val;
                    else if (val && typeof val === 'string') {
                        try { linkObj = JSON.parse(val); } catch(e) { linkObj = { noteId: val }; }
                    }

                    let noteTitle = '';
                    let targetNote = null;
                    if (linkObj && linkObj.noteId) {
                        targetNote = typeof Store !== 'undefined' ? Store.getNote(linkObj.noteId) : null;
                        if (targetNote && !targetNote.deletedAt) {
                            noteTitle = linkObj.anchor ? `${targetNote.title} > ${linkObj.anchor}` : (targetNote.title || 'Senza Titolo');
                        } else if (targetNote && targetNote.deletedAt) {
                            noteTitle = 'Nota nel Cestino';
                        } else {
                            noteTitle = linkObj.title || 'Nota Mancante';
                        }
                    }

                    if (noteTitle) {
                        const safeTitle = UI.escapeHTML(noteTitle);
                        const clickNav = `onclick="event.stopPropagation(); UI.closeDrawer(); setTimeout(() => UI.selectNote('${linkObj.noteId}', ${linkObj.anchor ? `'${linkObj.anchor.replace(/'/g, "\\'")}'` : 'null'}, ${linkObj.refId ? `'${linkObj.refId}'` : 'null'}), 100);"`;
                        displayVal = `
                            <div style="display:flex; align-items:center; gap:6px; justify-content:flex-end; width:100%;">
                                <a class="internal-link" style="cursor:pointer;" ${clickNav}>${safeTitle}</a>
                                <button class="btn" style="padding:2px 8px; font-size:0.75rem;" onclick="event.stopPropagation(); AdvancedTable.openNoteLinkSelector(event, '${tableId}', '${rowId}', '${col.id}')">${Icons.edit} Cambia</button>
                                <button class="adv-icon-btn danger" style="padding:2px 6px;" title="Rimuovi" onclick="event.stopPropagation(); AdvancedTable.clearNoteLink(event, '${tableId}', '${rowId}', '${col.id}')">${Icons.close}</button>
                            </div>
                        `;
                    } else {
                        displayVal = `
                            <button class="btn" style="padding:4px 10px; font-size:0.8rem; border:1px dashed var(--accent-color); color:var(--accent-color);" onclick="event.stopPropagation(); AdvancedTable.openNoteLinkSelector(event, '${tableId}', '${rowId}', '${col.id}')">
                                <span style="display:inline-flex; align-items:center; gap:4px;">${Icons.link} Seleziona Nota...</span>
                            </button>
                        `;
                    }
                }
                else if (col.type === 'relation') {
                    const targetDbId = col.targetTableId;
                    
                    // Delega la risoluzione profonda all'engine
                    const details = AdvancedTable.resolveRelationDetails(col, val, state._renderCache || {});
                    let pills = '';
                    
                    if (details.length > 0) {
                        const ctxStr = `{srcTable: '${tableId}', srcRow: '${rowId}', srcCol: '${col.id}', isBacklink: false}`;
                        details.forEach(rel => {
                            if (rel.name === 'Orfano') {
                                pills += `<span class="adv-select-pill hl-c10">Orfano</span>`;
                            } else {
                                pills += `<span class="adv-select-pill default-color" style="margin-right:4px;" onclick="event.stopPropagation(); UI.closeDrawer(); setTimeout(() => AdvancedTable.openRecordView('${targetDbId}', '${rel.id}', ${ctxStr}), 100)">${UI.escapeHTML(rel.name)}</span>`;
                            }
                        });
                    } else {
                        pills = `<span class="adv-select-empty" style="color:var(--text-secondary);">Clicca per Selezionare...</span>`;
                    }
                    
                    const clickEvent = `onclick="AdvancedTable.openRelationSelector(event, '${tableId}', '${rowId}', '${col.id}')"`;
                    displayVal = `<div class="adv-select-container" style="justify-content:flex-end; padding:6px; border:1px dashed var(--border-color); border-radius:4px; min-width:150px; cursor:pointer;" ${clickEvent}>${pills}</div>`;
                }
                else if (col.type === 'record_note') {
                    const hasNote = val && val.trim() !== '';
                    let noteObj = hasNote ? Store.getNote(val) : null;
                    if (noteObj && noteObj.deletedAt) noteObj = null;
                    
                    const isAttached = !!noteObj;
                    const noteTitle = isAttached ? (noteObj.title || 'Senza Titolo') : 'Apri Pagina';
                    const btnStyle = isAttached ? 'color: var(--record-color, #10b981); font-weight: bold; background: var(--record-bg, rgba(16, 185, 129, 0.1)); border-color: var(--record-color, #10b981);' : 'color: var(--text-secondary); opacity: 0.7;';
                    displayVal = `<button class="btn" style="padding: 4px 10px; border: 1px solid var(--border-color); width: 100%; justify-content: flex-end; ${btnStyle}" onclick="UI.closeDrawer(); setTimeout(() => AdvancedTable.openRecordNote('${tableId}', '${row.id}', '${col.id}'), 50);">
                                    <span style="display:inline-flex; align-items:center; gap:5px;">${Icons.recordPage} ${noteTitle}</span>
                                  </button>`;
                }
                else if (col.type === 'url') {
                    const safeVal = (val || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    displayVal = `<input type="text" value="${safeVal}" class="modern-input" style="margin:0; text-align:right;" onblur="AdvancedTable.updateData('${tableId}', '${rowId}', '${col.id}', this.value)">`;
                }
                else if (col.type === 'text') {
                    if (val && (val.length > 50 || val.includes('\n'))) {
                        const isVeryLong = val.length > 250 || (val.match(/\n/g) ||[]).length > 4;
                        const targetHeight = isVeryLong ? '160px' : '80px';
                        const safeVal = (val || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        displayVal = `<textarea class="modern-input" style="margin:0; width:100%; box-sizing:border-box; min-height:${targetHeight}; text-align:left; resize:vertical; background:var(--bg-color); color:var(--text-primary);" onblur="AdvancedTable.updateData('${tableId}', '${rowId}', '${col.id}', this.value)">${safeVal}</textarea>`;
                    } else {
                        const safeVal = (val || '').replace(/"/g, '&quot;');
                        displayVal = `<input type="text" value="${safeVal}" class="modern-input" style="margin:0; text-align:right;" onblur="AdvancedTable.updateData('${tableId}', '${rowId}', '${col.id}', this.value)">`;
                    }
                }
                else {
                    const safeVal = (val || '').replace(/"/g, '&quot;');
                    displayVal = `<input type="text" value="${safeVal}" class="modern-input" style="margin:0; text-align:right;" onblur="AdvancedTable.updateData('${tableId}', '${rowId}', '${col.id}', this.value)">`;
                }
            } else {
                
                if (isBacklink) {
                    const readOnlyTip = `title="Valore calcolato in automatico. Modificabile solo dal database origine." style="cursor:help;"`;
                    
                    if (col.backlinkDisplay === 'count') {
                        displayVal = `<div class="adv-select-container" style="justify-content:flex-end;" ${readOnlyTip}>
                                    <span class="adv-select-pill default-color" style="font-family:monospace; padding:2px 8px;">${val || 0}</span>
                                </div>`;
                    } else if (col.backlinkDisplay === 'property') {
                        displayVal = `<div style="text-align:right; white-space:pre-wrap; word-break:break-word; width:100%; box-sizing:border-box; font-size:0.9em;" ${readOnlyTip}>${val || '<span class="adv-select-empty" style="float:right;">Vuoto</span>'}</div>`;
                    } else {
                        const targetDbId = col.linkedTableId;
                        const details = AdvancedTable.resolveRelationDetails(col, val, state._renderCache || {});
                        
                        if (details.length > 0) {
                            displayVal = `<div style="display:flex; gap:4px; justify-content:flex-end; flex-wrap:wrap;" ${readOnlyTip}>`;
                            const ctxStr = `{srcTable: '${tableId}', srcRow: '${rowId}', srcCol: '${col.id}', isBacklink: true}`;

                            details.forEach(rel => {
                                if (rel.name === 'Orfano') {
                                    displayVal += `<span class="adv-select-pill hl-c10">Orfano</span>`;
                                } else {
                                    displayVal += `<span class="adv-select-pill default-color" style="margin:0; pointer-events:auto; cursor:pointer;" onclick="event.stopPropagation(); UI.closeDrawer(); setTimeout(() => AdvancedTable.openRecordView('${targetDbId}', '${rel.id}', ${ctxStr}), 100)">${UI.escapeHTML(rel.name)} <span style="margin-left:4px;">${Icons.recordView}</span></span>`;
                                }
                            });
                            displayVal += `</div>`;
                        } else {
                            displayVal = `<span class="adv-select-empty" style="float:right;" ${readOnlyTip}>Vuoto</span>`;
                        }
                    }
                } 
                else if (col.type === 'note_link') {
                    let linkObj = null;
                    if (val && typeof val === 'object') linkObj = val;
                    else if (val && typeof val === 'string') {
                        try { linkObj = JSON.parse(val); } catch(e) { linkObj = { noteId: val }; }
                    }

                    let noteTitle = '';
                    let targetNote = null;
                    if (linkObj && linkObj.noteId) {
                        targetNote = typeof Store !== 'undefined' ? Store.getNote(linkObj.noteId) : null;
                        if (targetNote && !targetNote.deletedAt) {
                            noteTitle = linkObj.anchor ? `${targetNote.title} > ${linkObj.anchor}` : (targetNote.title || 'Senza Titolo');
                        } else if (targetNote && targetNote.deletedAt) {
                            noteTitle = 'Nota nel Cestino';
                        } else {
                            noteTitle = linkObj.title || 'Nota Mancante';
                        }
                    }

                    if (noteTitle) {
                        const safeTitle = UI.escapeHTML(noteTitle);
                        const clickNav = `onclick="event.stopPropagation(); UI.closeDrawer(); setTimeout(() => UI.selectNote('${linkObj.noteId}', ${linkObj.anchor ? `'${linkObj.anchor.replace(/'/g, "\\'")}'` : 'null'}, ${linkObj.refId ? `'${linkObj.refId}'` : 'null'}), 100);"`;
                        displayVal = `<div style="display:flex; justify-content:flex-end;"><a class="internal-link" style="cursor:pointer; ${pointerEvent}" ${clickNav}>${safeTitle}</a></div>`;
                    } else {
                        displayVal = `<span class="adv-select-empty" style="float:right;">Vuoto</span>`;
                    }
                }
                else if (col.type === 'relation') {
                    const targetDbId = col.targetTableId;
                    const details = AdvancedTable.resolveRelationDetails(col, val, state._renderCache || {});
                    
                    if (details.length > 0) {
                        displayVal = `<div style="display:flex; gap:4px; justify-content:flex-end; flex-wrap:wrap;">`;
                        const ctxStr = `{srcTable: '${tableId}', srcRow: '${rowId}', srcCol: '${col.id}', isBacklink: false}`;

                        details.forEach(rel => {
                            if (rel.name === 'Orfano') {
                                displayVal += `<span class="adv-select-pill hl-c10">Orfano</span>`;
                            } else {
                                displayVal += `<span class="adv-select-pill default-color" style="margin:0; pointer-events:auto; cursor:pointer;" onclick="event.stopPropagation(); UI.closeDrawer(); setTimeout(() => AdvancedTable.openRecordView('${targetDbId}', '${rel.id}', ${ctxStr}), 100)">${UI.escapeHTML(rel.name)} <span style="margin-left:4px;">${Icons.recordView}</span></span>`;
                            }
                        });
                        displayVal += `</div>`;
                    } else {
                        displayVal = `<span class="adv-select-empty" style="float:right;">Vuoto</span>`;
                    }
                }
                else if (col.type === 'record_note') {
                    const hasNote = val && val.trim() !== '';
                    let noteObj = hasNote ? Store.getNote(val) : null;
                    if (noteObj && noteObj.deletedAt) noteObj = null;
                    
                    const isAttached = !!noteObj;
                    const noteTitle = isAttached ? (noteObj.title || 'Senza Titolo') : 'Nessuna Pagina';
                    
                    const jumpAction = isSysDB ? '' : `setTimeout(() => UI.jumpToWidget('${tableId}'), 50);`;
                    
                    if (isAttached) {
                        displayVal = `<span style="color:var(--record-color, #10b981); font-weight:bold; ${pointerEvent}" onclick="event.stopPropagation(); UI.closeDrawer(); ${jumpAction} setTimeout(() => UI.selectNote('${val}'), 100);"><span style="display:inline-flex; vertical-align:middle; gap:5px; margin-right:5px;">${Icons.recordPage}</span>${noteTitle}</span>`;
                    } else {
                        displayVal = `<span class="adv-select-empty" style="float:right;">Nessuna Pagina</span>`;
                    }
                } 
                else {
                    if (col.type === 'created_time') displayVal = `<div style="text-align:right;">${AdvancedTable.formatTime(row.createdAt)}</div>`;
                    else if (col.type === 'last_edited_time') displayVal = `<div style="text-align:right;">${AdvancedTable.formatTime(row.updatedAt)}</div>`;
                    else if (col.type === 'checkbox') {
                        displayVal = `<div style="text-align:right; display:flex; justify-content:flex-end;">${val ? `<span style="display:inline-flex; align-items:center; gap:4px; color:var(--accent-color);">${Icons.checkSquare} Sì</span>` : `<span style="display:inline-flex; align-items:center; gap:4px; color:var(--text-secondary);">${Icons.square} No</span>`}</div>`;
                    }
                    else if (col.type === 'date' || col.type === 'datetime') {
                        if (col.hasEndDate && val && typeof val === 'object') {
                            let sDisp = val.start || '?'; let eDisp = val.end || '?';
                            if (val.start && col.type === 'datetime') sDisp = val.start.replace('T', ' ');
                            if (val.end && col.type === 'datetime') eDisp = val.end.replace('T', ' ');
                            displayVal = `<div style="font-size:0.85rem; color:var(--text-primary); display:flex; align-items:center; justify-content:flex-end; gap:5px;">
                                            <span>${sDisp}</span>
                                            <span style="opacity:0.5; font-size:0.8rem;">➔</span>
                                            <span>${eDisp}</span>
                                          </div>`;
                        } else {
                            displayVal = `<div style="text-align:right;">${val && typeof val === 'object' ? val.start : (val || '')}</div>`;
                        }
                    }
                    else if (col.type === 'select' || col.type === 'multi-select') {
                        let vals = Array.isArray(val) ? [...val] : (val ? [val] :[]);
                        if (col.type === 'multi-select' && vals.length > 0) {
                            vals.sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true, sensitivity: 'base'}));
                        }
                        
                        if (vals.length > 0) {
                            displayVal = `<div style="display:flex; gap:4px; justify-content:flex-end;">`;
                            vals.forEach(v => {
                                let colorClass = state.selectColors && state.selectColors[col.id] && state.selectColors[col.id][v] ? state.selectColors[col.id][v] : '';
                                displayVal += `<span class="adv-select-pill ${colorClass}" style="margin:0;">${v}</span>`;
                            });
                            displayVal += `</div>`;
                        } else {
                            displayVal = `<span class="adv-select-empty" style="float:right;">Vuoto</span>`;
                        }
                    } 
                    else if (col.type === 'formula' || col.type === 'rollup' || col.type === 'number') {
                        let displayValToUse = AdvancedTable.getFormatDisplayValue(col, val);
                        displayVal = `<div style="text-align:right;">${displayValToUse !== '' && displayValToUse !== null ? displayValToUse : '<span class="adv-select-empty" style="float:right;">Vuoto</span>'}</div>`;
                    }
                    else if (col.type === 'url') {
                        if (val) {
                            let href = val.trim();
                            let isLocal = href.match(/^[a-zA-Z]:[\\/]/) || href.startsWith('\\\\');
                            if (isLocal) {
                                href = 'file:///' + href.replace(/\\/g, '/');
                                displayVal = `<div style="display:flex; align-items:center; justify-content:flex-end; gap:5px; word-break:break-all;"><a href="${href}" target="_blank" style="color:var(--accent-color); text-decoration:underline; ${pointerEvent}">${val}</a> <button class="adv-icon-btn" style="${pointerEvent}" onclick="navigator.clipboard.writeText('${val.replace(/\\/g, '\\\\')}'); alert('Percorso copiato negli appunti!')" title="Copia percorso locale">${Icons.clipboard}</button></div>`;
                            } else {
                                if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('file:///')) href = 'https://' + href;
                                displayVal = `<div style="text-align:right;"><a href="${href}" target="_blank" style="color:var(--accent-color); text-decoration:underline; word-break:break-all; ${pointerEvent}">${val}</a></div>`;
                            }
                        } else {
                            displayVal = `<span class="adv-select-empty" style="float:right;">Vuoto</span>`;
                        }
                    }
                    else if (col.type === 'text') {
                        const isVeryLong = val && val.includes('\n');
                        displayVal = `<div style="text-align:${isVeryLong ? 'left' : 'right'}; white-space:pre-wrap; word-break:break-word; width:100%; box-sizing:border-box; font-size:0.9em;">${val || '<span class="adv-select-empty" style="float:right;">Vuoto</span>'}</div>`;
                    }
                    else displayVal = `<div style="text-align:right;">${val || '<span class="adv-select-empty" style="float:right;">Vuoto</span>'}</div>`;
                }
            }

            const isLongText = (col.type === 'text' && val && (val.length > 50 || val.includes('\n'))) || (col.type === 'relation_backlink' && col.backlinkDisplay === 'property');

            let labelStyle = isLongText
                ? "font-weight:bold; color:var(--text-secondary); font-size:0.8rem; text-transform:uppercase; width:100%; margin-bottom:4px;"
                : "font-weight:bold; color:var(--text-secondary); font-size:0.8rem; text-transform:uppercase; flex: 0 0 35%;";
            
            if (isEdit && !isSysNoteLink) {
                labelStyle += " cursor:pointer;";
            }

            const labelId = `drawer-prop-${col.id}`;
            const clickMenu = isEdit && !isSysNoteLink ? `id="${labelId}" onclick="AdvancedTableColumnMenus.openColMenu(event, '${tableId}', '${col.id}')" title="Rinomina / Opzioni Proprietà"` : '';

            // FIX ETICHETTA NASCOSTA: Basata sul reale stato visivo per non confondere l'utente.
            html += `
                <div style="display:flex; ${isLongText ? 'flex-direction:column; align-items:flex-start;' : 'align-items:center;'} gap:6px; padding: 10px; border-bottom: 1px solid var(--border-color); background: var(--bg-color); border-radius: 6px;">
                    <div style="${labelStyle}" ${clickMenu}>${col.name} ${isColCurrentlyHidden ? '<span style="opacity:0.5; font-weight:normal; text-transform:none;">(Nascosta)</span>' : ''}</div>
                    <div style="${isLongText ? 'width:100%; box-sizing:border-box;' : 'flex:1; display:flex; justify-content:flex-end;'}">${displayVal}</div>
                </div>
            `;
        });

        if (isEdit) {
            html += `<div style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed var(--border-color); display: flex; justify-content: space-between;">`;
            
            if (isSysDB) {
                const activeAutos = (state.automations || []).filter(a => a.active).length;
                html += `
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <button class="adv-add-btn" id="btn_sys_add_prop" style="border: 1px solid var(--border-color); background: var(--bg-color);" onclick="AdvancedTableColumnMenus.openAddColumnMenu(event, '${tableId}')">
                            <span style="margin-right:5px; display:inline-flex;">${Icons.plus}</span> Nuova Proprietà
                        </button>
                        <button class="adv-add-btn" style="border: 1px solid var(--border-color); background: var(--bg-color); color: var(--accent-color);" onclick="AdvancedAutomations.openPanel(event, '${tableId}')">
                            <span style="margin-right:5px; display:inline-flex;">${Icons.lightning}</span> Automazioni (${activeAutos})
                        </button>
                    </div>
                `;
            } else {
                html += `<div style="display:flex; gap:10px;">`;
                
                // Se il record viene aperto a partire da una Relazione in un'altra riga,
                // offriamo il bottone "Scollega Record" invece del pericoloso "Elimina Definitivamente".
                if (relationCtx) {
                    const ctxStr = `'${relationCtx.srcTable}', '${relationCtx.srcRow}', '${relationCtx.srcCol}', '${rowId}', ${relationCtx.isBacklink}`;
                    html += `
                        <button class="adv-add-btn" style="border: 1px solid var(--border-color); background: var(--bg-color);" onclick="AdvancedTable.unlinkRelation(${ctxStr})">
                            <span style="margin-right:5px; display:inline-flex;">${Icons.close}</span> Scollega Record
                        </button>
                    `;
                }
                html += `</div>`;

                html += `
                    <button class="adv-add-btn danger" style="border: 1px solid var(--danger-color); background: rgba(239, 68, 68, 0.05);" onclick="AdvancedTable.deleteRecord('${tableId}', '${rowId}')">
                        <span style="margin-right:5px; display:inline-flex;">${Icons.trash}</span> Elimina Definitivamente il Record
                    </button>
                `;
            }
            html += `</div>`;
        }

        html += '</div>';

        const titlePrefix = isSysDB ? '🏷️ Tag e Proprietà Pagina' : '📄 Dettaglio Record';
        UI.openDrawer(titlePrefix, html, null);

        setTimeout(() => {
            const el = document.getElementById(tableId);
            // il test sul fatto che sia una function serve per poter richiamare la funzione anche quando la si invoca dall'applicazione/estensione Workflow
            if (el && typeof AdvancedTable.renderTable === 'function') {
                AdvancedTable.renderTable(tableId);
            }
        }, 50);
    }
});

// Listener Evento BACK di ritorno da un Sottomenu del Drawer
document.addEventListener('drawer-restored', (e) => {
    const titleText = e.detail.titleText || '';
    if (titleText.includes('Dettaglio Record') || titleText.includes('Tag e Proprietà')) {
        if (AdvancedTable.activeTableId && AdvancedTable.activeRecordId) {
            AdvancedTable.openRecordView(AdvancedTable.activeTableId, AdvancedTable.activeRecordId);
        }
    }
});