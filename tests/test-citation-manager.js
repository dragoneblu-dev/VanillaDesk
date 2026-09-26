/**
 * tests/test-citation-manager.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: citation-manager
 * Conteggio test case: 8
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("CitationManager: Transclusion Live, Dashboard & Anti-Loop (8 Test)", () => {

    test("CitationManager: ricorsione ciclica tra citazioni viene intercettata e bloccata", () => {
            const dummy = document.createElement('div');
            dummy.innerHTML = '<blockquote class="block-citation" data-ref-note="note_loop"><div class="citation-body"></div></blockquote>';

            const visited = new Set(['note_loop']);
            CitationManager.renderLiveCitations(dummy, visited);

            const body = dummy.querySelector('.citation-body');
            Assert.isTrue(body.innerHTML.includes("Circolare"));
        });

    test("CitationManager: widget all'interno di citazioni ricevono prefisso '_cited_' sull'ID", () => {
            const dummy = document.createElement('div');
            dummy.innerHTML = `
                <blockquote class="block-citation" data-ref-note="n_source">
                    <div class="citation-body">
                        <div id="adv_tbl_original" class="adv-widget-shell widget-type-database"></div>
                    </div>
                </blockquote>
            `;
            AppState.notes = [{ id: 'n_source', content: '<div id="adv_tbl_original" class="adv-widget-shell widget-type-database"></div>' }];

            CitationManager.renderLiveCitations(dummy, new Set());
            const innerWidget = dummy.querySelector('.citation-body .adv-widget-shell');
            Assert.isNotNull(innerWidget);
            Assert.isTrue(innerWidget.id.includes('adv_tbl_original_cited_'));
        });

    test("CitationManager: removeHomeCitation rimuove elemento da AppState.homeCitations", () => {
            AppState.homeCitations = [{ noteId: 'n1', title: 'Cit 1' }, { noteId: 'n2', title: 'Cit 2' }];
            const origConfirm = window.confirm;
            window.confirm = () => true;
            try {
                CitationManager.removeHomeCitation(0);
                Assert.strictEqual(AppState.homeCitations.length, 1);
                Assert.strictEqual(AppState.homeCitations[0].noteId, 'n2');
            } finally {
                window.confirm = origConfirm;
            }
        });

    test("Citations: toggleCollapse alterna la classe e l'attributo data-collapsed", () => {
            const cit = document.createElement('blockquote');
            cit.id = 'cit_toggle_wrap';
            cit.className = 'adv-widget-shell block-citation';
            cit.innerHTML = '<div class="widget-body citation-body"></div>';
            document.body.appendChild(cit);

            CitationManager.toggleCollapse(null, 'cit_toggle_wrap');
            Assert.isTrue(cit.classList.contains('collapsed'));
            Assert.strictEqual(cit.getAttribute('data-collapsed'), 'true');

            CitationManager.toggleCollapse(null, 'cit_toggle_wrap');
            Assert.isFalse(cit.classList.contains('collapsed'));
            Assert.isNull(cit.getAttribute('data-collapsed'));
            cit.remove();
        });

    test("Citations: mountAll rileva data-collapsed='true' applicando classe CSS", () => {
            const dummy = document.createElement('div');
            dummy.innerHTML = `<blockquote id="cit_m1" class="block-citation adv-widget-shell" data-collapsed="true"></blockquote>`;
            document.body.appendChild(dummy);

            CitationManager.mountAll(dummy);
            Assert.isTrue(dummy.querySelector('#cit_m1').classList.contains('collapsed'));
            dummy.remove();
        });

    test("Citations: onHomeDragStart assegna indice di trascinamento alla dashboard", () => {
            const evMock = {
                dataTransfer: { effectAllowed: '' },
                currentTarget: { style: {} }
            };
            CitationManager.onHomeDragStart(evMock, 3);
            Assert.strictEqual(CitationManager.homeDraggedIdx, 3);
            Assert.strictEqual(evMock.dataTransfer.effectAllowed, 'move');
        });

    test("Citations: onHomeDrop riordina le citazioni nella Home Page", () => {
            AppState.homeCitations = [
                { noteId: 'c1' },
                { noteId: 'c2' },
                { noteId: 'c3' }
            ];
            CitationManager.homeDraggedIdx = 0; // Sposta 'c1' in coda (indice 3)

            const evMock = { preventDefault: () => {} };
            CitationManager.onHomeDrop(evMock, 3);

            Assert.strictEqual(AppState.homeCitations[0].noteId, 'c2');
            Assert.strictEqual(AppState.homeCitations[1].noteId, 'c3');
            Assert.strictEqual(AppState.homeCitations[2].noteId, 'c1');
        });

    test("Citations: insertLineBreakAfter crea paragrafo sotto la citazione e posiziona cursore", () => {
            const dummy = document.createElement('div');
            dummy.id = 'cit_break_test';
            document.body.appendChild(dummy);

            WidgetManager.insertLineBreakAfter('cit_break_test');
            const nextP = dummy.nextElementSibling;
            Assert.isNotNull(nextP);
            Assert.strictEqual(nextP.tagName.toLowerCase(), 'p');
            Assert.strictEqual(nextP.innerHTML, '<br>');

            dummy.remove();
            nextP.remove();
        });

});
