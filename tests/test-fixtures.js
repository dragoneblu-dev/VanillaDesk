/**
 * tests/test-fixtures.js
 * Ambiente Condiviso e Fixtures Globali per le Suite di Test di VanillaDesk.
 */

(function() {
    // 1. Colonne e Schema standard per le formule
    window.cols = [
        { id: 'c_qta', name: 'Quantità', type: 'number' },
        { id: 'c_prezzo', name: 'Prezzo', type: 'number' },
        { id: 'c_iva', name: 'IVA', type: 'number' },
        { id: 'c_sconto', name: 'Sconto', type: 'number' },
        { id: 'c_prod', name: 'Prodotto', type: 'text' },
        { id: 'c_cat', name: 'Categoria', type: 'select' },
        { id: 'c_cod', name: 'Codice', type: 'text' }
    ];

    // 2. Record standard di test per le formule
    window.row = {
        id: 'r_main',
        cells: {
            c_qta: 4,
            c_prezzo: 25.5,
            c_iva: 0.22,
            c_sconto: 10,
            c_prod: 'Laptop Dell XPS',
            c_cat: 'Informatica',
            c_cod: 'IT-9876-X'
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    // 3. Definizioni tipizzate per il LogicEngine
    window.numCol = { id: 'c_n', name: 'Numero', type: 'number' };
    window.txtCol = { id: 'c_t', name: 'Testo', type: 'text' };
    window.chkCol = { id: 'c_b', name: 'Flag', type: 'checkbox' };
    window.tagCol = { id: 'c_m', name: 'Tag', type: 'multi-select' };
    window.dateCol = { id: 'c_d', name: 'Data', type: 'date', hasEndDate: false };
    window.rangeCol = { id: 'c_r', name: 'Range', type: 'date', hasEndDate: true };

    // 4. Inizializzazione protettiva per WorkflowApp
    if (typeof window.WorkflowApp !== 'undefined') {
        window.WorkflowApp.layout = {
            zoom: 1,
            pan: { x: 0, y: 0 },
            connectionStyle: 'orthogonal',
            relationDirection: 'successor',
            locked: false,
            nodes: {}
        };
    }

    // 5. Guardia difensiva per prevenire eccezioni asincrone di setState(id, null)
    if (typeof window.AdvancedTable !== 'undefined') {
        const origSetState = window.AdvancedTable.setState;
        window.AdvancedTable.setState = function(tableId, state) {
            if (!state) return;
            return origSetState.apply(this, arguments);
        };
    }
})();