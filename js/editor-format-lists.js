/**
 * editor-format-lists.js
 * Sottomodulo di Editor.
 * Gestione strutturale delle Liste e delle Checklist (Indent/Outdent).
 * Gestione avanzata degli Elenchi Numerati: valore di partenza (start),
 * continuazione della numerazione e unione fisica tra elenchi separati.
 */

Object.assign(Editor, {

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
            const input = prompt("Imposta il numero iniziale per questo elenco numerato:", currentVal);
            if (input === null) return;
            num = parseInt(input.trim(), 10);
        }

        if (isNaN(num) || num < 0) {
            alert("Inserisci un numero intero positivo valido (minimo 0).");
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
            UI.showToast(`Numerazione impostata da ${num}.`, "info");
        }
    },

    resetListStart: () => {
        const currentOl = Editor._getCurrentOrderedList();
        if (!currentOl) return;

        Editor.saveSnapshot();
        currentOl.removeAttribute('start');
        Store.triggerAutoSave();
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast("Numerazione reimpostata da 1.", "info");
        }
    },

    continueFromPreviousList: () => {
        const currentOl = Editor._getCurrentOrderedList();
        if (!currentOl) return;

        const prevOl = Editor._getPreviousOrderedList(currentOl);
        if (!prevOl) {
            alert("Nessun elenco numerato precedente trovato in questa nota.");
            return;
        }

        const nextStart = Editor._calculateListEndValue(prevOl);
        Editor.saveSnapshot();

        currentOl.setAttribute('start', nextStart);
        Store.triggerAutoSave();
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(`Numerazione ripresa dal numero ${nextStart}.`, "success");
        }
    },

    mergeWithPreviousList: () => {
        const currentOl = Editor._getCurrentOrderedList();
        if (!currentOl) return;

        const prevOl = Editor._getPreviousOrderedList(currentOl);
        if (!prevOl) {
            alert("Nessun elenco numerato precedente trovato a cui unire questo blocco.");
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
            UI.showToast("Elenchi numerati uniti con successo.", "success");
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
            { icon: '<span style="display:inline-block; width:20px; text-align:center; font-weight:bold;">•</span>', label: 'Elenco Puntato', shortcut: '- ', onClick: () => executeInsert('ul') },
            { icon: '<span style="display:inline-block; width:20px; text-align:center; font-weight:bold;">1.</span>', label: 'Elenco Numerato', shortcut: '1. ', onClick: () => executeInsert('ol', '1') },
            { icon: '<span style="display:inline-block; width:20px; text-align:center; font-weight:bold;">A.</span>', label: 'Elenco Lettere', onClick: () => executeInsert('ol', 'A') },
            { type: 'divider' },
            { icon: Icons.checkSquare, label: 'To-Do List', shortcut: '[] ', onClick: () => { Editor.restoreSelection(); Editor.insertChecklist(); } },
            { icon: Icons.journal, label: 'Diario / Log Date', onClick: () => JournalManager.insert(true) }
        ];

        // Selezionatore contestuale dedicato agli elenchi numerati
        if (currentOl) {
            items.push({ type: 'divider' });
            items.push({ type: 'custom', html: '<div class="adv-dropdown-title" style="margin-bottom: 2px;">Gestione Numerazione</div>' });

            if (prevOl) {
                items.push({
                    icon: Icons.play,
                    label: `Continua da elenco precedente (da ${nextStartVal})`,
                    onClick: () => Editor.continueFromPreviousList()
                });
                items.push({
                    icon: Icons.merge,
                    label: 'Unisci all\'elenco precedente',
                    onClick: () => Editor.mergeWithPreviousList()
                });
            }

            items.push({
                icon: Icons.number,
                label: `Imposta numero iniziale... (Attuale: ${currentStart})`,
                onClick: () => Editor.setListStart()
            });

            if (currentStart !== 1) {
                items.push({
                    icon: Icons.restore,
                    label: 'Ricomincia da 1',
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
    },

    insertChecklist: () => {
        Editor.saveSnapshot();
        Editor.restoreSelection();
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

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