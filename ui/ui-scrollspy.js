/**
 * ui-scrollspy.js
 * Sottomodulo di UI.
 * Gestisce l'evidenziazione dell'Indice Laterale (TOC) sincronizzato con lo scorrimento della pagina.
 */

Object.assign(UI, {
    updateTOCScrollSpy: () => {
        if (AppState.isSwitchingNote) return;
        const editor = document.getElementById('noteContent');
        const scrollArea = document.querySelector('.editor-scroll-content');
        if (!editor || !scrollArea) return;

        const headers = Array.from(editor.querySelectorAll('h2, h3'));
        const tocNodes = document.querySelectorAll('.dynamic-toc-container .toc-node');
        
        if (headers.length === 0 || tocNodes.length === 0) return;

        let activeHeader = null;
        const areaRect = scrollArea.getBoundingClientRect();
        
        // Linea di innesco posizionata al 20% dello schermo (Rende l'aggancio più naturale e anticipato)
        const triggerLine = areaRect.top + (areaRect.height * 0.2); 

        // Scorriamo all'indietro: Il primo header (partendo dal basso) che ha superato la linea di innesco
        // verso l'alto, è quello attualmente in lettura.
        for (let i = headers.length - 1; i >= 0; i--) {
            const rect = headers[i].getBoundingClientRect();
            if (rect.top <= triggerLine) {
                activeHeader = headers[i];
                break;
            }
        }

        // Se nessun header ha superato la linea ma stiamo leggendo l'inizio, non evidenziamo nulla (o il primo)
        tocNodes.forEach(node => {
            node.style.color = '';
            node.style.fontWeight = '';
        });

        if (activeHeader) {
            const activeText = activeHeader.innerText.trim();
            for (let node of tocNodes) {
                const titleSpan = node.querySelector('span:not(.toc-icon)');
                if (titleSpan && titleSpan.innerText === activeText) {
                    node.style.color = 'var(--accent-color)';
                    node.style.fontWeight = 'bold';
                    
                    // Se l'albero è molto lungo, facciamo scorrere morbidamente la sidebar
                    // affinché il capitolo evidenziato sia sempre visibile
                    const treeContainer = document.getElementById('treeContainer');
                    if (treeContainer) {
                        const nodeRect = node.getBoundingClientRect();
                        const treeRect = treeContainer.getBoundingClientRect();
                        if (nodeRect.top < treeRect.top || nodeRect.bottom > treeRect.bottom) {
                            node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    }
                    break;
                }
            }
        }
    }
}); 