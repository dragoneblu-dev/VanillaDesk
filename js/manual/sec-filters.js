Manual.registerSection(
    'sec-6',
    '6. Ricerca, Filtri, Tag Globali e Paginazione',
    `<p>L'applicazione distingue tra la ricerca generale (usata per trovare le Note e filtrare tramite metadati globali) e la manipolazione analitica dei database tramite le condizioni WHERE.</p>
    
    <h4>Ricerca Globale e Autocompletamento Tag (Sidebar)</h4>
    <p>La barra di ricerca in alto a sinistra (<i>"Cerca testo o digita #tag..."</i>, apribile rapidamente con <kbd>Ctrl + P</kbd>) scandaglia l'intero spazio di lavoro. Cerca le parole in tempo reale (a partire da 2 caratteri, oppure 1 premendo <kbd>Invio</kbd>) sia nei titoli che nei contenuti, <b>inclusi tutti i campi dei database, i testi degli appunti nascosti (Footnotes), i blocchi di codice e i diari</b>.</p>

    <ul>
        <li><b>Contatore Risultati a 2 Cifre:</b> Nel campo di ricerca il contatore indica con precisione <code>attuale/totale</code> della nota aperta (es. <code>1/3</code>, oppure <code>0/0</code> se non vi sono riscontri nella nota corrente).</li>
        <li><b>Pillole Occorrenze per Singola Nota:</b> Accanto al nome di ciascuna nota che contiene il testo cercato compare una piccola pillola colorata con il numero di corrispondenze trovate (es. <code>[5]</code>), consentendo di valutare immediatamente dove risiedono le informazioni. Il colore della pillola si adatta dinamicamente a qualunque tema attivo.</li>
        <li><b>Hashtag Cliccabili nel Testo:</b> Scrivendo un <code>#tag</code> nel corpo della nota, questo viene evidenziato automaticamente. In modalità lettura puoi cliccarlo direttamente (oppure usare <kbd>Ctrl + Click</kbd> in modalità modifica) per filtrare all'istante l'albero laterale.</li>
        <li><b>Reset Istantaneo con la Croce (✕) o <kbd>ESC</kbd>:</b> Cliccando sulla ✕ o premendo <kbd>ESC</kbd>, tutte le evidenziazioni gialle vengono rimosse all'istante dall'editor della nota aperta.</li>
    </ul>
    
    <p><b>La Magia dei Filtri Strutturali (Tag e Proprietà):</b><br>
    Digitando il prefisso <code>#</code> seguito dal termine desiderato nella barra di ricerca, compare una tendina ad alta visibilità. Il sistema legge in tempo reale il Database di Sistema (quello che gestisce le Proprietà e le Etichette di tutte le Note) e ti suggerisce filtri mirati:</p>
    <ul>
        <li><b>Filtro per Valore Specifico:</b> Se digiti <code>#Urgente</code>, il sistema ti mostra la pillola colorata con il valore esatto e la colonna a cui appartiene (es. <code>Urgente in Priorità</code>). Cliccandola, l'albero mostrerà solo le note con quel valore.</li>
        <li><b>Risoluzione Semantica delle Relazioni:</b> Se la proprietà è una <i>Relazione</i> verso un altro database o verso altre note, non vedrai mai codici tecnici incomprensibili (come <code>sys_r_*</code>). L'autocompletamento mostra sempre il <b>titolo reale e leggibile</b> del record o della pagina collegata.</li>
        <li><b>Filtro di Esistenza (*EXISTS*):</b> Digitando <code>#</code> seguito dal nome di una colonna (es. <code>#Scadenza</code>), il sistema ti proporrà <code>🏷️ Scadenza (Qualsiasi valore)</code>. Cliccandolo, isolerai tutte le pagine che hanno quella proprietà valorizzata, a prescindere dal valore inserito.</li>
    </ul>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 25px 0;">

    <h4>Pillole Filtro Interattive (Faceted Filter Chips)</h4>
    <p>Quando selezioni un suggerimento, questo si trasforma in una <b>Pillola Attiva</b> collocata subito sotto la barra di ricerca. Le pillole utilizzano un'interfaccia a doppio comando studiata per evitare click accidentali:</p>
    
    <div style="background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 8px; padding: 15px; margin: 15px 0;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
            <span class="adv-select-pill default-color" style="display:inline-flex; align-items:center; gap:0; padding:2px 4px 2px 8px; border-radius:12px; font-weight:500;">
                <span style="display:inline-flex; align-items:center; gap:4px;">Priorità: Alta <span style="opacity:0.6; font-size:0.7rem;">▾</span></span>
                <span style="width:1px; height:12px; background:currentColor; opacity:0.25; margin:0 6px;"></span>
                <span style="opacity:0.6; font-weight:bold; padding:0 2px;">✕</span>
            </span>
            <span style="font-size:0.8rem; color:var(--text-secondary);">Struttura della nuova pillola a due zone indipendenti</span>
        </div>
        <ul style="margin: 0; padding-left: 20px; font-size: 0.88rem; line-height: 1.6;">
            <li><b>Corpo della Pillola (Click per aprire il menu ▾):</b> Cliccando sul testo della pillola si apre una tendina compatta ad alta densità informativa. Da qui puoi:
                <ul>
                    <li>Cambiare istantaneamente il valore del filtro (es. passare da <i>Alta</i> a <i>Bassa</i>) senza dover riscrivere nella barra di ricerca.</li>
                    <li>Scegliere la prima voce <code>Qualsiasi valore (*EXISTS*)</code> per allargare il filtro a tutti i record compilati, oppure <code>Nessun valore (Vuoto)</code>.</li>
                    <li>Visualizzare l'elenco ordinato da A alla Z di tutti i valori realmente presenti nel workspace, con spunta di conferma sul valore attivo.</li>
                </ul>
            </li>
            <li><b>Pulsante di Chiusura (Click isolato sulla ✕):</b> Separa fisicamente il comando di cancellazione dal corpo del testo. Cliccando sulla <code>✕</code>, il filtro viene rimosso immediatamente senza rischiare di aprire la tendina per errore.</li>
            <li><b>Combinazione Multipla:</b> Puoi attivare contemporaneamente più pillole (es. <code>Priorità: Alta</code> + <code>Cliente: Acme</code> + <code>Approvato: Sì</code>) per ottenere ricerche incrociate capillari in un istante.</li>
        </ul>
    </div>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 30px 0;">

    <h4>Ricerca Rapida e Filtri Database (Sulle singole Tabelle)</h4>
    <p>Nell'intestazione di ogni Database trovi l'icona della <b>Lente (🔍)</b> per attivare la barra di <b>Ricerca Rapida Universale</b> (cerca istantaneamente su tutti i campi della riga; puoi separare più parole con <code>;</code> per combinarle in logica AND). I tasti "Filtra" e "Viste Salvate" permettono invece di filtrare per singola colonna usando operatori logici e matematici. Cliccando sull'icona a imbuto aprirai l'impostazione dei filtri attuali, mentre l'icona a segnalibro ti permetterà di salvare quelle configurazioni e richiamarle in seguito (Viste Personalizzate).</p>
    
    <div style="background: rgba(0,0,0,0.03); padding: 15px; border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 20px;">
        <ul style="list-style-type: none; padding-left: 0; margin: 0;">
            <li style="margin-bottom: 10px;"><b>&gt; (Maggiore) e &lt; (Minore):</b>
                <br><code style="background:#1e1e1e; color:#d4d4d4; padding:2px 6px; border-radius:3px;">&gt; 50</code> (Trova tutti i numeri sopra il 50)
                <br><code style="background:#1e1e1e; color:#d4d4d4; padding:2px 6px; border-radius:3px;">&lt; 01/05/2024</code> (Trova date precedenti al primo Maggio)
            </li>
            <li style="margin-bottom: 10px;"><b>&gt;= (Maggiore o uguale) e &lt;= (Minore o uguale):</b>
                <br><code style="background:#1e1e1e; color:#d4d4d4; padding:2px 6px; border-radius:3px;">&gt;= 100</code> (Mostra dal 100 in su)
            </li>
            <li style="margin-bottom: 10px;"><b>=:</b>
                <br><code style="background:#1e1e1e; color:#d4d4d4; padding:2px 6px; border-radius:3px;">= In Lavorazione</code> (Trova esattamente "In Lavorazione", ignorando ad esempio "In Lavorazione Urgente")
            </li>
            <li style="margin-bottom: 10px;"><b>!= (Diverso da / Escludi):</b>
                <br><code style="background:#1e1e1e; color:#d4d4d4; padding:2px 6px; border-radius:3px;">!= Fatto</code> (Nasconde tutte le righe che contengono la parola "Fatto")
            </li>
            <li><b>Contiene / Non contiene:</b> Cerca una sottostringa all'interno di un testo più lungo.</li>
        </ul>
    </div>

    <h4 style="color:var(--danger-color);">La Super-Condizione: ⚡ Formula JS (Personalizzata)</h4>
    <p>Quando devi configurare l'Azione di un Pulsante o il Trigger di un'Automazione, potresti trovarti di fronte al limite degli operatori "AND". Cosa succede se vuoi operare su un record <i>"Se lo stato è Aperto OPPURE l'importo è maggiore di 1000"</i>? Qui entra in gioco la Formula JS.<br><br>Selezionando dal menu a tendina "Colonna" la voce speciale <b>⚡ Formula JS</b>, non opererai su un campo singolo, ma su tutta la riga contemporaneamente, usando il codice Javascript per costruire la tua condizione.</p>

    <div style="background: rgba(0,0,0,0.03); padding: 15px; border-radius: 6px; border: 1px solid var(--border-color); margin-top: 15px;">
        <h4 style="margin-top:0; color:var(--text-primary);">5 Esempi di Condizioni Complesse (Da usare nel WHERE)</h4>
        <p style="font-size:0.8rem; margin-bottom:10px;">Queste espressioni devono sempre restituire <code>true</code> (Esegui azione) o <code>false</code> (Ignora record).</p>
        <ol style="margin: 0; padding-left: 20px; font-size: 0.9rem; line-height: 1.6;">
            <li style="margin-bottom: 10px;">
                <b>La clausola "OR" (Almeno uno è vero)</b><br>
                <code style="background:#1e1e1e; color:#d4d4d4; padding:4px 6px; border-radius:4px; font-family:monospace; display:block; margin-top:4px;">riga["Stato"] === "Aperto" || riga["Urgenza"] === "Alta"</code>
            </li>
            <li style="margin-bottom: 10px;">
                <b>La clausola "IN" (Appartiene a una lista)</b><br>
                <code style="background:#1e1e1e; color:#d4d4d4; padding:4px 6px; border-radius:4px; font-family:monospace; display:block; margin-top:4px;">["AMS", "Helpdesk", "DevOps"].includes(riga["Dipartimento"])</code>
            </li>
            <li style="margin-bottom: 10px;">
                <b>La clausola "NOT IN" (Escludi da una lista)</b><br>
                <code style="background:#1e1e1e; color:#d4d4d4; padding:4px 6px; border-radius:4px; font-family:monospace; display:block; margin-top:4px;">!["Chiuso", "Rifiutato"].includes(riga["Stato"])</code>
            </li>
            <li style="margin-bottom: 10px;">
                <b>Condizioni Miste (AND + OR su Numeri)</b><br>
                <code style="background:#1e1e1e; color:#d4d4d4; padding:4px 6px; border-radius:4px; font-family:monospace; display:block; margin-top:4px;">riga["Stato"] === "Aperto" && (Number(riga["Costo"]) > 1000 || riga["Approvato"] === "Sì")</code>
            </li>
            <li>
                <b>Controllo Avanzato sulle Date (Scaduti da Ieri)</b><br>
                <code style="background:#1e1e1e; color:#d4d4d4; padding:4px 6px; border-radius:4px; font-family:monospace; display:block; margin-top:4px;">(new Date(riga["Scadenza"]).getTime() < Date.now()) && riga["Stato"] !== "Fatto"</code>
            </li>
        </ol>
    </div>

    <h4>Paginazione (Per Database Estremi)</h4>
    <p>Se il tuo Database conta centinaia o migliaia di righe, l'editor lo divide automaticamente in pagine (25 righe di default) per garantire prestazioni istantanee. In basso a destra della tabella troverai l'indicatore <code>Pagina X di Y</code>: cliccandoci puoi selezionare la visualizzazione a <b>10, 25, 50, 100 o 200 righe per pagina</b>. Usa le freccette ◀ ▶ per sfogliare il database mantenendo l'app fluidissima.</p>`
);