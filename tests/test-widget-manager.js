/**
 * tests/test-widget-manager.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: widget-manager
 * Conteggio test case: 6
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("WidgetManager: Guscio Universale, Boundaries & Legacy Migrator (6 Test)", () => {

    test("WidgetManager: isInsideEditableWidgetArea riconosce .widget-editable-area e celle tabella", () => {
            const div = document.createElement('div');
            div.className = 'widget-editable-area';
            Assert.isTrue(WidgetManager.isInsideEditableWidgetArea(div));

            const td = document.createElement('td');
            const simpleTable = document.createElement('div');
            simpleTable.className = 'simple-table-wrapper';
            simpleTable.appendChild(td);
            Assert.isTrue(WidgetManager.isInsideEditableWidgetArea(td));
        });

    test("WidgetManager: isTotallyProtected restituisce false per nodi dentro aree editabili", () => {
            const shell = document.createElement('div');
            shell.className = 'adv-widget-shell';
            const editableArea = document.createElement('div');
            editableArea.className = 'widget-editable-area';
            shell.appendChild(editableArea);

            Assert.isFalse(WidgetManager.isTotallyProtected(editableArea));
        });

    test("WidgetManager: createShell crea blockquote per 'citation' e div per gli altri", () => {
            const citShell = WidgetManager.createShell('citation', 'cit_shell_test');
            Assert.strictEqual(citShell.tagName.toLowerCase(), 'blockquote');

            const dbShell = WidgetManager.createShell('database', 'db_shell_test');
            Assert.strictEqual(dbShell.tagName.toLowerCase(), 'div');
        });

    test("WidgetManager: moveWidgetToNote avvisa se l'elemento è già nella nota attiva", () => {
            AppState.currentNoteId = 'note_current_target';
            const dummy = document.createElement('div');
            dummy.id = 'widget_same_note';
            document.body.appendChild(dummy);

            let alertShown = false;
            const origAlert = window.alert;
            window.alert = () => { alertShown = true; };

            try {
                WidgetManager.moveWidgetToNote('widget_same_note', 'note_current_target');
                Assert.isTrue(alertShown);
            } finally {
                window.alert = origAlert;
                dummy.remove();
            }
        });

    test("LegacyMigrator: converte vecchie citazioni non-shell in adv-widget-shell", () => {
            const container = document.createElement('div');
            container.innerHTML = '<blockquote class="block-citation"><div class="citation-body">Vecchio testo</div></blockquote>';

            LegacyMigrator.run(container);
            const migrated = container.querySelector('.block-citation');
            Assert.isTrue(migrated.classList.contains('adv-widget-shell'));
            Assert.strictEqual(migrated.getAttribute('data-widget-type'), 'citation');
        });

    test("LegacyMigrator: converte vecchi code-wrapper privi di widget-body", () => {
            const container = document.createElement('div');
            container.innerHTML = '<div class="code-wrapper" id="adv_code_old_leg"><pre class="code-content" data-language="js">const a = 1;</pre></div>';

            LegacyMigrator.run(container);
            const migrated = container.querySelector('#adv_code_old_leg');
            Assert.isNotNull(migrated.querySelector('.widget-body'));
            Assert.isTrue(migrated.classList.contains('adv-widget-shell'));
        });

});
