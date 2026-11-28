/**
 * ui-tree.js
 * Modulo dedicato al rendering dell'albero gerarchico laterale delle note e alla navigazione tra le schede.
 * I nodi virtuali dei database sono delegati a 'ui-tree-db.js'.
 * La logica di Drag & Drop è delegata a 'ui-tree-dnd.js'.
 * L'indicizzazione testuale e l'anteprima dei risultati di ricerca sono delegati a 'ui-tree-search-preview.js'.
 * Include:
 * - Navigazione schede (Note, Preferiti, Segnalibri, Database).
 * - Rendering gerarchico delle note standard e record note (renderTree, buildTreeElement).
 * - Icona cartella (Icons.folder) automatica per le note prive di contenuto (solo titolo).
 * - Iniezione contestuale del Database e della Record Note attiva direttamente dentro la nota ospite nella scheda "Note".
 * - Matching delle proprietà della pagina delegato al motore centrale AppState.matchesPropertyFilters.
 * - Pillola estesa in sovraimpressione per titoli e capitoli (TOC) troncati nella sidebar, con ritrazione immediata
 *   al passaggio sul pulsante '+' o all'uscita dal pannello laterale e allineamento esatto al pixel.
 * - TOC dinamico per capitoli H1, H2, H3 (scrollToHeader) con micro-pillole numeriche basate sui blocchi di occorrenza,
 *   anteprima contestuale su hover (250ms) e salto diretto all'occorrenza selezionata (jumpToChapterSearchMatch).
 * - Evidenziazione del nodo attivo nella sidebar (highlightTreeNode).
 * - Feedback esplicito e pulsanti di reset quando ricerca e filtri tag non producono riscontri.
 * - Ricorsione gerarchica sui figli delle record note con ereditarietà dell'icona verde di database.
 * - Cattura multiriga dei commenti dei segnalibri e auto-scroll sul nodo attivo nell'albero.
 */

