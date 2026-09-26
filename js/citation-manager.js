/**
 * CitationManager.js
 * Gestisce la Transclusion dei blocchi (Citazione dinamica).
 * FIX INSERIMENTO RIGA: Aggiunto bottone al menu contestuale per poter uscire
 * elegantemente dalla citazione senza click ingannevoli.
 * FIX DASHBOARD: Inserita logica di Drag & Drop per riordinare le citazioni nella Home Page.
 */

const CitationManager = {
    isHomeMode: false,
    editingCitationId: null,
    homeDraggedIdx: null,

    mountAll: (container = document) => {
        const root = container.id === 'noteContent' ? container : (container.querySelector ? container.querySelector('#noteContent') || container : document);
        const citations = root.querySelectorAll('.block-citation.adv-widget-shell');
        
        citations.forEach(cit => {
            if (cit.getAttribute('data-collapsed') === 'true' && !cit.classList.contains('collapsed')) {
                cit.classList.add('collapsed');
            }
            CitationManager._updateShellUI(cit);
        });
    },

    _updateShellUI: (cit) => {
        const noteId = cit.getAttribute('data-ref-note');
        const refId = cit.getAttribute('data-ref-id');
        const refType = cit.getAttribute('data-ref-type') || 'note';
        const isCollapsed = cit.classList.contains('collapsed');
        const targetNote = Store.getNote(noteId);
        
        let displayTitle = targetNote ? targetNote.title : "Riferimento Mancante";
        if (refId && refType === 'chapter') displayTitle = `${displayTitle} > Capitolo`;

        // Assicura che anche il guscio base non sia mai editabile se incapsulato
        const isCited = cit.id.includes('_cited_');

        WidgetManager.updateShellUI(cit.id, {
            icon: Icons.citation,
            title: `Riferimento: ${displayTitle}`,
            compact: true,
            optionsId: `cit-opt-btn-${cit.id}`,
            onOptionsClick: (e) => {
                if (isCited) return; 
                UI.Menu.closeAll(true);
                UI.Menu.buildContextMenu(`cit-opt-btn-${cit.id}`, [
                    { icon: Icons.arrowRightUp, label: 'Apri nota di origine', onClick: () => UI.selectNote(noteId) },
                    { icon: Icons.edit, label: 'Modifica origine...', onClick: () => CitationManager.editCitation(cit.id) },
                    { type: 'divider' },
                    { icon: Icons.down, label: 'Inserisci riga sotto', onClick: () => WidgetManager.insertLineBreakAfter(cit.id) },
                    { type: 'divider' },
                    { icon: Icons.trash, label: 'Elimina Citazione', danger: true, onClick: () => Editor.safeDeleteWidget(cit) }
                ]);
            },
            onDragStart: (e) => {
                if (isCited) { e.preventDefault(); return; }
                AppState.draggedBlockId = cit.id;
                AppState.draggedBlockType = 'citation';
                e.dataTransfer.effectAllowed = 'move';
            },
            onDragEnd: () => {
                 AppState.draggedBlockId = null;
                 AppState.draggedBlockType = null;
            },
            tools: [
                { icon: Icons.arrowRightUp, label: '', title: 'Apri', onClick: () => UI.selectNote(noteId) },
                { icon: isCollapsed ? Icons.chevronDown : Icons.searchUp, title: 'Espandi / Riduci Blocco', onClick: (e) => CitationManager.toggleCollapse(e, cit.id) }
            ]
        });
    },

    toggleCollapse: (e, wrapperId) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const wrapper = document.getElementById(wrapperId);
        if (!wrapper) return;

        const isCollapsed = wrapper.classList.toggle('collapsed');
        if (isCollapsed) wrapper.setAttribute('data-collapsed', 'true');
        else wrapper.removeAttribute('data-collapsed');

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();
        Store.triggerAutoSave();

        CitationManager._updateShellUI(wrapper);
    },

    openModal: (isHome = false) => {
        CitationManager.isHomeMode = isHome === true;
        if (!isHome && typeof Editor !== 'undefined') Editor.saveSelection();
        CitationManager.editingCitationId = null;
        
        UI.DocumentBrowser.open('citation', `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.citation} Cita Elemento o Intera Nota</span>`, (item) => {
            CitationManager.confirmCitation(item.noteId, item.refId, item.refType, item.title);
        });
    },

    editCitation: (wrapperId) => {
        const wrapper = document.getElementById(wrapperId);
        if (!wrapper) return;

        Editor.saveSelection();
        UI.closeDrawer();

        const noteId = wrapper.getAttribute('data-ref-note');
        const refId = wrapper.getAttribute('data-ref-id');

        CitationManager.editingCitationId = wrapperId;

        UI.DocumentBrowser.open('citation', `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.edit} Modifica Origine Citazione</span>`, (item) => {
            CitationManager.confirmCitation(item.noteId, item.refId, item.refType, item.title);
        }, { noteId: noteId, refId: refId });
    },

    confirmCitation: (noteId, refId, refType, displayTitle) => {
        const targetNote = Store.getNote(noteId);
        
        if (!targetNote) {
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast("La nota selezionata non esiste più.", "error");
            }
            UI.closeDrawer();
            return;
        }

        UI.closeDrawer();

        // SCENARIO 1: Modifica
        if (CitationManager.editingCitationId) {
            const cit = document.getElementById(CitationManager.editingCitationId);
            if (cit) {
                Editor.saveSnapshot();
                cit.setAttribute('data-ref-note', noteId);
                cit.setAttribute('data-ref-type', refType);
                if (refId) cit.setAttribute('data-ref-id', refId);
                else cit.removeAttribute('data-ref-id');

                CitationManager._updateShellUI(cit);
                Store.triggerAutoSave();
                CitationManager.renderLiveCitations();
            }
            CitationManager.editingCitationId = null;
            return;
        }

        // SCENARIO 2: Home
        if (CitationManager.isHomeMode) {
            AppState.homeCitations.push({ noteId: noteId, refId: refId, refType: refType, displayTitle: displayTitle });
            Store.triggerAutoSave(true);
            CitationManager.renderHomeCitations();
            return;
        }

        // SCENARIO 3: Inserimento
        Editor.restoreSelection();
        const sel = window.getSelection();
        let node = sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
        if (node && node.nodeType === 3) node = node.parentNode;

        if (node && node.closest('.widget-type-columns')) {
            alert("Non è permesso inserire Widget Complessi all'interno delle Colonne per prevenire la corruzione del layout.\nSposta il cursore fuori prima di inserire.");
            return;
        }

        const citBlockId = 'cit_' + Store.generateId();
        const block = WidgetManager.createShell('citation', citBlockId);
        
        block.setAttribute('data-ref-note', noteId);
        block.setAttribute('data-ref-type', refType);
        if (refId) block.setAttribute('data-ref-id', refId);

        const body = block.querySelector('.widget-body');
        // Aggiunta conservazione della classe widget-body per il collasso CSS
        body.className = 'widget-body citation-body adv-scroll-container editor-content';
        body.innerHTML = '<span style="color:var(--text-secondary); font-style:italic;">Caricamento contenuto live...</span>';

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();

        let targetBlock = node ? node.closest('p, div, li, h1, h2, h3, h4, h5, h6') : null;
        const isEmptyBlock = targetBlock && targetBlock.id !== 'noteContent' && targetBlock.textContent.replace(/[\u200B\n\r]/g, '').trim() === '';

        if (isEmptyBlock) {
            targetBlock.parentNode.replaceChild(block, targetBlock);
        } else {
            if (sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(block);
            } else {
                document.getElementById('noteContent').appendChild(block);
            }
        }

        const p = document.createElement('p'); 
        p.innerHTML = '<br>';
        block.parentNode.insertBefore(p, block.nextSibling);
        
        const newRange = document.createRange();
        newRange.setStart(p, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        Store.triggerAutoSave();
        
        CitationManager._updateShellUI(block);
        CitationManager.renderLiveCitations();
    },

    removeHomeCitation: (index) => {
        if (!confirm("Rimuovere questa citazione dalla Home?")) return;
        AppState.homeCitations.splice(index, 1);
        Store.triggerAutoSave(true);
        CitationManager.renderHomeCitations();
    },

    // MOTORE DND HOME DASHBOARD
    onHomeDragStart: (e, idx) => {
        CitationManager.homeDraggedIdx = idx;
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.5';
    },

    onHomeDragOver: (e) => {
        e.preventDefault();
        const target = e.currentTarget;
        target.style.borderTop = '3px solid var(--accent-color)';
    },

    onHomeDragLeave: (e) => {
        const target = e.currentTarget;
        target.style.borderTop = '';
    },

    onHomeDrop: (e, targetIdx) => {
        e.preventDefault();
        const srcIdx = CitationManager.homeDraggedIdx;
        CitationManager.homeDraggedIdx = null;

        document.querySelectorAll('#homeCitationsContainer .block-citation').forEach(el => {
            el.style.opacity = '1';
            el.style.borderTop = '';
        });

        if (srcIdx === null || srcIdx === targetIdx) return;

        const [cit] = AppState.homeCitations.splice(srcIdx, 1);
        
        let newTarget = targetIdx;
        if (srcIdx < targetIdx) newTarget--;

        AppState.homeCitations.splice(newTarget, 0, cit);
        Store.triggerAutoSave(true);
        CitationManager.renderHomeCitations();
    },

    renderHomeCitations: () => {
        const container = document.getElementById('homeCitationsContainer');
        if (!container) return;

        if (!AppState.homeCitations || AppState.homeCitations.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:var(--text-secondary); margin-top:20px; font-style:italic;">Aggiungi citazioni qui per creare la tua Dashboard personale.</div>`;
            return;
        }

        let html = '';
        AppState.homeCitations.forEach((cit, idx) => {
            const targetNote = Store.getNote(cit.noteId);
            const displayTitle = targetNote ? targetNote.title : 'Riferimento';
            const fullTitle = cit.refId && cit.refType === 'chapter' ? `${displayTitle} > ${cit.displayTitle}` : displayTitle;
            const citId = `home_cit_${idx}`;

            html += `
                <blockquote class="adv-widget-shell block-citation widget-type-citation drag-item" id="${citId}" data-widget-type="citation" data-ref-note="${cit.noteId}" data-ref-type="${cit.refType}" ${cit.refId ? `data-ref-id="${cit.refId}"` : ''} contenteditable="false" style="margin: 10px 0; transition: transform 0.2s;"
                    draggable="true" 
                    ondragstart="CitationManager.onHomeDragStart(event, ${idx})"
                    ondragover="CitationManager.onHomeDragOver(event)"
                    ondragleave="CitationManager.onHomeDragLeave(event)"
                    ondrop="CitationManager.onHomeDrop(event, ${idx})">
                    
                    <div class="widget-header adv-table-header compact-header" style="cursor: grab;">
                        <span class="widget-drag-handle adv-drag-handle" style="display:flex; margin-right:5px;" title="Trascina per riordinare">${Icons.dragHandle}</span>
                        <span class="widget-icon" style="display:inline-flex;">${Icons.link}</span>
                        <span class="widget-title adv-table-title" contenteditable="false" style="flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 50px;">Riferimento: ${fullTitle}</span>
                        <div class="widget-tools adv-tools" style="flex-shrink: 0;">
                            <button class="adv-tool-btn" title="Apri" onclick="UI.selectNote('${cit.noteId}')"><span style="display:inline-flex; align-items:center;">${Icons.arrowRightUp}</span></button>
                            <button class="adv-tool-btn active" title="Rimuovi dalla Dashboard" onclick="CitationManager.removeHomeCitation(${idx})"><span style="display:inline-flex; align-items:center;">${Icons.close}</span></button>
                        </div>
                    </div>
                    <div class="widget-body citation-body adv-scroll-container editor-content" style="overflow-x: auto; min-height: 50px;">
                        <span style="color:var(--text-secondary); font-style:italic;">Caricamento contenuto live...</span>
                    </div>
                </blockquote>
            `;
        });
        
        container.innerHTML = html;
        CitationManager.renderLiveCitations(container);
    },

    renderLiveCitations: (container = document, visitedNotes = new Set()) => {
        const citations = container.querySelectorAll('.block-citation');
        
        citations.forEach(cit => {
            const noteId = cit.getAttribute('data-ref-note');
            const refType = cit.getAttribute('data-ref-type') || 'note';
            const refId = cit.getAttribute('data-ref-id');
            const body = cit.querySelector('.citation-body');
            
            if (!noteId || !body) return;

            if (visitedNotes.has(noteId)) {
                body.innerHTML = `<div style="padding:15px; border:1px dashed var(--danger-color); background:rgba(239, 68, 68, 0.05); color:var(--danger-color); font-weight:bold;">[Riferimento Circolare Rilevato: L'app ha bloccato il rendering per impedire un loop infinito.]</div>`;
                return;
            }

            const targetNote = Store.getNote(noteId);
            if (!targetNote) {
                body.innerHTML = `<p style="color:var(--danger-color); font-style:italic;">[La nota di origine è stata eliminata]</p>`;
                return;
            }

            const nextVisited = new Set(visitedNotes);
            nextVisited.add(noteId);

            const extracted = UI.DocumentBrowser.extractLiveHTML(targetNote.content || '', refId, refType);
            body.innerHTML = extracted;

            // Forza l'invisibilità di editing in modo netto
            body.querySelectorAll('[contenteditable="true"]').forEach(el => el.setAttribute('contenteditable', 'false'));

            if (typeof WidgetManager !== 'undefined') {
                body.querySelectorAll(WidgetManager.blockSelector).forEach(wrapper => {
                    const trueId = wrapper.id;
                    if (!trueId.includes('_cited_')) {
                        const cloneId = trueId + '_cited_' + Store.generateId();
                        wrapper.id = cloneId;
                    }
                });

                const tempEdit = AppState.isEditMode;
                try {
                    AppState.isEditMode = false; 
                    WidgetManager.mountAll(body); 
                } finally {
                    AppState.isEditMode = tempEdit; 
                }
            }

            CitationManager.renderLiveCitations(body, nextVisited);
        });
    }
};