/**
 * sec-views.js
 * Sezione 5 del Manuale d'Uso: Viste Multiple, Albero Gerarchico WBS e Workflow Studio.
 */

Manual.registerSection(
    'sec-5',
    '5. Viste Database: WBS (Albero), Kanban, Calendario, Timeline e Workflow Studio',
    `<p>Il motore RDBMS di VanillaDesk separa rigorosamente i dati dalla loro rappresentazione. Tramite il pulsante <b>"Vista"</b> nell'intestazione della tabella è possibile proiettare istantaneamente lo stesso database su layout alternativi senza duplicare le informazioni.</p>

    <h3 id="sec-5-wbs" style="color: var(--accent-color); display:flex; align-items:center; gap:8px;">
        ${typeof Icons !== 'undefined' ? Icons.treeNode : '🌳'} Vista ad Albero Gerarchico (Tree Table / WBS)
    </h3>
    <p>Compare automaticamente nel menu <i>"Vista"</i> se nel database è presente una colonna <b>Relazione</b> che punta alla tabella stessa (auto-relazione). Consente di strutturare i record a livelli di annidamento infiniti (Progetto ➔ Macro-fase ➔ Task ➔ Sotto-attività).</p>
    <ul>
        <li><b>Flessibilità di Direzione:</b> Puoi scegliere se la colonna di relazione rappresenta <i>"I Figli / Sub-task"</i> oppure <i>"Il Genitore / Super-task"</i>. Il motore calcola in entrambi i casi l'albero corretto.</li>
        <li><b>Espansione e Collasso Reattivo (▶ / ▼):</b> Ogni nodo genitore presenta un indicatore freccia cliccabile per mostrare o nascondere all'istante l'intero ramo dei discendenti. Lo stato aperto/chiuso viene ricordato in memoria.</li>
        <li><b>Aggiunta Rapida Sotto-Attività (+):</b> Passando il mouse sopra qualsiasi attività compare un pulsante <code>+</code> che crea al volo una riga pre-collegata a quel genitore, ne espande il ramo e porta il cursore sul titolo.</li>
        <li><b>Ordinamento Gerarchico Indipendente:</b> Le regole di ordinamento (es. Alfabetico o per Scadenza) agiscono rigorosamente tra <i>fratelli dello stesso livello</i>, garantendo che le sotto-attività non sfuggano mai al controllo del loro genitore.</li>
        <li><b>Paginazione Intelligente (Livello 0):</b> L'impostazione delle pagine (10, 20 o 50 righe) conta esclusivamente le attività radice principali, preservando l'integrità visiva dei rami annidati.</li>
    </ul>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 30px 0;">

    <h3 id="sec-5-kanban" style="color: var(--text-primary); display:flex; align-items:center; gap:8px;">
        ${typeof Icons !== 'undefined' ? Icons.viewBoard : '📋'} Vista Bacheca (Kanban)
    </h3>
    <p>Richiede almeno una colonna di tipo <b>Select Singola</b> nel database (es. <i>Stato: Da Fare, In Corso, Revisione, Completato</i>). I record vengono distribuiti in colonne verticali affiancate.</p>
    <ul>
        <li><b>Trascina e Rilascia (Drag & Drop):</b> Spostando una scheda da una colonna all'altra, il valore del relativo tag di stato viene aggiornato automaticamente nel database in background.</li>
        <li><b>Navigazione Orizzontale Fluida (Rotella Mouse):</b> Puoi scorrere lateralmente tra le colonne della bacheca tenendo premuto <kbd>Shift</kbd> e muovendo la rotella del mouse, oppure ruotando la rotella direttamente sopra l'intestazione o negli spazi liberi tra le colonne.</li>
        <li><b>Visualizzazione Proprietà:</b> Le card mostrano i campi secondari del record con allineamento e leggibilità ottimizzati. Se un testo è particolarmente lungo, si adatta all'interno della scheda senza deformare le colonne vicine.</li>
        <li><b>Aggiunta Rapida:</b> In fondo a ciascuna colonna è presente il pulsante <code>+ Nuova scheda</code> per creare un record già pre-assegnato a quella specifica fase.</li>
    </ul>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 30px 0;">

    <h3 id="sec-5-calendar" style="color: var(--text-primary); display:flex; align-items:center; gap:8px;">
        ${typeof Icons !== 'undefined' ? Icons.viewCalendar : '📅'} Vista Calendario (Mese, Settimana, Giorno, Anno)
    </h3>
    <p>Richiede una colonna di tipo <b>Data</b> o <b>Data e Ora</b>. Consente di gestire scadenze e pianificazioni con modalità multiple:</p>
    <ul>
        <li><b>Visualizzazioni Temporali:</b>
            <ul>
                <li><i>Mese:</i> Griglia classica mensile con raggruppamento delle attività giornaliere e contatore eventi in eccesso.</li>
                <li><i>Settimana e Giorno:</i> Se il campo data include l'orario (tipo <i>Datetime</i>), l'asse verticale visualizza le 24 ore consentendo il posizionamento orario esatto.</li>
                <li><i>Anno:</i> Panoramica a 12 mesi con visualizzazione della densità di carico (Heatmap) in base al numero di scadenze giornaliere. Cliccando su un mese si salta direttamente al dettaglio.</li>
            </ul>
        </li>
        <li><b>Riprogrammazione Visiva:</b> Trascina le attività tra i giorni o tra le fasce orarie per aggiornare data e ora di inizio. Nelle colonne con <i>Data di Fine</i> abilitata, trascinando la maniglia inferiore dell'evento se ne modifica la durata complessiva.</li>
        <li><b>Filtro per Categoria:</b> Se nel database è presente una colonna Select, sopra il calendario compare una legenda a pillole per filtrare visivamente gli eventi con un click.</li>
    </ul>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 30px 0;">

    <h3 id="sec-5-timeline" style="color: var(--text-primary); display:flex; align-items:center; gap:8px;">
        ${typeof Icons !== 'undefined' ? Icons.viewTimeline : '📊'} Diagramma di Gantt (Timeline) & Dipendenze
    </h3>
    <p>È la vista più avanzata per il Project Management. Richiede una colonna data con l'opzione <b>Data di Fine</b> abilitata per definire la durata dell'attività.</p>
    <ul>
        <li><b>Zoom Continuo & Preimpostato:</b> La timeline supporta scale temporali fluide tramite i tasti <kbd>+</kbd> e <kbd>-</kbd> oppure preset dedicati: <i>1 Giorno (24h), 1 Settimana, 1 Mese, 1 Trimestre</i>.</li>
        <li><b>Scorrimento Orizzontale con Rotella:</b> Tenendo premuto <kbd>Shift</kbd> con la rotella del mouse, oppure ruotando la rotella direttamente sopra la barra delle date in alto, la timeline scorre orizzontalmente in modo continuo senza dover trascinare la scrollbar.</li>
        <li><b>Navigazione Corsie & Frecce Intelligenti:</b> Spostando il mouse sopra le corsie di lavoro, se vi sono attività collocate al di fuori della visuale compaiono delle frecce laterali semi-trasparenti: cliccandole, la vista scorre e centra l'attività con un effetto visivo a impulso.</li>
        <li><b>Raggruppamento per Categoria:</b> Tramite il pulsante <i>"Raggruppa"</i> è possibile suddividere la timeline in sezioni orizzontali (es. per Responsabile o per Progetto).</li>
        <li><b>Dipendenze Relazionali (Drag-to-Connect):</b> Se il database possiede una colonna di tipo <b>Relazione</b> che punta a se stesso (auto-relazione), passando il mouse su un'attività comparirà un connettore rotondo: trascinandolo verso un'altra attività verrà tracciata una freccia di dipendenza. Se le date risultano temporalmente incoerenti, la freccia si colora di rosso evidenziando il conflitto.</li>
    </ul>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 30px 0;">

    <h3 id="sec-5-workflow" style="color: var(--accent-color); display:flex; align-items:center; gap:8px;">
        Workflow Studio: Visualizzatore a Grafo dei Nodi
    </h3>
    <p>Workflow Studio (accessibile dalla cartella <code>workflow/</code>) è un'applicazione satellite modulare progettata per visualizzare ed esplorare le reti di dati complesse sotto forma di <b>Grafo di Nodi 2D Interattivo</b>.</p>

    <ul>
        <li><b>Auto-Disposizione Organica (Tree Ranking):</b> Cliccando su <i>Disposizione & Layout ➔ Auto-Disponi Organico</i>, il motore matematico ordina le schede in livelli gerarchici calcolando le dipendenze da sinistra verso destra ed allineando i nodi su una griglia discreta a passi di 24px.</li>
        <li><b>Raggruppamento in Cluster (Riquadri Delimitati):</b> Puoi racchiudere automaticamente i blocchi correlati dentro riquadri sul canvas selezionando una proprietà (es. per Reparto, Fase o Categoria). I cluster calcolano il proprio perimetro in tempo reale adattandosi allo spostamento delle schede.</li>
        <li id="sec-5-routing"><b>Stile dei Connettori & Evitamento Ostacoli (R12):</b>
            <ul>
                <li><i>Curve Morbide (Bézier):</i> Curve fluide con tangenti calcolate in base all'angolo di uscita della porta.</li>
                <li><i>Linee Ortogonali (Canalizzate):</i> Segmenti squadrati con raccordi curvati (raggio minimo 12px) e canalizzazione condivisa dei flussi convergenti (Trunking).</li>
                <li><i>Ortogonali (Evita Ostacoli):</i> Rileva i blocchi frapposti lungo il percorso e devia automaticamente le linee nei canali liberi perimetrali.</li>
            </ul>
        </li>
        <li><b>Connessioni tra 4 Porte Cardinali:</b> Ciascuna scheda espone 4 punti di connessione (Superiore, Destro, Inferiore, Sinistro). Il sistema garantisce il vincolo di esclusività: un punto utilizzato come ingresso (IN) non può emettere connessioni in uscita (OUT).</li>
        <li><b>Focus del Ramo di Dipendenza:</b> Cliccando su una scheda, l'intero albero di antenati e discendenti viene evidenziato con contorni e frecce ad alto contrasto fotometrico adattivo (bianco su sfondi scuri, nero su sfondi chiari).</li>
        <li><b>Modalità Consultazione Protetta (Lock):</b> Attivando il blocco dall'header, le schede ed i connettori non possono essere spostati accidentalmente durante la navigazione.</li>
        <li><b>Minimappa Radar Interattiva:</b> In basso a sinistra, una minimappa mostra l'intero grafo colorato con il rettangolo della visuale corrente, consentendo salti istantanei nello spazio di lavoro con un click.</li>
    </ul>`
);