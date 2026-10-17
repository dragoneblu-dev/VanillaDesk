/**
 * js/export-markdown.js
 * Sottomodulo di ExportManager dedicato all'Esportazione Markdown e Vault Obsidian.
 * - Genera il Frontmatter YAML per Obsidian (buildNoteFrontmatter) estraendo le proprietà da SYS_PROPERTIES_DB.
 * - Converte il DOM vivo in Markdown fedele (htmlToMarkdown) preservando tabelle, gerarchie liste, footnotes ed evidenziatori.
 * - Esporta la singola nota o il documento cumulativo (generateMarkdownDocument).
 * - Esporta l'intero Workspace come Vault fisico nativo su disco tramite File System Access API (exportObsidianVault).
 * - Nell'estrazione di una singola nota in Markdown il titolo non viene duplicato né nel Frontmatter né nel testo.
 */

Object.assign(ExportManager, {

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
            md += ExportManager.htmlToMarkdown(singleNote.content || '', includeImages) + `\n`;
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
                md += ExportManager.htmlToMarkdown(item.note.content || '', includeImages) + `\n\n---\n\n`;
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
                return (name || 'Senza Titolo').replace(/[\\/:*?"<>|]/g, '_').trim();
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

            // 2. Scrittura dei file Markdown (.md)
            let exportedNotesCount = 0;
            const totalNotes = aliveNotes.length;

            for (const note of aliveNotes) {
                const parentHandle = note.parentId ? (dirHandleMap.get(note.parentId) || targetDirHandle) : targetDirHandle;
                const fileName = sanitizeFolderName(note.title) + '.md';

                // Genera Frontmatter YAML completo con proprietà di SYS_PROPERTIES_DB senza duplicare title nel corpo
                let mdContent = ExportManager.buildNoteFrontmatter(note.id, false);
                mdContent += ExportManager.htmlToMarkdown(note.content || '', true);

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

    htmlToMarkdown: (html, includeImages) => {
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

        // TOKENIZZAZIONE PROTETTA DEI BLOCCHI DI CODICE
        // Isola il codice sorgente grezzo per impedire che tag legittimi (<script>, <div>, <button>)
        // vengano distrutti dalla successiva rimozione globale dei tag HTML
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
                        
                        // Titolo del Database pulito senza icone arbitrarie (nessun emoji fantasma)
                        let mdTable = `\n**${state.title || 'Database'}**\n\n`;
                        const visibleCols = state.columns.filter(c => !c.hidden);

                        mdTable += `| ${visibleCols.map(c => c.name.replace(/\|/g, '\\|')).join(' | ')} |\n`;
                        mdTable += `| ${visibleCols.map(() => '---').join(' | ')} |\n`;

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

                        // Costruzione blocco codice pulito senza prefissi artificiali come &lt;/&gt;
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
                        wrapper.outerHTML = `<blockquote><b>${citTitle}</b><br>${body.innerHTML}</blockquote>`;
                    } else {
                        wrapper.outerHTML = `<blockquote><b>${citTitle}</b><br>[Contenuto mancante]</blockquote>`;
                    }
                }
            });
        }

        temp.querySelectorAll('table:not(.adv-table)').forEach(table => {
            let mdTable = '\n';
            Array.from(table.rows).forEach((row, i) => {
                let rowData = Array.from(row.cells).map(cell => cell.innerText.replace(/\|/g, '\\|').replace(/\n/g, ' '));
                mdTable += `| ${rowData.join(' | ')} |\n`;
                if (i === 0) {
                    mdTable += `| ${Array.from(row.cells).map(() => '---').join(' | ')} |\n`;
                }
            });
            table.outerHTML = mdTable + '\n';
        });

        // CONVERSIONE RICORSIVA DELLE LISTE E DELLE CHECKLIST NEL DOM (Preservazione esatta dell'indentazione)
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

                // Estrazione del contenuto testuale dell'elemento escludendo eventuali sotto-liste annidate
                let itemClone = li.cloneNode(true);
                itemClone.querySelectorAll('ul, ol, input[type="checkbox"]').forEach(nested => nested.remove());

                let itemHtml = textSpan ? textSpan.innerHTML : itemClone.innerHTML;
                itemHtml = itemHtml.replace(/<br\s*\/?>/gi, ' ');
                itemHtml = itemHtml.replace(/<span[^>]*class=["'][^"']*hl-c\d+[^"']*["'][^>]*>(.*?)<\/span>/gi, '==$1==');
                itemHtml = itemHtml.replace(/<mark(?![^>]*class=["'][^"']*(?:search-highlight|active-highlight)[^"']*["'])[^>]*>(.*?)<\/mark>/gi, '==$1==');
                itemHtml = itemHtml.replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gi, '**$2**');
                itemHtml = itemHtml.replace(/<(i|em)[^>]*>(.*?)<\/\1>/gi, '*$2*');
                itemHtml = itemHtml.replace(/<(s|strike)[^>]*>(.*?)<\/\1>/gi, '~~$2~~');
                itemHtml = itemHtml.replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
                itemHtml = itemHtml.replace(/<[^>]+>/g, '').trim();

                mdOutput += `${indent}${prefix}${itemHtml}\n`;

                // Ricorsione sulle sotto-liste annidate all'interno di questo LI
                const nestedLists = Array.from(li.children).filter(child => child.tagName === 'UL' || child.tagName === 'OL');
                nestedLists.forEach(nestedList => {
                    mdOutput += convertListElementToMarkdown(nestedList, depth + 1);
                });
            });

            return mdOutput;
        };

        // Trova tutte le liste radice (non annidate dentro altre liste) e le converte in blocchi Markdown
        const rootLists = Array.from(temp.querySelectorAll('ul, ol')).filter(l => !l.parentElement.closest('ul, ol'));
        rootLists.forEach(rootList => {
            const listMd = convertListElementToMarkdown(rootList, 0);
            const placeholder = document.createElement('div');
            placeholder.className = '__vd_list_md_placeholder__';
            placeholder.textContent = '\n' + listMd.trimEnd() + '\n\n';
            rootList.parentNode.replaceChild(placeholder, rootList);
        });

        temp.querySelectorAll('blockquote').forEach(bq => {
            const header = bq.querySelector('.citation-header');
            if (header) header.remove();
            let text = bq.innerHTML.replace(/<br\s*\/?>/gi, '\n');
            text = text.replace(/<[^>]+>/g, '').trim(); 
            bq.outerHTML = `\n> ${text.replace(/\n/g, '\n> ')}\n\n`;
        });

        // CONVERSIONE NOTE INLINE IN FORMATO STANDARD FOOTNOTE ^[nota]
        temp.querySelectorAll('.inline-note-wrapper').forEach(wrapper => {
            const dataSpan = wrapper.querySelector('.inline-note-data');
            let text = dataSpan ? dataSpan.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') : '';
            
            if (!text) {
                const marker = wrapper.querySelector('.inline-note-marker');
                text = marker ? (marker.getAttribute('data-tooltip') || '').replace(/<br\s*\/?>/gi, '\n') : '';
            }
            wrapper.outerHTML = `^[${text.trim()}]`;
        });

        temp.querySelectorAll('.inline-note-marker[data-tooltip]').forEach(marker => {
            const text = marker.getAttribute('data-tooltip') || '';
            const cleanText = text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
            marker.outerHTML = `^[${cleanText}]`;
        });

        let htmlStr = temp.innerHTML;
        
        htmlStr = htmlStr.replace(/<br\s*\/?>/gi, '\n');
        
        // CONVERSIONE EVIDENZIAZIONI IN FORMATO OBSIDIAN ==testo==
        htmlStr = htmlStr.replace(/<span[^>]*class=["'][^"']*hl-c\d+[^"']*["'][^>]*>(.*?)<\/span>/gi, '==$1==');
        htmlStr = htmlStr.replace(/<mark(?![^>]*class=["'][^"']*(?:search-highlight|active-highlight)[^"']*["'])[^>]*>(.*?)<\/mark>/gi, '==$1==');

        htmlStr = htmlStr.replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gi, '**$2**');
        htmlStr = htmlStr.replace(/<(i|em)[^>]*>(.*?)<\/\1>/gi, '*$2*');
        htmlStr = htmlStr.replace(/<(s|strike)[^>]*>(.*?)<\/\1>/gi, '~~$2~~');
        
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
        
        // Strip dei tag HTML residui (il codice sorgente è protetto dentro protectedCodeTokens e non viene toccato!)
        htmlStr = htmlStr.replace(/<[^>]+>/g, '');

        // Decodifica entità HTML del testo
        const decoder = document.createElement('textarea');
        decoder.innerHTML = htmlStr;
        let finalMarkdown = decoder.value.trim();

        // RE-INIEZIONE DETERMINISTICA DEI BLOCCHI CODICE PROTETTI
        protectedCodeTokens.forEach((codeBlockText, tokenKey) => {
            finalMarkdown = finalMarkdown.replace(tokenKey, codeBlockText.trim());
        });

        // NORMALIZZAZIONE SPAZI: Conversione rigorosa di non-breaking space (&nbsp; / \u00A0) in spazi standard ASCII
        // ed eliminazione di Zero-Width Space (\u200B) per evitare la comparsa del carattere <0xa0> negli editor di testo
        finalMarkdown = finalMarkdown.replace(/\u00A0/g, ' ').replace(/\u200B/g, '');

        return finalMarkdown.trim();
    }
});