/**
 * tests/test-ui-tree-dnd.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: js/ui/ui-tree-dnd.js
 */

describe("UI.TreeDnD: Drag & Drop Gerarchico nella Sidebar (test-ui-tree-dnd.js)", () => {

    test("isDescendant: rileva correttamente discendenze dirette, indirette e assenza di relazione", () => {
        const prevNotes = [...AppState.notes];
        try {
            AppState.notes = [
                { id: 'n_root', parentId: null, title: 'Root' },
                { id: 'n_child', parentId: 'n_root', title: 'Child' },
                { id: 'n_grand', parentId: 'n_child', title: 'Grand' },
                { id: 'n_other', parentId: null, title: 'Other' }
            ];

            Assert.isTrue(UI.isDescendant('n_root', 'n_child'));
            Assert.isTrue(UI.isDescendant('n_root', 'n_grand'));
            Assert.isFalse(UI.isDescendant('n_grand', 'n_root'));
            Assert.isFalse(UI.isDescendant('n_root', 'n_other'));
            Assert.isFalse(UI.isDescendant('n_root', 'n_root'));
        } finally {
            AppState.notes = prevNotes;
        }
    });

    test("handleDragStart & handleDragEnd: impostano e ripuliscono stato drag e classi DOM", () => {
        const treeContainer = document.getElementById('treeContainer');
        const prevTreeHtml = treeContainer.innerHTML;
        const prevDraggedNote = AppState.draggedNoteId;
        const prevDragPos = AppState.dragPosition;
        const prevDraggedBlk = AppState.draggedBlockId;
        const prevDraggedBlkType = AppState.draggedBlockType;

        try {
            treeContainer.classList.add('drag-over-root');
            treeContainer.innerHTML = `<div class="node-content drag-top drag-bottom drag-middle">Nodo</div>`;
            const nodeEl = treeContainer.querySelector('.node-content');

            let allowedEffect = '';
            UI.handleDragStart({
                target: nodeEl,
                dataTransfer: { set effectAllowed(v) { allowedEffect = v; } }
            }, 'n_dnd_1');

            Assert.strictEqual(AppState.draggedNoteId, 'n_dnd_1');
            Assert.strictEqual(allowedEffect, 'move');
            Assert.strictEqual(nodeEl.style.opacity, '0.5');

            UI.handleDragEnd({ target: nodeEl });

            Assert.strictEqual(nodeEl.style.opacity, '1');
            Assert.isFalse(nodeEl.classList.contains('drag-top'));
            Assert.isFalse(nodeEl.classList.contains('drag-bottom'));
            Assert.isFalse(nodeEl.classList.contains('drag-middle'));
            Assert.isFalse(treeContainer.classList.contains('drag-over-root'));
            Assert.isNull(AppState.draggedNoteId);
            Assert.isNull(AppState.dragPosition);
            Assert.isNull(AppState.draggedBlockId);
            Assert.isNull(AppState.draggedBlockType);
        } finally {
            treeContainer.classList.remove('drag-over-root');
            treeContainer.innerHTML = prevTreeHtml;
            AppState.draggedNoteId = prevDraggedNote;
            AppState.dragPosition = prevDragPos;
            AppState.draggedBlockId = prevDraggedBlk;
            AppState.draggedBlockType = prevDraggedBlkType;
        }
    });

    test("drag esterno non supportato: file/oggetti esterni non illuminano né #treeContainer né .node-content", () => {
        const treeContainer = document.getElementById('treeContainer');
        const prevDraggedNote = AppState.draggedNoteId;
        const prevDraggedBlk = AppState.draggedBlockId;

        try {
            AppState.draggedNoteId = null;
            AppState.draggedBlockId = null;
            treeContainer.classList.remove('drag-over-root');

            const nodeEl = document.createElement('div');
            nodeEl.className = 'node-content';
            nodeEl.getBoundingClientRect = () => ({ top: 100, height: 40 });

            let rootPrevented = false;
            UI.handleDragOverRoot({
                preventDefault: () => { rootPrevented = true; },
                target: treeContainer
            });
            Assert.isFalse(rootPrevented);
            Assert.isFalse(treeContainer.classList.contains('drag-over-root'));

            let nodePrevented = false;
            UI.handleDragOverNode({
                clientY: 120,
                currentTarget: nodeEl,
                preventDefault: () => { nodePrevented = true; },
                dataTransfer: { dropEffect: '' }
            }, 'n_ext');
            Assert.isFalse(nodePrevented);
            Assert.isFalse(nodeEl.classList.contains('drag-top') || nodeEl.classList.contains('drag-middle') || nodeEl.classList.contains('drag-bottom'));
        } finally {
            treeContainer.classList.remove('drag-over-root');
            AppState.draggedNoteId = prevDraggedNote;
            AppState.draggedBlockId = prevDraggedBlk;
        }
    });

    test("handleDragOverNode: calcola zone top/middle/bottom e blocca auto-drop o cicli su discendenti", () => {
        const prevNotes = [...AppState.notes];
        const prevDraggedNote = AppState.draggedNoteId;
        const prevDragPos = AppState.dragPosition;
        const prevDraggedBlk = AppState.draggedBlockId;
        const prevCurId = AppState.currentNoteId;

        try {
            AppState.notes = [
                { id: 'n_p', parentId: null, title: 'Padre' },
                { id: 'n_c', parentId: 'n_p', title: 'Figlio' },
                { id: 'n_t', parentId: null, title: 'Target' }
            ];
            AppState.draggedBlockId = null;

            const el = document.createElement('div');
            el.className = 'node-content';
            el.getBoundingClientRect = () => ({ top: 100, height: 40 });

            const makeEv = (clientY) => ({
                clientY,
                currentTarget: el,
                preventDefault: () => {},
                dataTransfer: { dropEffect: '' }
            });

            // 1. Nota su se stessa -> nessuna classe
            AppState.draggedNoteId = 'n_t';
            UI.handleDragOverNode(makeEv(120), 'n_t');
            Assert.isFalse(el.classList.contains('drag-top') || el.classList.contains('drag-middle') || el.classList.contains('drag-bottom'));

            // 2. Anti-ciclo: genitore sopra figlio -> dropEffect = 'none'
            AppState.draggedNoteId = 'n_p';
            const cycleEv = makeEv(120);
            UI.handleDragOverNode(cycleEv, 'n_c');
            Assert.strictEqual(cycleEv.dataTransfer.dropEffect, 'none');

            // 3. Zone geometriche top (<25%), middle (25%-75%), bottom (>75%)
            AppState.draggedNoteId = 'n_c';
            UI.handleDragOverNode(makeEv(105), 'n_t');
            Assert.strictEqual(AppState.dragPosition, 'top');
            Assert.isTrue(el.classList.contains('drag-top'));

            UI.handleDragOverNode(makeEv(120), 'n_t');
            Assert.strictEqual(AppState.dragPosition, 'middle');
            Assert.isTrue(el.classList.contains('drag-middle'));

            UI.handleDragOverNode(makeEv(135), 'n_t');
            Assert.strictEqual(AppState.dragPosition, 'bottom');
            Assert.isTrue(el.classList.contains('drag-bottom'));

            // 4. Drag di un widget (draggedBlockId) sopra nota diversa vs nota corrente
            AppState.draggedBlockId = 'adv_tbl_1';
            AppState.currentNoteId = 'n_p';
            const blkEvOk = makeEv(120);
            UI.handleDragOverNode(blkEvOk, 'n_t');
            Assert.strictEqual(blkEvOk.dataTransfer.dropEffect, 'move');
            Assert.isTrue(el.classList.contains('drag-middle'));

            const blkEvSame = makeEv(120);
            UI.handleDragOverNode(blkEvSame, 'n_p');
            Assert.strictEqual(blkEvSame.dataTransfer.dropEffect, 'none');
        } finally {
            AppState.notes = prevNotes;
            AppState.draggedNoteId = prevDraggedNote;
            AppState.dragPosition = prevDragPos;
            AppState.draggedBlockId = prevDraggedBlk;
            AppState.currentNoteId = prevCurId;
        }
    });

    test("handleDragOverRoot, handleDragLeaveRoot & handleDropRoot: gestiscono uscita mouse e ignorano .node-content", () => {
        const treeContainer = document.getElementById('treeContainer');
        const prevTreeHtml = treeContainer.innerHTML;
        const prevNotes = [...AppState.notes];
        const prevDraggedNote = AppState.draggedNoteId;
        const prevRenderTree = UI.renderTree;
        const prevAutoSave = Store.triggerAutoSave;
        const prevGetBounding = treeContainer.getBoundingClientRect;

        try {
            UI.renderTree = () => {};
            Store.triggerAutoSave = () => {};
            treeContainer.getBoundingClientRect = () => ({ left: 0, right: 300, top: 50, bottom: 550, width: 300, height: 500 });
            AppState.notes = [
                { id: 'n_r1', parentId: null, title: 'Radice' },
                { id: 'n_ch1', parentId: 'n_r1', title: 'Figlia' }
            ];
            treeContainer.innerHTML = `<div class="node-content"><span class="inner-lbl">Figlia</span></div>`;
            const innerLbl = treeContainer.querySelector('.inner-lbl');

            // 1. Sopra .node-content -> non aggiunge drag-over-root né esegue move su root
            AppState.draggedNoteId = 'n_ch1';
            UI.handleDragOverRoot({ preventDefault: () => {}, target: innerLbl });
            Assert.isFalse(treeContainer.classList.contains('drag-over-root'));

            UI.handleDropRoot({ preventDefault: () => {}, target: innerLbl });
            Assert.strictEqual(Store.getNote('n_ch1').parentId, 'n_r1');

            // 2. Sopra treeContainer libero -> aggiunge drag-over-root
            UI.handleDragOverRoot({ preventDefault: () => {}, target: treeContainer });
            Assert.isTrue(treeContainer.classList.contains('drag-over-root'));

            // 3. Mouse ancora dentro il perimetro -> mantiene drag-over-root
            UI.handleDragLeaveRoot({ clientX: 150, clientY: 200 });
            Assert.isTrue(treeContainer.classList.contains('drag-over-root'));

            // 4. Mouse fuori dal perimetro -> rimuove drag-over-root
            UI.handleDragLeaveRoot({ clientX: 350, clientY: 200 });
            Assert.isFalse(treeContainer.classList.contains('drag-over-root'));

            // 5. Drop su root libera -> rimuove drag-over-root e sposta alla radice
            treeContainer.classList.add('drag-over-root');
            UI.handleDropRoot({ preventDefault: () => {}, target: treeContainer });
            Assert.isFalse(treeContainer.classList.contains('drag-over-root'));
            Assert.isNull(Store.getNote('n_ch1').parentId);
        } finally {
            treeContainer.getBoundingClientRect = prevGetBounding;
            treeContainer.classList.remove('drag-over-root');
            treeContainer.innerHTML = prevTreeHtml;
            AppState.notes = prevNotes;
            AppState.draggedNoteId = prevDraggedNote;
            UI.renderTree = prevRenderTree;
            Store.triggerAutoSave = prevAutoSave;
        }
    });

    test("executeMove: sposta correttamente le note in modalità root, middle, top e bottom", () => {
        const prevNotes = [...AppState.notes];
        const prevRenderTree = UI.renderTree;
        const prevAutoSave = Store.triggerAutoSave;

        let savedCount = 0;
        let renderCount = 0;

        try {
            UI.renderTree = () => { renderCount++; };
            Store.triggerAutoSave = () => { savedCount++; };

            AppState.notes = [
                { id: 'n1', parentId: null, title: 'Uno', expanded: false },
                { id: 'n2', parentId: null, title: 'Due', expanded: false },
                { id: 'n3', parentId: null, title: 'Tre', expanded: false }
            ];

            // 1. Sposta n3 sopra n1 ('top')
            UI.executeMove('n3', 'n1', 'top');
            Assert.strictEqual(AppState.notes.map(n => n.id).join(','), 'n3,n1,n2');
            Assert.isNull(AppState.notes[0].parentId);
            Assert.isTrue(AppState.notes[0]._isDirty);

            // 2. Sposta n3 dentro n1 ('middle')
            UI.executeMove('n3', 'n1', 'middle');
            const n1 = Store.getNote('n1');
            const n3 = Store.getNote('n3');
            Assert.strictEqual(n3.parentId, 'n1');
            Assert.isTrue(n1.expanded);

            // 3. Sposta n2 sotto n3 ('bottom', adotta parentId di n3 cioè 'n1')
            UI.executeMove('n2', 'n3', 'bottom');
            const n2 = Store.getNote('n2');
            Assert.strictEqual(n2.parentId, 'n1');
            Assert.strictEqual(AppState.notes.map(n => n.id).join(','), 'n1,n3,n2');

            // 4. Sposta n3 alla radice ('root')
            UI.executeMove('n3', null, 'root');
            Assert.isNull(Store.getNote('n3').parentId);
            Assert.strictEqual(AppState.notes[AppState.notes.length - 1].id, 'n3');
            Assert.strictEqual(renderCount, 4);
            Assert.strictEqual(savedCount, 4);
        } finally {
            AppState.notes = prevNotes;
            UI.renderTree = prevRenderTree;
            Store.triggerAutoSave = prevAutoSave;
        }
    });

    test("handleDropNode: gestisce drop di widget, blocco cicli anti-discendente e drop di note", () => {
        const prevNotes = [...AppState.notes];
        const prevCurId = AppState.currentNoteId;
        const prevDraggedNote = AppState.draggedNoteId;
        const prevDragPos = AppState.dragPosition;
        const prevDraggedBlk = AppState.draggedBlockId;
        const prevDraggedBlkType = AppState.draggedBlockType;
        const prevMoveWidget = WidgetManager.moveWidgetToNote;
        const prevRenderTree = UI.renderTree;
        const prevAutoSave = Store.triggerAutoSave;

        let movedWidgetCall = null;
        try {
            UI.renderTree = () => {};
            Store.triggerAutoSave = () => {};
            WidgetManager.moveWidgetToNote = (wId, targetId) => { movedWidgetCall = { wId, targetId }; };

            AppState.notes = [
                { id: 'n_src', parentId: null, title: 'Src' },
                { id: 'n_sub', parentId: 'n_src', title: 'Sub' },
                { id: 'n_dst', parentId: null, title: 'Dst' }
            ];

            // 1. Drop di widget su nota diversa
            AppState.currentNoteId = 'n_src';
            AppState.draggedBlockId = 'adv_tbl_move';
            AppState.draggedBlockType = 'database';
            UI.handleDropNode({ preventDefault: () => {}, stopPropagation: () => {} }, 'n_dst');
            Assert.isTrue(movedWidgetCall !== null);
            Assert.strictEqual(movedWidgetCall.wId, 'adv_tbl_move');
            Assert.strictEqual(movedWidgetCall.targetId, 'n_dst');
            Assert.isNull(AppState.draggedBlockId);

            // 2. Drop anti-ciclo: n_src dentro n_sub non deve spostare
            AppState.draggedNoteId = 'n_src';
            AppState.dragPosition = 'middle';
            UI.handleDropNode({ preventDefault: () => {}, stopPropagation: () => {} }, 'n_sub');
            Assert.isNull(Store.getNote('n_src').parentId);
        } finally {
            AppState.notes = prevNotes;
            AppState.currentNoteId = prevCurId;
            AppState.draggedNoteId = prevDraggedNote;
            AppState.dragPosition = prevDragPos;
            AppState.draggedBlockId = prevDraggedBlk;
            AppState.draggedBlockType = prevDraggedBlkType;
            WidgetManager.moveWidgetToNote = prevMoveWidget;
            UI.renderTree = prevRenderTree;
            Store.triggerAutoSave = prevAutoSave;
        }
    });

});