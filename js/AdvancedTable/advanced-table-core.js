/**
 * AdvancedTableCore.js
 * Motore di Stato (State Management), Lifecycle e Inizializzazione RDBMS.
 * Supporto esteso ai parametri per la Vista Gerarchica ad Albero (Tree Table / WBS).
 * FIX DEFENSIVE GUARDS: Inizializzazione difensiva e controlli rigorosi su Array.isArray(db.rows) 
 * e r.cells in ensureSystemPropertiesDB, syncSystemPropertiesRow e deleteSystemPropertiesRow.
 * FIX MULTI-WIDGET ROUTING: updateDependentViews ora riconosce esplicitamente i diari (JournalManager),
 * blocchi codice (CodeManager) e button bar (ButtonManager), evitando che vengano ridisegnati come tabelle RDBMS.
 */

const AdvancedTable = {
    resizingCol: null,
    draggedColId: null,
    startX: 0,
    startWidth: 0,
    pillColors: ['', 'hl-c1', 'hl-c2', 'hl-c3', 'hl-c4', 'hl-c5', 'hl-c6', 'hl-c7', 'hl-c8', 'hl-c9', 'hl-c10'],
    panState: null,

    // ==========================================
    // GESTIONE SHADOW DATABASE (Proprietà di Pagina e Tag)
    // ==========================================
    ensureSystemPropertiesDB: () => {
        if (!AppState.databases) AppState.databases = {};
        
        if (!AppState.databases['SYS_PROPERTIES_DB']) {
            AppState.databases['SYS_PROPERTIES_DB'] = {
                title: "Proprietà e Tag di Pagina",
                isSystemDB: true,
                columns: [
                    { id: 'sys_c_note', name: 'Pagina Collegata', type: 'record_note', width: 200, hidden: false },
                    { id: 'sys_c_tags', name: 'Tag', type: 'multi-select', width: 250, hidden: false }
                ],
                rows: [],
                selectOptions: { 'sys_c_tags': [] },
                selectColors: { 'sys_c_tags': {} },
                sorts: [], 
                filters: {}, 
                automations: []
            };
        }

        const db = AppState.databases['SYS_PROPERTIES_DB'];
        if (!Array.isArray(db.rows)) db.rows = [];
        if (!db.selectOptions) db.selectOptions = { 'sys_c_tags': [] };
        if (!db.selectColors) db.selectColors = { 'sys_c_tags': {} };
        
        if (AppState.notes) {
            AppState.notes.forEach(n => {
                if (!n.deletedAt && !db.rows.find(r => r && r.cells && r.cells['sys_c_note'] === n.id)) {
                    db.rows.push({
                        id: 'sys_r_' + n.id,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        cells: { 'sys_c_note': n.id, 'sys_c_tags': [] }
                    });
                }
            });
        }
    },

    syncSystemPropertiesRow: (noteId) => {
        if (!AppState.databases || !AppState.databases['SYS_PROPERTIES_DB']) return;
        const db = AppState.databases['SYS_PROPERTIES_DB'];
        if (!Array.isArray(db.rows)) db.rows = [];
        if (!db.rows.find(r => r && r.cells && r.cells['sys_c_note'] === noteId)) {
            db.rows.push({
                id: 'sys_r_' + noteId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                cells: { 'sys_c_note': noteId, 'sys_c_tags': [] }
            });
        }
    },

    deleteSystemPropertiesRow: (noteId) => {
        if (!AppState.databases || !AppState.databases['SYS_PROPERTIES_DB']) return;
        const db = AppState.databases['SYS_PROPERTIES_DB'];
        if (!Array.isArray(db.rows)) {
            db.rows = [];
            return;
        }
        db.rows = db.rows.filter(r => r && r.cells && r.cells['sys_c_note'] !== noteId);
    },

    destroy: (id) => {
        if (typeof AdvancedTable.deleteTable === 'function') {
            AdvancedTable.deleteTable(id, true);
        }
    },

    closeDropdowns: (force = false) => {
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(force);
    },

    _positionDropdown: (dropdown, anchorId) => {
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.positionAt(dropdown, anchorId);
    },

    buildContextMenu: (anchorId, items) => {
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.buildContextMenu(anchorId, items);
    },

    // Gestione DB Virtuale in Background
    getParentNoteName: (widgetId) => {
        if (widgetId === 'SYS_PROPERTIES_DB') return "Sistema Globale";
        if (!AppState.notes) return "Workspace";
        for (let n of AppState.notes) {
            if (n.content && n.content.includes(widgetId)) {
                return n.title || 'Senza Titolo';
            }
        }
        return "Orfano";
    },

    _sanitizeState: (state) => {
        if (!state) return state;
        if (!state.rows) state.rows =[];
        if (!state.columns) state.columns = [];
        if (!state.sorts) state.sorts =[];
        if (!state.filters) state.filters = {};
        if (!state.automations) state.automations =[];
        if (!state.selectOptions) state.selectOptions = {};
        if (!state.selectColors) state.selectColors = {};
        if (!state.selectedRows) state.selectedRows = [];
        if (!state.conditionalColors) state.conditionalColors = [];
        if (state.hideFooterControls === undefined) state.hideFooterControls = false;
        if (!state.treeCollapsedNodes) state.treeCollapsedNodes = [];
        return state;
    },

    _resolveSourceId: (tableId) => {
        const trueId = tableId.split('_cited_')[0];
        const state = AppState.databases ? AppState.databases[trueId] : null;
        return (state && state.isLinkedView) ? state.sourceTableId : trueId;
    },

    updateDependentViews: (sourceTableId) => {
        if (!AppState.databases) return;
        const targetTrueId = sourceTableId.split('_cited_')[0];
        
        Object.keys(AppState.databases).forEach(id => {
            const s = AppState.databases[id];
            if (s && (id === targetTrueId || s.sourceTableId === targetTrueId)) {
                
                const wrapper = document.getElementById(id);
                if (wrapper) {
                    if (s.isPivot && typeof AdvancedPivot !== 'undefined') {
                        AdvancedPivot.render(id);
                    } else if (id.startsWith('adv_journal_') && typeof JournalManager !== 'undefined') {
                        JournalManager.render(id);
                    } else if (id.startsWith('adv_btnbar_') && typeof ButtonManager !== 'undefined') {
                        ButtonManager.render(id);
                    } else if (id.startsWith('adv_code_') && typeof CodeManager !== 'undefined') {
                        CodeManager.mountAll(wrapper);
                    } else if (typeof AdvancedTable.renderTable === 'function') {
                        AdvancedTable.renderTable(id);
                    }
                }
                
                const citations = document.querySelectorAll(`[id^="${id}_cited_"]`);
                citations.forEach(cit => {
                    if (s.isPivot && typeof AdvancedPivot !== 'undefined') {
                        AdvancedPivot.render(cit.id);
                    } else if (id.startsWith('adv_journal_') && typeof JournalManager !== 'undefined') {
                        JournalManager.render(cit.id);
                    } else if (id.startsWith('adv_btnbar_') && typeof ButtonManager !== 'undefined') {
                        ButtonManager.render(cit.id);
                    } else if (id.startsWith('adv_code_') && typeof CodeManager !== 'undefined') {
                        CodeManager.mountAll(cit);
                    } else if (typeof AdvancedTable.renderTable === 'function') {
                        AdvancedTable.renderTable(cit.id);
                    }
                });
            }
        });
    },

    getTableState: (targetId) => {
        if (!targetId) return null;
        if (!AppState.databases) AppState.databases = {};

        const trueId = targetId.split('_cited_')[0];

        if (AppState.databases[trueId]) {
            const state = AppState.databases[trueId];
            if (state.entries) return AdvancedTable._sanitizeState(AdvancedTable._convertJournalToTableState(trueId, state));
            return AdvancedTable._sanitizeState(state);
        }
        
        const el = document.getElementById(targetId);
        if (el && el.hasAttribute('data-state')) {
            try { 
                const s = JSON.parse(el.getAttribute('data-state').replace(/&quot;/g, '"')); 
                AppState.databases[trueId] = AdvancedTable._sanitizeState(s);
                el.removeAttribute('data-state');
                if (el.classList.contains('adv-journal-wrapper') || el.getAttribute('data-widget-type') === 'journal') {
                    return AdvancedTable._sanitizeState(AdvancedTable._convertJournalToTableState(trueId, s));
                }
                return AdvancedTable._sanitizeState(s);
            } catch (e) { }
        }
        return null;
    },

    _convertJournalToTableState: (id, jState) => {
        const fakeState = {
            title: 'Diario/Log',
            isPivot: false,
            columns:[
                { id: 'j_date', name: 'Data', type: 'date' },
                { id: 'j_time', name: 'Ora', type: 'time' },
                { id: 'j_text', name: 'Testo', type: 'text' },
                { id: 'j_done', name: 'Completato', type: 'checkbox' },
                { id: 'j_end', name: 'Data Fine', type: 'datetime' }
            ],
            rows: []
        };

        (jState.entries ||[]).forEach(entry => {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = entry.content || '';
            const plainText = tempDiv.innerText || tempDiv.textContent;

            let endFormatted = '';
            if (entry.endTime) {
                const ed = new Date(entry.endTime);
                ed.setMinutes(ed.getMinutes() - ed.getTimezoneOffset());
                endFormatted = ed.toISOString().slice(0, 16);
            }

            fakeState.rows.push({
                id: entry.id,
                createdAt: entry.timestamp,
                updatedAt: entry.endTime || entry.timestamp,
                cells: {
                    'j_date': (entry.dateStr || '').replace(/\//g, '-'),
                    'j_time': entry.timeStr || '',
                    'j_text': plainText,
                    'j_done': !!entry.endTime,
                    'j_end': endFormatted
                }
            });
        });
        return fakeState;
    },

    getState: (tableId) => {
        if (!AppState.databases) AppState.databases = {};
        
        const trueId = tableId.split('_cited_')[0];
        let state = AppState.databases[trueId];

        if (!state) {
            const wrapper = document.getElementById(tableId);
            if (wrapper && wrapper.hasAttribute('data-state')) {
                try {
                    state = JSON.parse(wrapper.getAttribute('data-state').replace(/&quot;/g, '"'));
                    AppState.databases[trueId] = AdvancedTable._sanitizeState(state);
                    wrapper.removeAttribute('data-state');
                } catch (e) { 
                    state = { title: "⚠️ Dati Corrotti", isPivot: false, columns:[{ id: 'c_err', name: 'Errore', type: 'text', width: 200 }], rows:[{ id: 'r_err', cells: { 'c_err': 'Contenuto illeggibile.' } }], selectOptions: {}, selectColors: {}, sorts: [], filters: {}, automations:[], conditionalColors:[] };
                    AppState.databases[trueId] = state;
                }
            }
        }

        if (state) {
            state = AdvancedTable._sanitizeState(state);

            if (state.isLinkedView) {
                const sourceState = AppState.databases[state.sourceTableId];
                if (sourceState) {
                    state.columns = sourceState.columns;
                    state.rows = sourceState.rows;
                    state.selectOptions = sourceState.selectOptions;
                    state.selectColors = sourceState.selectColors;
                    state.automations = sourceState.automations;
                    state.conditionalColors = sourceState.conditionalColors;
                    state.sourceDeleted = false;
                } else {
                    state.sourceDeleted = true;
                    state.columns = [];
                    state.rows =[];
                }
            }
            return state;
        }

        return null;
    },

    setState: (tableId, state) => {
        if (!AppState.databases) AppState.databases = {};
        
        const trueId = tableId.split('_cited_')[0];

        const universalConfig = {
            title: state.title,
            isSystemDB: state.isSystemDB,
            isLinkedView: state.isLinkedView,
            isPivot: state.isPivot,
            sourceTableId: state.sourceTableId,
            viewType: state.viewType,
            freeWidth: state.freeWidth,
            striped: state.striped,
            textClamp: state.textClamp,
            filters: state.filters,
            savedFilters: state.savedFilters,
            sorts: state.sorts,
            viewConfig: state.viewConfig,
            boardGroupBy: state.boardGroupBy,
            treeRelationColId: state.treeRelationColId,
            treeRelationDirection: state.treeRelationDirection,
            treeCollapsedNodes: state.treeCollapsedNodes || [],
            calendarDateCol: state.calendarDateCol,
            calendarMode: state.calendarMode,
            calendarFocusDate: state.calendarFocusDate,
            calendarZoom: state.calendarZoom,
            timelineDateCol: state.timelineDateCol,
            timelineGroupBy: state.timelineGroupBy,
            timelineZoom: state.timelineZoom,
            groupBy: state.groupBy,
            aggregations: state.aggregations,
            chartConfig: state.chartConfig,
            selectedRows: state.selectedRows || [],
            conditionalColors: state.conditionalColors || [],
            pageSize: state.pageSize || 'all',
            currentPage: state.currentPage || 1,
            hideFooterControls: state.hideFooterControls || false
        };

        if (state.isLinkedView) {
            AppState.databases[trueId] = universalConfig;
        } else if (state.isPivot) {
            let fullState = AdvancedTable._sanitizeState(state);
            AppState.databases[trueId] = { ...fullState, ...universalConfig };
        } else {
            let fullState = AdvancedTable._sanitizeState(state);
            AppState.databases[trueId] = { ...fullState, ...universalConfig };
        }
    },
    
    startPan: (e) => {
        const tgt = e.target;
        if (tgt.closest('input, textarea, button, a, select, .adv-select-pill, .adv-add-btn, .adv-tool-btn, .adv-icon-btn, .widget-drag-handle, .widget-options-btn, .adv-board-card, .adv-tree-toggle, .adv-tree-quick-add')) return;
        if (tgt.closest('.widget-editable-area') || tgt.closest('.adv-col-resizer') || tgt.closest('.adv-cell-text[contenteditable="true"]')) return;
        if (tgt.closest('th')) return;

        const scrollContainer = tgt.closest('.adv-scroll-container, .adv-kanban-col');
        if (!scrollContainer) return;

        const rect = scrollContainer.getBoundingClientRect();
        if (e.clientY > rect.bottom - 15 || e.clientX > rect.right - 15) return;

        if (scrollContainer.scrollWidth <= scrollContainer.clientWidth && 
            scrollContainer.scrollHeight <= scrollContainer.clientHeight) return;

        AdvancedTable.panState = { 
            el: scrollContainer, 
            startX: e.pageX, 
            startY: e.pageY,
            scrollLeft: scrollContainer.scrollLeft,
            scrollTop: scrollContainer.scrollTop
        };
        
        document.body.style.cursor = 'grabbing';
        document.addEventListener('mousemove', AdvancedTable.onPanMove);
        document.addEventListener('mouseup', AdvancedTable.onPanEnd);
    },

    onPanMove: (e) => {
        if (!AdvancedTable.panState) return;
        e.preventDefault(); 
        
        const ps = AdvancedTable.panState;
        const diffX = e.pageX - ps.startX;
        const diffY = e.pageY - ps.startY;
        
        ps.el.scrollLeft = ps.scrollLeft - diffX;
        ps.el.scrollTop = ps.scrollTop - diffY;
    },

    onPanEnd: () => {
        if (AdvancedTable.panState) {
            AdvancedTable.panState = null;
            document.removeEventListener('mousemove', AdvancedTable.onPanMove);
            document.removeEventListener('mouseup', AdvancedTable.onPanEnd);
        }
        document.body.style.cursor = ''; 
    },

    initEvents: () => {
        document.addEventListener('mousemove', AdvancedTable.handleGlobalMouseMove);
        document.addEventListener('mouseup', AdvancedTable.handleGlobalMouseUp);
        
        document.addEventListener('mouseleave', (e) => {
            if (e.clientY <= 0 || e.clientX <= 0 || (e.clientX >= window.innerWidth || e.clientY >= window.innerHeight)) {
                if (AdvancedTable.resizingCol) AdvancedTable.handleGlobalMouseUp(e);
                AdvancedTable.onPanEnd(); 
            }
        });

        document.addEventListener('mousedown', AdvancedTable.startPan);
    },

    mountAll: (container = document) => {
        const wrappers = container.querySelectorAll('.adv-table-wrapper, [data-widget-type="database"], [data-widget-type="pivot"]');
        const seenIds = new Set();
        
        wrappers.forEach(wrapper => {
            if (wrapper.closest('.block-citation') && container.id === 'noteContent') return;

            wrapper.setAttribute('contenteditable', 'false');

            let currentId = wrapper.id;
            if (!currentId || seenIds.has(currentId)) {
                const newId = 'adv_tbl_' + Store.generateId();
                wrapper.id = newId;
                
                if (wrapper.hasAttribute('data-state')) {
                    try {
                        const s = JSON.parse(wrapper.getAttribute('data-state').replace(/&quot;/g, '"'));
                        if (!AppState.databases) AppState.databases = {};
                        AppState.databases[newId] = AdvancedTable._sanitizeState(s);
                        wrapper.removeAttribute('data-state');
                    } catch(e) {}
                }
                currentId = newId;
            }
            seenIds.add(currentId);

            try {
                const s = AdvancedTable.getState(currentId);
                if (s && s.isPivot && typeof AdvancedPivot !== 'undefined') AdvancedPivot.render(currentId);
                else AdvancedTable.renderTable(currentId);

                if (s && s.automations && typeof AdvancedAutomations !== 'undefined') {
                    setTimeout(() => { AdvancedAutomations.triggerOnLoad(currentId); }, 250);
                }

            } catch (e) { AdvancedTable.renderTable(currentId); }
        });
    },

    create: () => {
        if (!AppState.isEditMode) return;
        Editor.restoreSelection();
        const sel = window.getSelection();
        let node = sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
        if(node && node.nodeType === 3) node = node.parentNode;

        if (node && node.closest('.widget-type-columns, .simple-table-wrapper')) {
            alert("Non è permesso inserire Widget Complessi all'interno delle Colonne o delle Tabelle Semplici per prevenire la corruzione del layout.\nSposta il cursore fuori prima di inserire.");
            return;
        }

        const tableId = 'adv_tbl_' + Store.generateId();
        const now = Date.now();
        const initialState = {
            title: 'Nuovo Database',
            viewType: 'table',
            freeWidth: false,
            striped: true,
            textClamp: 1,
            automations: [],
            conditionalColors: [],
            hideFooterControls: false,
            columns:[
                { id: 'c_1', name: 'Nome', type: 'text', width: 200, hidden: false },
                { id: 'c_2', name: 'Tag', type: 'multi-select', width: 180, hidden: false },
                { id: 'c_3', name: 'Ultima Modifica', type: 'last_edited_time', width: 150, hidden: false }
            ],
            rows:[
                { id: 'r_1', createdAt: now, updatedAt: now, cells: { c_1: 'Elemento 1', c_2: [], c_3: '' } },
                { id: 'r_2', createdAt: now, updatedAt: now, cells: { c_1: '', c_2:[], c_3: '' } }
            ],
            selectOptions: { c_2:[] },
            selectColors: { c_2: {} },
            sorts: [],
            filters: {},
            selectedRows:[]
        };

        if (!AppState.databases) AppState.databases = {};
        AppState.databases[tableId] = AdvancedTable._sanitizeState(initialState);

        let wrapper;
        if (typeof WidgetManager !== 'undefined') {
            wrapper = WidgetManager.createShell('database', tableId);
        } else {
            wrapper = document.createElement('div');
            wrapper.className = 'adv-table-wrapper';
            wrapper.id = tableId;
            wrapper.contentEditable = "false";
        }

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();

        let targetBlock = node ? node.closest('p, div, li, h1, h2, h3, h4, h5, h6') : null;
        const isEmptyBlock = targetBlock && targetBlock.id !== 'noteContent' && targetBlock.textContent.replace(/[\u200B\n\r]/g, '').trim() === '';

        if (isEmptyBlock) {
            targetBlock.parentNode.replaceChild(wrapper, targetBlock);
        } else {
            if (sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(wrapper);
            } else {
                document.getElementById('noteContent').appendChild(wrapper);
            }
        }

        const p = document.createElement('p'); 
        p.innerHTML = '<br>';
        wrapper.parentNode.insertBefore(p, wrapper.nextSibling);

        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
    }
};

document.addEventListener('DOMContentLoaded', AdvancedTable.initEvents);