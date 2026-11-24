/**
 * tests/test-export-html.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: js/export-html.js
 */

describe("ExportHTML: Generazione Documento HTML & Idratazione Citazioni (test-export-html.js)", () => {

    test("_hydrateCitationsForExport: idrata citazioni annidate, gestisce note eliminate e blocca riferimenti circolari", () => {
        const prevNotes = [...AppState.notes];
        try {
            AppState.notes = [
                { id: 'n_src_1', title: 'Sorgente 1', content: '<p>Testo Uno</p><blockquote class="block-citation" data-ref-note="n_src_2" data-ref-type="note"><div class="citation-body"></div></blockquote>' },
                { id: 'n_src_2', title: 'Sorgente 2', content: '<p>Testo Due</p><blockquote class="block-citation" data-ref-note="n_src_1" data-ref-type="note"><div class="citation-body"></div></blockquote>' }
            ];

            const container = document.createElement('div');
            container.innerHTML = `
                <blockquote class="block-citation" data-ref-note="n_src_1" data-ref-type="note">
                    <div class="citation-body"></div>
                </blockquote>
                <blockquote class="block-citation" data-ref-note="n_missing" data-ref-type="note">
                    <div class="citation-body"></div>
                </blockquote>
            `;

            ExportManager._hydrateCitationsForExport(container);

            const html = container.innerHTML;
            Assert.isTrue(html.includes('Testo Uno'));
            Assert.isTrue(html.includes('Testo Due'));
            Assert.isTrue(html.includes(I18n.t('export_doc.circular_ref_blocked')));
            Assert.isTrue(html.includes(I18n.t('export_doc.source_note_deleted')));
        } finally {
            AppState.notes = prevNotes;
        }
    });

    test("generateHTMLDocument: genera TOC, media assets, snippet, note inline, checkbox e rimuove elementi UI", () => {
        const prevOpen = window.open;
        let writtenHtml = '';
        let closed = false;
        let focused = false;

        try {
            window.open = () => ({
                document: {
                    write: (h) => { writtenHtml += h; },
                    close: () => { closed = true; }
                },
                focus: () => { focused = true; }
            });

            const flatList = [
                {
                    level: 0,
                    note: {
                        id: 'n_h_1',
                        title: 'Capitolo Principale',
                        content: `
                            <p>Testo con <span class="adv-copy-snippet"><span class="snippet-text">npm test</span></span></p>
                            <img data-image-ref="img_schema.webp">
                            <audio data-audio-ref="aud_voice.mp3"></audio>
                            <input type="checkbox" checked>
                            <input type="checkbox">
                            <span class="adv-bookmark-marker">BKM</span>
                            <span class="adv-col-resizer">RES</span>
                            <span class="inline-note-wrapper"><span class="inline-note-data">Dettaglio piè di pagina</span></span>
                        `
                    }
                },
                {
                    level: 1,
                    note: {
                        id: 'n_h_2',
                        title: 'Sotto-nota Vuota',
                        content: ''
                    }
                }
            ];

            ExportManager.generateHTMLDocument('Titolo Export', flatList);

            Assert.isTrue(closed);
            Assert.isTrue(focused);
            Assert.isTrue(writtenHtml.includes('<title>Titolo Export</title>'));
            Assert.isTrue(writtenHtml.includes('href="#note-0"'));
            Assert.isTrue(writtenHtml.includes('href="#note-1"'));
            Assert.isTrue(writtenHtml.includes('class="lvl-0"'));
            Assert.isTrue(writtenHtml.includes('class="lvl-1"'));
            Assert.isTrue(writtenHtml.includes('src="assets/img_schema.webp"'));
            Assert.isTrue(writtenHtml.includes('src="assets/aud_voice.mp3"'));
            Assert.isTrue(writtenHtml.includes('<code class="snippet-export">npm test</code>'));
            Assert.isTrue(writtenHtml.includes('☑ '));
            Assert.isTrue(writtenHtml.includes('☐ '));
            Assert.isFalse(writtenHtml.includes('adv-bookmark-marker'));
            Assert.isFalse(writtenHtml.includes('adv-col-resizer'));
            Assert.isTrue(writtenHtml.includes('exported-footnote'));
            Assert.isTrue(writtenHtml.includes('Dettaglio piè di pagina'));
            Assert.isTrue(writtenHtml.includes(I18n.t('export_doc.no_content')));
        } finally {
            window.open = prevOpen;
        }
    });

    test("generateHTMLDocument: converte widget database, pivot con grafico, diario, codice, barra pulsanti e citazione", () => {
        const prevOpen = window.open;
        const prevDbs = AppState.databases;
        const prevNotes = [...AppState.notes];
        let writtenHtml = '';

        try {
            window.open = () => ({
                document: { write: (h) => { writtenHtml += h; }, close: () => {} },
                focus: () => {}
            });

            AppState.databases = {
                adv_tbl_exp: {
                    id: 'adv_tbl_exp',
                    title: 'DB Esportato',
                    columns: [
                        { id: 'c1', name: 'Nome', type: 'text' },
                        { id: 'c2', name: 'Stato', type: 'select' },
                        { id: 'c3', name: 'Segreto', type: 'text', hidden: true }
                    ],
                    selectColors: { c2: { 'OK': 'hl-c6' } },
                    conditionalColors: [
                        { active: true, color: 'hl-c5', conditions: [{ colId: 'c2', operator: '=', value: 'OK' }] }
                    ],
                    rows: [
                        { id: 'r1', cells: { c1: 'Voce 1', c2: 'OK', c3: 'Nascosto' } }
                    ]
                },
                adv_piv_chart: {
                    id: 'adv_piv_chart',
                    title: 'Grafico Vendite',
                    isPivot: true,
                    sourceTableId: 'adv_tbl_exp',
                    chartConfig: { visible: true, type: 'bar' },
                    columns: [],
                    rows: []
                },
                adv_journal_exp: {
                    id: 'adv_journal_exp',
                    title: 'Diario Progetto',
                    entries: [
                        { id: 'j1', timestamp: 1700000000000, dateStr: '2026/01/10', timeStr: '09:30', content: '<p>Avvio lavori</p>', endTime: 1700000005000 }
                    ]
                },
                adv_code_exp: {
                    id: 'adv_code_exp',
                    title: 'Snippet JS',
                    language: 'js',
                    content: 'if (a < b) {\n  run();\n}'
                },
                adv_btnbar_exp: {
                    id: 'adv_btnbar_exp',
                    buttons: [{ label: 'Approva' }]
                }
            };

            AppState.notes = [
                { id: 'n_cit_src', title: 'Fonte', content: '<p>Contenuto citato vivo</p>' }
            ];

            const flatList = [
                {
                    level: 0,
                    note: {
                        id: 'n_widgets',
                        title: 'Nota Widget',
                        content: `
                            <div id="adv_tbl_exp" class="adv-widget-shell adv-table-wrapper" data-widget-type="database"></div>
                            <div id="adv_piv_chart" class="adv-widget-shell adv-table-wrapper" data-widget-type="pivot"></div>
                            <div id="adv_journal_exp" class="adv-widget-shell adv-journal-wrapper" data-widget-type="journal"></div>
                            <div id="adv_code_exp" class="adv-widget-shell code-wrapper" data-widget-type="code"></div>
                            <div id="adv_btnbar_exp" class="adv-widget-shell adv-action-button-wrapper" data-widget-type="buttonbar"></div>
                            <blockquote class="adv-widget-shell block-citation" data-widget-type="citation" data-ref-note="n_cit_src">
                                <span class="adv-table-title">Citazione Fonte</span>
                                <div class="citation-body"></div>
                            </blockquote>
                        `
                    }
                }
            ];

            ExportManager.generateHTMLDocument('Test Widget HTML', flatList);

            Assert.isTrue(writtenHtml.includes('DB Esportato'));
            Assert.isTrue(writtenHtml.includes('Voce 1'));
            Assert.isTrue(writtenHtml.includes('adv-select-pill hl-c6'));
            Assert.isTrue(writtenHtml.includes('<tr class="hl-c5">'));
            Assert.isFalse(writtenHtml.includes('Nascosto'));
            Assert.isTrue(writtenHtml.includes(I18n.t('export_doc.chart_db_reference', { title: 'DB Esportato' })));
            Assert.isTrue(writtenHtml.includes('Diario Progetto'));
            Assert.isTrue(writtenHtml.includes('Avvio lavori'));
            Assert.isTrue(writtenHtml.includes('if (a &lt; b) {<br>  run();<br>}'));
            Assert.isTrue(writtenHtml.includes('[Approva]'));
            Assert.isTrue(writtenHtml.includes('citation-export'));
            Assert.isTrue(writtenHtml.includes('Contenuto citato vivo'));
        } finally {
            window.open = prevOpen;
            AppState.databases = prevDbs;
            AppState.notes = prevNotes;
        }
    });

});