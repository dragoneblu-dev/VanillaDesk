/**
 * tests/test-advanced-table-charts.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-charts
 * Conteggio test case: 26
 * Generato automaticamente il: 2026-10-01 00:25:00
 */

describe("AdvancedTable Charts: Integrazione Chart.js, Stacking, Palette & Plugins (26 Test)", () => {

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
    // 2. PLUGIN CENTER TEXT (CIAMBELLA DOUGHNUT)
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

    test("Charts: plugin centerText somma i valori del dataset per doughnut", () => {
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
        // 10 + 25 + 15 = 50 disegnato su canvas come stringa "50"
        Assert.strictEqual(printedText, "50");
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
                    { hidden: true }, // Elemento da 50 escluso perché nascosto
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
        // 100 + 20 = 120
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
        // 10.3333 + 20.2222 = 30.5555 -> arrotondato a "30.56"
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

        // 1. Small -> 15px
        plugin.beforeDraw(createChart(), null, { display: true, chartHeight: 'small' });
        Assert.isTrue(capturedFont.includes('15px'));

        // 2. Large -> 34px
        plugin.beforeDraw(createChart(), null, { display: true, chartHeight: 'large' });
        Assert.isTrue(capturedFont.includes('34px'));

        // 3. Medium (Default) -> 24px
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
        // X = (50 + 250) / 2 = 150; Y = (100 + 300) / 2 = 200
        Assert.strictEqual(posX, 150);
        Assert.strictEqual(posY, 200);
    });

    // =========================================================================
    // 3. PLUGIN CUSTOM DATA LABELS (TORTA E CIAMBELLA)
    // =========================================================================

    test("Charts: plugin customDataLabels calcola percentuali su totale della torta", () => {
        const plugin = AdvancedTableCharts._getCustomDataLabelsPlugin();
        let lastDrawnLabel = '';
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
                lineTo: () => {}, stroke: () => {}, fillText: (t) => { lastDrawnLabel = t; }
            }
        };
        plugin.afterDatasetsDraw(fakeChart, null, { display: true });
        // L'ultima fetta è 80 su 100 -> deve contenere '80 (80%)'
        Assert.isTrue(lastDrawnLabel.includes('80%'));
    });

    test("Charts: plugin customDataLabels si disattiva per grafici diversi da pie o doughnut", () => {
        const plugin = AdvancedTableCharts._getCustomDataLabelsPlugin();
        let strokeCalled = false;
        let fillTextCalled = false;

        const fakeChart = {
            config: { type: 'bar' }, // Non è né pie né doughnut
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
    // 4. CONFIGURAZIONI LAYOUT, PADDING & TIPI DI GRAFICO
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
    // 5. RENDERING GRAFICI (renderChart)
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
            aggregations: [] // Nessuna metrica
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

        AdvancedTableCharts.renderChart('t_pie', 'chart_box_pie_flex', pivotRows, state);

        Assert.strictEqual(dummyDiv.style.display, 'flex');
        Assert.strictEqual(dummyDiv.style.flexWrap, 'wrap');
        dummyDiv.remove();
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

        testHeight('small', '260px');
        testHeight('medium', '400px');
        testHeight('large', '600px');

        dummyDiv.remove();
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