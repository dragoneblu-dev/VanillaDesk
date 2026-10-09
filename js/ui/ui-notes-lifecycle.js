/**
 * ui-notes-lifecycle.js
 * Sottomodulo di UI.
 * Gestione essenziale del ciclo di vita della nota: Selezione JIT su disco, Creazione, Home, Salto al Widget.
 * Gestione sicura e visiva delle note visualizzate dal Cestino (Read-Only Guard, Danger Banner e Restore).
 * Tracciamento del dirty state volatile (_isDirty, _isDraft) su modifiche al corpo testo e titolo.
 * Gestione conflitti di concorrenza tramite Revision Token (Modal di risoluzione, isolamento eventi e Undo Stash).
 * Supporto al parametro scrollToTop in selectNote per aprire e centrare immediatamente l'intestazione su doppio click.
 * RISOLUZIONE ACCESSO FANTASMA: Azzerata la mutazione parassita di updatedAt e l'autosave incondizionato al cambio nota.
 * JIT COMPONENT RECONCILIATION: Esecuzione di Store.syncWidgetsForNote prima del montaggio del DOM.
 * SINCRONISMO STATO ATTIVO: Assegnazione immediata di AppState.currentNoteId e disattivazione del banner di pericolo al ripristino.
 * FIX JUMP TO WIDGET & SCROLL POSITION: jumpToWidget trasmette il refId del widget a selectNote impedendo la sovrascrittura di _lastScroll e atterrando direttamente sull'elemento target.
 * REFACTOR DRY HEADER PROPERTIES: Riciclo integrale di AdvancedTable.renderCell(..., false) per il rendering di sola lettura;
 * corretta gestione di array/relazioni nell'helper isFieldEmpty ed esclusione automatica di tutti i campi vuoti.
 */

