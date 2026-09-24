/**
 * ui-preferences.js
 * Sottomodulo di UI.
 * Gestione delle impostazioni dell'utente (Salvataggio in LocalStorage), 
 * temi, Toggle di layout dell'editor e inizializzazione dei Tooltip.
 * REFACTOR CENTRALIZZATO: Menu principale (hamburger) gestito interamente tramite UI.Menu.buildContextMenu.
 * FEAT CONTINUOUS EDIT: Modularizzazione di setContinuousEdit per attivazione programmatica all'apertura del Workspace.
 */

Object.assign(UI, {
    toggleMainMenu: (e) => {
        if (e) e.stopPropagation();
        
        const existing = document.querySelector('.adv-dropdown.main-menu-portal');
        UI.Menu.closeAll(true);
        if (existing && e) return;

        const currentTheme = localStorage.getItem('theme') || 'light';
        const chk = ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>';
        
        const trashCount = AppState.notes ? AppState.notes.filter(n => n.deletedAt).length : 0;
        const currentWidth = document.documentElement.style.getPropertyValue('--page-max-width');
        const isFullWidth = currentWidth === '100%';

        const items = [
            {
                icon: Icons.folderOpen,
                label: 'Nuovo Workspace...',
                onClick: () => Store.createWorkspace(true)
            },
            {
                icon: Icons.folder,
                label: 'Apri Workspace...',
                onClick: () => Store.openWorkspace()
            },
            {
                icon: Icons.file,
                label: 'File JSON',
                type: 'submenu',
                items: [
                    {
                        icon: Icons.import,
                        label: 'Carica File JSON...',
                        onClick: () => Store.loadSnapshot()
                    },
                    {
                        icon: Icons.download,
                        label: 'Scarica Backup JSON',
                        onClick: () => Store.downloadSnapshot()
                    }
                ]
            },
            {
                icon: Icons.trash,
                label: 'Cestino',
                badge: trashCount > 0 ? trashCount : null,
                badgeColor: 'var(--danger-color)',
                onClick: () => UI.Trash.open()
            },
            { type: 'divider' },
            {
                icon: Icons.lightning || '📦',
                label: 'Installa Modulo (Modpack)...',
                onClick: () => PackageManager.importModpack()
            },
            {
                icon: Icons.file,
                label: 'Importa file Markdown...',
                onClick: () => ExportManager.importMarkdown()
            },
            {
                icon: Icons.export,
                label: 'Esporta Doc. Unico...',
                onClick: () => ExportManager.openModal()
            },
            { type: 'divider' },
            {
                icon: AppState.noWrapMode ? Icons.checkSquare : Icons.square,
                label: 'No Word Wrap',
                onClick: () => UI.toggleWordWrap()
            },
            {
                icon: AppState.continuousEditMode ? Icons.checkSquare : Icons.square,
                label: 'Edit Continuo',
                onClick: () => UI.toggleContinuousEdit()
            },
            {
                icon: Icons.lock,
                label: 'Sicurezza e Password...',
                onClick: () => UI.PasswordManager.openSettings()
            },
            { type: 'divider' },
            {
                icon: Icons.palette,
                label: 'Aspetto',
                type: 'submenu',
                items: [
                    {
                        type: 'custom',
                        html: '<div class="adv-dropdown-title" style="padding:0 4px; margin-bottom:4px;">Layout Pagina</div>'
                    },
                    {
                        icon: isFullWidth ? Icons.widthFull : Icons.widthFit,
                        label: isFullWidth ? 'Larghezza: Intera' : 'Larghezza: Standard',
                        onClick: () => UI.togglePageWidth()
                    },
                    { type: 'divider' },
                    {
                        type: 'custom',
                        html: '<div class="adv-dropdown-title" style="padding:0 4px; margin-bottom:4px;">Tema Colori</div>'
                    },
                    {
                        label: 'Bianco Puro' + (currentTheme === 'white' ? chk : ''),
                        onClick: () => UI.setTheme('white')
                    },
                    {
                        label: 'Carta avorio' + (currentTheme === 'light' ? chk : ''),
                        onClick: () => UI.setTheme('light')
                    },
                    {
                        label: 'Fresco Pastello' + (currentTheme === 'pastel' ? chk : ''),
                        onClick: () => UI.setTheme('pastel')
                    },
                    {
                        label: 'Blu lavagna' + (currentTheme === 'dark' ? chk : ''),
                        onClick: () => UI.setTheme('dark')
                    },
                    {
                        label: 'Notte stellata' + (currentTheme === 'notion-dark' ? chk : ''),
                        onClick: () => UI.setTheme('notion-dark')
                    },
                    { type: 'divider' },
                    {
                        type: 'custom',
                        html: `
                            <div class="adv-dropdown-title" style="padding:0 4px; margin-bottom:4px;">Zoom Testo</div>
                            <div style="display:flex; gap:5px; padding:4px 0;">
                                <button class="btn" style="flex:1; justify-content:center; font-weight:bold;" onclick="UI.changeFontSize(-1); event.stopPropagation();">A -</button>
                                <button class="btn" style="flex:1; justify-content:center; font-weight:bold;" onclick="UI.changeFontSize(1); event.stopPropagation();">A +</button>
                            </div>
                        `
                    }
                ]
            },
            { type: 'divider' },
            {
                icon: Icons.book,
                label: 'Manuale d\'Uso',
                onClick: () => Manual.open()
            }
        ];

        UI.Menu.buildContextMenu('mainMenuBtn', items);
        
        const menuEl = document.querySelector('.adv-dropdown.adv-context-menu:last-child');
        if (menuEl) {
            menuEl.classList.add('main-menu-portal');
        }
    },

    setContinuousEdit: (enable = true) => {
        AppState.continuousEditMode = enable;

        const icon = document.getElementById('continuousEditIcon');
        if (icon) {
            icon.innerHTML = AppState.continuousEditMode ? Icons.checkSquare : Icons.square;
            icon.style.color = AppState.continuousEditMode ? 'var(--accent-color)' : '';
        }

        if (AppState.continuousEditMode && AppState.currentNoteId) {
            UI.toggleEditMode(true);
        }

        localStorage.setItem('pronotes_continuous', AppState.continuousEditMode);
    },

    toggleContinuousEdit: () => {
        UI.setContinuousEdit(!AppState.continuousEditMode);
    },

    toggleWordWrap: () => {
        AppState.noWrapMode = !AppState.noWrapMode;
        const editor = document.getElementById('noteContent');

        const icon = document.getElementById('wordWrapIcon');
        if (icon) {
            icon.innerHTML = AppState.noWrapMode ? Icons.checkSquare : Icons.square;
            icon.style.color = AppState.noWrapMode ? 'var(--accent-color)' : '';
        }

        if (editor) {
            if (AppState.noWrapMode) editor.classList.add('no-wrap');
            else editor.classList.remove('no-wrap');
        }

        localStorage.setItem('pronotes_nowrap', AppState.noWrapMode);
    },

    togglePageWidth: () => {
        const docRoot = document.documentElement;
        const currentWidth = docRoot.style.getPropertyValue('--page-max-width');
        
        let isFullWidth = currentWidth === '100%';
        let newWidth = isFullWidth ? '900px' : '100%';
        
        docRoot.style.setProperty('--page-max-width', newWidth);
        localStorage.setItem('pronotes_pagewidth', newWidth);
        
        const icon = document.getElementById('pageWidthIcon');
        const text = document.getElementById('pageWidthBtn');
        if (icon) {
            icon.innerHTML = !isFullWidth ? Icons.widthFull : Icons.widthFit;
        }
        if (text) {
            text.innerText = !isFullWidth ? 'Larghezza: Intera' : 'Larghezza: Standard';
        }
    },

    changeFontSize: (delta) => {
        UI.currentFontSize += delta;
        if (UI.currentFontSize < 10) UI.currentFontSize = 10;
        if (UI.currentFontSize > 32) UI.currentFontSize = 32;
        document.documentElement.style.setProperty('--reading-font-size', UI.currentFontSize + 'px');
        localStorage.setItem('pronotes_fontsize', UI.currentFontSize);
        if (typeof UI.Minimap !== 'undefined') UI.Minimap.sync(); 
    },

    setTheme: (themeName) => {
        const body = document.body;
        body.removeAttribute('data-theme');

        if (themeName !== 'light') {
            body.setAttribute('data-theme', themeName);
        }
        localStorage.setItem('theme', themeName);

        const chkLight = document.getElementById('theme-light-check');
        const chkWhite = document.getElementById('theme-white-check');
        const chkDark = document.getElementById('theme-dark-check');
        const chkNotionDark = document.getElementById('theme-notion-dark-check');
        const chkPastel = document.getElementById('theme-pastel-check');

        if (chkLight) chkLight.textContent = themeName === 'light' ? '✓' : '';
        if (chkWhite) chkWhite.textContent = themeName === 'white' ? '✓' : '';
        if (chkDark) chkDark.textContent = themeName === 'dark' ? '✓' : '';
        if (chkNotionDark) chkNotionDark.textContent = themeName === 'notion-dark' ? '✓' : '';
        if (chkPastel) chkPastel.textContent = themeName === 'pastel' ? '✓' : '';
    },

    // Toggle Sidebar. Attivo quando visibile.
    toggleSidebar: () => { 
        const sb = document.getElementById('sidebar'); 
        const btn = document.getElementById('sidebarToggleBtn'); 
        if (sb) {
            const isCollapsed = sb.classList.toggle('collapsed'); 
            if (btn) {
                if (isCollapsed) btn.classList.remove('active');
                else btn.classList.add('active');
            }
        }
    },

    showEditor: (show) => {
        const emptyState = document.getElementById('emptyState');
        const editorWrapper = document.getElementById('editorWrapper');
        const onboardingView = document.getElementById('onboardingView');
        const readModeView = document.getElementById('readModeView');
        const homeDocView = document.getElementById('homeDocumentView');
        const contextActions = document.getElementById('noteContextActions');

        const aliveNotes = AppState.notes.filter(n => !n.deletedAt);

        if (show) {
            if (emptyState) emptyState.classList.add('hidden');
            if (emptyState) emptyState.classList.remove('onboarding-state');
            if (emptyState) emptyState.classList.remove('home-dashboard-state');
            if (editorWrapper) editorWrapper.classList.remove('hidden');
            if (contextActions) contextActions.classList.remove('hidden');
        } else {
            if (editorWrapper) editorWrapper.classList.add('hidden');
            if (emptyState) emptyState.classList.remove('hidden');
            if (contextActions) contextActions.classList.add('hidden');

            if (aliveNotes.length === 0) {
                if (emptyState) emptyState.classList.add('onboarding-state');
                if (emptyState) emptyState.classList.remove('home-dashboard-state');
                if (onboardingView) onboardingView.classList.remove('hidden');
                if (readModeView) readModeView.classList.add('hidden');
                if (homeDocView) homeDocView.classList.add('hidden');
            } else {
                if (emptyState) emptyState.classList.remove('onboarding-state');
                if (emptyState) emptyState.classList.add('home-dashboard-state');
                if (onboardingView) onboardingView.classList.add('hidden');
                if (readModeView) readModeView.classList.add('hidden');
                if (homeDocView) homeDocView.classList.remove('hidden');
                if (typeof CitationManager !== 'undefined') {
                    CitationManager.renderHomeCitations();
                    if (typeof WidgetManager !== 'undefined') setTimeout(() => WidgetManager.mountAll(), 100);
                }
            }
        }
    },

    closeEditor: () => { 
        AppState.currentNoteId = null; 
        UI.showEditor(false); 
    },

    toggleEditMode: (forceState = null) => {
        if (!AppState.currentNoteId) return;

        const newState = forceState !== null ? forceState : !AppState.isEditMode;
        
        if (AppState.isEditMode && !newState && !AppState.isSwitchingNote) {
            if (typeof Editor !== 'undefined') Editor.sanitizeContent();
        }
        
        AppState.isEditMode = newState;

        const titleInput = document.getElementById('noteTitle');
        const contentDiv = document.getElementById('noteContent');
        const toolbar = document.getElementById('editorToolbar');
        const toggleBtn = document.getElementById('editToggleBtn');
        const editorWrapper = document.getElementById('editorWrapper');

        if (!titleInput || !contentDiv || !toolbar || !toggleBtn) return;

        if (typeof Editor !== 'undefined') Editor._ensureLastLineBreak(contentDiv);

        if (AppState.isEditMode) {
            if (editorWrapper) editorWrapper.classList.remove('read-mode');

            if (typeof Editor !== 'undefined') Editor.cleanHighlightsBeforeSave();

            titleInput.removeAttribute('readonly');
            contentDiv.setAttribute('contenteditable', 'true');
            
            contentDiv.querySelectorAll('.checklist-text, .journal-content, .adv-cell-text, pre.code-content, .snippet-text, .widget-editable-area').forEach(el => el.setAttribute('contenteditable', 'true'));
            contentDiv.querySelectorAll('.adv-checklist input[type="checkbox"]').forEach(el => el.removeAttribute('disabled'));

            toolbar.classList.remove('hidden');
            toggleBtn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.checkCircle} Salva</span>`;
            toggleBtn.classList.add('btn-editing');

            if (typeof Editor !== 'undefined' && Editor.updateToolbarFormatting) {
                Editor.updateToolbarFormatting();
            }
        } else {
            if (editorWrapper) editorWrapper.classList.add('read-mode');

            titleInput.setAttribute('readonly', 'true');
            contentDiv.setAttribute('contenteditable', 'false');
            
            contentDiv.querySelectorAll('[contenteditable="true"]').forEach(el => el.setAttribute('contenteditable', 'false'));
            contentDiv.querySelectorAll('.adv-checklist input[type="checkbox"]').forEach(el => el.setAttribute('disabled', 'true'));

            toolbar.classList.add('hidden');
            toggleBtn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.edit} Modifica</span>`;
            toggleBtn.classList.remove('btn-editing');

            if (typeof TableManager !== 'undefined') {
                TableManager.hideMenus();
                TableManager.hideTriggers();
            }
            if (typeof UI.Menu !== 'undefined') UI.Menu.closeAll();
        }

        if (typeof WidgetManager !== 'undefined') {
            WidgetManager.mountAll(document.getElementById('noteContent'));
        }

        if (!AppState.isSwitchingNote) {
            const isManualSaveEvent = !AppState.isEditMode && forceState === null;
            if (typeof Store !== 'undefined') Store.triggerAutoSave(true, isManualSaveEvent); 
        }

        if (typeof TemplateManager !== 'undefined') {
            TemplateManager.toggleEmptyOverlay();
        }
        
        setTimeout(() => {
            if (AppState.showMinimap && typeof UI.Minimap !== 'undefined') UI.Minimap.sync();
        }, 100);
    },

    loadPreferences: () => {
        const savedSize = localStorage.getItem('pronotes_fontsize');
        if (savedSize) {
            UI.currentFontSize = parseInt(savedSize);
            const parsed = parseInt(savedSize, 10);
            if (!isNaN(parsed) && parsed >= 10 && parsed <= 32) {
                UI.currentFontSize = parsed;
            } else {
                UI.currentFontSize = 16;
            }
            document.documentElement.style.setProperty('--reading-font-size', UI.currentFontSize + 'px');
        }

        const savedNoWrap = localStorage.getItem('pronotes_nowrap');
        if (savedNoWrap === 'true') {
            AppState.noWrapMode = true;
            const editor = document.getElementById('noteContent');
            if (editor) editor.classList.add('no-wrap');

            const icon = document.getElementById('wordWrapIcon');
            if (icon) {
                icon.innerHTML = Icons.checkSquare;
                icon.style.color = 'var(--accent-color)';
            }
        }
        
        // Recupero l'impostazione dell'Edit Continuo dal Local Storage
        const savedContinuous = localStorage.getItem('pronotes_continuous');
        if (savedContinuous === 'true') {
            AppState.continuousEditMode = true;
            const icon = document.getElementById('continuousEditIcon');
            if (icon) {
                icon.innerHTML = Icons.checkSquare;
                icon.style.color = 'var(--accent-color)';
            }
        }

        const savedPageWidth = localStorage.getItem('pronotes_pagewidth');
        if (savedPageWidth) {
            document.documentElement.style.setProperty('--page-max-width', savedPageWidth);
            const icon = document.getElementById('pageWidthIcon');
            const text = document.getElementById('pageWidthBtn');
            if (icon) icon.innerHTML = savedPageWidth === '100%' ? Icons.widthFull : Icons.widthFit;
            if (text) text.innerText = savedPageWidth === '100%' ? 'Larghezza: Intera' : 'Larghezza: Standard';
        }

        const savedMinimap = localStorage.getItem('pronotes_minimap');
        if (savedMinimap === 'true' && typeof UI.Minimap !== 'undefined') {
            UI.Minimap.toggle();
        }

        if (typeof UI.Minimap !== 'undefined') {
            UI.Minimap.initDrag();
        }

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (AppState.showMinimap && typeof UI.Minimap !== 'undefined') UI.Minimap.sync();
            }, 150);
        });

        const savedTheme = localStorage.getItem('theme') || 'light';
        UI.setTheme(savedTheme);

        document.addEventListener('mousedown', (e) => {
            if (e.target.closest('.toolbar') || e.target.closest('.color-dropdown') || e.target.closest('.list-options-dropdown') || e.target.closest('.adv-dropdown')) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
                e.preventDefault();
                if (typeof Editor !== 'undefined') Editor.saveSelection();
            }
        });

        document.addEventListener('click', (e) => {
            const drawer = document.getElementById('advGlobalDrawer');
            if (drawer && drawer.classList.contains('open') &&
                !e.target.closest('.adv-drawer') && !e.target.closest('.adv-icon-btn') &&
                !e.target.closest('.adv-dropdown') && !e.target.closest('.adv-dropdown-item') &&
                !e.target.closest('.inline-note-marker') && !e.target.closest('.btn-color-swatch') &&
                !e.target.closest('.toolbar button')) {

                const footer = document.getElementById('advDrawerFooter');
                const hasSaveBtn = footer && footer.style.display !== 'none' && footer.querySelector('.btn-primary');

                if (hasSaveBtn) {
                    drawer.style.boxShadow = 'inset 0 0 0 2px var(--danger-color), 0 0 20px rgba(239, 68, 68, 0.4)';
                    setTimeout(() => drawer.style.boxShadow = '5px 0 15px rgba(0, 0, 0, 0.1)', 300);
                    return;
                }
                UI.closeDrawer();
            }

            if (!e.target.closest('.color-picker-group') && !e.target.closest('.adv-dropdown') && !e.target.closest('.list-options-dropdown')) {
                if (typeof UI.Menu !== 'undefined') UI.Menu.closeAll(false);
            }
        }, true);

        // ASCOLTATORE SCROLL PRINCIPALE (Aggancio per TOC e Minimappa)
        const editorScrollArea = document.getElementById('editorScrollContent');
        if (editorScrollArea) {
            editorScrollArea.addEventListener('scroll', () => {
                if (AppState.currentNoteId && !AppState.isSwitchingNote) {
                    const currentNote = Store.getNote(AppState.currentNoteId);
                    if (currentNote) currentNote._lastScroll = editorScrollArea.scrollTop;
                }
                if (typeof UI.Minimap !== 'undefined') UI.Minimap.updateViewport();
                if (typeof UI.updateTOCScrollSpy === 'function') UI.updateTOCScrollSpy();
            });
        }

        UI.initCustomTooltips();
        UI.showEditor(false);
        if (typeof UI.Alarm !== 'undefined') UI.Alarm.init(); 
    },

    initCustomTooltips: () => {
        const tooltipEl = document.getElementById('advCustomTooltip');
        if (!tooltipEl) return;

        let activeTarget = null;
        let observer = null;

        const hideTooltip = () => {
            tooltipEl.style.opacity = '0';
            activeTarget = null;
            if (observer) { observer.disconnect(); observer = null; }
        };

        document.addEventListener('mouseover', (e) => {
            let target = null;
            let htmlText = '';
            
            if (e.target.closest('.inline-note-marker')) {
                target = e.target.closest('.inline-note-marker');
                const wrapper = target.closest('.inline-note-wrapper');
                if (wrapper) {
                    const dataSpan = wrapper.querySelector('.inline-note-data');
                    if (dataSpan) htmlText = dataSpan.innerHTML;
                }
                if (!htmlText) htmlText = target.getAttribute('data-tooltip') || '';
            } 
            else if (e.target.closest('a')) {
                target = e.target.closest('a');
                
                if (target.hasAttribute('title')) {
                    target.removeAttribute('title');
                }
                
                const userNote = target.getAttribute('data-link-note') || '';
                let pathInfo = target.getAttribute('href') || '';
                
                if (target.classList.contains('file-link')) {
                    pathInfo = target.getAttribute('data-file-path') || '';
                } else if (target.classList.contains('internal-link')) {
                    pathInfo = 'Nota Interna (Workspace)';
                } else {
                    pathInfo = pathInfo.replace(/^https?:\/\/file:\/\/\//i, 'file:///');
                }

                let displayPathInfo = pathInfo;
                if (displayPathInfo && displayPathInfo.length > 50) {
                    const half = 22;
                    displayPathInfo = displayPathInfo.substring(0, half) + '...' + displayPathInfo.substring(displayPathInfo.length - half);
                }

                if (userNote) {
                    htmlText = `<b>Note:</b> ${userNote}<br><span style="opacity:0.6; font-size:0.75rem; margin-top:4px; display:block;">[ Path: ${displayPathInfo} ]</span>`;
                } else if (displayPathInfo && displayPathInfo !== '#' && displayPathInfo !== 'Nota Interna (Workspace)') {
                    htmlText = `<span style="font-size:0.85rem; word-break: break-all;">${displayPathInfo}</span>`;
                }
            } 
            else if (e.target.closest('[data-tooltip]')) {
                target = e.target.closest('[data-tooltip]');
                htmlText = target.getAttribute('data-tooltip') || '';
            }

            if (!target || !htmlText) {
                clearTimeout(UI.tooltipTimeout);
                hideTooltip();
                return;
            }

            activeTarget = target;

            if (observer) observer.disconnect();
            observer = new MutationObserver(() => {
                if (!document.body.contains(activeTarget)) hideTooltip();
            });
            observer.observe(document.body, { childList: true, subtree: true });

            UI.tooltipTimeout = setTimeout(() => {
                if (!document.body.contains(target)) return;

                tooltipEl.innerHTML = htmlText; 
                const rect = target.getBoundingClientRect();

                let topPos = rect.top - tooltipEl.offsetHeight - 10;
                let leftPos = rect.left + (rect.width / 2) - (tooltipEl.offsetWidth / 2);

                if (topPos < 0) topPos = rect.bottom + 10;
                if (leftPos < 10) leftPos = 10;
                if (leftPos + tooltipEl.offsetWidth > window.innerWidth - 10) leftPos = window.innerWidth - tooltipEl.offsetWidth - 10;

                tooltipEl.style.top = topPos + 'px';
                tooltipEl.style.left = leftPos + 'px';
                tooltipEl.style.opacity = '1';
            }, 300);
        });

        document.addEventListener('mouseout', (e) => {
            if (e.target.closest('[data-tooltip]') || e.target.closest('.inline-note-marker') || e.target.closest('a')) {
                clearTimeout(UI.tooltipTimeout);
                hideTooltip();
            }
        });
    }
});