/**
 * ImageManager.js
 * Gestisce l'interazione con le immagini: apertura in nuova finestra, compressione, 
 * ridimensionamento visivo dinamico tramite Drag Handles (Maniglie) e Allineamento.
 * FIX UX CURSORE: Inibizione forzata dei menu tabella (TableManager) se l'utente
 * seleziona un'immagine posta all'interno della griglia, dando priorità al Resizer.
 */

const ImageManager = {
    activeImage: null,
    overlayElement: null,
    isDragging: false,
    dragStartX: 0,
    startWidth: 0,
    dragDirection: '', 

    init: () => {
        document.addEventListener('click', (e) => {
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

        document.addEventListener('keydown', (e) => {
            if (ImageManager.activeImage && (e.key === 'Delete' || e.key === 'Backspace')) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

                e.preventDefault();
                e.stopPropagation();

                if (typeof Editor !== 'undefined') Editor.saveSnapshot();

                ImageManager.activeImage.remove();
                
                ImageManager.hideResizerOverlay();
                ImageManager.hideFloatingMenu();

                if (typeof Store !== 'undefined') Store.triggerAutoSave();
            }
        });

        const scrollArea = document.getElementById('editorScrollContent');
        if (scrollArea) {
            scrollArea.addEventListener('scroll', () => {
                if (ImageManager.overlayElement && !ImageManager.isDragging) {
                    ImageManager.updateResizerPosition();
                }
            });
        }
        
        window.addEventListener('resize', () => {
            if (ImageManager.overlayElement && !ImageManager.isDragging) {
                ImageManager.updateResizerPosition();
            }
        });

        document.addEventListener('mousemove', ImageManager.handleDragMove);
        document.addEventListener('mouseup', ImageManager.handleDragEnd);
    },

    showResizerOverlay: (img) => {
        ImageManager.hideResizerOverlay();
        ImageManager.activeImage = img;

        // FIX UX: Disabilita brutalmente i trigger di TableManager per cedere il passo
        // alla cornice di ridimensionamento delle immagini.
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

        let deltaX = e.pageX - ImageManager.dragStartX;
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
        Store.triggerAutoSave();
    },

    showFloatingMenu: (img) => {
        ImageManager.hideFloatingMenu();

        const popover = document.createElement('div');
        popover.id = 'adv-image-popover';
        popover.className = 'adv-floating-popover';

        const svgOpen = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
        const svgCompress = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="M12 12v9"></path><path d="M8 17l4-4 4 4"></path></svg>`;
        
        const svgAlignLeft = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 6h18v2H3V6zm0 5h12v2H3v-2zm0 5h18v2H3v-2z"/></svg>`;
        const svgAlignCenter = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 6h18v2H3V6zm4 5h10v2H7v-2zm-4 5h18v2H3v-2z"/></svg>`;
        const svgAlignRight = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 6h18v2H3V6zm6 5h12v2H9v-2zm-6 5h18v2H3v-2z"/></svg>`;
        const svgAlignNone = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

        popover.innerHTML = `
            <button onclick="ImageManager.alignImage('left')" title="Testo a destra (Float Left)">${svgAlignLeft}</button>
            <button onclick="ImageManager.alignImage('center')" title="Al Centro (Nessun testo ai lati)">${svgAlignCenter}</button>
            <button onclick="ImageManager.alignImage('right')" title="Testo a sinistra (Float Right)">${svgAlignRight}</button>
            <button onclick="ImageManager.alignImage('none')" title="In linea col testo">${svgAlignNone}</button>
            
            <div style="width:1px; height:16px; background:var(--border-color); margin: 0 4px;"></div>
            
            <button onclick="ImageManager.openImage(ImageManager.activeImage)" title="Apri in un'altra finestra">${svgOpen} Apri</button>
            <div style="width:1px; height:16px; background:var(--border-color); margin: 0 2px;"></div>
            <button onclick="ImageManager.compressImage()" title="Riduci peso e qualità dell'immagine in memoria">${svgCompress} Comprimi</button>
        `;

        document.body.appendChild(popover);

        const rect = img.getBoundingClientRect();
        let top = rect.top + window.scrollY - popover.offsetHeight - 10;
        let left = rect.left + window.scrollX + (rect.width / 2) - (popover.offsetWidth / 2);

        if (top < window.scrollY + 10) {
            top = rect.bottom + window.scrollY + 10;
        }

        if (left < 10) left = 10;
        if (left + popover.offsetWidth > window.innerWidth - 10) left = window.innerWidth - popover.offsetWidth - 10;

        popover.style.top = top + 'px';
        popover.style.left = left + 'px';

        popover.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
        popover.addEventListener('click', e => e.stopPropagation());
    },

    hideFloatingMenu: () => {
        const existing = document.getElementById('adv-image-popover');
        if (existing) existing.remove();
    },

    openImage: (img) => {
        if (!img) return;
        ImageManager.hideFloatingMenu();
        ImageManager.hideResizerOverlay();

        let src = img.src;
        if (!src || src.trim() === '') {
            const imgId = img.getAttribute('data-image-ref');
            if (imgId && Editor.imageCache && Editor.imageCache[imgId]) {
                src = Editor.imageCache[imgId];
            }
        }

        if (!src) return;

        const newTab = window.open();
        newTab.document.write(`
            <body style="margin:0; background:#0e0e0e; display:flex; justify-content:center; align-items:center; min-height:100vh;">
                <img src="${src}" style="max-width:100%; max-height:100vh; object-fit:contain;">
            </body>
        `);
    },

    compressImage: async () => {
        if (!ImageManager.activeImage) return;
        const imgEl = ImageManager.activeImage;
        const imgId = imgEl.getAttribute('data-image-ref');

        if (!imgId || !AppState.assetsHandle) {
            alert("Devi trovarti in un Workspace (Cartella) valido per comprimere permanentemente l'immagine.");
            return;
        }

        if (!confirm("Questa operazione ridurrà la qualità e le dimensioni dell'immagine sovrascrivendo il file originale su disco. Vuoi procedere?")) return;

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();
        ImageManager.hideFloatingMenu();
        ImageManager.hideResizerOverlay();

        try {
            const fileHandle = await AppState.assetsHandle.getFileHandle(imgId);
            const file = await fileHandle.getFile();
            const blobUrl = URL.createObjectURL(file);

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
                    // Sovrascrittura fisica del file originale nel File System
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();

                    // Sostituzione dei puntatori in RAM per aggiornamento in diretta senza F5
                    if (Editor.imageCache[imgId]) URL.revokeObjectURL(Editor.imageCache[imgId]);
                    const newBlobUrl = URL.createObjectURL(blob);
                    Editor.imageCache[imgId] = newBlobUrl;
                    imgEl.src = newBlobUrl;

                    if (typeof Store !== 'undefined') Store.triggerAutoSave();
                    if (typeof UI !== 'undefined') UI.showToast("Compressione su disco completata!", "success");
                    
                }, 'image/webp', 0.7);
            };
            img.src = blobUrl;
        } catch (e) {
            alert("Errore durante la compressione dell'immagine: " + e.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', ImageManager.init);