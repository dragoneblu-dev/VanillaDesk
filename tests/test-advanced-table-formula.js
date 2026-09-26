/**
 * tests/test-advanced-table-formula.js
 * Suite Modulare di Collaudo Unitario e di Integrazione.
 * Modulo testato: advanced-table-formula
 * Conteggio test case: 103
 * Generato automaticamente il: 2026-09-25 11:19:11
 */

describe("AdvancedTable Formula: Motore Sandbox, IIFE & Wrapper Aritmetici (103 Test)", () => {

    test("Aritmetica: addizione semplice", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('riga["Quantità"] + 6', row, cols, 'tbl', 'Ordini', row.cells)), 10);
        });

    test("Aritmetica: sottrazione semplice", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('riga["Prezzo"] - 5.5', row, cols, 'tbl', 'Ordini', row.cells)), 20);
        });

    test("Aritmetica: moltiplicazione tra due colonne", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('riga["Quantità"] * 2.5', row, cols, 'tbl', 'Ordini', row.cells)), 10);
        });

    test("Aritmetica: divisione esatta con virgola", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('riga["Quantità"] / 2', row, cols, 'tbl', 'Ordini', row.cells)), 2);
        });

    test("Aritmetica: operatore modulo (resto divisione)", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('riga["Quantità"] % 3', row, cols, 'tbl', 'Ordini', row.cells)), 1);
        });

    test("Aritmetica: precedenza tra moltiplicazione e addizione", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('2 + 3 * 4', row, cols, 'tbl', 'Ordini', row.cells)), 14);
        });

    test("Aritmetica: forzatura precedenza tramite parentesi tonde", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('(2 + 3) * 4', row, cols, 'tbl', 'Ordini', row.cells)), 20);
        });

    test("Aritmetica: esponente tramite operatore **", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('riga["Quantità"] ** 2', row, cols, 'tbl', 'Ordini', row.cells)), 16);
        });

    test("Aritmetica: calcolo totale con scorporo sconto e applicazione IVA", () => {
            const formula = '((riga["Prezzo"] * riga["Quantità"]) - riga["Sconto"]) * (1 + riga["IVA"])';
            const expected = ((25.5 * 4) - 10) * 1.22; // 92 * 1.22 = 112.24
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula(formula, row, cols, 'tbl', 'Ordini', row.cells)), 112.24);
        });

    test("Math: Math.round arrotonda all'intero più vicino per eccesso", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('Math.round(4.6)', row, cols, 'tbl', 'Ordini', row.cells)), 5);
        });

    test("Math: Math.round arrotonda all'intero più vicino per difetto", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('Math.round(4.4)', row, cols, 'tbl', 'Ordini', row.cells)), 4);
        });

    test("Math: Math.floor forza il troncamento verso il basso", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('Math.floor(4.99)', row, cols, 'tbl', 'Ordini', row.cells)), 4);
        });

    test("Math: Math.ceil forza l'arrotondamento verso l'alto", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('Math.ceil(4.01)', row, cols, 'tbl', 'Ordini', row.cells)), 5);
        });

    test("Math: Math.abs converte numeri negativi in positivi", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('Math.abs(-45.8)', row, cols, 'tbl', 'Ordini', row.cells)), 45.8);
        });

    test("Math: Math.sqrt radice quadrata di un valore", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('Math.sqrt(riga["Quantità"] * 4)', row, cols, 'tbl', 'Ordini', row.cells)), 4);
        });

    test("Math: Math.max seleziona il picco più alto", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('Math.max(12, 99, 4, 32)', row, cols, 'tbl', 'Ordini', row.cells)), 99);
        });

    test("Math: Math.min seleziona il valore più basso", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('Math.min(12, 99, 4, 32)', row, cols, 'tbl', 'Ordini', row.cells)), 4);
        });

    test("SOMMA: calcolo con 2 argomenti numerici", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('SOMMA(10, 25)', row, cols, 'tbl', 'Ordini', row.cells)), 35);
        });

    test("SOMMA: calcolo con 5 argomenti numerici misti", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('SOMMA(1, 2, 3, 4, 5)', row, cols, 'tbl', 'Ordini', row.cells)), 15);
        });

    test("SOMMA: gestione argomenti passati come stringhe numeriche", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('SOMMA("10", "20")', row, cols, 'tbl', 'Ordini', row.cells)), 30);
        });

    test("SOMMA: gestione valori nulli o non definiti come zero", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('SOMMA(10, null, undefined, 5)', row, cols, 'tbl', 'Ordini', row.cells)), 15);
        });

    test("SOMMA: aggregazione su array di oggetti indicando il nome campo", () => {
            const lista = [{ val: 10 }, { val: 25 }, { val: 15 }];
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('SOMMA(' + JSON.stringify(lista) + ', "val")', row, cols, 'tbl', 'Ordini', row.cells)), 50);
        });

    test("MEDIA: calcolo media su numeri singoli", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('MEDIA(10, 20, 30)', row, cols, 'tbl', 'Ordini', row.cells)), 20);
        });

    test("MEDIA: calcolo con decimali", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('MEDIA(10, 15)', row, cols, 'tbl', 'Ordini', row.cells)), 12.5);
        });

    test("MEDIA: aggregazione su array di oggetti", () => {
            const lista = [{ voto: 8 }, { voto: 6 }, { voto: 10 }];
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('MEDIA(' + JSON.stringify(lista) + ', "voto")', row, cols, 'tbl', 'Ordini', row.cells)), 8);
        });

    test("MEDIA: lista vuota ritorna 0 senza errori di divisione per zero", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('MEDIA()', row, cols, 'tbl', 'Ordini', row.cells)), 0);
        });

    test("CONTA: occorrenze esatte di stringhe in array primitivo", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('CONTA(["A", "B", "A", "C"], null, "A")', row, cols, 'tbl', 'Ordini', row.cells)), 2);
        });

    test("CONTA: occorrenze esatte di numeri in array", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('CONTA([10, 20, 10, 30], null, 10)', row, cols, 'tbl', 'Ordini', row.cells)), 2);
        });

    test("CONTA: conteggio condizionale su array di oggetti per colonna specifica", () => {
            const rowsMock = [{ stato: 'Aperto' }, { stato: 'Chiuso' }, { stato: 'Aperto' }];
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('CONTA(' + JSON.stringify(rowsMock) + ', "stato", "Aperto")', row, cols, 'tbl', 'Ordini', row.cells)), 2);
        });

    test("CERCA: scansione dizionario e ritorno campo trovato", () => {
            const rubrica = [{ id: '1', tel: '111' }, { id: '2', tel: '222' }];
            Assert.strictEqual(AdvancedTable.evaluateFormula('CERCA(' + JSON.stringify(rubrica) + ', "id", "2", "tel")', row, cols, 'tbl', 'Ordini', row.cells), '222');
        });

    test("CERCA: valore non trovato ritorna stringa vuota senza crash", () => {
            const rubrica = [{ id: '1', tel: '111' }];
            Assert.strictEqual(AdvancedTable.evaluateFormula('CERCA(' + JSON.stringify(rubrica) + ', "id", "999", "tel")', row, cols, 'tbl', 'Ordini', row.cells), '');
        });

    test("UNISCI: unione stringhe singole con separatore predefinito", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('UNISCI("A", "B", "C")', row, cols, 'tbl', 'Ordini', row.cells), 'ABC');
        });

    test("UNISCI: array di oggetti estraendo colonna e applicando separatore custom", () => {
            const items = [{ n: 'Milano' }, { n: 'Roma' }, { n: 'Napoli' }];
            Assert.strictEqual(AdvancedTable.evaluateFormula('UNISCI(' + JSON.stringify(items) + ', "n", " - ")', row, cols, 'tbl', 'Ordini', row.cells), 'Milano - Roma - Napoli');
        });

    test("SE: condizione vera restituisce primo parametro", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('SE(true, "SI", "NO")', row, cols, 'tbl', 'Ordini', row.cells), 'SI');
        });

    test("SE: condizione falsa restituisce secondo parametro", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('SE(false, "SI", "NO")', row, cols, 'tbl', 'Ordini', row.cells), 'NO');
        });

    test("SE: confronto logico tra colonna numerica e costante", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('SE(riga["Quantità"] >= 4, "OK", "MIN")', row, cols, 'tbl', 'Ordini', row.cells), 'OK');
        });

    test("SE: operatore logico AND (&&) combinato", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('SE(riga["Quantità"] === 4 && riga["Prezzo"] > 20, "Trovato", "No")', row, cols, 'tbl', 'Ordini', row.cells), 'Trovato');
        });

    test("SE: operatore logico OR (||) combinato", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('SE(riga["Quantità"] === 99 || riga["Prezzo"] > 20, "Trovato", "No")', row, cols, 'tbl', 'Ordini', row.cells), 'Trovato');
        });

    test("String: concatenazione stringa e numero con cast automatico", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('riga["Prodotto"] + " Qt." + riga["Quantità"]', row, cols, 'tbl', 'Ordini', row.cells), 'Laptop Dell XPS Qt.4');
        });

    test("String: toUpperCase converte l'intera stringa", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('String(riga["Prodotto"]).toUpperCase()', row, cols, 'tbl', 'Ordini', row.cells), 'LAPTOP DELL XPS');
        });

    test("String: toLowerCase converte l'intera stringa", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('String(riga["Categoria"]).toLowerCase()', row, cols, 'tbl', 'Ordini', row.cells), 'informatica');
        });

    test("String: trim elimina spazi periferici", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('"  test  ".trim()', row, cols, 'tbl', 'Ordini', row.cells), 'test');
        });

    test("String: includes rileva sottostringa presente", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('String(riga["Prodotto"]).includes("Dell")', row, cols, 'tbl', 'Ordini', row.cells), 'true');
        });

    test("String: includes rileva sottostringa assente", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('String(riga["Prodotto"]).includes("Apple")', row, cols, 'tbl', 'Ordini', row.cells), 'false');
        });

    test("String: slice estrae intervallo di caratteri", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('String(riga["Codice"]).slice(0, 2)', row, cols, 'tbl', 'Ordini', row.cells), 'IT');
        });

    test("String: replace sostituisce prima occorrenza", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('String(riga["Codice"]).replace("IT", "EU")', row, cols, 'tbl', 'Ordini', row.cells), 'EU-9876-X');
        });

    test("String: split e accesso per indice", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('String(riga["Codice"]).split("-")[1]', row, cols, 'tbl', 'Ordini', row.cells), '9876');
        });

    test("String: length restituisce conteggio esatto caratteri", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('String(riga["Codice"]).length', row, cols, 'tbl', 'Ordini', row.cells)), 9);
        });

    test("Date: OGGI() restituisce formato corretto YYYY-MM-DD", () => {
            const val = AdvancedTable.evaluateFormula('OGGI()', row, cols, 'tbl', 'Ordini', row.cells);
            Assert.isTrue(/^\d{4}-\d{2}-\d{2}$/.test(val));
        });

    test("Date: ADESSO() restituisce formato corretto YYYY-MM-DDTHH:mm", () => {
            const val = AdvancedTable.evaluateFormula('ADESSO()', row, cols, 'tbl', 'Ordini', row.cells);
            Assert.isTrue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val));
        });

    test("Date: DATA_DIFF giorni tra due date semplici", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('DATA_DIFF("2026-06-10", "2026-06-01", "giorni")', row, cols, 'tbl', 'Ordini', row.cells)), 9);
        });

    test("Date: DATA_DIFF giorni ordine inverso restituisce valore negativo", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('DATA_DIFF("2026-06-01", "2026-06-10", "giorni")', row, cols, 'tbl', 'Ordini', row.cells)), -9);
        });

    test("Date: DATA_DIFF ore tra due timestamp completi", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('DATA_DIFF("2026-06-01T18:00", "2026-06-01T10:00", "ore")', row, cols, 'tbl', 'Ordini', row.cells)), 8);
        });

    test("Date: DATA_DIFF minuti tra due orari", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('DATA_DIFF("2026-06-01T10:45", "2026-06-01T10:15", "minuti")', row, cols, 'tbl', 'Ordini', row.cells)), 30);
        });

    test("Date: DATA_DIFF mesi tra date in anni differenti", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('DATA_DIFF("2027-03-01", "2026-01-01", "mesi")', row, cols, 'tbl', 'Ordini', row.cells)), 14);
        });

    test("Date: DATA_DIFF anni tra due date distanti", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('DATA_DIFF("2030-01-01", "2020-01-01", "anni")', row, cols, 'tbl', 'Ordini', row.cells)), 10);
        });

    test("Date: DATA_DIFF con parametri non validi ritorna stringa vuota", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('DATA_DIFF(null, "2026-01-01", "giorni")', row, cols, 'tbl', 'Ordini', row.cells), '');
        });

    test("Date: DATA_AGGIUNGI somma giorni solari", () => {
            const val = AdvancedTable.evaluateFormula('DATA_AGGIUNGI("2026-01-01", 10, "giorni")', row, cols, 'tbl', 'Ordini', row.cells);
            Assert.isTrue(val.startsWith("2026-01-11"));
        });

    test("Date: DATA_AGGIUNGI sottrazione giorni tramite valore negativo", () => {
            const val = AdvancedTable.evaluateFormula('DATA_AGGIUNGI("2026-01-15", -5, "giorni")', row, cols, 'tbl', 'Ordini', row.cells);
            Assert.isTrue(val.startsWith("2026-01-10"));
        });

    test("Date: DATA_AGGIUNGI somma ore conservando formato locale", () => {
            const val = AdvancedTable.evaluateFormula('DATA_AGGIUNGI("2026-01-01T10:00", 3, "ore")', row, cols, 'tbl', 'Ordini', row.cells);
            Assert.isTrue(val.includes("13:00"));
        });

    test("Date: DATA_AGGIUNGI somma minuti", () => {
            const val = AdvancedTable.evaluateFormula('DATA_AGGIUNGI("2026-01-01T10:15", 45, "minuti")', row, cols, 'tbl', 'Ordini', row.cells);
            Assert.isTrue(val.includes("11:00"));
        });

    test("Date: DATA_AGGIUNGI incremento mesi con cambio anno", () => {
            const val = AdvancedTable.evaluateFormula('DATA_AGGIUNGI("2025-11-01", 3, "mesi")', row, cols, 'tbl', 'Ordini', row.cells);
            Assert.isTrue(val.startsWith("2026-02-01"));
        });

    test("Date: ANNO() estrae anno a 4 cifre", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('ANNO("2026-08-20")', row, cols, 'tbl', 'Ordini', row.cells)), 2026);
        });

    test("Date: MESE() estrae mese in base 1-12", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('MESE("2026-08-20")', row, cols, 'tbl', 'Ordini', row.cells)), 8);
        });

    test("Date: GIORNO() estrae giorno in base 1-31", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('GIORNO("2026-08-20")', row, cols, 'tbl', 'Ordini', row.cells)), 20);
        });

    test("Date: ORA() estrae ora da timestamp ISO", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('ORA("2026-08-20T17:45:00")', row, cols, 'tbl', 'Ordini', row.cells)), 17);
        });

    test("Date: MINUTO() estrae minuti da timestamp ISO", () => {
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('MINUTO("2026-08-20T17:45:00")', row, cols, 'tbl', 'Ordini', row.cells)), 45);
        });

    test("Date: GIORNO_SETTIMANA() restituisce 7 per domenica", () => {
            // 15 Marzo 2026 è Domenica
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('GIORNO_SETTIMANA("2026-03-15")', row, cols, 'tbl', 'Ordini', row.cells)), 7);
        });

    test("Date: GIORNO_SETTIMANA() restituisce 1 per lunedì", () => {
            // 16 Marzo 2026 è Lunedì
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula('GIORNO_SETTIMANA("2026-03-16")', row, cols, 'tbl', 'Ordini', row.cells)), 1);
        });

    test("Note: NOTA_CORRENTE() restituisce ID da AppState attivo", () => {
            AppState.currentNoteId = 'note_suite_001';
            Assert.strictEqual(AdvancedTable.evaluateFormula('NOTA_CORRENTE()', row, cols, 'tbl', 'Ordini', row.cells), 'note_suite_001');
        });

    test("Note: PADRE() restituisce genitore corretto", () => {
            AppState.notes = [
                { id: 'p_100', parentId: null, title: 'Progetto Core' },
                { id: 'c_200', parentId: 'p_100', title: 'Task Sottofase' }
            ];
            Assert.strictEqual(AdvancedTable.evaluateFormula('PADRE("c_200")', row, cols, 'tbl', 'Ordini', row.cells), 'p_100');
        });

    test("Note: PADRE() su nodo radice restituisce null", () => {
            AppState.notes = [{ id: 'p_100', parentId: null, title: 'Root' }];
            Assert.strictEqual(AdvancedTable.evaluateFormula('PADRE("p_100")', row, cols, 'tbl', 'Ordini', row.cells), '');
        });

    test("Note: FIGLI() restituisce lista ID delle note discendenti", () => {
            AppState.notes = [
                { id: 'p_root', parentId: null, title: 'Root' },
                { id: 'sub_1', parentId: 'p_root', title: 'A' },
                { id: 'sub_2', parentId: 'p_root', title: 'B' }
            ];
            const res = AdvancedTable.evaluateFormula('FIGLI("p_root")', row, cols, 'tbl', 'Ordini', row.cells);
            Assert.deepEqual(JSON.parse(res), ['sub_1', 'sub_2']);
        });

    test("Note: FIGLI() su foglia senza figli restituisce array vuoto", () => {
            AppState.notes = [{ id: 'leaf_node', parentId: null, title: 'Foglia' }];
            Assert.strictEqual(AdvancedTable.evaluateFormula('FIGLI("leaf_node").length', row, cols, 'tbl', 'Ordini', row.cells), '0');
        });

    test("Note: PROPRIETA() estrae valore da SYS_PROPERTIES_DB", () => {
            AppState.databases['SYS_PROPERTIES_DB'] = {
                columns: [
                    { id: 'sys_c_note', name: 'Pagina' },
                    { id: 'sys_c_tag', name: 'Priorita' }
                ],
                rows: [
                    { cells: { sys_c_note: 'n_target', sys_c_tag: 'Urgente' } }
                ]
            };
            Assert.strictEqual(AdvancedTable.evaluateFormula('PROPRIETA("n_target", "Priorita")', row, cols, 'tbl', 'Ordini', row.cells), 'Urgente');
        });

    test("Sandbox: IIFE complessa con accumulatore locale", () => {
            const iife = `(() => {
                let totale = 0;
                for(let i = 1; i <= riga["Quantità"]; i++) {
                    totale += i * 10;
                }
                return totale; // 10 + 20 + 30 + 40 = 100
            })()`;
            Assert.strictEqual(Number(AdvancedTable.evaluateFormula(iife, row, cols, 'tbl', 'Ordini', row.cells)), 100);
        });

    test("Sandbox: IIFE che manipola array e restituisce stringa formattata", () => {
            const iife = `(() => {
                const tags = ["Approvato", "Fatturato", "Chiuso"];
                return tags.filter(t => t !== "Fatturato").join(" | ");
            })()`;
            Assert.strictEqual(AdvancedTable.evaluateFormula(iife, row, cols, 'tbl', 'Ordini', row.cells), 'Approvato | Chiuso');
        });

    test("Sandbox: formula vuota ritorna stringa vuota", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('', row, cols, 'tbl', 'Ordini', row.cells), '');
            Assert.strictEqual(AdvancedTable.evaluateFormula(null, row, cols, 'tbl', 'Ordini', row.cells), '');
        });

    test("Sandbox: NaN viene intercettato e convertito in 'NaN' testuale senza crash", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('0 / 0', row, cols, 'tbl', 'Ordini', row.cells), 'NaN');
        });

    test("Sandbox: errore di sintassi produce badge HTML di errore", () => {
            const res = AdvancedTable.evaluateFormula('riga["Quantità"] +++ syntaxErr(', row, cols, 'tbl', 'Ordini', row.cells);
            Assert.isTrue(res.includes('Err'));
        });

    test("Sandbox: eccezione a runtime dentro IIFE produce badge HTML di errore", () => {
            const res = AdvancedTable.evaluateFormula('(() => { throw new Error("Fail"); })()', row, cols, 'tbl', 'Ordini', row.cells);
            Assert.isTrue(res.includes('Err'));
        });

    test("Sandbox: variabili globali window e document sono disinnescate", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('typeof window', row, cols, 'tbl', 'Ordini', row.cells), 'undefined');
            Assert.strictEqual(AdvancedTable.evaluateFormula('typeof document', row, cols, 'tbl', 'Ordini', row.cells), 'undefined');
        });

    test("Caret Math: calcolo offset matematico su nodi di testo multilinea con tag BR", () => {
            const pre = document.createElement('pre');
            pre.innerHTML = 'const a = 1;<br>const b = 2;';

            // Cursore all'inizio della seconda riga (dopo il br)
            const textNodeLine2 = pre.childNodes[2]; // 'const b = 2;'
            const offset = Editor._getCodeOffset(pre, textNodeLine2, 6); // 'const '
            // 'const a = 1;' (12) + BR (1) + 'const ' (6) = 19
            Assert.strictEqual(offset, 19);
        });

    test("Caret Math: estrazione rawText preserva i ritorni a capo senza duplicazioni", () => {
            const pre = document.createElement('pre');
            pre.innerHTML = '<span>let</span> x = 10;<br><span>return</span> x;<br>';
            const raw = Editor._getRawText(pre);
            Assert.isTrue(raw.startsWith('let x = 10;\nreturn x;\n'));
        });

    test("Date Math: calcolo bisestile (29 Febbraio) con DATA_DIFF e DATA_AGGIUNGI", () => {
            // Anno bisestile 2024
            const leapDiff = AdvancedTable.evaluateFormula('DATA_DIFF("2024-03-01", "2024-02-28", "giorni")', {}, [], 't', 'T', {});
            Assert.strictEqual(Number(leapDiff), 2, "Il 2024 è bisestile: tra il 28 Febbraio e il 1 Marzo intercorrono 2 giorni");

            // Anno non bisestile 2025
            const nonLeapDiff = AdvancedTable.evaluateFormula('DATA_DIFF("2025-03-01", "2025-02-28", "giorni")', {}, [], 't', 'T', {});
            Assert.strictEqual(Number(nonLeapDiff), 1, "Il 2025 non è bisestile: tra il 28 Febbraio e il 1 Marzo intercorre 1 giorno");

            // Aggiunta giorni attraverso Febbraio bisestile
            const addedLeap = AdvancedTable.evaluateFormula('DATA_AGGIUNGI("2024-02-27", 3, "giorni")', {}, [], 't', 'T', {});
            Assert.isTrue(addedLeap.startsWith("2024-03-01"));
        });

    test("Sandbox Formula: divisione per zero restituisce 'Infinity' senza eccezioni non gestite", () => {
            const res = AdvancedTable.evaluateFormula('10 / 0', {}, [], 't', 'T', {});
            Assert.strictEqual(Number(res), Infinity);
        });

    test("Sandbox Formula: arrotondamento floating-point tipico (0.1 + 0.2)", () => {
            const res = AdvancedTable.evaluateFormula('Math.round((0.1 + 0.2) * 100) / 100', {}, [], 't', 'T', {});
            Assert.strictEqual(Number(res), 0.3);
        });

    test("Sandbox Formula: CERCA con coercizione di tipo stringa su id numerico", () => {
            const catalogo = [{ id: 101, val: 'Trovato' }];
            const res = AdvancedTable.evaluateFormula('CERCA(' + JSON.stringify(catalogo) + ', "id", 101, "val")', {}, [], 't', 'T', {});
            Assert.strictEqual(res, 'Trovato');
        });

    test("Sandbox Formula: SOMMA su array vuoto ritorna 0", () => {
            const res = AdvancedTable.evaluateFormula('SOMMA([], "importo")', {}, [], 't', 'T', {});
            Assert.strictEqual(Number(res), 0);
        });

    test("Sandbox Formula: MEDIA ignora stringhe non convertibili senza produrre NaN", () => {
            const lista = [{ val: 10 }, { val: "non_un_numero" }, { val: 20 }];
            const res = AdvancedTable.evaluateFormula('MEDIA(' + JSON.stringify(lista) + ', "val")', {}, [], 't', 'T', {});
            Assert.strictEqual(Number(res), 15);
        });

    test("Sandbox Formula: UNISCI ignora null e undefined senza emettere stringhe letterali", () => {
            const res = AdvancedTable.evaluateFormula('UNISCI("A", null, undefined, "B")', {}, [], 't', 'T', {});
            Assert.strictEqual(res, 'AB');
        });

    test("Sandbox Formula: DATA_DIFF con formato data non valido restituisce stringa vuota", () => {
            const res = AdvancedTable.evaluateFormula('DATA_DIFF("data_invalida", "2026-01-01", "giorni")', {}, [], 't', 'T', {});
            Assert.strictEqual(res, '');
        });

    test("Sandbox Formula: GIORNO_SETTIMANA a cavallo di fine anno (31 Dicembre 2026 = Giovedì = 4)", () => {
            const res = AdvancedTable.evaluateFormula('GIORNO_SETTIMANA("2026-12-31")', {}, [], 't', 'T', {});
            Assert.strictEqual(Number(res), 4);
        });

    test("Sandbox Formula: variabili di rete e storage globale (localStorage, fetch) sono inaccessibili", () => {
            Assert.strictEqual(AdvancedTable.evaluateFormula('typeof localStorage', {}, [], 't', 'T', {}), 'undefined');
            Assert.strictEqual(AdvancedTable.evaluateFormula('typeof fetch', {}, [], 't', 'T', {}), 'undefined');
        });

    test("Sandbox Formula: variabili locali IIFE non alterano lo scope esterno di 'riga'", () => {
            const rowData = { id: 'r1', cells: { a: 10 }, createdAt: 0, updatedAt: 0 };
            const colsData = [{ id: 'a', name: 'Valore', type: 'number' }];
            const iife = `(() => { let riga = { Valore: 999 }; return riga.Valore; })()`;
            const res = AdvancedTable.evaluateFormula(iife, rowData, colsData, 't', 'T', rowData.cells);
            Assert.strictEqual(Number(res), 999);
            // Verifica che rowData sia intatto
            Assert.strictEqual(rowData.cells.a, 10);
        });

    test("AdvancedTable: getFormatDisplayValue formatta date range con freccia ➔", () => {
            const col = { id: 'c_rng', type: 'date', hasEndDate: true };
            const res = AdvancedTable.getFormatDisplayValue(col, { start: '2026-05-01', end: '2026-05-15' });
            Assert.strictEqual(res, "2026-05-01 ➔ 2026-05-15");
        });

    test("RDBMS: getFormatDisplayValue su intervallo temporale {start, end}", () => {
            const col = { id: 'c_rng', type: 'date', hasEndDate: true };
            const res = AdvancedTable.getFormatDisplayValue(col, { start: '2026-01-01', end: '2026-01-31' });
            Assert.strictEqual(res, '2026-01-01 ➔ 2026-01-31');
        });

    test("RDBMS: getFormatDisplayValue su intervallo temporale parziale {start}", () => {
            const col = { id: 'c_rng', type: 'date', hasEndDate: true };
            const res = AdvancedTable.getFormatDisplayValue(col, { start: '2026-01-01' });
            Assert.strictEqual(res, '2026-01-01');
        });

    test("Editor.toggleCase: converte testo da minuscolo a MAIUSCOLO", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p id="p_case">minuscolo</p>';

            const p = editor.querySelector('#p_case');
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNodeContents(p);
            sel.addRange(r);

            let insertedText = '';
            const origExec = document.execCommand;
            document.execCommand = (cmd, showUI, val) => {
                if (cmd === 'insertText') insertedText = val;
            };

            try {
                Editor.toggleCase();
                Assert.strictEqual(insertedText, 'MINUSCOLO');
            } finally {
                document.execCommand = origExec;
            }
        });

    test("Editor.handleBracketAutoClose: digitazione '[' innesca modal internal link se preceduta da '['", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p>Vedi [</p>';

            const p = editor.querySelector('p');
            const textNode = p.firstChild;
            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(textNode, 6); // Subito dopo la '['
            r.collapse(true);
            sel.addRange(r);

            let modalOpened = false;
            const origOpen = LinkManager.openInternalModal;
            LinkManager.openInternalModal = () => { modalOpened = true; };

            try {
                const ev = { key: '[', preventDefault: () => {} };
                Editor.handleBracketAutoClose(ev);
                Assert.isTrue(modalOpened, "Digitare [[ deve innescare l'apertura del drawer per link interno");
            } finally {
                LinkManager.openInternalModal = origOpen;
            }
        });

    test("Editor.handleBracketAutoClose: non apre modal link se ci troviamo dentro pre.code-content", () => {
            const pre = document.createElement('pre');
            pre.className = 'code-content';
            pre.textContent = 'const arr = [';
            document.body.appendChild(pre);

            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(pre.firstChild, 13);
            r.collapse(true);
            sel.addRange(r);

            let modalOpened = false;
            const origOpen = LinkManager.openInternalModal;
            LinkManager.openInternalModal = () => { modalOpened = true; };

            try {
                const ev = { key: '[', preventDefault: () => {} };
                Editor.handleBracketAutoClose(ev);
                Assert.isFalse(modalOpened, "Nei blocchi di codice la digitazione [[ non deve essere intercettata");
            } finally {
                LinkManager.openInternalModal = origOpen;
                pre.remove();
            }
        });

    test("Editor.handleBracketAutoClose: chiusura automatica parentesi tonde '()'", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p>test</p>';
            const p = editor.querySelector('p');

            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(p.firstChild, 4);
            r.collapse(true);
            sel.addRange(r);

            let insertedText = '';
            const origExec = document.execCommand;
            document.execCommand = (cmd, showUI, val) => {
                if (cmd === 'insertText') insertedText = val;
            };

            try {
                const ev = { key: '(', preventDefault: () => {} };
                Editor.handleBracketAutoClose(ev);
                Assert.strictEqual(insertedText, '()');
            } finally {
                document.execCommand = origExec;
            }
        });

    test("Editor.handleBracketAutoClose: scavalca parentesi chiusa ')' se già presente a destra", () => {
            let editor = document.getElementById('noteContent');
            editor.innerHTML = '<p>(test)</p>';
            const p = editor.querySelector('p');

            const sel = window.getSelection();
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(p.firstChild, 5); // Tra 't' e ')'
            r.collapse(true);
            sel.addRange(r);

            let defaultPrevented = false;
            const ev = { key: ')', preventDefault: () => { defaultPrevented = true; } };
            Editor.handleBracketAutoClose(ev);
            Assert.isTrue(defaultPrevented, "Non deve inserire un'altra parentesi ma scavalcare quella esistente");
        });

});
