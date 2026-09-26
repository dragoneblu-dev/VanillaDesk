/**
 * WidgetManager.js
 * Registro Centrale per l'architettura a Componenti.
 * FIX UX: La funzione insertLineBreakAfter (Usata anche dalle citazioni) sposta lo scroll
 * in modo che l'utente veda immediatamente il nuovo paragrafo inserito.
 * FIX BLOAT DRAG&DROP: L'spostamento dei widget applica ora Editor.minifyHTMLForStorage 
 * prima di iniettare il payload HTML, prevenendo crescite esponenziali del file JSON in RAM.
 */

const LegacyMigrator = {
    run: (container = document) => {
        const editor = container.id === 'noteContent' ? container : (container.querySelector ? container.querySelector('#noteContent') || container : document);
        if (!editor || !editor.querySelectorAll) return;

        // Migrazione Vecchi Database e Code Blocks
        const oldWidgets = editor.querySelectorAll('.adv-table-wrapper:not(.adv-widget-shell), .adv-journal-wrapper:not(.adv-widget-shell), .code-wrapper:not(.adv-widget-shell)');
        
        oldWidgets.forEach(wrapper => {
            if (wrapper.querySelector('.widget-body')) return;

            let type = 'database';
            let title = '';
            let icon = '';
            
            if (wrapper.classList.contains('adv-journal-wrapper')) {
                type = 'journal';
                title = 'Diario / Log';
                icon = Icons.journal;
            } else if (wrapper.classList.contains('code-wrapper')) {
                type = 'code';
                title = 'Codice';
                icon = Icons.code;
            }

            if (type === 'database') {
                let state = null;
                if (AppState.databases && AppState.databases[wrapper.id]) {
                    state = AppState.databases[wrapper.id];
                } else if (wrapper.hasAttribute('data-state')) {
                    try {
                        state = JSON.parse(wrapper.getAttribute('data-state').replace(/&quot;/g, '"'));
                    } catch(e) {}
                }

                if (state) {
                    if (state.isPivot) {
                        type = 'pivot';
                        icon = Icons.tablePivot;
                        title = (state.title || '').replace('📈 ', '').replace('📊 ', '') || 'Analisi Dati';
                    } else if (state.isLinkedView) {
                        type = 'database';
                        icon = Icons.link;
                        title = state.title || 'Vista Collegata';
                    } else {
                        icon = '';
                        title = state.title || 'Nuovo Database';
                    }
                } else {
                    title = 'Caricamento...';
                }
            }

            wrapper.setAttribute('data-widget-type', type);
            wrapper.classList.add('adv-widget-shell');

            let innerContent = wrapper.innerHTML;
            
            if (type === 'code') {
                const pre = wrapper.querySelector('pre');
                if (pre) {
                    innerContent = pre.outerHTML;
                    if (!AppState.databases) AppState.databases = {};
                    let state = AppState.databases[wrapper.id];
                    if (!state) state = { title: 'Codice', language: pre.getAttribute('data-language') || 'none' };
                    
                    let raw = pre.innerText;
                    if (raw.endsWith('\n')) raw = raw.slice(0, -1);
                    state.content = raw;
                    
                    AppState.databases[wrapper.id] = state;
                } else {
                    innerContent = '';
                }
            }

            wrapper.innerHTML = `
                <div class="widget-header adv-table-header" style="display:flex;">
                    <span class="widget-drag-handle adv-drag-handle" title="Trascina per spostare" draggable="true" style="display:flex;">${Icons.dragHandle}</span>
                    <span class="widget-options-btn adv-drag-handle" title="Opzioni" style="display:flex;">${Icons.dotsVertical}</span>
                    <span class="widget-icon" style="display:inline-flex;">${icon}</span>
                    <span class="widget-title adv-table-title" contenteditable="false" style="flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 50px;">${title}</span>
                    <div class="widget-tools adv-tools" style="flex-shrink: 0;"></div>
                </div>
                <div class="widget-body">${innerContent}</div>
            `;
        });

        // Migrazione Vecchie Citazioni
        const oldCitations = editor.querySelectorAll('.block-citation:not(.adv-widget-shell)');
        oldCitations.forEach(oldCit => {
            oldCit.classList.add('adv-widget-shell');
            oldCit.setAttribute('data-widget-type', 'citation');
            
            const header = oldCit.querySelector('.citation-header');
            if (header) header.remove(); 
            const body = oldCit.querySelector('.citation-body');
            const innerContent = body ? body.innerHTML : oldCit.innerHTML;

            oldCit.innerHTML = `
                <div class="widget-header adv-table-header compact-header" style="display:flex;">
                    <span class="widget-drag-handle adv-drag-handle" title="Trascina per spostare" draggable="true" style="display:flex;">${Icons.dragHandle}</span>
                    <span class="widget-options-btn adv-drag-handle" title="Opzioni" style="display:flex;">${Icons.dotsVertical}</span>
                    <span class="widget-icon" style="display:inline-flex;">${Icons.link}</span>
                    <span class="widget-title adv-table-title" contenteditable="false" style="flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 50px;">Riferimento Testuale</span>
                    <div class="widget-tools adv-tools" style="flex-shrink: 0;"></div>
                </div>
                <div class="widget-body citation-body adv-scroll-container editor-content">${innerContent}</div>
            `;
        });
    }
};

