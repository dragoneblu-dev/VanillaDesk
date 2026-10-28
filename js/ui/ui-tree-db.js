/**
 * ui-tree-db.js
 * Sottomodulo di UI dedicato alla generazione dei nodi virtuali dei Database,
 * delle Viste collegate (Kanban, Calendario, Timeline, WBS, Pivot, Grafici),
 * delle Barre Pulsanti Macro e dei relativi Tooltip statistici per la sidebar.
 */

Object.assign(UI, {

    _formatBytes: (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024; const dm = 1; const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },

    _positionCustomTooltip: (e, tooltip) => {
        const rect = e.currentTarget.getBoundingClientRect();
        let topPos = rect.top;
        let leftPos = rect.right + 10;

        tooltip.style.cssText = `display: block !important; height: auto !important; min-height: 0 !important; max-height: none !important; padding: 8px 12px !important; box-sizing: border-box !important; width: max-content !important; min-width: 180px !important; max-width: 290px !important; position: fixed !important; top: ${topPos}px !important; left: ${leftPos}px !important; opacity: 1 !important; z-index: 100000 !important; pointer-events: none !important; line-height: 1.4 !important;`;

        if (topPos + tooltip.offsetHeight > window.innerHeight) {
            topPos = window.innerHeight - tooltip.offsetHeight - 10;
            tooltip.style.top = topPos + 'px';
        }
        if (leftPos + tooltip.offsetWidth > window.innerWidth) {
            leftPos = rect.left - tooltip.offsetWidth - 10;
            tooltip.style.left = leftPos + 'px';
        }
    },

    _showDbTooltip: (dbId, dbState, e) => {
        const tooltip = document.getElementById('advCustomTooltip');
        if (!tooltip) return;

        let parentNoteName = "Nota Sconosciuta / Orfano";
        for (let n of AppState.notes) {
            if (n.content && n.content.includes(dbId)) {
                parentNoteName = n.title || I18n.t('editor.untitled');
                break;
            }
        }

        const isJournal = dbState.title === 'Diario/Log' || dbState.title === 'Diario / Log' || dbId.includes('adv_journal_');
        
        let statsHTML = '';
        if (isJournal) {
            const entries = dbState.entries || [];
            const total = entries.length;
            const open = entries.filter(ent => !ent.endTime).length;
            
            statsHTML = `<div style="display:flex; flex-direction:column; gap:2px; margin-top:4px; padding-top:4px; border-top:1px solid var(--border-color); font-size:0.8rem;"><div style="display:flex; justify-content:space-between; gap:16px;"><span>Totale Voci:</span> <b>${total}</b></div><div style="display:flex; justify-content:space-between; gap:16px;"><span>Da Completare:</span> <b style="${open > 0 ? 'color:var(--danger-color);' : ''}">${open}</b></div></div>`;
        } else {
            let activeAutos = (dbState.automations || []).filter(a => a.active).length;
            let recordNotesCount = AppState.notes.filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === dbId).length;
            let savedFiltersCount = (dbState.savedFilters || []).length;

            // Rilevamento Relazioni con altri Database (Dipendenze RDBMS esterne)
            let externalRelDbNames = [];
            if (Array.isArray(dbState.columns) && AppState.databases) {
                dbState.columns.forEach(col => {
                    if (col.type === 'relation' && col.targetTableId && col.targetTableId !== dbId && col.targetTableId !== 'SYS_PROPERTIES_DB') {
                        const targetDb = AppState.databases[col.targetTableId];
                        const tTitle = targetDb ? (targetDb.title || 'Database') : 'Altro DB';
                        if (!externalRelDbNames.includes(tTitle)) {
                            externalRelDbNames.push(tTitle);
                        }
                    }
                });
            }

            // Calcolo Data dell'ultimo record modificato / aggiornato
            let maxActivityTs = 0;
            if (Array.isArray(dbState.rows)) {
                dbState.rows.forEach(r => {
                    const ts = Math.max(r.updatedAt || 0, r.createdAt || 0);
                    if (ts > maxActivityTs) maxActivityTs = ts;
                });
            }
            const lastActivityFormatted = maxActivityTs > 0 ? UI.formatDate(maxActivityTs) : '';

            const recNotesRow = recordNotesCount > 0 ? `<div style="display:flex; justify-content:space-between; gap:16px; align-items:center;"><span>Note collegate (<span style="display:inline-flex; align-items:center; color:var(--record-color); width:12px; height:12px;">${Icons.recordPage}</span>):</span> <b style="color:var(--record-color);">${recordNotesCount}</b></div>` : '';
            const savedFiltersRow = savedFiltersCount > 0 ? `<div style="display:flex; justify-content:space-between; gap:16px; align-items:center;"><span>Filtri salvati (<span style="display:inline-flex; align-items:center; color:var(--accent-color); width:12px; height:12px;">${Icons.bookmark}</span>):</span> <b>${savedFiltersCount}</b></div>` : '';
            const extRelsRow = externalRelDbNames.length > 0 ? `<div style="display:flex; justify-content:space-between; gap:16px; align-items:center;"><span>Relazioni (<span style="display:inline-flex; align-items:center; color:var(--accent-color); width:12px; height:12px;">${Icons.relation}</span>):</span> <b style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px; text-align:right;">${UI.escapeHTML(externalRelDbNames.join(', '))}</b></div>` : '';
            const lastActivityRow = lastActivityFormatted ? `<div style="display:flex; justify-content:space-between; gap:16px;"><span>Ultima attività:</span> <b>${lastActivityFormatted}</b></div>` : '';

            statsHTML = `<div style="display:flex; flex-direction:column; gap:2px; margin-top:4px; padding-top:4px; border-top:1px solid var(--border-color); font-size:0.8rem;"><div style="display:flex; justify-content:space-between; gap:16px;"><span>Record:</span> <b>${(dbState.rows || []).length}</b></div>${recNotesRow}<div style="display:flex; justify-content:space-between; gap:16px;"><span>Colonne:</span> <b>${(dbState.columns || []).length}</b></div>${extRelsRow}${savedFiltersRow}<div style="display:flex; justify-content:space-between; align-items:center;"><span>Regole (<span style="display:inline-flex; align-items:center; color:var(--tx-c4); width:12px; height:12px;">${Icons.lightning}</span>):</span> <b>${activeAutos}</b></div>${lastActivityRow}</div>`;
        }

        const sizeKb = UI._formatBytes(JSON.stringify(dbState).length);

        // Struttura HTML compatta e lineare con white-space: normal per evitare espansioni anomale da white-space: pre-wrap
        const html = `<div style="width: max-content; min-width: 200px; padding: 2px; white-space: normal;"><div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px; display:flex; align-items:center; gap:5px;"><span style="opacity:0.7; display:inline-flex; width:14px; justify-content:center;">${Icons.file}</span> in: <b>${parentNoteName}</b></div>${statsHTML}<div style="margin-top:4px; font-size:0.75rem; color:var(--text-secondary); text-align:right;"><span style="opacity:0.5;">Peso: ${sizeKb}</span></div></div>`;

        tooltip.innerHTML = html;
        UI._positionCustomTooltip(e, tooltip);
    },

    _showViewTooltip: (viewId, viewState, sourceDbState, e) => {
        const tooltip = document.getElementById('advCustomTooltip');
        if (!tooltip) return;

        let parentNoteName = "Nota Sconosciuta / Orfano";
        for (let n of AppState.notes) {
            if (n.content && n.content.includes(viewId)) {
                parentNoteName = n.title || I18n.t('editor.untitled');
                break;
            }
        }

        const isPivot = !!viewState.isPivot;
        const isChart = isPivot && !!(viewState.chartConfig && viewState.chartConfig.visible);
        const vType = viewState.viewType || 'table';

        let viewTypeName = "Vista Tabella";
        if (isChart) {
            const chartType = viewState.chartConfig?.type || 'bar';
            viewTypeName = `Grafico (${chartType.toUpperCase()})`;
        } else if (isPivot) {
            viewTypeName = "Tabella Pivot";
        } else if (vType === 'board') {
            viewTypeName = "Bacheca Kanban";
        } else if (vType === 'calendar') {
            viewTypeName = "Calendario";
        } else if (vType === 'timeline') {
            viewTypeName = "Timeline";
        }

        const html = `<div style="width: max-content; min-width: 190px; padding: 2px; white-space: normal;">
                    <div style="font-size:0.85rem; font-weight:bold; color:var(--view-color); margin-bottom:4px;">${UI.escapeHTML(viewState.title || viewTypeName)}</div>
                    <div style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:4px; display:flex; align-items:center; gap:5px;"><span style="opacity:0.7; display:inline-flex; width:14px; justify-content:center;">${Icons.file}</span> in: <b>${parentNoteName}</b></div></div>`;

        tooltip.innerHTML = html;
        UI._positionCustomTooltip(e, tooltip);
    },

    _showButtonBarTooltip: (barId, barState, targetDbState, e) => {
        const tooltip = document.getElementById('advCustomTooltip');
        if (!tooltip) return;

        let parentNoteName = "Nota Sconosciuta / Orfano";
        for (let n of AppState.notes) {
            if (n.content && n.content.includes(barId)) {
                parentNoteName = n.title || I18n.t('editor.untitled');
                break;
            }
        }

        let btnLabels = [];
        if (Array.isArray(barState.buttons)) {
            btnLabels = barState.buttons.map(b => b.label || 'Pulsante');
        }

        //const targetTitle = targetDbState ? (targetDbState.title || 'Database') : 'Database';
        const btnsList = btnLabels.length > 0 ? btnLabels.map(l => `• ${UI.escapeHTML(l)}`).join('<br>') : 'Nessun pulsante configurato';

        const html = `<div style="width: max-content; min-width: 200px; padding: 2px; white-space: normal;"><div style="font-size:0.85rem; font-weight:bold; color:var(--tx-c4); margin-bottom:4px; display:flex; align-items:center; gap:4px;">${Icons.lightning} Barra Pulsanti Macro</div>
                    <div style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:4px; display:flex; align-items:center; gap:5px;"><span style="opacity:0.7; display:inline-flex; width:14px; justify-content:center;">${Icons.file}</span> in: <b>${parentNoteName}</b></div>
                    <div style="display:flex; flex-direction:column; gap:3px; margin-top:4px; padding-top:4px; border-top:1px solid var(--border-color); font-size:0.8rem;">Pulsanti:<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px; line-height:1.4;">${btnsList}</div></div></div>`;

        tooltip.innerHTML = html;
        UI._positionCustomTooltip(e, tooltip);
    },

    buildDatabaseVirtualTreeElement: (dbId, dbState, dbNotes, forceExpandForActiveNote = false, isExplicitDbMode = false) => {
        const filter = AppState.searchFilter ? AppState.searchFilter.toLowerCase() : null;
        const activePropFilters = AppState.activePropertyFilters || [];
        const reqBook = AppState.showBookmarksInTree;
        const reqFav = AppState.showFavoritesInTree;
        const isFiltering = filter || reqBook || reqFav || activePropFilters.length > 0;

        let dbTitleMatch = false;
        if (filter && dbState.title && dbState.title.toLowerCase().includes(filter)) {
            dbTitleMatch = true;
        }

        let childElements = [];
        let hasMatchChild = false;
        let forceExpandBecauseOfMatch = false;

        // SEZIONE DATABASE: Mantiene le viste collegate, le tabelle pivot e i pulsanti macro associati a questo database
        if (isExplicitDbMode && (!isFiltering || dbTitleMatch)) {
            const depDbIds = Object.keys(AppState.databases).sort((a, b) => {
                const titleA = AppState.databases[a]?.title || '';
                const titleB = AppState.databases[b]?.title || '';
                return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
            });

            depDbIds.forEach(depId => {
                const depState = AppState.databases[depId];
                if (!depState) return;

                if ((depState.isPivot || depState.isLinkedView) && depState.sourceTableId === dbId) {
                    let viewIcon = Icons.tableDatabase;
                    if (depState.isPivot) {
                        viewIcon = depState.chartConfig?.visible ? Icons.data : Icons.tablePivot;
                    } else {
                        if (depState.viewType === 'board') viewIcon = Icons.viewBoard;
                        else if (depState.viewType === 'calendar') viewIcon = Icons.viewCalendar;
                        else if (depState.viewType === 'timeline') viewIcon = Icons.viewTimeline;
                        else viewIcon = Icons.link;
                    }

                    const viewEl = document.createElement('div'); 
                    viewEl.className = 'node-wrapper';
                    viewEl.dataset.id = depId;

                    const viewContent = document.createElement('div'); 
                    viewContent.className = 'node-content db-view-node';
                    if (AppState.currentNoteId === depId) viewContent.classList.add('active');

                    viewContent.innerHTML = `<div class="toggle-btn" style="width:20px; display:flex; justify-content:center; align-items:center; cursor:default;"><span style="opacity:0.3; font-size:18px;">•</span></div><span class="node-title"><span style="color:var(--view-color); opacity:0.8;">${viewIcon}</span> <span>${depState.title || 'Vista'}</span></span>`;
                    
                    viewContent.onmouseenter = (e) => UI._showViewTooltip(depId, depState, dbState, e);
                    viewContent.onmouseleave = (e) => {
                        if (e.relatedTarget && viewContent.contains(e.relatedTarget)) return;
                        const tooltip = document.getElementById('advCustomTooltip');
                        if (tooltip) tooltip.style.opacity = '0';
                    };

                    viewContent.onclick = (e) => { e.stopPropagation(); UI.jumpToWidget(depId); };
                    viewEl.appendChild(viewContent);
                    childElements.push(viewEl);
                }

                if (depId.includes('adv_btnbar_') && depState.buttons) {
                    let operatesOnThis = false;
                    depState.buttons.forEach(b => {
                        if (b.actionBlocks && b.actionBlocks.some(blk => blk.targetDbId === dbId)) { 
                            operatesOnThis = true; 
                        }
                    });

                    if (operatesOnThis) {
                        const btnEl = document.createElement('div'); 
                        btnEl.className = 'node-wrapper';
                        btnEl.dataset.id = depId;

                        const btnContent = document.createElement('div'); 
                        btnContent.className = 'node-content db-view-node';
                        if (AppState.currentNoteId === depId) btnContent.classList.add('active');

                        btnContent.innerHTML = `<div class="toggle-btn" style="width:20px; display:flex; justify-content:center; align-items:center; cursor:default;"><span style="opacity:0.3; font-size:18px;">•</span></div><span class="node-title"><span style="color:var(--tx-c4); opacity:0.8;">${Icons.lightning}</span> <span>Barra Pulsanti</span></span>`;
                        
                        btnContent.onmouseenter = (e) => UI._showButtonBarTooltip(depId, depState, dbState, e);
                        btnContent.onmouseleave = (e) => {
                            if (e.relatedTarget && btnContent.contains(e.relatedTarget)) return;
                            const tooltip = document.getElementById('advCustomTooltip');
                            if (tooltip) tooltip.style.opacity = '0';
                        };

                        btnContent.onclick = (e) => { e.stopPropagation(); UI.jumpToWidget(depId); };
                        btnEl.appendChild(btnContent);
                        childElements.push(btnEl);
                    }
                }
            });
        }

        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];

        // Ordinamento alfabetico naturale delle note-record per facilitare la scansione visiva
        const sortedDbNotes = [...dbNotes].sort((a, b) => 
            (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' })
        );

        // SEZIONE DEDICATA AI DATABASE (isExplicitDbMode): Non elenca le singole note, ma ne calcola il match per la ricerca
        if (isExplicitDbMode) {
            sortedDbNotes.forEach(note => {
                let noteDirectMatch = true;

                if (activePropFilters.length > 0) {
                    if (!propsDb || !Array.isArray(propsDb.rows)) {
                        noteDirectMatch = activePropFilters.every(f => f.realValue === '*EMPTY*');
                    } else {
                        const sysRow = propsDb.rows.find(r => r && r.cells && r.cells['sys_c_note'] === note.id);
                        noteDirectMatch = UI._checkNotePropertyMatch(sysRow, activePropFilters);
                    }
                }

                if (noteDirectMatch && filter) {
                    const matchTitle = (note.title || "").toLowerCase().includes(filter);
                    const matchContent = UI.extractSearchableText(note.content).toLowerCase().includes(filter);
                    if (!matchTitle && !matchContent) noteDirectMatch = false;

                    if (noteDirectMatch) {
                        if (matchTitle) {
                            let idx = (note.title || "").toLowerCase().indexOf(filter);
                            while (idx !== -1) { AppState._globalHighlights++; idx = (note.title || "").toLowerCase().indexOf(filter, idx + filter.length); }
                        }
                        if (matchContent) {
                            let text = UI.extractSearchableText(note.content).toLowerCase();
                            let idx = text.indexOf(filter);
                            while (idx !== -1) { AppState._globalHighlights++; idx = text.indexOf(filter, idx + filter.length); }
                        }
                    }
                }
                if (noteDirectMatch && reqBook) {
                    if (!(note.content && note.content.includes('adv-bookmark-marker'))) noteDirectMatch = false;
                }
                if (noteDirectMatch && reqFav) {
                    if (!note.isMarked) noteDirectMatch = false;
                }

                if (noteDirectMatch) {
                    hasMatchChild = true;
                    if (isFiltering) forceExpandBecauseOfMatch = true;
                }
            });
        } else {
            // Modalità non esplicita (es. rami di navigazione nel tab Note per la nota attiva aperta)
            sortedDbNotes.forEach(note => {
                let noteDirectMatch = true;

                if (activePropFilters.length > 0) {
                    if (!propsDb || !Array.isArray(propsDb.rows)) {
                        noteDirectMatch = activePropFilters.every(f => f.realValue === '*EMPTY*');
                    } else {
                        const sysRow = propsDb.rows.find(r => r && r.cells && r.cells['sys_c_note'] === note.id);
                        noteDirectMatch = UI._checkNotePropertyMatch(sysRow, activePropFilters);
                    }
                }

                if (noteDirectMatch && filter) {
                    const matchTitle = (note.title || "").toLowerCase().includes(filter);
                    const matchContent = UI.extractSearchableText(note.content).toLowerCase().includes(filter);
                    if (!matchTitle && !matchContent) noteDirectMatch = false;

                    if (noteDirectMatch) {
                        if (matchTitle) {
                            let idx = (note.title || "").toLowerCase().indexOf(filter);
                            while (idx !== -1) { AppState._globalHighlights++; idx = (note.title || "").toLowerCase().indexOf(filter, idx + filter.length); }
                        }
                        if (matchContent) {
                            let text = UI.extractSearchableText(note.content).toLowerCase();
                            let idx = text.indexOf(filter);
                            while (idx !== -1) { AppState._globalHighlights++; idx = text.indexOf(filter, idx + filter.length); }
                        }
                    }
                }
                if (noteDirectMatch && reqBook) {
                    if (!(note.content && note.content.includes('adv-bookmark-marker'))) noteDirectMatch = false;
                }
                if (noteDirectMatch && reqFav) {
                    if (!note.isMarked) noteDirectMatch = false;
                }

                const isActivePath = AppState.currentNoteId === note.id || UI.isDescendant(note.id, AppState.currentNoteId);
                const shouldRender = (isFiltering && noteDirectMatch) || (forceExpandForActiveNote && isActivePath);

                if (shouldRender) {
                    const noteEl = UI.buildTreeElement(note, true);
                    if (noteEl) {
                        childElements.push(noteEl);
                        hasMatchChild = true;
                        if (isFiltering && noteDirectMatch) forceExpandBecauseOfMatch = true;
                    }
                }
            });
        }

        if (isFiltering) {
            if (!dbTitleMatch && !hasMatchChild) {
                return null; 
            }
        } else if (!isExplicitDbMode && !forceExpandForActiveNote) {
            return null; 
        }

        const wrapper = document.createElement('div'); 
        wrapper.className = 'node-wrapper';
        wrapper.dataset.id = dbId;
        
        const content = document.createElement('div'); 
        content.className = 'node-content';

        // GHOST DETERMINATION: Nella visualizzazione dedicata ai Database, il DB è un elemento primario solido.
        const isGhost = isExplicitDbMode 
            ? (isFiltering && !dbTitleMatch && hasMatchChild)
            : true;

        if (isGhost) content.classList.add('tree-ghost-node');
        if (AppState.currentNoteId === dbId) content.classList.add('active');

        const toggle = document.createElement('div');
        toggle.className = 'toggle-btn';
        
        if (childElements.length > 0) {
            if (dbState.expandedInTree || forceExpandBecauseOfMatch || forceExpandForActiveNote) toggle.classList.add('expanded');
            toggle.innerHTML = Icons.chevronRight;
            toggle.onclick = (e) => {
                e.stopPropagation();
                dbState.expandedInTree = !dbState.expandedInTree;
                UI.renderTree();
            };
        } else {
            toggle.innerHTML = `<span style="opacity:0.3; font-size:18px;">•</span>`;
            toggle.style.cursor = 'default';
        }

        const isJournal = dbState.title === 'Diario/Log' || dbState.title === 'Diario / Log' || dbId.includes('adv_journal_');
        const defaultTitle = isJournal ? 'Diario / Log' : 'Database';
        const iconHtml = isJournal ? Icons.journal : Icons.tableDatabase;
        
        // Icona solida con colore d'accento nella vista Database
        const iconStyle = (isExplicitDbMode && !isGhost) 
            ? 'color:var(--accent-color);' 
            : 'opacity:0.6; color:var(--text-secondary);';

        const title = document.createElement('span');
        title.className = 'node-title';

        title.innerHTML = `<span style="${iconStyle}">${iconHtml}</span> <span>${dbState.title || defaultTitle}</span>`;

        content.onclick = (e) => {
            if (!e.target.closest('.toggle-btn')) {
                UI.jumpToWidget(dbId);
            }
        };

        content.onmouseenter = (e) => UI._showDbTooltip(dbId, dbState, e);
        content.onmouseleave = (e) => {
            // Spegne il tooltip solo se il cursore esce realmente dall'intero nodo .node-content
            if (e.relatedTarget && content.contains(e.relatedTarget)) return;
            const tooltip = document.getElementById('advCustomTooltip');
            if (tooltip) tooltip.style.opacity = '0';
        };

        content.append(toggle, title);
        wrapper.appendChild(content);

        if (childElements.length > 0 && (dbState.expandedInTree || forceExpandBecauseOfMatch || forceExpandForActiveNote)) {
            const block = document.createElement('div');
            block.className = 'children-block expanded';
            const blockInner = document.createElement('div');
            blockInner.className = 'children-block-inner';
            childElements.forEach(c => blockInner.appendChild(c));
            block.appendChild(blockInner);
            wrapper.appendChild(block);
        }

        return wrapper;
    }
});