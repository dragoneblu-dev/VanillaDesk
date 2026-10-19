/**
 * js/export-markdown.js
 * Sottomodulo di ExportManager dedicato all'Esportazione Markdown e Vault Obsidian.
 * - Genera il Frontmatter YAML per Obsidian (buildNoteFrontmatter) estraendo le proprietà da SYS_PROPERTIES_DB.
 * - Converte il DOM vivo in Markdown fedele (htmlToMarkdown) con supporto nativo alla sintassi Obsidian:
 *   * Wikilinks bidirezionali ([[Nota]], [[Nota|Alias]], [[Nota#Capitolo|Alias]]).
 *   * Commenti inline Obsidian (%% testo %%).
 *   * Preservazione integrale multi-riga per blockquote, callout e citazioni live (> line).
 *   * Esportazione fedele dell'allineamento colonne nelle tabelle (:---, :---:, ---:).
 * - Esporta la singola nota o il documento cumulativo (generateMarkdownDocument).
 * - Esporta l'intero Workspace come Vault fisico nativo su disco tramite File System Access API (exportObsidianVault),
 *   omettendo la creazione di file .md ridondanti per le note utilizzate unicamente come cartelle.
 */

Object.assign(ExportManager, {

    // Helper per rilevare l'allineamento CSS di una singola cella
    _getCellAlignment: (cell) => {
        if (!cell) return 'left';
        const style = (cell.getAttribute('style') || '').toLowerCase();
        if (style.includes('text-align: center') || style.includes('text-align:center') || cell.classList.contains('text-center')) {
            return 'center';
        }
        if (style.includes('text-align: right') || style.includes('text-align:right') || cell.classList.contains('text-right')) {
            return 'right';
        }
        if (style.includes('text-align: left') || style.includes('text-align:left') || cell.classList.contains('text-left')) {
            return 'left';
        }
        if (cell.style && cell.style.textAlign) {
            const ta = cell.style.textAlign.toLowerCase();
            if (ta === 'center' || ta === 'right' || ta === 'left') return ta;
        }
        return 'left';
    },

    // Ispeziona la tabella HTML per estrarre l'allineamento di ciascuna colonna
    _getTableColumnAlignments: (table) => {
        if (!table || !table.rows || table.rows.length === 0) return [];
        const numCols = table.rows[0].cells.length;
        const alignments = [];
        for (let c = 0; c < numCols; c++) {
            let foundAlign = 'left';
            for (let r = 0; r < Math.min(table.rows.length, 3); r++) {
                const cell = table.rows[r]?.cells[c];
                if (cell) {
                    const align = ExportManager._getCellAlignment(cell);
                    if (align !== 'left') {
                        foundAlign = align;
                        break;
                    }
                }
            }
            alignments.push(foundAlign);
        }
        return alignments;
    },

    // Converte una tabella HTML in sintassi Markdown preservando l'allineamento delle colonne
    _tableToMarkdown: (table) => {
        if (!table || !table.rows || table.rows.length === 0) return '';
        let mdTable = '\n';
        const alignments = ExportManager._getTableColumnAlignments(table);

        Array.from(table.rows).forEach((row, i) => {
            let rowData = Array.from(row.cells).map(cell => (cell.innerText || cell.textContent || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim());
            mdTable += `| ${rowData.join(' | ')} |\n`;
            if (i === 0) {
                const delimiterRow = alignments.map(a => {
                    if (a === 'center') return ':---:';
                    if (a === 'right') return '---:';
                    return ':---';
                });
                mdTable += `| ${delimiterRow.join(' | ')} |\n`;
            }
        });
        return mdTable + '\n';
    },

    // Genera il blocco standard YAML Frontmatter completo per una nota estraendo i dati da SYS_PROPERTIES_DB
    // Il parametro includeTitle controlla se inserire o meno la chiave title (falso quando il nome file coincide con il titolo)
    buildNoteFrontmatter: (noteId, includeTitle = true) => {
        const note = typeof Store !== 'undefined' ? Store.getNote(noteId) : (AppState.notes ? AppState.notes.find(n => n.id === noteId) : null);
        if (!note) return "";

        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
        const sysRow = (propsDb && Array.isArray(propsDb.rows)) ? propsDb.rows.find(r => r.cells && r.cells['sys_c_note'] === noteId) : null;

        const lines = ["---"];

        // 1. Proprietà canoniche di base della nota
        const escapeYamlString = (str) => String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        
        if (includeTitle && note.title) {
            lines.push(`title: "${escapeYamlString(note.title)}"`);
        }
        if (note.createdAt) lines.push(`created: "${note.createdAt}"`);
        if (note.updatedAt) lines.push(`updated: "${note.updatedAt}"`);
        if (note.isMarked) lines.push(`favorite: true`);

        // 2. Tag (sys_c_tags)
        const tags = ExportManager.getNoteTags(noteId);
        if (tags.length > 0) {
            lines.push("tags:");
            tags.forEach(t => {
                const clean = String(t).replace(/^[-#\s]+/, '').replace(/["']/g, '').trim();
                if (clean) lines.push(`  - ${clean}`);
            });
        }

        // 3. Tutte le altre proprietà e colonne censite in SYS_PROPERTIES_DB
        if (propsDb && Array.isArray(propsDb.columns) && sysRow && sysRow.cells) {
            propsDb.columns.forEach(col => {
                if (col.id === 'sys_c_note' || col.id === 'sys_c_tags') return;

                const val = sysRow.cells[col.id];
                if (val === undefined || val === null || val === '') return;
                if (Array.isArray(val) && val.length === 0) return;

                const colKey = col.name.replace(/[:\n\r]/g, '_').trim();
                if (!colKey) return;

                if (col.type === 'note_link') {
                    let targetTitle = '';
                    if (typeof val === 'object' && val !== null) {
                        targetTitle = val.title || '';
                        if (!targetTitle && val.noteId && typeof Store !== 'undefined') {
                            const tn = Store.getNote(val.noteId);
                            if (tn) targetTitle = tn.title;
                        }
                    } else {
                        targetTitle = String(val);
                    }

                    if (targetTitle) {
                        lines.push(`${colKey}: "[[${targetTitle.replace(/"/g, '')}]]"`);
                    }
                } else if (col.type === 'checkbox') {
                    lines.push(`${colKey}: ${val === true || String(val).toLowerCase() === 'true'}`);
                } else if (col.type === 'number') {
                    const num = Number(val);
                    lines.push(`${colKey}: ${isNaN(num) ? 0 : num}`);
                } else if (col.type === 'date' || col.type === 'datetime') {
                    if (typeof val === 'object' && val !== null) {
                        const s = val.start || '';
                        const e = val.end || '';
                        if (s && e) lines.push(`${colKey}: "${s} ➔ ${e}"`);
                        else if (s) lines.push(`${colKey}: "${s}"`);
                    } else {
                        lines.push(`${colKey}: "${val}"`);
                    }
                } else if (Array.isArray(val)) {
                    lines.push(`${colKey}:`);
                    val.forEach(item => {
                        lines.push(`  - "${escapeYamlString(item)}"`);
                    });
                } else {
                    const strVal = String(val).trim();
                    if (/^[0-9]+(\.[0-9]+)?$/.test(strVal) || strVal === 'true' || strVal === 'false') {
                        lines.push(`${colKey}: ${strVal}`);
                    } else {
                        lines.push(`${colKey}: "${escapeYamlString(strVal)}"`);
                    }
                }
            });
        }

        // Se non ci sono proprietà oltre a "---", non emette frontmatter vuoto
        if (lines.length <= 1) {
            return "";
        }

        lines.push("---\n\n");
        return lines.join("\n");
    },

    generateMarkdownDocument: (title, flatList, includeImages) => {
        let md = "";

        // Se esportiamo una singola nota, generiamo il Frontmatter YAML privo di titolo
        // e omettiamo il titolo nel corpo del documento (il nome file coinciderà con il titolo)
        if (flatList.length === 1) {
            const singleNote = flatList[0].note;
            md += ExportManager.buildNoteFrontmatter(singleNote.id, false);
            md += ExportManager.htmlToMarkdown(singleNote.content || '', includeImages, true) + `\n`;
        } else {
            md += `# ${title}\n\n*Generato il: ${new Date().toLocaleString('it-IT')}*\n\n---\n\n`;

            if (flatList.length > 1) {
                md += `## Indice\n`;
                flatList.forEach((item) => {
                    const indent = "  ".repeat(item.level);
                    const anchor = item.note.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                    md += `${indent}- [${item.note.title}](#${anchor})\n`;
                });
                md += `\n---\n\n`;
            }

            flatList.forEach((item) => {
                const headingLevel = Math.min(item.level + 1, 6);
                const tags = ExportManager.getNoteTags(item.note.id);
                let tagBlock = "";
                if (tags.length > 0) {
                    tagBlock = `${tags.map(t => `#${t.replace(/\s+/g, '_')}`).join(' ')}\n\n`;
                }

                md += `${'#'.repeat(headingLevel)} ${item.note.title}\n\n`;
                if (tagBlock) md += tagBlock;
                md += ExportManager.htmlToMarkdown(item.note.content || '', includeImages, true) + `\n\n---\n\n`;
            });
        }

        // Normalizzazione globale caratteri non-breaking space prima del salvataggio
        md = md.replace(/\u00A0/g, ' ').replace(/\u200B/g, '');

        const blob = new Blob(["\uFEFF" + md], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.style.display = "none";
        link.setAttribute("href", url);
        link.setAttribute("download", `${title.replace(/[^a-zA-Z0-9]/g, '_')}.md`);
        document.body.appendChild(link);
        
        link.click();
        
        setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        }, 300);
    },

    // =========================================================================
    // MOTORE DI ESPORTAZIONE VAULT OBSIDIAN FISICO
    // Ricrea l'albero delle directory, i file .md con Frontmatter e copia gli asset
    // =========================================================================
    exportObsidianVault: async () => {
        try {
            if (!window.showDirectoryPicker) {
                alert("Il tuo browser non supporta la scrittura su cartella fisica per il Vault. Usa un browser Chromium (Chrome, Edge, Brave, Opera).");
                return;
            }

            const targetDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            if (!targetDirHandle) return;

            const sanitizeFolderName = (name) => {
                return (name || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Senza Titolo';
            };

            const aliveNotes = AppState.notes.filter(n => !n.deletedAt);
            if (aliveNotes.length === 0) {
                alert("Il Workspace corrente non contiene note da esportare.");
                return;
            }

            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast("Inizializzazione esportazione Vault Obsidian...", "info");
            }

            // 1. Mappa Note ID -> Directory Handle
            const dirHandleMap = new Map();
            dirHandleMap.set('root', targetDirHandle);

            // Costruisci le cartelle per le note che hanno figli
            const notesWithChildren = new Set();
            aliveNotes.forEach(n => {
                if (n.parentId) notesWithChildren.add(n.parentId);
            });

            // Calcola il percorso delle cartelle procedendo per profondità
            const createFolderHierarchy = async (parentId, currentHandle) => {
                const children = aliveNotes.filter(n => n.parentId === parentId);
                for (const child of children) {
                    if (notesWithChildren.has(child.id)) {
                        const folderName = sanitizeFolderName(child.title);
                        const subDirHandle = await currentHandle.getDirectoryHandle(folderName, { create: true });
                        dirHandleMap.set(child.id, subDirHandle);
                        await createFolderHierarchy(child.id, subDirHandle);
                    }
                }
            };

            await createFolderHierarchy(null, targetDirHandle);

            // Helper per determinare se una nota contenitore è priva di contenuti propri
            const isNoteContentEmpty = (content) => {
                if (!content || typeof content !== 'string') return true;
                const temp = document.createElement('div');
                temp.innerHTML = content;
                if (temp.querySelector('img, audio, iframe, table, .adv-widget-shell, input, svg, pre, hr')) {
                    return false;
                }
                const text = temp.textContent.replace(/[\u200B\uFEFF\u00A0\s\n\r]/g, '');
                return text === '';
            };

            // 2. Scrittura dei file Markdown (.md)
            let exportedNotesCount = 0;

            for (const note of aliveNotes) {
                // Se la nota è utilizzata unicamente come cartella (ha sotto-note) e non ha contenuti testuali o widget,
                // non creiamo un file .md ridondante: la cartella fisica nel filesystem è già stata creata.
                if (notesWithChildren.has(note.id) && isNoteContentEmpty(note.content)) {
                    continue;
                }

                const parentHandle = note.parentId ? (dirHandleMap.get(note.parentId) || targetDirHandle) : targetDirHandle;
                const fileName = sanitizeFolderName(note.title) + '.md';

                // Genera Frontmatter YAML completo con proprietà di SYS_PROPERTIES_DB senza duplicare title nel corpo
                let mdContent = ExportManager.buildNoteFrontmatter(note.id, false);
                // forObsidian = true abilita wikilink [[...]], commenti %%...%% e callout multi-riga
                mdContent += ExportManager.htmlToMarkdown(note.content || '', true, true);

                // Normalizzazione globale caratteri non-breaking space prima della scrittura del file
                mdContent = mdContent.replace(/\u00A0/g, ' ').replace(/\u200B/g, '');

                const fileHandle = await parentHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write("\uFEFF" + mdContent);
                await writable.close();

                exportedNotesCount++;
            }

            // 3. Copia fisica degli Asset locali nella cartella assets/ del Vault
            let copiedAssetsCount = 0;
            if (AppState.assetsHandle) {
                try {
                    const vaultAssetsDir = await targetDirHandle.getDirectoryHandle('assets', { create: true });
                    for await (const entry of AppState.assetsHandle.values()) {
                        if (entry.kind === 'file') {
                            const file = await entry.getFile();
                            const targetFileHandle = await vaultAssetsDir.getFileHandle(entry.name, { create: true });
                            const writable = await targetFileHandle.createWritable();
                            await writable.write(file);
                            await writable.close();
                            copiedAssetsCount++;
                        }
                    }
                } catch (assetErr) {
                    console.warn("[OBSIDIAN EXPORT] Copia asset non riuscita o cartella vuota:", assetErr);
                }
            }

            const successMsg = `Vault Obsidian esportato con successo!\nScritte ${exportedNotesCount} note e copiati ${copiedAssetsCount} allegati in "${targetDirHandle.name}".`;
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast(successMsg, "success");
            } else {
                alert(successMsg);
            }

        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Errore esportazione Vault Obsidian:", err);
                alert("Errore durante l'esportazione del Vault: " + err.message);
            }
        }
    },

    htmlToMarkdown: (html, includeImages = true, forObsidian = true) => {
        if (!html) return "";
        const temp = document.createElement('div');
        temp.innerHTML = html;

        ExportManager._hydrateCitationsForExport(temp);

        temp.querySelectorAll('.adv-bookmark-marker').forEach(marker => marker.remove());

        temp.querySelectorAll('.adv-copy-snippet').forEach(snippet => {
            const textNode = snippet.querySelector('.snippet-text');
            const text = textNode ? textNode.innerText : '';
            snippet.outerHTML = `\`${text}\``;
        });

        // Conversione semantica delle pillole hashtag in markdown hashtag naturale (#tag)
        temp.querySelectorAll('.tag-hash').forEach(span => {
            const raw = span.textContent.trim();
            span.outerHTML = raw;
        });

        // 1. CONVERSIONE LINK INTERNI E FILE LINK (Supporto nativo Wikilink per Obsidian)
        temp.querySelectorAll('a.internal-link').forEach(link => {
            const noteId = link.getAttribute('data-note-id');
            const targetNote = typeof Store !== 'undefined' ? Store.getNote(noteId) : null;
            const targetTitle = targetNote ? targetNote.title : link.textContent.trim();
            const anchor = link.getAttribute('data-anchor');
            const label = link.textContent.trim();

            let wiki = '';
            if (anchor) {
                if (label && label !== targetTitle && label !== `${targetTitle} > ${anchor}` && label !== anchor) {
                    wiki = `[[${targetTitle}#${anchor}|${label}]]`;
                } else {
                    wiki = `[[${targetTitle}#${anchor}]]`;
                }
            } else {
                if (label && label !== targetTitle) {
                    wiki = `[[${targetTitle}|${label}]]`;
                } else {
                    wiki = `[[${targetTitle}]]`;
                }
            }
            link.outerHTML = wiki;
        });

        temp.querySelectorAll('a.file-link').forEach(link => {
            const path = link.getAttribute('data-file-path') || '';
            const label = link.textContent.replace(/^📄\s*/, '').trim();
            link.outerHTML = `[${label}](${path})`;
        });

        // 2. CONVERSIONE NOTE INLINE (%% commento %% per Obsidian, ^[nota] per markdown generico)
        temp.querySelectorAll('.inline-note-wrapper').forEach(wrapper => {
            const dataSpan = wrapper.querySelector('.inline-note-data');
            let text = dataSpan ? dataSpan.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') : '';
            
            if (!text) {
                const marker = wrapper.querySelector('.inline-note-marker');
                text = marker ? (marker.getAttribute('data-tooltip') || '').replace(/<br\s*\/?>/gi, '\n') : '';
            }
            const cleanText = text.trim();
            wrapper.outerHTML = forObsidian ? `%% ${cleanText} %%` : `^[${cleanText}]`;
        });

        temp.querySelectorAll('.inline-note-marker[data-tooltip]').forEach(marker => {
            const text = marker.getAttribute('data-tooltip') || '';
            const cleanText = text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
            marker.outerHTML = forObsidian ? `%% ${cleanText} %%` : `^[${cleanText}]`;
        });

        // TOKENIZZAZIONE PROTETTA DEI BLOCCHI DI CODICE
        const protectedCodeTokens = new Map();
        let codeTokenCounter = 0;

        if (typeof WidgetManager !== 'undefined') {
            const widgets = Array.from(temp.querySelectorAll(WidgetManager.blockSelector)).reverse();
            
            widgets.forEach(wrapper => {
                let type = wrapper.getAttribute('data-widget-type');
                
                if (!type) {
                    if (wrapper.classList.contains('adv-journal-wrapper')) type = 'journal';
                    else if (wrapper.classList.contains('code-wrapper')) type = 'code';
                    else if (wrapper.classList.contains('adv-action-button-wrapper')) type = 'buttonbar';
                    else if (wrapper.classList.contains('block-citation')) type = 'citation';
                    else type = 'database';
                }
                
                const trueId = wrapper.id.split('_cited_')[0];

                if (type === 'buttonbar') {
                    try {
                        const state = AppState.databases[trueId] || {};
                        if (state && state.buttons) {
                            const labels = state.buttons.map(b => `[${b.label || 'Pulsante'}]`).join(' ');
                            wrapper.outerHTML = `\n*[Barra Pulsanti: ${labels}]*\n\n`;
                        } else {
                            wrapper.outerHTML = `\n*[Barra Pulsanti vuota]*\n\n`;
                        }
                    } catch(e) { wrapper.outerHTML = "\n*[Barra Pulsanti rimossa]*\n"; }
                } else if (type === 'database' || type === 'pivot') {
                    try {
                        const state = AppState.databases[trueId];
                        if (!state || !AppState.isRelationalTable(state)) throw new Error();
                        
                        const originalDbState = state.isLinkedView || state.isPivot ? AppState.databases[state.sourceTableId] : null;
                        const originalTitle = originalDbState ? originalDbState.title : state.title;

                        if (state.isPivot && state.chartConfig && state.chartConfig.visible) {
                            wrapper.outerHTML = `\n*[Grafico relativo al database: "${originalTitle || 'Sconosciuto'}"]*\n\n`;
                            return;
                        }
                        
                        let viewRows = [];
                        const renderCache = {};
                        state.rows.forEach(r => viewRows.push(AdvancedTable.buildVirtualRow(trueId, r, state, renderCache)));
                        viewRows = AdvancedTable.filterRows(viewRows, state);
                        viewRows = AdvancedTable.sortRows(viewRows, state);
                        
                        let mdTable = `\n**${state.title || 'Database'}**\n\n`;
                        const visibleCols = state.columns.filter(c => !c.hidden);

                        mdTable += `| ${visibleCols.map(c => c.name.replace(/\|/g, '\\|')).join(' | ')} |\n`;
                        
                        // Generazione riga delimitatore con rispetto allineamento colonne
                        const dbDelimiters = visibleCols.map(c => {
                            const a = c.align || (c.type === 'number' ? 'right' : 'left');
                            if (a === 'center') return ':---:';
                            if (a === 'right') return '---:';
                            return ':---';
                        });
                        mdTable += `| ${dbDelimiters.join(' | ')} |\n`;

                        viewRows.forEach(r => {
                            const rowData = visibleCols.map(c => {
                                let val = r.virtualCells[c.id];
                                let displayVal = AdvancedTable.getFormatDisplayValue(c, val);
                                return String(displayVal || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
                            });
                            mdTable += `| ${rowData.join(' | ')} |\n`;
                        });
                        wrapper.outerHTML = mdTable + '\n';
                    } catch(e) { wrapper.outerHTML = "\n*[Database non esportabile]*\n"; }
                } else if (type === 'journal') {
                    try {
                        const state = AppState.databases[trueId] || {};
                        const title = state.title || 'Diario / Log';
                        let mdJournal = `\n**${title}**\n\n`;

                        const sorted = [...(state.entries || [])].sort((a,b) => a.timestamp - b.timestamp);
                        let currentDate = '';
                        sorted.forEach(entry => {
                            if (entry.dateStr !== currentDate) {
                                mdJournal += `\n**${entry.dateStr}**\n`;
                                currentDate = entry.dateStr;
                            }
                            const check = entry.endTime ? '[x]' : '[ ]';
                            let text = entry.content.replace(/<[^>]*>?/gm, '').trim(); 
                            mdJournal += `- ${check} \`${entry.timeStr}\` ${text}\n`;
                        });
                        wrapper.outerHTML = mdJournal + '\n';
                    } catch(e) { wrapper.outerHTML = "\n*[Diario non esportabile]*\n"; }
                } else if (type === 'code') {
                    try {
                        const state = AppState.databases[trueId] || {};
                        const lang = state.language || '';
                        const codeText = state.content || '';
                        const title = state.title || '';

                        let codeBlockMd = `\`\`\`${lang === 'none' ? '' : lang}\n${codeText}\n\`\`\`\n`;
                        if (title && title !== 'Codice') {
                            codeBlockMd = `**${title}**\n` + codeBlockMd;
                        }

                        const tokenKey = `%%VD_PROTECTED_CODE_${codeTokenCounter++}%%`;
                        protectedCodeTokens.set(tokenKey, codeBlockMd);
                        wrapper.outerHTML = `\n\n${tokenKey}\n\n`;
                    } catch(e) { wrapper.outerHTML = "\n*[Codice rimosso]*\n"; }
                } else if (type === 'citation') {
                    const body = wrapper.querySelector('.citation-body');
                    const titleNode = wrapper.querySelector('.adv-table-title');
                    const citTitle = titleNode ? titleNode.innerText : 'Citazione';
                    
                    if (body) {
                        wrapper.outerHTML = `<blockquote><b>Riferimento: ${citTitle}</b><br>${body.innerHTML}</blockquote>`;
                    } else {
                        wrapper.outerHTML = `<blockquote><b>Riferimento: ${citTitle}</b><br>[Contenuto mancante]</blockquote>`;
                    }
                }
            });
        }

        // Tabelle HTML semplici (fuori dai blockquote)
        temp.querySelectorAll('table:not(.adv-table)').forEach(table => {
            table.outerHTML = ExportManager._tableToMarkdown(table);
        });

        // CONVERSIONE RICORSIVA DELLE LISTE E DELLE CHECKLIST NEL DOM
        const convertListElementToMarkdown = (listEl, depth = 0) => {
            let mdOutput = '';
            const indent = '\t'.repeat(depth);
            const isOrdered = listEl.tagName === 'OL';
            let orderIndex = parseInt(listEl.getAttribute('start'), 10) || 1;

            const children = Array.from(listEl.children);
            children.forEach(li => {
                if (li.tagName !== 'LI') return;

                const isChecklist = li.classList.contains('adv-checklist-item') || !!li.querySelector('.adv-checklist-cb');
                const cb = li.querySelector('.adv-checklist-cb, input[type="checkbox"]');
                const textSpan = li.querySelector('.checklist-text');

                let prefix = '';
                if (isChecklist) {
                    const isChecked = cb && (cb.checked || cb.hasAttribute('checked'));
                    prefix = isChecked ? '- [x] ' : '- [ ] ';
                } else if (isOrdered) {
                    prefix = `${orderIndex}. `;
                    orderIndex++;
                } else {
                    prefix = '- ';
                }

                let itemClone = li.cloneNode(true);
                itemClone.querySelectorAll('ul, ol, input[type="checkbox"]').forEach(nested => nested.remove());

                let itemHtml = textSpan ? textSpan.innerHTML : itemClone.innerHTML;
                itemHtml = itemHtml.replace(/<br\s*\/?>/gi, ' ');
                itemHtml = itemHtml.replace(/<span[^>]*class=["'][^"']*hl-c\d+[^"']*["'][^>]*>(.*?)<\/span>/gi, '==$1==');
                itemHtml = itemHtml.replace(/<mark(?![^>]*class=["'][^"']*(?:search-highlight|active-highlight)[^"']*["'])[^>]*>(.*?)<\/mark>/gi, '==$1==');
                itemHtml = itemHtml.replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gi, '**$2**');
                itemHtml = itemHtml.replace(/<(i|em)[^>]*>(.*?)<\/\1>/gi, '*$2*');
                itemHtml = itemHtml.replace(/<(s|strike)[^>]*>(.*?)<\/\1>/gi, '~~$2~~');
                itemHtml = itemHtml.replace(/`([^`]+)`/g, '`$1`');
                itemHtml = itemHtml.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
                itemHtml = itemHtml.replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
                itemHtml = itemHtml.replace(/<[^>]+>/g, '').trim();

                mdOutput += `${indent}${prefix}${itemHtml}\n`;

                const nestedLists = Array.from(li.children).filter(child => child.tagName === 'UL' || child.tagName === 'OL');
                nestedLists.forEach(nestedList => {
                    mdOutput += convertListElementToMarkdown(nestedList, depth + 1);
                });
            });

            return mdOutput;
        };

        // Liste radice fuori dai blockquote
        const rootLists = Array.from(temp.querySelectorAll('ul, ol')).filter(l => !l.parentElement.closest('ul, ol, blockquote'));
        rootLists.forEach(rootList => {
            const listMd = convertListElementToMarkdown(rootList, 0);
            const placeholder = document.createElement('div');
            placeholder.className = '__vd_list_md_placeholder__';
            placeholder.textContent = '\n' + listMd.trimEnd() + '\n\n';
            rootList.parentNode.replaceChild(placeholder, rootList);
        });

        // 3. CONVERSIONE MULTI-RIGA DEI BLOCKQUOTE E CALLOUT
        // Garantisce che ogni singola riga interna mantenga il prefisso '> ' e che elenchi/paragrafi/tabelle non vengano schiacciati
        const convertBlockquoteToMarkdown = (bq) => {
            const header = bq.querySelector('.citation-header');
            if (header) header.remove();

            const clone = bq.cloneNode(true);

            // Risolvi tabelle interne al blockquote
            clone.querySelectorAll('table:not(.adv-table)').forEach(table => {
                table.outerHTML = ExportManager._tableToMarkdown(table);
            });

            // Risolvi liste interne al blockquote
            const innerLists = Array.from(clone.querySelectorAll('ul, ol')).filter(l => !l.parentElement.closest('ul, ol'));
            innerLists.forEach(l => {
                const listMd = convertListElementToMarkdown(l, 0);
                const placeholder = document.createElement('div');
                placeholder.textContent = '\n' + listMd.trimEnd() + '\n';
                l.parentNode.replaceChild(placeholder, l);
            });

            // Risolvi tag di codice inline
            clone.querySelectorAll('code').forEach(c => {
                c.outerHTML = '`' + c.textContent + '`';
            });

            // Risolvi formattazione inline all'interno della citazione
            clone.querySelectorAll('.hl-c5, mark').forEach(m => { m.outerHTML = `==${m.textContent}==`; });
            clone.querySelectorAll('b, strong').forEach(b => { b.outerHTML = `**${b.textContent}**`; });
            clone.querySelectorAll('i, em').forEach(i => { i.outerHTML = `*${i.textContent}*`; });
            clone.querySelectorAll('s, strike, del').forEach(s => { s.outerHTML = `~~${s.textContent}~~`; });

            // Risolvi link esterni residui nel blockquote
            clone.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href') || '';
                const txt = a.textContent.trim();
                a.outerHTML = `[${txt}](${href})`;
            });

            // Risolvi immagini nel blockquote
            clone.querySelectorAll('img').forEach(img => {
                const ref = img.getAttribute('data-image-ref');
                const src = ref ? ('assets/' + ref) : (img.getAttribute('src') || '');
                img.outerHTML = `![${img.getAttribute('alt') || 'Immagine'}](${src})`;
            });

            // Risolvi paragrafi e a capo
            clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
            clone.querySelectorAll('p, div').forEach(p => {
                p.prepend('\n');
                p.append('\n');
            });

            // Estrazione del testo pulito multi-riga
            let rawText = clone.textContent || clone.innerText || '';
            rawText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

            let lines = rawText.split('\n').map(l => l.trimEnd());
            while (lines.length > 0 && lines[0].trim() === '') lines.shift();
            while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

            if (lines.length === 0) return '\n> \n\n';

            // Preserva o ricostruisce la sintassi del Callout Obsidian se presente in testa
            if (forObsidian) {
                const calloutBoldMatch = lines[0].match(/^\*\*\[([a-zA-Z]+)\]\s*(.*?)\*\*$/);
                const calloutBracketMatch = !calloutBoldMatch ? lines[0].match(/^\[!([a-zA-Z]+)\]\s*(.*)$/) : null;
                const calloutPlainMatch = (!calloutBoldMatch && !calloutBracketMatch) ? lines[0].match(/^\[([a-zA-Z]+)\]\s*(.*)$/) : null;

                if (calloutBoldMatch) {
                    const type = calloutBoldMatch[1].toUpperCase();
                    const title = calloutBoldMatch[2].trim();
                    lines[0] = title ? `[!${type}] ${title}` : `[!${type}]`;
                } else if (calloutBracketMatch) {
                    const type = calloutBracketMatch[1].toUpperCase();
                    const title = calloutBracketMatch[2].trim();
                    lines[0] = title ? `[!${type}] ${title}` : `[!${type}]`;
                } else if (calloutPlainMatch) {
                    const type = calloutPlainMatch[1].toUpperCase();
                    const title = calloutPlainMatch[2].trim();
                    lines[0] = title ? `[!${type}] ${title}` : `[!${type}]`;
                }

                // Rimuove eventuale riga vuota immediatamente successiva all'header per mantenere compatto il callout
                if (lines.length > 2 && lines[1].trim() === '' && lines[0].startsWith('[!')) {
                    lines.splice(1, 1);
                }
            }

            // Applica il prefisso '> ' ad ogni singola riga
            const quotedLines = lines.map(line => {
                if (line.trim() === '') return '>';
                return `> ${line}`;
            });

            return '\n' + quotedLines.join('\n') + '\n\n';
        };

        temp.querySelectorAll('blockquote').forEach(bq => {
            const mdQuote = convertBlockquoteToMarkdown(bq);
            bq.outerHTML = mdQuote;
        });

        let htmlStr = temp.innerHTML;
        htmlStr = htmlStr.replace(/<br\s*\/?>/gi, '\n');
        
        // Conversione evidenziazioni
        htmlStr = htmlStr.replace(/<span[^>]*class=["'][^"']*hl-c\d+[^"']*["'][^>]*>(.*?)<\/span>/gi, '==$1==');
        htmlStr = htmlStr.replace(/<mark(?![^>]*class=["'][^"']*(?:search-highlight|active-highlight)[^"']*["'])[^>]*>(.*?)<\/mark>/gi, '==$1==');

        htmlStr = htmlStr.replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gi, '**$2**');
        htmlStr = htmlStr.replace(/<(i|em)[^>]*>(.*?)<\/\1>/gi, '*$2*');
        htmlStr = htmlStr.replace(/<(s|strike)[^>]*>(.*?)<\/\1>/gi, '~~$2~~');
        htmlStr = htmlStr.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
        
        // Link web esterni residui
        htmlStr = htmlStr.replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

        if (includeImages) {
            htmlStr = htmlStr.replace(/<img[^>]*data-image-ref=["']([^"']+)["'][^>]*>/gi, '![Immagine](assets/$1)');
            htmlStr = htmlStr.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (match, src) => {
                if(match.includes('data-image-ref')) return match; 
                return `![Immagine](${src})`;
            });
        } else {
            htmlStr = htmlStr.replace(/<img[^>]*>/gi, '');
        }

        for (let i = 1; i <= 6; i++) {
            const regex = new RegExp(`<h${i}[^>]*>(.*?)<\/h${i}>`, 'gi');
            htmlStr = htmlStr.replace(regex, `\n${'#'.repeat(i)} $1\n\n`);
        }

        htmlStr = htmlStr.replace(/<\/?(p|div)[^>]*>/gi, '\n');
        htmlStr = htmlStr.replace(/\n{3,}/g, '\n\n');
        
        // Strip dei tag HTML residui
        htmlStr = htmlStr.replace(/<[^>]+>/g, '');

        // Decodifica entità HTML del testo
        const decoder = document.createElement('textarea');
        decoder.innerHTML = htmlStr;
        let finalMarkdown = decoder.value.trim();

        // Re-iniezione blocchi codice protetti
        protectedCodeTokens.forEach((codeBlockText, tokenKey) => {
            finalMarkdown = finalMarkdown.replace(tokenKey, codeBlockText.trim());
        });

        finalMarkdown = finalMarkdown.replace(/\u00A0/g, ' ').replace(/\u200B/g, '');

        return finalMarkdown.trim();
    }
});