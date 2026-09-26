/**
 * js/ai-bridge.js
 * Modulo Bridge per Integrazione AI e Agenti Intelligenti.
 * Consente l'interscambio di dati tra l'ambiente nativo VanillaDesk
 * e rappresentazioni semantiche in linguaggio naturale / Markdown per LLM.
 */

const AIBridge = {

    /**
     * Genera la mappa semantica completa del Workspace per l'IA.
     * Nasconde tutti gli ID esadecimali/interni esponendo solo gerarchie e nomi.
     */
    getWorkspaceManifest: () => {
        const manifest = {
            workspaceName: AppState.fileName,
            notesTree: [],
            databasesSchema: []
        };

        const buildNoteBranch = (parentId) => {
            const children = Store.getChildren(parentId);
            return children.map(n => ({
                title: n.title || 'Senza Titolo',
                isFolder: Store.getChildren(n.id).length > 0,
                isFavorite: !!n.isMarked,
                subNotes: buildNoteBranch(n.id)
            }));
        };

        manifest.notesTree = buildNoteBranch(null);

        if (AppState.databases) {
            Object.keys(AppState.databases).forEach(id => {
                const db = AppState.databases[id];
                if (!db || db.isPivot || db.isLinkedView || id === 'SYS_PROPERTIES_DB') return;

                const parentNote = AppState.notes.find(n => n.content && n.content.includes(id));

                manifest.databasesSchema.push({
                    title: db.title || 'Database',
                    containerNoteTitle: parentNote ? parentNote.title : 'Orfano',
                    viewType: db.viewType || 'table',
                    columns: (db.columns || []).map(c => {
                        let typeDesc = c.type;
                        if (c.type === 'relation') {
                            const targetDb = AppState.databases[c.targetTableId];
                            typeDesc = `relation -> "${targetDb ? targetDb.title : 'Unknown'}"`;
                        } else if (c.type === 'select' || c.type === 'multi-select') {
                            const opts = (db.selectOptions && db.selectOptions[c.id]) || [];
                            typeDesc = `${c.type} [${opts.join(', ')}]`;
                        }
                        return `${c.name} (${typeDesc})`;
                    })
                });
            });
        }

        return manifest;
    },

    /**
     * Esporta una nota in formato semantico per l'IA.
     * Converte i gusci HTML dei database in blocchi strutturati YAML leggibili.
     */
    exportNoteToSemanticMarkdown: (noteTitle) => {
        const note = AppState.notes.find(n => (n.title || '').trim().toLowerCase() === noteTitle.trim().toLowerCase() && !n.deletedAt);
        if (!note) return null;

        let md = `---
titolo: "${note.title.replace(/"/g, '\\"')}"
preferito: ${!!note.isMarked}
data_aggiornamento: "${note.updatedAt}"
---

`;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.content || '';

        // Trova e converte ogni database incorporato in una rappresentazione semantica
        const dbElements = tempDiv.querySelectorAll('.adv-table-wrapper, [data-widget-type="database"]');
        dbElements.forEach(el => {
            const trueId = el.id.split('_cited_')[0];
            const dbState = AppState.databases[trueId];

            if (dbState && !dbState.isPivot && !dbState.isLinkedView) {
                let dbYaml = `\n\`\`\`vanilladesk-database\n`;
                dbYaml += `titolo: "${dbState.title}"\n`;
                dbYaml += `vista: "${dbState.viewType || 'table'}"\n`;
                dbYaml += `colonne:\n`;

                const colIdToName = new Map();
                (dbState.columns || []).forEach(c => {
                    colIdToName.set(c.id, c.name);
                    dbYaml += `  - "${c.name}": "${c.type}"\n`;
                });

                dbYaml += `righe:\n`;
                (dbState.rows || []).forEach(r => {
                    dbYaml += `  - `;
                    let first = true;
                    for (const [cId, val] of Object.entries(r.cells || {})) {
                        const colName = colIdToName.get(cId);
                        if (!colName) continue;

                        let cleanVal = val;
                        const colDef = dbState.columns.find(c => c.id === cId);

                        // Risoluzione semantica dei puntatori ID in nomi leggibili
                        if (colDef && colDef.type === 'relation' && Array.isArray(val)) {
                            const targetDb = AppState.databases[colDef.targetTableId];
                            if (targetDb) {
                                cleanVal = val.map(targetRowId => {
                                    const tr = targetDb.rows.find(rx => rx.id === targetRowId);
                                    const displayCol = targetDb.columns[0]?.id;
                                    return tr ? tr.cells[displayCol] : targetRowId;
                                });
                            }
                        }

                        const valStr = typeof cleanVal === 'object' ? JSON.stringify(cleanVal) : `"${cleanVal}"`;
                        if (!first) dbYaml += `    `;
                        dbYaml += `"${colName}": ${valStr}\n`;
                        first = false;
                    }
                });

                dbYaml += `\`\`\`\n\n`;
                el.outerHTML = dbYaml;
            }
        });

        // Converte il testo restante tramite l'estrattore Markdown dell'app
        md += ExportManager.htmlToMarkdown(tempDiv.innerHTML, true);
        return md;
    },

    /**
     * Esegue una mutazione transazionale su un Database guidata dall'IA.
     * Mappa i nomi delle colonne e dei record collegati negli ID interni, garantendo zero corruzioni.
     */
    applyDatabaseMutation: async (dbTitle, operation, matchCriteria, valuesPayload) => {
        let targetDbId = null;
        let dbState = null;

        for (const [id, s] of Object.entries(AppState.databases || {})) {
            if (s && s.title && s.title.trim().toLowerCase() === dbTitle.trim().toLowerCase()) {
                targetDbId = id;
                dbState = s;
                break;
            }
        }

        if (!dbState) {
            throw new Error(`Database con titolo "${dbTitle}" non trovato nel Workspace.`);
        }

        const colNameToId = new Map();
        const colDefByName = new Map();
        (dbState.columns || []).forEach(c => {
            colNameToId.set(c.name.trim().toLowerCase(), c.id);
            colDefByName.set(c.name.trim().toLowerCase(), c);
        });

        // 1. Risoluzione della riga target
        let targetRow = null;
        if (operation === 'UPDATE' || operation === 'DELETE') {
            for (const r of dbState.rows || []) {
                let match = true;
                for (const [critColName, critVal] of Object.entries(matchCriteria)) {
                    const cId = colNameToId.get(critColName.trim().toLowerCase());
                    if (!cId || String(r.cells[cId]).toLowerCase() !== String(critVal).toLowerCase()) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    targetRow = r;
                    break;
                }
            }
            if (!targetRow && operation !== 'INSERT') {
                throw new Error(`Nessun record trovato corrispondente ai criteri di ricerca forniti.`);
            }
        }

        // 2. Esecuzione Operazione
        const now = Date.now();

        if (operation === 'DELETE') {
            dbState.rows = dbState.rows.filter(r => r.id !== targetRow.id);
        } 
        else if (operation === 'INSERT' || operation === 'UPDATE') {
            let rowToModify = targetRow;

            if (operation === 'INSERT') {
                rowToModify = {
                    id: 'r' + Store.generateId(),
                    createdAt: now,
                    updatedAt: now,
                    cells: {}
                };
                // Popola celle di default
                dbState.columns.forEach(c => {
                    rowToModify.cells[c.id] = c.type === 'checkbox' ? false : (['multi-select', 'relation'].includes(c.type) ? [] : '');
                });
            }

            // Iniezione sicura dei valori
            for (const [humanColName, inputVal] of Object.entries(valuesPayload)) {
                const cId = colNameToId.get(humanColName.trim().toLowerCase());
                if (!cId) continue;

                const colDef = colDefByName.get(humanColName.trim().toLowerCase());

                // Risoluzione inversa Relazioni: Converte i nomi umani forniti dall'IA negli ID fisici della tabella target
                if (colDef.type === 'relation' && colDef.targetTableId) {
                    const linkedDb = AppState.databases[colDef.targetTableId];
                    if (linkedDb) {
                        const targetDisplayCol = linkedDb.columns[0]?.id;
                        const namesToFind = Array.isArray(inputVal) ? inputVal : [inputVal];
                        const resolvedIds = [];

                        namesToFind.forEach(searchName => {
                            const foundTargetRow = linkedDb.rows.find(rx => 
                                String(rx.cells[targetDisplayCol]).trim().toLowerCase() === String(searchName).trim().toLowerCase()
                            );
                            if (foundTargetRow) resolvedIds.push(foundTargetRow.id);
                        });

                        rowToModify.cells[cId] = colDef.singleRecord ? (resolvedIds[0] || '') : resolvedIds;
                        continue;
                    }
                }

                // Auto-apprendimento opzioni Select/Multi-Select
                if (colDef.type === 'select' || colDef.type === 'multi-select') {
                    const optsToAdd = Array.isArray(inputVal) ? inputVal : [inputVal];
                    if (!dbState.selectOptions[cId]) dbState.selectOptions[cId] = [];
                    optsToAdd.forEach(opt => {
                        const cleanOpt = String(opt).trim();
                        if (cleanOpt && !dbState.selectOptions[cId].includes(cleanOpt)) {
                            dbState.selectOptions[cId].push(cleanOpt);
                        }
                    });
                }

                rowToModify.cells[cId] = inputVal;
            }

            rowToModify.updatedAt = now;

            if (operation === 'INSERT') {
                dbState.rows.push(rowToModify);
            }
        }

        // 3. Persistenza e Allineamento
        AdvancedTable.setState(targetDbId, dbState);
        AdvancedTable.updateDependentViews(targetDbId);
        Store.triggerAutoSave(true);

        return {
            success: true,
            operation: operation,
            database: dbTitle,
            affectedRows: 1
        };
    }
};