Object.assign(UI, {
    updateCurrentNoteTimer: null,
    _lastHighlightedWidget: null,

    // MOTORE PROPRIETÀ NELL'HEADER DELLA NOTA
    renderPageHeaderProperties: (note) => {
        let container = document.getElementById('noteHeaderProperties');
        if (!container) {
            const titleInput = document.getElementById('noteTitle');
            const contentEl = document.getElementById('noteContent');
            if (titleInput && titleInput.parentNode) {
                container = document.createElement('div');
                container.id = 'noteHeaderProperties';
                container.className = 'note-header-properties';
                titleInput.parentNode.insertBefore(container, contentEl);
            }
        }
        if (!container) return;

        if (!note || note.deletedAt) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        const isRecordNote = note.isRecordNote && note.linkedTableId && note.linkedRowId;
        let htmlBlocks = '';

        // Helper robusto per verificare se un valore è vuoto (non considera vuoti gli array popolati di relazioni/select)
        const isFieldEmpty = (v) => {
            if (v === '' || v === null || v === undefined) return true;
            if (Array.isArray(v)) return v.length === 0;
            if (typeof v === 'object') {
                if (v.start || v.end) return false;
                if (v.noteId || v.title) return false;
                return Object.keys(v).length === 0;
            }
            return false;
        };

        // BLOCCO 1: CAMPI DEL RECORD DATABASE (Ricicla AdvancedTable.renderCell in sola lettura)
        if (isRecordNote) {
            const realTableId = typeof AdvancedTable !== 'undefined' ? AdvancedTable._resolveSourceId(note.linkedTableId) : note.linkedTableId;
            const dbState = typeof AdvancedTable !== 'undefined' ? AdvancedTable.getState(realTableId) : null;

            if (dbState && dbState.showHeaderRecordFields !== false) {
                const row = (dbState.rows || []).find(r => r.id === note.linkedRowId);
                if (row) {
                    const titleCol = dbState.columns[0];
                    const displayCols = (dbState.columns || []).filter(c => c.id !== titleCol?.id && c.type !== 'record_note' && !c.hidden);

                    let chipsHtml = '';
                    displayCols.forEach(col => {
                        let cellVal = (row.virtualCells && row.virtualCells[col.id] !== undefined) ? row.virtualCells[col.id] : (row.cells ? row.cells[col.id] : undefined);
                        
                        // Esclude le proprietà vuote per massimizzare lo spazio utile
                        if (isFieldEmpty(cellVal)) return;

                        // Riciclo al 100% della funzione nativa collaudata di VanillaDesk
                        const rendered = typeof AdvancedTable !== 'undefined' 
                            ? AdvancedTable.renderCell(realTableId, row, col, cellVal, dbState, false) 
                            : String(cellVal || '');

                        const safeColName = UI.escapeHTML(col.name);

                        chipsHtml += `
                            <div class="header-prop-chip" style="display:inline-flex; align-items:center; gap:6px; background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; padding:3px 8px; font-size:0.8rem; min-height:26px; box-sizing:border-box;">
                                <span style="color:var(--text-secondary); font-weight:600; white-space:nowrap;">${safeColName}:</span>
                                <span style="display:inline-flex; align-items:center;">${rendered}</span>
                            </div>
                        `;
                    });

                    if (chipsHtml) {
                        const dbTitle = UI.escapeHTML(dbState.title || I18n.t('editor.database'));

                        htmlBlocks += `
                            <div style="background:var(--sidebar-bg); border:1px solid var(--border-color); border-radius:6px; padding:8px 12px; margin-bottom:10px; max-width:var(--page-max-width); margin-left:auto; margin-right:auto; width:100%; box-sizing:border-box;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <span style="display:inline-flex; color:var(--accent-color);">${Icons.tableDatabase}</span>
                                        <span style="font-size:0.75rem; font-weight:bold; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">
                                            RECORD: <b style="color:var(--accent-color);">${dbTitle}</b>
                                        </span>
                                    </div>
                                    <button class="adv-icon-btn" style="padding:2px 6px; font-size:0.75rem;" onclick="UI.jumpToWidget('${realTableId}')" title="Apri Tabella Database">↗</button>
                                </div>
                                <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                                    ${chipsHtml}
                                </div>
                            </div>
                        `;
                    }
                }
            }
        }

        // BLOCCO 2: PROPRIETÀ E TAG PAGINA (SYS_PROPERTIES_DB)
        const realTableId = isRecordNote ? (typeof AdvancedTable !== 'undefined' ? AdvancedTable._resolveSourceId(note.linkedTableId) : note.linkedTableId) : null;
        const dbState = realTableId && typeof AdvancedTable !== 'undefined' ? AdvancedTable.getState(realTableId) : null;
        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];

        const isPagePropsActive = isRecordNote 
            ? (dbState ? dbState.showHeaderPageProps === true : false)
            : (propsDb ? propsDb.showHeaderOnNotes === true : false);

        if (isPagePropsActive && propsDb && propsDb.rows) {
            const sysRow = propsDb.rows.find(r => r.cells && r.cells['sys_c_note'] === note.id);
            if (sysRow) {
                const activeCols = (propsDb.columns || []).filter(c => c.id !== 'sys_c_note' && !c.hidden);
                let pagePropsChipsHtml = '';

                activeCols.forEach(col => {
                    let cellVal = sysRow.cells[col.id];
                    
                    // Esclude le proprietà vuote per massimizzare lo spazio utile
                    if (isFieldEmpty(cellVal)) return;

                    const rendered = typeof AdvancedTable !== 'undefined' 
                        ? AdvancedTable.renderCell('SYS_PROPERTIES_DB', sysRow, col, cellVal, propsDb, false) 
                        : String(cellVal || '');

                    const safeColName = UI.escapeHTML(col.name);

                    pagePropsChipsHtml += `
                        <div class="header-prop-chip" style="display:inline-flex; align-items:center; gap:6px; background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; padding:3px 8px; font-size:0.8rem; min-height:26px; box-sizing:border-box;">
                            <span style="color:var(--text-secondary); font-weight:600; white-space:nowrap;">${safeColName}:</span>
                            <span style="display:inline-flex; align-items:center;">${rendered}</span>
                        </div>
                    `;
                });

                if (pagePropsChipsHtml) {
                    htmlBlocks += `
                        <div style="background:var(--sidebar-bg); border:1px solid var(--border-color); border-radius:6px; padding:8px 12px; margin-bottom:10px; max-width:var(--page-max-width); margin-left:auto; margin-right:auto; width:100%; box-sizing:border-box;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <span style="display:inline-flex; color:var(--accent-color);">${Icons.tag}</span>
                                    <span style="font-size:0.75rem; font-weight:bold; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">
                                        PROPRIETÀ E TAG PAGINA
                                    </span>
                                </div>
                                <button class="adv-icon-btn" style="padding:2px 6px; font-size:0.75rem;" onclick="AdvancedTable.openRecordView('SYS_PROPERTIES_DB', 'sys_r_${note.id}')" title="Modifica Proprietà Pagina">⚙️</button>
                            </div>
                            <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                                ${pagePropsChipsHtml}
                            </div>
                        </div>
                    `;
                }
            }
        }

        if (htmlBlocks) {
            container.innerHTML = htmlBlocks;
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
            container.innerHTML = '';
        }
    },

    promptNoteConflict: (localNote, diskNote) => {
        const oldOverlay = document.getElementById('advNoteConflictOverlay');
        if (oldOverlay) oldOverlay.remove();

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.id = 'advNoteConflictOverlay';
            overlay.className = 'link-modal-overlay';
            overlay.style.zIndex = '10001';

            const localTitle = localNote.title || I18n.t('editor.untitled');
            const diskDateStr = diskNote.updatedAt ? UI.formatDate(diskNote.updatedAt) : 'Data sconosciuta';
            const localDateStr = localNote.updatedAt ? UI.formatDate(localNote.updatedAt) : 'Data sconosciuta';

            overlay.innerHTML = `
                <div class="link-modal modal-animate" style="width: 580px; max-width: 95vw; padding: 25px; border-radius: 8px; border: 1px solid var(--danger-color); box-shadow: 0 10px 30px rgba(0,0,0,0.35);">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px;">
                        <span style="color:var(--danger-color); display:inline-flex; transform:scale(1.3);">${typeof Icons !== 'undefined' ? Icons.alertTriangle : '⚠️'}</span>
                        <h2 style="margin:0; font-size: 1.25rem; color:var(--text-primary);">${I18n.t('conflict.title')}</h2>
                    </div>

                    <div style="font-size: 0.9rem; line-height: 1.6; color: var(--text-primary); margin-bottom: 20px;">
                        <p style="margin-bottom: 12px;">
                            ${I18n.t('conflict.desc', { title: UI.escapeHTML(localTitle) })}
                        </p>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                            <div style="background: rgba(37, 99, 235, 0.05); border: 1px solid rgba(37, 99, 235, 0.2); border-radius: 6px; padding: 10px;">
                                <div style="font-size: 0.75rem; font-weight: bold; color: var(--accent-color); text-transform: uppercase;">${I18n.t('conflict.disk_version')}:</div>
                                <div style="font-size: 0.85rem; margin-top: 4px; font-weight: 500;">Salvataggio: ${diskDateStr}</div>
                            </div>
                            <div style="background: rgba(234, 179, 8, 0.05); border: 1px solid rgba(234, 179, 8, 0.2); border-radius: 6px; padding: 10px;">
                                <div style="font-size: 0.75rem; font-weight: bold; color: #b45309; text-transform: uppercase;">${I18n.t('conflict.local_version')}:</div>
                                <div style="font-size: 0.85rem; margin-top: 4px; font-weight: 500;">Salvataggio: ${localDateStr}</div>
                            </div>
                        </div>

                        <div style="background: rgba(0, 0, 0, 0.02); border: 1px dashed var(--border-color); border-radius: 6px; padding: 12px; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5;">
                            ${I18n.t('conflict.safety_note')}
                        </div>
                    </div>

                    <div style="display:flex; justify-content:flex-end; gap:10px;">
                        <button class="btn" id="btnConflictOverwrite" style="border-color: var(--danger-color); color: var(--danger-color);">
                            ${I18n.t('conflict.btn_overwrite')}
                        </button>
                        <button class="btn btn-primary" id="btnConflictReload" style="padding: 8px 18px;">
                            <span style="display:inline-flex; align-items:center; gap:6px;">${typeof Icons !== 'undefined' ? Icons.restore : '↺'} ${I18n.t('conflict.btn_reload')}</span>
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            // BINDING SICURO SULL'ISTANZA SPECIFICA DELL'OVERLAY (Previene problemi con getElementById)
            const btnReload = overlay.querySelector('#btnConflictReload');
            const btnOverwrite = overlay.querySelector('#btnConflictOverwrite');

            btnReload.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                overlay.remove();
                resolve('reload');
            };

            btnOverwrite.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                overlay.remove();
                resolve('overwrite');
            };
        });
    },

    restoreNoteFromBanner: (noteId) => {
        if (typeof UI.Trash !== 'undefined' && typeof UI.Trash.restore === 'function') {
            UI.Trash.restore(noteId);
            UI.closeDrawer();
            const note = Store.getNote(noteId);
            if (note) {
                UI._updateTrashedNoteUI(note);
            }
            UI.selectNote(noteId);
        }
    },

    _updateTrashedNoteUI: (note) => {
        const titleInput = document.getElementById('noteTitle');
        const editToggleBtn = document.getElementById('editToggleBtn');
        let banner = document.getElementById('trashedNoteWarningBanner');

        if (note && note.deletedAt) {
            // 1. Iniezione o visualizzazione del Banner di Pericolo ancorato con certezza a titleInput.parentNode
            if (!banner && titleInput && titleInput.parentNode) {
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
                titleInput.parentNode.insertBefore(banner, titleInput);
            }

            if (banner) {
                banner.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; color: var(--danger-color); font-weight: bold; font-size: 0.85rem;">
                        <span style="display: inline-flex;">${typeof Icons !== 'undefined' ? Icons.trash : '🗑️'}</span>
                        <span>Questa nota si trova nel Cestino (Sola Lettura). I database al suo interno continuano a funzionare per i collegamenti esterni.</span>
                    </div>
                    <button class="btn" style="background: var(--danger-color); color: white; border: none; padding: 4px 10px; font-weight: bold; cursor: pointer; flex-shrink: 0;" onclick="UI.restoreNoteFromBanner('${note.id}')">
                        <span style="display: inline-flex; align-items: center; gap: 4px;">${typeof Icons !== 'undefined' ? Icons.restore : '↺'} ${I18n.t('trash.restore_btn')}</span>
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

    selectNote: async (id, anchorText = null, refId = null, scrollToTop = false) => {
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
                        Object.assign(note, syncRes.note);
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

        // RENDERING PROPRIETÀ NELL'HEADER
        UI.renderPageHeaderProperties(note);

        // Aggiornamento interfaccia per note cestinate o attive
        UI._updateTrashedNoteUI(note);
        UI.renderInlineFootnotes();
        UI.updateBreadcrumb(note);
        UI.updateMarkBtn(note.isMarked);
        
        if (typeof UI.highlightTreeNode !== 'undefined') UI.highlightTreeNode(id);

        if (refId) {
            setTimeout(() => {
                const targetEl = document.getElementById(refId) || document.querySelector(`[id^="${refId}_cited_"]`);
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

    goHome: () => {
        AppState.isSwitchingNote = true;
        if (typeof UI.updateCurrentNoteTimer !== 'undefined') clearTimeout(UI.updateCurrentNoteTimer);

        const tc = document.getElementById('treeContainer');
        if (tc) tc.classList.remove('drag-over-root');

        if (AppState.currentNoteId) {
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
                Editor.clearHistory();
            }
            if (typeof Store !== 'undefined' && currentNote && (currentNote._isDirty || Store.isDirty)) {
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

        const headerProps = document.getElementById('noteHeaderProperties');
        if (headerProps) {
            headerProps.style.display = 'none';
            headerProps.innerHTML = '';
        }

        if (typeof UI.Minimap !== 'undefined') UI.Minimap.sync(); 
        
        setTimeout(() => {
            AppState.isSwitchingNote = false;
        }, 150);
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

        if (!confirm(I18n.t('notes_utils.confirm_move_trash'))) return;
        
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

        // Se l'elemento è già presente nel DOM dell'editor attivo, targetNoteId è la nota corrente
        const editorContent = document.getElementById('noteContent');
        if (editorContent && (editorContent.querySelector(`#${widgetId}`) || editorContent.querySelector(`[id^="${widgetId}_cited_"]`))) {
            targetNoteId = AppState.currentNoteId;
            targetNoteInstance = Store.getNote(AppState.currentNoteId);
        } else {
            const widgetRegex = new RegExp(`id=["']${widgetId}(_cited_[^"']*)?["']`);
            for (let i = 0; i < AppState.notes.length; i++) {
                const note = AppState.notes[i];
                if (!note.content) continue;
                if (widgetRegex.test(note.content)) {
                    targetNoteId = note.id;
                    targetNoteInstance = note;
                    break;
                }
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

        // Sincronizza l'albero laterale evidenziando l'elemento cliccato
        if (typeof UI.highlightTreeNode === 'function') {
            UI.highlightTreeNode(widgetId);
        }

        if (targetNoteId && AppState.currentNoteId !== targetNoteId) {
            // Trasmette widgetId come refId: selectNote atterra direttamente sull'elemento senza resettare lo scroll su _lastScroll
            UI.selectNote(targetNoteId, null, widgetId);
            setTimeout(handleResolution, 250); 
        } else if (targetNoteId) {
            handleResolution();
        } else {
            handleResolution();
        }
    }
});