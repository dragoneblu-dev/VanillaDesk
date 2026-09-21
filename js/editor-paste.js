/**
 * EditorPaste.js
 * Modulo isolato per la gestione degli eventi Copia, Taglia e Incolla.
 * FIX PASTE BR to P: Se si incolla del testo formattato a <br> all'interno della root, 
 * questo viene convertito in veri e propri <p> per permettere al tasto TAB di identificare la riga fisica.
 * FIX SNIPPET & INLINE WIDGETS: Protezione assoluta dalle andate a capo (\n) negli snippet e
 * prevenzione dello split del DOM nativo del browser tramite BR-Shielding.
 */

Object.assign(Editor, {

    initCopyInterceptor: () => {
        const handleCopyCut = (e) => {
            const editorEl = document.getElementById('noteContent');
            if (!editorEl || !editorEl.contains(window.getSelection().anchorNode)) return;

            const sel = window.getSelection();
            if (sel.isCollapsed) return;

            e.preventDefault();

            const range = sel.getRangeAt(0);
            
            // Se sto copiando dentro un blocco codice, 
            // formatto come testo puro ignorando gli spazi di formattazione HTML.
            const anchorNode = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentNode : sel.anchorNode;
            const codeBlock = anchorNode.closest('.code-content');
            
            if (codeBlock) {
                const tempDiv = document.createElement('div');
                tempDiv.appendChild(range.cloneContents());
                
                // Sostituiamo i <br> con gli a capo reali
                let plainText = tempDiv.innerHTML.replace(/<br\s*\/?>/gi, '\n');
                
                // Rimuoviamo gli Zero-Width Spaces e gli spazi unificatori usati dal DOM
                plainText = plainText.replace(/<[^>]+>/g, '')
                                     .replace(/&nbsp;/g, ' ')
                                     .replace(/\u200B/g, '')
                                     .replace(/&lt;/g, '<')
                                     .replace(/&gt;/g, '>')
                                     .replace(/&amp;/g, '&');
                
                e.clipboardData.setData('text/plain', plainText);
                
                // Rimuoviamo fisicamente se stiamo "Tagliando" (Cut)
                if (e.type === 'cut') {
                    Editor.saveSnapshot();
                    range.deleteContents();
                    if (typeof CodeManager !== 'undefined') CodeManager.highlightBlock(codeBlock, true);
                    Store.triggerAutoSave();
                }
                return;
            }

            // GESTIONE COPIA STANDARD (Per testo normale e tabelle)
            const clone = range.cloneContents();
            const tempDiv = document.createElement('div');
            tempDiv.appendChild(clone);

            let htmlStr = tempDiv.innerHTML;
            htmlStr = htmlStr.replace(/<\/p>\s*<p>/gi, '\n');
            htmlStr = htmlStr.replace(/<p><br><\/p>/gi, '\n');
            htmlStr = htmlStr.replace(/<br\s*\/?>/gi, '\n');
            htmlStr = htmlStr.replace(/<\/li>\s*<li>/gi, '\n- ');
            htmlStr = htmlStr.replace(/<li>/gi, '- ');

            let cleanTextDiv = document.createElement('div');
            cleanTextDiv.innerHTML = htmlStr;
            
            let plainText = cleanTextDiv.innerText || cleanTextDiv.textContent;
            plainText = plainText.replace(/\u200B/g, ''); 

            e.clipboardData.setData('text/html', tempDiv.innerHTML);
            e.clipboardData.setData('text/plain', plainText);

            // Se l'utente ha premuto Taglia (Ctrl+X), cancelliamo fisicamente il contenuto dal DOM
            if (e.type === 'cut') {
                Editor.saveSnapshot();
                range.deleteContents();
                Store.triggerAutoSave();
            }
        };

        document.addEventListener('copy', handleCopyCut);
        document.addEventListener('cut', handleCopyCut);
    },

    handlePaste: (e) => {
        const clipboardData = (e.clipboardData || window.clipboardData);
        const pastedText = clipboardData.getData('text/plain');
        const pastedHTML = clipboardData.getData('text/html');
        
        const items = Array.from((e.clipboardData || e.originalEvent.clipboardData).items);
        let isImage = false;

        // 1. GESTIONE IMMAGINI INCOLLATE (Clipboard File)
        for (let item of items) {
            if (item.kind === 'file' && item.type.includes('image/')) {
                e.preventDefault();
                Editor.saveSnapshot();
                isImage = true;
                
                const blob = item.getAsFile();

                // Controllo peso per tutela prestazioni: Avvisa se > 200KB
                if (blob.size > 204800) {
                    if (typeof UI !== 'undefined' && UI.showToast) {
                        UI.showToast("Consiglio: L'immagine è pesante. Usa 'Inserisci > Collegamento (link) > Immagine Esterna' o comprimila per non rallentare l'App.", "warning");
                    }
                }

                const reader = new FileReader();
                reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = () => {
                        const MAX_WIDTH = 1600;
                        let width = img.width; let height = img.height;
                        if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
                        const canvas = document.createElement('canvas');
                        canvas.width = width; canvas.height = height;
                        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                        document.execCommand('insertHTML', false, `<img src="${canvas.toDataURL('image/webp', 0.85)}"><p><br></p>`);
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(blob);
                return;
            }
        }

        if (isImage) {
            return;
        }

        const sel = window.getSelection();
        if (!sel.rangeCount) { 
            //console.groupEnd(); 
            return;
        }
        
        // Muro di Sicurezza Anti-Zombie: Se l'utente sta incollando su una selezione multipla,
        // verifichiamo che non stia distruggendo un intero database visivo.
        if (!sel.isCollapsed) {
            if (typeof Editor !== 'undefined' && Editor.handleBulkWidgetDeletion) {
                if (!Editor.handleBulkWidgetDeletion()) {
                    e.preventDefault();
                    return;
                }
            }
        }

        let targetNode = sel.anchorNode;
        if (targetNode.nodeType === 3) targetNode = targetNode.parentNode;

        // FIX INLINE WIDGETS: Controlliamo sia i blocchi (DB/Codice) che gli inline (Snippet/Appunti)
        const isInsideWidget = WidgetManager.isProtectedBlock(targetNode) || WidgetManager.isProtectedInline(targetNode);
        const isInlineNote = !!targetNode.closest('#inlineNoteInput');
        const codeWrapper = targetNode.closest('[data-widget-type="code"]');
        const snippetText = targetNode.closest('.snippet-text');

        const isHeavyLoad = pastedText.length > 15000 || (pastedHTML && pastedHTML.length > 30000);
        e.preventDefault();

        const processPaste = () => {
            try {
                Editor.saveSnapshot();

                if (isInsideWidget) {
                    const isEditable = WidgetManager.isInsideEditableWidgetArea(targetNode) || !!targetNode.closest('.simple-table-wrapper td, .simple-table-wrapper th');
                    
                    if (!isEditable) {
                        alert("⚠️ Cursore in area non valida. Clicca all'interno di un'area di testo prima di incollare.");
                        return;
                    }

                    // FIX ASSOLUTO SNIPPET COPIABILE MULTI-LINEA: Incolla l'HTML pulito
                    // usando i <br> per non spaccare in due il DOM dello span!
                    if (snippetText) {
                        const cleanTextWithBrs = pastedText.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n|\n|\r/g, '<br>');
                        document.execCommand('insertHTML', false, cleanTextWithBrs);
                        Store.triggerAutoSave();
                        return;
                    }

                    let cleanText = pastedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                    
                    if (codeWrapper) {
                        const preNode = codeWrapper.querySelector('pre');
                        if (preNode.innerHTML === '<br>') preNode.innerHTML = '';
                        
                        const selection = window.getSelection();
                        let targetCaretPos = 0;
                        
                        // Calcoliamo l'offset matematico futuro prima di rompere il DOM
                        if (selection.rangeCount > 0 && typeof Editor._getCodeOffset === 'function') {
                            const startPos = Editor._getCodeOffset(preNode, selection.anchorNode, selection.anchorOffset);
                            const focusPos = Editor._getCodeOffset(preNode, selection.focusNode, selection.focusOffset);
                            const minPos = Math.min(startPos, focusPos);
                            
                            // La nuova posizione del cursore sarà dove eravamo + la lunghezza della stringa incollata
                            targetCaretPos = minPos + cleanText.length;
                            const range = selection.getRangeAt(0);
                            range.deleteContents(); 
                            const textNode = document.createTextNode(cleanText);
                            range.insertNode(textNode);
                        } else {
                            preNode.appendChild(document.createTextNode(cleanText));
                            targetCaretPos = preNode.innerText.length;
                        }
                        
                        if (typeof CodeManager !== 'undefined') CodeManager.highlightBlock(preNode, true);
                        if (typeof Editor._setCodeOffset === 'function') Editor._setCodeOffset(preNode, targetCaretPos, targetCaretPos);
                    } else {
                        document.execCommand('insertText', false, cleanText);
                    }
                    Store.triggerAutoSave();
                    return;
                }

                if (isInlineNote) {
                    document.execCommand('insertText', false, pastedText);
                    return;
                }

                if (!pastedHTML) {
                    let fallbackText = pastedText;
                    // FIX BR: Anche il plain text incollato nella root viene impaginato correttamente
                    if (!targetNode.closest('td, th, li, pre')) {
                        fallbackText = fallbackText.split('\n').join('</p><p>');
                        document.execCommand('insertHTML', false, `<p>${fallbackText}</p>`);
                    } else {
                        document.execCommand('insertText', false, pastedText);
                    }
                    return;
                }

                // Whitelist estesa solo per l'infrastruttura di VanillaDesk
                const allowedTags = ['B', 'I', 'U', 'S', 'A', 'P', 'DIV', 'SPAN', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'BR', 'IMG', 'SVG', 'PATH', 'POLYLINE', 'LINE', 'RECT', 'CIRCLE', 'INPUT'];
                const allowedPrefixes = ['hl-', 'tx-', 'bg-', 'text-', 'ff-', 'fs-'];
                
                const allowedClasses = [
                    // Link, Testo e Ricerca
                    'internal-link', 'file-link', 'highlighted-text', 'search-highlight', 'active-highlight',
                    // Struttura Shell Base
                    'adv-widget-shell', 'adv-inline-shell', 'widget-header', 'adv-table-header', 'widget-drag-handle', 'adv-drag-handle', 'widget-options-btn', 'widget-icon', 'widget-title', 'adv-table-title', 'widget-tools', 'adv-tools', 'widget-body', 'widget-editable-area',
                    // Tipi di Widget
                    'widget-type-database', 'widget-type-pivot', 'widget-type-journal', 'widget-type-code', 'widget-type-buttonbar', 'widget-type-citation', 'widget-type-columns', 'widget-type-simple-table', 'widget-type-audio', 'widget-type-video',
                    // Database
                    'adv-table-wrapper', 'table-striped', 'adv-col-resizer',
                    // Tabelle Semplici
                    'simple-table-wrapper', 'table-row-trigger', 'table-col-trigger', 'table-move-trigger',
                    // Appunti Nascosti e Segnalibri
                    'inline-note-wrapper', 'inline-note-marker', 'inline-note-data', 'adv-bookmark-marker', 'bookmark-icon', 'bookmark-comment-data',
                    // Checklist
                    'adv-checklist', 'adv-checklist-item', 'adv-checklist-cb', 'checklist-text',
                    // Diario
                    'adv-journal-wrapper', 'adv-journal-list', 'journal-date-node', 'journal-date-header', 'journal-toggle', 'journal-date-label', 'journal-time-list', 'journal-time-node', 'journal-time-label', 'journal-content', 'hidden-time',
                    // Codice e Snippet Copiabili
                    'code-wrapper', 'code-action-bar', 'code-action-btn', 'code-content', 'code-action-lang', 'code-action-copy', 'code-copy-btn', 'adv-copy-snippet', 'snippet-text', 'snippet-copy-btn',
                    // Citazioni
                    'block-citation', 'citation-body', 'citation-header',
                    // Colonne Multi-Layout
                    'adv-columns-container-wrap', 'adv-columns-continuous', 'adv-columns-independent', 'col-box', 'col-resizer'
                ];
                
                // Whitelist rigorosa per attributi Data (elimina data-id di altri siti web)
                const allowedDataAttrs = ['data-widget-type', 'data-image-ref', 'data-audio-ref', 'data-note-id', 'data-anchor', 'data-ref-id', 'data-file-path', 'data-tooltip', 'data-row', 'data-col', 'data-raw-value', 'data-decimals', 'data-opt-name', 'data-date', 'data-timer-expire', 'data-comment', 'data-ref-note', 'data-ref-type', 'data-collapsed', 'data-last-find', 'data-language'];

                const parser = new DOMParser();
                const doc = parser.parseFromString(pastedHTML, 'text/html');

                // Rimuove i commenti invisibili inseriti da Chrome/Word (es. <!--StartFragment-->)
                const iter = doc.createNodeIterator(doc.body, NodeFilter.SHOW_COMMENT, null, false);
                let commentNode;
                const commentsToRemove = [];
                while ((commentNode = iter.nextNode())) commentsToRemove.push(commentNode);
                commentsToRemove.forEach(c => c.remove());

                // Ricostruisce ID validi per eventuali widget incollati (Copia Note interne)
                doc.querySelectorAll(WidgetManager.blockSelector).forEach(wrapper => {
                    const oldId = wrapper.id;
                    const isJournal = wrapper.classList.contains('adv-journal-wrapper');
                    const prefix = isJournal ? 'adv_journal_' : 'adv_tbl_';
                    const newId = prefix + Store.generateId();
                    wrapper.id = newId;

                    if (AppState.databases && AppState.databases[oldId]) {
                        let stateClone = JSON.parse(JSON.stringify(AppState.databases[oldId]));
                        if (!isJournal && !stateClone.isPivot && !stateClone.isLinkedView) {
                            stateClone.title = (stateClone.title || "Database") + " (Copia)";
                        }
                        AppState.databases[newId] = stateClone;
                    }
                    wrapper.removeAttribute('data-state');
                    wrapper.innerHTML = ''; 
                });

                // Motore Ricorsivo Bottom-Up: Pulisce, converte e SROTOLA i tag inutili (La Gomma)
                const cleanNode = (node) => {
                    if (node.nodeType === 3) return; // Nodi di testo puro passano

                    if (node.nodeType === 1) {
                        let tag = node.tagName.toUpperCase();
                        
                        // Rilevamento di sicurezza: il nodo appartiene all'ecosistema di VanillaDesk?
                        const isInternalWidget = node.closest('.adv-widget-shell, .simple-table-wrapper, .adv-inline-shell');


                        // 1. Tag Non Ammessi (es. Article, Section, Nav da siti web)
                        if (!allowedTags.includes(tag)) {
                            if (['SCRIPT', 'STYLE', 'META', 'LINK', 'IFRAME', 'OBJECT', 'BUTTON', 'FORM'].includes(tag)) {
                                node.remove(); return;
                            } else {
                                // Srotola il contenuto (trasforma es. <section> in testo libero)
                                const frag = document.createDocumentFragment();
                                while (node.firstChild) frag.appendChild(node.firstChild);
                                node.parentNode.replaceChild(frag, node);
                                return;
                            }
                        } 
                        
                        // 2. MODALITA' DRACONIANA: Sostituzione DIV e SPAN inutili (Solo se non siamo in un Widget)
                        if (!isInternalWidget) {
                            // 1. Uccisione istantanea di tag grafici, ui, form e vettoriali inutili
                            if (['SVG', 'PATH', 'CIRCLE', 'RECT', 'POLYLINE', 'LINE', 'POLYGON', 'PICTURE', 'SOURCE', 'IFRAME', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'OPTION', 'FIGURE', 'FIGCAPTION'].includes(tag)) {
                                node.remove();
                                return;
                            }
                            
                            if (tag === 'DIV' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'ASIDE') {
                                // Se proviene dall'esterno, un DIV è quasi sempre un Paragrafo o un contenitore inutile.
                                const p = document.createElement('p');
                                while (node.firstChild) p.appendChild(node.firstChild);
                                node.parentNode.replaceChild(p, node);
                                node = p; 
                                tag = 'P';
                            }

                            // 3. Normalizzazione semantica (Da Strong a Bold)
                            if (tag === 'STRONG') {
                                const b = document.createElement('b');
                                while(node.firstChild) b.appendChild(node.firstChild);
                                node.parentNode.replaceChild(b, node);
                                node = b; tag = 'B';
                            }
                            if (tag === 'EM') {
                                const i = document.createElement('i');
                                while(node.firstChild) i.appendChild(node.firstChild);
                                node.parentNode.replaceChild(i, node);
                                node = i; tag = 'I';
                            }
                        }

                        // 3. Purificazione Attributi
                        const attrs = Array.from(node.attributes);
                        attrs.forEach(attr => {
                            // Regole SVG
                            if (tag === 'SVG' && ['viewBox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'].includes(attr.name)) return;
                            if (['PATH', 'POLYLINE', 'LINE', 'RECT', 'CIRCLE'].includes(tag) && ['d', 'points', 'x1', 'y1', 'x2', 'y2', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry'].includes(attr.name)) return;
                            
                            // Attributi standard
                            if (attr.name === 'href' && tag === 'A') return;
                            if (attr.name === 'src' && tag === 'IMG') return;
                            if (attr.name === 'type' && ['UL', 'OL', 'INPUT'].includes(tag)) return;
                            if (attr.name === 'contenteditable') return;
                            if (attr.name === 'id' && isInternalWidget) return; 
                            
                            // Gestione Classi CSS
                            if (attr.name === 'class') {
                                const classes = attr.value.split(/\s+/).filter(cls => allowedClasses.includes(cls) || allowedPrefixes.some(p => cls.startsWith(p)));
                                if (classes.length > 0) node.setAttribute('class', classes.join(' '));
                                else node.removeAttribute('class');
                            } 
                            // Gestione Stili Inline
                            else if (attr.name === 'style') {
                                if ((node.classList.contains('inline-note-data') || node.classList.contains('bookmark-comment-data')) && attr.value.includes('none')) {
                                    node.setAttribute('style', 'display: none;'); 
                                } else if (isInternalWidget) {
                                    return; // I widget mantengono gli stili (es. larghezza colonne)
                                } else {
                                    node.removeAttribute('style'); // Nuke totale per testo normale
                                }
                            }
                            // Gestione Dati
                            else if (attr.name.startsWith('data-')) {
                                if (allowedDataAttrs.includes(attr.name)) return;
                                node.removeAttribute(attr.name); // Rimuove data-attributes alieni
                            }
                            else {
                                node.removeAttribute(attr.name);
                            }
                        });

                        // 4. Srotolamento finale SPAN e FONT privi di attributi (Gomma)
                        if ((tag === 'SPAN' || tag === 'FONT') && !isInternalWidget) {
                            if (node.attributes.length === 0) {
                                const frag = document.createDocumentFragment();
                                while (node.firstChild) frag.appendChild(node.firstChild);
                                node.parentNode.replaceChild(frag, node);
                                return;
                            }
                        }
                    }

                    // Scansione Bottom-Up per evitare di saltare nodi
                    let child = node.lastChild;
                    while (child) {
                        const prev = child.previousSibling;
                        cleanNode(child);
                        child = prev;
                    }
                };

                // Avvia la purificazione partendo dalla coda
                let currNode = doc.body.lastChild;
                while (currNode) {
                    let prevNode = currNode.previousSibling;
                    cleanNode(currNode);
                    currNode = prevNode;
                }

                let finalHTML = doc.body.innerHTML;
                
                // Rimuoviamo gli a capo strutturali posti agli estremi dal Sistema Operativo.
                finalHTML = finalHTML.replace(/^[\r\n\t]+|[\r\n\t]+$/g, '');
                finalHTML = finalHTML.replace(/<span[^>]*class="Apple-converted-space"[^>]*>.*?<\/span>/gi, ' ');
                

                // Rimozione di link vuoti creati dai siti web
                finalHTML = finalHTML.replace(/<a[^>]*>\s*(<br\s*\/?>)?\s*<\/a>/gi, '');

                // ==============================================================
                // FIX BR TO P: Se il target finale della pasta non si trova dentro un 
                // contenitore che richiede la presenza assoluta dei <br> (come tabelle o liste),
                // converto i <br> isolati in blocchi di paragrafo in modo che il tasto TAB funzioni.
                // ==============================================================
                if (!targetNode.closest('td, th, li, pre')) {
                    // SHIELD: Proteggiamo i <br> all'interno degli elementi inline (Appunti/Snippet)
                    // per evitare che vengano trasformati in <p> distruggendo l'HTML valido.
                    let tempWrapper = document.createElement('div');
                    tempWrapper.innerHTML = finalHTML;
                    tempWrapper.querySelectorAll('.adv-inline-shell, .inline-note-data, .bookmark-comment-data, .snippet-text').forEach(el => {
                        el.innerHTML = el.innerHTML.replace(/<br\s*\/?>/gi, '%%%BR_SAFE%%%');
                    });
                    finalHTML = tempWrapper.innerHTML;

                    //console.log("[PASTE-DEBUG] Cursore libero: Converto <br> in <p> per abilitare TAB.");
                    finalHTML = finalHTML.replace(/<br\s*\/?>/gi, '</p><p>');
                    finalHTML = finalHTML.replace(/<p>\s*<\/p>/gi, ''); // Pulisce gli artefatti

                    // Rimuoviamo lo scudo ripristinando i <br> dentro gli span protetti
                    finalHTML = finalHTML.replace(/%%%BR_SAFE%%%/g, '<br>');
                }
                
                //console.log("[DEBUG-PASTE] HTML finale pronto per l'inserimento:", finalHTML);
                document.execCommand('insertHTML', false, finalHTML);
                Editor._ensureLastLineBreak(document.getElementById('noteContent'));

                if (typeof WidgetManager !== 'undefined') {
                    WidgetManager.mountAll();
                    Store.triggerAutoSave();
                }
                //console.log("[PASTE-DEBUG] Deep Sanitization HTML Completata.");
                
            } finally {
            }
        };

        if (isHeavyLoad) {
            if (typeof UI !== 'undefined' && UI.showToast) UI.showToast("⏳ Incollando e ripulendo grande quantità di dati...", "warning");
            setTimeout(processPaste, 50); 
        } else {
            processPaste();
        }
    }
});