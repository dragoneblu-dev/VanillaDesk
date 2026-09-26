/**
 * AdvancedTableCharts.js
 * Modulo per la generazione di grafici basati su Tabelle Pivot utilizzando Chart.js.
 * FIX COLORI: Adesso i colori delle palette leggono dinamicamente le variabili definite in variables.css.
 * FIX: Layout della Torta/Ciambella con marginazione dinamica e Flexbox affiancato.
 * FIX: Rimozione di alias obsoleti per il salvataggio della configurazione.
 * FIX: Risolta registrazione ripetuta del plugin ChartDataLabels.
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

    // =========================================================================
    // PLUGIN CUSTOM PER CHART.JS
    // =========================================================================
    
    _getCustomDataLabelsPlugin: () => {
        return {
            id: 'customDataLabels',
            afterDatasetsDraw(chart, args, pluginOptions) {
                if (!pluginOptions || !pluginOptions.display) return;
                const { ctx, data } = chart;
                ctx.save();
                
                const isPie = chart.config.type === 'doughnut' || chart.config.type === 'pie';
                if (!isPie) { ctx.restore(); return; } 
                
                const textColor = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#666';
                const accentColor = getComputedStyle(document.body).getPropertyValue('--border-color').trim() || '#ccc';
                
                ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                let totalPie = 0;
                data.datasets[0].data.forEach(val => { totalPie += (val || 0); });

                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    if (meta.hidden) return;

                    meta.data.forEach((element, index) => {
                        const val = dataset.data[index];
                        if (!val) return; 

                        ctx.fillStyle = textColor;
                        const model = element;
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

                        ctx.beginPath();
                        ctx.moveTo(startX, startY);
                        ctx.lineTo(kneeX, kneeY);
                        ctx.lineTo(endX, endY);
                        ctx.strokeStyle = accentColor;
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                        
                        const pct = totalPie > 0 ? Math.round((val / totalPie) * 1000) / 10 + '%' : '';
                        const text = `${val} (${pct})`;
                        
                        const canvasWidth = chart.width;
                        let maxTextWidth = 120;
                        if (isRightSide) {
                            maxTextWidth = canvasWidth - endX - 5;
                        } else {
                            maxTextWidth = endX - 5;
                        }
                        maxTextWidth = Math.max(maxTextWidth, 40);

                        ctx.textAlign = isRightSide ? 'left' : 'right';
                        ctx.fillText(text, endX + (isRightSide ? 5 : -5), endY, maxTextWidth);
                    });
                });
                ctx.restore();
            }
        };
    },

    _getCenterTextPlugin: () => {
        return {
            id: 'centerText',
            beforeDraw(chart, args, pluginOptions) {
                if (chart.config.type !== 'doughnut' || !pluginOptions || !pluginOptions.display) return;
                
                const { ctx, data, chartArea } = chart;
                ctx.save();
                
                const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#000';
                
                let sum = 0;
                data.datasets[0].data.forEach((val, i) => {
                    const meta = chart.getDatasetMeta(0);
                    if (!meta.data[i].hidden) {
                        sum += (val || 0);
                    }
                });

                if (sum % 1 !== 0) sum = Math.round(sum * 100) / 100;

                const centerX = (chartArea.left + chartArea.right) / 2;
                const centerY = (chartArea.top + chartArea.bottom) / 2;

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                ctx.font = 'bold 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.fillStyle = textColor;
                ctx.fillText(sum, centerX, centerY);

                ctx.restore();
            }
        };
    },

    renderChart: (tableId, containerId, pivotRows, state) => {
        if (typeof Chart === 'undefined') return;

        const container = document.getElementById(containerId);
        if (!container) return;

        AdvancedTableCharts._clearInstances(tableId);

        const config = state.chartConfig || { visible: false, type: 'bar', stacked: false, showLabels: true, centerTotal: true, legendPos: 'bottom', colorPalette: 'default' };
        if (!config.visible) return;

        if (!state.groupBy || state.groupBy.length === 0 || !state.aggregations || state.aggregations.length === 0) {
            container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-secondary);">Configura almeno un raggruppamento e una metrica numerica per vedere il grafico.</div>`;
            return;
        }

        const style = getComputedStyle(document.body);
        const textColor = style.getPropertyValue('--text-primary').trim();
        const gridColor = style.getPropertyValue('--border-color').trim();
        const bgColor = style.getPropertyValue('--bg-color').trim();

        // Lettura dinamica dai CSS in base al tema e alla palette
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
            pastel: [1, 2, 3, 4, 5, 6].map(i => style.getPropertyValue(`--chart-pastel-${i}`).trim()),
            vibrant: [1, 2, 3, 4, 5, 6].map(i => style.getPropertyValue(`--chart-vibrant-${i}`).trim()),
            ocean: [1, 2, 3, 4, 5, 6].map(i => style.getPropertyValue(`--chart-ocean-${i}`).trim()),
            sunset: [1, 2, 3, 4, 5, 6].map(i => style.getPropertyValue(`--chart-sunset-${i}`).trim())
        };

        const activePalette = config.colorPalette || 'default';
        const multiColors = palettes[activePalette] || palettes.default;

        let chartType = config.type;
        let indexAxis = 'x';
        
        if (chartType === 'horizontalBar') {
            chartType = 'bar';
            indexAxis = 'y';
        }

        const isPie = chartType === 'doughnut' || chartType === 'pie';
        const isStackedEngine = config.stacked && state.groupBy.length >= 2 && !isPie;
        const legendPos = config.legendPos || 'bottom';

        const hasDataLabelsPlugin = typeof ChartDataLabels !== 'undefined';
        const customPlugins = [AdvancedTableCharts._getCenterTextPlugin()];
        
        if (isPie) {
            customPlugins.push(AdvancedTableCharts._getCustomDataLabelsPlugin());
        } else if (hasDataLabelsPlugin) {
            customPlugins.push(ChartDataLabels);
        }

        if (isPie) {
            container.innerHTML = ''; 
            container.style.display = 'flex';
            container.style.flexWrap = 'wrap';
            container.style.gap = '20px';
            container.style.justifyContent = 'center';
            container.style.alignItems = 'center';
            container.style.overflowY = 'auto';

            AdvancedTableCharts.instances[tableId] =[];

            let pieLabels = pivotRows.map(row => {
                let parts =[];
                state.groupBy.forEach((g, idx) => {
                    let val = row.virtualCells['grp_' + idx] || 'Nessuno';
                    parts.push(val.replace(/<[^>]*>?/gm, ''));
                });
                return parts.join(' - ');
            });

            state.aggregations.forEach((agg, idx) => {
                if (agg.type === 'list') return;

                let dataValues = pivotRows.map(row => {
                    let v = parseFloat(row.virtualCells['agg_' + idx]);
                    return isNaN(v) ? 0 : v;
                });

                if (dataValues.every(v => v === 0)) return;

                const wrapper = document.createElement('div');
                wrapper.style.flex = '1 1 300px';
                wrapper.style.maxWidth = '500px'; 
                wrapper.style.height = '350px'; 
                wrapper.style.position = 'relative';
                
                const canvas = document.createElement('canvas');
                wrapper.appendChild(canvas);
                container.appendChild(wrapper);

                // Padding di Chart Area per gestire il layout globale
                let layoutPadding = 10;
                if (config.showLabels && legendPos !== 'none') {
                    if (legendPos === 'bottom' || legendPos === 'top') layoutPadding = { left: 60, right: 60, top: 10, bottom: 10 };
                    if (legendPos === 'right') layoutPadding = { left: 40, right: 0, top: 10, bottom: 10 };
                    if (legendPos === 'left') layoutPadding = { left: 0, right: 40, top: 10, bottom: 10 };
                }

                const chartConfig = {
                    type: chartType,
                    data: {
                        labels: pieLabels,
                        datasets:[{
                            data: dataValues,
                            backgroundColor: multiColors,
                            borderColor: bgColor,
                            borderWidth: 2,
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
                                font: { size: 14 }
                            },
                            legend: { 
                                display: legendPos !== 'none', 
                                position: legendPos === 'none' ? 'bottom' : legendPos, 
                                labels: { color: textColor, boxWidth: 12, padding: 15 }
                            },
                            customDataLabels: { display: config.showLabels !== false },
                            datalabels: { display: false },
                            centerText: { display: config.centerTotal !== false && chartType === 'doughnut' }
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

        // GRAFICI A BARRE / LINEE (Singoli o Stacked)
        container.innerHTML = '<canvas id="canvas_' + tableId + '"></canvas>';
        const ctx = document.getElementById('canvas_' + tableId);
        container.style.display = 'block';
        container.style.height = '400px';

        let labels =[];
        let datasets =[];

        if (isStackedEngine) {
            const xLabelsRaw = pivotRows.map(r => r.virtualCells['grp_0'] || 'Senza Stato');
            labels =[...new Set(xLabelsRaw)].map(l => l.replace(/<[^>]*>?/gm, '')); 
            
            const seriesNamesRaw = pivotRows.map(r => r.virtualCells['grp_1'] || 'Nessuno');
            const seriesNames = [...new Set(seriesNamesRaw)].map(l => l.replace(/<[^>]*>?/gm, ''));

            const targetAggIdx = state.aggregations.findIndex(a => a.type !== 'list');
            
            if (targetAggIdx > -1) {
                seriesNames.forEach((seriesName, sIdx) => {
                    const dataValues = labels.map(xLabel => {
                        const row = pivotRows.find(r => {
                            const rGrp0 = (r.virtualCells['grp_0'] || 'Senza Stato').replace(/<[^>]*>?/gm, '');
                            const rGrp1 = (r.virtualCells['grp_1'] || 'Nessuno').replace(/<[^>]*>?/gm, '');
                            return rGrp0 === xLabel && rGrp1 === seriesName;
                        });
                        return row ? parseFloat(row.virtualCells['agg_' + targetAggIdx]) || 0 : 0;
                    });

                    const color = multiColors[sIdx % multiColors.length];

                    datasets.push({
                        label: seriesName,
                        data: dataValues,
                        backgroundColor: chartType === 'line' ? 'transparent' : color,
                        borderColor: color,
                        borderWidth: chartType === 'line' ? 3 : 1,
                        borderRadius: 4,
                        pointBackgroundColor: color,
                        tension: 0.3
                    });
                });
            }

        } else {
            labels = pivotRows.map(row => {
                let parts =[];
                state.groupBy.forEach((g, idx) => {
                    let val = row.virtualCells['grp_' + idx] || 'Nessuno';
                    parts.push(val.replace(/<[^>]*>?/gm, ''));
                });
                return parts.join(' - ');
            });

            state.aggregations.forEach((agg, idx) => {
                if (agg.type === 'list') return; 

                let dataValues = pivotRows.map(row => {
                    let v = parseFloat(row.virtualCells['agg_' + idx]);
                    return isNaN(v) ? 0 : v;
                });

                const color = multiColors[idx % multiColors.length];

                datasets.push({
                    label: agg.label || 'Metrica',
                    data: dataValues,
                    backgroundColor: chartType === 'line' ? 'transparent' : color,
                    borderColor: color,
                    borderWidth: chartType === 'line' ? 3 : 1,
                    borderRadius: 4,
                    pointBackgroundColor: color,
                    tension: 0.3
                });
            });
        }

        if (datasets.length === 0) {
            container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-secondary);">Nessuna metrica numerica trovata per il grafico.</div>`;
            return;
        }

        let layoutPadding = { top: 10, bottom: 10, left: 10, right: 10 };
        if (config.showLabels) {
            if (legendPos === 'right') layoutPadding = { top: 25, bottom: 10, left: 10, right: 40 };
            else layoutPadding = { top: 25, bottom: 10, left: 10, right: 10 };
        }

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
                layout: { padding: layoutPadding },
                plugins: {
                    legend: {
                        display: legendPos !== 'none' && (isStackedEngine || state.aggregations.length > 1), 
                        position: legendPos === 'none' ? 'bottom' : legendPos,
                        labels: { color: textColor, usePointStyle: true, padding: 15 }
                    },
                    customDataLabels: { display: false },
                    datalabels: {
                        display: config.showLabels !== false,
                        color: textColor,
                        anchor: 'end',
                        align: 'end',
                        offset: 4,
                        formatter: Math.round,
                        font: {
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            size: 11
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: isStackedEngine,
                        ticks: { color: textColor },
                        grid: { color: gridColor, drawBorder: false }
                    },
                    y: {
                        stacked: isStackedEngine,
                        ticks: { color: textColor },
                        grid: { color: gridColor, drawBorder: false },
                        beginAtZero: true
                    }
                }
            },
            plugins: customPlugins
        };

        AdvancedTableCharts.instances[tableId] = new Chart(ctx, chartConfig);
    }
};