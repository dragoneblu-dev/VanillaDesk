Manual.registerSection(
    'sec-2',
    '2. Editor Testuale, Cursori Multipli e Media',
    `<p>Il cuore dell'applicazione è un elaboratore testi pulito (WYSIWYG) con funzioni professionali di sanificazione e markup pensate per gli sviluppatori.</p>
    <ul>
        <li><b>Formattazione Rapida:</b> Oltre ai tasti della toolbar, puoi usare la tastiera:
            <ul style="margin-top:5px; margin-bottom:10px;">
                <li><kbd>Ctrl + B</kbd> : Grassetto (Bold)</li>
                <li><kbd>Ctrl + I</kbd> : Corsivo (Italic)</li>
                <li><kbd>Ctrl + U</kbd> : Sottolineato (Underline)</li>
                <li><kbd>Ctrl + K</kbd> : Alterna Maiuscolo / Minuscolo (Toggle Case) sul testo selezionato.</li>
                <li><kbd>Ctrl + Z</kbd> / <kbd>Ctrl + Y</kbd> : Annulla o Ripeti l'ultima digitazione.</li>
            </ul>
        </li>
        <li><b>Tastiera Avanzata (Smart Home e Liste):</b> L'editor supporta lo "Smart Home": premendo <kbd>Home</kbd> (Inizio) all'interno di un blocco di codice, il cursore si sposterà intelligentemente tra il primo carattere non vuoto e l'inizio effettivo della riga. Inoltre, puoi usare <kbd>Tab</kbd> e <kbd>Shift + Tab</kbd> per aumentare o ridurre l'indentazione (i rientri) di qualsiasi elenco puntato, numerato o Checklist.</li>
        <li><b>Testo a Colonne (||):</b> Dal menu "Blocchi" puoi dividere la pagina in più colonne. Cliccando sull'ingranaggio del modulo, puoi scegliere se usare un <i>"Flusso Continuo"</i> (il testo scivola automaticamente da una colonna all'altra in stile giornale) o <i>"Moduli Indipendenti"</i>. In quest'ultimo caso appariranno delle maniglie blu tra le colonne per ridimensionarne la larghezza in percentuale trascinandole con il mouse!</li>
        <li><b>Cursori Multipli (Ctrl+D):</b> Devi rinominare la stessa variabile o parola più volte in un testo? Seleziona la prima parola e premi <kbd>Ctrl + D</kbd>. L'editor selezionerà la successiva occorrenza identica. Quello che digiterai verrà scritto in contemporanea su tutte le selezioni attive!</li>
        <li><b>Segnalibri e Timer (⏱️):</b> Usa la scorciatoia <kbd>Ctrl+Shift+B</kbd> o il menu Inserisci per piazzare un Segnalibro nel testo. Cliccando sull'icona del segnalibro, puoi avviare un <b>Timer di 15 minuti</b> (sommabili). Anche se cambi nota, allo scadere del tempo il motore in background suonerà un allarme sonoro globale per avvisarti, permettendoti di saltare direttamente al punto in cui avevi lasciato il segnalibro!</li>
        <li><b>Snippet Copiabili (📋):</b> Dal menu Inserisci, puoi creare un piccolo blocco di testo grigio con un bottone affiancato. È l'ideale per conservare password, IP, codici cliente o comandi shell: con un solo click l'utente copierà l'esatto contenuto nella clipboard senza doverlo evidenziare a mano.</li>
        
        <li><b>Il Diario / Log Operativo (📔):</b> Dal menu Blocchi puoi inserire un Diario. Questo strumento è perfetto per i meeting o il tracciamento attività:
            <ul style="margin-top:5px; margin-bottom:10px;">
                <li><b>Log Istantaneo:</b> Cliccando il +, viene registrata automaticamente l'ora. Scrivi l'appunto e premi Invio per creare la riga successiva in automatico.</li>
                <li><b>Completamento:</b> Cliccando sull'orario, l'appunto verrà sbarrato, sbiadito, e verrà registrato il Timestamp di fine lavoro (calcolando la durata in background).</li>
                <li><b>Priorità e Filtri:</b> Spostando il mouse a sinistra dell'orario, apparirà un'icona a bandierina per impostare la Priorità (Alta = Rosso, Bassa = Blu). L'ingranaggio del Diario ti permette di attivare una barra di ricerca interna o nascondere automaticamente i log vecchi o completati.</li>
            </ul>
        </li>

        <li><b>Gestione Media (Immagini e Audio):</b> Puoi incollare o caricare immagini (fino a 50MB) o file Audio (.mp3, .wav). I file non rallentano l'editor perché vengono salvati in streaming sul disco fisso. 
            <ul>
                <li><i>Immagini:</i> Cliccaci sopra per attivare le maniglie di <b>ridimensionamento visivo</b>. Dal menu flottante puoi scegliere l'allineamento o <b>Comprimerle</b> forzatamente in formato WebP.</li>
                <li><i>Audio:</i> Genera un player nativo da cui ascoltare tracce o memo vocali. Dal menu opzioni del player potrai scaricare il file originale in qualsiasi momento.</li>
            </ul>
        </li>
        <li><b>Checklist Interattive (☑):</b> Usa l'apposito pulsante per creare una lista di cose da fare. Se premi <kbd>Tab</kbd> o <kbd>Shift+Tab</kbd> puoi indentare le liste creando sotto-livelli infiniti.</li>
        <li><b>Spostamento Magico dei Blocchi (<kbd>Alt + Freccia ⬆ / ⬇</kbd>):</b> Non c'è bisogno di fare Taglia e Incolla per riordinare un testo! Posiziona il cursore su un paragrafo o lista, tieni premuto <b>Alt</b> e usa le frecce su e giù. Il blocco si sposterà fisicamente lungo la pagina.</li>
        <li><b>Appunti Inline (Footnotes - 💬):</b> Hai bisogno di aggiungere una nota al testo senza spezzare la lettura? Clicca sull'icona della "Nuvoletta". Verrà inserito un indicatore. Cliccandolo potrai scriverci dentro. L'app genererà automaticamente una sezione "Note a Piè di Pagina" a fine documento!</li>
        <li><b>La Gomma Magica (🧽):</b> Hai incollato del testo da Microsoft Word o da internet e ti ritrovi con font microscopici o colori sballati? Seleziona il testo corrotto e premi l'icona della Spugna (🧽). Il motore di <i>Deep Sanitization</i> annienterà chirurgicamente tutto l'HTML malevolo lasciando intatte solo le tabelle native e i link.</li>
        <li><b>Blocchi di Codice (&lt;/&gt;):</b> Seleziona dal menu a tendina dell'ingranaggio del box codice la lingua (es. Javascript, PHP, SQL). Non solo il codice verrà evidenziato, ma il tasto "Download" ti permetterà di salvare quello snippet direttamente come file fisico (es. <code>script.js</code>) sul tuo PC!</li>
    </ul>`
);