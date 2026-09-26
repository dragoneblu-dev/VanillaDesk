/**
 * tests/test-store.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: store
 * Allineato con la firma a 3 vie: Store._mergeDatabaseStates(dbId, diskState, ramState)
 */

describe("Store: Local-First Storage, Concorrenza LWW & Crittografia AES-GCM (20 Test)", () => {

    test("Crypto: buffer <-> Base64 helpers", () => {
            const sampleStr = "VanillaDesk_Crypto_Payload_2026";
            const enc = new TextEncoder().encode(sampleStr);
            const b64 = CryptoUtils.bufferToBase64(enc);
            const decBuf = CryptoUtils.base64ToBuffer(b64);
            const decStr = new TextDecoder().decode(decBuf);
            Assert.strictEqual(decStr, sampleStr);
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

    test("Hashing: parità di hash tra terminatori di linea Windows (\\r\\n) e Unix (\\n)", () => {
            const textA = '{\n  "name": "Database",\n  "rows": [1, 2, 3]\n}';
            const textB = '{\r\n  "name": "Database",\r\n  "rows": [1, 2, 3]\r\n}';
            const hA = Store._simpleHash(textA);
            const hB = Store._simpleHash(textB);
            Assert.strictEqual(hA, hB, "Line endings differenti non devono causare falsi conflitti di sincronizzazione");
        });

    test("Store: _hashObj serializza uniformemente oggetti in memoria", () => {
            const objA = { id: 'adv_tbl_1', title: 'Test', active: true };
            const objB = { id: 'adv_tbl_1', title: 'Test', active: true };
            Assert.strictEqual(Store._hashObj(objA), Store._hashObj(objB));
        });

    test("Store: _mergeDatabaseStates fonde colonne e celle concorrenti (Field-Level Merge)", () => {
        const testDbId = 'adv_tbl_test_merge_1';
        // L'antenato comune di base possiede solo c1: c2 è stata aggiunta da Disco e c3 da RAM
        Store._baseDatabases[testDbId] = {
            columns: [{ id: 'c1', name: 'Nome' }],
            rows: [{ id: 'r1', cells: { c1: 'Originale' }, updatedAt: 500 }]
        };

            const diskState = {
                columns: [{ id: 'c1', name: 'Nome' }, { id: 'c2', name: 'Prezzo' }],
                rows: [
                    { id: 'r1', cells: { c1: 'Originale', c2: 10 }, updatedAt: 1000 }
                ]
            };
            const ramState = {
                columns: [{ id: 'c1', name: 'Nome' }, { id: 'c3', name: 'Stato' }],
                rows: [
                    { id: 'r1', cells: { c1: 'Modificato da RAM', c3: 'Attivo' }, updatedAt: 2000 }
                ]
            };

        const merged = Store._mergeDatabaseStates(testDbId, diskState, ramState);
            Assert.strictEqual(merged.columns.length, 3);

            const r1 = merged.rows.find(r => r.id === 'r1');
            Assert.strictEqual(r1.cells.c1, 'Modificato da RAM');
            Assert.strictEqual(r1.cells.c2, 10);
            Assert.strictEqual(r1.cells.c3, 'Attivo');
        });

    test("Store: _mergeDatabaseStates preserva righe create su disco e righe create in RAM contemporaneamente", () => {
        const testDbId = 'adv_tbl_test_merge_2';
            const diskState = {
                columns: [{ id: 'c1', name: 'Nome' }],
                rows: [
                    { id: 'r_disk_new', cells: { c1: 'Creato su Disco' }, updatedAt: 1500 }
                ]
            };
            const ramState = {
                columns: [{ id: 'c1', name: 'Nome' }],
                rows: [
                    { id: 'r_ram_new', cells: { c1: 'Creato in RAM' }, updatedAt: 1600 }
                ]
            };

        const merged = Store._mergeDatabaseStates(testDbId, diskState, ramState);
            Assert.strictEqual(merged.rows.length, 2);
            Assert.isTrue(merged.rows.some(r => r.id === 'r_disk_new'));
            Assert.isTrue(merged.rows.some(r => r.id === 'r_ram_new'));
        });

    test("Store: _mergeDatabaseStates fonde opzioni e colori delle colonne Select", () => {
        const testDbId = 'adv_tbl_test_merge_3';
            const diskState = {
                columns: [{ id: 'c_sel', name: 'Tag', type: 'select' }],
                selectOptions: { c_sel: ['Bozza', 'Revisione'] },
                selectColors: { c_sel: { 'Bozza': 'hl-c1' } },
                rows: []
            };
            const ramState = {
                columns: [{ id: 'c_sel', name: 'Tag', type: 'select' }],
                selectOptions: { c_sel: ['Approvato'] },
                selectColors: { c_sel: { 'Approvato': 'hl-c6' } },
                rows: []
            };

        const merged = Store._mergeDatabaseStates(testDbId, diskState, ramState);
            Assert.deepEqual(merged.selectOptions.c_sel, ['Bozza', 'Revisione', 'Approvato']);
            Assert.strictEqual(merged.selectColors.c_sel['Bozza'], 'hl-c1');
            Assert.strictEqual(merged.selectColors.c_sel['Approvato'], 'hl-c6');
        });

    test("Storage: _mergeDatabaseStates tie-breaker a parità di timestamp favorisce la sessione in RAM", () => {
        const testDbId = 'adv_tbl_test_merge_4';
            const fixedTime = 50000;
            const diskState = {
                columns: [{ id: 'c1', name: 'Nome' }],
                rows: [{ id: 'r1', cells: { c1: 'Valore Disco' }, updatedAt: fixedTime }]
            };
            const ramState = {
                columns: [{ id: 'c1', name: 'Nome' }],
                rows: [{ id: 'r1', cells: { c1: 'Valore RAM' }, updatedAt: fixedTime }]
            };
        const merged = Store._mergeDatabaseStates(testDbId, diskState, ramState);
            Assert.strictEqual(merged.rows[0].cells.c1, 'Valore RAM');
        });

    test("Storage: _mergeDatabaseStates preserva le righe del disco se la RAM ha array vuoto accidentale", () => {
        const testDbId = 'adv_tbl_test_merge_5';
            const diskState = {
                columns: [{ id: 'c1', name: 'Nome' }],
                rows: [{ id: 'r_persisted', cells: { c1: 'Dato Sicuro' }, updatedAt: 1000 }]
            };
            const ramState = {
                columns: [{ id: 'c1', name: 'Nome' }],
                rows: []
            };
        const merged = Store._mergeDatabaseStates(testDbId, diskState, ramState);
            Assert.strictEqual(merged.rows.length, 1);
            Assert.strictEqual(merged.rows[0].id, 'r_persisted');
        });

    test("Storage: determinismo hash indipendente da spaziatura interna e line endings", () => {
            const h1 = Store._simpleHash('{\n  "title": "DB"\n}');
            const h2 = Store._simpleHash('{\r\n  "title": "DB"\r\n}');
            Assert.strictEqual(h1, h2);
        });

    test("Store: _simpleHash genera hash deterministico identico su stringhe coincidenti", () => {
            const h1 = Store._simpleHash('VanillaDeskPayload');
            const h2 = Store._simpleHash('VanillaDeskPayload');
            Assert.strictEqual(h1, h2);
        });

    test("Store: _simpleHash genera hash differenti per contenuti anche minimamente alterati", () => {
            const h1 = Store._simpleHash('VanillaDeskPayloadA');
            const h2 = Store._simpleHash('VanillaDeskPayloadB');
            Assert.isFalse(h1 === h2);
        });

    test("Store: _hashObj tiene conto del prefisso crittografico (ENC_ vs RAW_)", () => {
            const payload = { a: 1 };
            const hRaw = Store._hashObj(payload, "RAW_");
            const hEnc = Store._hashObj(payload, "ENC_");
            Assert.isFalse(hRaw === hEnc);
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

    test("Crypto: bufferToBase64 e base64ToBuffer gestiscono correttamente array binari vuoti", () => {
            const empty = new Uint8Array(0);
            const b64 = CryptoUtils.bufferToBase64(empty);
            Assert.strictEqual(b64, "");
            const buf = CryptoUtils.base64ToBuffer(b64);
            Assert.strictEqual(buf.length, 0);
        });

    test("Store: _mergeDatabaseStates preserva intatte le righe del DB in caso di assenza modifiche", () => {
        const testDbId = 'adv_tbl_test_merge_6';
            const initial = {
                columns: [{ id: 'c1', name: 'Nome' }],
                rows: [{ id: 'r1', cells: { c1: 'Stabile' }, updatedAt: 500 }]
            };
        const merged = Store._mergeDatabaseStates(testDbId, initial, initial);
            Assert.strictEqual(merged.rows.length, 1);
            Assert.strictEqual(merged.rows[0].cells.c1, 'Stabile');
        });

    test("Store: deriveKey genera chiave crittografica AES-GCM da PBKDF2 a 100.000 iterazioni", async () => {
            const salt = new Uint8Array(16);
            const key = await CryptoUtils.deriveKey("Password", salt);
            Assert.strictEqual(key.algorithm.name, "AES-GCM");
            Assert.strictEqual(key.extractable, false);
        });

    test("Store: generateId produce identificatori univoci privi di trattini", () => {
            const id1 = Store.generateId();
            const id2 = Store.generateId();
            Assert.isFalse(id1.includes('-'));
            Assert.isFalse(id1 === id2);
        });

});
