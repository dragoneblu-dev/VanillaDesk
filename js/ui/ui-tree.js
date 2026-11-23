/**
 * ui-tree.js
 * Modulo dedicato al rendering dell'albero gerarchico laterale delle note e alla navigazione tra le schede.
 * I nodi virtuali dei database sono delegati a 'ui-tree-db.js'.
 * La logica di Drag & Drop è delegata a 'ui-tree-dnd.js'.
 * Include:
 * - Navigazione schede (Note, Preferiti, Segnalibri, Database).
 * - Rendering gerarchico delle note standard e record note (renderTree, buildTreeElement).
 * - Iniezione contestuale del Database e della Record Note attiva direttamente dentro la nota ospite nella scheda "Note".
 * - Matching delle proprietà della pagina delegato al motore centrale AppState.matchesPropertyFilters.
 * - Ricerca testuale multi-termine in AND logico tramite ';' e stringhe letterali tra doppie virgolette '"..."'
 *   con valutazione per ambito (Stesso paragrafo, Stesso capitolo con titolo compreso, Tutta la nota).
 * - Estrazione testo indicizzabile da note, blocchi codice, URL dei link (href / data-file-path) e diari (extractSearchableText).
 * - Anteprima contestuale in hover sui risultati della ricerca nella sidebar:
 *   - Card distinte dinamiche suddivise in pagine in base allo spazio verticale disponibile;
 *   - In modalità multi-termine AND mostra solo i periodi/righe con i match dell'ambito selezionato garantendo
 *     copertura ed evidenziazione differenziata hl-c5..hl-c10 per ciascun termine;
 *   - Nessun titolo della nota ripetuto in testa all'anteprima;
 *   - Navigazione delle occorrenze sia tramite scrubbing orizzontale sulla riga (sospeso mentre ALT è premuto o
 *     dopo interazione con la rotella) sia tramite ALT + Rotella del mouse;
 *   - Intestazione informativa sul comando "Alt + Rotella" visibile quando l'anteprima si estende su più pagine;
 *   - Evidenziazione card tramite solo bordo colorato coerente col tema (senza cambio sfondo);
 *   - Chiusura immediata del riquadro di anteprima quando il cursore raggiunge '+' (node-add-btn)
 *     o al click di selezione della nota, con ripristino su successivo movimento reale del mouse;
 *   - Salto diretto all'occorrenza evidenziata al click sulla nota.
 * - TOC dinamico per capitoli H1, H2, H3 (scrollToHeader).
 * - Evidenziazione del nodo attivo nella sidebar (highlightTreeNode).
 * - Feedback esplicito e pulsanti di reset quando ricerca e filtri tag non producono riscontri.
 * - Ricorsione gerarchica sui figli delle record note con ereditarietà dell'icona verde di database.
 * - Normalizzazione tra spazi ASCII e &nbsp; (\u00A0) in extractSearchableText e matching.
 * - Cattura multiriga dei commenti dei segnalibri e auto-scroll sul nodo attivo nell'albero.
 */

