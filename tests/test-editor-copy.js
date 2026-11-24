/**
 * tests/test-editor-copy.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: js/editor-copy.js
 */

describe("EditorCopy: Copia & Taglio (test-editor-copy.js)", () => {

    const ensureCopyInit = () => {
        if (!Editor._copyInterceptorReadyForTest) {
            Editor.initCopyInterceptor();
            Editor._copyInterceptorReadyForTest = true;
        }
    };

    const dispatchClipboardEvent = (type) => {
        const data = {};
        let prevented = false;
        const ev = new Event(type, { bubbles: true, cancelable: true });
        ev.preventDefault = () => { prevented = true; };
        Object.defineProperty(ev, 'clipboardData', {
            value: {
                setData: (k, v) => { data[k] = v; },
                getData: (k) => data[k] || ''
            }
        });
        document.dispatchEvent(ev);
        return { data, prevented };
    };

    test("Copy: ricostruisce gli stili antenati (b, i, span classi VanillaDesk, link) per selezioni parziali", () => {
        ensureCopyInit();
        const editor = document.getElementById('noteContent');
        const prevHtml = editor.innerHTML;
        try {
            editor.innerHTML = `<p><span class="tx-c6 hl-c5"><b>Testo parziale selezionato</b></span></p>`;
            const textNode = editor.querySelector('b').firstChild;

            const sel = window.getSelection();
            const range = document.createRange();
            range.setStart(textNode, 6);
            range.setEnd(textNode, 14); // "parziale"
            sel.removeAllRanges();
            sel.addRange(range);

            const { data, prevented } = dispatchClipboardEvent('copy');

            Assert.isTrue(prevented);
            Assert.strictEqual(data['text/plain'], "parziale");
            Assert.isTrue(data['text/html'].includes('<b>parziale</b>'));
            Assert.isTrue(data['text/html'].includes('tx-c6'));
            Assert.isTrue(data['text/html'].includes('hl-c5'));
        } finally {
            window.getSelection().removeAllRanges();
            editor.innerHTML = prevHtml;
        }
    });

    test("Copy: esporta paragrafi multipli con riga vuota intermedia senza duplicazioni", () => {
        ensureCopyInit();
        const editor = document.getElementById('noteContent');
        const prevHtml = editor.innerHTML;
        try {
            editor.innerHTML = `<p>Riga A</p><p><br></p><p>Riga B</p>`;
            const sel = window.getSelection();
            const range = document.createRange();
            range.setStart(editor.children[0].firstChild, 0);
            range.setEnd(editor.children[2].firstChild, 6);
            sel.removeAllRanges();
            sel.addRange(range);

            const { data } = dispatchClipboardEvent('copy');

            Assert.strictEqual(data['text/plain'], "Riga A\n\nRiga B");
        } finally {
            window.getSelection().removeAllRanges();
            editor.innerHTML = prevHtml;
        }
    });

    test("Copy: serializza tabelle come TSV su text/plain e rimuove maniglie UI da text/html", () => {
        ensureCopyInit();
        const editor = document.getElementById('noteContent');
        const prevHtml = editor.innerHTML;
        try {
            editor.innerHTML = `
                <div class="simple-table-wrapper">
                    <table>
                        <tbody>
                            <tr><th>Col1<span class="adv-col-resizer"></span></th><th>Col2</th></tr>
                            <tr><td class="adv-cell-selected">Val1</td><td>Val2</td></tr>
                        </tbody>
                    </table>
                </div>
            `;
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor.querySelector('table'));
            sel.removeAllRanges();
            sel.addRange(range);

            const { data } = dispatchClipboardEvent('copy');

            Assert.strictEqual(data['text/plain'].trim(), "Col1\tCol2\nVal1\tVal2");
            Assert.isFalse(data['text/html'].includes('adv-col-resizer'));
            Assert.isFalse(data['text/html'].includes('adv-cell-selected'));
        } finally {
            window.getSelection().removeAllRanges();
            editor.innerHTML = prevHtml;
        }
    });

    test("Copy: formatta checklist, elenchi puntati e numerati con start personalizzato in text/plain", () => {
        ensureCopyInit();
        const editor = document.getElementById('noteContent');
        const prevHtml = editor.innerHTML;
        try {
            editor.innerHTML = `
                <ul class="adv-checklist">
                    <li class="adv-checklist-item"><input type="checkbox" class="adv-checklist-cb" checked><span class="checklist-text">Fatto</span></li>
                    <li class="adv-checklist-item"><input type="checkbox" class="adv-checklist-cb"><span class="checklist-text">Da fare</span></li>
                </ul>
                <ol start="5"><li>Quinto</li><li>Sesto</li></ol>
            `;
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            sel.removeAllRanges();
            sel.addRange(range);

            const { data } = dispatchClipboardEvent('copy');

            Assert.isTrue(data['text/plain'].includes("[x] Fatto"));
            Assert.isTrue(data['text/plain'].includes("[ ] Da fare"));
            Assert.isTrue(data['text/plain'].includes("5. Quinto"));
            Assert.isTrue(data['text/plain'].includes("6. Sesto"));
        } finally {
            window.getSelection().removeAllRanges();
            editor.innerHTML = prevHtml;
        }
    });

    test("Copy & Cut: dentro blocco codice estrae solo text/plain pulito e rimuove porzione tagliata", () => {
        ensureCopyInit();
        const editor = document.getElementById('noteContent');
        const prevHtml = editor.innerHTML;
        const prevEditMode = AppState.isEditMode;
        const prevDbs = AppState.databases;
        try {
            AppState.isEditMode = true;
            AppState.databases = AppState.databases || {};
            AppState.databases['adv_code_copy_test'] = { title: 'Codice', language: 'none', content: 'alpha\nbeta' };

            editor.innerHTML = `
                <div id="adv_code_copy_test" class="code-wrapper widget-type-code adv-widget-shell" data-widget-type="code" contenteditable="false">
                    <pre class="code-content" contenteditable="true" data-language="none">alpha<br>beta<br></pre>
                </div>
            `;
            const pre = editor.querySelector('pre.code-content');
            const sel = window.getSelection();
            const range = document.createRange();
            range.setStart(pre.firstChild, 0);
            range.setEnd(pre.childNodes[2], 4); // "alpha\nbeta"
            sel.removeAllRanges();
            sel.addRange(range);

            const copyRes = dispatchClipboardEvent('copy');
            Assert.isTrue(copyRes.prevented);
            Assert.strictEqual(copyRes.data['text/plain'], "alpha\nbeta");
            Assert.strictEqual(copyRes.data['text/html'], undefined);

            // Taglia solo "alpha"
            const cutRange = document.createRange();
            cutRange.setStart(pre.firstChild, 0);
            cutRange.setEnd(pre.firstChild, 5);
            sel.removeAllRanges();
            sel.addRange(cutRange);

            const cutRes = dispatchClipboardEvent('cut');
            Assert.isTrue(cutRes.prevented);
            Assert.strictEqual(cutRes.data['text/plain'], "alpha");
            Assert.strictEqual(AppState.databases['adv_code_copy_test'].content, "\nbeta");
        } finally {
            clearTimeout(Store.debounceTimer);
            Store.isDirty = false;
            window.getSelection().removeAllRanges();
            AppState.isEditMode = prevEditMode;
            AppState.databases = prevDbs;
            editor.innerHTML = prevHtml;
        }
    });

    test("Copy & Cut: immagine selezionata tramite ImageManager.activeImage preserva data-image-ref e rimuove su taglio", () => {
        ensureCopyInit();
        const editor = document.getElementById('noteContent');
        const prevHtml = editor.innerHTML;
        const prevEditMode = AppState.isEditMode;
        const prevActiveImg = typeof ImageManager !== 'undefined' ? ImageManager.activeImage : null;
        try {
            AppState.isEditMode = true;
            editor.innerHTML = `<p><img src="blob:test" data-image-ref="img_copy_1.webp" class="broken-image"></p>`;
            const img = editor.querySelector('img');
            window.getSelection().removeAllRanges();
            ImageManager.activeImage = img;

            const copyRes = dispatchClipboardEvent('copy');
            Assert.isTrue(copyRes.prevented);
            Assert.isTrue(copyRes.data['text/html'].includes('data-image-ref="img_copy_1.webp"'));
            Assert.isFalse(copyRes.data['text/html'].includes('broken-image'));

            const cutRes = dispatchClipboardEvent('cut');
            Assert.isTrue(cutRes.prevented);
            Assert.isNull(editor.querySelector('img'));
        } finally {
            clearTimeout(Store.debounceTimer);
            Store.isDirty = false;
            ImageManager.activeImage = prevActiveImg;
            AppState.isEditMode = prevEditMode;
            editor.innerHTML = prevHtml;
        }
    });

    test("Copy: normalizza tag <input> in <span> leggibili nel frammento copiato", () => {
        ensureCopyInit();
        const editor = document.getElementById('noteContent');
        const prevHtml = editor.innerHTML;
        try {
            editor.innerHTML = `<div><input type="checkbox" checked><input type="text" data-raw-value="42"></div>`;
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor.firstElementChild);
            sel.removeAllRanges();
            sel.addRange(range);

            const { data } = dispatchClipboardEvent('copy');

            Assert.isFalse(data['text/html'].includes('<input'));
            Assert.isTrue(data['text/html'].includes('<span>Sì</span>'));
            Assert.isTrue(data['text/html'].includes('<span>42</span>'));
        } finally {
            window.getSelection().removeAllRanges();
            editor.innerHTML = prevHtml;
        }
    });

});