/**
 * ui-tree-dnd.js
 * Sottomodulo di UI dedicato all'intera logica di Drag & Drop delle Note nella sidebar:
 * - Inizio, trascinamento e termine del drag (handleDragStart, handleDragEnd).
 * - Calcolo delle zone di inserimento (top, middle, bottom) e feedback visivo (handleDragOverNode, handleDragOverRoot).
 * - Risoluzione del rilascio (handleDropNode, handleDropRoot).
 * - Spostamento gerarchico nell'albero e aggiornamento parentId (executeMove).
 * - Verifica relazioni di discendenza anti-ciclo (isDescendant).
 */

Object.assign(UI, {

    handleDragStart: (e, id) => { 
        AppState.draggedNoteId = id; 
        e.dataTransfer.effectAllowed = 'move'; 
        e.target.style.opacity = '0.5'; 
    },
    
    handleDragEnd: (e) => { 
        e.target.style.opacity = '1'; 
        document.querySelectorAll('.node-content').forEach(el => { el.classList.remove('drag-top', 'drag-bottom', 'drag-middle'); }); 
        const tc = document.getElementById('treeContainer');
        if (tc) tc.classList.remove('drag-over-root'); 
        AppState.draggedNoteId = null; 
        AppState.dragPosition = null; 
        AppState.draggedBlockId = null;
        AppState.draggedBlockType = null;
    },

    handleDragOverNode: (e, targetId) => {
        e.preventDefault();
        const targetEl = e.currentTarget;

        if (AppState.draggedBlockId) {
            targetEl.classList.remove('drag-top', 'drag-bottom', 'drag-middle');
            if (targetId !== AppState.currentNoteId) {
                targetEl.classList.add('drag-middle');
                e.dataTransfer.dropEffect = "move";
            } else {
                e.dataTransfer.dropEffect = "none";
            }
            return;
        }

        if (AppState.draggedNoteId === targetId) return;

        if (UI.isDescendant(AppState.draggedNoteId, targetId)) {
            targetEl.classList.remove('drag-top', 'drag-bottom', 'drag-middle');
            e.dataTransfer.dropEffect = "none";
            return;
        }

        const rect = targetEl.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        const height = rect.height;
        targetEl.classList.remove('drag-top', 'drag-bottom', 'drag-middle');

        if (offsetY < height * 0.25) {
            AppState.dragPosition = 'top'; targetEl.classList.add('drag-top');
        } else if (offsetY > height * 0.75) {
            AppState.dragPosition = 'bottom'; targetEl.classList.add('drag-bottom');
        } else {
            AppState.dragPosition = 'middle'; targetEl.classList.add('drag-middle');
        }
    },

    handleDragOverRoot: (e) => { 
        e.preventDefault(); 
        if (e.target.closest('.node-content')) return; 
        document.getElementById('treeContainer').classList.add('drag-over-root'); 
    },
    
    handleDropNode: (e, targetId) => { 
        e.preventDefault(); 
        e.stopPropagation(); 

        if (AppState.draggedBlockId) {
            document.querySelectorAll('.node-content').forEach(el => el.classList.remove('drag-top', 'drag-bottom', 'drag-middle'));
            
            if (targetId !== AppState.currentNoteId && typeof WidgetManager !== 'undefined') {
                WidgetManager.moveWidgetToNote(AppState.draggedBlockId, targetId);
            }
            AppState.draggedBlockId = null;
            AppState.draggedBlockType = null;
            return;
        }

        if (!AppState.draggedNoteId || AppState.draggedNoteId === targetId) return; 
        if (UI.isDescendant(AppState.draggedNoteId, targetId)) return; 
        UI.executeMove(AppState.draggedNoteId, targetId, AppState.dragPosition); 
    },
    
    handleDropRoot: (e) => { 
        e.preventDefault(); 
        document.getElementById('treeContainer').classList.remove('drag-over-root'); 
        if (e.target.closest('.node-content')) return; 
        if (AppState.draggedNoteId) UI.executeMove(AppState.draggedNoteId, null, 'root'); 
    },
    
    executeMove: (dragId, targetId, position) => { 
        const dragIndex = AppState.notes.findIndex(n => n.id === dragId); 
        if (dragIndex === -1) return; 
        const [draggedNote] = AppState.notes.splice(dragIndex, 1); 
        if (position === 'root') { 
            draggedNote.parentId = null; AppState.notes.push(draggedNote); 
        } else if (position === 'middle') { 
            draggedNote.parentId = targetId; const targetNote = Store.getNote(targetId); if (targetNote) targetNote.expanded = true; AppState.notes.push(draggedNote); 
        } else { 
            const targetIndex = AppState.notes.findIndex(n => n.id === targetId); const targetNote = AppState.notes[targetIndex]; draggedNote.parentId = targetNote.parentId; 
            if (position === 'top') AppState.notes.splice(targetIndex, 0, draggedNote); 
            else if (position === 'bottom') AppState.notes.splice(targetIndex + 1, 0, draggedNote); 
        } 
        draggedNote._isDirty = true;
        UI.renderTree(); 
        if (typeof Store !== 'undefined') Store.triggerAutoSave(); 
    },
    
    isDescendant: (parentId, childId) => { 
        let curr = Store.getNote(childId); 
        while (curr && curr.parentId) { 
            if (curr.parentId === parentId) return true; 
            curr = Store.getNote(curr.parentId); 
        } 
        return false; 
    }
});