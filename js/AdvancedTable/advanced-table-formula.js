/**
 * js/AdvancedTable/advanced-table-formula.js
 * Motore di esecuzione Sandbox (JS eval), funzioni Wrapper per la matematica
 * e Modulo Formula Editor in UI.
 * FIX TEMA: Rimossi colori di sfondo hardcoded. L'editor si adatta al tema globale.
 * FEAT PROMPT: Istruzioni esplicite per la manipolazione di campi con data di fine (hasEndDate)
 * e pattern per traslare eventi mantenendo inalterata la durata.
 * FIX SUGGERIMENTI DB: Rimosso codice, bottoni, diari e viste collegate.
 * Ripristinato il layout a pillole compatto ed elegante con soli database reali.
 */

Object.assign(AdvancedTable, {

    _validationTimer: null,
    _compiledFormulas: new Map(),

    _formulaWrappers: `
        const PADRE = (id) => { const n = AppState.notes.find(x => x.id === id); return n ? n.parentId : null; };
        const FIGLI = (id) => AppState.notes.filter(n => n.parentId === id && !n.deletedAt).map(n => n.id);
        const PROPRIETA = (id, campo) => { const db = AppState.databases['SYS_PROPERTIES_DB']; if(!db) return ""; const row = db.rows.find(r => r.cells['sys_c_note'] === id); if(!row) return ""; const col = db.columns.find(c => c.name === campo); if(!col) return ""; return row.cells[col.id]; };
        const NOTA_CORRENTE = () => riga["_sys_note_id"] || (typeof AppState !== 'undefined' ? AppState.currentNoteId : null) || null;
        
        const SE = (condizione, se_vero, se_falso) => condizione ? se_vero : se_falso;
        
        // Aggiornate per accettare sia un Array interno (Aggregatori) sia N-Argomenti separati (Excel Mode)
        const SOMMA = (...args) => { 
            if(args.length === 0) return 0; 
            if(Array.isArray(args[0])) { 
                const arr = args[0], col = args[1]; 
                return arr.reduce((s, r) => s + (Number(typeof r === 'object' && r !== null && col ? r[col] : r) || 0), 0); 
            } 
            return args.reduce((s, val) => s + (Number(val) || 0), 0); 
        };
        
        const MEDIA = (...args) => { 
            if(args.length === 0) return 0; 
            if(Array.isArray(args[0])) { 
                const arr = args[0], col = args[1]; 
                const v = arr.filter(r => { const val = typeof r === 'object' && r !== null && col ? r[col] : r; return val!==''&&!isNaN(val); }); 
                return v.length ? v.reduce((s,r) => s + Number(typeof r === 'object' && r !== null && col ? r[col] : r), 0) / v.length : 0; 
            } 
            const nums = args.map(n => Number(n)).filter(n => !isNaN(n));
            return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
        };
        
        const CERCA = (array, col_ric, val_ric, col_rit) => { 
            if(!Array.isArray(array)) return ""; 
            const res = array.find(r => typeof r === 'object' && r !== null ? r[col_ric] === val_ric : r === val_ric); 
            return res ? (typeof res === 'object' ? res[col_rit] : res) : ""; 
        };
        
        const CONTA = (array, colonna, valore) => { 
            if(!array) return 0; 
            if(!Array.isArray(array)) return array === valore ? 1 : 0; 
            return array.filter(r => (typeof r === 'object' && r !== null && colonna ? r[colonna] : r) === valore).length; 
        };
        
        const UNISCI = (...args) => { 
            if(args.length === 0) return ""; 
            if(Array.isArray(args[0])) { 
                const arr = args[0], col = args[1], sep = args[2] || ", "; 
                return arr.map(r => typeof r === 'object' && r !== null && col ? r[col] : r).filter(v=>v).join(sep); 
            } 
            return args.filter(v => v !== undefined && v !== null).join(""); 
        };
        
        const _PD = (d) => { if(!d) return null; if(typeof d === 'object' && d.start) return new Date(d.start); const dt = new Date(d); return isNaN(dt.getTime()) ? null : dt; };
        const _FMT = (d) => { if(!d) return ""; const loc = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)); return loc.toISOString().slice(0, 16); };
        
        const OGGI = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().split('T')[0]; };
        const ADESSO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
        
        const DATA_DIFF = (data_fine, data_inizio, unita="giorni") => {
            const d2 = _PD(data_fine), d1 = _PD(data_inizio); 
            if(!d2 || !d1) return "";
            const u = String(unita).toLowerCase();
            
            if(u.startsWith('giorn') || !u) {
                const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
                const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
                return Math.floor((utc2 - utc1) / 86400000);
            }
            if(u.startsWith('mes')) return (d2.getFullYear()-d1.getFullYear())*12 + d2.getMonth()-d1.getMonth();
            if(u.startsWith('ann')) return d2.getFullYear()-d1.getFullYear();
            
            const ms = d2.getTime() - d1.getTime();
            if(u.startsWith('sec')) return Math.floor(ms/1000); 
            if(u.startsWith('min')) return Math.floor(ms/60000);
            if(u.startsWith('or')) return Math.floor(ms/3600000); 
            return 0;
        };
        
        const DATA_AGGIUNGI = (data, qta, unita="giorni") => {
            const dt = _PD(data); if(!dt) return ""; const u = String(unita).toLowerCase();
            if(u.startsWith('sec')) dt.setSeconds(dt.getSeconds() + qta);
            else if(u.startsWith('min')) dt.setMinutes(dt.getMinutes() + qta);
            else if(u.startsWith('or')) dt.setHours(dt.getHours() + qta);
            else if(u.startsWith('giorn')) dt.setDate(dt.getDate() + qta);
            else if(u.startsWith('mes')) dt.setMonth(dt.getMonth() + qta);
            else if(u.startsWith('ann')) dt.setFullYear(dt.getFullYear() + qta);
            return _FMT(dt);
        };
        const ANNO = (d) => { const dt=_PD(d); return dt?dt.getFullYear():""; };
        const MESE = (d) => { const dt=_PD(d); return dt?dt.getMonth()+1:""; };
        const GIORNO = (d) => { const dt=_PD(d); return dt?dt.getDate():""; };
        const ORA = (d) => { const dt=_PD(d); return dt?dt.getHours():""; };
        const MINUTO = (d) => { const dt=_PD(d); return dt?dt.getMinutes():""; };
        const GIORNO_SETTIMANA = (d) => { const dt=_PD(d); if(!dt) return ""; const day = dt.getDay(); return day === 0 ? 7 : day; };

        // ALIAS CASE-INSENSITIVE PER LE FORMULE
        const padre = PADRE, Padre = PADRE;
        const figli = FIGLI, Figli = FIGLI;
        const proprieta = PROPRIETA, Proprieta = PROPRIETA;
        const nota_corrente = NOTA_CORRENTE, Nota_corrente = NOTA_CORRENTE;
        const se = SE, Se = SE;
        const somma = SOMMA, Somma = SOMMA;
        const media = MEDIA, Media = MEDIA;
        const cerca = CERCA, Cerca = CERCA;
        const conta = CONTA, Conta = CONTA;
        const unisci = UNISCI, Unisci = UNISCI;
        const oggi = OGGI, Oggi = OGGI;
        const adesso = ADESSO, Adesso = ADESSO;
        const data_diff = DATA_DIFF, Data_diff = DATA_DIFF, Data_Diff = DATA_DIFF;
        const data_aggiungi = DATA_AGGIUNGI, Data_aggiungi = DATA_AGGIUNGI, Data_Aggiungi = DATA_AGGIUNGI;
        const anno = ANNO, Anno = ANNO;
        const mese = MESE, Mese = MESE;
        const giorno = GIORNO, Giorno = GIORNO;
        const ora = ORA, Ora = ORA;
        const minuto = MINUTO, Minuto = MINUTO;
        const giorno_settimana = GIORNO_SETTIMANA, Giorno_settimana = GIORNO_SETTIMANA, Giorno_Settimana = GIORNO_SETTIMANA;
    `,

    evaluateFormula: (formulaStr, row, columns, tableId, stateTitle, virtualCells = null, renderCache = null, origineContext = null) => {
        if (!formulaStr) return '';
        try {
            const riga = AdvancedTable._buildRigaContext(row, columns, virtualCells, renderCache || {}, tableId);
            const tabella = AdvancedTable._buildTabellaContext(renderCache);
            const righe = tabella[stateTitle] || []; 
            const origine = origineContext || {};

            const fullCode = `'use strict';\n${AdvancedTable._formulaWrappers}\nreturn ${formulaStr};`;

            let executor = AdvancedTable._compiledFormulas.get(formulaStr);
            if (!executor) {
                executor = new Function('riga', 'tabella', 'righe', 'origine', 'window', 'document', 'localStorage', 'fetch', 'AppState', 'Store', 'Editor', 'AdvancedTable', 'UI', fullCode);
                AdvancedTable._compiledFormulas.set(formulaStr, executor);
            }
            
            const result = executor.call(null, riga, tabella, righe, origine, undefined, undefined, undefined, undefined, AppState, Store, undefined, AdvancedTable, undefined);

            if (result === undefined || result === null) return '';
            if (typeof result === 'object') return JSON.stringify(result);
            if (Number.isNaN(result)) return 'NaN';
            return String(result);
        } catch (e) {
            console.error("🔴 [FORMULA ERROR] Valutazione sincrona fallita:", e, "\nFormula:", formulaStr);
            return `<span style="color:var(--danger-color)" title="${e.message.replace(/"/g, "'")}">${Icons.alertTriangle} Err</span>`;
        }
    },

    executeAsyncScript: async (scriptStr, row, columns, tableId, stateTitle, virtualCells = null, origineContext = null) => {
        if (!scriptStr) return '';
        try {
            const riga = AdvancedTable._buildRigaContext(row, columns, virtualCells, {}, tableId);
            const tabella = AdvancedTable._buildTabellaContext(null); 
            const righe = tabella[stateTitle] || []; 
            const origine = origineContext || {};

            const fullCode = `'use strict';\n${AdvancedTable._formulaWrappers}\nreturn ${scriptStr};`;

            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const executor = new AsyncFunction('riga', 'tabella', 'righe', 'origine', 'window', 'document', 'localStorage', 'fetch', 'AppState', 'Store', 'Editor', 'AdvancedTable', 'UI', fullCode);
            
            // FIX SANDBOX ASYNC: AppState e le API Globali vengono correttamente iniettate!
            const result = await executor.call(null, riga, tabella, righe, origine, undefined, undefined, undefined, undefined, AppState, Store, undefined, AdvancedTable, undefined);

            if (result === undefined || result === null) return '';
            if (typeof result === 'object') return JSON.stringify(result);
            if (Number.isNaN(result)) return 'NaN';
            return String(result);
        } catch (e) {
            console.error("🔴 [FORMULA ERROR] Valutazione asincrona (Macro/Automazione) fallita:", e, "\nScript:", scriptStr);
            return `<span style="color:var(--danger-color)" title="${e.message.replace(/"/g, "'")}">${Icons.alertTriangle} Async Err</span>`;
        }
    },

    editFormula: (tableId, colId) => {
        let state = AdvancedTable.getState(tableId);
        const col = state.columns.find(c => c.id === colId);

        AdvancedTable.closeDropdowns();
        AdvancedTable._pendingFormulaConfig = { tableId, colId, state };
        const currentFormula = col.formula || '';

        const bodyHTML = `
            <div style="display:flex; flex-direction:column; gap:10px; height:100%;">
                <pre id="advFormulaInput" class="formula-editor-area code-content" data-language="formula" contenteditable="true" spellcheck="false" style="margin: 0;"></pre>
                
                <div id="advFormulaValidationBar" style="background: var(--bg-color); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.8rem; display:flex; align-items:center; gap:8px;">
                    <span id="advFormulaStatusIcon" style="display:inline-flex;">${Icons.hourglass}</span>
                    <span id="advFormulaStatusText" style="color:var(--text-secondary); font-family:monospace; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">In attesa...</span>
                </div>

                <div style="background: rgba(37, 99, 235, 0.05); padding: 8px 12px; border-radius: 4px; border: 1px solid rgba(37, 99, 235, 0.2); font-size: 0.8rem; display:flex; align-items:center; gap:8px;">
                    <span style="flex:1; color:var(--text-secondary);">Se vuoi farti aiutare da un LLM per scrivere la formula, copia questo prompt e chiedilo all'intelligenza artificiale:</span>
                    <button id="btnCopyAIPrompt" class="btn" style="padding: 4px 8px; font-size: 0.75rem;" onclick="AdvancedTable.copyAIPrompt('${tableId}')" title="Copia Prompt per AI"><span style="display:inline-flex; align-items:center; gap:5px;">${Icons.clipboard} Copia Prompt</span></button>
                </div>

                <div style="background: var(--item-hover); padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); flex: 1; display:flex; flex-direction:column; overflow:hidden;">
                    <div id="advFormulaContextHelp" style="margin-bottom: 8px; font-weight: bold; font-size:0.85rem; color: var(--accent-color); flex-shrink:0; display:none;">Suggerimenti Dinamici:</div>
                    <div id="advFormulaAvailableCols" style="display:flex; flex-direction: column; gap:4px; overflow-y:auto; flex:1; padding-right:5px;" class="adv-scroll-container"></div>
                </div>
            </div>
        `;

        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">Annulla</button>
            <button id="advFormulaSaveBtn" class="btn btn-primary" onclick="AdvancedTable.saveFormula()">Salva Formula</button>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.formula} Modifica Formula: ${col.name}</span>`, bodyHTML, footerHTML);

        setTimeout(() => {
            const inputArea = document.getElementById('advFormulaInput');
            if (!inputArea) return;

            inputArea.oninput = () => {
                const sel = window.getSelection();
                let pos = 0;
                if (sel.rangeCount > 0) {
                    pos = Editor._getCodeOffset(inputArea, sel.anchorNode, sel.anchorOffset);
                }
                
                if (typeof CodeManager !== 'undefined') CodeManager.highlightBlock(inputArea, true);
                Editor._setCodeOffset(inputArea, pos, pos);
                
                const rawText = inputArea.innerText;
                AdvancedTable.triggerLiveValidation(rawText);
                AdvancedTable.updateFormulaHints(rawText.replace(/\u00A0/g, ' '), pos);
            };

            inputArea.onkeyup = (e) => {
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    const sel = window.getSelection();
                    if (sel.rangeCount > 0) {
                        const pos = Editor._getCodeOffset(inputArea, sel.anchorNode, sel.anchorOffset);
                        AdvancedTable.updateFormulaHints(inputArea.innerText.replace(/\u00A0/g, ' '), pos);
                    }
                }
            };

            inputArea.onmouseup = () => {
                const sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    const pos = Editor._getCodeOffset(inputArea, sel.anchorNode, sel.anchorOffset);
                    AdvancedTable.updateFormulaHints(inputArea.innerText.replace(/\u00A0/g, ' '), pos);
                }
            };

            inputArea.onpaste = (e) => {
                e.preventDefault();
                e.stopPropagation();
                let text = (e.clipboardData || window.clipboardData).getData('text/plain');
                if (!text) return;
                
                text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                
                const sel = window.getSelection();
                let startOffset = Editor._getCodeOffset(inputArea, sel.anchorNode, sel.anchorOffset);
                let endOffset = Editor._getCodeOffset(inputArea, sel.focusNode, sel.focusOffset);
                
                if (startOffset > endOffset) {
                    const t = startOffset; startOffset = endOffset; endOffset = t;
                }
                
                const rawText = inputArea.innerText;
                const newText = rawText.substring(0, startOffset) + text + rawText.substring(endOffset);
                
                inputArea.innerHTML = '';
                inputArea.appendChild(document.createTextNode(newText));
                
                const newPos = startOffset + text.length;
                
                if (typeof CodeManager !== 'undefined') CodeManager.highlightBlock(inputArea, true);
                Editor._setCodeOffset(inputArea, newPos, newPos);
                
                AdvancedTable.triggerLiveValidation(newText);
                AdvancedTable.updateFormulaHints(newText.replace(/\u00A0/g, ' '), newPos);
            };

            if (!currentFormula) {
                inputArea.innerHTML = '<br>';
            } else {
                inputArea.innerHTML = '';
                inputArea.appendChild(document.createTextNode(currentFormula));
                if (typeof CodeManager !== 'undefined') CodeManager.highlightBlock(inputArea, true);
            }
            
            inputArea.focus();

            const textLen = inputArea.innerText.length;
            Editor._setCodeOffset(inputArea, textLen, textLen);

            AdvancedTable.triggerLiveValidation(inputArea.innerText);
            AdvancedTable.updateFormulaHints(inputArea.innerText.replace(/\u00A0/g, ' '), textLen);
        }, 50);
    },

    copyAIPrompt: (tableId) => {
        const state = AdvancedTable.getState(tableId);
        if (!state) return;

        let colsInfo = [];
        (state.columns || []).forEach(c => {
            let extra = c.hasEndDate ? " [Ha Data di Fine abilitata - Intervallo]" : "";
            let info = `- "${c.name}" (Tipo: ${c.type}${extra})`;
            if (c.type === 'relation' && c.targetTableId) {
                const tState = AdvancedTable.getTableState(c.targetTableId);
                if (tState && tState.columns) {
                    info += ` -> Collegato al Database "${tState.title}". Colonne di quel DB: ${tState.columns.map(tc => `"${tc.name}"`).join(', ')}`;
                }
            }
            colsInfo.push(info);
        });

        const prompt = `Agisci come un programmatore Javascript esperto e aiutami a scrivere una formula per un Database in stile Notion all'interno dell'applicazione VanillaDesk.

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

L'applicazione fornisce inoltre queste funzioni personalizzate già pronte per essere usate
FUNZIONI DI SISTEMA:
- Navigazione tra le Note (Pagine del Workspace):
  * NOTA_CORRENTE() -> Restituisce l'ID univoco (stringa) della Nota/Pagina che ospita questa tabella.
  * PADRE(id_nota) -> Restituisce l'ID della Nota genitrice di quella pagina nell'albero della sidebar (o null se è alla radice).
  * FIGLI(id_nota) -> Restituisce un array di ID delle Note figlie/sotto-note di quella pagina.
  * PROPRIETA(id_nota, "Nome Proprietà") -> Estrae il valore di un tag o di una proprietà assegnata a quella specifica Nota/Pagina.

- Funzioni Logiche e di Ricerca:
  * SE(condizione, se_vero, se_falso) -> Operatore condizionale rapido (alternativo a condizione ? vero : falso).
  * CERCA(array_tabella_destinazione, "ColonnaRicerca", valoreDaCercare, "ColonnaDaRestituire") -> Funzione di VLOOKUP relazionale tra database.
  * CONTA(array, "Colonna", "ValoreEsatto") -> Conta i record che hanno quel valore esatto.
  * SOMMA(valore1, valore2, ...) OPPURE SOMMA(array_record, "NomeColonna") -> Somma algebrica.
  * MEDIA(valore1, valore2, ...) OPPURE MEDIA(array_record, "NomeColonna") -> Media aritmetica.
  * UNISCI(testo1, testo2, ...) OPPURE UNISCI(array_record, "NomeColonna", separatore) -> Concatena stringhe.

- Funzioni di Calcolo Temporale:
  * OGGI() -> Restituisce la data odierna in formato YYYY-MM-DD.
  * ADESSO() -> Restituisce data e ora attuali in formato YYYY-MM-DDTHH:mm.
  * DATA_DIFF(data_fine, data_inizio, "giorni/ore/minuti/secondi/mesi/anni") -> Restituisce la differenza numerica.
  * DATA_AGGIUNGI(data_base, quantita, "giorni/ore/minuti/secondi/mesi/anni") -> Calcola la nuova data risultante.
  * ANNO(data), MESE(data), GIORNO(data), ORA(data), MINUTO(data) -> Estraggono le rispettive componenti numeriche.
  * GIORNO_SETTIMANA(data) -> Restituisce il numero del giorno (1 = Lunedì, 7 = Domenica).

REGOLE TASSATIVE DI SCRITTURA DEL CODICE:
1. Modalità di Esecuzione:
   Il motore accoda il codice a un comando "return".
   - Per calcoli semplici, fornisci una singola espressione diretta (es: \`Number(riga["Importo"] || 0) * 1.22\`).
   - Per logiche articolate (dichiarazione di variabili, cicli for, clausole if/else multiple), DEVI incapsulare il codice in una IIFE (Immediately Invoked Function Expression).
     Esempio:
     (() => {
         const stato = riga["Stato"];
         const ggDiff = DATA_DIFF(riga["Scadenza"], OGGI(), "giorni");
         if (stato === "Chiuso") return "Completato";
         if (ggDiff < 0) return "In Ritardo di " + Math.abs(ggDiff) + " gg";
         return "In Corso";
     })()

2. Case-Sensitivity dei Nomi:
   I nomi delle colonne in riga["..."] e i nomi dei database in tabella["..."] sono rigorosamente case-sensitive e devono rispettare fedelmente maiuscole, minuscole e spazi presenti nella definizione dello schema riportata sotto.

3. ATTENZIONE ALLE STRUTTURE DATI SPECIALI:
Nel JSON, le celle non sono sempre primitive. Devi trattarle di conseguenza:
- Numeri: Possono essere stringhe o null. Usa sempre \`Number(riga["Campo"] || 0)\` o \`parseFloat\` per i calcoli matematici.
- I campi "date", "datetime" e "time" con opzione [Data di Fine] sono memorizzati come OGGETTO: { "start": "...", "end": "..." }.
  * In LETTURA: usa sempre \`riga["NomeData"]?.start\` o \`riga["NomeData"]?.end\`.
  * Se devi calcolare o restituire un intervallo temporale: restituisci un oggetto { start: "...", end: "..." }.
- I tipi "multi-select" o "rollup" multipli sono ARRAY di stringhe: ["Valore 1", "Valore 2"].
- I tipi "relation" vengono esposti GIA' RISOLTI come Array di Nomi testuali, non di ID (Es: ["Mario", "Luigi"]). Puoi usare comodamente riga["Tua Relazione"].join(', ').
- I tipi "checkbox" sono BOOLEANI: true / false.
- Pagina Record (record_note): Restituisce l'ID della nota dedicata associata a quel record.

PATTERN: TRASLARE UN EVENTO MANTENENDO LA DURATA INVARIATA (START & END):
Se devi spostare avanti o indietro un evento con Data di Inizio e Data di Fine preservandone l'esatta durata:
(() => {
    const d = riga["NomeCampoData"];
    if (!d || !d.start) return d;
    const sMs = new Date(d.start).getTime();
    const eMs = d.end ? new Date(d.end).getTime() : sMs;
    const durata = eMs - sMs; // Durata preservata
    const offsetGiorni = 7; // Es. sposta di +7 giorni
    const shiftMs = offsetGiorni * 24 * 60 * 60 * 1000;
    const nStart = new Date(sMs + shiftMs);
    const nEnd = new Date(sMs + shiftMs + durata);
    const fmt = dt => {
        const c = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
        return c.toISOString().slice(0, 16); // usa split('T')[0] per date senza ora
    };
    return { start: fmt(nStart), end: fmt(nEnd) };
})()

AVVERTENZA SULLE FUNZIONI RAPIDE:
Usa UNISCI() o SOMMA() in modalità Array solo su colonne che contengono primitive testuali o numeriche semplici.
Se devi manipolare o mappare campi complessi (come le date) estratti da 'tabella["..."]', NON USARE le scorciatoie. Usa ESCLUSIVAMENTE i metodi nativi Javascript: .filter( ).map( ).join( ) assicurandoti di estrarre correttamente l'oggetto interno (es. obj.start).

IL MIO DATABASE ATTUALE:
Nome del Database corrente: "${state.title}"
Campi disponibili in questo database:
${colsInfo.join('\n')}

LA MIA RICHIESTA:
[Scrivi qui cosa vuoi ottenere nella tua formula, prestando attenzione ai nomi esatti delle colonne in base a quanto sopra]`;


        navigator.clipboard.writeText(prompt).then(() => {
            const btn = document.getElementById('btnCopyAIPrompt');
            if (btn) {
                const originalHTML = btn.innerHTML;
                btn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.checkCircle} Copiato!</span>`;
                btn.classList.add('btn-primary');
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.classList.remove('btn-primary');
                }, 2000);
            }
        }).catch(err => {
            console.error("Errore copia prompt: ", err);
            alert("Impossibile copiare negli appunti.");
        });
    },

    insertCodeAtCaret: (inputEl, codeToInsert, caretOffsetBack = 0) => {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        let startOffset = Editor._getCodeOffset(inputEl, sel.anchorNode, sel.anchorOffset);
        let endOffset = Editor._getCodeOffset(inputEl, sel.focusNode, sel.focusOffset);

        if (startOffset > endOffset) {
            const t = startOffset; startOffset = endOffset; endOffset = t;
        }

        const rawText = typeof Editor !== 'undefined' && Editor._getRawText ? Editor._getRawText(inputEl) : inputEl.innerText;
        // Spoglia l'ultimo a capo fantasma
        const cleanText = rawText.endsWith('\n') ? rawText.slice(0, -1) : rawText;

        let startReplace = startOffset;
        let endReplace = endOffset;

        // Autocomplete Intelligente: Valuta l'eliminazione dei frammenti incompleti all'indietro e in avanti
        if (startOffset === endOffset && caretOffsetBack === 0) {
            const textBefore = cleanText.substring(0, startOffset);
            const textAfter = cleanText.substring(startOffset);
            let charsToDelete = 0;

            // Caso 1: Stiamo inserendo un'intera macro es: riga['Nome'] o tabella['...']
            if (codeToInsert.startsWith('riga[') || codeToInsert.startsWith('tabella[')) {
                
                const macroMatch = textBefore.match(/(riga|tabella)\[?['"]?[^'"]*$/);
                if (macroMatch) {
                    charsToDelete = macroMatch[0].length;
                }
                
                // Mangiamento in avanti se stiamo "Sostituendo" un valore dentro le quadre
                if (textAfter.startsWith('"]')) endReplace += 2;
                else if (textAfter.startsWith("']")) endReplace += 2;
                else if (textAfter.startsWith('"') || textAfter.startsWith("'")) endReplace += 1;
                else if (textAfter.startsWith(']')) endReplace += 1;
            }
            // Caso 2: Stiamo inserendo la coda finale della chiamata es: Nome"]
            else if (codeToInsert.endsWith('"]') || codeToInsert.endsWith("']")) {
                const inStringMatch = textBefore.match(/\[['"]([^'"]*)$/);
                if (inStringMatch) {
                    charsToDelete = inStringMatch[1].length; 
                } else {
                    const wordMatch = textBefore.match(/[a-zA-Z0-9_]*$/);
                    if (wordMatch) charsToDelete = wordMatch[0].length;
                }

                if (textAfter.startsWith('"]')) endReplace += 2;
                else if (textAfter.startsWith("']")) endReplace += 2;
                else if (textAfter.startsWith('"') || textAfter.startsWith("'")) endReplace += 1;
                else if (textAfter.startsWith(']')) endReplace += 1;
            }
            // Caso 3: Qualsiasi altra parola o funzione
            else {
                const wordMatch = textBefore.match(/[a-zA-Z0-9_]*$/);
                if (wordMatch) charsToDelete = wordMatch[0].length;
                
                if (codeToInsert.endsWith(')')) {
                    if (textAfter.startsWith(')')) endReplace += 1;
                }
            }

            startReplace -= charsToDelete;
            if (startReplace < 0) startReplace = 0;
        }

        const newText = cleanText.substring(0, startReplace) + codeToInsert + cleanText.substring(endReplace);
        
        inputEl.textContent = newText;
        if (typeof CodeManager !== 'undefined') CodeManager.highlightBlock(inputEl, true);

        const newPos = startReplace + codeToInsert.length - caretOffsetBack;
        Editor._setCodeOffset(inputEl, newPos, newPos);

        AdvancedTable.triggerLiveValidation(newText);
        AdvancedTable.updateFormulaHints(newText.replace(/\u00A0/g, ' '), newPos);
    },

    updateFormulaHints: (text, cursorPosition) => {
        const textBeforeCursor = text.substring(0, cursorPosition);

        const hintsContainer = document.getElementById('advFormulaAvailableCols');
        const contextTitle = document.getElementById('advFormulaContextHelp');

        if (!hintsContainer || !contextTitle) return;

        hintsContainer.innerHTML = '';

        const { state, colId } = AdvancedTable._pendingFormulaConfig;

        // FILTRO RIGOROSO RDBMS: Raccoglie solo i Database primari che possiedono righe interrogabili,
        // escludendo blocchi di codice, bottoni, colonne, diari, tabelle pivot e viste collegate.
        const dbList = [];
        if (AppState.databases) {
            Object.keys(AppState.databases).forEach(id => {
                const s = AppState.databases[id];
                if (!s || !s.columns || !Array.isArray(s.columns)) return;

                // Esclusione categorica di elementi non pertinenti o non interrogabili
                if (s.isPivot || s.isLinkedView) return;
                if (id.startsWith('adv_code_') || id.startsWith('adv_btnbar_') || id.startsWith('adv_cols_') || id.startsWith('adv_journal_')) return;
                if (s.entries || s.buttons) return;

                dbList.push({
                    dbTitle: s.title || 'Database',
                    id: id
                });
            });
        }

        // Ordine alfabetico dei Database Primari
        dbList.sort((a, b) => a.dbTitle.localeCompare(b.dbTitle, undefined, { numeric: true, sensitivity: 'base' }));

        const referencedDBs = [];
        const regexDB = /tabella\[['"]([^'"]+)['"]\]/g;
        let matchDB;
        while ((matchDB = regexDB.exec(text)) !== null) {
            if (!referencedDBs.includes(matchDB[1])) referencedDBs.push(matchDB[1]);
        }

        const getDbSchema = (dbTitle) => {
            if (!AppState.databases) return null;
            for (let id in AppState.databases) {
                const s = AppState.databases[id];
                if (s && s.title === dbTitle && !s.isPivot && !s.isLinkedView && s.columns && Array.isArray(s.columns)) return s.columns;
            }
            return null;
        };

        const createGroup = (title, icon, isOpen = false) => {
            const details = document.createElement('details');
            details.open = isOpen;
            details.style.marginBottom = '8px';
            details.style.background = 'var(--bg-color)';
            details.style.border = '1px solid var(--border-color)';
            details.style.borderRadius = '6px';
            
            const summary = document.createElement('summary');
            summary.style.padding = '8px 10px';
            summary.style.fontWeight = 'bold';
            summary.style.cursor = 'pointer';
            summary.style.outline = 'none';
            summary.style.color = 'var(--text-primary)';
            summary.style.fontSize = '0.8rem';
            summary.style.userSelect = 'none';
            summary.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px;"><span style="color:var(--accent-color);">${icon}</span> ${title}</span>`;
            
            const content = document.createElement('div');
            content.style.padding = '10px';
            content.style.borderTop = '1px solid var(--border-color)';
            content.style.display = 'flex';
            content.style.flexDirection = 'column';
            content.style.gap = '6px';

            details.appendChild(summary);
            details.appendChild(content);
            return { details, content };
        };

        const createCompactPill = (label, codeToInsert, container) => {
            const pill = document.createElement('span');
            pill.className = 'adv-select-pill default-color';
            pill.style.cursor = 'pointer';
            pill.style.fontFamily = 'monospace';
            pill.style.marginRight = '2px';
            pill.style.marginBottom = '4px';
            pill.textContent = label;

            // FIX: Previene la perdita del cursore nel PRE quando si clicca il suggerimento
            pill.addEventListener('mousedown', (e) => {
                e.preventDefault(); 
                const inputEl = document.getElementById('advFormulaInput');
                AdvancedTable.insertCodeAtCaret(inputEl, codeToInsert);
            });
            container.appendChild(pill);
        };

        const createLogicRow = (label, codeToInsert, desc, container) => {
            const div = document.createElement('div');
            div.style.width = '100%'; div.style.display = 'flex'; div.style.alignItems = 'flex-start'; div.style.gap = '8px';

            const pillBtn = document.createElement('span');
            pillBtn.className = 'adv-select-pill default-color';
            pillBtn.style.cursor = 'pointer'; pillBtn.style.fontFamily = 'monospace';
            pillBtn.style.flexShrink = '0';
            pillBtn.textContent = label;
            
            pillBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const inputEl = document.getElementById('advFormulaInput');
                AdvancedTable.insertCodeAtCaret(inputEl, codeToInsert);
            });

            const descSpan = document.createElement('span');
            descSpan.style.fontSize = '0.75rem'; descSpan.style.color = 'var(--text-secondary)';
            descSpan.style.marginTop = '2px';
            descSpan.textContent = desc;

            div.appendChild(pillBtn); div.appendChild(descSpan); container.appendChild(div);
        };

        hintsContainer.innerHTML = `
            <div id="adv-dynamic-section" style="margin-bottom: 15px; display:flex; flex-direction:column; gap:4px; flex-shrink:0;"></div>
            <div id="adv-static-section" style="padding-top: 5px; flex:1;">
                <div id="adv-dict-container" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>
        `;

        const dynContainer = document.getElementById('adv-dynamic-section');
        const dictContainer = document.getElementById('adv-dict-container');

        // SUGGERIMENTO DINAMICO: L'utente sta digitando tabella["... (Formato compatto a pillole orizzontali)
        if (textBeforeCursor.match(/tabella\[['"]([^'"]*)$/)) {
            contextTitle.style.display = 'block';
            contextTitle.textContent = `Seleziona il Database Esistente:`;
            if (dbList.length > 0) {
                const pillContainer = document.createElement('div');
                pillContainer.style.display = 'flex'; 
                pillContainer.style.flexWrap = 'wrap'; 
                pillContainer.style.gap = '4px';

                dbList.forEach(db => {
                    const pill = document.createElement('span');
                    pill.className = 'adv-select-pill default-color'; 
                    pill.style.cursor = 'pointer'; 
                    pill.style.fontFamily = 'monospace';
                    pill.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px; margin-right:4px;">${Icons.tableDatabase}</span> ${UI.escapeHTML(db.dbTitle)}`;
                    
                    pill.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        const inputEl = document.getElementById('advFormulaInput');
                        AdvancedTable.insertCodeAtCaret(inputEl, `${db.dbTitle}"]`);
                    });
                    pillContainer.appendChild(pill);
                });
                dynContainer.appendChild(pillContainer);
            } else {
                dynContainer.innerHTML = '<span style="color:var(--text-secondary); font-size:0.8rem; width:100%; padding-left:5px;">Nessun database trovato nello spazio di lavoro.</span>';
            }
            return;
        }

        if (textBeforeCursor.match(/riga\[['"]([^'"]*)$/)) {
            contextTitle.style.display = 'block';
            contextTitle.textContent = `Completa nome Colonna Locale:`;
            const pillCont = document.createElement('div');
            pillCont.style.display = 'flex'; pillCont.style.flexWrap = 'wrap'; pillCont.style.gap = '4px';
            (state.columns || []).forEach(c => {
                if (c.id !== colId) createCompactPill(c.name, `${c.name}"]`, pillCont);
            });
            dynContainer.appendChild(pillCont);
            return;
        }

        const chainMatch = textBeforeCursor.match(/\.([a-zA-Z]*)$/);
        if (chainMatch) {
            const beforeDot = textBeforeCursor.substring(0, textBeforeCursor.length - chainMatch[0].length).trim();

            let expectedType = null;
            if (beforeDot.endsWith('righe') || /tabella\[['"][^'"]+['"]\]$/.test(beforeDot) || /(filter|map)\s*\([^]*\)$/.test(beforeDot)) {
                expectedType = 'array';
            } else if (/riga\[['"][^'"]+['"]\]$/.test(beforeDot) || /find\s*\([^]*\)$/.test(beforeDot)) {
                expectedType = 'object';
            } else if (/(join|substring|toUpperCase|toLowerCase|replace)\s*\([^]*\)$/.test(beforeDot) || /UNISCI\s*\([^]*\)$/.test(beforeDot)) {
                expectedType = 'string';
            } else if (/(reduce)\s*\([^]*\)$/.test(beforeDot) || beforeDot.endsWith('.length') || /(SOMMA|MEDIA|CONTA)\s*\([^]*\)$/.test(beforeDot)) {
                expectedType = 'number';
            }

            if (expectedType) {
                contextTitle.style.display = 'block';
                contextTitle.textContent = `Metodi concatenati disponibili:`;
                if (expectedType === 'array') {
                    createLogicRow('.map(r => ...)', `map(r => r["Colonna"])`, 'Estrae una colonna specifica da tutti i record.', dynContainer);
                    createLogicRow('.filter(r => ...)', `filter(r => r["Colonna"] === "Valore")`, 'Mantiene solo i record corrispondenti al criterio.', dynContainer);
                    createLogicRow('.find(r => ...)', `find(r => r["Colonna"] === "Valore")`, 'Trova e restituisce il PRIMO record corrispondente.', dynContainer);
                    createLogicRow('.reduce(...)', `reduce((somma, r) => somma + Number(r["Colonna"] || 0), 0)`, 'Calcola un valore unico aggregato (es. somma totale).', dynContainer);
                    createLogicRow('.join(...)', `join(", ")`, 'Unisce un array testuale in una singola stringa.', dynContainer);
                    createLogicRow('.length', `length`, 'Restituisce il numero totale di elementi della lista.', dynContainer);
                } else if (expectedType === 'object') {
                    createLogicRow('["Colonna"]', `[""]`, 'Accedi a una colonna di questo specifico record.', dynContainer);
                } else if (expectedType === 'string') {
                    createLogicRow('.includes(...) ? ...', `includes("@") ? "Valida" : "Non Valida"`, 'Verifica se contiene un testo (Operatore ternario If/Else).', dynContainer);
                    createLogicRow('.replace(...)', `replace("Admin", "Amministratore")`, 'Sostituisce una porzione di testo con un\'altra.', dynContainer);
                    createLogicRow('.substring(...)', `substring(0, 3)`, 'Taglia il testo mantenendo solo l\'intervallo (es. primi 3 caratteri).', dynContainer);
                    createLogicRow('.toLowerCase()', `toLowerCase()`, 'Converte tutto il testo in minuscolo.', dynContainer);
                    createLogicRow('.toUpperCase()', `toUpperCase()`, 'Converte tutto il testo in MAIUSCOLO.', dynContainer);
                    createLogicRow('.length', `length`, 'Lunghezza in numero di caratteri.', dynContainer);
                } else if (expectedType === 'number') {
                    dynContainer.innerHTML = '<span style="color:var(--text-secondary); font-size:0.8rem; padding-left:5px;">Nessun metodo testuale/array da suggerire per valori puramente numerici.</span>';
                }
                return;
            }
        }
        
        contextTitle.style.display = 'none';

        const varGroup = createGroup('Variabili Principali', Icons.gear, true);
        const varPillCont = document.createElement('div');
        varPillCont.style.display = 'flex'; varPillCont.style.gap = '4px'; varPillCont.style.flexWrap = 'wrap';
        createCompactPill('riga["..."]', 'riga[""]', varPillCont);
        createCompactPill('tabella["..."]', 'tabella[""]', varPillCont);
        createCompactPill('righe', 'righe', varPillCont);
        varGroup.content.appendChild(varPillCont);
        dynContainer.appendChild(varGroup.details);

        const logicGroup = createGroup('Condizioni e Aggregazioni', Icons.listFilter, false);
        createLogicRow('SE()', 'SE(riga[""] === "", "Vero", "Falso")', 'Esegue un test: se vero mostra un risultato, altrimenti un altro.', logicGroup.content);
        createLogicRow('SOMMA()', 'SOMMA(tabella[""], "")', 'Somma tutti i numeri di una specifica colonna (o argomenti multipli).', logicGroup.content);
        createLogicRow('MEDIA()', 'MEDIA(tabella[""], "")', 'Calcola la media matematica ignorando le celle vuote.', logicGroup.content);
        createLogicRow('CERCA()', 'CERCA(tabella[""], "ColRicerca", riga["ColInterna"], "DatoRitorno")', 'Cerca un valore in un altro Database.', logicGroup.content);
        createLogicRow('CONTA()', 'CONTA(tabella[""], "Colonna", "ValoreEsatto")', 'Conta quante volte compare un valore esatto.', logicGroup.content);
        createLogicRow('UNISCI()', 'UNISCI(tabella[""], "Colonna")', 'Unisce i testi in una singola stringa, separati da virgola.', logicGroup.content);
        dynContainer.appendChild(logicGroup.details);
        
        const hierGroup = createGroup('Struttura (Padri e Figli)', Icons.treeNode, false);
        createLogicRow('NOTA_CORRENTE()', 'NOTA_CORRENTE()', "Restituisce l'ID della nota corrente.", hierGroup.content);
        createLogicRow('PADRE()', 'PADRE(NOTA_CORRENTE())', "Ottiene l'ID del genitore di una nota.", hierGroup.content);
        createLogicRow('FIGLI()', 'FIGLI(NOTA_CORRENTE())', "Ottiene gli ID delle note figlie.", hierGroup.content);
        createLogicRow('PROPRIETA()', 'PROPRIETA(PADRE(NOTA_CORRENTE()), "Tag")', "Estrae un valore dai tag di una pagina.", hierGroup.content);
        dynContainer.appendChild(hierGroup.details);

        const dateGroup = createGroup('Date, Tempi e Scadenze', Icons.time, false);
        createLogicRow('DATA_DIFF()', 'DATA_DIFF(riga["Scadenza"], riga["Inizio"], "giorni")', 'Calcola la differenza tra due date. Unità: giorni, ore, minuti, secondi, mesi, anni.', dateGroup.content);
        createLogicRow('DATA_AGGIUNGI()', 'DATA_AGGIUNGI(riga["Inizio"], 7, "giorni")', 'Aggiunge o sottrae tempo a una data restituendo un nuovo Timestamp.', dateGroup.content);
        createLogicRow('OGGI()', 'OGGI()', 'Restituisce la data odierna (Senza orario: AAAA-MM-GG).', dateGroup.content);
        createLogicRow('ADESSO()', 'ADESSO()', 'Restituisce data e ora esatta (AAAA-MM-GG HH:MM).', dateGroup.content);
        createLogicRow('ANNO()', 'ANNO(riga["Data"])', 'Estrae solo l\'anno da una data.', dateGroup.content);
        createLogicRow('MESE()', 'MESE(riga["Data"])', 'Estrae il numero del mese (1-12) da una data.', dateGroup.content);
        createLogicRow('GIORNO()', 'GIORNO(riga["Data"])', 'Estrae il giorno del mese (1-31).', dateGroup.content);
        createLogicRow('GIORNO_SETTIMANA()', 'GIORNO_SETTIMANA(riga["Data"])', 'Restituisce il giorno della settimana in numero (1 = Lunedì, 7 = Domenica).', dateGroup.content);
        createLogicRow('ORA()', 'ORA(riga["Data"])', 'Estrae l\'ora (0-23).', dateGroup.content);
        createLogicRow('MINUTO()', 'MINUTO(riga["Data"])', 'Estrae il minuto (0-59).', dateGroup.content);
        dynContainer.appendChild(dateGroup.details);

        const mathGroup = createGroup('Matematica Avanzata', Icons.formula, false);
        createLogicRow('Math.max(...)', `Math.max(...righe.map(r => Number(r["Colonna"]||0)))`, 'Trova il valore massimo assoluto in una colonna.', mathGroup.content);
        createLogicRow('Math.min(...)', `Math.min(...righe.map(r => Number(r["Colonna"]||0)))`, 'Trova il valore minimo assoluto in una colonna.', mathGroup.content);
        createLogicRow('Math.round(...)', `Math.round( )`, 'Arrotonda un numero decimale all\'intero più vicino.', mathGroup.content);
        dynContainer.appendChild(mathGroup.details);

        let dictHTML = `
            <div style="font-size:0.75rem; font-weight:bold; color:var(--text-secondary); text-transform:uppercase; letter-spacing: 0.05em; margin-bottom:5px;">Dizionario Colonne</div>
            <div style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; padding:10px; margin-bottom:8px;">
                <div style="font-size:0.8rem; font-weight:bold; color:var(--accent-color); margin-bottom:8px; display:flex; align-items:center; gap:5px;"><span style="display:inline-flex;">${Icons.tableDatabase}</span> ${state.title} (Attuale)</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">
        `;
        (state.columns || []).forEach(c => {
            if (c.id !== colId) {
                const safeName = (c.name || '').replace(/'/g, "\\'");
                dictHTML += `<span class="adv-select-pill default-color" style="cursor:pointer; font-family:monospace; font-size:0.75rem;" title="Aggiungi colonna locale" onmousedown="event.preventDefault(); AdvancedTable.insertCodeAtCaret(document.getElementById('advFormulaInput'), 'riga[\\'${safeName}\\']')">${c.name}</span>`;
            }
        });
        dictHTML += `</div></div>`;

        referencedDBs.forEach(dbTitle => {
            const schema = getDbSchema(dbTitle);
            if (schema) {
                dictHTML += `
                    <div style="background:var(--bg-color); border:1px dashed var(--border-color); border-radius:6px; padding:10px; margin-bottom:8px;">
                        <div style="font-size:0.8rem; font-weight:bold; color:var(--text-primary); margin-bottom:8px; display:flex; align-items:center; gap:5px;"><span style="display:inline-flex;">${Icons.relation}</span> ${dbTitle}</div>
                        <div style="display:flex; flex-wrap:wrap; gap:4px;">
                `;
                schema.forEach(c => {
                    const safeName = (c.name || '').replace(/"/g, '\\"');
                    dictHTML += `<span class="adv-select-pill default-color" style="cursor:pointer; font-family:monospace; font-size:0.75rem;" title="Inserisci nome colonna come testo" onmousedown='event.preventDefault(); AdvancedTable.insertCodeAtCaret(document.getElementById("advFormulaInput"), "\\"${safeName}\\"")'>"${c.name}"</span>`;
                });
                dictHTML += `</div></div>`;
            }
        });
        dictContainer.innerHTML = dictHTML;
    },

    triggerLiveValidation: (formulaStr) => {
        clearTimeout(AdvancedTable._validationTimer);
        const icon = document.getElementById('advFormulaStatusIcon');
        const text = document.getElementById('advFormulaStatusText');
        const btn = document.getElementById('advFormulaSaveBtn');

        icon.innerHTML = Icons.hourglass;
        text.textContent = 'Validazione in corso...';
        text.style.color = 'var(--text-secondary)';

        AdvancedTable._validationTimer = setTimeout(async () => {
            if (!formulaStr.trim()) {
                icon.innerHTML = Icons.info; text.textContent = 'Formula vuota.'; btn.disabled = false; return;
            }

            const { state, tableId } = AdvancedTable._pendingFormulaConfig;

            let mockRow = { id: 'mock', cells: {}, virtualCells: {}, createdAt: Date.now(), updatedAt: Date.now() };
            if (state.isPivot && state.sourceTableId) {
                const srcState = AdvancedTable.getTableState(state.sourceTableId);
                if (srcState && srcState.rows && srcState.rows.length > 0) mockRow = { ...srcState.rows[0] };
            } else if (state.rows && state.rows.length > 0) {
                mockRow = { ...state.rows[0], virtualCells: { ...(state.rows[0].cells || {}) } };
            }

            try {
                const riga = AdvancedTable._buildRigaContext(mockRow, state.columns || [], mockRow.virtualCells, {}, tableId);
                const tabella = AdvancedTable._buildTabellaContext();
                const righe = tabella[state.title] || [];

                const fullCode = `'use strict';\n${AdvancedTable._formulaWrappers}\nreturn ${formulaStr};`;

                const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                // INIEZIONE DI APPSTATE NEL SANDBOX DELLA PREVIEW
                const executor = new AsyncFunction('riga', 'tabella', 'righe', 'window', 'document', 'localStorage', 'fetch', 'AppState', 'Store', 'Editor', 'AdvancedTable', 'UI', fullCode);
                
                const result = await executor.call(null, riga, tabella, righe, undefined, undefined, undefined, undefined, AppState, Store, undefined, AdvancedTable, undefined);

                icon.innerHTML = Icons.checkCircle;
                icon.style.color = 'var(--accent-color)';
                text.textContent = `Risultato (Riga 1): ${String(result)}`;
                text.style.color = 'var(--accent-color)';
                btn.disabled = false;
            } catch (e) {
                icon.innerHTML = Icons.alertTriangle;
                icon.style.color = 'var(--danger-color)';
                text.textContent = `Errore Sintassi: ${e.message}`;
                text.style.color = 'var(--danger-color)';
            }
        }, 300);
    },

    saveFormula: () => {
        const { tableId, colId } = AdvancedTable._pendingFormulaConfig;
        const inputArea = document.getElementById('advFormulaInput');
        
        if (inputArea) {
            let newFormula = inputArea.innerText || inputArea.textContent || '';
            // Pulisce gli spazi zero-width o no-break che mandano in crash il motore JS
            newFormula = newFormula.replace(/\u00A0/g, ' ').replace(/\u200B/g, '');
            
            if (newFormula.endsWith('\n\n')) newFormula = newFormula.slice(0, -1);
            else if (newFormula.endsWith('\n') && newFormula !== '\n') newFormula = newFormula.slice(0, -1);

            let state = AdvancedTable.getState(tableId);
            const col = (state.columns || []).find(c => c.id === colId);

            if (col) col.formula = newFormula.trim();
            AdvancedTable.setState(tableId, state);

            AdvancedTable.renderTable(tableId);
            Store.triggerAutoSave();
        }
        UI.closeDrawer();
    }
});