/**
 * JournalManager.js
 * Modulo per la gestione degli elenchi di tipo Diario/Log.
 * FIX CITAZIONI: Disattivate maniglie, click checkbox e focus input se il widget si trova in una citazione.
 * FEAT PRIORITÀ: Aggiunto sistema per indicare priorità Alta/Bassa sulle singole attività interagendo con la gutter laterale.
 * FIX RICERCA DIARIO: Isolamento eventi da tastiera con stopPropagation su input di ricerca,
 * rimozione del blocco readonly e ripristino asincrono del cursore post-render.
 */

const JournalManager = {
    _focusAfterRender: null,
    _pendingDeletions: {}, 

    destroy: (id) => {
        if (typeof JournalManager.deleteJournal === 'function') {
            const wrapper = document.getElementById(id);
            if (wrapper) wrapper.remove();
            
            const trueId = id.split('_cited_')[0];
            if (AppState.databases && AppState.databases[trueId]) {
                delete AppState.databases[trueId];
            }
        }
    },

    init: () => {
    },

    getState: (id) => {
        if (!AppState.databases) AppState.databases = {};
        
        const trueId = id.split('_cited_')[0];
        if (AppState.databases[trueId]) return AppState.databases[trueId];
        
        const wrapper = document.getElementById(id);
        if (!wrapper) return null;
        try {
            if (wrapper.hasAttribute('data-state')) {
                const state = JSON.parse(wrapper.getAttribute('data-state').replace(/&quot;/g, '"'));
                AppState.databases[trueId] = state;
                wrapper.removeAttribute('data-state'); 
                return state;
            }
        } catch (e) { return null; }
        
        return null;
    },

    setState: (id, state) => {
        if (!AppState.databases) AppState.databases = {};
        
        const trueId = id.split('_cited_')[0];
        AppState.databases[trueId] = state;
        Store.triggerAutoSave();
    },

    mountAll: (container = document) => {
        const editor = container.id === 'noteContent' ? container : (container.querySelector ? container.querySelector('#noteContent') || container : document);
        if (!editor || !editor.querySelectorAll) return;

        const legacyJournals = editor.querySelectorAll('ul.adv-journal-list[data-journal="true"]');
        legacyJournals.forEach(legacy => {
            const state = { entries: [], collapsedDates:[], displayLimit: 'all', showSearch: false, searchTerm: '', hideCompleted: false };
            
            legacy.querySelectorAll('.journal-time-node').forEach(timeNode => {
                const ts = parseInt(timeNode.getAttribute('data-timestamp') || Date.now());
                const dateNode = timeNode.closest('.journal-date-node');
                const dateStr = dateNode ? dateNode.getAttribute('data-date') : JournalManager.formatDate(new Date(ts));
                const timeLabel = timeNode.querySelector('.journal-time-label');
                const timeStr = timeLabel ? timeLabel.innerText.trim() : JournalManager.formatTime(new Date(ts));
                const contentDiv = timeNode.querySelector('.journal-content');
                let contentHTML = contentDiv ? contentDiv.innerHTML.replace(/\u200B/g, '').trim() : '';
                if (contentHTML === '<br>') contentHTML = '';
                const isCompleted = timeLabel && timeLabel.classList.contains('completed');

                state.entries.push({ id: 'je_' + Store.generateId(), timestamp: ts, dateStr, timeStr, content: contentHTML, endTime: isCompleted ? Date.now() : null, priority: null });
            });

            const newId = 'adv_journal_' + Store.generateId();
            const wrapper = typeof WidgetManager !== 'undefined' ? WidgetManager.createShell('journal', newId) : document.createElement('div');
            wrapper.className = 'adv-journal-wrapper adv-widget-shell';
            wrapper.id = newId;
            wrapper.contentEditable = "false";
            
            if (!AppState.databases) AppState.databases = {};
            AppState.databases[newId] = state;

            legacy.parentNode.replaceChild(wrapper, legacy);
            JournalManager.render(newId);
        });

        const wrappers = container.querySelectorAll('.adv-journal-wrapper,[data-widget-type="journal"]');
        const seenIds = new Set();

        wrappers.forEach(wrapper => {
            wrapper.setAttribute('contenteditable', 'false');
            let currentId = wrapper.id;
            if (!currentId || seenIds.has(currentId)) {
                currentId = 'adv_journal_' + Store.generateId();
                wrapper.id = currentId;
                if (wrapper.hasAttribute('data-state')) {
                    try {
                        const s = JSON.parse(wrapper.getAttribute('data-state').replace(/&quot;/g, '"'));
                        if (!AppState.databases) AppState.databases = {};
                        AppState.databases[currentId] = s;
                        wrapper.removeAttribute('data-state');
                    } catch(e) {}
                }
            }
            seenIds.add(currentId);
            const st = JournalManager.getState(currentId);
            if(st && st.hideCompleted === undefined) st.hideCompleted = false;
            JournalManager.render(currentId);
        });
    },

    onDragStart: (e, journalId) => {
        if (!AppState.isEditMode) return;
        AppState.draggedBlockId = journalId;
        AppState.draggedBlockType = 'journal';
        e.dataTransfer.effectAllowed = 'move';
        
        UI.Menu.closeAll();

        const wrapper = document.getElementById(journalId);
        if (wrapper) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNode(wrapper);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    },

    onDragEnd: (e) => {
        AppState.draggedBlockId = null;
        AppState.draggedBlockType = null;
        document.querySelectorAll('.node-content').forEach(el => el.classList.remove('drag-middle', 'drag-top', 'drag-bottom'));
        const tc = document.getElementById('treeContainer');
        if (tc) tc.classList.remove('drag-over-root');
    },

    formatDate: (dateObj) => {
        return `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`;
    },

    formatTime: (dateObj) => {
        return `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
    },

    openMenu: (e, journalId) => {
        e.preventDefault();
        e.stopPropagation();
        UI.Menu.closeAll(true);

        const state = JournalManager.getState(journalId);
        const limit = state.displayLimit || 'all';
        const isSearchVisible = state.showSearch === true;
        const isHideCompleted = state.hideCompleted === true;
        const chk = ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>';

        const menuItems =[
            { 
                icon: Icons.listFilter, 
                label: 'Nascondi completati (Vedi solo To-Do)' + (isHideCompleted ? chk : ''), 
                onClick: () => JournalManager.toggleHideCompleted(journalId) 
            },
            { type: 'divider' },
            { 
                icon: Icons.filter, 
                label: 'Mostra barra di ricerca' + (isSearchVisible ? chk : ''), 
                onClick: () => JournalManager.toggleSearch(journalId) 
            },
            {
                icon: Icons.date,
                label: 'Giorni visualizzati',
                type: 'submenu',
                items:[
                    { label: 'Tutti i giorni' + (limit === 'all' ? chk : ''), onClick: () => JournalManager.setDisplayLimit(journalId, 'all') },
                    { label: 'Ultimi 7 giorni' + (limit === 7 ? chk : ''), onClick: () => JournalManager.setDisplayLimit(journalId, 7) },
                    { label: 'Ultimi 14 giorni' + (limit === 14 ? chk : ''), onClick: () => JournalManager.setDisplayLimit(journalId, 14) }
                ]
            },
            { type: 'divider' },
            { 
                icon: Icons.exportCSV, 
                label: 'Esporta Diario come CSV', 
                onClick: () => JournalManager.exportJournalCSV(journalId) 
            },
            { type: 'divider' },
            { 
                icon: Icons.trash, 
                label: 'Elimina Intero Diario', 
                danger: true, 
                onClick: () => JournalManager.deleteJournal(journalId)
            }
        ];

        UI.Menu.buildContextMenu(`j-opt-btn-${journalId}`, menuItems);
    },

    openPriorityMenu: (e, journalId, entryId) => {
        e.stopPropagation();
        UI.Menu.closeAll(true);
        
        const btnId = `prio-btn-${entryId}`;
        e.currentTarget.id = btnId;
        
        const items = [
            { icon: `<span style="color:var(--danger-color); display:flex; align-items:center;">${Icons.priorityHigh}</span>`, label: 'Priorità Alta', onClick: () => JournalManager.setPriority(journalId, entryId, 'high') },
            { icon: `<span style="color:var(--tx-c7); display:flex; align-items:center;">${Icons.priorityLow}</span>`, label: 'Priorità Bassa', onClick: () => JournalManager.setPriority(journalId, entryId, 'low') },
            { type: 'divider' },
            { icon: `<span style="display:flex; align-items:center;">${Icons.close}</span>`, label: 'Nessuna Priorità (Normale)', onClick: () => JournalManager.setPriority(journalId, entryId, null) }
        ];
        
        UI.Menu.buildContextMenu(btnId, items);
    },

    setPriority: (journalId, entryId, level) => {
        let state = JournalManager.getState(journalId);
        if (!state) return;
        
        const entry = state.entries.find(e => e.id === entryId);
        if (entry) {
            entry.priority = level;
            JournalManager.setState(journalId, state);
            JournalManager.render(journalId);
        }
    },

    toggleHideCompleted: (journalId) => {
        let state = JournalManager.getState(journalId);
        if (!state) return;
        state.hideCompleted = !state.hideCompleted;
        JournalManager.setState(journalId, state);
        JournalManager.render(journalId);
    },

    toggleSearch: (journalId) => {
        let state = JournalManager.getState(journalId);
        if (!state) return;
        
        state.showSearch = !state.showSearch;
        if (!state.showSearch) state.searchTerm = ''; 

        JournalManager.setState(journalId, state);
        JournalManager.render(journalId);

        if (state.showSearch) {
            setTimeout(() => {
                const input = document.getElementById('j-search-' + journalId);
                if (input) input.focus();
            }, 50);
        }
    },

    setSearchTerm: (journalId, term) => {
        let state = JournalManager.getState(journalId);
        if (!state) return;

        state.searchTerm = term;
        JournalManager.setState(journalId, state);
        
        const inputId = 'j-search-' + journalId;
        const input = document.getElementById(inputId);
        let cursorStart = term.length;
        let cursorEnd = term.length;
        
        if (input) {
            cursorStart = input.selectionStart;
            cursorEnd = input.selectionEnd;
        }
        
        JournalManager._focusAfterRender = { id: inputId, start: cursorStart, end: cursorEnd };
        JournalManager.render(journalId);
    },

    setDisplayLimit: (journalId, limit) => {
        let state = JournalManager.getState(journalId);
        if (!state) return;

        state.displayLimit = limit;
        JournalManager.setState(journalId, state);
        JournalManager.render(journalId);
    },

    deleteJournal: (journalId) => {
        if (!confirm("Sei sicuro di voler eliminare l'intero diario e tutte le sue voci?")) return;
        
        const wrapper = document.getElementById(journalId);
        if (wrapper) wrapper.remove();
        
        const trueId = journalId.split('_cited_')[0];
        if (AppState.databases && AppState.databases[trueId]) {
            delete AppState.databases[trueId];
        }

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();
        Store.triggerAutoSave();
    },

    exportJournalCSV: (journalId) => {
        try {
            const state = JournalManager.getState(journalId);
            if (!state || !state.entries || state.entries.length === 0) {
                alert("Il diario è vuoto.");
                return;
            }

            let csvContent = "Data Inizio;Ora Inizio;Completato Il;Priorita;Contenuto\n";
            const sorted = [...state.entries].sort((a,b) => a.timestamp - b.timestamp);

            sorted.forEach((entry) => {
                let tempDiv = document.createElement('div');
                tempDiv.innerHTML = entry.content.replace(/<br\s*[\/]?>/gi, '\n');
                let cleanText = (tempDiv.innerText || tempDiv.textContent).trim();

                if (cleanText.includes(';') || cleanText.includes('"') || cleanText.includes('\n')) {
                    cleanText = `"${cleanText.replace(/"/g, '""')}"`;
                }

                let completionStr = "";
                if (entry.endTime) {
                    const d = new Date(entry.endTime);
                    completionStr = `${JournalManager.formatDate(d)} ${JournalManager.formatTime(d)}`;
                }

                const prioStr = entry.priority === 'high' ? 'Alta' : (entry.priority === 'low' ? 'Bassa' : 'Normale');

                csvContent += `${entry.dateStr};${entry.timeStr};${completionStr};${prioStr};${cleanText}\n`;
            });

            const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            
            const link = document.createElement("a");
            link.style.display = "none";
            link.setAttribute("href", url);
            link.setAttribute("download", `Diario_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            
            setTimeout(() => {
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            }, 300);

        } catch (err) {
            console.error(err);
            alert("Si è verificato un errore critico durante l'esportazione: " + err.message);
        }
    },

    insert: (fromToolbar = false) => {
        if (!AppState.isEditMode) return;

        if (fromToolbar) {
            Editor.restoreSelection();
            UI.Menu.closeAll(true);
        }

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        let node = selection.getRangeAt(0).commonAncestorContainer;
        if (node.nodeType === 3) node = node.parentNode;

        if (node && node.closest('.widget-type-columns, .simple-table-wrapper')) {
            alert("Non è permesso inserire Widget Complessi all'interno delle Colonne o delle Tabelle Semplici per prevenire la corruzione del layout.\nSposta il cursore fuori prima di inserire.");
            return;
        }

        Editor.saveSnapshot();

        const existingWrapper = node.closest('.adv-journal-wrapper, [data-widget-type="journal"]');
        if (existingWrapper) {
            JournalManager.addEntry(existingWrapper.id);
            return;
        }

        const journalId = 'adv_journal_' + Store.generateId();
        const now = new Date();
        const entryId = 'je_' + Store.generateId();
        
        const state = {
            title: 'Diario / Log',
            entries:[{
                id: entryId,
                timestamp: now.getTime(),
                dateStr: JournalManager.formatDate(now),
                timeStr: JournalManager.formatTime(now),
                content: '',
                endTime: null,
                priority: null
            }],
            collapsedDates:[],
            displayLimit: 'all',
            showSearch: false,
            searchTerm: '',
            hideCompleted: false
        };

        if (!AppState.databases) AppState.databases = {};
        AppState.databases[journalId] = state;

        let wrapper;
        if (typeof WidgetManager !== 'undefined') {
            wrapper = WidgetManager.createShell('journal', journalId);
        } else {
            wrapper = document.createElement('div');
            wrapper.className = 'adv-journal-wrapper';
            wrapper.id = journalId;
            wrapper.contentEditable = "false";
        }

        let targetBlock = node ? node.closest('p, div, li, h1, h2, h3, h4, h5, h6') : null;
        const isEmptyBlock = targetBlock && targetBlock.id !== 'noteContent' && targetBlock.textContent.replace(/[\u200B\n\r]/g, '').trim() === '';

        if (isEmptyBlock) {
            targetBlock.parentNode.replaceChild(wrapper, targetBlock);
        } else {
            if (selection.rangeCount) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(wrapper);
            } else {
                document.getElementById('noteContent').appendChild(wrapper);
            }
        }

        const p = document.createElement('p'); 
        p.innerHTML = '<br>';
        wrapper.parentNode.insertBefore(p, wrapper.nextSibling);

        JournalManager._focusAfterRender = entryId;
        JournalManager.render(journalId);
        Store.triggerAutoSave();
    },

    addEntry: (journalId) => {
        let state = JournalManager.getState(journalId);
        if (!state) return;

        if (state.searchTerm) state.searchTerm = '';

        const now = new Date();
        const entryId = 'je_' + Store.generateId();
        
        state.entries.push({
            id: entryId,
            timestamp: now.getTime(),
            dateStr: JournalManager.formatDate(now),
            timeStr: JournalManager.formatTime(now),
            content: '',
            endTime: null,
            priority: null
        });

        JournalManager.setState(journalId, state);
        JournalManager._focusAfterRender = entryId;
        JournalManager.render(journalId);
    },

    deleteEntry: (journalId, entryId) => {
        let state = JournalManager.getState(journalId);
        if (!state) return;

        const idx = state.entries.findIndex(e => e.id === entryId);
        if (idx === -1) return;

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();

        state.entries.splice(idx, 1);

        if (state.entries.length === 0) {
            // Se tutte le voci vengono cancellate manualmente, mostra lo stato vuoto senza eliminare il widget
            JournalManager._focusAfterRender = null;
            JournalManager.setState(journalId, state);
            JournalManager.render(journalId);
        } else {
            const prevEntry = state.entries[idx - 1] || state.entries[0];
            JournalManager._focusAfterRender = prevEntry.id;
            JournalManager.setState(journalId, state);
            JournalManager.render(journalId);
        }
    },

    updateEntryContent: (journalId, entryId, htmlContent) => {
        let state = JournalManager.getState(journalId);
        if (!state) return;

        const entry = state.entries.find(e => e.id === entryId);
        if (entry && entry.content !== htmlContent) {
            entry.content = htmlContent;
            JournalManager.setState(journalId, state);
        }
    },

    toggleCompletion: (journalId, entryId, htmlNodeEl) => {
        if (!AppState.isEditMode) return;
        let state = JournalManager.getState(journalId);
        if (!state) return;

        const entry = state.entries.find(e => e.id === entryId);
        if (!entry) return;

        const isCurrentlyCompleted = !!entry.endTime;

        if (isCurrentlyCompleted) {
            entry.endTime = null;
            entry.isVanishing = false;
            
            if (JournalManager._pendingDeletions[entryId]) {
                clearTimeout(JournalManager._pendingDeletions[entryId]);
                delete JournalManager._pendingDeletions[entryId];
                
                if (htmlNodeEl) {
                    htmlNodeEl.classList.remove('vanishing');
                    const label = htmlNodeEl.querySelector('.journal-time-label');
                    if (label) {
                        label.classList.remove('completed');
                        label.removeAttribute('data-tooltip'); 
                    }
                    const content = htmlNodeEl.querySelector('.journal-content');
                    if (content) {
                        content.style.opacity = '1';
                        content.style.textDecoration = 'none';
                    }
                }
            }
            
            JournalManager.setState(journalId, state);
            JournalManager.render(journalId);
            return;
        }

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();
        entry.endTime = Date.now();
        JournalManager.setState(journalId, state);

        if (state.hideCompleted && htmlNodeEl) {
            entry.isVanishing = true;
            JournalManager.setState(journalId, state);
            
            htmlNodeEl.classList.add('vanishing');
            const label = htmlNodeEl.querySelector('.journal-time-label');
            if (label) label.classList.add('completed');
            const content = htmlNodeEl.querySelector('.journal-content');
            if (content) {
                content.style.opacity = '0.5';
                content.style.textDecoration = 'line-through';
            }

            JournalManager._pendingDeletions[entryId] = setTimeout(() => {
                const currentState = JournalManager.getState(journalId);
                if (!currentState) return;
                const currentEntry = currentState.entries.find(e => e.id === entryId);
                
                if (currentEntry && currentEntry.isVanishing) {
                    currentEntry.isVanishing = false; 
                    JournalManager.setState(journalId, currentState);
                    JournalManager.render(journalId); 
                }
                delete JournalManager._pendingDeletions[entryId];
            }, 2500); 

        } else {
            JournalManager.render(journalId);
        }
    },

    toggleDate: (journalId, dateStr) => {
        let state = JournalManager.getState(journalId);
        if (!state.collapsedDates) state.collapsedDates =[];

        const idx = state.collapsedDates.indexOf(dateStr);
        if (idx > -1) state.collapsedDates.splice(idx, 1);
        else state.collapsedDates.push(dateStr);

        JournalManager.setState(journalId, state);
        JournalManager.render(journalId);
    },

    updateTitle: (journalId, newTitle) => {
        let state = JournalManager.getState(journalId);
        if (!state) return;
        state.title = newTitle.trim() || 'Diario / Log';
        JournalManager.setState(journalId, state);
    },

    render: (journalId) => {
        const wrapper = document.getElementById(journalId);
        if (!wrapper) return;

        const state = JournalManager.getState(journalId);
        if (!state || !state.entries) return;

        let bodyContainer = wrapper.querySelector('.widget-body');
        
        const isCited = journalId.includes('_cited_');
        const isEdit = AppState.isEditMode && !isCited;

        if (!bodyContainer) {
            wrapper.innerHTML = `
                <div class="widget-header adv-table-header">
                    <span class="widget-drag-handle adv-drag-handle" style="${isEdit ? 'display:flex;' : 'display:none;'}">${Icons.dragHandle}</span>
                    <span class="widget-options-btn adv-drag-handle" style="${isEdit ? 'display:flex;' : 'display:none;'}">${Icons.dotsVertical}</span>
                    <span class="widget-icon" style="display:inline-flex;">${Icons.journal}</span>
                    <span class="widget-title adv-table-title" contenteditable="${isEdit ? 'true' : 'false'}">${state.title || 'Diario / Log'}</span>
                    <div class="widget-tools adv-tools"></div>
                </div>
                <div class="widget-body"></div>
            `;
            bodyContainer = wrapper.querySelector('.widget-body');
        }

        let activeEntries = [...state.entries];
        
        if (state.hideCompleted) {
            activeEntries = activeEntries.filter(e => !e.endTime || e.isVanishing);
        }

        if (state.showSearch && state.searchTerm) {
            const term = state.searchTerm.toLowerCase();
            activeEntries = activeEntries.filter(e => {
                const textContent = e.content.replace(/<[^>]*>?/gm, '').toLowerCase(); 
                return textContent.includes(term) || e.timeStr.includes(term);
            });
        }

        activeEntries.sort((a, b) => a.timestamp - b.timestamp);
        
        const grouped = {};
        activeEntries.forEach(entry => {
            if (!grouped[entry.dateStr]) grouped[entry.dateStr] = [];
            grouped[entry.dateStr].push(entry);
        });

        let dateKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b)); 
        
        if (state.displayLimit && state.displayLimit !== 'all') {
            const limit = parseInt(state.displayLimit);
            if (!isNaN(limit) && dateKeys.length > limit) {
                dateKeys = dateKeys.slice(dateKeys.length - limit);
            }
        }

        if (typeof WidgetManager !== 'undefined') {
            WidgetManager.updateShellUI(journalId, {
                icon: Icons.journal,
                title: state.title || 'Diario / Log',
                optionsId: `j-opt-btn-${journalId}`,
                onTitleChange: JournalManager.updateTitle,
                onOptionsClick: JournalManager.openMenu,
                onDragStart: JournalManager.onDragStart,
                onDragEnd: JournalManager.onDragEnd
            });
        }

        let html = '';

        if (state.showSearch) {
            const safeTerm = (state.searchTerm || '').replace(/"/g, '&quot;');
            html += `
                <div class="journal-search-wrapper" onmousedown="event.stopPropagation()">
                    <span class="journal-search-icon">${Icons.search}</span>
                    <input type="text" id="j-search-${journalId}" class="journal-search-input" placeholder="Cerca nel diario..." value="${safeTerm}" 
                           oninput="event.stopPropagation(); JournalManager.setSearchTerm('${journalId}', this.value)"
                           onkeydown="event.stopPropagation()"
                           onkeyup="event.stopPropagation()"
                           onmousedown="event.stopPropagation()">
                </div>
            `;
        }

        html += `<ul class="adv-journal-list" id="j-list-${journalId}">`;

        if (dateKeys.length === 0) {
            if (state.showSearch && state.searchTerm) {
                html += `<li style="padding: 10px; color: var(--text-secondary); font-style: italic; font-size:0.9rem;">Nessun risultato.</li>`;
            } else if (state.hideCompleted) {
                html += `<li style="padding: 10px; color: var(--text-secondary); font-style: italic; font-size:0.9rem;">Tutte le attività sono completate!</li>`;
            } else {
                html += `<li style="padding: 10px; color: var(--text-secondary); font-style: italic; font-size:0.9rem;">(Nessun record)</li>`;
            }
        } else {
            dateKeys.forEach(dateStr => {
                const entries = grouped[dateStr];
                const isCollapsed = state.collapsedDates && state.collapsedDates.includes(dateStr);
                
                html += `<li class="journal-date-node ${isCollapsed ? 'collapsed' : ''}" data-date="${dateStr}">`;
                html += `<div class="journal-date-header" onclick="JournalManager.toggleDate('${journalId}', '${dateStr}')">`;
                html += `   <span class="journal-toggle">${Icons.chevronDown}</span>
                            <span class="journal-date-label">${dateStr}</span>
                         </div>`;
                html += `<ul class="journal-time-list">`;

                let lastVisibleTs = 0;

                entries.forEach((entry, index) => {
                    let isCompleted = !!entry.endTime;
                    let hiddenTimeClass = '';
                    
                    if (!state.searchTerm && index > 0 && (entry.timestamp - lastVisibleTs) < 180000 && !isCompleted) {
                        hiddenTimeClass = 'hidden-time';
                    } else {
                        lastVisibleTs = entry.timestamp;
                    }

                    let completedClass = isCompleted ? 'completed' : '';
                    const strikeStyle = isCompleted ? 'opacity:0.5; text-decoration: line-through;' : '';
                    const vanishingClass = entry.isVanishing ? 'vanishing' : '';

                    let tooltipAttr = '';
                    if (isCompleted) {
                        const endD = new Date(entry.endTime);
                        const endStr = `${JournalManager.formatDate(endD)} ${JournalManager.formatTime(endD)}`;
                        tooltipAttr = `data-tooltip="<b>Inizio:</b> ${entry.dateStr} ${entry.timeStr}<br><b>Fine:</b> ${endStr}" style="cursor:help;"`;
                    }

                    // GENERAZIONE HTML BOTTONE PRIORITA'
                    let prioIcon = Icons.flagEmpty;
                    let prioClass = '';
                    if (entry.priority === 'high') { prioIcon = Icons.priorityHigh; prioClass = 'has-priority prio-high'; }
                    else if (entry.priority === 'low') { prioIcon = Icons.priorityLow; prioClass = 'has-priority prio-low'; }

                    const priorityHtml = isEdit 
                        ? `<div class="journal-priority-btn ${prioClass}" onclick="JournalManager.openPriorityMenu(event, '${journalId}', '${entry.id}')" title="Imposta Priorità">${prioIcon}</div>` 
                        : (entry.priority ? `<div class="journal-priority-btn ${prioClass}" style="cursor:default;">${prioIcon}</div>` : '');

                    html += `
                        <li class="journal-time-node ${vanishingClass}">
                            ${priorityHtml}
                            <span class="journal-time-label ${hiddenTimeClass} ${completedClass}" ${tooltipAttr} ${isEdit ? `onclick="JournalManager.toggleCompletion('${journalId}', '${entry.id}', this.closest('.journal-time-node'))"` : ''}>${entry.timeStr}</span>
                            <div id="${entry.id}" class="journal-content" ${isEdit ? 'contenteditable="true"' : 'contenteditable="false"'} style="${strikeStyle}" placeholder="Scrivi log...">${entry.content}</div>
                        </li>
                    `;
                });

                html += `</ul></li>`;
            });
        }
        
        html += `</ul>`;
        
        bodyContainer.innerHTML = html;

        if (isEdit) {
            const containerToBind = bodyContainer;
            containerToBind.querySelectorAll('.journal-content').forEach(contentDiv => {
                const entryId = contentDiv.id;
                const updateContent = (e) => {
                    if (!AppState.isEditMode) return;
                    JournalManager.updateEntryContent(journalId, entryId, e.target.innerHTML);
                };
                contentDiv.addEventListener('input', updateContent);
                contentDiv.addEventListener('blur', updateContent);

                contentDiv.addEventListener('keydown', (e) => {
                    if (!AppState.isEditMode) { e.preventDefault(); return; }
                    e.stopPropagation(); 
                    if (e.key === 'Enter') {
                        if (!e.shiftKey) {
                            e.preventDefault();
                            JournalManager.updateEntryContent(journalId, entryId, e.target.innerHTML);
                            JournalManager.addEntry(journalId);
                        }
                    }
                    else if (e.key === 'Backspace') {
                        if (contentDiv.innerText.replace(/\u200B/g, '').trim() === '') {
                            e.preventDefault();
                            JournalManager.deleteEntry(journalId, entryId);
                        }
                    }
                });
            });
            
            containerToBind.querySelectorAll('span[contenteditable]').forEach(el => {
                el.addEventListener('keydown', (e) => {
                    if(e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
                });
            });
        }

        if (JournalManager._focusAfterRender) {
            const targetInfo = JournalManager._focusAfterRender;
            const targetId = typeof targetInfo === 'string' ? targetInfo : targetInfo.id;
            
            // Micro-differimento asincrono per permettere al browser di terminare il ciclo di render e posizionare saldamente il cursore
            setTimeout(() => {
                const targetDiv = document.getElementById(targetId);
                if (targetDiv) {
                    targetDiv.focus();
                    
                    if (targetDiv.tagName === 'INPUT') {
                        if (typeof targetInfo === 'object') {
                            targetDiv.setSelectionRange(targetInfo.start, targetInfo.end);
                        } else {
                            const valLen = targetDiv.value.length;
                            targetDiv.setSelectionRange(valLen, valLen);
                        }
                    } else {
                        const sel = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(targetDiv);
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }

                    if (typeof targetInfo === 'string') {
                        targetDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }
            }, 0);

            JournalManager._focusAfterRender = null;
        }
    }
};

document.addEventListener('DOMContentLoaded', JournalManager.init);