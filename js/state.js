/**
 * state.js
 * Variabili di stato globale dell'applicazione. Fonte assoluta della verità in RAM.
 * FIX: Logica di match potenziata per gestire *EXISTS* e ricerche testuali fluide.
 */

const AppState = {
    notes: [],
    databases: {}, 
    homeCitations: [],
    templates: [], 
    currentNoteId: null,
    
    workspaceHandle: null, 
    assetsHandle: null,
    
    draggedNoteId: null,
    searchFilter: "",
    activePropertyFilters: [], // Array di { colId, realValue, colName, visualText, colorClass }
    
    fileName: "Nessun Workspace",
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

    findNext: () => {
        if (AppState._globalHighlights === 0 && AppState.activePropertyFilters.length === 0) return;
        
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
        
        if (AppState.showDbNotesInTree) {
            if (AppState.databases) {
                Object.keys(AppState.databases).forEach(dbId => {
                    const dbState = AppState.databases[dbId];
                    if (dbState && !dbState.isPivot && !dbState.isLinkedView && dbState.title !== 'Diario/Log') {
                        const dbNotes = AppState.notes.filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === dbId);
                        flatNotes.push(...dbNotes);
                    }
                });
            }
        } else {
            const traverse = (parentId) => {
                const children = AppState.notes.filter(n => n.parentId === parentId && !n.deletedAt && !n.isRecordNote);
                children.forEach(c => {
                    flatNotes.push(c);
                    traverse(c.id);
                });
            };
            traverse(null);
        }

        if (flatNotes.length === 0) return null;

        let currentIndex = flatNotes.findIndex(n => n.id === AppState.currentNoteId);
        if (currentIndex === -1) currentIndex = 0;

        const term = AppState.searchFilter.toLowerCase();
        const activePropFilters = AppState.activePropertyFilters || [];
        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];

        let i = currentIndex;
        for (let count = 0; count < flatNotes.length; count++) {
            i += direction;
            if (i >= flatNotes.length) i = 0;
            if (i < 0) i = flatNotes.length - 1;

            const note = flatNotes[i];
            let isValidMatch = true;

            // 1. Controllo Filtri Proprietà (Tag)
            if (activePropFilters.length > 0) {
                if (!propsDb) {
                    isValidMatch = false;
                } else {
                    const sysRow = propsDb.rows.find(r => r.cells['sys_c_note'] === note.id);
                    if (!sysRow) {
                        isValidMatch = false;
                    } else {
                        const satisfiesAll = activePropFilters.every(f => {
                            let cellVal = sysRow.cells[f.colId];
                            
                            // Keyword magica: basta che il campo non sia vuoto
                            if (f.realValue === '*EXISTS*') {
                                if (cellVal === undefined || cellVal === null || cellVal === '') return false;
                                if (Array.isArray(cellVal) && cellVal.length === 0) return false;
                                return true;
                            }

                            // Booleani
                            if (typeof f.realValue === 'boolean') {
                                return (cellVal === true || cellVal === 'true') === f.realValue;
                            }

                            // Array (Multi-select)
                            if (Array.isArray(cellVal)) {
                                return cellVal.some(v => String(v).toLowerCase() === String(f.realValue).toLowerCase());
                            }

                            // Testo/Numero semplice
                            return String(cellVal || '').toLowerCase().includes(String(f.realValue).toLowerCase());
                        });
                        if (!satisfiesAll) isValidMatch = false;
                    }
                }
            }

            // 2. Controllo Filtri Testuali e Toggles Speciali
            if (isValidMatch) {
                let titleMatch = false;
                let contentMatch = false;
                let bookmarkMatch = false;
                let favoriteMatch = false;

                if (term) {
                    titleMatch = (note.title || "").toLowerCase().includes(term);
                    contentMatch = UI.extractSearchableText(note.content || "").toLowerCase().includes(term);
                }
                
                if (AppState.showBookmarksInTree) {
                    bookmarkMatch = note.content && note.content.includes('adv-bookmark-marker');
                }
                if (AppState.showFavoritesInTree) {
                    favoriteMatch = note.isMarked === true;
                }

                if (term) {
                    if (AppState.showFavoritesInTree && AppState.showBookmarksInTree) isValidMatch = (titleMatch || contentMatch) && favoriteMatch && bookmarkMatch;
                    else if (AppState.showFavoritesInTree) isValidMatch = (titleMatch || contentMatch) && favoriteMatch;
                    else if (AppState.showBookmarksInTree) isValidMatch = (titleMatch || contentMatch) && bookmarkMatch;
                    else isValidMatch = titleMatch || contentMatch;
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

    _focusHighlight: (index) => {
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
            targetMark.classList.add('active-highlight');
            
            let curr = targetMark;
            while (curr && curr.id !== 'noteContent') {
                if (curr.classList && curr.classList.contains('collapsed')) {
                    curr.classList.remove('collapsed');
                }
                curr = curr.parentNode;
            }
            
            targetMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            const counterEl = document.getElementById('searchCounter');
            if (counterEl) counterEl.innerText = `${index + 1}/${AppState._totalHighlights}/${AppState._globalHighlights}`;
        }
    }
};