/**
 * js/____ai-bridge.js
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

        if (AppState.databases && typeof AppState.getRelationalDatabaseIds === 'function') {
            AppState.getRelationalDatabaseIds().forEach(id => {
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
     * Legge una nota cercandola per titolo e restituisce metadati e Markdown completo.
     */
    readNote: async (noteTitle) => {
        if (!noteTitle || typeof noteTitle !== 'string') {
            throw new Error("Specificare il titolo della nota da leggere.");
        }

        const note = AppState.notes.find(n => !n.deletedAt && (n.title || '').trim().toLowerCase() === noteTitle.trim().toLowerCase());
        if (!note) {
            throw new Error(`Nota "${noteTitle}" non trovata o presente nel Cestino.`);
        }

        const parentNote = note.parentId ? Store.getNote(note.parentId) : null;
        const markdown = AIBridge.exportNoteToSemanticMarkdown(note.title);

        return {
            id: note.id,
            title: note.title,
            parentTitle: parentNote ? parentNote.title : null,
            isFavorite: !!note.isMarked,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
            contentMarkdown: markdown
        };
    },

    /**
     * Crea una nuova nota nel Workspace a partire da un payload Markdown.
     * Gestisce gerarchia parent, token di revisione, database proprietà e persistenza.
     */
    createNote: async ({ title, contentMarkdown = "", parentNoteTitle = null, isFavorite = false }) => {
        if (!title || typeof title !== 'string' || title.trim() === "") {
            throw new Error("Il titolo della nuova nota è obbligatorio.");
        }

        const cleanTitle = title.trim();

        // 1. Risoluzione della nota genitore opzionale
        let parentId = null;
        if (parentNoteTitle && typeof parentNoteTitle === 'string') {
            const parentNote = AppState.notes.find(n => !n.deletedAt && (n.title || '').trim().toLowerCase() === parentNoteTitle.trim().toLowerCase());
            if (parentNote) {
                parentId = parentNote.id;
                parentNote.expanded = true;
            } else {
                console.warn(`[AIBridge] Nota genitore "${parentNoteTitle}" non trovata. La nota verrà creata alla radice.`);
            }
        }

        // 2. Conversione del Markdown in HTML nativo
        let htmlContent = '<p><br></p>';
        if (contentMarkdown && contentMarkdown.trim() !== "") {
            if (typeof ExportManager !== 'undefined' && typeof ExportManager.parseMarkdownToHTML === 'function') {
                htmlContent = ExportManager.parseMarkdownToHTML(contentMarkdown.trim());
            } else {
                htmlContent = `<p>${UI.escapeHTML(contentMarkdown).replace(/\n/g, '<br>')}</p>`;
            }
        }

        // 3. Creazione del modello della nota
        const newNoteId = Store.generateId();
        const now = new Date().toISOString();
        const initialRevId = Store.generateId();

        const newNote = {
            id: newNoteId,
            parentId: parentId,
            title: cleanTitle,
            content: htmlContent,
            isMarked: !!isFavorite,
            expanded: true,
            createdAt: now,
            updatedAt: now,
            revId: initialRevId,
            _baseRevId: initialRevId,
            _isDraft: false,
            _isDirty: true
        };

        AppState.notes.push(newNote);

        // 4. Sincronizzazione con il database di sistema delle proprietà
        if (typeof AdvancedTable !== 'undefined' && typeof AdvancedTable.syncSystemPropertiesRow === 'function') {
            AdvancedTable.syncSystemPropertiesRow(newNoteId);
        }

        // 5. Aggiornamento interfaccia e persistenza
        if (typeof UI !== 'undefined' && typeof UI.renderTree === 'function') {
            UI.renderTree();
        }

        if (typeof Store !== 'undefined' && typeof Store.triggerAutoSave === 'function') {
            Store.triggerAutoSave(true);
        }

        return {
            success: true,
            operation: 'CREATE_NOTE',
            noteId: newNoteId,
            title: cleanTitle,
            parentTitle: parentNoteTitle || null
        };
    },

    /**
     * Modifica una nota esistente individuandola per titolo.
     * Permette di aggiornare titolo, sostituire o aggiungere contenuto in Markdown,
     * spostare la nota sotto un altro genitore o modificare lo stato preferito.
     */
    updateNote: async (targetTitle, { newTitle = null, contentMarkdown = null, appendContentMarkdown = null, newParentTitle = undefined, isFavorite = undefined }) => {
        if (!targetTitle || typeof targetTitle !== 'string') {
            throw new Error("Specificare il titolo della nota da modificare.");
        }

        const targetNote = AppState.notes.find(n => !n.deletedAt && (n.title || '').trim().toLowerCase() === targetTitle.trim().toLowerCase());
        if (!targetNote) {
            throw new Error(`Nota "${targetTitle}" non trovata o presente nel Cestino.`);
        }

        // 1. Aggiornamento Titolo
        if (newTitle !== null && typeof newTitle === 'string' && newTitle.trim() !== '') {
            targetNote.title = newTitle.trim();
        }

        // 2. Aggiornamento / Concatenazione Contenuto
        if (contentMarkdown !== null && typeof contentMarkdown === 'string') {
            if (typeof ExportManager !== 'undefined' && typeof ExportManager.parseMarkdownToHTML === 'function') {
                targetNote.content = ExportManager.parseMarkdownToHTML(contentMarkdown.trim());
            } else {
                targetNote.content = `<p>${UI.escapeHTML(contentMarkdown).replace(/\n/g, '<br>')}</p>`;
            }
        } else if (appendContentMarkdown !== null && typeof appendContentMarkdown === 'string' && appendContentMarkdown.trim() !== '') {
            let appendedHtml = '';
            if (typeof ExportManager !== 'undefined' && typeof ExportManager.parseMarkdownToHTML === 'function') {
                appendedHtml = ExportManager.parseMarkdownToHTML(appendContentMarkdown.trim());
            } else {
                appendedHtml = `<p>${UI.escapeHTML(appendContentMarkdown).replace(/\n/g, '<br>')}</p>`;
            }
            targetNote.content = (targetNote.content || '') + '<p><br></p>' + appendedHtml;
        }

        // 3. Spostamento Gerarchico (Parent)
        if (newParentTitle !== undefined) {
            if (newParentTitle === null || newParentTitle.trim() === '') {
                targetNote.parentId = null;
            } else {
                const newParent = AppState.notes.find(n => !n.deletedAt && (n.title || '').trim().toLowerCase() === newParentTitle.trim().toLowerCase());
                if (newParent) {
                    // Evita l'auto-riferimento gerarchico o loop diretti
                    if (newParent.id === targetNote.id) {
                        throw new Error("Una nota non può essere genitrice di se stessa.");
                    }
                    targetNote.parentId = newParent.id;
                    newParent.expanded = true;
                } else {
                    console.warn(`[AIBridge] Nuova nota genitore "${newParentTitle}" non trovata. Spostamento ignorato.`);
                }
            }
        }

        // 4. Stato Preferito
        if (isFavorite !== undefined) {
            targetNote.isMarked = !!isFavorite;
        }

        targetNote.updatedAt = new Date().toISOString();
        targetNote._isDirty = true;

        // 5. Reidratazione in diretta se la nota è attualmente aperta nell'editor
        if (AppState.currentNoteId === targetNote.id) {
            const titleInput = document.getElementById('noteTitle');
            const contentEl = document.getElementById('noteContent');

            if (titleInput && newTitle !== null) {
                titleInput.value = targetNote.title;
            }
            if (contentEl && (contentMarkdown !== null || appendContentMarkdown !== null)) {
                contentEl.innerHTML = targetNote.content || '<p><br></p>';
                if (typeof Editor !== 'undefined') {
                    if (Editor.hydrateMedia) Editor.hydrateMedia(contentEl);
                    if (Editor.saveSnapshot) Editor.saveSnapshot();
                }
                if (typeof WidgetManager !== 'undefined') {
                    WidgetManager.mountAll(contentEl);
                }
                if (typeof CitationManager !== 'undefined') {
                    CitationManager.renderLiveCitations();
                }
            }
            if (typeof UI !== 'undefined') {
                UI.updateBreadcrumb(targetNote);
                UI.renderInlineFootnotes();
                UI.updateMarkBtn(targetNote.isMarked);
            }
        }

        // 6. Aggiornamento albero e salvataggio su disco
        if (typeof UI !== 'undefined' && typeof UI.renderTree === 'function') {
            UI.renderTree();
        }

        if (typeof Store !== 'undefined' && typeof Store.triggerAutoSave === 'function') {
            Store.triggerAutoSave(true);
        }

        return {
            success: true,
            operation: 'UPDATE_NOTE',
            noteId: targetNote.id,
            title: targetNote.title,
            updatedAt: targetNote.updatedAt
        };
    },

    /**
     * Elimina una nota cercandola per titolo.
     * Di default esegue un Soft-Delete sicuro nel Cestino (ripristinabile con un click).
     * Se moveToTrash è impostato a false, esegue l'eliminazione definitiva con bonifica delle dipendenze.
     */
    deleteNote: async (targetTitle, { moveToTrash = true } = {}) => {
        if (!targetTitle || typeof targetTitle !== 'string') {
            throw new Error("Specificare il titolo della nota da eliminare.");
        }

        const targetNote = AppState.notes.find(n => !n.deletedAt && (n.title || '').trim().toLowerCase() === targetTitle.trim().toLowerCase());
        if (!targetNote) {
            throw new Error(`Nota "${targetTitle}" non trovata o già eliminata.`);
        }

        const noteId = targetNote.id;

        if (moveToTrash) {
            // Soft-Delete ricorsivo (incluso figlie)
            const now = Date.now();
            const traverse = (id) => {
                const n = Store.getNote(id);
                if (n) {
                    n.deletedAt = now;
                    n._isDirty = true;
                    if (typeof AdvancedTable !== 'undefined' && AdvancedTable.deleteSystemPropertiesRow) {
                        AdvancedTable.deleteSystemPropertiesRow(id);
                    }
                    AppState.notes.filter(child => child.parentId === id).forEach(child => traverse(child.id));
                }
            };
            traverse(noteId);
        } else {
            // Eliminazione fisica definitiva
            if (typeof UI !== 'undefined' && UI.Trash && typeof UI.Trash.forceHardDeleteRecursive === 'function') {
                UI.Trash.forceHardDeleteRecursive(noteId);
            } else {
                AppState.notes = AppState.notes.filter(n => n.id !== noteId && n.parentId !== noteId);
            }
        }

        // Se la nota eliminata era aperta a schermo, riporta l'interfaccia alla Home
        if (AppState.currentNoteId === noteId) {
            if (typeof UI !== 'undefined' && typeof UI.goHome === 'function') {
                UI.goHome();
            }
        }

        if (typeof UI !== 'undefined' && typeof UI.renderTree === 'function') {
            UI.renderTree();
        }

        if (typeof Store !== 'undefined' && typeof Store.triggerAutoSave === 'function') {
            Store.triggerAutoSave(true);
        }

        return {
            success: true,
            operation: moveToTrash ? 'SOFT_DELETE_NOTE' : 'HARD_DELETE_NOTE',
            deletedTitle: targetTitle,
            movedToTrash: moveToTrash
        };
    },

    /**
     * Esegue una mutazione transazionale su un Database guidata dall'IA.
     * Mappa i nomi delle colonne e dei record collegati negli ID interni, garantendo zero corruzioni.
     */
    applyDatabaseMutation: async (dbTitle, operation, matchCriteria, valuesPayload) => {
        let targetDbId = null;
        let dbState = null;

        if (typeof AppState.getRelationalDatabaseIds === 'function') {
            for (const id of AppState.getRelationalDatabaseIds()) {
                const s = AppState.databases[id];
                if (s && s.title && s.title.trim().toLowerCase() === dbTitle.trim().toLowerCase()) {
                    targetDbId = id;
                    dbState = s;
                    break;
                }
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