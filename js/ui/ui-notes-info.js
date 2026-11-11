/**
 * ui-notes-info.js
 * Sottomodulo di UI.
 * Gestione del pannello delle Informazioni, Auditing e Backlinks (Menzioni in Entrata e Uscita).
 * FEAT ADAPTIVE SUBNOTES MATRIX: La matrice delle sotto-note visualizza come colonne unicamente
 * le proprietà che possiedono almeno un valore reale in almeno una sotto-nota.
 * Le proprietà completamente vuote vengono raccolte in un riquadro discreto in calce.
 * FIX STICKY THEAD BACKGROUND: Assegnato sfondo solido opaco (var(--sidebar-bg)) ai tag th e thead
 * per impedire la sovrapposizione visiva del testo delle note durante lo scorrimento verticale.
 * FIX MULTI-VIEW PER PAGE: Censimento completo di viste multiple ospitate nella stessa pagina.
 * FEAT DEDICATED VIEW ICONS: Icone e badge tipologici specifici per ogni tipo di vista (Kanban, Calendario,
 * Timeline, WBS, Grafico, Pivot e Tabella) allineati al design system dell'applicazione.
 * FIX CHART ICON: Utilizzo diretto dell'icona nativa Icons.tablePivot (barre verticali) per le viste Grafico.
 * FEAT COLLAPSIBLE DB RECORDS AUDITING: Separazione netta tra sotto-note standard e record note dei database.
 * Le record note vengono raggruppate per database di appartenenza, presentate inizialmente collassate
 * con identificatore cromatico verde (--record-color) ed esplose su richiesta con matrice adattiva dedicata.
 */

