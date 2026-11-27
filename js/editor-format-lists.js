/**
 * editor-format-lists.js
 * Sottomodulo di Editor.
 * Gestione strutturale delle Liste e delle Checklist (Indent/Outdent).
 * Gestione avanzata degli Elenchi: valore di partenza (start),
 * continuazione della numerazione e unione fisica tra elenchi separati dello stesso tipo (puntati, numerati, letterali).
 * Memorizzazione ultimo tipo elenco e toggle attivo con un click (toggleActiveList).
 * Conversione fedele e non distruttiva di selezioni multiple di paragrafi,
 * titoli o elenchi ordinati/puntati esistenti in To-Do List e riconversione bidirezionale
 * mantenendo l'ordine esatto nella pagina.
 * Assegnazione di contenteditable="false" alla casella checkbox
 * per impedire al cursore di collocarsi a sinistra di essa e prevenire la distruzione del blocco su Backspace.
 */

Object.assign(Editor, {
    lastListType: 'ul',

    _getChecklistTextSpan: (liNode) => {
        if (!liNode || !liNode.children) return null;
        return Array.from(liNode.children).find(c => c.classList && c.classList.contains('checklist-text')) || null;
    },

    _getChecklistNestedList: (liNode) => {
        if (!liNode || !liNode.children) return null;
        return Array.from(liNode.children).find(c => c.tagName === 'UL' && c.classList && c.classList.contains('adv-checklist')) || null;
    },

    _isChecklistSpanEmpty: (spanText) => {
        if (!spanText) return true;
        const cleanText = (spanText.textContent || '').replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
        return cleanText === '' && !spanText.querySelector('img, audio, iframe, svg, .adv-inline-shell');
    },

    _placeCaretInChecklistSpan: (spanText, atEnd = false) => {
        if (!spanText) return;
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();

        if (Editor._isChecklistSpanEmpty(spanText)) {
            if (!spanText.firstChild || spanText.firstChild.nodeType !== Node.TEXT_NODE) {
                spanText.innerHTML = '';
                spanText.appendChild(document.createTextNode('\u200B'));
            }
            range.setStart(spanText.firstChild, 1);
            range.collapse(true);
        } else if (atEnd) {
            range.selectNodeContents(spanText);
            range.collapse(false);
        } else {
            const walker = document.createTreeWalker(spanText, NodeFilter.SHOW_TEXT, null, false);
            let firstText = null;
            let t;
            while ((t = walker.nextNode())) {
                if (t.parentNode && t.parentNode.closest && t.parentNode.closest('.adv-inline-shell, .inline-note-data, .bookmark-comment-data')) continue;
                if (t.nodeValue && t.nodeValue.replace(/[\u200B\uFEFF]/g, '').length > 0) {
                    firstText = t;
                    break;
                }
            }
            if (firstText) {
                range.setStart(firstText, firstText.nodeValue.startsWith('\u200B') ? 1 : 0);
            } else {
                range.setStart(spanText, 0);
            }
            range.collapse(true);
        }

        sel.removeAllRanges();
        sel.addRange(range);
        Editor.savedRange = range.cloneRange();
    },

    toggleActiveList: (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        const selection = window.getSelection();
        const editor = document.getElementById('noteContent');
        if (!selection || !selection.rangeCount || !editor || !editor.contains(selection.anchorNode)) {
            Editor.restoreSelection();
        } else {
            Editor.savedRange = selection.getRangeAt(0).cloneRange();
        }

        Editor.saveSnapshot();

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        let node = sel.anchorNode;
        if (node && node.nodeType === 3) node = node.parentNode;
        if (!node) return;

        const checklistLi = node.closest('li.adv-checklist-item');
        const checklistUl = node.closest('ul.adv-checklist');
        const ol = node.closest('ol');
        const ul = node.closest('ul:not(.adv-checklist)');

        // 1. Se siamo in una Checklist attiva: disattiva e converti gli elementi selezionati in normali paragrafi nella loro posizione
        if (checklistLi || checklistUl) {
            const range = sel.getRangeAt(0);
            let itemsToConvert = [];

            if (!sel.isCollapsed && typeof Editor.getSelectedBlocks === 'function') {
                itemsToConvert = Editor.getSelectedBlocks(range).filter(b => b.classList && b.classList.contains('adv-checklist-item'));
            }
            if (itemsToConvert.length === 0) {
                if (checklistLi) itemsToConvert = [checklistLi];
                else if (checklistUl) itemsToConvert = Array.from(checklistUl.querySelectorAll('li.adv-checklist-item'));
            }

            if (itemsToConvert.length > 0) {
                let lastP = null;
                let rootUl = itemsToConvert[0].closest('ul.adv-checklist');
                while (rootUl && rootUl.parentElement && rootUl.parentElement.closest('ul.adv-checklist')) {
                    rootUl = rootUl.parentElement.closest('ul.adv-checklist');
                }

                if (rootUl && itemsToConvert.every(it => it.parentElement === rootUl)) {
                    const itemsSet = new Set(itemsToConvert);
                    const frag = document.createDocumentFragment();
                    let curChecklist = null;

                    Array.from(rootUl.children).forEach(item => {
                        if (item.tagName !== 'LI') return;
                        if (itemsSet.has(item)) {
                            if (curChecklist) { frag.appendChild(curChecklist); curChecklist = null; }
                            const spanText = Editor._getChecklistTextSpan(item);
                            const nestedUl = Editor._getChecklistNestedList(item);
                            const p = document.createElement('p');
                            const htmlClean = spanText ? spanText.innerHTML.replace(/\u200B/g, '') : '';
                            p.innerHTML = htmlClean && !Editor._isChecklistSpanEmpty(spanText) ? htmlClean : '<br>';
                            frag.appendChild(p);
                            lastP = p;
                            if (nestedUl) {
                                Array.from(nestedUl.children).forEach(sub => {
                                    if (!curChecklist) {
                                        curChecklist = document.createElement('ul');
                                        curChecklist.className = 'adv-checklist';
                                    }
                                    curChecklist.appendChild(sub);
                                });
                            }
                        } else {
                            if (!curChecklist) {
                                curChecklist = document.createElement('ul');
                                curChecklist.className = 'adv-checklist';
                            }
                            curChecklist.appendChild(item);
                        }
                    });
                    if (curChecklist) frag.appendChild(curChecklist);
                    rootUl.parentNode.replaceChild(frag, rootUl);
                } else {
                    itemsToConvert.forEach(item => {
                        while (item.parentElement && item.parentElement.parentElement && item.parentElement.parentElement.closest('li.adv-checklist-item')) {
                            Editor.outdentChecklistLine(item);
                        }
                        lastP = Editor.outdentChecklistLine(item) || lastP;
                    });
                }

                if (lastP) {
                    const r = document.createRange();
                    r.selectNodeContents(lastP);
                    r.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(r);
                    Editor.savedRange = r.cloneRange();
                }

                Store.triggerAutoSave();
            }
        } 
        // 2. Se siamo in un elenco numerato (ol): comando nativo per disattivare e tornare a paragrafo
        else if (ol) {
            document.execCommand('insertOrderedList', false, null);
            Store.triggerAutoSave();
        } 
        // 3. Se siamo in un elenco puntato (ul): comando nativo per disattivare e tornare a paragrafo
        else if (ul) {
            document.execCommand('insertUnorderedList', false, null);
            Store.triggerAutoSave();
        } 
        // 4. Se siamo su testo normale: attiva istantaneamente l'ultimo tipo di elenco utilizzato
        else {
            const lastType = Editor.lastListType || 'ul';
            if (lastType === 'checklist') Editor.insertChecklist();
            else if (lastType === 'ol-a') Editor.insertList('ol', 'A');
            else if (lastType === 'ol') Editor.insertList('ol', '1');
            else Editor.insertList('ul');
        }

        Editor.updateToolbarFormatting();
    },

    _getCurrentList: (selector = 'ol, ul:not(.adv-checklist)') => {
        let node = null;
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            node = sel.anchorNode;
        } else if (Editor.savedRange) {
            node = Editor.savedRange.startContainer;
        }
        if (!node) return null;
        if (node.nodeType === 3) node = node.parentNode;
        return node.closest(selector);
    },

    _getPreviousSameTypeList: (currentList) => {
        const editor = document.getElementById('noteContent');
        if (!editor || !currentList) return null;
        const isAlpha = (el) => el.tagName === 'OL' && (el.getAttribute('type') || '').toUpperCase() === 'A';
        const targetAlpha = isAlpha(currentList);

        const allSame = Array.from(editor.querySelectorAll('ol, ul:not(.adv-checklist)'))
            .filter(el => el.tagName === currentList.tagName && isAlpha(el) === targetAlpha);
        const currentIndex = allSame.indexOf(currentList);
        return currentIndex > 0 ? allSame[currentIndex - 1] : null;
    },

    _calculateListEndValue: (olElement) => {
        if (!olElement) return 1;
        const start = parseInt(olElement.getAttribute('start'), 10) || 1;
        const directItems = Array.from(olElement.children).filter(el => el.tagName === 'LI');
        return start + directItems.length;
    },

    setListStart: (val = null) => {
        const currentOl = Editor._getCurrentList('ol');
        if (!currentOl) return;

        let num = val;
        if (num === null) {
            const currentVal = parseInt(currentOl.getAttribute('start'), 10) || 1;
            const input = prompt(I18n.t('format_lists.prompt_start_num'), currentVal);
            if (input === null) return;
            num = parseInt(input.trim(), 10);
        }

        if (isNaN(num) || num < 0) {
            alert(I18n.t('format_lists.alert_invalid_num'));
            return;
        }

        Editor.saveSnapshot();

        if (num === 1) {
            currentOl.removeAttribute('start');
        } else {
            currentOl.setAttribute('start', num);
        }

        Store.triggerAutoSave();
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(I18n.t('format_lists.toast_num_set', { num: num }), "info");
        }
    },

    resetListStart: () => {
        const currentOl = Editor._getCurrentList('ol');
        if (!currentOl) return;

        Editor.saveSnapshot();
        currentOl.removeAttribute('start');
        Store.triggerAutoSave();
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(I18n.t('format_lists.toast_num_reset'), "info");
        }
    },

    continueFromPreviousList: () => {
        const currentOl = Editor._getCurrentList('ol');
        if (!currentOl) return;

        const prevOl = Editor._getPreviousSameTypeList(currentOl);
        if (!prevOl) {
            alert(I18n.t('format_lists.alert_no_prev_list'));
            return;
        }

        const nextStart = Editor._calculateListEndValue(prevOl);
        Editor.saveSnapshot();

        currentOl.setAttribute('start', nextStart);
        Store.triggerAutoSave();
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(I18n.t('format_lists.toast_num_resumed', { nextStart: nextStart }), "success");
        }
    },

    mergeWithPreviousList: () => {
        const currentList = Editor._getCurrentList();
        if (!currentList) return;

        const prevList = Editor._getPreviousSameTypeList(currentList);
        if (!prevList) {
            alert(I18n.t('format_lists.alert_no_prev_merge'));
            return;
        }

        Editor.saveSnapshot();

        // Rimuove eventuali paragrafi vuoti o interruzioni tra i due elenchi
        let nodeBetween = prevList.nextSibling;
        while (nodeBetween && nodeBetween !== currentList) {
            let next = nodeBetween.nextSibling;
            if (nodeBetween.nodeType === 3 && nodeBetween.textContent.trim() === '') {
                nodeBetween.remove();
            } else if (nodeBetween.nodeType === 1 && (nodeBetween.tagName === 'P' || nodeBetween.tagName === 'DIV')) {
                const text = nodeBetween.textContent.replace(/[\u200B\n\r]/g, '').trim();
                if (text === '') nodeBetween.remove();
            }
            nodeBetween = next;
        }

        // Travasa tutti i punti dell'elenco corrente in coda a quello precedente
        const firstTransferredLi = currentList.querySelector('li');
        while (currentList.firstChild) {
            prevList.appendChild(currentList.firstChild);
        }
        currentList.remove();

        // Riposiziona il cursore sull'elemento trasferito
        if (firstTransferredLi) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(firstTransferredLi);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }

        Store.triggerAutoSave();
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(I18n.t('format_lists.toast_merged_success'), "success");
        }
    },

    openListMenu: (e, anchorId) => {
        if (e) e.stopPropagation();
        Editor.saveSelection();

        const currentList = Editor._getCurrentList();
        const prevSameList = currentList ? Editor._getPreviousSameTypeList(currentList) : null;
        const isOrdered = !!(currentList && currentList.tagName === 'OL');
        const nextStartVal = (isOrdered && prevSameList) ? Editor._calculateListEndValue(prevSameList) : null;
        const currentStart = isOrdered ? (parseInt(currentList.getAttribute('start'), 10) || 1) : 1;

        const executeInsert = (cmd, arg) => {
            Editor.restoreSelection();
            Editor.insertList(cmd, arg);
        };

        const items = [
            { icon: '<span style="display:inline-block; width:20px; text-align:center; font-weight:bold;">•</span>', label: I18n.t('format_lists.bullet_list'), shortcut: '- ', onClick: () => executeInsert('ul') },
            { icon: '<span style="display:inline-block; width:20px; text-align:center; font-weight:bold;">1.</span>', label: I18n.t('format_lists.numbered_list'), shortcut: '1. ', onClick: () => executeInsert('ol', '1') },
            { icon: '<span style="display:inline-block; width:20px; text-align:center; font-weight:bold;">A.</span>', label: I18n.t('format_lists.alpha_list'), shortcut: 'a. ', onClick: () => executeInsert('ol', 'A') },
            { type: 'divider' },
            { icon: Icons.checkSquare, label: I18n.t('format_lists.todo_list'), shortcut: '[] ', onClick: () => { Editor.restoreSelection(); Editor.insertChecklist(); } },
            { icon: Icons.journal, label: I18n.t('format_lists.journal_log'), onClick: () => JournalManager.insert(true) }
        ];

        // Selezionatore contestuale dedicato agli elenchi numerati e letterali
        if (isOrdered) {
            items.push({ type: 'divider' });
            items.push({ type: 'custom', html: `<div class="adv-dropdown-title" style="margin-bottom: 2px;">${I18n.t('format_lists.num_management')}</div>` });

            if (prevSameList) {
                items.push({
                    icon: Icons.play,
                    label: I18n.t('format_lists.continue_from_prev', { nextStartVal: nextStartVal }),
                    onClick: () => Editor.continueFromPreviousList()
                });
                items.push({
                    icon: Icons.merge,
                    label: I18n.t('format_lists.merge_with_prev'),
                    onClick: () => Editor.mergeWithPreviousList()
                });
            }

            items.push({
                icon: Icons.number,
                label: I18n.t('format_lists.set_start_num', { currentStart: currentStart }),
                onClick: () => Editor.setListStart()
            });

            if (currentStart !== 1) {
                items.push({
                    icon: Icons.restore,
                    label: I18n.t('format_lists.restart_at_one'),
                    onClick: () => Editor.resetListStart()
                });
            }
        } else if (currentList && prevSameList) {
            items.push({ type: 'divider' });
            items.push({
                icon: Icons.merge,
                label: I18n.t('format_lists.merge_with_prev'),
                onClick: () => Editor.mergeWithPreviousList()
            });
        }

        UI.Menu.buildContextMenu(anchorId, items);
    },

    insertList: (type, style = null) => {
        const selection = window.getSelection();
        const editor = document.getElementById('noteContent');
        if (!selection || !selection.rangeCount || !editor || !editor.contains(selection.anchorNode)) {
            Editor.restoreSelection();
        } else {
            Editor.savedRange = selection.getRangeAt(0).cloneRange();
        }

        Editor.saveSnapshot();
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        if (style === 'A') Editor.lastListType = 'ol-a';
        else if (type === 'ol') Editor.lastListType = 'ol';
        else Editor.lastListType = 'ul';

        const range = sel.getRangeAt(0);
        let node = range.commonAncestorContainer;
        if (node.nodeType === 3) node = node.parentNode;

        // =========================================================================
        // RICONVERSIONE DA CHECKLIST (adv-checklist) A ELENCO STANDARD (UL / OL)
        // =========================================================================
        const checklistUl = node.closest('ul.adv-checklist');
        const checklistLi = node.closest('li.adv-checklist-item');

        if (checklistUl || checklistLi) {
            let itemsToConvert = [];

            if (!sel.isCollapsed && typeof Editor.getSelectedBlocks === 'function') {
                itemsToConvert = Editor.getSelectedBlocks(range).filter(b => b.classList && b.classList.contains('adv-checklist-item'));
            }
            if (itemsToConvert.length === 0) {
                if (checklistLi) itemsToConvert = [checklistLi];
                else if (checklistUl) itemsToConvert = Array.from(checklistUl.querySelectorAll('li.adv-checklist-item'));
            }

            if (itemsToConvert.length > 0) {
                const targetUl = itemsToConvert[0].closest('ul.adv-checklist') || checklistUl;
                const itemsSet = new Set(itemsToConvert);
                const frag = document.createDocumentFragment();
                let curCheckUl = null;
                let curStdList = null;
                let firstNewLi = null;

                Array.from(targetUl.children).forEach(item => {
                    if (item.tagName !== 'LI') return;
                    if (itemsSet.has(item)) {
                        if (curCheckUl) { frag.appendChild(curCheckUl); curCheckUl = null; }
                        if (!curStdList) {
                            curStdList = document.createElement(type);
                            if (style && type === 'ol') curStdList.setAttribute('type', style);
                        }
                        const spanText = Editor._getChecklistTextSpan(item);
                        const cleanHtml = spanText ? spanText.innerHTML.replace(/\u200B/g, '').trim() : '';
                        const newLi = document.createElement('li');
                        newLi.innerHTML = cleanHtml || '<br>';
                        curStdList.appendChild(newLi);
                        if (!firstNewLi) firstNewLi = newLi;
                    } else {
                        if (curStdList) { frag.appendChild(curStdList); curStdList = null; }
                        if (!curCheckUl) {
                            curCheckUl = document.createElement('ul');
                            curCheckUl.className = 'adv-checklist';
                        }
                        curCheckUl.appendChild(item);
                    }
                });
                if (curCheckUl) frag.appendChild(curCheckUl);
                if (curStdList) frag.appendChild(curStdList);

                targetUl.parentNode.replaceChild(frag, targetUl);

                if (firstNewLi) {
                    const newRange = document.createRange();
                    newRange.selectNodeContents(firstNewLi);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }

                Store.triggerAutoSave();
                Editor.updateToolbarFormatting();
                return;
            }
        }

        let block = node.closest('p, div');

        // INSERIMENTO ATOMICO SU BLOCCO VUOTO (Sia da Toolbar che da scorciatoia)
        const isEmptyBlock = block && block.id !== 'noteContent' &&
                             block.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim() === '' &&
                             !block.querySelector('img, audio, iframe, table, .adv-widget-shell');

        if (isEmptyBlock && block.parentNode) {
            const list = document.createElement(type);
            if (style && type === 'ol') list.setAttribute('type', style);
            
            const li = document.createElement('li');
            li.innerHTML = '<br>';
            list.appendChild(li);
            
            block.parentNode.replaceChild(list, block);
            
            const newRange = document.createRange();
            newRange.setStart(li, 0);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            
            Store.triggerAutoSave();
            Editor.updateToolbarFormatting();
            return;
        }

        // CONVERSIONE TESTO ESISTENTE
        if (type === 'ul') {
            document.execCommand('insertUnorderedList');
        } else if (type === 'ol') {
            document.execCommand('insertOrderedList');
            if (style) {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const sNode = selection.anchorNode;
                    const ol = sNode.nodeType === 1 ? sNode.closest('ol') : sNode.parentNode.closest('ol');
                    if (ol) ol.setAttribute('type', style);
                }
            }
        }
        
        // Srotola le liste dal tag P in cui il browser (es. Chrome) le avvolge erroneamente
        if (editor) {
            const malformedLists = editor.querySelectorAll('p > ul, p > ol');
            malformedLists.forEach(list => {
                const pNode = list.parentNode;
                const parent = pNode.parentNode;
                parent.insertBefore(list, pNode);
                if (pNode.textContent.trim() === '' && pNode.children.length === 0) {
                    pNode.remove();
                }
            });
        }
        
        Store.triggerAutoSave();
        Editor.updateToolbarFormatting();
    },

    // Helper per costruire un singolo elemento di checklist con struttura nativa
    _createChecklistItem: (contentHtml = '', isChecked = false) => {
        const li = document.createElement('li');
        li.className = 'adv-checklist-item';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'adv-checklist-cb';
        cb.setAttribute('contenteditable', 'false'); // Protezione atomica confini checkbox
        if (isChecked) cb.checked = true;

        const span = document.createElement('span');
        span.className = 'checklist-text';
        span.contentEditable = 'true';

        let inner = contentHtml ? contentHtml.trim() : '';
        // Normalizza eventuali tag P o DIV residui interni allo span
        inner = inner.replace(/^<p[^>]*>/i, '').replace(/<\/p>$/i, '');

        // Se il testo è vuoto o solo <br> o ZWS, garantisce il cuscinetto per il cursore
        const cleanText = inner.replace(/[\u200B\uFEFF]/g, '').replace(/<br\s*[\/]?>/gi, '').trim();
        if (!cleanText && !/<(img|audio|iframe|svg)\b/i.test(inner)) {
            span.appendChild(document.createTextNode('\u200B'));
        } else {
            span.innerHTML = inner;
        }

        li.appendChild(cb);
        li.appendChild(span);
        return li;
    },

    insertChecklist: () => {
        const selection = window.getSelection();
        const editor = document.getElementById('noteContent');
        if (!selection || !selection.rangeCount || !editor || !editor.contains(selection.anchorNode)) {
            Editor.restoreSelection();
        } else {
            Editor.savedRange = selection.getRangeAt(0).cloneRange();
        }

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        let node = range.commonAncestorContainer;
        if (node.nodeType === 3) node = node.parentNode;

        // Se siamo già all'interno di una checklist attiva, disattivala convertendo in paragrafi (coerente con ul/ol)
        if (node.closest('ul.adv-checklist, li.adv-checklist-item')) {
            Editor.toggleActiveList();
            return;
        }

        Editor.saveSnapshot();
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);

        Editor.lastListType = 'checklist';

        // =========================================================================
        // SCENARIO 1: SELEZIONE ESTESA (Conversione multi-riga / multi-blocco)
        // =========================================================================
        if (!sel.isCollapsed && typeof Editor.getSelectedBlocks === 'function') {
            let blocks = Editor.getSelectedBlocks(range);

            // Filtra solo i blocchi convertibili escludendo widget complessi protetti
            blocks = blocks.filter(b => {
                if (typeof WidgetManager !== 'undefined' && WidgetManager.isProtectedBlock(b)) {
                    return false;
                }
                return ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'].includes(b.tagName);
            });

            if (blocks.length > 0) {
                const firstBlock = blocks[0];
                const checklistUl = document.createElement('ul');
                checklistUl.className = 'adv-checklist';

                if (firstBlock.tagName === 'LI') {
                    const parentList = firstBlock.closest('ul, ol');
                    if (parentList) {
                        parentList.parentNode.insertBefore(checklistUl, parentList);
                    } else {
                        firstBlock.parentNode.insertBefore(checklistUl, firstBlock);
                    }
                } else {
                    firstBlock.parentNode.insertBefore(checklistUl, firstBlock);
                }

                const parentsToCheck = new Set();
                let firstChecklistSpan = null;

                blocks.forEach(b => {
                    let contentHtml = '';
                    if (b.tagName === 'LI') {
                        const clone = b.cloneNode(true);
                        clone.querySelectorAll('ul, ol').forEach(nested => nested.remove());
                        contentHtml = clone.innerHTML;
                    } else {
                        contentHtml = b.innerHTML;
                    }

                    const checkLi = Editor._createChecklistItem(contentHtml, false);
                    checklistUl.appendChild(checkLi);

                    if (!firstChecklistSpan) {
                        firstChecklistSpan = Editor._getChecklistTextSpan(checkLi);
                    }

                    if (b.parentNode) {
                        parentsToCheck.add(b.parentNode);
                        b.remove();
                    }
                });

                parentsToCheck.forEach(parentEl => {
                    if (parentEl && parentEl.children && parentEl.children.length === 0 && ['UL', 'OL', 'BLOCKQUOTE'].includes(parentEl.tagName)) {
                        parentEl.remove();
                    }
                });

                if (firstChecklistSpan) {
                    Editor._placeCaretInChecklistSpan(firstChecklistSpan, false);
                }

                Store.triggerAutoSave();
                Editor.updateToolbarFormatting();
                return;
            }
        }

        // =========================================================================
        // SCENARIO 2: CURSORE COLLASSATO (Singolo blocco / Nuova riga)
        // =========================================================================
        let currentBlock = node.closest('p, div, li, h1, h2, h3, h4, h5, h6');

        // Se siamo su un elemento LI di un elenco standard (ul/ol), spezza la lista nella posizione corrente
        if (currentBlock && currentBlock.tagName === 'LI') {
            const parentList = currentBlock.parentElement;
            const clone = currentBlock.cloneNode(true);
            clone.querySelectorAll('ul, ol').forEach(nested => nested.remove());

            const checklistUl = document.createElement('ul');
            checklistUl.className = 'adv-checklist';
            const checkLi = Editor._createChecklistItem(clone.innerHTML, false);
            checklistUl.appendChild(checkLi);

            if (parentList && (parentList.tagName === 'UL' || parentList.tagName === 'OL')) {
                const nextLis = [];
                let sib = currentBlock.nextElementSibling;
                while (sib) {
                    if (sib.tagName === 'LI') nextLis.push(sib);
                    sib = sib.nextElementSibling;
                }
                currentBlock.remove();

                if (parentList.children.length === 0) {
                    parentList.parentNode.replaceChild(checklistUl, parentList);
                } else {
                    parentList.parentNode.insertBefore(checklistUl, parentList.nextSibling);
                }

                if (nextLis.length > 0) {
                    const afterList = document.createElement(parentList.tagName);
                    if (parentList.tagName === 'OL' && parentList.getAttribute('type')) {
                        afterList.setAttribute('type', parentList.getAttribute('type'));
                    }
                    nextLis.forEach(nli => afterList.appendChild(nli));
                    checklistUl.parentNode.insertBefore(afterList, checklistUl.nextSibling);
                }
            } else {
                currentBlock.parentNode.replaceChild(checklistUl, currentBlock);
            }

            Editor._placeCaretInChecklistSpan(Editor._getChecklistTextSpan(checkLi), true);
            Store.triggerAutoSave();
            Editor.updateToolbarFormatting();
            return;
        }

        // Se siamo su un paragrafo normale con del testo già presente
        if (currentBlock && currentBlock.id !== 'noteContent' && currentBlock.textContent.replace(/[\u200B\uFEFF\n\r]/g, '').trim() !== '') {
            const contentHtml = currentBlock.innerHTML;
            const checklistUl = document.createElement('ul');
            checklistUl.className = 'adv-checklist';
            const checkLi = Editor._createChecklistItem(contentHtml);
            checklistUl.appendChild(checkLi);

            currentBlock.parentNode.replaceChild(checklistUl, currentBlock);

            Editor._placeCaretInChecklistSpan(Editor._getChecklistTextSpan(checkLi), true);
            Store.triggerAutoSave();
            Editor.updateToolbarFormatting();
            return;
        }

        // Se siamo su un blocco vuoto (creazione standard di nuova to-do list)
        const ul = document.createElement('ul');
        ul.className = 'adv-checklist';
        const li = Editor._createChecklistItem('');
        ul.appendChild(li);

        if (currentBlock && currentBlock.id !== 'noteContent') {
            currentBlock.parentNode.replaceChild(ul, currentBlock);
        } else {
            range.deleteContents();
            range.insertNode(ul);
        }

        Editor._placeCaretInChecklistSpan(Editor._getChecklistTextSpan(li), false);
        Store.triggerAutoSave();
        Editor.updateToolbarFormatting();
    },

    indentChecklistLine: (liNode) => {
        const prevLi = liNode ? liNode.previousElementSibling : null;
        if (!prevLi) return; 
        let nestedUl = Editor._getChecklistNestedList(prevLi);
        if (!nestedUl) {
            nestedUl = document.createElement('ul');
            nestedUl.className = 'adv-checklist';
            nestedUl.style.listStyle = 'none'; nestedUl.style.paddingLeft = '20px'; nestedUl.style.margin = '5px 0'; nestedUl.style.width = '100%';
            prevLi.style.flexWrap = 'wrap'; prevLi.appendChild(nestedUl);
        }
        nestedUl.appendChild(liNode);
    },

    outdentChecklistLine: (liNode) => {
        const parentUl = liNode ? liNode.parentNode : null;
        if (!parentUl || !parentUl.classList || !parentUl.classList.contains('adv-checklist')) return null;

        const grandParentLi = parentUl.parentNode ? parentUl.parentNode.closest('li.adv-checklist-item') : null;
        if (grandParentLi) {
            // Sposta eventuali fratelli successivi in una sotto-lista di liNode per preservare l'ordine visivo
            const nextSiblings = [];
            let sib = liNode.nextElementSibling;
            while (sib) {
                nextSiblings.push(sib);
                sib = sib.nextElementSibling;
            }

            grandParentLi.parentNode.insertBefore(liNode, grandParentLi.nextSibling);

            if (nextSiblings.length > 0) {
                let ownNested = Editor._getChecklistNestedList(liNode);
                if (!ownNested) {
                    ownNested = document.createElement('ul');
                    ownNested.className = 'adv-checklist';
                    ownNested.style.listStyle = 'none';
                    ownNested.style.paddingLeft = '20px';
                    ownNested.style.margin = '5px 0';
                    ownNested.style.width = '100%';
                    liNode.style.flexWrap = 'wrap';
                    liNode.appendChild(ownNested);
                }
                nextSiblings.forEach(s => ownNested.appendChild(s));
            }

            if (parentUl.children.length === 0) parentUl.remove();
            return liNode;
        }

        // Livello radice: trasforma la voce in paragrafo <p> spezzando la checklist nel punto corrente
        const nextSiblings = [];
        let sib = liNode.nextElementSibling;
        while (sib) {
            nextSiblings.push(sib);
            sib = sib.nextElementSibling;
        }

        const spanText = Editor._getChecklistTextSpan(liNode);
        const nestedUl = Editor._getChecklistNestedList(liNode);

        const p = document.createElement('p');
        if (spanText) {
            while (spanText.firstChild) p.appendChild(spanText.firstChild);
        }
        const cleanPText = (p.textContent || '').replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
        if (!cleanPText && !p.querySelector('img, audio, iframe, svg, .adv-inline-shell')) {
            if (!p.querySelector('[id^="tab-start-"], [id^="tab-end-"]')) p.innerHTML = '<br>';
            else p.appendChild(document.createElement('br'));
        }

        liNode.remove();

        const parentContainer = parentUl.parentNode;
        const insertRef = parentUl.nextSibling;

        if (parentUl.children.length === 0) {
            parentContainer.replaceChild(p, parentUl);
        } else {
            parentContainer.insertBefore(p, insertRef);
        }

        if ((nestedUl && nestedUl.children.length > 0) || nextSiblings.length > 0) {
            const afterUl = document.createElement('ul');
            afterUl.className = 'adv-checklist';
            if (nestedUl) {
                while (nestedUl.firstChild) afterUl.appendChild(nestedUl.firstChild);
            }
            nextSiblings.forEach(s => afterUl.appendChild(s));
            if (afterUl.children.length > 0) {
                parentContainer.insertBefore(afterUl, p.nextSibling);
            }
        }

        return p;
    },

    outdentStandardListItem: (liNode) => {
        const sel = window.getSelection();
        const rng = document.createRange();
        rng.selectNodeContents(liNode);
        sel.removeAllRanges();
        sel.addRange(rng);
        
        document.execCommand('outdent', false, null);
    }
});

// BINDING DI SICUREZZA: Assegna programmaticamente l'evento al pulsante principale all'avvio
document.addEventListener('DOMContentLoaded', () => {
    const btnList = document.getElementById('btnListMenu');
    if (btnList) {
        btnList.onclick = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            Editor.toggleActiveList(e);
        };
    }
});