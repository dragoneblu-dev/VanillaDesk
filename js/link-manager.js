/**
 * LinkManager.js
 * Gestisce i Tipi di Link (Esterni, Interni, File Locali testuali) e l'inserimento Video YouTube.
 * FIX WORKSPACE: Aggiunto l'Auto-Loading per i file testuali referenziati con Path Relativo.
 * FIX CURSORE E POLLUZIONE DOM: L'inserimento di un link inietta ora un SOLO Zero-Width Space 
 * esclusivamente DOPO il link, per permettere all'utente di digitare senza rimanere incastrato, 
 * evitando la duplicazione di \u200B e la fastidiosa permanenza in caso di cancellazione del testo.
 * FEAT UX: Aggiunta indicazione visiva della shortcut "[[" nel pannello di selezione link.
 * FEAT MIDDLE-CLICK: Centralizzata la funzione openLinkDirect per consentire l'apertura rapida tramite rotella mouse.
 */

const LinkManager = {
    activeLink: null,
    editingLink: null, 
    currentFileLinkElement: null,
    isEditingMode: false,

    _decodeEntities: (htmlStr) => {
        if (!htmlStr) return '';
        const txt = document.createElement("textarea");
        txt.innerHTML = htmlStr;
        return txt.value;
    },

    openSelectionModal: () => {
        Editor.saveSelection();
        UI.closeDrawer();
        LinkManager.isEditingMode = false;
        LinkManager.editingLink = null;

        let selectedText = "";
        if (Editor.savedRange && !Editor.savedRange.collapsed) {
            selectedText = Editor.savedRange.toString().trim();
        }

        const localPathRegex = /^([a-zA-Z]:[\\/]|\\\\|file:\/\/\/|\.\/|\.\.\/|[\w\-]+\/)/i;
        const urlRegex = /^(https?:\/\/[^\s]+)|((www\.)?[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}(\/[^\s]*)?(\.(html|php|jsp|asp|aspx))?)$/i;
        
        // Match base per catturare se l'utente ha evidenziato direttamente un link YT
        const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;

        if (selectedText && localPathRegex.test(selectedText) && !urlRegex.test(selectedText)) {
            LinkManager.openFileModal(selectedText);
            return;
        }

        if (selectedText && urlRegex.test(selectedText)) {
            if (ytRegex.test(selectedText)) {
                LinkManager.openYoutubeModal(selectedText);
            } else {
                LinkManager.openExternalModal(selectedText);
            }
            return;
        }

        const html = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div class="selection-card" onclick="LinkManager.selectType(event, 'internal')" style="position:relative;">
                    <span class="selection-icon" style="color:var(--accent-color);">${Icons.file}</span>
                    <div>
                        <div style="font-weight:bold">Link Interno <span style="font-size:0.75rem; color:var(--accent-color); background:rgba(37,99,235,0.1); padding:2px 6px; border-radius:10px; margin-left:5px; font-family:monospace; font-weight:normal;">Digita [[</span></div>
                        <div style="font-size:0.8rem; color:var(--text-secondary)">Collegamento a un'altra nota o capitolo</div>
                    </div>
                </div>
                <div class="selection-card" onclick="LinkManager.selectType(event, 'external')">
                    <span class="selection-icon" style="color:var(--accent-color);">${Icons.globe}</span>
                    <div>
                        <div style="font-weight:bold">Link Esterno</div>
                        <div style="font-size:0.8rem; color:var(--text-secondary)">Sito Web (http://...)</div>
                    </div>
                </div>
                <div class="selection-card" onclick="LinkManager.selectType(event, 'file')">
                    <span class="selection-icon" style="color:var(--accent-color);">${Icons.folderOpen}</span>
                    <div>
                        <div style="font-weight:bold">Link a File Testuale</div>
                        <div style="font-size:0.8rem; color:var(--text-secondary)">Assoluto (PC) o Relativo (Workspace)</div>
                    </div>
                </div>
                <div class="selection-card" onclick="LinkManager.selectType(event, 'youtube')">
                    <span class="selection-icon" style="color:var(--danger-color);">${Icons.youtube}</span>
                    <div>
                        <div style="font-weight:bold">Video YouTube</div>
                        <div style="font-size:0.8rem; color:var(--text-secondary)">Incorpora un video eseguibile nella pagina</div>
                    </div>
                </div>
            </div>
        `;
        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.link} Inserisci Link o Media</span>`, html, null);
    },

    selectType: (e, type) => {
        if (e) e.stopPropagation();

        if (type === 'external') LinkManager.openExternalModal();
        else if (type === 'internal') LinkManager.openInternalModal();
        else if (type === 'file') LinkManager.openFileModal();
        else if (type === 'youtube') LinkManager.openYoutubeModal();
    },

    showFloatingMenu: (link) => {
        LinkManager.hideFloatingMenu();
        LinkManager.activeLink = link;

        const popover = document.createElement('div');
        popover.id = 'adv-link-popover';
        popover.className = 'adv-floating-popover';
        
        const svgOpen = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
        const svgEdit = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

        let extraHtml = '';
        if (link.classList.contains('file-link')) {
            extraHtml = `
                <div style="width:1px; height:16px; background:var(--border-color); margin: 0 2px;"></div>
                <button onclick="LinkManager.copyFileLinkPath()" title="Copia Path (Percorso)">${Icons.clipboard}</button>
            `;
        }

        popover.innerHTML = `
            <button onclick="LinkManager.openCurrentLink()" title="Apri Link">${svgOpen}</button>
            <div style="width:1px; height:16px; background:var(--border-color); margin: 0 2px;"></div>
            <button onclick="LinkManager.editCurrentLink()" title="Modifica Link">${svgEdit}</button>
            ${extraHtml}
        `;

        document.body.appendChild(popover);

        const rect = link.getBoundingClientRect();
        let top = rect.bottom + window.scrollY + 5;
        let left = rect.left + window.scrollX;

        if (left + popover.offsetWidth > window.innerWidth - 10) {
            left = window.innerWidth - popover.offsetWidth - 10;
        }
        if (top + popover.offsetHeight > window.innerHeight + window.scrollY) {
            top = rect.top + window.scrollY - popover.offsetHeight - 5;
        }

        popover.style.top = top + 'px';
        popover.style.left = left + 'px';

        popover.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
        popover.addEventListener('click', e => e.stopPropagation());
    },

    hideFloatingMenu: () => {
        const existing = document.getElementById('adv-link-popover');
        if (existing) existing.remove();
        LinkManager.activeLink = null;
    },

    copyFileLinkPath: () => {
        if (!LinkManager.activeLink || !LinkManager.activeLink.dataset.filePath) return;
        
        const path = LinkManager.activeLink.dataset.filePath;
        let pathToCopy = path;
        
        // Verifica se il path è assoluto
        const isAbsolutePath = /^([a-zA-Z]:[\\/]|\\\\|file:\/\/\/)/i.test(path);
        
        // LIMITAZIONE BROWSER: Il browser non conosce il disco C:\ del Workspace aperto
        // tramite File System API. Generiamo un percorso parlante combinando il nome del Workspace.
        if (!isAbsolutePath && AppState.workspaceHandle) {
            pathToCopy = `[Workspace: ${AppState.workspaceHandle.name}]\\${path.replace(/\//g, '\\')}`;
        }

        navigator.clipboard.writeText(pathToCopy).then(() => {
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast(!isAbsolutePath ? "Percorso (relativo al Workspace) copiato!" : "Percorso copiato negli appunti!", "success");
            }
            LinkManager.hideFloatingMenu();
        });
    },

    editCurrentLink: () => {
        if (!LinkManager.activeLink) return;
        const link = LinkManager.activeLink;

        LinkManager.editingLink = link;
        LinkManager.isEditingMode = true;
        
        LinkManager.hideFloatingMenu();

        const range = document.createRange();
        range.selectNodeContents(link);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        Editor.saveSelection();

        if (link.classList.contains('internal-link')) {
            LinkManager.openInternalModal(link.dataset.noteId, link.dataset.refId);
        } else if (link.classList.contains('file-link')) {
            LinkManager.openFileModal();
            setTimeout(() => {
                document.getElementById('fileLinkName').value = link.innerText.replace('📄 ', '');
                document.getElementById('fileLinkPath').value = link.dataset.filePath;
                
                const noteVal = link.getAttribute('data-link-note') || '';
                document.getElementById('fileLinkNote').value = LinkManager._decodeEntities(noteVal);
            }, 50);
        } else {
            LinkManager.openExternalModal();
            setTimeout(() => {
                let cleanHref = link.href.replace(/^https?:\/\/file:\/\/\//i, 'file:///');
                document.getElementById('externalLinkUrl').value = cleanHref;
                document.getElementById('externalLinkText').value = link.innerText;
                
                const noteVal = link.getAttribute('data-link-note') || '';
                document.getElementById('externalLinkNote').value = LinkManager._decodeEntities(noteVal);
            }, 50);
        }
    },

    // APERTURA DIRETTA DEL LINK (USATA ANCHE DAL CLICK CENTRALE CON ROTELLA DEL MOUSE)
    openLinkDirect: (link) => {
        if (!link || link.tagName !== 'A') return;

        if (link.classList.contains('internal-link')) {
            const noteId = link.getAttribute('data-note-id');
            const anchor = link.getAttribute('data-anchor');
            const refId = link.getAttribute('data-ref-id'); 
            if (noteId && typeof UI !== 'undefined' && UI.selectNote) UI.selectNote(noteId, anchor, refId);
        } else if (link.classList.contains('file-link')) {
            const path = link.getAttribute('data-file-path');
            if (path && typeof LinkManager !== 'undefined' && LinkManager.openViewer) LinkManager.openViewer(path, link);
        } else {
            if (link.href && !link.href.startsWith('javascript:')) {
                window.open(link.href, '_blank');
            }
        }
    },

    openCurrentLink: () => {
        const link = LinkManager.activeLink;
        if (!link || link.tagName !== 'A') return;

        LinkManager.hideFloatingMenu();
        LinkManager.openLinkDirect(link);
    },

    openExternalModal: (prefilledUrl = null) => {
        const title = LinkManager.isEditingMode ? `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.globe} Modifica Link Web</span>` : `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.globe} Nuovo Link Web</span>`;
        const btnLabel = LinkManager.isEditingMode ? 'Salva Modifiche' : 'Inserisci Link';

        const html = `
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div>
                    <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold;">URL (Indirizzo Web):</label>
                    <input type="text" id="externalLinkUrl" class="modern-input" placeholder="https://www.google.com" value="https://">
                </div>
                <div>
                    <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold;">Testo da visualizzare (Titolo):</label>
                    <input type="text" id="externalLinkText" class="modern-input" placeholder="Es: Cerca su Google">
                </div>
                <div>
                    <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold;">Note Aggiuntive (Opzionale):</label>
                    <textarea id="externalLinkNote" class="modern-input" rows="6" style="resize:vertical; width:100%; font-size:0.85rem;" placeholder="Aggiungi dettagli o spiegazioni. Appariranno come tooltip passandoci il mouse sopra..."></textarea>
                </div>
            </div>
        `;
        const footer = `<button class="btn btn-primary" onclick="LinkManager.confirmExternalLink()" style="width:100%; justify-content:center;">${btnLabel}</button>`;

        UI.openDrawer(title, html, footer);

        setTimeout(() => {
            const urlInput = document.getElementById('externalLinkUrl');
            const textInput = document.getElementById('externalLinkText');
            
            if (prefilledUrl) {
                let formattedUrl = prefilledUrl;
                
                formattedUrl = formattedUrl.replace(/^https?:\/\/file:\/\/\//i, 'file:///');
                
                const isLocalPath = /^([a-zA-Z]:[\\/]|\\\\)/i.test(formattedUrl);
                const hasProtocol = /^[a-zA-Z0-9+-.]+:/i.test(formattedUrl);
                
                if (isLocalPath) {
                    formattedUrl = 'file:///' + formattedUrl.replace(/\\/g, '/');
                } else if (!hasProtocol) {
                    formattedUrl = 'https://' + formattedUrl;
                }
                if (urlInput) urlInput.value = formattedUrl;
                
                let decodedText = prefilledUrl;
                try { decodedText = decodeURIComponent(prefilledUrl); } catch(e) { }
                if (textInput) textInput.value = decodedText;

            } else if (!LinkManager.isEditingMode) {
                let selectedText = "";
                if (Editor.savedRange && !Editor.savedRange.collapsed) {
                    selectedText = Editor.savedRange.toString().trim();
                }
                
                let decodedText = selectedText;
                try { decodedText = decodeURIComponent(selectedText); } catch(e) { }
                if (textInput) textInput.value = decodedText;
            }
            if (urlInput) {
                urlInput.focus();
                if(prefilledUrl) urlInput.setSelectionRange(urlInput.value.length, urlInput.value.length);
            }
        }, 50);
    },

    confirmExternalLink: () => {
        let url = document.getElementById('externalLinkUrl').value.trim();
        const text = document.getElementById('externalLinkText').value;
        let note = document.getElementById('externalLinkNote').value || '';
        
        if (!url || url === "https://") { alert("Inserisci un URL valido."); return; }

        url = url.replace(/^https?:\/\/file:\/\/\//i, 'file:///');

        const isLocalPath = /^([a-zA-Z]:[\\/]|\\\\)/i.test(url);
        const hasProtocol = /^[a-zA-Z0-9+-.]+:/i.test(url);

        if (isLocalPath) {
            url = 'file:///' + url.replace(/\\/g, '/');
        } else if (!hasProtocol) {
            url = 'https://' + url;
        }

        note = note.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        UI.closeDrawer();
        
        if (LinkManager.isEditingMode && LinkManager.editingLink) {
            Editor.saveSnapshot();
            LinkManager.editingLink.href = url;
            LinkManager.editingLink.textContent = text || url;
            
            LinkManager.editingLink.removeAttribute('title'); 

            if (note) {
                LinkManager.editingLink.setAttribute('data-link-note', note);
            } else {
                LinkManager.editingLink.removeAttribute('data-link-note');
            }

            LinkManager.editingLink = null;
            LinkManager.isEditingMode = false;
            Store.triggerAutoSave();
        } else {
            const link = document.createElement('a');
            link.href = url;
            link.target = "_blank";
            
            if (note) link.setAttribute('data-link-note', note);
            
            link.style.cursor = "pointer";
            link.textContent = text || url;
            LinkManager.insertNodeAtSelection(link);
        }
    },

    openInternalModal: (targetNoteId = null, targetRefId = null) => {
        const title = LinkManager.isEditingMode ? `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.file} Cambia Nota Collegata</span>` : `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.file} Seleziona Nota Interna</span>`;

        UI.DocumentBrowser.open('link', title, (item) => {
            const anchor = (item.refType === 'chapter') ? item.title : null;
            let displayTitle = item.noteTitle || item.title;
            if (item.refType !== 'note' && item.refType !== 'chapter') {
                displayTitle = item.title;
            }
            
            if (LinkManager.editingLink) {
                LinkManager.isEditingMode = true;
            }

            LinkManager.insertInternalLinkDOM(item.noteId, displayTitle, anchor, item.refId);
        }, { noteId: targetNoteId, refId: targetRefId }); 
    },

    insertInternalLinkDOM: (noteId, noteTitle, anchor = null, refId = null) => {
        UI.closeDrawer();
        const label = anchor ? anchor : noteTitle;

        if (LinkManager.isEditingMode && LinkManager.editingLink) {
            Editor.saveSnapshot();
            LinkManager.editingLink.dataset.noteId = noteId;
            
            if (anchor) LinkManager.editingLink.dataset.anchor = anchor;
            else delete LinkManager.editingLink.dataset.anchor;

            if (refId) LinkManager.editingLink.dataset.refId = refId;
            else delete LinkManager.editingLink.dataset.refId;

            LinkManager.editingLink.textContent = label;
            LinkManager.editingLink = null;
            LinkManager.isEditingMode = false;
            Store.triggerAutoSave();
        } else {
            const link = document.createElement('a');
            link.href = "#";
            link.className = "internal-link";
            link.dataset.noteId = noteId;
            
            if (anchor) link.dataset.anchor = anchor;
            if (refId) link.dataset.refId = refId;
            
            link.textContent = label;
            LinkManager.insertNodeAtSelection(link);
        }
    },

    browseLocalFile: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = e => {
            if(e.target.files.length > 0) {
                const file = e.target.files[0];
                document.getElementById('fileLinkName').value = file.name;
                document.getElementById('fileLinkPath').value = "C:\\...\\" + file.name;
                UI.showToast("Per motivi di sicurezza, il browser non può leggere la cartella esatta del tuo PC. Sostituisci i puntini con il path manualmente.", "warning");
            }
        };
        input.click();
    },

    openFileModal: (prefilledPath = null) => {
        const title = LinkManager.isEditingMode ? `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.folderOpen} Modifica Link a File Testuale</span>` : `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.folderOpen} Nuovo Link a File Testuale</span>`;
        const btnLabel = LinkManager.isEditingMode ? 'Salva Modifiche' : 'Inserisci Link';

        const html = `
            <div style="background: rgba(37,99,235,0.05); border: 1px solid rgba(37,99,235,0.2); padding: 10px; border-radius: 6px; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 15px;">
                <b>Percorso Assoluto:</b> <code>C:\\Cartella\\File.txt</code> (L'app non potrà aprirlo in automatico)<br>
                <b>Percorso Relativo:</b> <code>Documenti/File.txt</code> (L'app cercherà il file all'interno della cartella Workspace e lo auto-caricherà nel visore).
            </div>
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div>
                    <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold;">Percorso File (Path Assoluto o Relativo):</label>
                    <input type="text" id="fileLinkPath" class="modern-input" placeholder="Es: C:\\Logs\\error.log oppure cartella/file.txt" style="margin-top:5px;">
                </div>
                <div>
                    <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold;">Testo da visualizzare (Titolo):</label>
                    <div style="display:flex; gap:10px; margin-top:5px;">
                        <input type="text" id="fileLinkName" class="modern-input" placeholder="Es: Log Errori" style="flex:1;">
                        <button class="btn" onclick="LinkManager.browseLocalFile()" style="padding:0 15px;"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.search} Sfoglia...</span></button>
                    </div>
                </div>
                <div>
                    <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold;">Note Aggiuntive (Opzionale):</label>
                    <textarea id="fileLinkNote" class="modern-input" rows="4" style="resize:vertical; width:100%; font-size:0.85rem; margin-top:5px;" placeholder="Aggiungi dettagli o descrizioni sul file..."></textarea>
                </div>
            </div>
        `;
        const footer = `<button class="btn btn-primary" onclick="LinkManager.confirmFileLink()" style="width:100%; justify-content:center;">${btnLabel}</button>`;

        UI.openDrawer(title, html, footer);

        setTimeout(() => {
            if (prefilledPath && !LinkManager.isEditingMode) {
                document.getElementById('fileLinkPath').value = prefilledPath;
                let filename = prefilledPath.split(/[\\/]/).pop() || "File Locale";
                document.getElementById('fileLinkName').value = filename;
            } else if (!LinkManager.isEditingMode) {
                let selectedText = "";
                if (Editor.savedRange && !Editor.savedRange.collapsed) {
                    selectedText = Editor.savedRange.toString().trim();
                }
                if (selectedText) document.getElementById('fileLinkName').value = selectedText;
            }
            
            const fileInput = document.getElementById('fileLinkPath');
            if (fileInput) fileInput.focus();
        }, 50);
    },

    confirmFileLink: () => {
        const name = document.getElementById('fileLinkName').value || "File Locale";
        const path = document.getElementById('fileLinkPath').value;
        let note = document.getElementById('fileLinkNote').value || '';

        if (!path) { alert("Inserisci un percorso valido."); return; }

        note = note.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        UI.closeDrawer();

        if (LinkManager.isEditingMode && LinkManager.editingLink) {
            Editor.saveSnapshot();
            LinkManager.editingLink.dataset.filePath = path;
            
            LinkManager.editingLink.removeAttribute('title'); 

            if (note) {
                LinkManager.editingLink.setAttribute('data-link-note', note);
            } else {
                LinkManager.editingLink.removeAttribute('data-link-note');
            }

            LinkManager.editingLink.innerHTML = `📄 ${name}`;
            LinkManager.editingLink = null;
            LinkManager.isEditingMode = false;
            Store.triggerAutoSave();
        } else {
            const link = document.createElement('a');
            link.href = "#";
            link.className = "file-link";
            link.dataset.filePath = path;
            
            if (note) link.setAttribute('data-link-note', note);
            
            link.textContent = `📄 ${name}`;
            LinkManager.insertNodeAtSelection(link);
        }
    },

    // -------------------------------------------------------------
    // VIDEO YOUTUBE (WIDGET SHELL ISOLATA)
    // -------------------------------------------------------------
    openYoutubeModal: (prefilledUrl = null) => {
        const title = `<span style="display:inline-flex; align-items:center; gap:5px; color:var(--danger-color);">${Icons.youtube} Incorpora Video YouTube</span>`;
        const html = `
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div style="font-size:0.85rem; color:var(--text-secondary); background:rgba(37,99,235,0.05); border:1px solid rgba(37,99,235,0.2); padding:10px; border-radius:6px; line-height:1.5;">
                    Il video verrà inserito direttamente nella pagina in un modulo protetto. Potrai riprodurlo senza uscire dall'app.
                </div>
                <div>
                    <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold;">URL del Video:</label>
                    <input type="text" id="youtubeUrlInput" class="modern-input" placeholder="Es: https://www.youtube.com/watch?v=12345abcdef">
                </div>
            </div>
        `;
        const footer = `<button class="btn btn-primary" onclick="LinkManager.confirmYoutube()" style="width:100%; justify-content:center;">Inserisci Video</button>`;
        
        UI.openDrawer(title, html, footer);

        setTimeout(() => {
            const urlInput = document.getElementById('youtubeUrlInput');
            if (prefilledUrl && urlInput) {
                urlInput.value = prefilledUrl;
            }
            if (urlInput) urlInput.focus();
        }, 50);
    },

    confirmYoutube: () => {
        let url = document.getElementById('youtubeUrlInput').value.trim();
        if (!url) { alert("Inserisci l'URL del video YouTube."); return; }

        // Estrazione dell'ID Video
        const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
        const match = url.match(ytRegex);

        if (!match || match[1].length !== 11) {
            alert("Impossibile riconoscere un ID video valido in questo link YouTube.");
            return;
        }

        const videoId = match[1];
        const embedUrl = `https://www.youtube.com/embed/${videoId}`;
        
        UI.closeDrawer();
        Editor.saveSnapshot();
        Editor.restoreSelection();

        const widgetId = 'adv_vid_' + Store.generateId();
        const iframeHTML = `<iframe src="${embedUrl}" width="100%" height="400" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="border-radius:6px; display:block;"></iframe>`;
        
        const wrapper = WidgetManager.createShell('video', widgetId, iframeHTML);
        
        const sel = window.getSelection();
        let node = sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
        if(node && node.nodeType === 3) node = node.parentNode;

        if (node && node.closest('.widget-type-columns, .simple-table-wrapper')) {
            alert("Non è permesso inserire Widget Complessi all'interno delle Colonne o delle Tabelle Semplici per prevenire la corruzione del layout.\nSposta il cursore fuori prima di inserire.");
            return;
        }

        let targetBlock = node ? node.closest('p, div, li, h1, h2, h3, h4, h5, h6') : null;
        const isEmptyBlock = targetBlock && targetBlock.id !== 'noteContent' && targetBlock.textContent.replace(/[\u200B\n\r]/g, '').trim() === '';

        if (isEmptyBlock) {
            targetBlock.parentNode.replaceChild(wrapper, targetBlock);
        } else {
            if (sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(wrapper);
            } else {
                document.getElementById('noteContent').appendChild(wrapper);
            }
        }

        const p = document.createElement('p'); 
        p.innerHTML = '<br>';
        wrapper.parentNode.insertBefore(p, wrapper.nextSibling);

        // Disegna l'header del widget
        WidgetManager.updateShellUI(widgetId, {
            icon: Icons.youtube,
            title: 'Video YouTube',
            optionsId: `adv-opt-btn-${widgetId}`,
            onOptionsClick: (e) => {
                e.stopPropagation();
                UI.Menu.closeAll(true);
                UI.Menu.buildContextMenu(`adv-opt-btn-${widgetId}`, [
                    { icon: Icons.globe, label: 'Apri nel Browser', onClick: () => window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank') },
                    { type: 'divider' },
                    { icon: Icons.trash, label: 'Rimuovi Video', danger: true, onClick: () => Editor.safeDeleteWidget(document.getElementById(widgetId)) }
                ]);
            },
            onDragStart: (e) => {
                AppState.draggedBlockId = widgetId;
                AppState.draggedBlockType = 'video';
                e.dataTransfer.effectAllowed = 'move';
            },
            onDragEnd: () => { AppState.draggedBlockId = null; AppState.draggedBlockType = null; }
        });

        Store.triggerAutoSave();
    },

    insertNodeAtSelection: (node) => {
        if (typeof Editor !== 'undefined') Editor.saveSnapshot();
        
        const sel = window.getSelection();
        if (Editor.savedRange) {
            sel.removeAllRanges();
            sel.addRange(Editor.savedRange);
        }

        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        range.deleteContents();
        
        range.insertNode(node);
        
        const zwsAfter = document.createTextNode('\u200B');
        node.parentNode.insertBefore(zwsAfter, node.nextSibling);
        
        const newRange = document.createRange();
        newRange.setStartAfter(zwsAfter); // Cursor goes strictly after the ZWS to continue typing normally
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        
        document.getElementById('noteContent')?.focus();
        
        Store.triggerAutoSave();
    },

    // -------------------------------------------------------------
    // VISUALIZZATORE FILE TESTUALI (E Auto-Loading per Path Relativi)
    // -------------------------------------------------------------
    openViewer: async (path, linkElement = null) => {
        const modal = document.getElementById('fileViewerModal');
        const pathInput = document.getElementById('viewerPath');
        const contentDiv = document.getElementById('viewerContent');
        const emptyState = document.getElementById('viewerEmptyState');
        const btnCopy = document.getElementById('btnCopyContent');
        const btnReplace = document.getElementById('btnReplaceContent');
        const findInput = document.getElementById('viewerFindInput');
        const replaceInput = document.getElementById('viewerReplaceInput');

        LinkManager.currentFileLinkElement = linkElement;

        let lastFindValue = "";
        if (linkElement && linkElement.hasAttribute('data-last-find')) {
            lastFindValue = linkElement.getAttribute('data-last-find');
        }
        findInput.value = lastFindValue;
        replaceInput.value = "";

        pathInput.value = path;
        contentDiv.innerText = "";
        emptyState.style.display = "block";

        btnCopy.disabled = true;
        btnCopy.style.opacity = "0.6";
        btnCopy.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.clipboard} 3. Copia nella clipboard</span>`;

        btnReplace.disabled = true;
        btnReplace.style.opacity = "0.6";

        modal.classList.remove('hidden');

        // WORKSPACE: Tenta l'auto-lettura del file se il path è Relativo
        const isAbsolutePath = /^([a-zA-Z]:[\\/]|\\\\|file:\/\/\/)/i.test(path);
        
        if (!isAbsolutePath && AppState.workspaceHandle) {
            try {
                emptyState.style.display = "block";
                emptyState.innerHTML = `<span style="color:var(--text-secondary);">${Icons.hourglass} Caricamento automatico dal Workspace...</span>`;
                
                // Normalizza path rimuovendo .\ iniziali o usando / al posto di \
                let normalizedPath = path.replace(/\\/g, '/').replace(/^\.\//, '');
                
                // Pulizia intelligente: se l'utente ha inserito il nome del workspace nel path (sbagliando), lo ignoriamo
                if (normalizedPath.startsWith(AppState.workspaceHandle.name + '/')) {
                    normalizedPath = normalizedPath.substring(AppState.workspaceHandle.name.length + 1);
                }

                const pathParts = normalizedPath.split('/').filter(p => p);
                
                let currentDirHandle = AppState.workspaceHandle;
                
                // Naviga l'albero delle directory tranne l'ultimo elemento (che è il file)
                for (let i = 0; i < pathParts.length - 1; i++) {
                    currentDirHandle = await currentDirHandle.getDirectoryHandle(pathParts[i]);
                }
                
                // Recupera il file finale
                const fileName = pathParts[pathParts.length - 1];
                const fileHandle = await currentDirHandle.getFileHandle(fileName);
                const file = await fileHandle.getFile();
                
                // Verifichiamo se è un file testuale ragionevole prima di bloccare la RAM
                if (file.size > 5 * 1024 * 1024) { 
                    throw new Error("Il file supera le dimensioni massime supportate per la lettura diretta (5MB).");
                }
                
                const text = await file.text();
                
                // Popoliamo il Viewer
                contentDiv.innerText = text;
                emptyState.style.display = "none";

                btnCopy.disabled = false;
                btnCopy.style.opacity = "1";

                btnReplace.disabled = false;
                btnReplace.style.opacity = "1";

            } catch (err) {
                console.warn("[LINK-MANAGER] Impossibile eseguire l'Auto-Load del file relativo dal Workspace:", err);
                emptyState.style.display = "block";
                emptyState.innerHTML = `
                    <div style="margin-bottom:10px; display:inline-flex; align-items:center; justify-content:center; color:var(--text-secondary); opacity:0.5;">${Icons.lock}</div>
                    <div style="color:var(--danger-color); font-weight:bold; margin-bottom:5px;">File non trovato o formato non supportato.</div>
                    <div style="font-size:0.85rem; color:var(--danger-color); max-width:80%;">
                        Motivo: ${err.message}<br><br>
                        Verifica che il file esista fisicamente nel path:<br>
                        <code>${path}</code><br>
                        (Controlla le doppie estensioni come .txt.txt o gli errori di battitura)
                    </div>
                    <br><br>Puoi comunque cliccare su <b>"Apri File..."</b> in alto per caricarlo manualmente.
                `;
            }
        } else {
            emptyState.style.display = "block";
            emptyState.innerHTML = `
                <div style="margin-bottom:10px; display:inline-flex; align-items:center; justify-content:center; color:var(--text-secondary); opacity:0.5;">${Icons.lock}</div>
                <div>Per motivi di sicurezza, i browser non possono aprire automaticamente<br>i percorsi assoluti del tuo PC.</div>
                <div style="margin-top:10px; font-size:0.85rem;">Clicca su <b>"Apri File..."</b> in alto per visualizzare il contenuto.</div>
            `;
        }
    },

    closeViewer: () => {
        document.getElementById('fileViewerModal').classList.add('hidden');
        LinkManager.currentFileLinkElement = null;
    },

    copyViewerPath: () => {
        const input = document.getElementById('viewerPath');
        input.select();
        document.execCommand('copy');
    },

    replaceContent: () => {
        const findInput = document.getElementById('viewerFindInput');
        const replaceInput = document.getElementById('viewerReplaceInput');
        const contentDiv = document.getElementById('viewerContent');
        const btn = document.getElementById('btnReplaceContent');

        const findStr = findInput.value;
        const replaceStr = replaceInput.value;

        if (!findStr || !contentDiv.innerText) return;

        const text = contentDiv.innerText;
        contentDiv.innerText = text.split(findStr).join(replaceStr);

        if (LinkManager.currentFileLinkElement) {
            LinkManager.currentFileLinkElement.setAttribute('data-last-find', findStr);
            if (typeof UI !== 'undefined' && UI.handleEditorInput) {
                UI.handleEditorInput();
            }
        }

        const origText = btn.innerHTML;
        btn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.checkCircle} Fatto!</span>`;
        btn.classList.add('btn-primary');
        setTimeout(() => {
            btn.innerHTML = origText;
            btn.classList.remove('btn-primary');
        }, 1500);
    },

    copyViewerContent: () => {
        const content = document.getElementById('viewerContent').innerText;
        if (!content) return;
        navigator.clipboard.writeText(content).then(() => {
            const btn = document.getElementById('btnCopyContent');
            const originalText = btn.innerHTML;
            btn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.checkCircle} Copiato!</span>`;
            btn.classList.add('btn-primary');
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.classList.remove('btn-primary');
            }, 1500);
        });
    },

    loadFileContent: async () => {
        try {
            const [fileHandle] = await window.showOpenFilePicker();
            const file = await fileHandle.getFile();
            const text = await file.text();
            const contentDiv = document.getElementById('viewerContent');
            const emptyState = document.getElementById('viewerEmptyState');
            const btnCopy = document.getElementById('btnCopyContent');
            const btnReplace = document.getElementById('btnReplaceContent');

            contentDiv.innerText = text;
            emptyState.style.display = "none";

            btnCopy.disabled = false;
            btnCopy.style.opacity = "1";

            btnReplace.disabled = false;
            btnReplace.style.opacity = "1";

        } catch (err) {
            console.log("Apertura annullata o errore:", err);
        }
    }
};