/**
 * tests/test-editor-format-lists.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-format-lists
 * Conteggio test case: 16
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("Editor Format Lists: Liste Ordinate, Start Value & Checklist To-Do (16 Test)", () => {

    test("Editor: outdentChecklistLine estrae nodo li annidato promuovendolo al livello superiore", () => {
            const mainUl = document.createElement('ul');
            mainUl.className = 'adv-checklist';
            const parentLi = document.createElement('li');
            parentLi.className = 'adv-checklist-item';

            const nestedUl = document.createElement('ul');
            nestedUl.className = 'adv-checklist';
            const childLi = document.createElement('li');
            childLi.className = 'adv-checklist-item';

            nestedUl.appendChild(childLi);
            parentLi.appendChild(nestedUl);
            mainUl.appendChild(parentLi);

            Editor.outdentChecklistLine(childLi);

            Assert.strictEqual(mainUl.children.length, 2);
            Assert.strictEqual(mainUl.children[1], childLi);
        });

    test("Editor: indentChecklistLine annida nodo li all'interno dell'elemento precedente", () => {
            const mainUl = document.createElement('ul');
            mainUl.className = 'adv-checklist';
            const li1 = document.createElement('li');
            li1.className = 'adv-checklist-item';
            const li2 = document.createElement('li');
            li2.className = 'adv-checklist-item';

            mainUl.appendChild(li1);
            mainUl.appendChild(li2);

            Editor.indentChecklistLine(li2);

            Assert.isNotNull(li1.querySelector('ul.adv-checklist'));
            Assert.strictEqual(li1.querySelector('ul.adv-checklist').firstChild, li2);
        });

    test("Lists: _calculateListEndValue con start=1 e 3 elementi restituisce 4", () => {
            const ol = document.createElement('ol');
            ol.innerHTML = '<li>A</li><li>B</li><li>C</li>';
            const endVal = Editor._calculateListEndValue(ol);
            Assert.strictEqual(endVal, 4); // 1 + 3 = 4
        });

    test("Lists: _calculateListEndValue con start=10 e 2 elementi restituisce 12", () => {
            const ol = document.createElement('ol');
            ol.setAttribute('start', '10');
            ol.innerHTML = '<li>A</li><li>B</li>';
            const endVal = Editor._calculateListEndValue(ol);
            Assert.strictEqual(endVal, 12); // 10 + 2 = 12
        });

    test("Lists: setListStart assegna attributo start numerico", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<ol id="ol_start"><li>Primo</li></ol>';

            const ol = editor.querySelector('#ol_start');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(ol.querySelector('li').firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            Editor.setListStart(5);
            Assert.strictEqual(ol.getAttribute('start'), '5');
        });

    test("Lists: setListStart con valore 1 rimuove l'attributo start", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<ol id="ol_reset" start="10"><li>Elemento</li></ol>';

            const ol = editor.querySelector('#ol_reset');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(ol.querySelector('li').firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            Editor.setListStart(1);
            Assert.isNull(ol.getAttribute('start'));
        });

    test("Lists: resetListStart rimuove start da elenco numerato", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<ol id="ol_res2" start="99"><li>Elemento</li></ol>';

            const ol = editor.querySelector('#ol_res2');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(ol.querySelector('li').firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            Editor.resetListStart();
            Assert.isNull(ol.getAttribute('start'));
        });

    test("Lists: continueFromPreviousList imposta start al valore successivo della lista precedente", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = `
                <ol id="ol_p1"><li>Uno</li><li>Due</li></ol>
                <p>Paragrafo intermezzo</p>
                <ol id="ol_p2"><li>Tre</li></ol>
            `;

            const ol2 = editor.querySelector('#ol_p2');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(ol2.querySelector('li').firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            Editor.continueFromPreviousList();
            Assert.strictEqual(ol2.getAttribute('start'), '3'); // 1 + 2 = 3
        });

    test("Lists: mergeWithPreviousList unisce fisicamente due elenchi numerati", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = `
                <ol id="ol_m1"><li>A</li></ol>
                <p><br></p>
                <ol id="ol_m2"><li>B</li><li>C</li></ol>
            `;

            const ol2 = editor.querySelector('#ol_m2');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(ol2.querySelector('li').firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            Editor.mergeWithPreviousList();

            Assert.isNull(editor.querySelector('#ol_m2'), "Il secondo elenco deve essere fuso e rimosso");
            const ol1 = editor.querySelector('#ol_m1');
            Assert.strictEqual(ol1.querySelectorAll('li').length, 3);
        });

    test("Lists: insertList 'ol' con style 'A' crea elenco a lettere", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p id="p_alpha">Testo</p>';

            const p = editor.querySelector('#p_alpha');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(p.firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            Editor.insertList('ol', 'A');
            Assert.strictEqual(typeof document.execCommand, 'function');
        });

    test("Lists: insertChecklist genera struttura con checkbox e span contenteditable", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p id="p_chk">Riga</p>';

            const p = editor.querySelector('#p_chk');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(p.firstChild, 0);
            r.collapse(true);
            sel.addRange(r);

            Editor.insertChecklist();

            const checklist = editor.querySelector('ul.adv-checklist');
            Assert.isNotNull(checklist);
            Assert.isNotNull(checklist.querySelector('.adv-checklist-cb'));
            Assert.isNotNull(checklist.querySelector('.checklist-text'));
        });

    test("Lists: indentChecklistLine annida sotto-livello to-do", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = `
                <ul class="adv-checklist">
                    <li id="li1" class="adv-checklist-item"><span class="checklist-text">Genitore</span></li>
                    <li id="li2" class="adv-checklist-item"><span class="checklist-text">Figlio</span></li>
                </ul>
            `;

            const li2 = editor.querySelector('#li2');
            Editor.indentChecklistLine(li2);

            const nestedUl = editor.querySelector('#li1 ul.adv-checklist');
            Assert.isNotNull(nestedUl);
            Assert.strictEqual(nestedUl.firstChild, li2);
        });

    test("Lists: outdentChecklistLine estrae sotto-livello to-do portandolo al livello padre", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = `
                <ul class="adv-checklist">
                    <li id="li_p" class="adv-checklist-item">
                        <span class="checklist-text">P</span>
                        <ul class="adv-checklist">
                            <li id="li_c" class="adv-checklist-item"><span class="checklist-text">C</span></li>
                        </ul>
                    </li>
                </ul>
            `;

            const liC = editor.querySelector('#li_c');
            Editor.outdentChecklistLine(liC);

            const mainUl = editor.querySelector('ul.adv-checklist');
            Assert.strictEqual(mainUl.children.length, 2);
            Assert.strictEqual(mainUl.children[1], liC);
        });

    test("Lists: outdentChecklistLine rimuove ul vuoto dopo estrazione dell'ultimo elemento", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = `
                <ul class="adv-checklist">
                    <li id="li_p2" class="adv-checklist-item">
                        <ul class="adv-checklist">
                            <li id="li_c2" class="adv-checklist-item">Solo</li>
                        </ul>
                    </li>
                </ul>
            `;

            const liC2 = editor.querySelector('#li_c2');
            Editor.outdentChecklistLine(liC2);

            Assert.isNull(editor.querySelector('#li_p2 ul.adv-checklist'), "Il sotto-elenco vuoto deve essere rimosso");
        });

    test("Lists: srotolamento automatico da tag <p> in cui il browser incapsula elenchi", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p><ul id="wrapped_ul"><li>A</li></ul></p>';

            // Simulazione logica di risanamento presente in insertList
            const malformed = editor.querySelectorAll('p > ul, p > ol');
            malformed.forEach(list => {
                const pNode = list.parentNode;
                pNode.parentNode.insertBefore(list, pNode);
                if (pNode.textContent.trim() === '') pNode.remove();
            });

            Assert.isNull(editor.querySelector('p > ul'));
            Assert.isNotNull(editor.querySelector('#wrapped_ul'));
        });

    test("Lists: outdentStandardListItem lancia comando outdent nativo", () => {
            const dummyLi = document.createElement('li');
            dummyLi.textContent = 'Test';
            document.body.appendChild(dummyLi);

            let outdentCalled = false;
            const origExec = document.execCommand;
            document.execCommand = (cmd) => { if (cmd === 'outdent') outdentCalled = true; };

            try {
                Editor.outdentStandardListItem(dummyLi);
                Assert.isTrue(outdentCalled);
            } finally {
                document.execCommand = origExec;
                dummyLi.remove();
            }
        });

});
