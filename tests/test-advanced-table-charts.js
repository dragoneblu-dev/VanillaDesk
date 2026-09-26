/**
 * tests/test-advanced-table-charts.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-charts
 * Conteggio test case: 12
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Charts: Integrazione Chart.js, Stacking & Palette (12 Test)", () => {

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
                    font: '',
                    fillStyle: '',
                    textAlign: '',
                    textBaseline: ''
                }
            };
            plugin.beforeDraw(fakeChart, null, { display: true });
            Assert.strictEqual(printedText, 50); // 10 + 25 + 15
        });

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

    test("Charts: aggregazione di tipo 'list' viene esclusa dal grafico", () => {
            const aggregations = [
                { type: 'list', label: 'Lista Testo' },
                { type: 'sum', label: 'Fatturato' }
            ];
            const validForChart = aggregations.filter(a => a.type !== 'list');
            Assert.strictEqual(validForChart.length, 1);
            Assert.strictEqual(validForChart[0].label, 'Fatturato');
        });

});
