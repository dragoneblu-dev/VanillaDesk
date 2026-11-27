/**
 * state.js
 * Variabili di stato globale dell'applicazione. Fonte assoluta della verità in RAM.
 * Logica centralizzata di valutazione filtri proprietà (AppState.matchesPropertyFilters)
 * per *EXISTS*, *EMPTY*, booleani, array, date range e note_link.
 * Parser unificato dei termini di ricerca (AppState.parseSearchTerms) con supporto allo spazio (AND logico),
 * doppie virgolette '"..."' per ricerche letterali con spazi ed escape '\' per doppi apici ('\"') e backslash ('\\'),
 * con scope configurabile (multiSearchScope: 'paragraph' | 'chapter' | 'note').
 * Type guard centralizzati (AppState.isRelationalTable, AppState.getRelationalDatabaseIds)
 * per disambiguare i database relazionali da widget non-RDBMS in AppState.databases.
 * Supporto alla navigazione di ricerca nelle record note (isRecordNote) e relative sotto-note,
 * escludendo gli ID citati dalle scansioni e normalizzando \u00A0 in spazi standard.
 * Sincronizzazione automatica dell'indice delle occorrenze di ricerca rispetto alla posizione visibile / cursore.
 * Tracciamento esplicito di storageMode ('fsaa' | 'idb' | 'ram') e idbWorkspaceId.
 */

