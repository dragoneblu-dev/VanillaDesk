/**
 * ImageManager.js
 * Gestisce l'interazione con le immagini: Lightbox modale interno con zoom, descrizione collegata al tag img,
 * copia negli appunti, download, compressione intelligente nella schermata di Edit, ritaglio e annotazioni su canvas
 * (riquadro, freccia, oscura/blur), ridimensionamento visivo dinamico tramite Drag Handles (Maniglie) e Allineamento.
 * Inibizione forzata dei menu tabella (TableManager) se l'utente
 * seleziona un'immagine posta all'interno della griglia, dando priorità al Resizer.
 * Apertura e visualizzazione a pieno schermo con recupero on-demand tramite Editor.loadAssetOnDemand.
 * Rimozione centralizzata tramite deleteActiveImage() condivisa tra tastiera (Canc/Backspace) e Taglio (Ctrl+X).
 * Posizionamento intelligente della toolbar contestuale anche per immagini più alte dell'intera viewport.
 * Pulsante Comprimi integrato nella schermata di Edit (openAnnotator) e mostrato solo quando l'immagine è comprimibile.
 */

const ImageManager = {
    activeImage: null,
    overlayElement: null,
    isDragging: false,
    dragStartX: 0,
    startWidth: 0,
    dragDirection: '',

    deleteActiveImage: () => {
        if (!ImageManager.activeImage || !document.body.contains(ImageManager.activeImage)) {
            ImageManager.hideResizerOverlay();
            ImageManager.hideFloatingMenu();
            return false;
        }

        const img = ImageManager.activeImage;
        const editorEl = document.getElementById('noteContent');
        const parent = img.parentNode;
        const prev = img.previousSibling;
        const next = img.nextSibling;
        const sel = window.getSelection();

        // Collassa la selezione subito prima dell'immagine per registrare la posizione nello snapshot Undo
        if (sel && parent) {
            try {
                const preRange = document.createRange();
                preRange.setStartBefore(img);
                preRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(preRange);
            } catch (_) {}
        }

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();

        const idx = parent ? Array.prototype.indexOf.call(parent.childNodes, img) : 0;
        img.remove();

        ImageManager.hideResizerOverlay();
        ImageManager.hideFloatingMenu();

        if (parent && sel) {
            const editableHost = parent.closest ? (parent.closest('[contenteditable="true"]') || editorEl) : editorEl;
            if (editableHost) editableHost.focus({ preventScroll: true });

            const range = document.createRange();
            if (editorEl && parent === editorEl) {
                const isEmptyP = next && next.nodeType === 1 && next.tagName === 'P' &&
                    next.innerText.trim() === '' &&
                    !next.querySelector('img, audio, iframe, hr, .adv-widget-shell');

                if (isEmptyP) {
                    range.setStart(next, 0);
                } else {
                    const p = document.createElement('p');
                    p.innerHTML = '<br>';
                    if (next && next.parentNode === editorEl) editorEl.insertBefore(p, next);
                    else editorEl.appendChild(p);
                    range.setStart(p, 0);
                }
            } else {
                const isBlockEmpty = parent.textContent.replace(/[\u200B\uFEFF]/g, '') === '' &&
                    !parent.querySelector('img, audio, iframe, svg, .adv-widget-shell, .adv-inline-shell');

                if (isBlockEmpty) {
                    if (parent.tagName !== 'TD' && parent.tagName !== 'TH' && !parent.querySelector('br')) {
                        parent.innerHTML = '<br>';
                    }
                    range.setStart(parent, 0);
                } else if (prev && prev.nodeType === 3 && prev.parentNode === parent) {
                    range.setStart(prev, prev.nodeValue.length);
                } else if (next && next.nodeType === 3 && next.parentNode === parent) {
                    range.setStart(next, 0);
                } else {
                    range.setStart(parent, Math.min(Math.max(0, idx), parent.childNodes.length));
                }
            }
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            if (typeof Editor !== 'undefined') Editor.savedRange = range.cloneRange();
        }

        if (typeof UI !== 'undefined' && typeof UI.handleEditorInput === 'function') {
            UI.handleEditorInput();
        } else if (typeof Store !== 'undefined') {
            Store.triggerAutoSave();
        }

        return true;
    },

    init: () => {
        document.addEventListener('click', (e) => {
            if (e.target.closest('#adv-image-lightbox') || e.target.closest('#adv-image-editor-modal')) {
                return;
            }
            if (e.target.tagName === 'IMG' && e.target.closest('#noteContent')) {
                if (AppState.isEditMode) {
                    e.preventDefault();
                    e.stopPropagation();
                    ImageManager.showResizerOverlay(e.target);
                } else {
                    ImageManager.openImage(e.target);
                }
            } else if (!e.target.closest('#adv-image-resizer-overlay') && !e.target.closest('#adv-image-popover')) {
                ImageManager.hideResizerOverlay();
                ImageManager.hideFloatingMenu();
            }
        });

        document.addEventListener('dblclick', (e) => {
            if (e.target.tagName === 'IMG' && e.target.closest('#noteContent')) {
                e.preventDefault();
                e.stopPropagation();
                ImageManager.openImage(e.target);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const editorModal = document.getElementById('adv-image-editor-modal');
                if (editorModal) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof editorModal._cleanup === 'function') editorModal._cleanup();
                    editorModal.remove();
                    return;
                }
                const lightbox = document.getElementById('adv-image-lightbox');
                if (lightbox) {
                    e.preventDefault();
                    e.stopPropagation();
                    lightbox.remove();
                    return;
                }
            }

            if (ImageManager.activeImage && (e.key === 'Delete' || e.key === 'Backspace')) {
                if (document.getElementById('adv-image-editor-modal') || document.getElementById('adv-image-lightbox')) return;
                if (typeof AppState !== 'undefined' && !AppState.isEditMode) return;
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                ImageManager.deleteActiveImage();
            }
        });

        const scrollArea = document.getElementById('editorScrollContent');
        if (scrollArea) {
            scrollArea.addEventListener('scroll', () => {
                if (ImageManager.overlayElement && !ImageManager.isDragging) {
                    ImageManager.updateResizerPosition();
                    ImageManager.updateFloatingMenuPosition();
                }
            });
        }

        window.addEventListener('resize', () => {
            if (ImageManager.overlayElement && !ImageManager.isDragging) {
                ImageManager.updateResizerPosition();
                ImageManager.updateFloatingMenuPosition();
            }
        });

        document.addEventListener('mousemove', ImageManager.handleDragMove);
        document.addEventListener('mouseup', ImageManager.handleDragEnd);
    },

    showResizerOverlay: (img) => {
        ImageManager.hideResizerOverlay();
        ImageManager.activeImage = img;

        // Disabilita i trigger di TableManager per cedere il passo alla cornice dell'immagine
        if (typeof TableManager !== 'undefined') {
            if (typeof TableManager.UI.hideTriggers === 'function') TableManager.UI.hideTriggers();
            if (typeof TableManager.UI.hideMenus === 'function') TableManager.UI.hideMenus();
        }

        const overlay = document.createElement('div');
        overlay.id = 'adv-image-resizer-overlay';

        overlay.innerHTML = `
            <div class="adv-image-handle nw" data-dir="nw"></div>
            <div class="adv-image-handle ne" data-dir="ne"></div>
            <div class="adv-image-handle sw" data-dir="sw"></div>
            <div class="adv-image-handle se" data-dir="se"></div>
            <div class="adv-image-handle w" data-dir="w"></div>
            <div class="adv-image-handle e" data-dir="e"></div>
            <div id="adv-image-resizer-tooltip"></div>
        `;

        document.body.appendChild(overlay);
        ImageManager.overlayElement = overlay;

        overlay.querySelectorAll('.adv-image-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                ImageManager.startDrag(e, handle.getAttribute('data-dir'));
            });
        });

        ImageManager.updateResizerPosition();
        ImageManager.showFloatingMenu(img);
    },

    updateResizerPosition: () => {
        if (!ImageManager.activeImage || !ImageManager.overlayElement) return;

        const img = ImageManager.activeImage;
        const rect = img.getBoundingClientRect();

        if (rect.width === 0 || rect.height === 0) {
            ImageManager.hideResizerOverlay();
            return;
        }

        const overlay = ImageManager.overlayElement;
        overlay.style.top = (rect.top + window.scrollY) + 'px';
        overlay.style.left = (rect.left + window.scrollX) + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
    },

    hideResizerOverlay: () => {
        if (ImageManager.overlayElement) {
            ImageManager.overlayElement.remove();
            ImageManager.overlayElement = null;
        }
        ImageManager.activeImage = null;
        ImageManager.isDragging = false;
    },

    startDrag: (e, direction) => {
        ImageManager.isDragging = true;
        ImageManager.dragStartX = e.pageX;
        ImageManager.dragDirection = direction;

        const rect = ImageManager.activeImage.getBoundingClientRect();
        ImageManager.startWidth = rect.width;

        document.body.style.cursor = (direction === 'e' || direction === 'w') ? 'ew-resize' :
                                     (direction === 'nw' || direction === 'se') ? 'nwse-resize' : 'nesw-resize';

        const tooltip = document.getElementById('adv-image-resizer-tooltip');
        if (tooltip) {
            tooltip.style.display = 'block';
            tooltip.innerText = `${Math.round(ImageManager.startWidth)}px`;
        }

        document.body.style.userSelect = 'none';
    },

    handleDragMove: (e) => {
        if (!ImageManager.isDragging || !ImageManager.activeImage) return;

        const deltaX = e.pageX - ImageManager.dragStartX;
        let newWidth = ImageManager.startWidth;

        if (ImageManager.dragDirection.includes('w')) {
            newWidth -= deltaX;
        } else if (ImageManager.dragDirection.includes('e')) {
            newWidth += deltaX;
        }

        if (newWidth < 50) newWidth = 50;

        ImageManager.activeImage.style.maxWidth = newWidth + 'px';
        ImageManager.activeImage.style.width = '100%';

        ImageManager.updateResizerPosition();
        ImageManager.updateFloatingMenuPosition();

        const tooltip = document.getElementById('adv-image-resizer-tooltip');
        if (tooltip) {
            tooltip.innerText = `${Math.round(newWidth)}px`;
        }
    },

    handleDragEnd: () => {
        if (!ImageManager.isDragging) return;

        ImageManager.isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        const tooltip = document.getElementById('adv-image-resizer-tooltip');
        if (tooltip) tooltip.style.display = 'none';

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();
        Store.triggerAutoSave();
    },

    alignImage: (alignment) => {
        if (!ImageManager.activeImage) return;

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();
        const img = ImageManager.activeImage;

        img.style.display = '';
        img.style.float = '';
        img.style.margin = '';

        if (alignment === 'center') {
            img.style.display = 'block';
            img.style.margin = '10px auto';
        } else if (alignment === 'left') {
            img.style.float = 'left';
            img.style.margin = '10px 15px 10px 0';
        } else if (alignment === 'right') {
            img.style.float = 'right';
            img.style.margin = '10px 0 10px 15px';
        } else {
            img.style.margin = '10px 0';
        }

        ImageManager.updateResizerPosition();
        ImageManager.updateFloatingMenuPosition();
        Store.triggerAutoSave();
    },

    updateFloatingMenuPosition: () => {
        const popover = document.getElementById('adv-image-popover');
        const img = ImageManager.activeImage;
        if (!popover || !img || !document.body.contains(img)) return;

        const rect = img.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const scrollArea = document.getElementById('editorScrollContent');
        const areaRect = scrollArea ? scrollArea.getBoundingClientRect() : { top: 60, bottom: window.innerHeight };

        const popH = popover.offsetHeight;
        const popW = popover.offsetWidth;
        const minTop = areaRect.top + 8;
        const maxTop = Math.max(minTop, areaRect.bottom - popH - 8);

        let top;
        if (rect.top - popH - 10 >= minTop) {
            top = rect.top - popH - 10;
        } else if (rect.bottom + popH + 10 <= areaRect.bottom) {
            top = rect.bottom + 10;
        } else {
            // Immagine più alta dello spazio disponibile: ancora la barra nella parte alta visibile dell'immagine
            top = Math.min(maxTop, Math.max(minTop, rect.top + 10));
        }

        let left = rect.left + (rect.width / 2) - (popW / 2);
        if (left < 10) left = 10;
        if (left + popW > window.innerWidth - 10) left = Math.max(10, window.innerWidth - popW - 10);

        popover.style.position = 'fixed';
        popover.style.top = Math.round(top) + 'px';
        popover.style.left = Math.round(left) + 'px';
    },

    _resolveImageSource: async (img) => {
        if (!img) return null;
        let src = img.src;
        const isPlaceholder = src && src.startsWith('data:image/svg');

        if (!src || src.trim() === '' || isPlaceholder) {
            const imgId = img.getAttribute('data-image-ref');
            if (imgId) {
                if (Editor.imageCache && Editor.imageCache[imgId]) {
                    src = Editor.imageCache[imgId];
                } else if (typeof Editor.loadAssetOnDemand === 'function') {
                    src = await Editor.loadAssetOnDemand(imgId, 'img');
                }
            }
        }
        return src || null;
    },

    _evaluateCompressionEligibility: async (img) => {
        if (!img || img.getAttribute('data-broken') === 'true') return { needed: false, sizeBytes: 0 };
        const ref = img.getAttribute('data-image-ref');
        if (!ref || (!AppState.assetsHandle && AppState.storageMode !== 'idb')) return { needed: false, sizeBytes: 0 };

        const isWebp = ref.toLowerCase().endsWith('.webp');
        const natWidth = img.naturalWidth || 0;
        let sizeBytes = 0;

        if (img.src && img.src.startsWith('blob:')) {
            try {
                const res = await fetch(img.src);
                if (res.ok) {
                    const blob = await res.blob();
                    sizeBytes = blob.size || 0;
                }
            } catch (_) {}
        }

        if (sizeBytes === 0) {
            return { needed: natWidth > 1200 || !isWebp, sizeBytes: 0 };
        }

        // Non comprimere immagini già leggere (<= 150 KB) o già ottimizzate (WebP <= 1200px e <= 250 KB)
        if (sizeBytes <= 150 * 1024) return { needed: false, sizeBytes };
        if (isWebp && natWidth > 0 && natWidth <= 1200 && sizeBytes <= 250 * 1024) return { needed: false, sizeBytes };

        return { needed: true, sizeBytes };
    },

    // Estrae il testo grezzo della descrizione salvata in data-tooltip sul tag <img>
    _getImageDescriptionText: (img) => {
        if (!img || img.getAttribute('data-broken') === 'true') return '';
        const raw = img.getAttribute('data-tooltip') || '';
        if (!raw) return '';
        const txt = document.createElement('textarea');
        txt.innerHTML = raw.replace(/<br\s*\/?>/gi, '\n');
        return txt.value;
    },

    // Apre il pannello laterale standard dell'applicazione per aggiungere/modificare la descrizione dell'immagine
    openDescriptionDrawer: (img) => {
        if (!img || !document.body.contains(img)) return;
        const targetImg = img;
        ImageManager.hideFloatingMenu();
        ImageManager.hideResizerOverlay();

        const currentText = ImageManager._getImageDescriptionText(targetImg);

        const bodyHTML = `
            <div style="display:flex; flex-direction:column; height:100%; gap:10px;">
                <textarea id="imgDescriptionInput" class="modern-input adv-scroll-container" style="flex:1; min-height:180px; width:100%; resize:vertical; font-size:0.9rem; line-height:1.5; padding:10px; box-sizing:border-box;" placeholder="${I18n.t('image_manager.drawer_note_placeholder')}">${UI.escapeHTML(currentText)}</textarea>
            </div>
        `;

        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.cancel')}</button>
            <button class="btn btn-primary" id="btnSaveImgDescription" style="gap:1px">${I18n.t('common.save')} (Ctrl +<span style="display:inline-flex; vertical-align:middle;">${Icons.returnKey}</span>)</button>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:6px;">${Icons.noteInline} ${I18n.t('image_manager.drawer_note_title')}</span>`, bodyHTML, footerHTML);

        setTimeout(() => {
            const input = document.getElementById('imgDescriptionInput');
            const saveBtn = document.getElementById('btnSaveImgDescription');

            const commitDescription = () => {
                if (!input || !document.body.contains(targetImg)) return;
                if (typeof Editor !== 'undefined') Editor.saveSnapshot();

                const cleanVal = input.value.trim();
                if (cleanVal) {
                    const safeHtml = UI.escapeHTML(cleanVal).replace(/\r?\n/g, '<br>');
                    targetImg.setAttribute('data-tooltip', safeHtml);
                } else {
                    targetImg.removeAttribute('data-tooltip');
                }

                // Sincronizzazione immediata della nota in RAM per rendere ricercabile la descrizione all'istante
                if (AppState.currentNoteId) {
                    const curNote = Store.getNote(AppState.currentNoteId);
                    if (curNote && typeof Editor !== 'undefined' && typeof Editor.getCleanHTML === 'function') {
                        curNote.content = Editor.getCleanHTML();
                        curNote._isDirty = true;
                        curNote.updatedAt = new Date().toISOString();
                    }
                }

                if (typeof Store !== 'undefined') Store.triggerAutoSave();
                UI.closeDrawer();
            };

            if (saveBtn) saveBtn.onclick = commitDescription;
            if (input) {
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            }
        }, 50);
    },

    showFloatingMenu: (img) => {
        ImageManager.hideFloatingMenu();

        const popover = document.createElement('div');
        popover.id = 'adv-image-popover';
        popover.className = 'adv-floating-popover';

        const hasRef = !!img.getAttribute('data-image-ref') && img.getAttribute('data-broken') !== 'true';
        const annotateBtnHtml = hasRef
            ? `<button onclick="ImageManager.openAnnotator(ImageManager.activeImage)" title="${I18n.t('common.edit')}">${Icons.editTbl}</button>`
            : '';

        const hasDescription = img.getAttribute('data-broken') !== 'true' && !!img.getAttribute('data-tooltip');
        const noteBtnStyle = hasDescription ? 'color:var(--accent-color);' : '';
        const noteBtnTitle = hasDescription ? I18n.t('image_manager.btn_note_edit') : I18n.t('image_manager.btn_note_add');

        popover.innerHTML = `
            <button onclick="ImageManager.alignImage('left')" title="${I18n.t('image_manager.align_left')}">${Icons.alignLeft}</button>
            <button onclick="ImageManager.alignImage('center')" title="${I18n.t('image_manager.align_center')}">${Icons.alignCenter}</button>
            <button onclick="ImageManager.alignImage('right')" title="${I18n.t('image_manager.align_right')}">${Icons.alignRight}</button>
            <button onclick="ImageManager.alignImage('none')" title="${I18n.t('image_manager.align_none')}">${Icons.alignNone}</button>

            <div style="width:1px; height:16px; background:var(--border-color); margin: 0 2px;"></div>

            <button onclick="ImageManager.openImage(ImageManager.activeImage)" title="${I18n.t('image_manager.open_title')}">${Icons.openLink}</button>
            <button onclick="ImageManager.copyImage(ImageManager.activeImage)" title="${I18n.t('image_manager.copy_image')}">${Icons.clipboard}</button>
            <button onclick="ImageManager.downloadImage(ImageManager.activeImage)" title="${I18n.t('image_manager.download_image')}">${Icons.download}</button>
            <button onclick="ImageManager.openDescriptionDrawer(ImageManager.activeImage)" style="${noteBtnStyle}" title="${noteBtnTitle}">${Icons.noteInline}</button>
            ${annotateBtnHtml}
        `;

        document.body.appendChild(popover);
        ImageManager.updateFloatingMenuPosition();

        popover.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
        popover.addEventListener('click', e => e.stopPropagation());
    },

    hideFloatingMenu: () => {
        const existing = document.getElementById('adv-image-popover');
        if (existing) existing.remove();
    },

    // FUNZIONALITÀ 1: COPIA IMMAGINE NEGLI APPUNTI (PNG tramite ClipboardItem)
    copyImage: async (img) => {
        if (!img) return;
        const src = await ImageManager._resolveImageSource(img);
        if (!src) return;

        try {
            const loadedImg = await new Promise((resolve, reject) => {
                const i = new Image();
                i.crossOrigin = 'anonymous';
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = src;
            });

            const canvas = document.createElement('canvas');
            canvas.width = loadedImg.naturalWidth || loadedImg.width;
            canvas.height = loadedImg.naturalHeight || loadedImg.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(loadedImg, 0, 0);

            const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            if (!pngBlob) throw new Error('Canvas toBlob failed');

            await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast(I18n.t('image_manager.copied_toast'), "success");
            }
        } catch (err) {
            console.warn('[ImageManager.copyImage] Errore:', err);
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast(I18n.t('image_manager.copy_error'), "warning");
            }
        }
    },

    // FUNZIONALITÀ 2: SCARICA IMMAGINE SU DISCO (Usa il nome reale memorizzato in data-image-ref)
    downloadImage: async (img) => {
        if (!img) return;
        const src = await ImageManager._resolveImageSource(img);
        if (!src) return;

        const ref = img.getAttribute('data-image-ref') || '';
        const rawAlt = (img.getAttribute('alt') || '').trim();
        const filename = ref || rawAlt || 'image.png';

        const a = document.createElement('a');
        a.href = src;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
    },

    // FUNZIONALITÀ 5: LIGHTBOX MODALE INTERNO CON ZOOM
    openImage: async (img) => {
        if (!img) return;
        ImageManager.hideFloatingMenu();
        ImageManager.hideResizerOverlay();

        const src = await ImageManager._resolveImageSource(img);
        if (!src) return;

        const oldLb = document.getElementById('adv-image-lightbox');
        if (oldLb) oldLb.remove();

        const ref = img.getAttribute('data-image-ref') || '';
        const rawAlt = (img.getAttribute('alt') || '').trim();
        const isGenericAlt = !rawAlt || /^image(\.[a-z0-9]+)?$/i.test(rawAlt) || rawAlt === I18n.t('editor_core.image_label');
        const displayTitle = UI.escapeHTML(!isGenericAlt ? rawAlt : (ref || rawAlt || I18n.t('editor_core.image_label')));

        const hasRef = !!ref && img.getAttribute('data-broken') !== 'true';
        const editBtnHtml = hasRef
            ? `<button id="lbEditBtn" class="btn" style="padding:4px 10px;" title="${I18n.t('common.edit')}">${Icons.editTbl}</button>`
            : '';

        const captionHtml = (img.getAttribute('data-broken') !== 'true' && img.getAttribute('data-tooltip'))
            ? `<div style="margin-top:12px; max-width:80vw; padding:8px 14px; border-radius:6px; background:var(--sidebar-bg); border:1px solid var(--border-color); color:var(--text-primary); font-size:0.85rem; line-height:1.45; text-align:center;">${img.getAttribute('data-tooltip')}</div>`
            : '';

        const lb = document.createElement('div');
        lb.id = 'adv-image-lightbox';
        lb.style.cssText = 'position:fixed; inset:0; background:color-mix(in srgb, var(--bg-color) 92%, transparent); z-index:10010; display:flex; flex-direction:column; backdrop-filter:blur(6px);';

        lb.innerHTML = `
            <div style="height:48px; padding:0 16px; display:flex; align-items:center; justify-content:space-between; background:var(--sidebar-bg); border-bottom:1px solid var(--border-color); color:var(--text-primary); flex-shrink:0; width:100%; box-sizing:border-box;">
                <span style="font-size:0.88rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:45vw;">${displayTitle}</span>
                <div style="display:flex; align-items:center; gap:8px;">
                    <button id="lbZoomOut" class="btn" style="padding:4px 10px;">${Icons.zoomOut}</button>
                    <button id="lbZoomReset" class="btn" style="padding:4px 10px; min-width:70px; justify-content:center;">${I18n.t('image_manager.lightbox_fit')}</button>
                    <button id="lbZoomIn" class="btn" style="padding:4px 10px;">${Icons.zoomIn}</button>
                    <div style="width:1px; height:18px; background:var(--border-color); margin:0 4px;"></div>
                    ${editBtnHtml}
                    <button id="lbDownloadBtn" class="btn" style="padding:4px 10px;" title="${I18n.t('image_manager.download_image')}">${Icons.download}</button>
                    <button id="lbCloseBtn" class="btn" style="background:var(--danger-color); color:#fff; border-color:var(--danger-color); padding:4px 10px;" title="${I18n.t('common.close')}">${Icons.close}</button>
                </div>
            </div>
            <div id="lbViewport" style="flex:1; overflow:auto; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px; cursor:zoom-out;">
                <img id="lbImg" src="${src}" style="max-width:92vw; max-height:${captionHtml ? '78vh' : '85vh'}; object-fit:contain; border-radius:4px; border:1px solid var(--border-color); box-shadow:0 10px 35px rgba(0,0,0,0.25); cursor:default; transition:width 0.1s ease;">
                ${captionHtml}
            </div>
        `;

        document.body.appendChild(lb);

        const lbViewport = lb.querySelector('#lbViewport');
        const lbImg = lb.querySelector('#lbImg');
        const zoomResetBtn = lb.querySelector('#lbZoomReset');
        let zoomLevel = null; // null = Adatta

        const applyZoom = (newZoom) => {
            zoomLevel = newZoom;
            if (zoomLevel === null) {
                lbImg.style.width = '';
                lbImg.style.maxWidth = '92vw';
                lbImg.style.maxHeight = captionHtml ? '78vh' : '85vh';
                zoomResetBtn.textContent = I18n.t('image_manager.lightbox_fit');
            } else {
                const natW = lbImg.naturalWidth || lbImg.clientWidth || 800;
                lbImg.style.maxWidth = 'none';
                lbImg.style.maxHeight = 'none';
                lbImg.style.width = Math.round(natW * zoomLevel) + 'px';
                zoomResetBtn.textContent = Math.round(zoomLevel * 100) + '%';
            }
        };

        lb.querySelector('#lbZoomIn').onclick = (e) => {
            e.stopPropagation();
            const base = zoomLevel === null ? Math.min(1, (lbImg.clientWidth || 800) / (lbImg.naturalWidth || 800)) : zoomLevel;
            applyZoom(Math.min(4, +(base + 0.25).toFixed(2)));
        };
        lb.querySelector('#lbZoomOut').onclick = (e) => {
            e.stopPropagation();
            const base = zoomLevel === null ? Math.min(1, (lbImg.clientWidth || 800) / (lbImg.naturalWidth || 800)) : zoomLevel;
            applyZoom(Math.max(0.15, +(base - 0.25).toFixed(2)));
        };
        zoomResetBtn.onclick = (e) => {
            e.stopPropagation();
            applyZoom(zoomLevel === null ? 1 : null);
        };

        const editBtn = lb.querySelector('#lbEditBtn');
        if (editBtn) {
            editBtn.onclick = (e) => {
                e.stopPropagation();
                lb.remove();
                ImageManager.openAnnotator(img);
            };
        }

        lb.querySelector('#lbDownloadBtn').onclick = (e) => { e.stopPropagation(); ImageManager.downloadImage(img); };
        lb.querySelector('#lbCloseBtn').onclick = () => lb.remove();

        lbViewport.addEventListener('click', (e) => {
            if (e.target === lbViewport) lb.remove();
        });
        lbViewport.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const base = zoomLevel === null ? Math.min(1, (lbImg.clientWidth || 800) / (lbImg.naturalWidth || 800)) : zoomLevel;
                const delta = e.deltaY < 0 ? 0.15 : -0.15;
                applyZoom(Math.max(0.15, Math.min(4, +(base + delta).toFixed(2))));
            }
        }, { passive: false });
    },

    // FUNZIONALITÀ 7 & 9: EDITOR CANVAS RITAGLIO E ANNOTAZIONI (RIQUADRO, FRECCIA, SFOCA/BLUR)
    openAnnotator: async (img) => {
        if (!img) return;
        const imgId = img.getAttribute('data-image-ref');
        if (!imgId) return;

        const src = await ImageManager._resolveImageSource(img);
        if (!src) return;

        ImageManager.hideFloatingMenu();
        ImageManager.hideResizerOverlay();

        const loadedImg = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = src;
        }).catch(() => null);
        if (!loadedImg) return;

        const oldModal = document.getElementById('adv-image-editor-modal');
        if (oldModal) {
            if (typeof oldModal._cleanup === 'function') oldModal._cleanup();
            oldModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'adv-image-editor-modal';
        modal.style.cssText = 'position:fixed; inset:0; background:color-mix(in srgb, var(--bg-color) 92%, transparent); z-index:10015; display:flex; flex-direction:column; backdrop-filter:blur(6px);';

        modal.innerHTML = `
            <div style="height:48px; padding:0 16px; display:flex; align-items:center; justify-content:space-between; background:var(--sidebar-bg); border-bottom:1px solid var(--border-color); color:var(--text-primary); flex-shrink:0; width:100%; box-sizing:border-box; gap:10px;">
                <span style="font-size:0.88rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${I18n.t('image_manager.editor_title')}</span>
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;" id="imgEditorToolsGroup">
                    <button class="btn btn-primary" data-tool="rect" id="imgToolRect" style="padding:4px 10px;">${I18n.t('image_manager.tool_rect')}</button>
                    <button class="btn" data-tool="arrow" id="imgToolArrow" style="padding:4px 10px;">${I18n.t('image_manager.tool_arrow')}</button>
                    <button class="btn" data-tool="blur" id="imgToolBlur" style="padding:4px 10px;">${I18n.t('image_manager.tool_blur')}</button>
                    <button class="btn" data-tool="crop" id="imgToolCrop" style="padding:4px 10px;">${I18n.t('image_manager.tool_crop')}</button>
                    <div style="width:1px; height:18px; background:var(--border-color); margin:0 4px;"></div>
                    <button class="btn" id="imgToolUndo" disabled style="opacity:0.4; padding:4px 10px;">${Icons.undo} ${I18n.t('image_manager.tool_undo')}</button>
                </div>
                <div style="display:flex; align-items:center; gap:8px;" id="imgEditorActionsGroup">
                    <button class="btn" id="imgEditCancel" style="padding:4px 10px;">${I18n.t('common.cancel')}</button>
                    <button class="btn btn-primary" id="imgEditSave" style="padding:4px 10px;">${I18n.t('image_manager.btn_save_changes')}</button>
                </div>
            </div>
            <div style="flex:1; overflow:auto; display:flex; align-items:center; justify-content:center; padding:24px;">
                <canvas id="imgEditorCanvas" style="max-width:88vw; max-height:76vh; border:1px solid var(--border-color); border-radius:4px; box-shadow:0 10px 35px rgba(0,0,0,0.25); cursor:crosshair; background:#fff;"></canvas>
            </div>
        `;

        document.body.appendChild(modal);

        // Canvas di lavoro alla risoluzione reale e canvas visibile sullo schermo
        const workCanvas = document.createElement('canvas');
        workCanvas.width = loadedImg.naturalWidth || loadedImg.width;
        workCanvas.height = loadedImg.naturalHeight || loadedImg.height;
        const workCtx = workCanvas.getContext('2d');
        workCtx.drawImage(loadedImg, 0, 0);

        const displayCanvas = modal.querySelector('#imgEditorCanvas');
        const displayCtx = displayCanvas.getContext('2d');
        const undoBtn = modal.querySelector('#imgToolUndo');

        let activeTool = 'rect';
        const history = [];
        let isDrawing = false;
        let startX = 0;
        let startY = 0;

        const syncDisplay = () => {
            displayCanvas.width = workCanvas.width;
            displayCanvas.height = workCanvas.height;
            displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
            displayCtx.drawImage(workCanvas, 0, 0);
        };
        syncDisplay();

        const pushHistory = () => {
            const snap = document.createElement('canvas');
            snap.width = workCanvas.width;
            snap.height = workCanvas.height;
            snap.getContext('2d').drawImage(workCanvas, 0, 0);
            history.push(snap);
            if (history.length > 20) history.shift();
            undoBtn.disabled = false;
            undoBtn.style.opacity = '1';
        };

        const setTool = (tool) => {
            activeTool = tool;
            modal.querySelectorAll('[data-tool]').forEach(b => {
                if (b.getAttribute('data-tool') === tool) b.classList.add('btn-primary');
                else b.classList.remove('btn-primary');
            });
        };

        modal.querySelectorAll('[data-tool]').forEach(btn => {
            btn.onclick = () => setTool(btn.getAttribute('data-tool'));
        });

        undoBtn.onclick = () => {
            if (history.length === 0) return;
            const prev = history.pop();
            workCanvas.width = prev.width;
            workCanvas.height = prev.height;
            workCtx.clearRect(0, 0, workCanvas.width, workCanvas.height);
            workCtx.drawImage(prev, 0, 0);
            syncDisplay();
            if (history.length === 0) {
                undoBtn.disabled = true;
                undoBtn.style.opacity = '0.4';
            }
        };

        const getCanvasCoords = (e) => {
            const rect = displayCanvas.getBoundingClientRect();
            const scaleX = displayCanvas.width / rect.width;
            const scaleY = displayCanvas.height / rect.height;
            return {
                x: Math.max(0, Math.min(displayCanvas.width, (e.clientX - rect.left) * scaleX)),
                y: Math.max(0, Math.min(displayCanvas.height, (e.clientY - rect.top) * scaleY))
            };
        };

        const drawArrow = (ctx, x1, y1, x2, y2, strokeW) => {
            const headLen = Math.max(14, strokeW * 4.5);
            const angle = Math.atan2(y2 - y1, x2 - x1);
            ctx.save();
            ctx.strokeStyle = '#ef4444';
            ctx.fillStyle = '#ef4444';
            ctx.lineWidth = strokeW;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2 - Math.cos(angle) * (headLen * 0.6), y2 - Math.sin(angle) * (headLen * 0.6));
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        };

        const applyPixelateBlur = (ctx, x, y, w, h) => {
            const rx = Math.max(0, Math.floor(Math.min(x, x + w)));
            const ry = Math.max(0, Math.floor(Math.min(y, y + h)));
            const rw = Math.min(workCanvas.width - rx, Math.ceil(Math.abs(w)));
            const rh = Math.min(workCanvas.height - ry, Math.ceil(Math.abs(h)));
            if (rw < 4 || rh < 4) return;

            const blockSize = Math.max(8, Math.round(Math.min(workCanvas.width, workCanvas.height) / 55));
            const tinyW = Math.max(1, Math.floor(rw / blockSize));
            const tinyH = Math.max(1, Math.floor(rh / blockSize));

            const tinyCanvas = document.createElement('canvas');
            tinyCanvas.width = tinyW;
            tinyCanvas.height = tinyH;
            const tCtx = tinyCanvas.getContext('2d');
            tCtx.drawImage(workCanvas, rx, ry, rw, rh, 0, 0, tinyW, tinyH);

            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tinyCanvas, 0, 0, tinyW, tinyH, rx, ry, rw, rh);
            ctx.restore();
        };

        const drawOverlayPreview = (curX, curY) => {
            syncDisplay();
            const strokeW = Math.max(3, Math.round(workCanvas.width / 220));
            const w = curX - startX;
            const h = curY - startY;

            if (activeTool === 'rect') {
                displayCtx.save();
                displayCtx.strokeStyle = '#ef4444';
                displayCtx.lineWidth = strokeW;
                displayCtx.strokeRect(startX, startY, w, h);
                displayCtx.restore();
            } else if (activeTool === 'arrow') {
                drawArrow(displayCtx, startX, startY, curX, curY, strokeW);
            } else if (activeTool === 'blur') {
                displayCtx.save();
                displayCtx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                displayCtx.strokeStyle = '#38bdf8';
                displayCtx.lineWidth = Math.max(2, strokeW * 0.7);
                displayCtx.setLineDash([6, 4]);
                displayCtx.fillRect(startX, startY, w, h);
                displayCtx.strokeRect(startX, startY, w, h);
                displayCtx.restore();
            } else if (activeTool === 'crop') {
                const rx = Math.min(startX, curX);
                const ry = Math.min(startY, curY);
                const rw = Math.abs(w);
                const rh = Math.abs(h);
                displayCtx.save();
                displayCtx.fillStyle = 'rgba(0, 0, 0, 0.55)';
                displayCtx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
                displayCtx.drawImage(workCanvas, rx, ry, rw, rh, rx, ry, rw, rh);
                displayCtx.strokeStyle = '#ffffff';
                displayCtx.lineWidth = Math.max(2, strokeW * 0.7);
                displayCtx.setLineDash([8, 4]);
                displayCtx.strokeRect(rx, ry, rw, rh);
                displayCtx.restore();
            }
        };

        displayCanvas.onmousedown = (e) => {
            e.preventDefault();
            const pt = getCanvasCoords(e);
            startX = pt.x;
            startY = pt.y;
            isDrawing = true;
        };

        const onMove = (e) => {
            if (!isDrawing) return;
            const pt = getCanvasCoords(e);
            drawOverlayPreview(pt.x, pt.y);
        };

        const onUp = (e) => {
            if (!isDrawing) return;
            isDrawing = false;
            const pt = getCanvasCoords(e);
            const dx = pt.x - startX;
            const dy = pt.y - startY;

            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
                syncDisplay();
                return;
            }

            pushHistory();
            const strokeW = Math.max(3, Math.round(workCanvas.width / 220));

            if (activeTool === 'rect') {
                workCtx.save();
                workCtx.strokeStyle = '#ef4444';
                workCtx.lineWidth = strokeW;
                workCtx.strokeRect(startX, startY, dx, dy);
                workCtx.restore();
            } else if (activeTool === 'arrow') {
                drawArrow(workCtx, startX, startY, pt.x, pt.y, strokeW);
            } else if (activeTool === 'blur') {
                applyPixelateBlur(workCtx, startX, startY, dx, dy);
            } else if (activeTool === 'crop') {
                const rx = Math.max(0, Math.round(Math.min(startX, pt.x)));
                const ry = Math.max(0, Math.round(Math.min(startY, pt.y)));
                const rw = Math.min(workCanvas.width - rx, Math.round(Math.abs(dx)));
                const rh = Math.min(workCanvas.height - ry, Math.round(Math.abs(dy)));
                if (rw >= 16 && rh >= 16) {
                    const cropped = document.createElement('canvas');
                    cropped.width = rw;
                    cropped.height = rh;
                    cropped.getContext('2d').drawImage(workCanvas, rx, ry, rw, rh, 0, 0, rw, rh);
                    workCanvas.width = rw;
                    workCanvas.height = rh;
                    workCtx.drawImage(cropped, 0, 0);
                }
            }
            syncDisplay();
        };

        const cleanupListeners = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        modal._cleanup = cleanupListeners;

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);

        // Valuta l'idoneità alla compressione e aggiunge il pulsante direttamente nella schermata di Edit
        ImageManager._evaluateCompressionEligibility(img).then(({ needed, sizeBytes }) => {
            if (!needed || !document.body.contains(modal)) return;
            const actionsGroup = modal.querySelector('#imgEditorActionsGroup');
            const cancelBtn = modal.querySelector('#imgEditCancel');
            if (!actionsGroup || !cancelBtn) return;

            const sizeLabel = sizeBytes > 0
                ? ` (${sizeBytes >= 1024 * 1024 ? (sizeBytes / (1024 * 1024)).toFixed(1) + ' MB' : Math.round(sizeBytes / 1024) + ' KB'})`
                : '';

            const compressBtn = document.createElement('button');
            compressBtn.className = 'btn';
            compressBtn.style.padding = '4px 10px';
            compressBtn.title = I18n.t('image_manager.compress_title') + sizeLabel;
            compressBtn.innerHTML = `${Icons.compress} ${I18n.t('image_manager.compress')}${sizeLabel}`;
            compressBtn.onclick = () => {
                ImageManager.compressImage(img, () => {
                    cleanupListeners();
                    modal.remove();
                });
            };

            const sep = document.createElement('div');
            sep.style.cssText = 'width:1px; height:18px; background:var(--border-color); margin:0 2px;';

            actionsGroup.insertBefore(compressBtn, cancelBtn);
            actionsGroup.insertBefore(sep, cancelBtn);
        });

        modal.querySelector('#imgEditCancel').onclick = () => {
            cleanupListeners();
            modal.remove();
        };

        modal.querySelector('#imgEditSave').onclick = () => {
            const isPng = imgId.toLowerCase().endsWith('.png');
            const isJpg = imgId.toLowerCase().endsWith('.jpg') || imgId.toLowerCase().endsWith('.jpeg');
            const mimeType = isPng ? 'image/png' : (isJpg ? 'image/jpeg' : 'image/webp');
            const quality = isPng ? undefined : 0.9;

            workCanvas.toBlob(async (blob) => {
                if (!blob) return;

                if (AppState.storageMode === 'idb' && AppState.workspaceId) {
                    await Store.idbSaveAsset(AppState.workspaceId, imgId, blob, mimeType);
                } else if (AppState.assetsHandle) {
                    const fileHandle = await AppState.assetsHandle.getFileHandle(imgId, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                }

                if (Editor.imageCache[imgId]) URL.revokeObjectURL(Editor.imageCache[imgId]);
                const newBlobUrl = URL.createObjectURL(blob);
                Editor.imageCache[imgId] = newBlobUrl;
                img.src = newBlobUrl;

                if (typeof Editor !== 'undefined') Editor.saveSnapshot();
                if (typeof Store !== 'undefined') Store.triggerAutoSave();
                if (typeof UI !== 'undefined' && UI.showToast) UI.showToast(I18n.t('image_manager.saved_toast'), "success");

                cleanupListeners();
                modal.remove();
            }, mimeType, quality);
        };
    },

    compressImage: async (targetImg = null, onSuccessCallback = null) => {
        const imgEl = targetImg || ImageManager.activeImage;
        if (!imgEl) return;
        const imgId = imgEl.getAttribute('data-image-ref');

        if (!imgId || (!AppState.assetsHandle && AppState.storageMode !== 'idb')) {
            alert(I18n.t('image_manager.compress_no_workspace'));
            return;
        }

        if (!confirm(I18n.t('image_manager.compress_confirm'))) return;

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();
        ImageManager.hideFloatingMenu();
        ImageManager.hideResizerOverlay();

        try {
            let blobUrl = imgEl.src;

            // Se l'immagine non è già in memoria o è un placeholder, la carica tramite loadAssetOnDemand
            if (!blobUrl || !blobUrl.startsWith('blob:')) {
                blobUrl = await Editor.loadAssetOnDemand(imgId, 'img');
            }
            if (!blobUrl) {
                throw new Error(I18n.t('editor_core.missing_image'));
            }

            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                const MAX_WIDTH = 1200;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(async (blob) => {
                    if (!blob) return;

                    // 1. CASO MEMORIA BROWSER (IndexedDB)
                    if (AppState.storageMode === 'idb' && AppState.workspaceId) {
                        await Store.idbSaveAsset(AppState.workspaceId, imgId, blob, 'image/webp');
                    }
                    // 2. CASO CARTELLA SU DISCO (File System Access API)
                    else if (AppState.assetsHandle) {
                        const fileHandle = await AppState.assetsHandle.getFileHandle(imgId);
                        const writable = await fileHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                    }

                    // Sostituzione dei puntatori in RAM per aggiornamento in diretta senza F5
                    if (Editor.imageCache[imgId]) URL.revokeObjectURL(Editor.imageCache[imgId]);
                    const newBlobUrl = URL.createObjectURL(blob);
                    Editor.imageCache[imgId] = newBlobUrl;
                    imgEl.src = newBlobUrl;

                    if (typeof Store !== 'undefined') Store.triggerAutoSave();
                    if (typeof UI !== 'undefined') UI.showToast(I18n.t('image_manager.compress_success'), "success");
                    if (typeof onSuccessCallback === 'function') onSuccessCallback();

                }, 'image/webp', 0.7);
            };
            img.onerror = () => {
                alert(I18n.t('image_manager.compress_error') + I18n.t('editor_core.missing_image'));
            };
            img.src = blobUrl;
        } catch (e) {
            alert(I18n.t('image_manager.compress_error') + e.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', ImageManager.init);