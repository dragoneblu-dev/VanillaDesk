/**
 * AdvancedTableCharts.js
 * Modulo per la generazione di grafici basati su Tabelle Pivot utilizzando Chart.js.
 * Colori delle palette letti dinamicamente dalle variabili CSS definite in variables.css (con fallback espliciti)
 * e supporto alla palette Select con assegnazione univoca anti-duplicazione per opzioni prive di colore esplicito.
 * Layout della Torta/Ciambella con marginazione dinamica, Flexbox affiancato, anti-collisione etichette per rilevanza,
 * adattamento del bordo spicchi ad alta densità e auto-scaling del totale centrale (centerText) basato su innerRadius.
 * Supporto per 3 altezze configurabili (Piccola, Media, Grande) per Barre, Linee, Torta e Ciambella.
 * Guardia preventiva isPie in cima ad afterDatasetsDraw prima di ctx.save() per eliminare overhead.
 * Supporto Time-Series ad alta densità (365+ giorni) con asse adattivo (cambi mese),
 * soppressione automatica delle etichette numeriche, geometria ottimizzata delle barre e tooltip unificato.
 * Supporto a ordinamento per valore (desc/asc), raggruppamento Top-N + Altri, ereditarietà unità/decimali,
 * opzione beginAtZero e scala percentuale 100% per grafici impilati.
 */

