/**
 * sec-formulas.js
 * Sezione 8 del Manuale d'Uso: Motore delle Formule (Sintassi, Funzioni e Pattern).
 * Arricchita con spiegazioni approfondite, riferimenti cross-database e
 * i 20 esempi canonici di risoluzione.
 */

Manual.registerSection(
    'sec-8',
    '8. Le Formule (I 20 Esempi Pratici e Funzioni Avanzate)',
    `<p id="sec-8">Le colonne di tipo <b>Formula (∑)</b> trasformano il database in un ambiente di programmazione reattivo. Ogni formula viene valutata in una sandbox Javascript sicura che risolve automaticamente le dipendenze topologiche tra colonne calcolate.</p>

    <div style="background: rgba(234, 179, 8, 0.1); border-left: 4px solid #eab308; padding: 12px 16px; margin: 15px 0; border-radius: 6px; font-size: 0.88rem; line-height:1.5;">
        <b>⚠️ Regola Fondamentale: Distinzione Maiuscole/Minuscole (Case-Sensitive)</b><br>
        L'accesso a campi e database è rigorosamente sensibile alle maiuscole e agli spazi: <code>riga["Stato"]</code> è diverso da <code>riga["stato"]</code> o <code>riga["Stato "]</code>. Si raccomanda di utilizzare le pillole del <b>Dizionario Colonne</b> presenti nell'editor per inserire i riferimenti esatti senza errori di battitura.
    </div>

    <h4>Variabili di Sistema Predefinite</h4>
    <ul>
        <li><code>riga</code>: Rappresenta l'oggetto del record corrente. Per accedere a una colonna si utilizza la sintassi <code>riga["Nome Colonna"]</code>.</li>
        <li><code>righe</code>: È un array contenente tutti i record del database corrente (utile per calcolare somme complessive, massimi o medie percentuali rispetto al totale).</li>
        <li><code>tabella["Nome Altro DB"]</code>: Consente di interrogare in tempo reale qualsiasi altro database dello spazio di lavoro, restituendo l'array delle sue righe per eseguire ricerche e filtri incrociati.</li>
        <li><code>origine</code>: Nei pulsanti Macro interni a una colonna, rappresenta i dati della riga esatta in cui è stato premuto il pulsante.</li>
    </ul>

    <h4 id="sec-8-ai-prompt">Assistente IA & Prompt Generator</h4>
    <p>All'interno dell'editor delle formule, cliccando su <b>"Copia Prompt"</b> il sistema genera negli appunti una descrizione tecnica dettagliata dello schema del tuo database (nomi esatti dei campi, tipologie di dato, relazioni attive e vincoli di scrittura). Incollando questo testo in ChatGPT, Claude o DeepSeek, potrai richiedere la formula desiderata in linguaggio naturale e ottenere codice Javascript immediatamente compatibile con VanillaDesk.</p>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 30px 0;">

    <h4 id="sec-8-patterns">I 20 Esempi Pratici di Formule</h4>

    <h5 style="color:var(--accent-color); margin-top:15px; margin-bottom:5px;">A. Stringhe e Manipolazione Testuale</h5>
    <ul style="font-family:monospace; background:#1e1e1e; color:#d4d4d4; padding:15px; border-radius:6px; font-size:0.83rem; line-height:2; overflow-x:auto;">
        <li><span style="color:#6a9955;">// 1. Concatenazione semplice</span><br>riga["Nome"] + " " + riga["Cognome"]</li>
        <li><span style="color:#6a9955;">// 2. Testo in maiuscolo</span><br>String(riga["Stato"]).toUpperCase()</li>
        <li><span style="color:#6a9955;">// 3. Estrazione sottostringa (es. prime 3 lettere)</span><br>String(riga["Codice"]).substring(0, 3)</li>
        <li><span style="color:#6a9955;">// 4. Sostituzione testo</span><br>String(riga["Fase"]).replace("Bozza", "Definitivo")</li>
        <li><span style="color:#6a9955;">// 5. Verifica presenza testo (Operatore ternario)</span><br>String(riga["Email"]).includes("@") ? "Valida" : "Non Valida"</li>
        <li><span style="color:#6a9955;">// 6. Conteggio caratteri</span><br>String(riga["Descrizione"] || "").length</li>
    </ul>

    <h5 style="color:var(--accent-color); margin-top:20px; margin-bottom:5px;">B. Aritmetica e Condizioni Logiche</h5>
    <ul style="font-family:monospace; background:#1e1e1e; color:#d4d4d4; padding:15px; border-radius:6px; font-size:0.83rem; line-height:2; overflow-x:auto;">
        <li><span style="color:#6a9955;">// 7. Arrotondamento a 2 decimali</span><br>Math.round(Number(riga["Prezzo"] || 0) * 100) / 100</li>
        <li><span style="color:#6a9955;">// 8. Calcolo percentuale sconto</span><br>Number(riga["Importo"] || 0) * 0.80</li>
        <li><span style="color:#6a9955;">// 9. Valore massimo tra due colonne della stessa riga</span><br>Math.max(Number(riga["Valore A"] || 0), Number(riga["Valore B"] || 0))</li>
        <li><span style="color:#6a9955;">// 10. Condizionale SE</span><br>SE(Number(riga["Giacenza"] || 0) < 5, "Sotto Scorta", "Regolare")</li>
        <li><span style="color:#6a9955;">// 11. Condizionali SE nidificati</span><br>SE(riga["Stato"] === "Chiuso", "Archiviato", SE(Number(riga["Importo"]) > 1000, "Priorità Alta", "Standard"))</li>
    </ul>

    <h5 style="color:var(--accent-color); margin-top:20px; margin-bottom:5px;">C. Aggregazioni sul Database Attuale (righe)</h5>
    <ul style="font-family:monospace; background:#1e1e1e; color:#d4d4d4; padding:15px; border-radius:6px; font-size:0.83rem; line-height:2; overflow-x:auto;">
        <li><span style="color:#6a9955;">// 12. Somma dell'intera colonna del database</span><br>SOMMA(righe, "Importo")</li>
        <li><span style="color:#6a9955;">// 13. Media aritmetica</span><br>MEDIA(righe, "Votazione")</li>
        <li><span style="color:#6a9955;">// 14. Conteggio record corrispondenti a un valore esatto</span><br>CONTA(righe, "Stato", "Completato")</li>
        <li><span style="color:#6a9955;">// 15. Percentuale di incidenza della riga sul totale</span><br>Math.round((Number(riga["Fatturato"] || 0) / SOMMA(righe, "Fatturato")) * 100) + "%"</li>
        <li><span style="color:#6a9955;">// 16. Picco massimo assoluto dell'intera tabella</span><br>Math.max(...righe.map(r => Number(r["Importo"] || 0)))</li>
    </ul>

    <h5 style="color:var(--accent-color); margin-top:20px; margin-bottom:5px;">D. Interrogazioni Cross-Database (tabella["..."])</h5>
    <ul style="font-family:monospace; background:#1e1e1e; color:#d4d4d4; padding:15px; border-radius:6px; font-size:0.83rem; line-height:2; overflow-x:auto;">
        <li><span style="color:#6a9955;">// 17. Ricerca relazionale VLOOKUP (CERCA)</span><br>CERCA(tabella["Clienti"], "ID Cliente", riga["ID"], "Telefono")</li>
        <li><span style="color:#6a9955;">// 18. Somma condizionale su tabella esterna</span><br>tabella["Spese"].filter(r => r["Fornitore"] === riga["Nome"]).reduce((acc, r) => acc + Number(r["Importo"] || 0), 0)</li>
        <li><span style="color:#6a9955;">// 19. Elenco unito di ordini effettuati dal cliente</span><br>tabella["Ordini"].filter(r => r["ID Cliente"] === riga["ID"]).map(r => r["Codice"]).join(", ")</li>
        <li><span style="color:#6a9955;">// 20. Controllo di disponibilità incrociata con operatore facoltativo</span><br>tabella["Magazzino"].find(p => p["Articolo"] === riga["Nome"])?.["Giacenza"] > 0 ? "Disponibile" : "Esaurito"</li>
    </ul>`
);