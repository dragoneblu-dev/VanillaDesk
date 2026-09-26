/**
 * editor-bookmarks.js
 * Sottomodulo di Editor.
 * Inserimento e manipolazione dei segnalibri nel testo,
 * cronjob globale in background per la notifica dei timer scaduti,
 * gestione resiliente dello Snooze e aggiornamento dinamico della sidebar.
 * Gestione note e commenti sui segnalibri con apertura Drawer dedicato,
 * avvisi di conferma su sovrascrizione o eliminazione e posizionamento esatto del cursore.
 */

Object.assign(Editor, {
    activeBookmark: null,
    _bookmarkInterval: null,
    _lastTreeMinute: null,

    getBookmarkComment: (marker) => {
        if (!marker) return '';
        const dataSpan = marker.querySelector('.bookmark-comment-data');
        if (dataSpan) return dataSpan.innerHTML.trim();
        return marker.getAttribute('data-comment') || '';
    },

    hasBookmarkComment: (marker) => {
        const raw = Editor.getBookmarkComment(marker);
        if (!raw) return false;
        const temp = document.createElement('div');
        temp.innerHTML = raw;
        return temp.textContent.replace(/[\u200B\n\r]/g, '').trim().length > 0;
    },

    insertBookmark: () => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;

        // Controllo preventivo: se esiste già un segnalibro con commenti, chiedi conferma prima di sovrascriverlo
        const existingBookmarks = editor.querySelectorAll('.adv-bookmark-marker');
        let hasCommentedExisting = false;
        existingBookmarks.forEach(b => {
            if (Editor.hasBookmarkComment(b)) hasCommentedExisting = true;
        });

        if (hasCommentedExisting) {
            if (!confirm("Il segnalibro presente in questa pagina contiene un appunto o commento. Vuoi procedere e sostituirlo? La nota andrà persa.")) {
                return;
            }
        }

        // Ripristina la selezione prima di scattare lo snapshot per non invalidare il range
        Editor.restoreSelection();
        Editor.saveSnapshot();

        existingBookmarks.forEach(el => el.remove());

        const marker = document.createElement('span');
        marker.className = 'adv-bookmark-marker adv-inline-shell';
        marker.setAttribute('contenteditable', 'false');
        marker.id = 'bkm_' + Store.generateId();

        const now = new Date();
        const dateStr = now.toLocaleDateString('it-IT') + ' ' + now.toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'});

        marker.innerHTML = `<span class="bookmark-icon">${Icons.bookmark}</span><span class="bookmark-comment-data" style="display:none;"></span>`;
        marker.setAttribute('data-date', dateStr);

        const sel = window.getSelection();

        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(marker);
            
            const spaceNode = document.createTextNode('\u200B');
            marker.parentNode.insertBefore(spaceNode, marker.nextSibling);
            
            const newRange = document.createRange();
            newRange.setStartAfter(spaceNode);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
        } else {
            editor.appendChild(marker);
        }

        Store.triggerAutoSave();
        if (typeof UI !== 'undefined' && UI.renderTree) UI.renderTree(); 

        Editor.initBookmarkCron();
    },

    addBookmarkTimer: (id) => {
        const marker = document.getElementById(id);
        if (!marker) return;
        
        let currentExpire = parseInt(marker.getAttribute('data-timer-expire')) || 0;
        const now = Date.now();
        
        // Aggiunge 15 minuti (900.000 ms)
        if (currentExpire > now) {
            currentExpire += 900000;
        } else {
            currentExpire = now + 900000;
        }
        
        marker.setAttribute('data-timer-expire', currentExpire.toString());

        // Sincronizza immediatamente il content della nota attiva per allineare l'albero
        if (AppState.currentNoteId) {
            const curNote = Store.getNote(AppState.currentNoteId);
            const editorEl = document.getElementById('noteContent');
            if (curNote && editorEl) {
                curNote.content = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                curNote.updatedAt = new Date().toISOString();
            }
        }

        Store.triggerAutoSave();
        Editor.updateBookmarkMenuDisplay(marker);
        if (typeof UI !== 'undefined' && UI.renderTree) UI.renderTree();
        Editor.initBookmarkCron();
    },

    clearBookmarkTimer: (id) => {
        const marker = document.getElementById(id);
        if (!marker) return;
        marker.removeAttribute('data-timer-expire');

        // Sincronizza immediatamente la rimozione dell'attributo nel content della nota attiva
        if (AppState.currentNoteId) {
            const curNote = Store.getNote(AppState.currentNoteId);
            const editorEl = document.getElementById('noteContent');
            if (curNote && editorEl) {
                curNote.content = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                curNote.updatedAt = new Date().toISOString();
            }
        }

        Store.triggerAutoSave();
        Editor.updateBookmarkMenuDisplay(marker);
        if (typeof UI !== 'undefined' && UI.renderTree) UI.renderTree();
    },

    snoozeBookmark: (noteId, bookmarkId, minutes) => {
        if (!noteId) return;
        const newExpire = Date.now() + (minutes * 60 * 1000);
        let updated = false;

        // 1. Gestione nota attiva a video
        if (AppState.currentNoteId === noteId) {
            const marker = (bookmarkId ? document.getElementById(bookmarkId) : null) || 
                           document.querySelector('#noteContent .adv-bookmark-marker');
            
            if (marker) {
                if (!marker.id) marker.id = bookmarkId || ('bkm_' + Store.generateId());
                marker.setAttribute('data-timer-expire', newExpire.toString());
                
                if (Editor.activeBookmark === marker) {
                    Editor.updateBookmarkMenuDisplay(marker);
                }
                
                const editorEl = document.getElementById('noteContent');
                if (editorEl) {
                    const currentNote = Store.getNote(noteId);
                    if (currentNote) {
                        currentNote.content = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                        currentNote.updatedAt = new Date().toISOString();
                    }
                }
                updated = true;
            }
        }

        // 2. Gestione nota in background
        if (!updated) {
            const note = Store.getNote(noteId);
            if (note && note.content) {
                let regex = bookmarkId ? new RegExp(`(<span[^>]*id=["']${bookmarkId}["'][^>]*)(>)`, 'i') : null;
                
                if (!regex || !regex.test(note.content)) {
                    regex = /(<span[^>]*class=["'][^"']*adv-bookmark-marker[^"']*["'][^>]*)(>)/i;
                }

                if (regex.test(note.content)) {
                    let tagContent = note.content.match(regex)[1];
                    tagContent = tagContent.replace(/\s*data-timer-expire=["']\d+["']/gi, '');
                    if (!tagContent.includes('id=')) {
                        tagContent += ` id="${bookmarkId || ('bkm_' + Store.generateId())}"`;
                    }
                    tagContent += ` data-timer-expire="${newExpire}"`;
                    note.content = note.content.replace(regex, `${tagContent}>`);
                    note.updatedAt = new Date().toISOString();
                    updated = true;
                }
            }
        }

        if (updated) {
            Store.triggerAutoSave();
            if (typeof UI !== 'undefined') {
                if (UI.renderTree) UI.renderTree();
                if (UI.showToast) UI.showToast(`Promemoria posticipato di ${minutes} minuti.`, "info");
            }
        }
    },

    updateBookmarkMenuDisplay: (marker) => {
        const popover = document.getElementById('adv-bookmark-popover');
        if (!popover || Editor.activeBookmark !== marker) return;
        
        const displaySpan = document.getElementById('bkm-timer-display');
        const clearBtn = document.getElementById('bkm-timer-clear');
        
        const expire = parseInt(marker.getAttribute('data-timer-expire')) || 0;
        const now = Date.now();
        
        if (expire > now) {
            const diffSec = Math.round((expire - now) / 1000);
            const mins = Math.floor(diffSec / 60);
            const secs = diffSec % 60;
            if (displaySpan) displaySpan.innerHTML = `&nbsp;[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}]`;
            if (clearBtn) clearBtn.style.display = 'inline-flex';
        } else {
            if (displaySpan) displaySpan.innerHTML = '';
            if (clearBtn) clearBtn.style.display = 'none';
        }
    },

    showBookmarkMenu: (marker) => {
        Editor.hideBookmarkMenu();
        Editor.activeBookmark = marker;
        const dateStr = marker.getAttribute('data-date') || 'Data sconosciuta';
        
        if (!marker.id) {
            marker.id = 'bkm_' + Store.generateId();
            Store.triggerAutoSave();
        }

        const hasComment = Editor.hasBookmarkComment(marker);
        const commentColor = hasComment ? 'color:var(--accent-color);' : 'color:var(--text-secondary);';
        const commentTitle = hasComment ? 'Modifica appunto del segnalibro' : 'Aggiungi appunto al segnalibro';

        const popover = document.createElement('div');
        popover.id = 'adv-bookmark-popover';
        popover.className = 'adv-floating-popover';
        
        popover.innerHTML = `
            <button class="adv-icon-btn" style="padding: 2px 6px; margin: 0; color:var(--text-primary); font-size:0.75rem; font-weight:bold;" onclick="Editor.addBookmarkTimer('${marker.id}')" title="Aggiungi 15 Minuti">
                <span style="display:inline-flex; align-items:center; gap:4px; color:var(--accent-color);">${Icons.time}</span>
                <span id="bkm-timer-display" style="font-family:monospace;"></span>
            </button>
            <button id="bkm-timer-clear" class="adv-icon-btn danger" style="padding: 2px 4px; margin: 0; display:none;" onclick="Editor.clearBookmarkTimer('${marker.id}')" title="Azzera Timer">${Icons.close}</button>
            
            <button id="bkm-comment-btn" class="adv-icon-btn" style="padding: 2px 6px; margin: 0; ${commentColor} font-size:0.75rem;" onclick="Editor.openBookmarkCommentDrawer('${marker.id}')" title="${commentTitle}">
                <span style="display:inline-flex; align-items:center; gap:4px;">${Icons.noteInline}</span>
            </button>

            <div style="width:1px; height:16px; background:var(--border-color); margin: 0 4px;"></div>
            <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: bold; margin: 0 6px; white-space: nowrap;">Piazzato il: ${dateStr}</span>
            <div style="width:1px; height:16px; background:var(--border-color); margin: 0 2px;"></div>
            <button class="adv-icon-btn danger" style="padding: 2px 4px; margin: 0;" onclick="Editor.deleteBookmark()" title="Rimuovi segnalibro">${Icons.trash}</button>
        `;
        
        document.body.appendChild(popover);
        Editor.updateBookmarkMenuDisplay(marker);

        const rect = marker.getBoundingClientRect();
        let top = rect.bottom + window.scrollY + 5;
        let left = rect.left + window.scrollX - (popover.offsetWidth / 2) + (rect.width / 2);

        if (left < 10) left = 10;
        if (left + popover.offsetWidth > window.innerWidth - 10) left = window.innerWidth - popover.offsetWidth - 10;
        if (top + popover.offsetHeight > window.innerHeight + window.scrollY) top = rect.top + window.scrollY - popover.offsetHeight - 5;

        popover.style.top = top + 'px';
        popover.style.left = left + 'px';

        popover.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
        popover.addEventListener('click', e => e.stopPropagation());
    },

    openBookmarkCommentDrawer: (markerId) => {
        if (!AppState.isEditMode) return;

        const marker = document.getElementById(markerId);
        if (!marker) return;

        Editor.hideBookmarkMenu();
        Editor.activeBookmark = marker;

        const currentHTML = Editor.getBookmarkComment(marker);

        const bodyHTML = `
            <div style="background: rgba(0,0,0,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display:flex; flex-direction:column;">
                <div class="toolbar" style="margin-bottom: 10px; padding: 0; border: none; background: transparent;">
                    <button class="adv-icon-btn" onclick="document.execCommand('bold', false, null)" title="Grassetto"><b>B</b></button>
                    <button class="adv-icon-btn" onclick="document.execCommand('italic', false, null)" title="Corsivo"><i>I</i></button>
                    <button class="adv-icon-btn" onclick="document.execCommand('underline', false, null)" title="Sottolineato"><u>U</u></button>
                    <div style="width:1px; height:15px; background:var(--border-color); margin:0 5px;"></div>
                    <button class="adv-icon-btn" onclick="document.execCommand('insertUnorderedList', false, null)" title="Lista Puntata"><b>•</b></button>
                </div>
                <div id="bookmarkCommentInput" class="editor-content" contenteditable="true" style="outline: none; flex:1; background:var(--bg-color); border:1px solid var(--border-color); padding:10px; border-radius:4px; overflow-y:auto; min-height:150px;">${currentHTML}</div>
            </div>
            <p style="font-size:0.75rem; color:var(--text-secondary); margin-top:10px; margin-bottom:0;">L'appunto resterà salvato all'interno del segnalibro. Apparirà come suggerimento al passaggio del mouse e nell'indice dei segnalibri.</p>
        `;

        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">Annulla</button>
            <button class="btn btn-primary" onclick="Editor.saveBookmarkComment('${markerId}')">Salva Appunto</button>
        `;

        UI.openDrawer('💬 Appunto Segnalibro', bodyHTML, footerHTML);

        setTimeout(() => {
            const input = document.getElementById('bookmarkCommentInput');
            if (input) input.focus();
        }, 50);
    },

    saveBookmarkComment: (markerId) => {
        const input = document.getElementById('bookmarkCommentInput');
        const marker = document.getElementById(markerId);
        if (!input || !marker) return;

        let newHTML = input.innerHTML;

        newHTML = newHTML.replace(/<div[^>]*>/gi, '<br>')
                         .replace(/<\/div>/gi, '')
                         .replace(/<p[^>]*>/gi, '<br>')
                         .replace(/<\/p>/gi, '')
                         .replace(/<li[^>]*>/gi, '<br>• ')
                         .replace(/<\/li>/gi, '')
                         .replace(/<\/?(ul|ol|h[1-6]|blockquote)[^>]*>/gi, '');

        newHTML = newHTML.replace(/^(<br\s*\/?>)+/i, '');

        Editor.saveSnapshot();

        let dataSpan = marker.querySelector('.bookmark-comment-data');
        if (!dataSpan) {
            dataSpan = document.createElement('span');
            dataSpan.className = 'bookmark-comment-data';
            dataSpan.style.display = 'none';
            marker.appendChild(dataSpan);
        }
        dataSpan.innerHTML = newHTML;

        // Imposta o rimuove il tooltip dinamico per l'hover testuale
        const temp = document.createElement('div');
        temp.innerHTML = newHTML;
        const plain = temp.textContent.replace(/[\u200B\n\r]/g, ' ').trim();
        if (plain) {
            marker.setAttribute('data-tooltip', `<b>Segnalibro:</b> ${UI.escapeHTML(plain)}`);
        } else {
            marker.removeAttribute('data-tooltip');
        }

        // Sincronizza nel content della nota corrente
        if (AppState.currentNoteId) {
            const curNote = Store.getNote(AppState.currentNoteId);
            const editorEl = document.getElementById('noteContent');
            if (curNote && editorEl) {
                curNote.content = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                curNote.updatedAt = new Date().toISOString();
            }
        }

        Store.triggerAutoSave();
        if (typeof UI !== 'undefined' && UI.renderTree) UI.renderTree();
        UI.closeDrawer();
    },

    hideBookmarkMenu: () => {
        const existing = document.getElementById('adv-bookmark-popover');
        if (existing) existing.remove();
        Editor.activeBookmark = null;
    },

    deleteBookmark: () => {
        if (Editor.activeBookmark) {
            if (Editor.hasBookmarkComment(Editor.activeBookmark)) {
                if (!confirm("Questo segnalibro contiene un appunto o commento. Sei sicuro di volerlo eliminare?")) {
                    return;
                }
            }
            Editor.saveSnapshot();
            Editor.activeBookmark.remove();
            Store.triggerAutoSave();
            if (typeof UI !== 'undefined' && UI.renderTree) UI.renderTree();
        }
        Editor.hideBookmarkMenu();
    },

    initBookmarkCron: () => {
        if (!Editor._bookmarkInterval) {
            Editor._bookmarkInterval = setInterval(() => {
                const now = Date.now();
                let needsSave = false;

                // 1. Controllo nel DOM Visibile (Nota Corrente)
                const visibleMarkers = document.querySelectorAll('.adv-bookmark-marker[data-timer-expire]');
                visibleMarkers.forEach(m => {
                    const exp = parseInt(m.getAttribute('data-timer-expire'));
                    if (now >= exp) {
                        const bkmId = m.id || ('bkm_' + Store.generateId());
                        m.id = bkmId;

                        m.removeAttribute('data-timer-expire');

                        // Sincronizza subito il content della nota corrente prima dell'attivazione dell'allarme
                        if (AppState.currentNoteId) {
                            const curNote = Store.getNote(AppState.currentNoteId);
                            const editorEl = document.getElementById('noteContent');
                            if (curNote && editorEl) {
                                curNote.content = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                                curNote.updatedAt = new Date().toISOString();
                            }
                        }

                        needsSave = true;

                        if (typeof UI !== 'undefined' && UI.Alarm) {
                            UI.Alarm.trigger("⏱️ Timer Scaduto! (Nota attuale)", {
                                noteId: AppState.currentNoteId,
                                bookmarkId: bkmId
                            });
                        }
                        
                        if (Editor.activeBookmark === m) {
                            Editor.updateBookmarkMenuDisplay(m);
                        }
                    } else if (Editor.activeBookmark === m) {
                        Editor.updateBookmarkMenuDisplay(m);
                    }
                });

                // 2. Controllo Globale in Background (su AppState.notes)
                if (AppState.notes) {
                    AppState.notes.forEach(note => {
                        if (!note.content) return;
                        
                        const regex = /<span[^>]*class=["'][^"']*adv-bookmark-marker[^"']*["'][^>]*data-timer-expire=["'](\d+)["'][^>]*>/gi;
                        let match;
                        let noteModified = false;
                        
                        while ((match = regex.exec(note.content)) !== null) {
                            const expTime = parseInt(match[1]);
                            if (now >= expTime) {
                                const originalTag = match[0];
                                
                                let tagWithId = originalTag;
                                let idMatch = originalTag.match(/id=["'](bkm_[^"']+)["']/i);
                                let bkmId = idMatch ? idMatch[1] : ('bkm_' + Store.generateId());
                                if (!idMatch) {
                                    tagWithId = originalTag.replace('<span', `<span id="${bkmId}"`);
                                }

                                const cleanedTag = tagWithId.replace(/\s*data-timer-expire=["']\d+["']/, '');
                                note.content = note.content.replace(originalTag, cleanedTag);
                                noteModified = true;
                                needsSave = true;

                                if (typeof UI !== 'undefined' && UI.Alarm && note.id !== AppState.currentNoteId) {
                                    const safeTitle = (note.title || 'Senza Titolo').replace(/'/g, "\\'");
                                    
                                    const actionHtml = `
                                        <div style="margin-top: 5px;">
                                            <button class="btn" style="padding: 4px 8px; font-size: 0.8rem; border-color: var(--border-color); color: var(--text-primary);" onclick="UI.Alarm.stop(this.closest('.toast-msg').id); UI.selectNote('${note.id}')">
                                                <span style="display:inline-flex; align-items:center; gap:5px;">${Icons.arrowRightUp} Apri Nota: ${safeTitle}</span>
                                            </button>
                                        </div>
                                    `;
                                    UI.Alarm.trigger(`⏱️ Timer Scaduto in background!<br>${actionHtml}`, {
                                        noteId: note.id,
                                        bookmarkId: bkmId
                                    });
                                }
                            }
                        }
                        if (noteModified) note.updatedAt = new Date().toISOString();
                    });
                }

                // 3. Aggiornamento periodico della vista Segnalibri nella Sidebar (ogni 60 secondi)
                const currentMinute = Math.floor(now / 60000);
                if (Editor._lastTreeMinute !== currentMinute) {
                    Editor._lastTreeMinute = currentMinute;
                    if (AppState.showBookmarksInTree && typeof UI !== 'undefined' && UI.renderTree) {
                        UI.renderTree();
                    }
                }

                if (needsSave && typeof Store !== 'undefined') {
                    Store.triggerAutoSave();
                    if (typeof UI !== 'undefined' && UI.renderTree) UI.renderTree();
                }

            }, 1000);
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(Editor.initBookmarkCron, 1000);
});