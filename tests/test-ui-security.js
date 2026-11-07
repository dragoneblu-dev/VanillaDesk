/**
 * tests/test-ui-security.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-security
 */

describe("UI Security: Password Manager, Modali Sblocco & Allarmi (test-ui-security.js)", () => {

    beforeEach(() => {
        let sandbox = document.getElementById('testSandBox');
        if (!sandbox) {
            sandbox = document.createElement('div');
            sandbox.id = 'testSandBox';
            document.body.appendChild(sandbox);
        }

        let drawer = document.getElementById('advGlobalDrawer');
        if (!drawer) {
            drawer = document.createElement('div');
            drawer.id = 'advGlobalDrawer';
            drawer.className = 'adv-drawer';
            drawer.innerHTML = `
                <div class="adv-drawer-header"><div id="advDrawerTitle"></div></div>
                <div id="advDrawerBody" class="adv-drawer-body"></div>
                <div id="advDrawerFooter" class="adv-drawer-footer"></div>
            `;
            sandbox.appendChild(drawer);
        }
    });

    afterEach(() => {
        AppState.documentPassword = null;
        UI.closeDrawer(true);
    });

    test("UI.PasswordManager: promptForOpen genera modale DOM e risolve con stringa digitata", async () => {
        const promise = UI.PasswordManager.promptForOpen("Sblocca");
        const input = document.getElementById('decryptPasswordInput');
        Assert.isNotNull(input);

        input.value = "MiaPassword";
        document.getElementById('btnDecryptConfirm').click();

        const pwd = await promise;
        Assert.strictEqual(pwd, "MiaPassword");
    });

    test("UI.PasswordManager: promptForOpen risolve con null se l'utente clicca Annulla", async () => {
        const promise = UI.PasswordManager.promptForOpen("Sblocca");
        document.getElementById('btnDecryptCancel').click();

        const pwd = await promise;
        Assert.isNull(pwd);
    });

    test("UI.PasswordManager: openSettings apre il Drawer mostrando il form di cifratura quando non c'è password", () => {
        AppState.documentPassword = null;
        UI.PasswordManager.openSettings();

        const drawer = document.getElementById('advGlobalDrawer');
        Assert.isTrue(drawer.classList.contains('open'));

        const p1 = document.getElementById('newDocPassword');
        const p2 = document.getElementById('newDocPasswordConfirm');
        Assert.isNotNull(p1);
        Assert.isNotNull(p2);
    });

    test("UI.PasswordManager: saveNewPassword rifiuta password vuota o non coincidenti", () => {
        UI.PasswordManager.openSettings();

        let alertShown = false;
        const origAlert = window.alert;
        window.alert = () => { alertShown = true; };

        try {
            // Password vuota
            document.getElementById('newDocPassword').value = '';
            document.getElementById('newDocPasswordConfirm').value = '';
            UI.PasswordManager.saveNewPassword();
            Assert.isTrue(alertShown);

            // Password non coincidenti
            alertShown = false;
            document.getElementById('newDocPassword').value = 'Segreta1';
            document.getElementById('newDocPasswordConfirm').value = 'Segreta2';
            UI.PasswordManager.saveNewPassword();
            Assert.isTrue(alertShown);
            Assert.isNull(AppState.documentPassword);
        } finally {
            window.alert = origAlert;
        }
    });

    test("UI.PasswordManager: saveNewPassword con password valida cifra il Workspace e invalida gli hash", () => {
        UI.PasswordManager.openSettings();

        document.getElementById('newDocPassword').value = 'PassConfermata123';
        document.getElementById('newDocPasswordConfirm').value = 'PassConfermata123';

        let autoSaved = false;
        const origSave = Store.triggerAutoSave;
        Store.triggerAutoSave = () => { autoSaved = true; };

        try {
            UI.PasswordManager.saveNewPassword();
            Assert.strictEqual(AppState.documentPassword, 'PassConfermata123');
            Assert.isTrue(autoSaved);
        } finally {
            Store.triggerAutoSave = origSave;
        }
    });

    test("UI.PasswordManager: removePassword chiede conferma e azzera la protezione", () => {
        AppState.documentPassword = 'VecchiaPassword';

        const origConfirm = window.confirm;
        window.confirm = () => true;

        let autoSaved = false;
        const origSave = Store.triggerAutoSave;
        Store.triggerAutoSave = () => { autoSaved = true; };

        try {
            UI.PasswordManager.removePassword();
            Assert.isNull(AppState.documentPassword);
            Assert.isTrue(autoSaved);
        } finally {
            window.confirm = origConfirm;
            Store.triggerAutoSave = origSave;
        }
    });

});