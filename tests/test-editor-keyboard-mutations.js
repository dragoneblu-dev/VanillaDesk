/**
 * tests/test-editor-keyboard-mutations.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-keyboard-mutations
 * Conteggio test case: 20
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("Editor Keyboard Mutations: Backspace, Delete & Bulk Deletion (20 Test)", () => {

    test("Editor.safeDeleteWidget: cancellazione widget database elimina lo stato da AppState", () => {
            const dummy = document.createElement('div');
            dummy.id = 'adv_tbl_safe_del';
            dummy.setAttribute('data-widget-type', 'database');
            document.body.appendChild(dummy);

            AppState.databases['adv_tbl_safe_del'] = { title: 'Da Eliminare', columns: [], rows: [] };

            const origConfirm = window.confirm;
            window.confirm = () => true;
            try {
                Editor.safeDeleteWidget(dummy);
                Assert.strictEqual(AppState.databases['adv_tbl_safe_del'], undefined);
                Assert.isFalse(document.body.contains(dummy));
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("Editor.safeDeleteWidget: cancellazione widget code elimina lo stato", () => {
            const dummy = document.createElement('div');
            dummy.id = 'adv_code_safe_del';
            dummy.setAttribute('data-widget-type', 'code');
            document.body.appendChild(dummy);

            AppState.databases['adv_code_safe_del'] = { title: 'Codice', content: 'test' };

            Editor.safeDeleteWidget(dummy);
            Assert.strictEqual(AppState.databases['adv_code_safe_del'], undefined);
            Assert.isFalse(document.body.contains(dummy));
        });

    test("Editor.safeDeleteWidget: cancellazione widget buttonbar elimina lo stato", () => {
            const dummy = document.createElement('div');
            dummy.id = 'adv_btnbar_safe_del';
            dummy.setAttribute('data-widget-type', 'buttonbar');
            document.body.appendChild(dummy);

            AppState.databases['adv_btnbar_safe_del'] = { buttons: [] };

            Editor.safeDeleteWidget(dummy);
            Assert.strictEqual(AppState.databases['adv_btnbar_safe_del'], undefined);
            Assert.isFalse(document.body.contains(dummy));
        });

    test("Editor.safeDeleteWidget: cancellazione widget columns esegue destroyAndUnwrap", () => {
            const dummy = document.createElement('div');
            dummy.id = 'adv_cols_safe_del';
            dummy.setAttribute('data-widget-type', 'columns');
            dummy.innerHTML = `<div class="adv-columns-container-wrap"><div class="col-box">Contenuto Unico</div></div>`;
            document.body.appendChild(dummy);

            AppState.databases['adv_cols_safe_del'] = { columns: 1, mode: 'independent', contents: [] };

            Editor.safeDeleteWidget(dummy);
            Assert.strictEqual(AppState.databases['adv_cols_safe_del'], undefined);
            Assert.isTrue(document.body.innerHTML.includes('Contenuto Unico'));
        });

    test("Editor.safeDeleteWidget: citazione blocco richiede conferma utente", () => {
            const dummy = document.createElement('blockquote');
            dummy.className = 'block-citation';
            dummy.id = 'cit_del_confirm';
            document.body.appendChild(dummy);

            let confirmCalled = false;
            const origConfirm = window.confirm;
            window.confirm = () => { confirmCalled = true; return false; }; // Rifiuta

            try {
                Editor.safeDeleteWidget(dummy);
                Assert.isTrue(confirmCalled);
                Assert.isTrue(document.body.contains(dummy), "Il nodo non deve essere rimosso se l'utente annulla");
            } finally {
                window.confirm = origConfirm;
                dummy.remove();
            }
        });

    test("Editor.handleBulkWidgetDeletion: ritorna true se la selezione è collassata", () => {
            const sel = window.getSelection();
            sel.removeAllRanges();
            const p = document.createElement('p');
            document.body.appendChild(p);
            const r = document.createRange();
            r.setStart(p, 0);
            r.collapse(true);
            sel.addRange(r);

            const res = Editor.handleBulkWidgetDeletion();
            Assert.isTrue(res);
            p.remove();
        });

    test("Editor.handleBulkWidgetDeletion: ritorna true all'interno di aree editabili di un widget", () => {
            const cell = document.createElement('td');
            cell.className = 'widget-editable-area';
            cell.setAttribute('contenteditable', 'true');
            cell.innerHTML = 'Testo Cella';
            document.body.appendChild(cell);

            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNodeContents(cell);
            sel.addRange(r);

            const res = Editor.handleBulkWidgetDeletion();
            Assert.isTrue(res);
            cell.remove();
        });

    test("Editor.handleBulkWidgetDeletion: non blocca la cancellazione su tabelle semplici", () => {
            let editor = document.getElementById('noteContent');
            if (!editor) {
                editor = document.createElement('div');
                editor.id = 'noteContent';
                document.body.appendChild(editor);
            }
            editor.innerHTML = '<div class="adv-widget-shell simple-table-wrapper" data-widget-type="simple-table"><p>Test</p></div>';

            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNode(editor.firstElementChild);
            sel.addRange(r);

            const res = Editor.handleBulkWidgetDeletion();
            Assert.isTrue(res, "Le tabelle semplici non richiedono il blocco con conferma modale");
        });

    test("Editor.handleBulkWidgetDeletion: blocca e chiede conferma se la selezione interseca un database", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p>Inizio</p><div id="adv_tbl_intercept" class="adv-widget-shell widget-type-database" data-widget-type="database"></div><p>Fine</p>';

            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(editor.querySelector('p'), 0);
            r.setEnd(editor.lastElementChild, 0);
            sel.addRange(r);

            let confirmCalled = false;
            const origConfirm = window.confirm;
            window.confirm = () => { confirmCalled = true; return false; }; // Rifiuta

            try {
                const res = Editor.handleBulkWidgetDeletion();
                Assert.isTrue(confirmCalled);
                Assert.isFalse(res, "Se l'utente rifiuta, la funzione deve ritornare false impedendo la cancellazione");
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("Editor.handleBulkWidgetDeletion: salvaguarda SYS_PROPERTIES_DB se il widget viene cancellato", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<div id="SYS_PROPERTIES_DB" class="adv-widget-shell widget-type-database" data-widget-type="database"></div>';

            AppState.databases['SYS_PROPERTIES_DB'] = { id: 'SYS_PROPERTIES_DB', title: 'Proprieta Sistema' };

            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNode(editor.firstElementChild);
            sel.addRange(r);

            const origConfirm = window.confirm;
            window.confirm = () => true;

            try {
                Editor.handleBulkWidgetDeletion();
                Assert.isNotNull(AppState.databases['SYS_PROPERTIES_DB'], "SYS_PROPERTIES_DB non deve mai essere rimosso dalla RAM");
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("Editor.handleEnterKey: su cella di tabella semplice inserisce line break pulito", () => {
            const cell = document.createElement('td');
            const wrap = document.createElement('div');
            wrap.className = 'simple-table-wrapper';
            wrap.appendChild(cell);
            document.body.appendChild(wrap);

            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(cell, 0);
            r.collapse(true);
            sel.addRange(r);

            let execCalled = false;
            const origExec = document.execCommand;
            document.execCommand = (cmd) => { if (cmd === 'insertLineBreak') execCalled = true; };

            try {
                const ev = { shiftKey: false, preventDefault: () => {} };
                AppState.isEditMode = true;
                Editor.handleEnterKey(ev);
                Assert.isTrue(execCalled);
            } finally {
                document.execCommand = origExec;
                wrap.remove();
            }
        });

    test("Editor.handleEnterKey: in blocco pre.code-content preserva l'indentazione della riga", () => {
            const pre = document.createElement('pre');
            pre.className = 'code-content';
            pre.textContent = '    let x = 10;'; // 4 spazi iniziali
            document.body.appendChild(pre);

            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(pre.firstChild, pre.textContent.length);
            r.collapse(true);
            sel.addRange(r);

            const ev = { shiftKey: false, preventDefault: () => {} };
            Editor.handleEnterKey(ev);

            // Verifica attraverso il rawText del motore dell'editor che l'indentazione sia preservata
            const raw = Editor._getRawText(pre);
            Assert.isTrue(raw.includes('\n    '));
            pre.remove();
        });

    test("Editor.handleEnterKey: su checklist to-do non vuota crea nuova riga di checklist", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = `
                <ul class="adv-checklist">
                    <li class="adv-checklist-item">
                        <input type="checkbox" class="adv-checklist-cb">
                        <span class="checklist-text">Attività esistente</span>
                    </li>
                </ul>
            `;

            const span = editor.querySelector('.checklist-text');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(span.firstChild, span.textContent.length);
            r.collapse(true);
            sel.addRange(r);

            const ev = { shiftKey: false, preventDefault: () => {} };
            Editor.handleEnterKey(ev);

            const items = editor.querySelectorAll('.adv-checklist-item');
            Assert.strictEqual(items.length, 2);
        });

    test("Editor.handleEnterKey: su checklist to-do vuota rimuove la riga ed esce dalla lista con paragrafo", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = `
                <ul class="adv-checklist">
                    <li class="adv-checklist-item">
                        <input type="checkbox" class="adv-checklist-cb">
                        <span class="checklist-text"></span>
                    </li>
                </ul>
            `;

            const span = editor.querySelector('.checklist-text');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(span, 0);
            r.collapse(true);
            sel.addRange(r);

            const ev = { shiftKey: false, preventDefault: () => {} };
            Editor.handleEnterKey(ev);

            Assert.isNull(editor.querySelector('.adv-checklist'));
            Assert.isNotNull(editor.querySelector('p'));
        });

    test("Editor.handleBackspaceKey: manual merge preserva elementi .adv-inline-shell evitando rotture native", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = `
                <p id="p_target">Prima riga</p>
                <p id="p_with_inline">
                    Seconda con <span class="adv-inline-shell" data-widget-type="snippet">SNIPPET</span>
                </p>
            `;

            const p2 = editor.querySelector('#p_with_inline');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(p2.firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            const ev = { preventDefault: () => {} };
            Editor.handleBackspaceKey(ev);

            const pTarget = editor.querySelector('#p_target');
            Assert.isNotNull(pTarget);
            Assert.isNotNull(pTarget.querySelector('.adv-inline-shell'), "L'inline shell deve essere travasato nel paragrafo precedente intatto");
            Assert.isNull(editor.querySelector('#p_with_inline'));
        });

    test("Editor.handleBackspaceKey: su inizio riga vuota adiacente a widget protetto rimuove la riga e sposta il cursore", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = `
                <div id="adv_tbl_wall" class="adv-widget-shell widget-type-database"></div>
                <p id="p_empty"><br></p>
            `;

            const pEmpty = editor.querySelector('#p_empty');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(pEmpty, 0);
            r.collapse(true);
            sel.addRange(r);

            const ev = { preventDefault: () => {} };
            Editor.handleBackspaceKey(ev);

            Assert.isNull(editor.querySelector('#p_empty'), "Il paragrafo vuoto deve essere rimosso");
            Assert.isNotNull(editor.querySelector('#adv_tbl_wall'), "Il database non deve essere toccato");
        });

    test("Editor.handleBackspaceKey: su inizio riga con testo contro widget seleziona il widget (.adv-widget-selected)", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = `
                <div id="adv_tbl_wall2" class="adv-widget-shell widget-type-database"></div>
                <p id="p_text">Testo non vuoto</p>
            `;

            const pText = editor.querySelector('#p_text');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(pText.firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            const ev = { preventDefault: () => {} };
            Editor.handleBackspaceKey(ev);

            const widget = editor.querySelector('#adv_tbl_wall2');
            Assert.isTrue(widget.classList.contains('adv-widget-selected'), "Il widget deve essere evidenziato come selezionato al primo backspace");
        });

    test("Editor.handleBackspaceKey: seconda pressione su widget già selezionato lo elimina", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = `
                <div id="adv_tbl_wall3" class="adv-widget-shell widget-type-database adv-widget-selected"></div>
                <p id="p_text2">Testo</p>
            `;

            const pText = editor.querySelector('#p_text2');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(pText.firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            const origConfirm = window.confirm;
            window.confirm = () => true;

            try {
                const ev = { preventDefault: () => {} };
                Editor.handleBackspaceKey(ev);
                Assert.isNull(editor.querySelector('#adv_tbl_wall3'), "Al secondo colpo il widget deve essere eliminato");
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("Editor.handleDeleteKey: a fine riga davanti a blocco con inline shell esegue manual merge", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = `
                <p id="p1_del">Riga superiore</p>
                <p id="p2_del"><span class="adv-inline-shell" data-widget-type="snippet">SNIP</span> Coda</p>
            `;

            const p1 = editor.querySelector('#p1_del');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(p1.firstChild, p1.textContent.length);
            r.collapse(true);
            sel.addRange(r);

            const ev = { preventDefault: () => {} };
            Editor.handleDeleteKey(ev);

            Assert.isNull(editor.querySelector('#p2_del'));
            Assert.isNotNull(p1.querySelector('.adv-inline-shell'));
        });

    test("Editor.handleDeleteKey: se il nodo successivo è un widget protetto lo seleziona (.adv-widget-selected)", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = `
                <p id="p_top_del">Testo</p>
                <div id="adv_tbl_next" class="adv-widget-shell widget-type-database"></div>
            `;

            const pTop = editor.querySelector('#p_top_del');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(pTop.firstChild, pTop.textContent.length);
            r.collapse(true);
            sel.addRange(r);

            const ev = { preventDefault: () => {} };
            Editor.handleDeleteKey(ev);

            const widget = editor.querySelector('#adv_tbl_next');
            Assert.isTrue(widget.classList.contains('adv-widget-selected'));
        });

});
