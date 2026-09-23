/**
 * editor-format-blocks.js
 * Sottomodulo di Editor.
 * Inserimento e movimento di Blocchi complessi, esecuzione di execCommand nativi e gestione del Contesto (Widget).
 */

Object.assign(Editor, {

    openInsertMenu: (e, anchorId) => {
        if (e) e.stopPropagation();
        
        const executeInsert = (fn) => {
            Editor.saveSelection();
            fn();
        };

        const svgDivider = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="3" y1="12" x2="21" y2="12"></line></svg>`;

        const items = [
            { icon: Icons.link, label: 'Collegamento (Link)', onClick: () => executeInsert(() => LinkManager.openSelectionModal()) },
            { icon: Icons.image, label: 'Immagine', onClick: () => executeInsert(() => { document.getElementById('imgUpload').click(); }) },
            { icon: Icons.play, label: 'Traccia Audio (.mp3, .wav)', onClick: () => executeInsert(() => { document.getElementById('audioUpload').click(); }) },
            { type: 'divider' },
            { icon: svgDivider, label: 'Linea di Divisione', shortcut: '---', onClick: () => executeInsert(() => Editor.insertDivider()) },
            { type: 'divider' },
            { icon: Icons.bookmark, label: 'Segnalibro', shortcut: 'Ctrl+Shift+B', onClick: () => executeInsert(() => Editor.insertBookmark()) },
            { icon: Icons.noteInline, label: 'Appunto Inline (Nascosto)', onClick: () => executeInsert(() => Editor.insertInlineNote()) },
            { icon: Icons.clipboard, label: 'Snippet Copiabile', onClick: () => executeInsert(() => Editor.insertCopySnippet()) }
        ];

        UI.Menu.buildContextMenu(anchorId, items);
    },

    openWidgetsMenu: (e, anchorId) => {
        if (e) e.stopPropagation();
        
        const executeInsert = (fn) => {
            Editor.saveSelection();
            fn();
        };

        const items = [
            { icon: Icons.code, label: 'Blocco di Codice', onClick: () => executeInsert(() => Editor.insertCodeBlock()) },
            { icon: Icons.citation, label: 'Citazione Live', onClick: () => executeInsert(() => CitationManager.openModal()) },
            { icon: Icons.columns, label: 'Testo in Colonne', onClick: () => executeInsert(() => ColumnManager.insert()) },
            { type: 'divider' },
            { icon: Icons.tableSimple, label: 'Tabella', onClick: () => executeInsert(() => TableManager.openCreationModal()) },
            { icon: Icons.tableDatabase, label: 'Database', onClick: () => executeInsert(() => AdvancedTable.create()) },
            { icon: Icons.tablePivot, label: 'Vista / Pivot / Grafico', onClick: () => executeInsert(() => AdvancedPivotMenus.openCreateWizard()) },
            { type: 'divider' },
            { icon: Icons.play, label: 'Pulsante Macro', onClick: () => executeInsert(() => ButtonManager.insert()) }
        ];

        UI.Menu.buildContextMenu(anchorId, items);
    },

    insertCodeBlock: () => {
        Editor.restoreSelection();
        const selection = window.getSelection();
        let node = selection.rangeCount > 0 ? selection.getRangeAt(0).commonAncestorContainer : null;
        if(node && node.nodeType === 3) node = node.parentNode;

        if (node && node.closest('.widget-type-columns')) {
            alert("Sposta il cursore fuori dalle colonne prima di inserire questo elemento.");
            return;
        }

        Editor.saveSnapshot();

        const id = 'adv_code_' + Store.generateId();
        
        if (!AppState.databases) AppState.databases = {};
        AppState.databases[id] = { title: 'Codice', language: 'none', content: '' };

        let wrapper;
        if (typeof WidgetManager !== 'undefined') {
            wrapper = WidgetManager.createShell('code', id, '<pre class="code-content" data-language="none" contenteditable="true"><br></pre>');
        } else {
            const htmlStr = `<div id="${id}" class="code-wrapper widget-type-code adv-widget-shell" data-widget-type="code" contenteditable="false"><pre class="code-content" contenteditable="true" data-language="none"><br></pre></div>`;
            document.execCommand('insertHTML', false, htmlStr + '<p><br></p>');
            return;
        }

        // 1. Cerca il blocco contenitore più vicino al cursore (paragrafo, div, intestazione)
        let targetBlock = node ? node.closest('p, div, li, h1, h2, h3, h4, h5, h6') : null;
        
        // 2. Verifica se il blocco trovato è "vuoto"
        const hasWidgets = targetBlock ? !!targetBlock.querySelector('.adv-widget-shell, .adv-inline-shell, img, audio, iframe') : false;
        const isEmptyBlock = targetBlock && targetBlock.id !== 'noteContent' && !hasWidgets && targetBlock.textContent.replace(/[\u200B\n\r]/g, '').trim() === '';

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
        
        const p = document.createElement('p'); p.innerHTML = '<br>';
        wrapper.parentNode.insertBefore(p, wrapper.nextSibling);

        Editor._ensureLastLineBreak(document.getElementById('noteContent'));

        if (typeof WidgetManager !== 'undefined') WidgetManager.mountAll();
        Store.triggerAutoSave();

        setTimeout(() => {
            const preElement = document.querySelector(`#${id} pre`);
            if (preElement) {
                preElement.focus();
                const newRange = document.createRange();
                newRange.selectNodeContents(preElement);
                newRange.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(newRange);
            }
        }, 50);
    },

    insertCopySnippet: () => {
        Editor.saveSnapshot();
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);

        const wrapper = document.createElement('span');
        wrapper.className = 'adv-copy-snippet adv-inline-shell';
        wrapper.setAttribute('data-widget-type', 'snippet');
        wrapper.setAttribute('contenteditable', 'false');

        const textSpan = document.createElement('span');
        textSpan.className = 'snippet-text widget-editable-area';
        textSpan.setAttribute('contenteditable', 'true');

        const btnSpan = document.createElement('span');
        btnSpan.className = 'snippet-copy-btn';
        btnSpan.setAttribute('contenteditable', 'false');
        btnSpan.setAttribute('title', 'Copia');
        btnSpan.innerHTML = typeof Icons !== 'undefined' ? Icons.clipboard : '📋';

        wrapper.appendChild(document.createTextNode('\u200B'));
        wrapper.appendChild(textSpan);
        wrapper.appendChild(btnSpan);
        wrapper.appendChild(document.createTextNode('\u200B'));

        // REINTEGRAZIONE E CORREZIONE: Controllo strutturale del blocco per prevenire il Nesting
        let targetBlock = range.startContainer.nodeType === 3 ? range.startContainer.parentNode.closest('p, div, li, h1, h2, h3, h4, h5, h6') : range.startContainer.closest('p, div, li, h1, h2, h3, h4, h5, h6');
        const hasWidgets = targetBlock ? !!targetBlock.querySelector('.adv-widget-shell, .adv-inline-shell, img, audio, iframe') : false;
        const isEmptyBlock = targetBlock && targetBlock.id !== 'noteContent' && !hasWidgets && targetBlock.textContent.replace(/[\u200B\n\r]/g, '').trim() === '';

        range.deleteContents();

        if (isEmptyBlock) {
            // FIX INLINE BLOCK NESTING: Svuotiamo il paragrafo e inseriamo lo span al suo interno
            // Mantenendo il tag P originale, l'editor non andrà in crash strutturale.
            targetBlock.innerHTML = '';
            targetBlock.appendChild(wrapper);
        } else {
            range.insertNode(wrapper);
        }

        // Cuscinetti esterni di sicurezza per permettere alla freccia ArrowDown 
        // e ArrowRight del browser di superare l'ostacolo dell'inline-flex
        const zwsBefore = document.createTextNode('\u200B');
        const zwsAfter = document.createTextNode('\u200B');
        
        wrapper.parentNode.insertBefore(zwsBefore, wrapper);
        wrapper.parentNode.insertBefore(zwsAfter, wrapper.nextSibling);

        const newRange = document.createRange();
        newRange.selectNodeContents(textSpan);
        newRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(newRange);

        Store.triggerAutoSave();
    },

    insertDivider: () => {
        Editor.saveSnapshot();
        Editor.restoreSelection();
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const hr = document.createElement('hr');
        const p = document.createElement('p');
        p.innerHTML = '<br>';

        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        if (node.nodeType === 3) node = node.parentNode;
        let block = node.closest('p, div, h1, h2, h3, li');
        
        if (block && block.id !== 'noteContent') {
            block.parentNode.insertBefore(hr, block.nextSibling);
            block.parentNode.insertBefore(p, hr.nextSibling);
        } else {
            range.insertNode(hr);
            hr.parentNode.insertBefore(p, hr.nextSibling);
        }

        const newRange = document.createRange();
        newRange.setStart(p, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        Store.triggerAutoSave();
    },

    healWidgetWrappers: () => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;
        
        const formatTags = ['B', 'I', 'U', 'S', 'SPAN', 'FONT', 'MARK', 'A', 'STRONG', 'EM', 'STRIKE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
        let changed = true;
        
        while (changed) {
            changed = false;
            const widgets = editor.querySelectorAll('.adv-widget-shell');
            
            widgets.forEach(w => {
                let p = w.parentNode;
                if (p && p.id !== 'noteContent' && formatTags.includes(p.tagName.toUpperCase())) {
                    const wrapperToSplit = p;
                    const parentOfWrapper = p.parentNode;

                    const wrapperAfter = wrapperToSplit.cloneNode(false);
                    let next = w.nextSibling;
                    while(next) {
                        let sibling = next.nextSibling;
                        wrapperAfter.appendChild(next);
                        next = sibling;
                    }

                    parentOfWrapper.insertBefore(w, wrapperToSplit.nextSibling);
                    
                    if (wrapperAfter.childNodes.length > 0) {
                        parentOfWrapper.insertBefore(wrapperAfter, w.nextSibling);
                    }
                    
                    if (wrapperToSplit.childNodes.length === 0) {
                        wrapperToSplit.remove();
                    }
                    changed = true;
                }
            });
        }
    },

    exec: (cmd, val = null) => {
        Editor.saveSnapshot();
        document.execCommand(cmd, false, val);
        
        Editor.healWidgetWrappers();
        
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            let node = sel.getRangeAt(0).commonAncestorContainer;
            if (node.nodeType === 3) node = node.parentNode;
            const editableElement = node.closest('[contenteditable="true"]');
            if (editableElement) editableElement.focus();
            else document.getElementById('noteContent').focus();
        } else {
            document.getElementById('noteContent').focus();
        }

        Editor.updateToolbarFormatting();
    },

    moveBlock: (direction) => {
        if (!AppState.isEditMode) return;
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        let node = sel.anchorNode;
        let tempNode = node;
        if (tempNode.nodeType === 3) tempNode = tempNode.parentNode;

        let block = tempNode.closest('li, p, div, h1, h2, h3, h4, h5, h6, blockquote, pre');
        if (!block || block.id === 'noteContent') return;

        Editor.saveSnapshot();

        let marker = document.createElement('span');
        marker.id = 'editor-move-marker';
        const range = sel.getRangeAt(0).cloneRange();
        range.insertNode(marker);

        let moved = false;

        if (direction === -1) {
            const prev = block.previousElementSibling;
            if (prev) {
                block.parentNode.insertBefore(block, prev);
                moved = true;
            }
        } else {
            const next = block.nextElementSibling;
            if (next) {
                block.parentNode.insertBefore(block, next.nextSibling);
                moved = true;
            }
        }

        if (moved) {
            const savedMarker = document.getElementById('editor-move-marker');
            if (savedMarker) {
                const newRange = document.createRange();
                newRange.setStartBefore(savedMarker);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
                const parent = savedMarker.parentNode;
                parent.removeChild(savedMarker);
                parent.normalize();

                const scrollArea = document.querySelector('.editor-scroll-content');
                if (scrollArea) {
                    const rect = block.getBoundingClientRect();
                    const areaRect = scrollArea.getBoundingClientRect();
                    if (rect.top < areaRect.top + 40 || rect.bottom > areaRect.bottom - 40) {
                        block.scrollIntoView({ block: 'center', behavior: 'instant' });
                    }
                }
            }
            Store.triggerAutoSave();
        } else {
            const savedMarker = document.getElementById('editor-move-marker');
            if (savedMarker) {
                const parent = savedMarker.parentNode;
                parent.removeChild(savedMarker);
                parent.normalize();
            }
        }
    },

    checkContext: () => {
        if (!AppState.isEditMode) return;
        Editor.updateToolbarFormatting();
        Editor.enforceBoundaries();

        const selection = window.getSelection();
        if (selection.rangeCount === 0) {
            Editor.currentContext = null;
            return;
        }

        let node = selection.anchorNode;
        let parent = (node.nodeType === 3) ? node.parentNode : node;

        const isInsideColumn = parent.closest('.widget-type-columns') ? true : false;
        const isInsideSimpleTable = parent.closest('.simple-table-wrapper') ? true : false;
        
        const isInsideDB = WidgetManager.isProtectedBlock(parent) && !isInsideColumn && !isInsideSimpleTable;
        
        Editor.toggleAdvancedToolbar(!isInsideDB);

        let targetElement = null;
        if (parent.closest('table')) targetElement = parent.closest('table');
        else if (parent.closest('ul, ol')) targetElement = parent.closest('ul, ol');

        Editor.currentContext = targetElement;
    },

    editContextElement: () => {
        if (!Editor.currentContext) return;
        const el = Editor.currentContext;
        if (el.tagName === 'TABLE') {
            TableManager.editCurrentTable(el);
        } else if (el.tagName === 'UL' || el.tagName === 'OL') {
            if (typeof UI !== 'undefined' && UI.Menu) {
                // Simulate click on the list toolbar button
                const btn = document.getElementById('btnListMenu');
                if (btn) Editor.openListMenu(null, 'btnListMenu');
            }
        }
    },

    toggleAdvancedToolbar: (enable) => {
        const tb = document.getElementById('editorToolbar');
        if (!tb) return;
        
        // I pulsanti Undo/Redo vengono gestiti in esclusiva da Editor.updateUndoRedoUI() in history
        const buttons = tb.querySelectorAll('button:not([title*="Annulla Ultima"]):not([title*="Ripeti ("]):not([title="Maiuscolo/Minuscolo"])');
        const dropdowns = tb.querySelectorAll('.color-picker-group');

        buttons.forEach(btn => btn.disabled = !enable);
        dropdowns.forEach(grp => {
            if (!enable) grp.classList.add('disabled-tool');
            else grp.classList.remove('disabled-tool');
        });
    }
});