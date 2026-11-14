/**
 * WidgetManager.js
 * Registro Centrale per l'architettura a Componenti.
 * La funzione insertLineBreakAfter sposta lo scroll
 * in modo che l'utente veda immediatamente il nuovo paragrafo inserito.
 * Lo spostamento dei widget applica Editor.minifyHTMLForStorage 
 * prima di iniettare il payload HTML, prevenendo crescite esponenziali del file JSON in RAM.
 * Intercettazione mirata di Ctrl+A / Cmd+A sui titoli editabili dei widget
 * per selezionare esclusivamente il testo del titolo senza estendere la selezione al documento principale.
 * Sostituzione integrale di stringhe hardcoded con chiavi del dizionario i18n.
 * YOUTUBE FILE PROTOCOL FALLBACK: Gestione dedicata su file:// con proporzioni 16:9, titolo nell'header widget,
 * avviso su hover in basso, selezione altezza (400px/250px) e modifica link video.
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
                title = I18n.t('journal.default_title');
                icon = Icons.journal;
            } else if (wrapper.classList.contains('code-wrapper')) {
                type = 'code';
                title = I18n.t('code_widget.default_title');
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
                        title = state.title || I18n.t('adv_menus.other_linked_views');
                    } else {
                        icon = '';
                        title = state.title || I18n.t('widget_manager.default_db');
                    }
                } else {
                    title = I18n.t('widget_manager.loading');
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
                    if (!state) state = { title: I18n.t('code_widget.default_title'), language: pre.getAttribute('data-language') || 'none' };
                    
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
                    <span class="widget-drag-handle adv-drag-handle" title="${I18n.t('widget_manager.drag_to_move')}" draggable="true" style="display:flex;">${Icons.dragHandle}</span>
                    <span class="widget-options-btn adv-drag-handle" title="${I18n.t('widget_manager.options')}" style="display:flex;">${Icons.dotsVertical}</span>
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
                    <span class="widget-drag-handle adv-drag-handle" title="${I18n.t('widget_manager.drag_to_move')}" draggable="true" style="display:flex;">${Icons.dragHandle}</span>
                    <span class="widget-options-btn adv-drag-handle" title="${I18n.t('widget_manager.options')}" style="display:flex;">${Icons.dotsVertical}</span>
                    <span class="widget-icon" style="display:inline-flex;">${Icons.link}</span>
                    <span class="widget-title adv-table-title" contenteditable="false" style="flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 50px;">${I18n.t('widget_manager.text_reference')}</span>
                    <div class="widget-tools adv-tools" style="flex-shrink: 0;"></div>
                </div>
                <div class="widget-body citation-body adv-scroll-container editor-content">${innerContent}</div>
            `;
        });
    }
};

const WidgetManager = {
    registry: {},
    _ytMetaCache: {},

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

    _getVideoHeight: (wrapper, iframe = null) => {
        if (!wrapper) return 400;
        const attrH = parseInt(wrapper.getAttribute('data-video-height'), 10);
        if (attrH === 250 || attrH === 400) return attrH;
        const ifr = iframe || wrapper.querySelector('iframe');
        const ifrH = ifr ? parseInt(ifr.getAttribute('height'), 10) : NaN;
        if (ifrH === 250 || ifrH === 400) return ifrH;
        return 400;
    },

    setVideoHeight: (widgetId, heightPx) => {
        const wrapper = document.getElementById(widgetId);
        if (!wrapper) return;

        const targetHeight = (parseInt(heightPx, 10) === 250) ? 250 : 400;
        if (typeof Editor !== 'undefined' && typeof Editor.saveSnapshot === 'function') {
            Editor.saveSnapshot();
        }

        wrapper.setAttribute('data-video-height', String(targetHeight));

        const iframe = wrapper.querySelector('iframe');
        if (iframe) {
            iframe.setAttribute('height', String(targetHeight));
            iframe.style.height = targetHeight + 'px';
        }

        const fallback = wrapper.querySelector('.yt-file-protocol-fallback');
        if (fallback) {
            fallback.style.height = targetHeight + 'px';
        }

        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
        if (typeof Store !== 'undefined') Store.triggerAutoSave();
        if (typeof AppState !== 'undefined' && AppState.showMinimap && typeof UI !== 'undefined' && typeof UI.Minimap !== 'undefined') {
            setTimeout(() => UI.Minimap.sync(), 50);
        }
    },

    _applyVideoTitleToHeader: (wrapper, titleText) => {
        if (!wrapper || !titleText || !document.body.contains(wrapper)) return;
        const titleEl = wrapper.querySelector('.widget-title');
        if (!titleEl) return;

        titleEl.textContent = titleText;
        if (titleText.length > 40) {
            titleEl.style.fontSize = '0.85rem';
            titleEl.style.lineHeight = '1.2';
        } else if (titleText.length > 25) {
            titleEl.style.fontSize = '1rem';
            titleEl.style.lineHeight = '1.3';
        } else {
            titleEl.style.fontSize = '';
            titleEl.style.lineHeight = '';
        }
    },

    _fetchAndApplyVideoTitle: (wrapper, videoId, forceTitleRefresh = false) => {
        if (!wrapper || !videoId) return;

        const titleEl = wrapper.querySelector('.widget-title');
        const currentTitle = titleEl ? titleEl.textContent.trim() : '';
        const defaultTitle1 = I18n.t('widget_manager.youtube_video');
        const defaultTitle2 = I18n.t('link_manager.video_widget_title');
        const loadingTitle = I18n.t('widget_manager.loading');

        const isDefaultOrEmpty = !currentTitle || currentTitle === defaultTitle1 || currentTitle === defaultTitle2 || currentTitle === loadingTitle;

        if (!forceTitleRefresh && !isDefaultOrEmpty) {
            return;
        }

        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

        if (WidgetManager._ytMetaCache[videoId] && WidgetManager._ytMetaCache[videoId].title) {
            WidgetManager._applyVideoTitleToHeader(wrapper, WidgetManager._ytMetaCache[videoId].title);
            return;
        }

        if (typeof fetch === 'function') {
            fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data && data.title) {
                        WidgetManager._ytMetaCache[videoId] = { title: data.title, author_name: data.author_name || '' };
                        WidgetManager._applyVideoTitleToHeader(wrapper, data.title);
                    }
                })
                .catch(() => {});
        }
    },

    renderVideoFallback: (wrapper, videoId) => {
        if (!wrapper) return;
        const body = wrapper.querySelector('.widget-body');
        if (!body) return;
        const iframe = body.querySelector('iframe');
        const videoHeight = WidgetManager._getVideoHeight(wrapper, iframe);
        const isFileProtocol = window.location.protocol === 'file:';

        if (iframe) {
            iframe.setAttribute('height', String(videoHeight));
            iframe.style.height = videoHeight + 'px';
        }

        if (!isFileProtocol) {
            body.querySelectorAll('.yt-file-protocol-fallback').forEach(el => el.remove());
            if (iframe) {
                iframe.style.display = 'block';
                iframe.style.background = '#000';
                const dataSrc = iframe.getAttribute('data-src');
                if (!iframe.getAttribute('src') && dataSrc) {
                    iframe.setAttribute('src', dataSrc);
                    iframe.removeAttribute('data-src');
                }
            }
            return;
        }

        // Su protocollo file:// nasconde l'iframe evitando chiamate che generano l'Errore 153 di YouTube
        if (iframe) {
            const src = iframe.getAttribute('src');
            if (src) {
                iframe.setAttribute('data-src', src);
                iframe.removeAttribute('src');
            }
            iframe.style.display = 'none';
        }

        const existingFallback = body.querySelector('.yt-file-protocol-fallback');
        if (existingFallback) {
            existingFallback.style.height = videoHeight + 'px';
            return;
        }

        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const maxResThumb = videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : '';
        const mqThumb = videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : '';
        const btnLabel = I18n.t('link_manager.yt_watch_on_youtube');
        const hintLabel = I18n.t('link_manager.yt_file_protocol_hint');

        const fallback = document.createElement('div');
        fallback.className = 'yt-file-protocol-fallback';
        fallback.style.cssText = `position:relative; width:100%; height:${videoHeight}px; border-radius:6px; overflow:hidden; border:1px solid var(--border-color); background:#000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; box-sizing:border-box; text-align:center;`;

        fallback.innerHTML = `
            ${maxResThumb ? `<img src="${maxResThumb}" alt="YouTube Thumbnail" style="position:absolute; inset:0; width:100%; height:100%; object-fit:contain; opacity:0.55; pointer-events:none;" onload="if(this.naturalWidth===120 && '${mqThumb}'){this.src='${mqThumb}';}" onerror="this.style.display='none'">` : ''}
            <div style="position:relative; z-index:1; display:flex; flex-direction:column; align-items:center;">
                <button type="button" class="btn btn-primary" style="padding:10px 20px; font-size:0.95rem; font-weight:600; border-radius:24px; box-shadow:0 4px 14px rgba(0,0,0,0.5); cursor:pointer;" onclick="event.stopPropagation(); window.open('${watchUrl}', '_blank')">
                    <span style="display:inline-flex; align-items:center; gap:8px;">${typeof Icons !== 'undefined' ? Icons.play : '▶'} ${btnLabel}</span>
                </button>
            </div>
            <div class="yt-file-protocol-hint">
                ${hintLabel}
            </div>
        `;
        body.appendChild(fallback);
    },

    setupVideoShell: (wrapper, videoId, forceTitleRefresh = false) => {
        if (!wrapper) return;
        const currentId = wrapper.id;
        const titleEl = wrapper.querySelector('.widget-title');
        const existingTitle = titleEl ? titleEl.textContent.trim() : '';
        const defaultTitle = I18n.t('widget_manager.youtube_video');
        const loadingTitle = I18n.t('widget_manager.loading');
        const initialTitle = (!forceTitleRefresh && existingTitle && existingTitle !== loadingTitle) ? existingTitle : defaultTitle;

        WidgetManager.renderVideoFallback(wrapper, videoId);

        WidgetManager.updateShellUI(currentId, {
            icon: Icons.youtube,
            title: initialTitle,
            optionsId: `adv-opt-btn-${currentId}`,
            tools: [
                {
                    icon: Icons.edit,
                    title: I18n.t('link_manager.edit_video_link'),
                    editOnly: true,
                    onClick: (e) => {
                        e.stopPropagation();
                        if (typeof LinkManager !== 'undefined' && typeof LinkManager.editYoutubeWidget === 'function') {
                            LinkManager.editYoutubeWidget(currentId);
                        }
                    }
                }
            ],
            onOptionsClick: (e) => {
                e.stopPropagation();
                UI.Menu.closeAll(true);
                const curHeight = WidgetManager._getVideoHeight(document.getElementById(currentId));
                const chk = ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>';

                UI.Menu.buildContextMenu(`adv-opt-btn-${currentId}`, [
                    {
                        icon: Icons.edit,
                        label: I18n.t('link_manager.edit_video_link'),
                        onClick: () => {
                            if (typeof LinkManager !== 'undefined' && typeof LinkManager.editYoutubeWidget === 'function') {
                                LinkManager.editYoutubeWidget(currentId);
                            }
                        }
                    },
                    {
                        icon: Icons.globe,
                        label: I18n.t('link_manager.open_in_browser'),
                        onClick: () => window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank')
                    },
                    { type: 'divider' },
                    {
                        icon: Icons.widthFit || '↕️',
                        label: I18n.t('link_manager.video_height_menu'),
                        type: 'submenu',
                        items: [
                            {
                                label: I18n.t('link_manager.video_height_normal') + (curHeight === 400 ? chk : ''),
                                onClick: () => WidgetManager.setVideoHeight(currentId, 400)
                            },
                            {
                                label: I18n.t('link_manager.video_height_compact') + (curHeight === 250 ? chk : ''),
                                onClick: () => WidgetManager.setVideoHeight(currentId, 250)
                            }
                        ]
                    },
                    { type: 'divider' },
                    {
                        icon: Icons.trash,
                        label: I18n.t('link_manager.remove_video'),
                        danger: true,
                        onClick: () => Editor.safeDeleteWidget(document.getElementById(currentId))
                    }
                ]);
            },
            onTitleChange: () => {
                if (typeof Store !== 'undefined') Store.triggerAutoSave();
            },
            onDragStart: (e) => {
                AppState.draggedBlockId = currentId;
                AppState.draggedBlockType = 'video';
                e.dataTransfer.effectAllowed = 'move';
            },
            onDragEnd: () => { AppState.draggedBlockId = null; AppState.draggedBlockType = null; }
        });

        WidgetManager._fetchAndApplyVideoTitle(wrapper, videoId, forceTitleRefresh);
    },

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
                const rawSrc = iframe.getAttribute('src') || iframe.getAttribute('data-src') || '';
                const videoIdMatch = rawSrc.match(/embed\/([^?&]+)/);
                const videoId = videoIdMatch ? videoIdMatch[1] : '';

                WidgetManager.setupVideoShell(wrapper, videoId, false);
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
                <span class="widget-drag-handle adv-drag-handle" title="${I18n.t('widget_manager.drag_to_move')}" draggable="true" style="display:none;">${Icons.dragHandle}</span>
                <span class="widget-options-btn adv-drag-handle" title="${I18n.t('widget_manager.options')}" style="display:none;">${Icons.dotsVertical}</span>
                <span class="widget-icon" style="display:inline-flex;"></span>
                <span class="widget-title adv-table-title" contenteditable="false" style="flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 50px;">${I18n.t('widget_manager.loading')}</span>
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
        
        p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    },

    moveWidgetToNote: (widgetId, targetNoteId) => {
        if (typeof AppState === 'undefined' || typeof Store === 'undefined') return;
        
        if (AppState.currentNoteId === targetNoteId) {
            alert(I18n.t('widget_manager.already_in_note'));
            return;
        }

        let wrapper = document.getElementById(widgetId);
        if (!wrapper) {
            wrapper = document.querySelector(`img[data-image-ref="${widgetId}"]`);
        }
        if (!wrapper) return;

        const targetNote = Store.getNote(targetNoteId);
        if (!targetNote) return;

        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
        if (typeof AdvancedTable !== 'undefined') AdvancedTable.closeDropdowns(true);

        // Se è presente un blocco di codice attivo, assicurati che il testo digitato sia sincronizzato in RAM prima dello spostamento
        if (typeof CodeManager !== 'undefined' && typeof CodeManager.forceSyncAll === 'function') {
            CodeManager.forceSyncAll();
        }

        let htmlCopy = '';
        if (wrapper.tagName === 'IMG') {
            htmlCopy = wrapper.outerHTML;
        } else {
            htmlCopy = typeof Editor !== 'undefined' ? Editor.minifyHTMLForStorage(wrapper.outerHTML) : wrapper.outerHTML;
        }

        targetNote.content = (targetNote.content || '') + '<p><br></p>' + htmlCopy + '<p><br></p>';
        targetNote.updatedAt = new Date().toISOString();
        targetNote._isDirty = true;
        delete targetNote._isDraft;

        wrapper.remove();

        if (typeof Editor !== 'undefined') {
            Editor.saveSnapshot();
            Editor.sanitizeContent();
        }

        // Salvataggio immediato e prioritario per impedire che una navigazione rapida sulla nota target ricarichi la vecchia copia dal disco
        Store.triggerAutoSave(true);

        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(I18n.t('widget_manager.move_success', { title: targetNote.title }), 'success');
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
            dragHandle.setAttribute('title', I18n.t('widget_manager.drag_to_move'));
            dragHandle.ondragstart = (e) => { if (config.onDragStart) config.onDragStart(e, id); };
            dragHandle.ondragend = (e) => { if (config.onDragEnd) config.onDragEnd(e); };
        }

        const optionsBtn = shell.querySelector('.widget-options-btn');
        if (optionsBtn) {
            optionsBtn.style.display = isEdit ? 'flex' : 'none';
            optionsBtn.setAttribute('title', I18n.t('widget_manager.options'));
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
            titleEl.onkeydown = (e) => { 
                // Intercettazione mirata di Ctrl+A / Cmd+A sul titolo del widget per isolare la selezione
                if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const sel = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(titleEl);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    return;
                }
                if (e.key === 'Enter') { 
                    e.preventDefault(); 
                    titleEl.blur(); 
                } 
            };
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