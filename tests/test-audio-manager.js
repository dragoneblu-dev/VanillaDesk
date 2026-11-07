/**
 * tests/test-audio-manager.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: audio-manager
 */

describe("AudioManager: Upload, Player & Streaming Asset (test-audio-manager.js)", () => {

    let mockEditor;

    beforeEach(() => {
        mockEditor = document.getElementById('noteContent');
        if (!mockEditor) {
            mockEditor = document.createElement('div');
            mockEditor.id = 'noteContent';
            document.body.appendChild(mockEditor);
        } else {
            mockEditor.innerHTML = '';
        }
    });

    afterEach(() => {
        if (mockEditor) mockEditor.innerHTML = '';
        delete Editor.audioCache['aud_test_ref.mp3'];
        delete Editor.audioCache['aud_123.mp3'];
    });

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

    test("AudioManager: downloadAudio visualizza alert se l'asset audio non è reperibile in memoria", async () => {
        const wrap = document.createElement('div');
        wrap.id = 'adv_audio_missing';
        wrap.innerHTML = `
            <audio data-audio-ref="aud_ghost.mp3"></audio>
        `;
        document.body.appendChild(wrap);

        let alertTriggered = false;
        const origAlert = window.alert;
        window.alert = () => { alertTriggered = true; };

        try {
            await AudioManager.downloadAudio('adv_audio_missing');
            Assert.isTrue(alertTriggered, "Deve mostrare alert se la sorgente audio non è in memoria");
        } finally {
            window.alert = origAlert;
            wrap.remove();
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

    test("AudioManager: handleUpload visualizza avviso se non vi è un Workspace aperto", async () => {
        AppState.assetsHandle = null; // Nessun workspace
        const validFile = { name: 'track.mp3', size: 2 * 1024 * 1024 };

        const dummyInput = {
            files: [validFile],
            value: 'fake_path'
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
        }
    });

    test("AudioManager: handleUpload blocca l'inserimento se il cursore è dentro colonne (.widget-type-columns)", async () => {
        AppState.assetsHandle = {}; 
        const validFile = { name: 'track.mp3', size: 1024 * 1024 };
        const dummyInput = { files: [validFile], value: 'fake' };

        const colWrap = document.createElement('div');
        colWrap.className = 'widget-type-columns';
        const p = document.createElement('p');
        p.textContent = "Testo colonna";
        colWrap.appendChild(p);
        mockEditor.appendChild(colWrap);

        const r = document.createRange();
        r.setStart(p.firstChild, 2);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        Editor.saveSelection();

        let alertShown = false;
        const origAlert = window.alert;
        window.alert = () => { alertShown = true; };

        try {
            await AudioManager.handleUpload(dummyInput);
            Assert.isTrue(alertShown, "Deve bloccare inserimento audio dentro colonne");
        } finally {
            window.alert = origAlert;
            colWrap.remove();
            AppState.assetsHandle = null;
        }
    });

    test("AudioManager: handleUpload su riga vuota sostituisce il blocco vuoto senza nidificarlo", async () => {
        AppState.assetsHandle = {};
        const validFile = { name: 'track.mp3', size: 1024 * 1024 };
        const dummyInput = { files: [validFile], value: 'fake' };

        mockEditor.innerHTML = '<p id="empty_p"><br></p>';
        const emptyP = mockEditor.querySelector('#empty_p');

        const r = document.createRange();
        r.setStart(emptyP, 0);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        Editor.saveSelection();

        const origSaveAsset = Store.saveAsset;
        Store.saveAsset = async () => 'aud_test_ref.mp3';

        if (!Editor.audioCache) Editor.audioCache = {};
        Editor.audioCache['aud_test_ref.mp3'] = 'blob:http://localhost/aud_mock';

        try {
            await AudioManager.handleUpload(dummyInput);
            Assert.isNull(mockEditor.querySelector('#empty_p'), "Il paragrafo vuoto deve essere stato rimpiazzato");
            const audioShell = mockEditor.querySelector('.widget-type-audio');
            Assert.isNotNull(audioShell);
            Assert.strictEqual(audioShell.querySelector('audio').getAttribute('data-audio-ref'), 'aud_test_ref.mp3');
        } finally {
            Store.saveAsset = origSaveAsset;
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

    test("AudioManager: openMenu costruisce il menu contestuale con opzioni download ed elimina", () => {
        const wrap = document.createElement('div');
        wrap.id = 'adv_audio_menu_test';
        wrap.className = 'adv-widget-shell widget-type-audio';
        wrap.innerHTML = '<div class="widget-header"><button id="adv-opt-btn-adv_audio_menu_test"></button></div><div class="widget-body"></div>';
        document.body.appendChild(wrap);

        let menuBuilt = false;
        let menuItemsCount = 0;

        const origBuild = UI.Menu.buildContextMenu;
        UI.Menu.buildContextMenu = (anchorId, items) => {
            menuBuilt = true;
            menuItemsCount = items.length;
        };

        try {
            AudioManager.openMenu(null, 'adv_audio_menu_test');
            Assert.isTrue(menuBuilt);
            Assert.strictEqual(menuItemsCount, 3, "Il menu contestuale deve contenere download, separatore e cancella");
        } finally {
            UI.Menu.buildContextMenu = origBuild;
            wrap.remove();
        }
    });

    test("AudioManager: mountAll assegna ID e idrata src da Editor.audioCache", () => {
        const wrap = document.createElement('div');
        wrap.className = 'adv-widget-shell widget-type-audio';
        wrap.innerHTML = `
            <div class="widget-header"><span class="adv-table-title">Canzone</span></div>
            <div class="widget-body"><audio data-audio-ref="aud_test_ref.mp3"></audio></div>
        `;
        mockEditor.appendChild(wrap);

        if (!Editor.audioCache) Editor.audioCache = {};
        Editor.audioCache['aud_test_ref.mp3'] = 'blob:http://localhost/aud_hydrated';

        try {
            AudioManager.mountAll(mockEditor);

            Assert.isTrue(wrap.id.startsWith('adv_audio_'), "Deve generare un ID adv_audio se mancante");
            Assert.strictEqual(wrap.getAttribute('contenteditable'), 'false');
            const audioEl = wrap.querySelector('audio');
            Assert.strictEqual(audioEl.src, 'blob:http://localhost/aud_hydrated');
        } finally {
            wrap.remove();
        }
    });

});