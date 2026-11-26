/**
 * ui-tree-search-preview.js
 * Sottomodulo di UI dedicato all'indicizzazione testuale, al matching multi-termine/ambito
 * e al rendering interattivo dell'anteprima dei risultati di ricerca nella sidebar (note e capitoli TOC).
 * Include:
 * - Estrazione testo indicizzabile da note, blocchi codice, URL/note dei link,
 *   appunti inline, commenti dei segnalibri, descrizioni immagini e diari (extractSearchableText).
 * - Valutazione multi-termine AND tramite ';' e stringhe letterali '"..."' per ambito
 *   (Stesso paragrafo, Stesso capitolo con titolo compreso, Tutta la nota).
 * - Generazione delle card di anteprima con paginazione dinamica in base alla viewport
 *   e micro-badge con icona sul bordo inferiore destro per blocchi speciali/nascosti.
 * - Navigazione tra occorrenze tramite ALT + Rotella e scroll mirato su elementi protetti/nascosti.
 */

Object.assign(UI, {
    _searchPreviewTimer: null,
    _searchPreviewState: null,
    _searchPreviewDismissPos: null,
    _searchPreviewLastQueryKey: '',
    _searchPreviewLastIndexByNote: new Map(),
    _pendingSearchTarget: null,

    _decodeHtmlEntities: (raw) => {
        if (!raw) return '';
        const el = UI._decodeNode || (UI._decodeNode = document.createElement('div'));
        el.innerHTML = raw.replace(/<br\s*[\/]?>/gi, ' ').replace(/<[^>]*>?/gm, ' ');
        return el.textContent || '';
    },

    _extractChapterHTMLByIndex: (htmlContent, headerIndex) => {
        const temp = document.createElement('div');
        temp.innerHTML = htmlContent || '';
        const headers = Array.from(temp.querySelectorAll('h1, h2, h3')).filter(h => !h.closest('.adv-widget-shell'));
        const targetH = headers[headerIndex];
        if (!targetH) return '';

        const level = parseInt(targetH.tagName.charAt(1), 10);
        let html = targetH.outerHTML;
        let curr = targetH.nextElementSibling;
        while (curr) {
            if (/^H[1-6]$/i.test(curr.tagName) && !curr.closest('.adv-widget-shell')) {
                const nextLvl = parseInt(curr.tagName.charAt(1), 10);
                if (nextLvl <= level) break;
            }
            html += curr.outerHTML;
            curr = curr.nextElementSibling;
        }
        return html;
    },

    _focusPendingSearchTarget: () => {
        const target = UI._pendingSearchTarget;
        if (!target || target.noteId !== AppState.currentNoteId) return;
        UI._pendingSearchTarget = null;

        const editor = document.getElementById('noteContent');
        if (!editor) return;

        let el = null;
        if (target.kind === 'bookmark') {
            const bookmarks = Array.from(editor.querySelectorAll('.adv-bookmark-marker'))
                .filter(b => !b.closest('.block-citation'));
            el = bookmarks[target.targetIndex || 0] || null;
        } else if (target.kind === 'inline-note') {
            const inlineNotes = Array.from(editor.querySelectorAll('.inline-note-wrapper, .inline-note-marker'))
                .filter(n => !(n.classList.contains('inline-note-marker') && n.closest('.inline-note-wrapper')) && !n.closest('.block-citation'));
            el = inlineNotes[target.targetIndex || 0] || null;
        } else if (target.kind === 'image') {
            const images = Array.from(editor.querySelectorAll('img[data-tooltip]'))
                .filter(img => !img.closest('.block-citation'));
            el = images[target.targetIndex || 0] || null;
        } else if (target.kind === 'link') {
            const links = Array.from(editor.querySelectorAll('a'))
                .filter(a => !a.closest('.adv-table-wrapper, .adv-journal-wrapper, .block-citation, .code-wrapper'));
            el = links[target.targetIndex || 0] || null;
        } else if (target.targetId) {
            el = document.getElementById(target.targetId) || document.querySelector(`[id^="${target.targetId}_cited_"]`);
        }

        if (!el) return;

        let curr = el.parentElement;
        while (curr && curr.id !== 'noteContent') {
            if (curr.classList && curr.classList.contains('collapsed')) {
                curr.classList.remove('collapsed');
            }
            curr = curr.parentElement;
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'box-shadow 0.4s ease';
        el.style.boxShadow = '0 0 0 4px var(--marked-border), 0 0 24px var(--marked-border)';
        setTimeout(() => {
            if (document.body.contains(el)) {
                el.style.boxShadow = '';
                setTimeout(() => {
                    if (document.body.contains(el)) el.style.transition = '';
                }, 400);
            }
        }, 1200);
    },

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

            // Integra eventuali attributi di link e descrizioni immagini presenti nel blocco
            if (el.querySelectorAll) {
                el.querySelectorAll('a').forEach(a => {
                    const ln = a.getAttribute('data-link-note');
                    const hr = a.getAttribute('href');
                    const fp = a.getAttribute('data-file-path');
                    if (ln) txt += ' ' + UI._decodeHtmlEntities(ln).toLowerCase();
                    if (hr && hr !== '#' && !hr.startsWith('javascript:')) txt += ' ' + hr.toLowerCase();
                    if (fp) txt += ' ' + fp.toLowerCase();
                });
                el.querySelectorAll('img[data-tooltip]').forEach(img => {
                    const dt = img.getAttribute('data-tooltip');
                    if (dt) txt += ' ' + UI._decodeHtmlEntities(dt).toLowerCase();
                });
            }
            if (el.tagName === 'IMG' && el.hasAttribute('data-tooltip')) {
                const dt = el.getAttribute('data-tooltip');
                if (dt) txt += ' ' + UI._decodeHtmlEntities(dt).toLowerCase();
            }

            // Integra il testo dai widget autonomi (codice e diari) presenti nel blocco
            if (AppState.databases && el.id) {
                const trueId = el.id.split('_cited_')[0];
                const st = AppState.databases[trueId];
                if (st) {
                    if (st.content) txt += ' ' + st.content.toLowerCase();
                    if (st.title) txt += ' ' + st.title.toLowerCase();
                    if (Array.isArray(st.entries)) {
                        st.entries.forEach(ent => {
                            if (ent.content) txt += ' ' + UI._decodeHtmlEntities(ent.content).toLowerCase();
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
                const lowerLine = line.text.toLowerCase();
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
        if (!note || !note.content) return lines;

        const cleanHtmlText = (raw) => UI._decodeHtmlEntities(raw)
            .replace(/\u00A0/g, ' ')
            .replace(/[\u200B\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        const temp = document.createElement('div');
        temp.innerHTML = note.content
            .replace(/<iframe\b[^>]*>([\s\S]*?<\/iframe>)?/gi, '')
            .replace(/<script\b[^>]*>([\s\S]*?<\/script>)?/gi, '')
            .replace(/<style\b[^>]*>([\s\S]*?<\/style>)?/gi, '');

        const specialItems = [];

        // 1. Estrazione note e URL dei Link (escludendo eventuali link dentro citazioni/widget)
        let linkIdx = 0;
        temp.querySelectorAll('a').forEach((aEl) => {
            if (aEl.closest('.adv-table-wrapper, .adv-journal-wrapper, .block-citation, .code-wrapper')) return;
            const currentLinkIdx = linkIdx++;
            const linkText = (aEl.textContent || '').replace(/\u00A0/g, ' ').trim();
            const linkNote = cleanHtmlText(aEl.getAttribute('data-link-note') || '');
            const href = aEl.getAttribute('href');
            const filePath = aEl.getAttribute('data-file-path');
            const parts = [];
            if (linkNote) parts.push(linkNote);
            if (href && href !== '#' && !href.startsWith('javascript:') && !linkText.includes(href)) {
                parts.push(href);
            }
            if (filePath && !linkText.includes(filePath)) {
                parts.push(filePath);
            }
            if (parts.length > 0) {
                specialItems.push({
                    text: parts.join(' — '),
                    kind: 'link',
                    label: linkText || I18n.t('tree.badge_link'),
                    targetIndex: currentLinkIdx
                });
            }
        });

        // 2. Estrazione Appunti Inline (nascosti) con separazione netta dal testo visibile
        let inlineIdx = 0;
        temp.querySelectorAll('.inline-note-wrapper, .inline-note-marker').forEach((el) => {
            if (el.classList.contains('inline-note-marker') && el.closest('.inline-note-wrapper')) return;
            if (el.closest('.block-citation')) return;
            const currentInlineIdx = inlineIdx++;
            const dataSpan = el.querySelector('.inline-note-data');
            const rawNote = dataSpan ? dataSpan.innerHTML : (el.getAttribute('data-tooltip') || '');
            const txt = cleanHtmlText(rawNote);
            if (dataSpan) dataSpan.remove();
            if (txt) {
                specialItems.push({
                    text: txt,
                    kind: 'inline-note',
                    targetIndex: currentInlineIdx
                });
            }
        });

        // 3. Estrazione Commenti Segnalibro con separazione netta dal testo visibile
        let bookmarkIdx = 0;
        temp.querySelectorAll('.adv-bookmark-marker').forEach((el) => {
            if (el.closest('.block-citation')) return;
            const currentBookmarkIdx = bookmarkIdx++;
            const dataSpan = el.querySelector('.bookmark-comment-data');
            const rawComment = dataSpan ? dataSpan.innerHTML : (el.getAttribute('data-tooltip') || '');
            const txt = cleanHtmlText(rawComment);
            if (dataSpan) dataSpan.remove();
            if (txt) {
                specialItems.push({
                    text: txt,
                    kind: 'bookmark',
                    targetIndex: currentBookmarkIdx
                });
            }
        });

        // 4. Estrazione Descrizioni Immagini (data-tooltip su <img>)
        let imageIdx = 0;
        temp.querySelectorAll('img[data-tooltip]').forEach((imgEl) => {
            if (imgEl.closest('.block-citation')) return;
            const currentImageIdx = imageIdx++;
            const rawDesc = imgEl.getAttribute('data-tooltip') || '';
            const txt = cleanHtmlText(rawDesc);
            if (txt) {
                const ref = imgEl.getAttribute('data-image-ref') || '';
                const rawAlt = (imgEl.getAttribute('alt') || '').trim();
                const isGenericAlt = !rawAlt || /^image(\.[a-z0-9]+)?$/i.test(rawAlt) || rawAlt === I18n.t('editor_core.image_label');
                const label = !isGenericAlt ? rawAlt : (ref || I18n.t('editor_core.image_label'));
                specialItems.push({
                    text: txt,
                    kind: 'image',
                    label,
                    targetIndex: currentImageIdx
                });
            }
        });

        // 5. Estrazione Tabelle Semplici
        const tableLines = [];
        temp.querySelectorAll('.simple-table-wrapper, table:not(.adv-table)').forEach((tblEl) => {
            if (tblEl.tagName === 'TABLE' && tblEl.closest('.simple-table-wrapper')) return;
            if (tblEl.closest('.adv-table-wrapper, [data-widget-type="database"], [data-widget-type="pivot"], .block-citation')) return;
            tblEl.querySelectorAll('tr').forEach(tr => {
                const cells = Array.from(tr.cells).map(c => cleanHtmlText(c.innerHTML)).filter(Boolean);
                if (cells.length > 0) {
                    tableLines.push({
                        text: cells.join(' | '),
                        kind: 'table'
                    });
                }
            });
            tblEl.remove();
        });

        // Rimuove eventuali DOM residui dei widget autonomi (codice e diari letti da AppState.databases)
        temp.querySelectorAll('.code-wrapper, [data-widget-type="code"], .adv-journal-wrapper, [data-widget-type="journal"]').forEach(el => el.remove());

        // 6. Estrazione Testo Normale
        const normalMarkup = temp.innerHTML
            .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>|<br\s*[\/]?>|<hr\s*[\/]?>/gi, '\n')
            .replace(/<\/(td|th)>/gi, ' | ');
        const normalTemp = document.createElement('div');
        normalTemp.innerHTML = normalMarkup;
        const rawText = (normalTemp.textContent || normalTemp.innerText || '')
            .replace(/\u00A0/g, ' ')
            .replace(/[\u200B\uFEFF]/g, '');

        rawText.split('\n').forEach(l => {
            const trimmed = l.trim();
            if (trimmed) lines.push({ text: trimmed, kind: 'text' });
        });

        tableLines.forEach(tl => lines.push(tl));
        specialItems.forEach(si => lines.push(si));

        // 7. Estrazione Blocchi di Codice e Diari da AppState.databases
        if (AppState.databases) {
            const codeRegex = /\sid=["'](adv_code_[^"']+)["']/g;
            let m;
            while ((m = codeRegex.exec(note.content)) !== null) {
                const trueId = m[1].split('_cited_')[0];
                const st = AppState.databases[trueId];
                if (st && st.content) {
                    st.content.split('\n').forEach(l => {
                        const t = l.trim();
                        if (t) lines.push({ text: t, kind: 'code', label: st.title || '', targetId: trueId });
                    });
                }
            }

            const journalRegex = /\sid=["'](adv_journal_[^"']+)["']/g;
            while ((m = journalRegex.exec(note.content)) !== null) {
                const trueId = m[1].split('_cited_')[0];
                const st = AppState.databases[trueId];
                if (st && Array.isArray(st.entries)) {
                    st.entries.forEach(entry => {
                        if (entry.content) {
                            const t = cleanHtmlText(entry.content);
                            if (t) lines.push({ text: t, kind: 'journal', label: st.title || '', targetId: trueId });
                        }
                    });
                }
            }
        }

        return lines;
    },

    _getPreviewKindBadge: (lineObj) => {
        if (!lineObj || lineObj.kind === 'text') return '';
        let icon = '';
        let label = '';

        if (lineObj.kind === 'bookmark') {
            icon = Icons.bookmark;
            label = I18n.t('tree.badge_bookmark');
        } else if (lineObj.kind === 'inline-note') {
            icon = Icons.noteInline;
            label = I18n.t('tree.badge_inline_note');
        } else if (lineObj.kind === 'image') {
            icon = Icons.image;
            label = lineObj.label || I18n.t('editor_core.image_label');
        } else if (lineObj.kind === 'link') {
            icon = Icons.link;
            label = I18n.t('tree.badge_link');
        } else if (lineObj.kind === 'code') {
            icon = Icons.code;
            label = lineObj.label || I18n.t('tree.badge_code');
        } else if (lineObj.kind === 'journal') {
            icon = Icons.journal;
            label = lineObj.label || I18n.t('tree.badge_journal');
        } else if (lineObj.kind === 'table') {
            icon = Icons.tableSimple;
            label = I18n.t('tree.badge_table');
        }

        if (!icon && !label) return '';

        return `<span style="position:absolute; bottom:-8px; right:8px; display:inline-flex; align-items:center; gap:4px; padding:1px 6px; border-radius:8px; font-size:0.65rem; font-weight:600; background:var(--sidebar-bg); color:var(--text-secondary); border:1px solid var(--border-color); line-height:1.25; max-width:75%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; pointer-events:none;">
            <span style="display:inline-flex; align-items:center; color:var(--accent-color); transform:scale(0.8);">${icon}</span>
            <span style="overflow:hidden; text-overflow:ellipsis;">${UI.escapeHTML(label)}</span>
        </span>`;
    },

    _createPreviewCardElement: (entry, lines, terms, isMultiTerm) => {
        const MAX_CARD_CHARS = 520;
        const MAX_SINGLE_LINE = 700;
        const { lineIdx: idx, spans } = entry;
        const lineObj = lines[idx];
        const matchCountInLine = spans.length;
        const rawMatchLine = lineObj.text;

        const singleLineLimit = MAX_SINGLE_LINE * matchCountInLine;
        const matchDisplay = rawMatchLine.length > singleLineLimit
            ? UI._extractMatchedWindows(rawMatchLine, spans, MAX_SINGLE_LINE)
            : rawMatchLine;

        const beforeLines = [];
        const afterLines = [];

        // In modalità multi-termine (AND) o per blocchi speciali non includiamo righe adiacenti
        if (!isMultiTerm && lineObj.kind === 'text') {
            const cardBudget = MAX_CARD_CHARS * matchCountInLine;
            let remaining = cardBudget - matchDisplay.length;

            if (remaining > 0 && idx - 1 >= 0 && lines[idx - 1].kind === 'text' && lines[idx - 1].text.length <= remaining) {
                beforeLines.push(lines[idx - 1].text);
                remaining -= lines[idx - 1].text.length;
            }
            for (let offset = 1; offset <= 2; offset++) {
                const nextIdx = idx + offset;
                if (remaining > 0 && nextIdx < lines.length && lines[nextIdx].kind === 'text' && lines[nextIdx].text.length <= remaining) {
                    afterLines.push(lines[nextIdx].text);
                    remaining -= lines[nextIdx].text.length;
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
        rowsHtml += UI._getPreviewKindBadge(lineObj);

        const cardEl = document.createElement('div');
        cardEl.style.cssText = 'position:relative; background:color-mix(in srgb, var(--bg-color) 55%, transparent); border:1px solid var(--border-color); border-radius:6px; padding:8px 10px; transition:border-color 0.1s ease, box-shadow 0.1s ease;';
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
        const pageCards = pages[pageIdx] || [];

        cardsContainer.innerHTML = '';
        pageCards.forEach(cardEl => {
            UI._setCardActiveStyle(cardEl, false);
            cardsContainer.appendChild(cardEl);
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
        if (!state || state.isTitleOnly || !state.entryItems || state.entryItems.length === 0) return;
        if (targetIdx < 0 || targetIdx >= state.entryItems.length) return;
        if (targetIdx === state.activeEntryIdx && state.activeCardEl) return;

        const targetItem = state.entryItems[targetIdx];
        if (!targetItem) return;

        state.activeEntryIdx = targetIdx;
        UI._searchPreviewLastIndexByNote.set(state.previewKey || state.noteId, targetIdx);

        // Cambia schermata di anteprima solo quando la card attiva appartiene a un'altra pagina
        if (targetItem.pageIdx !== state.currentPageIdx) {
            UI._renderPreviewPage(state, targetItem.pageIdx);
        }

        // Aggiorna in-place esclusivamente lo stile della card precedente e di quella corrente
        if (state.activeCardEl) {
            UI._setCardActiveStyle(state.activeCardEl, false);
        }

        UI._setCardActiveStyle(targetItem.cardEl, true);
        state.activeCardEl = targetItem.cardEl;

        if (state.footerCountSpan) {
            state.footerCountSpan.textContent = `${targetIdx + 1} / ${state.entryItems.length}`;
        }
    },

    _showSearchPreviewTooltip: (note, rawFilter, anchorEl, chapterOpts = null) => {
        const tooltip = document.getElementById('advCustomTooltip');
        if (!tooltip || !anchorEl || !document.body.contains(anchorEl)) return;

        const terms = (typeof AppState !== 'undefined' && typeof AppState.parseSearchTerms === 'function')
            ? AppState.parseSearchTerms(rawFilter)
            : (rawFilter ? [rawFilter] : []);
        if (terms.length === 0) return;

        const lowerTerms = terms.map(t => t.toLowerCase());
        const isMultiTerm = lowerTerms.length > 1;
        const activeScope = isMultiTerm ? (AppState.multiSearchScope || 'paragraph') : 'note';

        const queryKey = `${rawFilter}||${activeScope}`;
        if (UI._searchPreviewLastQueryKey !== queryKey) {
            UI._searchPreviewLastQueryKey = queryKey;
            UI._searchPreviewLastIndexByNote.clear();
        }

        const isChapterPreview = !!(chapterOpts && typeof chapterOpts.headerIndex === 'number');
        const previewKey = isChapterPreview ? `${note.id}::ch::${chapterOpts.headerIndex}` : note.id;

        const targetSourceNote = isChapterPreview
            ? { id: note.id, title: '', content: UI._extractChapterHTMLByIndex(note.content || '', chapterOpts.headerIndex) }
            : note;

        const rawTitle = (targetSourceNote.title || (isChapterPreview ? '' : I18n.t('editor.untitled'))).replace(/\u00A0/g, ' ');
        const lowerTitle = rawTitle.toLowerCase();

        let titleMatches = false;
        let lines = [];

        if (isMultiTerm && activeScope === 'chapter') {
            const chapterScope = UI._getValidChapterNoteScope(targetSourceNote, lowerTerms);
            titleMatches = !isChapterPreview && chapterScope.validTitle !== '';
            lines = UI._extractSearchPreviewLines({ content: chapterScope.validHtml });
        } else {
            titleMatches = !isChapterPreview && (
                isMultiTerm && activeScope === 'paragraph'
                    ? lowerTerms.every(lt => lowerTitle.includes(lt))
                    : lowerTerms.some(lt => lowerTitle.includes(lt))
            );
            lines = UI._extractSearchPreviewLines(targetSourceNote);
        }

        // Regex ordinata dal termine più lungo al più corto per garantire parità 1:1 con i <mark> di applyHighlight
        const sortedTerms = [...lowerTerms].sort((a, b) => b.length - a.length);
        const spanRegex = new RegExp(sortedTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

        let matchEntries = [];
        let runningMarkIdx = 0;

        for (let i = 0; i < lines.length; i++) {
            const lineObj = lines[i];
            const lowerLine = lineObj.text.toLowerCase();
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
                const isHighlightableInDom = (lineObj.kind === 'text' || lineObj.kind === 'table');
                matchEntries.push({
                    lineIdx: i,
                    spans,
                    matchedTermIndices,
                    kind: lineObj.kind,
                    targetIndex: lineObj.targetIndex,
                    targetId: lineObj.targetId,
                    firstGlobalMarkIdx: isHighlightableInDom ? runningMarkIdx : null
                });
                if (isHighlightableInDom) {
                    runningMarkIdx += spans.length;
                }
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
                : 'Alt + Rotella: scorri risultati';
            const multiTermTipText = (!isMultiTerm && typeof I18n !== 'undefined')
                ? I18n.t('tree.preview_multiterm_tip')
                : '';

            tooltip.innerHTML = `<div style="width:100%; white-space:normal;"><div id="searchTooltipHeader" style="display:none; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; font-size:0.72rem; color:var(--accent-color); font-weight:600; margin-bottom:6px; padding-bottom:4px; border-bottom:1px dashed var(--border-color);"><span>${UI.escapeHTML(headerHintText)}</span><span id="searchTooltipMultiTip" style="display:none; opacity:0.75; font-weight:normal; color:var(--tooltip-text);">${UI.escapeHTML(multiTermTipText)}</span></div><div id="searchTooltipCards" style="display:flex; flex-direction:column; gap:11px; padding-bottom:6px; font-size:0.8rem; line-height:1.45;"></div><div id="searchTooltipFooter" style="display:none; justify-content:space-between; align-items:center; margin-top:8px; padding-top:4px; border-top:1px dashed var(--border-color); font-size:0.72rem; opacity:0.8;"><span id="searchTooltipCount"></span><span id="searchTooltipPage"></span></div></div>`;

            const headerEl = tooltip.querySelector('#searchTooltipHeader');
            const multiTipEl = tooltip.querySelector('#searchTooltipMultiTip');
            const cardsContainer = tooltip.querySelector('#searchTooltipCards');
            const footerEl = tooltip.querySelector('#searchTooltipFooter');
            const footerCountSpan = tooltip.querySelector('#searchTooltipCount');
            const footerPageSpan = tooltip.querySelector('#searchTooltipPage');

            // Mostra header e footer prima del calcolo pagine quando sono presenti più risultati
            if (matchEntries.length > 1) {
                if (headerEl) headerEl.style.display = 'flex';
                if (footerEl) footerEl.style.display = 'flex';
            }

            const cardElements = matchEntries.map((entry) => UI._createPreviewCardElement(entry, lines, terms, isMultiTerm));

            const paginateCards = () => {
                cardsContainer.innerHTML = '';
                const pagesList = [[]];
                const entryItems = [];

                cardElements.forEach((cardEl, globalIdx) => {
                    cardsContainer.appendChild(cardEl);

                    const curPageIdx = pagesList.length - 1;
                    if (pagesList[curPageIdx].length > 0 && tooltip.scrollHeight > maxHeightPx) {
                        cardsContainer.innerHTML = '';
                        cardsContainer.appendChild(cardEl);
                        pagesList.push([cardEl]);
                        entryItems[globalIdx] = { pageIdx: pagesList.length - 1, cardEl };
                    } else {
                        pagesList[curPageIdx].push(cardEl);
                        entryItems[globalIdx] = { pageIdx: curPageIdx, cardEl };
                    }
                });

                return { pagesList, entryItems };
            };

            let { pagesList: pages, entryItems } = paginateCards();

            // Sulle ricerche singole estese su più pagine mostra anche il suggerimento su ";"
            if (pages.length > 1 && multiTipEl && multiTermTipText) {
                multiTipEl.style.display = 'inline';
                ({ pagesList: pages, entryItems } = paginateCards());
            }

            UI._searchPreviewState = {
                noteId: note.id,
                previewKey,
                chapterHeaderIndex: isChapterPreview ? chapterOpts.headerIndex : null,
                isTitleOnly: false,
                anchorEl,
                tooltip,
                cardsContainer,
                footerEl,
                footerCountSpan,
                footerPageSpan,
                entries: matchEntries,
                pages,
                entryItems,
                totalEntries: matchEntries.length,
                currentPageIdx: -1,
                activeEntryIdx: -1,
                activeCardEl: null
            };

            const savedIdx = UI._searchPreviewLastIndexByNote.get(previewKey);
            const initialIdx = (typeof savedIdx === 'number' && savedIdx >= 0 && savedIdx < matchEntries.length)
                ? savedIdx
                : 0;

            UI._selectPreviewEntry(UI._searchPreviewState, initialIdx);
            tooltip.style.visibility = 'visible';
        } else {
            // Nessuna occorrenza nel corpo (match presente solo sul titolo): mostra solo le prime righe del corpo, mai il titolo
            const headLines = [];
            let headBudget = MAX_CARD_CHARS;
            for (let i = 0; i < Math.min(3, lines.length); i++) {
                if (lines[i].kind !== 'text') continue;
                if (lines[i].text.length <= headBudget) {
                    headLines.push(UI.escapeHTML(lines[i].text));
                    headBudget -= lines[i].text.length;
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
                previewKey,
                chapterHeaderIndex: isChapterPreview ? chapterOpts.headerIndex : null,
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
            pureText += " " + UI._decodeHtmlEntities(el.innerHTML || "");
        });
        
        temp.querySelectorAll('.inline-note-marker[data-tooltip], .adv-bookmark-marker[data-tooltip]').forEach(el => {
            pureText += " " + UI._decodeHtmlEntities(el.getAttribute('data-tooltip') || "");
        });

        temp.querySelectorAll('img[data-tooltip]').forEach(el => {
            pureText += " " + UI._decodeHtmlEntities(el.getAttribute('data-tooltip') || "");
        });
        
        temp.querySelectorAll('a[data-link-note]').forEach(el => {
            pureText += " " + UI._decodeHtmlEntities(el.getAttribute('data-link-note') || "");
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
                            pureText += " " + UI._decodeHtmlEntities(entry.content);
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
    }
});