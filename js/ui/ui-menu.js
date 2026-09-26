/**
 * ui-menu.js
 * Motore isolato per la generazione e gestione dei Menu a Tendina e Contestuali.
 * FIX: Aggiunto supporto per la proprietà 'shortcut' per visualizzare le scorciatoie da tastiera allineate a destra.
 * FIX RICERCA: Esclusione del portale di autocompletamento della Sidebar dalla distruzione globale per prevenire la chiusura forzata durante l'aggiornamento della nota attiva.
 * FEAT UX: Aggiunto supporto nativo per i 'badge' (Pillole numeriche informative) con colore personalizzabile (badgeColor).
 */

Object.assign(UI, {
    Menu: {
        closeAll: (force = false) => {
            const hoveredDropdown = document.querySelector('.adv-dropdown:hover');
            
            document.querySelectorAll('.adv-select-edit-menu').forEach(el => {
                if (!el.matches(':hover') || force) el.remove();
            });

            if (!force && hoveredDropdown) return;

            // FIX: Escludiamo esplicitamente l'ID del popup della barra di ricerca per impedirne 
            // la distruzione quando la digitazione forza il ricaricamento degli evidenziatori nella nota corrente.
            document.querySelectorAll('.adv-dropdown, .adv-filter-autocomplete:not(#sidebar-filter-autocomplete-portal), .adv-submenu-portal').forEach(el => {
                el.remove();
            });
        },

        positionAt: (dropdown, anchorId) => {
            const anchor = document.getElementById(anchorId);
            if (!anchor) return;
            const rect = anchor.getBoundingClientRect();

            dropdown.style.visibility = 'hidden';
            dropdown.style.display = 'flex';
            dropdown.style.maxHeight = 'none';
            dropdown.style.overflowY = 'auto'; 
            dropdown.style.overflowX = 'hidden';

            setTimeout(() => {
                const dropRect = dropdown.getBoundingClientRect();
                const margin = 10; 

                const spaceBelow = window.innerHeight - rect.bottom - margin;
                const spaceAbove = rect.top - margin;

                let finalTop = rect.bottom + window.scrollY + 5;
                let finalLeft = rect.left + window.scrollX;
                let finalMaxHeight = spaceBelow;

                if (dropRect.height > spaceBelow && spaceAbove > spaceBelow) {
                    finalMaxHeight = spaceAbove;
                    finalTop = rect.top + window.scrollY - Math.min(dropRect.height, spaceAbove) - 5;
                }

                if (dropdown.classList.contains('adv-select-edit-menu')) {
                    finalLeft = rect.right + window.scrollX + 5;
                    finalTop = rect.top + window.scrollY - 10;
                    
                    if (finalLeft + dropRect.width > window.innerWidth) {
                        finalLeft = rect.left + window.scrollX - dropRect.width - 5;
                    }
                } else {
                    if (finalLeft + dropRect.width > window.innerWidth) {
                        finalLeft = window.innerWidth - dropRect.width - margin + window.scrollX;
                    }
                }

                dropdown.style.position = 'absolute';
                dropdown.style.left = Math.max(margin, finalLeft) + 'px';
                dropdown.style.top = finalTop + 'px';
                dropdown.style.maxHeight = Math.max(150, finalMaxHeight) + 'px';
                dropdown.style.visibility = 'visible';
            }, 0);
        },

        buildContextMenu: (anchorId, items) => {
            UI.Menu.closeAll(true);
            const anchor = document.getElementById(anchorId);
            if (!anchor) return;

            const menu = document.createElement('div');
            menu.className = 'adv-dropdown adv-context-menu';

            const buildLevel = (menuItems, container) => {
                menuItems.forEach(item => {
                    if (item.type === 'divider') {
                        const div = document.createElement('div');
                        div.className = 'adv-menu-divider';
                        container.appendChild(div);
                    } else if (item.type === 'custom') {
                        const div = document.createElement('div');
                        div.style.padding = '4px';
                        div.innerHTML = item.html;
                        container.appendChild(div);
                    } else {
                        const el = document.createElement('div');
                        el.className = 'adv-menu-item';
                        if (item.danger) el.classList.add('danger');
                        if (item.disabled) el.classList.add('disabled');

                        let innerHTML = `
                            <div style="display:flex; align-items:center; flex:1; overflow:hidden;">
                                <span class="adv-menu-icon">${item.icon || ''}</span>
                                <span class="adv-menu-label">${item.label}</span>
                            </div>
                        `;

                        // Aggiunge il Badge numerico con supporto a badgeColor opzionale
                        if (item.badge !== undefined && item.badge !== null) {
                            const bColor = item.badgeColor || 'var(--accent-color)';
                            innerHTML += `<span style="background:${bColor}; color:white; font-size:0.7rem; font-weight:bold; padding:2px 6px; border-radius:10px; margin-left:auto;">${item.badge}</span>`;
                        }
                        // Aggiunge la scorciatoia testuale
                        else if (item.shortcut) {
                            innerHTML += `<span style="font-size: 0.7rem; opacity: 0.5; margin-left: 15px; font-family: monospace;">${item.shortcut}</span>`;
                        }

                        if (item.type === 'submenu') {
                            el.classList.add('has-submenu');
                            innerHTML += `<span class="adv-menu-arrow">›</span>`;
                            el.innerHTML = innerHTML;

                            const sub = document.createElement('div');
                            sub.className = 'adv-dropdown adv-context-menu adv-submenu adv-submenu-portal';
                            sub.style.display = 'none'; 
                            
                            buildLevel(item.items, sub);
                            document.body.appendChild(sub);

                            let hoverTimer;

                            const openSubmenu = () => {
                                clearTimeout(hoverTimer);
                                
                                document.querySelectorAll('.adv-submenu-portal').forEach(p => {
                                    if (p !== sub) p.style.display = 'none';
                                });

                                sub.style.position = 'fixed';
                                sub.style.zIndex = '10000';
                                sub.style.display = 'flex';
                                sub.style.flexDirection = 'column';
                                sub.style.maxHeight = '80vh';
                                sub.style.overflowY = 'auto';
                                sub.style.overflowX = 'hidden';

                                const rect = el.getBoundingClientRect();
                                const subRect = sub.getBoundingClientRect();

                                let left = rect.right;
                                let top = rect.top - 6;

                                if (left + subRect.width > window.innerWidth) {
                                    left = rect.left - subRect.width;
                                }

                                if (top + subRect.height > window.innerHeight) {
                                    top = window.innerHeight - subRect.height - 10;
                                }
                                if (top < 0) top = 10;

                                sub.style.left = left + 'px';
                                sub.style.top = top + 'px';
                            };

                            const closeSubmenu = () => {
                                hoverTimer = setTimeout(() => {
                                    if (!sub.matches(':hover') && !el.matches(':hover')) {
                                        sub.style.display = 'none';
                                    }
                                }, 100); 
                            };

                            el.addEventListener('mouseenter', openSubmenu);
                            el.addEventListener('mouseleave', closeSubmenu);
                            sub.addEventListener('mouseenter', () => clearTimeout(hoverTimer));
                            sub.addEventListener('mouseleave', closeSubmenu);

                            container.appendChild(el);
                            
                        } else {
                            el.innerHTML = innerHTML;
                            if (!item.disabled && item.onClick) {
                                el.addEventListener('mousedown', (ev) => {
                                    ev.preventDefault();
                                });
                                
                                el.addEventListener('click', (ev) => {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    
                                    try {
                                        item.onClick(ev);
                                    } catch (err) {
                                        console.error(`🔴 [UI-MENU] ERRORE durante l'esecuzione di "${item.label}":`, err);
                                        alert(`Errore interno: ${err.message}`);
                                    }
                                    
                                    UI.Menu.closeAll(true);
                                });
                            }
                            container.appendChild(el);
                        }
                    }
                });
            };

            buildLevel(items, menu);
            document.body.appendChild(menu);
            UI.Menu.positionAt(menu, anchorId);
        }
    }
});