const WidgetManager = {
    registry: {},

    blockSelector: '.adv-widget-shell, .adv-table-wrapper, .adv-journal-wrapper, .code-wrapper, .block-citation, .adv-action-button-wrapper, .widget-type-audio, .widget-type-video',
    inlineSelector: '.adv-inline-shell, .inline-note-wrapper, .inline-note-marker',
    editableAreasSelector: '.widget-editable-area, .adv-cell-text, .adv-table-title, .adv-url-edit, .journal-content, .checklist-text, pre, .inline-note-data, .simple-table-wrapper td, .simple-table-wrapper th',

    register: (type, moduleImpl) => {
        WidgetManager.registry[type] = moduleImpl;
    },

    isProtectedBlock: (node) => node && node.closest && !!node.closest(WidgetManager.blockSelector),
    isProtectedInline: (node) => node && node.closest && !!node.closest(WidgetManager.inlineSelector),
    isInsideEditableWidgetArea: (node) => node && node.closest && !!node.closest(WidgetManager.editableAreasSelector),
    isTotallyProtected: (node) => (WidgetManager.isProtectedBlock(node) || WidgetManager.isProtectedInline(node)) && !WidgetManager.isInsideEditableWidgetArea(node),

    mountAll: (container = document) => {
        LegacyMigrator.run(container);
        
        if (typeof AudioManager !== 'undefined') WidgetManager.registry['audio'] = AudioManager;

        const root = container.id === 'noteContent' ? container : (container.querySelector ? container.querySelector('#noteContent') || container : document);
        
        root.querySelectorAll('.widget-type-video').forEach(wrapper => {
            wrapper.setAttribute('contenteditable', 'false');
            let currentId = wrapper.id;

            if (!currentId) {
                currentId = 'adv_vid_' + Store.generateId();
                wrapper.id = currentId;
            }

            const iframe = wrapper.querySelector('iframe');
            if (iframe) {
                let src = iframe.getAttribute('src');
                const dataSrc = iframe.getAttribute('data-src');
                if (!src && dataSrc) {
                    iframe.setAttribute('src', dataSrc);
                    iframe.removeAttribute('data-src');
                    src = dataSrc;
                }

                const videoIdMatch = src ? src.match(/embed\/([^?&]+)/) : null;
                const videoId = videoIdMatch ? videoIdMatch[1] : '';

                WidgetManager.updateShellUI(currentId, {
                    icon: Icons.youtube,
                    title: 'Video YouTube',
                    optionsId: `adv-opt-btn-${currentId}`,
                    onOptionsClick: (e) => {
                        e.stopPropagation();
                        UI.Menu.closeAll(true);
                        UI.Menu.buildContextMenu(`adv-opt-btn-${currentId}`, [
                            { icon: Icons.globe, label: 'Apri nel Browser', onClick: () => window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank') },
                            { type: 'divider' },
                            { icon: Icons.trash, label: 'Rimuovi Video', danger: true, onClick: () => Editor.safeDeleteWidget(document.getElementById(currentId)) }
                        ]);
                    },
                    onDragStart: (e) => {
                        AppState.draggedBlockId = currentId;
                        AppState.draggedBlockType = 'video';
                        e.dataTransfer.effectAllowed = 'move';
                    },
                    onDragEnd: () => { AppState.draggedBlockId = null; AppState.draggedBlockType = null; }
                });
            }
        });

        for (const type in WidgetManager.registry) {
            const mod = WidgetManager.registry[type];
            if (mod && typeof mod.mountAll === 'function') mod.mountAll(container);
        }
    },

    createShell: (type, id, contentHTML = '') => {
        let shellTag = type === 'citation' ? 'blockquote' : 'div';
        const shell = document.createElement(shellTag);
        
        let extraClass = '';
        if (type === 'database' || type === 'pivot') extraClass = 'adv-table-wrapper';
        if (type === 'buttonbar') extraClass = 'adv-action-button-wrapper';
        if (type === 'citation') extraClass = 'block-citation';

        shell.className = `adv-widget-shell ${extraClass} widget-type-${type}`;
        shell.setAttribute('data-widget-type', type);
        shell.id = id;
        shell.contentEditable = "false";
        
        shell.innerHTML = `
            <div class="widget-header adv-table-header" style="display:flex;">
                <span class="widget-drag-handle adv-drag-handle" title="Trascina per spostare" draggable="true" style="display:none;">${Icons.dragHandle}</span>
                <span class="widget-options-btn adv-drag-handle" title="Opzioni" style="display:none;">${Icons.dotsVertical}</span>
                <span class="widget-icon" style="display:inline-flex;"></span>
                <span class="widget-title adv-table-title" contenteditable="false" style="flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 50px;">Caricamento...</span>
                <div class="widget-tools adv-tools" style="flex-shrink: 0;"></div>
            </div>
            <div class="widget-body">${contentHTML}</div>
        `;
        return shell;
    },

    insertLineBreakAfter: (widgetId) => {
        const wrapper = document.getElementById(widgetId);
        if (!wrapper) return;
        
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        wrapper.parentNode.insertBefore(p, wrapper.nextSibling);
        
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
        
        const sel = window.getSelection();
        const range = document.createRange();
        range.setStart(p, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        
        // FIX: Assicura che l'utente veda il cursore posizionato dopo la citazione o il codice
        p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    },

    moveWidgetToNote: (widgetId, targetNoteId) => {
        if (typeof AppState === 'undefined' || typeof Store === 'undefined') return;
        
        if (AppState.currentNoteId === targetNoteId) {
            alert("Questo elemento è già nella nota selezionata.");
            return;
        }

        const wrapper = document.getElementById(widgetId);
        if (!wrapper) return;

        const targetNote = Store.getNote(targetNoteId);
        if (!targetNote) return;

        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
        if (typeof AdvancedTable !== 'undefined') AdvancedTable.closeDropdowns(true);

        // FIX BLOAT JSON: Applica la minificazione forzata per estrarre l'html 
        // nudo del guscio vuoto invece di trascinarsi dietro megabyte di UI renderizzata!
        const htmlCopy = typeof Editor !== 'undefined' ? Editor.minifyHTMLForStorage(wrapper.outerHTML) : wrapper.outerHTML;

        targetNote.content = (targetNote.content || '') + '<p><br></p>' + htmlCopy + '<p><br></p>';
        targetNote.updatedAt = new Date().toISOString();

        wrapper.remove();

        if (typeof Editor !== 'undefined') {
            Editor.saveSnapshot();
            Editor.sanitizeContent();
        }

        Store.triggerAutoSave();

        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(`Spostamento in "${targetNote.title}" completato con successo.`, 'success');
        }
    },

    updateShellUI: (id, config) => {
        const shell = document.getElementById(id);
        if (!shell) return;
        const header = shell.querySelector('.widget-header');
        if (!header) return; 

        const isCited = id.includes('_cited_');
        const isEdit = AppState.isEditMode && !isCited;

        if (config.hideHeader) {
            header.style.display = 'none';
            shell.style.margin = isEdit ? '15px 0' : '5px 0';
            return;
        } else {
            header.style.display = 'flex';
            shell.style.margin = '15px 0';
        }

        if (config.compact) {
            header.classList.add('compact-header');
        } else {
            header.classList.remove('compact-header');
        }

        const dragHandle = shell.querySelector('.widget-drag-handle');
        if (dragHandle) {
            dragHandle.style.display = isEdit ? 'flex' : 'none';
            dragHandle.setAttribute('draggable', 'true');
            dragHandle.setAttribute('title', 'Trascina per spostare');
            dragHandle.ondragstart = (e) => { if (config.onDragStart) config.onDragStart(e, id); };
            dragHandle.ondragend = (e) => { if (config.onDragEnd) config.onDragEnd(e); };
        }

        const optionsBtn = shell.querySelector('.widget-options-btn');
        if (optionsBtn) {
            optionsBtn.style.display = isEdit ? 'flex' : 'none';
            optionsBtn.setAttribute('title', 'Opzioni');
            optionsBtn.onclick = (e) => { if (config.onOptionsClick) config.onOptionsClick(e, id); };
            if (config.optionsId) optionsBtn.id = config.optionsId;
        }

        const iconEl = shell.querySelector('.widget-icon');
        if (iconEl) iconEl.innerHTML = config.icon || '';

        const titleEl = shell.querySelector('.widget-title');
        if (titleEl) {
            if (config.title) {
                titleEl.textContent = config.title;
                
                if (!config.compact) {
                    if (config.title.length > 40) {
                        titleEl.style.fontSize = '0.85rem';
                        titleEl.style.lineHeight = '1.2';
                    } else if (config.title.length > 25) {
                        titleEl.style.fontSize = '1rem';
                        titleEl.style.lineHeight = '1.3';
                    } else {
                        titleEl.style.fontSize = ''; 
                        titleEl.style.lineHeight = '';
                    }
                }
            }

            const isTitleEditable = isEdit && !config.compact;
            titleEl.setAttribute('contenteditable', isTitleEditable ? 'true' : 'false');
            
            titleEl.style.flex = '0 1 auto';
            titleEl.style.whiteSpace = 'nowrap';
            titleEl.style.overflow = 'hidden';
            titleEl.style.textOverflow = 'ellipsis';
            titleEl.style.minWidth = '50px';

            titleEl.onblur = (e) => { if (config.onTitleChange) config.onTitleChange(id, e.target.textContent); };
            titleEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } };
        }

        const toolsEl = shell.querySelector('.widget-tools');
        if (toolsEl) {
            toolsEl.innerHTML = '';
            toolsEl.style.flexShrink = '0';
            
            if (config.tools && config.tools.length > 0) {
                config.tools.forEach(tool => {
                    if (tool.editOnly && !isEdit) return;
                    const btn = document.createElement('button');
                    btn.className = `adv-tool-btn ${tool.active ? 'active' : ''}`;
                    if (tool.id) btn.id = tool.id;
                    btn.title = tool.title || tool.label || '';
                    
                    if (tool.label && !tool.iconOnly) {
                        btn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;">${tool.icon} ${tool.label}</span>`.trim();
                    } else {
                        btn.innerHTML = `<span style="display:inline-flex; align-items:center;">${tool.icon}</span>`;
                    }
                    
                    btn.onclick = (e) => { if (tool.onClick) tool.onClick(e, id); };
                    toolsEl.appendChild(btn);
                });
            }
        }
    }
};