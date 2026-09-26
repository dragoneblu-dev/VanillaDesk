/**
 * logic-engine-ai.js
 * Generatore dei Prompt e Assistente Intelligenza Artificiale per l'Engine JS.
 * Supporto per copia sicura (Clipboard API + Fallback textarea) e gestione robusta dell'ID database.
 * FEAT PROMPT: Istruzioni esplicite per la manipolazione di campi con data di fine (hasEndDate) 
 * con pattern per traslare eventi preservando la durata.
 */

Object.assign(LogicEngine, {
    
    getAIPrompt: (dbState) => {
        if (!dbState) return "";

        let colsInfo = [];
        (dbState.columns || []).forEach(c => {
            let extra = c.hasEndDate ? " [Ha Data di Fine abilitata - Intervallo]" : "";
            let info = `- "${c.name}" (Tipo: ${c.type}${extra})`;
            if (c.type === 'relation' && c.targetTableId) {
                if (typeof AdvancedTable !== 'undefined') {
                    const tState = AdvancedTable.getTableState(c.targetTableId);
                    if (tState && tState.columns) {
                        info += ` -> Collegato al DB "${tState.title}". Colonne: ${tState.columns.map(tc => `"${tc.name}"`).join(', ')}`;
                    }
                }
            }
            colsInfo.push(info);
        });

        return `Agisci come un programmatore Javascript esperto e aiutami a scrivere una formula per un Database in stile Notion.

CHIAREZZA ARCHITETTURALE (NON CONFONDERE NOTE E DATABASE):
L'applicazione gestisce due entità distinte e gerarchiche:
1. LE NOTE (Pagine Documento):
   - Sono le pagine e i documenti dell'albero gerarchico nella barra laterale (come in Obsidian o Notion).
   - Possono avere relazioni gerarchiche tra loro: una Nota può essere genitrice (PADRE) di sotto-note (FIGLI).
   - Hanno proprietà globali di pagina (es. Tag, Autore, Data Scadenza Pagina).
2. I DATABASE (Tabelle RDBMS):
   - Sono componenti strutturati inseriti ALL'INTERNO di una Nota.
   - Sono composti da Colonne (Campi) e Righe (Record).
   - "riga" si riferisce sempre a un singolo record di questo database, NON alla pagina intera.

IL CONTESTO DEL MOTORE DELLE FORMULE:
L'applicazione fornisce le seguenti variabili predefinite nell'ambiente di esecuzione:
1. \`riga\`: Un oggetto che rappresenta il RECORD corrente della tabella. I campi si leggono con la sintassi case-sensitive: riga["Nome Campo"].
2. \`righe\`: Un array di oggetti contenente TUTTI i record del database corrente. Utile per aggregazioni globali sul database (es. percentuali sul totale).
3. \`tabella\`: Un oggetto che permette di accedere a QUALSIASI ALTRO database dello spazio di lavoro tramite il suo titolo esatto.
   Esempio: tabella["Nome Altro DB"] restituisce l'array dei record di quell'altra tabella.

Funzioni personalizzate disponibili:
- NOTA_CORRENTE() -> restituisce l'ID della nota corrente
- PADRE(id_nota) -> restituisce l'ID del genitore di quella nota
- FIGLI(id_nota) -> restituisce un array di ID note
- PROPRIETA(id_nota, "Nome Campo") -> estrae un valore da una specifica nota
- SE(condizione, se_vero, se_falso)
- SOMMA(valore1, valore2) OPPURE SOMMA(tabella["DB"], "Nome Colonna")
- MEDIA(valore1, valore2) OPPURE MEDIA(tabella["DB"], "Nome Colonna")
- CERCA(array_tabella_dest, "ColRicerca", valore, "ColRitorno")
- CONTA(array, "Colonna", "Valore")
- UNISCI(testo1, testo2) OPPURE UNISCI(tabella["DB"], "Nome Colonna", separatore)
- OGGI() -> restituisce YYYY-MM-DD
- ADESSO() -> restituisce YYYY-MM-DDTHH:mm
- DATA_DIFF(data_fine, data_inizio, "giorni/ore/minuti/mesi/anni") -> restituisce numero
- DATA_AGGIUNGI(data, quantita, "giorni/ore/minuti/mesi/anni") -> restituisce data YYYY-MM-DDTHH:mm
- ANNO(data), MESE(data), GIORNO(data), ORA(data), MINUTO(data) -> restituiscono un numero
- GIORNO_SETTIMANA(data) -> restituisce il giorno della settimana in numero (1 = Lunedì, 7 = Domenica)

REGOLE DI SCRITTURA (SINGOLA ESPRESSIONE vs BLOCCHI COMPLESSI):
Il motore esegue il codice in modo rigoroso, accodandolo a un comando "return".
- Se la logica è semplice, scrivi solo una singola espressione (es: \`riga["A"] + 1\`).
- Se ti servono variabili multiple, cicli (for/while), logiche if/else complesse o funzioni ricorsive, DEVI OBBLIGATORIAMENTE incapsulare tutto in una IIFE (Immediately Invoked Function Expression) che ritorni il valore finale.
Esempio di IIFE:
(() => { 
    let base = Number(riga["Valore"]); 
    if (base > 10) return "Alto"; 
    return "Basso"; 
})()

REGOLA FONDAMENTALE SUI NOMI (CASE-SENSITIVE):
Le chiavi per accedere a righe e tabelle sono rigorosamente Case-Sensitive! I nomi delle colonne (es: riga["Stato"]) e i nomi dei database (es: tabella["Clienti"]) devono rispettare esattamente le MAIUSCOLE, minuscole e gli spazi vuoti presenti nell'elenco fornito sotto.

STRUTTURE DATI SPECIALI (ATTENZIONE!):
- I campi "date", "datetime" e "time" con opzione [Data di Fine] sono memorizzati come OGGETTO: { "start": "...", "end": "..." }.
  * In LETTURA: usa sempre \`riga["NomeData"]?.start\` o \`riga["NomeData"]?.end\`.
  * In SCRITTURA (quando imposti questo campo tramite formula per sovrascrivere tutto): DEVI RESTITUIRE UN OGGETTO { start: "...", end: "..." }.
- "multi-select", "relation", "rollup": Sono ARRAY di stringhe ["A", "B"].
- "checkbox": Sono BOOLEANI (true/false).
NON USARE UNISCI() o SOMMA() in modalità Array su campi complessi estratti da altri DB. Usa i metodi JS nativi (.filter, .map, .join).

PATTERN: TRASLARE UN EVENTO MANTENENDO LA DURATA INVARIATA (START & END):
Se devi spostare avanti o indietro un evento con Data di Inizio e Data di Fine preservandone l'esatta durata:
(() => {
    const d = riga["NomeCampoData"];
    if (!d || !d.start) return d;
    const sMs = new Date(d.start).getTime();
    const eMs = d.end ? new Date(d.end).getTime() : sMs;
    const durata = eMs - sMs; // Durata preservata
    const offsetGiorni = 7; // Es. sposta di +7 giorni (usa negativi per arretrare)
    const shiftMs = offsetGiorni * 24 * 60 * 60 * 1000;
    const nStart = new Date(sMs + shiftMs);
    const nEnd = new Date(sMs + shiftMs + durata);
    const fmt = dt => {
        const c = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
        return c.toISOString().slice(0, 16); // usa split('T')[0] se il campo è solo data senza orario
    };
    return { start: fmt(nStart), end: fmt(nEnd) };
})()

IL MIO DATABASE SORGENTE:
Nome: "${dbState.title}"
Campi:
${colsInfo.join('\n')}

LA MIA RICHIESTA:
[Scrivi qui cosa vuoi ottenere]`;
    },

    copyAutomationAIPrompt: (e, tableId, btnId) => {
        if (e) e.preventDefault();
        
        if (!tableId || tableId === 'undefined' || tableId === 'null') {
            alert("Seleziona prima il Database Bersaglio per permettere all'IA di leggerne le colonne.");
            return;
        }

        const state = (typeof AdvancedTable !== 'undefined') 
            ? (AdvancedTable.getTableState(tableId) || AdvancedTable.getState(tableId)) 
            : null;

        if (!state) {
            alert("Impossibile trovare la struttura del Database selezionato.");
            return;
        }

        let colsInfo = [];
        (state.columns || []).forEach(c => {
            let extra = c.hasEndDate ? " [Ha Data di Fine abilitata - Intervallo]" : "";
            let info = `- "${c.name}" (Tipo: ${c.type}${extra})`;
            if (c.type === 'relation' && c.targetTableId) {
                const tState = typeof AdvancedTable !== 'undefined' ? AdvancedTable.getTableState(c.targetTableId) : null;
                if (tState && tState.columns) {
                    info += ` -> Collegato al Database "${tState.title}". Colonne di quel DB: ${tState.columns.map(tc => `"${tc.name}"`).join(', ')}`;
                }
            }
            colsInfo.push(info);
        });

        const isColButton = btnId && btnId.includes('colbtn');

        const prompt = `Agisci come un programmatore Javascript esperto e aiutami a scrivere una formula per un'Automazione/Pulsante.

CHIAREZZA ARCHITETTURALE (NON CONFONDERE NOTE E DATABASE):
L'applicazione gestisce due entità distinte e gerarchiche:
1. LE NOTE (Pagine Documento):
   - Sono le pagine e i documenti dell'albero gerarchico nella barra laterale (come in Obsidian o Notion).
   - Possono avere relazioni gerarchiche tra loro: una Nota può essere genitrice (PADRE) di sotto-note (FIGLI).
   - Hanno proprietà globali di pagina (es. Tag, Autore, Data Scadenza Pagina).
2. I DATABASE (Tabelle RDBMS):
   - Sono componenti strutturati inseriti ALL'INTERNO di una Nota.
   - Sono composti da Colonne (Campi) e Righe (Record).
   - "riga" si riferisce sempre a un singolo record di questo database, NON alla pagina intera.

IL CONTESTO DEL MOTORE DELLE FORMULE:
L'applicazione fornisce le seguenti variabili predefinite nell'ambiente di esecuzione:
1. \`riga\`: Un oggetto che rappresenta il RECORD corrente della tabella. I campi si leggono con la sintassi case-sensitive: riga["Nome Campo"].
2. \`righe\`: Un array di oggetti contenente TUTTI i record del database corrente. Utile per aggregazioni globali sul database (es. percentuali sul totale).
3. \`tabella\`: Un oggetto che permette di accedere a QUALSIASI ALTRO database dello spazio di lavoro tramite il suo titolo esatto.
   Esempio: tabella["Nome Altro DB"] restituisce l'array dei record di quell'altra tabella.
${isColButton ? `4. \`origine\`: POICHE' QUESTO E' UN PULSANTE DENTRO LA TABELLA, questa variabile rappresenta i dati della riga ESATTA in cui l'utente ha fatto click! (es: origine["Costo"]). Usala per trasferire i dati da questa riga a quella di destinazione.` : ''}

Funzioni personalizzate disponibili:
- NOTA_CORRENTE() -> restituisce l'ID della nota corrente
- PADRE(id_nota) -> restituisce l'ID del genitore di quella nota
- FIGLI(id_nota) -> restituisce un array di ID note
- PROPRIETA(id_nota, "Nome Campo") -> estrae un valore da una specifica nota
- SE(condizione, se_vero, se_falso)
- SOMMA(valore1, valore2) OPPURE SOMMA(tabella["DB"], "Nome Colonna")
- MEDIA(valore1, valore2) OPPURE MEDIA(tabella["DB"], "Nome Colonna")
- CERCA(array_tabella_dest, "ColRicerca", valore, "ColRitorno")
- CONTA(array, "Colonna", "Valore")
- UNISCI(testo1, testo2) OPPURE UNISCI(tabella["DB"], "Nome Colonna", separatore)
- OGGI() -> restituisce YYYY-MM-DD
- ADESSO() -> restituisce YYYY-MM-DDTHH:mm
- DATA_DIFF(data_fine, data_inizio, "giorni/ore/minuti/mesi/anni") -> restituisce numero
- DATA_AGGIUNGI(data, quantita, "giorni/ore/minuti/mesi/anni") -> restituisce data YYYY-MM-DDTHH:mm
- ANNO(data), MESE(data), GIORNO(data), ORA(data), MINUTO(data) -> restituiscono un numero
- GIORNO_SETTIMANA(data) -> restituisce il giorno della settimana in numero (1 = Lunedì, 7 = Domenica)

REGOLE DI SCRITTURA (SINGOLA ESPRESSIONE vs BLOCCHI COMPLESSI):
Il motore esegue il codice in modo rigoroso, accodandolo a un comando "return".
- Se la logica è semplice, scrivi solo una singola espressione (es: \`riga["A"] + 1\`).
- Se ti servono variabili multiple, cicli (for/while), logiche se complesse, DEVI OBBLIGATORIAMENTE incapsulare tutto in una IIFE (Immediately Invoked Function Expression).
Esempio di IIFE:
(() => { 
    let base = Number(riga["Valore"]); 
    if (base > 10) return "Alto"; 
    return "Basso"; 
})()

REGOLA FONDAMENTALE SUI NOMI (CASE-SENSITIVE):
Le chiavi per accedere a righe e tabelle sono rigorosamente Case-Sensitive! I nomi delle colonne (es: riga["Stato"]) e i nomi dei database (es: tabella["Clienti"]) devono rispettare esattamente le MAIUSCOLE, minuscole e gli spazi vuoti presenti nell'elenco fornito sotto.

ATTENZIONE ALLE STRUTTURE DATI:
- I campi "date", "datetime" e "time" con opzione [Data di Fine] sono memorizzati come OGGETTI: { "start": "...", "end": "..." }.
  * In LETTURA: usa sempre \`riga["NomeData"]?.start\` o \`riga["NomeData"]?.end\`.
  * In SCRITTURA (quando l'azione è impostata su "Formula JS (Sovrascrive tutto...)"): DEVI RESTITUIRE UN OGGETTO con entrambe le chiavi: { start: "...", end: "..." }.
- I tipi "multi-select", "relation" o "rollup" multipli sono ARRAY di stringhe: ["Valore 1", "Valore 2"].
- I tipi "checkbox" sono BOOLEANI: true / false.

COME TRASLARE UN EVENTO NEL TEMPO CONSERVANDO LA DURATA INVARIATA (START & END):
Se devi spostare avanti o indietro un evento con Data di Inizio e Data di Fine mantenendone intatta la durata:
(() => {
    const val = riga["NomeCampoData"];
    if (!val || !val.start) return val;
    const startMs = new Date(val.start).getTime();
    const endMs = val.end ? new Date(val.end).getTime() : startMs;
    const durataMs = endMs - startMs; // Calcola la durata esatta
    
    const giorniOffset = 7; // Esempio: +7 giorni (usa valori negativi per arretrare)
    const deltaMs = giorniOffset * 24 * 60 * 60 * 1000;
    
    const nuovoStart = new Date(startMs + deltaMs);
    const nuovoEnd = new Date(startMs + deltaMs + durataMs);
    
    // Funzione helper per formattare senza sfasamento di fuso orario locale
    const formatLocal = (dt, isDateTime) => {
        const d = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
        return isDateTime ? d.toISOString().slice(0, 16) : d.toISOString().split('T')[0];
    };
    
    const isDateTime = val.start.includes("T");
    return {
        start: formatLocal(nuovoStart, isDateTime),
        end: formatLocal(nuovoEnd, isDateTime)
    };
})()

IL MIO DATABASE ATTUALE DI BERSAGLIO (TARGET):
Nome: "${state.title}"
Campi disponibili nell'oggetto \`riga\` per questo contesto:
${colsInfo.join('\n')}

LA MIA RICHIESTA:
[Scrivi qui cosa deve calcolare la formula]`;

        const performCopy = (text) => {
            if (navigator.clipboard && window.isSecureContext) {
                return navigator.clipboard.writeText(text);
            } else {
                return new Promise((resolve, reject) => {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.left = '-9999px';
                    ta.style.top = '-9999px';
                    document.body.appendChild(ta);
                    ta.focus();
                    ta.select();
                    try {
                        const success = document.execCommand('copy');
                        ta.remove();
                        if (success) resolve();
                        else reject(new Error('execCommand copy fallito'));
                    } catch (err) {
                        ta.remove();
                        reject(err);
                    }
                });
            }
        };

        performCopy(prompt).then(() => {
            const btn = document.getElementById(btnId);
            if (btn) {
                const originalHTML = btn.innerHTML;
                btn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px;">${typeof Icons !== 'undefined' ? Icons.checkCircle : '✓'} Copiato!</span>`;
                btn.classList.add('btn-primary');
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.classList.remove('btn-primary');
                }, 2000);
            }
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast("Prompt AI copiato negli appunti!", "success");
            }
        }).catch(err => {
            console.error("Errore copia prompt:", err);
            window.prompt("Copia manualmente il prompt con Ctrl+C:", prompt);
        });
    }
});