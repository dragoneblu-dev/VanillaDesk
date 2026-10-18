/**
 * tests/test-events-drag.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: events-drag (Sottomodulo di EventsGlobal)
 * Conteggio test case: 10
 */

describe("EventsDrag: Drag Assist Engine, Scudo CSS & Coordinate Gutter (10 Test)", () => {

    let mockEditorEl;
    let mockScrollArea;

    beforeEach(() => {
        mockEditorEl = document.getElementById('noteContent');
        if (!mockEditorEl) {
            mockEditorEl = document.createElement('div');
            mockEditorEl.id = 'noteContent';
            document.body.appendChild(mockEditorEl);
        } else {
            mockEditorEl.innerHTML = '';
        }

        mockScrollArea = document.getElementById('editorScrollContent');
        if (!mockScrollArea) {
            mockScrollArea = document.createElement('div');
            mockScrollArea.id = 'editorScrollContent';
            mockScrollArea.className = 'editor-scroll-content';
            document.body.appendChild(mockScrollArea);
        }
    });

    afterEach(() => {
        EventsGlobal.stopDragAssist();
        EventsGlobal.hideDropIndicator();

        if (mockEditorEl) mockEditorEl.innerHTML = '';

        const shield = document.getElementById('drag-shield-style');
        if (shield) shield.remove();

        const indicator = document.getElementById('adv-drop-indicator');
        if (indicator) indicator.remove();
    });

    test("EventsDrag: toggleDragShield inietta ed elimina lo scudo CSS nel tag head", () => {
        EventsGlobal.toggleDragShield(true, 'database');
        let shield = document.getElementById('drag-shield-style');
        Assert.isNotNull(shield);
        Assert.isTrue(shield.innerHTML.includes('pointer-events: none !important'));

        EventsGlobal.toggleDragShield(false, null);
        shield = document.getElementById('drag-shield-style');
        Assert.isNull(shield);
    });

    test("EventsDrag: toggleDragShield esclude esplicitamente la buttonbar dallo scudo protettivo", () => {
        EventsGlobal.toggleDragShield(true, 'buttonbar');
        const shield = document.getElementById('drag-shield-style');
        Assert.isNotNull(shield);
        Assert.isTrue(shield.innerHTML.includes('.adv-widget-shell:not(.widget-type-buttonbar)'));
    });

    test("EventsDrag: stopDragAssist arresta lo scudo CSS e annulla il timer di scorrimento a 60FPS", () => {
        EventsGlobal.toggleDragShield(true, 'database');
        EventsGlobal._dragScrollTimer = 12345;

        EventsGlobal.stopDragAssist();

        Assert.isNull(document.getElementById('drag-shield-style'));
        Assert.isNull(EventsGlobal._dragScrollTimer);
    });

    test("EventsDrag: hideDropIndicator imposta lo stile display su 'none'", () => {
        let indicator = document.getElementById('adv-drop-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'adv-drop-indicator';
            document.body.appendChild(indicator);
        }
        indicator.style.display = 'block';

        EventsGlobal.hideDropIndicator();
        Assert.strictEqual(indicator.style.display, 'none');
    });

    test("EventsDrag: findBlockAtY individua il blocco paragrafo corrispondente alla coordinata clientY", () => {
        const p1 = document.createElement('p');
        p1.textContent = "Paragrafo 1";
        const p2 = document.createElement('p');
        p2.textContent = "Paragrafo 2";
        mockEditorEl.appendChild(p1);
        mockEditorEl.appendChild(p2);

        p1.getBoundingClientRect = () => ({ top: 100, bottom: 150 });
        p2.getBoundingClientRect = () => ({ top: 151, bottom: 200 });

        const matched = EventsGlobal.findBlockAtY(mockEditorEl, 125);
        Assert.strictEqual(matched, p1);

        const matched2 = EventsGlobal.findBlockAtY(mockEditorEl, 180);
        Assert.strictEqual(matched2, p2);
    });

    test("EventsDrag: findBlockAtY scende all'interno di liste UL/OL per restituire il singolo elemento LI", () => {
        const ul = document.createElement('ul');
        const li1 = document.createElement('li');
        li1.textContent = "Task 1";
        const li2 = document.createElement('li');
        li2.textContent = "Task 2";
        ul.appendChild(li1);
        ul.appendChild(li2);
        mockEditorEl.appendChild(ul);

        ul.getBoundingClientRect = () => ({ top: 50, bottom: 150 });
        li1.getBoundingClientRect = () => ({ top: 50, bottom: 99 });
        li2.getBoundingClientRect = () => ({ top: 100, bottom: 150 });

        const matchedLi = EventsGlobal.findBlockAtY(mockEditorEl, 120);
        Assert.strictEqual(matchedLi, li2);
    });

    test("EventsDrag: findBlockAtY restituisce il primo elemento se il click avviene al di sopra del primo blocco", () => {
        const p = document.createElement('p');
        p.textContent = "Testo inizio";
        mockEditorEl.appendChild(p);
        p.getBoundingClientRect = () => ({ top: 100, bottom: 150 });

        const matched = EventsGlobal.findBlockAtY(mockEditorEl, 40);
        Assert.strictEqual(matched, p);
    });

    test("EventsDrag: findBlockAtY restituisce null se il click avviene nello spazio vuoto sotto l'ultimo blocco", () => {
        const p = document.createElement('p');
        p.textContent = "Fine";
        mockEditorEl.appendChild(p);
        p.getBoundingClientRect = () => ({ top: 100, bottom: 150 });

        const matched = EventsGlobal.findBlockAtY(mockEditorEl, 300);
        Assert.isNull(matched);
    });

    test("EventsDrag: dragstart cattura l'ID e il tipo di un widget shell complesso", () => {
        AppState.isEditMode = true;

        const widget = document.createElement('div');
        widget.id = 'adv_tbl_12345';
        widget.className = 'adv-widget-shell adv-table-wrapper';
        widget.setAttribute('data-widget-type', 'database');
        mockEditorEl.appendChild(widget);

        EventsGlobal.initDragAndDrop(mockEditorEl, mockScrollArea);

        const dragEvent = new Event('dragstart', { bubbles: true, cancelable: true });
        dragEvent.dataTransfer = {
            effectAllowed: '',
            setData: () => {}
        };

        widget.dispatchEvent(dragEvent);

        Assert.strictEqual(AppState.draggedBlockId, 'adv_tbl_12345');
        Assert.strictEqual(AppState.draggedBlockType, 'database');
    });

    test("EventsDrag: dragstart impedisce il trascinamento se l'elemento appartiene a una citazione (block-citation)", () => {
        AppState.isEditMode = true;

        const citation = document.createElement('div');
        citation.className = 'block-citation';
        const innerText = document.createElement('p');
        innerText.textContent = "Testo citato";
        citation.appendChild(innerText);
        mockEditorEl.appendChild(citation);

        EventsGlobal.initDragAndDrop(mockEditorEl, mockScrollArea);

        let defaultPrevented = false;
        const dragEvent = new Event('dragstart', { bubbles: true, cancelable: true });
        dragEvent.preventDefault = () => { defaultPrevented = true; };

        innerText.dispatchEvent(dragEvent);
        Assert.isTrue(defaultPrevented);
    });

});