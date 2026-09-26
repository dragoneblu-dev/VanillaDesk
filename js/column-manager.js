/**
 * ColumnManager.js
 * Modulo per il Widget Testo a Colonne (Continua vs Indipendenti)
 * Soddisfa i requisiti: Ridimensionamento a passi del 5%.
 * FIX INSERIMENTO: Sostituzione netta delle righe vuote per impedire la corruzione del DOM (Nesting p > div).
 * FEAT UX: Aggiunto Tooltip dinamico che segue il mouse durante il resize per indicare le percentuali delle colonne.
 */

const ColumnManager = {
    resizingData: null,

    init: () => {
        document.addEventListener('mousemove', ColumnManager.handleMouseMove);
        document.addEventListener('mouseup', ColumnManager.handleMouseUp);
    },

    getState: (id) => {
        if (!AppState.databases) AppState.databases = {};
        const trueId = id.split('_cited_')[0];
        return AppState.databases[trueId] || null;
    },

    setState: (id, state) => {
        if (!AppState.databases) AppState.databases = {};
        const trueId = id.split('_cited_')[0];
        AppState.databases[trueId] = state;
    },

    insert: () => {
        if (!AppState.isEditMode) return;
        Editor.saveSnapshot();
        Editor.restoreSelection();
        UI.Menu.closeAll(true);

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const id = 'adv_cols_' + Store.generateId();
        const range = selection.getRangeAt(0);

        let selectedHTML = '';
        if (!selection.isCollapsed) {
            const tempDiv = document.createElement('div');
            tempDiv.appendChild(range.cloneContents());
            selectedHTML = tempDiv.innerHTML.trim();
        }

        let state;
        if (selectedHTML !== '') {
            state = { columns: 2, mode: 'continuous', contents: [selectedHTML] };
        } else {
            state = { columns: 2, mode: 'independent', contents: ['<p><br></p>', '<p><br></p>'], widths: [50, 50] };
        }

        ColumnManager.setState(id, state);

        let wrapper;
        if (typeof WidgetManager !== 'undefined') {
            wrapper = WidgetManager.createShell('columns', id);
        } else {
            wrapper = document.createElement('div');
            wrapper.className = 'adv-widget-shell widget-type-columns';
            wrapper.id = id;
            wrapper.contentEditable = "false";
            wrapper.setAttribute('data-widget-type', 'columns');
        }

        let node = range.commonAncestorContainer;
        if (node.nodeType === 3) node = node.parentNode;

        // 1. Cerca il blocco contenitore più vicino al cursore (paragrafo, div, intestazione)
        let targetBlock = node ? node.closest('p, div, li, h1, h2, h3, h4, h5, h6') : null;
        
        // 2. Verifica se il blocco trovato è "vuoto" (ignorando spazi invisibili, a capo e ritorni a carrello)
        // Assicurandosi anche di non eliminare accidentalmente l'intero editor (id !== 'noteContent')
        const isEmptyBlock = targetBlock && targetBlock.id !== 'noteContent' && targetBlock.textContent.replace(/[\u200B\n\r]/g, '').trim() === '';

        if (selectedHTML === '' && isEmptyBlock) {
            // 3a. Se la riga è vuota, la SOSTITUISCE interamente con il nuovo widget.
            // Questo previene il bug del "Nesting" in cui il widget finisce dentro un <p>
            targetBlock.parentNode.replaceChild(wrapper, targetBlock);
        } else {
            // 3b. Se la riga contiene testo, NON la distrugge. Inserisce il widget spaccando il testo
            // nel punto esatto in cui si trova il cursore.
            range.deleteContents();
            range.insertNode(wrapper);
        }

        // 4. Crea un nuovo paragrafo vuoto (<br>) e lo posiziona subito DOPO il widget appena inserito.
        // Questo permette all'utente di avere un punto in cui cliccare per continuare a scrivere.
        const p = document.createElement('p'); 
        p.innerHTML = '<br>';
        wrapper.parentNode.insertBefore(p, wrapper.nextSibling);

        ColumnManager.render(id);
        Store.triggerAutoSave();
    },

    mountAll: (container = document) => {
        const wrappers = container.querySelectorAll('[data-widget-type="columns"]');
        const seenIds = new Set();

        wrappers.forEach(wrapper => {
            if (wrapper.closest('.block-citation') && container.id === 'noteContent') return;
            wrapper.setAttribute('contenteditable', 'false');

            let currentId = wrapper.id;
            if (!currentId || seenIds.has(currentId)) {
                currentId = 'adv_cols_' + Store.generateId();
                wrapper.id = currentId;
            }
            seenIds.add(currentId);

            if (wrapper.hasAttribute('data-state')) {
                try {
                    const s = JSON.parse(wrapper.getAttribute('data-state').replace(/&quot;/g, '"'));
                    ColumnManager.setState(currentId, s);
                    wrapper.removeAttribute('data-state');
                } catch(e) {}
            }
            ColumnManager.render(currentId);
        });
    },

    _initWidths: (state) => {
        if (!state.widths || state.widths.length !== state.columns) {
            const fraction = 100 / state.columns;
            state.widths = Array(state.columns).fill(fraction);
        }
        return state.widths;
    },

    render: (id) => {
        const wrapper = document.getElementById(id);
        if (!wrapper) return;

        const state = ColumnManager.getState(id);
        if (!state) return;

        const existingWrap = wrapper.querySelector('.adv-columns-container-wrap');
        if (existingWrap) {
            if (state.mode === 'independent') {
                const boxes = existingWrap.querySelectorAll('.col-box');
                if (boxes.length > 0) {
                    state.contents = Array.from(boxes).map(b => b.innerHTML);
                }
            } else {
                const cont = existingWrap.querySelector('.adv-columns-continuous');
                if (cont) state.contents = [cont.innerHTML];
            }
        }

        if (typeof WidgetManager !== 'undefined') {
            WidgetManager.updateShellUI(id, { hideHeader: true });
        }

        let bodyContainer = wrapper.querySelector('.widget-body') || wrapper;

        const isCited = id.includes('_cited_');
        const isEdit = AppState.isEditMode && !isCited;
        
        let innerHTML = '';
        if (state.mode === 'continuous') {
            const joinedText = (state.contents && state.contents.length > 0) ? state.contents.join('<br>') : '<p><br></p>';
            innerHTML = `
                <div class="adv-columns-continuous widget-editable-area" 
                     style="column-count: ${state.columns};" 
                     contenteditable="${isEdit ? 'true' : 'false'}">${joinedText}</div>
            `;
        } else {
            const widths = ColumnManager._initWidths(state);
            const gridTemplate = widths.map(w => w + '%').join(' ');

            innerHTML = `<div class="adv-columns-independent" style="grid-template-columns: ${gridTemplate};">`;
            
            for (let i = 0; i < state.columns; i++) {
                const colContent = (state.contents && state.contents[i]) ? state.contents[i] : '<p><br></p>';
                innerHTML += `<div class="col-box widget-editable-area" contenteditable="${isEdit ? 'true' : 'false'}">${colContent}</div>`;
            }

            if (isEdit && state.columns > 1) {
                let cumulative = 0;
                for(let i = 0; i < state.columns - 1; i++) {
                    cumulative += widths[i];
                    innerHTML += `<div class="col-resizer" data-col-idx="${i}" style="left: ${cumulative}%;" onmousedown="ColumnManager.startResize(event, '${id}', ${i})"></div>`;
                }
            }
            innerHTML += `</div>`;
        }

        bodyContainer.innerHTML = `
            <div class="adv-columns-container-wrap">
                ${isEdit ? `
                <button class="adv-icon-btn columns-opt-btn" id="col-opt-${id}" title="Configura Colonne" onclick="ColumnManager.openMenu(event, '${id}')">
                    ${Icons.gear}
                </button>
                ` : ''}
                ${innerHTML}
            </div>
        `;

        if (isEdit) {
            bodyContainer.querySelectorAll('.widget-editable-area').forEach(el => {
                el.addEventListener('input', () => {
                    if (state.mode === 'independent') {
                        const boxes = bodyContainer.querySelectorAll('.col-box');
                        state.contents = Array.from(boxes).map(b => b.innerHTML);
                    } else {
                        state.contents = [el.innerHTML];
                    }
                    ColumnManager.setState(id, state);
                });
            });
        }
    },

    openMenu: (e, id) => {
        if (e) e.stopPropagation();
        UI.Menu.closeAll(true);

        const state = ColumnManager.getState(id);
        if (!state) return;

        const chk = ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>';

        const menuItems = [
            { type: 'custom', html: '<div class="adv-dropdown-title" style="padding:0 4px; margin-bottom:4px;">Numero di Colonne</div>' },
            { icon: Icons.text, label: 'Testo Normale (1 Colonna)', onClick: () => ColumnManager.destroyAndUnwrap(id) },
            { icon: Icons.columns, label: '2 Colonne' + (state.columns === 2 ? chk : ''), onClick: () => ColumnManager.setColumns(id, 2) },
            { icon: Icons.columns, label: '3 Colonne' + (state.columns === 3 ? chk : ''), onClick: () => ColumnManager.setColumns(id, 3) },
            { type: 'divider' },
            { type: 'custom', html: '<div class="adv-dropdown-title" style="padding:0 4px; margin-bottom:4px;">Comportamento Testo</div>' },
            { icon: Icons.listFilter, label: 'Flusso Continuo (Auto)' + (state.mode === 'continuous' ? chk : ''), onClick: () => ColumnManager.setMode(id, 'continuous') },
            { icon: Icons.viewBoard, label: 'Moduli Indipendenti' + (state.mode === 'independent' ? chk : ''), onClick: () => ColumnManager.setMode(id, 'independent') }
        ];

        UI.Menu.buildContextMenu(`col-opt-${id}`, menuItems);
    },

    setColumns: (id, count) => {
        const state = ColumnManager.getState(id);
        
        if (state.mode === 'independent' && state.contents && state.contents.length > count) {
            const extraContent = state.contents.splice(count).join('<br>');
            state.contents[count - 1] += '<br>' + extraContent;
        }

        state.columns = count;
        const fraction = 100 / count;
        state.widths = Array(count).fill(fraction);

        ColumnManager.setState(id, state);
        ColumnManager.render(id);
        Store.triggerAutoSave();
        UI.Menu.closeAll(true);
    },

    setMode: (id, mode) => {
        const state = ColumnManager.getState(id);
        if (state.mode === mode) return;

        if (mode === 'continuous') {
            if (state.contents) state.contents = [state.contents.join('<br>')];
        } else {
            const mainContent = (state.contents && state.contents[0]) ? state.contents[0] : '<p><br></p>';
            state.contents = [mainContent];
            if (!state.widths || state.widths.length !== state.columns) {
                const fraction = 100 / state.columns;
                state.widths = Array(state.columns).fill(fraction);
            }
        }
        
        state.mode = mode;
        ColumnManager.setState(id, state);
        ColumnManager.render(id);
        Store.triggerAutoSave();
        UI.Menu.closeAll(true);
    },

    startResize: (e, id, colIdx) => {
        e.preventDefault();
        e.stopPropagation();

        const wrapper = document.getElementById(id);
        const grid = wrapper.querySelector('.adv-columns-independent');
        const state = ColumnManager.getState(id);

        // Creazione dinamica del Tooltip visivo per le percentuali
        const tooltip = document.createElement('div');
        tooltip.id = 'adv-col-resizer-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            z-index: 100000;
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-family: monospace;
            font-weight: bold;
            pointer-events: none;
            transform: translate(-50%, -150%);
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        `;
        // Imposta i valori di partenza
        tooltip.innerText = `Col ${colIdx + 1}: ${Math.round(state.widths[colIdx])}% | Col ${colIdx + 2}: ${Math.round(state.widths[colIdx + 1])}%`;
        tooltip.style.left = e.clientX + 'px';
        tooltip.style.top = e.clientY + 'px';
        document.body.appendChild(tooltip);

        ColumnManager.resizingData = {
            id: id,
            colIdx: parseInt(colIdx),
            startX: e.pageX,
            totalWidth: grid.getBoundingClientRect().width,
            state: JSON.parse(JSON.stringify(state)),
            grid: grid,
            resizer: e.target,
            tooltip: tooltip
        };

        e.target.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    },

    handleMouseMove: (e) => {
        const data = ColumnManager.resizingData;
        if (!data) return;

        const deltaX = e.pageX - data.startX;
        const deltaPct = (deltaX / data.totalWidth) * 100;
        
        const snappedDelta = Math.round(deltaPct / 5) * 5;
        
        // Anche se lo snap non è cambiato, continuiamo a muovere visivamente il tooltip col mouse
        if (data.tooltip) {
            data.tooltip.style.left = e.clientX + 'px';
            data.tooltip.style.top = e.clientY + 'px';
        }

        if (snappedDelta === 0) return;

        const originalLeft = data.state.widths[data.colIdx];
        const originalRight = data.state.widths[data.colIdx + 1];

        let newLeft = originalLeft + snappedDelta;
        let newRight = originalRight - snappedDelta;

        if (newLeft >= 10 && newRight >= 10) {
            let tempWidths = [...data.state.widths];
            tempWidths[data.colIdx] = newLeft;
            tempWidths[data.colIdx + 1] = newRight;

            data.grid.style.gridTemplateColumns = tempWidths.map(w => w + '%').join(' ');

            let cumulative = 0;
            data.grid.querySelectorAll('.col-resizer').forEach((resizer, i) => {
                cumulative += tempWidths[i];
                resizer.style.left = `${cumulative}%`;
            });

            // Aggiorna il testo del tooltip con le nuove percentuali
            if (data.tooltip) {
                data.tooltip.innerText = `Col ${data.colIdx + 1}: ${Math.round(newLeft)}% | Col ${data.colIdx + 2}: ${Math.round(newRight)}%`;
            }

            data.currentNewWidths = tempWidths;
        }
    },

    handleMouseUp: (e) => {
        const data = ColumnManager.resizingData;
        if (!data) return;

        data.resizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Distrugge il tooltip alla fine del trascinamento per fare pulizia del DOM
        if (data.tooltip) {
            data.tooltip.remove();
        }

        if (data.currentNewWidths) {
            let actualState = ColumnManager.getState(data.id);
            actualState.widths = data.currentNewWidths;
            ColumnManager.setState(data.id, actualState);
            Editor.saveSnapshot(); 
            Store.triggerAutoSave();
        }

        ColumnManager.resizingData = null;
    },

    destroyAndUnwrap: (id) => {
        const wrapper = document.getElementById(id);
        if (!wrapper) return;
        
        const state = ColumnManager.getState(id);
        Editor.saveSnapshot();

        let textToRescue = '';
        const existingWrap = wrapper.querySelector('.adv-columns-container-wrap');
        if (existingWrap) {
            if (state.mode === 'independent') {
                const boxes = existingWrap.querySelectorAll('.col-box');
                textToRescue = Array.from(boxes).map(b => b.innerHTML).join('<br>');
            } else {
                const cont = existingWrap.querySelector('.adv-columns-continuous');
                if (cont) textToRescue = cont.innerHTML;
            }
        }

        const div = document.createElement('div');
        div.innerHTML = textToRescue;

        const frag = document.createDocumentFragment();
        while(div.firstChild) {
            frag.appendChild(div.firstChild);
        }

        wrapper.parentNode.replaceChild(frag, wrapper);
        
        const trueId = id.split('_cited_')[0];
        if (AppState.databases && AppState.databases[trueId]) delete AppState.databases[trueId];

        Store.triggerAutoSave();
        UI.Menu.closeAll(true);
    }
};

document.addEventListener('DOMContentLoaded', ColumnManager.init);