Manual.registerSection(
    'sec-7',
    '7. Tabelle Pivot e Grafici (Dashboard Analitiche)',
    `<p>Quando un database contiene centinaia di righe, la visualizzazione a griglia diventa dispersiva. Le <b>Viste Analitiche (Pivot)</b> ti permettono di aggregare, calcolare e trasformare i dati grezzi in dashboard visive e interattive.</p>
    
    <p><b>Cos'è una Tabella Pivot?</b> È uno "specchio" in sola lettura collegato al tuo database principale. Ha il compito di raggruppare i dati identici e calcolarne dei riassunti (Statistiche, Somme, Medie). Se il database originale viene aggiornato, la Pivot ricalcolerà i totali all'istante.</p>
    
    <h4>A. Come creare una Vista Analitica</h4>
    <ol>
        <li>Apri il menu "Blocchi" e inserisci <b>"Vista / Pivot / Grafico"</b>.</li>
        <li>Dal menu a tendina, scegli il Database originale che vuoi analizzare.</li>
        <li>Clicca sul grande pulsante arancione <b>"Crea Tabella Pivot / Grafico"</b> per aprire il costruttore (Builder).</li>
    </ol>

    <h4>B. I Raggruppamenti (Asse X)</h4>
    <p>Scegli quali colonne definiscono i tuoi "gruppi". Puoi aggiungere <b>più raggruppamenti</b> contemporaneamente trascinandoli in ordine di priorità.</p>
    <ul>
        <li><i>Esempio:</i> Se selezioni "Anno" e poi "Categoria", il sistema unirà tutte le fatture dello stesso anno e della stessa categoria in un'unica riga riassuntiva.</li>
        <li>Il sistema è intelligente: se raggruppi per una colonna "Relazione" o "Multi-Select", la Pivot separerà automaticamente i tag (es. se un record ha i tag [Urgente, Backend], il record verrà contato sia nel gruppo "Urgente" che nel gruppo "Backend").</li>
    </ul>

    <h4>C. Le Metriche di Aggregazione (Asse Y)</h4>
    <p>Su ogni gruppo creato, puoi calcolare delle statistiche basate sulle altre colonne del database.</p>
    <ul style="line-height: 1.6;">
        <li><b>Conteggio (N. Record):</b> Conta quante righe originali sono finite in quel gruppo.<br><span style="color:var(--text-secondary); font-size:0.85em;">💡 <i>Use Case:</i> "Quanti ticket ha chiuso ogni sviluppatore questo mese?"</span></li>
        <li><b>Somma Aritmetica:</b> Somma tutti i numeri (Richiede una colonna Numerica o Formula).<br><span style="color:var(--text-secondary); font-size:0.85em;">💡 <i>Use Case:</i> "Qual è il totale fatturato per ogni trimestre?"</span></li>
        <li><b>Media Aritmetica:</b> Calcola la media ignorando le celle vuote.<br><span style="color:var(--text-secondary); font-size:0.85em;">💡 <i>Use Case:</i> "Qual è la media dei voti (1-5 stelle) per ogni prodotto?"</span></li>
        <li><b>Trova Valore Max / Min:</b> Trova il picco massimo o minimo assoluto. <b>Funziona anche sulle Date e sui Testi!</b><br><span style="color:var(--text-secondary); font-size:0.85em;">💡 <i>Use Case Date:</i> "Qual è stata la data dell'ultimo contatto per ogni cliente?" (Max)<br>💡 <i>Use Case Testi:</i> "Qual è il nome che viene per primo in ordine alfabetico in questo gruppo?" (Min)</span></li>
        <li><b>Uniscili in Lista Testuale:</b> Prende tutti i testi, elimina i doppioni (Distinct) e li unisce in una stringa.<br><span style="color:var(--text-secondary); font-size:0.85em;">💡 <i>Use Case:</i> "Quali clienti (nomi) hanno acquistato il prodotto X?" ➔ Risultato: <i>Mario, Luigi, Anna</i>.</span></li>
    </ul>

    <h4>D. Visualizzazione: Tabella vs Grafici</h4>
    <p>In fondo al costruttore, puoi decidere come mostrare i risultati:</p>
    <ol>
        <li><b>🔲 Tabella Pivot:</b> Mostra i dati come una classica griglia. Puoi ridimensionare le colonne, cliccare sulle intestazioni per ordinare i totali (es. dal più alto al più basso) e persino applicare <b>Filtri e Colorazioni Condizionali</b> direttamente sulla Pivot!</li>
        <li><b>📊 Grafico Visivo:</b> L'app genera un grafico interattivo (Chart.js) personalizzabile.
            <ul>
                <li><b>Tipi di Grafico:</b> A Barre, Barre Orizzontali, Linea, Ciambella (Doughnut) o Torta (Pie).</li>
                <li><b>Palette Cromatiche:</b> Puoi scegliere tra temi automatici: <i>Predefinita, Pastello, Vibrante, Oceano, Tramonto</i>.</li>
                <li><b>Opzioni Strutturali Avanzate:</b> 
                    <br>- <b>Raggruppa a blocchi (Stacking):</b> Se hai configurato esattamente <i>due raggruppamenti</i> (Asse X), il grafico a barre impilerà i valori del secondo gruppo sopra quelli del primo.
                    <br>- <b>Etichette Dati (Data Labels):</b> Puoi attivare la spunta per sovrimprimere i valori calcolati direttamente in cima alla barra o dentro la fetta di torta per una lettura più immediata senza passare il mouse.
                    <br>- <b>Totale al Centro:</b> Sui grafici a Ciambella, puoi attivare una spunta per calcolare la grande Somma Globale di tutte le fette e piazzarla a caratteri cubitali nel buco centrale del grafico!</li>
            </ul>
        </li>
    </ol>`
);