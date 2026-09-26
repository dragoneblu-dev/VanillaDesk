/**
 * tests/test-editor-bookmarks.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: editor-bookmarks
 * Conteggio test case: 9
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("Editor Bookmarks: Segnalibri, Timer 15 Minuti, Snooze & Appunti (9 Test)", () => {

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

});
