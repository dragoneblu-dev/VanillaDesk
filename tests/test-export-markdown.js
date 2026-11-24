/**
 * tests/test-export-markdown.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: js/export-markdown.js
 */

describe("ExportMarkdown: Frontmatter YAML, MD Translation & Obsidian Vault (test-export-markdown.js)", () => {

    test("_getCellAlignment, _getTableColumnAlignments & _tableToMarkdown: preservano allineamenti e pipe escape", () => {
        const tbl = document.createElement('table');
        tbl.innerHTML = `
            <tr>
                <th style="text-align: left;">Sinistra</th>
                <th class="text-center">Centro</th>
                <th style="text-align: right;">Destra</th>
            </tr>
            <tr>
                <td>A | B</td>
                <td>2</td>
                <td>3</td>
            </tr>
        `;

        const alignments = ExportManager._getTableColumnAlignments(tbl);
        Assert.strictEqual(alignments.join(','), 'left,center,right');

        const md = ExportManager._tableToMarkdown(tbl);
        Assert.isTrue(md.includes('| :--- | :---: | ---: |'));
        Assert.isTrue(md.includes('| A \\| B | 2 | 3 |'));
    });

    test("buildNoteFrontmatter: genera YAML completo con note_link, date range, checkbox, number, array e stringhe escaped", () => {
        const prevNotes = [...AppState.notes];
        const prevDbs = AppState.databases;

        try {
            AppState.notes = [
                {
                    id: 'n_fm_1',
                    title: 'Nota "Speciale" \\Test',
                    isMarked: true,
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-02T00:00:00Z'
                },
                {
                    id: 'n_fm_target',
                    title: 'Capitale'
                }
            ];

            AppState.databases = {
                SYS_PROPERTIES_DB: {
                    id: 'SYS_PROPERTIES_DB',
                    columns: [
                        { id: 'sys_c_note', name: 'Nota', type: 'record_note' },
                        { id: 'sys_c_tags', name: 'Tag', type: 'multi-select' },
                        { id: 'p_link', name: 'luogo', type: 'note_link' },
                        { id: 'p_chk', name: 'attivo', type: 'checkbox' },
                        { id: 'p_num', name: 'voto', type: 'number' },
                        { id: 'p_date', name: 'periodo', type: 'date', hasEndDate: true },
                        { id: 'p_arr', name: 'ruoli', type: 'multi-select' },
                        { id: 'p_txt', name: 'nota', type: 'text' }
                    ],
                    rows: [
                        {
                            id: 'sys_r_n_fm_1',
                            cells: {
                                sys_c_note: 'n_fm_1',
                                sys_c_tags: ['alpha', 'beta'],
                                p_link: { noteId: 'n_fm_target', title: '' },
                                p_chk: true,
                                p_num: 9.5,
                                p_date: { start: '2026-02-01', end: '2026-02-10' },
                                p_arr: ['Admin', 'Editor'],
                                p_txt: 'Testo "citato"'
                            }
                        }
                    ]
                }
            };

            const yamlWithTitle = ExportManager.buildNoteFrontmatter('n_fm_1', true);
            Assert.isTrue(yamlWithTitle.includes('title: "Nota \\"Speciale\\" \\\\Test"'));
            Assert.isTrue(yamlWithTitle.includes('favorite: true'));
            Assert.isTrue(yamlWithTitle.includes('  - alpha'));
            Assert.isTrue(yamlWithTitle.includes('luogo: "[[Capitale]]"'));
            Assert.isTrue(yamlWithTitle.includes('attivo: true'));
            Assert.isTrue(yamlWithTitle.includes('voto: 9.5'));
            Assert.isTrue(yamlWithTitle.includes('periodo: "2026-02-01 ➔ 2026-02-10"'));
            Assert.isTrue(yamlWithTitle.includes('  - "Admin"'));
            Assert.isTrue(yamlWithTitle.includes('nota: "Testo \\"citato\\""'));

            const yamlNoTitle = ExportManager.buildNoteFrontmatter('n_fm_1', false);
            Assert.isFalse(yamlNoTitle.includes('title:'));

            Assert.strictEqual(ExportManager.buildNoteFrontmatter('n_non_esiste', true), '');
        } finally {
            AppState.notes = prevNotes;
            AppState.databases = prevDbs;
        }
    });

    test("htmlToMarkdown: converte wikilinks, file-link, commenti Obsidian %%, callout e tutti i widget", () => {
        const prevNotes = [...AppState.notes];
        const prevDbs = AppState.databases;

        try {
            AppState.notes = [
                { id: 'n_wk_1', title: 'Target Note' }
            ];
            AppState.databases = {
                adv_code_md: { id: 'adv_code_md', title: 'Script', language: 'js', content: 'let a = 1;' },
                adv_journal_md: {
                    id: 'adv_journal_md',
                    title: 'Log Giorno',
                    entries: [{ id: 'j1', timestamp: 1, dateStr: '2026/05/01', timeStr: '10:00', content: 'Fatto', endTime: 2 }]
                },
                adv_btnbar_md: { id: 'adv_btnbar_md', buttons: [{ label: 'Avvia' }] },
                adv_tbl_md: {
                    id: 'adv_tbl_md',
                    title: 'Tabella DB',
                    columns: [{ id: 'c1', name: 'Voce', type: 'text' }, { id: 'c2', name: 'Num', type: 'number' }],
                    rows: [{ id: 'r1', cells: { c1: 'Item', c2: 42 } }]
                }
            };

            const html = `
                <p>Link <a href="#" class="internal-link" data-note-id="n_wk_1" data-anchor="Cap1">Alias</a> e <a href="#" class="file-link" data-file-path="docs/a.txt">📄 a.txt</a></p>
                <p>Tag <span class="tag-hash">#obsidian</span> e <span class="inline-note-wrapper"><span class="inline-note-data">Segreto</span></span></p>
                <blockquote><p><b>[WARNING] Titolo</b></p><p>Riga 1</p><p>Riga 2</p></blockquote>
                <div id="adv_code_md" class="adv-widget-shell code-wrapper" data-widget-type="code"></div>
                <div id="adv_journal_md" class="adv-widget-shell adv-journal-wrapper" data-widget-type="journal"></div>
                <div id="adv_btnbar_md" class="adv-widget-shell adv-action-button-wrapper" data-widget-type="buttonbar"></div>
                <div id="adv_tbl_md" class="adv-widget-shell adv-table-wrapper" data-widget-type="database"></div>
            `;

            const md = ExportManager.htmlToMarkdown(html, true, true);

            Assert.isTrue(md.includes('[[Target Note#Cap1|Alias]]'));
            Assert.isTrue(md.includes('[a.txt](docs/a.txt)'));
            Assert.isTrue(md.includes('#obsidian'));
            Assert.isTrue(md.includes('%% Segreto %%'));
            Assert.isTrue(md.includes('> [!WARNING] Titolo\n> Riga 1\n>\n> Riga 2'));
            Assert.isTrue(md.includes('**Script**\n```js\nlet a = 1;\n```'));
            Assert.isTrue(md.includes('- [x] `10:00` Fatto'));
            Assert.isTrue(md.includes('[Avvia]'));
            Assert.isTrue(md.includes('| Voce | Num |'));
            Assert.isTrue(md.includes('| :--- | ---: |'));
            Assert.isTrue(md.includes('| Item | 42 |'));
        } finally {
            AppState.notes = prevNotes;
            AppState.databases = prevDbs;
        }
    });

    test("generateMarkdownDocument: gestisce esportazione singola (con frontmatter) e multipla (con TOC e tag)", async () => {
        const prevCreateObjUrl = URL.createObjectURL;
        const prevRevokeObjUrl = URL.revokeObjectURL;
        const prevNotes = [...AppState.notes];
        const prevDbs = AppState.databases;

        const capturedBlobs = [];
        try {
            URL.createObjectURL = (blob) => {
                capturedBlobs.push(blob);
                return 'blob:mock-md';
            };
            URL.revokeObjectURL = () => {};

            AppState.databases = {
                SYS_PROPERTIES_DB: {
                    id: 'SYS_PROPERTIES_DB',
                    columns: [{ id: 'sys_c_note', name: 'Nota', type: 'record_note' }, { id: 'sys_c_tags', name: 'Tag', type: 'multi-select' }],
                    rows: [
                        { id: 'sys_r_n_s1', cells: { sys_c_note: 'n_s1', sys_c_tags: ['guida'] } }
                    ]
                }
            };
            AppState.notes = [
                { id: 'n_s1', title: 'Nota Singola', content: '<p>Contenuto&nbsp;singolo</p>' },
                { id: 'n_s2', title: 'Sotto Nota', content: '<p>Altro testo</p>' }
            ];

            // 1. Esportazione singola
            ExportManager.generateMarkdownDocument('Nota Singola', [{ note: AppState.notes[0], level: 0 }], true);
            const singleText = await capturedBlobs[0].text();
            Assert.isTrue(singleText.includes('tags:\n  - guida'));
            Assert.isFalse(singleText.includes('title:'));
            Assert.isTrue(singleText.includes('Contenuto singolo'));

            // 2. Esportazione multipla con TOC
            ExportManager.generateMarkdownDocument('Raccolta', [
                { note: AppState.notes[0], level: 0 },
                { note: AppState.notes[1], level: 1 }
            ], false);
            const multiText = await capturedBlobs[1].text();
            Assert.isTrue(multiText.includes('# Raccolta'));
            Assert.isTrue(multiText.includes(`## ${I18n.t('export_doc.toc_title')}`));
            Assert.isTrue(multiText.includes('- [Nota Singola](#nota-singola)'));
            Assert.isTrue(multiText.includes('  - [Sotto Nota](#sotto-nota)'));
            Assert.isTrue(multiText.includes('#guida'));
            Assert.isTrue(multiText.includes('## Sotto Nota'));
        } finally {
            URL.createObjectURL = prevCreateObjUrl;
            URL.revokeObjectURL = prevRevokeObjUrl;
            AppState.notes = prevNotes;
            AppState.databases = prevDbs;
        }
    });

    test("exportObsidianVault: ricrea cartelle, omette .md per cartelle vuote e copia asset FSAA", async () => {
        const prevShowDirPicker = window.showDirectoryPicker;
        const prevNotes = [...AppState.notes];
        const prevDbs = AppState.databases;
        const prevAssetsHandle = AppState.assetsHandle;
        const prevShowToast = UI.showToast;

        const writtenFiles = new Map();
        const createdDirs = [];
        let toastSuccess = false;

        const makeMockDir = (pathPrefix) => ({
            name: pathPrefix || 'VaultOut',
            getDirectoryHandle: async (name) => {
                const full = pathPrefix ? `${pathPrefix}/${name}` : name;
                createdDirs.push(full);
                return makeMockDir(full);
            },
            getFileHandle: async (name) => {
                const full = pathPrefix ? `${pathPrefix}/${name}` : name;
                return {
                    createWritable: async () => ({
                        write: async (data) => { writtenFiles.set(full, data); },
                        close: async () => {}
                    })
                };
            }
        });

        try {
            AppState.databases = {};
            AppState.notes = [
                { id: 'n_folder_empty', parentId: null, title: 'CartellaVuota', content: '<p><br></p>' },
                { id: 'n_child', parentId: 'n_folder_empty', title: 'NotaInterna', content: '<p>Contenuto figlio</p>' },
                { id: 'n_folder_full', parentId: null, title: 'CartellaConTesto', content: '<p>Intro cartella</p>' },
                { id: 'n_child_2', parentId: 'n_folder_full', title: 'Figlio2', content: '<p>Due</p>' }
            ];

            AppState.assetsHandle = {
                values: async function* () {
                    yield {
                        kind: 'file',
                        name: 'img_test.webp',
                        getFile: async () => new Blob(['imgdata'], { type: 'image/webp' })
                    };
                }
            };

            window.showDirectoryPicker = async () => makeMockDir('');
            UI.showToast = (msg, type) => { if (type === 'success') toastSuccess = true; };

            await ExportManager.exportObsidianVault();

            Assert.isTrue(toastSuccess);
            Assert.isTrue(createdDirs.includes('CartellaVuota'));
            Assert.isTrue(createdDirs.includes('CartellaConTesto'));
            Assert.isTrue(createdDirs.includes('assets'));

            // CartellaVuota non deve generare CartellaVuota.md ridondante; CartellaConTesto invece sì
            Assert.isFalse(writtenFiles.has('CartellaVuota.md'));
            Assert.isTrue(writtenFiles.has('CartellaVuota/NotaInterna.md'));
            Assert.isTrue(writtenFiles.has('CartellaConTesto.md'));
            Assert.isTrue(writtenFiles.has('CartellaConTesto/Figlio2.md'));
            Assert.isTrue(writtenFiles.has('assets/img_test.webp'));
            Assert.isTrue(writtenFiles.get('CartellaVuota/NotaInterna.md').includes('Contenuto figlio'));
        } finally {
            window.showDirectoryPicker = prevShowDirPicker;
            AppState.notes = prevNotes;
            AppState.databases = prevDbs;
            AppState.assetsHandle = prevAssetsHandle;
            UI.showToast = prevShowToast;
        }
    });

});