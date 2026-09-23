/**
 * ButtonManager-core.js
 * Nucleo del modulo Barre di Pulsanti Programmabili.
 * Esecuzione macro con il motore centralizzato 'LogicEngine.executeMacroBlocks'
 * uniformando il comportamento tra Widget Macro e Colonne Macro.
 * Gestione corretta della persistenza su workspace tramite Store.triggerAutoSave.
 */

const ButtonManager = {

    init: () => {
        if (typeof WidgetManager !== 'undefined') {
            WidgetManager.register('buttonbar', ButtonManager);
        }
    },

    mountAll: (container = document) => {
        const bars = container.querySelectorAll('.adv-action-button-wrapper, [data-widget-type="buttonbar"]');
        const seenIds = new Set();

        bars.forEach(wrapper => {
            if (wrapper.closest('.block-citation') && container.id === 'noteContent') return;
            
            wrapper.setAttribute('contenteditable', 'false');

            let currentId = wrapper.id;

            if (!currentId || seenIds.has(currentId)) {
                currentId = 'adv_btnbar_' + Store.generateId();
                wrapper.id = currentId;
            }
            seenIds.add(currentId);

            const trueId = currentId.split('_cited_')[0];
            if (!AppState.databases) AppState.databases = {};
            
            if (wrapper.hasAttribute('data-state')) {
                try {
                    const s = JSON.parse(wrapper.getAttribute('data-state').replace(/&quot;/g, '"'));
                    AppState.databases[trueId] = s;
                    wrapper.removeAttribute('data-state');
                } catch(e) {}
            }

            // Pulisce l'HTML residuo per forzare un render pulito
            const bodyContainer = wrapper.querySelector('.widget-body') || wrapper;
            bodyContainer.innerHTML = '';

            ButtonManager.render(currentId);
        });
    },

    getState: (id) => {
        if (!AppState.databases) AppState.databases = {};
        const trueId = id.split('_cited_')[0];
        return AppState.databases[trueId] || null;
    },

    setState: (id, state) => {
        if (!AppState.databases) AppState.databases = {};
        const trueId = id.split('_cited_')[0];
        AppState.databases[trueId] = state;
        Store.triggerAutoSave();
    },

    _migrateButtonState: (btnState) => {
        if (btnState && !btnState.actionBlocks) {
            btnState.actionBlocks = [];
            if (btnState.targetDbId) {
                let legacyActions = btnState.actions || [];
                if (btnState.actionColId && legacyActions.length === 0) {
                    legacyActions = [{ colId: btnState.actionColId, type: btnState.actionValueType || 'set_fixed', value: btnState.actionValue || '' }];
                }
                
                let legacyFilters = [];
                if (btnState.filterColId) {
                    legacyFilters.push({
                        colId: btnState.filterColId,
                        operator: btnState.filterOperator || '=',
                        value: btnState.filterValue || ''
                    });
                }

                btnState.actionBlocks.push({
                    id: 'actblk_' + Store.generateId(),
                    targetDbId: btnState.targetDbId,
                    actionType: btnState.actionType || 'update',
                    filters: legacyFilters,
                    actions: legacyActions
                });
            }
            delete btnState.targetDbId;
            delete btnState.actionType;
            delete btnState.filterColId;
            delete btnState.filterOperator;
            delete btnState.filterValue;
            delete btnState.actions;
            delete btnState.actionColId;
            delete btnState.actionValueType;
            delete btnState.actionValue;
        }

        if (btnState.actionBlocks) {
            btnState.actionBlocks.forEach(blk => {
                if (!blk.filters) blk.filters = [];
            });
        }

        return btnState;
    },

    destroy: (id) => {
        const wrapper = document.getElementById(id);
        if (wrapper) wrapper.remove();
        const trueId = id.split('_cited_')[0];
        if (AppState.databases && AppState.databases[trueId]) {
            delete AppState.databases[trueId];
        }
        Store.triggerAutoSave();
    },

    insert: () => {
        if (!AppState.isEditMode) return;
        Editor.restoreSelection();
        UI.Menu.closeAll(true);

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        let node = selection.getRangeAt(0).commonAncestorContainer;
        if (node.nodeType === 3) node = node.parentNode;

        if (node && node.closest('.widget-type-columns')) {
            alert("Non è permesso inserire Widget Complessi all'interno delle Colonne per prevenire la corruzione del layout.\nSposta il cursore fuori prima di inserire.");
            return;
        }

        Editor.saveSnapshot();

        const barId = 'adv_btnbar_' + Store.generateId();
        
        const state = {
            buttons: [
                {
                    id: 'btn_' + Store.generateId(),
                    label: 'Nuovo Pulsante',
                    icon: Icons.lightning,
                    color: 'var(--accent-color)',
                    requireConfirm: false,
                    actionBlocks: [] 
                }
            ]
        };

        ButtonManager.setState(barId, state);

        let wrapper;
        if (typeof WidgetManager !== 'undefined') {
            wrapper = WidgetManager.createShell('buttonbar', barId);
            wrapper.classList.add('adv-action-button-wrapper');
        } else {
            wrapper = document.createElement('div');
            wrapper.className = 'adv-action-button-wrapper';
            wrapper.id = barId;
            wrapper.setAttribute('data-widget-type', 'buttonbar');
            wrapper.contentEditable = "false";
        }

        let targetBlock = node ? node.closest('p, div, li, h1, h2, h3, h4, h5, h6') : null;
        const isEmptyBlock = targetBlock && targetBlock.id !== 'noteContent' && targetBlock.textContent.replace(/[\u200B\n\r]/g, '').trim() === '';

        if (isEmptyBlock) {
            targetBlock.parentNode.replaceChild(wrapper, targetBlock);
        } else {
            if (selection.rangeCount) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(wrapper);
            } else {
                document.getElementById('noteContent').appendChild(wrapper);
            }
        }

        const p = document.createElement('p'); 
        p.innerHTML = '<br>';
        wrapper.parentNode.insertBefore(p, wrapper.nextSibling);

        ButtonManager.render(barId);
        ButtonManager.openConfig(null, barId, state.buttons[0].id);
    },

    addButtonToBar: (barId) => {
        let state = ButtonManager.getState(barId);
        if(!state) return;
        if(!state.buttons) state.buttons = [];

        state.buttons.push({
            id: 'btn_' + Store.generateId(),
            label: 'Nuovo Pulsante',
            icon: Icons.lightning,
            color: 'var(--accent-color)',
            requireConfirm: false,
            actionBlocks: []
        });

        ButtonManager.setState(barId, state);
        ButtonManager.render(barId);
    },

    deleteButtonFromBar: (barId, btnId) => {
        if(!confirm("Eliminare questo pulsante?")) return;
        let state = ButtonManager.getState(barId);
        if(!state) return;

        state.buttons = state.buttons.filter(b => b.id !== btnId);

        if(state.buttons.length === 0) {
            ButtonManager.destroy(barId);
            UI.closeDrawer();
        } else {
            ButtonManager.setState(barId, state);
            ButtonManager.render(barId);
            UI.closeDrawer();
        }
    },

    handleDragStart: (e, id) => {
        e.dataTransfer.effectAllowed = 'move';
        AppState.draggedBlockId = id;
        AppState.draggedBlockType = 'buttonbar';
    },

    _evaluateDynamicLabel: (rawLabel) => {
        if (!rawLabel.startsWith('=')) return rawLabel;
        const formula = rawLabel.substring(1).trim();

        try {
            const riga = {}; 
            const tabella = AdvancedTable._buildTabellaContext();
            const righe = []; 

            const fullCode = `'use strict';\n${AdvancedTable._formulaWrappers}\nreturn ${formula};`;
            const executor = new Function('riga', 'tabella', 'righe', 'origine', 'window', 'document', 'localStorage', 'fetch', 'AppState', 'Store', 'Editor', 'AdvancedTable', 'UI', fullCode);
            
            const result = executor.call(null, riga, tabella, righe, {}, undefined, undefined, undefined, undefined, AppState, Store, undefined, AdvancedTable, undefined);
            return result !== undefined && result !== null ? String(result) : 'Errore Formula';
        } catch (e) {
            return '⚠️ Errore Sintassi';
        }
    },

    render: (id) => {
        const wrapper = document.getElementById(id);
        if (!wrapper) return;

        const state = ButtonManager.getState(id);
        
        let bodyContainer = wrapper.querySelector('.widget-body');
        if (!bodyContainer) {
            wrapper.innerHTML = `<div class="widget-body"></div>`;
            bodyContainer = wrapper.querySelector('.widget-body');
        }

        if (!state || !state.buttons) {
            bodyContainer.innerHTML = '';
            wrapper.style.display = 'none';
            return;
        }
        
        wrapper.style.display = '';
        
        const isCited = id.includes('_cited_');
        const isEdit = AppState.isEditMode && !isCited;

        if (typeof WidgetManager !== 'undefined') {
            WidgetManager.updateShellUI(id, {
                hideHeader: true,
            });
        }

        // Estetica originale con position: relative per il contenitore e absolute per la maniglia
        let html = `<div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; ${isEdit ? 'padding:10px; border:1px dashed var(--border-color); border-radius:6px; background:rgba(0,0,0,0.01); position:relative;' : 'padding:5px 0; border:none; background:transparent;'}">`;

        if (isEdit) {
            html += `<div class="widget-drag-handle" title="Trascina la Barra Pulsanti" draggable="true" ondragstart="ButtonManager.handleDragStart(event, '${id}')" style="cursor:grab; opacity:0.3; padding:5px; font-weight:bold; position:absolute; top:-10px; left:-10px; background:var(--sidebar-bg); border:1px solid var(--border-color); border-radius:4px; z-index:10; display:flex;">${Icons.dragHandle || '⠿'}</div>`;
        }

        state.buttons.forEach(btn => {
            ButtonManager._migrateButtonState(btn);
            const displayLabel = ButtonManager._evaluateDynamicLabel(btn.label || '');
            const safeLabel = UI.escapeHTML(displayLabel);
            
            const btnStyle = isEdit 
                ? `opacity:0.8; box-shadow:none; cursor:default;` 
                : `box-shadow: 0 4px 6px rgba(0,0,0,0.1); cursor:pointer;`;
            
            const runClass = isEdit ? '' : 'action-btn-run';

            if (isEdit) {
                html += `
                    <div class="btn ${runClass}" style="padding: 10px 20px; font-size: 1rem; border-radius: 6px; background-color: ${btn.color || 'var(--accent-color)'}; border-color: ${btn.color || 'var(--accent-color)'}; color: white; ${btnStyle} display:inline-flex; align-items:center; gap:8px;" title="Clicca sul testo per configurare">
                        <span class="adv-btn-icon-trigger" style="cursor:pointer;" title="Esegui Azione" onclick="event.stopPropagation(); ButtonManager.execute('${id}', '${btn.id}', true)">${btn.icon || Icons.play}</span>
                        <span style="cursor:pointer; flex:1;" onclick="ButtonManager.openConfig(event, '${id}', '${btn.id}')">${safeLabel}</span>
                    </div>
                `;
            } else {
                html += `
                    <button class="btn ${runClass}" style="padding: 10px 20px; font-size: 1rem; border-radius: 6px; background-color: ${btn.color || 'var(--accent-color)'}; border-color: ${btn.color || 'var(--accent-color)'}; color: white; ${btnStyle}" onclick="ButtonManager.execute('${id}', '${btn.id}', false)" title="Esegui Azione">
                        <span style="display:inline-flex; align-items:center; gap:8px; pointer-events:none;">${btn.icon || ''} ${safeLabel}</span>
                    </button>
                `;
            }
        });

        if (isEdit) {
            html += `
                <button class="adv-icon-btn" style="padding:10px; border-radius:50%; border:1px solid var(--border-color); background:var(--bg-color);" title="Aggiungi Pulsante a questa Barra" onclick="ButtonManager.addButtonToBar('${id}')">
                    ${Icons.plus}
                </button>
            `;
        }

        html += `</div>`;
        bodyContainer.innerHTML = html;
    },

    execute: async (barId, btnId, isTestMode = false) => {
        if (AppState.isEditMode && !isTestMode) return;

        let btnState;
        const configPanel = document.getElementById('btnConfigFullArea');
        const isPanelOpenForThis = configPanel && document.getElementById('btnAestheticOptions') !== null;

        if (isTestMode && isPanelOpenForThis) {
            btnState = ButtonManager._saveConfigFromDOM(barId, btnId, false);
        } else {
            const state = ButtonManager.getState(barId);
            if (!state || !state.buttons) return;
            btnState = state.buttons.find(b => b.id === btnId);
            ButtonManager._migrateButtonState(btnState);
        }

        if (!btnState || !btnState.actionBlocks || btnState.actionBlocks.length === 0) {
            UI.showToast("Questo pulsante non ha azioni configurate.", "warning");
            return;
        }

        if (btnState.requireConfirm) {
            const displayLabel = ButtonManager._evaluateDynamicLabel(btnState.label || '');
            if (!confirm(`Vuoi eseguire l'azione: "${displayLabel}"?`)) return;
        }

        const response = await LogicEngine.executeMacroBlocks(btnState.actionBlocks, null, null, isTestMode);

        if (response.updatedDbIds.size > 0 || response.emailsSent > 0) {
            response.updatedDbIds.forEach(dbId => {
                AdvancedTable.setState(dbId, AppState.databases[dbId]);
                AdvancedTable.updateDependentViews(dbId);
                const targetDOM = document.getElementById(dbId);
                if (targetDOM) AdvancedTable.renderTable(dbId);
            });

            // Se la macro è stata testata dal Drawer di configurazione, consolida anche il pulsante stesso
            if (isTestMode && isPanelOpenForThis) {
                let realState = ButtonManager.getState(barId);
                if (realState && realState.buttons) {
                    const idx = realState.buttons.findIndex(b => b.id === btnId);
                    if (idx !== -1) {
                        realState.buttons[idx] = JSON.parse(JSON.stringify(btnState));
                        ButtonManager.setState(barId, realState);
                        ButtonManager.render(barId);
                    }
                }
                ButtonManager._draftBtnState = null;
                ButtonManager._draftBarId = null;
                UI.closeDrawer();
            }
            
            // Persiste immediatamente su disco nel Workspace
            Store.triggerAutoSave(true);
            
            if (response.errorsLog.length > 0) {
                const errorHtml = `
                    <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger-color); padding: 15px; border-radius: 6px; margin-bottom: 15px;">
                        <span style="color: var(--danger-color); font-weight: bold; font-size: 1.1rem;">⚠️ ${response.errorsLog.length} Errori / Avvisi Rilevati</span>
                        <p style="margin-top: 5px; font-size: 0.85rem; color: var(--text-secondary);">L'azione del pulsante è parzialmente riuscita (elaborati <b>${response.totalRowsAffected}</b> record, <b>${response.emailsSent}</b> email), ma ci sono stati dei problemi:</p>
                    </div>
                    <div style="font-family: monospace; font-size: 0.8rem; background: var(--bg-color); padding: 10px; border: 1px solid var(--border-color); border-radius: 4px; max-height: 300px; overflow-y: auto;">
                        ${response.errorsLog.map(err => `<div style="margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px dashed rgba(0,0,0,0.1);">${err}</div>`).join('')}
                    </div>
                `;
                UI.openDrawer('📋 Log Esecuzione Pulsante', errorHtml, `<button class="btn" onclick="UI.closeDrawer()">Chiudi</button>`);
            } else {
                let msg = `Macro completata: Elaborati ${response.totalRowsAffected} record in ${response.updatedDbIds.size} database.`;
                if (response.emailsSent > 0) msg += ` Generate ${response.emailsSent} Email.`;
                UI.showToast(msg, "success");
            }
        } else {
            if (response.errorsLog.length > 0) {
                UI.openDrawer('📋 Log Esecuzione Pulsante', `<b>${response.errorsLog.length} errori rilevati.</b> Nessuna operazione riuscita.<br><br>` + response.errorsLog.join('<br>'), null);
            } else {
                UI.showToast(`Nessun record ha soddisfatto le condizioni. Operazione ignorata.`, "warning");
            }
        }
    }
};