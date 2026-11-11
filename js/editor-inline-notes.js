/**
 * editor-inline-notes.js
 * Sottomodulo di Editor.
 * Gestione degli appunti nascosti nel testo (Footnotes).
 * Protezione atomica contenteditable="false" per salvaguardare il contenitore dalle fusioni accidentali.
 * Salvataggio normalizzato tramite la funzione centralizzata Editor.sanitizeMiniText, preservando tutti gli spazi digitati o incollati.
 * FIX ANCORAGGIO CURSORE: Inserimento della selezione a offset 1 dopo il \u200B per impedire
 * che caratteri digitati a fine riga finiscano prima del cuscinetto protettivo.
 * FEAT FULL HEIGHT DRAWER: Layout a tutta altezza (height: 100%, flex: 1) per consentire all'area
 * di testo di occupare l'intero spazio verticale disponibile nel Drawer laterale.
 * FEAT CARET RESUME: Al salvataggio della nota inline, il cursore viene riposizionato istantaneamente
 * subito dopo il widget per riprendere la scrittura rapida.
 * CLEAN I18N CALLS: Chiamate dirette a I18n.t() senza controlli ternari o stringhe di fallback duplicate.
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
        wrapper.setAttribute('contenteditable', 'false'); // Blocco atomico anti-merge del browser

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
        
        // Cuscinetti Zero-Width Space per consentire al cursore di oltrepassare l'inline block
        const zwsBefore = document.createTextNode('\u200B');
        const zwsAfter = document.createTextNode('\u200B');
        
        range.insertNode(wrapper);
        if (wrapper.parentNode) {
            wrapper.parentNode.insertBefore(zwsBefore, wrapper);
            wrapper.parentNode.insertBefore(zwsAfter, wrapper.nextSibling);
        }

        // Posizionamento esplicito DOPO il carattere \u200B del nodo zwsAfter
        const newRange = document.createRange();
        newRange.setStart(zwsAfter, 1);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        if (typeof TestFramework === 'undefined') {
            setTimeout(() => { Editor.handleInlineNoteClick(marker); }, 50);
        }
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
            wrapper.setAttribute('contenteditable', 'false');
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
            <div style="display:flex; flex-direction:column; height:100%; gap:10px;">
                <div style="background: rgba(0,0,0,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display:flex; flex-direction:column; flex:1; min-height:0;">
                    <div class="toolbar" style="margin-bottom: 10px; padding: 0; border: none; background: transparent; flex-shrink:0;">
                        <button class="adv-icon-btn" onclick="document.execCommand('bold', false, null)" title="${I18n.t('toolbar.bold')}"><b>B</b></button>
                        <button class="adv-icon-btn" onclick="document.execCommand('italic', false, null)" title="${I18n.t('toolbar.italic')}"><i>I</i></button>
                        <button class="adv-icon-btn" onclick="document.execCommand('underline', false, null)" title="${I18n.t('toolbar.underline')}"><u>U</u></button>
                        <div style="width:1px; height:15px; background:var(--border-color); margin:0 5px;"></div>
                        <button class="adv-icon-btn" onclick="document.execCommand('insertUnorderedList', false, null)" title="${I18n.t('format_lists.bullet_list')}"><b>•</b></button>
                    </div>
                    <div id="inlineNoteInput" class="editor-content adv-scroll-container" contenteditable="true" style="outline: none; flex:1; min-height:0; background:var(--bg-color); border:1px solid var(--border-color); padding:12px; border-radius:4px; overflow-y:auto; line-height:1.5;">${currentHTML}</div>
                </div>
                <p style="font-size:0.75rem; color:var(--text-secondary); margin:0; flex-shrink:0;">${I18n.t('inline_notes.drawer_hint')}</p>
            </div>
        `;
        
        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.cancel')}</button>
            <button class="btn btn-primary" onclick="Editor.saveInlineNote()" style="gap:1px">${I18n.t('inline_notes.btn_save')} (Ctrl +<span style="display:inline-flex; vertical-align:middle;">${Icons.returnKey}</span>)</button>
        `;

        UI.openDrawer(I18n.t('inline_notes.drawer_title'), bodyHTML, footerHTML);

        setTimeout(() => {
            const input = document.getElementById('inlineNoteInput');
            if (input) {
                input.focus();
                input.addEventListener('keydown', (e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        Editor.saveInlineNote();
                    }
                });
            }
        }, 50);
    },

    saveInlineNote: () => {
        const input = document.getElementById('inlineNoteInput');
        if (!input || !Editor.currentInlineNote) return;

        // Pulizia centralizzata senza alcun trim forzato degli spazi
        const newHTML = typeof Editor.sanitizeMiniText === 'function' 
            ? Editor.sanitizeMiniText(input.innerHTML) 
            : input.innerHTML;

        Editor.saveSnapshot();
        
        const wrapper = Editor.currentInlineNote.closest('.inline-note-wrapper, .adv-inline-shell') || Editor.currentInlineNote;
        if (wrapper) {
            const dataSpan = wrapper.querySelector('.inline-note-data');
            if (dataSpan) dataSpan.innerHTML = newHTML;
        }

        if (typeof UI !== 'undefined' && UI.renderInlineFootnotes) {
            UI.renderInlineFootnotes();
        }

        Store.triggerAutoSave();
        UI.closeDrawer();

        // Riposiziona il cursore subito dopo la nota inline per riprendere a scrivere immediatamente
        if (typeof Editor.setCaretAfterInlineElement === 'function' && wrapper) {
            Editor.setCaretAfterInlineElement(wrapper);
        }

        Editor.currentInlineNote = null;
    }
});