/**
 * editor-core.js
 * Inizializzazione editor, ciclo di vita e gestione dei contesti.
 * Modulo snello: Caret Engine estratto in 'editor-caret.js', Sanitizer/Storage estratto in 'editor-sanitizer.js'.
 * Include:
 * - Media hydration e placeholder per immagini non trovate (loadAssetOnDemand, hydrateMedia, getBrokenImagePlaceholder).
 * - Modalità avanzata Raw HTML Source Editor a tutto schermo (openRawHtmlEditor, applyRawHtml, copyRawHtmlToClipboard).
 * - Boundary enforcement, selezione widget e smart escape dai blocchi (enforceBoundaries, handleSmartClickEscape).
 * - Ispezione del contesto di selezione per la toolbar (checkContext, editContextElement, toggleAdvancedToolbar).
 */

const Editor = {
    currentContext: null,
    selectedWidget: null,

    audioCache: {}, 
    imageCache: {},
    _pendingAssetPromises: new Map(),

    // Genera un Data-URI SVG per mostrare chiaramente a schermo un'immagine cancellata o non reperibile
    getBrokenImagePlaceholder: (ref = '') => {
        const cleanRef = (ref || 'Immagine mancante')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="110" viewBox="0 0 340 110">
            <rect x="2" y="2" width="336" height="106" rx="8" fill="#fff5f5" stroke="#ef4444" stroke-width="2" stroke-dasharray="6,4"/>
            <g transform="translate(16, 28)">
                <rect x="0" y="0" width="48" height="48" rx="8" fill="#fee2e2" stroke="#f87171" stroke-width="1.5"/>
                <path d="M14 34 L22 22 L28 30 L34 20 L40 34 Z" fill="#ef4444" opacity="0.6"/>
                <circle cx="18" cy="14" r="4" fill="#ef4444" opacity="0.6"/>
                <line x1="6" y1="42" x2="42" y2="6" stroke="#dc2626" stroke-width="3" stroke-linecap="round"/>
            </g>
            <text x="76" y="42" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="14" font-weight="bold" fill="#991b1b">⚠️ Immagine non trovata</text>
            <text x="76" y="62" font-family="monospace" font-size="11" fill="#b91c1c">${cleanRef.length > 32 ? cleanRef.slice(0, 29) + '...' : cleanRef}</text>
            <text x="76" y="80" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="11" fill="#7f1d1d" opacity="0.8">File eliminato o mancante dagli assets</text>
        </svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    },

    markImageBroken: (img, ref = '') => {
        if (!img) return;
        img.classList.add('broken-image');
        img.removeAttribute('src');
        img.setAttribute('data-broken', 'true');
        img.src = Editor.getBrokenImagePlaceholder(ref);
        img.setAttribute('title', `Immagine non trovata: ${ref} (File eliminato dal disco o mancante)`);
    },

    handleImageError: (img) => {
        if (!img || img.getAttribute('data-broken') === 'true') return;
        const ref = img.getAttribute('data-image-ref') || img.getAttribute('alt') || 'Immagine';
        Editor.markImageBroken(img, ref);
    },

    // Caricamento asincrono on-demand (JIT) di singoli asset da disco senza precaricamento preventivo del Workspace
    // e con deduplicazione delle Promise per evitare memory leak di ObjectURL concorrenti
    loadAssetOnDemand: async (ref, type) => {
        if (!ref) return null;
        if (type === 'img' && Editor.imageCache[ref]) return Editor.imageCache[ref];
        if (type === 'aud' && Editor.audioCache[ref]) return Editor.audioCache[ref];

        if (!AppState.assetsHandle) return null;

        const cacheKey = `${type}:${ref}`;
        if (Editor._pendingAssetPromises.has(cacheKey)) {
            return Editor._pendingAssetPromises.get(cacheKey);
        }

        const promise = (async () => {
            try {
                const fileHandle = await AppState.assetsHandle.getFileHandle(ref, { create: false });
                const file = await fileHandle.getFile();
                const url = URL.createObjectURL(file);

                if (type === 'img') Editor.imageCache[ref] = url;
                if (type === 'aud') Editor.audioCache[ref] = url;

                return url;
            } catch (err) {
                console.warn(`[LAZY ASSET] Asset ${ref} non trovato su disco:`, err);
                return null;
            } finally {
                Editor._pendingAssetPromises.delete(cacheKey);
            }
        })();

        Editor._pendingAssetPromises.set(cacheKey, promise);
        return promise;
    },

    hydrateMedia: (container) => {
        if (!container) return;

        const imgElements = container.querySelectorAll('img[data-image-ref]');
        const audElements = container.querySelectorAll('audio[data-audio-ref]');

        // FAST-PATH: Se la nota non contiene immagini o audio con riferimenti, esce istantaneamente senza mutare il DOM
        if (imgElements.length === 0 && audElements.length === 0) {
            return;
        }

        imgElements.forEach(img => {
            const ref = img.getAttribute('data-image-ref');
            if (!ref) return;

            // Se l'asset è già presente nella cache volatile della sessione, assegna subito l'URL
            if (Editor.imageCache && Editor.imageCache[ref]) {
                img.setAttribute('src', Editor.imageCache[ref]);
                img.classList.remove('broken-image');
                img.removeAttribute('data-broken');
                img.removeAttribute('title');
            } else {
                // Caricamento on-demand asincrono dal disco (solo per questa immagine)
                Editor.loadAssetOnDemand(ref, 'img').then(url => {
                    if (url) {
                        if (document.body.contains(img)) {
                            img.setAttribute('src', url);
                            img.classList.remove('broken-image');
                            img.removeAttribute('data-broken');
                            img.removeAttribute('title');
                        }
                    } else {
                        Editor.markImageBroken(img, ref);
                    }
                });
            }
        });

        // Controlla immagini esterne o senza data-image-ref con src mancante
        container.querySelectorAll('img:not([data-image-ref])').forEach(img => {
            const src = img.getAttribute('src');
            if (!src || src.trim() === '') {
                Editor.markImageBroken(img, img.getAttribute('alt') || 'Immagine esterna');
            }
        });

        audElements.forEach(aud => {
            const ref = aud.getAttribute('data-audio-ref');
            if (!ref) return;

            if (Editor.audioCache && Editor.audioCache[ref]) {
                aud.setAttribute('src', Editor.audioCache[ref]);
            } else {
                // Caricamento on-demand asincrono dal disco (solo per questa traccia audio)
                Editor.loadAssetOnDemand(ref, 'aud').then(url => {
                    if (url && document.body.contains(aud)) {
                        aud.setAttribute('src', url);
                    }
                });
            }
        });
    },

    clearWidgetSelection: () => {
        if (Editor.selectedWidget) {
            Editor.selectedWidget.classList.remove('adv-widget-selected');
            Editor.selectedWidget = null;
        }
        document.querySelectorAll('.adv-widget-selected').forEach(el => el.classList.remove('adv-widget-selected'));
    },

    handleImageUpload: async (input) => {
        if (!input.files || !input.files[0]) return;
        
        if (!AppState.assetsHandle) {
            alert("Devi prima creare un Workspace per poter allegare file fisici.");
            input.value = '';
            return;
        }

        Editor.saveSnapshot();
        const file = input.files[0];
        
        if (typeof UI !== 'undefined') UI.showToast("Salvataggio immagine su disco in corso...", "info");
        
        const fileName = await Store.saveAsset(file, 'img');
        
        if (fileName) {
            const blobUrl = Editor.imageCache[fileName];
            const safeName = (file.name || fileName).replace(/"/g, '&quot;');
            
            Editor.restoreSelection();
            document.execCommand('insertHTML', false, `<img src="${blobUrl}" data-image-ref="${fileName}" alt="${safeName}" onerror="Editor.handleImageError(this)"><p><br></p>`);
            Store.triggerAutoSave();
        }
        
        input.value = '';
    },

    enforceBoundaries: () => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;

        const protectedBlocks = editor.querySelectorAll(WidgetManager.blockSelector + ', ' + WidgetManager.inlineSelector);
        protectedBlocks.forEach(el => {
            if (el.getAttribute('contenteditable') !== 'false') {
                el.setAttribute('contenteditable', 'false');
            }
        });
        Editor._ensureLastLineBreak(editor);
    },
    
    _ensureLastLineBreak: (editorEl) => {
        if (!editorEl) return;
        const lastChild = editorEl.lastElementChild;
        if (lastChild && (WidgetManager.isProtectedBlock(lastChild) || ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE'].includes(lastChild.tagName))) {
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            editorEl.appendChild(p);
        }
    },

    handleSmartClickEscape: (e) => {
        if (!AppState.isEditMode) return;
        
        let target = e.target;
        if (target && target.nodeType === 3) target = target.parentNode;
        if (!target || !target.closest) return;

        // Non impedire il click nativo su campi di input o textarea
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        const shell = target.closest('.adv-widget-shell, .adv-inline-shell');
        if (!shell) return;

        Editor.clearWidgetSelection();

        if (typeof WidgetManager !== 'undefined') {
            if (WidgetManager.isInsideEditableWidgetArea(target)) {
                return;
            }
        }

        // Whitelist per permettere l'interazione HTML5 Drag e Click su controlli di modulo
        if (target.closest('th, td, .widget-drag-handle, .widget-options-btn, .adv-tool-btn, .adv-add-btn, .adv-icon-btn, .adv-table-header, .btn, .action-btn-run, .adv-btn-icon-trigger, .snippet-copy-btn, .inline-note-marker, .adv-board-card, .adv-cal-event-std, .adv-cal-event-abs')) {
            return;
        }

        const rect = shell.getBoundingClientRect();
        const isInline = shell.classList.contains('adv-inline-shell');
        
        const isBottomOrRightHalf = isInline 
            ? e.clientX > rect.left + (rect.width / 2) 
            : e.clientY > rect.top + (rect.height / 2);

        let targetNode = isBottomOrRightHalf ? shell.nextSibling : shell.previousSibling;
        
        if (targetNode && targetNode.nodeType === 3) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.setStart(targetNode, isBottomOrRightHalf ? 0 : targetNode.length);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            e.preventDefault();
            e.stopPropagation();
        } else if (targetNode && targetNode.nodeType === 1 && !WidgetManager.isProtectedBlock(targetNode)) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(targetNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            e.preventDefault();
            e.stopPropagation();
        }
    },

    // MODALITA' AVANZATA: MODIFICA DIRETTA CODICE SORGENTE HTML (LIOFILIZZATO)
    openRawHtmlEditor: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        if (!note || note.deletedAt) return;

        if (typeof Editor.sanitizeContent === 'function') {
            Editor.sanitizeContent();
        }

        const rawMinifiedHtml = Editor.getCleanHTML();
        const safeTitle = UI.escapeHTML(note.title || I18n.t('editor.untitled'));

        const bodyHTML = `
            <div style="display:flex; flex-direction:column; gap:10px; height:100%;">
                <div style="background: rgba(239, 68, 68, 0.08); border-left: 4px solid var(--danger-color); padding: 12px; border-radius: 4px; font-size: 0.85rem; line-height: 1.5;">
                    <div style="color:var(--danger-color); font-weight:bold; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                        <span>${typeof Icons !== 'undefined' ? Icons.alertTriangle : '⚠️'}</span> ${I18n.t('notes_utils.raw_html_warning_title') || 'ATTENZIONE: Modifica Diretta Codice HTML'}
                    </div>
                    <div style="color:var(--text-secondary);">
                        ${I18n.t('notes_utils.raw_html_warning_desc') || 'Stai modificando il markup sorgente liofilizzato della nota. Non alterare o cancellare gli attributi ID dei widget (es. adv_tbl_*, adv_code_*) per non corrompere i dati collegati.'}
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:bold;">Sorgente HTML Minificato:</span>
                    <button class="btn" style="padding:4px 8px; font-size:0.75rem;" onclick="Editor.copyRawHtmlToClipboard()">
                        <span style="display:inline-flex; align-items:center; gap:4px;">${typeof Icons !== 'undefined' ? Icons.clipboard : '📋'} ${I18n.t('notes_utils.raw_html_copy_btn') || 'Copia per VS Code'}</span>
                    </button>
                </div>

                <textarea id="advRawHtmlTextarea" class="modern-input" spellcheck="false" style="flex:1; width:100%; min-height:350px; font-family:'Menlo','Consolas','Monaco',monospace; font-size:0.85rem; line-height:1.5; padding:12px; background:var(--code-bg); color:var(--code-text); border:1px solid var(--border-color); border-radius:6px; resize:none; white-space:pre-wrap; box-sizing:border-box;">${UI.escapeHTML(rawMinifiedHtml)}</textarea>
            </div>
        `;

        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.cancel')}</button>
            <button class="btn btn-primary" onclick="Editor.applyRawHtml()">
                <span style="display:inline-flex; align-items:center; gap:5px;">${typeof Icons !== 'undefined' ? Icons.checkCircle : '✓'} ${I18n.t('notes_utils.raw_html_apply_btn') || 'Applica e Reidrata Pagina'}</span>
            </button>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:6px;">${typeof Icons !== 'undefined' ? Icons.code : '</>'} ${I18n.t('notes_utils.raw_html_title') || 'Sorgente HTML: ' + safeTitle}</span>`, bodyHTML, footerHTML);

        setTimeout(() => {
            const ta = document.getElementById('advRawHtmlTextarea');
            if (ta) {
                ta.value = rawMinifiedHtml;
                ta.focus();
            }
        }, 50);
    },

    copyRawHtmlToClipboard: () => {
        const ta = document.getElementById('advRawHtmlTextarea');
        if (!ta) return;
        navigator.clipboard.writeText(ta.value).then(() => {
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast("Codice HTML copiato negli appunti! Incollalo in VS Code.", "success");
            }
        });
    },

    applyRawHtml: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        if (!note || note.deletedAt) return;

        const ta = document.getElementById('advRawHtmlTextarea');
        if (!ta) return;

        const newRawHtml = ta.value;

        // Salva uno snapshot prima della mutazione: se l'utente sbaglia, potrà annullare con Ctrl+Z!
        Editor.saveSnapshot();

        const editorEl = document.getElementById('noteContent');
        if (!editorEl) return;

        // Minificazione preventiva per sicurezza
        const minified = Editor.minifyHTMLForStorage(newRawHtml);
        note.content = minified;
        note.updatedAt = new Date().toISOString();
        note._isDirty = true;

        // Iniezione nel DOM dell'editor attivo
        editorEl.innerHTML = minified;

        // Reidratazione a catena di tutti i componenti e media
        Editor.hydrateMedia(editorEl);
        if (typeof WidgetManager !== 'undefined') {
            WidgetManager.mountAll(editorEl);
        }
        if (typeof CitationManager !== 'undefined') {
            CitationManager.renderLiveCitations();
        }
        if (typeof Editor.ensureInlineWidgetBuffers === 'function') {
            Editor.ensureInlineWidgetBuffers(editorEl);
        }
        UI.renderInlineFootnotes();
        if (typeof TemplateManager !== 'undefined') {
            TemplateManager.toggleEmptyOverlay();
        }

        Store.triggerAutoSave();
        UI.closeDrawer();

        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(I18n.t('notes_utils.raw_html_success_toast') || "Codice HTML applicato e pagina reidratata con successo!", "success");
        }
    },

    checkContext: () => {
        if (!AppState.isEditMode) return;

        // DISATTIVAZIONE INTEGRALE TOOLBAR SE IL FOCUS È SUL TITOLO DELLA NOTA
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.id === 'noteTitle' || activeEl.classList.contains('title-input'))) {
            Editor.currentContext = null;
            Editor.toggleAdvancedToolbar(false);
            return;
        }

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
                const btn = document.getElementById('btnListMenu');
                if (btn) Editor.openListMenu(null, 'btnListMenu');
            }
        }
    },

    toggleAdvancedToolbar: (enable) => {
        const tb = document.getElementById('editorToolbar');
        if (!tb) return;
        
        // I pulsanti Undo/Redo vengono gestiti in esclusiva da Editor.updateUndoRedoUI() in history
        const buttons = tb.querySelectorAll('button:not([title*="Annulla Ultima"]):not([title*="Ripeti ("])');
        const dropdowns = tb.querySelectorAll('.color-picker-group');

        buttons.forEach(btn => btn.disabled = !enable);
        dropdowns.forEach(grp => {
            if (!enable) grp.classList.add('disabled-tool');
            else grp.classList.remove('disabled-tool');
        });
    }
};