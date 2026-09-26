/**
 * editor-inline-notes.js
 * Sottomodulo di Editor.
 * Gestione degli appunti nascosti nel testo (Footnotes).
 * FIX INLINE DELETE: Aggiunto l'attributo contenteditable="false" nativo per proteggere il contenitore 
 * invisibile dalle cancellazioni accidentali quando si fondono i paragrafi tramite i tasti Canc/Backspace.
 */

Object.assign(Editor, {
    currentInlineNote: null,

    insertInlineNote: () => {
        Editor.saveSnapshot();
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);

        const wrapper = document.createElement('span');
        wrapper.className = 'inline-note-wrapper adv-inline-shell';
        wrapper.setAttribute('data-widget-type', 'inline-note');
        wrapper.setAttribute('contenteditable', 'false'); // FIX: Blocco atomico anti-merge del browser!

        const marker = document.createElement('span');
        marker.className = 'inline-note-marker';
        marker.setAttribute('contenteditable', 'false');
        marker.innerHTML = Icons.noteInline;

        const dataStorage = document.createElement('span');
        dataStorage.className = 'inline-note-data';
        dataStorage.style.display = 'none';

        wrapper.appendChild(marker);
        wrapper.appendChild(dataStorage);

        range.deleteContents();
        
        // FIX INLINE BLOCK NESTING E CURSORE: Aggiungiamo i cuscinetti Zero-Width Space
        // per permettere alla freccia ArrowDown del browser di funzionare.
        const zwsBefore = document.createTextNode('\u200B');
        const zwsAfter = document.createTextNode('\u200B');
        
        range.insertNode(zwsAfter);
        range.insertNode(wrapper);
        range.insertNode(zwsBefore);

        const newRange = document.createRange();
        newRange.setStartAfter(zwsAfter);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        setTimeout(() => { Editor.handleInlineNoteClick(marker); }, 50);
    },

    handleInlineNoteClick: (element) => {
        if (!AppState.isEditMode) return;

        Editor.currentInlineNote = element;
        let wrapper = element.closest('.inline-note-wrapper, .adv-inline-shell');
        let dataSpan = null;
        
        if (!wrapper) {
            wrapper = document.createElement('span');
            wrapper.className = 'inline-note-wrapper adv-inline-shell';
            wrapper.setAttribute('data-widget-type', 'inline-note');
            wrapper.setAttribute('contenteditable', 'false'); // Sicurezza retroattiva per vecchi gusci
            element.parentNode.insertBefore(wrapper, element);
            wrapper.appendChild(element);
        }

        dataSpan = wrapper.querySelector('.inline-note-data');
        
        if (!dataSpan) {
            const oldText = element.getAttribute('data-tooltip') || '';
            element.removeAttribute('data-tooltip'); 
            dataSpan = document.createElement('span');
            dataSpan.className = 'inline-note-data';
            dataSpan.style.display = 'none';
            dataSpan.innerHTML = oldText;
            wrapper.appendChild(dataSpan);
        }

        const currentHTML = dataSpan.innerHTML;

        const bodyHTML = `
            <div style="background: rgba(0,0,0,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display:flex; flex-direction:column;">
                <div class="toolbar" style="margin-bottom: 10px; padding: 0; border: none; background: transparent;">
                    <button class="adv-icon-btn" onclick="document.execCommand('bold', false, null)" title="Grassetto"><b>B</b></button>
                    <button class="adv-icon-btn" onclick="document.execCommand('italic', false, null)" title="Corsivo"><i>I</i></button>
                    <button class="adv-icon-btn" onclick="document.execCommand('underline', false, null)" title="Sottolineato"><u>U</u></button>
                    <div style="width:1px; height:15px; background:var(--border-color); margin:0 5px;"></div>
                    <button class="adv-icon-btn" onclick="document.execCommand('insertUnorderedList', false, null)" title="Lista Puntata"><b>•</b></button>
                </div>
                <div id="inlineNoteInput" class="editor-content" contenteditable="true" style="outline: none; flex:1; background:var(--bg-color); border:1px solid var(--border-color); padding:10px; border-radius:4px; overflow-y:auto;">${currentHTML}</div>
            </div>
            <p style="font-size:0.75rem; color:var(--text-secondary); margin-top:10px; margin-bottom:0;">L'appunto resterà nascosto nel testo sotto forma di icona, e comparirà passandoci il mouse sopra. Utile per glossari o promemoria.</p>
        `;
        
        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">Annulla</button>
            <button class="btn btn-primary" onclick="Editor.saveInlineNote()">Salva Appunto</button>
        `;

        UI.openDrawer('💬 Modifica Appunto Nascosto', bodyHTML, footerHTML);

        setTimeout(() => {
            const input = document.getElementById('inlineNoteInput');
            if (input) input.focus();
        }, 50);
    },

    saveInlineNote: () => {
        const input = document.getElementById('inlineNoteInput');
        if (!input || !Editor.currentInlineNote) return;

        let newHTML = input.innerHTML;

        // FIX ASSOLUTO: Appiattisce ogni possibile elemento block per mantenere 
        // 100% la legalità W3C all'interno del contenitore <span> del DOM principale.
        // Questo sventa tutti i bug di Merge/Delete nativi del browser senza rompere la formattazione.
        newHTML = newHTML.replace(/<div[^>]*>/gi, '<br>')
                         .replace(/<\/div>/gi, '')
                         .replace(/<p[^>]*>/gi, '<br>')
                         .replace(/<\/p>/gi, '')
                         .replace(/<li[^>]*>/gi, '<br>• ')
                         .replace(/<\/li>/gi, '')
                         .replace(/<\/?(ul|ol|h[1-6]|blockquote)[^>]*>/gi, '');
                         
        // Rimuove eventuali a capo rindondanti all'inizio
        newHTML = newHTML.replace(/^(<br\s*\/?>)+/i, '');

        Editor.saveSnapshot();
        
        const wrapper = Editor.currentInlineNote.closest('.inline-note-wrapper, .adv-inline-shell');
        if (wrapper) {
            const dataSpan = wrapper.querySelector('.inline-note-data');
            if (dataSpan) dataSpan.innerHTML = newHTML;
        }

        if (typeof UI !== 'undefined' && UI.renderInlineFootnotes) {
            UI.renderInlineFootnotes();
        }

        Store.triggerAutoSave();
        UI.closeDrawer();
        Editor.currentInlineNote = null;
    }
});