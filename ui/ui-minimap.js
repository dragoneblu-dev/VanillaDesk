/**
 * ui-minimap.js
 * Modulo isolato per il rendering e la gestione interattiva della Minimap Laterale.
 * FIX BUG DUPLICATE IDs: L'algoritmo di sync ora strappa via o rinomina tutti gli ID 
 * dal DOM clonato prima di agganciarlo alla minimappa, prevenendo i Warning 
 * del browser legati all'Autofill e preservando l'integrità strutturale dell'Editor primario.
 * FIX DEFENSIVO: toggle verifica la presenza degli elementi nel DOM prima di accedere a .classList.
 */

UI.Minimap = {
    scale: 0.1,
    _observer: null,

    toggle: () => {
        AppState.showMinimap = !AppState.showMinimap;
        const container = document.getElementById('minimapContainer');
        const btn = document.getElementById('minimapBtn');
        
        if (AppState.showMinimap) {
            if (container) container.classList.remove('hidden');
            if (btn) btn.classList.add('active');
            UI.Minimap.sync();
            UI.Minimap.initObserver();
        } else {
            if (container) container.classList.add('hidden');
            if (btn) btn.classList.remove('active');
            if (UI.Minimap._observer) {
                UI.Minimap._observer.disconnect();
            }
        }
        localStorage.setItem('pronotes_minimap', AppState.showMinimap);
    },

    sync: () => {
        if (!AppState.showMinimap) return;
        const editorArea = document.getElementById('editorScrollContent');
        const mini = document.getElementById('minimapContent');
        const wrapper = document.getElementById('minimapContentWrapper');
        const container = document.getElementById('minimapContainer');
        
        if (editorArea && mini && wrapper && container) {
            
            // FIX: Clona il contenuto ma previeni la duplicazione degli ID nel DOM.
            // Converte id="..." in data-mini-id="..."
            let clonedHTML = editorArea.innerHTML;
            clonedHTML = clonedHTML.replace(/\bid=(["'])(.*?)\1/gi, 'data-mini-id=$1$2$1');
            clonedHTML = clonedHTML.replace(/\bname=(["'])(.*?)\1/gi, 'data-mini-name=$1$2$1'); // Per sicurezza anche i name
            
            mini.innerHTML = clonedHTML;
            
            // Sincronizza il valore dell'input titolo usando il nuovo pseudo-id
            const realTitle = document.getElementById('noteTitle');
            const miniTitle = mini.querySelector('[data-mini-id="noteTitle"]');
            if (realTitle && miniTitle) {
                miniTitle.setAttribute('value', realTitle.value);
            }
            
            // Imposta le dimensioni base 1:1 con l'editor reale
            const exactEditorWidth = editorArea.getBoundingClientRect().width;
            mini.style.width = exactEditorWidth + 'px';
            
            const compStyle = window.getComputedStyle(editorArea);
            mini.style.padding = compStyle.padding;
            
            // Applica lo zoom ottico proporzionale
            const scaleFactor = container.clientWidth / exactEditorWidth;
            wrapper.style.transform = `scale(${scaleFactor})`;
            
            UI.Minimap.scale = scaleFactor;
            
            // Aggiorna la posizione del box visivo
            UI.Minimap.updateViewport();
        }
    },

    updateViewport: () => {
        if (!AppState.showMinimap) return;
        
        const editorScrollArea = document.getElementById('editorScrollContent');
        const viewport = document.getElementById('minimapViewport');
        const container = document.getElementById('minimapContainer');
        const wrapper = document.getElementById('minimapContentWrapper');
        
        if (!editorScrollArea || !viewport || !container || !wrapper) return;

        const scaleFactor = UI.Minimap.scale || 0.1;
        
        const EH = editorScrollArea.scrollHeight;
        const EV = editorScrollArea.clientHeight;
        const ST = editorScrollArea.scrollTop;

        let viewportHeight = EV * scaleFactor;
        let viewportTop = ST * scaleFactor;

        viewport.style.height = `${viewportHeight}px`;
        viewport.style.top = `${viewportTop}px`;

        const scaledTotalHeight = EH * scaleFactor;
        wrapper.style.height = `${scaledTotalHeight}px`;

        const maxScrollTop = EH - EV;
        if (maxScrollTop > 0) {
            const scrollPercent = ST / maxScrollTop;
            const minimapMaxScroll = scaledTotalHeight - container.clientHeight;
            if (minimapMaxScroll > 0) {
                 container.scrollTop = minimapMaxScroll * scrollPercent;
            }
        }
    },

    initDrag: () => {
        const viewport = document.getElementById('minimapViewport');
        const container = document.getElementById('minimapContainer');
        const scrollArea = document.getElementById('editorScrollContent');
        const wrapper = document.getElementById('minimapContentWrapper');
        
        if (!viewport || !container || !scrollArea || !wrapper) return;

        let isDragging = false;
        let startY = 0;
        let startScrollTop = 0;

        const startDrag = (e) => {
            isDragging = true;
            startY = e.clientY;
            startScrollTop = scrollArea.scrollTop;
            document.body.style.cursor = 'grabbing';
            e.preventDefault(); 
        };

        viewport.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            startDrag(e);
        });

        container.addEventListener('mousedown', (e) => {
            if (e.target === viewport) return; 
            
            const scaleFactor = UI.Minimap.scale || 0.1;
            const wrapperRect = wrapper.getBoundingClientRect();
            
            const clickYInsideMinimap = e.clientY - wrapperRect.top;
            const realDocumentY = clickYInsideMinimap / scaleFactor;
            
            let targetST = realDocumentY - (scrollArea.clientHeight / 2);
            
            const maxScroll = scrollArea.scrollHeight - scrollArea.clientHeight;
            if (targetST < 0) targetST = 0;
            if (targetST > maxScroll) targetST = maxScroll;

            scrollArea.scrollTop = targetST;
            startDrag(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const scaleFactor = UI.Minimap.scale || 0.1;
            
            const deltaY = e.clientY - startY;
            const scrollDelta = deltaY / scaleFactor; 
            
            scrollArea.scrollTop = startScrollTop + scrollDelta;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = 'default';
            }
        });

        if (AppState.showMinimap) {
            UI.Minimap.initObserver();
        }
    },

    initObserver: () => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;

        if (UI.Minimap._observer) UI.Minimap._observer.disconnect();

        let syncTimer;
        UI.Minimap._observer = new MutationObserver((mutations) => {
            if (!AppState.showMinimap) return;
            
            // Filtra mutazioni irrilevanti per performance (ignora la digitazione semplice di testo)
            const needsSync = mutations.some(m => 
                m.type === 'childList' || 
                (m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'style'))
            );

            if (needsSync) {
                clearTimeout(syncTimer);
                syncTimer = setTimeout(() => {
                    UI.Minimap.sync();
                }, 200); // Debounce per unire più modifiche DOM in un solo sync
            }
        });

        // Osserva l'editor per aggiunta/rimozione nodi (es. inserimento widget) e cambi di stile/classi (es. resize img o collapse)
        UI.Minimap._observer.observe(editor, { 
            childList: true, 
            subtree: true, 
            attributes: true, 
            attributeFilter: ['class', 'style'] 
        });
    }
};