/**
 * ColorManager.js
 * Gestisce l'applicazione dei colori (Testo ed Evidenziatore) tramite Menu Standardizzato.
 * Algoritmo di Appiattimento Nativo (Evita annidamenti di span).
 * Usa buildContextMenu per i color picker.
 * Calcola il background/color corrente della selezione e li incrocia nei riquadri del menù.
 * Lo scraper analizza tutti i nodi (*) proteggendo però i Widget tramite Firewall.
 * Risalita DOM per identificare il vero colore di sfondo tra span nidificati.
 * Il tasto principale agisce come interruttore (ON/OFF) se il colore selezionato è già attivo.
 * Quando sono selezionate più celle di una tabella semplice (TableManager.Selection),
 * l'applicazione del colore testo ed evidenziatore agisce direttamente e simultaneamente su tutte le celle,
 * con salvataggio atomico della cronologia di Undo (Ctrl+Z) e Redo (Ctrl+Y).
 * Memorizzazione persistente in localStorage degli ultimi colori usati (pronotes_last_hl, pronotes_last_tx).
 * Preserva la selezione attiva del browser senza collassarla all'invocazione da tastiera.
 * Supporto alle sottolineature colorate (hl-u-c1..hl-u-c10) all'interno del menù evidenziatore.
 * Anteprima fedele a sfondo neutro per i campioni di sottolineatura onde evitare false aspettative visive.
 * Selezione automatica dell'intera parola sotto cursore se non vi è selezione manuale attiva (Word-Snap)
 * con collasso del cursore dentro l'ultimo nodo testo della parola per consentire il toggle immediato.
 * Isolamento dei canali colore prima di execCommand quando uno span condivide più classi (es. tx-* + hl-*),
 * consentendo al browser di tagliare e rimuovere i colori anche su selezioni parziali e sugli spazi.
 * Riconversione garantita dei colori magici temporanei (rgb 252,5,5) in classi CSS tramite try-finally.
 * Gestione intelligente del cursore su spazi o in uscita da span formattati, con supporto completo
 * per la colorazione e rimozione su selezioni che includono o consistono di soli spazi e su righe vuote dopo Invio.
 * Se l'utente seleziona solo una porzione di testo dentro una cella di tabella semplice,
 * la formattazione viene applicata esclusivamente alla porzione selezionata preservando lo sfondo della cella.
 * Srotolamento ricorsivo di qualsiasi span rimasto privo di classi (anche con attributi vuoti come class="").
 */

