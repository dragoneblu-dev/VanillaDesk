Manual.registerSection(
    'sec-10',
    '10. Barre Pulsanti e Macro (Azioni Massive)',
    `<p>Mentre le Automazioni scattano in modo invisibile su <i>singole righe</i> quando modifichi un dato, i <b>Pulsanti (Macro)</b> sono widget cliccabili che eseguono <b>Azioni Massive</b> su centinaia di record in un colpo solo, agendo su tabelle specifiche in base a filtri (Proprio come farebbero le query SQL <code>UPDATE</code> o <code>INSERT</code>).</p>
    <p><i>Nota:</i> Questo motore condivide l'esatta logica dei Pulsanti posizionati come singole Colonne all'interno del Database!</p>

    <h4>Configurazione Estetica e Sicurezza</h4>
    <p>Apri le impostazioni del pulsante per definire la prima sezione: <b>Aspetto e Comportamento</b>.</p>
    <ul>
        <li><b>Palette Colori:</b> Puoi assegnare al bottone colori tematici (Es. Verde per i Successi, Rosso per Eliminazioni/Pericoli).</li>
        <li><b>Etichetta Dinamica (=Formula):</b> L'etichetta testuale del bottone non deve per forza essere statica. Se inizi a digitare con un uguale (es. <code>="Approva " + CONTA(tabella['Ticket'], 'Stato', 'Da Approvare') + " Record"</code>), il pulsante si auto-rinominerà in tempo reale (Es. <i>"Approva 5 Record"</i>), facendoti da Dashboard vivente!</li>
        <li><b>Richiesta di Conferma:</b> Attivando la checkbox "Chiedi conferma all'utente", l'app fermerà l'esecuzione e aprirà un popup di sicurezza (<i>"Vuoi eseguire l'azione... ?"</i>) obbligando l'utente a cliccare su OK. Fondamentale per i pulsanti che alterano permanentemente i dati o inviano email in massa.</li>
    </ul>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 30px 0;">

    <h4>Come strutturare i Blocchi Logici (Macro):</h4>
    <p>Nella seconda metà del pannello, aggiungi i "Blocchi Azione" che verranno eseguiti in sequenza. Per ogni blocco definisci:</p>
    <ul>
        <li><b>Database Bersaglio (O "Questa Riga"):</b> La tabella su cui il pulsante andrà a operare. <br><span style="color:var(--accent-color); font-size:0.85em;">💡 <b>Pro-Tip:</b> Se configuri il pulsante come *Colonna* di un database invece che come barra separata, vedrai l'opzione <code>[Questa Riga]</code>. Invece di lanciare la modifica su tutto il database, l'azione verrà circoscritta e lanciata *solamente* per la riga esatta in cui l'utente ha premuto il pulsante.</span></li>
        <li><b>Tipo di Azione:</b> Puoi scegliere tra <code>Modifica (UPDATE)</code> per alterare righe esistenti, <code>Aggiungi Singola Riga (INSERT)</code>, <code>Copia Righe (INSERT_SELECT)</code> per clonare in blocco intere righe da un altro DB o <code>Invia Email (mailto)</code>.</li>
        <li><b>Condizioni (WHERE):</b> I filtri che determinano <i>quali</i> righe andranno modificate. Se non metti filtri, il pulsante opererà sull'intero database. Supporta anche la <b>Formula JS</b> per condizioni incrociate!</li>
        <li><b>Azione (SET):</b> Le modifiche vere e proprie che verranno scritte nelle celle (o estratte con la funzione <code>[Copia] Valore da Colonna Origine</code> nel caso di un Travaso dati INSERT_SELECT).</li>
    </ul>

    <div style="background: rgba(0,0,0,0.03); padding: 15px; border-radius: 6px; border: 1px solid var(--border-color); margin-top: 15px;">
        <h4 style="margin-top:0; color:var(--text-primary);">5 Esempi Pratici di Macro</h4>
        <ol style="margin: 0; padding-left: 20px; font-size: 0.9rem; line-height: 1.6;">
            <li style="margin-bottom: 10px;">
                <b>Archiviazione Massiva ("Chiudi Mese")</b><br>
                <i>AZIONE:</i> <code>Modifica (UPDATE)</code> in DB "Fatture"<br>
                <i>FILTRO (WHERE):</i> "Stato" = "Pagato"<br>
                <i>SET:</i> "Archiviato" ➔ Spunta (Sì)
            </li>
            <li style="margin-bottom: 10px;">
                <b>Generazione Mensilità Rapida (Copia Righe in Massa)</b><br>
                Usa il Database "Clienti" per popolare dinamicamente il Database "Scadenze" all'inizio del mese.<br>
                <i>AZIONE:</i> <code>Copia Righe (Da Altro DB)</code> in DB "Scadenze"<br>
                <i>ORIGINE DATI:</i> DB "Clienti" ➔ Filtro: "Attivo" = Sì<br>
                <i>SET:</i> "Nome Cliente" ➔ <code>[Copia] Valore da Colonna Origine: "Nome"</code><br>
                <i>SET:</i> "Importo Fisso" ➔ <code>Formula JS: 50.00</code><br>
                <i>SET:</i> "Scadenza" ➔ <code>Inizio a Oggi</code>
            </li>
            <li style="margin-bottom: 10px;">
                <b>Spostamento Task Kanban ("Approva Tutto")</b><br>
                <i>AZIONE:</i> <code>Modifica (UPDATE)</code> in DB "Progetti"<br>
                <i>FILTRO:</i> "Fase" = "In Revisione"<br>
                <i>SET:</i> "Fase" (Select) ➔ <code>Imposta a: Approvato</code>
            </li>
            <li style="margin-bottom: 10px;">
                <b>Reset Contatori Annuale</b><br>
                <i>AZIONE:</i> <code>Modifica (UPDATE)</code> in DB "Ferie/Permessi"<br>
                <i>FILTRO:</i> "Ruolo" != "Amministratore"<br>
                <i>SET:</i> "Giorni Usati" ➔ <code>Valore Fisso: 0</code><br>
                <i>SET:</i> "Ultimo Azzeramento" ➔ <code>Solo Data di Oggi</code>
            </li>
            <li>
                <b>Invio Massivo Email di Sollecito (Mailto)</b><br>
                Apre il client di posta del tuo PC (Outlook/Mail) generando tante e-mail pre-compilate quante sono le fatture scoperte!<br>
                <i>AZIONE:</i> <code>Invia Email (mailto)</code> in DB "Fatture"<br>
                <i>FILTRO:</i> "Pagato" = No <code>AND</code> "Scadenza" < Oggi<br>
                <i>SET A (Email):</i> <code>Formula JS: riga['Email Cliente']</code><br>
                <i>SET Oggetto:</i> <code>Formula JS: "Sollecito Fattura N." + riga['ID']</code><br>
                <i>SET Corpo:</i> <code>Formula JS: "Gentile cliente,\\nNotiamo il mancato pagamento di € " + riga['Importo'] + ".\\n\\nSaluti."</code>
            </li>
        </ol>
    </div>`
);