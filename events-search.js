/**
 * events-search.js
 * Modulo dedicato alla ricerca globale, evidenziazione e navigazione hashtag.
 * Sottomodulo di EventsGlobal.
 * FEAT CSS CUSTOM HIGHLIGHT HASHTAGS: Sottolineatura ed evidenziazione visiva nativa dei tag #parola senza mutare il DOM.
 * FEAT ESC CLEAR SEARCH: Tasto ESC all'interno del campo cerca/tag svuota automaticamente il campo e azzera i filtri.
 * FEAT TAG DISAMBIGUATION: Gestione unificata navigazione tag con prefisso '#' - Selezione diretta se univoco, autocompletamento se ambiguo.
 * FEAT MIN SEARCH THRESHOLD: Ricerca as-you-type attiva da 2 caratteri in su (o da 1 carattere su Invio esplicito), prevenendo overload da singola lettera.
 * FIX LIVE IN-PLACE HIGHLIGHTING: Evidenziazione diretta in-place sull'editor attivo senza distruggere la pagina con selectNote.
 */

window.EventsGlobal = window.EventsGlobal || {};

Object.assign(EventsGlobal, {
    _hashtagHighlightTimer: null,

    _triggerSearchUpdate: () => {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            AppState._currentHighlightIndex = 0;
            EventsGlobal._executeSearchLogic(searchInput, true);
        }
    },

    _executeSearchLogic: (searchInput, forceSubmit = false) => {
        const searchControls = document.getElementById('searchControls');
        const searchCounter = document.getElementById('searchCounter');
        const rawValue = searchInput ? (searchInput.value || '') : '';
        const trimmed = rawValue.trim();
        const isTagQuery = trimmed.startsWith('#');

        // SOGLIA MINIMA DI RICERCA TESTUALE:
        // - Se è un tag (#...): procede sempre.
        // - Se è testo normale: richiede almeno 2 caratteri per la ricerca incrementale automatica,
        //   oppure almeno 1 carattere se l'utente ha premuto esplicitamente Invio (forceSubmit === true).
        const meetsThreshold = isTagQuery || trimmed.length >= 2 || (forceSubmit && trimmed.length >= 1);

        if (AppState.currentNoteId && AppState.isEditMode && !AppState.isSwitchingNote) {
            const currentNote = Store.getNote(AppState.currentNoteId);
            if (currentNote && typeof Editor !== 'undefined') {
                currentNote.content = Editor.getCleanHTML();
            }
        }

        if (meetsThreshold) {
            AppState.searchFilter = trimmed.toLowerCase();
        } else {
            // Sotto la soglia minima: azzera il filtro testuale per non sovraccaricare l'albero
            AppState.searchFilter = "";
        }
        
        // Ridisegno dei filtri a pillola attivi
        if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
            SidebarManager.SearchAutocomplete.renderPills();
        }
        
        const hasActivePropFilters = AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0;
        const hasActiveSearch = AppState.searchFilter.length > 0 || hasActivePropFilters;
        
        if (hasActiveSearch) {
            if (searchControls) searchControls.classList.remove('hidden');
        } else {
            if (searchControls) searchControls.classList.add('hidden');
            AppState._totalHighlights = 0;
            AppState._globalHighlights = 0;
            AppState._currentHighlightIndex = 0;
        }

        // 1. Aggiorna l'albero laterale con le note pertinenti
        UI.renderTree();
        
        // 2. AGGIORNAMENTO IN-PLACE DEI MARK NELL'EDITOR VIVO (Nessun reload distruttivo con selectNote)
        const editor = document.getElementById('noteContent');
        if (editor && typeof Editor !== 'undefined') {
            // Pulisce preventivamente i vecchi mark gialli dal DOM vivo
            Editor.cleanHighlightsBeforeSave();

            if (AppState.searchFilter.length > 0) {
                // Applica i nuovi mark all'istante all'interno del documento già a video
                Editor.applyHighlight(editor, AppState.searchFilter);
                AppState._totalHighlights = editor.querySelectorAll('mark.search-highlight').length;

                if (searchCounter) {
                    if (AppState._totalHighlights > 0) {
                        if (AppState._currentHighlightIndex === -1) {
                            AppState._currentHighlightIndex = AppState._totalHighlights - 1;
                        } else if (AppState._currentHighlightIndex >= AppState._totalHighlights) {
                            AppState._currentHighlightIndex = 0;
                        }
                        AppState._focusHighlight(AppState._currentHighlightIndex);
                    } else {
                        searchCounter.innerText = "0/0";
                    }
                }
            } else {
                if (searchCounter) searchCounter.innerText = "0/0";
                if (AppState.currentNoteId && typeof UI.highlightTreeNode === 'function') {
                    UI.highlightTreeNode(AppState.currentNoteId);
                }
            }
        }
    },

    // Invia un tag alla sidebar gestendo la logica concordata:
    // 1. Popola la barra col '#' mantenendo la coerenza grafica
    // 2. Se il valore appartiene a una sola colonna/proprietà -> applica direttamente la pillola di filtro
    // 3. Se il valore appartiene a più colonne (ambiguità) -> apre il menu a tendina per far scegliere l'utente
    // 4. Se non esiste ancora come proprietà -> filtra l'albero via full-text
    executeTagSearch: (cleanTag) => {
        if (!cleanTag) return;

        // 1. Espandi la sidebar se collassata
        const sb = document.getElementById('sidebar');
        const sbBtn = document.getElementById('sidebarToggleBtn');
        if (sb && sb.classList.contains('collapsed')) {
            sb.classList.remove('collapsed');
            if (sbBtn) sbBtn.classList.add('active');
        }

        // 2. Imposta la vista albero su Note
        if (typeof UI !== 'undefined' && typeof UI.switchToNotes === 'function') {
            UI.switchToNotes();
        }

        const searchInputEl = document.getElementById('searchInput');
        if (!searchInputEl) return;

        // 3. Verifica le corrispondenze nello schema delle proprietà
        const matchingProperties = (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete && typeof SidebarManager.SearchAutocomplete.getMatchesForTag === 'function')
            ? SidebarManager.SearchAutocomplete.getMatchesForTag(cleanTag)
            : [];

        if (matchingProperties.length === 1) {
            // CASO A (UNIVOCO): Una sola proprietà contiene questo valore esatto.
            // Applica istantaneamente il filtro a pillola senza fastidiosi popup da chiudere a mano.
            const match = matchingProperties[0];
            SidebarManager.SearchAutocomplete.select(match.colId, match.realValue, match.colName, match.displayValue);

            if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') {
                UI.showToast(`Filtro applicato: ${match.colName} = "${match.displayValue}"`, "info");
            }
        } 
        else if (matchingProperties.length > 1) {
            // CASO B (AMBIGUITÀ / PIÙ PROPRIETÀ): Più colonne hanno lo stesso valore (es. Tag e Categoria).
            // Popola il campo con '#tag', focalizza e apre il menu a tendina per permettere all'utente di scegliere.
            searchInputEl.value = '#' + cleanTag;
            searchInputEl.focus();

            setTimeout(() => {
                if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                    SidebarManager.SearchAutocomplete.show(searchInputEl, '#' + cleanTag);
                }
            }, 60);

            if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') {
                UI.showToast(`Seleziona la proprietà per: "${cleanTag}"`, "info");
            }
        } 
        else {
            // CASO C (NESSUNA PROPRIETÀ CENSITA): Cerca nel testo di tutte le note
            searchInputEl.value = '#' + cleanTag;
            EventsGlobal._executeSearchLogic(searchInputEl, true);
            searchInputEl.focus();

            if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') {
                UI.showToast(`Ricerca tag nel testo: "#${cleanTag}"`, "info");
            }
        }
    },

    // Identifica se le coordinate del mouse cadono su un hashtag all'interno del testo
    _getClickedHashtagAtPoint: (clientX, clientY) => {
        let textNode = null;
        let offset = 0;

        if (document.caretRangeFromPoint) {
            const range = document.caretRangeFromPoint(clientX, clientY);
            if (range) {
                textNode = range.startContainer;
                offset = range.startOffset;
            }
        } else if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(clientX, clientY);
            if (pos) {
                textNode = pos.offsetNode;
                offset = pos.offset;
            }
        }

        // Risoluzione difensiva se le coordinate cadono sul contenitore elemento anziché direttamente sul nodo di testo
        if (textNode && textNode.nodeType === Node.ELEMENT_NODE) {
            const child = textNode.childNodes[offset] || textNode.childNodes[offset - 1] || textNode.firstChild;
            if (child && child.nodeType === Node.TEXT_NODE) {
                textNode = child;
                offset = 0;
            }
        }

        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null;

        // Escludi blocchi di codice dove '#' è sintassi di commento o direttiva
        if (textNode.parentNode && textNode.parentNode.closest && textNode.parentNode.closest('pre.code-content')) {
            return null;
        }

        const text = textNode.nodeValue || '';
        if (!text.includes('#')) return null;

        // Regex per intercettare sia tag semplici sia tag gerarchici (es. #family/mom)
        const tagRegex = /(?:^|[^\wÀ-ÿ])(#([^\s.,;:!?'"()\[\]{}<>]+))/g;
        let match;
        while ((match = tagRegex.exec(text)) !== null) {
            const fullMatch = match[1]; 
            const tagName = match[2].replace(/^#+/, ''); // Depura da eventuali '#' multipli

            const matchStart = match.index + (match[0].length - fullMatch.length);
            const matchEnd = matchStart + fullMatch.length;

            if (offset >= matchStart && offset <= matchEnd) {
                // Esclude codici colore esadecimali puri a 3 o 6 caratteri (es. #fff, #123456)
                if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(tagName)) continue;
                return { fullTag: fullMatch, cleanTag: tagName };
            }
        }

        return null;
    },

    // =========================================================================
    // CSS CUSTOM HIGHLIGHT API: Sottolineatura ed evidenziazione tag senza mutare il DOM
    // =========================================================================
    updateHashtagHighlights: () => {
        if (typeof CSS === 'undefined' || !CSS.highlights) return;

        const editorEl = document.getElementById('noteContent');
        if (!editorEl || !AppState.currentNoteId) {
            CSS.highlights.delete('hashtag-highlight');
            return;
        }

        const ranges = [];
        const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, null, false);
        let node;

        while ((node = walker.nextNode())) {
            const parent = node.parentNode;
            if (!parent) continue;

            // Esclude blocchi di codice e widget complessi dove '#' ha altro significato
            if (parent.closest && parent.closest('pre.code-content, .widget-type-code, [data-widget-type="code"]')) {
                continue;
            }

            const val = node.nodeValue;
            if (!val || !val.includes('#')) continue;

            const tagRegex = /(?:^|[^\wÀ-ÿ])(#([^\s.,;:!?'"()\[\]{}<>]+))/g;
            let match;

            while ((match = tagRegex.exec(val)) !== null) {
                const fullTag = match[1];
                const cleanName = match[2].replace(/^#+/, '');

                // Salta colori esadecimali puri
                if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(cleanName)) continue;

                const startOffset = match.index + (match[0].length - fullTag.length);
                const endOffset = startOffset + fullTag.length;

                try {
                    const r = document.createRange();
                    r.setStart(node, startOffset);
                    r.setEnd(node, endOffset);
                    ranges.push(r);
                } catch (_) {}
            }
        }

        if (ranges.length > 0) {
            const hl = new Highlight(...ranges);
            CSS.highlights.set('hashtag-highlight', hl);
        } else {
            CSS.highlights.delete('hashtag-highlight');
        }
    },

    scheduleHashtagHighlights: () => {
        clearTimeout(EventsGlobal._hashtagHighlightTimer);
        EventsGlobal._hashtagHighlightTimer = setTimeout(() => {
            EventsGlobal.updateHashtagHighlights();
        }, 120);
    },

    initSearchEvents: () => {
        // Iniezione dello stile nativo CSS Custom Highlight per gli hashtag (permanente e visibile a colpo d'occhio)
        if (!document.getElementById('adv-hashtag-highlight-style')) {
            const st = document.createElement('style');
            st.id = 'adv-hashtag-highlight-style';
            st.innerHTML = `
                ::highlight(hashtag-highlight) {
                    color: var(--accent-color) !important;
                    text-decoration: underline dotted var(--accent-color) !important;
                    text-underline-offset: 3px !important;
                    background-color: color-mix(in srgb, var(--accent-color) 10%, transparent) !important;
                }
            `;
            document.head.appendChild(st);
        }

        const searchInput = document.getElementById('searchInput');
        const searchClear = document.getElementById('searchClearBtn');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                // REGOLA CHIAVE: L'autocompletamento scatta esclusivamente se si digita il prefisso '#'
                if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                    if (e.target.value.startsWith('#')) {
                        SidebarManager.SearchAutocomplete.show(e.target, e.target.value);
                    } else {
                        SidebarManager.SearchAutocomplete.hide();
                    }
                }
                AppState._currentHighlightIndex = 0;
                EventsGlobal._executeSearchLogic(searchInput, false);
            });
            
            searchInput.addEventListener('focus', (e) => {
                if (e.target.value && e.target.value.startsWith('#')) {
                    if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                        SidebarManager.SearchAutocomplete.show(e.target, e.target.value);
                    }
                }
            });
            
            // Gestione tastiera sul campo cerca: Invio forza la ricerca e naviga, ESC azzera tutto
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();

                    if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                        SidebarManager.SearchAutocomplete.hide();
                    }

                    if (searchInput.value !== '' || (AppState.activePropertyFilters && AppState.activePropertyFilters.length > 0)) {
                        searchInput.value = '';
                        AppState.activePropertyFilters = [];
                        AppState.searchFilter = "";

                        // Rimuove istantaneamente ogni evidenziatore <mark> dall'editor vivo
                        if (typeof Editor !== 'undefined' && typeof Editor.cleanHighlightsBeforeSave === 'function') {
                            Editor.cleanHighlightsBeforeSave();
                        }
                        EventsGlobal._triggerSearchUpdate();
                    } else {
                        searchInput.blur();
                    }
                    return;
                }

                if (e.key === 'Enter') {
                    e.preventDefault();
                    
                    // Se la ricerca non era ancora partita perché sotto soglia, Invio forza l'esecuzione immediata
                    if (!AppState.searchFilter && searchInput.value.trim().length > 0) {
                        EventsGlobal._executeSearchLogic(searchInput, true);
                        return;
                    }

                    if (e.shiftKey) AppState.findPrevious();
                    else AppState.findNext();
                }
            });
            
            searchInput.addEventListener('blur', () => {
                if (typeof SidebarManager !== 'undefined' && SidebarManager.SearchAutocomplete) {
                    SidebarManager.SearchAutocomplete.scheduleHide();
                }
            });
        }

        if (searchClear) {
            searchClear.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.focus();
                }
                // Svuota anche i filtri Proprietà/Tag e azzera il filtro attivo
                AppState.activePropertyFilters = [];
                AppState.searchFilter = "";

                // Rimuove istantaneamente ogni evidenziatore <mark> dall'editor vivo
                if (typeof Editor !== 'undefined' && typeof Editor.cleanHighlightsBeforeSave === 'function') {
                    Editor.cleanHighlightsBeforeSave();
                }

                EventsGlobal._triggerSearchUpdate();
            });
        }

        const editorEl = document.getElementById('noteContent');
        if (editorEl) {
            const hashtagObserver = new MutationObserver(() => {
                EventsGlobal.scheduleHashtagHighlights();
            });
            hashtagObserver.observe(editorEl, { childList: true, subtree: true, characterData: true });

            // Calcolo iniziale immediato all'avvio
            EventsGlobal.scheduleHashtagHighlights();
        }
    }
});