/**
 * ui-minimap.js
 * Modulo isolato per il rendering e la gestione interattiva della Minimap Laterale.
 * FIX BUG DUPLICATE IDs: L'algoritmo di sync ora strappa via o rinomina tutti gli ID 
 * dal DOM clonato prima di agganciarlo alla minimappa, prevenendo i Warning 
 * del browser legati all'Autofill e preservando l'integrità strutturale dell'Editor primario.
 * FIX DEFENSIVO: toggle verifica la presenza degli elementi nel DOM prima di accedere a .classList.
 * FIX SYNC & DRAG PROPORTIONALITY: Risolto il disallineamento dello scorrimento e il ritardo del mouse
 * tramite calcolo cinematico unificato tra viewport visibile e scorrimento effettivo della pagina.
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
            
            // Clona il contenuto ma previene la duplicazione degli ID nel DOM convertendoli in data-mini-id
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
            const exactEditorWidth = editorArea.getBoundingClientRect().width || editorArea.clientWidth || 900;
            mini.style.width = exactEditorWidth + 'px';
            
            const compStyle = window.getComputedStyle(editorArea);
            mini.style.padding = compStyle.padding;
            
            // Applica lo zoom ottico proporzionale
            const scaleFactor = container.clientWidth / exactEditorWidth;
            wrapper.style.transformOrigin = 'top left';
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
        const CH = container.clientHeight;

        const maxST = Math.max(0, EH - EV);

        // Se l'editor non ha barre di scorrimento, il viewport copre l'intera altezza
        if (maxST === 0) {
            viewport.style.height = `${CH > 0 ? CH : Math.round(EV * scaleFactor)}px`;
            viewport.style.top = '0px';
            wrapper.style.transform = `scale(${scaleFactor})`;
            return;
        }

        // Calcolo dell'altezza dello slider di anteprima (con guardia difensiva su CH > 0)
        let sliderHeight = EV * scaleFactor;
        if (CH > 0) {
            if (sliderHeight < 24) sliderHeight = 24;
            if (sliderHeight > CH) sliderHeight = CH;
        }

        viewport.style.height = `${Math.round(sliderHeight)}px`;

        // Percentuale reale di scorrimento del documento (da 0 a 1)
        const scrollPercent = ST / maxST;

        // Corsa totale disponibile per lo slider visivo all'interno del container
        let sliderTopVis = 0;
        if (CH > 0) {
            const maxSliderTravel = Math.max(0, CH - sliderHeight);
            sliderTopVis = scrollPercent * maxSliderTravel;

            // Scorrimento del contenuto in miniatura per le pagine lunghe tramite traslazione fluida
            const scaledTotalHeight = EH * scaleFactor;
            const maxMiniScroll = Math.max(0, scaledTotalHeight - CH);
            const currentMiniScroll = scrollPercent * maxMiniScroll;
            wrapper.style.transform = `translateY(${-currentMiniScroll}px) scale(${scaleFactor})`;
        } else {
            // Fallback lineare puro se il container non ha ancora altezza calcolata nel DOM (es. test headless)
            sliderTopVis = ST * scaleFactor;
            wrapper.style.transform = `scale(${scaleFactor})`;
        }

        viewport.style.top = `${Math.round(sliderTopVis)}px`;
        wrapper.style.transformOrigin = 'top left';

        // Previene qualsiasi accumulo accidentale di scroll nativo sul container
        container.scrollTop = 0;
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

        // Click diretto sul container della minimappa per saltare istantaneamente alla posizione
        container.addEventListener('mousedown', (e) => {
            if (e.target === viewport) return; 

            const CH = container.clientHeight;
            const EH = scrollArea.scrollHeight;
            const EV = scrollArea.clientHeight;
            const maxST = Math.max(0, EH - EV);

            if (maxST <= 0) return;

            const scaleFactor = UI.Minimap.scale || 0.1;
            let sliderHeight = EV * scaleFactor;
            if (sliderHeight < 24) sliderHeight = 24;
            if (sliderHeight > CH) sliderHeight = CH;

            const maxSliderTravel = Math.max(0, CH - sliderHeight);
            const containerRect = container.getBoundingClientRect();
            const clickY = e.clientY - containerRect.top;

            // Centra il viewport sul punto cliccato
            const targetSliderTop = clickY - (sliderHeight / 2);
            const targetPercent = maxSliderTravel > 0 ? Math.max(0, Math.min(1, targetSliderTop / maxSliderTravel)) : 0;

            scrollArea.scrollTop = targetPercent * maxST;

            // Aggancia direttamente il drag continuo
            startY = e.clientY;
            startScrollTop = scrollArea.scrollTop;
            isDragging = true;
            document.body.style.cursor = 'grabbing';
            e.preventDefault();
        });

        // Inoltro della rotella del mouse dalla minimappa all'editor
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            scrollArea.scrollTop += e.deltaY;
        }, { passive: false });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const CH = container.clientHeight;
            const EH = scrollArea.scrollHeight;
            const EV = scrollArea.clientHeight;
            const maxST = Math.max(0, EH - EV);

            if (maxST <= 0) return;

            const scaleFactor = UI.Minimap.scale || 0.1;
            let sliderHeight = EV * scaleFactor;
            if (sliderHeight < 24) sliderHeight = 24;
            if (sliderHeight > CH) sliderHeight = CH;

            const maxSliderTravel = Math.max(0, CH - sliderHeight);

            if (maxSliderTravel > 0) {
                const deltaY = e.clientY - startY;
                // Rapporto cinematico reale: muovere il mouse di N pixel muove lo slider di esattamente N pixel
                const scrollDelta = deltaY * (maxST / maxSliderTravel);
                scrollArea.scrollTop = Math.max(0, Math.min(maxST, startScrollTop + scrollDelta));
            }
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