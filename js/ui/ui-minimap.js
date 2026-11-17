/**
 * ui-minimap.js
 * Modulo isolato per il rendering e la gestione interattiva della Minimap Laterale.
 * L'algoritmo di sync converte gli ID dal DOM clonato in attributi data-mini-* prima
 * di agganciarlo alla minimappa, prevenendo duplicazioni di ID e preservando l'Editor primario.
 * La funzione toggle verifica la presenza degli elementi nel DOM prima di accedere a .classList.
 * Posizionamento al click basato sul punto reale visibile sotto il puntatore e trascinamento
 * proporzionale sullo slider esteso all'intero documento.
 */

UI.Minimap = {
    scale: 0.1,
    _observer: null,

    _getMetrics: (scrollArea, container) => {
        const EH = scrollArea.scrollHeight;
        const EV = scrollArea.clientHeight;
        const ST = scrollArea.scrollTop;
        const CH = container.clientHeight;
        const scaleFactor = UI.Minimap.scale || 0.1;

        const maxST = Math.max(0, EH - EV);
        const scaledTotalHeight = EH * scaleFactor;
        const trackHeight = CH > 0 ? Math.min(CH, scaledTotalHeight) : scaledTotalHeight;

        let sliderHeight = EV * scaleFactor;
        if (trackHeight > 0) {
            if (sliderHeight < 24) sliderHeight = Math.min(24, trackHeight);
            if (sliderHeight > trackHeight) sliderHeight = trackHeight;
        }

        const maxSliderTravel = Math.max(0, trackHeight - sliderHeight);
        const maxMiniScroll = Math.max(0, scaledTotalHeight - CH);

        return { EH, EV, ST, CH, scaleFactor, maxST, scaledTotalHeight, trackHeight, sliderHeight, maxSliderTravel, maxMiniScroll };
    },

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
            
            // Imposta le dimensioni e il layout 1:1 con l'editor reale (evita differenze di margin-collapse)
            const exactEditorWidth = editorArea.getBoundingClientRect().width || editorArea.clientWidth || 900;
            mini.style.width = exactEditorWidth + 'px';
            
            const compStyle = window.getComputedStyle(editorArea);
            mini.style.padding = compStyle.padding;
            mini.style.display = 'flex';
            mini.style.flexDirection = 'column';
            
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

        const m = UI.Minimap._getMetrics(editorScrollArea, container);

        // Se l'editor non ha barre di scorrimento, il viewport copre l'altezza reale del contenuto scalato
        if (m.maxST === 0) {
            viewport.style.height = `${Math.round(m.trackHeight)}px`;
            viewport.style.top = '0px';
            wrapper.style.transform = `scale(${m.scaleFactor})`;
            return;
        }

        viewport.style.height = `${Math.round(m.sliderHeight)}px`;

        // Percentuale reale di scorrimento del documento (da 0 a 1)
        const scrollPercent = m.ST / m.maxST;

        let sliderTopVis = 0;
        if (m.CH > 0) {
            sliderTopVis = scrollPercent * m.maxSliderTravel;

            // Scorrimento del contenuto in miniatura per le pagine lunghe tramite traslazione fluida
            const currentMiniScroll = scrollPercent * m.maxMiniScroll;
            wrapper.style.transform = `translateY(${-currentMiniScroll}px) scale(${m.scaleFactor})`;
        } else {
            // Fallback lineare puro se il container non ha ancora altezza calcolata nel DOM (es. test headless)
            sliderTopVis = m.ST * m.scaleFactor;
            wrapper.style.transform = `scale(${m.scaleFactor})`;
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

        // Click diretto sul container della minimappa: porta l'editor al punto reale visualizzato sotto il cursore
        container.addEventListener('mousedown', (e) => {
            if (e.target === viewport) return; 

            const m = UI.Minimap._getMetrics(scrollArea, container);
            if (m.maxST <= 0) return;

            const containerRect = container.getBoundingClientRect();
            const clickY = Math.max(0, Math.min(m.CH, e.clientY - containerRect.top));

            const scrollPercent = m.ST / m.maxST;
            const currentMiniScroll = m.CH > 0 ? scrollPercent * m.maxMiniScroll : 0;

            // Mappa il punto visibile cliccato nella minimappa alla corrispondente coordinata Y reale del documento
            const realTargetY = (currentMiniScroll + clickY) / m.scaleFactor;
            scrollArea.scrollTop = Math.max(0, Math.min(m.maxST, realTargetY - (m.EV / 2)));
            UI.Minimap.updateViewport();

            // Aggancia il trascinamento proporzionale continuo a partire dalla posizione raggiunta
            startDrag(e);
        });

        // Inoltro della rotella del mouse dalla minimappa all'editor
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            scrollArea.scrollTop += e.deltaY;
        }, { passive: false });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const m = UI.Minimap._getMetrics(scrollArea, container);
            if (m.maxST <= 0) return;

            if (m.maxSliderTravel > 0) {
                const deltaY = e.clientY - startY;
                // Rapporto cinematico reale sull'intero documento: muovendo lo slider dall'inizio alla fine si scorre tutto il testo
                const scrollDelta = deltaY * (m.maxST / m.maxSliderTravel);
                scrollArea.scrollTop = Math.max(0, Math.min(m.maxST, startScrollTop + scrollDelta));
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