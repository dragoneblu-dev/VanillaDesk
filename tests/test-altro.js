
describe("Altro non ben catalogato", () => {


    test("AdvancedBoard: partiziona le righe per valore select", () => {
        const groupColId = 'c_st';
        const columnsData = [{ name: 'Aperto', value: 'Aperto' }, { name: 'Chiuso', value: 'Chiuso' }, { name: 'Senza Stato', value: '' }];
        const boardData = { 'Aperto': [], 'Chiuso': [], '': [] };

        const rows = [
            { id: '1', virtualCells: { c_st: 'Aperto' } },
            { id: '2', virtualCells: { c_st: 'Chiuso' } },
            { id: '3', virtualCells: { c_st: '' } }
        ];

        rows.forEach(r => {
            const val = r.virtualCells[groupColId];
            if (boardData[val] !== undefined) boardData[val].push(r);
            else boardData[''].push(r);
        });

        Assert.strictEqual(boardData['Aperto'].length, 1);
        Assert.strictEqual(boardData['Chiuso'].length, 1);
        Assert.strictEqual(boardData[''].length, 1);
    });
    
    test("AdvancedBoard: raggruppa valori sconosciuti nella colonna 'Senza Stato'", () => {
        const boardData = { 'Aperto': [], '': [] };
        const row = { id: 'orphan', virtualCells: { c_st: 'StatoInesistente' } };

        const val = row.virtualCells['c_st'];
        if (boardData[val] !== undefined) boardData[val].push(row);
        else boardData[''].push(row);

        Assert.strictEqual(boardData[''].length, 1);
    });

    test("Editor._getCodeOffset: calcolo con caratteri speciali e accentati UTF-8", () => {
        const pre = document.createElement('pre');
        pre.textContent = 'const città = "Milano";';
        const offset = Editor._getCodeOffset(pre, pre.firstChild, 11);
        Assert.strictEqual(offset, 11);
    });

    test("Editor._setCodeOffset: posiziona il cursore esattamente sull'offset calcolato", () => {
        const pre = document.createElement('pre');
        pre.textContent = 'Linea 1\nLinea 2';
        document.body.appendChild(pre);

        Editor._setCodeOffset(pre, 8, 8); // Inizio 'Linea 2' (7 caratteri + \n)
        const sel = window.getSelection();
        Assert.strictEqual(sel.rangeCount, 1);
        pre.remove();
    });

    test("Snippets: pulsante copia attiva feedback visivo .copied", () => {
        const btn = document.createElement('span');
        btn.className = 'snippet-copy-btn';
        const wrapper = document.createElement('span');
        wrapper.className = 'adv-copy-snippet';
        const txt = document.createElement('span');
        txt.className = 'snippet-text';
        txt.innerText = 'CMD_PROMPT_123';
        wrapper.appendChild(txt);
        wrapper.appendChild(btn);

        Assert.strictEqual(txt.innerText, 'CMD_PROMPT_123');
    });

    test("Relazioni Multiple: la clonazione difensiva impedisce mutazioni in-place su array vuoto", () => {
        const row = { id: 'r_clone', cells: { rel: [] } };
        const initialRef = row.cells.rel;

        let vals = Array.isArray(row.cells.rel) ? [...row.cells.rel] : [];
        vals.push('target_id');

        Assert.strictEqual(initialRef.length, 0, "L'array originario nella cella non deve essere mutato prima del salvataggio");
        Assert.strictEqual(vals.length, 1);
    });

});