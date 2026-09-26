/**
 * tests/test-advanced-table-pivot-menus.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-pivot-menus
 * Conteggio test case: 13
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Pivot Menus: Wizard, Selettori & Viste Collegate (13 Test)", () => {

    test("Pivot: toggleZebra inverte il flag striped", () => {
            const pId = 'piv_zebra';
            AppState.databases[pId] = { id: pId, striped: true };

            AdvancedPivotMenus.toggleZebra(pId);
            Assert.isFalse(AppState.databases[pId].striped);

            AdvancedPivotMenus.toggleZebra(pId);
            Assert.isTrue(AppState.databases[pId].striped);
        });

    test("Pivot: selectChartType aggiorna il campo nascosto #pivotChartStyle", () => {
            const dummyInput = document.createElement('input');
            dummyInput.id = 'pivotChartStyle';
            dummyInput.value = 'bar';
            document.body.appendChild(dummyInput);

            try {
                AdvancedPivotMenus.selectChartType('doughnut');
                Assert.strictEqual(dummyInput.value, 'doughnut');
            } finally {
                dummyInput.remove();
            }
        });

    test("Pivot: selectPalette aggiorna il campo nascosto #chartColorPalette", () => {
            const dummyInput = document.createElement('input');
            dummyInput.id = 'chartColorPalette';
            dummyInput.value = 'default';
            document.body.appendChild(dummyInput);

            try {
                AdvancedPivotMenus.selectPalette('ocean');
                Assert.strictEqual(dummyInput.value, 'ocean');
            } finally {
                dummyInput.remove();
            }
        });

    test("Pivot: addGroup aggiunge colonna al pendingConfig", () => {
            const dummySelect = document.createElement('select');
            dummySelect.id = 'pivotGroupSelect';
            dummySelect.innerHTML = '<option value="col_add_grp" selected>Campo</option>';
            document.body.appendChild(dummySelect);

            AdvancedPivotMenus.pendingConfig = {
                groupBy: [],
                aggregations: []
            };

            try {
                AdvancedPivotMenus.addGroup();
                Assert.isTrue(AdvancedPivotMenus.pendingConfig.groupBy.includes('col_add_grp'));
            } finally {
                dummySelect.remove();
            }
        });

    test("Pivot: addGroup blocca l'aggiunta di colonne già presenti", () => {
            const dummySelect = document.createElement('select');
            dummySelect.id = 'pivotGroupSelect';
            dummySelect.innerHTML = '<option value="col_dup" selected>Dup</option>';
            document.body.appendChild(dummySelect);

            AdvancedPivotMenus.pendingConfig = { groupBy: ['col_dup'], aggregations: [] };

            let alertShown = false;
            const origAlert = window.alert;
            window.alert = () => { alertShown = true; };

            try {
                AdvancedPivotMenus.addGroup();
                Assert.isTrue(alertShown);
                Assert.strictEqual(AdvancedPivotMenus.pendingConfig.groupBy.length, 1);
            } finally {
                window.alert = origAlert;
                dummySelect.remove();
            }
        });

    test("Pivot: removeItem rimuove l'elemento all'indice specificato", () => {
            AdvancedPivotMenus.pendingConfig = {
                groupBy: ['A', 'B', 'C'],
                aggregations: []
            };
            AdvancedPivotMenus.removeItem('groupBy', 1); // Rimuove 'B'
            Assert.deepEqual(AdvancedPivotMenus.pendingConfig.groupBy, ['A', 'C']);
        });

    test("Pivot: toggleChartOptions mostra il div opzioni quando val === 'chart'", () => {
            const dummyDiv = document.createElement('div');
            dummyDiv.id = 'pivotChartOptions';
            dummyDiv.style.display = 'none';
            document.body.appendChild(dummyDiv);

            try {
                AdvancedPivotMenus.toggleChartOptions('chart');
                Assert.strictEqual(dummyDiv.style.display, 'block');

                AdvancedPivotMenus.toggleChartOptions('table');
                Assert.strictEqual(dummyDiv.style.display, 'none');
            } finally {
                dummyDiv.remove();
            }
        });

    test("Pivot: addAgg genera etichette intelligenti in base alla metrica", () => {
            const srcId = 'db_piv_labels_src';
            AppState.databases[srcId] = {
                id: srcId,
                columns: [{ id: 'c_qta', name: 'Quantità', type: 'number' }]
            };

            const dummyCol = document.createElement('select'); dummyCol.id = 'pivotAggCol'; dummyCol.innerHTML = '<option value="c_qta" selected></option>';
            const dummyType = document.createElement('select'); dummyType.id = 'pivotAggType'; dummyType.innerHTML = '<option value="avg" selected></option>';
            document.body.appendChild(dummyCol); document.body.appendChild(dummyType);

            AdvancedPivotMenus.pendingConfig = { sourceId: srcId, groupBy: [], aggregations: [] };

            try {
                AdvancedPivotMenus.addAgg();
                Assert.strictEqual(AdvancedPivotMenus.pendingConfig.aggregations[0].label, 'Media di Quantità');
            } finally {
                dummyCol.remove(); dummyType.remove();
            }
        });

    test("Pivot: updateAggTypeOptions include 'sum' e 'avg' per tipi numerici e formula", () => {
            const dummyCol = document.createElement('select');
            dummyCol.id = 'pivotAggCol';
            dummyCol.innerHTML = '<option value="c1" data-type="number" selected></option>';

            const dummyType = document.createElement('select');
            dummyType.id = 'pivotAggType';
            document.body.appendChild(dummyCol);
            document.body.appendChild(dummyType);

            try {
                AdvancedPivotMenus.updateAggTypeOptions();
                Assert.isTrue(dummyType.innerHTML.includes('value="sum"'));
                Assert.isTrue(dummyType.innerHTML.includes('value="avg"'));
            } finally {
                dummyCol.remove(); dummyType.remove();
            }
        });

    test("Pivot: updateAggTypeOptions esclude 'sum' e 'avg' per tipi testo", () => {
            const dummyCol = document.createElement('select');
            dummyCol.id = 'pivotAggCol';
            dummyCol.innerHTML = '<option value="c2" data-type="text" selected></option>';

            const dummyType = document.createElement('select');
            dummyType.id = 'pivotAggType';
            document.body.appendChild(dummyCol);
            document.body.appendChild(dummyType);

            try {
                AdvancedPivotMenus.updateAggTypeOptions();
                Assert.isFalse(dummyType.innerHTML.includes('value="sum"'));
                Assert.isFalse(dummyType.innerHTML.includes('value="avg"'));
                Assert.isTrue(dummyType.innerHTML.includes('value="count"'));
            } finally {
                dummyCol.remove(); dummyType.remove();
            }
        });

    test("Pivot: loadSchemaForStep2 genera bottoni vista attivi in base alle colonne presenti", () => {
            const srcId = 'db_linked_buttons';
            AppState.databases[srcId] = {
                id: srcId,
                columns: [
                    { id: 'c_sel', type: 'select' },
                    { id: 'c_date', type: 'date', hasEndDate: true }
                ]
            };

            const dummySel = document.createElement('select');
            dummySel.id = 'pivotSourceSelect';
            dummySel.innerHTML = `<option value="${srcId}" selected></option>`;

            const dummyStep2 = document.createElement('div'); dummyStep2.id = 'linkedStep2';
            const dummyArea = document.createElement('div'); dummyArea.id = 'linkedViewButtonsArea';
            dummyStep2.appendChild(dummyArea);
            document.body.appendChild(dummySel); document.body.appendChild(dummyStep2);

            AdvancedPivotMenus.pendingConfig = { sourceId: null };

            try {
                AdvancedPivotMenus.loadSchemaForStep2();
                Assert.strictEqual(dummyStep2.style.display, 'block');
                Assert.isTrue(dummyArea.innerHTML.includes('Bacheca'));
                Assert.isTrue(dummyArea.innerHTML.includes('Timeline'));
            } finally {
                dummySel.remove(); dummyStep2.remove();
            }
        });

    test("Pivot: createLinkedView genera stato collegato con sourceTableId e viewType", () => {
            const srcId = 'db_src_create_link';
            AppState.databases[srcId] = {
                id: srcId,
                title: 'Originale',
                columns: [{ id: 's', type: 'select' }],
                rows: []
            };
            AdvancedPivotMenus.pendingConfig = { sourceId: srcId };

            const origRestore = Editor.restoreSelection;
            Editor.restoreSelection = () => {};

            try {
                AdvancedPivotMenus.createLinkedView('board');
                const createdKey = Object.keys(AppState.databases).find(k => k.startsWith('adv_link_'));
                Assert.isNotNull(createdKey);
                const linkState = AppState.databases[createdKey];
                Assert.strictEqual(linkState.isLinkedView, true);
                Assert.strictEqual(linkState.sourceTableId, srcId);
                Assert.strictEqual(linkState.viewType, 'board');
            } finally {
                Editor.restoreSelection = origRestore;
            }
        });

    test("Pivot: onDragStart e onDrop riordinano gli elementi di raggruppamento", () => {
            AdvancedPivotMenus.pendingConfig = {
                groupBy: ['A', 'B', 'C'],
                aggregations: []
            };

            const dummyItem = document.createElement('div');
            dummyItem.className = 'drag-item';
            const evMock = { dataTransfer: { effectAllowed: '' }, target: dummyItem };

            AdvancedPivotMenus.onDragStart(evMock, 'groupBy', 0);
            Assert.strictEqual(AdvancedPivotMenus.draggedIndex, 0);

            const dropEv = { preventDefault: () => {} };
            AdvancedPivotMenus.onDrop(dropEv, 'groupBy', 3); // Sposta A in fondo
            Assert.deepEqual(AdvancedPivotMenus.pendingConfig.groupBy, ['B', 'C', 'A']);
        });

});
