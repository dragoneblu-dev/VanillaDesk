/**
 * ui-inline-footnotes.js
 * Sottomodulo di UI.
 * Rendering visivo delle Note a piè di pagina generate dagli "Appunti Nascosti".
 * FIX DEFENSIVO DOM: Fallback automatico per l'append di inline-footnotes-area
 * qualora .editor-scroll-content non sia presente nel DOM o in ambienti headless.
 */

Object.assign(UI, {
    renderInlineFootnotes: () => {
        let area = document.getElementById('inline-footnotes-area');
        if (!area) {
            area = document.createElement('div');
            area.id = 'inline-footnotes-area';
            
            area.style.maxWidth = 'var(--page-max-width)';
            area.style.marginLeft = 'auto';
            area.style.marginRight = 'auto';
            area.style.width = '100%';
            area.style.boxSizing = 'border-box';

            const editorWrapper = document.querySelector('.editor-scroll-content');
            if (editorWrapper) {
                editorWrapper.appendChild(area);
            } else {
                const noteContent = document.getElementById('noteContent');
                if (noteContent && noteContent.parentNode) {
                    noteContent.parentNode.appendChild(area);
                } else {
                    document.body.appendChild(area);
                }
            }
        }

        const editor = document.getElementById('noteContent');
        if (!editor) return;

        const markers = editor.querySelectorAll('.inline-note-marker');
        if (markers.length === 0) {
            area.innerHTML = '';
            return;
        }

        let html = `<div style="margin-top: 40px; padding-top: 20px; border-top: 1px dashed var(--border-color); font-size: 0.85rem; color: var(--text-secondary);">`;
        html += `<div style="font-weight: bold; margin-bottom: 10px; text-transform: uppercase;">Note a Piè di Pagina</div>`;

        markers.forEach((marker, index) => {
            let htmlContent = '';
            const wrapper = marker.closest('.inline-note-wrapper');
            if (wrapper) {
                const dataSpan = wrapper.querySelector('.inline-note-data');
                if (dataSpan) htmlContent = dataSpan.innerHTML;
            }
            if (!htmlContent) {
                htmlContent = marker.getAttribute('data-tooltip') || '';
                htmlContent = htmlContent.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            }

            html += `<div style="margin-bottom: 8px; display: flex; gap: 10px; align-items: flex-start;">
                        <span style="color: var(--accent-color); cursor: pointer; font-weight: bold;" onclick="UI.scrollToInlineNote(${index})">[${index + 1}]</span>
                        <div style="flex:1;">${htmlContent}</div>
                     </div>`;
        });
        html += `</div>`;
        area.innerHTML = html;
    },

    scrollToInlineNote: (index) => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;
        const markers = editor.querySelectorAll('.inline-note-marker');
        if (markers[index]) {
            markers[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
            const icon = markers[index].querySelector('svg') || markers[index];
            icon.style.transition = 'transform 0.6s, color 0.6s';
            icon.style.transform = 'scale(1.8)';
            icon.style.color = 'var(--danger-color)';
            setTimeout(() => {
                icon.style.transform = 'none';
                icon.style.color = 'currentColor';
            }, 1500); 
        }
    }
});