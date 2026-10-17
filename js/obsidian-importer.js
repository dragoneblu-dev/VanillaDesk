/**
 * js/obsidian-importer.js
 * Modulo di importazione nativa per Vault di Obsidian in VanillaDesk.
 * - Scansione ricorsiva cartelle e file (.md, immagini, audio).
 * - Copia fisica degli asset nella cartella assets/ del Workspace.
 * - Two-Pass Resolver per wikilinks ([[Nota]], [[Nota|Alias]], [[Nota#Capitolo]]).
 * - Estrazione completa delle proprietà Frontmatter YAML (type, role, location, status, faction, ecc.)
 *   con mappatura relazionale diretta nelle colonne di SYS_PROPERTIES_DB.
 * - Risoluzione automatica dei wikilinks inseriti nelle proprietà Frontmatter (es. location: "[[The Greyflat Pans]]")
 *   nel tipo nativo 'note_link' di VanillaDesk, collegati al noteId della nota corrispondente.
 * - Estrazione completa dei tag da Frontmatter YAML e inline hashtag (#tag) con salvataggio in SYS_PROPERTIES_DB.
 * - Ottimizzazione salvataggio tag riciclando la procedura nativa senza verifiche ridondanti.
 * - Conversione marker Obsidian %%commento%% negli appunti nascosti inline di VanillaDesk.
 * - Conversione evidenziatore ==testo== e tag <mark> negli span con classe highlighter (.hl-c5).
 * - Feedback visivo dinamico e calcolato durante la scrittura fisica dei file JSON su disco.
 * - Normalizzazione canonica preventiva dei contenuti HTML con Editor.minifyHTMLForStorage e inizializzazione expanded: true.
 */

