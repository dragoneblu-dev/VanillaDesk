/**
 * ui-notes-lifecycle.js
 * Sottomodulo di UI.
 * Gestione essenziale del ciclo di vita della nota: Selezione JIT su disco, Creazione, Home, Salto al Widget.
 * Gestione sicura e visiva delle note visualizzate dal Cestino (Read-Only Guard, Danger Banner e Restore).
 * Tracciamento del dirty state volatile (_isDirty, _isDraft) su modifiche al corpo testo e titolo.
 */

Object.assign(UI, {
    updateCurrentNoteTimer: null,
    _lastHighlightedWidget: null,

    restoreNoteFromBanner: (noteId) => {
        if (typeof UI.Trash !== 'undefined' && typeof UI.Trash.restore === 'function') {
            UI.Trash.restore(noteId);
            UI.closeDrawer();
            UI.selectNote(noteId);
        }
    },

    _updateTrashedNoteUI: (note) => {
        const editorScrollContent = document.getElementById('editorScrollContent');
        const titleInput = document.getElementById('noteTitle');
        const editToggleBtn = document.getElementById('editToggleBtn');
        let banner = document.getElementById('trashedNoteWarningBanner');

        if (note && note.deletedAt) {
            // 1. Iniezione o visualizzazione del Banner di Pericolo
            if (!banner && editorScrollContent && titleInput) {
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
                editorScrollContent.insertBefore(banner, titleInput);
            }

            if (banner) {
                banner.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; color: var(--danger-color); font-weight: bold; font-size: 0.85rem;">
                        <span style="display: inline-flex;">${typeof Icons !== 'undefined' ? Icons.trash : '🗑️'}</span>
                        <span>Questa nota si trova nel Cestino (Sola Lettura). I database al suo interno continuano a funzionare per i collegamenti esterni.</span>
                    </div>
                    <button class="btn" style="background: var(--danger-color); color: white; border: none; padding: 4px 10px; font-weight: bold; cursor: pointer; flex-shrink: 0;" onclick="UI.restoreNoteFromBanner('${note.id}')">
                        <span style="display: inline-flex; align-items: center; gap: 4px;">${typeof Icons !== 'undefined' ? Icons.restore : '↺'} Ripristina Nota</span>
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
    },

    addNote: (parentId = null) => {
        AppState.isSwitchingNote = true;

        if (AppState.currentNoteId) {
            clearTimeout(UI.updateCurrentNoteTimer);
            const scrollArea = document.querySelector('.editor-scroll-content');
            const currentNote = Store.getNote(AppState.currentNoteId);
            
            if (currentNote) {
                if (scrollArea) currentNote._lastScroll = scrollArea.scrollTop;
                
                const editorEl = document.getElementById('noteContent');
                if (editorEl && typeof Editor !== 'undefined') {
                    const cleanHtml = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                    if (currentNote.content !== cleanHtml) {
                        currentNote.content = cleanHtml;
                        currentNote._isDirty = true;
                    }
                    currentNote.updatedAt = new Date().toISOString();
                }
            }
            if (typeof Editor !== 'undefined') Editor.clearHistory();
            if (typeof Store !== 'undefined') {
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
        const newNote = {
            id: newNoteId, 
            parentId: parentId, 
            title: "",
            content: "<p><br></p>",
            isMarked: false, 
            expanded: true, 
            createdAt: now, 
            updatedAt: now,
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

        if (typeof UI.renderTree !== 'undefined') UI.renderTree();
        
        UI.selectNote(newNote.id);
        
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

    selectNote: async (id, anchorText = null, refId = null) => {
        AppState.isSwitchingNote = true;
        
        if (AppState.currentNoteId && AppState.currentNoteId !== id) {
            clearTimeout(UI.updateCurrentNoteTimer);
            const scrollArea = document.querySelector('.editor-scroll-content');
            const currentNote = Store.getNote(AppState.currentNoteId);
            
            if (currentNote) {
                if (scrollArea) currentNote._lastScroll = scrollArea.scrollTop;
                
                const editorEl = document.getElementById('noteContent');
                if (editorEl && typeof Editor !== 'undefined') {
                    const cleanHtml = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                    if (currentNote.content !== cleanHtml) {
                        currentNote.content = cleanHtml;
                        currentNote._isDirty = true;
                    }
                    currentNote.updatedAt = new Date().toISOString();
                }
            }
            
            // GARBAGE COLLECTION: Azzera la memoria RAM e scansiona il disco
            if (typeof Editor !== 'undefined') Editor.clearHistory();
            if (typeof Store !== 'undefined') {
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

        // VERIFICA JIT SU DISCO (SPECIFICA TECNICA PUNTO 4)
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
                        Object.assign(note, syncRes.note);
                        note._isDirty = false;
                    }
                }
            }
        }

        const isTrashed = !!note.deletedAt;

        if (isTrashed || !AppState.continuousEditMode) {
            AppState.isEditMode = false;
        }

        AppState.currentNoteId = id;

        // NAVIGAZIONE LINK: Apriamo forzatamente l'albero per rivelare la nota di destinazione se non cestinata
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

        // Renderizza l'albero PRIMA di applicare l'highlight visivo
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
        
        UI.checkAndUpdatePropertiesIcon(id);

        const contentEl = document.getElementById('noteContent');
        if (contentEl) {
            contentEl.innerHTML = note.content || "<p><br></p>";
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

            if (typeof Editor !== 'undefined' && Editor.saveSnapshot) Editor.saveSnapshot();
        }

        // Aggiornamento interfaccia per note cestinate o attive
        UI._updateTrashedNoteUI(note);

        UI.renderInlineFootnotes();
        UI.updateBreadcrumb(note);
        UI.updateMarkBtn(note.isMarked);
        
        if (typeof UI.highlightTreeNode !== 'undefined') UI.highlightTreeNode(id);

        if (refId) {
            setTimeout(() => {
                const targetEl = document.getElementById(refId);
                if (targetEl) {
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
                    
                    searchCounter.innerText = `${AppState._currentHighlightIndex + 1}/${AppState._totalHighlights}/${AppState._globalHighlights}`;
                    
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
                    searchCounter.innerText = `0/0/${AppState._globalHighlights}`;
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
                    if (note._lastScroll !== undefined) 
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

    goHome: () => {
        AppState.isSwitchingNote = true;
        if (typeof UI.updateCurrentNoteTimer !== 'undefined') clearTimeout(UI.updateCurrentNoteTimer);

        if (AppState.currentNoteId) {
            const scrollArea = document.querySelector('.editor-scroll-content');
            if (scrollArea) {
                const currentNote = Store.getNote(AppState.currentNoteId);
                if (currentNote) currentNote._lastScroll = scrollArea.scrollTop;
            }
            
            const editorEl = document.getElementById('noteContent');
            if (editorEl && typeof Editor !== 'undefined') {
                const currentNote = Store.getNote(AppState.currentNoteId);
                if (currentNote) {
                    const cleanHtml = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                    if (currentNote.content !== cleanHtml) {
                        currentNote.content = cleanHtml;
                        currentNote._isDirty = true;
                    }
                    currentNote.updatedAt = new Date().toISOString();
                }
                Editor.clearHistory();
            }
            if (typeof Store !== 'undefined') {
                Store.executePhysicalGarbageCollection();
                Store.triggerAutoSave(true);
            }
        }

        UI.closeDrawer();
        if (typeof UI.Menu !== 'undefined') UI.Menu.closeAll(true);
        if (typeof TableManager !== 'undefined') {
            TableManager.hideTriggers();
            TableManager.hideMenus();
        }

        AppState.currentNoteId = null;
        AppState.isEditMode = false;

        document.querySelectorAll('.node-content').forEach(el => el.classList.remove('active'));

        UI._updateTrashedNoteUI(null);
        UI.showEditor(false);
        if (typeof UI.Minimap !== 'undefined') UI.Minimap.sync(); 
        
        setTimeout(() => {
            AppState.isSwitchingNote = false;
        }, 150);
    },

    updateCurrentNote: () => {
        if (!AppState.currentNoteId) return;

        const note = Store.getNote(AppState.currentNoteId);
        if (!note || note.deletedAt) return; // Blocco modifiche su note cestinate

        const titleInput = document.getElementById('noteTitle');
        if (titleInput && note.title !== titleInput.value) {
            note.title = titleInput.value;
            note._isDirty = true;
        }

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

            treeTitleContainer.innerHTML = `<span style="opacity:0.8; ${iconColorStr}">${customIcon}</span> <span>${note.title || 'Senza Titolo'}</span>`;
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
                }
            }

            if (note.isRecordNote && note.linkedTableId && typeof AdvancedAutomations !== 'undefined') {
                if (note.title !== note._oldTitle) {
                    AdvancedAutomations.triggerFromNoteChange(note.linkedTableId, note.linkedRowId, 'TITLE', note._oldTitle, note.title);
                    note._oldTitle = note.title;
                }
            }

            if (typeof Store !== 'undefined') Store.triggerAutoSave();
        }, 500);
    },

    deleteCurrentNote: () => {
        if (!AppState.currentNoteId) return; 
        
        const note = Store.getNote(AppState.currentNoteId);
        if (!note || note.deletedAt) return;

        if (!confirm("Spostare questa nota e tutte le sue sotto-note nel cestino?")) return;
        
        const parentIdToReturn = note.parentId;

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
        const traverse = (id) => { 
            const n = Store.getNote(id);
            if (n) {
                n.deletedAt = now;
                n._isDirty = true;
                if (typeof AdvancedTable !== 'undefined') AdvancedTable.deleteSystemPropertiesRow(id);
                AppState.notes.filter(child => child.parentId === id).forEach(child => traverse(child.id));
            }
        };
        traverse(AppState.currentNoteId);
        
        if (typeof UI.renderTree !== 'undefined') UI.renderTree(); 
        if (typeof Store !== 'undefined') Store.triggerAutoSave();
        UI.showToast("Nota spostata nel cestino.", "warning");

        if (parentIdToReturn && Store.getNote(parentIdToReturn) && !Store.getNote(parentIdToReturn).deletedAt) {
            UI.selectNote(parentIdToReturn);
        } else {
            UI.goHome();
        }
    },

    handleEditorInput: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        if (!note || note.deletedAt) return; // Blocco modifiche su note cestinate

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
                    AdvancedAutomations.triggerFromNoteChange(note.linkedTableId, note.linkedRowId, 'CONTENT', oldPlain, newPlain);
                    note._oldContent = note.content;
                }
            }

            if (AppState.showMinimap && typeof UI.Minimap !== 'undefined') {
                UI.Minimap.sync();
            }

            UI.updateTOCScrollSpy();

        }, 500);

        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    },

    jumpToWidget: (widgetId) => {
        if (!AppState.notes) return;

        let targetNoteId = null;
        let targetNoteInstance = null;
        
        for (let i = 0; i < AppState.notes.length; i++) {
            const note = AppState.notes[i];
            if (!note.content) continue;
            
            if (note.content.includes(`id="${widgetId}"`) || note.content.includes(`id='${widgetId}'`) || note.content.includes(`id="${widgetId}_cited_`)) {
                targetNoteId = note.id;
                targetNoteInstance = note;
                break;
            }
        }

        const handleResolution = () => {
            const trueId = widgetId.split('_cited_')[0];
            if (trueId === 'SYS_PROPERTIES_DB') {
                alert("Questa è la struttura di base delle Proprietà e Tag delle Note.\nNon è un database visibile, ma agisce dietro le quinte.\n\nPer modificare i Tag di una nota, apri le proprietà direttamente dalla barra degli strumenti in cima all'editor.");
                return;
            }

            let el = document.getElementById(widgetId) || document.querySelector(`[id^="${widgetId}_cited_"]`);
            
            if (el && (el.classList.contains('adv-widget-shell') || el.classList.contains('adv-table-wrapper') || el.classList.contains('simple-table-wrapper'))) {
                
                if (UI._lastHighlightedWidget && document.body.contains(UI._lastHighlightedWidget)) {
                    UI._lastHighlightedWidget.style.boxShadow = '';
                    UI._lastHighlightedWidget.style.transition = '';
                }

                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                el.style.transition = 'box-shadow 0.6s ease';
                el.style.boxShadow = '0 0 0 4px var(--marked-border), 0 0 30px var(--marked-border)';
                UI._lastHighlightedWidget = el;

                setTimeout(() => {
                    if (el === UI._lastHighlightedWidget) {
                        el.style.boxShadow = '';
                        setTimeout(() => el.style.transition = '', 600);
                        UI._lastHighlightedWidget = null;
                    }
                }, 800);
                
                return;
            }

            const orphanState = AppState.databases ? AppState.databases[widgetId] : null;
            
            if (orphanState) {
                const targetInjectionNoteId = targetNoteId || AppState.currentNoteId;
                if (!targetInjectionNoteId) {
                    if (typeof UI.showToast !== 'undefined') UI.showToast("Crea una nota vuota, poi clicca di nuovo per poter recuperare l'elemento.", "warning");
                    return;
                }

                let type = 'database';
                if (widgetId.includes('adv_journal_')) type = 'journal';
                else if (widgetId.includes('adv_code_')) type = 'code';
                else if (widgetId.includes('adv_btnbar_')) type = 'buttonbar';
                else if (orphanState.isPivot) type = 'pivot';

                let shellNode = null;
                if (typeof WidgetManager !== 'undefined') {
                    shellNode = WidgetManager.createShell(type, widgetId);
                } else {
                    shellNode = document.createElement('div');
                    shellNode.id = widgetId;
                    shellNode.className = 'adv-widget-shell adv-table-wrapper';
                    shellNode.setAttribute('data-widget-type', type);
                }

                const targetNoteToCure = Store.getNote(targetInjectionNoteId);
                
                if (targetNoteToCure.content) {
                    const regex = new RegExp(widgetId, 'g');
                    targetNoteToCure.content = targetNoteToCure.content.replace(regex, `${widgetId}_broken`);
                }

                targetNoteToCure.content = (targetNoteToCure.content || '') + '<p><br></p>' + shellNode.outerHTML + '<p><br></p>';
                targetNoteToCure.updatedAt = new Date().toISOString();

                if (targetInjectionNoteId === AppState.currentNoteId) {
                    const editorEl = document.getElementById('noteContent');
                    if (editorEl) {
                        editorEl.innerHTML = targetNoteToCure.content;
                        if (typeof WidgetManager !== 'undefined') WidgetManager.mountAll(editorEl);
                        
                        setTimeout(() => {
                            const newEl = document.getElementById(widgetId);
                            if (newEl) newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 100);
                    }
                }

                Store.triggerAutoSave();
                if (typeof UI.showToast !== 'undefined') UI.showToast(`Elemento corrotto "${orphanState.title || type}" recuperato in fondo alla nota.`, "success");
                
            } else {
                if (targetNoteInstance) {
                    const regex = new RegExp(widgetId, 'g');
                    targetNoteInstance.content = targetNoteInstance.content.replace(regex, `zombie_purged_${Date.now()}`);
                    targetNoteInstance.updatedAt = new Date().toISOString();
                    
                    if (AppState.databases && AppState.databases[widgetId]) delete AppState.databases[widgetId];
                    
                    Store.triggerAutoSave();
                    
                    if (typeof UI.showToast !== 'undefined') UI.showToast("L'elemento selezionato non esiste più ed è stato eliminato in modo definitivo dal file.", "info");
                    UI.renderTree(); 
                } else {
                    if (typeof UI.showToast !== 'undefined') UI.showToast("L'elemento selezionato non esiste più.", "error");
                }
            }
        };

        if (targetNoteId && AppState.currentNoteId !== targetNoteId) {
            UI.selectNote(targetNoteId);
            setTimeout(handleResolution, 250); 
        } else if (targetNoteId) {
            handleResolution();
        } else {
            handleResolution();
        }
    }
});