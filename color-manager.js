/**
 * ColorManager.js
 * Gestisce l'applicazione dei colori (Testo ed Evidenziatore) tramite Menu Standardizzato.
 * Algoritmo di Appiattimento Nativo (Evita annidamenti di span).
 * FIX ARCHITETTURA: Usa buildContextMenu per i color picker (Niente più div hardcodati).
 * FIX ANTEPRIMA: Calcola il background/color corrente della selezione e li incrocia nei riquadri del menù.
 * FIX DOM (ExecCommand): Lo scraper ora analizza tutti i nodi (*) proteggendo però i Widget tramite Firewall.
 * FIX EREDITÀ COLORI: Risalita DOM per identificare il vero colore di sfondo tra span nidificati.
 * FIX TOGGLE: Il tasto principale ora agisce come interruttore (ON/OFF) se il colore selezionato è già attivo.
 * FEAT MULTI-CELL COLORING: Quando sono selezionate più celle di una tabella semplice (TableManager.Selection),
 * l'applicazione del colore testo ed evidenziatore agisce direttamente e simultaneamente su tutte le celle,
 * con salvataggio atomico della cronologia di Undo (Ctrl+Z) e Redo (Ctrl+Y).
 * FEAT PERSISTENCE: Memorizzazione persistente in localStorage degli ultimi colori usati (pronotes_last_hl, pronotes_last_tx).
 * FIX KEYBOARD SHORTCUT SELECTION: Preserva la selezione attiva del browser senza collassarla all'invocazione da tastiera.
 * FIX TEXT COLOR TOGGLE UNWRAP: Risolto annidamento genitore su foreColor neutro azzerando il colore temporaneo del genitore.
 * FEAT COLORED UNDERLINE: Supporto alle sottolineature colorate (hl-u-c1..hl-u-c10) all'interno del menù evidenziatore.
 * FIX PREVIEW HIGHLIGHT EXCLUSIVITY: Anteprima fedele a sfondo neutro per i campioni di sottolineatura onde evitare false aspettative visive.
 * FEAT WORD-SNAP AUTO EXPANSION: Selezione automatica dell'intera parola sotto cursore se non vi è selezione manuale attiva.
 * FIX WORD-SNAP BOUNDARIES: Verifica rigorosa dei confini di editabilità e validità del nodo di testo in expandSelectionToWord.
 * FIX ATOMIC REVERSION (TRY-FINALLY): Riconversione garantita dei colori magici temporanei (rgb 252,5,5) in classi CSS
 * anche in caso di eccezioni intermedie, con routine di auto-guarigione (healMagicColors) al caricamento.
 * FEAT SMART CARET COLLAPSE: Collassa automaticamente la selezione a fine parola dopo l'auto-espansione (Word-Snap),
 * impedendo che la digitazione del carattere successivo sovrascriva accidentalmente la parola evidenziata.
 * FEAT SMART FORMATTING ESCAPE ON SPACES: Se il cursore si trova su spazi vuoti o a fine span senza parole selezionate,
 * la pressione dell'evidenziatore o del colore testo estrae il cursore dallo span formattato (trasferendo gli spazi all'esterno)
 * consentendo all'utente di riprendere a scrivere all'istante in testo neutro non colorato.
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

        // Se il cursore si trova su un nodo elemento (es. fine paragrafo o bordo span), scende al rispettivo nodo di testo
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.childNodes && node.childNodes[offset] && node.childNodes[offset].nodeType === Node.TEXT_NODE) {
                node = node.childNodes[offset];
                offset = 0;
            } else if (node.childNodes && offset > 0 && node.childNodes[offset - 1] && node.childNodes[offset - 1].nodeType === Node.TEXT_NODE) {
                node = node.childNodes[offset - 1];
                offset = node.nodeValue ? node.nodeValue.length : 0;
            }
        }

        if (!node || node.nodeType !== Node.TEXT_NODE) return false;

        const text = node.nodeValue || '';
        if (!text || offset < 0 || offset > text.length) return false;

        const isWordChar = (char) => /[a-zA-Z0-9À-ÿ_\-]/.test(char);

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
     * Quando l'utente preme il pulsante dell'evidenziatore o del colore testo senza una parola selezionata,
     * verifica se il cursore si trova dentro o subito adiacente a uno span formattato (es. dopo uno spazio).
     * Se sì, sposta gli spazi all'esterno e colloca il cursore nel testo normale, consentendo di proseguire
     * la scrittura senza rimanere intrappolati nello stile.
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

        // SCENARIO 1: Il cursore si trova DENTRO lo span formattato (a fine testo o su spazi in coda)
        let formatSpan = parentEl.closest('span');
        while (formatSpan && formatSpan !== editor && !isTargetSpan(formatSpan)) {
            formatSpan = formatSpan.parentNode ? formatSpan.parentNode.closest('span') : null;
        }

        if (formatSpan && isTargetSpan(formatSpan)) {
            // Verifica se il cursore è verso la fine del testo dello span (dopo l'ultima parola o su spazi)
            const spanText = formatSpan.textContent || '';
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
            // Il cursore è già fisicamente fuori dallo span; garantiamo che il range attivo sia solido
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

        const titleText = type === 'highlight' ? 'Evidenziatore (Ctrl+Shift+H)' : 'Colore Testo (Ctrl+Alt+H)';
        let html = `<div class="adv-dropdown-title" style="margin-bottom: 4px; padding: 0 4px;">${titleText}</div>`;

        if (type === 'highlight') {
            // SEZIONE 1: SFONDO CLASSICO (EVIDENZIAZIONE A CAMPO PIENO)
            html += `<div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; padding: 2px 4px 6px 4px;">`;
            for (let i = 1; i <= 10; i++) {
                html += `<div class="color-option hl-c${i}" onclick="event.stopPropagation(); ColorManager.selectColor('${type}', 'hl-c${i}')" title="Sfondo ${i}" style="width: 28px; height: 24px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.1); cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; font-family: serif; font-size: 14px; color: ${currentTextColor};" onmousedown="event.preventDefault(); Editor.saveSelection();">Ab</div>`;
            }
            html += `</div>`;

            // SEZIONE 2: SOTTOLINEATURA COLORATA (EVIDENZIAZIONE A LINEA SU SFONDO NEUTRO)
            html += `<div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; padding: 2px 4px 6px 4px;">`;
            for (let i = 1; i <= 10; i++) {
                // Sfondo neutro var(--bg-color): l'anteprima riflette fedelmente che la sottolineatura sostituisce lo sfondo
                html += `<div class="color-option hl-u-c${i}" onclick="event.stopPropagation(); ColorManager.selectColor('${type}', 'hl-u-c${i}')" title="Sottolineatura ${i}" style="width: 28px; height: 24px; border-radius: 3px; border: 1px solid var(--border-color); cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; font-family: serif; font-size: 14px; color: ${currentTextColor}; background-color: var(--bg-color);" onmousedown="event.preventDefault(); Editor.saveSelection();">Ab</div>`;
            }
            html += `</div>`;
        } else {
            // COLORE TESTO STANDARD
            html += `<div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; padding: 4px;">`;
            for (let i = 1; i <= 10; i++) {
                html += `<div class="color-option tx-c${i}" style="width: 28px; height: 24px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.1); cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; font-family: serif; font-size: 14px; background-color: ${currentBgColor};" onclick="event.stopPropagation(); ColorManager.selectColor('${type}', 'tx-c${i}')" title="Testo ${i}" onmousedown="event.preventDefault(); Editor.saveSelection();">Ab</div>`;
            }
            html += `</div>`;
        }

        const removeLabel = type === 'highlight' ? 'Rimuovi Evidenziazione' : 'Automatico';
        html += `<div style="width: 100%; padding: 6px 4px; text-align: left; font-size: 0.8rem; color: var(--text-primary); cursor: pointer; border-radius: 3px; margin-top: 4px; border-top: 1px solid var(--border-color);" onmouseenter="this.style.background='var(--item-hover)'" onmouseleave="this.style.background='transparent'" onclick="event.stopPropagation(); ColorManager.selectColor('${type}', null)" onmousedown="event.preventDefault(); Editor.saveSelection();" title="${removeLabel}">${removeLabel}</div>`;

        const items = [{ type: 'custom', html: html }];
        UI.Menu.buildContextMenu(anchorId, items);
    },

    // Identifica se il nodo di partenza della selezione possiede già il colore target
    _isSelectionAlreadyColored: (type, targetClass) => {
        const hasSelectedCells = typeof TableManager !== 'undefined' && 
                                 TableManager.Selection && 
                                 TableManager.Selection.selectedCells && 
                                 TableManager.Selection.selectedCells.length > 0;

        if (hasSelectedCells) {
            const cells = TableManager.Selection.selectedCells;
            return cells.every(cell => {
                const spanWithClass = cell.querySelector(`.${targetClass}`);
                return !!spanWithClass;
            });
        }

        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return false;

        let node = sel.anchorNode;
        if (!node) return false;
        if (node.nodeType === 3) node = node.parentNode;

        // Risaliamo il DOM per vedere se il nodo di partenza possiede già quella classe
        while (node && node.id !== 'noteContent' && node !== document.body) {
            if (node.classList && node.classList.contains(targetClass)) {
                return true;
            }
            
            // Se incontra un'altra classe colore dello STESSO TIPO, significa che il colore primario qui è un altro.
            // Ci fermiamo perché non vogliamo falsi positivi da span nidificati esternamente.
            if (type === 'highlight' && Array.from(node.classList).some(c => (c.startsWith('hl-c') || c.startsWith('hl-u-c')) && c !== targetClass)) {
                return false;
            }
            if (type === 'text' && Array.from(node.classList).some(c => c.startsWith('tx-') && c !== targetClass)) {
                return false;
            }
            
            node = node.parentNode;
        }
        return false;
    },

    applyLast: (type) => {
        const editor = document.getElementById('noteContent');
        const sel = window.getSelection();
        let wasAutoExpanded = false;

        // Se il cursore è collassato all'interno dell'editor, prova l'espansione sulla parola corrente
        if (sel && sel.rangeCount > 0 && sel.isCollapsed && editor && editor.contains(sel.anchorNode)) {
            wasAutoExpanded = ColorManager.expandSelectionToWord(sel);
        }

        // SMART ESCAPE SU SPAZI: se non tocca alcuna parola ed è collassato, verifica se siamo in uscita da uno span
        if (!wasAutoExpanded && sel && sel.rangeCount > 0 && sel.isCollapsed && editor && editor.contains(sel.anchorNode)) {
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

        // Verifica se il colore è già presente. Se sì, agisce da "Toggle Off" (Rimuove)
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
                try { localStorage.getItem('pronotes_last_hl', colorClass); } catch (_) {}
            }
            ColorManager.updateToolbarIcon('highlight', colorClass || 'bg-none');
        } else {
            if (colorClass) {
                ColorManager.lastText = colorClass;
                try { localStorage.setItem('pronotes_last_tx', colorClass); } catch (_) {}
            }
            ColorManager.updateToolbarIcon('text', colorClass || 'tx-auto');
        }
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
        ColorManager.applyColor(type, colorClass);
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
                                 TableManager.Selection.selectedCells && 
                                 TableManager.Selection.selectedCells.length > 0;

        if (hasSelectedCells) {
            // Forza l'inserimento dello snapshot di partenza per garantire l'Undo (Ctrl+Z)
            Editor.saveSnapshot(true);
            const cells = TableManager.Selection.selectedCells;

            cells.forEach(cell => {
                // 1. Rimuove le classi e stili del tipo specificato (text o highlight) da tutti gli elementi interni alla cella
                if (type === 'text') {
                    cell.querySelectorAll('[class*="tx-c"], [color]').forEach(el => {
                        Array.from(el.classList).filter(c => c.startsWith('tx-c')).forEach(c => el.classList.remove(c));
                        el.removeAttribute('color');
                        el.style.color = '';
                    });
                } else {
                    cell.querySelectorAll('[class*="hl-c"], [class*="hl-u-c"]').forEach(el => {
                        Array.from(el.classList).filter(c => c.startsWith('hl-c') || c.startsWith('hl-u-c')).forEach(c => el.classList.remove(c));
                        el.style.backgroundColor = '';
                    });
                }

                // 2. Se è stato specificato un colore (non null/rimozione), avvolge tutto il contenuto utile
                if (colorClass) {
                    const textOnly = cell.textContent.replace(/[\u200B\uFEFF\u00A0\n\r]/g, '').trim();
                    if (textOnly || cell.querySelector('img, audio, input, svg')) {
                        const span = document.createElement('span');
                        span.className = colorClass;
                        while (cell.firstChild) span.appendChild(cell.firstChild);
                        cell.appendChild(span);
                    }
                }

                // 3. Pulizia di span rimasti vuoti o privi di attributi
                cell.querySelectorAll('span').forEach(sp => {
                    if (sp.classList.length === 0 && !sp.hasAttribute('style') && sp.attributes.length === 0) {
                        const parent = sp.parentNode;
                        while (sp.firstChild) parent.insertBefore(sp.firstChild, sp);
                        sp.remove();
                    }
                });
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

        // GESTIONE ATTENTA DELLA SELEZIONE:
        // Se il cursore o la selezione è attiva dentro l'editor, il range corrente nel DOM vivo è la verità
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

        // SMART ESCAPE SU SPAZI: se non tocca alcuna parola ed è ancora collassato, verifica se siamo in uscita da uno span
        if (!wasAutoExpanded && sel && sel.rangeCount > 0 && sel.isCollapsed && editor && editor.contains(sel.anchorNode)) {
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

        try {
            // 1. Converte tutte le classi attuali in colori finti, ESCLUDENDO l'infrastruttura Widget
            editor.querySelectorAll('*').forEach(el => {
                if (!ColorManager._isSafeToColor(el)) return;

                if (type === 'highlight') {
                    for (let cls in ColorManager.magicHl) {
                        if (el.classList.contains(cls)) { 
                            el.style.backgroundColor = ColorManager.magicHl[cls].hex; 
                            el.classList.remove(cls); 
                        }
                    }
                } else {
                    for (let cls in ColorManager.magicTx) {
                        if (el.classList.contains(cls)) { 
                            el.style.color = ColorManager.magicTx[cls].hex; 
                            el.classList.remove(cls); 
                        }
                    }
                }
            });

            // 2. Comanda al browser di tagliare/fondere i nodi nativamente
            let command = type === 'highlight' ? 'hiliteColor' : 'foreColor';
            if (type === 'highlight' && !document.queryCommandSupported('hiliteColor')) command = 'backColor';

            let targetHex = type === 'highlight' ? ColorManager.removeHl.hex : ColorManager.removeTx.hex;
            if (colorClass && type === 'highlight') targetHex = ColorManager.magicHl[colorClass].hex;
            if (colorClass && type === 'text') targetHex = ColorManager.magicTx[colorClass].hex;

            document.execCommand(command, false, targetHex);

        } finally {
            // 3. Riconversione GARANTITA di tutti i colori finti nelle rispettive classi CSS
            const cleanStr = str => str ? str.replace(/\s+/g, '').toLowerCase() : '';
            
            editor.querySelectorAll('*').forEach(el => {
                if (!ColorManager._isSafeToColor(el)) return;

                if (type === 'highlight') {
                    const bg = cleanStr(el.style.backgroundColor);
                    if (bg === cleanStr(ColorManager.removeHl.rgb) || bg === cleanStr(ColorManager.removeHl.hex)) {
                        el.style.backgroundColor = '';
                        // Neutralizza l'eventuale background temporaneo dei genitori per evitare ripristini spuri
                        let p = el.parentNode;
                        while (p && p.id !== 'noteContent') {
                            for (let cls in ColorManager.magicHl) {
                                if (p.style && (cleanStr(p.style.backgroundColor) === cleanStr(ColorManager.magicHl[cls].rgb) || cleanStr(p.style.backgroundColor) === cleanStr(ColorManager.magicHl[cls].hex))) {
                                    p.style.backgroundColor = '';
                                }
                            }
                            p = p.parentNode;
                        }
                    } else {
                        for (let cls in ColorManager.magicHl) {
                            if (bg === cleanStr(ColorManager.magicHl[cls].rgb) || bg === cleanStr(ColorManager.magicHl[cls].hex)) {
                                el.classList.add(cls); 
                                el.style.backgroundColor = ''; 
                                break;
                            }
                        }
                    }
                } else {
                    const fgAttr = el.hasAttribute('color') ? cleanStr(el.getAttribute('color')) : '';
                    const fg = cleanStr(el.style.color) || fgAttr;
                    if (fg === cleanStr(ColorManager.removeTx.rgb) || fg === cleanStr(ColorManager.removeTx.hex)) { 
                        el.style.color = ''; 
                        el.removeAttribute('color'); 
                        // Neutralizza l'eventuale colore temporaneo dei genitori per evitare che riassegnino la classe .tx-c*
                        let p = el.parentNode;
                        while (p && p.id !== 'noteContent') {
                            for (let cls in ColorManager.magicTx) {
                                if (p.style && (cleanStr(p.style.color) === cleanStr(ColorManager.magicTx[cls].rgb) || cleanStr(p.style.color) === cleanStr(ColorManager.magicTx[cls].hex))) {
                                    p.style.color = '';
                                }
                            }
                            p = p.parentNode;
                        }
                    } else {
                        for (let cls in ColorManager.magicTx) {
                            if (fg === cleanStr(ColorManager.magicTx[cls].rgb) || fg === cleanStr(ColorManager.magicTx[cls].hex)) {
                                el.classList.add(cls); 
                                el.style.color = ''; 
                                el.removeAttribute('color'); 
                                break;
                            }
                        }
                    }
                }
            });

            // 4. Pulizia definitiva dei nodi e attributi svuotati
            let changed = true;
            while (changed) {
                changed = false;
                editor.querySelectorAll('*').forEach(el => {
                    if (!ColorManager._isSafeToColor(el)) return;

                    if (el.getAttribute('class') === '') el.removeAttribute('class');
                    if (el.getAttribute('style') === '') el.removeAttribute('style');
                    if (el.getAttribute('color') === '') el.removeAttribute('color');

                    if (el.tagName === 'SPAN' || el.tagName === 'FONT') {
                        if (el.attributes.length === 0 || (el.classList.length === 0 && !el.hasAttribute('style'))) {
                            const parent = el.parentNode;
                            while (el.firstChild) parent.insertBefore(el.firstChild, el);
                            parent.removeChild(el);
                            changed = true;
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
        // disattiva la selezione e collassa il cursore a fine parola per prevenire la sovrascrittura accidentale del testo
        if (wasAutoExpanded) {
            const currentSel = window.getSelection();
            if (currentSel && currentSel.rangeCount > 0) {
                currentSel.collapseToEnd();
                if (typeof Editor !== 'undefined') {
                    Editor.savedRange = currentSel.getRangeAt(0).cloneRange();
                }
            }
        }

        Store.triggerAutoSave();
        Editor.updateToolbarFormatting();
    }
};