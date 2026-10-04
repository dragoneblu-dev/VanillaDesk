/**
 * tests/test-crypto-utils.js
 * Suite Modulare di Collaudo Unitario e di Integrazione Completa per lo Storage di VanillaDesk.
 * Modulo testato: CryptoUtils
 * Conteggio test case: 10
 */

describe("Store: Crypto (10 Test)", () => {

    // =========================================================================
    // 1. CRITTOGRAFIA DI BASE (AES-GCM & PBKDF2)
    // =========================================================================

    test("Crypto: buffer <-> Base64 helpers", () => {
        const sampleStr = "VanillaDesk_Crypto_Payload_2026";
        const enc = new TextEncoder().encode(sampleStr);
        const b64 = CryptoUtils.bufferToBase64(enc);
        const decBuf = CryptoUtils.base64ToBuffer(b64);
        const decStr = new TextDecoder().decode(decBuf);
        Assert.strictEqual(decStr, sampleStr);
    });

    test("Crypto: bufferToBase64 e base64ToBuffer gestiscono correttamente array binari vuoti", () => {
        const empty = new Uint8Array(0);
        const b64 = CryptoUtils.bufferToBase64(empty);
        Assert.strictEqual(b64, "");
        const buf = CryptoUtils.base64ToBuffer(b64);
        Assert.strictEqual(buf.length, 0);
    });

    test("Crypto: roundtrip asincrono di cifratura e decrittografia AES-GCM", async () => {
        const plainText = JSON.stringify({ secret: "ChiavePrivata123", noteId: "n_secure_01" });
        const pwd = "MasterPasswordForte#2026";

        const cipherText = await CryptoUtils.encrypt(plainText, pwd);
        Assert.isTrue(cipherText.startsWith("PRONOTES_ENC_V1|"), "L'intestazione deve rispettare il protocollo PRONOTES_ENC_V1");

        const decrypted = await CryptoUtils.decrypt(cipherText, pwd);
        Assert.strictEqual(decrypted, plainText);
    });

    test("Crypto: password errata lancia eccezione durante la decrittografia", async () => {
        const plainText = "Contenuto Riservato";
        const cipherText = await CryptoUtils.encrypt(plainText, "PasswordCorretta");

        let failed = false;
        try {
            await CryptoUtils.decrypt(cipherText, "PasswordSbagliata");
        } catch (e) {
            failed = true;
        }
        Assert.isTrue(failed, "La decrittografia con credenziale non valida deve fallire");
    });

    test("Crypto: payload corrotto o manomesso lancia eccezione", async () => {
        let failed = false;
        try {
            await CryptoUtils.decrypt("PRONOTES_ENC_V1|001122|334455|PayloadCorrottoNonBase64!#", "Password");
        } catch(e) {
            failed = true;
        }
        Assert.isTrue(failed);
    });

    test("Crypto: decrittografia fallisce se il formato del token cifrato non contiene 4 segmenti", async () => {
        let threw = false;
        try {
            await CryptoUtils.decrypt("PRONOTES_ENC_V1|solo_due_parti", "password");
        } catch(e) {
            threw = true;
        }
        Assert.isTrue(threw);
    });

    test("Crypto: deriveKey genera chiave crittografica AES-GCM da PBKDF2 a 100.000 iterazioni", async () => {
        const salt = new Uint8Array(16);
        const key = await CryptoUtils.deriveKey("Password", salt);
        Assert.strictEqual(key.algorithm.name, "AES-GCM");
        Assert.strictEqual(key.extractable, false);
    });

    // =========================================================================
    // 2. ZERO-LAG VAULT (CACHE CHIAVI & WORKSPACE VAULT SALT)
    // =========================================================================

    test("Crypto Cache: deriveKey memorizza la CryptoKey in cache per salt e password identici", async () => {
        CryptoUtils.clearCache();
        const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
        const pwd = "TestMasterPassword";

        const key1 = await CryptoUtils.deriveKey(pwd, salt);
        const key2 = await CryptoUtils.deriveKey(pwd, salt);

        Assert.strictEqual(key1, key2, "La seconda chiamata per medesimi parametri deve restituire la medesima istanza cached O(1)");
    });

    test("Crypto Cache: clearCache svuota la mappa delle chiavi derivate", async () => {
        CryptoUtils.clearCache();
        const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
        const pwd = "TestMasterPassword";

        const key1 = await CryptoUtils.deriveKey(pwd, salt);
        CryptoUtils.clearCache();
        const key2 = await CryptoUtils.deriveKey(pwd, salt);

        Assert.isFalse(key1 === key2, "Dopo la pulizia della cache deve essere generata una nuova istanza");
    });

    test("Crypto Vault: cifratura multipla con salt di workspace riutilizza la chiave senza overhead", async () => {
        CryptoUtils.clearCache();
        const workspaceSalt = crypto.getRandomValues(new Uint8Array(16));
        const pwd = "VaultPassword#2026";

        const t0 = performance.now();
        const enc1 = await CryptoUtils.encrypt("Doc1", pwd, workspaceSalt);
        const t1 = performance.now();

        const enc2 = await CryptoUtils.encrypt("Doc2", pwd, workspaceSalt);
        const enc3 = await CryptoUtils.encrypt("Doc3", pwd, workspaceSalt);
        const tEnd = performance.now();

        const firstDuration = t1 - t0;
        const subsequentDuration = (tEnd - t1) / 2;

        Assert.isTrue(enc1.startsWith("PRONOTES_ENC_V1|"));
        Assert.isTrue(enc2.startsWith("PRONOTES_ENC_V1|"));
        Assert.isTrue(enc3.startsWith("PRONOTES_ENC_V1|"));
        Assert.isTrue(subsequentDuration < firstDuration, "I salvataggi successivi con chiave cached devono essere drasticamente più veloci");
    });

});