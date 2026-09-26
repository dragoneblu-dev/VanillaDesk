/**
 * TemplateManager.js
 * Modulo per la gestione, l'instanziazione e il Deep-Cloning dei Page Templates.
 * Tracciamento del dirty state volatile (_isDirty) all'applicazione di un template su nota esistente.
 */

const TemplateManager = {

    toggleEmptyOverlay: () => {
        const overlay = document.getElementById('emptyNoteOverlay');
        const editor = document.getElementById('noteContent');
        if (!overlay || !editor) return;

        const html = editor.innerHTML.trim();
        const isLiterallyEmpty = html === '' || html === '<p><br></p>' || html === '<br>';
        const hasWidgets = editor.querySelector('img, table, .adv-widget-shell, hr, ul, ol');

        if (AppState.isEditMode && isLiterallyEmpty && !hasWidgets) {
            const grid = document.getElementById('templateGrid');
            if (grid) {
                if (!AppState.templates || AppState.templates.length === 0) {
                    grid.innerHTML = `<div style="font-size:0.85rem; font-style:italic; opacity:0.6; grid-column: 1 / -1;">${I18n.t('templates.empty_overlay_hint')}</div>`;
                } else {
                    const sortedTemplates = [...AppState.templates].sort((a, b) => {
                        const dateA = new Date(a.lastUsed || a.updatedAt).getTime();
                        const dateB = new Date(b.lastUsed || b.updatedAt).getTime();
                        return dateB - dateA;
                    });
                    
                    const topTemplates = sortedTemplates.slice(0, 3);
                    
                    let gridHTML = '';
                    topTemplates.forEach(tpl => {
                        const safeTitle = (tpl.title || I18n.t('templates.default_new_name')).replace(/</g, '&lt;');
                        gridHTML += `
                            <button class="template-grid-btn" onclick="TemplateManager.previewTemplate('${tpl.id}')">
                                <span style="opacity:0.7; display:inline-flex;">${typeof Icons !== 'undefined' && Icons.file ? Icons.file : '📄'}</span>
                                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight:bold;">${safeTitle}</span>
                            </button>
                        `;
                    });
                    grid.innerHTML = gridHTML;
                }
            }
            overlay.style.display = 'block';
        } else {
            overlay.style.display = 'none';
        }
    },

    previewTemplate: (tplId) => {
        const tpl = AppState.templates.find(t => t.id === tplId);
        if (!tpl) return;

        const safeTitle = (tpl.title || I18n.t('templates.default_new_name')).replace(/</g, '&lt;');

        const bodyHTML = `
            <div style="display:flex; flex-direction:column; height: 100%;">
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; flex-shrink: 0;">
                    ${I18n.t('templates.preview_desc')}
                </div>
                <div class="editor-content adv-scroll-container" style="flex: 1; border: 1px solid var(--border-color); border-radius: 6px; padding: 20px; overflow-y: auto; background: var(--bg-color);">
                    <div style="pointer-events: none; opacity: 0.8; user-select: none; zoom: 0.5;">
                        ${tpl.content}
                    </div>
                </div>
            </div>
        `;

        const footerHTML = `
            <div style="display: flex; justify-content: flex-end; width: 100%; gap: 10px;">
                <button class="btn" onclick="UI.closeDrawer()">${I18n.t('common.cancel')}</button>
                <button class="btn btn-primary" onclick="TemplateManager.applyTemplate('${tpl.id}')">
                    <span style="display:inline-flex; align-items:center; gap:5px;">${Icons.checkCircle} ${I18n.t('templates.use_template_btn')}</span>
                </button>
            </div>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.search} ${I18n.t('templates.preview_title', { title: safeTitle })}</span>`, bodyHTML, footerHTML);
    },

    openManager: () => {
        UI.closeDrawer();

        if (!AppState.templates) AppState.templates = [];

        let bodyHTML = ``;

        if (AppState.templates.length === 0) {
            bodyHTML += `<div style="text-align:center; padding:30px; color:var(--text-secondary); font-style:italic; background:rgba(0,0,0,0.02); border-radius:6px; border:1px dashed var(--border-color);">${I18n.t('templates.empty_workspace')}</div>`;
        } else {
            const sortedTemplates = [...AppState.templates].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            
            bodyHTML += `<div style="display:flex; flex-direction:column; gap:10px; overflow-y:auto; max-height:70vh; padding-right:5px;" class="adv-scroll-container">`;
            
            sortedTemplates.forEach((tpl) => {
                const safeTitle = (tpl.title || I18n.t('templates.default_new_name')).replace(/</g, '&lt;');
                const dateStr = new Date(tpl.updatedAt).toLocaleDateString('it-IT') + ' ' + new Date(tpl.updatedAt).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
                const widgetCount = Object.keys(tpl.widgets || {}).length;
                
                let countStr = widgetCount === 0 
                    ? I18n.t('templates.contains_text_only') 
                    : (widgetCount === 1 ? I18n.t('templates.contains_single_widget') : I18n.t('templates.contains_multi_widgets', { count: widgetCount }));

                bodyHTML += `
                    <div style="background:var(--bg-color); border:1px solid var(--border-color); padding:15px; border-radius:6px; display:flex; flex-direction:column; gap:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="font-weight:bold; color:var(--accent-color); font-size:1.1rem;">${safeTitle}</div>
                            <div style="display:flex; gap:5px;">
                                <button class="btn" style="padding:4px 8px; font-size:0.8rem; background:rgba(37, 99, 235, 0.1); color:var(--accent-color); border-color:var(--accent-color);" onclick="TemplateManager.previewTemplate('${tpl.id}')" title="Anteprima">
                                    <span style="margin-right:4px; display:inline-flex; align-items:center;">${Icons.search}</span> ${I18n.t('templates.preview_title', { title: '' }).replace(': ', '')}
                                </button>
                                <button class="adv-icon-btn danger" style="padding:4px 8px; background:rgba(239,68,68,0.1);" onclick="TemplateManager.deleteTemplate('${tpl.id}')" title="${I18n.t('common.delete')}">${Icons.trash}</button>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-secondary);">
                            <span>Contiene ${countStr}</span>
                            <span>${I18n.t('templates.updated_at', { date: dateStr })}</span>
                        </div>
                    </div>
                `;
            });
            bodyHTML += `</div>`;
        }

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.file} ${I18n.t('templates.drawer_title')}</span>`, bodyHTML, null);
    },

    saveNoteAsTemplate: (noteId) => {
        const note = Store.getNote(noteId);
        if (!note || !note.content) return;

        const defaultName = note.title || I18n.t('templates.default_new_name');
        const tplTitle = prompt(I18n.t('templates.prompt_save_name'), defaultName);
        if (!tplTitle) return;

        const tpl = {
            id: 'tpl_' + Store.generateId(),
            title: tplTitle.trim(),
            content: note.content,
            widgets: {},
            updatedAt: new Date().toISOString(),
            lastUsed: new Date().toISOString()
        };

        const parser = new DOMParser();
        const doc = parser.parseFromString(note.content, 'text/html');
        
        doc.querySelectorAll('.adv-widget-shell').forEach(w => {
            if (w.id && AppState.databases && AppState.databases[w.id]) {
                tpl.widgets[w.id] = JSON.parse(JSON.stringify(AppState.databases[w.id]));
            }
        });

        if (!AppState.templates) AppState.templates = [];
        AppState.templates.push(tpl);

        Store.triggerAutoSave();
        
        if (typeof UI !== 'undefined') UI.renderTree();
        if (typeof UI.showToast !== 'undefined') UI.showToast(I18n.t('templates.toast_saved', { title: tpl.title }), "success");
    },

    saveCurrentNoteAsTemplate: () => {
        if (!AppState.currentNoteId) {
            alert(I18n.t('templates.alert_no_current_note'));
            return;
        }
        if (typeof Editor !== 'undefined') Editor.sanitizeContent();
        TemplateManager.saveNoteAsTemplate(AppState.currentNoteId);
    },

    deleteTemplate: (tplId) => {
        if (!confirm(I18n.t('templates.confirm_delete'))) return;
        
        AppState.templates = AppState.templates.filter(t => t.id !== tplId);
        Store.triggerAutoSave();
        
        UI.closeDrawer();
        if (typeof UI !== 'undefined') UI.renderTree();
    },

    applyTemplate: (tplId) => {
        const tpl = AppState.templates.find(t => t.id === tplId);
        if (!tpl) return;

        if (!AppState.currentNoteId) {
            alert(I18n.t('templates.alert_no_open_note'));
            return;
        }

        const note = Store.getNote(AppState.currentNoteId);
        const editorEl = document.getElementById('noteContent');
        if (!editorEl) return;

        const text = editorEl.innerText.replace(/\u200B/g, '').trim();
        const hasWidgets = editorEl.querySelector('img, table, .adv-widget-shell, hr');
        if (text !== '' || hasWidgets) {
            if (!confirm(I18n.t('templates.confirm_overwrite'))) {
                return;
            }
        }

        UI.closeDrawer();
        
        let rawHtml = tpl.content;
        const idMap = {};
        const titleMap = {};

        Object.keys(tpl.widgets || {}).forEach(oldId => {
            let typePrefix = 'adv_tbl_';
            if (oldId.includes('adv_journal_')) typePrefix = 'adv_journal_';
            else if (oldId.includes('adv_code_')) typePrefix = 'adv_code_';
            else if (oldId.includes('adv_btnbar_')) typePrefix = 'adv_btnbar_';
            else if (oldId.includes('cit_')) typePrefix = 'cit_';
            else if (oldId.includes('adv_cols_')) typePrefix = 'adv_cols_';

            idMap[oldId] = typePrefix + Store.generateId();
            
            const state = tpl.widgets[oldId];
            if (state && state.title && typePrefix === 'adv_tbl_' && !state.isPivot && !state.isLinkedView) {
                let baseTitle = state.title;
                let counter = 1;
                let finalTitle = `${baseTitle} (${counter})`;
                const existingNames = Object.values(AppState.databases).map(db => db.title);
                
                while (existingNames.includes(finalTitle) || Object.values(titleMap).includes(finalTitle)) {
                    counter++;
                    finalTitle = `${baseTitle} (${counter})`;
                }
                titleMap[baseTitle] = finalTitle;
            }
        });

        Object.keys(idMap).forEach(oldId => {
            const regex = new RegExp(oldId, 'g');
            rawHtml = rawHtml.replace(regex, idMap[oldId]);
        });

        Object.keys(tpl.widgets || {}).forEach(oldId => {
            const newId = idMap[oldId];
            if (!newId) return;

            let stateStr = JSON.stringify(tpl.widgets[oldId]);
            
            Object.keys(idMap).forEach(oId => {
                const regex = new RegExp(oId, 'g');
                stateStr = stateStr.replace(regex, idMap[oId]);
            });

            Object.keys(titleMap).forEach(oldTitle => {
                const newTitle = titleMap[oldTitle];
                const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                
                const titlePropRegex = new RegExp(`"title":"${escapeRegExp(oldTitle)}"`, 'g');
                stateStr = stateStr.replace(titlePropRegex, `"title":"${newTitle}"`);
                
                const formulaRegex1 = new RegExp(`tabella\\[\\\\?"${escapeRegExp(oldTitle)}\\\\?"\\]`, 'g');
                const formulaRegex2 = new RegExp(`tabella\\[\\\\?'${escapeRegExp(oldTitle)}\\\\?'\\]`, 'g');
                
                stateStr = stateStr.replace(formulaRegex1, `tabella[\\"${newTitle}\\"]`);
                stateStr = stateStr.replace(formulaRegex2, `tabella[\\'${newTitle}\\']`);
            });

            if (!AppState.databases) AppState.databases = {};
            AppState.databases[newId] = JSON.parse(stateStr);
        });

        if (text === '' && !hasWidgets) {
            editorEl.innerHTML = rawHtml;
        } else {
            editorEl.innerHTML += '<p><br></p>' + rawHtml;
        }

        tpl.lastUsed = new Date().toISOString();
        TemplateManager.toggleEmptyOverlay();

        if (typeof WidgetManager !== 'undefined') WidgetManager.mountAll(editorEl);
        
        if (typeof Editor !== 'undefined' && typeof Editor.getCleanHTML === 'function') {
            note.content = Editor.getCleanHTML();
        } else if (typeof Editor !== 'undefined' && typeof Editor.minifyHTMLForStorage === 'function') {
            note.content = Editor.minifyHTMLForStorage(editorEl.innerHTML);
        } else {
            note.content = editorEl.innerHTML;
        }
        note.updatedAt = new Date().toISOString();
        note._isDirty = true;

        Store.triggerAutoSave();
        if (typeof UI.showToast !== 'undefined') UI.showToast(I18n.t('templates.toast_applied'), "success");
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const editorEl = document.getElementById('noteContent');
    if (editorEl) {
        editorEl.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') {
                const overlay = document.getElementById('emptyNoteOverlay');
                if (overlay && overlay.style.display === 'block') {
                    overlay.style.display = 'none';
                }
            }
        });
    }
});