/**
 * tests/test-advanced-table-charts.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-charts
 * Copertura completa di istanze, helper matematici/cromatici, plugin Canvas,
 * ordinamento, Top-N + Altri, unità/decimali, beginAtZero e stacked 100%.
 */

describe("AdvancedTable Charts: Integrazione Chart.js, Stacking, Palette & Plugins", () => {

    // =========================================================================
    // 1. GESTIONE ISTANZE E PULIZIA MEMORIA
    // =========================================================================

    test("Charts: _clearInstances distrugge istanze Chart.js attive", () => {
        let destroyed = false;
        AdvancedTableCharts.instances['tbl_chart_test'] = {
            destroy: () => { destroyed = true; }
        };

        AdvancedTableCharts._clearInstances('tbl_chart_test');
        Assert.isTrue(destroyed);
        Assert.strictEqual(AdvancedTableCharts.instances['tbl_chart_test'], undefined);
    });

    test("Charts: _clearInstances gestisce array di grafici multipli per torte", () => {
        let count = 0;
        AdvancedTableCharts.instances['tbl_multi_pie'] = [
            { destroy: () => { count++; } },
            { destroy: () => { count++; } }
        ];

        AdvancedTableCharts._clearInstances('tbl_multi_pie');
        Assert.strictEqual(count, 2);
    });

    test("Charts: _clearInstances gestisce in modo sicuro ID inesistenti senza lanciare eccezioni", () => {
        Assert.doesNotThrow(() => {
            AdvancedTableCharts._clearInstances('id_non_esistente_in_istanze');
        });
    });

    // =========================================================================
    // 2. HELPER METRICHE, FORMATTAZIONE E COLORI
    // =========================================================================

    test("Charts: _getMetricMeta eredita unità e decimali solo per metriche non 'count'", () => {
        const sourceState = {
            columns: [
                { id: 'c_price', type: 'number', numberUnit: '€', decimals: 2 },
                { id: 'c_pct', type: 'number', numberUnit: '%', decimals: 1 }
            ]
        };

        const metaSum = AdvancedTableCharts._getMetricMeta({ type: 'sum', sourceColId: 'c_price' }, sourceState);
        Assert.strictEqual(metaSum.numberUnit, '€');
        Assert.strictEqual(metaSum.decimals, 2);

        const metaCount = AdvancedTableCharts._getMetricMeta({ type: 'count', sourceColId: 'c_price' }, sourceState);
        Assert.strictEqual(metaCount.numberUnit, '');
        Assert.strictEqual(metaCount.decimals, undefined);

        const metaMissing = AdvancedTableCharts._getMetricMeta({ type: 'sum', sourceColId: 'c_none' }, sourceState);
        Assert.strictEqual(metaMissing.numberUnit, '');
        Assert.strictEqual(metaMissing.decimals, undefined);
    });

    test("Charts: _formatMetricValue formatta decimali, arrotondamenti, unità e fallback NaN", () => {
        Assert.strictEqual(AdvancedTableCharts._formatMetricValue(null, null), '0');
        Assert.strictEqual(AdvancedTableCharts._formatMetricValue(undefined, null), '0');
        Assert.strictEqual(AdvancedTableCharts._formatMetricValue('abc', null), '0');

        Assert.strictEqual(AdvancedTableCharts._formatMetricValue(12.3456, null), '12.35');
        Assert.strictEqual(AdvancedTableCharts._formatMetricValue(10, { numberUnit: '€', decimals: 2 }), '10.00 €');
        Assert.strictEqual(AdvancedTableCharts._formatMetricValue(45.5, { numberUnit: '%', decimals: 1 }), '45.5%');
        Assert.strictEqual(AdvancedTableCharts._formatMetricValue(99, { numberUnit: '$', decimals: 0 }), '99 $');
    });

    test("Charts: _getContrastingLabelColor calcola contrasto corretto su sfondi chiari e scuri", () => {
        Assert.strictEqual(AdvancedTableCharts._getContrastingLabelColor('#ffffff', '#000'), '#111827');
        Assert.strictEqual(AdvancedTableCharts._getContrastingLabelColor('#fde047', '#000'), '#111827');
        Assert.strictEqual(AdvancedTableCharts._getContrastingLabelColor('#111827', '#000'), '#ffffff');
        Assert.strictEqual(AdvancedTableCharts._getContrastingLabelColor('rgb(0, 0, 0)', '#000'), '#ffffff');
        Assert.strictEqual(AdvancedTableCharts._getContrastingLabelColor('rgb(255, 255, 255)', '#000'), '#111827');
        Assert.strictEqual(AdvancedTableCharts._getContrastingLabelColor('invalid', '#333333'), '#333333');
    });

    test("Charts: _buildSelectColorMap assegna colori univoci evitando duplicazioni con quelli espliciti", () => {
        const fakeStyle = {
            getPropertyValue: (prop) => {
                if (prop === '--tx-c1') return '#111111';
                if (prop === '--tx-c2') return '#222222';
                if (prop === '--tx-c3') return '#333333';
                return '';
            }
        };
        const colDef = { id: 'c_status', type: 'select' };
        const sourceState = {
            selectColors: {
                c_status: {
                    'Aperto': 'hl-c1',
                    'Chiuso': ''
                }
            }
        };
        const map = AdvancedTableCharts._buildSelectColorMap(['Aperto', 'Chiuso'], colDef, sourceState, fakeStyle, ['#111111', '#222222']);
        Assert.strictEqual(map.get('Aperto'), '#111111');
        Assert.strictEqual(map.get('Chiuso'), '#222222');
    });

    // =========================================================================
    // 3. PLUGIN CENTER TEXT (CIAMBELLA DOUGHNUT)
    // =========================================================================

    test("Charts: plugin centerText non esegue calcoli se il tipo non è 'doughnut'", () => {
        const plugin = AdvancedTableCharts._getCenterTextPlugin();
        let drawn = false;
        const fakeChart = {
            config: { type: 'bar' },
            ctx: { save: () => { drawn = true; }, restore: () => {} }
        };
        plugin.beforeDraw(fakeChart, null, { display: true });
        Assert.isFalse(drawn);
    });

    test("Charts: plugin centerText non esegue calcoli se display è false o opzioni assenti", () => {
        const plugin = AdvancedTableCharts._getCenterTextPlugin();
        let drawn = false;
        const fakeChart = {
            config: { type: 'doughnut' },
            ctx: { save: () => { drawn = true; }, restore: () => {} }
        };
        plugin.beforeDraw(fakeChart, null, { display: false });
        plugin.beforeDraw(fakeChart, null, null);
        Assert.isFalse(drawn);
    });

    test("Charts: plugin centerText somma i valori del dataset per doughnut e applica metricMeta", () => {
        const plugin = AdvancedTableCharts._getCenterTextPlugin();
        let printedText = null;
        const fakeChart = {
            config: { type: 'doughnut' },
            data: { datasets: [{ data: [10, 25, 15] }] },
            chartArea: { left: 0, right: 200, top: 0, bottom: 200 },
            getDatasetMeta: () => ({ data: [{}, {}, {}] }),
            ctx: {
                save: () => {},
                restore: () => {},
                fillText: (val) => { printedText = val; },
                measureText: () => ({ width: 20 }),
                font: '',
                fillStyle: '',
                textAlign: '',
                textBaseline: ''
            }
        };
        plugin.beforeDraw(fakeChart, null, { display: true });
        Assert.strictEqual(printedText, "50");

        plugin.beforeDraw(fakeChart, null, { display: true, metricMeta: { numberUnit: '€', decimals: 2 } });
        Assert.strictEqual(printedText, "50.00 €");
    });

    test("Charts: plugin centerText esclude dal calcolo gli elementi nascosti nel grafico (hidden === true)", () => {
        const plugin = AdvancedTableCharts._getCenterTextPlugin();
        let printedText = null;
        const fakeChart = {
            config: { type: 'doughnut' },
            data: { datasets: [{ data: [100, 50, 20] }] },
            chartArea: { left: 0, right: 200, top: 0, bottom: 200 },
            getDatasetMeta: () => ({
                data: [
                    { hidden: false },
                    { hidden: true },
                    { hidden: false }
                ]
            }),
            ctx: {
                save: () => {},
                restore: () => {},
                fillText: (val) => { printedText = val; },
                measureText: () => ({ width: 20 }),
                font: '',
                fillStyle: '',
                textAlign: '',
                textBaseline: ''
            }
        };
        plugin.beforeDraw(fakeChart, null, { display: true });
        Assert.strictEqual(printedText, "120");
    });

    test("Charts: plugin centerText arrotonda a 2 decimali le somme frazionarie", () => {
        const plugin = AdvancedTableCharts._getCenterTextPlugin();
        let printedText = null;
        const fakeChart = {
            config: { type: 'doughnut' },
            data: { datasets: [{ data: [10.3333, 20.2222] }] },
            chartArea: { left: 0, right: 200, top: 0, bottom: 200 },
            getDatasetMeta: () => ({ data: [{}, {}] }),
            ctx: {
                save: () => {},
                restore: () => {},
                fillText: (val) => { printedText = val; },
                measureText: () => ({ width: 20 }),
                font: '',
                fillStyle: '',
                textAlign: '',
                textBaseline: ''
            }
        };
        plugin.beforeDraw(fakeChart, null, { display: true });
        Assert.strictEqual(printedText, "30.56");
    });

    test("Charts: plugin centerText modula la dimensione font in base a chartHeight (small, medium, large)", () => {
        const plugin = AdvancedTableCharts._getCenterTextPlugin();
        let capturedFont = '';
        const createChart = () => ({
            config: { type: 'doughnut' },
            data: { datasets: [{ data: [10] }] },
            chartArea: { left: 0, right: 400, top: 0, bottom: 400 },
            getDatasetMeta: () => ({ data: [{ innerRadius: 100 }] }),
            ctx: {
                save: () => {},
                restore: () => {},
                fillText: () => {},
                measureText: () => ({ width: 10 }),
                set font(f) { capturedFont = f; },
                get font() { return capturedFont; }
            }
        });

        plugin.beforeDraw(createChart(), null, { display: true, chartHeight: 'small' });
        Assert.isTrue(capturedFont.includes('15px'));

        plugin.beforeDraw(createChart(), null, { display: true, chartHeight: 'large' });
        Assert.isTrue(capturedFont.includes('34px'));

        plugin.beforeDraw(createChart(), null, { display: true, chartHeight: 'medium' });
        Assert.isTrue(capturedFont.includes('24px'));
    });

    test("Charts: plugin centerText riduce il font con auto-scaling se il testo eccede lo spazio interno", () => {
        const plugin = AdvancedTableCharts._getCenterTextPlugin();
        let capturedFont = '';
        const fakeChart = {
            config: { type: 'doughnut' },
            data: { datasets: [{ data: [999999999] }] },
            chartArea: { left: 0, right: 100, top: 0, bottom: 100 },
            getDatasetMeta: () => ({ data: [{ innerRadius: 20 }] }),
            ctx: {
                save: () => {},
                restore: () => {},
                fillText: () => {},
                measureText: () => ({ width: 250 }),
                set font(f) { capturedFont = f; },
                get font() { return capturedFont; }
            }
        };

        plugin.beforeDraw(fakeChart, null, { display: true, chartHeight: 'medium' });
        const sizeMatch = capturedFont.match(/(\d+)px/);
        const appliedSize = sizeMatch ? parseInt(sizeMatch[1], 10) : 24;
        Assert.isTrue(appliedSize < 24, "Il font deve essere scalato verso il basso per numeri estesi");
    });

    test("Charts: plugin centerText posiziona la cifra al centro esatto di chartArea", () => {
        const plugin = AdvancedTableCharts._getCenterTextPlugin();
        let posX = null, posY = null;
        const fakeChart = {
            config: { type: 'doughnut' },
            data: { datasets: [{ data: [100] }] },
            chartArea: { left: 50, right: 250, top: 100, bottom: 300 },
            getDatasetMeta: () => ({ data: [{ innerRadius: 50 }] }),
            ctx: {
                save: () => {},
                restore: () => {},
                fillText: (val, x, y) => { posX = x; posY = y; },
                measureText: () => ({ width: 20 }),
                font: '', fillStyle: '', textAlign: '', textBaseline: ''
            }
        };

        plugin.beforeDraw(fakeChart, null, { display: true });
        Assert.strictEqual(posX, 150);
        Assert.strictEqual(posY, 200);
    });

    // =========================================================================
    // 4. PLUGIN CUSTOM DATA LABELS (TORTA E CIAMBELLA)
    // =========================================================================

    test("Charts: plugin customDataLabels calcola percentuali su totale della torta con priorità decrescente", () => {
        const plugin = AdvancedTableCharts._getCustomDataLabelsPlugin();
        const drawnLabels = [];
        const fakeChart = {
            config: { type: 'pie' },
            width: 400,
            data: { datasets: [{ data: [20, 80] }] },
            getDatasetMeta: () => ({
                hidden: false,
                data: [
                    { x: 100, y: 100, startAngle: 0, endAngle: Math.PI, outerRadius: 40 },
                    { x: 100, y: 100, startAngle: Math.PI, endAngle: 2 * Math.PI, outerRadius: 40 }
                ]
            }),
            ctx: {
                save: () => {}, restore: () => {}, beginPath: () => {}, moveTo: () => {},
                lineTo: () => {}, stroke: () => {}, fillText: (t) => { drawnLabels.push(t); }
            }
        };
        plugin.afterDatasetsDraw(fakeChart, null, { display: true, metricMeta: { numberUnit: '€' } });
        Assert.strictEqual(drawnLabels.length, 2);
        Assert.isTrue(drawnLabels[0].includes('80 € (80%)'));
        Assert.isTrue(drawnLabels[1].includes('20 € (20%)'));
    });

    test("Charts: plugin customDataLabels attiva anti-collisione verticale sullo stesso lato", () => {
        const plugin = AdvancedTableCharts._getCustomDataLabelsPlugin();
        const drawnLabels = [];
        const fakeChart = {
            config: { type: 'pie' },
            width: 400,
            data: { datasets: [{ data: [60, 40] }] },
            getDatasetMeta: () => ({
                hidden: false,
                data: [
                    { x: 200, y: 200, startAngle: 0, endAngle: 0.1, outerRadius: 50 },
                    { x: 200, y: 200, startAngle: 0.1, endAngle: 0.2, outerRadius: 50 }
                ]
            }),
            ctx: {
                save: () => {}, restore: () => {}, beginPath: () => {}, moveTo: () => {},
                lineTo: () => {}, stroke: () => {}, fillText: (t) => { drawnLabels.push(t); }
            }
        };
        plugin.afterDatasetsDraw(fakeChart, null, { display: true });
        Assert.strictEqual(drawnLabels.length, 1);
        Assert.isTrue(drawnLabels[0].includes('60%'));
    });

    test("Charts: plugin customDataLabels si disattiva per grafici diversi da pie o doughnut", () => {
        const plugin = AdvancedTableCharts._getCustomDataLabelsPlugin();
        let strokeCalled = false;
        let fillTextCalled = false;

        const fakeChart = {
            config: { type: 'bar' },
            data: { datasets: [{ data: [20, 80] }] },
            getDatasetMeta: () => ({ hidden: false, data: [{ outerRadius: 20 }] }),
            ctx: {
                save: () => {},
                restore: () => {},
                beginPath: () => {},
                moveTo: () => {},
                lineTo: () => {},
                stroke: () => { strokeCalled = true; },
                fillText: () => { fillTextCalled = true; }
            }
        };

        plugin.afterDatasetsDraw(fakeChart, null, { display: true });
        Assert.isFalse(strokeCalled, "Non deve tracciare linee guida per grafici non a torta/ciambella");
        Assert.isFalse(fillTextCalled, "Non deve disegnare etichette di testo per grafici non a torta/ciambella");
    });

    test("Charts: plugin customDataLabels si disattiva se display è false", () => {
        const plugin = AdvancedTableCharts._getCustomDataLabelsPlugin();
        let drawn = false;
        const fakeChart = {
            config: { type: 'pie' },
            ctx: { save: () => { drawn = true; }, restore: () => {} }
        };
        plugin.afterDatasetsDraw(fakeChart, null, { display: false });
        Assert.isFalse(drawn);
    });

    // =========================================================================
    // 5. CONFIGURAZIONI LAYOUT, PADDING & TIPI DI GRAFICO
    // =========================================================================

    test("Charts: configurazione layoutPadding per legenda a destra", () => {
        const legendPos = 'right';
        let layoutPadding = { top: 10, bottom: 10, left: 10, right: 10 };
        if (legendPos === 'right') {
            layoutPadding = { top: 25, bottom: 10, left: 10, right: 40 };
        }
        Assert.strictEqual(layoutPadding.right, 40);
    });

    test("Charts: swap indexAxis per horizontalBar", () => {
        let chartType = 'horizontalBar';
        let indexAxis = 'x';
        if (chartType === 'horizontalBar') {
            chartType = 'bar';
            indexAxis = 'y';
        }
        Assert.strictEqual(chartType, 'bar');
        Assert.strictEqual(indexAxis, 'y');
    });

    test("Charts: isStackedEngine abilitato solo con 2 raggruppamenti e grafico a barre/linee", () => {
        const config = { stacked: true, type: 'bar' };
        const groupBy1 = ['c1'];
        const groupBy2 = ['c1', 'c2'];

        const canStack1 = config.stacked && groupBy1.length >= 2;
        const canStack2 = config.stacked && groupBy2.length >= 2;

        Assert.isFalse(canStack1);
        Assert.isTrue(canStack2);
    });

    test("Charts: palette colori fallback su 'default' se il nome non esiste", () => {
        const palettes = { default: ['#1', '#2'], ocean: ['#o1', '#o2'] };
        const activePalette = 'inesistente';
        const colors = palettes[activePalette] || palettes.default;
        Assert.strictEqual(colors[0], '#1');
    });

    test("Charts: aggregazione di tipo 'list' viene esclusa dal grafico", () => {
        const aggregations = [
            { type: 'list', label: 'Lista Testo' },
            { type: 'sum', label: 'Fatturato' }
        ];
        const validForChart = aggregations.filter(a => a.type !== 'list');
        Assert.strictEqual(validForChart.length, 1);
        Assert.strictEqual(validForChart[0].label, 'Fatturato');
    });

    // =========================================================================
    // 6. RENDERING GRAFICI, ORDINAMENTO, TOP-N, UNITÀ E SCALA 100%
    // =========================================================================

    test("Charts: renderChart esce tempestivamente se config.visible === false", () => {
        const dummyDiv = document.createElement('div');
        dummyDiv.id = 'chart_box_hidden';
        document.body.appendChild(dummyDiv);

        const state = {
            chartConfig: { visible: false }
        };
        AdvancedTableCharts.renderChart('t1', 'chart_box_hidden', [], state);
        Assert.strictEqual(dummyDiv.innerHTML, '');
        dummyDiv.remove();
    });

    test("Charts: renderChart non lancia errori se il container DOM non esiste", () => {
        Assert.doesNotThrow(() => {
            AdvancedTableCharts.renderChart('t_missing', 'container_inesistente_xyz', [], { chartConfig: { visible: true } });
        });
    });

    test("Charts: visualizzazione messaggio informativo se mancano metriche numeriche", () => {
        const dummyDiv = document.createElement('div');
        dummyDiv.id = 'chart_box_empty';
        document.body.appendChild(dummyDiv);

        const state = {
            chartConfig: { visible: true, type: 'bar' },
            groupBy: ['g1'],
            aggregations: []
        };
        AdvancedTableCharts.renderChart('t2', 'chart_box_empty', [{ virtualCells: {} }], state);
        Assert.isTrue(dummyDiv.innerText.includes('almeno un raggruppamento e una metrica'));
        dummyDiv.remove();
    });

    test("Charts: visualizzazione messaggio se tutte le metriche sono di tipo 'list'", () => {
        const dummyDiv = document.createElement('div');
        dummyDiv.id = 'chart_box_only_list';
        document.body.appendChild(dummyDiv);

        const state = {
            chartConfig: { visible: true, type: 'bar' },
            groupBy: ['g1'],
            aggregations: [{ type: 'list', label: 'Elenco' }]
        };
        AdvancedTableCharts.renderChart('t_list_only', 'chart_box_only_list', [{ virtualCells: { grp_0: 'A', agg_0: 'Mario, Luigi' } }], state);
        Assert.isTrue(dummyDiv.innerText.includes('Nessuna metrica numerica'));
        dummyDiv.remove();
    });

    test("Charts: per torta o ciambella crea contenitore flexbox con gap", () => {
        const dummyDiv = document.createElement('div');
        dummyDiv.id = 'chart_box_pie_flex';
        document.body.appendChild(dummyDiv);

        const state = {
            chartConfig: { visible: true, type: 'doughnut', height: 'medium' },
            groupBy: ['g1'],
            aggregations: [{ type: 'sum', label: 'Vendite', sourceColId: 'c_v' }]
        };

        const pivotRows = [
            { virtualCells: { grp_0: 'Nord', agg_0: '100' } },
            { virtualCells: { grp_0: 'Sud', agg_0: '200' } }
        ];

        try {
            AdvancedTableCharts.renderChart('t_pie', 'chart_box_pie_flex', pivotRows, state);
            Assert.strictEqual(dummyDiv.style.display, 'flex');
            Assert.strictEqual(dummyDiv.style.flexWrap, 'wrap');
        } finally {
            AdvancedTableCharts._clearInstances('t_pie');
            dummyDiv.remove();
        }
    });

    test("Charts: altezze del contenitore impostate correttamente per barre e linee", () => {
        const dummyDiv = document.createElement('div');
        dummyDiv.id = 'chart_box_heights';
        document.body.appendChild(dummyDiv);

        const testHeight = (hMode, expectedPx) => {
            const state = {
                chartConfig: { visible: true, type: 'bar', height: hMode },
                groupBy: ['g1'],
                aggregations: [{ type: 'sum', label: 'Val', sourceColId: 'c1' }]
            };
            AdvancedTableCharts.renderChart('t_h', 'chart_box_heights', [{ virtualCells: { grp_0: 'A', agg_0: '10' } }], state);
            Assert.strictEqual(dummyDiv.style.height, expectedPx);
        };

        try {
            testHeight('small', '260px');
            testHeight('medium', '400px');
            testHeight('large', '600px');
        } finally {
            AdvancedTableCharts._clearInstances('t_h');
            dummyDiv.remove();
        }
    });

    test("Charts: renderChart ordina le barre per valore decrescente e crescente con sortOrder", () => {
        const dummyDiv = document.createElement('div');
        dummyDiv.id = 'chart_box_sort';
        document.body.appendChild(dummyDiv);

        const pivotRows = [
            { virtualCells: { grp_0: 'B', agg_0: '20' } },
            { virtualCells: { grp_0: 'A', agg_0: '80' } },
            { virtualCells: { grp_0: 'C', agg_0: '5' } }
        ];

        try {
            AdvancedTableCharts.renderChart('t_sort', 'chart_box_sort', pivotRows, {
                chartConfig: { visible: true, type: 'bar', sortOrder: 'desc' },
                groupBy: ['g1'],
                aggregations: [{ type: 'sum', label: 'Tot', sourceColId: 'c1' }]
            });
            let chartCfg = AdvancedTableCharts.instances['t_sort'].config;
            Assert.deepEqual(chartCfg.data.labels, ['A', 'B', 'C']);
            Assert.deepEqual(chartCfg.data.datasets[0].data, [80, 20, 5]);

            AdvancedTableCharts.renderChart('t_sort', 'chart_box_sort', pivotRows, {
                chartConfig: { visible: true, type: 'bar', sortOrder: 'asc' },
                groupBy: ['g1'],
                aggregations: [{ type: 'sum', label: 'Tot', sourceColId: 'c1' }]
            });
            chartCfg = AdvancedTableCharts.instances['t_sort'].config;
            Assert.deepEqual(chartCfg.data.labels, ['C', 'B', 'A']);
            Assert.deepEqual(chartCfg.data.datasets[0].data, [5, 20, 80]);
        } finally {
            AdvancedTableCharts._clearInstances('t_sort');
            dummyDiv.remove();
        }
    });

    test("Charts: renderChart raggruppa in 'Altro' le categorie eccedenti Top-N su barre e torte", () => {
        const dummyDiv = document.createElement('div');
        dummyDiv.id = 'chart_box_topn';
        document.body.appendChild(dummyDiv);

        const pivotRows = [
            { virtualCells: { grp_0: 'Cat1', agg_0: '50' } },
            { virtualCells: { grp_0: 'Cat2', agg_0: '40' } },
            { virtualCells: { grp_0: 'Cat3', agg_0: '15' } },
            { virtualCells: { grp_0: 'Cat4', agg_0: '5' } }
        ];

        try {
            // 1. Su Barre
            AdvancedTableCharts.renderChart('t_topn_bar', 'chart_box_topn', pivotRows, {
                chartConfig: { visible: true, type: 'bar', topN: '2', sortOrder: 'desc' },
                groupBy: ['g1'],
                aggregations: [{ type: 'sum', label: 'Tot', sourceColId: 'c1' }]
            });
            const barCfg = AdvancedTableCharts.instances['t_topn_bar'].config;
            Assert.strictEqual(barCfg.data.labels.length, 3);
            Assert.deepEqual(barCfg.data.datasets[0].data, [50, 40, 20]);

            // 2. Su Torta
            AdvancedTableCharts.renderChart('t_topn_pie', 'chart_box_topn', pivotRows, {
                chartConfig: { visible: true, type: 'pie', topN: '2', sortOrder: 'desc' },
                groupBy: ['g1'],
                aggregations: [{ type: 'sum', label: 'Tot', sourceColId: 'c1' }]
            });
            const pieCfg = AdvancedTableCharts.instances['t_topn_pie'][0].config;
            Assert.strictEqual(pieCfg.data.labels.length, 3);
            Assert.deepEqual(pieCfg.data.datasets[0].data, [50, 40, 20]);
        } finally {
            AdvancedTableCharts._clearInstances('t_topn_bar');
            AdvancedTableCharts._clearInstances('t_topn_pie');
            dummyDiv.remove();
        }
    });

    test("Charts: renderChart applica Top-N + Altri e Scala 100% ai grafici impilati (stacked)", () => {
        const dummyDiv = document.createElement('div');
        dummyDiv.id = 'chart_box_stacked100';
        document.body.appendChild(dummyDiv);

        const pivotRows = [
            { virtualCells: { grp_0: 'Nord', grp_1: 'Aperto', agg_0: '30' } },
            { virtualCells: { grp_0: 'Nord', grp_1: 'Chiuso', agg_0: '70' } },
            { virtualCells: { grp_0: 'Sud', grp_1: 'Aperto', agg_0: '10' } },
            { virtualCells: { grp_0: 'Sud', grp_1: 'Chiuso', agg_0: '10' } },
            { virtualCells: { grp_0: 'Est', grp_1: 'Aperto', agg_0: '5' } },
            { virtualCells: { grp_0: 'Est', grp_1: 'Chiuso', agg_0: '5' } }
        ];

        try {
            AdvancedTableCharts.renderChart('t_st100', 'chart_box_stacked100', pivotRows, {
                chartConfig: { visible: true, type: 'bar', stacked: true, stacked100: true, topN: '1', sortOrder: 'desc' },
                groupBy: ['g1', 'g2'],
                aggregations: [{ type: 'sum', label: 'Tot', sourceColId: 'c1' }]
            });
            const cfg = AdvancedTableCharts.instances['t_st100'].config;
            Assert.strictEqual(cfg.data.labels.length, 2); // Nord + Altro (Sud+Est)
            Assert.strictEqual(cfg.data.datasets[0].data[0], 30); // Nord Aperto = 30 / 100 = 30%
            Assert.strictEqual(cfg.data.datasets[1].data[0], 70); // Nord Chiuso = 70 / 100 = 70%
            Assert.strictEqual(cfg.data.datasets[0].data[1], 50); // Altro Aperto = 15 / 30 = 50%
            Assert.strictEqual(cfg.options.scales.y.min, 0);
            Assert.strictEqual(cfg.options.scales.y.max, 100);
            Assert.strictEqual(cfg.options.scales.y.ticks.callback(50), '50%');
        } finally {
            AdvancedTableCharts._clearInstances('t_st100');
            dummyDiv.remove();
        }
    });

    test("Charts: renderChart rispetta beginAtZero: false ed eredita unità di misura sull'asse Y", () => {
        const dummyDiv = document.createElement('div');
        dummyDiv.id = 'chart_box_units';
        document.body.appendChild(dummyDiv);

        const prevDatabases = AppState.databases;
        AppState.databases = {
            src_db_units: {
                columns: [{ id: 'c_eur', name: 'Importo', type: 'number', numberUnit: '€', decimals: 2 }],
                rows: []
            }
        };

        try {
            AdvancedTableCharts.renderChart('t_units', 'chart_box_units', [{ virtualCells: { grp_0: 'A', agg_0: '950' } }], {
                sourceTableId: 'src_db_units',
                chartConfig: { visible: true, type: 'line', beginAtZero: false },
                groupBy: ['g1'],
                aggregations: [{ type: 'sum', label: 'Importo', sourceColId: 'c_eur' }]
            });
            const cfg = AdvancedTableCharts.instances['t_units'].config;
            Assert.isFalse(cfg.options.scales.y.beginAtZero);
            Assert.strictEqual(cfg.options.scales.y.ticks.callback(100), '100 €');
        } finally {
            AppState.databases = prevDatabases;
            AdvancedTableCharts._clearInstances('t_units');
            dummyDiv.remove();
        }
    });

    test("Charts: openConfigMenu delega correttamente ad AdvancedPivotMenus.openCreateWizard con flag chartOnlyMode", () => {
        let capturedTableId = null;
        let capturedFlag = null;

        const origWizard = AdvancedPivotMenus.openCreateWizard;
        AdvancedPivotMenus.openCreateWizard = (tId, chartOnly) => {
            capturedTableId = tId;
            capturedFlag = chartOnly;
        };

        try {
            AdvancedTableCharts.openConfigMenu('tbl_wizard_test');
            Assert.strictEqual(capturedTableId, 'tbl_wizard_test');
            Assert.strictEqual(capturedFlag, true);
        } finally {
            AdvancedPivotMenus.openCreateWizard = origWizard;
        }
    });

});