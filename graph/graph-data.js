/**
 * graph/graph-data.js
 * Modulo Estrattore Topologico del Grafo di VanillaDesk:
 * - Scansiona AppState.notes e SYS_PROPERTIES_DB per estrarre Nodi e Connessioni reali.
 * - PRESERVAZIONE COORDINATE PERSISTENTE: Mantiene inalterate le coordinate (x, y) dei nodi
 *   anche quando vengono temporaneamente nascosti tramite i filtri visivi (Tag, Record).
 * - Architettura Nativa VanillaDesk: riconosce solo collegamenti univoci reali (<a data-note-id="...">),
 *   citazioni (<blockquote data-ref-note="...">), gerarchie padre-figlio e tag censiti.
 * - Zero Nodi Fantasma: se un link punta a una nota eliminata o inesistente, viene ignorato.
 * - Colorazione Deterministica e Legenda Dinamica con Voci Interattive (Toggle rapidi).
 */

window.GraphData = {
    nodes: [],
    links: [],
    nodeMap: new Map(),
    neighborsMap: new Map(),
    folderColorMap: new Map(),
    tagColorMap: new Map(),
    persistentPositions: new Map(), // Memoria persistente delle coordinate (x, y, vx, vy)

    options: {
        showTags: true,
        showRecordNotes: true,
        showHierarchy: true,
        showCitations: true,
        colorMode: 'type' // 'type' | 'folder' | 'tag'
    },

    _getDistinctColor: (index) => {
        const palette = [
            '#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6',
            '#06b6d4', '#f97316', '#84cc16', '#a855f7', '#14b8a6',
            '#e11d48', '#3b82f6', '#d97706', '#6366f1', '#10b981'
        ];
        return palette[index % palette.length];
    },

    buildGraph: () => {
        // 1. Memorizza stabilmente le coordinate attuali dei nodi vivi nella cache persistente
        GraphData.nodes.forEach(n => {
            if (n.x !== 0 || n.y !== 0) {
                GraphData.persistentPositions.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy });
            }
        });

        GraphData.nodes = [];
        GraphData.links = [];
        GraphData.nodeMap.clear();
        GraphData.neighborsMap.clear();
        GraphData.folderColorMap.clear();
        GraphData.tagColorMap.clear();

        const notes = (AppState.notes || []).filter(n => !n.deletedAt);
        const validNoteIds = new Set();
        const noteByIdMap = new Map();

        // 2. Indicizzazione preliminare delle note attive
        notes.forEach(n => {
            validNoteIds.add(n.id);
            noteByIdMap.set(n.id, n);
        });

        // 3. Mappa tag primario (da SYS_PROPERTIES_DB o scansione hashtag)
        const notePrimaryTagMap = new Map();
        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];

        if (propsDb && Array.isArray(propsDb.rows)) {
            propsDb.rows.forEach(r => {
                const noteId = r.cells?.['sys_c_note'];
                const tags = r.cells?.['sys_c_tags'] || [];
                if (noteId && Array.isArray(tags) && tags.length > 0) {
                    const firstTag = String(tags[0]).replace(/^#+/, '').trim();
                    if (firstTag) notePrimaryTagMap.set(noteId, firstTag);
                }
            });
        }

        const tagRegex = /(?:^|\s)#([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ0-9_\-\/]*)/g;
        notes.forEach(n => {
            if (!notePrimaryTagMap.has(n.id) && n.content) {
                let m;
                tagRegex.lastIndex = 0;
                while ((m = tagRegex.exec(n.content)) !== null) {
                    const cleanTag = m[1].replace(/^#+/, '').trim();
                    if (cleanTag && !/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(cleanTag)) {
                        notePrimaryTagMap.set(n.id, cleanTag);
                        break;
                    }
                }
            }
        });

        const colorMode = GraphData.options.colorMode || 'type';

        // 4. Creazione Nodi Note
        let folderCounter = 0;
        let tagCounter = 0;

        notes.forEach((n, idx) => {
            const isRecord = !!n.isRecordNote;
            if (isRecord && !GraphData.options.showRecordNotes) return;

            // Recupera la posizione dalla memoria persistente
            const prev = GraphData.persistentPositions.get(n.id);

            // Risoluzione Cartella / Ramo Principale
            let folderName = '';
            if (n.parentId) {
                let curr = noteByIdMap.get(n.parentId);
                while (curr && curr.parentId && noteByIdMap.has(curr.parentId)) {
                    curr = noteByIdMap.get(curr.parentId);
                }
                folderName = curr ? (curr.title || 'Cartella') : 'Cartella';
            } else {
                const hasChildren = notes.some(child => child.parentId === n.id);
                folderName = hasChildren ? (n.title || 'Cartella') : (n.title || `Nota_${idx}`);
            }

            if (!GraphData.folderColorMap.has(folderName)) {
                GraphData.folderColorMap.set(folderName, GraphData._getDistinctColor(folderCounter++));
            }

            const primaryTag = notePrimaryTagMap.get(n.id) || '';
            if (primaryTag && !GraphData.tagColorMap.has(primaryTag)) {
                GraphData.tagColorMap.set(primaryTag, GraphData._getDistinctColor(tagCounter++));
            }

            // Assegnazione colore
            let nodeColor = isRecord ? '#10b981' : '#2563eb';
            if (colorMode === 'folder') {
                nodeColor = GraphData.folderColorMap.get(folderName);
            } else if (colorMode === 'tag') {
                nodeColor = primaryTag ? GraphData.tagColorMap.get(primaryTag) : '#6b7280';
            }

            const nodeObj = {
                id: n.id,
                title: n.title || 'Senza Titolo',
                type: isRecord ? 'record_note' : 'note',
                color: nodeColor,
                folderName: folderName,
                primaryTag: primaryTag,
                radius: isRecord ? 5 : 7,
                degree: 0,
                x: prev ? prev.x : 0,
                y: prev ? prev.y : 0,
                vx: prev ? prev.vx : 0,
                vy: prev ? prev.vy : 0
            };

            GraphData.nodes.push(nodeObj);
            GraphData.nodeMap.set(n.id, nodeObj);
            GraphData.neighborsMap.set(n.id, new Set());
        });

        // 5. Estrazione Connessioni Reali di VanillaDesk
        notes.forEach(n => {
            const sourceId = n.id;
            if (!GraphData.nodeMap.has(sourceId)) return;

            // A. Gerarchia Padre-Figlio (Cartelle)
            if (GraphData.options.showHierarchy && n.parentId && validNoteIds.has(n.parentId)) {
                if (GraphData.nodeMap.has(n.parentId)) {
                    GraphData.addLink(sourceId, n.parentId, 'hierarchy');
                }
            }

            if (!n.content) return;

            // B. Link HTML Interni di VanillaDesk (<a class="internal-link" data-note-id="...">)
            const linkRegex = /<a\b[^>]*\bdata-note-id=["']([^"']+)["'][^>]*>/gi;
            let match;
            while ((match = linkRegex.exec(n.content)) !== null) {
                const targetId = match[1];
                if (validNoteIds.has(targetId) && GraphData.nodeMap.has(targetId)) {
                    GraphData.addLink(sourceId, targetId, 'link');
                }
            }

            // C. Citazioni Live di VanillaDesk (<blockquote data-ref-note="...">)
            if (GraphData.options.showCitations) {
                const citRegex = /<blockquote\b[^>]*\bdata-ref-note=["']([^"']+)["'][^>]*>/gi;
                while ((match = citRegex.exec(n.content)) !== null) {
                    const targetId = match[1];
                    if (validNoteIds.has(targetId) && GraphData.nodeMap.has(targetId)) {
                        GraphData.addLink(sourceId, targetId, 'citation');
                    }
                }
            }
        });

        // 6. Estrazione Nodi Tag (SYS_PROPERTIES_DB) con conservazione e baricentro
        if (GraphData.options.showTags && AppState.databases && AppState.databases['SYS_PROPERTIES_DB']) {
            const tagNodesMap = new Map();

            (propsDb.rows || []).forEach(r => {
                const noteId = r.cells?.['sys_c_note'];
                if (!noteId || !GraphData.nodeMap.has(noteId)) return;

                const tags = r.cells?.['sys_c_tags'] || [];
                tags.forEach(rawTag => {
                    const tag = String(rawTag).trim();
                    if (!tag) return;

                    let tagId = tagNodesMap.get(tag.toLowerCase());
                    if (!tagId) {
                        tagId = 'tag_' + tag.toLowerCase();
                        tagNodesMap.set(tag.toLowerCase(), tagId);

                        // Recupero dalla memoria persistente globale
                        const prevTag = GraphData.persistentPositions.get(tagId);
                        const tagColor = colorMode === 'tag' && GraphData.tagColorMap.has(tag) 
                            ? GraphData.tagColorMap.get(tag) 
                            : '#8b5cf6';

                        // Se il tag non è mai stato posizionato, inizializzalo in prossimità della nota di riferimento anziché a (0, 0)
                        let initX = 0;
                        let initY = 0;
                        if (prevTag) {
                            initX = prevTag.x;
                            initY = prevTag.y;
                        } else {
                            const sourceNote = GraphData.nodeMap.get(noteId);
                            if (sourceNote && (sourceNote.x !== 0 || sourceNote.y !== 0)) {
                                const angle = Math.random() * Math.PI * 2;
                                const dist = 50 + Math.random() * 40;
                                initX = sourceNote.x + Math.cos(angle) * dist;
                                initY = sourceNote.y + Math.sin(angle) * dist;
                            }
                        }

                        const tagNode = {
                            id: tagId,
                            title: '#' + tag,
                            type: 'tag',
                            color: tagColor,
                            radius: 5,
                            degree: 0,
                            x: initX,
                            y: initY,
                            vx: prevTag ? prevTag.vx : 0,
                            vy: prevTag ? prevTag.vy : 0
                        };
                        GraphData.nodes.push(tagNode);
                        GraphData.nodeMap.set(tagId, tagNode);
                        GraphData.neighborsMap.set(tagId, new Set());
                    }

                    GraphData.addLink(noteId, tagId, 'tag_link');
                });
            });
        }

        // 7. Dimensionamento proporzionale al numero di connessioni
        GraphData.nodes.forEach(node => {
            const deg = node.degree || 0;
            const baseRadius = node.type === 'note' ? 4 : (node.type === 'record_note' ? 4 : 3);
            node.radius = Math.min(18, baseRadius + Math.sqrt(deg) * 2);
        });

        // 8. Aggiornamento contatore badge
        const statsBadge = document.getElementById('graphStatsBadge');
        if (statsBadge) {
            statsBadge.innerText = `${GraphData.nodes.length} nodi • ${GraphData.links.length} collegamenti`;
        }

        // 9. Aggiornamento legenda
        GraphData.updateLegendUI();
    },

    updateLegendUI: () => {
        const legendContainer = document.getElementById('graphLegendContainer');
        if (!legendContainer) return;

        const colorMode = GraphData.options.colorMode || 'type';
        const opts = GraphData.options;

        let nodesLegendHtml = '';
        if (colorMode === 'type') {
            nodesLegendHtml = `
                <div class="legend-item" title="Note ordinarie del Workspace">
                    <span class="legend-dot" style="background:#2563eb;"></span> Nota
                </div>
                <div class="legend-item interactive ${opts.showRecordNotes ? '' : 'inactive'}" 
                     onclick="GraphUI.toggleOption('showRecordNotes')" 
                     title="Clicca per mostrare/nascondere le Pagine Record di Database">
                    <span class="legend-dot" style="background:#10b981;"></span> Record DB
                </div>
                <div class="legend-item interactive ${opts.showTags ? '' : 'inactive'}" 
                     onclick="GraphUI.toggleOption('showTags')" 
                     title="Clicca per mostrare/nascondere i Nodi Tag (#)">
                    <span class="legend-dot" style="background:#8b5cf6;"></span> Tag (#)
                </div>
            `;
        } else if (colorMode === 'folder') {
            const entries = Array.from(GraphData.folderColorMap.entries()).slice(0, 5);
            entries.forEach(([name, color]) => {
                nodesLegendHtml += `<div class="legend-item"><span class="legend-dot" style="background:${color};"></span> ${UI.escapeHTML(name)}</div>`;
            });
            if (!nodesLegendHtml) nodesLegendHtml = '<div class="legend-item">Nessuna cartella</div>';
        } else if (colorMode === 'tag') {
            const entries = Array.from(GraphData.tagColorMap.entries()).slice(0, 5);
            entries.forEach(([tag, color]) => {
                nodesLegendHtml += `<div class="legend-item"><span class="legend-dot" style="background:${color};"></span> #${UI.escapeHTML(tag)}</div>`;
            });
            nodesLegendHtml += `<div class="legend-item"><span class="legend-dot" style="background:#6b7280;"></span> Senza Tag</div>`;
        }

        // Legenda dei tipi di collegamento con scorciatoie interattive
        const linksLegendHtml = `
            <div style="width:1px; height:14px; background:var(--border-color); margin: 0 4px;"></div>
            <div class="legend-item interactive ${opts.showHierarchy ? '' : 'inactive'}" 
                 onclick="GraphUI.toggleOption('showHierarchy')" 
                 title="Clicca per mostrare/nascondere i collegamenti gerarchici tra Cartelle e Note">
                <span style="display:inline-block; width:16px; height:2px; background:#f59e0b; margin-right:2px;"></span> Cartella
            </div>
            <div class="legend-item interactive ${opts.showCitations ? '' : 'inactive'}" 
                 onclick="GraphUI.toggleOption('showCitations')" 
                 title="Clicca per mostrare/nascondere i collegamenti da Citazioni Live (Transclusion)">
                <span style="display:inline-block; width:16px; height:2px; background:var(--text-secondary); opacity:0.6; margin-right:2px;"></span> Citazioni
            </div>
            <div class="legend-item interactive ${opts.showTags ? '' : 'inactive'}" 
                 onclick="GraphUI.toggleOption('showTags')" 
                 title="Clicca per mostrare/nascondere i collegamenti ai Tag (#)">
                <span style="display:inline-block; width:16px; height:0px; border-top:2px dashed #8b5cf6; margin-right:2px;"></span> Tag
            </div>
        `;

        legendContainer.innerHTML = nodesLegendHtml + linksLegendHtml;
    },

    addLink: (sourceId, targetId, type) => {
        if (sourceId === targetId) return;

        const sourceNode = GraphData.nodeMap.get(sourceId);
        const targetNode = GraphData.nodeMap.get(targetId);
        if (!sourceNode || !targetNode) return;

        const alreadyLinked = GraphData.neighborsMap.get(sourceId)?.has(targetId);
        if (alreadyLinked) return;

        GraphData.links.push({
            source: sourceNode,
            target: targetNode,
            type: type
        });

        sourceNode.degree = (sourceNode.degree || 0) + 1;
        targetNode.degree = (targetNode.degree || 0) + 1;

        GraphData.neighborsMap.get(sourceId).add(targetId);
        GraphData.neighborsMap.get(targetId).add(sourceId);
    }
};