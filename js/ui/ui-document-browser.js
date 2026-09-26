/**
 * ui-document-browser.js
 * Motore Unificato per l'esplorazione profonda del documento (Note, Capitoli, Blocchi).
 * Utilizzato da LinkManager e CitationManager.
 * FEATURE: Tooltip di anteprima laterale fisso (Non copre l'albero).
 * FIX ARCHITETTURALE: Prevenuta l'esposizione al tree di nodi HTML nativi interni ai Widget.
 * FIX TRANSCLUSION: L'anteprima dei Widget deidratati ora innesca una reidratazione temporanea.
 * FIX LABELS: Assegnazione corretta del Titolo Reale ai Blocchi di Codice e dicitura esplicita "Tabella" 
 * per intercettazione corretta del Simple-Table Wrapper.
 */

UI.DocumentBrowser = {
    allItems: [],
    expandedNodes: new Set(),
    callback: null,
    mode: 'link', // 'link' o 'citation'

    open: (mode, title, onSelectCallback, targetToFocus = null) => {
        UI.DocumentBrowser.mode = mode;
        UI.DocumentBrowser.callback = onSelectCallback;
        UI.DocumentBrowser.expandedNodes.clear();

        UI.DocumentBrowser.initTooltip();

        const html = `
            <input type="text" id="docBrowserSearch" class="modern-input" placeholder="Cerca nota, capitolo, tabella, codice..." autocomplete="off" style="margin-bottom:15px; width:100%;">
            <div id="docBrowserList" class="adv-scroll-container" style="flex:1; overflow-y:auto; overflow-x:hidden; border: 1px solid var(--border-color); background: var(--sidebar-bg); border-radius: 4px; padding: 5px; min-height: 200px; max-height: 60vh;"></div>
        `;

        UI.openDrawer(title, html, null);

        setTimeout(() => {
            UI.DocumentBrowser.populate();
            
            if (targetToFocus && targetToFocus.noteId) {
                UI.DocumentBrowser.expandToTarget(targetToFocus);
            }

            UI.DocumentBrowser.renderTree();
            
            const activeEl = document.querySelector('#docBrowserList .highlighted-target');
            if (activeEl) {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            
            const searchInput = document.getElementById('docBrowserSearch');
            if (searchInput) {
                searchInput.focus();
                searchInput.oninput = (e) => UI.DocumentBrowser.filter(e.target.value);
            }
        }, 50);
    },

    expandToTarget: (target) => {
        const targetItem = UI.DocumentBrowser.allItems.find(i => 
            i.noteId === target.noteId && 
            (!target.refId || i.refId === target.refId) &&
            (target.refId ? i.refType !== 'note' : i.refType === 'note')
        );

        if (targetItem) {
            targetItem._isTarget = true;
            
            let currParent = targetItem.parentId;
            while (currParent) {
                UI.DocumentBrowser.expandedNodes.add(currParent);
                const parentObj = UI.DocumentBrowser.allItems.find(i => i.id === currParent);
                currParent = parentObj ? parentObj.parentId : null;
            }
        }
    },

    initTooltip: () => {
        let tooltip = document.getElementById('docPreviewTooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'docPreviewTooltip';
            tooltip.style.cssText = `
                position: fixed; z-index: 10000; pointer-events: none; display: none;
                width: 500px; max-height: 500px; transform: scale(0.5); transform-origin: top left;
                overflow: hidden; background: var(--bg-color); border: 4px solid var(--accent-color);
                border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); padding: 20px;
                color: var(--text-primary);
            `;
            tooltip.innerHTML = `<div id="docPreviewContent" class="editor-content" style="width:100%; height:100%; overflow:hidden;"></div>`;
            document.body.appendChild(tooltip);
        }
    },

    _trimEmptyTrailingTags: (htmlString) => {
        const temp = document.createElement('div');
        temp.innerHTML = htmlString;
        let lastChild = temp.lastChild;
        
        while (lastChild) {
            if (lastChild.nodeType === Node.TEXT_NODE && lastChild.nodeValue.trim() === '') {
                const prev = lastChild.previousSibling;
                lastChild.remove(); lastChild = prev; continue;
            }
            if (lastChild.nodeType === Node.ELEMENT_NODE) {
                if (lastChild.tagName === 'BR') {
                    const prev = lastChild.previousSibling;
                    lastChild.remove(); lastChild = prev; continue;
                }
                if (lastChild.tagName === 'P' || lastChild.tagName === 'DIV') {
                    const isWidget = typeof WidgetManager !== 'undefined' ? lastChild.matches(WidgetManager.blockSelector) : lastChild.classList.contains('adv-widget-shell');
                    const hasWidgetInside = lastChild.querySelector(`img, table, iframe, ${typeof WidgetManager !== 'undefined' ? WidgetManager.blockSelector : '.adv-widget-shell'}`);

                    if (!hasWidgetInside && !isWidget) {
                        const text = lastChild.innerHTML.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/g, '').trim();
                        if (text === '') {
                            const prev = lastChild.previousSibling;
                            lastChild.remove(); lastChild = prev; continue;
                        }
                    }
                }
            }
            break;
        }
        return temp.innerHTML;
    },

    extractLiveHTML: (htmlContent, refId, refType) => {
        const temp = document.createElement('div');
        temp.innerHTML = htmlContent;

        if (!refId || refType === 'note') return UI.DocumentBrowser._trimEmptyTrailingTags(temp.innerHTML);

        const target = temp.querySelector(`#${refId}`);

        if (refType === 'element') {
            if (target) {
                if (target.tagName === 'LI') {
                    const parentTag = target.parentElement ? target.parentElement.tagName : 'UL';
                    return `<${parentTag}>${target.outerHTML}</${parentTag}>`;
                }
                return UI.DocumentBrowser._trimEmptyTrailingTags(target.outerHTML);
            }
            return `<p style="color:var(--danger-color); font-style:italic;">[Il blocco originale è stato eliminato]</p>`;
        }

        if (refType === 'chapter') {
            if (!target) return `<p style="color:var(--danger-color); font-style:italic;">[Il capitolo originale non è stato trovato]</p>`;
            let capturedHTML = target.outerHTML;
            let captureLevel = parseInt(target.tagName.charAt(1));
            let curr = target.nextElementSibling;

            while (curr) {
                let tag = curr.tagName.toLowerCase();
                if (['h1', 'h2', 'h3'].includes(tag)) {
                    if (parseInt(tag.charAt(1)) <= captureLevel) break;
                }
                capturedHTML += curr.outerHTML;
                curr = curr.nextElementSibling;
            }
            return UI.DocumentBrowser._trimEmptyTrailingTags(capturedHTML);
        }
        return '';
    },

    showPreview: (item, e) => {
        if (!item || !item.refType) return;

        const tooltip = document.getElementById('docPreviewTooltip');
        const content = document.getElementById('docPreviewContent');
        const listEl = document.getElementById('docBrowserList');
        if (!tooltip || !content || !listEl) return;

        const note = Store.getNote(item.noteId);
        if (!note) return;

        let extracted = UI.DocumentBrowser.extractLiveHTML(note.content || '', item.refId, item.refType);
        if (!extracted) extracted = `<span style="color:var(--text-secondary); font-style:italic;">Contenuto vuoto o non trovato.</span>`;
        
        content.innerHTML = extracted;
        
        content.querySelectorAll('[contenteditable="true"]').forEach(el => el.setAttribute('contenteditable', 'false'));
        content.querySelectorAll('.adv-table-wrapper, .adv-journal-wrapper, .code-wrapper').forEach(el => el.style.pointerEvents = 'none');

        // FIX ANTEPRIMA WIDGET: Reidratazione confinata in sola lettura per impedire "gusci vuoti"
        if (typeof WidgetManager !== 'undefined') {
            content.querySelectorAll(WidgetManager.blockSelector).forEach(wrapper => {
                const trueId = wrapper.id;
                if (trueId && !trueId.includes('_cited_')) {
                    const cloneId = trueId + '_cited_' + Store.generateId();
                    wrapper.id = cloneId;
                }
            });

            const tempEdit = AppState.isEditMode;
            try {
                AppState.isEditMode = false; 
                WidgetManager.mountAll(content); 
            } finally {
                AppState.isEditMode = tempEdit; 
            }
        }

        tooltip.style.display = 'block';

        const listRect = listEl.getBoundingClientRect();
        const tooltipRealWidth = 250; 
        const tooltipRealHeight = tooltip.getBoundingClientRect().height * 0.5;

        let x = listRect.right + 15;
        let y = e.clientY - (tooltipRealHeight / 2);

        if (x + tooltipRealWidth > window.innerWidth) {
            x = listRect.left - tooltipRealWidth - 15;
        }

        if (x < 0) {
            x = e.clientX + 15;
            y = e.clientY + 15;
        }

        if (y < 10) y = 10;
        if (y + tooltipRealHeight > window.innerHeight) y = window.innerHeight - tooltipRealHeight - 10;

        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
    },

    hidePreview: () => {
        const tooltip = document.getElementById('docPreviewTooltip');
        if (tooltip) tooltip.style.display = 'none';
    },

    populate: () => {
        UI.DocumentBrowser.allItems = [];
        const processedNotes = new Set();
        let domModifiedGlobal = false;

        const processNoteTree = (note, parentItemId) => {
            if (processedNotes.has(note.id)) return;
            processedNotes.add(note.id);

            const noteItemId = 'docb_' + note.id;
            UI.DocumentBrowser.allItems.push({
                id: noteItemId,
                parentId: parentItemId,
                noteId: note.id,
                refId: null,
                refType: 'note',
                title: note.title || 'Senza Titolo',
                icon: note.isRecordNote ? Icons.recordPage : Icons.file,
                color: note.isRecordNote ? 'var(--record-color, #10b981)' : 'var(--text-primary)'
            });

            let domModifiedLocally = false;

            if (note.content) {
                const temp = document.createElement('div');
                temp.innerHTML = note.content;
                
                const widgetSel = typeof WidgetManager !== 'undefined' ? WidgetManager.blockSelector : '.adv-widget-shell';
                // Aggiunto ".simple-table-wrapper" al query selector per intercettare il vero wrapper della tabella
                const elements = temp.querySelectorAll(`h1, h2, h3, ul, ol, blockquote, pre, .simple-table-wrapper, ${widgetSel}`);

                let h1Id = null, h2Id = null, h3Id = null;

                elements.forEach(el => {
                    const isWidgetShell = el.matches(widgetSel) || el.classList.contains('simple-table-wrapper');
                    if (!isWidgetShell) {
                        const parentWidget = el.closest(widgetSel);
                        if (parentWidget) return; 
                    }

                    let tag = el.tagName.toLowerCase();
                    let elId = el.id;
                    if (!elId) { elId = 'blk_' + Store.generateId(); el.id = elId; domModifiedLocally = true; }

                    let pId = noteItemId;
                    if (tag === 'h1') { h1Id = elId; h2Id = null; h3Id = null; pId = noteItemId; }
                    else if (tag === 'h2') { h2Id = elId; h3Id = null; pId = h1Id ? 'docb_'+h1Id : noteItemId; }
                    else if (tag === 'h3') { h3Id = elId; pId = h2Id ? 'docb_'+h2Id : (h1Id ? 'docb_'+h1Id : noteItemId); }
                    else { pId = h3Id ? 'docb_'+h3Id : (h2Id ? 'docb_'+h2Id : (h1Id ? 'docb_'+h1Id : noteItemId)); }

                    let title = '', icon = '', type = 'element', color = 'var(--text-secondary)';

                    if (tag.startsWith('h')) {
                        title = el.innerText.trim() || 'Intestazione vuota';
                        icon = `<span style="font-family:monospace; font-weight:bold;">#</span>`; 
                        type = 'chapter';
                        color = 'var(--text-primary)';
                    } else if (el.classList.contains('adv-table-wrapper') || el.classList.contains('adv-widget-shell')) {
                        // Riconoscimento rigoroso del tipo di Widget
                        const wType = el.getAttribute('data-widget-type') || (el.classList.contains('adv-journal-wrapper') ? 'journal' : 'database');
                        
                        if (wType === 'database' || wType === 'pivot') {
                            const s = AppState.databases[elId];
                            title = s ? s.title : 'Database';
                            icon = wType === 'pivot' ? Icons.tablePivot : Icons.tableDatabase;
                            color = 'var(--accent-color)';
                        } else if (wType === 'journal') {
                            const s = AppState.databases[elId];
                            title = s ? s.title : 'Diario / Log';
                            icon = Icons.journal;
                        } else if (wType === 'code') {
                            const s = AppState.databases[elId];
                            // FIX: Lettura del titolo reale del blocco codice se presente nel database
                            title = s && s.title ? s.title : 'Blocco di Codice';
                            icon = Icons.code;
                        } else if (wType === 'buttonbar') {
                            title = 'Barra Pulsanti';
                            icon = Icons.play;
                        } else if (wType === 'columns') {
                            title = 'Testo a Colonne';
                            icon = Icons.columns || `<span style="font-family:monospace; font-weight:bold;">||</span>`;
                        } else if (wType === 'simple-table' || el.classList.contains('simple-table-wrapper')) {
                            // FIX: Assicura un'etichetta dignitosa per le Tabelle Semplici avvolte
                            title = 'Tabella'; 
                            icon = Icons.tableSimple;
                        }
                    } else if (tag === 'ul' || tag === 'ol') {
                        title = el.innerText.replace(/\n/g, ' / ').substring(0, 30) + '...'; 
                        icon = Icons.viewList;
                    } else if (tag === 'pre') {
                        title = 'Codice'; icon = Icons.code;
                    } else if (tag === 'blockquote') {
                        title = 'Citazione'; icon = Icons.citation;
                    } else if (tag === 'table') {
                        // Fallback per vecchie tabelle scoperte
                        title = 'Tabella'; icon = Icons.tableSimple;
                    }

                    if (!title) title = 'Elemento';
                    if (!icon) icon = `<span style="font-family:monospace; font-weight:bold;">&lt;&gt;</span>`;

                    const myItemId = 'docb_' + elId;
                    UI.DocumentBrowser.allItems.push({
                        id: myItemId,
                        parentId: pId,
                        noteId: note.id,
                        refId: elId,
                        refType: type,
                        title: title,
                        icon: icon,
                        color: color
                    });

                    if (el.classList.contains('adv-table-wrapper') || el.getAttribute('data-widget-type') === 'database') {
                        const recordNotes = AppState.notes.filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === elId);
                        recordNotes.forEach(rn => processNoteTree(rn, myItemId));
                    }
                });

                if (domModifiedLocally) {
                    note.content = temp.innerHTML;
                    domModifiedGlobal = true;
                }
            }

            const standardChildren = AppState.notes.filter(n => !n.deletedAt && n.parentId === note.id && !n.isRecordNote);
            standardChildren.forEach(child => processNoteTree(child, noteItemId));
        };

        const roots = AppState.notes.filter(n => !n.deletedAt && !n.parentId && !n.isRecordNote);
        roots.forEach(n => processNoteTree(n, null));

        if (domModifiedGlobal) {
            Store.triggerAutoSave(true);
        }

        UI.DocumentBrowser.allItems.forEach(item => {
            item.hasChildren = UI.DocumentBrowser.allItems.some(child => child.parentId === item.id);
        });
    },

    toggleNode: (e, nodeId) => {
        e.stopPropagation();
        if (UI.DocumentBrowser.expandedNodes.has(nodeId)) {
            UI.DocumentBrowser.expandedNodes.delete(nodeId);
        } else {
            UI.DocumentBrowser.expandedNodes.add(nodeId);
        }
        
        const searchInput = document.getElementById('docBrowserSearch');
        const filterVal = searchInput ? searchInput.value.toLowerCase() : "";
        
        if (filterVal) UI.DocumentBrowser.filter(filterVal);
        else UI.DocumentBrowser.renderTree();
    },

    renderTree: (filteredIds = null) => {
        const listEl = document.getElementById('docBrowserList');
        if (!listEl) return;
        listEl.innerHTML = '';
        
        if (UI.DocumentBrowser.allItems.length === 0 || (filteredIds && filteredIds.size === 0)) { 
            listEl.innerHTML = '<div style="padding:20px; color:var(--text-secondary); text-align:center; font-style:italic;">Nessun risultato.</div>'; 
            return; 
        }

        const buildNodeHTML = (item) => {
            const div = document.createElement('div');
            div.className = 'node-wrapper';
            
            const isExpanded = UI.DocumentBrowser.expandedNodes.has(item.id);
            
            let toggleHtml = '';
            if (item.hasChildren) {
                toggleHtml = `<div class="toggle-btn ${isExpanded ? 'expanded' : ''}" style="width:20px; display:flex; justify-content:center; align-items:center;" onclick="UI.DocumentBrowser.toggleNode(event, '${item.id}')">${Icons.chevronRight}</div>`;
            } else {
                toggleHtml = `<div class="toggle-btn" style="width:20px; display:flex; justify-content:center; align-items:center; cursor:default;"><span style="opacity:0.3; font-size:18px;">•</span></div>`;
            }

            const content = document.createElement('div');
            content.className = 'node-content';

            if (item._isTarget) {
                content.classList.add('active', 'highlighted-target');
                content.style.boxShadow = 'inset 0 0 0 2px var(--accent-color)';
            }
            
            let iconHtml = `<span style="opacity:0.8; margin-right:8px; display:inline-flex; align-items:center; color:${item.color};">${item.icon}</span>`;
            let titleHtml = `<span class="node-title" style="color:${item.color}; font-weight:${item.refType==='note'||item.refType==='chapter'?'bold':'normal'};">${item.title}</span>`;
            
            content.innerHTML = `${toggleHtml}<div style="display:flex; align-items:center; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${iconHtml}${titleHtml}</div>`;
            
            content.onmouseenter = (e) => UI.DocumentBrowser.showPreview(item, e);
            content.onmouseleave = () => UI.DocumentBrowser.hidePreview();

            content.onclick = (e) => {
                if (e.target.closest('.toggle-btn')) return;
                UI.DocumentBrowser.hidePreview();
                if (UI.DocumentBrowser.callback) {
                    UI.DocumentBrowser.allItems.forEach(i => delete i._isTarget);
                    UI.DocumentBrowser.callback(item);
                }
            };

            div.appendChild(content);

            if (isExpanded) {
                const children = UI.DocumentBrowser.allItems.filter(child => child.parentId === item.id);
                if (children.length > 0) {
                    const block = document.createElement('div');
                    block.className = 'children-block expanded';
                    const blockInner = document.createElement('div');
                    blockInner.className = 'children-block-inner';
                    
                    children.forEach(child => {
                        if (!filteredIds || filteredIds.has(child.id)) {
                            blockInner.appendChild(buildNodeHTML(child));
                        }
                    });
                    
                    block.appendChild(blockInner);
                    div.appendChild(block);
                }
            }

            return div;
        };

        const rootItems = UI.DocumentBrowser.allItems.filter(item => item.parentId === null);
        rootItems.forEach(rootItem => {
            if (!filteredIds || filteredIds.has(rootItem.id)) {
                listEl.appendChild(buildNodeHTML(rootItem));
            }
        });
    },

    filter: (query) => {
        const lower = query.trim().toLowerCase();
        
        if (!lower) {
            UI.DocumentBrowser.renderTree(null);
            return;
        }

        const idsToInclude = new Set();

        UI.DocumentBrowser.allItems.forEach(item => {
            if (item.title.toLowerCase().includes(lower)) {
                idsToInclude.add(item.id);
                
                let pId = item.parentId;
                while (pId) {
                    idsToInclude.add(pId);
                    UI.DocumentBrowser.expandedNodes.add(pId);
                    const pNode = UI.DocumentBrowser.allItems.find(i => i.id === pId);
                    pId = pNode ? pNode.parentId : null;
                }
            }
        });

        UI.DocumentBrowser.renderTree(idsToInclude);
    }
};