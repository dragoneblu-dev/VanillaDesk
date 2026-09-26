/**
 * package-manager.js
 * Modulo di Interscambio: Permette l'esportazione dell'ambiente vivo in formato Modpack
 * e l'installazione di moduli JSON con Re-Idratazione e Mappatura ID Intelligente.
 * Tracciamento del dirty state volatile (_isDirty, _isDraft) all'importazione di una nuova nota da modpack.
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

        const requiredDbs = new Set();
        const explicitWidgetRegex = /id=["'](adv_[a-z]+_[a-zA-Z0-9]+)["']/g;
        let match;
        while ((match = explicitWidgetRegex.exec(html)) !== null) {
            requiredDbs.add(match[1].split('_cited_')[0]);
        }

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

        const exportDbs = {};
        requiredDbs.forEach(id => {
            if (AppState.databases[id]) {
                exportDbs[id] = JSON.parse(JSON.stringify(AppState.databases[id]));
            }
        });

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
            const idMap = {};
            const titleMap = {};

            Object.keys(modpack.databases).forEach(oldId => {
                let prefix = 'adv_tbl_';
                if (oldId.includes('adv_journal_')) prefix = 'adv_journal_';
                else if (oldId.includes('adv_code_')) prefix = 'adv_code_';
                else if (oldId.includes('adv_btnbar_')) prefix = 'adv_btnbar_';
                else if (oldId.includes('adv_pivot_')) prefix = 'adv_pivot_';
                else if (oldId.includes('adv_cols_')) prefix = 'adv_cols_';

                idMap[oldId] = prefix + Store.generateId();

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

            let htmlStr = modpack.html;
            let stateStr = JSON.stringify(modpack.databases);

            Object.keys(idMap).forEach(oldId => {
                const regex = new RegExp(oldId, 'g');
                htmlStr = htmlStr.replace(regex, idMap[oldId]);
                stateStr = stateStr.replace(regex, idMap[oldId]);
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

            const rehydratedDatabases = JSON.parse(stateStr);
            if (!AppState.databases) AppState.databases = {};
            Object.assign(AppState.databases, rehydratedDatabases);

            const newNoteId = Store.generateId();
            const now = new Date().toISOString();
            const newNote = {
                id: newNoteId,
                parentId: null,
                title: (modpack.manifest && modpack.manifest.name) || "Modulo Importato",
                content: htmlStr,
                isMarked: false,
                expanded: true,
                createdAt: now,
                updatedAt: now,
                _isDraft: true,
                _isDirty: true
            };

            AppState.notes.push(newNote);

            if (typeof AdvancedTable !== 'undefined') {
                AdvancedTable.syncSystemPropertiesRow(newNoteId);
            }

            if (typeof UI.renderTree !== 'undefined') UI.renderTree();
            UI.selectNote(newNoteId);

            Store.triggerAutoSave(true);
            if (typeof UI.showToast !== 'undefined') UI.showToast(`Modpack "${newNote.title}" installato con successo!`, "success");

        } catch (err) {
            console.error("Errore transazione V2 Modpack:", err);
            alert("Errore durante l'installazione del modulo: " + err.message);
        }
    }
};