/**
 * tests/test-ui-security.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: ui-security
 * Conteggio test case: 2
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("UI Security: Password Manager, Modali Sblocco & Allarmi (2 Test)", () => {

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

});
