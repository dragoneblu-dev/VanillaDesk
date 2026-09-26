Manual.registerSection(
    'sec-9',
    '9. Le Automazioni dei Database (⚡)',
    `<p>Le <b>Automazioni</b> trasformano un Database statico in un sistema auto-aggiornante che esegue il lavoro sporco al posto tuo. Trovi l'icona del Fulmine (⚡ Auto) nell'intestazione del database.</p>
    
    <h4>Come funzionano? Struttura Trigger & Azione</h4>
    <p>Ogni automazione è composta da un blocco <b>QUANDO (Trigger)</b> e da un blocco <b>ALLORA (Azioni)</b>. Il sistema valuta le regole nell'esatto momento in cui modifichi o crei una riga della tabella.</p>
    <ul>
        <li><b>Protezione Anti-Loop (Call-Stack Limiter):</b> Il motore logico è intelligente. Se crei un'automazione A che innesca una modifica che fa scattare l'automazione B che a sua volta scatena la A all'infinito, l'engine <b>bloccherà l'esecuzione dopo 10 ricorsioni</b>, salvando il browser da un crash (Freeze). Se un'automazione sembra fermarsi a metà, potresti aver creato un loop infinito!</li>
        <li><b>Eventi di Sistema:</b> Puoi scegliere di reagire a specifici eventi universali:
            <ul>
                <li><b>⚡ Creazione Nuova Riga</b> (scatta appena aggiungi una riga).</li>
                <li><b>⚡ Qualsiasi Modifica Dati</b> (scatta appena tocchi qualunque cella).</li>
                <li><b>🌐 Modifica in altro Database (Cross-DB):</b> Scatta se viene modificato un record in un DB *Diverso* (utile per aggiornare ricalcoli di giacenze quando aggiungi una fattura).</li>
                <li><b>👁️ Al Caricamento (On-Load):</b> Esegue l'azione silenziosamente non appena apri la nota e la tabella viene disegnata a schermo. Ottimo per aggiornare stati dinamici ("In Ritardo") senza che l'utente debba toccare nulla.</li>
                <li><b>⏰ Orario Programmato (Cron-job):</b> Il motore interno controlla ogni 60 secondi l'orario del PC e può far scattare le azioni in automatico! (Vedi sotto).</li>
            </ul>
        </li>
    </ul>

    <h4>Le Azioni (SET)</h4>
    <p>Le azioni che puoi compiere si adattano "magicamente" alla colonna di destinazione che scegli:</p>
    <ol>
        <li><b>Numeri (Matematica):</b> Oltre a inserire un valore fisso, puoi scegliere di <i>Incrementare (+) o Decrementare (-)</i> il valore attuale della cella! Ideale per la gestione degli inventari.</li>
        <li><b>Date e Ora:</b> Puoi assegnare "Data di Oggi" (YYYY-MM-DD), oppure <b>"Data e Ora di Adesso"</b> (YYYY-MM-DD HH:MM), fondamentale per i Timestamp di ultimazione lavori.</li>
        <li><b>Relazioni e Multi-Select:</b> Puoi <i>aggiungere o togliere</i> specifici valori senza dover sovrascrivere l'intero Array. Il sistema capisce che stai aggiungendo un Tag!</li>
        <li><b>Formula JS:</b> Esegue uno script invisibile in Javascript e ne salva il risultato definitivo. Ora supportato anche su Date e Relazioni!</li>
    </ol>

    <div style="background: rgba(0,0,0,0.03); padding: 15px; border-radius: 6px; border: 1px solid var(--border-color); margin-top: 15px;">
        <h4 style="margin-top:0; color:var(--text-primary);">6 Esempi Pratici di Automazione</h4>
        <ol style="margin: 0; padding-left: 20px; font-size: 0.9rem; line-height: 1.6;">
            <li style="margin-bottom: 10px;">
                <b>Tracciamento Completamento (Timestamps)</b><br>
                <i>QUANDO:</i> "Stato" = "Fatto"<br>
                <i>ALLORA:</i> "Data Fine" ➔ <code>Data e Ora di Adesso</code>
            </li>
            <li style="margin-bottom: 10px;">
                <b>Pulizia Formattazione (JS Formula)</b><br>
                <i>QUANDO:</i> "Codice Fiscale" ➔ Non è vuoto<br>
                <i>ALLORA:</i> "Codice Fiscale" ➔ <code>Formula JS: riga['Codice Fiscale'].toUpperCase().trim()</code>
            </li>
            <li style="margin-bottom: 10px;">
                <b>Allarme Scadenza (Cron Job in background)</b><br>
                <i>QUANDO:</i> "⏰ Orario Programmato" ➔ Basato su colonna "Data Scadenza" ➔ 0 Giorni Prima<br>
                <i>ALLORA:</i> "⚙️ Azione di Sistema" ➔ <code>Allarme Sonoro Continuo</code> (Testo: = "Scadenza Task: " + riga['Nome'])
            </li>
            <li style="margin-bottom: 10px;">
                <b>Ricalcolo Giacenze (Cross-Database)</b><br>
                <i>QUANDO:</i> "🌐 Modifica in altro DB" ➔ Seleziona "DB Ordini"<br>
                <i>ALLORA:</i> "Giacenza" ➔ <code>Formula JS: riga['Pezzi Iniziali'] - SOMMA(tabella['DB Ordini'].filter(o => o['Articolo'] === riga['Nome']), 'Quantità')</code>
            </li>
            <li style="margin-bottom: 10px;">
                <b>Auto-Categorizzazione per importi</b><br>
                <i>QUANDO:</i> "Importo" ➔ > 1000<br>
                <i>ALLORA:</i> "Categoria" (Multi-Select) ➔ <code>Aggiungi all'elenco: "Premium"</code>
            </li>
            <li>
                <b>Allarme Giorno Lavorativo del Mese (Formula JS Avanzata)</b><br>
                Immagina di avere una tabella con le colonne "Giorno Target" (Numero) e "Orario" (Testo/Ora). Vuoi che l'allarme suoni ad esempio il 3° giorno lavorativo del mese alle 10:30.<br>
                <i>QUANDO:</i> "⏰ Condizione a Tempo" ➔ <code>Formula JS (Personalizzata)</code><br>
                <i>ALLORA:</i> "⚙️ Azione di Sistema" ➔ <code>Allarme Sonoro Continuo</code><br>
                <div style="background:#1e1e1e; color:#d4d4d4; padding:10px; border-radius:4px; font-family:monospace; margin-top:5px; font-size:0.8rem; overflow-x:auto; white-space:pre;">
(() => {
    // Estrapoliamo i parametri dalla riga del database (es. 3 e "10:30")
    const targetGiornoLavorativo = Number(riga["Giorno Target"]); 
    const targetOrario = riga["Orario"]; 
    if (!targetGiornoLavorativo || !targetOrario) return false;

    const now = new Date();

    // 1. Controllo Orario
    const [targetH, targetM] = targetOrario.split(":").map(Number);
    if (now.getHours() !== targetH || now.getMinutes() !== targetM) {
        return false;
    }

    // 2. Controllo Weekend (In Javascript 0=Domenica, 6=Sabato)
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;

    // 3. Calcolo Giorni Lavorativi trascorsi nel mese
    let giorniLavorativiPassati = 0;
    const year = now.getFullYear();
    const month = now.getMonth();

    for (let d = 1; d <= now.getDate(); d++) {
        let dow = new Date(year, month, d).getDay();
        if (dow !== 0 && dow !== 6) giorniLavorativiPassati++;
    }

    // 4. Se oggi è esattamente il giorno lavorativo che abbiamo impostato, ritorna TRUE
    return giorniLavorativiPassati === targetGiornoLavorativo;
})()
                </div>
            </li>
        </ol>
    </div>`
);