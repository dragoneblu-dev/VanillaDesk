/**
 * tests/test-color-manager.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: color-manager
 * Conteggio test case: 9
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("ColorManager: Palette Cromatiche, Magic Mappings & Sanitizzazione (9 Test)", () => {

    test("ColorManager: configurazione valori di default per highlight e text", () => {
            Assert.strictEqual(ColorManager.defaults.highlight, 'hl-c5');
            Assert.strictEqual(ColorManager.defaults.text, 'tx-c10');
        });

    test("ColorManager: mappa magicHl contiene 10 varianti cromatiche con hex e rgb", () => {
            const keys = Object.keys(ColorManager.magicHl);
            Assert.strictEqual(keys.length, 10);
            Assert.strictEqual(ColorManager.magicHl['hl-c1'].hex, '#fb0101');
            Assert.isTrue(ColorManager.magicHl['hl-c10'].rgb.includes('251, 10, 10'));
        });

    test("ColorManager: mappa magicTx contiene 10 varianti cromatiche testo", () => {
            const keys = Object.keys(ColorManager.magicTx);
            Assert.strictEqual(keys.length, 10);
            Assert.strictEqual(ColorManager.magicTx['tx-c1'].hex, '#fc0101');
            Assert.strictEqual(ColorManager.magicTx['tx-c10'].hex, '#fc0a0a');
        });

    test("ColorManager: _isSafeToColor rifiuta input null o nodi non Element", () => {
            Assert.isFalse(ColorManager._isSafeToColor(null));
            Assert.isFalse(ColorManager._isSafeToColor(document.createTextNode("testo")));
        });

    test("ColorManager: _isSafeToColor rifiuta la radice #noteContent per impedire corruzioni globali", () => {
            const editorMock = document.createElement('div');
            editorMock.id = 'noteContent';
            Assert.isFalse(ColorManager._isSafeToColor(editorMock));
        });

    test("ColorManager: _isSafeToColor ammette paragrafi standard non protetti", () => {
            const p = document.createElement('p');
            Assert.isTrue(ColorManager._isSafeToColor(p));
        });

    test("ColorManager: _isSafeToColor rifiuta elementi appartenenti all'infrastruttura Widget", () => {
            const shell = document.createElement('div');
            shell.className = 'adv-widget-shell';
            const innerHeader = document.createElement('div');
            shell.appendChild(innerHeader);
            Assert.isFalse(ColorManager._isSafeToColor(innerHeader));
        });

    test("ColorManager: updateToolbarIcon assegna la classe esatta alla barra di evidenziazione", () => {
            let bar = document.getElementById('hlBar');
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'hlBar';
                document.body.appendChild(bar);
            }
            ColorManager.updateToolbarIcon('highlight', 'hl-c3');
            Assert.isTrue(bar.classList.contains('hl-c3'));
            Assert.strictEqual(bar.style.backgroundColor, '');
        });

    test("ColorManager: updateToolbarIcon per testo con valore null applica la classe 'tx-auto'", () => {
            let bar = document.getElementById('txBar');
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'txBar';
                document.body.appendChild(bar);
            }
            ColorManager.updateToolbarIcon('text', null);
            Assert.isTrue(bar.classList.contains('tx-auto'));
        });

});
