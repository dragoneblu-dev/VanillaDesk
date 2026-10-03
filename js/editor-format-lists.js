/**
 * editor-format-lists.js
 * Sottomodulo di Editor.
 * Gestione strutturale delle Liste e delle Checklist (Indent/Outdent).
 * Gestione avanzata degli Elenchi Numerati: valore di partenza (start),
 * continuazione della numerazione e unione fisica tra elenchi separati.
 * FEAT STATEFUL SPLIT-BUTTON: Memorizzazione ultimo tipo elenco e toggle attivo con un click (toggleActiveList).
 * BINDING DI SICUREZZA: Assegnazione esplicita e certa dell'handler onclick al pulsante btnListMenu all'avvio.
 */

Object.assign(Editor, {
    lastListType: 'ul',

    toggleActiveList: (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        Editor.saveSnapshot();
        Editor.restoreSelection();

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        let node = sel.anchorNode;
        if (node && node.nodeType === 3) node = node.parentNode;
        if (!node) return;

        const checklistLi = node.closest('li.adv-checklist-item');
        const ol = node.closest('ol');
        const ul = node.closest('ul:not(.adv-checklist)');

        // 1. Se siamo in una Checklist attiva: disattiva e converti la riga in normale paragrafo
        if (checklistLi) {
            const checklistUl = checklistLi.closest('ul.adv-checklist');
            const spanText = checklistLi.querySelector('.checklist-text');
            const textHtml = spanText ? spanText.innerHTML : '<br>';
            const p = document.createElement('p');
            p.innerHTML = textHtml || '<br>';

            if (checklistUl) {
                checklistUl.parentNode.insertBefore(p, checklistUl.nextSibling);
                checklistLi.remove();
                if (checklistUl.children.length === 0) checklistUl.remove();
            }

            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            Store.triggerAutoSave();
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

    _getCurrentOrderedList: () => {
        let node = null;
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            node = sel.anchorNode;
        } else if (Editor.savedRange) {
            node = Editor.savedRange.startContainer;
        }
        if (!node) return null;
        if (node.nodeType === 3) node = node.parentNode;
        return node.closest('ol');
    },

    _getPreviousOrderedList: (currentOl) => {
        const editor = document.getElementById('noteContent');
        if (!editor || !currentOl) return null;
        const allOls = Array.from(editor.querySelectorAll('ol'));
        const currentIndex = allOls.indexOf(currentOl);
        if (currentIndex > 0) {
            return allOls[currentIndex - 1];
        }
        return null;
    },

    _calculateListEndValue: (olElement) => {
        if (!olElement) return 1;
        const start = parseInt(olElement.getAttribute('start'), 10) || 1;
        const directItems = Array.from(olElement.children).filter(el => el.tagName === 'LI');
        return start + directItems.length;
    },

    setListStart: (val = null) => {
        const currentOl = Editor._getCurrentOrderedList();
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
        const currentOl = Editor._getCurrentOrderedList();
        if (!currentOl) return;

        Editor.saveSnapshot();
        currentOl.removeAttribute('start');
        Store.triggerAutoSave();
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(I18n.t('format_lists.toast_num_reset'), "info");
        }
    },

    continueFromPreviousList: () => {
        const currentOl = Editor._getCurrentOrderedList();
        if (!currentOl) return;

        const prevOl = Editor._getPreviousOrderedList(currentOl);
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
        const currentOl = Editor._getCurrentOrderedList();
        if (!currentOl) return;

        const prevOl = Editor._getPreviousOrderedList(currentOl);
        if (!prevOl) {
            alert(I18n.t('format_lists.alert_no_prev_merge'));
            return;
        }

        Editor.saveSnapshot();

        // Rimuove eventuali paragrafi vuoti o interruzioni tra i due elenchi
        let nodeBetween = prevOl.nextSibling;
        while (nodeBetween && nodeBetween !== currentOl) {
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
        const firstTransferredLi = currentOl.querySelector('li');
        while (currentOl.firstChild) {
            prevOl.appendChild(currentOl.firstChild);
        }
        currentOl.remove();

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

        const currentOl = Editor._getCurrentOrderedList();
        const prevOl = currentOl ? Editor._getPreviousOrderedList(currentOl) : null;
        const nextStartVal = prevOl ? Editor._calculateListEndValue(prevOl) : null;
        const currentStart = currentOl ? (parseInt(currentOl.getAttribute('start'), 10) || 1) : 1;

        const executeInsert = (cmd, arg) => {
            Editor.restoreSelection();
            Editor.insertList(cmd, arg);
        };

        const items = [
            { icon: '<span style="display:inline-block; width:20px; text-align:center; font-weight:bold;">•</span>', label: I18n.t('format_lists.bullet_list'), shortcut: '- ', onClick: () => executeInsert('ul') },
            { icon: '<span style="display:inline-block; width:20px; text-align:center; font-weight:bold;">1.</span>', label: I18n.t('format_lists.numbered_list'), shortcut: '1. ', onClick: () => executeInsert('ol', '1') },
            { icon: '<span style="display:inline-block; width:20px; text-align:center; font-weight:bold;">A.</span>', label: I18n.t('format_lists.alpha_list'), onClick: () => executeInsert('ol', 'A') },
            { type: 'divider' },
            { icon: Icons.checkSquare, label: I18n.t('format_lists.todo_list'), shortcut: '[] ', onClick: () => { Editor.restoreSelection(); Editor.insertChecklist(); } },
            { icon: Icons.journal, label: I18n.t('format_lists.journal_log'), onClick: () => JournalManager.insert(true) }
        ];

        // Selezionatore contestuale dedicato agli elenchi numerati
        if (currentOl) {
            items.push({ type: 'divider' });
            items.push({ type: 'custom', html: `<div class="adv-dropdown-title" style="margin-bottom: 2px;">${I18n.t('format_lists.num_management')}</div>` });

            if (prevOl) {
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
        }

        UI.Menu.buildContextMenu(anchorId, items);
    },

    insertList: (type, style = null) => {
        Editor.restoreSelection();
        Editor.saveSnapshot();
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        if (style === 'A') Editor.lastListType = 'ol-a';
        else if (type === 'ol') Editor.lastListType = 'ol';
        else Editor.lastListType = 'ul';

        let node = sel.anchorNode;
        if (node.nodeType === 3) node = node.parentNode;
        let block = node.closest('p, div');

        if (block && block.nextElementSibling && WidgetManager.isProtectedBlock(block.nextElementSibling) && block.innerText.replace(/\u200B/g, '').trim() === '') {
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

        if (type === 'ul') {
            document.execCommand('insertUnorderedList');
        } else if (type === 'ol') {
            document.execCommand('insertOrderedList');
            if (style) {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const node = selection.anchorNode;
                    const ol = node.nodeType === 1 ? node.closest('ol') : node.parentNode.closest('ol');
                    if (ol) ol.setAttribute('type', style);
                }
            }
        }
        
        // Srotola le liste dal tag P in cui il browser (es. Chrome) le avvolge erroneamente
        const editor = document.getElementById('noteContent');
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

    insertChecklist: () => {
        Editor.saveSnapshot();
        Editor.restoreSelection();
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        Editor.lastListType = 'checklist';

        const ul = document.createElement('ul');
        ul.className = 'adv-checklist';
        
        const li = document.createElement('li');
        li.className = 'adv-checklist-item';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'adv-checklist-cb';

        const span = document.createElement('span');
        span.className = 'checklist-text';
        span.contentEditable = 'true';
        span.appendChild(document.createTextNode('\u200B'));

        li.appendChild(cb);
        li.appendChild(span);
        ul.appendChild(li);

        let node = sel.getRangeAt(0).commonAncestorContainer;
        if (node.nodeType === 3) node = node.parentNode;
        
        const parentLi = node.closest('li');
        
        if (parentLi) {
            parentLi.appendChild(ul);
        } else {
            const block = node.closest('p, div');
            if (block && block.innerText.trim() === '') {
                block.parentNode.replaceChild(ul, block);
            } else {
                if (sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(ul);
                } else {
                    document.getElementById('noteContent').appendChild(ul);
                }
            }
        }

        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        newRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(newRange);

        Editor.updateToolbarFormatting();
    },

    indentChecklistLine: (liNode) => {
        const prevLi = liNode.previousElementSibling;
        if (!prevLi) return; 
        let nestedUl = prevLi.querySelector('ul.adv-checklist');
        if (!nestedUl) {
            nestedUl = document.createElement('ul');
            nestedUl.className = 'adv-checklist';
            nestedUl.style.listStyle = 'none'; nestedUl.style.paddingLeft = '20px'; nestedUl.style.margin = '5px 0'; nestedUl.style.width = '100%';
            prevLi.style.flexWrap = 'wrap'; prevLi.appendChild(nestedUl);
        }
        nestedUl.appendChild(liNode);
    },

    outdentChecklistLine: (liNode) => {
        const parentUl = liNode.parentNode;
        if (!parentUl || !parentUl.classList.contains('adv-checklist')) return;
        const grandParentLi = parentUl.closest('li');
        if (!grandParentLi) return; 
        grandParentLi.parentNode.insertBefore(liNode, grandParentLi.nextSibling);
        if (parentUl.children.length === 0) parentUl.remove();
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