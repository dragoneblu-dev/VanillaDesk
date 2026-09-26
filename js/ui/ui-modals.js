/**
 * UI-Modals.js
 * Iniezione dinamica delle finestre modali nel DOM.
 * REFACTOR: Rimossi tutti i vecchi codici HTML delle modali (Link, YouTube, Appunti) 
 * che sono state migrate con successo sul sistema universale a Drawer laterale.
 */

document.addEventListener('DOMContentLoaded', () => {
    const modalsHTML = `
    <!-- Export Modal -->
    <div id="exportModal" class="link-modal-overlay hidden">
        <div class="link-modal export-modal modal-animate" style="width: 450px;">
            <div class="link-modal-header">
                <div class="link-modal-title"><span style="display:flex; align-items:center; gap:5px;"><span style="display:inline-flex;">${Icons.export}</span> Esporta Documento</span><button class="close-modal-btn" onclick="ExportManager.closeModal()">${Icons.close}</button></div>
            </div>
            <div class="link-modal-list" style="padding: 20px; display:flex; flex-direction:column; gap:15px;">
                <p style="color:var(--text-secondary); margin-bottom:5px; font-size: 0.9rem;">Scegli il formato e l'ambito dell'esportazione.</p>
                
                <div>
                    <label style="font-size:0.8rem; font-weight:bold; color:var(--text-primary);">Formato di Esportazione:</label>
                    <select id="exportFormatSelect" class="modern-input" style="width:100%; margin-top:5px; padding:8px; cursor:pointer;" onchange="document.getElementById('exportMdOptions').style.display = this.value === 'md' ? 'block' : 'none'">
                        <option value="html">Pagina Web HTML (Ideale per Stampa/PDF)</option>
                        <option value="md">File Markdown (.md) (Ideale per Backup/Migrazione)</option>
                    </select>
                </div>

                <div id="exportMdOptions" style="display:none; margin-top: 5px;">
                    <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; cursor:pointer; color:var(--text-secondary);">
                        <input type="checkbox" id="exportMdIncludeImages" checked style="cursor:pointer; transform:scale(1.1);">
                        Esporta e includi anche le Immagini nel file Markdown
                    </label>
                </div>

                <div style="height:1px; background:var(--border-color); margin: 5px 0;"></div>

                <button class="btn btn-primary" onclick="ExportManager.processExport('all')" style="justify-content:center; padding:10px;"><span style="display:flex; align-items:center; gap:5px;"><span style="display:inline-flex;">${Icons.book}</span> Esporta Tutto (Intero Database)</span></button>
                <button class="btn" onclick="ExportManager.processExport('branch')" style="justify-content:center; padding:10px;">Esporta Ramo Corrente (Nota + Sotto-note)</button>
                
                <button class="btn" onclick="ExportManager.processExport('current')" style="justify-content:center; padding:10px; border-style:dashed;">Esporta SOLO Nota Corrente</button>
            </div>
        </div>
    </div>

    <!-- File Viewer Modal (Usato per leggere file txt, log e codice locali dal PC) -->
    <div id="fileViewerModal" class="link-modal-overlay hidden" style="background: rgba(0,0,0,0.85); z-index: 1500;">
        <div class="link-modal modal-animate" style="width: 95%; height: 95%; max-height: 95vh; display:flex; flex-direction:column;">
            <div class="link-modal-header" style="flex-shrink:0; background:var(--sidebar-bg); border-bottom:1px solid var(--border-color);">
                <div class="link-modal-title"><span style="display:flex; align-items:center; gap:5px;"><span style="display:inline-flex;">${Icons.folderOpen}</span> Visualizzatore File Esterno</span><button class="close-modal-btn" onclick="LinkManager.closeViewer()">${Icons.close}</button></div>
                <div style="display:flex; align-items:center; gap:10px; background:var(--bg-color); padding:5px; border-radius:4px; border:1px solid var(--border-color);">
                    <span style="font-size:1.2rem; color:var(--text-secondary); display:inline-flex;">${Icons.file}</span><input type="text" id="viewerPath" readonly style="flex:1; border:none; background:transparent; font-family:monospace; color:var(--text-primary); font-size:0.9rem;" value="..."><button class="btn" style="padding:4px 8px; border:1px solid var(--border-color);" onclick="LinkManager.copyViewerPath()" title="Copia Path"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.clipboard} Copia</span></button>
                </div>
            </div>
            <div style="padding: 10px 15px; background:var(--item-hover); border-bottom:1px solid var(--border-color); display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="LinkManager.loadFileContent()"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.folderOpen} 1. Apri File...</span></button>
                <div class="separator" style="height:20px; background:var(--border-color); width:1px;"></div>
                <div style="display:flex; align-items:center; gap:6px; border: 1px solid var(--border-color); padding: 4px 10px; border-radius: 6px; background: var(--bg-color);">
                    <span style="font-size:0.85rem; font-weight:bold; color:var(--text-secondary);">2. Sostituisci</span><input type="text" id="viewerFindInput" class="link-modal-search modern-input" style="width:100px; padding:4px; font-size:0.8rem;"><span style="font-size:0.85rem; color:var(--text-secondary);">con</span><input type="text" id="viewerReplaceInput" class="link-modal-search modern-input" style="width:100px; padding:4px; font-size:0.8rem;"><button class="btn" id="btnReplaceContent" onclick="LinkManager.replaceContent()" disabled style="opacity:0.6; padding: 4px 8px;">Cambia</button>
                </div>
                <div class="separator" style="height:20px; background:var(--border-color); width:1px;"></div><button class="btn" onclick="LinkManager.copyViewerContent()" id="btnCopyContent" disabled style="opacity:0.6;"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.clipboard} 3. Copia nella clipboard</span></button>
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