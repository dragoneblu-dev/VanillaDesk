/**
 * ui-notes-lifecycle.js
 * Sottomodulo di UI.
 * Gestione essenziale del ciclo di vita della nota: Creazione, Selezione JIT su disco,
 * Aggiornamento Real-time del contenuto/titolo e Cancellazione sicura nel Cestino.
 * Sincronizzazione atomica del titolo nell'header superiore su due righe (Workspace + Nota attiva).
 * FAST-PATH STESSA NOTA: Quando selectNote viene chiamata per la nota già aperta (es. tasto Apri su citazione
 * o link interno in-page), non distrugge il DOM ma esegue direttamente lo scroll verso l'elemento target
 * garantendo la dis-espansione degli antenati collassati.
 * AUTO-HEAL APERTURA NOTA (CASO C): Controllo mirato ultrarapido tramite regex (ZWS duplicati o intrappolati tra lettere)
 * per avviare la bonifica dei cuscinetti solo in presenza di reali anomalie, evitando scansioni inutili su widget legittimi.
 */

Object.assign(UI, {
    updateCurrentNoteTimer: null,
    _lastHighlightedWidget: null,

    addNote: (parentId = null) => {
        AppState.isSwitchingNote = true;

        if (AppState.currentNoteId) {
            clearTimeout(UI.updateCurrentNoteTimer);
            const scrollArea = document.querySelector('.editor-scroll-content');
            const currentNote = Store.getNote(AppState.currentNoteId);
            
            if (currentNote) {
                if (scrollArea) currentNote._lastScroll = scrollArea.scrollTop;
                
                const editorEl = document.getElementById('noteContent');
                if (editorEl && typeof Editor !== 'undefined' && AppState.isEditMode) {
                    const cleanHtml = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                    if (cleanHtml && cleanHtml !== currentNote.content) {
                        currentNote.content = cleanHtml;
                        currentNote._isDirty = true;
                        currentNote.updatedAt = new Date().toISOString();
                    }
                }
            }
            if (typeof Editor !== 'undefined') Editor.clearHistory();
            if (typeof Store !== 'undefined' && currentNote && (currentNote._isDirty || Store.isDirty)) {
                Store.executePhysicalGarbageCollection();
                Store.triggerAutoSave(false);
            }
        }

        if (AppState.searchFilter) {
            AppState.searchFilter = "";
            const searchInput = document.getElementById('searchInput');
            const searchClear = document.getElementById('searchClearBtn');
            if (searchInput) searchInput.value = "";
            if (searchClear) searchClear.classList.add('hidden');
        }

        const sb = document.getElementById('sidebar');
        if (sb && sb.classList.contains('collapsed')) {
            UI.toggleSidebar(); 
        }

        const now = new Date().toISOString();
        const newNoteId = Store.generateId();
        const initialRevId = Store.generateId();

        const newNote = {
            id: newNoteId, 
            parentId: parentId, 
            title: "",
            content: "<p><br></p>",
            isMarked: false, 
            expanded: true, 
            createdAt: now, 
            updatedAt: now,
            revId: initialRevId,
            _baseRevId: initialRevId,
            _isDraft: true,
            _isDirty: true
        };
        
        AppState.notes.push(newNote);
        if (parentId) { 
            const p = Store.getNote(parentId); 
            if (p) p.expanded = true; 
        }

        if (typeof AdvancedTable !== 'undefined') {
            AdvancedTable.syncSystemPropertiesRow(newNoteId);
        }

        // Impostazione sincrona immediata dello stato attivo
        AppState.currentNoteId = newNoteId;

        if (typeof UI.renderTree !== 'undefined') UI.renderTree();
        
        UI.selectNote(newNote.id, null, null, true);
        
        UI.toggleEditMode(true);
        setTimeout(() => {
            const titleInput = document.getElementById('noteTitle');
            if (titleInput) {
                titleInput.focus();
            }
            if (typeof TemplateManager !== 'undefined') TemplateManager.toggleEmptyOverlay();
        }, 100);
        
        if (typeof Store !== 'undefined') Store.triggerAutoSave(true);
    },

    selectNote: async (id, anchorText = null, refId = null, scrollToTop = false, isHistoryNavigation = false) => {
        // =========================================================================
        // FAST-PATH: NAVIGAZIONE INTERNA ALLA STESSA NOTA GIÀ APERTA A SCHERMO
        // Impedisce la distruzione del DOM vivo e lo sfarfallio se si clicca un elemento
        // o citazione che punta a un capitolo/blocco della nota attualmente attiva.
        // =========================================================================
        if (AppState.currentNoteId === id) {
            AppState.isSwitchingNote = false;
            UI.closeDrawer();
            if (typeof UI.Menu !== 'undefined') UI.Menu.closeAll(true);

            // Sincronizza lo stato in RAM prima di spostare la vista
            if (AppState.isEditMode && typeof Editor !== 'undefined') {
                const curNote = Store.getNote(id);
                const editorEl = document.getElementById('noteContent');
                if (curNote && editorEl) {
                    const cleanHtml = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                    if (cleanHtml && cleanHtml !== curNote.content) {
                        curNote.content = cleanHtml;
                        curNote._isDirty = true;
                    }
                }
            }

            if (refId) {
                const targetEl = document.getElementById(refId) || document.querySelector(`[id^="${refId}_cited_"]`);
                if (targetEl) {
                    // Dis-espande eventuali contenitori collassati per rendere visibile l'elemento
                    let curr = targetEl.parentElement;
                    while (curr && curr.id !== 'noteContent') {
                        if (curr.classList && curr.classList.contains('collapsed')) {
                            curr.classList.remove('collapsed');
                        }
                        curr = curr.parentElement;
                    }

                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetEl.style.transition = 'box-shadow 0.6s ease';
                    targetEl.style.boxShadow = '0 0 0 4px var(--marked-border), 0 0 30px var(--marked-border)';
                    setTimeout(() => {
                        targetEl.style.boxShadow = '';
                        setTimeout(() => targetEl.style.transition = '', 600);
                    }, 800);
                }
                return;
            } else if (anchorText) {
                if (typeof UI.scrollToHeader !== 'undefined') {
                    UI.scrollToHeader(anchorText);
                }
                return;
            } else if (scrollToTop) {
                const scrollArea = document.querySelector('.editor-scroll-content');
                if (scrollArea) scrollArea.scrollTop = 0;
                return;
            }
            return;
        }

        AppState.isSwitchingNote = true;
        
        // Pulizia immediata di qualsiasi evidenziazione drag residua sul pannello laterale
        const tc = document.getElementById('treeContainer');
        if (tc) tc.classList.remove('drag-over-root');

        if (AppState.currentNoteId && AppState.currentNoteId !== id) {
            clearTimeout(UI.updateCurrentNoteTimer);
            const scrollArea = document.querySelector('.editor-scroll-content');
            const currentNote = Store.getNote(AppState.currentNoteId);
            
            if (currentNote) {
                if (scrollArea) currentNote._lastScroll = scrollArea.scrollTop;
                
                // Salva il contenuto della nota precedente SOLO se siamo in modalità modifica e vi è stata reale mutazione
                const editorEl = document.getElementById('noteContent');
                if (editorEl && typeof Editor !== 'undefined' && AppState.isEditMode) {
                    const cleanHtml = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                    if (cleanHtml && cleanHtml !== currentNote.content) {
                        currentNote.content = cleanHtml;
                        currentNote._isDirty = true;
                        currentNote.updatedAt = new Date().toISOString();
                    }
                }
            }
            
            // Salvataggio della nota precedente SOLO SE vi sono modifiche reali in sospeso
            if (typeof Editor !== 'undefined') Editor.clearHistory();
            if (typeof Store !== 'undefined' && currentNote && (currentNote._isDirty || Store.isDirty)) {
                Store.executePhysicalGarbageCollection();
                Store.triggerAutoSave(false);
            }
        }

        if (typeof TableManager !== 'undefined') {
            TableManager.hideTriggers();
            TableManager.hideMenus();
            TableManager.activeCell = null;
            TableManager.currentTable = null;
        }

        UI.closeDrawer();
        if (typeof UI.Menu !== 'undefined') UI.Menu.closeAll(true);

        const rowSelector = document.getElementById('adv-global-row-selector');
        if (rowSelector) rowSelector.classList.remove('visible');

        const contextBtn = document.getElementById('btnContextEdit');
        const openBtn = document.getElementById('btnContextOpenLink');
        if (contextBtn) contextBtn.style.display = 'none';
        if (openBtn) openBtn.style.display = 'none';

        if (typeof Editor !== 'undefined') {
            Editor.clearHistory();
        }

        let note = Store.getNote(id);
        if (!note) { AppState.isSwitchingNote = false; return; }

        // Assegnazione sincrona immediata dell'ID della nota selezionata per garantire la coerenza dello stato
        AppState.currentNoteId = id;

        // Allinea la riga superiore dell'header con il nome della nota appena aperta
        UI.updateHeaderTitles(AppState.fileName, note.title);

        // GESTIONE CRONOLOGIA DI NAVIGAZIONE LINEARE (HISTORY STACK)
        if (!isHistoryNavigation && !note.deletedAt) {
            // Tronca il ramo "avanti" se l'utente naviga verso una nuova nota
            if (UI._navHistoryIndex < UI._navHistory.length - 1) {
                UI._navHistory = UI._navHistory.slice(0, UI._navHistoryIndex + 1);
            }
            // Evita duplicati consecutivi della stessa nota
            if (UI._navHistory.length === 0 || UI._navHistory[UI._navHistory.length - 1] !== id) {
                UI._navHistory.push(id);
                // Limite massimo di sicurezza per la cronologia in memoria
                if (UI._navHistory.length > 80) UI._navHistory.shift();
                UI._navHistoryIndex = UI._navHistory.length - 1;
            }
        }
        UI.updateNavHistoryUI();

        // Se è stata richiesta l'apertura forzata all'inizio (es. doppio click per editare il titolo), azzera la posizione di scroll
        if (scrollToTop) {
            note._lastScroll = 0;
        }

        // 1. VERIFICA JIT DELLA NOTA SU DISCO
        if (AppState.workspaceHandle !== null) {
            if (!note._isDraft) {
                const syncRes = await Store.syncNoteFromDisk(id);
                if (syncRes.status === 'deleted') {
                    const idx = AppState.notes.findIndex(n => n.id === id);
                    if (idx > -1) AppState.notes.splice(idx, 1);
                    if (typeof AdvancedTable !== 'undefined' && AdvancedTable.deleteSystemPropertiesRow) {
                        AdvancedTable.deleteSystemPropertiesRow(id);
                    }
                    if (typeof UI.renderTree !== 'undefined') UI.renderTree();
                    if (typeof UI.showToast !== 'undefined') {
                        UI.showToast("La nota non è più disponibile sul disco.", "warning");
                    }
                    if (AppState.currentNoteId === id) {
                        UI.goHome();
                    }
                    AppState.isSwitchingNote = false;
                    return;
                } else if (syncRes.status === 'success' && syncRes.note) {
                    if (!note._isDirty) {
                        const currentExpanded = note.expanded;
                        const currentTocCollapsed = note._tocCollapsed;
                        const currentLastScroll = note._lastScroll;
                        Object.assign(note, syncRes.note);
                        if (currentExpanded !== undefined) note.expanded = currentExpanded;
                        if (currentTocCollapsed !== undefined) note._tocCollapsed = currentTocCollapsed;
                        if (currentLastScroll !== undefined) note._lastScroll = currentLastScroll;
                        note._baseRevId = syncRes.note.revId || note.revId || Store.generateId();
                        note._isDirty = false;
                    }
                }
            }

            // 2. JIT COMPONENT RECONCILIATION
            if (typeof Store.syncWidgetsForNote === 'function' && note.content) {
                await Store.syncWidgetsForNote(note.content);
            }
        }

        const isTrashed = !!note.deletedAt;

        if (isTrashed || !AppState.continuousEditMode) {
            AppState.isEditMode = false;
        }

        // Rivelazione nota nell'albero gerarchico se non cestinata
        if (!isTrashed) {
            let currParentId = note.parentId;
            while(currParentId) {
                let pNote = Store.getNote(currParentId);
                if(pNote) {
                    pNote.expanded = true;
                    currParentId = pNote.parentId;
                } else {
                    break;
                }
            }
        }

        note._oldTitle = note.title;
        note._oldContent = note.content;

        if (typeof UI.renderTree !== 'undefined') UI.renderTree();
        UI.showEditor(true);

        const titleInput = document.getElementById('noteTitle');
        if (titleInput) {
            titleInput.value = note.title || "";
            
            titleInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!AppState.isEditMode || isTrashed) return;
                    
                    const editorEl = document.getElementById('noteContent');
                    if (editorEl) {
                        editorEl.focus();
                        try {
                            const sel = window.getSelection();
                            const range = document.createRange();
                            
                            if (editorEl.firstChild) {
                                range.setStart(editorEl.firstChild, 0);
                            } else {
                                range.setStart(editorEl, 0);
                            }
                            
                            range.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(range);
                        } catch (err) {}
                    }
                }
            };
        }

        const dateEl = document.getElementById('noteLastUpdate');
        if (dateEl) {
            if (note.updatedAt) {
                dateEl.textContent = UI.formatDate(note.updatedAt);
                dateEl.setAttribute('title', "Modificato il: " + UI.formatDate(note.updatedAt));
                dateEl.style.cursor = 'help';
            } else {
                dateEl.textContent = "";
                dateEl.removeAttribute('title');
                dateEl.style.cursor = 'default';
            }
        }

        let openRecordBtn = document.getElementById('openRecordBtn');
        if (!openRecordBtn) {
            const btnNoteProps = document.getElementById('btnNoteProperties');
            if (btnNoteProps) {
                openRecordBtn = document.createElement('button');
                openRecordBtn.id = 'openRecordBtn';
                openRecordBtn.className = 'icon-btn';
                openRecordBtn.innerHTML = typeof Icons !== 'undefined' ? Icons.tableDatabase : '📊';
                btnNoteProps.parentNode.insertBefore(openRecordBtn, btnNoteProps);
            }
        }

        if (openRecordBtn) {
            if (note.isRecordNote && note.linkedTableId && note.linkedRowId) {
                openRecordBtn.style.display = 'flex';
                openRecordBtn.title = "Visualizza questo Record nel Database";
                openRecordBtn.onclick = () => {
                    if (typeof AdvancedTable !== 'undefined') {
                        AdvancedTable.openRecordView(note.linkedTableId, note.linkedRowId);
                    }
                };
            } else {
                openRecordBtn.style.display = 'none';
            }
        }

        const btnNoteProps = document.getElementById('btnNoteProperties');
        if (btnNoteProps) {
            btnNoteProps.onclick = () => {
                if (typeof AdvancedTable !== 'undefined') {
                    AdvancedTable.openRecordView('SYS_PROPERTIES_DB', 'sys_r_' + id);
                }
            };
        }
        
        // Calcolo e aggiornamento atomico dei badge dell'header all'apertura della nota
        UI.checkAndUpdatePropertiesIcon(id);
        UI.updateNoteInfoIcon(id);

        const contentEl = document.getElementById('noteContent');
        if (contentEl) {
            contentEl.innerHTML = note.content || "<p><br></p>";

            // CASO C: AUTO-GUARIGIONE SELETTIVA DEI CUSCINETTI ALL'APERTURA DELLA NOTA
            // Controllo regex ultrarapido a zero overhead (~0.03ms): se la nota contiene ZWS legittimi per widget inline,
            // il test dà false ed esce immediatamente senza alterare il DOM. Se rileva ZWS duplicati (\u200B{2,})
            // o ZWS intrappolati tra lettere di parole, avvia la bonifica mirata di ensureInlineWidgetBuffers.
            const rawMarkup = contentEl.innerHTML;
            if (rawMarkup && rawMarkup.includes('\u200B')) {
                const hasZwsAnomaly = /\u200B{2,}|[a-zA-Z0-9À-ÿ]\u200B+[a-zA-Z0-9À-ÿ]/.test(rawMarkup);
                if (hasZwsAnomaly && typeof Editor !== 'undefined' && typeof Editor.ensureInlineWidgetBuffers === 'function') {
                    Editor.ensureInlineWidgetBuffers(contentEl);
                }
            }

            if (typeof Editor !== 'undefined' && Editor.hydrateMedia) {
                Editor.hydrateMedia(contentEl);
            }

            if (AppState.noWrapMode) contentEl.classList.add('no-wrap');
            else contentEl.classList.remove('no-wrap');

            UI.toggleEditMode((!isTrashed && AppState.continuousEditMode) ? true : false);

            if (typeof CitationManager !== 'undefined') CitationManager.renderLiveCitations();

            if (AppState.searchFilter && AppState.searchFilter.length > 0) {
                if (typeof Editor !== 'undefined') Editor.applyHighlight(contentEl, AppState.searchFilter);
            }
        }

        // Aggiornamento interfaccia per note cestinate o attive
        UI._updateTrashedNoteUI(note);

        // Rendering delle proprietà del record o tag della pagina in cima alla nota
        if (typeof UI.renderPageHeaderProperties === 'function') {
            UI.renderPageHeaderProperties(note);
        }

        UI.renderInlineFootnotes();
        UI.updateBreadcrumb(note);
        UI.updateMarkBtn(note.isMarked);
        
        if (typeof UI.highlightTreeNode !== 'undefined') UI.highlightTreeNode(id);

        if (refId) {
            setTimeout(() => {
                const targetEl = document.getElementById(refId) || document.querySelector(`[id^="${refId}_cited_"]`);
                if (targetEl) {
                    let curr = targetEl.parentElement;
                    while (curr && curr.id !== 'noteContent') {
                        if (curr.classList && curr.classList.contains('collapsed')) {
                            curr.classList.remove('collapsed');
                        }
                        curr = curr.parentElement;
                    }

                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetEl.style.transition = 'box-shadow 0.6s ease';
                    targetEl.style.boxShadow = '0 0 0 4px var(--marked-border), 0 0 30px var(--marked-border)';
                    setTimeout(() => {
                        targetEl.style.boxShadow = '';
                        setTimeout(() => targetEl.style.transition = '', 600);
                    }, 800);
                }
                setTimeout(() => { AppState.isSwitchingNote = false; UI.updateTOCScrollSpy(); }, 150);
            }, 150);
        } else if (anchorText) {
            setTimeout(() => {
                if (typeof UI.scrollToHeader !== 'undefined') UI.scrollToHeader(anchorText);
                setTimeout(() => { AppState.isSwitchingNote = false; UI.updateTOCScrollSpy(); }, 100);
            }, 150);
        } else if (AppState.searchFilter && AppState.searchFilter.length > 0) {
            AppState._totalHighlights = contentEl.querySelectorAll('mark.search-highlight').length;
            const searchCounter = document.getElementById('searchCounter');
            
            if (searchCounter) {
                if (AppState._totalHighlights > 0) {
                    if (AppState._currentHighlightIndex === -1) AppState._currentHighlightIndex = AppState._totalHighlights - 1;
                    else if (AppState._currentHighlightIndex >= AppState._totalHighlights) AppState._currentHighlightIndex = 0;
                    
                    searchCounter.innerText = `${AppState._currentHighlightIndex + 1}/${AppState._totalHighlights}`;
                    
                    const marks = contentEl.querySelectorAll('mark.search-highlight');
                    const targetMark = marks[AppState._currentHighlightIndex];
                    if (targetMark) {
                        targetMark.classList.add('active-highlight');
                        targetMark.style.backgroundColor = 'var(--marked-border)';
                        
                        let curr = targetMark;
                        while (curr && curr.id !== 'noteContent') {
                            if (curr.classList && curr.classList.contains('collapsed')) curr.classList.remove('collapsed');
                            curr = curr.parentNode;
                        }
                        setTimeout(() => targetMark.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                    }
                } else {
                    searchCounter.innerText = "0/0";
                }
            }
            setTimeout(() => { AppState.isSwitchingNote = false; UI.updateTOCScrollSpy(); }, 300);
        } else if (AppState.showBookmarksInTree) {
            setTimeout(() => {
                const bookmark = contentEl.querySelector('.adv-bookmark-marker');
                if (bookmark) {
                    bookmark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const icon = bookmark.querySelector('.bookmark-icon');
                    if (icon) {
                        icon.style.transition = 'transform 0.6s, color 0.6s';
                        icon.style.transform = 'scale(1.8)';
                        icon.style.color = 'var(--danger-color)';
                        setTimeout(() => { 
                           icon.style.transform = 'none'; 
                           icon.style.color = ''; 
                        }, 800);
                    }
                }
                setTimeout(() => { AppState.isSwitchingNote = false; UI.updateTOCScrollSpy(); }, 100);
            }, 150);
        } else {
            setTimeout(() => {
                const scrollArea = document.querySelector('.editor-scroll-content');
                if (scrollArea) {
                    if (!scrollToTop && note._lastScroll !== undefined) 
                        scrollArea.scrollTop = note._lastScroll;
                    else 
                        scrollArea.scrollTop = 0;
                }
                setTimeout(() => { AppState.isSwitchingNote = false; UI.updateTOCScrollSpy(); }, 100);
            }, 150);
        }

        setTimeout(() => {
            if (AppState.showMinimap && typeof UI.Minimap !== 'undefined') UI.Minimap.sync();
        }, 150);

        setTimeout(() => {
            if (typeof TemplateManager !== 'undefined') TemplateManager.toggleEmptyOverlay();
        }, 160);
    },

    updateCurrentNote: () => {
        if (!AppState.currentNoteId) return;

        const note = Store.getNote(AppState.currentNoteId);
        if (!note || note.deletedAt) return; 

        const titleInput = document.getElementById('noteTitle');
        if (titleInput && note.title !== titleInput.value) {
            note.title = titleInput.value;
            note._isDirty = true;
        }

        // Sincronizza reattivamente in tempo reale il titolo della nota nell'header su due righe
        UI.updateHeaderTitles(AppState.fileName, note.title);

        const treeTitleContainer = document.querySelector(`.node-wrapper[data-id="${AppState.currentNoteId}"] > .node-content .node-title`);
        if (treeTitleContainer) {
            let customIcon = Icons.file;
            let iconColorStr = '';
            const hasBookmark = note.content && note.content.includes('adv-bookmark-marker');

            if (note.isRecordNote) {
                customIcon = Icons.recordPage;
                iconColorStr = 'color:var(--record-color);';
            } else {
                if (note.isMarked && hasBookmark) {
                    customIcon = Icons.starFilled;
                    iconColorStr = 'color:var(--tx-c4);'; 
                } else if (note.isMarked) {
                    customIcon = Icons.starFilled;
                    iconColorStr = 'color:var(--marked-border);'; 
                } else if (hasBookmark) {
                    iconColorStr = 'color:var(--tx-c4);'; 
                }
            }

            treeTitleContainer.innerHTML = `<span style="opacity:0.8; ${iconColorStr}">${customIcon}</span> <span>${note.title || I18n.t('editor.untitled')}</span>`;
        }

        UI.updateBreadcrumb(note);

        clearTimeout(UI.updateCurrentNoteTimer);
        UI.updateCurrentNoteTimer = setTimeout(() => {
            note.updatedAt = new Date().toISOString();
            note._isDirty = true;

            const dateEl = document.getElementById('noteLastUpdate');
            if (dateEl) {
                dateEl.textContent = UI.formatDate(note.updatedAt);
                dateEl.setAttribute('title', "Modificato il: " + UI.formatDate(note.updatedAt));
            }

            if (note.isRecordNote && note.linkedTableId && note.linkedRowId) {
                if (typeof AdvancedTable !== 'undefined') {
                    AdvancedTable.touchRecordUpdate(note.linkedTableId, note.linkedRowId);

                    // PROPAGAZIONE TITOLO NOTA RECORD ALLA TABELLA COLLEGATA
                    const realTableId = AdvancedTable._resolveSourceId(note.linkedTableId);
                    const dbState = AdvancedTable.getState(realTableId);
                    if (dbState && Array.isArray(dbState.columns)) {
                        const recCol = dbState.columns.find(c => c.type === 'record_note');
                        const row = (dbState.rows || []).find(r => r.id === note.linkedRowId);
                        if (row && recCol) {
                            if (typeof AdvancedTable.buildVirtualRow === 'function') {
                                const vRow = AdvancedTable.buildVirtualRow(realTableId, row, dbState);
                                row.virtualCells = vRow.virtualCells;
                            }
                        }
                    }
                    AdvancedTable.updateDependentViews(realTableId);
                    const tableEl = document.getElementById(note.linkedTableId);
                    if (tableEl && typeof AdvancedTable.renderTable === 'function') {
                        AdvancedTable.renderTable(note.linkedTableId);
                    }
                }
            }

            if (note.isRecordNote && note.linkedTableId && typeof AdvancedAutomations !== 'undefined') {
                if (note.title !== note._oldTitle) {
                    const realTableId = typeof AdvancedTable !== 'undefined' ? AdvancedTable._resolveSourceId(note.linkedTableId) : note.linkedTableId;
                    const dbState = typeof AdvancedTable !== 'undefined' ? AdvancedTable.getState(realTableId) : null;
                    const recCol = dbState && dbState.columns ? dbState.columns.find(c => c.type === 'record_note') : null;
                    const colField = recCol ? `${recCol.id}_TITLE` : 'TITLE';

                    AdvancedAutomations.triggerFromNoteChange(note.linkedTableId, note.linkedRowId, colField, note._oldTitle, note.title);
                    note._oldTitle = note.title;
                }
            }

            if (typeof Store !== 'undefined') Store.triggerAutoSave();
        }, 500);
    },

    deleteCurrentNote: async () => {
        if (!AppState.currentNoteId) return; 
        
        const note = Store.getNote(AppState.currentNoteId);
        if (!note || note.deletedAt) return;

        if (!confirm(I18n.t('notes_utils.confirm_move_trash'))) return; 
        
        const parentIdToReturn = note.parentId;
        const targetId = AppState.currentNoteId;

        if (note && note.isRecordNote && note.linkedTableId && note.linkedRowId && typeof AdvancedTable !== 'undefined') {
            let dbState = AdvancedTable.getState(note.linkedTableId);
            if (dbState && dbState.rows) {
                const row = dbState.rows.find(r => r.id === note.linkedRowId);
                if (row) {
                    dbState.columns.filter(c => c.type === 'record_note').forEach(c => {
                        if (row.cells[c.id] === note.id) row.cells[c.id] = '';
                    });
                    AdvancedTable.setState(note.linkedTableId, dbState);
                }
            }
        }

        const now = Date.now();
        const affectedNotes = [];
        const traverse = (id) => { 
            const n = Store.getNote(id);
            if (n) {
                n.deletedAt = now;
                n._isDirty = true;
                affectedNotes.push(n);
                if (typeof AdvancedTable !== 'undefined') AdvancedTable.deleteSystemPropertiesRow(id);
                AppState.notes.filter(child => child.parentId === id).forEach(child => traverse(child.id));
            }
        };
        traverse(targetId);
        
        if (typeof UI.renderTree !== 'undefined') UI.renderTree(); 

        // Se l'operazione coinvolge molte sotto-note (> 3), mostra all'utente il progresso reale della scrittura su disco
        const showBatchModal = affectedNotes.length > 3 && AppState.workspaceHandle;
        if (showBatchModal) {
            UI.ProgressModal.show(
                I18n.t('progress.moving_to_trash') || "Spostamento nel Cestino in corso...",
                I18n.t('progress.do_not_close') || "Scrittura modifiche su disco. Non chiudere l'applicazione...",
                0,
                affectedNotes.length
            );
        }

        try {
            if (typeof Store !== 'undefined') {
                await Store.saveToFile((p) => {
                    if (showBatchModal) {
                        UI.ProgressModal.update(p.message, p.current, p.total);
                    }
                });
            }
        } finally {
            if (showBatchModal) {
                UI.ProgressModal.hide();
            }
        }

        UI.showToast(I18n.t('notes_utils.toast_moved_trash'), "warning");

        if (parentIdToReturn && Store.getNote(parentIdToReturn) && !Store.getNote(parentIdToReturn).deletedAt) {
            UI.selectNote(parentIdToReturn);
        } else {
            UI.goHome();
        }
    },

    handleEditorInput: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        if (!note || note.deletedAt) return; 

        const contentEl = document.getElementById('noteContent');
        
        if (contentEl) {
            const newContent = Editor.minifyHTMLForStorage(contentEl.innerHTML);
            if (note.content !== newContent) {
                note.content = newContent;
                note._isDirty = true;
            }
        }
        note.updatedAt = new Date().toISOString();
        
        const dateEl = document.getElementById('noteLastUpdate');
        if (dateEl) {
            dateEl.textContent = UI.formatDate(note.updatedAt);
            dateEl.setAttribute('title', "Modificato il: " + UI.formatDate(note.updatedAt));
        }

        if (typeof TemplateManager !== 'undefined') TemplateManager.toggleEmptyOverlay();

        clearTimeout(UI.updateCurrentNoteTimer);
        UI.updateCurrentNoteTimer = setTimeout(() => {
            if (typeof UI.renderTree !== 'undefined') UI.renderTree();
            UI.renderInlineFootnotes();
            if (typeof CitationManager !== 'undefined') CitationManager.renderLiveCitations();

            if (note.isRecordNote && note.linkedTableId && note.linkedRowId) {
                if (typeof AdvancedTable !== 'undefined') {
                    AdvancedTable.touchRecordUpdate(note.linkedTableId, note.linkedRowId);
                }
            }

            if (note.isRecordNote && note.linkedTableId && typeof AdvancedAutomations !== 'undefined') {
                if (note.content !== note._oldContent) {
                    const oldPlain = UI.extractSearchableText(note._oldContent);
                    const newPlain = UI.extractSearchableText(note.content);
                    const realTableId = typeof AdvancedTable !== 'undefined' ? AdvancedTable._resolveSourceId(note.linkedTableId) : note.linkedTableId;
                    const dbState = typeof AdvancedTable !== 'undefined' ? AdvancedTable.getState(realTableId) : null;
                    const recCol = dbState && dbState.columns ? dbState.columns.find(c => c.type === 'record_note') : null;
                    const colField = recCol ? `${recCol.id}_CONTENT` : 'CONTENT';

                    AdvancedAutomations.triggerFromNoteChange(note.linkedTableId, note.linkedRowId, colField, oldPlain, newPlain);
                    note._oldContent = note.content;
                }
            }

            if (AppState.showMinimap && typeof UI.Minimap !== 'undefined') {
                UI.Minimap.sync();
            }

            UI.updateTOCScrollSpy();

        }, 500);

        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    }
});