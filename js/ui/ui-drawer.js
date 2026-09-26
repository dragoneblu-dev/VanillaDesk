/**
 * ui-drawer.js
 * Sottomodulo di UI.
 * Gestione del motore di navigazione a cassetto (Drawer), dello Stack di History 
 * per l'apertura di sottomenu, e delle feature X-Ray (Ghost) e Docking.
 * FIX WORKFLOW: Inserita guardia difensiva su AdvancedTable.renderTable per evitare crash
 * quando il drawer viene chiuso in ambienti privi del modulo render tabelle.
 */

Object.assign(UI, {
    _drawerStack: [],
    _drawerCloseTimer: null,

    toggleDrawerDock: () => {
        const drawer = document.getElementById('advGlobalDrawer');
        if (drawer) {
            drawer.classList.toggle('dock-right');
            const isRight = drawer.classList.contains('dock-right');
            localStorage.setItem('pronotes_drawer_dock', isRight ? 'right' : 'left');
            
            const btn = document.getElementById('advDrawerDockBtn');
            if (btn) {
                btn.innerHTML = isRight 
                    ? '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M15 18l-6-6 6-6"/></svg>' 
                    : '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M9 18l6-6-6-6"/></svg>';
            }
        }
    },

    toggleDrawerGhost: () => {
        const drawer = document.getElementById('advGlobalDrawer');
        if (drawer) {
            drawer.classList.toggle('ghost-mode');
            const btn = document.getElementById('advDrawerGhostBtn');
            if (btn) {
                if (drawer.classList.contains('ghost-mode')) {
                    btn.innerHTML = typeof Icons !== 'undefined' ? Icons.eyeOff : '<s>👁</s>';
                    btn.classList.add('active');
                    btn.style.color = 'var(--accent-color)';
                } else {
                    btn.innerHTML = typeof Icons !== 'undefined' ? Icons.eye : '👁';
                    btn.classList.remove('active');
                    btn.style.color = '';
                }
            }
        }
    },

    openDrawer: (titleHTML, bodyHTML, footerHTML, skipStack = false) => {
        clearTimeout(UI._drawerCloseTimer);

        if (!UI._drawerStack) UI._drawerStack = [];

        const drawer = document.getElementById('advGlobalDrawer');
        const title = document.getElementById('advDrawerTitle');
        const body = document.getElementById('advDrawerBody');
        const footer = document.getElementById('advDrawerFooter');

        if (drawer && title && body && footer) {
            
            // Creiamo un div temporaneo per estrarre il testo puro dai titoli, usato per i controlli logici
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = titleHTML;
            const newTitleText = tempDiv.innerText.trim();
            const currentTitleText = title.innerText.trim();

            // Euristica 1: Se il titolo testuale è identico, il pannello si sta solo auto-aggiornando
            const isSamePanel = currentTitleText === newTitleText;

            // Euristica 2: Riconoscimento intelligente del tasto "Annulla" personalizzato dei moduli
            let isManualBack = false;
            if (UI._drawerStack.length > 0) {
                const prevStackTitleText = UI._drawerStack[UI._drawerStack.length - 1].titleText;
                if (newTitleText === prevStackTitleText) {
                    isManualBack = true;
                    UI._drawerStack.pop(); 
                }
            }

            // Salvataggio nello stack dei Nodi Fisici (Preserva eventi e scroll)
            if (drawer.classList.contains('open') && !skipStack && !isSamePanel && !isManualBack) {
                const bodyChildren = [];
                // Rimuove fisicamente il nodo dal DOM dopo averlo salvato in RAM
                while (body.firstChild) { 
                    bodyChildren.push(body.firstChild);
                    body.removeChild(body.firstChild);
                }
                
                const footerChildren = [];
                while (footer.firstChild) { 
                    footerChildren.push(footer.firstChild);
                    footer.removeChild(footer.firstChild);
                }

                UI._drawerStack.push({
                    titleHTML: title.innerHTML,
                    titleText: currentTitleText,
                    bodyNodes: bodyChildren,
                    footerNodes: footerChildren,
                    scrollTop: body.scrollTop
                });
            } else if (!drawer.classList.contains('open')) {
                UI._drawerStack = [];
            }

            title.innerHTML = titleHTML;
            body.innerHTML = bodyHTML;
            footer.innerHTML = footerHTML || '';
            footer.style.display = footerHTML ? 'flex' : 'none';

            // --- INIEZIONE CONTROLLI AVANZATI DRAWER (DOCK & GHOST) ---
            let headerContainer = title.parentElement;
            let controlsGroup = document.getElementById('advDrawerControls');
            
            if (!controlsGroup) {
                controlsGroup = document.createElement('div');
                controlsGroup.id = 'advDrawerControls';
                controlsGroup.style.display = 'flex';
                controlsGroup.style.alignItems = 'center';
                controlsGroup.style.gap = '8px';

                // Tasto Ghost Mode (Occhio)
                const ghostBtn = document.createElement('button');
                ghostBtn.id = 'advDrawerGhostBtn';
                ghostBtn.className = 'adv-icon-btn';
                ghostBtn.innerHTML = typeof Icons !== 'undefined' ? Icons.eye : '👁';
                ghostBtn.title = 'Modalità X-Ray (Scompare temporaneamente)';
                ghostBtn.onclick = UI.toggleDrawerGhost;

                // Tasto Spostamento Laterale (Dock)
                const dockBtn = document.createElement('button');
                dockBtn.id = 'advDrawerDockBtn';
                dockBtn.className = 'adv-icon-btn';
                const isDockRight = localStorage.getItem('pronotes_drawer_dock') === 'right';
                if (isDockRight) drawer.classList.add('dock-right');
                
                dockBtn.innerHTML = isDockRight 
                    ? '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M15 18l-6-6 6-6"/></svg>' 
                    : '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M9 18l6-6-6-6"/></svg>';
                dockBtn.title = 'Sposta il pannello a Destra/Sinistra';
                dockBtn.onclick = UI.toggleDrawerDock;

                // Spostiamo il tasto di chiusura nativo dentro il gruppo per mantenerli allineati
                const closeBtn = headerContainer.querySelector('.close-modal-btn:not(#advDrawerBackBtn)');
                
                controlsGroup.appendChild(ghostBtn);
                controlsGroup.appendChild(dockBtn);
                
                if (closeBtn) {
                    const sep = document.createElement('div');
                    sep.style.width = '1px'; sep.style.height = '16px'; sep.style.background = 'var(--border-color)';
                    sep.style.margin = '0 5px';
                    controlsGroup.appendChild(sep);
                    controlsGroup.appendChild(closeBtn);
                }
                
                headerContainer.appendChild(controlsGroup);
            }

            // Gestione automatica visibilità e iniezione della Freccia "Back"
            let backBtn = document.getElementById('advDrawerBackBtn');
            if (UI._drawerStack.length > 0) {
                if (!backBtn) {
                    backBtn = document.createElement('button');
                    backBtn.id = 'advDrawerBackBtn';
                    backBtn.className = 'close-modal-btn';
                    backBtn.innerHTML = typeof Icons !== 'undefined' ? Icons.arrowLeft : '←';
                    backBtn.title = 'Torna Indietro';
                    backBtn.style.marginRight = '8px';
                    backBtn.style.padding = '2px 6px';
                    backBtn.style.display = 'inline-flex';
                    backBtn.style.alignItems = 'center';
                    backBtn.onclick = UI.goBackDrawer;
                    
                    headerContainer.insertBefore(backBtn, title);
                }
                backBtn.style.display = 'inline-flex';
            } else {
                if (backBtn) backBtn.style.display = 'none';
            }

            // Se il drawer in precedenza era in ghost mode, forza lo sblocco per mostrare i nuovi dati
            if (drawer.classList.contains('ghost-mode')) {
                UI.toggleDrawerGhost();
            }

            drawer.style.boxShadow = '5px 0 15px rgba(0, 0, 0, 0.1)';
            drawer.classList.add('open');
        }
    },

    goBackDrawer: () => {
        if (!UI._drawerStack || UI._drawerStack.length === 0) return;

        const prevState = UI._drawerStack.pop();

        const title = document.getElementById('advDrawerTitle');
        const body = document.getElementById('advDrawerBody');
        const footer = document.getElementById('advDrawerFooter');

        title.innerHTML = prevState.titleHTML;
        body.innerHTML = '';
        prevState.bodyNodes.forEach(n => body.appendChild(n));
        body.scrollTop = Math.max(0, prevState.scrollTop);

        footer.innerHTML = '';
        prevState.footerNodes.forEach(n => footer.appendChild(n));
        footer.style.display = prevState.footerNodes.length > 0 ? 'flex' : 'none';

        const backBtn = document.getElementById('advDrawerBackBtn');
        if (backBtn) {
            backBtn.style.display = UI._drawerStack.length > 0 ? 'inline-flex' : 'none';
        }

        const drawer = document.getElementById('advGlobalDrawer');
        if (drawer && drawer.classList.contains('ghost-mode')) {
            UI.toggleDrawerGhost();
        }

        // Segnale globale inviato all'applicazione per permettere ai sottomoduli di rinfrescare dati stantii
        document.dispatchEvent(new CustomEvent('drawer-restored', { detail: { titleText: prevState.titleText } }));
    },

    closeDrawer: () => {
        const drawer = document.getElementById('advGlobalDrawer');
        if (drawer) {
            drawer.classList.remove('open');
            UI._drawerStack = []; 
            const backBtn = document.getElementById('advDrawerBackBtn');
            if (backBtn) backBtn.style.display = 'none';
            
            // Assicurati che alla chiusura venga disattivato il ghost mode
            if (drawer.classList.contains('ghost-mode')) {
                UI.toggleDrawerGhost();
            }

            if (typeof UI.Menu !== 'undefined') UI.Menu.closeAll(true); 
            UI._drawerCloseTimer = setTimeout(() => {
                document.getElementById('advDrawerBody').innerHTML = '';
                document.getElementById('advDrawerFooter').innerHTML = '';
                drawer.style.boxShadow = '5px 0 15px rgba(0, 0, 0, 0.1)';
            }, 300);
        }

        // --- GESTIONE INTEGRATA CHIUSURA RECORD DATABASE ---
        if (typeof AdvancedTable !== 'undefined' && AdvancedTable.activeRecordId) {
            const targetRowId = AdvancedTable.activeRecordId;
            AdvancedTable.activeRecordId = null;

            if (AppState.databases) {
                Object.keys(AppState.databases).forEach(tId => {
                    const state = AppState.databases[tId];
                    if (state && state.rows && state.rows.some(r => r.id === targetRowId)) {
                        // Verifica difensiva: renderTable viene invocato solo se il modulo di rendering tabelle è caricato, serve per poter richiamare la funzione anche quando la si invoca dall'applicazione/estensione Workflow
                        if (typeof AdvancedTable.renderTable === 'function') {
                            AdvancedTable.renderTable(tId);
                        }
                    }
                });
            }
        }
    }
});