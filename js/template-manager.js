/**
 * TemplateManager.js
 * Modulo per la gestione, l'instanziazione, il Deep-Cloning e l'Anteprima Visiva Reale dei Page Templates.
 * Tracciamento del dirty state volatile (_isDirty) all'applicazione di un template su nota esistente.
 * FEAT PREVIEW WIDGETS: Motore di anteprima visiva reale e fedele per tutti i componenti complessi
 * (Database, Viste Kanban, Calendario, Timeline Gantt, Albero WBS, Tabelle Pivot, Grafici, Codice, Bottoni Macro, Diari, Colonne).
 */

const TemplateManager = {

    _escape: (str) => {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    toggleEmptyOverlay: () => {
        const overlay = document.getElementById('emptyNoteOverlay');
        const editor = document.getElementById('noteContent');
        if (!overlay || !editor) return;

        const html = editor.innerHTML.trim();
        const isLiterallyEmpty = html === '' || html === '<p><br></p>' || html === '<br>';
        const hasWidgets = editor.querySelector('img, table, .adv-widget-shell, hr, ul, ol');

        if (AppState.isEditMode && isLiterallyEmpty && !hasWidgets) {
            const grid = document.getElementById('templateGrid');
            if (grid) {
                if (!AppState.templates || AppState.templates.length === 0) {
                    grid.innerHTML = `<div style="font-size:0.85rem; font-style:italic; opacity:0.6; grid-column: 1 / -1;">${I18n.t('templates.empty_overlay_hint')}</div>`;
                } else {
                    const sortedTemplates = [...AppState.templates].sort((a, b) => {
                        const dateA = new Date(a.lastUsed || a.updatedAt).getTime();
                        const dateB = new Date(b.lastUsed || b.updatedAt).getTime();
                        return dateB - dateA;
                    });
                    
                    const topTemplates = sortedTemplates.slice(0, 3);
                    
                    let gridHTML = '';
                    topTemplates.forEach(tpl => {
                        const safeTitle = (tpl.title || I18n.t('templates.default_new_name')).replace(/</g, '&lt;');
                        gridHTML += `
                            <button class="template-grid-btn" onclick="TemplateManager.previewTemplate('${tpl.id}')">
                                <span style="opacity:0.7; display:inline-flex;">${typeof Icons !== 'undefined' && Icons.file ? Icons.file : '📄'}</span>
                                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight:bold;">${safeTitle}</span>
                            </button>
                        `;
                    });
                    grid.innerHTML = gridHTML;
                }
            }
            overlay.style.display = 'block';
        } else {
            overlay.style.display = 'none';
        }
    },

    // =========================================================================
    // MOTORE DI GENERAZIONE ANTEPRIMA VISIVA REALE PER TEMPLATE
    // =========================================================================

    generateTemplatePreviewHTML: (tpl) => {
        if (!tpl || !tpl.content) return '<p><br></p>';

        const temp = document.createElement('div');
        temp.innerHTML = tpl.content;

        const widgetsMap = tpl.widgets || {};

        // 1. Idratazione Immagini
        temp.querySelectorAll('img[data-image-ref]').forEach(img => {
            const ref = img.getAttribute('data-image-ref');
            if (ref && typeof Editor !== 'undefined' && Editor.imageCache && Editor.imageCache[ref]) {
                img.setAttribute('src', Editor.imageCache[ref]);
            } else if (!img.getAttribute('src')) {
                img.style.minHeight = '120px';
                img.style.background = 'rgba(0,0,0,0.03)';
                img.style.border = '1px dashed var(--border-color)';
                img.style.borderRadius = '6px';
            }
        });

        // 2. Idratazione Audio
        temp.querySelectorAll('audio[data-audio-ref]').forEach(aud => {
            const ref = aud.getAttribute('data-audio-ref');
            if (ref && typeof Editor !== 'undefined' && Editor.audioCache && Editor.audioCache[ref]) {
                aud.setAttribute('src', Editor.audioCache[ref]);
            }
        });

        // 3. Idratazione Video YouTube
        temp.querySelectorAll('.widget-type-video').forEach(wrapper => {
            const iframe = wrapper.querySelector('iframe');
            if (iframe) {
                const dataSrc = iframe.getAttribute('data-src');
                if (dataSrc && !iframe.getAttribute('src')) {
                    iframe.setAttribute('src', dataSrc);
                }
            }
            if (!wrapper.querySelector('.widget-header')) {
                wrapper.innerHTML = `
                    <div class="widget-header adv-table-header" style="display:flex;">
                        <span class="widget-icon" style="display:inline-flex; color:var(--danger-color);">${typeof Icons !== 'undefined' ? Icons.youtube : '▶'}</span>
                        <span class="widget-title adv-table-title" style="flex:0 1 auto; font-weight:bold;">Video YouTube</span>
                    </div>
                    <div class="widget-body">${wrapper.innerHTML}</div>
                `;
            }
        });

        // 4. Idratazione Citazioni
        temp.querySelectorAll('.block-citation').forEach(cit => {
            const noteId = cit.getAttribute('data-ref-note');
            const targetNote = typeof Store !== 'undefined' ? Store.getNote(noteId) : null;
            const noteTitle = targetNote ? targetNote.title : (cit.getAttribute('data-title') || 'Riferimento Nota');
            const refId = cit.getAttribute('data-ref-id');
            const refType = cit.getAttribute('data-ref-type') || 'note';

            let bodyHtml = '';
            if (targetNote && typeof UI !== 'undefined' && UI.DocumentBrowser && UI.DocumentBrowser.extractLiveHTML) {
                bodyHtml = UI.DocumentBrowser.extractLiveHTML(targetNote.content || '', refId, refType);
            }
            if (!bodyHtml) {
                bodyHtml = `<span style="color:var(--text-secondary); font-style:italic;">[Citazione: ${TemplateManager._escape(noteTitle)}]</span>`;
            }

            cit.innerHTML = `
                <div class="widget-header adv-table-header compact-header" style="display:flex;">
                    <span class="widget-icon" style="display:inline-flex; color:var(--accent-color);">${typeof Icons !== 'undefined' ? Icons.citation : '❝'}</span>
                    <span class="widget-title adv-table-title" style="flex:0 1 auto; font-weight:bold;">Riferimento: ${TemplateManager._escape(noteTitle)}</span>
                </div>
                <div class="widget-body citation-body adv-scroll-container editor-content" style="padding: 10px 0;">${bodyHtml}</div>
            `;
        });

        // 5. Idratazione e Rendering Visivo Reale di tutti i Moduli Shell
        const widgetShells = Array.from(temp.querySelectorAll('.adv-widget-shell, [data-widget-type], .adv-table-wrapper, .adv-journal-wrapper, .code-wrapper, .adv-action-button-wrapper'));

        widgetShells.forEach(wrapper => {
            const wId = wrapper.id;
            let type = wrapper.getAttribute('data-widget-type');
            if (!type) {
                if (wrapper.classList.contains('adv-journal-wrapper')) type = 'journal';
                else if (wrapper.classList.contains('code-wrapper')) type = 'code';
                else if (wrapper.classList.contains('adv-action-button-wrapper')) type = 'buttonbar';
                else if (wrapper.classList.contains('block-citation')) type = 'citation';
                else if (wrapper.classList.contains('simple-table-wrapper')) type = 'simple-table';
                else if (wrapper.classList.contains('adv-table-wrapper')) type = 'database';
            }

            // Citazioni e Video sono già processati con logica ad-hoc
            if (type === 'citation' || type === 'video') return;

            // Se è una tabella semplice con il tag <table> nativo intatto, non sovrascrivere
            if (type === 'simple-table' && wrapper.querySelector('table')) return;

            // Risoluzione ID: gestisce anche eventuali istanze con prefisso _cited_
            const trueId = wId ? wId.split('_cited_')[0] : '';
            let state = (wId && widgetsMap[wId]) || (trueId && widgetsMap[trueId]) || (AppState.databases ? (AppState.databases[wId] || AppState.databases[trueId]) : null);

            // Se è una vista collegata o pivot, recupera ricorsivamente anche il database sorgente
            let sourceState = null;
            if (state && (state.isLinkedView || state.isPivot) && state.sourceTableId) {
                const srcId = state.sourceTableId.split('_cited_')[0];
                sourceState = widgetsMap[state.sourceTableId] || widgetsMap[srcId] || (AppState.databases ? (AppState.databases[state.sourceTableId] || AppState.databases[srcId]) : null);
            }

            TemplateManager._renderWidgetForPreview(wrapper, type, state, sourceState, widgetsMap);
        });

        return temp.innerHTML;
    },

    _renderWidgetForPreview: (wrapper, type, state, sourceState, allWidgetsMap) => {
        if (!state) {
            TemplateManager._renderFallbackWidget(wrapper, type, null);
            return;
        }

        try {
            if (type === 'database') {
                TemplateManager._renderDatabasePreview(wrapper, state, sourceState);
            } else if (type === 'pivot') {
                TemplateManager._renderPivotPreview(wrapper, state, sourceState);
            } else if (type === 'code') {
                TemplateManager._renderCodePreview(wrapper, state);
            } else if (type === 'buttonbar') {
                TemplateManager._renderButtonBarPreview(wrapper, state);
            } else if (type === 'journal') {
                TemplateManager._renderJournalPreview(wrapper, state);
            } else if (type === 'columns') {
                TemplateManager._renderColumnsPreview(wrapper, state);
            } else {
                TemplateManager._renderFallbackWidget(wrapper, type, state);
            }
        } catch (e) {
            console.warn("[TEMPLATE PREVIEW] Fallback su widget per errore rendering:", e);
            TemplateManager._renderFallbackWidget(wrapper, type, state);
        }
    },

    _renderDatabasePreview: (wrapper, state, sourceState) => {
        let activeState = state;
        if (state.isLinkedView && sourceState) {
            activeState = {
                ...sourceState,
                title: state.title || sourceState.title,
                viewType: state.viewType || 'table',
                boardGroupBy: state.boardGroupBy || sourceState.boardGroupBy,
                calendarDateCol: state.calendarDateCol || sourceState.calendarDateCol,
                timelineDateCol: state.timelineDateCol || sourceState.timelineDateCol,
                treeRelationColId: state.treeRelationColId || sourceState.treeRelationColId,
                treeRelationDirection: state.treeRelationDirection || sourceState.treeRelationDirection,
                isLinkedView: true
            };
        }

        const viewType = activeState.viewType || 'table';
        const title = activeState.title || I18n.t('editor.database');

        let icon = typeof Icons !== 'undefined' ? Icons.tableDatabase : '📊';
        if (viewType === 'board') icon = typeof Icons !== 'undefined' ? Icons.viewBoard : '📋';
        else if (viewType === 'calendar') icon = typeof Icons !== 'undefined' ? Icons.viewCalendar : '📅';
        else if (viewType === 'timeline') icon = typeof Icons !== 'undefined' ? Icons.viewTimeline : '📊';
        else if (viewType === 'tree') icon = typeof Icons !== 'undefined' ? Icons.treeNode : '🌳';
        if (activeState.isLinkedView) icon = typeof Icons !== 'undefined' ? Icons.link : '🔗';

        let bodyHtml = '';

        if (viewType === 'board') {
            bodyHtml = TemplateManager._renderBoardPreviewBody(activeState);
        } else if (viewType === 'calendar') {
            bodyHtml = TemplateManager._renderCalendarPreviewBody(activeState);
        } else if (viewType === 'timeline') {
            bodyHtml = TemplateManager._renderTimelinePreviewBody(activeState);
        } else if (viewType === 'tree') {
            bodyHtml = TemplateManager._renderTreePreviewBody(activeState);
        } else {
            bodyHtml = TemplateManager._renderTablePreviewBody(activeState);
        }

        wrapper.className = 'adv-widget-shell adv-table-wrapper';
        wrapper.innerHTML = `
            <div class="widget-header adv-table-header" style="display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--border-color); padding-bottom:8px; margin-bottom:8px;">
                <span class="widget-icon" style="display:inline-flex; color:var(--accent-color);">${icon}</span>
                <span class="widget-title adv-table-title" style="flex:0 1 auto; font-weight:bold; font-size:1rem; color:var(--text-primary);">${TemplateManager._escape(title)}</span>
                <span style="font-size:0.75rem; color:var(--text-secondary); opacity:0.7; margin-left:auto; text-transform:uppercase; letter-spacing:0.5px;">${TemplateManager._escape(viewType.toUpperCase())}</span>
            </div>
            <div class="widget-body" style="padding:0;">${bodyHtml}</div>
        `;
    },

    _renderTablePreviewBody: (state) => {
        const columns = (state.columns || []).filter(c => !c.hidden);
        const rows = (state.rows || []).slice(0, 8);

        let ths = '';
        columns.forEach(col => {
            ths += `<th style="padding:6px 10px; border:1px solid var(--border-color); background:rgba(0,0,0,0.02); font-weight:600; text-align:left; font-size:0.85rem; color:var(--text-secondary);">${TemplateManager._escape(col.name)}</th>`;
        });

        let trs = '';
        if (rows.length === 0) {
            trs = `<tr><td colspan="${Math.max(columns.length, 1)}" style="padding:15px; text-align:center; color:var(--text-secondary); font-style:italic;">(Nessun record salvato)</td></tr>`;
        } else {
            rows.forEach(r => {
                trs += `<tr>`;
                columns.forEach(col => {
                    let val = (r.cells || {})[col.id];
                    let display = '';

                    if (['select', 'multi-select'].includes(col.type)) {
                        const vals = Array.isArray(val) ? val : (val ? [val] : []);
                        vals.forEach(v => {
                            const colorClass = (state.selectColors && state.selectColors[col.id] && state.selectColors[col.id][v]) ? state.selectColors[col.id][v] : 'default-color';
                            display += `<span class="adv-select-pill ${colorClass}" style="margin:1px 2px; padding:2px 6px; font-size:0.75rem;">${TemplateManager._escape(v)}</span>`;
                        });
                    } else if (col.type === 'checkbox') {
                        display = val ? '<span style="color:var(--accent-color); font-weight:bold;">☑ Sì</span>' : '<span style="color:var(--text-secondary);">☐ No</span>';
                    } else if (typeof val === 'object' && val !== null) {
                        display = val.start ? `${TemplateManager._escape(val.start)}${val.end ? ' ➔ ' + TemplateManager._escape(val.end) : ''}` : TemplateManager._escape(JSON.stringify(val));
                    } else {
                        display = (val !== null && val !== undefined && String(val).trim() !== '') ? TemplateManager._escape(String(val)) : '';
                    }

                    trs += `<td style="padding:6px 10px; border:1px solid var(--border-color); font-size:0.85rem; color:var(--text-primary); word-break:break-word;">${display}</td>`;
                });
                trs += `</tr>`;
            });
        }

        return `
            <div class="adv-scroll-container" style="overflow-x:auto;">
                <table class="adv-table table-striped adv-table-full-width" style="border-collapse:collapse; width:100%;">
                    <thead><tr>${ths}</tr></thead>
                    <tbody>${trs}</tbody>
                </table>
            </div>
            ${state.rows && state.rows.length > 8 ? `<div style="font-size:0.75rem; color:var(--text-secondary); text-align:center; padding:6px; opacity:0.8;">...e altri ${state.rows.length - 8} record</div>` : ''}
        `;
    },

    _renderBoardPreviewBody: (state) => {
        const groupColId = state.boardGroupBy || (state.columns.find(c => c.type === 'select')?.id);
        const groupCol = state.columns.find(c => c.id === groupColId);
        const options = (groupCol && state.selectOptions && state.selectOptions[groupColId]) ? state.selectOptions[groupColId] : ['Da Fare', 'In Corso', 'Completato'];
        const titleCol = state.columns[0] || { id: 'c_title', name: 'Nome' };

        let colsHtml = '';
        options.forEach(opt => {
            const colorClass = (state.selectColors && state.selectColors[groupColId] && state.selectColors[groupColId][opt]) ? state.selectColors[groupColId][opt] : 'default-color';
            const matchingRows = (state.rows || []).filter(r => (r.cells || {})[groupColId] === opt);

            let cardsHtml = '';
            matchingRows.slice(0, 4).forEach(r => {
                const cardTitle = (r.cells || {})[titleCol.id] || I18n.t('editor.untitled');
                cardsHtml += `
                    <div class="adv-board-card" style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; padding:8px 10px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                        <div style="font-weight:bold; font-size:0.85rem; color:var(--text-primary); margin-bottom:4px; word-break:break-word;">${TemplateManager._escape(cardTitle)}</div>
                    </div>
                `;
            });

            colsHtml += `
                <div class="adv-board-col-wrapper" style="flex:1; min-width:180px; max-width:240px; background:var(--sidebar-bg); border:1px solid var(--border-color); border-radius:8px; display:flex; flex-direction:column; padding:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid var(--border-color);">
                        <span class="adv-select-pill ${colorClass}" style="margin:0; padding:2px 8px; font-size:0.8rem; font-weight:bold;">${TemplateManager._escape(opt)}</span>
                        <span style="font-size:0.75rem; color:var(--text-secondary); opacity:0.8;">${matchingRows.length}</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        ${cardsHtml || '<div style="font-size:0.75rem; color:var(--text-secondary); font-style:italic; padding:8px; text-align:center;">(Nessuna scheda)</div>'}
                    </div>
                </div>
            `;
        });

        return `<div class="adv-board-container" style="display:flex; gap:12px; overflow-x:auto; padding:10px 5px;">${colsHtml}</div>`;
    },

    _renderCalendarPreviewBody: (state) => {
        const rows = (state.rows || []).slice(0, 6);
        const titleCol = state.columns[0] || { id: 'c_title', name: 'Nome' };

        let eventsHtml = '';
        rows.forEach(r => {
            const title = (r.cells || {})[titleCol.id] || I18n.t('editor.untitled');
            eventsHtml += `
                <span class="adv-select-pill default-color" style="margin:2px 4px; padding:3px 8px; font-size:0.8rem;">
                    📅 ${TemplateManager._escape(title)}
                </span>
            `;
        });

        return `
            <div style="background:var(--sidebar-bg); border:1px solid var(--border-color); border-radius:6px; padding:12px;">
                <div style="display:grid; grid-template-columns:repeat(7, 1fr); text-align:center; font-weight:bold; font-size:0.75rem; color:var(--text-secondary); border-bottom:1px solid var(--border-color); padding-bottom:6px; margin-bottom:8px;">
                    <div>LUN</div><div>MAR</div><div>MER</div><div>GIO</div><div>VEN</div><div>SAB</div><div>DOM</div>
                </div>
                <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:4px; min-height:80px; background:rgba(0,0,0,0.02); border-radius:4px; padding:8px; align-items:center;">
                    ${Array.from({ length: 14 }).map((_, i) => `<div style="font-size:0.75rem; color:var(--text-secondary); text-align:center; opacity:0.6;">${i + 1}</div>`).join('')}
                </div>
                <div style="margin-top:10px; border-top:1px dashed var(--border-color); padding-top:8px;">
                    <div style="font-size:0.75rem; font-weight:bold; color:var(--text-secondary); margin-bottom:4px;">Eventi in agenda:</div>
                    <div style="display:flex; flex-wrap:wrap; gap:4px;">${eventsHtml || '<span style="font-size:0.75rem; color:var(--text-secondary); font-style:italic;">Nessun evento pianificato</span>'}</div>
                </div>
            </div>
        `;
    },

    _renderTimelinePreviewBody: (state) => {
        const rows = (state.rows || []).slice(0, 5);
        const titleCol = state.columns[0] || { id: 'c_title', name: 'Nome' };

        let barsHtml = '';
        rows.forEach((r, idx) => {
            const title = (r.cells || {})[titleCol.id] || I18n.t('editor.untitled');
            const leftPct = (idx * 16) + 5;
            const widthPct = Math.min(30 + (idx * 8), 60);

            barsHtml += `
                <div style="position:relative; height:28px; margin-bottom:6px; background:rgba(0,0,0,0.02); border-radius:4px; border:1px solid rgba(0,0,0,0.03);">
                    <div class="adv-timeline-bar" style="position:absolute; left:${leftPct}%; width:${widthPct}%; height:22px; top:3px; background:rgba(37,99,235,0.25); border:1px solid var(--accent-color); border-radius:4px; display:flex; align-items:center; padding:0 8px; font-size:0.75rem; font-weight:bold; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${TemplateManager._escape(title)}
                    </div>
                </div>
            `;
        });

        return `
            <div style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; padding:10px; overflow:hidden;">
                <div style="display:flex; border-bottom:1px solid var(--border-color); padding-bottom:6px; margin-bottom:8px; font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">
                    <div style="flex:1; text-align:center;">Settimana 1</div>
                    <div style="flex:1; text-align:center; border-left:1px dashed var(--border-color);">Settimana 2</div>
                    <div style="flex:1; text-align:center; border-left:1px dashed var(--border-color);">Settimana 3</div>
                </div>
                <div>${barsHtml || '<div style="font-size:0.75rem; color:var(--text-secondary); font-style:italic; padding:10px; text-align:center;">(Nessuna attività programmata)</div>'}</div>
            </div>
        `;
    },

    _renderTreePreviewBody: (state) => {
        const titleCol = state.columns[0] || { id: 'c_title', name: 'Nome' };
        const rows = (state.rows || []).slice(0, 6);

        let treeHtml = '';
        rows.forEach((r, idx) => {
            const title = (r.cells || {})[titleCol.id] || I18n.t('editor.untitled');
            const indentPx = (idx % 3) * 20;

            treeHtml += `
                <div style="display:flex; align-items:center; gap:6px; padding:6px 10px; border-bottom:1px solid var(--border-color); font-size:0.85rem;">
                    <div style="padding-left:${indentPx}px; display:flex; align-items:center; gap:6px; flex:1; min-width:0;">
                        <span style="color:var(--accent-color); font-size:0.8rem;">${idx % 2 === 0 ? '▼' : '•'}</span>
                        <span style="font-weight:${idx % 3 === 0 ? 'bold' : 'normal'}; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${TemplateManager._escape(title)}</span>
                    </div>
                    <span style="font-size:0.75rem; color:var(--text-secondary); opacity:0.6; font-family:monospace;">Livello ${(idx % 3) + 1}</span>
                </div>
            `;
        });

        return `
            <div style="border:1px solid var(--border-color); border-radius:6px; background:var(--bg-color); overflow:hidden;">
                ${treeHtml || '<div style="font-size:0.75rem; color:var(--text-secondary); font-style:italic; padding:15px; text-align:center;">(Gerarchia vuota)</div>'}
            </div>
        `;
    },

    _renderPivotPreview: (wrapper, state, sourceState) => {
        const title = state.title || 'Vista Analitica / Pivot';
        const isChart = state.chartConfig && state.chartConfig.visible;
        const icon = isChart ? (typeof Icons !== 'undefined' ? Icons.data : '📊') : (typeof Icons !== 'undefined' ? Icons.tablePivot : '📈');

        let bodyHtml = '';

        if (isChart) {
            const chartType = state.chartConfig.type || 'bar';
            bodyHtml = `
                <div style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; padding:15px; text-align:center;">
                    <div style="font-size:0.85rem; font-weight:bold; color:var(--accent-color); margin-bottom:8px;">
                        Grafico Visivo: ${TemplateManager._escape(chartType.toUpperCase())}
                    </div>
                    <div style="display:flex; align-items:flex-end; justify-content:center; gap:12px; height:90px; padding:10px 0; border-bottom:1px solid var(--border-color); margin-bottom:10px;">
                        <div style="width:28px; height:60%; background:var(--accent-color); border-radius:4px 4px 0 0; opacity:0.8;"></div>
                        <div style="width:28px; height:90%; background:var(--tx-c4); border-radius:4px 4px 0 0; opacity:0.8;"></div>
                        <div style="width:28px; height:40%; background:var(--tx-c6); border-radius:4px 4px 0 0; opacity:0.8;"></div>
                        <div style="width:28px; height:75%; background:var(--tx-c8); border-radius:4px 4px 0 0; opacity:0.8;"></div>
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">
                        Metriche aggregate configurate nel template
                    </div>
                </div>
            `;
        } else {
            bodyHtml = `
                <div style="border:1px solid var(--border-color); border-radius:6px; background:var(--bg-color); overflow:hidden;">
                    <table class="adv-table table-striped adv-table-full-width" style="border-collapse:collapse; width:100%; font-size:0.85rem;">
                        <thead>
                            <tr>
                                <th style="padding:6px 10px; background:rgba(37,99,235,0.05); color:var(--accent-color); border:1px solid var(--border-color); text-align:left;">Raggruppamento</th>
                                <th style="padding:6px 10px; background:rgba(0,0,0,0.02); border:1px solid var(--border-color); text-align:right;">Totale / Conteggio</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td style="padding:6px 10px; border:1px solid var(--border-color);">Gruppo A</td><td style="padding:6px 10px; border:1px solid var(--border-color); text-align:right; font-weight:bold;">120</td></tr>
                            <tr><td style="padding:6px 10px; border:1px solid var(--border-color);">Gruppo B</td><td style="padding:6px 10px; border:1px solid var(--border-color); text-align:right; font-weight:bold;">85</td></tr>
                        </tbody>
                    </table>
                </div>
            `;
        }

        wrapper.className = 'adv-widget-shell';
        wrapper.innerHTML = `
            <div class="widget-header adv-table-header" style="display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--border-color); padding-bottom:8px; margin-bottom:8px;">
                <span class="widget-icon" style="display:inline-flex; color:var(--accent-color);">${icon}</span>
                <span class="widget-title adv-table-title" style="flex:0 1 auto; font-weight:bold; font-size:1rem; color:var(--text-primary);">${TemplateManager._escape(title)}</span>
            </div>
            <div class="widget-body" style="padding:0;">${bodyHtml}</div>
        `;
    },

    _renderCodePreview: (wrapper, state) => {
        const title = state.title || I18n.t('code_widget.default_title');
        const lang = state.language || 'none';
        const codeText = state.content || '// Codice template';

        let formattedCode = '';
        if (typeof CodeManager !== 'undefined') {
            const dummyPre = document.createElement('pre');
            dummyPre.setAttribute('data-language', lang);
            CodeManager.highlightBlock(dummyPre, true, codeText);
            formattedCode = dummyPre.innerHTML;
        } else {
            formattedCode = TemplateManager._escape(codeText).replace(/\n/g, '<br>');
        }

        wrapper.className = 'adv-widget-shell widget-type-code code-wrapper';
        wrapper.innerHTML = `
            <div class="widget-header adv-table-header" style="display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--border-color); padding-bottom:8px; margin-bottom:8px;">
                <span class="widget-icon" style="display:inline-flex;">${typeof Icons !== 'undefined' ? Icons.getCodeIcon(lang) : '</>'}</span>
                <span class="widget-title adv-table-title" style="flex:0 1 auto; font-weight:bold; font-size:1rem; color:var(--text-primary);">${TemplateManager._escape(title)}</span>
                <span style="font-size:0.75rem; color:var(--text-secondary); opacity:0.7; margin-left:auto; font-family:monospace;">${TemplateManager._escape(lang.toUpperCase())}</span>
            </div>
            <div class="widget-body" style="padding:0;">
                <pre class="code-content" style="margin:0; border:1px solid var(--border-color); border-radius:6px; padding:12px; font-size:0.85rem; line-height:1.5; background:var(--code-bg); color:var(--code-text); overflow-x:auto;">${formattedCode}</pre>
            </div>
        `;
    },

    _renderButtonBarPreview: (wrapper, state) => {
        const buttons = state.buttons || [{ label: 'Nuovo Pulsante', color: 'var(--accent-color)', icon: Icons.play }];

        let btnsHtml = '';
        buttons.forEach(btn => {
            const color = btn.color || 'var(--accent-color)';
            const label = btn.label || 'Pulsante';
            const icon = btn.icon || (typeof Icons !== 'undefined' ? Icons.play : '▶');

            btnsHtml += `
                <div class="btn" style="padding:8px 16px; border-radius:6px; background-color:${color}; border-color:${color}; color:white; font-size:0.9rem; font-weight:500; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                    <span style="display:inline-flex;">${icon}</span>
                    <span>${TemplateManager._escape(label)}</span>
                </div>
            `;
        });

        wrapper.className = 'adv-widget-shell adv-action-button-wrapper';
        wrapper.innerHTML = `
            <div style="padding:10px; border:1px dashed var(--border-color); border-radius:6px; background:rgba(0,0,0,0.01); display:flex; flex-wrap:wrap; gap:8px;">
                ${btnsHtml}
            </div>
        `;
    },

    _renderJournalPreview: (wrapper, state) => {
        const title = state.title || I18n.t('journal.default_title');
        const entries = (state.entries || []).slice(0, 5);

        let entriesHtml = '';
        entries.forEach(ent => {
            const isDone = !!ent.endTime;
            const check = isDone ? '☑' : '☐';
            entriesHtml += `
                <div style="display:flex; align-items:center; gap:8px; padding:4px 0; font-size:0.85rem; border-bottom:1px solid rgba(0,0,0,0.03);">
                    <span style="color:${isDone ? '#22c55e' : 'var(--text-secondary)'}; font-family:monospace; font-weight:bold;">${check} ${ent.timeStr || '10:00'}</span>
                    <span style="flex:1; color:var(--text-primary); ${isDone ? 'opacity:0.6; text-decoration:line-through;' : ''}">${ent.content ? ent.content.replace(/<[^>]*>?/gm, '') : 'Attività'}</span>
                </div>
            `;
        });

        wrapper.className = 'adv-widget-shell adv-journal-wrapper';
        wrapper.innerHTML = `
            <div class="widget-header adv-table-header" style="display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--border-color); padding-bottom:8px; margin-bottom:8px;">
                <span class="widget-icon" style="display:inline-flex; color:var(--accent-color);">${typeof Icons !== 'undefined' ? Icons.journal : '📔'}</span>
                <span class="widget-title adv-table-title" style="flex:0 1 auto; font-weight:bold; font-size:1rem; color:var(--text-primary);">${TemplateManager._escape(title)}</span>
            </div>
            <div class="widget-body" style="padding:10px; background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px;">
                ${entriesHtml || '<div style="font-size:0.75rem; color:var(--text-secondary); font-style:italic;">(Nessuna voce registrata)</div>'}
            </div>
        `;
    },

    _renderColumnsPreview: (wrapper, state) => {
        const colsCount = state.columns || 2;
        const widths = state.widths || Array(colsCount).fill(100 / colsCount);
        const contents = state.contents || Array(colsCount).fill('<p>Contenuto colonna...</p>');

        let colsHtml = '';
        for (let i = 0; i < colsCount; i++) {
            colsHtml += `
                <div class="col-box" style="padding:0 10px; border-right:${i < colsCount - 1 ? '1px dashed var(--border-color)' : 'none'};">
                    ${contents[i] || '<p><br></p>'}
                </div>
            `;
        }

        const gridTemplate = widths.map(w => w + '%').join(' ');
        wrapper.className = 'adv-widget-shell widget-type-columns';
        wrapper.innerHTML = `
            <div class="adv-columns-container-wrap" style="padding:10px; border:1px dashed var(--border-color); border-radius:6px;">
                <div class="adv-columns-independent" style="display:grid; grid-template-columns:${gridTemplate};">
                    ${colsHtml}
                </div>
            </div>
        `;
    },

    _renderFallbackWidget: (wrapper, type, state) => {
        let icon = typeof Icons !== 'undefined' ? Icons.gear : '⚙️';
        let title = (state && state.title) ? state.title : (type ? type.toUpperCase() : 'Widget');

        if (type === 'database') icon = typeof Icons !== 'undefined' ? Icons.tableDatabase : '📊';
        else if (type === 'pivot') icon = typeof Icons !== 'undefined' ? Icons.tablePivot : '📈';
        else if (type === 'journal') icon = typeof Icons !== 'undefined' ? Icons.journal : '📔';
        else if (type === 'code') icon = typeof Icons !== 'undefined' ? Icons.code : '</>';
        else if (type === 'buttonbar') icon = typeof Icons !== 'undefined' ? Icons.play : '▶';
        else if (type === 'columns') icon = typeof Icons !== 'undefined' ? Icons.columns : '||';
        else if (type === 'simple-table') icon = typeof Icons !== 'undefined' ? Icons.tableSimple : '🔲';

        wrapper.className = 'adv-widget-shell';
        wrapper.innerHTML = `
            <div style="margin: 12px 0; border: 1px dashed var(--border-color); border-radius: 6px; padding: 15px; background: rgba(0,0,0,0.02); text-align: center;">
                <div style="display:flex; align-items:center; justify-content:center; gap:8px; color:var(--accent-color); font-weight:bold; font-size:0.95rem; margin-bottom:4px;">
                    <span style="display:inline-flex;">${icon}</span> <span>${TemplateManager._escape(title)}</span>
                </div>
                <div style="font-size:0.75rem; color:var(--text-secondary); font-style:italic;">
                    Componente configurato nel template (verrà inizializzato all'applicazione)
                </div>
            </div>
        `;
    },

    previewTemplate: (tplId) => {
        const tpl = AppState.templates.find(t => t.id === tplId);
        if (!tpl) return;

        const safeTitle = (tpl.title || I18n.t('templates.default_new_name')).replace(/</g, '&lt;');

        // Genera il contenuto di anteprima idratato con rendering visivo reale per tutti i widget
        const previewContentHTML = TemplateManager.generateTemplatePreviewHTML(tpl);

        const bodyHTML = `
            <div style="display:flex; flex-direction:column; height: 100%;">
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; flex-shrink: 0;">
                    ${I18n.t('templates.preview_desc')}
                </div>
                <div class="editor-content adv-scroll-container" style="flex: 1; border: 1px solid var(--border-color); border-radius: 6px; padding: 20px; overflow-y: auto; background: var(--bg-color);">
                    <div style="pointer-events: none; opacity: 0.95; user-select: none; zoom: 0.75;">
                        ${previewContentHTML}
                    </div>
                </div>
            </div>
        `;

        const footerHTML = `
            <div style="display: flex; justify-content: flex-end; width: 100%; gap: 10px;">
                <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.cancel')}</button>
                <button class="btn btn-primary" onclick="TemplateManager.applyTemplate('${tpl.id}')">
                    <span style="display:inline-flex; align-items:center; gap:5px;">${Icons.checkCircle} ${I18n.t('templates.use_template_btn')}</span>
                </button>
            </div>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.search} ${I18n.t('templates.preview_title', { title: safeTitle })}</span>`, bodyHTML, footerHTML);
    },

    openManager: () => {
        UI.closeDrawer();

        if (!AppState.templates) AppState.templates = [];

        let bodyHTML = ``;

        if (AppState.templates.length === 0) {
            bodyHTML += `<div style="text-align:center; padding:30px; color:var(--text-secondary); font-style:italic; background:rgba(0,0,0,0.02); border-radius:6px; border:1px dashed var(--border-color);">${I18n.t('templates.empty_workspace')}</div>`;
        } else {
            const sortedTemplates = [...AppState.templates].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            
            bodyHTML += `<div style="display:flex; flex-direction:column; gap:10px; overflow-y:auto; max-height:70vh; padding-right:5px;" class="adv-scroll-container">`;
            
            sortedTemplates.forEach((tpl) => {
                const safeTitle = (tpl.title || I18n.t('templates.default_new_name')).replace(/</g, '&lt;');
                const dateStr = new Date(tpl.updatedAt).toLocaleDateString('it-IT') + ' ' + new Date(tpl.updatedAt).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
                const widgetCount = Object.keys(tpl.widgets || {}).length;
                
                let countStr = widgetCount === 0 
                    ? I18n.t('templates.contains_text_only') 
                    : (widgetCount === 1 ? I18n.t('templates.contains_single_widget') : I18n.t('templates.contains_multi_widgets', { count: widgetCount }));

                bodyHTML += `
                    <div style="background:var(--bg-color); border:1px solid var(--border-color); padding:15px; border-radius:6px; display:flex; flex-direction:column; gap:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="font-weight:bold; color:var(--accent-color); font-size:1.1rem;">${safeTitle}</div>
                            <div style="display:flex; gap:5px;">
                                <button class="btn" style="padding:4px 8px; font-size:0.8rem; background:rgba(37, 99, 235, 0.1); color:var(--accent-color); border-color:var(--accent-color);" onclick="TemplateManager.previewTemplate('${tpl.id}')" title="Anteprima">
                                    <span style="margin-right:4px; display:inline-flex; align-items:center;">${Icons.search}</span> ${I18n.t('templates.preview_title', { title: '' }).replace(': ', '')}
                                </button>
                                <button class="adv-icon-btn danger" style="padding:4px 8px; background:rgba(239,68,68,0.1);" onclick="TemplateManager.deleteTemplate('${tpl.id}')" title="${I18n.t('common.delete')}">${Icons.trash}</button>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-secondary);">
                            <span>Contiene ${countStr}</span>
                            <span>${I18n.t('templates.updated_at', { date: dateStr })}</span>
                        </div>
                    </div>
                `;
            });
            bodyHTML += `</div>`;
        }

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.file} ${I18n.t('templates.drawer_title')}</span>`, bodyHTML, null);
    },

    saveNoteAsTemplate: (noteId) => {
        // Se stiamo salvando la nota corrente attiva, sincronizziamo preventivamente il content
        if (AppState.currentNoteId === noteId && typeof Editor !== 'undefined' && typeof Editor.sanitizeContent === 'function') {
            Editor.sanitizeContent();
        }

        const note = Store.getNote(noteId);
        if (!note || !note.content) return;

        const defaultName = note.title || I18n.t('templates.default_new_name');
        const tplTitle = prompt(I18n.t('templates.prompt_save_name'), defaultName);
        if (!tplTitle) return;

        const tpl = {
            id: 'tpl_' + Store.generateId(),
            title: tplTitle.trim(),
            content: note.content,
            widgets: {},
            updatedAt: new Date().toISOString(),
            lastUsed: new Date().toISOString()
        };

        const parser = new DOMParser();
        const doc = parser.parseFromString(note.content, 'text/html');
        
        // Raccoglie tutti i widget shell nel documento
        doc.querySelectorAll('.adv-widget-shell, [data-widget-type], .adv-table-wrapper, .adv-journal-wrapper, .code-wrapper, .adv-action-button-wrapper').forEach(w => {
            if (w.id && AppState.databases) {
                const trueId = w.id.split('_cited_')[0];
                if (AppState.databases[trueId]) {
                    tpl.widgets[trueId] = JSON.parse(JSON.stringify(AppState.databases[trueId]));
                }
            }
        });

        // Raccoglie transitivamente eventuali database sorgente referenziati (es. Viste Collegate o Pivot)
        let addedSource = true;
        while (addedSource) {
            addedSource = false;
            Object.values(tpl.widgets).forEach(st => {
                if (st && st.sourceTableId && AppState.databases) {
                    const srcId = st.sourceTableId.split('_cited_')[0];
                    if (AppState.databases[srcId] && !tpl.widgets[srcId]) {
                        tpl.widgets[srcId] = JSON.parse(JSON.stringify(AppState.databases[srcId]));
                        addedSource = true;
                    }
                }
            });
        }

        if (!AppState.templates) AppState.templates = [];
        AppState.templates.push(tpl);

        Store.triggerAutoSave();
        
        if (typeof UI !== 'undefined') UI.renderTree();
        if (typeof UI.showToast !== 'undefined') UI.showToast(I18n.t('templates.toast_saved', { title: tpl.title }), "success");
    },

    saveCurrentNoteAsTemplate: () => {
        if (!AppState.currentNoteId) {
            alert(I18n.t('templates.alert_no_current_note'));
            return;
        }
        if (typeof Editor !== 'undefined') Editor.sanitizeContent();
        TemplateManager.saveNoteAsTemplate(AppState.currentNoteId);
    },

    deleteTemplate: (tplId) => {
        if (!confirm(I18n.t('templates.confirm_delete'))) return;
        
        AppState.templates = AppState.templates.filter(t => t.id !== tplId);
        Store.triggerAutoSave();
        
        UI.closeDrawer();
        if (typeof UI !== 'undefined') UI.renderTree();
    },

    applyTemplate: (tplId) => {
        const tpl = AppState.templates.find(t => t.id === tplId);
        if (!tpl) return;

        if (!AppState.currentNoteId) {
            alert(I18n.t('templates.alert_no_open_note'));
            return;
        }

        const note = Store.getNote(AppState.currentNoteId);
        const editorEl = document.getElementById('noteContent');
        if (!editorEl) return;

        const text = editorEl.innerText.replace(/\u200B/g, '').trim();
        const hasWidgets = editorEl.querySelector('img, table, .adv-widget-shell, hr');
        if (text !== '' || hasWidgets) {
            if (!confirm(I18n.t('templates.confirm_overwrite'))) {
                return;
            }
        }

        UI.closeDrawer();
        
        let rawHtml = tpl.content;
        const idMap = {};
        const titleMap = {};

        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        Object.keys(tpl.widgets || {}).forEach(oldId => {
            let typePrefix = 'adv_tbl_';
            if (oldId.includes('adv_journal_')) typePrefix = 'adv_journal_';
            else if (oldId.includes('adv_code_')) typePrefix = 'adv_code_';
            else if (oldId.includes('adv_btnbar_')) typePrefix = 'adv_btnbar_';
            else if (oldId.includes('cit_')) typePrefix = 'cit_';
            else if (oldId.includes('adv_cols_')) typePrefix = 'adv_cols_';

            idMap[oldId] = typePrefix + Store.generateId();
            
            const state = tpl.widgets[oldId];
            if (state && state.title && typePrefix === 'adv_tbl_' && !state.isPivot && !state.isLinkedView) {
                let baseTitle = state.title;
                let counter = 1;
                let finalTitle = `${baseTitle} (${counter})`;
                const existingNames = Object.values(AppState.databases).map(db => db.title);
                
                while (existingNames.includes(finalTitle) || Object.values(titleMap).includes(finalTitle)) {
                    counter++;
                    finalTitle = `${baseTitle} (${counter})`;
                }
                titleMap[baseTitle] = finalTitle;
            }
        });

        Object.keys(idMap).forEach(oldId => {
            const regex = new RegExp(escapeRegExp(oldId), 'g');
            rawHtml = rawHtml.replace(regex, idMap[oldId]);
        });

        Object.keys(tpl.widgets || {}).forEach(oldId => {
            const newId = idMap[oldId];
            if (!newId) return;

            let stateStr = JSON.stringify(tpl.widgets[oldId]);
            
            Object.keys(idMap).forEach(oId => {
                const regex = new RegExp(escapeRegExp(oId), 'g');
                stateStr = stateStr.replace(regex, idMap[oId]);
            });

            Object.keys(titleMap).forEach(oldTitle => {
                const newTitle = titleMap[oldTitle];
                
                const titlePropRegex = new RegExp(`"title":"${escapeRegExp(oldTitle)}"`, 'g');
                stateStr = stateStr.replace(titlePropRegex, `"title":"${newTitle}"`);
                
                const formulaRegex1 = new RegExp(`tabella\\[\\\\?"${escapeRegExp(oldTitle)}\\\\?"\\]`, 'g');
                const formulaRegex2 = new RegExp(`tabella\\[\\\\?'${escapeRegExp(oldTitle)}\\\\?'\\]`, 'g');
                
                stateStr = stateStr.replace(formulaRegex1, `tabella[\\"${newTitle}\\"]`);
                stateStr = stateStr.replace(formulaRegex2, `tabella[\\'${newTitle}\\']`);
            });

            if (!AppState.databases) AppState.databases = {};
            AppState.databases[newId] = JSON.parse(stateStr);
        });

        if (text === '' && !hasWidgets) {
            editorEl.innerHTML = rawHtml;
        } else {
            editorEl.innerHTML += '<p><br></p>' + rawHtml;
        }

        tpl.lastUsed = new Date().toISOString();
        TemplateManager.toggleEmptyOverlay();

        if (typeof WidgetManager !== 'undefined') WidgetManager.mountAll(editorEl);
        
        if (typeof Editor !== 'undefined' && typeof Editor.getCleanHTML === 'function') {
            note.content = Editor.getCleanHTML();
        } else if (typeof Editor !== 'undefined' && typeof Editor.minifyHTMLForStorage === 'function') {
            note.content = Editor.minifyHTMLForStorage(editorEl.innerHTML);
        } else {
            note.content = editorEl.innerHTML;
        }
        note.updatedAt = new Date().toISOString();
        note._isDirty = true;

        Store.triggerAutoSave();
        if (typeof UI.showToast !== 'undefined') UI.showToast(I18n.t('templates.toast_applied'), "success");
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const editorEl = document.getElementById('noteContent');
    if (editorEl) {
        editorEl.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') {
                const overlay = document.getElementById('emptyNoteOverlay');
                if (overlay && overlay.style.display === 'block') {
                    overlay.style.display = 'none';
                }
            }
        });
    }
});