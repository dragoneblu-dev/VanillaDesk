/**
 * sec-tables.js
 * Sezione 4 del Manuale d'Uso: Tabelle Semplici vs Database Relazionali (RDBMS).
 * Arricchita con spiegazioni esaustive, ancore per la navigazione rapida e
 * dettagli operativi sulle maniglie di trascinamento righe/colonne.
 */

Manual.registerSection(
    'sec-4',
    '4. Tabelle Semplici vs Database (Guida Completa)',
    `<p id="sec-4-comparison">L'applicazione offre due componenti distinti per la gestione dei dati tabellari, accessibili dal menu <b>"Blocchi"</b>: le <b>Tabelle Semplici (🔲)</b>, progettate per l'impaginazione editoriale, e le <b>Tabelle Database (📊)</b>, che implementano un vero e proprio RDBMS relazionale in-memory.</p>

    <div style="background: rgba(37,99,235,0.05); border-left: 4px solid var(--accent-color); padding: 15px; border-radius: 4px; margin-bottom: 20px;">
        <h4 style="margin-top:0; color:var(--accent-color);">Criterio di Scelta Operativo:</h4>
        <p style="margin-bottom:0; font-size:0.9rem; line-height:1.5;">
            • Scegli le <b>Tabelle Semplici</b> se devi impaginare testo libero, inserire elenchi o immagini all'interno delle celle, unire celle contigue (rowspan/colspan), colorare manualmente sfondi specifici o incollare porzioni di fogli di calcolo Excel.<br>
            • Scegli i <b>Database</b> se devi gestire elenchi strutturati (CRM, task list, inventari, scadenziari), se necessiti di ordinamenti multicriterio, filtri dinamici, formule Javascript calcolate, viste grafiche (Kanban, Calendario, Gantt) o automazioni temporizzate.
        </p>
    </div>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 30px 0;">

    <h3 id="sec-4-simple-tables" style="color: var(--text-primary); display:flex; align-items:center; gap:8px;">
        ${typeof Icons !== 'undefined' ? Icons.tableSimple : '🔲'} Le Tabelle Semplici: Struttura, Drag & Maniglie
    </h3>
    <p>Le tabelle semplici si comportano come le tabelle di un word processor evoluto. Posizionando il cursore all'interno di una qualsiasi cella, compariranno immediatamente le maniglie di controllo sui bordi esterni della tabella:</p>

    <ul>
        <li><b>Maniglia di Spostamento Riga (⋮ a sinistra):</b> Posizionando il cursore su una riga, all'estrema sinistra della tabella compare un pulsante verticale con tre punti. 
            <ul>
                <li><i>Click Singolo:</i> Apre il menu contestuale per inserire righe sopra/sotto, trasformare la riga in Intestazione con tag semantico <code>&lt;th&gt;</code>, colorare l'intero sfondo della riga o eliminarla.</li>
                <li><i>Trascina e Rilascia (Drag & Drop):</i> <b>Afferrando la maniglia con il mouse</b>, una riga di guida blu indicherà il punto di rilascio. Rilasciando la maniglia tra due righe, la riga verrà spostata fisicamente nella nuova posizione senza alterare il contenuto.</li>
            </ul>
        </li>
        <li><b>Maniglia di Spostamento Colonna (⋯ in alto):</b> Posizionando il cursore su una colonna, subito sopra la tabella appare un pulsante orizzontale.
            <ul>
                <li><i>Click Singolo:</i> Apre il menu per inserire colonne a destra/sinistra, impostare l'allineamento del testo (sinistra, centro, destra), convertire la colonna in intestazione o eliminarla.</li>
                <li><i>Trascina e Rilascia (Drag & Drop):</i> <b>Afferrando la maniglia orizzontale</b>, una guida verticale blu segnalerà il varco tra le colonne. Rilasciando il mouse, l'intera colonna verrà scambiata di posizione all'istante.</li>
            </ul>
        </li>
        <li><b>Maniglia Globale Tabella (⠿ in alto a sinistra):</b> Permette di afferrare l'intera tabella e trascinarla lungo il documento oppure direttamente sopra il nome di un'altra nota nella sidebar laterale per teletrasportarla.</li>
        <li><b>Comportamento del Layout (⚙️ Ingranaggio):</b>
            <ul>
                <li><b>🤖 Adattivo (Testo):</b> Le colonne modulano la loro larghezza automaticamente in base al contenuto testuale inserito.</li>
                <li><b>% Percentuale (Schermo):</b> La tabella occupa il 100% della pagina. Le colonne si ridimensionano in percentuale preservando l'adattabilità responsiva.</li>
                <li><b>⬄ Libera (Pixel):</b> Assegna larghezze fisse alle colonne e abilita lo scorrimento orizzontale qualora la tabella ecceda i limiti visivi del monitor.</li>
            </ul>
        </li>
    </ul>

    <h4 id="sec-4-simple-merge">Selezione Multipla, Fusione Celle & Integrazione con Excel</h4>
    <ul>
        <li><b>Selezione a Blocco o Sparsa (<kbd>Ctrl + Click</kbd>):</b> Cliccando e trascinando con il mouse è possibile selezionare un'area rettangolare di celle. Tenendo premuto <kbd>Ctrl</kbd> (o <kbd>Cmd</kbd> su Mac), si possono selezionare anche celle non contigue.</li>
        <li><b>Menu Fluttuante Contestuale (Ghost Mode):</b> Al rilascio del mouse su una selezione compare un popover con le azioni rapide:
            <ul>
                <li><i>Grassetto Collettivo:</i> Applica o rimuove il grassetto a tutte le celle selezionate.</li>
                <li><i>Allineamento:</i> Modifica l'orientamento del testo (sinistra, centro, destra) con un click.</li>
                <li><i>Tavolozza Colori:</i> Assegna tinte di sfondo specifiche per evidenziare totali o anomalie.</li>
                <li><i>Unisci Celle (${typeof Icons !== 'undefined' ? Icons.merge : '⊞'}):</i> Fonde un blocco di celle contigue (generando attributi <code>colspan</code> e <code>rowspan</code> validi W3C).</li>
                <li><i>Dividi Cella (${typeof Icons !== 'undefined' ? Icons.split : '⊟'}):</i> Selezionando una cella precedentemente unita, il comando la scompone ripristinando la griglia originale.</li>
                <li><i>Copia per Excel (📋):</i> Copia i dati in formato TSV negli appunti. Aprendo Excel o Fogli Google e premendo <kbd>Ctrl+V</kbd>, la tabella verrà incollata con righe e colonne perfettamente allineate.</li>
            </ul>
        </li>
        <li><b>Conversione in Database:</b> Se un progetto inizialmente redatto su tabella semplice richiede filtri complessi o formule, dal menu ingranaggio (⚙️) puoi selezionare <i>"Converti in Database"</i>: la tabella statica verrà istantaneamente trasformata in un database relazionale.</li>
    </ul>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 30px 0;">

    <h3 id="sec-4-rdbms" style="color: var(--accent-color); display:flex; align-items:center; gap:8px;">
        ${typeof Icons !== 'undefined' ? Icons.tableDatabase : '📊'} I Database Relazionali (RDBMS)
    </h3>
    <p>Nei Database le informazioni non sono memorizzate come semplice markup visivo, ma come record strutturati isolati in memoria. Questo garantisce che modifiche a formule, ordinamenti o filtri non corrompano mai i dati grezzi.</p>

    <h4>Architettura Relazionale: Relazioni, Backlink e Rollup</h4>
    <ul>
        <li><b>Relazione (🔗):</b> Crea un puntatore fisico verso un altro database dello spazio di lavoro (o verso se stesso). Cliccando su una cella di tipo Relazione, si apre il selettore per associare uno o più record con un click, visualizzati sotto forma di pillole collegate.</li>
        <li><b>Relazione Inversa (Backlink):</b> Quando colleghi il record <i>Fattura 102</i> al cliente <i>Acme Corp</i>, nel database Clienti compare in automatico una colonna Backlink che elenca tutte le fatture collegate a quel cliente. La colonna può essere configurata in tre modalità:
            <ol>
                <li><i>Elenco Record:</i> Mostra i tag cliccabili che aprono il rispettivo record.</li>
                <li><i>Conteggio Numerico:</i> Mostra il totale quantitativo dei record collegati (es. "4").</li>
                <li><i>Estrazione Proprietà (Distinct):</i> Estrae una specifica colonna dai record collegati (es. i singoli importi), rimuovendo i duplicati o calcolandone la somma/conteggio.</li>
            </ol>
        </li>
        <li><b>Rollup (Lookup - 🔍):</b> Permette di proiettare sul record corrente una proprietà presente nel record collegato tramite la Relazione (ad esempio, visualizzare l'indirizzo email o il codice fiscale del cliente collegato senza doverlo duplicare a mano).</li>
    </ul>

    <h4 id="sec-4-types">Tipologie di Dato Supportate</h4>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.85rem; margin-bottom:15px;">
        <div style="background:var(--sidebar-bg); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px;"><b>• Testo (📝):</b> Stringa libera con troncamento visivo configurabile.</div>
        <div style="background:var(--sidebar-bg); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px;"><b>• Numero (123):</b> Valori numerici con arrotondamento e decimali fissi (0-4).</div>
        <div style="background:var(--sidebar-bg); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px;"><b>• Select / Multi-Select (▾ / 🍱):</b> Tag colorati con gestione colori e rinomina globale.</div>
        <div style="background:var(--sidebar-bg); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px;"><b>• Data e Datetime (📅):</b> Date singole o intervalli con <i>Data di Fine</i>.</div>
        <div style="background:var(--sidebar-bg); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px;"><b>• Checkbox (☑):</b> Booleano (Sì / No).</div>
        <div style="background:var(--sidebar-bg); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px;"><b>• Formula (∑):</b> Valutazione Javascript sincrona ad albero topologico.</div>
        <div style="background:var(--sidebar-bg); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px;"><b>• URL (🔗):</b> Collegamenti ipertestuali a siti web o percorsi locali.</div>
        <div style="background:var(--sidebar-bg); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px;"><b>• Collegamento a Nota (note_link):</b> Link bidirezionale ad una pagina.</div>
        <div style="background:var(--sidebar-bg); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px;"><b>• Pulsante Macro (▶):</b> Esegue azioni massive o modifiche preimpostate.</div>
        <div style="background:var(--sidebar-bg); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px;"><b>• Created / Last Edited Time:</b> Timestamp di sistema non alterabili.</div>
    </div>

    <h4 id="sec-4-record-notes">Pagine Dedicate ai Record (Record Note)</h4>
    <p>Quando le informazioni relative a una riga non possono essere riassunte in una singola cella (ad esempio per una commessa, un contatto o un caso studio), la colonna <b>Pagina Record</b> genera una nota autonoma a pieno schermo ancorata a quel record. Cliccando sul pulsante <code>[📄 Apri Pagina]</code>, l'editor visualizza una pagina completa in cui è possibile inserire testi, immagini, allegati o ulteriori database annidati.</p>

    <h4 id="sec-4-conditional-colors">Colorazione Condizionale con Opacità Dinamica</h4>
    <p>Dal menu opzioni del Database (⋮), la voce <b>Colorazione Condizionale</b> consente di creare regole di formattazione automatica in tempo reale. È possibile impostare sia un'opacità fissa percentuale (es. 30%), sia un'<b>Opacità Dinamica via Formula JS</b>: scrivendo ad esempio <code>riga["Avanzamento"]</code>, l'intensità del colore della riga varierà automaticamente da quasi trasparente a saturo man mano che la percentuale di completamento aumenta.</p>`
);