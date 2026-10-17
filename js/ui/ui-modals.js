/**
 * UI-Modals.js
 * Iniezione dinamica delle finestre modali nel DOM.
 * REFACTOR: Rinnovata integralmente la finestra di esportazione con selezione a schede
 * a griglia (Selection Cards) per Formato (HTML, Markdown, Vault Obsidian) e Ambito (Corrente, Ramo, Workspace).
 */

document.addEventListener('DOMContentLoaded', () => {
    const modalsHTML = `
    <!-- Export Modal -->
    <div id="exportModal" class="link-modal-overlay hidden">
        <div class="link-modal export-modal modal-animate" style="width: 580px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column;">
            <div class="link-modal-header" style="flex-shrink: 0;">
                <div class="link-modal-title">
                    <span style="display:flex; align-items:center; gap:8px;">
                        <span style="display:inline-flex; color:var(--accent-color);">${Icons.export}</span> 
                        <span id="exportModalTitleTxt">${I18n.t('export_dialog.title')}</span>
                    </span>
                    <button class="close-modal-btn" onclick="ExportManager.closeModal()">${Icons.close}</button>
                </div>
            </div>
            
            <div class="link-modal-list adv-scroll-container" style="padding: 20px; display:flex; flex-direction:column; gap:18px; overflow-y:auto; flex:1;">
                
                <!-- PASSO 1: FORMATO -->
                <div>
                    <label style="font-size:0.8rem; font-weight:bold; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:8px;">
                        ${I18n.t('export_dialog.step1_format')}
                    </label>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;" id="exportFormatCards">
                        <div class="selection-card export-format-card active" data-format="html" onclick="ExportManager.selectFormatCard('html')" style="padding:12px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:6px; border:2px solid var(--accent-color); border-radius:8px; cursor:pointer; background:rgba(37,99,235,0.06); transition:all 0.2s;">
                            <span style="color:var(--accent-color); display:inline-flex; transform:scale(1.2);">${Icons.book}</span>
                            <div style="font-weight:bold; font-size:0.85rem; color:var(--text-primary);">HTML</div>
                            <div style="font-size:0.7rem; color:var(--text-secondary); line-height:1.2;">Doc. Unico per Stampa/PDF</div>
                        </div>

                        <div class="selection-card export-format-card" data-format="md" onclick="ExportManager.selectFormatCard('md')" style="padding:12px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:6px; border:1px solid var(--border-color); border-radius:8px; cursor:pointer; background:var(--bg-color); transition:all 0.2s;">
                            <span style="color:var(--text-primary); display:inline-flex; transform:scale(1.2);">${Icons.file}</span>
                            <div style="font-weight:bold; font-size:0.85rem; color:var(--text-primary);">Markdown</div>
                            <div style="font-size:0.7rem; color:var(--text-secondary); line-height:1.2;">File .md con Frontmatter YAML</div>
                        </div>

                        <div class="selection-card export-format-card" data-format="obsidian" onclick="ExportManager.selectFormatCard('obsidian')" style="padding:12px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:6px; border:1px solid var(--border-color); border-radius:8px; cursor:pointer; background:var(--bg-color); transition:all 0.2s;">
                            <span style="color:var(--tx-c8); display:inline-flex; transform:scale(1.2);">${Icons.folderOpen}</span>
                            <div style="font-weight:bold; font-size:0.85rem; color:var(--text-primary);">Vault Obsidian</div>
                            <div style="font-size:0.7rem; color:var(--text-secondary); line-height:1.2;">Cartelle, note e assets fisici</div>
                        </div>
                    </div>
                </div>

                <!-- PASSO 2: AMBITO (SCOPE) -->
                <div>
                    <label style="font-size:0.8rem; font-weight:bold; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:8px;">
                        ${I18n.t('export_dialog.step2_scope')}
                    </label>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;" id="exportScopeCards">
                        <div class="selection-card export-scope-card active" data-scope="current" onclick="ExportManager.selectScopeCard('current')" style="padding:10px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:4px; border:2px solid var(--accent-color); border-radius:8px; cursor:pointer; background:rgba(37,99,235,0.06); transition:all 0.2s;">
                            <span style="display:inline-flex; color:var(--accent-color);">${Icons.file}</span>
                            <div style="font-weight:bold; font-size:0.8rem; color:var(--text-primary);">Solo Corrente</div>
                            <div style="font-size:0.7rem; color:var(--text-secondary);">La nota aperta</div>
                        </div>

                        <div class="selection-card export-scope-card" data-scope="branch" onclick="ExportManager.selectScopeCard('branch')" style="padding:10px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:4px; border:1px solid var(--border-color); border-radius:8px; cursor:pointer; background:var(--bg-color); transition:all 0.2s;">
                            <span style="display:inline-flex; color:var(--text-primary);">${Icons.treeNode}</span>
                            <div style="font-weight:bold; font-size:0.8rem; color:var(--text-primary);">Ramo Sotto-note</div>
                            <div style="font-size:0.7rem; color:var(--text-secondary);">Nota e figlie</div>
                        </div>

                        <div class="selection-card export-scope-card" data-scope="all" onclick="ExportManager.selectScopeCard('all')" style="padding:10px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:4px; border:1px solid var(--border-color); border-radius:8px; cursor:pointer; background:var(--bg-color); transition:all 0.2s;">
                            <span style="display:inline-flex; color:var(--text-primary);">${Icons.book}</span>
                            <div style="font-weight:bold; font-size:0.8rem; color:var(--text-primary);">Tutto il Workspace</div>
                            <div style="font-size:0.7rem; color:var(--text-secondary);">Tutte le note</div>
                        </div>
                    </div>
                    <div id="exportScopeNotice" style="font-size:0.75rem; color:var(--text-secondary); margin-top:6px; display:none; font-style:italic;">
                        ℹ️ L'esportazione come Vault Obsidian include l'intera gerarchia del Workspace.
                    </div>
                </div>

                <!-- OPZIONE CONTESTUALE: IMMAGINI PER MARKDOWN -->
                <div id="exportMdOptions" style="display:none; background:rgba(0,0,0,0.02); padding:10px 14px; border-radius:6px; border:1px dashed var(--border-color);">
                    <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; cursor:pointer; color:var(--text-primary);">
                        <input type="checkbox" id="exportMdIncludeImages" checked style="cursor:pointer; transform:scale(1.15);">
                        <span>Includi riferimenti alle immagini locali nel testo Markdown</span>
                    </label>
                </div>
            </div>

            <div style="padding: 15px 20px; border-top: 1px solid var(--border-color); display:flex; justify-content:flex-end; gap:10px; background:var(--sidebar-bg); border-radius: 0 0 8px 8px; flex-shrink: 0;">
                <button class="btn" onclick="ExportManager.closeModal()">${typeof I18n !== 'undefined' ? I18n.t('common.cancel') : 'Annulla'}</button>
                <button class="btn btn-primary" onclick="ExportManager.executeCustomExport()" style="padding:8px 20px;">
                    <span style="display:flex; align-items:center; gap:6px;">
                        ${Icons.download} 
                        <span id="exportModalSubmitBtnText">${I18n.t('export_dialog.btn_start_export')}</span>
                    </span>
                </button>
            </div>
        </div>
    </div>

    <!-- File Viewer Modal (Usato per leggere file txt, log e codice locali dal PC) -->
    <div id="fileViewerModal" class="link-modal-overlay hidden" style="background: rgba(0,0,0,0.85); z-index: 1500;">
        <div class="link-modal modal-animate" style="width: 95%; height: 95%; max-height: 95vh; display:flex; flex-direction:column;">
            <div class="link-modal-header" style="flex-shrink:0; background:var(--sidebar-bg); border-bottom:1px solid var(--border-color);">
                <div class="link-modal-title"><span style="display:flex; align-items:center; gap:5px;"><span style="display:inline-flex;">${Icons.folderOpen}</span> ${typeof I18n !== 'undefined' ? I18n.t('link_manager.viewer_title') : 'Visualizzatore File Esterno'}</span><button class="close-modal-btn" onclick="LinkManager.closeViewer()">${Icons.close}</button></div>
                <div style="display:flex; align-items:center; gap:10px; background:var(--bg-color); padding:5px; border-radius:4px; border:1px solid var(--border-color);">
                    <span style="font-size:1.2rem; color:var(--text-secondary); display:inline-flex;">${Icons.file}</span><input type="text" id="viewerPath" readonly style="flex:1; border:none; background:transparent; font-family:monospace; color:var(--text-primary); font-size:0.9rem;" value="..."><button class="btn" style="padding:4px 8px; border:1px solid var(--border-color);" onclick="LinkManager.copyViewerPath()" title="${typeof I18n !== 'undefined' ? I18n.t('link_manager.tooltip_copy_path') : 'Copia percorso'}"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.clipboard} ${typeof I18n !== 'undefined' ? I18n.t('common.copy') : 'Copia'}</span></button>
                </div>
            </div>
            <div style="padding: 10px 15px; background:var(--item-hover); border-bottom:1px solid var(--border-color); display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="LinkManager.loadFileContent()"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.folderOpen} 1. Apri File...</span></button>
                <div class="separator" style="height:20px; background:var(--border-color); width:1px;"></div>
                <div style="display:flex; align-items:center; gap:6px; border: 1px solid var(--border-color); padding: 4px 10px; border-radius: 6px; background: var(--bg-color);">
                    <span style="font-size:0.85rem; font-weight:bold; color:var(--text-secondary);">${typeof I18n !== 'undefined' ? I18n.t('link_manager.viewer_step2_replace') : '2. Sostituisci'}</span><input type="text" id="viewerFindInput" class="link-modal-search modern-input" style="width:100px; padding:4px; font-size:0.8rem;"><span style="font-size:0.85rem; color:var(--text-secondary);">${typeof I18n !== 'undefined' ? I18n.t('link_manager.viewer_step2_with') : 'con'}</span><input type="text" id="viewerReplaceInput" class="link-modal-search modern-input" style="width:100px; padding:4px; font-size:0.8rem;"><button class="btn" id="btnReplaceContent" onclick="LinkManager.replaceContent()" disabled style="opacity:0.6; padding: 4px 8px;">Cambia</button>
                </div>
                <div class="separator" style="height:20px; background:var(--border-color); width:1px;"></div><button class="btn" onclick="LinkManager.copyViewerContent()" id="btnCopyContent" disabled style="opacity:0.6;"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.clipboard} ${typeof I18n !== 'undefined' ? I18n.t('link_manager.viewer_step3_copy') : 'Copia'}</span></button>
            </div>
            <div style="flex:1; padding:0; overflow:hidden; position:relative; background:#1e1e1e;">
                <pre id="viewerContent" style="margin:0; padding:15px; width:100%; height:100%; overflow:auto; color:#d4d4d4; font-family: 'Menlo', 'Monaco', 'Courier New', monospace; font-size:0.9rem; line-height:1.5; white-space:pre-wrap; border:none;"></pre>
                <div id="viewerEmptyState" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center; color:#666;">
                    <div style="margin-bottom:10px; display:inline-flex; align-items:center; justify-content:center; color:var(--text-secondary); opacity:0.5;">${Icons.lock}</div>
                    <div>Per motivi di sicurezza browser,<br>clicca su <b>"Apri/Ricarica File"</b> in alto per visualizzare il contenuto.</div>
                </div>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalsHTML);
});