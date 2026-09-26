/**
 * tests/test-table-manager-csv.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: table-manager-csv
 * Conteggio test case: 19
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("TableManager CSV: Import/Export, RFC 4180 & Conversione DB (19 Test)", () => {

    test("TableManager: _updateTablePreservingFormatting preserva colori (hl-c*), allineamenti e tag TH", () => {
            const container = document.createElement('div');
            const oldTable = document.createElement('table');
            oldTable.className = 'table-striped custom-class';
            oldTable.innerHTML = `
                <tbody>
                    <tr>
                        <th class="hl-c6 text-center">Header A</th>
                        <th class="text-right">Header B</th>
                    </tr>
                    <tr>
                        <td class="hl-c1 text-left">Dato 1</td>
                        <td class="hl-c10">Dato 2</td>
                    </tr>
                </tbody>
            `;
            container.appendChild(oldTable);

            // Simulazione aggiornamento da CSV: testi aggiornati mantenendo stessa dimensione 2x2
            const newCsvMatrix = [
                ['Header A Modificato', 'Header B Modificato'],
                ['Nuovo Valore 1', 'Nuovo Valore 2']
            ];

            TableManager.CSV._updateTablePreservingFormatting(oldTable, newCsvMatrix);
            const updatedTable = container.querySelector('table');

            // 1. Verifica preservazione classi generali tabella
            Assert.isTrue(updatedTable.classList.contains('table-striped'));
            Assert.isTrue(updatedTable.classList.contains('custom-class'));

            // 2. Verifica preservazione tag TH e classi sulla riga 0
            const th0 = updatedTable.rows[0].cells[0];
            Assert.strictEqual(th0.tagName.toLowerCase(), 'th');
            Assert.isTrue(th0.classList.contains('hl-c6'));
            Assert.isTrue(th0.classList.contains('text-center'));
            Assert.strictEqual(th0.innerHTML, 'Header A Modificato');

            // 3. Verifica preservazione classi e stili sulle righe TD
            const td0 = updatedTable.rows[1].cells[0];
            const td1 = updatedTable.rows[1].cells[1];
            Assert.strictEqual(td0.tagName.toLowerCase(), 'td');
            Assert.isTrue(td0.classList.contains('hl-c1'));
            Assert.isTrue(td0.classList.contains('text-left'));
            Assert.strictEqual(td0.innerHTML, 'Nuovo Valore 1');

            Assert.isTrue(td1.classList.contains('hl-c10'));
            Assert.strictEqual(td1.innerHTML, 'Nuovo Valore 2');
        });

    test("TableManager: _updateTablePreservingFormatting gestisce espansione righe e colonne con fallback sicuro", () => {
            const container = document.createElement('div');
            const oldTable = document.createElement('table');
            oldTable.innerHTML = `
                <tbody>
                    <tr><th>A</th></tr>
                    <tr><td>1</td></tr>
                </tbody>
            `;
            container.appendChild(oldTable);

            // Espansione da 2x1 a 3x2 (aggiunta una colonna e una riga)
            const expandedMatrix = [
                ['A', 'Colonna Nuova'],
                ['1', 'Dato Nuovo 1'],
                ['2', 'Dato Nuovo 2']
            ];

            TableManager.CSV._updateTablePreservingFormatting(oldTable, expandedMatrix);
            const updatedTable = container.querySelector('table');

            Assert.strictEqual(updatedTable.rows.length, 3);
            Assert.strictEqual(updatedTable.rows[0].cells.length, 2);

            // La nuova cella nella riga 0 deve ereditare il tag TH dall'intestazione esistente
            Assert.strictEqual(updatedTable.rows[0].cells[1].tagName.toLowerCase(), 'th');
            Assert.strictEqual(updatedTable.rows[0].cells[1].innerHTML, 'Colonna Nuova');

            // Le celle nelle nuove righe devono avere tag TD pulito
            Assert.strictEqual(updatedTable.rows[2].cells[0].tagName.toLowerCase(), 'td');
            Assert.strictEqual(updatedTable.rows[2].cells[1].tagName.toLowerCase(), 'td');
        });

    test("CSV: parsing griglia 2x2 con virgola", () => {
            const raw = "ColA,ColB\nVal1,Val2";
            const res = TableManager.CSV.parseFullCSV(raw, ',');
            Assert.strictEqual(res.length, 2);
            Assert.strictEqual(res[0][0], 'ColA');
            Assert.strictEqual(res[1][1], 'Val2');
        });

    test("CSV: parsing con punto e virgola (;)", () => {
            const raw = "Prodotto;Prezzo\nLibro;15";
            const res = TableManager.CSV.parseFullCSV(raw, ';');
            Assert.strictEqual(res.length, 2);
            Assert.strictEqual(res[1][0], 'Libro');
            Assert.strictEqual(res[1][1], '15');
        });

    test("CSV: parsing con tabulatore (TAB)", () => {
            const raw = "A\tB\tC\n1\t2\t3";
            const res = TableManager.CSV.parseFullCSV(raw, '\t');
            Assert.strictEqual(res.length, 2);
            Assert.strictEqual(res[1][2], '3');
        });

    test("CSV: celle vuote conservate nella matrice", () => {
            const raw = "A;B;C\n1;;3";
            const res = TableManager.CSV.parseFullCSV(raw, ';');
            Assert.strictEqual(res[1][1], '');
        });

    test("CSV: riga vuota finale ignorata o gestita correttamente", () => {
            const raw = "A;B\n1;2\n";
            const res = TableManager.CSV.parseFullCSV(raw, ';');
            Assert.isTrue(res.length >= 2);
        });

    test("CSV: virgolette protettive contenenti separatore", () => {
            const raw = 'ID;Descrizione\n1;"Roma; Italia; Europa"';
            const res = TableManager.CSV.parseFullCSV(raw, ';');
            Assert.strictEqual(res[1][1], 'Roma; Italia; Europa');
        });

    test("CSV: virgolette doppie escapate all'interno di testo quotato", () => {
            const raw = 'ID;Citazione\n1;"Disse ""Ciao"" a tutti"';
            const res = TableManager.CSV.parseFullCSV(raw, ';');
            Assert.strictEqual(res[1][1], 'Disse "Ciao" a tutti');
        });

    test("CSV: line breaks reali multilinea all'interno di cella quotata", () => {
            const raw = 'ID;Multi\n1;"Riga Uno\nRiga Due\nRiga Tre"';
            const res = TableManager.CSV.parseFullCSV(raw, ';');
            Assert.strictEqual(res.length, 2);
            Assert.strictEqual(res[1][1], 'Riga Uno\nRiga Due\nRiga Tre');
        });

    test("CSV: spazi esterni prima delle virgolette", () => {
            const raw = 'A;B\n1; "Test"';
            const res = TableManager.CSV.parseFullCSV(raw, ';');
            Assert.strictEqual(res[1][1].trim(), 'Test');
        });

    test("CSV Escape: testo piano senza caratteri speciali rimane inalterato", () => {
            Assert.strictEqual(TableManager.CSV.escapeCSV("TestoLibero", ";"), "TestoLibero");
        });

    test("CSV Escape: testo contenente il separatore viene avvolto da virgolette", () => {
            Assert.strictEqual(TableManager.CSV.escapeCSV("A;B", ";"), '"A;B"');
        });

    test("CSV Escape: virgolette interne vengono duplicate conformemente a RFC 4180", () => {
            Assert.strictEqual(TableManager.CSV.escapeCSV('Parola "Speciale"', ';'), '"Parola ""Speciale"""');
        });

    test("CSV Escape: presenza di ritorno a capo viene avvolta da virgolette", () => {
            Assert.strictEqual(TableManager.CSV.escapeCSV("Prima riga\nSeconda riga", ";"), '"Prima riga\nSeconda riga"');
        });

    test("CSV Escape: testo HTML viene purificato dai tag prima dell'escape", () => {
            Assert.strictEqual(TableManager.CSV.escapeCSV("<b>Grassetto</b>", ";"), "Grassetto");
        });

    test("SimpleTable: convertToDatabase blocca la conversione se la tabella contiene immagini o audio", () => {
            const table = document.createElement('table');
            table.innerHTML = `<tr><td><img src="test.png"></td></tr>`;
            TableManager.currentTable = table;

            let alertTriggered = false;
            const origAlert = window.alert;
            window.alert = () => { alertTriggered = true; };

            try {
                TableManager.CSV.convertToDatabase();
                Assert.isTrue(alertTriggered);
            } finally {
                window.alert = origAlert;
            }
        });

    test("SimpleTable: convertToDatabase blocca la conversione se sono presenti celle fuse (colspan/rowspan)", () => {
            const table = document.createElement('table');
            table.innerHTML = `<tr><td colspan="2">Fusa</td></tr>`;
            TableManager.currentTable = table;

            let alertTriggered = false;
            const origAlert = window.alert;
            window.alert = () => { alertTriggered = true; };

            try {
                TableManager.CSV.convertToDatabase();
                Assert.isTrue(alertTriggered);
            } finally {
                window.alert = origAlert;
            }
        });

    test("SimpleTable: getTableAsCSVText converte <br> in newline reali per export", () => {
            const table = document.createElement('table');
            table.innerHTML = `<tr><td>Riga 1<br>Riga 2</td><td>B</td></tr>`;
            const text = TableManager.CSV.getTableAsCSVText(table, ';');
            Assert.isTrue(text.includes('Riga 1\nRiga 2'));
        });

});
