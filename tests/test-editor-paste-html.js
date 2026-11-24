/**
 * tests/test-editor-paste-html.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: js/editor-paste-html.js
 */

describe("EditorPasteHTML: Sanificazione Rich Text e Inserimento DOM (test-editor-paste-html.js)", () => {

    test("_sanitizePastedHTML: rimuove commenti condizionali Office, tag proprietari e nodi eseguibili", async () => {
        const dirty = `
            <!--[if gte vml 1]><v:shape></v:shape><![endif]-->
            <o:p></o:p><w:sdt></w:sdt>
            <style>.x{color:red;}</style>
            <script>alert(1)</script>
            <p>Contenuto pulito</p>
        `;
        const res = await Editor._sanitizePastedHTML(dirty, "Contenuto pulito", [], "");

        Assert.isFalse(res.includes("<o:p>"));
        Assert.isFalse(res.includes("<w:sdt>"));
        Assert.isFalse(res.includes("<script>"));
        Assert.isFalse(res.includes("<style>"));
        Assert.isTrue(res.includes("<p>Contenuto pulito</p>"));
    });

    test("_sanitizePastedHTML: converte stili inline Word/Docs in b, i, u, s preservando classi VanillaDesk", async () => {
        const html = `
            <p>
                <span style="font-weight:700;">Bold</span>
                <span style="font-style:italic;">Italic</span>
                <span style="text-decoration:underline line-through;">Both</span>
                <span class="tx-c7 hl-c5" style="font-weight:bold;">Styled</span>
            </p>
        `;
        const res = await Editor._sanitizePastedHTML(html, "Bold Italic Both Styled", [], "");

        Assert.isTrue(res.includes("<b>Bold</b>"));
        Assert.isTrue(res.includes("<i>Italic</i>"));
        Assert.isTrue(res.includes("<u><s>Both</s></u>") || res.includes("<s><u>Both</u></s>"));
        Assert.isTrue(res.includes('class="tx-c7 hl-c5"'));
    });

    test("_sanitizePastedHTML: incapsula <li> orfani in <ul> e srotola <p> singolo dentro <li>", async () => {
        const html = `<li><p>Elemento A</p></li><li><p>Elemento B</p></li>`;
        const res = await Editor._sanitizePastedHTML(html, "Elemento A\nElemento B", [], "");

        Assert.isTrue(res.includes("<ul>"));
        Assert.isTrue(res.includes("<li>Elemento A</li>"));
        Assert.isFalse(res.includes("<li><p>"));
    });

    test("_sanitizePastedHTML: incapsula tabelle esterne in simple-table-wrapper e conserva text-align", async () => {
        const html = `<table border="1" bgcolor="#fff"><tr><td style="text-align:center; color:red;">Cella</td></tr></table>`;
        const res = await Editor._sanitizePastedHTML(html, "Cella", [], "");

        Assert.isTrue(res.includes('class="adv-widget-shell simple-table-wrapper"'));
        Assert.isTrue(res.includes('data-widget-type="simple-table"'));
        Assert.isTrue(res.includes('text-align: center;'));
        Assert.isFalse(res.includes('bgcolor='));
    });

    test("_sanitizePastedHTML: ri-genera ID e clona stato per widget database incollati", async () => {
        const prevDbs = AppState.databases;
        try {
            AppState.databases = {
                'adv_tbl_orig': { title: 'Clienti', columns: [], rows: [] }
            };
            const html = `<div id="adv_tbl_orig" class="adv-widget-shell adv-table-wrapper" data-widget-type="database"></div>`;
            const res = await Editor._sanitizePastedHTML(html, "", [], "");

            Assert.isFalse(res.includes('id="adv_tbl_orig"'));
            const clonedKey = Object.keys(AppState.databases).find(k => k !== 'adv_tbl_orig' && k.startsWith('adv_tbl_'));
            Assert.isNotNull(clonedKey);
            Assert.strictEqual(AppState.databases[clonedKey].title, "Clienti (Copia)");
        } finally {
            AppState.databases = prevDbs;
        }
    });

    test("_sanitizePastedHTML: riutilizza immagine interna con data-image-ref già presente in Editor.imageCache", async () => {
        const prevCache = { ...Editor.imageCache };
        try {
            Editor.imageCache['img_cached_1.webp'] = 'blob:http://localhost/cached1';
            const html = `<p><img data-image-ref="img_cached_1.webp" src="blob:http://localhost/old" class="broken-image"></p>`;
            const res = await Editor._sanitizePastedHTML(html, "", [], "");

            Assert.isTrue(res.includes('data-image-ref="img_cached_1.webp"'));
            Assert.isTrue(res.includes('src="blob:http://localhost/cached1"'));
            Assert.isFalse(res.includes('broken-image'));
        } finally {
            Editor.imageCache = prevCache;
        }
    });

    test("_sanitizePastedHTML: preserva spazi iniziali e finali su incolla inline senza blocchi", async () => {
        const html = `<span> testo </span>`;
        const res = await Editor._sanitizePastedHTML(html, " testo ", [], "");
        Assert.strictEqual(res, " testo ");
    });

    test("_insertCleanedHTML: fonde singolo blocco dentro .checklist-text senza rompere la checklist", () => {
        const editor = document.getElementById('noteContent');
        const prevHtml = editor.innerHTML;
        try {
            editor.innerHTML = `<ul class="adv-checklist"><li class="adv-checklist-item"><input type="checkbox" class="adv-checklist-cb"><span class="checklist-text">Task <span id="paste-anchor-chk" style="display:none"></span></span></li></ul>`;
            const marker = document.getElementById('paste-anchor-chk');
            const sel = window.getSelection();

            Editor._insertCleanedHTML('<p><b>urgente</b></p>', sel, editor, marker);

            const span = editor.querySelector('.checklist-text');
            Assert.strictEqual(span.textContent, "Task urgente");
            Assert.isNotNull(span.querySelector('b'));
            Assert.strictEqual(editor.querySelectorAll('li.adv-checklist-item').length, 1);
        } finally {
            clearTimeout(Store.debounceTimer);
            Store.isDirty = false;
            window.getSelection().removeAllRanges();
            editor.innerHTML = prevHtml;
        }
    });

    test("_insertCleanedHTML: sostituisce blocco ospite vuoto senza lasciare paragrafi superflui", () => {
        const editor = document.getElementById('noteContent');
        const prevHtml = editor.innerHTML;
        try {
            editor.innerHTML = `<p><span id="paste-anchor-empty" style="display:none"></span><br></p>`;
            const marker = document.getElementById('paste-anchor-empty');
            const sel = window.getSelection();

            Editor._insertCleanedHTML('<p>Riga 1</p><p>Riga 2</p>', sel, editor, marker);

            const ps = editor.querySelectorAll('p');
            Assert.strictEqual(ps.length, 2);
            Assert.strictEqual(ps[0].textContent, "Riga 1");
            Assert.strictEqual(ps[1].textContent, "Riga 2");
        } finally {
            clearTimeout(Store.debounceTimer);
            Store.isDirty = false;
            window.getSelection().removeAllRanges();
            editor.innerHTML = prevHtml;
        }
    });

    test("_insertCleanedHTML: normalizza elementi inline orfani sotto noteContent avvolgendoli in <p>", () => {
        const editor = document.getElementById('noteContent');
        const prevHtml = editor.innerHTML;
        try {
            editor.innerHTML = `<span id="paste-anchor-root" style="display:none"></span>`;
            const marker = document.getElementById('paste-anchor-root');
            const sel = window.getSelection();

            Editor._insertCleanedHTML('<a href="https://example.com">Link</a>', sel, editor, marker);

            Assert.isNull(editor.querySelector(':scope > a'));
            Assert.isNotNull(editor.querySelector('p > a'));
        } finally {
            clearTimeout(Store.debounceTimer);
            Store.isDirty = false;
            window.getSelection().removeAllRanges();
            editor.innerHTML = prevHtml;
        }
    });

});