const AppState = {
    notes: [],
    databases: {}, 
    homeCitations: [],
    templates: [], 
    currentNoteId: null,
    
    workspaceHandle: null, 
    assetsHandle: null,

    // Modalità di archiviazione attiva: 'fsaa' (Cartella PC) | 'idb' (Memoria Browser) | 'ram' (Transitorio)
    storageMode: 'ram',
    idbWorkspaceId: null,
    
    draggedNoteId: null,
    searchFilter: "",
    multiSearchScope: "paragraph", // 'paragraph' | 'chapter' | 'note'
    activePropertyFilters: [], // Array di { colId, realValue, colName, visualText, colorClass }
    
    fileName: typeof I18n !== 'undefined' ? I18n.t('common.no_workspace') : "Nessun Workspace",
    isEditMode: false,
    dragPosition: null,
    continuousEditMode: false,
    noWrapMode: false,
    draggedBlockId: null,
    draggedBlockType: null,
    isSwitchingNote: false,
    showMinimap: false,
    
    showDbNotesInTree: false,
    showBookmarksInTree: false,
    showFavoritesInTree: false, 
    
    documentPassword: null, 
    
    _currentHighlightIndex: 0,
    _totalHighlights: 0,
    _globalHighlights: 0,
    _highlightSyncBetween: false,
    _isAutoScrollingToHighlight: false,
    _autoScrollHighlightTimer: null,

    // =========================================================================
    // PARSER TERMINI DI RICERCA (SPAZIO = AND LOGICO, "..." = FRASE CON SPAZI, \ = ESCAPE)
    // =========================================================================
    parseSearchTerms: (rawQuery) => {
        if (!rawQuery || typeof rawQuery !== 'string') return [];
        const normalized = rawQuery.replace(/\u00A0/g, ' ');
        if (!normalized.trim()) return [];

        const tokens = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < normalized.length; i++) {
            const ch = normalized[i];

            if (ch === '\\') {
                if (i + 1 < normalized.length) {
                    const nextCh = normalized[i + 1];
                    if (nextCh === '"' || nextCh === '\\' || nextCh === ' ') {
                        current += nextCh;
                        i++;
                        continue;
                    }
                }
                current += ch;
            } else if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (ch === ' ' && !inQuotes) {
                if (current.length > 0) {
                    tokens.push(current);
                    current = '';
                }
            } else {
                current += ch;
            }
        }

        if (current.length > 0) {
            tokens.push(current);
        }

        const seen = new Set();
        const result = [];
        tokens.forEach(val => {
            if (val.length > 0 && val.trim().length > 0) {
                const key = val.toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    result.push(val);
                }
            }
        });
        return result;
    },

    // =========================================================================
    // TYPE GUARDS CENTRALI PER LA DISAMBIGUAZIONE DELLE ENTITÀ
    // =========================================================================

    /**
     * Determina se un ID o un oggetto di stato rappresenta un Database Relazionale valido.
     * Esclude categoricamente blocchi codice, diari, barre di pulsanti e layout a colonne.
     * @param {string|object} idOrState - ID presente in AppState.databases oppure oggetto di stato
     * @returns {boolean}
     */
    isRelationalTable: (idOrState) => {
        if (!idOrState) return false;
        let s = idOrState;
        let id = '';
        if (typeof idOrState === 'string') {
            id = idOrState.split('_cited_')[0];
            s = AppState.databases ? AppState.databases[id] : null;
        } else if (s && s.id) {
            id = s.id;
        }

        if (!s || typeof s !== 'object') return false;

        // Esclusione per prefisso ID noto
        if (id && (id.startsWith('adv_code_') || id.startsWith('adv_btnbar_') || id.startsWith('adv_cols_') || id.startsWith('adv_journal_'))) {
            return false;
        }

        // Esclusione per proprietà caratteristiche di widget non-database
        if (s.entries !== undefined || s.buttons !== undefined || s.language !== undefined) {
            return false;
        }

        // Una tabella relazionale ha columns come Array, oppure è una fixture/stato di database tabellare valido
        if (Array.isArray(s.columns)) return true;
        if (s.isSystemDB || s.isLinkedView || s.isPivot) return true;
        if (id && (id.startsWith('adv_tbl_') || id.startsWith('db_') || id === 'SYS_PROPERTIES_DB')) return true;

        // Se ha un titolo ed è privo di firme non-RDBMS, è considerato database
        return s.title !== undefined && !s.entries && !s.buttons && s.language === undefined;
    },

    /**
     * Restituisce esclusivamente gli identificatori dei Database Relazionali (esclusi codice, diari, macro, ecc.)
     * @returns {string[]}
     */
    getRelationalDatabaseIds: () => {
        if (!AppState.databases) return [];
        return Object.keys(AppState.databases).filter(id => AppState.isRelationalTable(id));
    },

    /**
     * Valuta in modo centralizzato se una riga di proprietà (SYS_PROPERTIES_DB) soddisfa tutti i filtri attivi.
     * Utilizzato sia dall'albero laterale che dalla navigazione riscontri Avanti/Indietro.
     */
    matchesPropertyFilters: (sysRow, activePropFilters) => {
        if (!activePropFilters || activePropFilters.length === 0) return true;

        return activePropFilters.every(f => {
            const cellVal = (sysRow && sysRow.cells) ? sysRow.cells[f.colId] : undefined;

            // 1. Controllo assenza (*EMPTY*): il campo non deve avere valore
            if (f.realValue === '*EMPTY*') {
                if (cellVal === undefined || cellVal === null || cellVal === '') return true;
                if (Array.isArray(cellVal)) return cellVal.length === 0;
                if (typeof cellVal === 'boolean') return false;
                if (typeof cellVal === 'object') {
                    if (cellVal.noteId !== undefined || cellVal.title !== undefined) {
                        return (!cellVal.noteId || String(cellVal.noteId).trim() === '') &&
                               (!cellVal.title || String(cellVal.title).trim() === '');
                    }
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
                    if (cellVal.noteId !== undefined || cellVal.title !== undefined) {
                        return (cellVal.noteId !== undefined && String(cellVal.noteId).trim() !== '') ||
                               (cellVal.title !== undefined && String(cellVal.title).trim() !== '');
                    }
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
                return cellVal.some(v => String(v).toLowerCase().replace(/\u00A0/g, ' ') === String(f.realValue).toLowerCase().replace(/\u00A0/g, ' '));
            }

            // 5. Note Link con oggetto {noteId, title, anchor}
            if (typeof cellVal === 'object' && cellVal !== null && (cellVal.noteId !== undefined || cellVal.title !== undefined)) {
                const searchLower = String(f.realValue).toLowerCase().replace(/\u00A0/g, ' ');
                const titleStr = (cellVal.title || '').toLowerCase().replace(/\u00A0/g, ' ');
                if (titleStr.includes(searchLower)) return true;
                if (cellVal.noteId && String(cellVal.noteId).toLowerCase() === searchLower) return true;
                return false;
            }

            // 6. Date Range con oggetto {start, end}
            if (typeof cellVal === 'object' && cellVal !== null && (cellVal.start !== undefined || cellVal.end !== undefined)) {
                const searchLower = String(f.realValue).toLowerCase().replace(/\u00A0/g, ' ');
                const rangeStr = ((cellVal.start || '') + (cellVal.end ? ' ➔ ' + cellVal.end : '')).toLowerCase();
                if (rangeStr === searchLower || rangeStr.includes(searchLower) || searchLower.includes(rangeStr)) return true;
                const startMatch = cellVal.start && String(cellVal.start).toLowerCase().includes(searchLower);
                const endMatch = cellVal.end && String(cellVal.end).toLowerCase().includes(searchLower);
                return !!(startMatch || endMatch);
            }

            // 7. Testo, Numeri e Singoli Valori
            return String(cellVal || '').toLowerCase().replace(/\u00A0/g, ' ').includes(String(f.realValue).toLowerCase().replace(/\u00A0/g, ' '));
        });
    },

    findNext: () => {
        if (AppState._globalHighlights === 0 && AppState.activePropertyFilters.length === 0) return;

        if (AppState.searchFilter && typeof SidebarManager !== 'undefined' && SidebarManager.SearchHistory) {
            const inputEl = document.getElementById('searchInput');
            SidebarManager.SearchHistory.add((inputEl && inputEl.value) ? inputEl.value : AppState.searchFilter);
        }

        AppState._highlightSyncBetween = false;
        AppState._currentHighlightIndex++;
        
        if (AppState._currentHighlightIndex >= AppState._totalHighlights) {
            const nextNoteId = AppState._findNextNoteWithMatches(1);
            if (nextNoteId && nextNoteId !== AppState.currentNoteId) {
                AppState._currentHighlightIndex = 0;
                UI.selectNote(nextNoteId);
                return; 
            } else {
                AppState._currentHighlightIndex = 0;
            }
        }
        AppState._focusHighlight(AppState._currentHighlightIndex);
    },

    findPrevious: () => {
        if (AppState._globalHighlights === 0 && AppState.activePropertyFilters.length === 0) return;

        if (AppState.searchFilter && typeof SidebarManager !== 'undefined' && SidebarManager.SearchHistory) {
            const inputEl = document.getElementById('searchInput');
            SidebarManager.SearchHistory.add((inputEl && inputEl.value) ? inputEl.value : AppState.searchFilter);
        }

        if (AppState._highlightSyncBetween) {
            AppState._highlightSyncBetween = false;
            if (AppState._currentHighlightIndex >= 0 && AppState._currentHighlightIndex < AppState._totalHighlights) {
                AppState._focusHighlight(AppState._currentHighlightIndex);
                return;
            }
        }

        AppState._currentHighlightIndex--;
        
        if (AppState._currentHighlightIndex < 0) {
            const prevNoteId = AppState._findNextNoteWithMatches(-1);
            if (prevNoteId && prevNoteId !== AppState.currentNoteId) {
                AppState._currentHighlightIndex = -1; 
                UI.selectNote(prevNoteId);
                return;
            } else {
                AppState._currentHighlightIndex = AppState._totalHighlights - 1;
            }
        }
        AppState._focusHighlight(AppState._currentHighlightIndex);
    },

    _findNextNoteWithMatches: (direction = 1) => {
        const flatNotes = [];
        const visited = new Set();

        const addNoteWithDescendants = (noteId) => {
            if (visited.has(noteId)) return;
            visited.add(noteId);
            const n = Store.getNote(noteId);
            if (!n || n.deletedAt) return;
            flatNotes.push(n);

            // Raccoglie ricorsivamente tutte le sotto-note discendenti
            const children = AppState.notes.filter(c => c.parentId === noteId && !c.deletedAt);
            children.forEach(c => addNoteWithDescendants(c.id));
        };

        if (AppState.showDbNotesInTree) {
            // Scheda dedicata "Database": scorre tutti i database e le relative record note
            AppState.getRelationalDatabaseIds().forEach(dbId => {
                const dbState = AppState.databases[dbId];
                if (dbState && !dbState.isPivot && !dbState.isLinkedView) {
                    const dbNotes = AppState.notes.filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === dbId && !n.parentId);
                    dbNotes.forEach(rn => addNoteWithDescendants(rn.id));
                }
            });
        } else {
            // Scheda standard "Note":
            // 1. Radici standard e relativi discendenti
            const roots = AppState.notes.filter(n => n.parentId === null && !n.deletedAt && !n.isRecordNote);
            roots.forEach(r => {
                addNoteWithDescendants(r.id);

                // Se la nota ospita database incorporati legittimi (lo spazio \s esclude data-ref-id delle citazioni)
                if (r.content && r.content.includes('adv_tbl_')) {
                    const dbRegex = /\sid=["'](adv_tbl_[a-zA-Z0-9_]+)["']/g;
                    let match;
                    while ((match = dbRegex.exec(r.content)) !== null) {
                        if (match[1].includes('_cited_')) continue;
                        const dbId = match[1];
                        const dbNotes = AppState.notes.filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === dbId && !n.parentId);
                        dbNotes.forEach(rn => addNoteWithDescendants(rn.id));
                    }
                }
            });

            // 2. Include in sequenza tutte le record note dei database non ancora visitate
            AppState.notes.forEach(n => {
                if (!n.deletedAt && n.isRecordNote && !visited.has(n.id)) {
                    addNoteWithDescendants(n.id);
                }
            });
        }

        if (flatNotes.length === 0) return null;

        let currentIndex = flatNotes.findIndex(n => n.id === AppState.currentNoteId);
        if (currentIndex === -1) currentIndex = 0;

        const searchTerms = AppState.parseSearchTerms(AppState.searchFilter).map(t => t.toLowerCase());
        const hasTerms = searchTerms.length > 0;
        const activePropFilters = AppState.activePropertyFilters || [];
        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];

        let i = currentIndex;
        for (let count = 0; count < flatNotes.length; count++) {
            i += direction;
            if (i >= flatNotes.length) i = 0;
            if (i < 0) i = flatNotes.length - 1;

            const note = flatNotes[i];
            let isValidMatch = true;

            // 1. Controllo Filtri Proprietà (Tag) tramite motore unificato
            if (activePropFilters.length > 0) {
                const sysRow = (propsDb && Array.isArray(propsDb.rows))
                    ? propsDb.rows.find(r => r && r.cells && r.cells['sys_c_note'] === note.id)
                    : null;
                isValidMatch = AppState.matchesPropertyFilters(sysRow, activePropFilters);
            }

            // 2. Controllo Filtri Testuali (rispettando multiSearchScope) e Toggles Speciali
            if (isValidMatch) {
                let textMatch = false;
                let bookmarkMatch = false;
                let favoriteMatch = false;

                if (hasTerms) {
                    if (searchTerms.length > 1 && typeof UI !== 'undefined' && typeof UI.matchesMultiTermScope === 'function') {
                        textMatch = UI.matchesMultiTermScope(note, searchTerms, AppState.multiSearchScope || 'paragraph');
                    } else {
                        const normTitle = (note.title || "").toLowerCase().replace(/\u00A0/g, ' ');
                        const normContent = UI.extractSearchableText(note.content || "").toLowerCase();
                        textMatch = searchTerms.every(t => normTitle.includes(t) || normContent.includes(t));
                    }
                }
                
                if (AppState.showBookmarksInTree) {
                    bookmarkMatch = note.content && note.content.includes('adv-bookmark-marker');
                }
                if (AppState.showFavoritesInTree) {
                    favoriteMatch = note.isMarked === true;
                }

                if (hasTerms) {
                    if (AppState.showFavoritesInTree && AppState.showBookmarksInTree) isValidMatch = textMatch && favoriteMatch && bookmarkMatch;
                    else if (AppState.showFavoritesInTree) isValidMatch = textMatch && favoriteMatch;
                    else if (AppState.showBookmarksInTree) isValidMatch = textMatch && bookmarkMatch;
                    else isValidMatch = textMatch;
                } else {
                    if (AppState.showFavoritesInTree && AppState.showBookmarksInTree) isValidMatch = favoriteMatch && bookmarkMatch;
                    else if (AppState.showFavoritesInTree) isValidMatch = favoriteMatch;
                    else if (AppState.showBookmarksInTree) isValidMatch = bookmarkMatch;
                }
            }

            if (isValidMatch) {
                return note.id;
            }
        }
        return null;
    },

    resolveInitialHighlightFromPosition: () => {
        const editor = document.getElementById('noteContent');
        const scrollArea = document.getElementById('editorScrollContent');
        if (!editor) return 0;

        const marks = editor.querySelectorAll('mark.search-highlight');
        if (marks.length === 0) return 0;

        const areaRect = scrollArea ? scrollArea.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
        const refY = areaRect.top + 8;

        for (let i = 0; i < marks.length; i++) {
            const mRect = marks[i].getBoundingClientRect();
            if (mRect.bottom >= refY) {
                return i;
            }
        }

        return 0;
    },

    syncHighlightToPosition: (useCaret = false) => {
        if (AppState._isAutoScrollingToHighlight || AppState.isSwitchingNote) return;

        const editor = document.getElementById('noteContent');
        const scrollArea = document.getElementById('editorScrollContent');
        const counterEl = document.getElementById('searchCounter');
        if (!editor || !scrollArea) return;

        const marks = editor.querySelectorAll('mark.search-highlight');
        if (marks.length === 0) return;

        const areaRect = scrollArea.getBoundingClientRect();
        const viewTop = areaRect.top + 8;
        const viewBottom = areaRect.bottom - 8;

        // 1. Se richiesto, controlla la posizione esatta del cursore dentro l'editor
        if (useCaret) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
                const caretRange = sel.getRangeAt(0);
                let foundIdx = -1;

                for (let i = 0; i < marks.length; i++) {
                    const markRange = document.createRange();
                    markRange.selectNodeContents(marks[i]);
                    try {
                        if (caretRange.compareBoundaryPoints(Range.START_TO_END, markRange) <= 0) {
                            foundIdx = i;
                            break;
                        }
                    } catch (_) {}
                }

                if (foundIdx === -1) {
                    AppState._currentHighlightIndex = marks.length - 1;
                    AppState._highlightSyncBetween = true;
                    marks.forEach(m => { m.classList.remove('active-highlight'); m.style.backgroundColor = ''; });
                    if (counterEl) counterEl.innerText = `${marks.length}/${marks.length}`;
                    return;
                }

                const mRect = marks[foundIdx].getBoundingClientRect();
                if (mRect.top <= viewBottom && mRect.bottom >= areaRect.top) {
                    AppState._highlightSyncBetween = false;
                    AppState._currentHighlightIndex = foundIdx;
                    AppState._focusHighlight(foundIdx, false);
                } else {
                    AppState._currentHighlightIndex = foundIdx - 1;
                    AppState._highlightSyncBetween = true;
                    marks.forEach(m => { m.classList.remove('active-highlight'); m.style.backgroundColor = ''; });
                    if (counterEl) counterEl.innerText = `${foundIdx}/${marks.length}`;
                }
                return;
            }
        }

        // 2. Altrimenti sincronizza rispetto alla parte visibile dello scroll corrente
        let firstIdx = -1;
        for (let i = 0; i < marks.length; i++) {
            const mRect = marks[i].getBoundingClientRect();
            if (mRect.bottom >= viewTop) {
                firstIdx = i;
                break;
            }
        }

        if (firstIdx === -1) {
            AppState._currentHighlightIndex = marks.length - 1;
            AppState._highlightSyncBetween = true;
            marks.forEach(m => { m.classList.remove('active-highlight'); m.style.backgroundColor = ''; });
            if (counterEl) counterEl.innerText = `${marks.length}/${marks.length}`;
            return;
        }

        const firstRect = marks[firstIdx].getBoundingClientRect();
        if (firstRect.top <= viewBottom) {
            AppState._highlightSyncBetween = false;
            AppState._currentHighlightIndex = firstIdx;
            AppState._focusHighlight(firstIdx, false);
        } else {
            AppState._currentHighlightIndex = firstIdx - 1;
            AppState._highlightSyncBetween = true;
            marks.forEach(m => { m.classList.remove('active-highlight'); m.style.backgroundColor = ''; });
            if (counterEl) counterEl.innerText = `${firstIdx}/${marks.length}`;
        }
    },

    beginAutoScrollHighlight: () => {
        clearTimeout(AppState._autoScrollHighlightTimer);
        AppState._isAutoScrollingToHighlight = true;
        AppState._autoScrollHighlightTimer = setTimeout(() => {
            AppState._isAutoScrollingToHighlight = false;
        }, 900);
    },

    _focusHighlight: (index, shouldScroll = true) => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;
        
        const marks = editor.querySelectorAll('mark.search-highlight');
        if (marks.length === 0) return;

        marks.forEach(m => {
            m.classList.remove('active-highlight');
            m.style.backgroundColor = ''; 
        });

        const targetMark = marks[index];
        if (targetMark) {
            AppState._highlightSyncBetween = false;
            // Delega la formattazione e il contrasto esclusivamente alla classe CSS active-highlight
            targetMark.classList.add('active-highlight');
            targetMark.style.backgroundColor = ''; 
            
            let curr = targetMark;
            while (curr && curr.id !== 'noteContent') {
                if (curr.classList && curr.classList.contains('collapsed')) {
                    curr.classList.remove('collapsed');
                }
                curr = curr.parentNode;
            }
            
            if (shouldScroll) {
                const scrollArea = document.getElementById('editorScrollContent');
                let needsScroll = true;
                if (scrollArea) {
                    const areaRect = scrollArea.getBoundingClientRect();
                    if (areaRect.height > 0) {
                        const markRect = targetMark.getBoundingClientRect();
                        const margin = 24;
                        needsScroll = markRect.top < (areaRect.top + margin) || markRect.bottom > (areaRect.bottom - margin);
                    }
                }
                if (needsScroll) {
                    AppState.beginAutoScrollHighlight();
                    targetMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
            
            const counterEl = document.getElementById('searchCounter');
            if (counterEl) counterEl.innerText = `${index + 1}/${AppState._totalHighlights}`;
        }
    }
};