Object.assign(UI, {
    _activeRecordDbIds: null,
    _activeRecordHostNoteIds: null,
    _activeRecordDbInjected: false,
    _searchPreviewTimer: null,
    _searchPreviewState: null,
    _lastSearchHoverClientX: null,
    _searchPreviewDismissPos: null,

    _getValidChapterNoteScope: (note, lowerTerms) => {
        const rawTitle = (note && note.title ? note.title : '').replace(/\u00A0/g, ' ');
        const lowerTitle = rawTitle.toLowerCase();
        const sections = [{ level: 0, nodes: [], text: lowerTitle }];

        if (!note || !note.content) {
            const titleOk = lowerTerms.every(t => lowerTitle.includes(t));
            return { hasMatch: titleOk, validTitle: titleOk ? rawTitle : '', validHtml: '' };
        }

        const temp = document.createElement('div');
        temp.innerHTML = note.content
            .replace(/<iframe\b[^>]*>([\s\S]*?<\/iframe>)?/gi, '')
            .replace(/<script\b[^>]*>([\s\S]*?<\/script>)?/gi, '')
            .replace(/<style\b[^>]*>([\s\S]*?<\/style>)?/gi, '');

        const getNodeSearchText = (el) => {
            if (el.nodeType === 3) {
                return (el.nodeValue || '').replace(/\u00A0/g, ' ').replace(/[\u200B\uFEFF]/g, '').toLowerCase();
            }
            if (el.nodeType !== 1) return '';
            let txt = (el.textContent || '').replace(/\u00A0/g, ' ').replace(/[\u200B\uFEFF]/g, '').toLowerCase();

            // Integra il testo dai widget autonomi (codice e diari) presenti nel blocco
            if (AppState.databases && el.id) {
                const trueId = el.id.split('_cited_')[0];
                const st = AppState.databases[trueId];
                if (st) {
                    if (st.content) txt += ' ' + st.content.toLowerCase();
                    if (st.title) txt += ' ' + st.title.toLowerCase();
                    if (Array.isArray(st.entries)) {
                        st.entries.forEach(ent => {
                            if (ent.content) txt += ' ' + ent.content.replace(/<[^>]*>?/gm, '').toLowerCase();
                        });
                    }
                }
            }
            return txt;
        };

        const activeStack = [sections[0]];
        const topNodes = Array.from(temp.childNodes);

        topNodes.forEach(el => {
            if (el.nodeType !== 1 && (el.nodeType !== 3 || !el.nodeValue.trim())) return;
            const m = (el.nodeType === 1 && el.tagName) ? el.tagName.match(/^H([1-6])$/i) : null;
            const elText = getNodeSearchText(el);

            if (m) {
                const lvl = parseInt(m[1], 10);
                while (activeStack.length > 1 && activeStack[activeStack.length - 1].level >= lvl) {
                    activeStack.pop();
                }
                const sec = { level: lvl, nodes: [el], text: elText };
                sections.push(sec);
                activeStack.push(sec);
                for (let s = 1; s < activeStack.length - 1; s++) {
                    activeStack[s].nodes.push(el);
                    activeStack[s].text += ' ' + elText;
                }
            } else {
                if (activeStack.length === 1) {
                    activeStack[0].nodes.push(el);
                    activeStack[0].text += ' ' + elText;
                } else {
                    for (let s = 1; s < activeStack.length; s++) {
                        activeStack[s].nodes.push(el);
                        activeStack[s].text += ' ' + elText;
                    }
                }
            }
        });

        const validNodesSet = new Set();
        let anySectionMatch = false;

        sections.forEach(sec => {
            if (lowerTerms.every(t => sec.text.includes(t))) {
                anySectionMatch = true;
                sec.nodes.forEach(n => validNodesSet.add(n));
            }
        });

        const isTitleValid = lowerTerms.every(t => sections[0].text.includes(t));
        let validHtml = '';
        topNodes.forEach(el => {
            if (validNodesSet.has(el)) {
                validHtml += (el.nodeType === 1) ? el.outerHTML : UI.escapeHTML(el.nodeValue);
            }
        });

        return {
            hasMatch: anySectionMatch,
            validTitle: isTitleValid ? rawTitle : '',
            validHtml
        };
    },

    matchesMultiTermScope: (note, lowerTerms, scope = 'paragraph') => {
        if (!note || !lowerTerms || lowerTerms.length === 0) return false;
        const normTitle = (note.title || "").toLowerCase().replace(/\u00A0/g, ' ');

        if (scope === 'note' || lowerTerms.length === 1) {
            const normContent = UI.extractSearchableText(note.content || "").toLowerCase();
            return lowerTerms.every(t => normTitle.includes(t) || normContent.includes(t));
        }

        // Pre-check rapido sull'intera nota: evita il parsing DOM per note che non contengono tutti i termini
        const normContent = UI.extractSearchableText(note.content || "").toLowerCase();
        if (!lowerTerms.every(t => normTitle.includes(t) || normContent.includes(t))) {
            return false;
        }

        if (scope === 'paragraph') {
            if (lowerTerms.every(t => normTitle.includes(t))) return true;
            const lines = UI._extractSearchPreviewLines(note);
            return lines.some(line => {
                const lowerLine = line.toLowerCase();
                return lowerTerms.every(t => lowerLine.includes(t));
            });
        }

        if (scope === 'chapter') {
            return UI._getValidChapterNoteScope(note, lowerTerms).hasMatch;
        }

        return false;
    },

    _highlightTextSegment: (rawText, termsOrTerm) => {
        if (!rawText) return '';
        const terms = Array.isArray(termsOrTerm)
            ? termsOrTerm.filter(Boolean)
            : (termsOrTerm ? [termsOrTerm] : []);
        if (terms.length === 0) return UI.escapeHTML(rawText);

        const isMultiTerm = terms.length > 1;
        const termObjs = terms.map((t, idx) => ({
            raw: t,
            lower: t.toLowerCase(),
            colorClass: isMultiTerm ? `hl-c${5 + (idx % 6)}` : ''
        }));

        const sorted = [...termObjs].sort((a, b) => b.raw.length - a.raw.length);
        const pattern = sorted.map(o => o.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const regex = new RegExp(`(${pattern})`, 'gi');

        const parts = rawText.split(regex);
        let result = '';
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) continue;
            if (i % 2 === 1) {
                let cls = 'search-highlight';
                if (isMultiTerm) {
                    const lowerPart = part.toLowerCase();
                    const matchedObj = sorted.find(o => o.lower === lowerPart);
                    if (matchedObj) cls += ` ${matchedObj.colorClass}`;
                }
                result += `<mark class="${cls}" style="padding:0 2px;">${UI.escapeHTML(part)}</mark>`;
            } else {
                result += UI.escapeHTML(part);
            }
        }
        return result;
    },

    _extractMatchedWindows: (line, matchSpans, windowBudget = 700) => {
        if (!line || !matchSpans || matchSpans.length === 0) return line;

        // Raggruppa occorrenze vicine in un'unica finestra continua
        const groups = [];
        let curGroup = [matchSpans[0]];
        for (let i = 1; i < matchSpans.length; i++) {
            const span = matchSpans[i];
            if (span.end - curGroup[0].start <= windowBudget - 40) {
                curGroup.push(span);
            } else {
                groups.push(curGroup);
                curGroup = [span];
            }
        }
        groups.push(curGroup);

        const chunks = [];
        let prevEnd = -1;

        groups.forEach((grp) => {
            const firstPos = grp[0].start;
            const lastEnd = grp[grp.length - 1].end;
            const spanLen = lastEnd - firstPos;
            const pad = Math.max(40, Math.floor((windowBudget - spanLen) / 2));

            let start = Math.max(0, firstPos - pad);
            let end = Math.min(line.length, lastEnd + pad);

            // Recupero asimmetrico del budget se la parola è vicina all'inizio o alla fine del paragrafo
            if (end === line.length) {
                start = Math.max(0, end - windowBudget);
            } else if (start === 0) {
                end = Math.min(line.length, windowBudget);
            }

            if (start > 0) {
                const nextSpace = line.indexOf(' ', start);
                if (nextSpace !== -1 && nextSpace < firstPos) start = nextSpace + 1;
            }
            if (end < line.length) {
                const prevSpace = line.lastIndexOf(' ', end);
                if (prevSpace > lastEnd) end = prevSpace;
            }

            // Evita sovrapposizioni tra finestre adiacenti
            if (prevEnd !== -1 && start <= prevEnd) {
                start = prevEnd;
            }

            const prefix = (start > 0 && prevEnd === -1) ? '…' : '';
            const suffix = end < line.length ? '…' : '';
            chunks.push(prefix + line.slice(start, end).trim() + suffix);
            prevEnd = end;
        });

        return chunks.join(' ');
    },

    _extractSearchPreviewLines: (note) => {
        const lines = [];
        if (note && note.content) {
            const cleanMarkup = note.content
                .replace(/<iframe\b[^>]*>([\s\S]*?<\/iframe>)?/gi, '')
                .replace(/<script\b[^>]*>([\s\S]*?<\/script>)?/gi, '')
                .replace(/<style\b[^>]*>([\s\S]*?<\/style>)?/gi, '')
                .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>|<br\s*[\/]?>|<hr\s*[\/]?>/gi, '\n')
                .replace(/<\/(td|th)>/gi, ' | ');

            const temp = document.createElement('div');
            temp.innerHTML = cleanMarkup;

            const rawText = (temp.textContent || temp.innerText || '')
                .replace(/\u00A0/g, ' ')
                .replace(/[\u200B\uFEFF]/g, '');

            rawText.split('\n').forEach(l => {
                const trimmed = l.trim();
                if (trimmed) lines.push(trimmed);
            });

            // Integra eventuali righe dai blocchi di codice e diari collegati
            if (AppState.databases) {
                const codeRegex = /\sid=["'](adv_code_[^"']+)["']/g;
                let m;
                while ((m = codeRegex.exec(note.content)) !== null) {
                    const st = AppState.databases[m[1].split('_cited_')[0]];
                    if (st && st.content) {
                        st.content.split('\n').forEach(l => {
                            const t = l.trim();
                            if (t) lines.push(t);
                        });
                    }
                }

                const journalRegex = /\sid=["'](adv_journal_[^"']+)["']/g;
                while ((m = journalRegex.exec(note.content)) !== null) {
                    const st = AppState.databases[m[1].split('_cited_')[0]];
                    if (st && Array.isArray(st.entries)) {
                        st.entries.forEach(entry => {
                            if (entry.content) {
                                const t = entry.content.replace(/<[^>]*>?/gm, '').replace(/\u00A0/g, ' ').trim();
                                if (t) lines.push(t);
                            }
                        });
                    }
                }
            }
        }
        return lines;
    },

    _createPreviewCardElement: (entry, lines, terms, isMultiTerm) => {
        const MAX_CARD_CHARS = 520;
        const MAX_SINGLE_LINE = 700;
        const { lineIdx: idx, spans } = entry;
        const matchCountInLine = spans.length;
        const rawMatchLine = lines[idx];

        const singleLineLimit = MAX_SINGLE_LINE * matchCountInLine;
        const matchDisplay = rawMatchLine.length > singleLineLimit
            ? UI._extractMatchedWindows(rawMatchLine, spans, MAX_SINGLE_LINE)
            : rawMatchLine;

        const beforeLines = [];
        const afterLines = [];

        // In modalità multi-termine (AND) mostriamo solo il periodo/riga con le parole ricercate
        // per evitare confusione con periodi precedenti o successivi.
        if (!isMultiTerm) {
            const cardBudget = MAX_CARD_CHARS * matchCountInLine;
            let remaining = cardBudget - matchDisplay.length;

            // Aggiunge le righe di contesto (1 prima, fino a 2 dopo) solo se entrano per intero nel budget residuo
            if (remaining > 0 && idx - 1 >= 0 && lines[idx - 1].length <= remaining) {
                beforeLines.push(lines[idx - 1]);
                remaining -= lines[idx - 1].length;
            }
            for (let offset = 1; offset <= 2; offset++) {
                const nextIdx = idx + offset;
                if (remaining > 0 && nextIdx < lines.length && lines[nextIdx].length <= remaining) {
                    afterLines.push(lines[nextIdx]);
                    remaining -= lines[nextIdx].length;
                } else {
                    break;
                }
            }
        }

        let rowsHtml = '';
        beforeLines.forEach(l => {
            rowsHtml += `<div style="opacity:0.68; font-size:0.76rem; padding:1px 0;">${UI.escapeHTML(l)}</div>`;
        });
        rowsHtml += `<div style="color:var(--tooltip-text); font-weight:500; padding:2px 0;">${UI._highlightTextSegment(matchDisplay, terms)}</div>`;
        afterLines.forEach(l => {
            rowsHtml += `<div style="opacity:0.68; font-size:0.76rem; padding:1px 0;">${UI.escapeHTML(l)}</div>`;
        });

        const cardEl = document.createElement('div');
        cardEl.dataset.entryIdx = String(entry.globalCardIdx);
        cardEl.style.cssText = 'background:color-mix(in srgb, var(--bg-color) 55%, transparent); border:1px solid var(--border-color); border-radius:6px; padding:8px 10px; transition:border-color 0.1s ease, box-shadow 0.1s ease;';
        cardEl.innerHTML = rowsHtml;
        return cardEl;
    },

    _setCardActiveStyle: (cardEl, isActive) => {
        if (!cardEl) return;
        if (isActive) {
            cardEl.style.borderColor = 'var(--accent-color)';
            cardEl.style.boxShadow = 'inset 0 0 0 1px var(--accent-color), 0 2px 8px rgba(0, 0, 0, 0.14)';
        } else {
            cardEl.style.borderColor = 'var(--border-color)';
            cardEl.style.boxShadow = 'none';
        }
    },

    _renderPreviewPage: (state, pageIdx) => {
        const { tooltip, cardsContainer, footerEl, pages, totalEntries } = state;
        const pageEntries = pages[pageIdx] || [];

        cardsContainer.innerHTML = '';
        pageEntries.forEach(item => {
            UI._setCardActiveStyle(item.cardEl, false);
            cardsContainer.appendChild(item.cardEl);
        });

        state.currentPageIdx = pageIdx;
        state.activeCardEl = null;

        if (footerEl) {
            if (pages.length > 1 || totalEntries > 1) {
                footerEl.style.display = 'flex';
                state.footerPageSpan.textContent = pages.length > 1 ? `Pag. ${pageIdx + 1}/${pages.length}` : '';
            } else {
                footerEl.style.display = 'none';
            }
        }

        // Riallinea il bordo inferiore del tooltip per evitare sforamenti dallo schermo al cambio pagina
        if (state.anchorEl && document.body.contains(state.anchorEl)) {
            const rect = state.anchorEl.getBoundingClientRect();
            let topPos = rect.top;
            if (topPos + tooltip.offsetHeight > window.innerHeight - 10) {
                topPos = Math.max(10, window.innerHeight - tooltip.offsetHeight - 10);
            }
            tooltip.style.top = topPos + 'px';
        }
    },

    _selectPreviewEntry: (state, targetIdx) => {
        if (!state || state.isTitleOnly || !state.entries || state.entries.length === 0) return;
        if (targetIdx < 0 || targetIdx >= state.entries.length) return;

        if (state.tooltip && state.tooltip.style.opacity !== '1') {
            state.tooltip.style.opacity = '1';
        }

        if (targetIdx === state.activeEntryIdx && state.activeCardEl) return;

        state.activeEntryIdx = targetIdx;
        const targetPageIdx = state.entryToPage[targetIdx] || 0;

        // Cambia schermata di anteprima solo quando la card attiva appartiene a un'altra pagina
        if (targetPageIdx !== state.currentPageIdx) {
            UI._renderPreviewPage(state, targetPageIdx);
        }

        // Aggiorna in-place esclusivamente lo stile della card precedente e di quella corrente
        if (state.activeCardEl) {
            UI._setCardActiveStyle(state.activeCardEl, false);
        }

        const pageItems = state.pages[targetPageIdx] || [];
        const targetItem = pageItems.find(it => it.entry.globalCardIdx === targetIdx);
        if (targetItem && targetItem.cardEl) {
            UI._setCardActiveStyle(targetItem.cardEl, true);
            state.activeCardEl = targetItem.cardEl;
        }

        if (state.footerCountSpan) {
            state.footerCountSpan.textContent = `${targetIdx + 1} / ${state.entries.length}`;
        }
    },

    _updateSearchPreviewScrub: (noteId, clientX, anchorEl) => {
        const state = UI._searchPreviewState;
        if (!state || state.noteId !== noteId || state.isTitleOnly || !state.entries || state.entries.length === 0) return;

        const rect = anchorEl.getBoundingClientRect();
        // L'area di scrubbing parte dall'inizio effettivo della riga (freccia/icone incluse)
        // e termina prima del pulsante '+' (node-add-btn)
        const addBtn = anchorEl.querySelector('.node-add-btn');
        const scrubLeft = rect.left;
        const scrubRight = addBtn ? (addBtn.getBoundingClientRect().left - 4) : (rect.right - 4);
        const scrubWidth = scrubRight - scrubLeft;
        if (scrubWidth <= 0) return;

        const ratio = Math.max(0, Math.min(0.9999, (clientX - scrubLeft) / scrubWidth));
        const targetIdx = Math.floor(ratio * state.entries.length);

        UI._selectPreviewEntry(state, targetIdx);
    },

    _showSearchPreviewTooltip: (note, rawFilter, anchorEl) => {
        const tooltip = document.getElementById('advCustomTooltip');
        if (!tooltip || !anchorEl || !document.body.contains(anchorEl)) return;

        const terms = (typeof AppState !== 'undefined' && typeof AppState.parseSearchTerms === 'function')
            ? AppState.parseSearchTerms(rawFilter)
            : (rawFilter ? [rawFilter] : []);
        if (terms.length === 0) return;

        const lowerTerms = terms.map(t => t.toLowerCase());
        const isMultiTerm = lowerTerms.length > 1;
        const activeScope = isMultiTerm ? (AppState.multiSearchScope || 'paragraph') : 'note';
        const rawTitle = (note.title || I18n.t('editor.untitled')).replace(/\u00A0/g, ' ');
        const lowerTitle = rawTitle.toLowerCase();

        let titleMatches = false;
        let lines = [];

        if (isMultiTerm && activeScope === 'chapter') {
            const chapterScope = UI._getValidChapterNoteScope(note, lowerTerms);
            titleMatches = chapterScope.validTitle !== '';
            lines = UI._extractSearchPreviewLines({ content: chapterScope.validHtml });
        } else {
            titleMatches = isMultiTerm && activeScope === 'paragraph'
                ? lowerTerms.every(lt => lowerTitle.includes(lt))
                : lowerTerms.some(lt => lowerTitle.includes(lt));
            lines = UI._extractSearchPreviewLines(note);
        }

        // Regex ordinata dal termine più lungo al più corto per garantire parità 1:1 con i <mark> di applyHighlight
        const sortedTerms = [...lowerTerms].sort((a, b) => b.length - a.length);
        const spanRegex = new RegExp(sortedTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

        let matchEntries = [];
        let runningMarkIdx = 0;

        for (let i = 0; i < lines.length; i++) {
            const lowerLine = lines[i].toLowerCase();
            const matchedTermIndices = new Set();

            lowerTerms.forEach((lt, tIdx) => {
                if (lowerLine.includes(lt)) matchedTermIndices.add(tIdx);
            });

            if (matchedTermIndices.size === 0) continue;

            // In modalità 'paragraph', solo le righe con TUTTI i termini generano card e <mark>
            if (isMultiTerm && activeScope === 'paragraph' && matchedTermIndices.size < lowerTerms.length) {
                continue;
            }

            const spans = [];
            spanRegex.lastIndex = 0;
            let m;
            while ((m = spanRegex.exec(lowerLine)) !== null) {
                spans.push({ start: m.index, end: m.index + m[0].length });
            }

            if (spans.length > 0) {
                matchEntries.push({
                    lineIdx: i,
                    spans,
                    matchedTermIndices,
                    firstGlobalMarkIdx: runningMarkIdx
                });
                runningMarkIdx += spans.length;
            }
        }

        if (matchEntries.length === 0 && !titleMatches) return;

        // In modalità multi-termine (AND) diamo priorità alle righe con più termini distinti
        // e garantiamo almeno 1 occorrenza visibile per ciascun termine trovato nel corpo
        if (isMultiTerm && matchEntries.length > 1) {
            const priorityEntries = [];
            const usedLineIndices = new Set();
            const coveredTerms = new Set();

            // 1. Prima le righe che contengono almeno 2 termini distinti (ordinate per numero di termini)
            const multiMatches = matchEntries
                .filter(e => e.matchedTermIndices.size > 1)
                .sort((a, b) => b.matchedTermIndices.size - a.matchedTermIndices.size);

            multiMatches.forEach(e => {
                priorityEntries.push(e);
                usedLineIndices.add(e.lineIdx);
                e.matchedTermIndices.forEach(tIdx => coveredTerms.add(tIdx));
            });

            // 2. Garantisce la prima occorrenza di ogni termine non ancora coperto
            for (let tIdx = 0; tIdx < lowerTerms.length; tIdx++) {
                if (coveredTerms.has(tIdx)) continue;
                const found = matchEntries.find(e => !usedLineIndices.has(e.lineIdx) && e.matchedTermIndices.has(tIdx));
                if (found) {
                    priorityEntries.push(found);
                    usedLineIndices.add(found.lineIdx);
                    found.matchedTermIndices.forEach(ti => coveredTerms.add(ti));
                }
            }

            // 3. Accoda tutte le restanti righe nell'ordine originale del documento
            matchEntries.forEach(e => {
                if (!usedLineIndices.has(e.lineIdx)) priorityEntries.push(e);
            });

            matchEntries = priorityEntries;
        }

        const MAX_CARD_CHARS = 520;

        const rect = anchorEl.getBoundingClientRect();
        const rightSpace = window.innerWidth - rect.right - 24;
        const leftSpace = rect.left - 24;
        const useRight = rightSpace >= 260 || rightSpace >= leftSpace;
        const availableWidth = Math.max(260, Math.min(1000, useRight ? rightSpace : leftSpace));
        const maxHeightPx = Math.max(220, Math.floor(window.innerHeight * 0.82));
        const leftPos = Math.max(10, useRight ? (rect.right + 10) : (rect.left - availableWidth - 10));

        tooltip.style.cssText = `display: block; visibility: hidden; height: auto; min-height: 0; max-height: ${maxHeightPx}px; overflow: hidden; padding: 10px 14px; box-sizing: border-box; width: ${availableWidth}px; max-width: ${availableWidth}px; position: fixed; top: 10px; left: ${leftPos}px; opacity: 1; transition: none; z-index: 100000; pointer-events: none; line-height: 1.45;`;

        if (matchEntries.length > 0) {
            const headerHintText = typeof I18n !== 'undefined'
                ? I18n.t('tree.preview_multipage_hint')
                : 'Alt + Rotella: scorri le occorrenze e le pagine';

            tooltip.innerHTML = `<div style="width:100%; white-space:normal;"><div id="searchTooltipHeader" style="display:none; font-size:0.72rem; color:var(--accent-color); font-weight:600; margin-bottom:6px; padding-bottom:4px; border-bottom:1px dashed var(--border-color);">${UI.escapeHTML(headerHintText)}</div><div id="searchTooltipCards" style="display:flex; flex-direction:column; gap:8px; font-size:0.8rem; line-height:1.45;"></div><div id="searchTooltipFooter" style="display:none; justify-content:space-between; align-items:center; margin-top:8px; padding-top:4px; border-top:1px dashed var(--border-color); font-size:0.72rem; opacity:0.8;"><span id="searchTooltipCount"></span><span id="searchTooltipPage"></span></div></div>`;

            const headerEl = tooltip.querySelector('#searchTooltipHeader');
            const cardsContainer = tooltip.querySelector('#searchTooltipCards');
            const footerEl = tooltip.querySelector('#searchTooltipFooter');
            const footerCountSpan = tooltip.querySelector('#searchTooltipCount');
            const footerPageSpan = tooltip.querySelector('#searchTooltipPage');

            // Mostra temporaneamente il footer durante il calcolo delle pagine per riservarne l'altezza
            if (matchEntries.length > 1) footerEl.style.display = 'flex';

            const cardElements = matchEntries.map((entry, globalIdx) => {
                entry.globalCardIdx = globalIdx;
                return UI._createPreviewCardElement(entry, lines, terms, isMultiTerm);
            });

            const paginateCards = () => {
                cardsContainer.innerHTML = '';
                const pagesList = [[]];
                const mapIdxToPage = [];

                cardElements.forEach((cardEl, globalIdx) => {
                    const entry = matchEntries[globalIdx];
                    cardsContainer.appendChild(cardEl);

                    const curPageIdx = pagesList.length - 1;
                    if (pagesList[curPageIdx].length > 0 && tooltip.scrollHeight > maxHeightPx) {
                        cardsContainer.innerHTML = '';
                        cardsContainer.appendChild(cardEl);
                        pagesList.push([{ entry, cardEl }]);
                        mapIdxToPage[globalIdx] = pagesList.length - 1;
                    } else {
                        pagesList[curPageIdx].push({ entry, cardEl });
                        mapIdxToPage[globalIdx] = curPageIdx;
                    }
                });

                return { pagesList, mapIdxToPage };
            };

            let { pagesList: pages, mapIdxToPage: entryToPage } = paginateCards();

            // Se l'anteprima si estende su più pagine, attiva la riga di intestazione e ricalcola l'altezza delle pagine
            if (pages.length > 1 && headerEl) {
                headerEl.style.display = 'block';
                ({ pagesList: pages, mapIdxToPage: entryToPage } = paginateCards());
            }

            UI._searchPreviewState = {
                noteId: note.id,
                isTitleOnly: false,
                wheelLocked: false,
                wheelAnchorX: null,
                anchorEl,
                tooltip,
                cardsContainer,
                footerEl,
                footerCountSpan,
                footerPageSpan,
                entries: matchEntries,
                pages,
                entryToPage,
                totalEntries: matchEntries.length,
                currentPageIdx: -1,
                activeEntryIdx: -1,
                activeCardEl: null
            };

            const initialX = UI._lastSearchHoverClientX !== null ? UI._lastSearchHoverClientX : rect.left;
            UI._updateSearchPreviewScrub(note.id, initialX, anchorEl);
            tooltip.style.visibility = 'visible';
        } else {
            // Nessuna occorrenza nel corpo (match presente solo sul titolo): mostra solo le prime righe del corpo, mai il titolo
            const headLines = [];
            let headBudget = MAX_CARD_CHARS;
            for (let i = 0; i < Math.min(3, lines.length); i++) {
                if (lines[i].length <= headBudget) {
                    headLines.push(UI.escapeHTML(lines[i]));
                    headBudget -= lines[i].length;
                } else break;
            }

            if (headLines.length === 0) {
                UI._hideSearchPreviewTooltip();
                return;
            }

            tooltip.innerHTML = `<div style="width:100%; white-space:normal; font-size:0.78rem; line-height:1.45; opacity:0.85;">${headLines.join('<br>')}</div>`;

            let topPos = rect.top;
            if (topPos + tooltip.offsetHeight > window.innerHeight - 10) {
                topPos = Math.max(10, window.innerHeight - tooltip.offsetHeight - 10);
            }
            tooltip.style.top = topPos + 'px';
            tooltip.style.visibility = 'visible';

            UI._searchPreviewState = {
                noteId: note.id,
                isTitleOnly: true,
                anchorEl,
                tooltip
            };
        }
    },

    _hideSearchPreviewTooltip: () => {
        clearTimeout(UI._searchPreviewTimer);
        UI._searchPreviewTimer = null;
        UI._searchPreviewState = null;
        UI._lastSearchHoverClientX = null;
        const tooltip = document.getElementById('advCustomTooltip');
        if (tooltip) {
            tooltip.style.cssText = '';
            tooltip.innerHTML = '';
        }
    },

    _dismissSearchPreviewOnClick: (clientX, clientY) => {
        UI._searchPreviewDismissPos = { x: clientX, y: clientY };
        UI._hideSearchPreviewTooltip();
    },

    _isSearchPreviewDismissed: (clientX, clientY) => {
        const pos = UI._searchPreviewDismissPos;
        if (!pos) return false;
        if (typeof clientX === 'number' && typeof clientY === 'number') {
            if (Math.abs(clientX - pos.x) > 2 || Math.abs(clientY - pos.y) > 2) {
                UI._searchPreviewDismissPos = null;
                return false;
            }
        }
        return true;
    },

    _getRecordDbHostChain: (noteId) => {
        const dbIds = new Set();
        const hostNotes = [];
        const visitedNotes = new Set();

        let curr = noteId && typeof Store !== 'undefined' ? Store.getNote(noteId) : null;
        while (curr && !visitedNotes.has(curr.id)) {
            visitedNotes.add(curr.id);
            if (curr.isRecordNote && curr.linkedTableId && curr.linkedTableId !== 'SYS_PROPERTIES_DB') {
                let dbId = curr.linkedTableId;
                const linkedDb = AppState.databases ? AppState.databases[dbId] : null;
                if (linkedDb && linkedDb.isLinkedView && linkedDb.sourceTableId) {
                    dbId = linkedDb.sourceTableId;
                }
                dbIds.add(dbId);

                // Individua la nota ospite attiva che contiene il widget reale (escludendo le citazioni)
                const hostRegex = new RegExp(`\\sid=["']${dbId}["']`);
                const hostNote = (AppState.notes || []).find(n =>
                    !n.deletedAt && n.content && n.content.includes(dbId) && hostRegex.test(n.content)
                );
                if (hostNote) {
                    hostNotes.push(hostNote);
                    curr = hostNote;
                    continue;
                }
                break;
            }
            curr = curr.parentId ? Store.getNote(curr.parentId) : null;
        }
        return { dbIds, hostNotes };
    },

    _updateTabsUI: (mode) => {
        ['notes', 'favorites', 'bookmarks', 'databases'].forEach(t => {
            const btn = document.getElementById('tab-' + t);
            if (btn) {
                if (t === mode) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });
    },

    clearTagFilters: () => {
        AppState.activePropertyFilters = [];
        if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
            SidebarManager.SearchAutocomplete.renderPills();
        }
        if (typeof EventsGlobal !== 'undefined' && typeof EventsGlobal._triggerSearchUpdate === 'function') {
            EventsGlobal._triggerSearchUpdate();
        }
    },

    clearSearchAndFilters: () => {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        AppState.searchFilter = '';
        AppState.activePropertyFilters = [];
        if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
            SidebarManager.SearchAutocomplete.renderPills();
        }
        if (typeof Editor !== 'undefined' && typeof Editor.cleanHighlightsBeforeSave === 'function') {
            Editor.cleanHighlightsBeforeSave();
        }
        if (typeof EventsGlobal !== 'undefined' && typeof EventsGlobal._triggerSearchUpdate === 'function') {
            EventsGlobal._triggerSearchUpdate();
        }
    },

    switchToNotes: () => {
        AppState.showFavoritesInTree = false;
        AppState.showBookmarksInTree = false;
        AppState.showDbNotesInTree = false;
        UI._updateTabsUI('notes');
        UI.renderTree();
        if (AppState.searchFilter || (AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0)) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.dispatchEvent(new Event('input'));
        }
    },

    toggleFavoritesInTree: () => {
        AppState.showFavoritesInTree = true;
        AppState.showBookmarksInTree = false;
        AppState.showDbNotesInTree = false;
        UI._updateTabsUI('favorites');
        UI.renderTree();
        if (AppState.searchFilter || (AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0)) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.dispatchEvent(new Event('input'));
        }
    },

    toggleBookmarksInTree: () => {
        AppState.showBookmarksInTree = true;
        AppState.showFavoritesInTree = false;
        AppState.showDbNotesInTree = false;
        UI._updateTabsUI('bookmarks');
        UI.renderTree();
        if (AppState.searchFilter || (AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0)) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.dispatchEvent(new Event('input'));
        }
    },

    toggleDbNotesInTree: () => {
        AppState.showDbNotesInTree = true;
        AppState.showFavoritesInTree = false;
        AppState.showBookmarksInTree = false;
        UI._updateTabsUI('databases');
        UI.renderTree();
        if (AppState.searchFilter || (AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0)) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.dispatchEvent(new Event('input'));
        }
    },

    renderTree: () => {
        const container = document.getElementById('treeContainer');
        if (!container) return;

        // Ascolto ALT + Rotella del mouse per scorrere le occorrenze/pagine nell'anteprima della ricerca
        if (!container._hasPreviewWheelHandler) {
            container._hasPreviewWheelHandler = true;
            container.addEventListener('wheel', (e) => {
                const state = UI._searchPreviewState;
                if (!e.altKey || !state || state.isTitleOnly || !state.entries || state.entries.length <= 1) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();

                const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
                if (delta === 0) return;

                const step = delta > 0 ? 1 : -1;
                const curIdx = state.activeEntryIdx >= 0 ? state.activeEntryIdx : 0;
                const nextIdx = Math.max(0, Math.min(state.entries.length - 1, curIdx + step));

                state.wheelLocked = true;
                state.wheelAnchorX = e.clientX;
                UI._selectPreviewEntry(state, nextIdx);
            }, { passive: false });
        }

        UI._hideSearchPreviewTooltip();
        
        // Pulizia immediata dell'evidenziazione di drag ad ogni ciclo di render
        container.classList.remove('drag-over-root');
        container.innerHTML = "";
        
        AppState._globalHighlights = 0;

        // Assicura che il database di sistema delle proprietà sia sincronizzato con tutte le note attuali
        if (typeof AdvancedTable !== 'undefined' && typeof AdvancedTable.ensureSystemPropertiesDB === 'function') {
            AdvancedTable.ensureSystemPropertiesDB();
        }

        const hasFilterText = AppState.searchFilter && AppState.searchFilter.length > 0;
        const hasFilterProp = AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0;
        const reqBook = AppState.showBookmarksInTree;
        const reqFav = AppState.showFavoritesInTree;
        const isFiltering = hasFilterText || hasFilterProp || reqBook || reqFav;

        // 1. Modalità Esplicita Database (Mostra solo l'elenco dei database e delle viste collegate)
        if (AppState.showDbNotesInTree) {
            if (AppState.databases) {
                const sortedDbIds = Object.keys(AppState.databases)
                    .filter(dbId => {
                        const dbState = AppState.databases[dbId];
                        const isCodeOrBtn = dbId.includes('adv_code_') || dbId.includes('adv_btnbar_') || dbId.includes('adv_cols_');
                        const isPivotOrLink = dbState && (dbState.isPivot || dbState.isLinkedView);
                        return dbState && !isCodeOrBtn && !isPivotOrLink && dbId !== 'SYS_PROPERTIES_DB';
                    })
                    .sort((a, b) => {
                        const titleA = AppState.databases[a]?.title || '';
                        const titleB = AppState.databases[b]?.title || '';
                        return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
                    });

                sortedDbIds.forEach(dbId => {
                    const dbState = AppState.databases[dbId];
                    const dbNotes = AppState.notes
                        .filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === dbId)
                        .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' }));

                    const el = UI.buildDatabaseVirtualTreeElement(dbId, dbState, dbNotes, false, true);
                    if (el) container.appendChild(el);
                });
            }
        } 
        // 2. Modalità Struttura Classica (Tab Note)
        else {
            UI._activeRecordDbIds = null;
            UI._activeRecordHostNoteIds = null;
            UI._activeRecordDbInjected = false;

            let activeRecordRootDbId = null;
            if (!isFiltering && AppState.currentNoteId) {
                const hostChain = UI._getRecordDbHostChain(AppState.currentNoteId);
                if (hostChain.dbIds.size > 0) {
                    UI._activeRecordDbIds = hostChain.dbIds;
                    UI._activeRecordHostNoteIds = new Set(hostChain.hostNotes.map(n => n.id));
                    let curr = Store.getNote(AppState.currentNoteId);
                    while (curr) {
                        if (curr.isRecordNote && curr.linkedTableId && curr.linkedTableId !== 'SYS_PROPERTIES_DB') {
                            let dbId = curr.linkedTableId;
                            const linkedDb = AppState.databases ? AppState.databases[dbId] : null;
                            if (linkedDb && linkedDb.isLinkedView && linkedDb.sourceTableId) {
                                dbId = linkedDb.sourceTableId;
                            }
                            activeRecordRootDbId = dbId;
                            break;
                        }
                        curr = curr.parentId ? Store.getNote(curr.parentId) : null;
                    }
                }
            }

            try {
                const roots = Store.getChildren(null).filter(n => !n.isRecordNote);
                roots.forEach(node => { 
                    const el = UI.buildTreeElement(node); 
                    if (el) container.appendChild(el); 
                });

                // Fallback esclusivamente se il database del record attivo è orfano o contenuto in una nota nel Cestino
                if (!isFiltering && activeRecordRootDbId && !UI._activeRecordDbInjected && AppState.databases && AppState.databases[activeRecordRootDbId]) {
                    const dbState = AppState.databases[activeRecordRootDbId];
                    const dbNotes = AppState.notes
                        .filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === activeRecordRootDbId)
                        .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' }));
                    
                    const el = UI.buildDatabaseVirtualTreeElement(activeRecordRootDbId, dbState, dbNotes, true, false);
                    if (el) {
                        const sep = document.createElement('div');
                        sep.style.cssText = "height: 1px; background: var(--border-color); margin: 15px 10px; opacity: 0.5;";
                        container.appendChild(sep);
                        container.appendChild(el);
                    }
                }
            } finally {
                UI._activeRecordDbIds = null;
                UI._activeRecordHostNoteIds = null;
                UI._activeRecordDbInjected = false;
            }
        }

        // 3. GESTIONE STATO DI RICERCA A ZERO RISULTATI
        if (container.children.length === 0 && isFiltering) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'tree-empty-search-state';
            emptyDiv.style.cssText = 'padding: 24px 14px; text-align: center; color: var(--text-secondary); font-size: 0.85rem; display: flex; flex-direction: column; align-items: center; gap: 12px;';

            let msg = '';
            let buttonsHtml = '';

            if (hasFilterText && hasFilterProp) {
                msg = I18n.t('tree.empty_search_text_and_tags');
                const btnTagLabel = I18n.t('tree.btn_clear_tag_filters');
                const btnAllLabel = I18n.t('tree.btn_clear_all_search');

                buttonsHtml = `
                    <div style="display:flex; flex-direction:column; gap:6px; width:100%; max-width:220px;">
                        <button class="btn" style="padding:4px 8px; font-size:0.75rem; justify-content:center; color:var(--accent-color); border-color:var(--accent-color); cursor:pointer;" onclick="UI.clearTagFilters()">
                            ${btnTagLabel}
                        </button>
                        <button class="btn" style="padding:4px 8px; font-size:0.75rem; justify-content:center; cursor:pointer;" onclick="UI.clearSearchAndFilters()">
                            ${btnAllLabel}
                        </button>
                    </div>
                `;
            } else if (hasFilterProp) {
                msg = I18n.t('tree.empty_search_tags');
                const btnTagLabel = I18n.t('tree.btn_clear_tag_filters');

                buttonsHtml = `
                    <button class="btn" style="padding:4px 10px; font-size:0.8rem; justify-content:center; color:var(--accent-color); border-color:var(--accent-color); cursor:pointer;" onclick="UI.clearTagFilters()">
                        ${btnTagLabel}
                    </button>
                `;
            } else if (hasFilterText) {
                const termSafe = UI.escapeHTML(AppState.searchFilter);
                msg = I18n.t('tree.empty_search_text', { term: termSafe });
                const btnTextLabel = I18n.t('tree.btn_clear_search_text');

                buttonsHtml = `
                    <button class="btn" style="padding:4px 10px; font-size:0.8rem; justify-content:center; cursor:pointer;" onclick="UI.clearSearchAndFilters()">
                        ${btnTextLabel}
                    </button>
                `;
            } else if (reqBook || reqFav) {
                msg = reqBook ? I18n.t('tree.empty_bookmarks') : I18n.t('tree.empty_favorites');
            }

            emptyDiv.innerHTML = `
                <span style="opacity:0.5; font-size:1.6rem; display:inline-flex;">🔍</span>
                <span style="line-height:1.45;">${msg}</span>
                ${buttonsHtml}
            `;
            container.appendChild(emptyDiv);
        }
    },

    extractSearchableText: (htmlContent) => {
        if (!htmlContent) return "";

        const cleanMarkup = htmlContent
            .replace(/<iframe\b[^>]*>([\s\S]*?<\/iframe>)?/gi, '')
            .replace(/<script\b[^>]*>([\s\S]*?<\/script>)?/gi, '')
            .replace(/<style\b[^>]*>([\s\S]*?<\/style>)?/gi, '')
            .replace(/<\/(p|div|li|h[1-6]|blockquote|tr|td|th)>|<br\s*[\/]?>|<hr\s*[\/]?>/gi, ' ');

        const temp = document.createElement('div');
        temp.innerHTML = cleanMarkup;

        let pureText = temp.textContent || temp.innerText || "";
        
        temp.querySelectorAll('.inline-note-data, .bookmark-comment-data').forEach(el => {
            pureText += " " + (el.innerHTML || "");
        });
        
        temp.querySelectorAll('.inline-note-marker[data-tooltip], .adv-bookmark-marker[data-tooltip]').forEach(el => {
            pureText += " " + (el.getAttribute('data-tooltip') || "");
        });
        
        temp.querySelectorAll('a[data-link-note]').forEach(el => {
            pureText += " " + (el.getAttribute('data-link-note') || "");
        });

        // Estrazione degli URL reali e dei percorsi file dai link (evitando duplicazioni se già uguali al testo visibile)
        temp.querySelectorAll('a').forEach(el => {
            const linkText = (el.textContent || '').trim();
            const href = el.getAttribute('href');
            if (href && href !== '#' && !href.startsWith('javascript:') && !linkText.includes(href)) {
                pureText += " " + href;
            }
            const filePath = el.getAttribute('data-file-path');
            if (filePath && !linkText.includes(filePath)) {
                pureText += " " + filePath;
            }
        });

        // ESTRAZIONE CONTENUTO BLOCCHI DI CODICE (Sia montati che deidratati in AppState.databases)
        temp.querySelectorAll('[id^="adv_code_"], .code-wrapper, [data-widget-type="code"]').forEach(el => {
            const pre = el.querySelector('pre');
            if (pre && pre.textContent.trim()) {
                pureText += " " + pre.textContent;
            } else if (el.id && AppState.databases) {
                const trueId = el.id.split('_cited_')[0];
                const codeState = AppState.databases[trueId];
                if (codeState) {
                    if (codeState.content) pureText += " " + codeState.content;
                    if (codeState.title) pureText += " " + codeState.title;
                }
            }
        });

        // Controllo aggiuntivo per identificatori di blocchi codice tramite Regex nel markup
        if (AppState.databases) {
            const codeRegex = /\sid=["'](adv_code_[^"']+)["']/g;
            let match;
            while ((match = codeRegex.exec(htmlContent)) !== null) {
                const trueId = match[1].split('_cited_')[0];
                const codeState = AppState.databases[trueId];
                if (codeState) {
                    if (codeState.content && !pureText.includes(codeState.content)) {
                        pureText += " " + codeState.content;
                    }
                    if (codeState.title && !pureText.includes(codeState.title)) {
                        pureText += " " + codeState.title;
                    }
                }
            }
        }

        // ESTRAZIONE CONTENUTO DIARI / LOG
        temp.querySelectorAll('[id^="adv_journal_"], .adv-journal-wrapper, [data-widget-type="journal"]').forEach(el => {
            if (el.id && AppState.databases) {
                const trueId = el.id.split('_cited_')[0];
                const jState = AppState.databases[trueId];
                if (jState && jState.entries) {
                    jState.entries.forEach(entry => {
                        if (entry.content) {
                            pureText += " " + entry.content.replace(/<[^>]*>?/gm, '');
                            if (entry.content.includes('href=') || entry.content.includes('data-file-path=')) {
                                const attrRegex = /(?:href|data-file-path)=["']([^"']+)["']/gi;
                                let attrMatch;
                                while ((attrMatch = attrRegex.exec(entry.content)) !== null) {
                                    const val = attrMatch[1];
                                    if (val && val !== '#' && !val.startsWith('javascript:')) {
                                        pureText += " " + val;
                                    }
                                }
                            }
                        }
                    });
                }
            }
        });

        // PARITÀ SPAZI: Normalizza qualsiasi spazio non-breaking (\u00A0 / &nbsp;) in spazio standard ' '
        // ed estirpa caratteri invisibili di layout per consentire il matching esatto di ricerche con spazi
        pureText = pureText.replace(/\u00A0/g, ' ').replace(/[\u200B\uFEFF]/g, '');

        return pureText;
    },

    _checkNotePropertyMatch: (sysRow, activePropFilters) => {
        return AppState.matchesPropertyFilters(sysRow, activePropFilters);
    },

    buildTreeElement: (node, forceRender = false, isDbBranch = false) => {
        const isDbBranchNode = Boolean(node.isRecordNote || isDbBranch);

        if (node.isRecordNote && !forceRender) {
            const isActivePath = AppState.currentNoteId === node.id ||
                UI.isDescendant(node.id, AppState.currentNoteId) ||
                (UI._activeRecordHostNoteIds && UI._activeRecordHostNoteIds.has(node.id));
            if (!isActivePath) return null;
        }

        const rawFilter = AppState.searchFilter ? AppState.searchFilter.toLowerCase() : null;
        const searchTerms = rawFilter ? AppState.parseSearchTerms(rawFilter) : [];
        const hasTerms = searchTerms.length > 0;
        const isMultiTerm = searchTerms.length > 1;
        const activeScope = isMultiTerm ? (AppState.multiSearchScope || 'paragraph') : 'note';
        const activePropFilters = AppState.activePropertyFilters || [];
        const reqBook = AppState.showBookmarksInTree;
        const reqFav = AppState.showFavoritesInTree;
        const isDefaultView = !hasTerms && !reqBook && !reqFav && activePropFilters.length === 0;

        let nodeDirectMatch = true;
        let noteMatchCount = 0;
        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];

        if (activePropFilters.length > 0) {
            const sysRow = (propsDb && Array.isArray(propsDb.rows))
                ? propsDb.rows.find(r => r && r.cells && r.cells['sys_c_note'] === node.id)
                : null;
            nodeDirectMatch = UI._checkNotePropertyMatch(sysRow, activePropFilters);
        }

        if (nodeDirectMatch && hasTerms) {
            const normTitle = (node.title || "").toLowerCase().replace(/\u00A0/g, ' ');
            const normContent = UI.extractSearchableText(node.content).toLowerCase();

            // Pre-check rapido comune a tutti gli ambiti: evita parsing DOM su note che non possiedono tutti i termini
            const hasAllTermsInNote = searchTerms.every(t => normTitle.includes(t) || normContent.includes(t));

            const countMatchesInString = (str, termsList) => {
                if (!str) return 0;
                const sorted = [...termsList].sort((a, b) => b.length - a.length);
                const rx = new RegExp(sorted.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
                const matches = str.match(rx);
                return matches ? matches.length : 0;
            };

            if (!hasAllTermsInNote) {
                nodeDirectMatch = false;
            } else if (isMultiTerm && activeScope === 'paragraph') {
                const titleMatched = searchTerms.every(t => normTitle.includes(t));
                const lines = UI._extractSearchPreviewLines(node);
                let lineMatchFound = false;

                if (titleMatched) {
                    noteMatchCount += countMatchesInString(normTitle, searchTerms);
                }

                lines.forEach(line => {
                    const lowerLine = line.toLowerCase();
                    if (searchTerms.every(t => lowerLine.includes(t))) {
                        lineMatchFound = true;
                        noteMatchCount += countMatchesInString(lowerLine, searchTerms);
                    }
                });

                nodeDirectMatch = titleMatched || lineMatchFound;
                AppState._globalHighlights += noteMatchCount;
            } else if (isMultiTerm && activeScope === 'chapter') {
                const chapterScope = UI._getValidChapterNoteScope(node, searchTerms);
                nodeDirectMatch = chapterScope.hasMatch;

                if (nodeDirectMatch) {
                    if (chapterScope.validTitle) {
                        noteMatchCount += countMatchesInString(chapterScope.validTitle.toLowerCase(), searchTerms);
                    }
                    const validContentLower = UI.extractSearchableText(chapterScope.validHtml).toLowerCase();
                    noteMatchCount += countMatchesInString(validContentLower, searchTerms);
                    AppState._globalHighlights += noteMatchCount;
                }
            } else {
                nodeDirectMatch = true;
                noteMatchCount += countMatchesInString(normTitle, searchTerms);
                noteMatchCount += countMatchesInString(normContent, searchTerms);
                AppState._globalHighlights += noteMatchCount;
            }
        }
        
        if (nodeDirectMatch && reqBook) {
            if (!(node.content && node.content.includes('adv-bookmark-marker'))) nodeDirectMatch = false;
        }
        if (nodeDirectMatch && reqFav) {
            if (!node.isMarked) nodeDirectMatch = false;
        }

        const childElements = [];
        let hasMatchChild = false;

        // Recupero ricorsivo dei nodi figli con propagazione garantita del ramo database
        const children = Store.getChildren(node.id).filter(n => !n.isRecordNote);
        children.forEach(c => {
            const el = UI.buildTreeElement(c, forceRender, isDbBranchNode);
            if (el) { childElements.push(el); hasMatchChild = true; }
        });

        let dbElementsToInject = [];
        let hasMatchDbChild = false;

        const shouldCheckActiveDb = isDefaultView && UI._activeRecordDbIds && UI._activeRecordDbIds.size > 0;
        if (!AppState.showDbNotesInTree && (!isDefaultView || shouldCheckActiveDb) && node.content) {
            // Isolamento rigoroso: lo spazio iniziale \s esclude data-ref-id delle citazioni senza manipolare il DOM
            const dbRegex = /\sid=["'](adv_tbl_[a-zA-Z0-9_]+|adv_pivot_[a-zA-Z0-9_]+|adv_journal_[a-zA-Z0-9_]+)["']/g;
            const seenDbIdsInNote = new Set();
            let match;
            while ((match = dbRegex.exec(node.content)) !== null) {
                if (match[1].includes('_cited_')) continue;

                const dbId = match[1];
                if (seenDbIdsInNote.has(dbId)) continue;
                seenDbIdsInNote.add(dbId);

                // In vista predefinita, inietta esclusivamente il DB lungo il percorso della record note attiva
                if (isDefaultView && (!UI._activeRecordDbIds || !UI._activeRecordDbIds.has(dbId))) {
                    continue;
                }

                if (AppState.databases && AppState.databases[dbId]) {
                    const dbState = AppState.databases[dbId];
                    if (!dbState.isPivot && !dbState.isLinkedView && dbId !== 'SYS_PROPERTIES_DB') {
                        const dbNotes = AppState.notes.filter(n => !n.deletedAt && n.isRecordNote && n.linkedTableId === dbId);
                        const forceExpandDb = AppState.currentNoteId === node.id || (isDefaultView && UI._activeRecordDbIds && UI._activeRecordDbIds.has(dbId));
                        const dbEl = UI.buildDatabaseVirtualTreeElement(dbId, dbState, dbNotes, forceExpandDb, false);
                        if (dbEl) {
                            dbElementsToInject.push(dbEl);
                            hasMatchDbChild = true;
                            if (isDefaultView && UI._activeRecordDbIds && UI._activeRecordDbIds.has(dbId)) {
                                UI._activeRecordDbInjected = true;
                            }
                        }
                    }
                }
            }
        }

        let tocHeaders = [];
        if (node.id === AppState.currentNoteId && node.content) {
            const temp = document.createElement('div');
            temp.innerHTML = node.content;
            tocHeaders = temp.querySelectorAll('h1, h2, h3');
        }

        if (!isDefaultView) {
            if (!nodeDirectMatch && !hasMatchChild && !hasMatchDbChild) return null;
        }

        const isGhost = !isDefaultView && !nodeDirectMatch && (hasMatchChild || hasMatchDbChild);
        const hasAnyChildren = childElements.length > 0 || dbElementsToInject.length > 0 || tocHeaders.length > 0;

        const wrapper = document.createElement('div'); 
        wrapper.className = 'node-wrapper';
        wrapper.dataset.id = node.id;
        
        const content = document.createElement('div'); 
        content.className = 'node-content';
        content.id = 'tree-node-' + node.id;
        
        if (node.id === AppState.currentNoteId) content.classList.add('active');
        if (isGhost) content.classList.add('tree-ghost-node');

        if (node.isRecordNote) {
            content.draggable = false;
        } else {
            content.draggable = true;
            content.ondragstart = (e) => UI.handleDragStart(e, node.id);
            content.ondragend = UI.handleDragEnd;
            content.ondragover = (e) => UI.handleDragOverNode(e, node.id);
            content.ondragleave = (e) => e.currentTarget.classList.remove('drag-top', 'drag-bottom', 'drag-middle');
            content.ondrop = (e) => UI.handleDropNode(e, node.id);
        }

        content.oncontextmenu = (e) => {
            if (typeof UI.openTreeNoteMenu === 'function') {
                UI.openTreeNoteMenu(e, content.id, node.id);
            }
        };

        const hasSearchPreview = Boolean(hasTerms && noteMatchCount > 0 && !isGhost);

        content.onclick = (e) => {
            if (!e.target.closest('.node-add-btn') && !e.target.closest('.toggle-btn')) {
                let targetMarkIdx = null;
                if (hasSearchPreview && UI._searchPreviewState && UI._searchPreviewState.noteId === node.id) {
                    const st = UI._searchPreviewState;
                    if (st.activeEntryIdx >= 0 && st.entries && st.entries[st.activeEntryIdx]) {
                        const activeEntry = st.entries[st.activeEntryIdx];
                        if (typeof activeEntry.firstGlobalMarkIdx === 'number') {
                            targetMarkIdx = activeEntry.firstGlobalMarkIdx;
                        }
                    }
                }

                if (hasSearchPreview) {
                    UI._dismissSearchPreviewOnClick(e.clientX, e.clientY);
                }

                if (targetMarkIdx !== null) {
                    AppState._currentHighlightIndex = targetMarkIdx;
                    if (AppState.currentNoteId === node.id && AppState._totalHighlights > 0) {
                        const safeIdx = Math.min(targetMarkIdx, AppState._totalHighlights - 1);
                        AppState._currentHighlightIndex = safeIdx;
                        AppState._focusHighlight(safeIdx);
                        return;
                    }
                }

                if (typeof UI.selectNote !== 'undefined') UI.selectNote(node.id);
            }
        };

        content.ondblclick = (e) => {
            if (e.target.closest('.node-add-btn') || e.target.closest('.toggle-btn')) return;
            e.stopPropagation();
            e.preventDefault();
            
            if (typeof UI.selectNote !== 'undefined') UI.selectNote(node.id, null, null, true);
            
            if (!AppState.isEditMode) {
                UI.toggleEditMode(true);
            }
            
            setTimeout(() => {
                const titleInput = document.getElementById('noteTitle');
                if (titleInput && !titleInput.hasAttribute('readonly')) {
                    titleInput.focus();
                    titleInput.select();
                }
            }, 250); 
        };

        const toggle = document.createElement('div');
        toggle.className = 'toggle-btn';

        const isCurrentActive = (node.id === AppState.currentNoteId);
        const hasSubNotes = childElements.length > 0 || dbElementsToInject.length > 0;
        const hasOnlyToc = !hasSubNotes && tocHeaders.length > 0;

        let isExpanded = false;

        if (isCurrentActive && hasOnlyToc) {
            isExpanded = node._tocCollapsed !== true;
        } else {
            isExpanded = node.expanded !== false || !isDefaultView;
            if (isCurrentActive && node._tocCollapsed === true && !hasSubNotes) {
                isExpanded = false;
            }
        }
        
        if (hasAnyChildren) {
            if (isExpanded) toggle.classList.add('expanded');
            toggle.innerHTML = Icons.chevronRight;
            toggle.style.cursor = 'pointer';
            toggle.onclick = (e) => {
                e.stopPropagation();
                if (isCurrentActive && hasOnlyToc) {
                    node._tocCollapsed = !node._tocCollapsed;
                } else {
                    if (node.expanded === undefined) node.expanded = false; 
                    else node.expanded = !node.expanded;
                    if (isCurrentActive && hasAnyChildren) {
                        node._tocCollapsed = !node.expanded;
                    }
                }
                UI.renderTree();
            };
        } else {
            toggle.innerHTML = `<span style="opacity:0.3; font-size:18px;">•</span>`;
            toggle.style.cursor = 'default';
        }

        const title = document.createElement('span');
        title.className = 'node-title';

        // GESTIONE INTELLIGENTE DEL TOOLTIP: Calcolato dinamicamente solo su hover ed esclusivamente se il testo è troncato
        title.onmouseenter = () => {
            if (hasSearchPreview) {
                title.removeAttribute('title');
                return;
            }
            const textSpan = title.querySelector('span:last-child') || title;
            if (textSpan.scrollWidth > textSpan.clientWidth) {
                title.title = node.title || I18n.t('editor.untitled');
            } else {
                title.removeAttribute('title');
            }
        };

        if (hasSearchPreview) {
            content.onmouseenter = (e) => {
                if (e.target.closest('.node-add-btn')) {
                    UI._hideSearchPreviewTooltip();
                    return;
                }
                if (UI._isSearchPreviewDismissed(e.clientX, e.clientY)) return;
                UI._lastSearchHoverClientX = e.clientX;
                clearTimeout(UI._searchPreviewTimer);
                UI._searchPreviewTimer = setTimeout(() => {
                    UI._searchPreviewTimer = null;
                    UI._showSearchPreviewTooltip(node, rawFilter, content);
                }, 250);
            };
            content.onmousemove = (e) => {
                if (e.target.closest('.node-add-btn')) {
                    UI._hideSearchPreviewTooltip();
                    return;
                }
                if (UI._isSearchPreviewDismissed(e.clientX, e.clientY)) return;
                UI._lastSearchHoverClientX = e.clientX;

                const st = UI._searchPreviewState;
                if (st && st.noteId === node.id) {
                    if (st.isTitleOnly) return;
                    // Disattiva lo scrubbing orizzontale finché il tasto ALT è premuto
                    if (e.altKey) return;
                    // Mantiene bloccato lo scrubbing dopo l'uso di ALT+Rotella finché il mouse non si sposta con decisione
                    if (st.wheelLocked) {
                        if (typeof st.wheelAnchorX === 'number' && Math.abs(e.clientX - st.wheelAnchorX) <= 12) {
                            return;
                        }
                        st.wheelLocked = false;
                    }
                    UI._updateSearchPreviewScrub(node.id, e.clientX, content);
                } else if (!UI._searchPreviewTimer) {
                    UI._searchPreviewTimer = setTimeout(() => {
                        UI._searchPreviewTimer = null;
                        UI._showSearchPreviewTooltip(node, rawFilter, content);
                    }, 250);
                }
            };
            content.onmouseleave = (e) => {
                if (e.relatedTarget && content.contains(e.relatedTarget)) return;
                UI._searchPreviewDismissPos = null;
                UI._hideSearchPreviewTooltip();
            };
        }

        let customIcon = Icons.file;
        let iconColorStyle = "";
        const hasBookmark = node.content && node.content.includes('adv-bookmark-marker');

        if (isDbBranchNode) {
            customIcon = node.isMarked ? Icons.starFilled : Icons.recordPage;
            iconColorStyle = "color:var(--record-color);";
        } else if (!isGhost) {
            if (node.isMarked && hasBookmark) {
                customIcon = Icons.starFilled;
                iconColorStyle = "color:var(--tx-c4);"; 
            } else if (node.isMarked) {
                customIcon = Icons.starFilled;
                iconColorStyle = "color:var(--marked-border);"; 
            } else if (hasBookmark) {
                iconColorStyle = "color:var(--tx-c4);"; 
            }
        }

        title.innerHTML = `<span style="opacity:0.8; ${iconColorStyle}">${customIcon}</span> <span>${node.title || I18n.t('editor.untitled')}</span>`;

        if (reqBook && !isGhost && node.content) {
            const commentMatch = node.content.match(/<span[^>]*class=["'][^"']*bookmark-comment-data[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
            if (commentMatch && commentMatch[1]) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = commentMatch[1];
                const cleanComm = tempDiv.textContent.replace(/[\u200B\n\r]/g, ' ').trim();
                if (cleanComm) {
                    const safeTooltip = cleanComm.replace(/"/g, '&quot;');
                    title.innerHTML += `<span style="margin-left:6px; font-size:0.75rem; color:var(--accent-color); opacity:0.85;" title="Appunto Segnalibro: ${safeTooltip}">💬</span>`;
                }
            }

            const timerMatch = node.content.match(/data-timer-expire=["'](\d+)["']/);
            if (timerMatch) {
                const expireMs = parseInt(timerMatch[1], 10);
                const now = Date.now();
                if (expireMs > now) {
                    const diffMins = Math.floor((expireMs - now) / 60000);
                    const h = Math.floor(diffMins / 60);
                    const m = diffMins % 60;
                    let timeStr = '';
                    if (h > 0) timeStr += `${h}h `;
                    timeStr += `${m}m`;
                    title.innerHTML += `<span style="margin-left:8px; font-size:0.7rem; color:var(--tx-c4); font-family:monospace; background:rgba(255, 134, 0, 0.1); padding:2px 4px; border-radius:4px;" title="Scade tra ${timeStr}">⏱️ ${timeStr}</span>`;
                } else {
                    title.innerHTML += `<span style="margin-left:8px; font-size:0.7rem; color:var(--danger-color); font-family:monospace; background:rgba(239, 68, 68, 0.1); padding:2px 4px; border-radius:4px;" title="Timer Scaduto">⏱️ Scaduto</span>`;
                }
            }
        }

        const addBtn = document.createElement('span');
        addBtn.className = 'node-add-btn';
        addBtn.textContent = '+';
        addBtn.title = I18n.t('editor_alerts.tree_add_subnote');
        addBtn.onmouseenter = () => {
            if (hasSearchPreview) UI._hideSearchPreviewTooltip();
        };
        addBtn.onclick = (e) => { e.stopPropagation(); node.expanded = true; if(typeof UI.addNote !== 'undefined') UI.addNote(node.id); };

        if (hasSearchPreview) {
            const countPill = document.createElement('span');
            countPill.className = 'search-match-count';
            countPill.title = I18n.t('common.occurrences_found', { count: noteMatchCount });
            countPill.textContent = noteMatchCount;
            content.append(toggle, title, countPill, addBtn);
        } else {
            content.append(toggle, title, addBtn);
        }

        wrapper.appendChild(content);

        if (hasAnyChildren) {
            const block = document.createElement('div');
            block.className = 'children-block';
            if (isExpanded) block.classList.add('expanded');
            
            const blockInner = document.createElement('div');
            blockInner.className = 'children-block-inner';

            if (tocHeaders.length > 0) {
                const tocContainer = document.createElement('div');
                tocContainer.className = 'dynamic-toc-container';

                tocHeaders.forEach(h => {
                    const hText = h.innerText.trim();
                    if (!hText) return;

                    const tagLower = h.tagName.toLowerCase();
                    let tocClass = 'toc-h1';
                    if (tagLower === 'h1') {
                        tocClass = 'toc-h1';
                    } else if (tagLower === 'h2') {
                        tocClass = 'toc-h2';
                    } else if (tagLower === 'h3') {
                        tocClass = 'toc-h3';
                    }

                    const tocEl = document.createElement('div');
                    tocEl.className = `toc-node ${tocClass}`;
                    tocEl.innerHTML = `<span class="toc-icon">#</span> <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${hText.replace(/"/g, '&quot;')}">${hText}</span>`;

                    tocEl.onclick = (e) => {
                        e.stopPropagation();
                        UI.selectNote(node.id, hText);
                    };

                    tocContainer.appendChild(tocEl);
                });
                blockInner.appendChild(tocContainer);
            }

            dbElementsToInject.forEach(db => blockInner.appendChild(db));
            childElements.forEach(c => blockInner.appendChild(c));
            
            block.appendChild(blockInner);
            wrapper.appendChild(block);
        }

        return wrapper;
    },

    scrollToHeader: (anchorText) => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;
        const headers = editor.querySelectorAll('h1, h2, h3');
        for (let h of headers) {
            if (h.innerText.trim() === anchorText) {
                h.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                h.style.transition = 'box-shadow 0.6s ease';
                h.style.boxShadow = '0 0 0 4px var(--marked-border), 0 0 30px var(--marked-border)';
                
                setTimeout(() => {
                    h.style.boxShadow = '';
                    setTimeout(() => h.style.transition = '', 600);
                }, 800);
                break;
            }
        }
    },

    highlightTreeNode: (id) => {
        document.querySelectorAll('.node-content').forEach(el => el.classList.remove('active'));
        const el = document.querySelector(`.node-wrapper[data-id="${id}"] > .node-content`);
        if (el) {
            el.classList.add('active');
            const treeContainer = document.getElementById('treeContainer');
            if (treeContainer) {
                const scrollIntoViewIfNeeded = () => {
                    const elRect = el.getBoundingClientRect();
                    const containerRect = treeContainer.getBoundingClientRect();
                    if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                };
                scrollIntoViewIfNeeded();
                setTimeout(scrollIntoViewIfNeeded, 100);
            }
        }
    }
});