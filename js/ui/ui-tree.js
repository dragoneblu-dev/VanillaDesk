/**
 * ui-tree.js
 * Modulo dedicato al rendering dell'albero gerarchico laterale delle note e alla navigazione tra le schede.
 * I nodi virtuali dei database sono delegati a 'ui-tree-db.js'.
 * La logica di Drag & Drop è delegata a 'ui-tree-dnd.js'.
 * Include:
 * - Navigazione schede (Note, Preferiti, Segnalibri, Database).
 * - Rendering gerarchico delle note standard e record note (renderTree, buildTreeElement).
 * - Matching delle proprietà della pagina con SYS_PROPERTIES_DB (_checkNotePropertyMatch).
 * - Estrazione testo indicizzabile da note e blocchi codice (extractSearchableText).
 * - TOC dinamico per capitoli H1, H2, H3 (scrollToHeader).
 * - Evidenziazione del nodo attivo nella sidebar (highlightTreeNode).
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
        
        // Pulizia immediata dell'evidenziazione di drag ad ogni ciclo di render
        container.classList.remove('drag-over-root');
        container.innerHTML = "";
        
        AppState._globalHighlights = 0;

        // Assicura che il database di sistema delle proprietà sia sincronizzato con tutte le note attuali
        if (typeof AdvancedTable !== 'undefined' && typeof AdvancedTable.ensureSystemPropertiesDB === 'function') {
            AdvancedTable.ensureSystemPropertiesDB();
        }

        const hasFilterText = AppState.searchFilter && AppState.searchFilter.length > 0;
        const hasFilterProp = AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0;
        const reqBook = AppState.showBookmarksInTree;
        const reqFav = AppState.showFavoritesInTree;
        const isFiltering = hasFilterText || hasFilterProp || reqBook || reqFav;

        // 1. Modalità Esplicita Database
        if (AppState.showDbNotesInTree) {
            if (AppState.databases) {
                const sortedDbIds = Object.keys(AppState.databases)
                    .filter(dbId => {
                        const dbState = AppState.databases[dbId];
                        const isCodeOrBtn = dbId.includes('adv_code_') || dbId.includes('adv_btnbar_') || dbId.includes('adv_cols_');
                        const isPivotOrLink = dbState && (dbState.isPivot || dbState.isLinkedView);
                        return dbState && !isCodeOrBtn && !isPivotOrLink && dbId !== 'SYS_PROPERTIES_DB';
                    })
                    .sort((a, b) => {
                        const titleA = AppState.databases[a]?.title || '';
                        const titleB = AppState.databases[b]?.title || '';
                        return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
                    });

                sortedDbIds.forEach(dbId => {
                    const dbState = AppState.databases[dbId];
                    const dbNotes = AppState.notes
                        .filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === dbId)
                        .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' }));

                    const el = UI.buildDatabaseVirtualTreeElement(dbId, dbState, dbNotes, false, true);
                    if (el) container.appendChild(el);
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
                    const dbNotes = AppState.notes
                        .filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === forceDbRenderId)
                        .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' }));
                    
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

    extractSearchableText: (htmlContent) => {
        if (!htmlContent) return "";

        // SANIFICAZIONE PREVENTIVA: Rimozione selettiva di frame, script e stili prima del parsing DOM.
        const cleanMarkup = htmlContent
            .replace(/<iframe\b[^>]*>([\s\S]*?<\/iframe>)?/gi, '')
            .replace(/<script\b[^>]*>([\s\S]*?<\/script>)?/gi, '')
            .replace(/<style\b[^>]*>([\s\S]*?<\/style>)?/gi, '')
            .replace(/<\/(p|div|li|h[1-6]|blockquote|tr|td|th)>|<br\s*[\/]?>|<hr\s*[\/]?>/gi, ' ');

        const temp = document.createElement('div');
        temp.innerHTML = cleanMarkup;

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

    _checkNotePropertyMatch: (sysRow, activePropFilters) => {
        return activePropFilters.every(f => {
            const cellVal = (sysRow && sysRow.cells) ? sysRow.cells[f.colId] : undefined;

            // 1. Controllo assenza (*EMPTY*): il campo non deve avere valore
            if (f.realValue === '*EMPTY*') {
                if (cellVal === undefined || cellVal === null || cellVal === '') return true;
                if (Array.isArray(cellVal)) return cellVal.length === 0;
                if (typeof cellVal === 'boolean') return false;
                if (typeof cellVal === 'object') {
                    const startEmpty = !cellVal.start || String(cellVal.start).trim() === '';
                    const endEmpty = !cellVal.end || String(cellVal.end).trim() === '';
                    return startEmpty && endEmpty;
                }
                return String(cellVal).trim() === '';
            }

            if (!sysRow || !sysRow.cells) return false;

            // 2. Controllo di presenza (*EXISTS*) coerente su tutti i tipi di proprietà
            if (f.realValue === '*EXISTS*') {
                if (cellVal === undefined || cellVal === null || cellVal === '') return false;
                if (Array.isArray(cellVal)) return cellVal.length > 0;
                if (typeof cellVal === 'boolean') return cellVal === true;
                if (typeof cellVal === 'object') {
                    return (cellVal.start !== undefined && String(cellVal.start).trim() !== '') ||
                           (cellVal.end !== undefined && String(cellVal.end).trim() !== '');
                }
                return String(cellVal).trim() !== '';
            }

            // 3. Booleani (Checkbox)
            if (typeof f.realValue === 'boolean') {
                return (cellVal === true || cellVal === 'true') === f.realValue;
            }

            // 4. Array (Multi-select o Relazioni)
            if (Array.isArray(cellVal)) {
                return cellVal.some(v => String(v).toLowerCase() === String(f.realValue).toLowerCase());
            }

            // 5. Date Range con oggetto {start, end}
            if (typeof cellVal === 'object' && cellVal !== null) {
                const searchLower = String(f.realValue).toLowerCase();
                const rangeStr = ((cellVal.start || '') + (cellVal.end ? ' ➔ ' + cellVal.end : '')).toLowerCase();
                if (rangeStr === searchLower || rangeStr.includes(searchLower) || searchLower.includes(rangeStr)) return true;
                const startMatch = cellVal.start && String(cellVal.start).toLowerCase().includes(searchLower);
                const endMatch = cellVal.end && String(cellVal.end).toLowerCase().includes(searchLower);
                return !!(startMatch || endMatch);
            }

            // 6. Note Link con oggetto {noteId, title, anchor}
            if (typeof cellVal === 'object' && cellVal !== null && (cellVal.noteId !== undefined || cellVal.title !== undefined)) {
                const searchLower = String(f.realValue).toLowerCase();
                const titleStr = (cellVal.title || '').toLowerCase();
                if (titleStr.includes(searchLower)) return true;
                if (cellVal.noteId && String(cellVal.noteId).toLowerCase() === searchLower) return true;
                return false;
            }

            // 7. Testo, Numeri e Singoli Valori
            return String(cellVal || '').toLowerCase().includes(String(f.realValue).toLowerCase());
        });
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
        let noteMatchCount = 0;
        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];

        if (activePropFilters.length > 0) {
            if (!propsDb || !Array.isArray(propsDb.rows)) {
                nodeDirectMatch = activePropFilters.every(f => f.realValue === '*EMPTY*');
            } else {
                const sysRow = propsDb.rows.find(r => r && r.cells && r.cells['sys_c_note'] === node.id);
                nodeDirectMatch = UI._checkNotePropertyMatch(sysRow, activePropFilters);
            }
        }

        if (nodeDirectMatch && filter) {
            let matchTitle = (node.title || "").toLowerCase().includes(filter);
            let matchContent = UI.extractSearchableText(node.content).toLowerCase().includes(filter);
            if (!matchTitle && !matchContent) nodeDirectMatch = false;
            
            if (nodeDirectMatch) {
                if (matchTitle) {
                    let idx = (node.title || "").toLowerCase().indexOf(filter);
                    while (idx !== -1) { 
                        noteMatchCount++;
                        if (!forceRender) AppState._globalHighlights++; 
                        idx = (node.title || "").toLowerCase().indexOf(filter, idx + filter.length); 
                    }
                }
                if (matchContent) {
                    let text = UI.extractSearchableText(node.content).toLowerCase();
                    let idx = text.indexOf(filter);
                    while (idx !== -1) { 
                        noteMatchCount++;
                        if (!forceRender) AppState._globalHighlights++; 
                        idx = text.indexOf(filter, idx + filter.length); 
                    }
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
            tocHeaders = temp.querySelectorAll('h1, h2, h3');
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
            
            if (typeof UI.selectNote !== 'undefined') UI.selectNote(node.id, null, null, true);
            
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

        const isCurrentActive = (node.id === AppState.currentNoteId);
        const hasSubNotes = childElements.length > 0 || dbElementsToInject.length > 0;
        const hasOnlyToc = !hasSubNotes && tocHeaders.length > 0;

        let isExpanded = false;

        if (isCurrentActive && hasOnlyToc) {
            isExpanded = node._tocCollapsed !== true;
        } else {
            isExpanded = node.expanded !== false || !isDefaultView || dbElementsToInject.length > 0;
            if (isCurrentActive && node._tocCollapsed === true && !hasSubNotes) {
                isExpanded = false;
            }
        }
        
        if (hasAnyChildren) {
            if (isExpanded) toggle.classList.add('expanded');
            toggle.innerHTML = Icons.chevronRight;
            toggle.style.cursor = 'pointer';
            toggle.onclick = (e) => {
                e.stopPropagation();
                if (isCurrentActive && hasOnlyToc) {
                    node._tocCollapsed = !node._tocCollapsed;
                } else {
                    if (node.expanded === undefined) node.expanded = false; 
                    else node.expanded = !node.expanded;
                    if (isCurrentActive && hasAnyChildren) {
                        node._tocCollapsed = !node.expanded;
                    }
                }
                UI.renderTree();
            };
        } else {
            toggle.innerHTML = `<span style="opacity:0.3; font-size:18px;">•</span>`;
            toggle.style.cursor = 'default';
        }

        const title = document.createElement('span');
        title.className = 'node-title';

        // GESTIONE INTELLIGENTE DEL TOOLTIP: Calcolato dinamicamente solo su hover ed esclusivamente se il testo è troncato
        title.onmouseenter = () => {
            const textSpan = title.querySelector('span:last-child') || title;
            if (textSpan.scrollWidth > textSpan.clientWidth) {
                title.title = node.title || I18n.t('editor.untitled');
            } else {
                title.removeAttribute('title');
            }
        };

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

        title.innerHTML = `<span style="opacity:0.8; ${iconColorStyle}">${customIcon}</span> <span>${node.title || I18n.t('editor.untitled')}</span>`;

        if (reqBook && !isGhost && node.content) {
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
        addBtn.title = I18n.t('editor_alerts.tree_add_subnote');
        addBtn.onclick = (e) => { e.stopPropagation(); node.expanded = true; if(typeof UI.addNote !== 'undefined') UI.addNote(node.id); };

        if (filter && noteMatchCount > 0 && !isGhost) {
            const countPill = document.createElement('span');
            countPill.className = 'search-match-count';
            countPill.title = I18n.t('common.occurrences_found', { count: noteMatchCount });
            countPill.textContent = noteMatchCount;
            content.append(toggle, title, countPill, addBtn);
        } else {
            content.append(toggle, title, addBtn);
        }

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

                    const tagLower = h.tagName.toLowerCase();
                    let tocClass = 'toc-h1';
                    if (tagLower === 'h1') {
                        tocClass = 'toc-h1';
                    } else if (tagLower === 'h2') {
                        tocClass = 'toc-h2';
                    } else if (tagLower === 'h3') {
                        tocClass = 'toc-h3';
                    }

                    const tocEl = document.createElement('div');
                    tocEl.className = `toc-node ${tocClass}`;
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
        const headers = editor.querySelectorAll('h1, h2, h3');
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
    }
});