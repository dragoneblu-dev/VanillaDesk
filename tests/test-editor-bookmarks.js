/**
 * tests/test-editor-bookmarks.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-bookmarks
 * Conteggio test case: 15
 */

describe("Editor Bookmarks: Segnalibri, Timer 15 Minuti, Snooze & Appunti (15 Test)", () => {

    test("Editor: insertBookmark inserisce il marker con ID e data di piazzamento", () => {
        let editor = document.getElementById('noteContent');
        if (!editor) {
            editor = document.createElement('div');
            editor.id = 'noteContent';
            document.body.appendChild(editor);
        }
        editor.innerHTML = '<p>Testo con segnalibro</p>';

        const p = editor.querySelector('p');
        const range = document.createRange();
        range.selectNodeContents(p);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        Editor.insertBookmark();

        const marker = editor.querySelector('.adv-bookmark-marker');
        Assert.isNotNull(marker);
        Assert.isTrue(marker.id.startsWith('bkm_'));
        Assert.isTrue(marker.hasAttribute('data-date'));
    });

    test("Editor: addBookmarkTimer aggiunge 15 minuti di scadenza al segnalibro", () => {
        const marker = document.createElement('span');
        marker.id = 'bkm_timer_test';
        document.body.appendChild(marker);

        const before = Date.now();
        Editor.addBookmarkTimer('bkm_timer_test');

        const expire = parseInt(marker.getAttribute('data-timer-expire'), 10);
        Assert.isTrue(expire >= before + 899000 && expire <= before + 901000);
        marker.remove();
    });

    test("Editor: addBookmarkTimer cumula ulteriori 15 minuti se il timer è già attivo", () => {
        const marker = document.createElement('span');
        marker.id = 'bkm_timer_stack';
        const initialExpire = Date.now() + 600000; // 10 min nel futuro
        marker.setAttribute('data-timer-expire', initialExpire.toString());
        document.body.appendChild(marker);

        Editor.addBookmarkTimer('bkm_timer_stack');

        const expire = parseInt(marker.getAttribute('data-timer-expire'), 10);
        Assert.strictEqual(expire, initialExpire + 900000);
        marker.remove();
    });

    test("Editor: clearBookmarkTimer rimuove l'attributo data-timer-expire", () => {
        const marker = document.createElement('span');
        marker.id = 'bkm_timer_clr';
        marker.setAttribute('data-timer-expire', '123456789');
        document.body.appendChild(marker);

        Editor.clearBookmarkTimer('bkm_timer_clr');
        Assert.isNull(marker.getAttribute('data-timer-expire'));
        marker.remove();
    });

    test("Editor: snoozeBookmark calcola nuovo timestamp per nota corrente", () => {
        const marker = document.createElement('span');
        marker.className = 'adv-bookmark-marker';
        marker.id = 'bkm_snooze_live';
        const editor = document.getElementById('noteContent');
        editor.appendChild(marker);

        AppState.currentNoteId = 'note_snooze_live';
        AppState.notes = [{ id: 'note_snooze_live', title: 'Live', content: editor.innerHTML }];

        const now = Date.now();
        Editor.snoozeBookmark('note_snooze_live', 'bkm_snooze_live', 10);

        const exp = parseInt(marker.getAttribute('data-timer-expire'), 10);
        Assert.isTrue(exp >= now + 599000);
    });

    test("Editor: snoozeBookmark aggiorna il markup di note in background tramite regex", () => {
        const noteBg = {
            id: 'n_bg',
            title: 'Background',
            content: '<p>Testo <span id="bkm_bg" class="adv-bookmark-marker" data-timer-expire="100"></span> fine.</p>'
        };
        AppState.notes = [noteBg];
        AppState.currentNoteId = 'other_note';

        const now = Date.now();
        Editor.snoozeBookmark('n_bg', 'bkm_bg', 5);

        const match = noteBg.content.match(/data-timer-expire=["'](\d+)["']/);
        Assert.isNotNull(match);
        Assert.isTrue(parseInt(match[1], 10) >= now + 299000);
    });

    test("Bookmarks: deleteBookmark rimuove il segnalibro attivo e salva lo stato", () => {
        const marker = document.createElement('span');
        marker.className = 'adv-bookmark-marker';
        document.body.appendChild(marker);

        Editor.activeBookmark = marker;
        Editor.deleteBookmark();

        Assert.isFalse(document.body.contains(marker));
        Assert.isNull(Editor.activeBookmark);
    });

    test("Bookmarks: updateBookmarkMenuDisplay calcola minuti e secondi residui", () => {
        const popover = document.createElement('div');
        popover.id = 'adv-bookmark-popover';
        popover.innerHTML = '<span id="bkm-timer-display"></span><button id="bkm-timer-clear"></button>';
        document.body.appendChild(popover);

        const marker = document.createElement('span');
        const futureExp = Date.now() + 125000; // ~2 minuti e 5 secondi
        marker.setAttribute('data-timer-expire', futureExp.toString());

        Editor.activeBookmark = marker;
        Editor.updateBookmarkMenuDisplay(marker);

        const display = document.getElementById('bkm-timer-display');
        Assert.isTrue(display.innerHTML.includes('02:'));

        popover.remove();
        Editor.activeBookmark = null;
    });

    test("Bookmarks: updateBookmarkMenuDisplay nasconde pulsante azzera se non c'è timer", () => {
        const popover = document.createElement('div');
        popover.id = 'adv-bookmark-popover';
        popover.innerHTML = '<span id="bkm-timer-display"></span><button id="bkm-timer-clear" style="display:inline-flex;"></button>';
        document.body.appendChild(popover);

        const marker = document.createElement('span'); // Nessun data-timer-expire

        Editor.activeBookmark = marker;
        Editor.updateBookmarkMenuDisplay(marker);

        const clearBtn = document.getElementById('bkm-timer-clear');
        Assert.strictEqual(clearBtn.style.display, 'none');

        popover.remove();
        Editor.activeBookmark = null;
    });

    // =========================================================================
    // NUOVI TEST CASE (Funzionalità prima non coperte)
    // =========================================================================

    test("Bookmarks: getBookmarkComment estrae testo da .bookmark-comment-data o fallback data-comment", () => {
        Assert.strictEqual(Editor.getBookmarkComment(null), "");

        const markerSpan = document.createElement('span');
        markerSpan.innerHTML = '<span class="bookmark-comment-data">Nota da span</span>';
        Assert.strictEqual(Editor.getBookmarkComment(markerSpan), "Nota da span");

        const markerAttr = document.createElement('span');
        markerAttr.setAttribute('data-comment', 'Nota da attributo');
        Assert.strictEqual(Editor.getBookmarkComment(markerAttr), "Nota da attributo");
    });

    test("Bookmarks: hasBookmarkComment ritorna false se il commento contiene solo ZWS o spazi", () => {
        const marker = document.createElement('span');
        marker.innerHTML = '<span class="bookmark-comment-data">\u200B   \n  \u200B</span>';
        Assert.isFalse(Editor.hasBookmarkComment(marker));

        marker.innerHTML = '<span class="bookmark-comment-data">Nota Reale</span>';
        Assert.isTrue(Editor.hasBookmarkComment(marker));
    });

    test("Bookmarks: _buildBookmarkTooltip gestisce righe multiple e sanitizza caratteri HTML", () => {
        Assert.strictEqual(Editor._buildBookmarkTooltip(""), "");
        Assert.strictEqual(Editor._buildBookmarkTooltip("<p>\u200B</p>"), "");

        const input = "<p>Riga 1 & speciale</p><p>Riga 2 &lt;tag&gt;</p>";
        const res = Editor._buildBookmarkTooltip(input);
        Assert.isTrue(res.includes("Riga 1 &amp; speciale"));
        Assert.isTrue(res.includes("<br>"));
        Assert.isTrue(res.includes("Riga 2 &lt;tag&gt;"));
    });

    test("Bookmarks: deleteBookmark chiede conferma se il segnalibro contiene una nota e rispetta annullamento", () => {
        const marker = document.createElement('span');
        marker.className = 'adv-bookmark-marker';
        marker.innerHTML = '<span class="bookmark-comment-data">Nota Importante</span>';
        document.body.appendChild(marker);

        let confirmShown = false;
        const origConfirm = window.confirm;
        window.confirm = () => { confirmShown = true; return false; }; // L'utente rifiuta

        try {
            Editor.activeBookmark = marker;
            Editor.deleteBookmark();

            Assert.isTrue(confirmShown, "Deve mostrare il prompt di conferma prima di cancellare un segnalibro con note");
            Assert.isTrue(document.body.contains(marker), "Il segnalibro deve essere preservato se l'utente clicca Annulla");
        } finally {
            window.confirm = origConfirm;
            marker.remove();
            Editor.activeBookmark = null;
        }
    });

    test("Bookmarks: saveBookmarkComment aggiorna _isDirty a true e sincronizza la nota corrente", () => {
        const noteId = 'note_bkm_save_dirty_test';
        AppState.currentNoteId = noteId;
        AppState.notes = [{
            id: noteId,
            title: 'Test Dirty Bookmark',
            content: '<p><span id="bkm_target" class="adv-bookmark-marker"></span></p>',
            _isDirty: false
        }];

        const editorEl = document.getElementById('noteContent');
        editorEl.innerHTML = AppState.notes[0].content;

        const dummyInput = document.createElement('div');
        dummyInput.id = 'bookmarkCommentInput';
        dummyInput.innerHTML = 'Appunto test salvataggio';
        document.body.appendChild(dummyInput);

        try {
            Editor.saveBookmarkComment('bkm_target');

            const curNote = Store.getNote(noteId);
            Assert.isTrue(curNote._isDirty, "curNote._isDirty deve essere true dopo il salvataggio dell'appunto");
            Assert.isTrue(curNote.content.includes('Appunto test salvataggio'));
        } finally {
            dummyInput.remove();
        }
    });

    test("Bookmarks: insertBookmark con segnalibro commentato preesistente interroga confirm di importazione", () => {
        const editorEl = document.getElementById('noteContent');
        editorEl.innerHTML = '<p><span id="bkm_old" class="adv-bookmark-marker"><span class="bookmark-comment-data">Vecchio Appunto</span></span></p>';

        let confirmPrompted = false;
        const origConfirm = window.confirm;
        window.confirm = () => { confirmPrompted = true; return true; }; // Simula importazione confermata

        try {
            const p = editorEl.querySelector('p');
            const r = document.createRange();
            r.setStart(p.firstChild, 0);
            r.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);

            Editor.insertBookmark();

            Assert.isTrue(confirmPrompted, "Deve chiedere se importare l'appunto preesistente");
            const newMarker = editorEl.querySelector('.adv-bookmark-marker');
            Assert.isNotNull(newMarker);
            Assert.isTrue(newMarker.querySelector('.bookmark-comment-data').textContent.includes('Vecchio Appunto'));
        } finally {
            window.confirm = origConfirm;
        }
    });

});