const ColorManager = {
    defaults: { highlight: 'hl-c5', text: 'tx-c6' },
    lastHighlight: 'hl-c5',
    lastText: 'tx-c6',

    // Colori finti usati per costringere il browser a "tagliare" i nodi sovrapposti
    magicHl: {
        'hl-c1': {rgb: 'rgb(251, 1, 1)', hex: '#fb0101'}, 'hl-c2': {rgb: 'rgb(251, 2, 2)', hex: '#fb0202'},
        'hl-c3': {rgb: 'rgb(251, 3, 3)', hex: '#fb0303'}, 'hl-c4': {rgb: 'rgb(251, 4, 4)', hex: '#fb0404'},
        'hl-c5': {rgb: 'rgb(251, 5, 5)', hex: '#fb0505'}, 'hl-c6': {rgb: 'rgb(251, 6, 6)', hex: '#fb0606'},
        'hl-c7': {rgb: 'rgb(251, 7, 7)', hex: '#fb0707'}, 'hl-c8': {rgb: 'rgb(251, 8, 8)', hex: '#fb0808'},
        'hl-c9': {rgb: 'rgb(251, 9, 9)', hex: '#fb0909'}, 'hl-c10':{rgb: 'rgb(251, 10, 10)', hex: '#fb0a0a'},
        // Mappatura per Sottolineatura Colorata (hl-u-c1 .. hl-u-c10)
        'hl-u-c1': {rgb: 'rgb(251, 11, 11)', hex: '#fb0b0b'}, 'hl-u-c2': {rgb: 'rgb(251, 12, 12)', hex: '#fb0c0c'},
        'hl-u-c3': {rgb: 'rgb(251, 13, 13)', hex: '#fb0d0d'}, 'hl-u-c4': {rgb: 'rgb(251, 14, 14)', hex: '#fb0e0e'},
        'hl-u-c5': {rgb: 'rgb(251, 15, 15)', hex: '#fb0f0f'}, 'hl-u-c6': {rgb: 'rgb(251, 16, 16)', hex: '#fb1010'},
        'hl-u-c7': {rgb: 'rgb(251, 17, 17)', hex: '#fb1111'}, 'hl-u-c8': {rgb: 'rgb(251, 18, 18)', hex: '#fb1212'},
        'hl-u-c9': {rgb: 'rgb(251, 19, 19)', hex: '#fb1313'}, 'hl-u-c10':{rgb: 'rgb(251, 20, 20)', hex: '#fb1414'}
    },
    magicTx: {
        'tx-c1': {rgb: 'rgb(252, 1, 1)', hex: '#fc0101'}, 'tx-c2': {rgb: 'rgb(252, 2, 2)', hex: '#fc0202'},
        'tx-c3': {rgb: 'rgb(252, 3, 3)', hex: '#fc0303'}, 'tx-c4': {rgb: 'rgb(252, 4, 4)', hex: '#fc0404'},
        'tx-c5': {rgb: 'rgb(252, 5, 5)', hex: '#fc0505'}, 'tx-c6': {rgb: 'rgb(252, 6, 6)', hex: '#fc0606'},
        'tx-c7': {rgb: 'rgb(252, 7, 7)', hex: '#fc0707'}, 'tx-c8': {rgb: 'rgb(252, 8, 8)', hex: '#fc0808'},
        'tx-c9': {rgb: 'rgb(252, 9, 9)', hex: '#fc0909'}, 'tx-c10':{rgb: 'rgb(252, 10, 10)', hex: '#fc0a0a'}
    },
    removeHl: {rgb: 'rgb(253, 0, 0)', hex: '#fd0000'},
    removeTx: {rgb: 'rgb(254, 0, 0)', hex: '#fe0000'},

    init: () => {
        // Recupero persistente delle ultime tinte utilizzate da localStorage
        try {
            const savedHl = localStorage.getItem('pronotes_last_hl');
            const savedTx = localStorage.getItem('pronotes_last_tx');
            if (savedHl) ColorManager.lastHighlight = savedHl;
            if (savedTx) ColorManager.lastText = savedTx;
        } catch (_) {}

        const preventFocusLoss = (e) => { e.preventDefault(); Editor.saveSelection(); };
        document.querySelectorAll('.btn-color-main, .btn-color-arrow').forEach(el => el.addEventListener('mousedown', preventFocusLoss));
        ColorManager.updateToolbarIcon('highlight', ColorManager.lastHighlight);
        ColorManager.updateToolbarIcon('text', ColorManager.lastText);
    },

    // Espansione automatica intelligente sulla parola sotto cursore (Word-Snap)
    expandSelectionToWord: (sel) => {
        if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
        
        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        let offset = range.startOffset;

        // Se il cursore si trova dentro un input, textarea o controllo nativo, non intervenire
        const checkEl = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
        if (!checkEl) return false;
        if (checkEl.closest && checkEl.closest('input, textarea, select')) return false;

        const isWordChar = (char) => /[a-zA-Z0-9À-ÿ_\-]/.test(char);

        // Se il cursore si trova su un nodo elemento (es. fine paragrafo o bordo span), scende al rispettivo nodo di testo
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.childNodes && node.childNodes[offset] && node.childNodes[offset].nodeType === Node.TEXT_NODE) {
                node = node.childNodes[offset];
                offset = 0;
            } else if (node.childNodes && offset > 0 && node.childNodes[offset - 1]) {
                let prevChild = node.childNodes[offset - 1];
                while (prevChild && prevChild.nodeType === Node.ELEMENT_NODE && (!prevChild.classList || !prevChild.classList.contains('adv-inline-shell'))) {
                    prevChild = prevChild.lastChild;
                }
                if (prevChild && prevChild.nodeType === Node.TEXT_NODE) {
                    node = prevChild;
                    offset = node.nodeValue ? node.nodeValue.length : 0;
                }
            }
        }

        // Se il browser ha appoggiato il cursore a offset 0 del TextNode subito dopo uno span formattato
        // (es. <span class="tx-c6">ciao</span>| mondo), rientra nella parola dello span adiacente
        if (node && node.nodeType === Node.TEXT_NODE && offset === 0 && !isWordChar((node.nodeValue || '').charAt(0))) {
            let prev = node.previousSibling;
            while (prev && prev.nodeType === Node.ELEMENT_NODE && (!prev.classList || !prev.classList.contains('adv-inline-shell')) && prev.tagName !== 'BR' && prev.tagName !== 'IMG') {
                prev = prev.lastChild;
            }
            if (prev && prev.nodeType === Node.TEXT_NODE && prev.nodeValue && isWordChar(prev.nodeValue.charAt(prev.nodeValue.length - 1))) {
                node = prev;
                offset = prev.nodeValue.length;
            }
        }

        if (!node || node.nodeType !== Node.TEXT_NODE) return false;

        const text = node.nodeValue || '';
        if (!text || offset < 0 || offset > text.length) return false;

        // Identifica se il punto di inserimento tocca un carattere appartenente a una parola
        let start = offset;
        let end = offset;

        if (start > 0 && !isWordChar(text.charAt(start)) && isWordChar(text.charAt(start - 1))) {
            start--;
            end = start + 1;
        } else if (start < text.length && isWordChar(text.charAt(start))) {
            end = start + 1;
        } else if (start > 0 && isWordChar(text.charAt(start - 1))) {
            start--;
            end = start + 1;
        } else {
            // Cursore posizionato su uno spazio vuoto o punteggiatura isolata: nessuna espansione
            return false;
        }

        // Espande all'indietro fino al confine della parola
        while (start > 0 && isWordChar(text.charAt(start - 1))) {
            start--;
        }

        // Espande in avanti fino al confine della parola
        while (end < text.length && isWordChar(text.charAt(end))) {
            end++;
        }

        if (start >= end || start < 0 || end > text.length) return false;

        try {
            const wordRange = document.createRange();
            wordRange.setStart(node, start);
            wordRange.setEnd(node, end);
            sel.removeAllRanges();
            sel.addRange(wordRange);

            if (typeof Editor !== 'undefined') {
                Editor.savedRange = wordRange.cloneRange();
            }
            return true;
        } catch (_) {
            return false;
        }
    },

    /**
     * SMART FORMATTING ESCAPE: Gestione intelligente del cursore su spazi o a confine di span formattati.
     * Quando l'utente preme il pulsante dell'evidenziatore o del colore testo su una riga con testo ma senza
     * alcuna parola sotto il cursore, sposta eventuali spazi di coda all'esterno dello span per riprendere
     * a scrivere in testo neutro. Non interviene su blocchi vuoti (gestiti direttamente da applyColor).
     */
    escapeFormattingSpan: (type, sel, editor) => {
        if (!sel || !sel.rangeCount || !sel.isCollapsed || !editor) return false;

        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        let offset = range.startOffset;

        const parentEl = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
        if (!parentEl || parentEl.id === 'noteContent') return false;

        // Criterio di identificazione dello span di formattazione pertinente in base al tipo
        const isTargetSpan = (el) => {
            if (!el || el.nodeType !== Node.ELEMENT_NODE || el.tagName !== 'SPAN') return false;
            if (el.classList.contains('adv-inline-shell') || el.classList.contains('adv-widget-shell')) return false;

            if (type === 'highlight') {
                return Array.from(el.classList).some(c => c.startsWith('hl-c') || c.startsWith('hl-u-c'));
            } else {
                return Array.from(el.classList).some(c => c.startsWith('tx-c'));
            }
        };

        // SCENARIO 1: Il cursore si trova DENTRO lo span formattato (dopo del testo o su spazi in coda)
        let formatSpan = parentEl.closest('span');
        while (formatSpan && formatSpan !== editor && !isTargetSpan(formatSpan)) {
            formatSpan = formatSpan.parentNode ? formatSpan.parentNode.closest('span') : null;
        }

        if (formatSpan && isTargetSpan(formatSpan)) {
            const spanText = formatSpan.textContent || '';
            // Se lo span è vuoto (es. nuova riga dopo Invio: <span class="..."><br></span>), lascia rimuovere/aggiornare lo span ad applyColor
            if (spanText.replace(/[\u200B\uFEFF\u00A0\s\r\n]/g, '') === '') {
                return false;
            }

            const preRange = range.cloneRange();
            preRange.selectNodeContents(formatSpan);
            preRange.setEnd(range.startContainer, range.startOffset);
            const textBefore = preRange.toString();

            // Se il cursore si trova oltre l'ultimo carattere alfanumerico dello span (o alla fine assoluta)
            const remainingInSpan = spanText.substring(textBefore.length);
            const isAtOrNearEnd = !/[a-zA-Z0-9À-ÿ]/.test(remainingInSpan);

            if (isAtOrNearEnd) {
                if (typeof Editor !== 'undefined') Editor.saveSnapshot();

                // Estrae eventuali spazi di coda presenti all'interno dello span
                let trailingSpaces = '';
                const lastTextChild = formatSpan.lastChild;
                if (lastTextChild && lastTextChild.nodeType === Node.TEXT_NODE) {
                    const match = lastTextChild.nodeValue.match(/[ \t\u00A0]+$/);
                    if (match) {
                        trailingSpaces = match[0];
                        lastTextChild.nodeValue = lastTextChild.nodeValue.slice(0, -trailingSpaces.length);
                    }
                }

                // Posiziona il cursore subito dopo lo span in un nodo di testo neutro
                let nextNode = formatSpan.nextSibling;
                const textToInject = trailingSpaces || ' ';

                if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
                    nextNode.nodeValue = textToInject + nextNode.nodeValue;
                } else {
                    const newTextNode = document.createTextNode(textToInject);
                    formatSpan.parentNode.insertBefore(newTextNode, formatSpan.nextSibling);
                    nextNode = newTextNode;
                }

                const newRange = document.createRange();
                newRange.setStart(nextNode, textToInject.length);
                newRange.collapse(true);

                sel.removeAllRanges();
                sel.addRange(newRange);

                if (typeof Editor !== 'undefined') {
                    Editor.savedRange = newRange.cloneRange();
                }
                return true;
            }
        }

        // SCENARIO 2: Il cursore si trova SUBITO DOPO lo span formattato (preceduto da spazi o a confine)
        let prevSibling = node.previousSibling;
        if (!prevSibling && node.nodeType === Node.TEXT_NODE && offset === 0) {
            prevSibling = parentEl.previousSibling;
        }

        // Se siamo all'inizio di un nodo di testo preceduto dallo span formattato
        if (prevSibling && isTargetSpan(prevSibling)) {
            const newRange = document.createRange();
            newRange.setStart(node, offset);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);

            if (typeof Editor !== 'undefined') {
                Editor.savedRange = newRange.cloneRange();
            }
            return true;
        }

        return false;
    },

    // Gestisce l'applicazione o rimozione colore su una riga vuota (es. <p><span class="tx-c6"><br></span></p>)
    _applyColorOnEmptyBlockCaret: (type, colorClass, sel, editor) => {
        if (!sel || !sel.rangeCount || !sel.isCollapsed || !editor) return false;
        const range = sel.getRangeAt(0);
        const startEl = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentNode : range.startContainer;
        if (!startEl) return false;

        const block = startEl.closest('p, div, li, h1, h2, h3, h4, h5, h6, td, th');
        if (!block || block === editor || !editor.contains(block)) return false;

        const cleanBlockText = block.textContent.replace(/[\u200B\uFEFF\u00A0\s\r\n]/g, '');
        if (cleanBlockText !== '' || block.querySelector('img, audio, iframe, svg, .adv-widget-shell, .adv-inline-shell')) {
            return false;
        }

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();

        const isPrefixMatch = (cls) => type === 'highlight' ? (cls.startsWith('hl-c') || cls.startsWith('hl-u-c')) : cls.startsWith('tx-c');

        // Rimuove dal basso verso l'alto le classi di questo canale colore e srotola gli span rimasti vuoti
        Array.from(block.querySelectorAll('span, font')).reverse().forEach(sp => {
            if (!ColorManager._isSafeToColor(sp)) return;
            Array.from(sp.classList).filter(isPrefixMatch).forEach(c => sp.classList.remove(c));
            if (type === 'highlight') sp.style.backgroundColor = '';
            else sp.style.color = '';

            if (sp.getAttribute('class') === '') sp.removeAttribute('class');
            if (sp.getAttribute('style') === '') sp.removeAttribute('style');
            if (sp.attributes.length === 0) {
                const p = sp.parentNode;
                if (p) {
                    while (sp.firstChild) p.insertBefore(sp.firstChild, sp);
                    sp.remove();
                }
            }
        });

        let caretHost = block;
        if (colorClass) {
            const existingSpan = block.querySelector('span');
            if (existingSpan && ColorManager._isSafeToColor(existingSpan)) {
                existingSpan.classList.add(colorClass);
                if (!existingSpan.querySelector('br')) existingSpan.innerHTML = '<br>';
                caretHost = existingSpan;
            } else {
                const newSpan = document.createElement('span');
                newSpan.className = colorClass;
                newSpan.innerHTML = '<br>';
                block.innerHTML = '';
                block.appendChild(newSpan);
                caretHost = newSpan;
            }
        } else {
            const remainingSpan = block.querySelector('span');
            if (remainingSpan && ColorManager._isSafeToColor(remainingSpan)) {
                if (!remainingSpan.querySelector('br')) remainingSpan.innerHTML = '<br>';
                caretHost = remainingSpan;
            } else if (block.childNodes.length === 0 && block.tagName !== 'TD' && block.tagName !== 'TH') {
                block.innerHTML = '<br>';
            }
        }

        const newRange = document.createRange();
        newRange.setStart(caretHost, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        if (typeof Editor !== 'undefined') {
            Editor.savedRange = newRange.cloneRange();
        }
        Store.triggerAutoSave();
        Editor.updateToolbarFormatting();
        return true;
    },

    openColorMenu: (e, anchorId, type) => {
        if (e) e.stopPropagation();
        
        let currentBgColor = 'transparent';
        let currentTextColor = 'var(--text-primary)';
        
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            let node = sel.anchorNode;
            if (node && node.nodeType === 3) node = node.parentNode;
            
            if (node) {
                // Il colore del testo viene ereditato nativamente, lo leggiamo subito
                currentTextColor = window.getComputedStyle(node).color;

                // Il background color non viene ereditato. Risaliamo l'albero fino a trovare un colore non trasparente.
                let currBgNode = node;
                while (currBgNode && currBgNode.id !== 'noteContent' && currBgNode !== document.body) {
                    let bg = window.getComputedStyle(currBgNode).backgroundColor;
                    if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                        currentBgColor = bg;
                        break;
                    }
                    currBgNode = currBgNode.parentNode;
                }
            }
        }

        const titleText = type === 'highlight' 
            ? I18n.t('color_manager.highlight_title') 
            : I18n.t('color_manager.text_color_title');
        let html = `<div class="adv-dropdown-title" style="margin-bottom: 4px; padding: 0 4px;">${titleText}</div>`;

        if (type === 'highlight') {
            // SEZIONE 1: SFONDO CLASSICO (EVIDENZIAZIONE A CAMPO PIENO)
            html += `<div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; padding: 2px 4px 6px 4px;">`;
            for (let i = 1; i <= 10; i++) {
                const sampleTitle = I18n.t('color_manager.bg_sample_title', { num: i });
                html += `<div class="color-option hl-c${i}" onclick="event.stopPropagation(); ColorManager.selectColor('${type}', 'hl-c${i}')" title="${sampleTitle}" style="width: 28px; height: 24px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.1); cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; font-family: serif; font-size: 14px; color: ${currentTextColor};" onmousedown="event.preventDefault(); Editor.saveSelection();">Ab</div>`;
            }
            html += `</div>`;

            // SEZIONE 2: SOTTOLINEATURA COLORATA (EVIDENZIAZIONE A LINEA SU SFONDO NEUTRO)
            html += `<div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; padding: 2px 4px 6px 4px;">`;
            for (let i = 1; i <= 10; i++) {
                const sampleTitle = I18n.t('color_manager.underline_sample_title', { num: i });
                // Sfondo neutro var(--bg-color): l'anteprima riflette fedelmente che la sottolineatura sostituisce lo sfondo
                html += `<div class="color-option hl-u-c${i}" onclick="event.stopPropagation(); ColorManager.selectColor('${type}', 'hl-u-c${i}')" title="${sampleTitle}" style="width: 28px; height: 24px; border-radius: 3px; border: 1px solid var(--border-color); cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; font-family: serif; font-size: 14px; color: ${currentTextColor}; background-color: var(--bg-color);" onmousedown="event.preventDefault(); Editor.saveSelection();">Ab</div>`;
            }
            html += `</div>`;
        } else {
            // COLORE TESTO STANDARD
            html += `<div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; padding: 4px;">`;
            for (let i = 1; i <= 10; i++) {
                const sampleTitle = I18n.t('color_manager.text_sample_title', { num: i });
                html += `<div class="color-option tx-c${i}" style="width: 28px; height: 24px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.1); cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; font-family: serif; font-size: 14px; background-color: ${currentBgColor};" onclick="event.stopPropagation(); ColorManager.selectColor('${type}', 'tx-c${i}')" title="${sampleTitle}" onmousedown="event.preventDefault(); Editor.saveSelection();">Ab</div>`;
            }
            html += `</div>`;
        }

        const removeLabel = type === 'highlight' 
            ? I18n.t('color_manager.remove_highlight') 
            : I18n.t('color_manager.auto_color');
        html += `<div style="width: 100%; padding: 6px 4px; text-align: left; font-size: 0.8rem; color: var(--text-primary); cursor: pointer; border-radius: 3px; margin-top: 4px; border-top: 1px solid var(--border-color);" onmouseenter="this.style.background='var(--item-hover)'" onmouseleave="this.style.background='transparent'" onclick="event.stopPropagation(); ColorManager.selectColor('${type}', null)" onmousedown="event.preventDefault(); Editor.saveSelection();" title="${removeLabel}">${removeLabel}</div>`;

        const items = [{ type: 'custom', html: html }];
        UI.Menu.buildContextMenu(anchorId, items);
    },

    // Identifica se la selezione possiede già una colorazione attiva del tipo richiesto per gestire il Toggle
    _isSelectionAlreadyColored: (type, targetClass) => {
        const hasSelectedCells = typeof TableManager !== 'undefined' && 
                                 TableManager.Selection && 
                                 (typeof TableManager.Selection.hasCellSelection === 'function' 
                                     ? TableManager.Selection.hasCellSelection() 
                                     : TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 0);

        if (hasSelectedCells) {
            const cells = TableManager.Selection.selectedCells;
            // Nel contesto di intere celle di tabella, il toggle scatta ESCLUSIVAMENTE se il testo interno alla cella
            // è già formattato con quel prefisso (non controlliamo mai cell.classList del tag TD/TH, che definisce lo sfondo della cella)
            return cells.every(cell => {
                if (targetClass) {
                    return !!cell.querySelector(`.${targetClass}`);
                }
                const prefix = type === 'highlight' ? 'hl-' : 'tx-';
                return !!cell.querySelector(`[class*="${prefix}"]`);
            });
        }

        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return false;

        const range = sel.getRangeAt(0);

        // Funzione di verifica se un elemento possiede la classe specifica ricercata
        const hasMatchingClass = (el) => {
            if (!el || el.nodeType !== Node.ELEMENT_NODE || !el.classList) return false;
            if (targetClass) {
                return el.classList.contains(targetClass);
            }
            const prefix = type === 'highlight' ? 'hl-' : 'tx-';
            return Array.from(el.classList).some(c => c.startsWith(prefix));
        };

        // Verifica puntuale se un nodo (o uno dei suoi antenati fino al blocco/editor) possiede la classe
        const isNodeWithinColoredSpan = (n) => {
            let curr = n.nodeType === Node.TEXT_NODE ? n.parentNode : n;
            while (curr && curr.id !== 'noteContent' && curr !== document.body && curr.tagName !== 'TD' && curr.tagName !== 'TH') {
                if (hasMatchingClass(curr)) return true;
                curr = curr.parentNode;
            }
            return false;
        };

        if (sel.isCollapsed) {
            if (isNodeWithinColoredSpan(sel.anchorNode)) return true;
            if (sel.anchorNode && sel.anchorNode.nodeType === Node.ELEMENT_NODE && sel.anchorNode.childNodes[sel.anchorOffset]) {
                const child = sel.anchorNode.childNodes[sel.anchorOffset];
                if (hasMatchingClass(child) || (child.querySelector && targetClass && child.querySelector(`.${targetClass}`))) {
                    return true;
                }
            }
            return false;
        }

        // Selezione estesa: verifica se il comune antenato o tutti i nodi di testo intersecati hanno il colore
        const common = range.commonAncestorContainer;
        const rootContainer = common.nodeType === Node.TEXT_NODE ? common.parentNode : common;

        if (isNodeWithinColoredSpan(rootContainer)) {
            return true;
        }

        const hasNonSpaceInSelection = /\S/.test(range.toString().replace(/[\u200B\uFEFF]/g, ''));

        // Scansione puntuale dei soli nodi di testo inclusi nel range (includendo gli spazi se la selezione contiene solo spazi)
        const walker = document.createTreeWalker(rootContainer, NodeFilter.SHOW_TEXT, null, false);
        let textNode;
        let hasText = false;
        let allColored = true;

        while ((textNode = walker.nextNode())) {
            let isIntersecting = false;
            try {
                const nodeRange = document.createRange();
                nodeRange.selectNodeContents(textNode);
                isIntersecting = (
                    range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
                    range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
                );
            } catch (_) {
                isIntersecting = false;
            }

            if (isIntersecting) {
                const cleanContent = hasNonSpaceInSelection
                    ? textNode.nodeValue.replace(/[\u200B\uFEFF\u00A0\r\n\t]/g, '').trim()
                    : textNode.nodeValue.replace(/[\u200B\uFEFF\r\n]/g, '');

                if (cleanContent.length > 0) {
                    hasText = true;
                    if (!isNodeWithinColoredSpan(textNode)) {
                        allColored = false;
                        break;
                    }
                }
            }
        }

        return hasText && allColored;
    },

    applyLast: (type) => {
        const hasSelectedCells = typeof TableManager !== 'undefined' && 
                                 TableManager.Selection && 
                                 (typeof TableManager.Selection.hasCellSelection === 'function' 
                                     ? TableManager.Selection.hasCellSelection() 
                                     : TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 0);

        const editor = document.getElementById('noteContent');
        const sel = window.getSelection();
        let wasAutoExpanded = false;

        // Auto-espansione della parola ESCLUSIVAMENTE se non ci sono celle selezionate nella tabella
        if (!hasSelectedCells && sel && sel.rangeCount > 0 && sel.isCollapsed && editor && editor.contains(sel.anchorNode)) {
            wasAutoExpanded = ColorManager.expandSelectionToWord(sel);
        }

        // SMART ESCAPE SU SPAZI: se non tocca alcuna parola ed è collassato, verifica se siamo in uscita da uno span con testo
        if (!hasSelectedCells && !wasAutoExpanded && sel && sel.rangeCount > 0 && sel.isCollapsed && editor && editor.contains(sel.anchorNode)) {
            const escaped = ColorManager.escapeFormattingSpan(type, sel, editor);
            if (escaped) {
                Store.triggerAutoSave();
                Editor.updateToolbarFormatting();
                return;
            }
        }

        const targetColor = type === 'highlight' ? ColorManager.lastHighlight : ColorManager.lastText;
        
        // Se si tenta di applicare il "nessun colore", delega alla normale esecuzione
        if (!targetColor || targetColor === 'bg-none' || targetColor === 'tx-auto') {
            ColorManager.applyColor(type, null, wasAutoExpanded);
            return;
        }

        // Se la selezione o le celle contengono già la stessa colorazione, attiva la rimozione (Toggle OFF)
        const isAlreadyColored = ColorManager._isSelectionAlreadyColored(type, targetColor);
        
        if (isAlreadyColored) {
            ColorManager.applyColor(type, null, wasAutoExpanded);
        } else {
            ColorManager.applyColor(type, targetColor, wasAutoExpanded);
        }
    },

    selectColor: (type, colorClass) => {
        if (type === 'highlight') {
            if (colorClass) {
                ColorManager.lastHighlight = colorClass;
                try { localStorage.setItem('pronotes_last_hl', colorClass); } catch (_) {}
            }
            ColorManager.updateToolbarIcon('highlight', colorClass || 'bg-none');
        } else {
            if (colorClass) {
                ColorManager.lastText = colorClass;
                try { localStorage.setItem('pronotes_last_tx', colorClass); } catch (_) {}
            }
            ColorManager.updateToolbarIcon('text', colorClass || 'tx-auto');
        }

        // Applica la colorazione PRIMA di chiudere il menu per evitare lo svuotamento della selezione celle
        ColorManager.applyColor(type, colorClass);

        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
    },

    updateToolbarIcon: (type, colorClass) => {
        const bar = document.getElementById(type === 'highlight' ? 'hlBar' : 'txBar');
        if (!bar) return;
        bar.className = 'btn-color-bar';

        if (colorClass && colorClass !== 'bg-none' && colorClass !== 'tx-auto') {
            if (colorClass.startsWith('hl-u-c')) {
                // Sottolineatura colorata: barretta inferiore nello stile della sottolineatura definita in colors.css
                bar.classList.add(colorClass);
                bar.style.backgroundColor = '';
                bar.style.border = '';
            } else {
                bar.classList.add(colorClass);
                bar.style.backgroundColor = '';
                bar.style.border = 'none';
            }
        } else {
            if (type === 'highlight') { 
                bar.style.backgroundColor = 'transparent'; 
                bar.style.border = '1px solid #ccc'; 
            } else { 
                bar.classList.add('tx-auto'); 
                bar.style.backgroundColor = ''; 
                bar.style.border = 'none'; 
            }
        }
    },

    // Determina se il nodo può essere manipolato dal ColorManager
    _isSafeToColor: (el) => {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
        if (el.id === 'noteContent') return false;
        // Non manipolare direttamente il tag contenitore della cella (TD o TH)
        if (el.tagName === 'TD' || el.tagName === 'TH') return false;

        // Se l'elemento è contenuto dentro una cella di tabella semplice, è testo editabile sicuro al 100%
        const parentCell = el.closest('td, th');
        if (parentCell && !parentCell.closest('.adv-table')) {
            return true;
        }

        if (typeof WidgetManager !== 'undefined') {
            if (WidgetManager.isInsideEditableWidgetArea(el)) return true;
            if (WidgetManager.isProtectedBlock(el) || WidgetManager.isProtectedInline(el)) return false;
        }
        return true;
    },

    applyColor: (type, colorClass, forceAutoExpanded = false) => {
        // GESTIONE FORMATTAZIONE MULTICELLA TABELLA (Colore Testo ed Evidenziatore)
        const hasSelectedCells = typeof TableManager !== 'undefined' && 
                                 TableManager.Selection && 
                                 (typeof TableManager.Selection.hasCellSelection === 'function'
                                     ? TableManager.Selection.hasCellSelection()
                                     : TableManager.Selection.selectedCells && TableManager.Selection.selectedCells.length > 0);

        if (hasSelectedCells) {
            Editor.saveSnapshot(true);
            const cells = TableManager.Selection.selectedCells;

            cells.forEach(cell => {
                if (type === 'text') {
                    cell.querySelectorAll('[class*="tx-c"]').forEach(el => {
                        Array.from(el.classList).filter(c => c.startsWith('tx-c')).forEach(c => el.classList.remove(c));
                        el.style.color = '';
                    });
                } else {
                    cell.querySelectorAll('[class*="hl-c"], [class*="hl-u-c"]').forEach(el => {
                        Array.from(el.classList).filter(c => c.startsWith('hl-c') || c.startsWith('hl-u-c')).forEach(c => el.classList.remove(c));
                        el.style.backgroundColor = '';
                    });
                }

                if (colorClass) {
                    const textOnly = cell.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
                    const span = document.createElement('span');
                    span.className = colorClass;

                    if (textOnly || cell.querySelector('img, audio, input, svg')) {
                        while (cell.firstChild) span.appendChild(cell.firstChild);
                    } else {
                        span.innerHTML = '<br>';
                        cell.innerHTML = '';
                    }
                    cell.appendChild(span);
                }

                let cleanChanged = true;
                while (cleanChanged) {
                    cleanChanged = false;
                    cell.querySelectorAll('span, font').forEach(sp => {
                        if (sp.getAttribute('class') === '') sp.removeAttribute('class');
                        if (sp.getAttribute('style') === '') sp.removeAttribute('style');
                        const hasNoClass = !sp.hasAttribute('class') || sp.getAttribute('class').trim() === '';
                        const hasNoStyle = !sp.hasAttribute('style') || sp.getAttribute('style').trim() === '';
                        if (sp.attributes.length === 0 || (hasNoClass && hasNoStyle)) {
                            const parent = sp.parentNode;
                            if (parent) {
                                while (sp.firstChild) parent.insertBefore(sp.firstChild, sp);
                                sp.remove();
                                cleanChanged = true;
                            }
                        }
                    });
                }
            });

            Editor.healWidgetWrappers();

            if (AppState.currentNoteId) {
                const note = Store.getNote(AppState.currentNoteId);
                if (note) {
                    note.content = Editor.getCleanHTML();
                    note._isDirty = true;
                    note.updatedAt = new Date().toISOString();
                }
            }

            Store.triggerAutoSave();
            Editor.updateToolbarFormatting();
            Editor.updateUndoRedoUI();
            return;
        }

        const editor = document.getElementById('noteContent');
        const sel = window.getSelection();
        let wasAutoExpanded = forceAutoExpanded;

        // Ripristina la selezione solo se il cursore non è già attivo nell'editor
        if (sel && sel.rangeCount > 0 && editor && editor.contains(sel.anchorNode)) {
            if (typeof Editor !== 'undefined') {
                Editor.savedRange = sel.getRangeAt(0).cloneRange();
            }
        } else if (Editor.savedRange && (!sel || !sel.rangeCount || !editor || !editor.contains(sel.anchorNode))) {
            Editor.restoreSelection();
        }

        // AUTO-ESPANSIONE SULLA PAROLA CORRENTE (WORD-SNAP) SE ANCORA COLLASSATO
        if (sel && sel.rangeCount > 0 && sel.isCollapsed && editor && editor.contains(sel.anchorNode)) {
            wasAutoExpanded = ColorManager.expandSelectionToWord(sel) || wasAutoExpanded;
        }

        // Se siamo in una riga vuota (es. dopo Invio su testo colorato), gestisce direttamente lo span vuoto
        if (!wasAutoExpanded && sel && sel.rangeCount > 0 && sel.isCollapsed && editor && editor.contains(sel.anchorNode)) {
            if (ColorManager._applyColorOnEmptyBlockCaret(type, colorClass, sel, editor)) {
                return;
            }
            const escaped = ColorManager.escapeFormattingSpan(type, sel, editor);
            if (escaped) {
                Store.triggerAutoSave();
                Editor.updateToolbarFormatting();
                return;
            }
        }

        if (!sel || !sel.rangeCount || sel.isCollapsed) return;

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();

        document.execCommand('styleWithCSS', false, true);

        const activeRange = sel.getRangeAt(0);
        const savedStartC = activeRange.startContainer;
        const savedStartO = activeRange.startOffset;
        const savedEndC = activeRange.endContainer;
        const savedEndO = activeRange.endOffset;
        const reshapedMap = new Map();

        try {
            // 1. Converte tutte le classi attuali in colori finti, isolando il canale in uno span puro
            // quando l'elemento possiede altre classi (es. tx-* + hl-*) così execCommand può tagliarlo nativamente
            const safeElements = Array.from(editor.querySelectorAll('*')).filter(el => ColorManager._isSafeToColor(el));
            safeElements.forEach(el => {
                let magicHex = null;
                if (type === 'highlight') {
                    for (let cls in ColorManager.magicHl) {
                        if (el.classList.contains(cls)) {
                            magicHex = ColorManager.magicHl[cls].hex;
                            el.classList.remove(cls);
                        }
                    }
                } else {
                    for (let cls in ColorManager.magicTx) {
                        if (el.classList.contains(cls)) {
                            magicHex = ColorManager.magicTx[cls].hex;
                            el.classList.remove(cls);
                        }
                    }
                }

                if (el.getAttribute('class') === '') el.removeAttribute('class');

                if (magicHex) {
                    const hasOtherClasses = el.classList.length > 0;
                    const isNonSpan = el.tagName !== 'SPAN';
                    const hasBlockChildren = !!el.querySelector('p, div, li, ul, ol, table, h1, h2, h3, h4, h5, h6, blockquote');

                    if ((hasOtherClasses || isNonSpan) && !hasBlockChildren) {
                        const styleSpan = document.createElement('span');
                        if (type === 'highlight') styleSpan.style.backgroundColor = magicHex;
                        else styleSpan.style.color = magicHex;
                        while (el.firstChild) styleSpan.appendChild(el.firstChild);
                        el.appendChild(styleSpan);
                        reshapedMap.set(el, styleSpan);
                    } else {
                        if (type === 'highlight') el.style.backgroundColor = magicHex;
                        else el.style.color = magicHex;
                    }
                }
            });

            if (reshapedMap.size > 0) {
                try {
                    const r = document.createRange();
                    const sc = reshapedMap.has(savedStartC) ? reshapedMap.get(savedStartC) : savedStartC;
                    const so = reshapedMap.has(savedStartC) ? Math.min(savedStartO, sc.childNodes.length) : savedStartO;
                    const ec = reshapedMap.has(savedEndC) ? reshapedMap.get(savedEndC) : savedEndC;
                    const eo = reshapedMap.has(savedEndC) ? Math.min(savedEndO, ec.childNodes.length) : savedEndO;
                    r.setStart(sc, so);
                    r.setEnd(ec, eo);
                    sel.removeAllRanges();
                    sel.addRange(r);
                } catch (_) {}
            }

            // 2. Comanda al browser di tagliare/fondere i nodi nativamente
            let targetHex = type === 'highlight' ? ColorManager.removeHl.hex : ColorManager.removeTx.hex;
            if (colorClass && type === 'highlight') targetHex = ColorManager.magicHl[colorClass].hex;
            if (colorClass && type === 'text') targetHex = ColorManager.magicTx[colorClass].hex;

            if (type === 'highlight') {
                let success = false;
                try {
                    success = document.execCommand('hiliteColor', false, targetHex);
                } catch (_) {}
                if (!success) {
                    try {
                        document.execCommand('backColor', false, targetHex);
                    } catch (_) {}
                }
            } else {
                document.execCommand('foreColor', false, targetHex);
            }

        } finally {
            // 3. Riconversione GARANTITA di tutti i colori finti nelle rispettive classi CSS
            const cleanStr = str => str ? str.replace(/\s+/g, '').toLowerCase() : '';
            
            editor.querySelectorAll('*').forEach(el => {
                if (!ColorManager._isSafeToColor(el)) return;

                if (type === 'highlight') {
                    const bg = cleanStr(el.style.backgroundColor);
                    if (!bg) return;

                    if (bg === 'rgb(253,0,0)' || bg === '#fd0000') {
                        el.style.backgroundColor = '';
                        // Rimuove tassativamente qualsiasi classe di evidenziazione dal nodo ripulito
                        Array.from(el.classList).filter(c => c.startsWith('hl-c') || c.startsWith('hl-u-c')).forEach(c => el.classList.remove(c));
                    } else {
                        // Riconoscimento immediato O(1) del canale magico 251 (evidenziatori e sottolineature)
                        const m = bg.match(/rgba?\(251,\s*(\d+),\s*(\d+)/);
                        if (m) {
                            const g = parseInt(m[1], 10);
                            const b = parseInt(m[2], 10);
                            el.style.backgroundColor = '';
                            if (g === 15 && b === 16) {
                                el.classList.add('hl-u-c6');
                            } else if (g >= 1 && g <= 10) {
                                el.classList.add(`hl-c${g}`);
                            } else if (g >= 11 && g <= 20) {
                                el.classList.add(`hl-u-c${g - 10}`);
                            }
                        } else {
                            // Fallback per confronto diretto con la mappa registrata
                            for (let cls in ColorManager.magicHl) {
                                if (bg === cleanStr(ColorManager.magicHl[cls].rgb) || bg === cleanStr(ColorManager.magicHl[cls].hex)) {
                                    el.classList.add(cls); 
                                    el.style.backgroundColor = ''; 
                                    break;
                                }
                            }
                        }
                    }
                } else {
                    const fg = cleanStr(el.style.color);
                    if (!fg) return;

                    if (fg === 'rgb(254,0,0)' || fg === '#fe0000') { 
                        el.style.color = ''; 
                        // Rimuove tassativamente qualsiasi classe colore testo dal nodo ripulito
                        Array.from(el.classList).filter(c => c.startsWith('tx-c')).forEach(c => el.classList.remove(c));
                    } else {
                        // Riconoscimento immediato O(1) del canale magico 252 (colori del testo)
                        const m = fg.match(/rgba?\(252,\s*(\d+),\s*(\d+)/);
                        if (m) {
                            const val = parseInt(m[1], 10);
                            el.style.color = '';
                            if (val >= 1 && val <= 10) el.classList.add(`tx-c${val}`);
                        } else {
                            // Fallback per confronto diretto con la mappa registrata
                            for (let cls in ColorManager.magicTx) {
                                if (fg === cleanStr(ColorManager.magicTx[cls].rgb) || fg === cleanStr(ColorManager.magicTx[cls].hex)) {
                                    el.classList.add(cls); 
                                    el.style.color = ''; 
                                    break;
                                }
                            }
                        }
                    }
                }
            });

            // 4. Pulizia definitiva e srotolamento ricorsivo di tutti i nodi e span parassiti vuoti
            let changed = true;
            while (changed) {
                changed = false;
                editor.querySelectorAll('*').forEach(el => {
                    if (!ColorManager._isSafeToColor(el)) return;

                    if (el.getAttribute('class') === '') el.removeAttribute('class');
                    if (el.getAttribute('style') === '') el.removeAttribute('style');
                    if (el.getAttribute('color') === '') el.removeAttribute('color');

                    if (el.tagName === 'SPAN' || el.tagName === 'FONT') {
                        const hasNoClass = !el.hasAttribute('class') || el.getAttribute('class').trim() === '';
                        const hasNoStyle = !el.hasAttribute('style') || el.getAttribute('style').trim() === '';
                        const hasNoColorAttr = !el.hasAttribute('color');

                        if (el.attributes.length === 0 || (hasNoClass && hasNoStyle && hasNoColorAttr)) {
                            const parent = el.parentNode;
                            if (parent) {
                                while (el.firstChild) parent.insertBefore(el.firstChild, el);
                                parent.removeChild(el);
                                changed = true;
                            }
                        }
                    }
                });
            }
            
            editor.normalize();

            // RIPRISTINO MODALITÀ STANDARD: Disattiva styleWithCSS per non lasciare il browser in modalità inline-CSS
            try { 
                document.execCommand('styleWithCSS', false, false); 
            } catch(e) {}
        }

        // SMART CARET COLLAPSE: Se la parola è stata auto-estesa da un cursore collassato,
        // collassa il cursore alla fine dell'ultimo nodo di testo effettivo della parola stessa
        // (rimanendo dentro lo span formattato) così che un secondo Ctrl+Alt+H / Ctrl+Shift+H esegua il toggle-off immediato
        if (wasAutoExpanded) {
            const currentSel = window.getSelection();
            if (currentSel && currentSel.rangeCount > 0) {
                const curRange = currentSel.getRangeAt(0);
                let endNode = curRange.endContainer;
                let endOff = curRange.endOffset;
                let targetTextNode = null;

                if (endNode.nodeType === Node.TEXT_NODE && endOff > 0) {
                    targetTextNode = endNode;
                } else if (endNode.nodeType === Node.ELEMENT_NODE && endOff > 0 && endNode.childNodes[endOff - 1]) {
                    let candidate = endNode.childNodes[endOff - 1];
                    while (candidate && candidate.nodeType === Node.ELEMENT_NODE) {
                        candidate = candidate.lastChild;
                    }
                    if (candidate && candidate.nodeType === Node.TEXT_NODE && candidate.nodeValue.length > 0) {
                        targetTextNode = candidate;
                    }
                }

                if (!targetTextNode) {
                    const endEl = endNode.nodeType === Node.TEXT_NODE ? endNode.parentNode : endNode;
                    const blockHost = (endEl && endEl.closest ? endEl.closest('p, div, li, h1, h2, h3, h4, h5, h6, td, th') : null) || editor;
                    const refNode = (endNode.nodeType === Node.ELEMENT_NODE && endNode.childNodes[endOff]) ? endNode.childNodes[endOff] : endNode;
                    const walker = document.createTreeWalker(blockHost, NodeFilter.SHOW_TEXT, null, false);
                    let prevT = null;
                    let w;
                    while ((w = walker.nextNode())) {
                        if (w === refNode || (refNode.contains && refNode.contains(w))) break;
                        if (w.nodeValue && w.nodeValue.length > 0) prevT = w;
                    }
                    targetTextNode = prevT;
                }

                if (targetTextNode && document.body.contains(targetTextNode)) {
                    const safeEnd = endNode === targetTextNode ? Math.min(endOff, targetTextNode.nodeValue.length) : targetTextNode.nodeValue.length;
                    const collapsedRange = document.createRange();
                    collapsedRange.setStart(targetTextNode, safeEnd);
                    collapsedRange.collapse(true);
                    currentSel.removeAllRanges();
                    currentSel.addRange(collapsedRange);
                } else {
                    currentSel.collapseToEnd();
                }

                if (typeof Editor !== 'undefined' && currentSel.rangeCount > 0) {
                    Editor.savedRange = currentSel.getRangeAt(0).cloneRange();
                }
            }
        }

        Store.triggerAutoSave();
        Editor.updateToolbarFormatting();
    }
};