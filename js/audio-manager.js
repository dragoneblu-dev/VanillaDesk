/**
 * AudioManager.js
 * Modulo per l'importazione, la gestione e il rendering di file Audio locali.
 * REFACTOR WORKSPACE: I file non vengono più codificati in Base64 ma passati 
 * a Store.js per il salvataggio diretto come Blob nativi su disco fisso.
 */

const AudioManager = {

    handleUpload: async (input) => {
        if (!input.files || !input.files[0]) return;
        
        if (!AppState.assetsHandle) {
            alert("Devi prima creare un Workspace per poter allegare file fisici.");
            input.value = '';
            return;
        }

        const file = input.files[0];
        const maxSizeMB = 50; 
        
        if (file.size > maxSizeMB * 1024 * 1024) {
            alert(`Il file audio è troppo grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Il limite massimo consigliato è ${maxSizeMB} MB.`);
            input.value = '';
            return;
        }

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();
        
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast("Salvataggio audio su disco in corso...", "info");
        }
        
        // REFACTOR: Salva su cartella locale e ottiene il filename
        const fileName = await Store.saveAsset(file, 'aud');
        
        if (fileName) {
            const blobUrl = Editor.audioCache[fileName];
            const widgetId = 'adv_audio_' + Store.generateId();
            
            const bodyHTML = `
                <div style="padding: 15px; background: rgba(0,0,0,0.02); border-radius: 6px; border: 1px solid var(--border-color); display:flex; justify-content:center;">
                    <audio controls data-audio-ref="${fileName}" src="${blobUrl}" style="width: 100%; outline: none; border-radius: 4px;"></audio>
                </div>
            `;
            
            const wrapper = WidgetManager.createShell('audio', widgetId, bodyHTML);
            
            Editor.restoreSelection();
            const sel = window.getSelection();
            let node = sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
            if(node && node.nodeType === 3) node = node.parentNode;

            if (node && node.closest('.widget-type-columns')) {
                alert("Sposta il cursore fuori dalle colonne prima di inserire un audio.");
                input.value = '';
                return;
            }

            const range = sel.getRangeAt(0);

            if (node && Editor.isBlockElement(node) && node.innerText.trim() === '' && node.id !== 'noteContent') {
                node.parentNode.replaceChild(wrapper, node);
            } else {
                range.deleteContents();
                range.insertNode(wrapper);
                const p = document.createElement('p'); p.innerHTML = '<br>';
                wrapper.parentNode.insertBefore(p, wrapper.nextSibling);
            }

            AudioManager._updateWidgetUI(widgetId, file.name);

            if (typeof Store !== 'undefined') Store.triggerAutoSave();
            
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast("Audio inserito con successo!", "success");
            }
        }
        
        input.value = '';
    },

    downloadAudio: (widgetId) => {
        const wrapper = document.getElementById(widgetId);
        if (!wrapper) return;
        
        const audioEl = wrapper.querySelector('audio');
        if (!audioEl) return;
        
        let src = audioEl.src;
        let ref = audioEl.getAttribute('data-audio-ref');
        
        if (!src || !src.startsWith('blob:')) {
            if (ref && Editor.audioCache && Editor.audioCache[ref]) {
                src = Editor.audioCache[ref];
            }
        }
        
        if (!src) {
            alert("Impossibile trovare i dati audio in memoria.");
            return;
        }

        const titleEl = wrapper.querySelector('.adv-table-title');
        let filename = titleEl ? titleEl.innerText.trim() : 'Traccia_Audio';
        filename = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        let ext = ref ? ref.split('.').pop() : 'mp3';

        const a = document.createElement('a');
        a.href = src;
        a.download = `${filename}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    },

    openMenu: (e, widgetId) => {
        if (e) e.stopPropagation();
        UI.Menu.closeAll(true);
        UI.Menu.buildContextMenu(`adv-opt-btn-${widgetId}`, [
            { icon: Icons.download, label: 'Scarica Audio (Export)', onClick: () => AudioManager.downloadAudio(widgetId) },
            { type: 'divider' },
            { icon: Icons.trash, label: 'Elimina Player Audio', danger: true, onClick: () => Editor.safeDeleteWidget(document.getElementById(widgetId)) }
        ]);
    },

    _updateWidgetUI: (widgetId, title = 'Traccia Audio') => {
        WidgetManager.updateShellUI(widgetId, {
            icon: Icons.play,
            title: title,
            optionsId: `adv-opt-btn-${widgetId}`,
            onOptionsClick: AudioManager.openMenu,
            onTitleChange: (id, newTitle) => {
                Store.triggerAutoSave();
            },
            onDragStart: (e) => {
                AppState.draggedBlockId = widgetId;
                AppState.draggedBlockType = 'audio';
                e.dataTransfer.effectAllowed = 'move';
            },
            onDragEnd: () => { AppState.draggedBlockId = null; AppState.draggedBlockType = null; }
        });
    },

    mountAll: (container = document) => {
        const root = container.id === 'noteContent' ? container : (container.querySelector ? container.querySelector('#noteContent') || container : document);
        const audios = root.querySelectorAll('.widget-type-audio');

        audios.forEach(wrapper => {
            wrapper.setAttribute('contenteditable', 'false');
            let currentId = wrapper.id;

            if (!currentId) {
                currentId = 'adv_audio_' + Store.generateId();
                wrapper.id = currentId;
            }

            const audioEl = wrapper.querySelector('audio');
            if (audioEl) {
                const ref = audioEl.getAttribute('data-audio-ref');
                if (ref && Editor.audioCache && Editor.audioCache[ref]) {
                    audioEl.src = Editor.audioCache[ref];
                }
            }

            const titleNode = wrapper.querySelector('.adv-table-title');
            AudioManager._updateWidgetUI(currentId, titleNode ? titleNode.innerText : 'Traccia Audio');
        });
    }
};