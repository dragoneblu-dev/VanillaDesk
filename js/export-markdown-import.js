/**
 * js/export-markdown-import.js
 * Sottomodulo di ExportManager dedicato all'Importazione e Parsing di file Markdown.
 * - Estrae i tag e le proprietà di pagina per l'integrazione con SYS_PROPERTIES_DB (getNoteTags, saveNoteTagsToSystemDB).
 * - Parser deterministico Frontmatter YAML Obsidian (parseYamlFrontmatter).
 * - Sincronizzazione automatica delle proprietà Frontmatter in SYS_PROPERTIES_DB (saveNotePropertiesToSystemDB).
 * - Estrazione integrata di tag YAML ed hashtag nel corpo del testo (extractTagsFromMarkdown).
 * - Interfaccia di apertura file e pipeline transazionale di creazione nota (importMarkdown, processMarkdownImport).
 * - Parser completo da Markdown a HTML (parseMarkdownToHTML, _parseMarkdownCellText) con tokenizzazione
 *   XML per blocchi di codice, parser per tabelle pipe e ricostruzione gerarchica delle liste/checklist.
 */

Object.assign(ExportManager, {

    // Recupera i tag di una specifica nota da SYS_PROPERTIES_DB
    getNoteTags: (noteId) => {
        if (!noteId || !AppState.databases) return [];
        const propsDb = AppState.databases['SYS_PROPERTIES_DB'];
        if (!propsDb || !Array.isArray(propsDb.rows)) return [];
        const sysRow = propsDb.rows.find(r => r.cells && r.cells['sys_c_note'] === noteId);
        if (!sysRow || !Array.isArray(sysRow.cells['sys_c_tags'])) return [];
        return sysRow.cells['sys_c_tags'].filter(t => t && String(t).trim() !== '');
    },

    // Salva i tag estratti da un testo Markdown direttamente in SYS_PROPERTIES_DB con parametro opzionale skipEnsure
    saveNoteTagsToSystemDB: (noteId, tagsArray, skipEnsure = false) => {
        if (!noteId || !tagsArray || tagsArray.length === 0) return;
        if (!skipEnsure && typeof AdvancedTable !== 'undefined') {
            AdvancedTable.ensureSystemPropertiesDB();
        }
        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
        if (!propsDb || !Array.isArray(propsDb.rows)) return;

        let sysRow = propsDb.rows.find(r => r.cells && r.cells['sys_c_note'] === noteId);
        if (!sysRow) {
            sysRow = {
                id: 'sys_r_' + noteId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                cells: { 'sys_c_note': noteId, 'sys_c_tags': [] }
            };
            propsDb.rows.push(sysRow);
        }

        if (!Array.isArray(sysRow.cells['sys_c_tags'])) {
            sysRow.cells['sys_c_tags'] = [];
        }

        if (!propsDb.selectOptions) propsDb.selectOptions = {};
        if (!Array.isArray(propsDb.selectOptions['sys_c_tags'])) {
            propsDb.selectOptions['sys_c_tags'] = [];
        }

        tagsArray.forEach(t => {
            // Pulizia difensiva: rimuove trattini residui, cancelletti, spazi e apici
            const cleanTag = String(t)
                .replace(/^[-#\s]+/, '')
                .replace(/["']/g, '')
                .trim();

            if (cleanTag) {
                if (!sysRow.cells['sys_c_tags'].includes(cleanTag)) {
                    sysRow.cells['sys_c_tags'].push(cleanTag);
                }
                if (!propsDb.selectOptions['sys_c_tags'].includes(cleanTag)) {
                    propsDb.selectOptions['sys_c_tags'].push(cleanTag);
                }
            }
        });
        sysRow.updatedAt = Date.now();
    },

    // =========================================================================
    // PARSER DETERMINISTICO FRONTMATTER YAML OBSIDIAN
    // Estrae tutte le proprietà scalari, liste, booleani, date, numeri e wikilinks
    // =========================================================================
    parseYamlFrontmatter: (yamlText) => {
        if (!yamlText || typeof yamlText !== 'string') return {};
        const lines = yamlText.split(/\r?\n/);
        const result = {};
        let currentKey = null;
        let currentList = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            // Rileva elemento di lista YAML indentato con trattino: "  - valore" o "- valore"
            const listMatch = line.match(/^\s*-\s+(.*)$/);
            if (listMatch && currentKey) {
                let itemVal = listMatch[1].trim();
                if ((itemVal.startsWith('"') && itemVal.endsWith('"')) || (itemVal.startsWith("'") && itemVal.endsWith("'"))) {
                    itemVal = itemVal.slice(1, -1).trim();
                }
                if (currentList) {
                    currentList.push(itemVal);
                } else {
                    currentList = [itemVal];
                    result[currentKey] = currentList;
                }
                continue;
            }

            // Rileva coppia chiave: valore
            const keyValMatch = line.match(/^([a-zA-Z0-9_\-\s]+?)\s*:(.*)$/);
            if (keyValMatch) {
                currentKey = keyValMatch[1].trim();
                currentList = null;
                let rawVal = keyValMatch[2].trim();

                if (!rawVal) {
                    // Inizio potenziale di una lista multilinea (es. tags: o aliases:)
                    result[currentKey] = [];
                    currentList = result[currentKey];
                } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
                    // Array inline: [item1, item2, ...] con parsing sicuro di virgolette e wikilinks
                    const inner = rawVal.slice(1, -1).trim();
                    if (!inner) {
                        result[currentKey] = [];
                    } else {
                        const items = [];
                        let buffer = '';
                        let inQuotes = false;
                        let quoteChar = '';
                        let inWiki = false;

                        for (let c = 0; c < inner.length; c++) {
                            const ch = inner[c];
                            if (!inQuotes && (ch === '"' || ch === "'")) {
                                inQuotes = true;
                                quoteChar = ch;
                            } else if (inQuotes && ch === quoteChar) {
                                inQuotes = false;
                            } else if (!inQuotes && ch === '[' && inner[c + 1] === '[') {
                                inWiki = true;
                                buffer += ch;
                                continue;
                            } else if (!inQuotes && ch === ']' && inner[c - 1] === ']') {
                                inWiki = false;
                                buffer += ch;
                                continue;
                            } else if (!inQuotes && !inWiki && ch === ',') {
                                let cleanItem = buffer.trim();
                                if ((cleanItem.startsWith('"') && cleanItem.endsWith('"')) || (cleanItem.startsWith("'") && cleanItem.endsWith("'"))) {
                                    cleanItem = cleanItem.slice(1, -1).trim();
                                }
                                if (cleanItem) items.push(cleanItem);
                                buffer = '';
                                continue;
                            }
                            buffer += ch;
                        }
                        if (buffer.trim()) {
                            let cleanItem = buffer.trim();
                            if ((cleanItem.startsWith('"') && cleanItem.endsWith('"')) || (cleanItem.startsWith("'") && cleanItem.endsWith("'"))) {
                                cleanItem = cleanItem.slice(1, -1).trim();
                            }
                            if (cleanItem) items.push(cleanItem);
                        }
                        result[currentKey] = items;
                    }
                } else {
                    // Valore scalare singolo (rimuove virgolette esterne se presenti)
                    if ((rawVal.startsWith('"') && rawVal.endsWith('"')) || (rawVal.startsWith("'") && rawVal.endsWith("'"))) {
                        rawVal = rawVal.slice(1, -1).trim();
                    }
                    result[currentKey] = rawVal;
                }
            }
        }

        return result;
    },

    // Salva tutte le proprietà estratte dal Frontmatter YAML in SYS_PROPERTIES_DB creando dinamicamente le colonne
    saveNotePropertiesToSystemDB: (noteId, propertiesObj, noteMap = null, skipEnsure = false) => {
        if (!noteId || !propertiesObj || typeof propertiesObj !== 'object') return;
        if (!skipEnsure && typeof AdvancedTable !== 'undefined') {
            AdvancedTable.ensureSystemPropertiesDB();
        }

        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
        if (!propsDb || !Array.isArray(propsDb.rows) || !Array.isArray(propsDb.columns)) return;

        let sysRow = propsDb.rows.find(r => r.cells && r.cells['sys_c_note'] === noteId);
        if (!sysRow) {
            sysRow = {
                id: 'sys_r_' + noteId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                cells: { 'sys_c_note': noteId, 'sys_c_tags': [] }
            };
            propsDb.rows.push(sysRow);
        }

        if (!propsDb.selectOptions) propsDb.selectOptions = {};
        if (!propsDb.selectColors) propsDb.selectColors = {};

        for (const [rawKey, rawVal] of Object.entries(propertiesObj)) {
            const cleanKey = rawKey.trim();
            if (!cleanKey) continue;

            const lowerKey = cleanKey.toLowerCase();

            // 1. Gestione Tag / Tags: indirizzati alla colonna nativa sys_c_tags
            if (lowerKey === 'tags' || lowerKey === 'tag') {
                const tagList = Array.isArray(rawVal) ? rawVal : [rawVal];
                ExportManager.saveNoteTagsToSystemDB(noteId, tagList, true);
                continue;
            }

            // Esclude chiavi di sistema interne
            if (lowerKey === 'id' || lowerKey === 'sys_c_note') continue;

            // 2. Controllo o creazione della colonna in SYS_PROPERTIES_DB
            let colDef = propsDb.columns.find(c => c.name.toLowerCase() === lowerKey || c.id.toLowerCase() === `prop_${lowerKey}`);
            
            // Rilevamento automatico del tipo di dato dal valore
            const inferColumnType = (val) => {
                if (typeof val === 'boolean') return 'checkbox';
                if (Array.isArray(val)) return 'multi-select';
                if (typeof val === 'number') return 'number';

                const str = String(val).trim();
                if (str.toLowerCase() === 'true' || str.toLowerCase() === 'false') return 'checkbox';
                if (/^\[\[(.*?)\]\]$/.test(str)) return 'note_link';
                if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return 'date';
                if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) return 'datetime';
                if (/^-?\d+(\.\d+)?$/.test(str)) return 'number';
                return 'text';
            };

            const inferredType = inferColumnType(rawVal);

            if (!colDef) {
                const newColId = 'prop_' + Store.generateId();
                colDef = {
                    id: newColId,
                    name: cleanKey,
                    type: inferredType,
                    width: inferredType === 'note_link' ? 220 : 180,
                    hidden: false
                };
                propsDb.columns.push(colDef);
            }

            // 3. Normalizzazione e assegnazione del valore nella cella
            if (colDef.type === 'note_link') {
                const rawStr = String(rawVal).trim();
                const wikiMatch = rawStr.match(/^\[\[\s*([^\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\s*\]\]$/);
                
                let targetNoteTitle = rawStr;
                let anchor = null;
                let label = null;

                if (wikiMatch) {
                    targetNoteTitle = wikiMatch[1].trim();
                    anchor = wikiMatch[2] ? wikiMatch[2].trim() : null;
                    label = wikiMatch[3] ? wikiMatch[3].trim() : null;
                }

                let targetNoteId = null;
                if (noteMap && typeof noteMap.get === 'function') {
                    targetNoteId = noteMap.get(targetNoteTitle.toLowerCase()) || null;
                }
                if (!targetNoteId && AppState.notes) {
                    const found = AppState.notes.find(n => !n.deletedAt && (n.title || '').trim().toLowerCase() === targetNoteTitle.toLowerCase());
                    if (found) targetNoteId = found.id;
                }

                sysRow.cells[colDef.id] = {
                    noteId: targetNoteId,
                    title: label || targetNoteTitle,
                    anchor: anchor,
                    refId: null
                };
            } else if (colDef.type === 'checkbox') {
                sysRow.cells[colDef.id] = (rawVal === true || String(rawVal).toLowerCase() === 'true' || String(rawVal).toLowerCase() === 'yes');
            } else if (colDef.type === 'number') {
                const n = parseFloat(String(rawVal).replace(',', '.'));
                sysRow.cells[colDef.id] = isNaN(n) ? '' : n;
            } else if (colDef.type === 'multi-select') {
                const arr = Array.isArray(rawVal) ? rawVal.map(String) : [String(rawVal)];
                sysRow.cells[colDef.id] = arr;

                if (!propsDb.selectOptions[colDef.id]) propsDb.selectOptions[colDef.id] = [];
                arr.forEach(optVal => {
                    const cleanOpt = optVal.trim();
                    if (cleanOpt && !propsDb.selectOptions[colDef.id].includes(cleanOpt)) {
                        propsDb.selectOptions[colDef.id].push(cleanOpt);
                    }
                });
            } else {
                sysRow.cells[colDef.id] = String(rawVal);
            }
        }

        sysRow.updatedAt = Date.now();
    },

    // Estrae i tag sia da Frontmatter YAML (inline o multilinea) che da hashtag nel corpo (#tag, #famiglia/figli)
    extractTagsFromMarkdown: (markdownText) => {
        const tags = new Set();
        if (!markdownText || typeof markdownText !== 'string') return [];

        // 1. Estrazione tramite il parser deterministico YAML
        const yamlMatch = markdownText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
        if (yamlMatch) {
            const parsedProps = ExportManager.parseYamlFrontmatter(yamlMatch[1]);
            for (const [key, val] of Object.entries(parsedProps)) {
                if (key.toLowerCase() === 'tags' || key.toLowerCase() === 'tag') {
                    const tagArray = Array.isArray(val) ? val : [val];
                    tagArray.forEach(t => {
                        const clean = String(t).replace(/^[-#\s]+/, '').replace(/["']/g, '').trim();
                        if (clean) tags.add(clean);
                    });
                }
            }
        }

        // 2. Estrazione da Hashtag nel corpo del testo (#progetto, #fase/1, #family/wife)
        const cleanNoCode = markdownText
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`]*`/g, '')
            .replace(/<[^>]+>/g, '');

        const tagRegex = /(?:^|\s)#([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ0-9_\-\/]*)/g;
        let match;
        while ((match = tagRegex.exec(cleanNoCode)) !== null) {
            const tagVal = match[1].trim();
            if (tagVal && !/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(tagVal)) {
                tags.add(tagVal);
            }
        }

        return Array.from(tags);
    },

    importMarkdown: async () => {
        try {
            if (window.showOpenFilePicker) {
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{ description: 'Markdown Files', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }],
                });
                const file = await fileHandle.getFile();
                const mdText = await file.text();
                
                const title = file.name.replace(/\.(md|markdown|txt)$/i, '');
                ExportManager.processMarkdownImport(mdText, title);
            } else {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.md,.markdown,.txt';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    const title = file.name.replace(/\.(md|markdown|txt)$/i, '');
                    const reader = new FileReader();
                    reader.onload = (event) => ExportManager.processMarkdownImport(event.target.result, title);
                    reader.readAsText(file);
                };
                input.click();
            }
        } catch (err) {
            if (err.name !== 'AbortError') alert("Errore apertura file Markdown: " + err.message);
        }
    },

    processMarkdownImport: (mdText, title) => {
        if (!mdText) return;

        // Estrazione di tutte le proprietà dal Frontmatter YAML e di tutti i tag
        const yamlMatch = mdText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
        const yamlProperties = yamlMatch ? ExportManager.parseYamlFrontmatter(yamlMatch[1]) : {};
        const extractedTags = ExportManager.extractTagsFromMarkdown(mdText);

        // Rimozione del Frontmatter prima di convertire l'HTML per non mostrare testo grezzo
        const cleanMd = mdText.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
        let htmlContent = ExportManager.parseMarkdownToHTML(cleanMd);
        if (typeof Editor !== 'undefined' && typeof Editor.minifyHTMLForStorage === 'function') {
            htmlContent = Editor.minifyHTMLForStorage(htmlContent);
        }

        const noteId = Store.generateId();
        const now = new Date().toISOString();
        
        const newNote = {
            id: noteId,
            parentId: AppState.currentNoteId || null, 
            title: title || "Nota Importata",
            content: htmlContent,
            isMarked: false,
            expanded: true,
            createdAt: now,
            updatedAt: now,
            revId: Store.generateId(),
            _baseRevId: Store.generateId(),
            _isDraft: false,
            _isDirty: true
        };
        
        AppState.notes.push(newNote);
        
        // Sincronizzazione atomica di tutte le proprietà Frontmatter e dei tag in SYS_PROPERTIES_DB
        if (typeof AdvancedTable !== 'undefined') {
            AdvancedTable.ensureSystemPropertiesDB();
        }

        if (Object.keys(yamlProperties).length > 0) {
            ExportManager.saveNotePropertiesToSystemDB(noteId, yamlProperties, null, true);
        }

        if (extractedTags.length > 0) {
            ExportManager.saveNoteTagsToSystemDB(noteId, extractedTags, true);
        } else if (Object.keys(yamlProperties).length === 0 && typeof AdvancedTable !== 'undefined') {
            AdvancedTable.syncSystemPropertiesRow(noteId);
        }

        if (typeof UI !== 'undefined') {
            if (typeof UI.renderTree === 'function') UI.renderTree();
            if (typeof UI.selectNote === 'function') UI.selectNote(noteId);
            if (typeof UI.showToast === 'function') UI.showToast(`File Markdown importato come nuova nota: "${title}"`, 'success');
        }
        
        if (typeof Store !== 'undefined' && typeof Store.triggerAutoSave === 'function') {
            Store.triggerAutoSave(true);
        }
    },

    _parseMarkdownCellText: (cellText) => {
        if (!cellText || cellText.trim() === '') return '<br>';
        let t = cellText.trim();
        t = t.replace(/<br\s*[\/]?>/gi, '<br>');
        
        // Conversione evidenziazione in stile VanillaDesk
        t = t.replace(/==(.*?)==/g, '<span class="hl-c5">$1</span>');
        t = t.replace(/<mark(?![^>]*class=["'][^"']*(?:search-highlight|active-highlight)[^"']*["'])[^>]*>(.*?)<\/mark>/gi, '<span class="hl-c5">$1</span>');

        t = t.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        t = t.replace(/\*(.*?)\*/g, '<i>$1</i>');
        t = t.replace(/~~(.*?)~~/g, '<s>$1</s>');
        t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
        t = t.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
        return t || '<br>';
    },

    parseMarkdownToHTML: (md) => {
        let html = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // 1. TOKENIZZAZIONE DEI BLOCCHI DI CODICE
        // Uso di marcatori XML isolati immuni alle regole di corsivo o grassetto Markdown
        const codeBlocks = [];
        html = html.replace(/```([\w-]*)[^\n]*\n([\s\S]*?)```/gm, (match, lang, code) => {
            const blockId = 'adv_code_' + Store.generateId();
            const cleanLang = lang || 'none';
            
            if (!AppState.databases) AppState.databases = {};
            AppState.databases[blockId] = { title: 'Codice Importato', language: cleanLang, content: code };

            const shell = `<div id="${blockId}" class="adv-widget-shell widget-type-code code-wrapper" data-widget-type="code" contenteditable="false"></div>`;
            
            codeBlocks.push(shell);
            return `\n\n<vd-code-token id="${codeBlocks.length - 1}"></vd-code-token>\n\n`;
        });

        // 2. TOKENIZZAZIONE DELLE TABELLE MARKDOWN (Pipe Tables)
        const tableBlocks = [];
        const lines = html.split('\n');
        const outputLines = [];
        let inTable = false;
        let tableBuffer = [];

        const isTableLine = (l) => {
            const trimmed = l.trim();
            return trimmed.includes('|') && (trimmed.startsWith('|') || trimmed.endsWith('|') || trimmed.split('|').length >= 3);
        };

        const isDelimiterLine = (l) => {
            const trimmed = l.trim().replace(/^\|/, '').replace(/\|$/, '');
            const parts = trimmed.split('|').map(p => p.trim());
            return parts.length > 0 && parts.every(p => /^:?-+:?$/.test(p));
        };

        const flushTableBuffer = () => {
            if (tableBuffer.length >= 2 && isDelimiterLine(tableBuffer[1])) {
                const headerLine = tableBuffer[0].trim().replace(/^\|/, '').replace(/\|$/, '');
                const headers = headerLine.split('|').map(h => h.trim());
                
                const dataLines = tableBuffer.slice(2);
                const stblId = 'stbl_' + Store.generateId();
                
                let tblHTML = `<div class="adv-widget-shell simple-table-wrapper" data-widget-type="simple-table" id="${stblId}" contenteditable="false">`;
                tblHTML += `<table class="table-striped" style="width:100%; table-layout:auto;"><tbody>`;
                
                // Intestazione
                tblHTML += `<tr>`;
                headers.forEach(h => {
                    tblHTML += `<th contenteditable="true">${ExportManager._parseMarkdownCellText(h)}</th>`;
                });
                tblHTML += `</tr>`;
                
                // Righe di dati
                dataLines.forEach(dLine => {
                    const cleanDLine = dLine.trim().replace(/^\|/, '').replace(/\|$/, '');
                    const cells = cleanDLine.split('|').map(c => c.trim());
                    
                    tblHTML += `<tr>`;
                    for (let c = 0; c < headers.length; c++) {
                        const cellContent = cells[c] !== undefined ? cells[c] : '';
                        tblHTML += `<td contenteditable="true">${ExportManager._parseMarkdownCellText(cellContent)}</td>`;
                    }
                    tblHTML += `</tr>`;
                });
                
                tblHTML += `</tbody></table></div>`;
                
                tableBlocks.push(tblHTML);
                outputLines.push(`\n\n<vd-table-token id="${tableBlocks.length - 1}"></vd-table-token>\n\n`);
            } else {
                tableBuffer.forEach(tblLine => outputLines.push(tblLine));
            }
            tableBuffer = [];
            inTable = false;
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (isTableLine(line)) {
                inTable = true;
                tableBuffer.push(line);
            } else {
                if (inTable) flushTableBuffer();
                outputLines.push(line);
            }
        }
        if (inTable) flushTableBuffer();

        html = outputLines.join('\n');

        // 3. PARSING OBSIDIAN COMMENTS %%testo%% ED INLINE FOOTNOTES ^[testo] -> APPUNTI NASCOSTI VANILLADESK
        const inlineNoteIcon = typeof Icons !== 'undefined' ? Icons.noteInline : '💬';
        const buildInlineNoteHtml = (commentText) => {
            const clean = commentText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n|\n|\r/g, '<br>').trim();
            return `\u200B<span class="inline-note-wrapper adv-inline-shell" data-widget-type="inline-note" contenteditable="false"><span class="inline-note-marker" contenteditable="false">${inlineNoteIcon}</span><span class="inline-note-data" style="display: none;">${clean}</span></span>\u200B`;
        };

        html = html.replace(/%%([\s\S]*?)%%/g, (match, text) => buildInlineNoteHtml(text));
        html = html.replace(/\^\[([\s\S]*?)\]/g, (match, text) => buildInlineNoteHtml(text));

        // 4. PARSING DELLE INTESTAZIONI CON ISOLAMENTO A BLOCCO RIGIDO (\n\n)
        html = html.replace(/^###### (.*?)$/gm, '\n\n<h6>$1</h6>\n\n');
        html = html.replace(/^##### (.*?)$/gm, '\n\n<h5>$1</h5>\n\n');
        html = html.replace(/^#### (.*?)$/gm, '\n\n<h4>$1</h4>\n\n');
        html = html.replace(/^### (.*?)$/gm, '\n\n<h3>$1</h3>\n\n');
        html = html.replace(/^## (.*?)$/gm, '\n\n<h2>$1</h2>\n\n');
        html = html.replace(/^# (.*?)$/gm, '\n\n<h1>$1</h1>\n\n');

        html = html.replace(/^>\s*(.*?)(?=\n|$)/gm, '<blockquote>$1</blockquote>');
        html = html.replace(/^---$/gm, '\n\n<hr>\n\n');

        // CONVERSIONE EVIDENZIAZIONI (Obsidian ==testo== e tag <mark>) IN STILE VANILLADESK
        html = html.replace(/==(.*?)==/g, '<span class="hl-c5">$1</span>');
        html = html.replace(/<mark(?![^>]*class=["'][^"']*(?:search-highlight|active-highlight)[^"']*["'])[^>]*>(.*?)<\/mark>/gi, '<span class="hl-c5">$1</span>');

        html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        html = html.replace(/\*(.*?)\*/g, '<i>$1</i>');
        html = html.replace(/__(.*?)__/g, '<b>$1</b>');
        html = html.replace(/_(.*?)_/g, '<i>$1</i>');
        html = html.replace(/~~(.*?)~~/g, '<s>$1</s>');

        html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1">');
        html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');

        // 5. PARSER DI LISTE GERARCHICO AD ALBERO (Supporto annidamento reale sotto il LI genitore)
        const rawLines = html.split('\n');
        const processedLines = [];

        const calculateIndentDepth = (rawIndent) => {
            if (!rawIndent) return 0;
            let depth = 0;
            for (let i = 0; i < rawIndent.length; i++) {
                if (rawIndent[i] === '\t') {
                    depth++;
                } else if (rawIndent[i] === ' ') {
                    let spaces = 1;
                    while (i + 1 < rawIndent.length && rawIndent[i + 1] === ' ') {
                        spaces++;
                        i++;
                    }
                    depth += Math.max(1, Math.floor(spaces / 2));
                }
            }
            return depth;
        };

        // Renderizza ricorsivamente un gruppo di nodi lista fratelli nidificando i figli dentro il rispettivo <li>
        const renderListChildren = (children, isNested = false) => {
            if (!children || children.length === 0) return '';
            let out = '';

            let i = 0;
            while (i < children.length) {
                const currentType = children[i].type;
                const startNum = children[i].startNum;
                const siblingGroup = [];

                while (i < children.length && children[i].type === currentType) {
                    siblingGroup.push(children[i]);
                    i++;
                }

                const listStyleAttr = isNested ? ' style="width: 100%;"' : '';

                if (currentType === 'checklist') {
                    out += `<ul class="adv-checklist"${listStyleAttr}>`;
                    siblingGroup.forEach(node => {
                        const checkedAttr = node.checked ? ' checked' : '';
                        const hasChildren = node.children && node.children.length > 0;
                        const liStyleAttr = hasChildren ? ' style="flex-wrap: wrap;"' : '';
                        out += `<li class="adv-checklist-item"${liStyleAttr}><input type="checkbox" class="adv-checklist-cb"${checkedAttr}><span class="checklist-text" contenteditable="true">${node.content}</span>`;
                        if (hasChildren) {
                            out += renderListChildren(node.children, true);
                        }
                        out += '</li>';
                    });
                    out += '</ul>';
                } else if (currentType === 'ol') {
                    const startAttr = startNum !== 1 ? ` start="${startNum}"` : '';
                    out += `<ol${startAttr}${listStyleAttr}>`;
                    siblingGroup.forEach(node => {
                        out += `<li>${node.content}`;
                        if (node.children && node.children.length > 0) {
                            out += renderListChildren(node.children, true);
                        }
                        out += '</li>';
                    });
                    out += '</ol>';
                } else {
                    out += `<ul${listStyleAttr}>`;
                    siblingGroup.forEach(node => {
                        out += `<li>${node.content}`;
                        if (node.children && node.children.length > 0) {
                            out += renderListChildren(node.children, true);
                        }
                        out += '</li>';
                    });
                    out += '</ul>';
                }
            }

            return out;
        };

        let currentListBuffer = [];

        const flushCurrentListBuffer = () => {
            if (currentListBuffer.length === 0) return;

            // Costruzione dell'albero gerarchico dei nodi di lista
            const virtualRoot = { depth: -1, children: [] };
            const nodeStack = [virtualRoot];

            currentListBuffer.forEach(item => {
                while (nodeStack.length > 1 && nodeStack[nodeStack.length - 1].depth >= item.depth) {
                    nodeStack.pop();
                }

                const parentNode = nodeStack[nodeStack.length - 1];
                const newNode = {
                    depth: item.depth,
                    type: item.type,
                    checked: item.checked,
                    startNum: item.startNum,
                    content: item.content,
                    children: []
                };

                parentNode.children.push(newNode);
                nodeStack.push(newNode);
            });

            // Generazione dell'HTML completo con corretta annidazione nei <li> padri
            const renderedHtml = renderListChildren(virtualRoot.children, false);
            processedLines.push('\n\n' + renderedHtml + '\n\n');
            currentListBuffer = [];
        };

        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            const trimmed = line.trim();

            if (!trimmed) {
                flushCurrentListBuffer();
                processedLines.push('');
                continue;
            }

            // Pattern Checklist: es. "- [x] Testo" o "\t- [ ] Testo"
            const checklistMatch = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s*(.*)$/);
            // Pattern Elenco Puntato: es. "- Testo" o "* Testo"
            const bulletMatch = !checklistMatch ? line.match(/^(\s*)[-*]\s+(.*)$/) : null;
            // Pattern Elenco Ordinato: es. "1. Testo" o "1) Testo"
            const orderedMatch = !checklistMatch && !bulletMatch ? line.match(/^(\s*)(\d+)[\.\)]\s+(.*)$/) : null;

            if (checklistMatch || bulletMatch || orderedMatch) {
                let rawIndent = '';
                let itemType = '';
                let itemContent = '';
                let isChecked = false;
                let startNum = 1;

                if (checklistMatch) {
                    rawIndent = checklistMatch[1];
                    itemType = 'checklist';
                    isChecked = checklistMatch[2].toLowerCase() === 'x';
                    itemContent = checklistMatch[3];
                } else if (bulletMatch) {
                    rawIndent = bulletMatch[1];
                    itemType = 'ul';
                    itemContent = bulletMatch[2];
                } else if (orderedMatch) {
                    rawIndent = orderedMatch[1];
                    itemType = 'ol';
                    startNum = parseInt(orderedMatch[2], 10) || 1;
                    itemContent = orderedMatch[3];
                }

                const lineDepth = calculateIndentDepth(rawIndent);
                currentListBuffer.push({
                    depth: lineDepth,
                    type: itemType,
                    checked: isChecked,
                    startNum: startNum,
                    content: itemContent
                });
            } else {
                flushCurrentListBuffer();
                processedLines.push(line);
            }
        }
        flushCurrentListBuffer();

        html = processedLines.join('\n');

        // 6. ISOLAMENTO DEI BLOCCHI E PACKAGING IN <P>
        const blocks = html.split(/\n{2,}/);
        html = blocks.map(block => {
            const t = block.trim();
            if (!t) return '';

            // Se è già un blocco strutturale HTML o un token, NON avvolgere in <p> e NON sostituire \n con <br>
            if (/^<(ul|ol|h[1-6]|blockquote|hr|vd-code-token|vd-table-token)/i.test(t)) {
                return t.replace(/>\s*\n\s*</g, '><');
            }

            return `<p>${t.replace(/\n/g, '<br>')}</p>`;
        }).join('');

        // 7. RE-INIEZIONE DETERMINISTICA DEI BLOCCHI CODICE E TABELLE
        html = html.replace(/<vd-code-token id="(\d+)"><\/vd-code-token>/gi, (match, idx) => {
            return codeBlocks[parseInt(idx, 10)] || '';
        });

        html = html.replace(/<vd-table-token id="(\d+)"><\/vd-table-token>/gi, (match, idx) => {
            return tableBlocks[parseInt(idx, 10)] || '';
        });

        return html;
    }
});