Manual.registerSection(
    'sec-3',
    '3. Collegamenti, Transclusion e Video',
    `<p>Collegare le informazioni è vitale per un sistema di Personal Knowledge Management (PKM).</p>
    
    <h4>Tipi di Link Standard (🔗)</h4>
    <ul>
        <li><b>Link Interni (Innesco Rapido):</b> Digita <kbd>[[</kbd> ovunque nell'editor per aprire istantaneamente il pannello di ricerca delle tue note. Puoi collegare una parola a un'altra nota intera, oppure a uno specifico "Titolo/Capitolo" (Ancora) al suo interno.</li>
        <li><b>Link Esterni:</b> I classici collegamenti a siti web (es. Google).</li>
        <li><b>Link a File Locali (📁) e Visualizzatore:</b> Inserisci il percorso di un file del tuo PC (es. <code>C:\\Logs\\error.log</code>). L'app genererà un <b>Visualizzatore Interno</b> che aggira i blocchi del browser permettendoti di leggere e cercare (Trova e Sostituisci) dentro file di log testuali! Se inserisci un <i>percorso relativo</i> (es. <code>Documenti/file.txt</code>), l'app lo auto-caricherà leggendolo direttamente dalla cartella del Workspace.</li>
        <li><b>Video YouTube (▶️):</b> Dal pannello Inserisci Collegamento, puoi incollare l'URL di un video YouTube. L'applicazione genererà un iframe isolato e sicuro permettendoti di riprodurre il video senza mai uscire dalla nota.</li>
    </ul>

    <h4>Pannello Info, Auditing e Backlinks (ℹ️)</h4>
    <p>In cima a ogni nota, l'icona "Info" apre un pannello di Auditing fondamentale. Lì troverai:</p>
    <ul>
        <li>Statistiche (Numero parole, Tempo di lettura, Numero di Widget).</li>
        <li><b>Menzioni in Entrata (Backlinks):</b> Una lista di tutte le altre note del Workspace che citano o contengono un link verso la nota che stai leggendo.</li>
        <li><b>Menzioni in Uscita (Outlinks):</b> L'elenco di tutte le note che tu stai puntando da qui.</li>
        <li><b>Analisi Proprietà Sotto-note:</b> Una tabella riassuntiva che ti mostra a colpo d'occhio tutti i Tag (Proprietà) assegnati alle note figlie di questa pagina.</li>
    </ul>

    <h4>Le Citazioni Live di Blocchi (Transclusion)</h4>
    <p>A differenza di un link (che ti porta altrove), la Citazione <b>porta il contenuto qui da te</b> in tempo reale.</p>
    <ol>
        <li>Premi sulla voce Citazione Live e cerca la nota sorgente dall'elenco.</li>
        <li>Puoi citare <em>tutta la nota</em>, un singolo capitolo (Titolo), una tabella o un blocco di codice.</li>
        <li><b>La Magia:</b> Questo testo è "vivo". Se modifichi il paragrafo nella nota originale, <b>tutte le citazioni sparse per il tuo intero spazio di lavoro si aggiorneranno automaticamente!</b> Perfetto per creare moduli riutilizzabili (es. un blocco "Firme" o "Procedure operative").</li>
    </ol>`
);