/**
 * tests/test-code-highlighter.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: code-highlighter
 * Conteggio test case: 1
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("CodeManager: Syntax Highlighting, Tokenizer & Export Snippet (1 Test)", () => {

    test("CodeManager: highlightBlock per sintassi JSON evidenzia numeri e booleani con token", () => {
            const pre = document.createElement('pre');
            pre.setAttribute('data-language', 'json');
            CodeManager.highlightBlock(pre, true, '{"attivo": true, "valore": 120}');
            Assert.isTrue(pre.innerHTML.includes('#569cd6')); // Colore boolean
            Assert.isTrue(pre.innerHTML.includes('#b5cea8')); // Colore number
        });

});
