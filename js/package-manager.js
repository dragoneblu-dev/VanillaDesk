/**
 * package-manager.js
 * Modulo di Interscambio: Permette l'esportazione dell'ambiente vivo in formato Modpack
 * e l'installazione di moduli JSON con Re-Idratazione e Mappatura ID Intelligente.
 * FEAT: Sistema "Salva come Modulo (Modpack)" che clona il DOM e l'AppState in una capsula JSON autoinstallante.
 * FIX: Isolamento protetto degli aggiornamenti UI post-transazione per impedire alert modali errati durante i test runner.
 */

const PackageManager = {
    
    // =========================================================================
    // 1. ESPORTAZIONE (Da Nota Attiva a Modpack)
    // =========================================================================
    exportNoteAsModpack: async (noteId) => {
        const note = Store.getNote(noteId);
        if (!note || !note.content) return;

        if (typeof Editor !== 'undefined') Editor.sanitizeContent();
        let html = note.content;

        // 1. Dichiara i widget espliciti visti nell'HTML
        const requiredDbs = new Set();
        const explicitWidgetRegex = /id=["'](adv_[a-z]+_[a-zA-Z0-9]+)["']/g;
        let match;
        while ((match = explicitWidgetRegex.exec(html)) !== null) {
            requiredDbs.add(match[1].split('_cited_')[0]);
        }

        // 2. Analizza in profondità le dipendenze nascoste (Rollup, Relazioni, Button Targets, Pivot Sources)
        let addedNew = true;
        while (addedNew) {
            addedNew = false;
            for (let dbId of Array.from(requiredDbs)) {
                const state = AppState.databases[dbId];
                if (!state) continue;

                if (state.sourceTableId && !requiredDbs.has(state.sourceTableId)) {
                    requiredDbs.add(state.sourceTableId);
                    addedNew = true;
                }
                if (state.columns) {
                    state.columns.forEach(c => {
                        if (c.targetTableId && !requiredDbs.has(c.targetTableId)) { requiredDbs.add(c.targetTableId); addedNew = true; }
                        if (c.linkedTableId && !requiredDbs.has(c.linkedTableId)) { requiredDbs.add(c.linkedTableId); addedNew = true; }
                    });
                }
                if (state.buttons) {
                    state.buttons.forEach(b => {
                        if (b.actionBlocks) {
                            b.actionBlocks.forEach(blk => {
                                if (blk.targetDbId && blk.targetDbId !== 'THIS_ROW' && !requiredDbs.has(blk.targetDbId)) { 
                                    requiredDbs.add(blk.targetDbId); addedNew = true; 
                                }
                                if (blk.sourceDbId && !requiredDbs.has(blk.sourceDbId)) { 
                                    requiredDbs.add(blk.sourceDbId); addedNew = true; 
                                }
                            });
                        }
                    });
                }
            }
        }

        // 3. Raccoglie i Payload dei Database
        const exportDbs = {};
        requiredDbs.forEach(id => {
            if (AppState.databases[id]) {
                exportDbs[id] = JSON.parse(JSON.stringify(AppState.databases[id])); // Deep Clone per staccarlo dalla RAM viva
            }
        });

        // 4. Interfaccia UX per chiedere Dettagli
        const bodyHTML = `
            <div style="background: rgba(37,99,235,0.05); border: 1px solid rgba(37,99,235,0.2); padding: 15px; border-radius: 6px; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 20px;">
                Stai per impacchettare questa nota in un <b>Modpack Autoinstallante</b>.<br>
                Il sistema ha rilevato e incapsulerà automaticamente <b>${requiredDbs.size}</b> componenti avanzati (Database, Dashboard, Pulsanti) collegati tra loro.
            </div>
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div>
                    <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold;">Nome del Modpack:</label>
                    <input type="text" id="exportMpName" class="modern-input" value="${(note.title || 'Nuovo Modulo').replace(/"/g, '&quot;')}">
                </div>
                <div>
                    <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold;">Versione:</label>
                    <input type="text" id="exportMpVersion" class="modern-input" value="1.0">
                </div>
                <div>
                    <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:bold;">Descrizione (Opzionale):</label>
                    <textarea id="exportMpDesc" class="modern-input" rows="3" style="resize:vertical; width:100%; font-size:0.85rem;" placeholder="Cosa contiene questo pacchetto?"></textarea>
                </div>
            </div>
        `;
        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">Annulla</button>
            <button class="btn btn-primary" onclick="PackageManager._finalizeExport('${noteId}')"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.download} Genera e Scarica JSON</span></button>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.export} Esporta Modpack</span>`, bodyHTML, footerHTML);

        PackageManager._tempExportData = { html: html, databases: exportDbs };
    },

    _finalizeExport: (noteId) => {
        const name = document.getElementById('exportMpName').value.trim() || 'Modpack';
        const version = document.getElementById('exportMpVersion').value.trim() || '1.0';
        const desc = document.getElementById('exportMpDesc').value.trim() || '';

        const modpack = {
            type: "vanilladesk_modpack_v2",
            manifest: {
                name: name,
                version: version,
                description: desc
            },
            html: PackageManager._tempExportData.html,
            databases: PackageManager._tempExportData.databases
        };

        const blob = new Blob([JSON.stringify(modpack, null, 4)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        const cleanTitle = name.replace(/[^a-zA-Z0-9_\-\.]/g, '_').toLowerCase();
        a.download = `${cleanTitle}_v${version}.json`;
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 150);

        PackageManager._tempExportData = null;
        UI.closeDrawer();
        if (typeof UI.showToast !== 'undefined') UI.showToast("Modpack generato ed esportato con successo!", "success");
    },

    // =========================================================================
    // 2. IMPORTAZIONE (Re-Idratazione e Deep ID Mapping)
    // =========================================================================
    importModpack: async () => {
        try {
            if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
            
            const [fileHandle] = await window.showOpenFilePicker({
                types: [{ description: 'Modpack JSON', accept: { 'application/json': ['.json'] } }],
            });
            const file = await fileHandle.getFile();
            const text = await file.text();
            
            let modpack;
            try {
                modpack = JSON.parse(text);
            } catch (e) {
                alert("Il file non è un JSON valido.");
                return;
            }

            // Fallback per vecchi modpack v1 (Quelli del Builder Sequenziale)
            if (modpack.instructions && !modpack.type) {
                alert("Questo Modpack è stato creato con la vecchia versione del Builder (V1). L'app tenta di convertirlo al volo, ma se incontri errori usa la nuova esportazione nativa.");
                PackageManager._executeLegacyV1Transaction(modpack);
                return;
            }

            if (modpack.type !== 'vanilladesk_modpack_v2' || !modpack.html || !modpack.databases) {
                alert("Il file non è un Modpack VanillaDesk V2 valido.");
                return;
            }

            if (confirm(`Vuoi installare il Modpack:\n\n"${modpack.manifest.name}" (v${modpack.manifest.version})\n${modpack.manifest.description}\n\nVerrà creata una nuova nota con gli elementi importati.`)) {
                PackageManager._executeV2Transaction(modpack);
            }

        } catch (err) {
            if (err.name !== 'AbortError') alert("Errore lettura file: " + err.message);
        }
    },

    _executeV2Transaction: (modpack) => {
        try {
            console.group("📦 [MODPACK V2] Inizio Transazione di Importazione");
            
            const idMap = {};
            const titleMap = {};

            // 1. Mappatura degli ID: Assegniamo a ogni vecchio ID un nuovo ID preservando i prefissi logici
            Object.keys(modpack.databases).forEach(oldId => {
                let prefix = 'adv_tbl_';
                if (oldId.includes('adv_journal_')) prefix = 'adv_journal_';
                else if (oldId.includes('adv_code_')) prefix = 'adv_code_';
                else if (oldId.includes('adv_btnbar_')) prefix = 'adv_btnbar_';
                else if (oldId.includes('adv_pivot_')) prefix = 'adv_pivot_';
                else if (oldId.includes('adv_cols_')) prefix = 'adv_cols_';

                idMap[oldId] = prefix + Store.generateId();

                // 2. Mappatura Collisioni Titoli: Evitiamo che "DB Clienti" sovrascriva un "DB Clienti" già esistente nell'App
                const state = modpack.databases[oldId];
                if (state && state.title && prefix === 'adv_tbl_' && !state.isPivot && !state.isLinkedView) {
                    let baseTitle = state.title;
                    let counter = 1;
                    let finalTitle = baseTitle;
                    const existingNames = Object.values(AppState.databases).map(db => db.title);
                    
                    while (existingNames.includes(finalTitle) || Object.values(titleMap).includes(finalTitle)) {
                        finalTitle = `${baseTitle} (${counter})`;
                        counter++;
                    }
                    if (baseTitle !== finalTitle) {
                        titleMap[baseTitle] = finalTitle;
                    }
                }
            });

            console.log("-> Mappatura ID Completata:", idMap);
            console.log("-> Mappatura Nomi (Collisioni) Completata:", titleMap);

            // 3. String Replacement Magic
            // Attenzione: Applichiamo la Regex sull'HTML crudo e sulla versione in stringa dell'oggetto Databases!
            let htmlStr = modpack.html;
            let stateStr = JSON.stringify(modpack.databases);

            Object.keys(idMap).forEach(oldId => {
                const regex = new RegExp(oldId, 'g');
                htmlStr = htmlStr.replace(regex, idMap[oldId]);
                stateStr = stateStr.replace(regex, idMap[oldId]);
            });

            // 4. Correzione delle Formule e dei Nomi per le collisioni gestite
            Object.keys(titleMap).forEach(oldTitle => {
                const newTitle = titleMap[oldTitle];
                const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                
                // Rinominare il parametro title nel JSON
                const titlePropRegex = new RegExp(`"title":"${escapeRegExp(oldTitle)}"`, 'g');
                stateStr = stateStr.replace(titlePropRegex, `"title":"${newTitle}"`);
                
                // Aggiornare le Formule JS interne che richiamano tabella["VecchioNome"]
                const formulaRegex1 = new RegExp(`tabella\\[\\\\?"${escapeRegExp(oldTitle)}\\\\?"\\]`, 'g');
                const formulaRegex2 = new RegExp(`tabella\\[\\\\?'${escapeRegExp(oldTitle)}\\\\?'\\]`, 'g');
                
                stateStr = stateStr.replace(formulaRegex1, `tabella[\\"${newTitle}\\"]`);
                stateStr = stateStr.replace(formulaRegex2, `tabella[\\'${newTitle}\\']`);
            });

            // 5. Iniezione e Mount Finale
            const newDatabases = JSON.parse(stateStr);
            Object.assign(AppState.databases, newDatabases);

            const newNoteId = Store.generateId();
            const now = new Date().toISOString();
            
            AppState.notes.push({
                id: newNoteId, 
                parentId: AppState.currentNoteId || null, 
                title: modpack.manifest.name || "Modpack Importato",
                content: htmlStr,
                isMarked: false, 
                expanded: true, 
                createdAt: now, 
                updatedAt: now
            });

            console.groupEnd();

            // 6. Sincronizzazione difensiva dell'interfaccia utente (isolata per non interrompere la transazione dati)
            try {
                if (typeof UI !== 'undefined') {
                    if (typeof UI.renderTree === 'function') UI.renderTree();
                    if (typeof UI.selectNote === 'function') UI.selectNote(newNoteId);
                    if (typeof UI.showToast === 'function') UI.showToast(`Modpack "${modpack.manifest.name}" installato correttamente!`, 'success');
                }
                if (typeof Store !== 'undefined' && typeof Store.triggerAutoSave === 'function') {
                    Store.triggerAutoSave();
                }
            } catch (uiErr) {
                console.warn("[MODPACK V2] Sincronizzazione UI post-importazione ignorata o parziale:", uiErr);
            }

        } catch(e) {
            console.error("📦 [MODPACK V2 ERROR] Fallimento fatale:", e);
            if (typeof alert === 'function') {
                alert("Errore critico durante l'importazione del file JSON. L'operazione è stata annullata.");
            }
            console.groupEnd();
        }
    },

    // =========================================================================
    // 3. COMPATIBILITA' RETROATTIVA PER VECCHI MODPACK V1
    // =========================================================================
    _executeLegacyV1Transaction: (modpack) => {
        const idMap = {}; 
        const titleMap = {}; 
        const bubbleState = { databases: {} };

        try {
            for (let i = 0; i < modpack.instructions.length; i++) {
                const step = modpack.instructions[i];

                if (step.action === "CREATE_DB") {
                    const realId = 'adv_tbl_' + Store.generateId();
                    idMap[step.internal_ref] = realId;

                    let finalTitle = step.title;
                    let counter = 1;
                    const existingNames = Object.values(AppState.databases).map(db => db.title);
                    while (existingNames.includes(finalTitle)) {
                        finalTitle = `${step.title} (${counter})`;
                        counter++;
                    }
                    titleMap[step.title] = finalTitle;

                    bubbleState.databases[realId] = {
                        title: finalTitle, viewType: 'table', freeWidth: false, striped: true,
                        columns: [], rows: [], selectOptions: {}, selectColors: {}, sorts: [], filters: {}, automations: []
                    };
                }
                else if (step.action === "ADD_COLUMN") {
                    const dbId = idMap[step.target_db];
                    const realColId = 'c_' + Store.generateId();
                    idMap[`${step.target_db}.${step.col_internal_ref}`] = realColId;

                    bubbleState.databases[dbId].columns.push({
                        id: realColId, name: step.col_name, type: step.col_type, width: 150
                    });

                    if (['select', 'multi-select'].includes(step.col_type)) {
                        bubbleState.databases[dbId].selectOptions[realColId] = [];
                        bubbleState.databases[dbId].selectColors[realColId] = {};
                    }
                }
                else if (step.action === "ADD_RELATION") {
                    const dbId = idMap[step.target_db];
                    const targetDbRealId = idMap[step.points_to_db];
                    const targetColRealId = idMap[`${step.points_to_db}.${step.points_to_col}`];
                    
                    const realColId = 'c_' + Store.generateId();
                    idMap[`${step.target_db}.${step.col_internal_ref}`] = realColId;

                    bubbleState.databases[dbId].columns.push({
                        id: realColId, name: step.col_name, type: 'relation',
                        targetTableId: targetDbRealId, targetColId: targetColRealId, width: 200
                    });
                }
                else if (step.action === "ADD_SEED_ROW") {
                    const dbId = idMap[step.target_db];
                    const dbObj = bubbleState.databases[dbId];
                    const now = Date.now();
                    const newRow = { id: 'r' + Store.generateId(), createdAt: now, updatedAt: now, cells: {} };
                    
                    dbObj.columns.forEach(c => {
                        newRow.cells[c.id] = c.type === 'checkbox' ? false : (['multi-select', 'relation'].includes(c.type) ? [] : '');
                    });

                    if (step.row_data) {
                        for (const [colRef, value] of Object.entries(step.row_data)) {
                            const realColId = idMap[`${step.target_db}.${colRef}`];
                            if (realColId) {
                                newRow.cells[realColId] = value;
                                const colDef = dbObj.columns.find(c => c.id === realColId);
                                if (colDef && ['select', 'multi-select'].includes(colDef.type)) {
                                    const vArr = Array.isArray(value) ? value : [value];
                                    vArr.forEach(v => {
                                        if (!dbObj.selectOptions[realColId].includes(v)) {
                                            dbObj.selectOptions[realColId].push(v);
                                            dbObj.selectColors[realColId][v] = 'default-color';
                                        }
                                    });
                                }
                            }
                        }
                    }
                    dbObj.rows.push(newRow);
                }
                else if (step.action === "MOUNT_IN_NEW_NOTE") {
                    const newNoteId = Store.generateId();
                    const now = new Date().toISOString();
                    let htmlContent = '<p><br></p>';

                    const elementsList = step.layout_dbs.split(',').map(s => s.trim());
                    elementsList.forEach(elRef => {
                        const realId = idMap[elRef];
                        if (realId) {
                            const stateObj = bubbleState.databases[realId];
                            htmlContent += `
                            <div class="adv-widget-shell adv-table-wrapper widget-type-database" data-widget-type="database" id="${realId}" contenteditable="false">
                                <div class="widget-header adv-table-header" style="display:flex;">
                                    <span class="widget-icon" style="display:inline-flex;">${Icons.tableDatabase}</span>
                                    <span class="widget-title adv-table-title" contenteditable="false">${stateObj.title}</span>
                                </div>
                                <div class="widget-body"></div>
                            </div><p><br></p>`;
                        }
                    });

                    AppState.notes.push({
                        id: newNoteId, parentId: AppState.currentNoteId || null, 
                        title: step.note_title, content: htmlContent,
                        isMarked: false, expanded: true, createdAt: now, updatedAt: now
                    });
                    
                    Object.assign(AppState.databases, bubbleState.databases);

                    try {
                        if (typeof UI !== 'undefined') {
                            if (typeof UI.renderTree === 'function') UI.renderTree();
                            if (typeof UI.selectNote === 'function') UI.selectNote(newNoteId);
                            if (typeof UI.showToast === 'function') UI.showToast(`Modpack V1 installato con successo!`, 'success');
                        }
                        if (typeof Store !== 'undefined' && typeof Store.triggerAutoSave === 'function') {
                            Store.triggerAutoSave();
                        }
                    } catch (uiErr) {
                        console.warn("[MODPACK V1] Aggiornamento UI opzionale ignorato:", uiErr);
                    }
                }
            }
        } catch (err) {
            alert("Errore nell'installazione Modpack Legacy: " + err.message);
        }
    }
};