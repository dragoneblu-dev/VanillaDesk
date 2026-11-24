/**
 * tests/test-export-markdown-import.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: js/export-markdown-import.js
 */

describe("ExportMarkdownImport: YAML Frontmatter, Tag, Proprietà e Parser MD->HTML (test-export-markdown-import.js)", () => {

    test("getNoteTags & saveNoteTagsToSystemDB: salvano, puliscono e deduplicano i tag in SYS_PROPERTIES_DB", () => {
        const prevDbs = AppState.databases;
        try {
            AppState.databases = {};
            Assert.strictEqual(ExportManager.getNoteTags('n_missing').length, 0);

            ExportManager.saveNoteTagsToSystemDB('n_tag_1', ['#alpha', ' - beta ', '"gamma"', 'alpha', ''], false);
            const tags = ExportManager.getNoteTags('n_tag_1');

            Assert.strictEqual(tags.length, 3);
            Assert.isTrue(tags.includes('alpha'));
            Assert.isTrue(tags.includes('beta'));
            Assert.isTrue(tags.includes('gamma'));

            const opts = AppState.databases['SYS_PROPERTIES_DB'].selectOptions['sys_c_tags'];
            Assert.isTrue(opts.includes('alpha') && opts.includes('beta') && opts.includes('gamma'));
        } finally {
            AppState.databases = prevDbs;
        }
    });

    test("parseYamlFrontmatter: gestisce scalari, apici, commenti, array inline con virgole/wikilink e liste multilinea", () => {
        const yaml = `
# Commento ignorato
title: "Titolo: con due punti"
status: 'In Corso'
items: [uno, "due, con virgola", "[[Nota|Alias, Test]]"]
aliases:
  - "Primo Alias"
  - Secondo Alias
count: 42
        `;

        const parsed = ExportManager.parseYamlFrontmatter(yaml);

        Assert.strictEqual(parsed.title, 'Titolo: con due punti');
        Assert.strictEqual(parsed.status, 'In Corso');
        Assert.strictEqual(parsed.count, '42');
        Assert.isTrue(Array.isArray(parsed.items) && parsed.items.length === 3);
        Assert.strictEqual(parsed.items[1], 'due, con virgola');
        Assert.strictEqual(parsed.items[2], '[[Nota|Alias, Test]]');
        Assert.isTrue(Array.isArray(parsed.aliases) && parsed.aliases.length === 2);
        Assert.strictEqual(parsed.aliases[0], 'Primo Alias');
        Assert.strictEqual(parsed.aliases[1], 'Secondo Alias');
    });

    test("saveNotePropertiesToSystemDB: inferisce i tipi colonna (checkbox, number, date, datetime, multi-select, note_link, text)", () => {
        const prevDbs = AppState.databases;
        const prevNotes = [...AppState.notes];

        try {
            AppState.databases = {};
            AppState.notes = [
                { id: 'n_target_link', title: 'Città Vecchia' }
            ];

            const noteMap = new Map([['città vecchia', 'n_target_link']]);

            ExportManager.saveNotePropertiesToSystemDB('n_prop_1', {
                id: 'ignorato',
                sys_c_note: 'ignorato',
                tags: ['t1', 't2'],
                active: 'true',
                score: '12.5',
                due: '2026-08-15',
                meeting: '2026-08-15T14:30',
                labels: ['A', 'B'],
                place: '[[Città Vecchia#Piazza|La Piazza]]',
                author: 'Mario'
            }, noteMap, false);

            const propsDb = AppState.databases['SYS_PROPERTIES_DB'];
            const row = propsDb.rows.find(r => r.cells['sys_c_note'] === 'n_prop_1');
            Assert.isTrue(row !== undefined);
            Assert.strictEqual(row.cells['sys_c_tags'].join(','), 't1,t2');

            const getCol = (name) => propsDb.columns.find(c => c.name === name);
            Assert.strictEqual(getCol('active').type, 'checkbox');
            Assert.strictEqual(row.cells[getCol('active').id], true);

            Assert.strictEqual(getCol('score').type, 'number');
            Assert.strictEqual(row.cells[getCol('score').id], 12.5);

            Assert.strictEqual(getCol('due').type, 'date');
            Assert.strictEqual(row.cells[getCol('due').id], '2026-08-15');

            Assert.strictEqual(getCol('meeting').type, 'datetime');
            Assert.strictEqual(row.cells[getCol('meeting').id], '2026-08-15T14:30');

            Assert.strictEqual(getCol('labels').type, 'multi-select');
            Assert.strictEqual(row.cells[getCol('labels').id].join(','), 'A,B');

            Assert.strictEqual(getCol('place').type, 'note_link');
            Assert.strictEqual(row.cells[getCol('place').id].noteId, 'n_target_link');
            Assert.strictEqual(row.cells[getCol('place').id].anchor, 'Piazza');
            Assert.strictEqual(row.cells[getCol('place').id].title, 'La Piazza');

            Assert.strictEqual(getCol('author').type, 'text');
            Assert.strictEqual(row.cells[getCol('author').id], 'Mario');
        } finally {
            AppState.databases = prevDbs;
            AppState.notes = prevNotes;
        }
    });

    test("extractTagsFromMarkdown: unisce tag YAML e hashtag inline escludendo codice e colori hex", () => {
        const md = `---
tags:
  - yaml_tag
---
Testo con #progetto e #fase/1 e colore #ff00aa e #abc.
\`#non_tag_inline\`
\`\`\`js
const c = "#non_tag_block";
\`\`\`
`;
        const tags = ExportManager.extractTagsFromMarkdown(md);
        Assert.isTrue(tags.includes('yaml_tag'));
        Assert.isTrue(tags.includes('progetto'));
        Assert.isTrue(tags.includes('fase/1'));
        Assert.isFalse(tags.includes('ff00aa'));
        Assert.isFalse(tags.includes('abc'));
        Assert.isFalse(tags.includes('non_tag_inline'));
        Assert.isFalse(tags.includes('non_tag_block'));
    });

    test("parseMarkdownToHTML: protegge URL/tag HTML da underscore, converte ==, %%, callout e liste annidate", () => {
        const md = [
            'Variabile snake_case_var e `code_var_name`',
            '![Foto](assets/img_123_abc.png)',
            '<audio controls data-audio-ref="aud_123_abc.mp3"></audio>',
            '[Link](https://example.com/path_with_underscores)',
            '==Evidenziato== e %%Appunto nascosto%%',
            '> [!WARNING] Attenzione',
            '> Riga uno',
            '- Padre',
            '  - [x] Figlio check'
        ].join('\n\n');

        const html = ExportManager.parseMarkdownToHTML(md);

        Assert.isTrue(html.includes('snake_case_var'));
        Assert.isFalse(html.includes('snake<i>case</i>var'));
        Assert.isTrue(html.includes('<code>code_var_name</code>'));
        Assert.isTrue(html.includes('<img src="assets/img_123_abc.png" alt="Foto">'));
        Assert.isTrue(html.includes('data-audio-ref="aud_123_abc.mp3"'));
        Assert.isTrue(html.includes('href="https://example.com/path_with_underscores"'));
        Assert.isTrue(html.includes('<span class="hl-c5">Evidenziato</span>'));
        Assert.isTrue(html.includes('inline-note-wrapper') && html.includes('Appunto nascosto'));
        Assert.isTrue(html.includes('<blockquote>') && html.includes('<b>[WARNING] Attenzione</b>'));
        Assert.isTrue(html.includes('class="adv-checklist"') && html.includes('Figlio check'));
    });

    test("processMarkdownImport: crea la nota, rimuove frontmatter, salva proprietà/tag e invoca UI/Store", () => {
        const prevNotes = [...AppState.notes];
        const prevDbs = AppState.databases;
        const prevCurId = AppState.currentNoteId;
        const prevRenderTree = UI.renderTree;
        const prevSelectNote = UI.selectNote;
        const prevShowToast = UI.showToast;
        const prevTriggerSave = Store.triggerAutoSave;

        let selectedId = null;
        let toastType = null;
        let saveImmediate = null;

        try {
            AppState.notes = [];
            AppState.databases = {};
            AppState.currentNoteId = 'parent_1';
            UI.renderTree = () => {};
            UI.selectNote = (id) => { selectedId = id; };
            UI.showToast = (msg, type) => { toastType = type; };
            Store.triggerAutoSave = (imm) => { saveImmediate = imm; };

            const md = `---\npriority: Alta\ntags: [importato]\n---\n# Titolo Interno\nCorpo #extra`;
            ExportManager.processMarkdownImport(md, 'Nota Importata Test');

            Assert.strictEqual(AppState.notes.length, 1);
            const created = AppState.notes[0];
            Assert.strictEqual(created.parentId, 'parent_1');
            Assert.strictEqual(created.title, 'Nota Importata Test');
            Assert.isFalse(created.content.includes('priority: Alta'));
            Assert.isTrue(created.content.includes('<h1>Titolo Interno</h1>'));
            Assert.strictEqual(selectedId, created.id);
            Assert.strictEqual(toastType, 'success');
            Assert.strictEqual(saveImmediate, true);

            const tags = ExportManager.getNoteTags(created.id);
            Assert.isTrue(tags.includes('importato') && tags.includes('extra'));
        } finally {
            AppState.notes = prevNotes;
            AppState.databases = prevDbs;
            AppState.currentNoteId = prevCurId;
            UI.renderTree = prevRenderTree;
            UI.selectNote = prevSelectNote;
            UI.showToast = prevShowToast;
            Store.triggerAutoSave = prevTriggerSave;
        }
    });

});