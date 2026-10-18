/**
 * tests/test-audio-manager.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: audio-manager
 * Conteggio test case: 3
 */

describe("AudioManager: Upload, Player & Streaming Asset (3 Test)", () => {

    test("AudioManager: downloadAudio genera anchor temporaneo per export file", () => {
        const wrap = document.createElement('div');
        wrap.id = 'adv_audio_dl';
        wrap.innerHTML = `
            <span class="adv-table-title">Registrazione Meeting</span>
            <audio data-audio-ref="aud_123.mp3"></audio>
        `;
        document.body.appendChild(wrap);

        if (!Editor.audioCache) Editor.audioCache = {};
        Editor.audioCache['aud_123.mp3'] = 'data:audio/mp3;base64,SUQzBAAAAAAA';

        let clicked = false;
        let downloadedHref = null;
        const origClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function() {
            clicked = true;
            downloadedHref = this.href;
        };

        try {
            AudioManager.downloadAudio('adv_audio_dl');
            Assert.isTrue(clicked);
            Assert.strictEqual(downloadedHref, 'data:audio/mp3;base64,SUQzBAAAAAAA');
        } finally {
            HTMLAnchorElement.prototype.click = origClick;
            wrap.remove();
            delete Editor.audioCache['aud_123.mp3'];
        }
    });

    test("AudioManager: handleUpload rifiuta file se superano limite consigliato (50MB)", async () => {
        AppState.assetsHandle = {}; // mock attivo
        const hugeFile = { name: 'huge.mp3', size: 60 * 1024 * 1024 }; // 60MB

        const dummyInput = {
            files: [hugeFile],
            value: 'fake'
        };

        let alertShown = false;
        const origAlert = window.alert;
        window.alert = () => { alertShown = true; };

        try {
            await AudioManager.handleUpload(dummyInput);
            Assert.isTrue(alertShown);
            Assert.strictEqual(dummyInput.value, '');
        } finally {
            window.alert = origAlert;
            AppState.assetsHandle = null;
        }
    });

    test("AudioManager: _updateWidgetUI associa icona play e titolo al guscio del widget", () => {
        const wrap = document.createElement('div');
        wrap.id = 'adv_audio_update_ui';
        wrap.className = 'adv-widget-shell widget-type-audio';
        wrap.innerHTML = '<div class="widget-header"><span class="widget-title"></span></div><div class="widget-body"></div>';
        document.body.appendChild(wrap);

        try {
            AudioManager._updateWidgetUI('adv_audio_update_ui', 'Podcast Episodio 1');
            const titleEl = wrap.querySelector('.widget-title');
            Assert.strictEqual(titleEl.textContent, 'Podcast Episodio 1');
        } finally {
            wrap.remove();
        }
    });

});