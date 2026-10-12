/**
 * CitationManager.js
 * Gestisce la Transclusion dei blocchi (Citazione dinamica).
 * Inserimento riga di uscita dal menu contestuale.
 * Drag & Drop per riordinare le citazioni nella Home Page.
 * Riquadro informativo e statistiche globali del Workspace in fondo alla Home Dashboard (in stile chip/proprietà).
 */

const CitationManager = {
    isHomeMode: false,
    editingCitationId: null,
    homeDraggedIdx: null,

    mountAll: (container = document) => {
        const root = container.id === 'noteContent' ? container : (container.querySelector ? container.querySelector('#noteContent') || container : document);
        const citations = root.querySelectorAll('.block-citation.adv-widget-shell');
        
        citations.forEach(cit => {
            if (cit.getAttribute('data-collapsed') === 'true' && !cit.classList.contains('collapsed')) {
                cit.classList.add('collapsed');
            }
            CitationManager._updateShellUI(cit);
        });
    },

    _updateShellUI: (cit) => {
        const noteId = cit.getAttribute('data-ref-note');
        const refId = cit.getAttribute('data-ref-id');
        const refType = cit.getAttribute('data-ref-type') || 'note';
        const isCollapsed = cit.classList.contains('collapsed');
        const targetNote = Store.getNote(noteId);
        
        let displayTitle = targetNote ? targetNote.title : I18n.t('citation.missing_ref');
        if (refId && refType === 'chapter') displayTitle = `${displayTitle} > ${I18n.t('citation.subchapter_label')}`;

        // Assicura che anche il guscio base non sia mai editabile se incapsulato
        const isCited = cit.id.includes('_cited_');

        WidgetManager.updateShellUI(cit.id, {
            icon: Icons.citation,
            title: I18n.t('citation.title_prefix', { title: displayTitle }),
            compact: true,
            optionsId: `cit-opt-btn-${cit.id}`,
            onOptionsClick: (e) => {
                if (isCited) return; 
                UI.Menu.closeAll(true);
                UI.Menu.buildContextMenu(`cit-opt-btn-${cit.id}`, [
                    { icon: Icons.arrowRightUp, label: I18n.t('citation.open_source_note'), onClick: () => UI.selectNote(noteId) },
                    { icon: Icons.edit, label: I18n.t('citation.edit_source'), onClick: () => CitationManager.editCitation(cit.id) },
                    { type: 'divider' },
                    { icon: Icons.down, label: I18n.t('citation.insert_line_below'), onClick: () => WidgetManager.insertLineBreakAfter(cit.id) },
                    { type: 'divider' },
                    { icon: Icons.trash, label: I18n.t('citation.delete_citation'), danger: true, onClick: () => Editor.safeDeleteWidget(cit) }
                ]);
            },
            onDragStart: (e) => {
                if (isCited) { e.preventDefault(); return; }
                AppState.draggedBlockId = cit.id;
                AppState.draggedBlockType = 'citation';
                e.dataTransfer.effectAllowed = 'move';
            },
            onDragEnd: () => {
                 AppState.draggedBlockId = null;
                 AppState.draggedBlockType = null;
            },
            tools: [
                { icon: Icons.arrowRightUp, label: '', title: I18n.t('citation.open_action'), onClick: () => UI.selectNote(noteId) },
                { icon: isCollapsed ? Icons.chevronDown : Icons.searchUp, title: I18n.t('citation.expand_collapse'), onClick: (e) => CitationManager.toggleCollapse(e, cit.id) }
            ]
        });
    },

    toggleCollapse: (e, wrapperId) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const wrapper = document.getElementById(wrapperId);
        if (!wrapper) return;

        const isCollapsed = wrapper.classList.toggle('collapsed');
        if (isCollapsed) wrapper.setAttribute('data-collapsed', 'true');
        else wrapper.removeAttribute('data-collapsed');

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();
        Store.triggerAutoSave();

        CitationManager._updateShellUI(wrapper);
    },

    openModal: (isHome = false) => {
        CitationManager.isHomeMode = isHome === true;
        if (!isHome && typeof Editor !== 'undefined') Editor.saveSelection();
        CitationManager.editingCitationId = null;
        
        UI.DocumentBrowser.open('citation', `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.citation} ${I18n.t('citation.modal_title_insert')}</span>`, (item) => {
            CitationManager.confirmCitation(item.noteId, item.refId, item.refType, item.title);
        });
    },

    editCitation: (wrapperId) => {
        const wrapper = document.getElementById(wrapperId);
        if (!wrapper) return;

        Editor.saveSelection();
        UI.closeDrawer();

        const noteId = wrapper.getAttribute('data-ref-note');
        const refId = wrapper.getAttribute('data-ref-id');

        CitationManager.editingCitationId = wrapperId;

        UI.DocumentBrowser.open('citation', `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.edit} ${I18n.t('citation.modal_title_edit')}</span>`, (item) => {
            CitationManager.confirmCitation(item.noteId, item.refId, item.refType, item.title);
        }, { noteId: noteId, refId: refId });
    },

    confirmCitation: (noteId, refId, refType, displayTitle) => {
        const targetNote = Store.getNote(noteId);
        
        if (!targetNote) {
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast(I18n.t('citation.error_note_deleted'), "error");
            }
            UI.closeDrawer();
            return;
        }

        UI.closeDrawer();

        // SCENARIO 1: Modifica
        if (CitationManager.editingCitationId) {
            const cit = document.getElementById(CitationManager.editingCitationId);
            if (cit) {
                Editor.saveSnapshot();
                cit.setAttribute('data-ref-note', noteId);
                cit.setAttribute('data-ref-type', refType);
                if (refId) cit.setAttribute('data-ref-id', refId);
                else cit.removeAttribute('data-ref-id');

                CitationManager._updateShellUI(cit);
                Store.triggerAutoSave();
                CitationManager.renderLiveCitations();
            }
            CitationManager.editingCitationId = null;
            return;
        }

        // SCENARIO 2: Home
        if (CitationManager.isHomeMode) {
            AppState.homeCitations.push({ noteId: noteId, refId: refId, refType: refType, displayTitle: displayTitle });
            Store.triggerAutoSave(true);
            CitationManager.renderHomeCitations();
            return;
        }

        // SCENARIO 3: Inserimento
        Editor.restoreSelection();
        const sel = window.getSelection();
        let node = sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
        if (node && node.nodeType === 3) node = node.parentNode;

        if (node && node.closest('.widget-type-columns')) {
            alert(I18n.t('format_blocks.alert_columns_barrier'));
            return;
        }

        const citBlockId = 'cit_' + Store.generateId();
        const block = WidgetManager.createShell('citation', citBlockId);
        
        block.setAttribute('data-ref-note', noteId);
        block.setAttribute('data-ref-type', refType);
        if (refId) block.setAttribute('data-ref-id', refId);

        const body = block.querySelector('.widget-body');
        body.className = 'widget-body citation-body adv-scroll-container editor-content';
        body.innerHTML = `<span style="color:var(--text-secondary); font-style:italic;">${I18n.t('citation.live_loading')}</span>`;

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();

        let targetBlock = node ? node.closest('p, div, li, h1, h2, h3, h4, h5, h6') : null;
        const isEmptyBlock = targetBlock && targetBlock.id !== 'noteContent' && targetBlock.textContent.replace(/[\u200B\n\r]/g, '').trim() === '';

        if (isEmptyBlock) {
            targetBlock.parentNode.replaceChild(block, targetBlock);
        } else {
            if (sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(block);
            } else {
                document.getElementById('noteContent').appendChild(block);
            }
        }

        const p = document.createElement('p'); 
        p.innerHTML = '<br>';
        block.parentNode.insertBefore(p, block.nextSibling);
        
        const newRange = document.createRange();
        newRange.setStart(p, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        Store.triggerAutoSave();
        
        CitationManager._updateShellUI(block);
        CitationManager.renderLiveCitations();
    },

    removeHomeCitation: (index) => {
        if (!confirm(I18n.t('citation.confirm_remove_home'))) return;
        AppState.homeCitations.splice(index, 1);
        Store.triggerAutoSave(true);
        CitationManager.renderHomeCitations();
    },

    // MOTORE DND HOME DASHBOARD
    onHomeDragStart: (e, idx) => {
        CitationManager.homeDraggedIdx = idx;
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.5';
    },

    onHomeDragOver: (e) => {
        e.preventDefault();
        const target = e.currentTarget;
        target.style.borderTop = '3px solid var(--accent-color)';
    },

    onHomeDragLeave: (e) => {
        const target = e.currentTarget;
        target.style.borderTop = '';
    },

    onHomeDrop: (e, targetIdx) => {
        e.preventDefault();
        const srcIdx = CitationManager.homeDraggedIdx;
        CitationManager.homeDraggedIdx = null;

        document.querySelectorAll('#homeCitationsContainer .block-citation').forEach(el => {
            el.style.opacity = '1';
            el.style.borderTop = '';
        });

        if (srcIdx === null || srcIdx === targetIdx) return;

        const [cit] = AppState.homeCitations.splice(srcIdx, 1);
        
        let newTarget = targetIdx;
        if (srcIdx < targetIdx) newTarget--;

        AppState.homeCitations.splice(newTarget, 0, cit);
        Store.triggerAutoSave(true);
        CitationManager.renderHomeCitations();
    },

    renderHomeCitations: () => {
        const container = document.getElementById('homeCitationsContainer');
        if (!container) return;

        if (!AppState.homeCitations || AppState.homeCitations.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:var(--text-secondary); margin:20px 0; font-style:italic;">${I18n.t('citation.empty_home_hint')}</div>`;
        } else {
            let html = '';
            AppState.homeCitations.forEach((cit, idx) => {
                const targetNote = Store.getNote(cit.noteId);
                const displayTitle = targetNote ? targetNote.title : I18n.t('citation.reference');
                const fullTitle = cit.refId && cit.refType === 'chapter' ? `${displayTitle} > ${cit.displayTitle}` : displayTitle;
                const citId = `home_cit_${idx}`;

                html += `
                    <blockquote class="adv-widget-shell block-citation widget-type-citation drag-item" id="${citId}" data-widget-type="citation" data-ref-note="${cit.noteId}" data-ref-type="${cit.refType}" ${cit.refId ? `data-ref-id="${cit.refId}"` : ''} contenteditable="false" style="margin: 10px 0; transition: transform 0.2s;"
                        draggable="true" 
                        ondragstart="CitationManager.onHomeDragStart(event, ${idx})"
                        ondragover="CitationManager.onHomeDragOver(event)"
                        ondragleave="CitationManager.onHomeDragLeave(event)"
                        ondrop="CitationManager.onHomeDrop(event, ${idx})">
                        
                        <div class="widget-header adv-table-header compact-header" style="cursor: grab;">
                            <span class="widget-drag-handle adv-drag-handle" style="display:flex; margin-right:5px;" title="Trascina per riordinare">${Icons.dragHandle}</span>
                            <span class="widget-icon" style="display:inline-flex;">${Icons.link}</span>
                            <span class="widget-title adv-table-title" contenteditable="false" style="flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 50px;">${I18n.t('citation.title_prefix', { title: fullTitle })}</span>
                            <div class="widget-tools adv-tools" style="flex-shrink: 0;">
                                <button class="adv-tool-btn" title="${I18n.t('citation.open_action')}" onclick="UI.selectNote('${cit.noteId}')"><span style="display:inline-flex; align-items:center;">${Icons.arrowRightUp}</span></button>
                                <button class="adv-tool-btn active" title="${I18n.t('citation.btn_remove_home')}" onclick="CitationManager.removeHomeCitation(${idx})"><span style="display:inline-flex; align-items:center;">${Icons.close}</span></button>
                            </div>
                        </div>
                        <div class="widget-body citation-body adv-scroll-container editor-content" style="overflow-x: auto; min-height: 50px;">
                            <span style="color:var(--text-secondary); font-style:italic;">${I18n.t('citation.live_loading')}</span>
                        </div>
                    </blockquote>
                `;
            });
            container.innerHTML = html;
            CitationManager.renderLiveCitations(container);
        }

        // Renderizza sempre in fondo le statistiche globali del Workspace
        CitationManager.renderHomeWorkspaceStats();
    },

    // =========================================================================
    // PANORAMICA & STATISTICHE GLOBALI WORKSPACE (In fondo alla Home Dashboard)
    // =========================================================================
    renderHomeWorkspaceStats: () => {
        const statsContainer = document.getElementById('homeWorkspaceStatsContainer');
        if (!statsContainer) return;

        // Se non c'è un workspace aperto, nasconde il blocco
        if (!AppState.workspaceHandle && (!AppState.notes || AppState.notes.length === 0)) {
            statsContainer.innerHTML = '';
            statsContainer.style.display = 'none';
            return;
        }

        // Calcolo atomico delle metriche globali senza bloccare la UI
        const allNotes = AppState.notes || [];
        const activeNotesCount = allNotes.filter(n => !n.deletedAt).length;
        const trashedNotesCount = allNotes.filter(n => n.deletedAt).length;

        let relationalDbCount = 0;
        let viewsCount = 0;

        if (AppState.databases) {
            for (const [id, db] of Object.entries(AppState.databases)) {
                if (!db || id === 'SYS_PROPERTIES_DB') continue;
                if (id.startsWith('adv_code_') || id.startsWith('adv_btnbar_') || id.startsWith('adv_cols_') || id.startsWith('adv_journal_')) continue;

                if (db.isPivot || db.isLinkedView) {
                    viewsCount++;
                } else if (db.columns && Array.isArray(db.columns)) {
                    relationalDbCount++;
                }
            }
        }

        const templatesCount = Array.isArray(AppState.templates) ? AppState.templates.length : 0;
        const isEncrypted = !!AppState.documentPassword;
        const wsName = AppState.workspaceHandle ? AppState.workspaceHandle.name : (AppState.fileName || I18n.t('common.no_workspace'));

        // Generazione chip in stile "Proprietà e Tag di Pagina"
        const buildChip = (label, valueHtml, iconHtml = '') => `
            <div class="header-prop-chip" style="display:inline-flex; align-items:center; gap:6px; background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; padding:3px 10px; font-size:0.8rem; min-height:28px; box-sizing:border-box;">
                <span style="color:var(--text-secondary); font-weight:600; white-space:nowrap; display:inline-flex; align-items:center; gap:4px;">
                    ${iconHtml}${label}:
                </span>
                <span style="display:inline-flex; align-items:center; font-weight:bold; color:var(--text-primary);">${valueHtml}</span>
            </div>
        `;

        let chipsHtml = '';

        // 1. Note attive
        chipsHtml += buildChip(
            I18n.t('home_dashboard.stat_active_notes') || "Note Attive",
            activeNotesCount.toLocaleString(),
            `<span style="color:var(--accent-color);">${typeof Icons !== 'undefined' ? Icons.file : '📄'}</span>`
        );

        // 2. Note nel cestino (evidenziate se presenti)
        if (trashedNotesCount > 0) {
            chipsHtml += buildChip(
                I18n.t('home_dashboard.stat_trash') || "Nel Cestino",
                `<span style="color:var(--danger-color); cursor:pointer;" onclick="UI.Trash.open()">${trashedNotesCount.toLocaleString()}</span>`,
                `<span style="color:var(--danger-color);">${typeof Icons !== 'undefined' ? Icons.trash : '🗑️'}</span>`
            );
        }

        // 3. Database Relazionali
        if (relationalDbCount > 0) {
            chipsHtml += buildChip(
                I18n.t('home_dashboard.stat_databases') || "Database Relazionali",
                relationalDbCount.toLocaleString(),
                `<span style="color:var(--accent-color);">${typeof Icons !== 'undefined' ? Icons.tableDatabase : '📊'}</span>`
            );
        }

        // 4. Viste / Dashboard / Pivot
        if (viewsCount > 0) {
            chipsHtml += buildChip(
                I18n.t('home_dashboard.stat_views') || "Viste / Dashboard",
                viewsCount.toLocaleString(),
                `<span style="color:var(--tx-c4);">${typeof Icons !== 'undefined' ? Icons.tablePivot : '📈'}</span>`
            );
        }

        // 5. Template salvati
        if (templatesCount > 0) {
            chipsHtml += buildChip(
                I18n.t('home_dashboard.stat_templates') || "Template",
                `<span style="cursor:pointer;" onclick="TemplateManager.openManager()">${templatesCount.toLocaleString()}</span>`,
                `<span style="color:var(--tx-c7);">${typeof Icons !== 'undefined' ? Icons.tableSimple : '📑'}</span>`
            );
        }

        // 6. Sicurezza & Crittografia
        const securityValHtml = isEncrypted
            ? `<span style="color:var(--accent-color);">${I18n.t('home_dashboard.stat_encrypted') || 'Protetto AES-GCM 256-bit'}</span>`
            : `<span style="color:var(--text-secondary); opacity:0.8;">${I18n.t('home_dashboard.stat_plain') || 'In Chiaro'}</span>`;

        chipsHtml += buildChip(
            I18n.t('home_dashboard.stat_security') || "Sicurezza Disco",
            securityValHtml,
            `<span style="color:${isEncrypted ? 'var(--accent-color)' : 'var(--text-secondary)'};">${typeof Icons !== 'undefined' ? Icons.lock : '🔒'}</span>`
        );

        const bannerTitle = I18n.t('home_dashboard.ws_stats_title') || "PANORAMICA E STATISTICHE WORKSPACE";

        statsContainer.innerHTML = `
            <div style="background:var(--box-bg); border:1px dashed var(--border-color); border-radius:6px; padding:12px 16px; width:100%; box-sizing:border-box;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="color:var(--accent-color); display:inline-flex;">${typeof Icons !== 'undefined' ? Icons.folderOpen : '📁'}</span>
                        <span style="font-size:0.78rem; font-weight:bold; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">
                            ${bannerTitle} ➔ <b style="color:var(--text-primary);">${UI.escapeHTML(wsName)}</b>
                        </span>
                    </div>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                    ${chipsHtml}
                </div>
            </div>
        `;

        statsContainer.style.display = 'block';
    },

    renderLiveCitations: (container = document, visitedNotes = new Set()) => {
        const citations = container.querySelectorAll('.block-citation');
        
        citations.forEach(cit => {
            const noteId = cit.getAttribute('data-ref-note');
            const refType = cit.getAttribute('data-ref-type') || 'note';
            const refId = cit.getAttribute('data-ref-id');
            const body = cit.querySelector('.citation-body');
            
            if (!noteId || !body) return;

            if (visitedNotes.has(noteId)) {
                body.innerHTML = `<div style="padding:15px; border:1px dashed var(--danger-color); background:rgba(239, 68, 68, 0.05); color:var(--danger-color); font-weight:bold;">${I18n.t('citation.circular_ref_error')}</div>`;
                return;
            }

            const targetNote = Store.getNote(noteId);
            if (!targetNote) {
                body.innerHTML = `<p style="color:var(--danger-color); font-style:italic;">${I18n.t('citation.source_deleted_error')}</p>`;
                return;
            }

            const nextVisited = new Set(visitedNotes);
            nextVisited.add(noteId);

            const extracted = UI.DocumentBrowser.extractLiveHTML(targetNote.content || '', refId, refType);
            body.innerHTML = extracted;

            // Forza l'invisibilità di editing in modo netto
            body.querySelectorAll('[contenteditable="true"]').forEach(el => el.setAttribute('contenteditable', 'false'));

            if (typeof WidgetManager !== 'undefined') {
                body.querySelectorAll(WidgetManager.blockSelector).forEach(wrapper => {
                    const trueId = wrapper.id;
                    if (!trueId.includes('_cited_')) {
                        const cloneId = trueId + '_cited_' + Store.generateId();
                        wrapper.id = cloneId;
                    }
                });

                const tempEdit = AppState.isEditMode;
                try {
                    AppState.isEditMode = false; 
                    WidgetManager.mountAll(body); 
                } finally {
                    AppState.isEditMode = tempEdit; 
                }
            }

            CitationManager.renderLiveCitations(body, nextVisited);
        });
    }
};