/**
 * tests/test-image-manager.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: image-manager
 * Conteggio test case: 5
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("ImageManager: Resizing Overlay, Allineamento & Compressione (5 Test)", () => {

    test("ImageManager: alignImage 'center' imposta display: block e margin: 10px auto", () => {
            const img = document.createElement('img');
            ImageManager.activeImage = img;

            ImageManager.alignImage('center');
            Assert.strictEqual(img.style.display, 'block');
            Assert.strictEqual(img.style.margin, '10px auto');
        });

    test("ImageManager: alignImage 'left' imposta float: left con margine destro", () => {
            const img = document.createElement('img');
            ImageManager.activeImage = img;

            ImageManager.alignImage('left');
            Assert.strictEqual(img.style.float, 'left');
            Assert.strictEqual(img.style.margin, '10px 15px 10px 0px');
        });

    test("ImageManager: alignImage 'right' imposta float: right con margine sinistro", () => {
            const img = document.createElement('img');
            ImageManager.activeImage = img;

            ImageManager.alignImage('right');
            Assert.strictEqual(img.style.float, 'right');
            Assert.strictEqual(img.style.margin, '10px 0px 10px 15px');
        });

    test("ImageManager: compressImage avvisa se non è presente un Workspace collegato", async () => {
            const img = document.createElement('img');
            img.setAttribute('data-image-ref', 'img_test.jpg');
            ImageManager.activeImage = img;

            AppState.assetsHandle = null; // Nessun workspace fisico

            let alertShown = false;
            const origAlert = window.alert;
            window.alert = () => { alertShown = true; };

            try {
                await ImageManager.compressImage();
                Assert.isTrue(alertShown);
            } finally {
                window.alert = origAlert;
                ImageManager.activeImage = null;
            }
        });

    test("ImageManager: hideFloatingMenu rimuove popover dal DOM", () => {
            const popover = document.createElement('div');
            popover.id = 'adv-image-popover';
            document.body.appendChild(popover);

            ImageManager.hideFloatingMenu();
            Assert.isNull(document.getElementById('adv-image-popover'));
        });

});
