/**
 * ui-notes-info.js
 * Sottomodulo di UI.
 * Gestione del pannello delle Informazioni, Auditing e Backlinks (Menzioni in Entrata e Uscita).
 */

Object.assign(UI, {
    openNoteInfoPanel: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        if (!note) return;

        const safeTitle = (note.title || 'Senza Titolo').replace(/</g, '&lt;');

        // 1. Calcolo Statistiche Testo
        const plainText = UI.extractSearchableText(note.content || '').trim();
        const wordCount = plainText ? plainText.split(/\s+/).filter(w => w.length > 0).length : 0;
        const readTime = Math.max(1, Math.ceil(wordCount / 200)); 

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.content || '';
        const chapterCount = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
        const widgetCount = tempDiv.querySelectorAll('.adv-widget-shell').length;

        // 2. Calcolo Backlinks (Chi mi cita / punta a me)
        const backlinks = [];
        const noteIdStr = `data-note-id="${note.id}"`;
        const refNoteStr = `data-ref-note="${note.id}"`;

        AppState.notes.forEach(n => {
            if (n.deletedAt || n.id === note.id) return;
            if (n.content && (n.content.includes(noteIdStr) || n.content.includes(refNoteStr))) {
                backlinks.push(n);
            }
        });

        // 3. Calcolo Outlinks (Chi sto citando / puntando io)
        const outlinks = new Set();
        tempDiv.querySelectorAll('a.internal-link').forEach(link => {
            const tgtId = link.getAttribute('data-note-id');
            if (tgtId && tgtId !== note.id) outlinks.add(tgtId);
        });
        tempDiv.querySelectorAll('.block-citation').forEach(cit => {
            const tgtId = cit.getAttribute('data-ref-note');
            if (tgtId && tgtId !== note.id) outlinks.add(tgtId);
        });

        // 4. Calcolo Auditing Sotto-note (Matrice)
        const children = Store.getChildren(note.id);
        let subNotesHtml = '';

        if (children.length > 0) {
            const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
            const colsToRender = propsDb ? propsDb.columns.filter(c => c.id !== 'sys_c_note' && !c.hidden) : [];

            let thHtml = `<th style="text-align:left; color:var(--text-secondary); font-weight:600; padding:8px; border-bottom:1px solid var(--border-color); background:rgba(0,0,0,0.02);">Titolo Nota</th>`;
            colsToRender.forEach(c => {
                thHtml += `<th style="text-align:left; color:var(--text-secondary); font-weight:600; padding:8px; border-bottom:1px solid var(--border-color); background:rgba(0,0,0,0.02);">${c.name.replace(/</g, '&lt;')}</th>`;
            });

            let trHtml = '';
            children.forEach(child => {
                const childSafeTitle = (child.title || 'Senza Titolo').replace(/</g, '&lt;');
                let rowPropsHtml = '';

                if (propsDb) {
                    const sysRow = propsDb.rows.find(r => r.cells['sys_c_note'] === child.id);
                    colsToRender.forEach(c => {
                        let displayVal = '-';
                        if (sysRow) {
                            let rawVal = sysRow.cells[c.id];
                            
                            if (['select', 'multi-select'].includes(c.type)) {
                                const vals = Array.isArray(rawVal) ? rawVal : (rawVal ? [rawVal] : []);
                                if (vals.length > 0) {
                                    displayVal = '';
                                    vals.forEach(v => {
                                        const colorClass = propsDb.selectColors && propsDb.selectColors[c.id] && propsDb.selectColors[c.id][v] ? propsDb.selectColors[c.id][v] : 'default-color';
                                        displayVal += `<span class="adv-select-pill ${colorClass}" style="margin-right:4px;">${v.replace(/</g, '&lt;')}</span>`;
                                    });
                                }
                            } else if (c.type === 'checkbox') {
                                displayVal = rawVal ? `<span style="color:var(--accent-color); font-weight:bold;">Sì</span>` : `<span style="color:var(--text-secondary);">No</span>`;
                            } else {
                                displayVal = AdvancedTable.getFormatDisplayValue(c, rawVal);
                                if (!displayVal) displayVal = '-';
                            }
                        }
                        rowPropsHtml += `<td style="padding:8px; border-bottom:1px solid var(--border-color); font-size:0.85rem;">${displayVal}</td>`;
                    });
                }

                trHtml += `
                    <tr style="cursor:pointer; transition:background 0.2s;" onmouseenter="this.style.background='var(--item-hover)'" onmouseleave="this.style.background=''" onclick="UI.selectNote('${child.id}')">
                        <td style="padding:8px; border-bottom:1px solid var(--border-color); font-weight:bold; color:var(--text-primary); font-size:0.9rem;">
                            <span style="opacity:0.5; margin-right:5px; font-weight:normal;">${Icons.file}</span>${childSafeTitle}
                        </td>
                        ${rowPropsHtml}
                    </tr>
                `;
            });

            subNotesHtml = `
                <div class="adv-scroll-container" style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-color); margin-top: 10px;">
                    <table style="width:100%; border-collapse:collapse; text-align:left;">
                        <thead style="position:sticky; top:0; z-index:10; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <tr>${thHtml}</tr>
                        </thead>
                        <tbody>
                            ${trHtml}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            subNotesHtml = `<div style="font-size:0.85rem; color:var(--text-secondary); font-style:italic;">Questa nota non contiene sotto-note.</div>`;
        }

        // COSTRUZIONE HTML DRAWER
        let bodyHTML = `
            <div style="display:flex; flex-direction:column; gap:20px; padding-bottom: 20px;">
                
                <!-- Statistiche -->
                <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:10px;">
                    <div style="background:var(--item-hover); border:1px solid var(--border-color); padding:15px; border-radius:8px; text-align:center;">
                        <div style="font-size:1.5rem; font-weight:bold; color:var(--text-primary);">${wordCount}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; margin-top:5px;">Parole</div>
                    </div>
                    <div style="background:var(--item-hover); border:1px solid var(--border-color); padding:15px; border-radius:8px; text-align:center;">
                        <div style="font-size:1.5rem; font-weight:bold; color:var(--text-primary);">${readTime}m</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; margin-top:5px;">Tempo Lettura</div>
                    </div>
                    <div style="background:var(--item-hover); border:1px solid var(--border-color); padding:15px; border-radius:8px; text-align:center;">
                        <div style="font-size:1.5rem; font-weight:bold; color:var(--text-primary);">${chapterCount}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; margin-top:5px;">Capitoli</div>
                    </div>
                    <div style="background:var(--item-hover); border:1px solid var(--border-color); padding:15px; border-radius:8px; text-align:center;">
                        <div style="font-size:1.5rem; font-weight:bold; color:var(--text-primary);">${widgetCount}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; margin-top:5px;">Widget</div>
                    </div>
                </div>

                <!-- Backlinks -->
                <div>
                    <h4 style="margin:0 0 10px 0; color:var(--accent-color); font-size:0.95rem; border-bottom:1px solid var(--border-color); padding-bottom:5px; display:flex; align-items:center; gap:6px;">
                        ${Icons.link} Menzioni in Entrata (Backlinks)
                    </h4>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px;">Queste note contengono un link o citano questa pagina:</div>
        `;

        if (backlinks.length > 0) {
            bodyHTML += `<div style="display:flex; flex-direction:column; gap:6px;">`;
            backlinks.forEach(bl => {
                const blTitle = (bl.title || 'Senza Titolo').replace(/</g, '&lt;');
                bodyHTML += `
                    <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; cursor:pointer; transition:background 0.2s;" onmouseenter="this.style.background='var(--item-hover)'" onmouseleave="this.style.background='var(--bg-color)'" onclick="UI.selectNote('${bl.id}')">
                        <span style="color:var(--accent-color);">${Icons.arrowLeft}</span>
                        <span style="font-weight:bold; color:var(--text-primary); font-size:0.9rem;">${blTitle}</span>
                    </div>
                `;
            });
            bodyHTML += `</div>`;
        } else {
            bodyHTML += `<div style="font-size:0.85rem; color:var(--text-secondary); font-style:italic;">Nessuna nota punta a questa pagina.</div>`;
        }

        bodyHTML += `</div>`;

        // Outlinks
        bodyHTML += `
                <div>
                    <h4 style="margin:0 0 10px 0; color:var(--tx-c4); font-size:0.95rem; border-bottom:1px solid var(--border-color); padding-bottom:5px; display:flex; align-items:center; gap:6px;">
                        ${Icons.arrowRightUp} Menzioni in Uscita (Outlinks)
                    </h4>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px;">Questa pagina contiene link o cita le seguenti note:</div>
        `;

        if (outlinks.size > 0) {
            bodyHTML += `<div style="display:flex; flex-direction:column; gap:6px;">`;
            outlinks.forEach(outId => {
                const outNote = Store.getNote(outId);
                if (outNote && !outNote.deletedAt) {
                    const outTitle = (outNote.title || 'Senza Titolo').replace(/</g, '&lt;');
                    bodyHTML += `
                        <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:var(--bg-color); border:1px dashed var(--border-color); border-radius:6px; cursor:pointer; transition:background 0.2s;" onmouseenter="this.style.background='var(--item-hover)'" onmouseleave="this.style.background='var(--bg-color)'" onclick="UI.selectNote('${outNote.id}')">
                            <span style="color:var(--tx-c4);">${Icons.link}</span>
                            <span style="font-weight:bold; color:var(--text-primary); font-size:0.9rem;">${outTitle}</span>
                        </div>
                    `;
                }
            });
            bodyHTML += `</div>`;
        } else {
            bodyHTML += `<div style="font-size:0.85rem; color:var(--text-secondary); font-style:italic;">Questa pagina non punta verso altre note interne.</div>`;
        }

        bodyHTML += `</div>`;

        // Auditing Sotto-note
        bodyHTML += `
                <div>
                    <h4 style="margin:0 0 10px 0; color:var(--text-primary); font-size:0.95rem; border-bottom:1px solid var(--border-color); padding-bottom:5px; display:flex; align-items:center; gap:6px;">
                        ${Icons.treeNode} Analisi Proprietà Sotto-note
                    </h4>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">Verifica a colpo d'occhio che le note figlie siano taggate correttamente:</div>
                    ${subNotesHtml}
                </div>
            </div>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.info} Info: ${safeTitle}</span>`, bodyHTML, null);
    }
});