Object.assign(UI, {

    toggleDbSubnotesCollapse: (headerEl) => {
        if (!headerEl) return;
        const body = headerEl.nextElementSibling;
        const arrow = headerEl.querySelector('.db-subnotes-toggle-arrow');
        if (!body) return;

        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        if (arrow) {
            arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
        }
    },

    openNoteInfoPanel: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        if (!note) return;

        const safeTitle = (note.title || I18n.t('editor.untitled')).replace(/</g, '&lt;');

        // 1. Calcolo Statistiche Testo
        const plainText = UI.extractSearchableText(note.content || '').trim();
        const wordCount = plainText ? plainText.split(/\s+/).filter(w => w.length > 0).length : 0;
        const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200)); 

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.content || '';
        const chapterCount = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
        const widgetCount = tempDiv.querySelectorAll('.adv-widget-shell').length;

        // 2. Calcolo Backlinks (Chi mi cita / punta a me)
        const backlinks = [];
        const noteIdStr = `data-note-id="${note.id}"`;
        const refNoteStr = `data-ref-note="${note.id}"`;

        AppState.notes.forEach(n => {
            if (n.deletedAt || n.id === note.id) return;
            if (n.content && (n.content.includes(noteIdStr) || n.content.includes(refNoteStr))) {
                backlinks.push(n);
            }
        });

        // 3. Calcolo Outlinks (Chi sto citando / puntando io)
        const outlinks = new Set();
        tempDiv.querySelectorAll('a.internal-link').forEach(link => {
            const tgtId = link.getAttribute('data-note-id');
            if (tgtId && tgtId !== note.id) outlinks.add(tgtId);
        });
        tempDiv.querySelectorAll('.block-citation').forEach(cit => {
            const tgtId = cit.getAttribute('data-ref-note');
            if (tgtId && tgtId !== note.id) outlinks.add(tgtId);
        });

        // 4. Calcolo Auditing Sotto-note (Separazione tra Note Standard e Record Note dei Database)
        const allChildren = Store.getChildren(note.id);
        const standardChildren = allChildren.filter(n => !n.isRecordNote);
        const recordNoteChildren = allChildren.filter(n => n.isRecordNote && n.linkedTableId);

        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
        const allCandidateCols = propsDb ? propsDb.columns.filter(c => c.id !== 'sys_c_note' && !c.hidden) : [];

        // Helper per determinare se una cella contiene un valore informativo reale
        const isValued = (val) => {
            if (val === undefined || val === null || val === '') return false;
            if (Array.isArray(val)) return val.length > 0 && val.some(item => item !== undefined && item !== null && String(item).trim() !== '');
            if (typeof val === 'boolean') return val === true;
            if (typeof val === 'object') {
                if (val.start || val.end) return true;
                if (val.noteId || val.title) return true;
                return Object.keys(val).length > 0;
            }
            return String(val).trim() !== '';
        };

        // Funzione riutilizzabile per generare la matrice HTML con Adaptive Column Pruning per un gruppo di note
        const buildAdaptiveMatrixHTML = (notesList, isRecordMode = false) => {
            const populatedCols = [];
            const unpopulatedCols = [];

            allCandidateCols.forEach(col => {
                let hasValueInAnyNote = false;
                if (propsDb && propsDb.rows) {
                    for (const n of notesList) {
                        const sysRow = propsDb.rows.find(r => r.cells && r.cells['sys_c_note'] === n.id);
                        if (sysRow && isValued(sysRow.cells[col.id])) {
                            hasValueInAnyNote = true;
                            break;
                        }
                    }
                }
                if (hasValueInAnyNote) {
                    populatedCols.push(col);
                } else {
                    unpopulatedCols.push(col);
                }
            });

            // Costruzione intestazione colonne sticky con sfondo solido e opaco var(--sidebar-bg)
            let thHtml = `<th style="position:sticky; top:0; z-index:10; text-align:left; color:var(--text-secondary); font-weight:600; padding:8px 10px; border-bottom:1px solid var(--border-color); background:var(--sidebar-bg);">${I18n.t('notes_info.subnotes_col_title')}</th>`;
            populatedCols.forEach(c => {
                thHtml += `<th style="position:sticky; top:0; z-index:10; text-align:left; color:var(--text-secondary); font-weight:600; padding:8px 10px; border-bottom:1px solid var(--border-color); background:var(--sidebar-bg);">${c.name.replace(/</g, '&lt;')}</th>`;
            });

            let trHtml = '';
            notesList.forEach(child => {
                const childSafeTitle = (child.title || I18n.t('editor.untitled')).replace(/</g, '&lt;');
                let rowPropsHtml = '';

                if (propsDb) {
                    const sysRow = propsDb.rows.find(r => r.cells['sys_c_note'] === child.id);
                    populatedCols.forEach(c => {
                        let displayVal = '-';
                        if (sysRow) {
                            let rawVal = sysRow.cells[c.id];
                            
                            if (['select', 'multi-select'].includes(c.type)) {
                                const vals = Array.isArray(rawVal) ? rawVal : (rawVal ? [rawVal] : []);
                                if (vals.length > 0) {
                                    displayVal = '';
                                    vals.forEach(v => {
                                        const colorClass = propsDb.selectColors && propsDb.selectColors[c.id] && propsDb.selectColors[c.id][v] ? propsDb.selectColors[c.id][v] : 'default-color';
                                        displayVal += `<span class="adv-select-pill ${colorClass}" style="margin-right:4px;">${v.replace(/</g, '&lt;')}</span>`;
                                    });
                                }
                            } else if (c.type === 'checkbox') {
                                displayVal = rawVal ? `<span style="color:var(--accent-color); font-weight:bold;">${I18n.t('notes_info.yes')}</span>` : `<span style="color:var(--text-secondary);">${I18n.t('notes_info.no')}</span>`;
                            } else {
                                displayVal = AdvancedTable.getFormatDisplayValue(c, rawVal);
                                if (!displayVal) displayVal = '-';
                            }
                        }
                        rowPropsHtml += `<td style="padding:8px; border-bottom:1px solid var(--border-color); font-size:0.85rem;">${displayVal}</td>`;
                    });
                }

                const iconHtml = isRecordMode 
                    ? `<span style="color:var(--record-color, #10b981); margin-right:6px; display:inline-flex; align-items:center;">${Icons.recordPage}</span>`
                    : `<span style="opacity:0.5; margin-right:5px; font-weight:normal;">${Icons.file}</span>`;

                trHtml += `
                    <tr style="cursor:pointer; transition:background 0.2s;" onmouseenter="this.style.background='var(--item-hover)'" onmouseleave="this.style.background=''" onclick="UI.selectNote('${child.id}')">
                        <td style="padding:8px; border-bottom:1px solid var(--border-color); font-weight:bold; color:var(--text-primary); font-size:0.9rem;">
                            ${iconHtml}${childSafeTitle}
                        </td>
                        ${rowPropsHtml}
                    </tr>
                `;
            });

            // Riquadro discreto in calce per segnalare le proprietà esistenti ma non valorizzate
            let unpopulatedFooterHtml = '';
            if (unpopulatedCols.length > 0) {
                let chipsHtml = '';
                unpopulatedCols.forEach(c => {
                    chipsHtml += `<span class="adv-select-pill default-color" style="opacity:0.75; font-size:0.72rem; padding:2px 7px; border:1px dashed var(--border-color); background:transparent;">🏷️ ${c.name.replace(/</g, '&lt;')}</span>`;
                });
            }

            return `
                <div class="adv-scroll-container" style="max-height: 350px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-color); margin-top: 8px;">
                    <table style="width:100%; border-collapse:collapse; text-align:left;">
                        <thead style="position:sticky; top:0; z-index:10; background:var(--sidebar-bg); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                            <tr>${thHtml}</tr>
                        </thead>
                        <tbody>
                            ${trHtml}
                        </tbody>
                    </table>
                </div>
                ${unpopulatedFooterHtml}
            `;
        };

        // 4A. Costruzione sezione per le sotto-note gerarchiche standard
        let subNotesHtml = '';
        if (standardChildren.length > 0) {
            subNotesHtml = buildAdaptiveMatrixHTML(standardChildren, false);
        } else if (recordNoteChildren.length === 0) {
            subNotesHtml = `<div style="font-size:0.85rem; color:var(--text-secondary); font-style:italic;">${I18n.t('notes_info.subnotes_empty')}</div>`;
        }

        // 4B. Costruzione blocchi a fisarmonica collassati per ciascun Database presente
        let dbRecordsAccordionHtml = '';
        if (recordNoteChildren.length > 0) {
            // Raggruppa le record note per linkedTableId
            const dbGroups = new Map(); // dbId -> array di note
            recordNoteChildren.forEach(rn => {
                const dbId = rn.linkedTableId;
                if (!dbGroups.has(dbId)) dbGroups.set(dbId, []);
                dbGroups.get(dbId).push(rn);
            });

            // Ordina i database alfabeticamente per titolo
            const sortedDbIds = Array.from(dbGroups.keys()).sort((a, b) => {
                const titleA = AppState.databases[a]?.title || 'Database';
                const titleB = AppState.databases[b]?.title || 'Database';
                return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
            });

            sortedDbIds.forEach(dbId => {
                const dbState = AppState.databases[dbId];
                const rawDbTitle = dbState?.title || I18n.t('editor.database');
                const safeDbTitle = UI.escapeHTML(rawDbTitle);
                const dbNotes = dbGroups.get(dbId);

                // Genera la matrice specifica per questo database
                const matrixHtml = buildAdaptiveMatrixHTML(dbNotes, true);

                dbRecordsAccordionHtml += `
                    <div class="db-subnotes-collapsible" style="border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; margin-top: 10px; background: var(--bg-color);">
                        <div class="db-subnotes-header" onclick="UI.toggleDbSubnotesCollapse(this)" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--sidebar-bg); cursor: pointer; user-select: none; transition: background 0.15s ease;"
                             onmouseenter="this.style.background='var(--item-hover)'" onmouseleave="this.style.background='var(--sidebar-bg)'">
                            <span class="db-subnotes-toggle-arrow" style="font-size: 0.8rem; transition: transform 0.2s ease; display: inline-flex; color: var(--text-secondary);">${Icons.chevronRight}</span>
                            <span style="color: var(--record-color, #10b981); display: inline-flex;">${Icons.recordPage}</span>
                            <span style="font-weight: bold; font-size: 0.85rem; color: var(--record-color, #10b981); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${safeDbTitle}</span>
                            <span style="font-size: 0.72rem; color: var(--record-color, #10b981); background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); padding: 2px 8px; border-radius: 12px; font-weight: bold;">${dbNotes.length} record</span>
                        </div>
                        <div class="db-subnotes-body" style="display: none; padding: 10px; border-top: 1px solid var(--border-color);">
                            ${matrixHtml}
                        </div>
                    </div>
                `;
            });
        }

        // 5. RILEVAMENTO RIGOROSO DELLE VISTE COLLEGATE ALLO SHADOW DATABASE (SYS_PROPERTIES_DB)
        const shadowDbViewIds = new Map(); // dbId -> dbState

        if (AppState.databases) {
            Object.entries(AppState.databases).forEach(([id, db]) => {
                if (!db) return;
                // Vengono censite esclusivamente le Linked Views e Pivot la cui sorgente sia categoricamente SYS_PROPERTIES_DB
                const isShadowLinked = db.isLinkedView && db.sourceTableId === 'SYS_PROPERTIES_DB';
                const isShadowPivot = db.isPivot && db.sourceTableId === 'SYS_PROPERTIES_DB';
                const isDirectShadow = id === 'SYS_PROPERTIES_DB';

                if (isShadowLinked || isShadowPivot || isDirectShadow) {
                    shadowDbViewIds.set(id, db);
                }
            });
        }

        const pagesWithShadowViews = [];
        const seenWidgetIds = new Set();

        if (shadowDbViewIds.size > 0 && AppState.notes) {
            // Ispezione sicura delle aperture dei tag <div> per individuare tutti i wrapper reali dei widget
            const divTagRegex = /<div\b[^>]*>/gi;

            AppState.notes.forEach(n => {
                if (n.deletedAt || !n.content) return;

                let tagMatch;
                divTagRegex.lastIndex = 0;
                while ((tagMatch = divTagRegex.exec(n.content)) !== null) {
                    const tagStr = tagMatch[0];
                    const isTableOrPivotWrapper = tagStr.includes('adv-table-wrapper') || 
                                                  tagStr.includes('widget-type-database') || 
                                                  tagStr.includes('widget-type-pivot');

                    if (isTableOrPivotWrapper) {
                        const idMatch = tagStr.match(/\bid=["']([^"']+)["']/i);
                        if (idMatch) {
                            const rawDbId = idMatch[1].split('_cited_')[0];

                            // Verifica che l'ID estratto appartenga a SYS_PROPERTIES_DB e non sia già stato aggiunto
                            if (shadowDbViewIds.has(rawDbId) && !seenWidgetIds.has(rawDbId)) {
                                seenWidgetIds.add(rawDbId);
                                const targetDbState = shadowDbViewIds.get(rawDbId);
                                const viewType = targetDbState.viewType || 'table';
                                const isPivot = !!targetDbState.isPivot;
                                const isChart = isPivot && !!(targetDbState.chartConfig && targetDbState.chartConfig.visible);

                                // Risoluzione dinamica dell'icona specifica e della denominazione di layout
                                let iconSvg = Icons.tableDatabase;
                                let typeName = I18n.t('table.view_table');

                                if (isChart) {
                                    // Utilizzo diretto dell'icona Icons.tablePivot (istogramma a barre verticali)
                                    iconSvg = Icons.tablePivot;
                                    const chartType = targetDbState.chartConfig?.type;
                                    typeName = chartType 
                                        ? I18n.t('tree_db.view_chart', { type: chartType.toUpperCase() })
                                        : I18n.t('notes_info.chart_view');
                                } else if (isPivot) {
                                    iconSvg = Icons.tablePivot;
                                    typeName = I18n.t('tree_db.view_pivot');
                                } else if (viewType === 'board') {
                                    iconSvg = Icons.viewBoard;
                                    typeName = I18n.t('table.view_board');
                                } else if (viewType === 'calendar') {
                                    iconSvg = Icons.viewCalendar;
                                    typeName = I18n.t('table.view_calendar');
                                } else if (viewType === 'timeline') {
                                    iconSvg = Icons.viewTimeline;
                                    typeName = I18n.t('table.view_timeline');
                                } else if (viewType === 'tree') {
                                    iconSvg = Icons.treeNode;
                                    typeName = I18n.t('table.view_tree');
                                }

                                pagesWithShadowViews.push({
                                    noteId: n.id,
                                    noteTitle: n.title || I18n.t('editor.untitled'),
                                    widgetId: rawDbId,
                                    viewTitle: targetDbState.title || typeName,
                                    viewTypeName: typeName,
                                    iconSvg: iconSvg
                                });
                            }
                        }
                    }
                }
            });
        }

        let shadowViewsHtml = '';
        const sectionTitle = I18n.t('notes_info.sys_db_section_title');

        if (pagesWithShadowViews.length > 0) {
            let linksHtml = '';
            pagesWithShadowViews.forEach(item => {
                const safePageTitle = UI.escapeHTML(item.noteTitle);
                const safeViewTitle = UI.escapeHTML(item.viewTitle);
                const safeViewType = UI.escapeHTML(item.viewTypeName);

                linksHtml += `
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; cursor:pointer; transition:all 0.15s ease;"
                         onmouseenter="this.style.background='var(--item-hover)'; this.style.borderColor='var(--accent-color)';"
                         onmouseleave="this.style.background='var(--bg-color)'; this.style.borderColor='var(--border-color)';"
                         onclick="UI.selectNote('${item.noteId}', null, '${item.widgetId}'); UI.closeDrawer();">
                        <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                            <span style="color:var(--accent-color); display:inline-flex;">${item.iconSvg}</span>
                            <div style="display:flex; flex-direction:column; overflow:hidden;">
                                <span style="font-weight:600; font-size:0.85rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safePageTitle}</span>
                                <span style="font-size:0.75rem; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeViewTitle} <span style="opacity:0.6;">(${safeViewType})</span></span>
                            </div>
                        </div>
                        <span style="font-size:0.75rem; color:var(--accent-color); font-weight:bold; display:inline-flex; align-items:center; gap:2px;">
                            ${Icons.arrowRightUp}
                        </span>
                    </div>
                `;
            });

            const foundDesc = I18n.t('notes_info.sys_db_pages_found_desc');
            shadowViewsHtml = `
                <div>
                    <h4 style="margin:0 0 10px 0; color:var(--text-primary); font-size:0.95rem; border-bottom:1px solid var(--border-color); padding-bottom:5px; display:flex; align-items:center; gap:6px;">
                        ${Icons.tableDatabase} ${sectionTitle}
                    </h4>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px; line-height:1.4;">${foundDesc}</div>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        ${linksHtml}
                    </div>
                </div>
            `;
        } else {
            const hintTitle = I18n.t('notes_info.sys_db_empty_hint_title');
            const hintDesc = I18n.t('notes_info.sys_db_empty_hint_desc');

            shadowViewsHtml = `
                <div style="background:rgba(37, 99, 235, 0.04); border:1px dashed rgba(37, 99, 235, 0.3); border-radius:8px; padding:12px 14px;">
                    <div style="display:flex; align-items:center; gap:6px; color:var(--accent-color); font-weight:bold; font-size:0.85rem; margin-bottom:5px;">
                        <span>💡</span> <span>${hintTitle}</span>
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-secondary); line-height:1.45;">
                        ${hintDesc}
                    </div>
                </div>
            `;
        }

        // COSTRUZIONE HTML DRAWER
        let bodyHTML = `
            <div style="display:flex; flex-direction:column; gap:20px; padding-bottom: 20px;">
                
                <!-- Statistiche -->
                <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:10px;">
                    <div style="background:var(--item-hover); border:1px solid var(--border-color); padding:10px; border-radius:8px; text-align:center;">
                        <div style="font-size:1.4rem; font-weight:bold; color:var(--text-primary);">${wordCount}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; margin-top:5px;">${I18n.t('notes_info.stat_words')}</div>
                    </div>
                    <div style="background:var(--item-hover); border:1px solid var(--border-color); padding:10px; border-radius:8px; text-align:center;">
                        <div style="font-size:1.4rem; font-weight:bold; color:var(--text-primary);">${I18n.t('notes_info.stat_read_time_min', { time: readTimeMinutes })}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; margin-top:5px;">${I18n.t('notes_info.stat_read_time')}</div>
                    </div>
                    <div style="background:var(--item-hover); border:1px solid var(--border-color); padding:10px; border-radius:8px; text-align:center;">
                        <div style="font-size:1.4rem; font-weight:bold; color:var(--text-primary);">${chapterCount}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; margin-top:5px;">${I18n.t('notes_info.stat_chapters')}</div>
                    </div>
                    <div style="background:var(--item-hover); border:1px solid var(--border-color); padding:10px; border-radius:8px; text-align:center;">
                        <div style="font-size:1.4rem; font-weight:bold; color:var(--text-primary);">${widgetCount}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; margin-top:5px;">${I18n.t('notes_info.stat_widgets')}</div>
                    </div>
                </div>

                <!-- Backlinks -->
                <div>
                    <h4 style="margin:0 0 10px 0; color:var(--accent-color); font-size:0.95rem; border-bottom:1px solid var(--border-color); padding-bottom:5px; display:flex; align-items:center; gap:6px;">
                        ${Icons.link} ${I18n.t('notes_info.backlinks_title')}
                    </h4>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px;">${I18n.t('notes_info.backlinks_desc')}</div>
        `;

        if (backlinks.length > 0) {
            bodyHTML += `<div style="display:flex; flex-direction:column; gap:6px;">`;
            backlinks.forEach(bl => {
                const blTitle = (bl.title || I18n.t('editor.untitled')).replace(/</g, '&lt;');
                bodyHTML += `
                    <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; cursor:pointer; transition:background 0.2s;" onmouseenter="this.style.background='var(--item-hover)'" onmouseleave="this.style.background='var(--bg-color)'" onclick="UI.selectNote('${bl.id}')">
                        <span style="color:var(--accent-color);">${Icons.arrowLeft}</span>
                        <span style="font-weight:bold; color:var(--text-primary); font-size:0.9rem;">${blTitle}</span>
                    </div>
                `;
            });
            bodyHTML += `</div>`;
        } else {
            bodyHTML += `<div style="font-size:0.85rem; color:var(--text-secondary); font-style:italic;">${I18n.t('notes_info.backlinks_empty')}</div>`;
        }

        bodyHTML += `</div>`;

        // Outlinks
        bodyHTML += `
                <div>
                    <h4 style="margin:0 0 10px 0; color:var(--tx-c4); font-size:0.95rem; border-bottom:1px solid var(--border-color); padding-bottom:5px; display:flex; align-items:center; gap:6px;">
                        ${Icons.arrowRightUp} ${I18n.t('notes_info.outlinks_title')}
                    </h4>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px;">${I18n.t('notes_info.outlinks_desc')}</div>
        `;

        if (outlinks.size > 0) {
            bodyHTML += `<div style="display:flex; flex-direction:column; gap:6px;">`;
            outlinks.forEach(outId => {
                const outNote = Store.getNote(outId);
                if (outNote && !outNote.deletedAt) {
                    const outTitle = (outNote.title || I18n.t('editor.untitled')).replace(/</g, '&lt;');
                    bodyHTML += `
                        <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:var(--bg-color); border:1px dashed var(--border-color); border-radius:6px; cursor:pointer; transition:background 0.2s;" onmouseenter="this.style.background='var(--item-hover)'" onmouseleave="this.style.background='var(--bg-color)'" onclick="UI.selectNote('${outNote.id}')">
                            <span style="color:var(--tx-c4);">${Icons.link}</span>
                            <span style="font-weight:bold; color:var(--text-primary); font-size:0.9rem;">${outTitle}</span>
                        </div>
                    `;
                }
            });
            bodyHTML += `</div>`;
        } else {
            bodyHTML += `<div style="font-size:0.85rem; color:var(--text-secondary); font-style:italic;">${I18n.t('notes_info.outlinks_empty')}</div>`;
        }

        bodyHTML += `</div>`;

        // Auditing Sotto-note Standard e Blocchi Collassati per i Record dei Database
        bodyHTML += `
                <div>
                    <h4 style="margin:0 0 10px 0; color:var(--text-primary); font-size:0.95rem; border-bottom:1px solid var(--border-color); padding-bottom:5px; display:flex; align-items:center; gap:6px;">
                        ${Icons.treeNode} ${I18n.t('notes_info.subnotes_audit_title')}
                    </h4>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">${I18n.t('notes_info.subnotes_audit_desc')}</div>
                    ${subNotesHtml}
                    ${dbRecordsAccordionHtml}
                </div>

                <!-- Sezione Analisi Globale Shadow Database (Tutte le Viste Reali Censite) -->
                ${shadowViewsHtml}
            </div>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.info} ${I18n.t('notes_info.drawer_title', { title: safeTitle })}</span>`, bodyHTML, null);
    }
});