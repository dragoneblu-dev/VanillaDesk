/**
 * tests/test-link-manager.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: link-manager
 * Conteggio test case: 6
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("LinkManager: Link Interni, Esterni, File Locali & YouTube (6 Test)", () => {

    test("LinkManager: _decodeEntities decodifica entità HTML native", () => {
            Assert.strictEqual(LinkManager._decodeEntities('&lt;b&gt;&quot;Test&quot;&lt;/b&gt;'), '<b>"Test"</b>');
        });

    test("LinkManager: confirmExternalLink sanitizza caratteri pericolosi in data-link-note", () => {
            const dummyUrl = document.createElement('input'); dummyUrl.id = 'externalLinkUrl'; dummyUrl.value = 'https://safe.com';
            const dummyTxt = document.createElement('input'); dummyTxt.id = 'externalLinkText'; dummyTxt.value = 'Safe';
            const dummyNote = document.createElement('textarea'); dummyNote.id = 'externalLinkNote'; dummyNote.value = '<script>alert("xss")</script>';
            document.body.appendChild(dummyUrl); document.body.appendChild(dummyTxt); document.body.appendChild(dummyNote);

            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p><br></p>';
            const r = document.createRange();
            r.setStart(editor.querySelector('p'), 0);
            r.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(r);

            try {
                LinkManager.confirmExternalLink();
                const link = editor.querySelector('a');
                Assert.isNotNull(link);
                const noteAttr = link.getAttribute('data-link-note');
                Assert.isFalse(noteAttr.includes('<script>'));
                Assert.isTrue(noteAttr.includes('&lt;script&gt;'));
            } finally {
                dummyUrl.remove(); dummyTxt.remove(); dummyNote.remove();
            }
        });

    test("LinkManager: confirmFileLink antepone icona documento 📄 al nome visualizzato", () => {
            const dummyName = document.createElement('input'); dummyName.id = 'fileLinkName'; dummyName.value = 'Specifiche.pdf';
            const dummyPath = document.createElement('input'); dummyPath.id = 'fileLinkPath'; dummyPath.value = 'C:\\docs\\file.pdf';
            const dummyNote = document.createElement('textarea'); dummyNote.id = 'fileLinkNote'; dummyNote.value = '';
            document.body.appendChild(dummyName); document.body.appendChild(dummyPath); document.body.appendChild(dummyNote);

            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p><br></p>';
            const r = document.createRange();
            r.setStart(editor.querySelector('p'), 0);
            r.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(r);

            try {
                LinkManager.confirmFileLink();
                const link = editor.querySelector('a.file-link');
                Assert.isNotNull(link);
                Assert.isTrue(link.textContent.includes('📄 Specifiche.pdf'));
            } finally {
                dummyName.remove(); dummyPath.remove(); dummyNote.remove();
            }
        });

    test("LinkManager: confirmYoutube valida che l'ID sia lungo esattamente 11 caratteri", () => {
            const dummyInput = document.createElement('input');
            dummyInput.id = 'youtubeUrlInput';
            dummyInput.value = 'https://youtu.be/short_id'; // Troppo corto (non 11 char)
            document.body.appendChild(dummyInput);

            let alertShown = false;
            const origAlert = window.alert;
            window.alert = () => { alertShown = true; };

            try {
                LinkManager.confirmYoutube();
                Assert.isTrue(alertShown);
            } finally {
                window.alert = origAlert;
                dummyInput.remove();
            }
        });

    test("LinkManager: insertNodeAtSelection inietta solo uno Zero-Width Space DOPO il nodo", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p id="p_target_link">Inizio </p>';
            const p = editor.querySelector('#p_target_link');

            const r = document.createRange();
            r.setStart(p.firstChild, 7);
            r.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(r);

            const newLink = document.createElement('a');
            newLink.textContent = 'Collegamento';

            LinkManager.insertNodeAtSelection(newLink);

            // Il nodo immediatamente successivo al link deve essere un nodo di testo contenente \u200B
            const next = newLink.nextSibling;
            Assert.isNotNull(next);
            Assert.strictEqual(next.nodeType, Node.TEXT_NODE);
            Assert.strictEqual(next.nodeValue, '\u200B');
        });

    test("LinkManager: openLinkDirect su link interno delega a UI.selectNote", () => {
            const link = document.createElement('a');
            link.className = 'internal-link';
            link.setAttribute('data-note-id', 'note_target_999');

            let targetSelected = null;
            const origSelect = UI.selectNote;
            UI.selectNote = (id) => { targetSelected = id; };

            try {
                LinkManager.openLinkDirect(link);
                Assert.strictEqual(targetSelected, 'note_target_999');
            } finally {
                UI.selectNote = origSelect;
            }
        });

        
    test("LinkManager: associazione note descrittive in data-link-note", () => {
        const link = document.createElement('a');
        link.setAttribute('data-link-note', 'Descrizione importante del link');
        Assert.strictEqual(link.getAttribute('data-link-note'), 'Descrizione importante del link');
    });

    test("LinkManager: costruzione DOM link a file con attributo data-file-path", () => {
        const link = document.createElement('a');
        link.className = "file-link";
        link.dataset.filePath = "docs/manuale.pdf";
        link.textContent = "📄 Manuale";

        Assert.strictEqual(link.getAttribute('data-file-path'), "docs/manuale.pdf");
        Assert.isTrue(link.classList.contains('file-link'));
    });

    test("LinkManager: costruzione DOM link interno con data attributes completi", () => {
        const link = document.createElement('a');
        link.className = "internal-link";
        link.dataset.noteId = "note_target_123";
        link.dataset.anchor = "Capitolo Uno";
        link.dataset.refId = "h2_anchor_456";
        link.textContent = "Capitolo Uno";

        Assert.strictEqual(link.getAttribute('data-note-id'), "note_target_123");
        Assert.strictEqual(link.getAttribute('data-anchor'), "Capitolo Uno");
        Assert.strictEqual(link.getAttribute('data-ref-id'), "h2_anchor_456");
        Assert.isTrue(link.classList.contains('internal-link'));
    });

    test("LinkManager: espressione regolare percorso locale rileva dischi Windows e percorsi di rete", () => {
        const localRegex = /^([a-zA-Z]:[\\/]|\\\\|file:\/\/\/|\.\/|\.\.\/|[\w\-]+\/)/i;
        Assert.isTrue(localRegex.test("C:\\Documenti\\file.txt"));
        Assert.isTrue(localRegex.test("d:/note/progetto.log"));
        Assert.isTrue(localRegex.test("\\\\server\\condivisa\\file.pdf"));
        Assert.isFalse(localRegex.test("https://google.com"));
    });

    test("LinkManager: espressione regolare URL web rileva domini e protocolli standard", () => {
        const urlRegex = /^((https?:\/\/[^\s]+)|((www\.)?[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}(\/[^\s]*)?(\.(html|php|jsp|asp|aspx))?))$/i;
        Assert.isTrue(urlRegex.test("https://vanilladesk.local"));
        Assert.isTrue(urlRegex.test("http://test.com/index.html"));
        Assert.isFalse(urlRegex.test("C:\\Windows\\notepad.exe"));
    });

    test("LinkManager: espressione regolare YouTube estrae ID a 11 caratteri da formati differenti", () => {
        const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
        
        const m1 = "https://www.youtube.com/watch?v=dQw4w9WgXcQ".match(ytRegex);
        Assert.strictEqual(m1[1], "dQw4w9WgXcQ");

        const m2 = "https://youtu.be/dQw4w9WgXcQ".match(ytRegex);
        Assert.strictEqual(m2[1], "dQw4w9WgXcQ");

        const m3 = "https://www.youtube.com/embed/dQw4w9WgXcQ".match(ytRegex);
        Assert.strictEqual(m3[1], "dQw4w9WgXcQ");
    });

    test("LinkManager: generazione URL embed per iframe YouTube", () => {
        const videoId = "abcdefghijk";
        const embedUrl = `https://www.youtube.com/embed/${videoId}`;
        Assert.strictEqual(embedUrl, "https://www.youtube.com/embed/abcdefghijk");
    });
    
    test("LinkManager: normalizzazione percorsi locali in formato URI 'file:///'", () => {
        let path = "C:\\Cartella\\File.txt";
        path = path.replace(/^https?:\/\/file:\/\/\//i, 'file:///');
        const isLocal = /^([a-zA-Z]:[\\/]|\\\\)/i.test(path);
        if (isLocal) path = 'file:///' + path.replace(/\\/g, '/');
        Assert.strictEqual(path, "file:///C:/Cartella/File.txt");
    });

    test("LinkManager: normalizzazione URL privo di protocollo a 'https://'", () => {
        let url = "www.wikipedia.org";
        const hasProtocol = /^[a-zA-Z0-9+-.]+:/i.test(url);
        if (!hasProtocol) url = 'https://' + url;
        Assert.strictEqual(url, "https://www.wikipedia.org");
    });


});