const ObsidianImporter = {

    openModal: () => {
        if (!AppState.workspaceHandle) {
            alert(I18n.t('obsidian_importer.alert_no_workspace'));
            return;
        }

        const bodyHTML = `
            <div style="background: rgba(37, 99, 235, 0.05); border: 1px solid rgba(37, 99, 235, 0.2); padding: 15px; border-radius: 6px; font-size: 0.85rem; color: var(--text-primary); line-height: 1.5; margin-bottom: 20px;">
                <p style="margin-top:0;">
                    ${I18n.t('obsidian_importer.banner_desc')}
                </p>
                <ul style="padding-left: 20px; margin-bottom: 0; color: var(--text-secondary);">
                    <li>${I18n.t('obsidian_importer.feature_folders')}</li>
                    <li>${I18n.t('obsidian_importer.feature_links')}</li>
                    <li>${I18n.t('obsidian_importer.feature_assets')}</li>
                    <li>${I18n.t('obsidian_importer.feature_tags')}</li>
                </ul>
            </div>

            <div style="display: flex; flex-direction: column; gap: 15px;">
                <label style="display: flex; align-items: center; gap: 10px; font-size: 0.85rem; cursor: pointer; color: var(--text-primary);">
                    <input type="checkbox" id="obsidianWrapInRoot" checked style="transform: scale(1.15);">
                    <span>${I18n.t('obsidian_importer.opt_wrap_root')}</span>
                </label>
                
                <div id="obsidianProgressArea" style="display: none; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 6px; padding: 15px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                        <span id="obsidianProgressStatus" style="font-weight: bold; font-size: 0.85rem; color: var(--accent-color);">Inizializzazione...</span>
                        <span id="obsidianProgressPercent" style="font-family: monospace; font-size: 0.85rem; color: var(--text-secondary);">0%</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: rgba(0,0,0,0.06); border-radius: 4px; overflow: hidden;">
                        <div id="obsidianProgressBar" style="width: 0%; height: 100%; background: var(--accent-color); transition: width 0.2s ease;"></div>
                    </div>
                </div>
            </div>
        `;

        const footerHTML = `
            <button class="btn" id="btnCancelObsidianImport" onclick="UI.closeDrawer()">${I18n.t('common.cancel')}</button>
            <button class="btn btn-primary" id="btnStartObsidianImport" onclick="ObsidianImporter.startImport()">
                <span style="display:inline-flex; align-items:center; gap:6px;">
                    ${typeof Icons !== 'undefined' ? Icons.folderOpen : '📁'} ${I18n.t('obsidian_importer.btn_select_and_import')}
                </span>
            </button>
        `;

        UI.openDrawer(
            `<span style="display:inline-flex; align-items:center; gap:8px;">${typeof Icons !== 'undefined' ? Icons.import : '📥'} ${I18n.t('obsidian_importer.drawer_title')}</span>`,
            bodyHTML,
            footerHTML
        );
    },

    startImport: async () => {
        try {
            // 1. Selezione della cartella del Vault tramite File System Access API
            const vaultDirHandle = await window.showDirectoryPicker({ mode: 'read' });
            if (!vaultDirHandle) return;

            const wrapInRoot = document.getElementById('obsidianWrapInRoot')?.checked ?? true;

            const progressArea = document.getElementById('obsidianProgressArea');
            const progressStatus = document.getElementById('obsidianProgressStatus');
            const progressPercent = document.getElementById('obsidianProgressPercent');
            const progressBar = document.getElementById('obsidianProgressBar');
            const btnStart = document.getElementById('btnStartObsidianImport');
            const btnCancel = document.getElementById('btnCancelObsidianImport');

            if (progressArea) progressArea.style.display = 'block';
            if (btnStart) btnStart.disabled = true;
            if (btnCancel) btnCancel.disabled = true;

            const updateProgress = (text, current, total) => {
                if (progressStatus) progressStatus.innerText = text;
                const pct = total > 0 ? Math.round((current / total) * 100) : 0;
                if (progressPercent) progressPercent.innerText = `${pct}%`;
                if (progressBar) progressBar.style.width = `${pct}%`;
            };

            updateProgress("Scansione file e cartelle del Vault...", 0, 100);

            // 2. Mappature di stato per risoluzione e asset
            const fileEntries = []; // Tutti i file .md trovati
            const assetEntries = []; // Tutte le immagini e file audio
            const dirEntries = []; // Tutte le cartelle
            const noteMap = new Map(); // pathRelativo / nomeFile -> noteId VanillaDesk
            const assetMap = new Map(); // nomeFileOriginale -> assetFileName VanillaDesk
            const extractedPropertiesMap = new Map(); // noteId -> Object proprietà YAML estratte
            const extractedTagsMap = new Map(); // noteId -> Array di stringhe tag

            // Cartelle da ignorare tassativamente
            const ignoredDirs = new Set(['.obsidian', '.trash', '.git', '.smart-env']);

            // Scansione ricorsiva della directory
            const scanDir = async (dirHandle, relPath = '') => {
                for await (const entry of dirHandle.values()) {
                    if (entry.kind === 'directory') {
                        if (ignoredDirs.has(entry.name)) continue;
                        const subRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
                        dirEntries.push({ handle: entry, path: subRelPath, name: entry.name, parentPath: relPath });
                        await scanDir(entry, subRelPath);
                    } else if (entry.kind === 'file') {
                        const subRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
                        const lowerName = entry.name.toLowerCase();
                        if (lowerName.endsWith('.md')) {
                            fileEntries.push({ handle: entry, path: subRelPath, name: entry.name, parentPath: relPath });
                        } else if (/\.(png|jpe?g|gif|webp|svg|bmp|mp3|wav|ogg|m4a|aac)$/i.test(lowerName)) {
                            assetEntries.push({ handle: entry, path: subRelPath, name: entry.name });
                        }
                    }
                }
            };

            await scanDir(vaultDirHandle);

            // 3. Creazione eventuale cartella radice Vault contenitore
            let vaultRootNoteId = null;
            if (wrapInRoot) {
                vaultRootNoteId = Store.generateId();
                const now = new Date().toISOString();
                AppState.notes.push({
                    id: vaultRootNoteId,
                    parentId: null,
                    title: `[Vault] ${vaultDirHandle.name}`,
                    content: `<p>Vault importato da Obsidian (${fileEntries.length} note, ${assetEntries.length} allegati).</p>`,
                    isMarked: false,
                    expanded: true,
                    createdAt: now,
                    updatedAt: now,
                    revId: Store.generateId(),
                    _baseRevId: Store.generateId(),
                    _isDraft: false,
                    _isDirty: true
                });
            }

            // 4. Copia fisica degli Asset nella cartella assets/ di VanillaDesk (0% - 20%)
            const totalAssets = assetEntries.length;
            let processedAssets = 0;

            for (const asset of assetEntries) {
                try {
                    const file = await asset.handle.getFile();
                    const isImg = /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(asset.name);
                    const prefix = isImg ? 'img' : 'aud';
                    
                    const savedFileName = await Store.saveAsset(file, prefix);
                    if (savedFileName) {
                        assetMap.set(asset.name.toLowerCase(), savedFileName);
                        assetMap.set(asset.path.toLowerCase(), savedFileName);
                    }
                } catch (err) {
                    console.warn(`[ObsidianImporter] Impossibile copiare asset ${asset.name}:`, err);
                }
                processedAssets++;
                const assetPct = Math.round((processedAssets / (totalAssets || 1)) * 20);
                updateProgress(`Copia allegati: ${processedAssets}/${totalAssets}`, assetPct, 100);
            }

            // 5. Creazione nodi cartella come note genitore in VanillaDesk
            const folderNoteMap = new Map(); // pathCartella -> noteId
            dirEntries.sort((a, b) => a.path.split('/').length - b.path.split('/').length);

            for (const dir of dirEntries) {
                const folderNoteId = Store.generateId();
                const parentFolderId = dir.parentPath ? folderNoteMap.get(dir.parentPath) : vaultRootNoteId;
                const now = new Date().toISOString();

                AppState.notes.push({
                    id: folderNoteId,
                    parentId: parentFolderId,
                    title: dir.name,
                    content: '<p><br></p>',
                    isMarked: false,
                    expanded: true,
                    createdAt: now,
                    updatedAt: now,
                    revId: Store.generateId(),
                    _baseRevId: Store.generateId(),
                    _isDraft: false,
                    _isDirty: true
                });

                folderNoteMap.set(dir.path, folderNoteId);
            }

            // 6. PASSAGGIO 1: Creazione note e popolazione indice dei nomi (20% - 35%)
            const totalFiles = fileEntries.length;
            const rawNotesData = [];

            for (let i = 0; i < totalFiles; i++) {
                const entry = fileEntries[i];
                const file = await entry.handle.getFile();
                const rawMarkdown = await file.text();

                const noteId = Store.generateId();
                const parentNoteId = entry.parentPath ? folderNoteMap.get(entry.parentPath) : vaultRootNoteId;
                const noteTitle = entry.name.replace(/\.md$/i, '');

                const now = new Date(file.lastModified || Date.now()).toISOString();

                const baseKey = noteTitle.toLowerCase();
                const pathKey = entry.path.replace(/\.md$/i, '').toLowerCase();

                noteMap.set(baseKey, noteId);
                noteMap.set(pathKey, noteId);

                rawNotesData.push({
                    id: noteId,
                    parentId: parentNoteId,
                    title: noteTitle,
                    rawMarkdown: rawMarkdown,
                    createdAt: now,
                    updatedAt: now
                });

                const indexPct = 20 + Math.round(((i + 1) / totalFiles) * 15);
                updateProgress(`Censimento note: ${i + 1}/${totalFiles}`, indexPct, 100);
            }

            // 7. PASSAGGIO 2: Parsing del contenuto, risoluzione Wikilinks ed estrazione Proprietà/Tag (35% - 60%)
            for (let i = 0; i < rawNotesData.length; i++) {
                const item = rawNotesData[i];
                let md = item.rawMarkdown;

                // Estrazione di tutte le proprietà dal Frontmatter YAML (type, role, location, status, faction, ecc.)
                const yamlMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                if (yamlMatch) {
                    const parsedProps = ExportManager.parseYamlFrontmatter(yamlMatch[1]);
                    if (Object.keys(parsedProps).length > 0) {
                        extractedPropertiesMap.set(item.id, parsedProps);
                    }
                }

                // Estrazione dei tag (sia da YAML che da hashtag nel corpo)
                const allTags = ExportManager.extractTagsFromMarkdown(md);
                if (allTags.length > 0) {
                    extractedTagsMap.set(item.id, allTags);
                }

                md = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

                md = md.replace(/!\[\[\s*([^\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\s*\]\]/g, (match, target, heading, label) => {
                    const targetClean = target.trim().toLowerCase();
                    const assetRef = assetMap.get(targetClean);

                    if (assetRef) {
                        if (assetRef.startsWith('img_')) {
                            return `![${label || target}](assets/${assetRef})`;
                        } else if (assetRef.startsWith('aud_')) {
                            return `<audio controls data-audio-ref="${assetRef}" src="assets/${assetRef}"></audio>`;
                        }
                    }
                    return `*[Allegato non trovato: ${target}]*`;
                });

                md = md.replace(/\[\[\s*([^\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\s*\]\]/g, (match, target, heading, label) => {
                    const targetClean = target.trim().toLowerCase();
                    const targetNoteId = noteMap.get(targetClean);
                    const displayLabel = label ? label.trim() : (heading ? `${target.trim()} > ${heading.trim()}` : target.trim());

                    if (targetNoteId) {
                        const anchorAttr = heading ? ` data-anchor="${UI.escapeHTML(heading.trim())}"` : '';
                        return `<a href="#" class="internal-link" data-note-id="${targetNoteId}"${anchorAttr}>${UI.escapeHTML(displayLabel)}</a>`;
                    }
                    return `*[Link non risolto: ${displayLabel}]*`;
                });

                md = md.replace(/^>\s*\[!([a-zA-Z]+)\]\s*(.*)$/gm, (match, type, title) => {
                    return `> **[${type.toUpperCase()}] ${title}**\n>`;
                });

                let htmlContent = ExportManager.parseMarkdownToHTML(md);

                // Normalizzazione canonica preventiva: evita divergenze con l'editor che innescano autosave spurio
                if (typeof Editor !== 'undefined' && typeof Editor.minifyHTMLForStorage === 'function') {
                    htmlContent = Editor.minifyHTMLForStorage(htmlContent);
                }

                const finalRevId = Store.generateId();
                AppState.notes.push({
                    id: item.id,
                    parentId: item.parentId,
                    title: item.title,
                    content: htmlContent,
                    isMarked: false,
                    expanded: true,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                    revId: finalRevId,
                    _baseRevId: finalRevId,
                    _isDraft: false,
                    _isDirty: true
                });

                const parsePct = 35 + Math.round(((i + 1) / totalFiles) * 25);
                updateProgress(`Conversione contenuti: ${i + 1}/${totalFiles}`, parsePct, 100);
            }

            // 8. Sincronizzazione atomica di tutte le Proprietà Frontmatter e Tag in SYS_PROPERTIES_DB
            if (typeof AdvancedTable !== 'undefined') {
                AdvancedTable.ensureSystemPropertiesDB();
            }

            if (extractedPropertiesMap.size > 0) {
                extractedPropertiesMap.forEach((propsObj, noteId) => {
                    ExportManager.saveNotePropertiesToSystemDB(noteId, propsObj, noteMap, true);
                });
            }

            if (extractedTagsMap.size > 0) {
                extractedTagsMap.forEach((tags, noteId) => {
                    ExportManager.saveNoteTagsToSystemDB(noteId, tags, true);
                });
            }

            // 9. Scrittura fisica su disco con indicatore di progresso in tempo reale (60% - 100%)
            if (typeof UI !== 'undefined' && typeof UI.renderTree === 'function') {
                UI.renderTree();
            }

            Store.isDirty = true;
            await Store.saveToFile((p) => {
                let savePct = 60;
                if (p.phase === 'databases') {
                    savePct = 60 + Math.round((p.current / (p.total || 1)) * 15);
                } else if (p.phase === 'notes') {
                    savePct = 75 + Math.round((p.current / (p.total || 1)) * 25);
                } else if (p.phase === 'complete') {
                    savePct = 100;
                }
                updateProgress(p.message, savePct, 100);
            });

            UI.closeDrawer();

            const toastMsg = I18n.t('obsidian_importer.toast_success', { 
                notes: totalFiles, 
                folders: dirEntries.length, 
                assets: totalAssets 
            }) || `Vault importato: ${totalFiles} note, ${dirEntries.length} cartelle e ${totalAssets} allegati!`;

            if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') {
                UI.showToast(toastMsg, "success");
            }

            if (rawNotesData.length > 0) {
                UI.selectNote(rawNotesData[0].id);
            }

        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Errore importazione Vault Obsidian:", err);
                alert("Errore durante l'importazione del Vault: " + err.message);
            }
            const btnStart = document.getElementById('btnStartObsidianImport');
            const btnCancel = document.getElementById('btnCancelObsidianImport');
            if (btnStart) btnStart.disabled = false;
            if (btnCancel) btnCancel.disabled = false;
        }
    }
};