const AdvancedTableCharts = {
    instances: {},

    openConfigMenu: (tableId) => {
        if (typeof AdvancedPivotMenus !== 'undefined') {
            AdvancedPivotMenus.openCreateWizard(tableId, true);
        }
    },

    _clearInstances: (tableId) => {
        if (AdvancedTableCharts.instances[tableId]) {
            if (Array.isArray(AdvancedTableCharts.instances[tableId])) {
                AdvancedTableCharts.instances[tableId].forEach(chart => chart.destroy());
            } else {
                AdvancedTableCharts.instances[tableId].destroy();
            }
            delete AdvancedTableCharts.instances[tableId];
        }
    },

    // Estrae unità di misura e decimali dalla colonna sorgente (escluso il conteggio puro)
    _getMetricMeta: (agg, sourceState) => {
        if (!agg || agg.type === 'count' || !sourceState || !Array.isArray(sourceState.columns)) {
            return { numberUnit: '', decimals: undefined };
        }
        const col = sourceState.columns.find(c => c.id === agg.sourceColId);
        return {
            numberUnit: col && col.numberUnit ? col.numberUnit : '',
            decimals: col ? col.decimals : undefined
        };
    },

    // Formatta un valore numerico rispettando decimali e unità di misura della colonna
    _formatMetricValue: (val, meta = null) => {
        if (val === null || val === undefined || isNaN(Number(val))) return '0';
        const num = Number(val);
        let numStr;
        if (meta && meta.decimals !== undefined && meta.decimals !== 'default') {
            numStr = num.toFixed(parseInt(meta.decimals, 10));
        } else {
            numStr = String(Math.round(num * 100) / 100);
        }
        if (meta && meta.numberUnit) {
            numStr += meta.numberUnit === '%' ? '%' : ` ${meta.numberUnit}`;
        }
        return numStr;
    },

    // Risolve il colore saturo reale da una classe pillola Select (hl-c* / tx-c*), restituendo null se non assegnato
    _resolveExplicitSelectColor: (optionName, colDef, sourceState, style) => {
        if (!colDef || !sourceState || !sourceState.selectColors || !sourceState.selectColors[colDef.id]) {
            return null;
        }
        const cls = sourceState.selectColors[colDef.id][optionName];
        if (!cls) return null;

        const match = cls.match(/(?:hl|tx)-c(\d+)/);
        if (match && match[1]) {
            const tokenColor = style.getPropertyValue(`--tx-c${match[1]}`).trim();
            if (tokenColor) return tokenColor;
        }
        return null;
    },

    // Costruisce una mappa colori univoca per tutte le voci Select evitando duplicazioni con i colori già assegnati
    _buildSelectColorMap: (optionNames, colDef, sourceState, style, fallbackPalette) => {
        const resultMap = new Map();
        const usedColors = new Set();

        // Pool completo di colori distinti disponibili (palette tema + tutti i token --tx-c1..c10)
        const pool = [...fallbackPalette];
        for (let i = 1; i <= 10; i++) {
            const c = style.getPropertyValue(`--tx-c${i}`).trim();
            if (c && !pool.some(p => p.toLowerCase() === c.toLowerCase())) {
                pool.push(c);
            }
        }

        // Passaggio 1: registra i colori esplicitamente configurati nella colonna Select
        optionNames.forEach(name => {
            const explicit = AdvancedTableCharts._resolveExplicitSelectColor(name, colDef, sourceState, style);
            if (explicit) {
                resultMap.set(name, explicit);
                usedColors.add(explicit.toLowerCase());
            }
        });

        // Passaggio 2: per le opzioni senza colore, assegna il primo colore libero non ancora utilizzato
        let cycleIdx = 0;
        optionNames.forEach(name => {
            if (resultMap.has(name)) return;

            let chosen = pool.find(c => c && !usedColors.has(c.toLowerCase()));
            if (!chosen) {
                chosen = pool[cycleIdx % pool.length] || '#2563eb';
                cycleIdx++;
            }
            resultMap.set(name, chosen);
            usedColors.add(chosen.toLowerCase());
        });

        return resultMap;
    },

    // Calcola colore testo contrastato (#ffffff o #111827) su segmenti impilati
    _getContrastingLabelColor: (bgColorStr, defaultTextColor) => {
        if (!bgColorStr || typeof bgColorStr !== 'string') return defaultTextColor;
        let r = 0, g = 0, b = 0;

        if (bgColorStr.startsWith('#')) {
            let hex = bgColorStr.slice(1).trim();
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            if (hex.length === 6) {
                const num = parseInt(hex, 16);
                r = (num >> 16) & 255;
                g = (num >> 8) & 255;
                b = num & 255;
            } else {
                return defaultTextColor;
            }
        } else {
            const m = bgColorStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
            if (!m) return defaultTextColor;
            r = parseInt(m[1], 10);
            g = parseInt(m[2], 10);
            b = parseInt(m[3], 10);
        }

        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.62 ? '#111827' : '#ffffff';
    },

    // =========================================================================
    // PLUGIN CUSTOM PER CHART.JS
    // =========================================================================
    
    _getCustomDataLabelsPlugin: () => {
        return {
            id: 'customDataLabels',
            afterDatasetsDraw(chart, args, pluginOptions) {
                if (!pluginOptions || !pluginOptions.display) return;
                
                // GUARDIA PREVENTIVA: Se il tipo non è torta o ciambella, esci subito prima di alterare il canvas
                const isPie = chart.config && (chart.config.type === 'doughnut' || chart.config.type === 'pie');
                if (!isPie) return; 

                const { ctx, data } = chart;
                ctx.save();
                
                const textColor = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#666';
                const accentColor = getComputedStyle(document.body).getPropertyValue('--border-color').trim() || '#ccc';
                const metricMeta = pluginOptions.metricMeta || null;
                
                ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const meta0 = chart.getDatasetMeta(0);
                const isSliceVisible = (idx) => {
                    if (typeof chart.getDataVisibility === 'function' && !chart.getDataVisibility(idx)) {
                        return false;
                    }
                    if (meta0 && meta0.data && meta0.data[idx] && meta0.data[idx].hidden) {
                        return false;
                    }
                    return true;
                };

                let totalPie = 0;
                data.datasets[0].data.forEach((val, idx) => {
                    if (isSliceVisible(idx)) {
                        totalPie += (val || 0);
                    }
                });
                if (totalPie <= 0) {
                    ctx.restore();
                    return;
                }

                // Raccoglie gli spicchi visibili ordinati per valore decrescente (priorità agli elementi più rilevanti)
                const candidates = [];
                if (meta0 && !meta0.hidden) {
                    meta0.data.forEach((element, index) => {
                        const val = data.datasets[0].data[index];
                        if (!val || val <= 0 || !isSliceVisible(index)) return;
                        const pctNum = (val / totalPie) * 100;
                        candidates.push({ element, index, val, pctNum });
                    });
                }

                const totalSlices = candidates.length;
                const minPctThreshold = totalSlices > 10 ? 2.5 : 0;

                // Ordina dal valore più grande al più piccolo per assegnare le etichette agli elementi più rilevanti
                candidates.sort((a, b) => b.val - a.val);

                const placedLeftY = [];
                const placedRightY = [];
                const MIN_VERTICAL_GAP = 15;

                candidates.forEach((item, rank) => {
                    // Con molti spicchi, mostra solo gli elementi statisticamente rilevanti (o almeno i top 5)
                    if (totalSlices > 10 && item.pctNum < minPctThreshold && rank >= 5) return;

                    const model = item.element;
                    const angle = (model.startAngle + model.endAngle) / 2;
                    const isRightSide = Math.cos(angle) >= 0;

                    const rOuter = model.outerRadius;
                    const rLineStart = rOuter + 3;
                    const rLineKnee = rOuter + 15;

                    const startX = model.x + Math.cos(angle) * rLineStart;
                    const startY = model.y + Math.sin(angle) * rLineStart;

                    const kneeX = model.x + Math.cos(angle) * rLineKnee;
                    const kneeY = model.y + Math.sin(angle) * rLineKnee;

                    const elbowLength = 10;
                    const endX = kneeX + (isRightSide ? elbowLength : -elbowLength);
                    const endY = kneeY;

                    // Anti-collisione verticale sullo stesso lato: evita sovrapposizioni di testo
                    const placedList = isRightSide ? placedRightY : placedLeftY;
                    const collides = placedList.some(y => Math.abs(y - endY) < MIN_VERTICAL_GAP);
                    if (collides) return;
                    placedList.push(endY);

                    ctx.fillStyle = textColor;
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(kneeX, kneeY);
                    ctx.lineTo(endX, endY);
                    ctx.strokeStyle = accentColor;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    
                    const pct = Math.round(item.pctNum * 10) / 10 + '%';
                    const formattedVal = AdvancedTableCharts._formatMetricValue(item.val, metricMeta);
                    const text = `${formattedVal} (${pct})`;
                    
                    const canvasWidth = chart.width;
                    let maxTextWidth = isRightSide ? (canvasWidth - endX - 5) : (endX - 5);
                    maxTextWidth = Math.max(maxTextWidth, 40);

                    ctx.textAlign = isRightSide ? 'left' : 'right';
                    ctx.fillText(text, endX + (isRightSide ? 5 : -5), endY, maxTextWidth);
                });

                ctx.restore();
            }
        };
    },

    _getCenterTextPlugin: () => {
        return {
            id: 'centerText',
            beforeDraw(chart, args, pluginOptions) {
                if (!chart.config || chart.config.type !== 'doughnut' || !pluginOptions || !pluginOptions.display) return;
                
                const { ctx, data, chartArea } = chart;
                ctx.save();
                
                const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#000';
                const meta0 = chart.getDatasetMeta(0);
                const metricMeta = pluginOptions.metricMeta || null;

                let sum = 0;
                data.datasets[0].data.forEach((val, i) => {
                    const visibleByApi = typeof chart.getDataVisibility === 'function' ? chart.getDataVisibility(i) : true;
                    const hiddenByMeta = !!(meta0 && meta0.data && meta0.data[i] && meta0.data[i].hidden);
                    if (visibleByApi && !hiddenByMeta) {
                        sum += (val || 0);
                    }
                });

                const sumText = AdvancedTableCharts._formatMetricValue(sum, metricMeta);

                const centerX = (chartArea.left + chartArea.right) / 2;
                const centerY = (chartArea.top + chartArea.bottom) / 2;

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Calcolo dinamico e proporzionale della dimensione del font
                const firstArc = meta0 && meta0.data && meta0.data[0];
                const innerRadius = (firstArc && firstArc.innerRadius) ? firstArc.innerRadius : 0;

                const chartHeight = pluginOptions.chartHeight || 'medium';

                let targetFontSize = 24;
                if (chartHeight === 'small') {
                    targetFontSize = 15;
                } else if (chartHeight === 'large') {
                    targetFontSize = 34;
                }

                // Auto-scaling sul raggio interno reale della ciambella per non sforare mai
                if (innerRadius > 0) {
                    const maxAllowedWidth = innerRadius * 1.6;
                    const maxAllowedHeight = innerRadius * 1.2;

                    // Limita l'altezza del font all'ingombro del foro centrale
                    if (targetFontSize > maxAllowedHeight) {
                        targetFontSize = Math.floor(maxAllowedHeight);
                    }

                    // Verifica la larghezza del testo e scala verso il basso se eccede
                    ctx.font = `bold ${targetFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                    let textWidth = ctx.measureText(sumText).width;

                    if (textWidth > maxAllowedWidth && textWidth > 0) {
                        targetFontSize = Math.max(9, Math.floor(targetFontSize * (maxAllowedWidth / textWidth)));
                    }
                }

                ctx.font = `bold ${targetFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                ctx.fillStyle = textColor;
                ctx.fillText(sumText, centerX, centerY);

                ctx.restore();
            }
        };
    },

    renderChart: (tableId, containerId, pivotRows, state) => {
        if (typeof Chart === 'undefined') return;

        const container = document.getElementById(containerId);
        if (!container) return;

        AdvancedTableCharts._clearInstances(tableId);

        const config = state.chartConfig || { visible: false, type: 'bar', stacked: false, showLabels: true, centerTotal: true, legendPos: 'bottom', colorPalette: 'default', height: 'medium', sortOrder: 'default', topN: 'all', beginAtZero: true, stacked100: false };
        if (!config.visible) return;

        if (!state.groupBy || state.groupBy.length === 0 || !state.aggregations || state.aggregations.length === 0) {
            container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-secondary);">Configura almeno un raggruppamento e una metrica numerica per vedere il grafico.</div>`;
            return;
        }

        const style = getComputedStyle(document.body);
        const textColor = style.getPropertyValue('--text-primary').trim();
        const gridColor = style.getPropertyValue('--border-color').trim();
        const bgColor = style.getPropertyValue('--bg-color').trim();

        const pastelDefaults = ['#93c5fd', '#fca5a5', '#86efac', '#fde047', '#d8b4fe', '#f9a8d4'];
        const vibrantDefaults = ['#2563eb', '#dc2626', '#16a34a', '#ea580c', '#9333ea', '#db2777'];
        const oceanDefaults = ['#0284c7', '#0d9488', '#3b82f6', '#06b6d4', '#6366f1', '#1e40af'];
        const sunsetDefaults = ['#ea580c', '#e11d48', '#d97706', '#9333ea', '#f59e0b', '#be123c'];

        // Lettura dinamica dai CSS con fallback esplicito se le variabili non sono definite nel tema
        const palettes = {
            default: [
                style.getPropertyValue('--accent-color').trim() || '#2563eb',
                style.getPropertyValue('--tx-c4').trim() || '#ff8600',
                style.getPropertyValue('--tx-c6').trim() || '#00a856',
                style.getPropertyValue('--tx-c8').trim() || '#853bc7',
                style.getPropertyValue('--tx-c9').trim() || '#c52779',
                style.getPropertyValue('--tx-c3').trim() || '#b15a35',
                style.getPropertyValue('--tx-c7').trim() || '#0f8ddf',
                style.getPropertyValue('--tx-c5').trim() || '#c09d00',
                style.getPropertyValue('--tx-c10').trim() || '#ce1711',
                style.getPropertyValue('--tx-c2').trim() || '#878787'
            ],
            pastel: [1, 2, 3, 4, 5, 6].map((i, idx) => style.getPropertyValue(`--chart-pastel-${i}`).trim() || pastelDefaults[idx]),
            vibrant: [1, 2, 3, 4, 5, 6].map((i, idx) => style.getPropertyValue(`--chart-vibrant-${i}`).trim() || vibrantDefaults[idx]),
            ocean: [1, 2, 3, 4, 5, 6].map((i, idx) => style.getPropertyValue(`--chart-ocean-${i}`).trim() || oceanDefaults[idx]),
            sunset: [1, 2, 3, 4, 5, 6].map((i, idx) => style.getPropertyValue(`--chart-sunset-${i}`).trim() || sunsetDefaults[idx])
        };

        const activePalette = config.colorPalette || 'default';
        const multiColors = palettes[activePalette] || palettes.default;

        let chartType = config.type;
        let indexAxis = 'x';
        
        if (chartType === 'horizontalBar') {
            chartType = 'bar';
            indexAxis = 'y';
        }

        const isHorizontal = indexAxis === 'y';
        const catAxis = isHorizontal ? 'y' : 'x';
        const valAxis = isHorizontal ? 'x' : 'y';

        const isPie = chartType === 'doughnut' || chartType === 'pie';
        const isStackedEngine = config.stacked && state.groupBy.length >= 2 && !isPie;
        const isStacked100 = isStackedEngine && config.stacked100 === true;
        const legendPos = config.legendPos || 'bottom';
        const chartHeight = config.height || 'medium';
        const sortOrder = config.sortOrder || 'default';
        const topNLimit = (config.topN && config.topN !== 'all') ? parseInt(config.topN, 10) : 0;
        const otherLabel = (typeof I18n !== 'undefined' && I18n.t('adv_charts.other_category') !== 'adv_charts.other_category')
            ? I18n.t('adv_charts.other_category')
            : 'Altro';

        // Definizione altezze personalizzabili
        let standardBarHeight = '400px';
        let pieWrapperHeight = '350px';
        let pieWrapperMaxWidth = '500px';

        if (chartHeight === 'small') {
            standardBarHeight = '260px';
            pieWrapperHeight = '240px';
            pieWrapperMaxWidth = '380px';
        } else if (chartHeight === 'large') {
            standardBarHeight = '600px';
            pieWrapperHeight = '520px';
            pieWrapperMaxWidth = '700px';
        }

        const hasDataLabelsPlugin = typeof ChartDataLabels !== 'undefined';
        const customPlugins = [AdvancedTableCharts._getCenterTextPlugin()];
        
        if (isPie) {
            customPlugins.push(AdvancedTableCharts._getCustomDataLabelsPlugin());
        } else if (hasDataLabelsPlugin) {
            customPlugins.push(ChartDataLabels);
        }

        const sourceState = typeof AdvancedTable !== 'undefined' ? AdvancedTable.getTableState(state.sourceTableId) : null;

        if (isPie) {
            container.innerHTML = ''; 
            container.style.display = 'flex';
            container.style.flexWrap = 'wrap';
            container.style.gap = '20px';
            container.style.justifyContent = 'center';
            container.style.alignItems = 'center';
            container.style.overflowY = 'auto';

            AdvancedTableCharts.instances[tableId] = [];

            const rawPieLabels = pivotRows.map(row => {
                let parts = [];
                state.groupBy.forEach((g, idx) => {
                    let val = row.virtualCells['grp_' + idx] || 'Nessuno';
                    parts.push(val.replace(/<[^>]*>?/gm, ''));
                });
                return parts.join(' - ');
            });

            const grp0Col = (sourceState && state.groupBy.length > 0) ? sourceState.columns.find(c => c.id === state.groupBy[0]) : null;
            const useSelectColors = activePalette === 'select' && grp0Col && (grp0Col.type === 'select' || grp0Col.type === 'multi-select');

            state.aggregations.forEach((agg, idx) => {
                if (agg.type === 'list') return;

                const metricMeta = AdvancedTableCharts._getMetricMeta(agg, sourceState);

                let items = pivotRows.map((row, rIdx) => {
                    let v = parseFloat(row.virtualCells['agg_' + idx]);
                    return { label: rawPieLabels[rIdx], value: isNaN(v) ? 0 : v, isOther: false };
                }).filter(it => it.value > 0);

                if (items.length === 0) return;

                // Top-N + Altri per Torta/Ciambella
                if (topNLimit > 0 && items.length > topNLimit) {
                    const ranked = [...items].sort((a, b) => b.value - a.value);
                    const kept = ranked.slice(0, topNLimit);
                    const rest = ranked.slice(topNLimit);
                    let otherVal = 0;
                    if (agg.type === 'avg') otherVal = rest.reduce((s, x) => s + x.value, 0) / rest.length;
                    else if (agg.type === 'max') otherVal = Math.max(...rest.map(x => x.value));
                    else if (agg.type === 'min') otherVal = Math.min(...rest.map(x => x.value));
                    else otherVal = rest.reduce((s, x) => s + x.value, 0);

                    if (sortOrder === 'asc') {
                        kept.sort((a, b) => a.value - b.value);
                        items = kept;
                    } else if (sortOrder === 'default') {
                        const keptSet = new Set(kept);
                        items = items.filter(it => keptSet.has(it));
                    } else {
                        items = kept;
                    }
                    items.push({ label: otherLabel, value: otherVal, isOther: true });
                } else if (sortOrder === 'desc') {
                    items.sort((a, b) => b.value - a.value);
                } else if (sortOrder === 'asc') {
                    items.sort((a, b) => a.value - b.value);
                }

                const pieLabels = items.map(it => it.label);
                const dataValues = items.map(it => it.value);

                let pieSliceColors = multiColors;
                if (useSelectColors) {
                    const colorMap = AdvancedTableCharts._buildSelectColorMap(pieLabels, grp0Col, sourceState, style, multiColors);
                    pieSliceColors = items.map(it => it.isOther ? '#9ca3af' : colorMap.get(it.label));
                } else if (items.some(it => it.isOther)) {
                    pieSliceColors = items.map((it, cIdx) => it.isOther ? '#9ca3af' : multiColors[cIdx % multiColors.length]);
                }

                const wrapper = document.createElement('div');
                wrapper.style.flex = '1 1 280px';
                wrapper.style.maxWidth = pieWrapperMaxWidth; 
                wrapper.style.height = pieWrapperHeight; 
                wrapper.style.position = 'relative';
                
                const canvas = document.createElement('canvas');
                wrapper.appendChild(canvas);
                container.appendChild(wrapper);

                // Adattamento dinamico del bordo spicchi per evitare rumore visivo sui micro-spicchi
                const visibleSlicesCount = dataValues.filter(v => v > 0).length;
                const sliceBorderWidth = visibleSlicesCount > 24 ? 0 : (visibleSlicesCount > 12 ? 1 : 2);

                // Se ci sono molti spicchi, limita la legenda ai Top 12 per evitare che tagli il grafico
                let topLegendIndices = null;
                if (pieLabels.length > 15) {
                    topLegendIndices = new Set(
                        dataValues
                            .map((v, i) => ({ v, i }))
                            .sort((a, b) => b.v - a.v)
                            .slice(0, 12)
                            .map(x => x.i)
                    );
                }

                // Padding di Chart Area per gestire il layout globale
                let layoutPadding = 10;
                if (config.showLabels && legendPos !== 'none') {
                    if (legendPos === 'bottom' || legendPos === 'top') layoutPadding = { left: 60, right: 60, top: 10, bottom: 10 };
                    if (legendPos === 'right') layoutPadding = { left: 40, right: 0, top: 10, bottom: 10 };
                    if (legendPos === 'left') layoutPadding = { left: 0, right: 40, top: 10, bottom: 10 };
                }

                const totalPieSum = dataValues.reduce((a, b) => a + b, 0);

                const chartConfig = {
                    type: chartType,
                    data: {
                        labels: pieLabels,
                        datasets: [{
                            data: dataValues,
                            backgroundColor: pieSliceColors,
                            borderColor: bgColor,
                            borderWidth: sliceBorderWidth,
                            radius: config.showLabels ? '60%' : '95%',
                            cutout: chartType === 'doughnut' ? '50%' : '0%'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: layoutPadding }, 
                        plugins: {
                            title: { 
                                display: true, 
                                text: agg.label || 'Metrica', 
                                color: textColor, 
                                font: { size: chartHeight === 'small' ? 12 : 14 }
                            },
                            legend: { 
                                display: legendPos !== 'none', 
                                position: legendPos === 'none' ? 'bottom' : legendPos, 
                                labels: {
                                    color: textColor,
                                    boxWidth: topLegendIndices ? 10 : 12,
                                    padding: topLegendIndices ? 8 : 15,
                                    font: topLegendIndices ? { size: 10 } : undefined,
                                    filter: topLegendIndices ? (legendItem) => topLegendIndices.has(legendItem.index) : undefined
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: (item) => {
                                        const val = item.parsed || 0;
                                        const pct = totalPieSum > 0 ? Math.round((val / totalPieSum) * 1000) / 10 : 0;
                                        return ` ${item.label}: ${AdvancedTableCharts._formatMetricValue(val, metricMeta)} (${pct}%)`;
                                    }
                                }
                            },
                            customDataLabels: { display: config.showLabels !== false, metricMeta },
                            datalabels: { display: false },
                            centerText: { 
                                display: config.centerTotal !== false && chartType === 'doughnut',
                                chartHeight: chartHeight,
                                metricMeta
                            }
                        }
                    },
                    plugins: customPlugins
                };

                AdvancedTableCharts.instances[tableId].push(new Chart(canvas, chartConfig));
            });

            if (container.innerHTML === '') {
                container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-secondary);">Nessuna metrica numerica valida per generare un grafico a Torta.</div>`;
            }
            return;
        }

        // GRAFICI A BARRE / LINEE (Time-Series Continuo, Singoli o Stacked)
        const timeSeries = (typeof AdvancedPivot !== 'undefined' && typeof AdvancedPivot.buildTimeSeriesChartData === 'function')
            ? AdvancedPivot.buildTimeSeriesChartData(tableId)
            : null;

        let labels = [];
        let datasets = [];
        let timeBuckets = null;
        let footerNotices = [];

        if (timeSeries) {
            if (timeSeries.buckets.length === 0) {
                container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-secondary);">${I18n.t('adv_charts.no_valid_dates')}</div>`;
                return;
            }

            timeBuckets = timeSeries.buckets;
            labels = timeBuckets.map(b => b.shortLabel);
            const bucketCount = timeBuckets.length;
            const isHighDensity = bucketCount > 60;

            if (timeSeries.autoGranularityScaled) {
                const msgKey = timeSeries.effectiveGranularity === 'month'
                    ? 'adv_charts.auto_scaled_month'
                    : 'adv_charts.auto_scaled_week';
                footerNotices.push(I18n.t(msgKey));
            }
            if (timeSeries.unscheduledCount > 0) {
                footerNotices.push(I18n.t('adv_charts.unscheduled_excluded', { count: timeSeries.unscheduledCount }));
            }

            if (timeSeries.seriesColDef) {
                const targetMeta = AdvancedTableCharts._getMetricMeta(timeSeries.targetAgg, timeSeries.sourceState);
                if (timeSeries.seriesKeys.length === 0) {
                    const emptySerieColor = multiColors[0];
                    datasets.push({
                        label: timeSeries.targetAgg ? timeSeries.targetAgg.label : I18n.t('adv_pivot.default_metric'),
                        data: timeBuckets.map(() => 0),
                        metricMeta: targetMeta,
                        backgroundColor: chartType === 'line' ? 'transparent' : emptySerieColor,
                        borderColor: emptySerieColor,
                        borderWidth: isHighDensity ? 0 : (chartType === 'line' ? 2.5 : 1),
                        borderRadius: isHighDensity ? 0 : 4
                    });
                } else {
                    const useSelectColors = activePalette === 'select' && (timeSeries.seriesColDef.type === 'select' || timeSeries.seriesColDef.type === 'multi-select');
                    const selectColorMap = useSelectColors
                        ? AdvancedTableCharts._buildSelectColorMap(timeSeries.seriesKeys, timeSeries.seriesColDef, timeSeries.sourceState, style, multiColors)
                        : null;

                    timeSeries.seriesKeys.forEach((seriesName, sIdx) => {
                        const color = selectColorMap
                            ? selectColorMap.get(seriesName)
                            : multiColors[sIdx % multiColors.length];

                        datasets.push({
                            label: seriesName,
                            data: timeSeries.datasetsData[seriesName] || [],
                            metricMeta: targetMeta,
                            backgroundColor: chartType === 'line' ? 'transparent' : color,
                            borderColor: color,
                            borderWidth: chartType === 'line' ? 2.5 : (isHighDensity ? 0 : 1),
                            borderRadius: isHighDensity ? 0 : 3,
                            categoryPercentage: isHighDensity ? 0.9 : 0.8,
                            barPercentage: isHighDensity ? 0.9 : 0.9,
                            pointRadius: isHighDensity ? 0 : 3,
                            pointHoverRadius: 4,
                            pointBackgroundColor: color,
                            tension: 0.25
                        });
                    });
                }
            } else {
                const metrics = timeSeries.metrics || [];
                metrics.forEach((agg, idx) => {
                    const color = multiColors[idx % multiColors.length];
                    const metricMeta = AdvancedTableCharts._getMetricMeta(agg, timeSeries.sourceState);
                    datasets.push({
                        label: agg.label || 'Metrica',
                        data: timeSeries.datasetsData['agg_' + idx] || [],
                        metricMeta,
                        backgroundColor: chartType === 'line' ? 'transparent' : color,
                        borderColor: color,
                        borderWidth: chartType === 'line' ? 2.5 : (isHighDensity ? 0 : 1),
                        borderRadius: isHighDensity ? 0 : 3,
                        categoryPercentage: isHighDensity ? 0.9 : 0.8,
                        barPercentage: isHighDensity ? 0.9 : 0.9,
                        pointRadius: isHighDensity ? 0 : 3,
                        pointHoverRadius: 4,
                        pointBackgroundColor: color,
                        tension: 0.25
                    });
                });
            }
        } else if (isStackedEngine) {
            const xLabelsRaw = pivotRows.map(r => r.virtualCells['grp_0'] || 'Senza Stato');
            let baseLabels = [...new Set(xLabelsRaw)].map(l => l.replace(/<[^>]*>?/gm, ''));
            
            const seriesNamesRaw = pivotRows.map(r => r.virtualCells['grp_1'] || 'Nessuno');
            const seriesNames = [...new Set(seriesNamesRaw)].map(l => l.replace(/<[^>]*>?/gm, ''));

            const targetAggIdx = state.aggregations.findIndex(a => a.type !== 'list');
            
            if (targetAggIdx > -1) {
                const targetAgg = state.aggregations[targetAggIdx];
                const targetMeta = AdvancedTableCharts._getMetricMeta(targetAgg, sourceState);
                const lookupMap = new Map();
                const totalsByX = new Map();

                pivotRows.forEach(r => {
                    const rGrp0 = (r.virtualCells['grp_0'] || 'Senza Stato').replace(/<[^>]*>?/gm, '');
                    const rGrp1 = (r.virtualCells['grp_1'] || 'Nessuno').replace(/<[^>]*>?/gm, '');
                    const val = parseFloat(r.virtualCells['agg_' + targetAggIdx]) || 0;
                    lookupMap.set(`${rGrp0}\u0001${rGrp1}`, val);
                    totalsByX.set(rGrp0, (totalsByX.get(rGrp0) || 0) + val);
                });

                // Top-N + Altri e Ordinamento per Grafici Impilati
                if (topNLimit > 0 && baseLabels.length > topNLimit) {
                    const rankedLabels = [...baseLabels].sort((a, b) => (totalsByX.get(b) || 0) - (totalsByX.get(a) || 0));
                    const kept = rankedLabels.slice(0, topNLimit);
                    const rest = rankedLabels.slice(topNLimit);

                    seriesNames.forEach(sn => {
                        let sumRest = 0;
                        rest.forEach(xl => { sumRest += (lookupMap.get(`${xl}\u0001${sn}`) || 0); });
                        lookupMap.set(`${otherLabel}\u0001${sn}`, sumRest);
                    });
                    totalsByX.set(otherLabel, rest.reduce((acc, xl) => acc + (totalsByX.get(xl) || 0), 0));

                    if (sortOrder === 'asc') {
                        kept.sort((a, b) => (totalsByX.get(a) || 0) - (totalsByX.get(b) || 0));
                        labels = [...kept, otherLabel];
                    } else if (sortOrder === 'default') {
                        const keptSet = new Set(kept);
                        labels = [...baseLabels.filter(l => keptSet.has(l)), otherLabel];
                    } else {
                        labels = [...kept, otherLabel];
                    }
                } else {
                    labels = [...baseLabels];
                    if (sortOrder === 'desc') {
                        labels.sort((a, b) => (totalsByX.get(b) || 0) - (totalsByX.get(a) || 0));
                    } else if (sortOrder === 'asc') {
                        labels.sort((a, b) => (totalsByX.get(a) || 0) - (totalsByX.get(b) || 0));
                    }
                }

                const grp1Col = sourceState && state.groupBy[1] ? sourceState.columns.find(c => c.id === state.groupBy[1]) : null;
                const useSelectColors = activePalette === 'select' && grp1Col && (grp1Col.type === 'select' || grp1Col.type === 'multi-select');

                if (grp1Col && (grp1Col.type === 'select' || grp1Col.type === 'multi-select') && sourceState.selectOptions && Array.isArray(sourceState.selectOptions[grp1Col.id])) {
                    const ordered = [];
                    sourceState.selectOptions[grp1Col.id].forEach(opt => {
                        if (seriesNames.includes(opt)) ordered.push(opt);
                    });
                    seriesNames.forEach(sn => {
                        if (!ordered.includes(sn)) ordered.push(sn);
                    });
                    seriesNames.splice(0, seriesNames.length, ...ordered);
                }

                const selectColorMap = useSelectColors
                    ? AdvancedTableCharts._buildSelectColorMap(seriesNames, grp1Col, sourceState, style, multiColors)
                    : null;

                const isHighDensity = labels.length > 60;

                seriesNames.forEach((seriesName, sIdx) => {
                    const dataValues = labels.map(xLabel => lookupMap.get(`${xLabel}\u0001${seriesName}`) || 0);
                    const color = selectColorMap
                        ? selectColorMap.get(seriesName)
                        : multiColors[sIdx % multiColors.length];

                    datasets.push({
                        label: seriesName,
                        data: dataValues,
                        metricMeta: targetMeta,
                        backgroundColor: chartType === 'line' ? 'transparent' : color,
                        borderColor: color,
                        borderWidth: chartType === 'line' ? 3 : (isHighDensity ? 0 : 1),
                        borderRadius: isHighDensity ? 0 : 4,
                        pointBackgroundColor: color,
                        tension: 0.3
                    });
                });
            }

        } else {
            const numericAggs = state.aggregations
                .map((agg, idx) => ({ agg, idx }))
                .filter(item => item.agg.type !== 'list');

            if (numericAggs.length > 0) {
                const primaryAggIdx = numericAggs[0].idx;

                let items = pivotRows.map(row => {
                    let parts = [];
                    state.groupBy.forEach((g, idx) => {
                        let val = row.virtualCells['grp_' + idx] || 'Nessuno';
                        parts.push(val.replace(/<[^>]*>?/gm, ''));
                    });
                    const primaryVal = parseFloat(row.virtualCells['agg_' + primaryAggIdx]);
                    return {
                        label: parts.join(' - '),
                        row,
                        primaryVal: isNaN(primaryVal) ? 0 : primaryVal,
                        isOther: false
                    };
                });

                // Top-N + Altri e Ordinamento per Barre/Linee standard
                if (topNLimit > 0 && items.length > topNLimit) {
                    const ranked = [...items].sort((a, b) => b.primaryVal - a.primaryVal);
                    const kept = ranked.slice(0, topNLimit);
                    const rest = ranked.slice(topNLimit);

                    const otherRow = { virtualCells: {} };
                    numericAggs.forEach(({ agg, idx }) => {
                        const restVals = rest.map(it => {
                            const v = parseFloat(it.row.virtualCells['agg_' + idx]);
                            return isNaN(v) ? 0 : v;
                        });
                        let aggVal = 0;
                        if (agg.type === 'avg') aggVal = restVals.reduce((a, b) => a + b, 0) / restVals.length;
                        else if (agg.type === 'max') aggVal = Math.max(...restVals);
                        else if (agg.type === 'min') aggVal = Math.min(...restVals);
                        else aggVal = restVals.reduce((a, b) => a + b, 0);
                        otherRow.virtualCells['agg_' + idx] = aggVal;
                    });

                    if (sortOrder === 'asc') {
                        kept.sort((a, b) => a.primaryVal - b.primaryVal);
                        items = kept;
                    } else if (sortOrder === 'default') {
                        const keptSet = new Set(kept);
                        items = items.filter(it => keptSet.has(it));
                    } else {
                        items = kept;
                    }
                    items.push({ label: otherLabel, row: otherRow, primaryVal: 0, isOther: true });
                } else if (sortOrder === 'desc') {
                    items.sort((a, b) => b.primaryVal - a.primaryVal);
                } else if (sortOrder === 'asc') {
                    items.sort((a, b) => a.primaryVal - b.primaryVal);
                }

                labels = items.map(it => it.label);

                const grp0Col = sourceState && state.groupBy[0] ? sourceState.columns.find(c => c.id === state.groupBy[0]) : null;
                const useSelectColors = activePalette === 'select' && state.groupBy.length === 1 && grp0Col && (grp0Col.type === 'select' || grp0Col.type === 'multi-select');
                const selectColorMap = useSelectColors
                    ? AdvancedTableCharts._buildSelectColorMap(labels, grp0Col, sourceState, style, multiColors)
                    : null;
                const isHighDensity = labels.length > 60;

                numericAggs.forEach(({ agg, idx }, mPos) => {
                    let dataValues = items.map(it => {
                        let v = parseFloat(it.row.virtualCells['agg_' + idx]);
                        return isNaN(v) ? 0 : v;
                    });

                    const metricMeta = AdvancedTableCharts._getMetricMeta(agg, sourceState);
                    const color = multiColors[mPos % multiColors.length];
                    let barColors;
                    if (selectColorMap && chartType !== 'line') {
                        barColors = items.map(it => it.isOther ? '#9ca3af' : selectColorMap.get(it.label));
                    } else if (chartType === 'line') {
                        barColors = 'transparent';
                    } else if (items.some(it => it.isOther)) {
                        barColors = items.map(it => it.isOther ? '#9ca3af' : color);
                    } else {
                        barColors = color;
                    }

                    datasets.push({
                        label: agg.label || 'Metrica',
                        data: dataValues,
                        metricMeta,
                        backgroundColor: barColors,
                        borderColor: selectColorMap && chartType !== 'line' ? barColors : color,
                        borderWidth: chartType === 'line' ? 3 : (isHighDensity ? 0 : 1),
                        borderRadius: isHighDensity ? 0 : 4,
                        pointBackgroundColor: color,
                        tension: 0.3
                    });
                });
            }
        }

        if (datasets.length === 0) {
            container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-secondary);">Nessuna metrica numerica trovata per il grafico.</div>`;
            return;
        }

        // Trasformazione percentuale per modalità Scala 100% (Stacked 100%)
        if (isStacked100 && datasets.length > 0) {
            const pointCount = labels.length;
            const sumsAtPoint = new Array(pointCount).fill(0);

            datasets.forEach(ds => {
                for (let i = 0; i < pointCount; i++) {
                    sumsAtPoint[i] += Math.max(0, Number(ds.data[i]) || 0);
                }
            });

            datasets.forEach(ds => {
                ds.rawData = [...ds.data];
                ds.data = ds.data.map((val, i) => {
                    const total = sumsAtPoint[i];
                    if (total <= 0) return 0;
                    return Math.round(((Math.max(0, Number(val) || 0) / total) * 100) * 100) / 100;
                });
            });
        }

        const totalBars = labels.length;
        const suppressDatalabels = totalBars > 35;
        const isOnlyCountMetrics = (state.aggregations || []).filter(a => a.type !== 'list').every(a => a.type === 'count');

        // Se tutte le metriche condividono la stessa unità di misura (es. € o %), la mostriamo anche sui tick dell'asse
        const datasetUnits = [...new Set(datasets.map(ds => (ds.metricMeta && ds.metricMeta.numberUnit) || ''))];
        const sharedAxisUnit = (!isStacked100 && datasetUnits.length === 1 && datasetUnits[0]) ? datasetUnits[0] : '';

        const canvasWrapperStyle = footerNotices.length > 0 ? 'height: calc(100% - 22px); position: relative;' : 'height: 100%; position: relative;';
        const noticeHtml = footerNotices.length > 0
            ? `<div style="font-size:0.72rem; color:var(--text-secondary); opacity:0.8; text-align:right; padding-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">ℹ️ ${footerNotices.map(n => UI.escapeHTML(n)).join(' • ')}</div>`
            : '';

        container.innerHTML = `<div style="${canvasWrapperStyle}"><canvas id="canvas_${tableId}"></canvas></div>${noticeHtml}`;
        const ctx = document.getElementById('canvas_' + tableId);
        container.style.display = 'block';
        container.style.height = standardBarHeight;

        let layoutPadding = { top: 10, bottom: 10, left: 10, right: 10 };
        if (config.showLabels && !suppressDatalabels) {
            if (legendPos === 'right') layoutPadding = { top: 25, bottom: 10, left: 10, right: 40 };
            else layoutPadding = { top: 25, bottom: 10, left: 10, right: 10 };
        }

        const catScaleConfig = {
            stacked: isStackedEngine,
            ticks: {
                color: textColor,
                maxRotation: timeBuckets ? 0 : 45,
                minRotation: 0
            },
            grid: {
                color: gridColor,
                drawBorder: false
            }
        };

        if (timeBuckets) {
            if (totalBars > 90) {
                catScaleConfig.ticks.autoSkip = false;
                catScaleConfig.ticks.callback = function(value) {
                    const b = timeBuckets[value];
                    return (b && b.monthLabel) ? b.monthLabel : null;
                };
                catScaleConfig.grid.color = function(ctxGrid) {
                    const idx = (ctxGrid && ctxGrid.tick && typeof ctxGrid.tick.value === 'number')
                        ? ctxGrid.tick.value
                        : (ctxGrid && typeof ctxGrid.index === 'number' ? ctxGrid.index : -1);
                    if (idx >= 0 && timeBuckets[idx] && timeBuckets[idx].monthLabel) {
                        return gridColor;
                    }
                    return 'transparent';
                };
            } else if (totalBars > 31) {
                catScaleConfig.ticks.autoSkip = true;
                catScaleConfig.ticks.maxTicksLimit = 12;
            }
        }

        const valScaleConfig = {
            stacked: isStackedEngine,
            ticks: {
                color: textColor,
                precision: isOnlyCountMetrics && !isStacked100 ? 0 : undefined,
                callback: isStacked100
                    ? (v) => (Math.round(v * 100) / 100) + '%'
                    : (sharedAxisUnit ? (v) => (Math.round(v * 100) / 100) + (sharedAxisUnit === '%' ? '%' : ` ${sharedAxisUnit}`) : undefined)
            },
            grid: { color: gridColor, drawBorder: false },
            beginAtZero: isStacked100 ? true : (config.beginAtZero !== false)
        };

        if (isStacked100) {
            valScaleConfig.min = 0;
            valScaleConfig.max = 100;
        }

        const scalesConfig = {};
        scalesConfig[catAxis] = catScaleConfig;
        scalesConfig[valAxis] = valScaleConfig;

        const chartConfig = {
            type: chartType,
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: indexAxis,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                layout: { padding: layoutPadding },
                plugins: {
                    legend: {
                        display: legendPos !== 'none' && (isStackedEngine || datasets.length > 1), 
                        position: legendPos === 'none' ? 'bottom' : legendPos,
                        labels: { color: textColor, usePointStyle: true, padding: 15 }
                    },
                    tooltip: {
                        filter: (tooltipItem) => {
                            const val = isHorizontal ? (tooltipItem.parsed.x || 0) : (tooltipItem.parsed.y || 0);
                            if (val !== 0) return true;
                            const chart = tooltipItem.chart;
                            const idx = tooltipItem.dataIndex;
                            const hasAnyNonZero = chart.data.datasets.some((ds, dsIdx) => {
                                const meta = chart.getDatasetMeta(dsIdx);
                                if (meta && meta.hidden) return false;
                                return (Number(ds.data[idx]) || 0) !== 0;
                            });
                            return !hasAnyNonZero && tooltipItem.datasetIndex === 0;
                        },
                        callbacks: {
                            title: (items) => {
                                if (!items || items.length === 0) return '';
                                if (timeBuckets && timeBuckets[items[0].dataIndex]) {
                                    return timeBuckets[items[0].dataIndex].fullLabel;
                                }
                                return items[0].label;
                            },
                            label: (item) => {
                                const val = isHorizontal ? (item.parsed.x || 0) : (item.parsed.y || 0);
                                const ds = item.dataset || {};
                                const meta = ds.metricMeta || null;
                                if (isStacked100 && Array.isArray(ds.rawData)) {
                                    const rawVal = ds.rawData[item.dataIndex] || 0;
                                    const pctStr = Math.round(val * 10) / 10 + '%';
                                    return ` ${ds.label}: ${pctStr} (${AdvancedTableCharts._formatMetricValue(rawVal, meta)})`;
                                }
                                if (val === 0) {
                                    return ` ${I18n.t('adv_charts.tooltip_no_activity')}: ${AdvancedTableCharts._formatMetricValue(0, meta)}`;
                                }
                                return ` ${ds.label}: ${AdvancedTableCharts._formatMetricValue(val, meta)}`;
                            },
                            footer: (items) => {
                                if (!isStackedEngine || !items || items.length === 0) return '';
                                const hasNonZero = items.some(it => (isHorizontal ? (it.parsed.x || 0) : (it.parsed.y || 0)) !== 0);
                                if (!hasNonZero) return '';
                                const firstMeta = items[0]?.dataset?.metricMeta || null;
                                if (isStacked100) {
                                    const rawSum = items.reduce((acc, it) => {
                                        const rd = it.dataset?.rawData;
                                        return acc + (rd ? (Number(rd[it.dataIndex]) || 0) : 0);
                                    }, 0);
                                    return `${I18n.t('adv_charts.tooltip_total')}: 100% (${AdvancedTableCharts._formatMetricValue(rawSum, firstMeta)})`;
                                }
                                const sum = items.reduce((acc, it) => acc + (isHorizontal ? (it.parsed.x || 0) : (it.parsed.y || 0)), 0);
                                return `${I18n.t('adv_charts.tooltip_total')}: ${AdvancedTableCharts._formatMetricValue(sum, firstMeta)}`;
                            }
                        }
                    },
                    customDataLabels: { display: false },
                    datalabels: {
                        display: (ctx) => {
                            if (config.showLabels === false || suppressDatalabels) return false;
                            const rawVal = ctx.dataset.data[ctx.dataIndex];
                            if (rawVal === null || rawVal === undefined || Number(rawVal) === 0) return false;
                            if (isStackedEngine) {
                                const meta = ctx.chart.getDatasetMeta(ctx.datasetIndex);
                                const el = meta && meta.data && meta.data[ctx.dataIndex];
                                if (el) {
                                    const segmentPx = isHorizontal ? Math.abs(el.x - el.base) : Math.abs(el.base - el.y);
                                    if (segmentPx < 15) return false;
                                }
                            }
                            return true;
                        },
                        color: (ctx) => {
                            if (isStackedEngine) {
                                const bg = Array.isArray(ctx.dataset.backgroundColor)
                                    ? ctx.dataset.backgroundColor[ctx.dataIndex]
                                    : ctx.dataset.backgroundColor;
                                return AdvancedTableCharts._getContrastingLabelColor(bg, textColor);
                            }
                            return textColor;
                        },
                        anchor: isStackedEngine ? 'center' : 'end',
                        align: isStackedEngine ? 'center' : 'end',
                        offset: isStackedEngine ? 0 : 4,
                        formatter: (v, ctx) => {
                            if (v === null || v === undefined || Number(v) === 0) return null;
                            if (isStacked100) return Math.round(v) + '%';
                            const meta = ctx?.dataset?.metricMeta || null;
                            return AdvancedTableCharts._formatMetricValue(v, meta);
                        },
                        font: {
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            weight: isStackedEngine ? 'bold' : 'normal',
                            size: chartHeight === 'small' ? 9 : 11
                        }
                    }
                },
                scales: scalesConfig
            },
            plugins: customPlugins
        };

        AdvancedTableCharts.instances[tableId] = new Chart(ctx, chartConfig);
    }
};