Object.assign(UI, {
    _activeRecordDbIds: null,
    _activeRecordHostNoteIds: null,
    _activeRecordDbInjected: false,

    // Verifica rapida O(1) senza parsing DOM se il corpo della nota è vuoto (solo titolo)
    isNoteContentEmpty: (htmlContent) => {
        if (!htmlContent) return true;
        const trimmed = htmlContent.trim();
        if (trimmed === '' || trimmed === '<p><br></p>' || trimmed === '<br>' || trimmed === '<p></p>') return true;
        if (/<(img|audio|video|iframe|table|hr|ul|ol|pre|blockquote)\b|adv-widget-shell|adv-inline-shell/i.test(trimmed)) {
            return false;
        }
        const textOnly = trimmed
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/[\u200B\uFEFF\u00A0\s\r\n]/g, '');
        return textOnly === '';
    },

    _showTitleOverflowPill: (titleEl, contentEl) => {
        if (!titleEl || !contentEl) return;
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;

        const textSpan = titleEl.querySelector('span:nth-child(2)') || titleEl.querySelector('span:last-child') || titleEl;
        const isTruncated = (titleEl.scrollWidth > titleEl.clientWidth + 1) || (textSpan.scrollWidth > textSpan.clientWidth + 1);
        if (!isTruncated) {
            UI._hideTitleOverflowPill();
            return;
        }

        let pill = document.getElementById('treeTitlePillPortal');
        if (!pill) {
            pill = document.createElement('div');
            pill.id = 'treeTitlePillPortal';
            pill.className = 'tree-title-pill-portal';
            document.body.appendChild(pill);
        }

        const titleRect = titleEl.getBoundingClientRect();
        const contentRect = contentEl.getBoundingClientRect();
        if (titleRect.width === 0 || contentRect.height === 0) return;

        const leftPos = Math.max(0, titleRect.left);
        const maxWidth = Math.max(titleRect.width + 20, window.innerWidth - leftPos - 16);

        pill.className = 'tree-title-pill-portal';
        if (contentEl.classList.contains('active')) pill.classList.add('active');
        if (contentEl.classList.contains('tree-ghost-node')) pill.classList.add('tree-ghost-node');

        pill.innerHTML = titleEl.innerHTML;
        pill.style.fontSize = '';
        pill.style.fontWeight = '';
        pill.style.gap = '';
        pill.style.top = `${contentRect.top}px`;
        pill.style.left = `${leftPos}px`;
        pill.style.height = `${contentRect.height}px`;
        pill.style.maxWidth = `${maxWidth}px`;
        pill.style.display = 'flex';
    },

    _showTocOverflowPill: (tocEl) => {
        if (!tocEl) return;
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;

        const textSpan = tocEl.querySelector('span:not(.toc-icon)');
        if (!textSpan || textSpan.scrollWidth <= textSpan.clientWidth + 1) {
            UI._hideTitleOverflowPill();
            return;
        }

        let pill = document.getElementById('treeTitlePillPortal');
        if (!pill) {
            pill = document.createElement('div');
            pill.id = 'treeTitlePillPortal';
            pill.className = 'tree-title-pill-portal';
            document.body.appendChild(pill);
        }

        const tocRect = tocEl.getBoundingClientRect();
        const iconEl = tocEl.querySelector('.toc-icon');
        const anchorRect = iconEl ? iconEl.getBoundingClientRect() : textSpan.getBoundingClientRect();
        if (anchorRect.width === 0 || tocRect.height === 0) return;

        const cs = window.getComputedStyle(tocEl);
        pill.className = 'tree-title-pill-portal toc-pill';
        pill.innerHTML = tocEl.innerHTML;
        pill.style.fontSize = cs.fontSize;
        pill.style.fontWeight = cs.fontWeight;
        pill.style.gap = cs.gap;
        pill.style.display = 'flex';

        if (iconEl) {
            const iconCs = window.getComputedStyle(iconEl);
            const pillIcon = pill.querySelector('.toc-icon');
            if (pillIcon) {
                pillIcon.style.width = iconCs.width;
                pillIcon.style.minWidth = iconCs.minWidth;
                pillIcon.style.textAlign = iconCs.textAlign;
                pillIcon.style.marginRight = iconCs.marginRight;
                pillIcon.style.marginLeft = iconCs.marginLeft;
                pillIcon.style.flexShrink = '0';
            }
        }

        const pillCs = window.getComputedStyle(pill);
        const pillPadLeft = parseFloat(pillCs.paddingLeft) || 0;
        const leftPos = Math.max(0, anchorRect.left - pillPadLeft);
        const maxWidth = Math.max(textSpan.clientWidth + 30 + pillPadLeft, window.innerWidth - leftPos - 16);

        pill.style.top = `${tocRect.top}px`;
        pill.style.left = `${leftPos}px`;
        pill.style.height = `${tocRect.height}px`;
        pill.style.maxWidth = `${maxWidth}px`;
    },

    _hideTitleOverflowPill: () => {
        const pill = document.getElementById('treeTitlePillPortal');
        if (pill && pill.style.display !== 'none') {
            pill.style.display = 'none';
        }
    },

    _getRecordDbHostChain: (noteId) => {
        const dbIds = new Set();
        const hostNotes = [];
        const visitedNotes = new Set();

        let curr = noteId && typeof Store !== 'undefined' ? Store.getNote(noteId) : null;
        while (curr && !visitedNotes.has(curr.id)) {
            visitedNotes.add(curr.id);
            if (curr.isRecordNote && curr.linkedTableId && curr.linkedTableId !== 'SYS_PROPERTIES_DB') {
                let dbId = curr.linkedTableId;
                const linkedDb = AppState.databases ? AppState.databases[dbId] : null;
                if (linkedDb && linkedDb.isLinkedView && linkedDb.sourceTableId) {
                    dbId = linkedDb.sourceTableId;
                }
                dbIds.add(dbId);

                // Individua la nota ospite attiva che contiene il widget reale (escludendo le citazioni)
                const hostRegex = new RegExp(`\\sid=["']${dbId}["']`);
                const hostNote = (AppState.notes || []).find(n =>
                    !n.deletedAt && n.content && n.content.includes(dbId) && hostRegex.test(n.content)
                );
                if (hostNote) {
                    hostNotes.push(hostNote);
                    curr = hostNote;
                    continue;
                }
                break;
            }
            curr = curr.parentId ? Store.getNote(curr.parentId) : null;
        }
        return { dbIds, hostNotes };
    },

    _updateTabsUI: (mode) => {
        ['notes', 'favorites', 'bookmarks', 'databases'].forEach(t => {
            const btn = document.getElementById('tab-' + t);
            if (btn) {
                if (t === mode) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });
    },

    clearTagFilters: () => {
        AppState.activePropertyFilters = [];
        if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
            SidebarManager.SearchAutocomplete.renderPills();
        }
        if (typeof EventsGlobal !== 'undefined' && typeof EventsGlobal._triggerSearchUpdate === 'function') {
            EventsGlobal._triggerSearchUpdate();
        }
    },

    clearSearchAndFilters: () => {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        AppState.searchFilter = '';
        AppState.activePropertyFilters = [];
        if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
            SidebarManager.SearchAutocomplete.renderPills();
        }
        if (typeof Editor !== 'undefined' && typeof Editor.cleanHighlightsBeforeSave === 'function') {
            Editor.cleanHighlightsBeforeSave();
        }
        if (typeof EventsGlobal !== 'undefined' && typeof EventsGlobal._triggerSearchUpdate === 'function') {
            EventsGlobal._triggerSearchUpdate();
        }
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

        // Ascolto ALT + Rotella del mouse per scorrere le occorrenze/pagine nell'anteprima della ricerca
        if (!container._hasPreviewWheelHandler) {
            container._hasPreviewWheelHandler = true;
            container.addEventListener('wheel', (e) => {
                const state = UI._searchPreviewState;
                if (!e.altKey || !state || state.isTitleOnly || !state.entries || state.entries.length <= 1) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();

                const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
                if (delta === 0) return;

                const step = delta > 0 ? 1 : -1;
                const curIdx = state.activeEntryIdx >= 0 ? state.activeEntryIdx : 0;
                const nextIdx = Math.max(0, Math.min(state.entries.length - 1, curIdx + step));

                UI._selectPreviewEntry(state, nextIdx);
            }, { passive: false });
        }

        // Chiusura immediata della pillola titolo su scroll o uscita dal contenitore laterale
        if (!container._hasTitlePillScrollHandler) {
            container._hasTitlePillScrollHandler = true;
            container.addEventListener('scroll', () => {
                UI._hideTitleOverflowPill();
            }, { passive: true });
            container.addEventListener('mouseleave', () => {
                UI._hideTitleOverflowPill();
            });
        }

        UI._hideTitleOverflowPill();
        UI._hideSearchPreviewTooltip();
        
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

        // Sincronizza e resetta la memoria delle posizioni di anteprima quando cambia o si azzera la ricerca
        if (!hasFilterText) {
            UI._searchPreviewLastQueryKey = '';
            UI._searchPreviewLastIndexByNote.clear();
        } else {
            const curTerms = typeof AppState.parseSearchTerms === 'function' ? AppState.parseSearchTerms(AppState.searchFilter.toLowerCase()) : [];
            const curScope = curTerms.length > 1 ? (AppState.multiSearchScope || 'paragraph') : 'note';
            const curKey = `${AppState.searchFilter.toLowerCase()}||${curScope}`;
            if (UI._searchPreviewLastQueryKey !== curKey) {
                UI._searchPreviewLastQueryKey = curKey;
                UI._searchPreviewLastIndexByNote.clear();
            }
        }

        // 1. Modalità Esplicita Database (Mostra solo l'elenco dei database e delle viste collegate)
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
        // 2. Modalità Struttura Classica (Tab Note)
        else {
            UI._activeRecordDbIds = null;
            UI._activeRecordHostNoteIds = null;
            UI._activeRecordDbInjected = false;

            let activeRecordRootDbId = null;
            if (!isFiltering && AppState.currentNoteId) {
                const hostChain = UI._getRecordDbHostChain(AppState.currentNoteId);
                if (hostChain.dbIds.size > 0) {
                    UI._activeRecordDbIds = hostChain.dbIds;
                    UI._activeRecordHostNoteIds = new Set(hostChain.hostNotes.map(n => n.id));
                    let curr = Store.getNote(AppState.currentNoteId);
                    while (curr) {
                        if (curr.isRecordNote && curr.linkedTableId && curr.linkedTableId !== 'SYS_PROPERTIES_DB') {
                            let dbId = curr.linkedTableId;
                            const linkedDb = AppState.databases ? AppState.databases[dbId] : null;
                            if (linkedDb && linkedDb.isLinkedView && linkedDb.sourceTableId) {
                                dbId = linkedDb.sourceTableId;
                            }
                            activeRecordRootDbId = dbId;
                            break;
                        }
                        curr = curr.parentId ? Store.getNote(curr.parentId) : null;
                    }
                }
            }

            try {
                const roots = Store.getChildren(null).filter(n => !n.isRecordNote);
                roots.forEach(node => { 
                    const el = UI.buildTreeElement(node); 
                    if (el) container.appendChild(el); 
                });

                // Fallback esclusivamente se il database del record attivo è orfano o contenuto in una nota nel Cestino
                if (!isFiltering && activeRecordRootDbId && !UI._activeRecordDbInjected && AppState.databases && AppState.databases[activeRecordRootDbId]) {
                    const dbState = AppState.databases[activeRecordRootDbId];
                    const dbNotes = AppState.notes
                        .filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === activeRecordRootDbId)
                        .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' }));
                    
                    const el = UI.buildDatabaseVirtualTreeElement(activeRecordRootDbId, dbState, dbNotes, true, false);
                    if (el) {
                        const sep = document.createElement('div');
                        sep.style.cssText = "height: 1px; background: var(--border-color); margin: 15px 10px; opacity: 0.5;";
                        container.appendChild(sep);
                        container.appendChild(el);
                    }
                }
            } finally {
                UI._activeRecordDbIds = null;
                UI._activeRecordHostNoteIds = null;
                UI._activeRecordDbInjected = false;
            }
        }

        // 3. GESTIONE STATO DI RICERCA A ZERO RISULTATI
        if (container.children.length === 0 && isFiltering) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'tree-empty-search-state';
            emptyDiv.style.cssText = 'padding: 24px 14px; text-align: center; color: var(--text-secondary); font-size: 0.85rem; display: flex; flex-direction: column; align-items: center; gap: 12px;';

            let msg = '';
            let buttonsHtml = '';

            if (hasFilterText && hasFilterProp) {
                msg = I18n.t('tree.empty_search_text_and_tags');
                const btnTagLabel = I18n.t('tree.btn_clear_tag_filters');
                const btnAllLabel = I18n.t('tree.btn_clear_all_search');

                buttonsHtml = `
                    <div style="display:flex; flex-direction:column; gap:6px; width:100%; max-width:220px;">
                        <button class="btn" style="padding:4px 8px; font-size:0.75rem; justify-content:center; color:var(--accent-color); border-color:var(--accent-color); cursor:pointer;" onclick="UI.clearTagFilters()">
                            ${btnTagLabel}
                        </button>
                        <button class="btn" style="padding:4px 8px; font-size:0.75rem; justify-content:center; cursor:pointer;" onclick="UI.clearSearchAndFilters()">
                            ${btnAllLabel}
                        </button>
                    </div>
                `;
            } else if (hasFilterProp) {
                msg = I18n.t('tree.empty_search_tags');
                const btnTagLabel = I18n.t('tree.btn_clear_tag_filters');

                buttonsHtml = `
                    <button class="btn" style="padding:4px 10px; font-size:0.8rem; justify-content:center; color:var(--accent-color); border-color:var(--accent-color); cursor:pointer;" onclick="UI.clearTagFilters()">
                        ${btnTagLabel}
                    </button>
                `;
            } else if (hasFilterText) {
                const termSafe = UI.escapeHTML(AppState.searchFilter);
                msg = I18n.t('tree.empty_search_text', { term: termSafe });
                const btnTextLabel = I18n.t('tree.btn_clear_search_text');

                buttonsHtml = `
                    <button class="btn" style="padding:4px 10px; font-size:0.8rem; justify-content:center; cursor:pointer;" onclick="UI.clearSearchAndFilters()">
                        ${btnTextLabel}
                    </button>
                `;
            } else if (reqBook || reqFav) {
                msg = reqBook ? I18n.t('tree.empty_bookmarks') : I18n.t('tree.empty_favorites');
            }

            emptyDiv.innerHTML = `
                <span style="opacity:0.5; font-size:1.6rem; display:inline-flex;">🔍</span>
                <span style="line-height:1.45;">${msg}</span>
                ${buttonsHtml}
            `;
            container.appendChild(emptyDiv);
        }
    },

    _checkNotePropertyMatch: (sysRow, activePropFilters) => {
        return AppState.matchesPropertyFilters(sysRow, activePropFilters);
    },

    _saveConsolidatedSearchHistory: () => {
        if (!AppState.searchFilter || typeof SidebarManager === 'undefined' || !SidebarManager.SearchHistory) return;
        const inputEl = document.getElementById('searchInput');
        const valToSave = (inputEl && inputEl.value && inputEl.value.trim().length > 0) ? inputEl.value : AppState.searchFilter;
        SidebarManager.SearchHistory.add(valToSave);
    },

    buildTreeElement: (node, forceRender = false, isDbBranch = false) => {
        const isDbBranchNode = Boolean(node.isRecordNote || isDbBranch);

        if (node.isRecordNote && !forceRender) {
            const isActivePath = AppState.currentNoteId === node.id ||
                UI.isDescendant(node.id, AppState.currentNoteId) ||
                (UI._activeRecordHostNoteIds && UI._activeRecordHostNoteIds.has(node.id));
            if (!isActivePath) return null;
        }

        const rawFilter = AppState.searchFilter ? AppState.searchFilter.toLowerCase() : null;
        const searchTerms = rawFilter ? AppState.parseSearchTerms(rawFilter) : [];
        const hasTerms = searchTerms.length > 0;
        const isMultiTerm = searchTerms.length > 1;
        const activeScope = isMultiTerm ? (AppState.multiSearchScope || 'paragraph') : 'note';
        const activePropFilters = AppState.activePropertyFilters || [];
        const reqBook = AppState.showBookmarksInTree;
        const reqFav = AppState.showFavoritesInTree;
        const isDefaultView = !hasTerms && !reqBook && !reqFav && activePropFilters.length === 0;

        let nodeDirectMatch = true;
        let noteMatchCount = 0;
        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];

        if (activePropFilters.length > 0) {
            const sysRow = (propsDb && Array.isArray(propsDb.rows))
                ? propsDb.rows.find(r => r && r.cells && r.cells['sys_c_note'] === node.id)
                : null;
            nodeDirectMatch = UI._checkNotePropertyMatch(sysRow, activePropFilters);
        }

        if (nodeDirectMatch && hasTerms) {
            const normTitle = (node.title || "").toLowerCase().replace(/\u00A0/g, ' ');
            const normContent = UI.extractSearchableText(node.content).toLowerCase();

            // Pre-check rapido comune a tutti gli ambiti: evita parsing DOM su note che non possiedono tutti i termini
            const hasAllTermsInNote = searchTerms.every(t => normTitle.includes(t) || normContent.includes(t));

            const countMatchesInString = (str, termsList) => {
                if (!str) return 0;
                const sorted = [...termsList].sort((a, b) => b.length - a.length);
                const rx = new RegExp(sorted.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
                const matches = str.match(rx);
                return matches ? matches.length : 0;
            };

            if (!hasAllTermsInNote) {
                nodeDirectMatch = false;
            } else if (isMultiTerm && activeScope === 'paragraph') {
                const titleMatched = searchTerms.every(t => normTitle.includes(t));
                const lines = UI._extractSearchPreviewLines(node);
                let boxCount = 0;

                lines.forEach(line => {
                    const lowerLine = line.text.toLowerCase();
                    if (searchTerms.every(t => lowerLine.includes(t))) {
                        boxCount++;
                    }
                });

                nodeDirectMatch = titleMatched || boxCount > 0;
                noteMatchCount = boxCount > 0 ? boxCount : (titleMatched ? 1 : 0);
                AppState._globalHighlights += noteMatchCount;
            } else if (isMultiTerm && activeScope === 'chapter') {
                const chapterScope = UI._getValidChapterNoteScope(node, searchTerms);
                nodeDirectMatch = chapterScope.hasMatch;

                if (nodeDirectMatch) {
                    const chLines = UI._extractSearchPreviewLines({ content: chapterScope.validHtml });
                    const boxCount = chLines.filter(line => {
                        const lowerLine = line.text.toLowerCase();
                        return searchTerms.some(t => lowerLine.includes(t));
                    }).length;
                    noteMatchCount = boxCount > 0 ? boxCount : 1;
                    AppState._globalHighlights += noteMatchCount;
                }
            } else if (isMultiTerm) {
                nodeDirectMatch = true;
                const noteLines = UI._extractSearchPreviewLines(node);
                const boxCount = noteLines.filter(line => {
                    const lowerLine = line.text.toLowerCase();
                    return searchTerms.some(t => lowerLine.includes(t));
                }).length;
                noteMatchCount = boxCount > 0 ? boxCount : 1;
                AppState._globalHighlights += noteMatchCount;
            } else {
                nodeDirectMatch = true;
                noteMatchCount += countMatchesInString(normTitle, searchTerms);
                noteMatchCount += countMatchesInString(normContent, searchTerms);
                AppState._globalHighlights += noteMatchCount;
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

        // Recupero ricorsivo dei nodi figli con propagazione garantita del ramo database
        const children = Store.getChildren(node.id).filter(n => !n.isRecordNote);
        children.forEach(c => {
            const el = UI.buildTreeElement(c, forceRender, isDbBranchNode);
            if (el) { childElements.push(el); hasMatchChild = true; }
        });

        let dbElementsToInject = [];
        let hasMatchDbChild = false;

        const shouldCheckActiveDb = isDefaultView && UI._activeRecordDbIds && UI._activeRecordDbIds.size > 0;
        if (!AppState.showDbNotesInTree && (!isDefaultView || shouldCheckActiveDb) && node.content) {
            // Isolamento rigoroso: lo spazio iniziale \s esclude data-ref-id delle citazioni senza manipolare il DOM
            const dbRegex = /\sid=["'](adv_tbl_[a-zA-Z0-9_]+|adv_pivot_[a-zA-Z0-9_]+|adv_journal_[a-zA-Z0-9_]+)["']/g;
            const seenDbIdsInNote = new Set();
            let match;
            while ((match = dbRegex.exec(node.content)) !== null) {
                if (match[1].includes('_cited_')) continue;

                const dbId = match[1];
                if (seenDbIdsInNote.has(dbId)) continue;
                seenDbIdsInNote.add(dbId);

                // In vista predefinita, inietta esclusivamente il DB lungo il percorso della record note attiva
                if (isDefaultView && (!UI._activeRecordDbIds || !UI._activeRecordDbIds.has(dbId))) {
                    continue;
                }

                if (AppState.databases && AppState.databases[dbId]) {
                    const dbState = AppState.databases[dbId];
                    if (!dbState.isPivot && !dbState.isLinkedView && dbId !== 'SYS_PROPERTIES_DB') {
                        const dbNotes = AppState.notes.filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === dbId);
                        const forceExpandDb = AppState.currentNoteId === node.id || (isDefaultView && UI._activeRecordDbIds && UI._activeRecordDbIds.has(dbId));
                        const dbEl = UI.buildDatabaseVirtualTreeElement(dbId, dbState, dbNotes, forceExpandDb, false);
                        if (dbEl) {
                            dbElementsToInject.push(dbEl);
                            hasMatchDbChild = true;
                            if (isDefaultView && UI._activeRecordDbIds && UI._activeRecordDbIds.has(dbId)) {
                                UI._activeRecordDbInjected = true;
                            }
                        }
                    }
                }
            }
        }

        let tocHeaders = [];
        let tocMatchCounts = null;
        if (node.id === AppState.currentNoteId && node.content) {
            const temp = document.createElement('div');
            temp.innerHTML = node.content;
            tocHeaders = Array.from(temp.querySelectorAll('h1, h2, h3')).filter(h => !h.closest('.adv-widget-shell'));

            if (hasTerms && tocHeaders.length > 0 && typeof UI._extractSearchPreviewLines === 'function') {
                tocMatchCounts = tocHeaders.map((hEl) => {
                    const level = parseInt(hEl.tagName.charAt(1), 10);
                    let sectionHtml = hEl.outerHTML;
                    let curr = hEl.nextElementSibling;
                    while (curr) {
                        if (/^H[1-6]$/i.test(curr.tagName) && !curr.closest('.adv-widget-shell')) {
                            const nextLvl = parseInt(curr.tagName.charAt(1), 10);
                            if (nextLvl <= level) break;
                        }
                        sectionHtml += curr.outerHTML;
                        curr = curr.nextElementSibling;
                    }

                    const sectionVirtualNote = { id: node.id, title: '', content: sectionHtml };
                    if (isMultiTerm && activeScope === 'chapter') {
                        const chScope = UI._getValidChapterNoteScope(sectionVirtualNote, searchTerms);
                        if (!chScope.hasMatch) return 0;
                        const lines = UI._extractSearchPreviewLines({ content: chScope.validHtml });
                        return lines.filter(l => searchTerms.some(t => l.text.toLowerCase().includes(t))).length;
                    }

                    const lines = UI._extractSearchPreviewLines(sectionVirtualNote);
                    if (isMultiTerm && activeScope === 'paragraph') {
                        return lines.filter(l => searchTerms.every(t => l.text.toLowerCase().includes(t))).length;
                    }
                    return lines.filter(l => searchTerms.some(t => l.text.toLowerCase().includes(t))).length;
                });
            }
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
        content.id = 'tree-node-' + node.id;
        
        if (node.id === AppState.currentNoteId) content.classList.add('active');
        if (isGhost) content.classList.add('tree-ghost-node');

        if (node.isRecordNote) {
            content.draggable = false;
        } else {
            content.draggable = true;
            content.ondragstart = (e) => {
                UI._hideTitleOverflowPill();
                UI.handleDragStart(e, node.id);
            };
            content.ondragend = UI.handleDragEnd;
            content.ondragover = (e) => UI.handleDragOverNode(e, node.id);
            content.ondragleave = (e) => e.currentTarget.classList.remove('drag-top', 'drag-bottom', 'drag-middle');
            content.ondrop = (e) => UI.handleDropNode(e, node.id);
        }

        content.oncontextmenu = (e) => {
            UI._hideTitleOverflowPill();
            if (typeof UI.openTreeNoteMenu === 'function') {
                UI.openTreeNoteMenu(e, content.id, node.id);
            }
        };

        const hasSearchPreview = Boolean(hasTerms && noteMatchCount > 0 && !isGhost);

        content.onclick = (e) => {
            if (!e.target.closest('.node-add-btn') && !e.target.closest('.toggle-btn')) {
                UI._hideTitleOverflowPill();
                if (hasTerms) UI._saveConsolidatedSearchHistory();

                UI._pendingSearchTarget = null;
                let targetMarkIdx = null;
                let activeEntry = null;
                if (hasSearchPreview && UI._searchPreviewState && UI._searchPreviewState.noteId === node.id && UI._searchPreviewState.chapterHeaderIndex === null) {
                    const st = UI._searchPreviewState;
                    if (st.activeEntryIdx >= 0 && st.entries && st.entries[st.activeEntryIdx]) {
                        activeEntry = st.entries[st.activeEntryIdx];
                        if (typeof activeEntry.firstGlobalMarkIdx === 'number') {
                            targetMarkIdx = activeEntry.firstGlobalMarkIdx;
                        }
                    }
                }

                if (hasSearchPreview) {
                    UI._dismissSearchPreviewOnClick(e.clientX, e.clientY);
                }

                if (activeEntry && activeEntry.kind && activeEntry.kind !== 'text' && activeEntry.kind !== 'table') {
                    UI._pendingSearchTarget = {
                        noteId: node.id,
                        kind: activeEntry.kind,
                        targetIndex: activeEntry.targetIndex,
                        targetId: activeEntry.targetId
                    };
                    if (AppState.currentNoteId === node.id) {
                        UI._focusPendingSearchTarget();
                        return;
                    }
                } else if (targetMarkIdx !== null) {
                    AppState._currentHighlightIndex = targetMarkIdx;
                    if (AppState.currentNoteId === node.id && AppState._totalHighlights > 0) {
                        const safeIdx = Math.min(targetMarkIdx, AppState._totalHighlights - 1);
                        AppState._currentHighlightIndex = safeIdx;
                        AppState._focusHighlight(safeIdx);
                        return;
                    }
                }

                if (typeof UI.selectNote !== 'undefined') UI.selectNote(node.id);
            }
        };

        content.ondblclick = (e) => {
            if (e.target.closest('.node-add-btn') || e.target.closest('.toggle-btn')) return;
            e.stopPropagation();
            e.preventDefault();
            UI._hideTitleOverflowPill();
            if (hasTerms) UI._saveConsolidatedSearchHistory();
            
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
            isExpanded = node.expanded !== false || !isDefaultView;
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
                UI._hideTitleOverflowPill();
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

        toggle.onmouseenter = () => UI._hideTitleOverflowPill();

        const title = document.createElement('span');
        title.className = 'node-title';

        // Espansione in sovraimpressione per titoli troncati (soppressa in presenza di preview ricerca)
        title.onmouseenter = () => {
            title.removeAttribute('title');
            if (hasSearchPreview) return;
            UI._showTitleOverflowPill(title, content);
        };

        if (hasSearchPreview) {
            content.onmouseenter = (e) => {
                UI._hideTitleOverflowPill();
                if (e.target.closest('.node-add-btn, .toggle-btn')) {
                    UI._hideSearchPreviewTooltip();
                    return;
                }
                if (UI._isSearchPreviewDismissed(e.clientX, e.clientY)) return;
                clearTimeout(UI._searchPreviewTimer);
                UI._searchPreviewTimer = setTimeout(() => {
                    UI._searchPreviewTimer = null;
                    UI._showSearchPreviewTooltip(node, rawFilter, content);
                }, 250);
            };
            content.onmousemove = (e) => {
                if (e.target.closest('.node-add-btn, .toggle-btn')) {
                    UI._hideSearchPreviewTooltip();
                    return;
                }
                if (UI._isSearchPreviewDismissed(e.clientX, e.clientY)) return;

                const st = UI._searchPreviewState;
                if ((!st || st.noteId !== node.id || st.chapterHeaderIndex !== null) && !UI._searchPreviewTimer) {
                    UI._searchPreviewTimer = setTimeout(() => {
                        UI._searchPreviewTimer = null;
                        UI._showSearchPreviewTooltip(node, rawFilter, content);
                    }, 250);
                }
            };
            content.onmouseleave = (e) => {
                UI._hideTitleOverflowPill();
                if (e.relatedTarget && content.contains(e.relatedTarget)) return;
                UI._searchPreviewDismissPos = null;
                UI._hideSearchPreviewTooltip();
            };
        } else {
            content.onmouseleave = () => {
                UI._hideTitleOverflowPill();
            };
        }

        const isNoteEmpty = UI.isNoteContentEmpty(node.content);
        let customIcon = isNoteEmpty ? Icons.folder : Icons.file;
        let iconColorStyle = "";
        const hasBookmark = node.content && node.content.includes('adv-bookmark-marker');

        if (isDbBranchNode) {
            customIcon = node.isMarked ? Icons.starFilled : Icons.recordPage;
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
            const commentMatch = node.content.match(/<span[^>]*class=["'][^"']*bookmark-comment-data[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
            if (commentMatch && commentMatch[1]) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = commentMatch[1];
                const cleanComm = tempDiv.textContent.replace(/[\u200B\n\r]/g, ' ').trim();
                if (cleanComm) {
                    const safeTooltip = cleanComm.replace(/"/g, '&quot;');
                    title.innerHTML += `<span style="margin-left:6px; font-size:0.75rem; color:var(--accent-color); opacity:0.85;" title="${I18n.t('bookmarks.tooltip_comment', { comment: safeTooltip })}">💬</span>`;
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
                    title.innerHTML += `<span style="margin-left:8px; font-size:0.7rem; color:var(--tx-c4); font-family:monospace; background:rgba(255, 134, 0, 0.1); padding:2px 4px; border-radius:4px;" title="${I18n.t('bookmarks.tooltip_expires_in', { time: timeStr })}">⏱️ ${timeStr}</span>`;
                } else {
                    title.innerHTML += `<span style="margin-left:8px; font-size:0.7rem; color:var(--danger-color); font-family:monospace; background:rgba(239, 68, 68, 0.1); padding:2px 4px; border-radius:4px;" title="${I18n.t('bookmarks.tooltip_expired')}">⏱️ ${I18n.t('bookmarks.badge_expired')}</span>`;
                }
            }
        }

        const addBtn = document.createElement('span');
        addBtn.className = 'node-add-btn';
        addBtn.textContent = '+';
        addBtn.title = I18n.t('editor_alerts.tree_add_subnote');
        addBtn.onmouseenter = () => UI._hideTitleOverflowPill();
        addBtn.onclick = (e) => {
            e.stopPropagation();
            UI._hideTitleOverflowPill();
            node.expanded = true;
            if (typeof UI.addNote !== 'undefined') UI.addNote(node.id);
        };

        if (hasSearchPreview) {
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

                tocHeaders.forEach((h, hIndex) => {
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

                    const matchCount = tocMatchCounts ? tocMatchCounts[hIndex] : 0;
                    const pillHtml = matchCount > 0
                        ? `<span class="toc-match-pill" title="${I18n.t('common.occurrences_found', { count: matchCount })}">${matchCount}</span>`
                        : '';

                    const tocEl = document.createElement('div');
                    tocEl.className = `toc-node ${tocClass}`;
                    tocEl.innerHTML = `<span class="toc-icon">#</span> <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0;">${UI.escapeHTML(hText)}</span>${pillHtml}`;

                    if (matchCount > 0 && hasTerms) {
                        tocEl.onmouseenter = (e) => {
                            UI._hideTitleOverflowPill();
                            if (UI._isSearchPreviewDismissed(e.clientX, e.clientY)) return;
                            clearTimeout(UI._searchPreviewTimer);
                            UI._searchPreviewTimer = setTimeout(() => {
                                UI._searchPreviewTimer = null;
                                UI._showSearchPreviewTooltip(node, rawFilter, tocEl, { headerIndex: hIndex });
                            }, 250);
                        };
                        tocEl.onmousemove = (e) => {
                            if (UI._isSearchPreviewDismissed(e.clientX, e.clientY)) return;
                            const st = UI._searchPreviewState;
                            if ((!st || st.noteId !== node.id || st.chapterHeaderIndex !== hIndex) && !UI._searchPreviewTimer) {
                                UI._searchPreviewTimer = setTimeout(() => {
                                    UI._searchPreviewTimer = null;
                                    UI._showSearchPreviewTooltip(node, rawFilter, tocEl, { headerIndex: hIndex });
                                }, 250);
                            }
                        };
                        tocEl.onmouseleave = (e) => {
                            UI._hideTitleOverflowPill();
                            if (e.relatedTarget && tocEl.contains(e.relatedTarget)) return;
                            UI._searchPreviewDismissPos = null;
                            UI._hideSearchPreviewTooltip();
                        };
                    } else {
                        tocEl.onmouseenter = () => UI._showTocOverflowPill(tocEl);
                        tocEl.onmouseleave = () => UI._hideTitleOverflowPill();
                    }

                    tocEl.onclick = (e) => {
                        e.stopPropagation();
                        UI._hideTitleOverflowPill();
                        if (hasTerms) UI._saveConsolidatedSearchHistory();

                        if (matchCount > 0) {
                            let localMarkOffset = 0;
                            let activeEntry = null;
                            if (UI._searchPreviewState && UI._searchPreviewState.noteId === node.id && UI._searchPreviewState.chapterHeaderIndex === hIndex) {
                                const st = UI._searchPreviewState;
                                if (st.activeEntryIdx >= 0 && st.entries && st.entries[st.activeEntryIdx]) {
                                    activeEntry = st.entries[st.activeEntryIdx];
                                    if (typeof activeEntry.firstGlobalMarkIdx === 'number') {
                                        localMarkOffset = activeEntry.firstGlobalMarkIdx;
                                    }
                                }
                            }
                            UI._dismissSearchPreviewOnClick(e.clientX, e.clientY);
                            UI.jumpToChapterSearchMatch(node.id, hIndex, hText, localMarkOffset, activeEntry);
                        } else {
                            UI.selectNote(node.id, hText);
                        }
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

    jumpToChapterSearchMatch: (noteId, headerIndex, anchorText, localMarkOffset = 0, activeEntry = null) => {
        if (AppState.currentNoteId !== noteId) {
            UI.selectNote(noteId, anchorText);
            return;
        }

        const editor = document.getElementById('noteContent');
        if (!editor) return;

        const headers = Array.from(editor.querySelectorAll('h1, h2, h3')).filter(h => !h.closest('.adv-widget-shell'));
        const targetHeader = headers[headerIndex];
        if (!targetHeader) {
            UI.scrollToHeader(anchorText);
            return;
        }

        const level = parseInt(targetHeader.tagName.charAt(1), 10);
        const sectionNodes = [targetHeader];
        let curr = targetHeader.nextElementSibling;
        while (curr) {
            if (/^H[1-6]$/i.test(curr.tagName) && !curr.closest('.adv-widget-shell')) {
                const nextLvl = parseInt(curr.tagName.charAt(1), 10);
                if (nextLvl <= level) break;
            }
            sectionNodes.push(curr);
            curr = curr.nextElementSibling;
        }

        const highlightTargetElement = (targetEl) => {
            if (!targetEl) return;
            let p = targetEl.parentElement;
            while (p && p.id !== 'noteContent') {
                if (p.classList && p.classList.contains('collapsed')) p.classList.remove('collapsed');
                p = p.parentElement;
            }
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetEl.style.transition = 'box-shadow 0.4s ease';
            targetEl.style.boxShadow = '0 0 0 4px var(--marked-border), 0 0 24px var(--marked-border)';
            setTimeout(() => {
                if (document.body.contains(targetEl)) {
                    targetEl.style.boxShadow = '';
                    setTimeout(() => {
                        if (document.body.contains(targetEl)) targetEl.style.transition = '';
                    }, 400);
                }
            }, 1200);
        };

        // Se l'utente ha selezionato con ALT+Rotella un elemento speciale/nascosto del capitolo
        if (activeEntry && activeEntry.kind && activeEntry.kind !== 'text' && activeEntry.kind !== 'table') {
            let specialEl = null;
            if (activeEntry.targetId) {
                specialEl = document.getElementById(activeEntry.targetId) || document.querySelector(`[id^="${activeEntry.targetId}_cited_"]`);
            } else {
                let candidates = [];
                if (activeEntry.kind === 'bookmark') {
                    sectionNodes.forEach(s => {
                        candidates.push(...Array.from(s.querySelectorAll('.adv-bookmark-marker')).filter(b => !b.closest('.block-citation')));
                    });
                } else if (activeEntry.kind === 'inline-note') {
                    sectionNodes.forEach(s => {
                        candidates.push(...Array.from(s.querySelectorAll('.inline-note-wrapper, .inline-note-marker'))
                            .filter(n => !(n.classList.contains('inline-note-marker') && n.closest('.inline-note-wrapper')) && !n.closest('.block-citation')));
                    });
                } else if (activeEntry.kind === 'image') {
                    sectionNodes.forEach(s => {
                        if (s.matches && s.matches('img[data-tooltip]') && !s.closest('.block-citation')) candidates.push(s);
                        if (s.querySelectorAll) {
                            candidates.push(...Array.from(s.querySelectorAll('img[data-tooltip]')).filter(img => !img.closest('.block-citation')));
                        }
                    });
                } else if (activeEntry.kind === 'link') {
                    sectionNodes.forEach(s => {
                        candidates.push(...Array.from(s.querySelectorAll('a'))
                            .filter(a => !a.closest('.adv-table-wrapper, .adv-journal-wrapper, .block-citation, .code-wrapper')));
                    });
                }
                specialEl = candidates[activeEntry.targetIndex || 0] || candidates[0] || null;
            }

            if (specialEl) {
                highlightTargetElement(specialEl);
                return;
            }
        }

        const chapterMarks = [];
        sectionNodes.forEach(sNode => {
            if (sNode.querySelectorAll) {
                chapterMarks.push(...sNode.querySelectorAll('mark.search-highlight'));
            }
        });

        if (chapterMarks.length > 0) {
            const safeLocalIdx = Math.max(0, Math.min(localMarkOffset || 0, chapterMarks.length - 1));
            const targetMark = chapterMarks[safeLocalIdx];
            const allMarks = Array.from(editor.querySelectorAll('mark.search-highlight'));
            const globalIdx = allMarks.indexOf(targetMark);
            if (globalIdx !== -1) {
                AppState._currentHighlightIndex = globalIdx;
                AppState._focusHighlight(globalIdx, true);
                return;
            }
        }

        // Fallback: se nella sezione non ci sono <mark> nel testo visibile, controlla immagini con descrizione corrispondente
        const searchTerms = AppState.searchFilter ? AppState.parseSearchTerms(AppState.searchFilter.toLowerCase()) : [];
        if (searchTerms.length > 0) {
            for (const s of sectionNodes) {
                const imgs = [];
                if (s.matches && s.matches('img[data-tooltip]') && !s.closest('.block-citation')) imgs.push(s);
                if (s.querySelectorAll) {
                    imgs.push(...Array.from(s.querySelectorAll('img[data-tooltip]')).filter(img => !img.closest('.block-citation')));
                }
                const matchedImg = imgs.find(img => {
                    const txt = (img.getAttribute('data-tooltip') || '').replace(/<br\s*[\/]?>/gi, ' ').replace(/<[^>]*>?/gm, '').toLowerCase();
                    return searchTerms.some(t => txt.includes(t));
                });
                if (matchedImg) {
                    highlightTargetElement(matchedImg);
                    return;
                }
            }
        }

        UI.scrollToHeader(anchorText);
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
        if (el) {
            el.classList.add('active');
            const treeContainer = document.getElementById('treeContainer');
            if (treeContainer) {
                const scrollIntoViewIfNeeded = () => {
                    const elRect = el.getBoundingClientRect();
                    const containerRect = treeContainer.getBoundingClientRect();
                    if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                };
                scrollIntoViewIfNeeded();
                setTimeout(scrollIntoViewIfNeeded, 100);
            }
        }
    }
});