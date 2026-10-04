/**
 * js/crypto-utils.js
 * Modulo di Sicurezza e Crittografia a Riposo (AES-GCM 256-bit & PBKDF2).
 * Fornisce derivazione chiavi deterministica a 100.000 iterazioni, caching delle CryptoKey
 * per prevenire il PBKDF2 Storm, crittografia autenticata conforme agli standard NIST SP 800-38D
 * e conversioni binarie Base64/Uint8Array.
 */

const CryptoUtils = {
    // Cache in-memory delle CryptoKey derivate: evita ricalcoli PBKDF2 (100.000 cicli) per il medesimo salt
    _keyCache: new Map(),

    _simpleHash(str) {
        if (!str || typeof str !== 'string') return 0;
        str = str.replace(/\r\n/g, '\n');
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    },

    _getCacheKey(password, saltHex) {
        return `${saltHex}:${this._simpleHash(password)}`;
    },

    async deriveKey(password, salt) {
        const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
        const cacheKey = this._getCacheKey(password, saltHex);

        if (this._keyCache.has(cacheKey)) {
            return this._keyCache.get(cacheKey);
        }

        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
        );
        const derivedKey = await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );

        this._keyCache.set(cacheKey, derivedKey);
        return derivedKey;
    },

    bufferToBase64(buf) {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    },

    base64ToBuffer(base64) {
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    },

    // Supporta il passaggio opzionale di un salt coerente di Workspace per massimizzare il riuso della chiave
    async encrypt(text, password, explicitSalt = null) {
        const salt = (explicitSalt instanceof Uint8Array && explicitSalt.length === 16) 
            ? explicitSalt 
            : crypto.getRandomValues(new Uint8Array(16));
        
        // Ogni crittografia genera un IV casuale a 12 byte univoco secondo standard NIST SP 800-38D
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(password, salt);
        const enc = new TextEncoder();
        const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(text));
        
        const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
        const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
        const cipherBase64 = this.bufferToBase64(cipherBuffer);
        return `PRONOTES_ENC_V1|${saltHex}|${ivHex}|${cipherBase64}`;
    },

    async decrypt(encryptedString, password) {
        const parts = encryptedString.split('|');
        if (parts.length !== 4) throw new Error("Formato corrotto.");
        const salt = new Uint8Array(parts[1].match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const iv = new Uint8Array(parts[2].match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const cipherBytes = this.base64ToBuffer(parts[3]);
        const key = await this.deriveKey(password, salt);
        const decryptedBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, cipherBytes);
        return new TextDecoder().decode(decryptedBuffer);
    },

    clearCache() {
        this._keyCache.clear();
    }
};