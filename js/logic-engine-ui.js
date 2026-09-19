/**
 * logic-engine-ui.js
 * Generatori di Markup HTML e UI per la costruzione visiva delle regole Logiche (Dropdown, Input e Preview).
 * Supporto dinamico per offset giorni (+/- giorni) e minuti (+/- minuti) su azioni Oggi e Adesso.
 * FIX TEMA/CONTRASTO: Normalizzato lo sfondo e il colore delle textarea delle formule con 
 * background: var(--bg-color) e color: var(--text-primary) con spellcheck disabilitato.
 */

Object.assign(LogicEngine, {
    // ==========================================
    // GENERATORI UI (Tendine Dinamiche)
    // ==========================================
    getConditionOperatorsHTML: (colDef, selectedOp, isTriggerMode) => {
        if (colDef && colDef.id === 'SYS_JS_FORMULA') {
            return `<option value="formula" selected>Valuta Risultato (True/False)</option>`;
        }

        let html = `
            <option value="=" ${selectedOp === '=' ? 'selected' : ''}>=</option>
            <option value="!=" ${selectedOp === '!=' ? 'selected' : ''}>Diverso da (!=)</option>
            <option value="contains" ${selectedOp === 'contains' ? 'selected' : ''}>Contiene Testo</option>
            <option value="not_contains" ${selectedOp === 'not_contains' ? 'selected' : ''}>Non Contiene</option>
            <option value="empty" ${selectedOp === 'empty' ? 'selected' : ''}>È vuoto</option>
            <option value="not_empty" ${selectedOp === 'not_empty' ? 'selected' : ''}>Non è vuoto</option>
        `;

        if (!colDef) return html;

        if (isTriggerMode) {
            html += `<option value="changed" ${selectedOp === 'changed' ? 'selected' : ''}>È cambiato (Scatta)</option>`;
            if (['checkbox', 'text', 'select', 'url'].includes(colDef.type)) {
                html += `
                    <option value="changed_to" ${selectedOp === 'changed_to' ? 'selected' : ''}>È diventato...</option>
                    <option value="changed_from" ${selectedOp === 'changed_from' ? 'selected' : ''}>Era... ed è cambiato</option>
                `;
            }
            if (['relation', 'multi-select'].includes(colDef.type)) {
                html += `
                    <option value="relation_added" ${selectedOp === 'relation_added' ? 'selected' : ''}>È stato aggiunto...</option>
                    <option value="relation_removed" ${selectedOp === 'relation_removed' ? 'selected' : ''}>È stato rimosso...</option>
                `;
            }
        }

        if (['number', 'formula', 'rollup'].includes(colDef.type)) {
            html += `
                <option value=">=" ${selectedOp === '>=' ? 'selected' : ''}>>=</option>
                <option value="<=" ${selectedOp === '<=' ? 'selected' : ''}><=</option>
                <option value=">" ${selectedOp === '>' ? 'selected' : ''}>></option>
                <option value="<" ${selectedOp === '<' ? 'selected' : ''}><</option>
            `;
        }

        if (['date', 'datetime'].includes(colDef.type)) {
            if (colDef.hasEndDate) {
                html += `
                    <option value="range_inside" ${selectedOp === 'range_inside' ? 'selected' : ''}>Comprende il...</option>
                    <option value="range_outside" ${selectedOp === 'range_outside' ? 'selected' : ''}>È fuori dal...</option>
                    <option value="range_start_eq" ${selectedOp === 'range_start_eq' ? 'selected' : ''}>L'Inizio è il...</option>
                    <option value="range_end_eq" ${selectedOp === 'range_end_eq' ? 'selected' : ''}>La Fine è il...</option>
                `;
            } else {
                html += `
                    <option value=">=" ${selectedOp === '>=' ? 'selected' : ''}>Dal (Compreso)</option>
                    <option value="<=" ${selectedOp === '<=' ? 'selected' : ''}>Fino al (Compreso)</option>
                    <option value=">" ${selectedOp === '>' ? 'selected' : ''}>Dopo il</option>
                    <option value="<" ${selectedOp === '<' ? 'selected' : ''}>Prima del</option>
                `;
            }
        }

        return html;
    },

    getActionTypesHTML: (colDef, selectedType, mode) => {
        if (!colDef) return `<option value="set_fixed">Seleziona colonna...</option>`;

        let html = '';
        const isUpdate = mode === 'automation' || mode === 'button_update';

        if (colDef.type === 'checkbox') {
            html += `
                <option value="set_true" ${selectedType === 'set_true' ? 'selected' : ''}>Spunta (Sì)</option>
                <option value="set_false" ${selectedType === 'set_false' ? 'selected' : ''}>Rimuovi Spunta (No)</option>
                <option value="set_formula" ${selectedType === 'set_formula' ? 'selected' : ''}>Formula JS...</option>
            `;
        } else if (colDef.type === 'number') {
            html += `
                <option value="set_fixed" ${selectedType === 'set_fixed' ? 'selected' : ''}>Valore Fisso</option>
                <option value="set_formula" ${selectedType === 'set_formula' ? 'selected' : ''}>Formula JS...</option>
            `;
            if (isUpdate) {
                html += `
                    <option value="math_add" ${selectedType === 'math_add' ? 'selected' : ''}>Aggiungi (+)</option>
                    <option value="math_sub" ${selectedType === 'math_sub' ? 'selected' : ''}>Sottrai (-)</option>
                `;
            }
        } else if (colDef.type === 'select') {
            html += `
                <option value="set_fixed" ${selectedType === 'set_fixed' ? 'selected' : ''}>Imposta a...</option>
                <option value="set_formula" ${selectedType === 'set_formula' ? 'selected' : ''}>Formula JS...</option>
            `;
        } else if (['multi-select', 'relation'].includes(colDef.type)) {
            html += `
                <option value="set_fixed" ${selectedType === 'set_fixed' ? 'selected' : ''}>Sovrascrivi con...</option>
                <option value="add_fixed" ${selectedType === 'add_fixed' ? 'selected' : ''}>Aggiungi all'elenco...</option>
                <option value="set_formula" ${selectedType === 'set_formula' ? 'selected' : ''}>Formula JS...</option>
            `;
            if (isUpdate) {
                html += `<option value="remove_fixed" ${selectedType === 'remove_fixed' ? 'selected' : ''}>Rimuovi dall'elenco...</option>`;
            }
        } else if (['date', 'datetime'].includes(colDef.type)) {
            if (colDef.hasEndDate) {
                html += `
                    <optgroup label="Data di Inizio">
                        <option value="set_start_today" ${selectedType === 'set_start_today' ? 'selected' : ''}>Inizio a Oggi</option>
                        <option value="set_start_now" ${selectedType === 'set_start_now' ? 'selected' : ''}>Inizio ad Adesso (Ora)</option>
                        <option value="set_start_fixed" ${selectedType === 'set_start_fixed' ? 'selected' : ''}>Inizio Fisso...</option>
                        <option value="set_start_formula" ${selectedType === 'set_start_formula' ? 'selected' : ''}>Inizio: Formula JS...</option>
                `;
                if (isUpdate) {
                    html += `
                        <option value="math_start_add" ${selectedType === 'math_start_add' ? 'selected' : ''}>Inizio: Aggiungi (+)</option>
                        <option value="math_start_sub" ${selectedType === 'math_start_sub' ? 'selected' : ''}>Inizio: Sottrai (-)</option>
                    `;
                }
                html += `</optgroup><optgroup label="Data di Fine">
                        <option value="set_end_today" ${selectedType === 'set_end_today' ? 'selected' : ''}>Fine a Oggi</option>
                        <option value="set_end_now" ${selectedType === 'set_end_now' ? 'selected' : ''}>Fine ad Adesso (Ora)</option>
                        <option value="set_end_fixed" ${selectedType === 'set_end_fixed' ? 'selected' : ''}>Fine Fissa...</option>
                        <option value="set_end_formula" ${selectedType === 'set_end_formula' ? 'selected' : ''}>Fine: Formula JS...</option>
                `;
                if (isUpdate) {
                    html += `
                        <option value="math_end_add" ${selectedType === 'math_end_add' ? 'selected' : ''}>Fine: Aggiungi (+)</option>
                        <option value="math_end_sub" ${selectedType === 'math_end_sub' ? 'selected' : ''}>Fine: Sottrai (-)</option>
                    `;
                }
                html += `</optgroup><optgroup label="Avanzate">
                        <option value="set_formula" ${selectedType === 'set_formula' ? 'selected' : ''}>Formula JS (Sovrascrive tutto)...</option>
                </optgroup>`;
            } else {
                html += `
                    <option value="set_today" ${selectedType === 'set_today' ? 'selected' : ''}>Solo Data di Oggi</option>
                    <option value="set_datetime" ${selectedType === 'set_datetime' ? 'selected' : ''}>Data e Ora di Adesso</option>
                    <option value="set_fixed" ${selectedType === 'set_fixed' ? 'selected' : ''}>Data fissa...</option>
                    <option value="set_formula" ${selectedType === 'set_formula' ? 'selected' : ''}>Formula JS...</option>
                `;
                if (isUpdate) {
                    html += `
                        <option value="math_date_add" ${selectedType === 'math_date_add' ? 'selected' : ''}>Aggiungi Tempo (+)</option>
                        <option value="math_date_sub" ${selectedType === 'math_date_sub' ? 'selected' : ''}>Sottrai Tempo (-)</option>
                    `;
                }
            }
        } else if (colDef.type === 'time') {
            html += `
                <option value="set_time" ${selectedType === 'set_time' ? 'selected' : ''}>Ora Corrente</option>
                <option value="set_fixed" ${selectedType === 'set_fixed' ? 'selected' : ''}>Orario Fisso...</option>
            `;
        } else {
            html += `
                <option value="set_fixed" ${selectedType === 'set_fixed' ? 'selected' : ''}>Testo Fisso</option>
                <option value="set_formula" ${selectedType === 'set_formula' ? 'selected' : ''}>Formula JS...</option>
            `;
        }

        if (mode === 'button_select') {
            html += `<option value="set_from_source_col" ${selectedType === 'set_from_source_col' ? 'selected' : ''}>[Copia] Valore da Colonna Origine...</option>`;
        }

        if (mode !== 'email') {
            html += `<option value="set_empty" ${selectedType === 'set_empty' ? 'selected' : ''}>Svuota Cella</option>`;
        }
        
        return html;
    },

    getActionInputHTML: (colDef, actType, val1, val2, targetState, onchangeCallback, extraData = null) => {
        if (!colDef) return `<input type="text" class="modern-input action-val" disabled style="width:100%; margin:0; opacity:0.5;">`;
        if (actType === 'set_empty' || actType === 'set_true' || actType === 'set_false') {
            return `<input type="hidden" class="modern-input action-val" value=""><input type="hidden" class="modern-input action-val2" value="">`;
        }

        if (actType === 'set_from_source_col') {
            let optsHTML = '<option value="">-- Seleziona Colonna Origine --</option>';
            if (extraData && extraData.sourceDbId) {
                const srcState = typeof AdvancedTable !== 'undefined' ? AdvancedTable.getTableState(extraData.sourceDbId) : null;
                if (srcState) {
                    srcState.columns.forEach(c => {
                        let sel = c.id === val1 ? 'selected' : '';
                        optsHTML += `<option value="${c.id}" ${sel}>${c.name} (${c.type})</option>`;
                    });
                }
            }
            return `<select class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0; font-weight:bold;" onchange="${onchangeCallback}('value', this.value)">${optsHTML}</select>`;
        }

        const safeVal1 = UI.escapeHTML(val1 || '');

        // Gestione Azioni OGGI con offset giorni (+/- giorni)
        if (['set_today', 'set_start_today', 'set_end_today'].includes(actType) && ['date', 'datetime'].includes(colDef.type)) {
            return `<input type="number" class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0; text-align:right;" placeholder="+ numero giorni" title="Numero di giorni da aggiungere (+) o sottrarre (-) rispetto ad oggi" value="${safeVal1}" oninput="${onchangeCallback}('value', this.value)">`;
        }

        // Gestione Azioni ADESSO con offset minuti (+/- minuti)
        if (['set_datetime', 'set_start_now', 'set_end_now'].includes(actType) && ['date', 'datetime'].includes(colDef.type)) {
            return `<input type="number" class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0; text-align:right;" placeholder="+ numero minuti" title="Numero di minuti da aggiungere (+) o sottrarre (-) rispetto ad adesso" value="${safeVal1}" oninput="${onchangeCallback}('value', this.value)">`;
        }

        if (actType && actType.includes('formula')) {
            let ph = "Es: riga['Nome'].toUpperCase()";
            const inputIdAttr = (extraData && extraData.inputId) ? `id="${extraData.inputId}"` : '';
            
            if (extraData && extraData.isEmailBody) {
                return `<textarea ${inputIdAttr} class="modern-input action-val live-formula-input" spellcheck="false" style="width:100%; box-sizing:border-box; margin:0; font-family:monospace; background:var(--bg-color) !important; color:var(--text-primary) !important; border:1px solid var(--border-color) !important; border-radius:6px !important; padding:8px; min-height:80px; resize:vertical;" placeholder="'Gentile ' + riga['Nome Cliente'] + ',\\nQuesta è una mail multi-riga!\\n\\n' + riga['Dettagli']" oninput="${onchangeCallback}('value', this.value)">${safeVal1}</textarea>`;
            }
            
            return `<textarea ${inputIdAttr} class="modern-input action-val live-formula-input" spellcheck="false" style="width:100%; box-sizing:border-box; margin:0; font-family:monospace; background:var(--bg-color) !important; color:var(--text-primary) !important; border:1px solid var(--border-color) !important; border-radius:6px !important; padding:8px; min-height:80px; resize:vertical;" placeholder="${ph}" oninput="${onchangeCallback}('value', this.value)">${safeVal1}</textarea>`;
        }

        if (actType === 'set_fixed' && extraData && extraData.isEmailBody) {
             return `<textarea class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0; min-height:80px; resize:vertical;" placeholder="Scrivi il corpo dell'email qui... (Testo statico su più righe)" oninput="${onchangeCallback}('value', this.value)">${safeVal1}</textarea>`;
        }

        if (actType.includes('math_') && ['date', 'datetime'].includes(colDef.type)) {
            return `
                <div style="display:flex; width:100%; gap:2px; margin:0;">
                    <input type="number" class="modern-input action-val" style="width:60px; text-align:center;" value="${val1 || '1'}" min="1" onchange="${onchangeCallback}('value', this.value)">
                    <select class="modern-input action-val2" style="flex:1;" onchange="${onchangeCallback}('value2', this.value)">
                        <option value="hours" ${val2 === 'hours' ? 'selected' : ''}>Ore</option>
                        <option value="days" ${val2 === 'days' || !val2 ? 'selected' : ''}>Giorni</option>
                        <option value="weeks" ${val2 === 'weeks' ? 'selected' : ''}>Settimane</option>
                        <option value="months" ${val2 === 'months' ? 'selected' : ''}>Mesi</option>
                    </select>
                </div>
            `;
        }

        if (actType.includes('_fixed') && ['date', 'datetime'].includes(colDef.type)) {
            const inputType = colDef.type === 'datetime' ? 'datetime-local' : 'date';
            return `<input type="${inputType}" class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0;" value="${safeVal1}" onchange="${onchangeCallback}('value', this.value)">`;
        }

        if (colDef.type === 'select' || colDef.type === 'multi-select') {
            let opts = targetState && targetState.selectOptions ? (targetState.selectOptions[colDef.id] || []) : [];
            let listId = `dl_act_${colDef.id}_${Date.now()}`;
            return `
                <input type="text" list="${listId}" class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0;" value="${safeVal1}" placeholder="Scrivi o scegli..." oninput="${onchangeCallback}('value', this.value)">
                <datalist id="${listId}">${opts.map(o => `<option value="${UI.escapeHTML(o)}">`).join('')}</datalist>
            `;
        }

        if (colDef.type === 'relation') {
            let optsHTML = '<option value="">-- Seleziona --</option>';
            const relState = typeof AdvancedTable !== 'undefined' ? AdvancedTable.getTableState(colDef.targetTableId) : null;
            if (relState) {
                relState.rows.forEach(r => {
                    let name = UI.escapeHTML(r.cells[colDef.targetColId] || 'Senza nome');
                    let sel = String(r.id) === String(val1) ? 'selected' : '';
                    optsHTML += `<option value="${r.id}" ${sel}>${name}</option>`;
                });
            }
            return `<select class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0;" onchange="${onchangeCallback}('value', this.value)">${optsHTML}</select>`;
        }

        let ph = "Valore testuale...";
        if (colDef.type === 'number') ph = "Numero...";
        if (colDef.type === 'time') return `<input type="time" class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0;" value="${safeVal1}" onchange="${onchangeCallback}('value', this.value)">`;

        return `<input type="text" class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0; ${colDef.type === 'number' ? 'text-align:right;' : ''}" placeholder="${ph}" value="${safeVal1}" oninput="${onchangeCallback}('value', this.value)">`;
    },

    // ==========================================
    // GENERATORE PREVIEW LIVE (Testing UI Formule)
    // ==========================================
    updateFormulaLivePreview: async (previewElId, formula, targetState, filters = [], sourceState = null) => {
        const el = document.getElementById(previewElId);
        if (!el) return;

        if (!formula || formula.trim() === '') {
            el.innerHTML = '<span style="color:var(--text-secondary); font-style:italic;">Nessuna formula JS inserita...</span>';
            return;
        }

        el.innerHTML = `<span style="color:var(--text-secondary);">${Icons.hourglass || '⏳'} Calcolo in corso...</span>`;

        try {
            let mockRow = { id: 'mock', cells: {}, virtualCells: {} };
            let foundRealRow = false;

            if (targetState && targetState.rows && targetState.rows.length > 0) {
                if (filters && filters.length > 0) {
                    for (const r of targetState.rows) {
                        let isMatch = true;
                        for (const f of filters) {
                            if (f.colId && !f.colId.startsWith('SYS_')) {
                                let colDef = targetState.columns.find(c => c.id === f.colId);
                                if (f.colId === 'SYS_JS_FORMULA') colDef = { id: 'SYS_JS_FORMULA', type: 'special' };
                                
                                if (!LogicEngine.evaluateCondition(f.operator, f.value, r.cells[f.colId], null, colDef, null, r, targetState)) {
                                    isMatch = false;
                                    break;
                                }
                            }
                        }
                        if (isMatch) {
                            mockRow = r;
                            foundRealRow = true;
                            break;
                        }
                    }
                    if (!foundRealRow) {
                        mockRow = targetState.rows[0]; 
                    }
                } else {
                    mockRow = targetState.rows[0];
                    foundRealRow = true;
                }
            }

            let mockOrigine = { "Dato Esempio": "Test Preview" }; 
            
            if (sourceState && sourceState.rows && sourceState.rows.length > 0) {
                mockOrigine = AdvancedTable._buildRigaContext(sourceState.rows[0], sourceState.columns);
            }
            
            if (sourceState && targetState && sourceState.id === targetState.id) {
                mockOrigine = AdvancedTable._buildRigaContext(mockRow, targetState.columns);
            }

            let cleanFormula = formula;
            if (cleanFormula.startsWith('=')) cleanFormula = cleanFormula.substring(1);

            const result = await AdvancedTable.executeAsyncScript(
                cleanFormula, 
                mockRow, 
                targetState ? targetState.columns : [], 
                targetState ? targetState.id : '', 
                targetState ? targetState.title : 'Database', 
                mockRow.virtualCells || mockRow.cells,
                mockOrigine
            );

            let rowContextMsg = '';
            if (foundRealRow) {
                const titleColId = targetState.columns[0]?.id;
                const rowTitle = titleColId && mockRow.cells[titleColId] ? mockRow.cells[titleColId] : 'Senza Titolo';
                rowContextMsg = `(Test effettuato sul record: "<b>${UI.escapeHTML(rowTitle)}</b>")`;
            } else if (targetState && targetState.rows.length > 0) {
                 rowContextMsg = `(⚠️ I filtri non restituiscono nulla. Test su prima riga)`;
            } else {
                rowContextMsg = `(Database attualmente vuoto)`;
            }

            if (String(result).includes('Async Err') || String(result).includes('Err')) {
                 el.innerHTML = `<span style="color:var(--danger-color);"><b>Errore di Sintassi:</b> Controlla il codice Javascript.</span>`;
            } else {
                 let stringResult = typeof result === 'object' ? JSON.stringify(result) : String(result);
                 el.innerHTML = `<span style="color:var(--text-secondary);">Risultato:</span> <span style="background:var(--bg-color); color:var(--text-primary); font-weight:bold; padding:2px 6px; border-radius:4px; border:1px solid var(--border-color); word-break: break-all;">${UI.escapeHTML(stringResult)}</span> <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:4px;">${rowContextMsg}</div>`;
            }

        } catch (e) {
            console.error(`🔴 [LIVE PREVIEW ERROR] Fallimento durante il test della Formula: ${formula}`, e);
            el.innerHTML = `<span style="color:var(--danger-color);"><b>Errore:</b> ${e.message}</span>`;
        }
    }
});