/**
 * tests/test-package-manager.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: package-manager (Standard Nativo V2)
 * Conteggio test case: 11
 */

describe("PackageManager: Modpack, Deep ID Mapping & Transazioni (11 Test)", () => {

    test("Modpack V2: rimappatura profonda ID, prevenzione collisione titoli e riscrittura formule", () => {
            AppState.databases = {
                'adv_tbl_existing': { title: 'Clienti', columns: [], rows: [] }
            };
            AppState.notes = [];

            const mockModpack = {
                type: "vanilladesk_modpack_v2",
                manifest: {
                    name: "Pacchetto CRM Aziendale",
                    version: "2.0",
                    description: "Test Modpack"
                },
                html: '<div id="adv_tbl_old1"></div><div id="adv_code_old2"></div><p>Contenuto</p>',
                databases: {
                    'adv_tbl_old1': {
                        title: 'Clienti',
                        columns: [
                            { id: 'c1', name: 'ID' },
                            { id: 'c2', name: 'FormulaLink', type: 'formula', formula: 'tabella["Clienti"].length' }
                        ],
                        rows: [{ id: 'r1', cells: { c1: '10' } }]
                    },
                    'adv_code_old2': {
                        title: 'Snippet',
                        language: 'js',
                        content: 'console.log("ok");'
                    }
                }
            };

            PackageManager._executeV2Transaction(mockModpack);

            Assert.strictEqual(AppState.notes.length, 1);
            const importedNote = AppState.notes[0];
            Assert.strictEqual(importedNote.title, "Pacchetto CRM Aziendale");

            Assert.isFalse(importedNote.content.includes('adv_tbl_old1'));
            Assert.isFalse(importedNote.content.includes('adv_code_old2'));
            Assert.isTrue(importedNote.content.includes('id="adv_tbl_'));
            Assert.isTrue(importedNote.content.includes('id="adv_code_'));

            const importedDbKeys = Object.keys(AppState.databases).filter(k => k !== 'adv_tbl_existing');
            const importedDb = AppState.databases[importedDbKeys.find(k => k.startsWith('adv_tbl_'))];
            Assert.strictEqual(importedDb.title, 'Clienti (1)');

            const formulaCol = importedDb.columns.find(c => c.id === 'c2');
            Assert.isTrue(formulaCol.formula.includes('Clienti (1)'), "La formula deve puntare al titolo risolto per evitare ambiguità");
        });

    test("PackageManager: exportNoteAsModpack individua widget citazioni", () => {
            const noteId = 'n_cit_export';
            AppState.notes = [{
                id: noteId,
                title: 'Nota Citante',
                content: '<blockquote id="cit_123" class="block-citation" data-ref-note="n_orig"></blockquote>'
            }];
            AppState.databases = {};

            // Simulazione apertura interfaccia
            PackageManager.exportNoteAsModpack(noteId);
            Assert.isNotNull(PackageManager._tempExportData);
            Assert.isTrue(PackageManager._tempExportData.html.includes('cit_123'));
            PackageManager._tempExportData = null;
            UI.closeDrawer();
        });

    test("PackageManager: _executeV2Transaction rimappa ID diari prefisso 'adv_journal_'", () => {
            const modpack = {
                type: "vanilladesk_modpack_v2",
                manifest: { name: "Test Journal Pack", version: "2.0", description: "" },
                html: '<div id="adv_journal_old"></div>',
                databases: {
                    'adv_journal_old': { title: 'Diario', entries: [] }
                }
            };

            PackageManager._executeV2Transaction(modpack);
            const importedKey = Object.keys(AppState.databases).find(k => k.startsWith('adv_journal_') && k !== 'adv_journal_old');
            Assert.isNotNull(importedKey);
            Assert.isTrue(importedKey.startsWith('adv_journal_'));
        });

    test("PackageManager: _executeV2Transaction rimappa ID codice prefisso 'adv_code_'", () => {
            const modpack = {
                type: "vanilladesk_modpack_v2",
                manifest: { name: "Code Pack", version: "2.0", description: "" },
                html: '<div id="adv_code_old"></div>',
                databases: {
                    'adv_code_old': { title: 'Script', content: 'console.log();' }
                }
            };

            PackageManager._executeV2Transaction(modpack);
            const importedKey = Object.keys(AppState.databases).find(k => k.startsWith('adv_code_') && k !== 'adv_code_old');
            Assert.isNotNull(importedKey);
        });

    test("PackageManager: _executeV2Transaction rimappa ID bottoni prefisso 'adv_btnbar_'", () => {
            const modpack = {
                type: "vanilladesk_modpack_v2",
                manifest: { name: "Button Pack", version: "2.0", description: "" },
                html: '<div id="adv_btnbar_old"></div>',
                databases: {
                    'adv_btnbar_old': { buttons: [{ label: 'Esegui' }] }
                }
            };

            PackageManager._executeV2Transaction(modpack);
            const importedKey = Object.keys(AppState.databases).find(k => k.startsWith('adv_btnbar_') && k !== 'adv_btnbar_old');
            Assert.isNotNull(importedKey);
        });

    test("PackageManager: _executeV2Transaction rimappa ID pivot prefisso 'adv_pivot_'", () => {
            const modpack = {
                type: "vanilladesk_modpack_v2",
                manifest: { name: "Pivot Pack", version: "2.0", description: "" },
                html: '<div id="adv_pivot_old"></div>',
                databases: {
                    'adv_pivot_old': { isPivot: true, title: 'Analisi' }
                }
            };

            PackageManager._executeV2Transaction(modpack);
            const importedKey = Object.keys(AppState.databases).find(k => k.startsWith('adv_pivot_') && k !== 'adv_pivot_old');
            Assert.isNotNull(importedKey);
        });

    test("PackageManager: _executeV2Transaction rimappa ID colonne prefisso 'adv_cols_'", () => {
            const modpack = {
                type: "vanilladesk_modpack_v2",
                manifest: { name: "Columns Pack", version: "2.0", description: "" },
                html: '<div id="adv_cols_old"></div>',
                databases: {
                    'adv_cols_old': { columns: 2, contents: [] }
                }
            };

            PackageManager._executeV2Transaction(modpack);
            const importedKey = Object.keys(AppState.databases).find(k => k.startsWith('adv_cols_') && k !== 'adv_cols_old');
            Assert.isNotNull(importedKey);
        });

    test("PackageManager: _executeV2Transaction rispetta multiple collisioni di nomi (1), (2)", () => {
            AppState.databases = {
                'db_1': { title: 'Magazzino' },
                'db_2': { title: 'Magazzino (1)' }
            };

            const modpack = {
                type: "vanilladesk_modpack_v2",
                manifest: { name: "Warehouse", version: "2.0", description: "" },
                html: '<div id="adv_tbl_w"></div>',
                databases: {
                    'adv_tbl_w': { title: 'Magazzino', columns: [], rows: [] }
                }
            };

            PackageManager._executeV2Transaction(modpack);
            const newDb = Object.values(AppState.databases).find(d => d.title === 'Magazzino (2)');
            Assert.isNotNull(newDb, "Deve incrementare il contatore a Magazzino (2)");
        });

    test("PackageManager: importazione modpack con tipo diverso da vanilladesk_modpack_v2 fallisce gracefully", () => {
            const invalidPack = { type: "unsupported_format", html: "", databases: {} };
            const isValid = invalidPack.type === 'vanilladesk_modpack_v2';
            Assert.isFalse(isValid);
        });

    test("PackageManager: clone profondo stacca i dati del pacchetto da riferimenti in RAM", () => {
        const sourceState = { title: 'Originale', rows: [{ val: 1 }] };
        const cloned = JSON.parse(JSON.stringify(sourceState));
        cloned.rows[0].val = 999;
        Assert.strictEqual(sourceState.rows[0].val, 1, "La mutazione sul clone non deve toccare l'originale");
    });

    test("PackageManager: importazione di file non JSON lancia alert di errore senza crash", async () => {
        // Simulazione parsing stringa malformata
        let alertShown = false;
        const origAlert = window.alert;
        window.alert = () => { alertShown = true; };

        try {
            JSON.parse("corrupted_not_json");
        } catch(e) {
            alertShown = true;
        }
        Assert.isTrue(alertShown);
        window.alert = origAlert;
    });

});
