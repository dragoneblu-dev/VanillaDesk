/**
 * ui-tree.js
 * Modulo dedicato al DOM dell'albero gerarchico laterale e Drag&Drop delle Note.
 * Rendering reattivo e isolato dei tempi residui per i segnalibri temporizzati.
 * Integrazione visiva della nuvoletta per i segnalibri provvisti di note/commenti.
 * Tracciamento dello stato dirty su spostamento e riordino delle note nell'albero.
 */

Object.assign(UI, {

    _updateTabsUI: (mode) => {
        ['notes', 'favorites', 'bookmarks', 'databases'].forEach(t => {
            const btn = document.getElementById('tab-' + t);
            if (btn) {
                if (t === mode) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });
    },

    switchToNotes: () => {
        AppState.showFavoritesInTree = false;
        AppState.showBookmarksInTree = false;
        AppState.showDbNotesInTree = false;
        UI._updateTabsUI('notes');
        UI.renderTree();
        if (AppState.searchFilter || (AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0)) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.dispatchEvent(new Event('input'));
        }
    },

    toggleFavoritesInTree: () => {
        AppState.showFavoritesInTree = true;
        AppState.showBookmarksInTree = false;
        AppState.showDbNotesInTree = false;
        UI._updateTabsUI('favorites');
        UI.renderTree();
        if (AppState.searchFilter || (AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0)) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.dispatchEvent(new Event('input'));
        }
    },

    toggleBookmarksInTree: () => {
        AppState.showBookmarksInTree = true;
        AppState.showFavoritesInTree = false;
        AppState.showDbNotesInTree = false;
        UI._updateTabsUI('bookmarks');
        UI.renderTree();
        if (AppState.searchFilter || (AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0)) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.dispatchEvent(new Event('input'));
        }
    },

    toggleDbNotesInTree: () => {
        AppState.showDbNotesInTree = true;
        AppState.showFavoritesInTree = false;
        AppState.showBookmarksInTree = false;
        UI._updateTabsUI('databases');
        UI.renderTree();
        if (AppState.searchFilter || (AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0)) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.dispatchEvent(new Event('input'));
        }
    },

    renderTree: () => {
        const container = document.getElementById('treeContainer');
        if (!container) return;
        container.innerHTML = "";
        
        AppState._globalHighlights = 0;

        const hasFilterText = AppState.searchFilter && AppState.searchFilter.length > 0;
        const hasFilterProp = AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0;
        const reqBook = AppState.showBookmarksInTree;
        const reqFav = AppState.showFavoritesInTree;
        const isFiltering = hasFilterText || hasFilterProp || reqBook || reqFav;

        // 1. Modalità Esplicita Database
        if (AppState.showDbNotesInTree) {
            if (AppState.databases) {
                Object.keys(AppState.databases).forEach(dbId => {
                    const dbState = AppState.databases[dbId];
                    const isCodeOrBtn = dbId.includes('adv_code_') || dbId.includes('adv_btnbar_') || dbId.includes('adv_cols_');
                    const isPivotOrLink = dbState && (dbState.isPivot || dbState.isLinkedView);

                    if (dbState && !isCodeOrBtn && !isPivotOrLink && dbId !== 'SYS_PROPERTIES_DB') {
                        const dbNotes = AppState.notes.filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === dbId);
                        const el = UI.buildDatabaseVirtualTreeElement(dbId, dbState, dbNotes, false, true);
                        if (el) container.appendChild(el);
                    }
                });
            }
        } 
        // 2. Modalità Struttura Classica
        else {
            const roots = Store.getChildren(null).filter(n => !n.isRecordNote);
            roots.forEach(node => { 
                const el = UI.buildTreeElement(node); 
                if (el) container.appendChild(el); 
            });

            if (!isFiltering) {
                let forceDbRenderId = null;
                if (AppState.currentNoteId) {
                    let n = Store.getNote(AppState.currentNoteId);
                    while (n) {
                        if (n.isRecordNote && n.linkedTableId && n.linkedTableId !== 'SYS_PROPERTIES_DB') {
                            forceDbRenderId = n.linkedTableId;
                            break;
                        }
                        n = n.parentId ? Store.getNote(n.parentId) : null;
                    }
                }

                if (forceDbRenderId && AppState.databases[forceDbRenderId]) {
                    const dbState = AppState.databases[forceDbRenderId];
                    const dbNotes = AppState.notes.filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === forceDbRenderId);
                    
                    const el = UI.buildDatabaseVirtualTreeElement(forceDbRenderId, dbState, dbNotes, true, false);
                    if (el) {
                        const sep = document.createElement('div');
                        sep.style.cssText = "height: 1px; background: var(--border-color); margin: 15px 10px; opacity: 0.5;";
                        container.appendChild(sep);
                        container.appendChild(el);
                    }
                }
            }
        }
    },

    _formatBytes: (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024; const dm = 1; const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },

    _showDbTooltip: (dbId, dbState, e) => {
        const tooltip = document.getElementById('advCustomTooltip');
        if (!tooltip) return;

        let parentNoteName = "Nota Sconosciuta / Orfano";
        for (let n of AppState.notes) {
            if (n.content && n.content.includes(dbId)) {
                parentNoteName = n.title || 'Senza Titolo';
                break;
            }
        }

        const isJournal = dbState.title === 'Diario/Log' || dbState.title === 'Diario / Log' || dbId.includes('adv_journal_');
        
        let statsHTML = '';
        if (isJournal) {
            const entries = dbState.entries || [];
            const total = entries.length;
            const open = entries.filter(ent => !ent.endTime).length;
            
            statsHTML = `<div style="display:flex; flex-direction:column; gap:2px; margin-top:4px; padding-top:4px; border-top:1px solid var(--border-color);"><div style="display:flex; justify-content:space-between;"><span>Totale Voci:</span> <b>${total}</b></div><div style="display:flex; justify-content:space-between;"><span>Da Completare:</span> <b style="${open > 0 ? 'color:var(--danger-color);' : ''}">${open}</b></div></div>`;
        } else {
            let activeAutos = (dbState.automations || []).filter(a => a.active).length;
            statsHTML = `<div style="display:flex; flex-direction:column; gap:2px; margin-top:4px; padding-top:4px; border-top:1px solid var(--border-color);"><div style="display:flex; justify-content:space-between;"><span>Record:</span> <b>${(dbState.rows || []).length}</b></div><div style="display:flex; justify-content:space-between;"><span>Colonne:</span> <b>${(dbState.columns || []).length}</b></div><div style="display:flex; justify-content:space-between; align-items:center;"><span>Regole (<span style="display:inline-flex; align-items:center; color:var(--tx-c4); width:12px; height:12px;">${Icons.lightning}</span>):</span> <b>${activeAutos}</b></div></div>`;
        }

        const sizeKb = UI._formatBytes(JSON.stringify(dbState).length);

        const html = `<div style="width: max-content; min-width: 200px; padding: 2px;"><div style="margin-bottom:4px; font-size:1.05em;"><b style="color:var(--accent-color);">${dbState.title || (isJournal ? 'Diario / Log' : 'Database')}</b></div><div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px; display:flex; align-items:center; gap:5px;"><span style="opacity:0.7; display:inline-flex; width:14px; justify-content:center;">${Icons.file}</span> <b>${parentNoteName}</b></div>${statsHTML}<div style="margin-top:4px; font-size:0.75rem; color:var(--text-secondary); text-align:right;"><span style="opacity:0.5;">Peso: ${sizeKb}</span></div></div>`;

        tooltip.innerHTML = html;
        tooltip.style.opacity = '1';
        
        const rect = e.currentTarget.getBoundingClientRect();
        let topPos = rect.top;
        let leftPos = rect.right + 10;

        if (topPos + tooltip.offsetHeight > window.innerHeight) topPos = window.innerHeight - tooltip.offsetHeight - 10;
        if (leftPos + tooltip.offsetWidth > window.innerWidth) leftPos = rect.left - tooltip.offsetWidth - 10;

        tooltip.style.top = topPos + 'px';
        tooltip.style.left = leftPos + 'px';
    },

    extractSearchableText: (htmlContent) => {
        if (!htmlContent) return "";
        const temp = document.createElement('div');
        temp.innerHTML = htmlContent;

        let pureText = temp.textContent || temp.innerText || "";
        
        temp.querySelectorAll('.inline-note-data, .bookmark-comment-data').forEach(el => {
            pureText += " " + (el.innerHTML || "");
        });
        
        temp.querySelectorAll('.inline-note-marker[data-tooltip], .adv-bookmark-marker[data-tooltip]').forEach(el => {
            pureText += " " + (el.getAttribute('data-tooltip') || "");
        });
        
        temp.querySelectorAll('a[data-link-note]').forEach(el => {
            pureText += " " + (el.getAttribute('data-link-note') || "");
        });

        // ESTRAZIONE CONTENUTO BLOCCHI DI CODICE (Sia montati che deidratati in AppState.databases)
        temp.querySelectorAll('[id^="adv_code_"], .code-wrapper, [data-widget-type="code"]').forEach(el => {
            const pre = el.querySelector('pre');
            if (pre && pre.textContent.trim()) {
                pureText += " " + pre.textContent;
            } else if (el.id && AppState.databases) {
                const trueId = el.id.split('_cited_')[0];
                const codeState = AppState.databases[trueId];
                if (codeState) {
                    if (codeState.content) pureText += " " + codeState.content;
                    if (codeState.title) pureText += " " + codeState.title;
                }
            }
        });

        // Controllo aggiuntivo per identificatori di blocchi codice tramite Regex nel markup
        if (AppState.databases) {
            const codeRegex = /id=["'](adv_code_[^"']+)["']/g;
            let match;
            while ((match = codeRegex.exec(htmlContent)) !== null) {
                const trueId = match[1].split('_cited_')[0];
                const codeState = AppState.databases[trueId];
                if (codeState) {
                    if (codeState.content && !pureText.includes(codeState.content)) {
                        pureText += " " + codeState.content;
                    }
                    if (codeState.title && !pureText.includes(codeState.title)) {
                        pureText += " " + codeState.title;
                    }
                }
            }
        }

        // ESTRAZIONE CONTENUTO DIARI / LOG
        temp.querySelectorAll('[id^="adv_journal_"], .adv-journal-wrapper, [data-widget-type="journal"]').forEach(el => {
            if (el.id && AppState.databases) {
                const trueId = el.id.split('_cited_')[0];
                const jState = AppState.databases[trueId];
                if (jState && jState.entries) {
                    jState.entries.forEach(entry => {
                        if (entry.content) {
                            pureText += " " + entry.content.replace(/<[^>]*>?/gm, '');
                        }
                    });
                }
            }
        });

        return pureText;
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

        if (isExplicitDbMode && (!isFiltering || dbTitleMatch)) {
            Object.keys(AppState.databases).forEach(depId => {
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

                    const viewEl = document.createElement('div'); viewEl.className = 'node-wrapper';
                    const viewContent = document.createElement('div'); viewContent.className = 'node-content db-view-node';
                    viewContent.innerHTML = `<div class="toggle-btn" style="width:20px; display:flex; justify-content:center; align-items:center; cursor:default;"><span style="opacity:0.3; font-size:18px;">•</span></div><span class="node-title"><span style="color:var(--view-color); opacity:0.8;">${viewIcon}</span> <span>${depState.title || 'Vista'}</span></span>`;
                    viewContent.onclick = (e) => { e.stopPropagation(); UI.jumpToWidget(depId); };
                    viewEl.appendChild(viewContent);
                    childElements.push(viewEl);
                }

                if (depId.includes('adv_btnbar_') && depState.buttons) {
                    let operatesOnThis = false;
                    let btnNames = [];
                    depState.buttons.forEach(b => {
                        if (b.actionBlocks && b.actionBlocks.some(blk => blk.targetDbId === dbId)) { 
                            operatesOnThis = true; btnNames.push(b.label || 'Pulsante'); 
                        }
                    });

                    if (operatesOnThis) {
                        const btnEl = document.createElement('div'); btnEl.className = 'node-wrapper';
                        const btnContent = document.createElement('div'); btnContent.className = 'node-content db-view-node';
                        btnContent.innerHTML = `<div class="toggle-btn" style="width:20px; display:flex; justify-content:center; align-items:center; cursor:default;"><span style="opacity:0.3; font-size:18px;">•</span></div><span class="node-title" title="Contiene: ${btnNames.join(', ')}"><span style="color:var(--tx-c4); opacity:0.8;">${Icons.lightning}</span> <span>Barra Pulsanti</span></span></span>`;
                        btnContent.onclick = (e) => { e.stopPropagation(); UI.jumpToWidget(depId); };
                        btnEl.appendChild(btnContent);
                        childElements.push(btnEl);
                    }
                }
            });

            if (childElements.length > 0 && dbNotes.length > 0) {
                const sep = document.createElement('div');
                sep.style.cssText = "height: 1px; background: var(--border-color); margin: 4px 10px 4px 25px; opacity: 0.5;";
                childElements.push(sep);
            }
        }

        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];

        dbNotes.forEach(note => {
            let noteDirectMatch = true;

            if (activePropFilters.length > 0) {
                if (!propsDb) {
                    noteDirectMatch = false;
                } else {
                    const sysRow = propsDb.rows.find(r => r.cells['sys_c_note'] === note.id);
                    if (!sysRow) {
                        noteDirectMatch = false;
                    } else {
                        const satisfiesAll = activePropFilters.every(f => {
                            let cellVal = sysRow.cells[f.colId];
                            
                            if (f.realValue === '*EXISTS*') {
                                if (cellVal === undefined || cellVal === null || cellVal === '') return false;
                                if (Array.isArray(cellVal) && cellVal.length === 0) return false;
                                return true;
                            }

                            if (typeof f.realValue === 'boolean') {
                                return (cellVal === true || cellVal === 'true') === f.realValue;
                            }

                            if (Array.isArray(cellVal)) {
                                return cellVal.some(v => String(v).toLowerCase() === String(f.realValue).toLowerCase());
                            }

                            return String(cellVal || '').toLowerCase().includes(String(f.realValue).toLowerCase());
                        });
                        if (!satisfiesAll) noteDirectMatch = false;
                    }
                }
            }

            if (noteDirectMatch && filter) {
                const matchTitle = (note.title || "").toLowerCase().includes(filter);
                const matchCont = UI.extractSearchableText(note.content).toLowerCase().includes(filter);
                if (!matchTitle && !matchCont) noteDirectMatch = false;
                
                if (noteDirectMatch) {
                    if (matchTitle) {
                        let idx = (note.title || "").toLowerCase().indexOf(filter);
                        while (idx !== -1) { AppState._globalHighlights++; idx = (note.title || "").toLowerCase().indexOf(filter, idx + filter.length); }
                    }
                    if (matchCont) {
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
            const shouldRender = (isFiltering && noteDirectMatch) || (!isFiltering && isExplicitDbMode) || (forceExpandForActiveNote && isActivePath);

            if (shouldRender) {
                const noteEl = UI.buildTreeElement(note, true); 
                if (noteEl) {
                    childElements.push(noteEl);
                    hasMatchChild = true;
                    if (isFiltering && noteDirectMatch) forceExpandBecauseOfMatch = true;
                }
            }
        });

        if (isFiltering) {
            if (!dbTitleMatch && !hasMatchChild) {
                return null; 
            }
        } else if (!isExplicitDbMode && !forceExpandForActiveNote) {
            return null; 
        }

        const wrapper = document.createElement('div'); 
        wrapper.className = 'node-wrapper';
        
        const content = document.createElement('div'); 
        content.className = 'node-content tree-ghost-node'; 

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

        const title = document.createElement('span');
        title.className = 'node-title';
        title.innerHTML = `<span style="opacity:0.6; color:var(--text-secondary);">${iconHtml}</span> <span>${dbState.title || defaultTitle}</span>`;

        content.onclick = (e) => {
            if (!e.target.closest('.toggle-btn')) {
                UI.jumpToWidget(dbId);
            }
        };

        content.onmouseenter = (e) => UI._showDbTooltip(dbId, dbState, e);
        content.onmouseleave = () => {
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
    },

    buildTreeElement: (node, forceRender = false) => {
        
        if (node.isRecordNote && !forceRender) {
            const isActivePath = AppState.currentNoteId === node.id || UI.isDescendant(node.id, AppState.currentNoteId);
            if (!isActivePath) return null;
        }

        const filter = AppState.searchFilter ? AppState.searchFilter.toLowerCase() : null;
        const activePropFilters = AppState.activePropertyFilters || [];
        const reqBook = AppState.showBookmarksInTree;
        const reqFav = AppState.showFavoritesInTree;
        const isDefaultView = !filter && !reqBook && !reqFav && activePropFilters.length === 0;

        let nodeDirectMatch = true;
        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];

        if (activePropFilters.length > 0) {
            if (!propsDb) {
                nodeDirectMatch = false;
            } else {
                const sysRow = propsDb.rows.find(r => r.cells['sys_c_note'] === node.id);
                if (!sysRow) {
                    nodeDirectMatch = false;
                } else {
                    const satisfiesAll = activePropFilters.every(f => {
                        let cellVal = sysRow.cells[f.colId];
                        
                        if (f.realValue === '*EXISTS*') {
                            if (cellVal === undefined || cellVal === null || cellVal === '') return false;
                            if (Array.isArray(cellVal) && cellVal.length === 0) return false;
                            return true;
                        }

                        if (typeof f.realValue === 'boolean') {
                            return (cellVal === true || cellVal === 'true') === f.realValue;
                        }

                        if (Array.isArray(cellVal)) {
                            return cellVal.some(v => String(v).toLowerCase() === String(f.realValue).toLowerCase());
                        }

                        return String(cellVal || '').toLowerCase().includes(String(f.realValue).toLowerCase());
                    });
                    if (!satisfiesAll) nodeDirectMatch = false;
                }
            }
        }

        if (nodeDirectMatch && filter) {
            let matchTitle = (node.title || "").toLowerCase().includes(filter);
            let matchContent = UI.extractSearchableText(node.content).toLowerCase().includes(filter);
            if (!matchTitle && !matchContent) nodeDirectMatch = false;
            
            if (nodeDirectMatch && !forceRender) {
                if (matchTitle) {
                    let idx = (node.title || "").toLowerCase().indexOf(filter);
                    while (idx !== -1) { AppState._globalHighlights++; idx = (node.title || "").toLowerCase().indexOf(filter, idx + filter.length); }
                }
                if (matchContent) {
                    let text = UI.extractSearchableText(node.content).toLowerCase();
                    let idx = text.indexOf(filter);
                    while (idx !== -1) { AppState._globalHighlights++; idx = text.indexOf(filter, idx + filter.length); }
                }
            }
        }
        
        if (nodeDirectMatch && reqBook) {
            if (!(node.content && node.content.includes('adv-bookmark-marker'))) nodeDirectMatch = false;
        }
        if (nodeDirectMatch && reqFav) {
            if (!node.isMarked) nodeDirectMatch = false;
        }

        const childElements = [];
        let hasMatchChild = false;

        const children = forceRender ? [] : Store.getChildren(node.id).filter(n => !n.isRecordNote);
        children.forEach(c => {
            const el = UI.buildTreeElement(c);
            if (el) { childElements.push(el); hasMatchChild = true; }
        });

        let dbElementsToInject = [];
        let hasMatchDbChild = false;
        
        if (!AppState.showDbNotesInTree && !isDefaultView && node.content) {
            const dbRegex = /id=["'](adv_tbl_[^"']+|adv_pivot_[^"']+|adv_journal_[^"']+)["']/g;
            let match;
            while ((match = dbRegex.exec(node.content)) !== null) {
                const dbId = match[1].split('_cited_')[0];
                if (AppState.databases && AppState.databases[dbId]) {
                    const dbState = AppState.databases[dbId];
                    if (!dbState.isPivot && !dbState.isLinkedView && dbId !== 'SYS_PROPERTIES_DB') {
                        const dbNotes = AppState.notes.filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === dbId);
                        const dbEl = UI.buildDatabaseVirtualTreeElement(dbId, dbState, dbNotes, AppState.currentNoteId === node.id, false);
                        if (dbEl) {
                            dbElementsToInject.push(dbEl);
                            hasMatchDbChild = true;
                        }
                    }
                }
            }
        }

        let tocHeaders = [];
        if (node.id === AppState.currentNoteId && node.content) {
            const temp = document.createElement('div');
            temp.innerHTML = node.content;
            tocHeaders = temp.querySelectorAll('h2, h3');
        }

        if (!isDefaultView) {
            if (!nodeDirectMatch && !hasMatchChild && !hasMatchDbChild) return null;
        }

        const isGhost = !isDefaultView && !nodeDirectMatch && (hasMatchChild || hasMatchDbChild);
        const hasAnyChildren = childElements.length > 0 || dbElementsToInject.length > 0 || tocHeaders.length > 0;

        const wrapper = document.createElement('div'); 
        wrapper.className = 'node-wrapper';
        wrapper.dataset.id = node.id;
        
        const content = document.createElement('div'); 
        content.className = 'node-content';
        
        if (node.id === AppState.currentNoteId) content.classList.add('active');
        if (isGhost) content.classList.add('tree-ghost-node');

        if (node.isRecordNote) {
            content.classList.add('record-note-node');
            content.draggable = false;
        } else {
            content.draggable = true;
            content.ondragstart = (e) => UI.handleDragStart(e, node.id);
            content.ondragend = UI.handleDragEnd;
            content.ondragover = (e) => UI.handleDragOverNode(e, node.id);
            content.ondragleave = (e) => e.currentTarget.classList.remove('drag-top', 'drag-bottom', 'drag-middle');
            content.ondrop = (e) => UI.handleDropNode(e, node.id);
        }

        content.onclick = (e) => {
            if (!e.target.closest('.node-add-btn') && !e.target.closest('.toggle-btn')) {
                if (typeof UI.selectNote !== 'undefined') UI.selectNote(node.id);
            }
        };

        content.ondblclick = (e) => {
            if (e.target.closest('.node-add-btn') || e.target.closest('.toggle-btn')) return;
            e.stopPropagation();
            e.preventDefault();
            
            if (typeof UI.selectNote !== 'undefined') UI.selectNote(node.id);
            
            if (!AppState.isEditMode) {
                UI.toggleEditMode(true);
            }
            
            setTimeout(() => {
                const titleInput = document.getElementById('noteTitle');
                if (titleInput && !titleInput.hasAttribute('readonly')) {
                    titleInput.focus();
                    titleInput.select();
                }
            }, 250); 
        };

        const toggle = document.createElement('div');
        toggle.className = 'toggle-btn';

        let isExpanded = node.expanded !== false || !isDefaultView || dbElementsToInject.length > 0;
        
        if (hasAnyChildren) {
            if (isExpanded) toggle.classList.add('expanded');
            toggle.innerHTML = Icons.chevronRight;
            toggle.style.cursor = 'pointer';
            toggle.onclick = (e) => {
                e.stopPropagation();
                if (node.expanded === undefined) node.expanded = false; 
                else node.expanded = !node.expanded;
                UI.renderTree();
            };
        } else {
            toggle.innerHTML = `<span style="opacity:0.3; font-size:18px;">•</span>`;
            toggle.style.cursor = 'default';
        }

        const title = document.createElement('span');
        title.className = 'node-title';
        let customIcon = Icons.file;
        let iconColorStyle = "";
        const hasBookmark = node.content && node.content.includes('adv-bookmark-marker');

        if (node.isRecordNote) {
            customIcon = Icons.recordPage;
            iconColorStyle = "color:var(--record-color);";
        } else if (!isGhost) {
            if (node.isMarked && hasBookmark) {
                customIcon = Icons.starFilled;
                iconColorStyle = "color:var(--tx-c4);"; 
            } else if (node.isMarked) {
                customIcon = Icons.starFilled;
                iconColorStyle = "color:var(--marked-border);"; 
            } else if (hasBookmark) {
                iconColorStyle = "color:var(--tx-c4);"; 
            }
        }

        title.innerHTML = `<span style="opacity:0.8; ${iconColorStyle}">${customIcon}</span> <span>${node.title || 'Senza Titolo'}</span>`;

        // ISOLAMENTO RIGOROSO: il timer e l'appunto del segnalibro vengono calcolati unicamente dal contenuto della specifica nota 'node'
        if (reqBook && !isGhost && node.content) {
            // Rilevamento presenza di un appunto/commento nel segnalibro per mostrare la nuvoletta con tooltip
            const commentMatch = node.content.match(/<span[^>]*class=["'][^"']*bookmark-comment-data[^"']*["'][^>]*>(.*?)<\/span>/i);
            if (commentMatch && commentMatch[1]) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = commentMatch[1];
                const cleanComm = tempDiv.textContent.replace(/[\u200B\n\r]/g, ' ').trim();
                if (cleanComm) {
                    const safeTooltip = cleanComm.replace(/"/g, '&quot;');
                    title.innerHTML += `<span style="margin-left:6px; font-size:0.75rem; color:var(--accent-color); opacity:0.85;" title="Appunto Segnalibro: ${safeTooltip}">💬</span>`;
                }
            }

            const timerMatch = node.content.match(/data-timer-expire=["'](\d+)["']/);
            if (timerMatch) {
                const expireMs = parseInt(timerMatch[1], 10);
                const now = Date.now();
                if (expireMs > now) {
                    const diffMins = Math.floor((expireMs - now) / 60000);
                    const h = Math.floor(diffMins / 60);
                    const m = diffMins % 60;
                    let timeStr = '';
                    if (h > 0) timeStr += `${h}h `;
                    timeStr += `${m}m`;
                    title.innerHTML += `<span style="margin-left:8px; font-size:0.7rem; color:var(--tx-c4); font-family:monospace; background:rgba(255, 134, 0, 0.1); padding:2px 4px; border-radius:4px;" title="Scade tra ${timeStr}">⏱️ ${timeStr}</span>`;
                } else {
                    title.innerHTML += `<span style="margin-left:8px; font-size:0.7rem; color:var(--danger-color); font-family:monospace; background:rgba(239, 68, 68, 0.1); padding:2px 4px; border-radius:4px;" title="Timer Scaduto">⏱️ Scaduto</span>`;
                }
            }
        }

        const addBtn = document.createElement('span');
        addBtn.className = 'node-add-btn';
        addBtn.textContent = '+';
        addBtn.title = "Aggiungi Sotto-nota";
        addBtn.onclick = (e) => { e.stopPropagation(); node.expanded = true; if(typeof UI.addNote !== 'undefined') UI.addNote(node.id); };

        content.append(toggle, title, addBtn);
        wrapper.appendChild(content);

        if (hasAnyChildren) {
            const block = document.createElement('div');
            block.className = 'children-block';
            if (isExpanded) block.classList.add('expanded');
            
            const blockInner = document.createElement('div');
            blockInner.className = 'children-block-inner';

            if (tocHeaders.length > 0) {
                const tocContainer = document.createElement('div');
                tocContainer.className = 'dynamic-toc-container';

                tocHeaders.forEach(h => {
                    const hText = h.innerText.trim();
                    if (!hText) return;

                    const isH1 = h.tagName.toLowerCase() === 'h2'; 
                    const tocEl = document.createElement('div');
                    tocEl.className = `toc-node ${isH1 ? 'toc-h1' : 'toc-h2'}`;
                    tocEl.innerHTML = `<span class="toc-icon">#</span> <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${hText.replace(/"/g, '&quot;')}">${hText}</span>`;

                    tocEl.onclick = (e) => {
                        e.stopPropagation();
                        UI.selectNote(node.id, hText);
                    };

                    tocContainer.appendChild(tocEl);
                });
                blockInner.appendChild(tocContainer);
            }

            dbElementsToInject.forEach(db => blockInner.appendChild(db));
            childElements.forEach(c => blockInner.appendChild(c));
            
            block.appendChild(blockInner);
            wrapper.appendChild(block);
        }

        return wrapper;
    },

    scrollToHeader: (anchorText) => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;
        const headers = editor.querySelectorAll('h2, h3');
        for (let h of headers) {
            if (h.innerText.trim() === anchorText) {
                h.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                h.style.transition = 'box-shadow 0.6s ease';
                h.style.boxShadow = '0 0 0 4px var(--marked-border), 0 0 30px var(--marked-border)';
                
                setTimeout(() => {
                    h.style.boxShadow = '';
                    setTimeout(() => h.style.transition = '', 600);
                }, 800);
                break;
            }
        }
    },

    highlightTreeNode: (id) => {
        document.querySelectorAll('.node-content').forEach(el => el.classList.remove('active'));
        const el = document.querySelector(`.node-wrapper[data-id="${id}"] > .node-content`);
        if (el) el.classList.add('active');
    },

    handleDragStart: (e, id) => { AppState.draggedNoteId = id; e.dataTransfer.effectAllowed = 'move'; e.target.style.opacity = '0.5'; },
    
    handleDragEnd: (e) => { 
        e.target.style.opacity = '1'; 
        document.querySelectorAll('.node-content').forEach(el => { el.classList.remove('drag-top', 'drag-bottom', 'drag-middle'); }); 
        const tc = document.getElementById('treeContainer');
        if (tc) tc.classList.remove('drag-over-root'); 
        AppState.draggedNoteId = null; 
        AppState.dragPosition = null; 
        AppState.draggedBlockId = null;
        AppState.draggedBlockType = null;
    },

    handleDragOverNode: (e, targetId) => {
        e.preventDefault();
        const targetEl = e.currentTarget;

        if (AppState.draggedBlockId) {
            targetEl.classList.remove('drag-top', 'drag-bottom', 'drag-middle');
            if (targetId !== AppState.currentNoteId) {
                targetEl.classList.add('drag-middle');
                e.dataTransfer.dropEffect = "move";
            } else {
                e.dataTransfer.dropEffect = "none";
            }
            return;
        }

        if (AppState.draggedNoteId === targetId) return;

        if (UI.isDescendant(AppState.draggedNoteId, targetId)) {
            targetEl.classList.remove('drag-top', 'drag-bottom', 'drag-middle');
            e.dataTransfer.dropEffect = "none";
            return;
        }

        const rect = targetEl.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        const height = rect.height;
        targetEl.classList.remove('drag-top', 'drag-bottom', 'drag-middle');

        if (offsetY < height * 0.25) {
            AppState.dragPosition = 'top'; targetEl.classList.add('drag-top');
        } else if (offsetY > height * 0.75) {
            AppState.dragPosition = 'bottom'; targetEl.classList.add('drag-bottom');
        } else {
            AppState.dragPosition = 'middle'; targetEl.classList.add('drag-middle');
        }
    },

    handleDragOverRoot: (e) => { 
        e.preventDefault(); 
        if (e.target.closest('.node-content')) return; 
        document.getElementById('treeContainer').classList.add('drag-over-root'); 
    },
    
    handleDropNode: (e, targetId) => { 
        e.preventDefault(); 
        e.stopPropagation(); 

        if (AppState.draggedBlockId) {
            document.querySelectorAll('.node-content').forEach(el => el.classList.remove('drag-top', 'drag-bottom', 'drag-middle'));
            
            if (targetId !== AppState.currentNoteId && typeof WidgetManager !== 'undefined') {
                WidgetManager.moveWidgetToNote(AppState.draggedBlockId, targetId);
            }
            AppState.draggedBlockId = null;
            AppState.draggedBlockType = null;
            return;
        }

        if (!AppState.draggedNoteId || AppState.draggedNoteId === targetId) return; 
        if (UI.isDescendant(AppState.draggedNoteId, targetId)) return; 
        UI.executeMove(AppState.draggedNoteId, targetId, AppState.dragPosition); 
    },
    
    handleDropRoot: (e) => { 
        e.preventDefault(); 
        document.getElementById('treeContainer').classList.remove('drag-over-root'); 
        if (e.target.closest('.node-content')) return; 
        if (AppState.draggedNoteId) UI.executeMove(AppState.draggedNoteId, null, 'root'); 
    },
    
    executeMove: (dragId, targetId, position) => { 
        const dragIndex = AppState.notes.findIndex(n => n.id === dragId); 
        if (dragIndex === -1) return; 
        const [draggedNote] = AppState.notes.splice(dragIndex, 1); 
        if (position === 'root') { 
            draggedNote.parentId = null; AppState.notes.push(draggedNote); 
        } else if (position === 'middle') { 
            draggedNote.parentId = targetId; const targetNote = Store.getNote(targetId); if (targetNote) targetNote.expanded = true; AppState.notes.push(draggedNote); 
        } else { 
            const targetIndex = AppState.notes.findIndex(n => n.id === targetId); const targetNote = AppState.notes[targetIndex]; draggedNote.parentId = targetNote.parentId; 
            if (position === 'top') AppState.notes.splice(targetIndex, 0, draggedNote); 
            else if (position === 'bottom') AppState.notes.splice(targetIndex + 1, 0, draggedNote); 
        } 
        draggedNote._isDirty = true;
        UI.renderTree(); 
        if (typeof Store !== 'undefined') Store.triggerAutoSave(); 
    },
    
    isDescendant: (parentId, childId) => { 
        let curr = Store.getNote(childId); 
        while (curr && curr.parentId) { 
            if (curr.parentId === parentId) return true; 
            curr = Store.getNote(curr.parentId); 
        } 
        return false; 
    }
});