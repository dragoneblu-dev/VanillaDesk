# VanillaDesk - Local-First Knowledge & Workspace Manager

<p align="center">
  <a href="https://youtu.be/O8-uhmgFaos" target="_blank">
    <img src="https://img.shields.io/badge/Video_Demonstrativo-red?style=for-the-badge&logo=youtube&logoColor=white" alt="Video YouTube" />
  </a>
  <a href="https://dragoneblu-dev.github.io/VanillaDesk/" target="_blank">
    <img src="https://img.shields.io/badge/Provalo_Subito-success?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Prova l'App" />
  </a>
  <a href="https://github.com/dragoneblu-dev/VanillaDesk/archive/refs/heads/main.zip">
    <img src="https://img.shields.io/badge/Download_(ZIP)-blue?style=for-the-badge&logo=github&logoColor=white" alt="Scarica Repository" />
  </a>
</p>
<p align="center">
  <a href="https://youtu.be/O8-uhmgFaos" target="_blank" style="text-decoration: none;">
    <span style="
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background-color: #FF0000;
      color: #FFFFFF;
      font-weight: bold;
      font-size: 16px;
      padding: 12px 24px;
      border-radius: 12px;
      margin: 6px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    ">
      ▶ Video Dimostrativo
    </span>
  </a>

  <a href="https://dragoneblu-dev.github.io/VanillaDesk/" target="_blank" style="text-decoration: none;">
    <span style="
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background-color: #28a745;
      color: #FFFFFF;
      font-weight: bold;
      font-size: 16px;
      padding: 12px 24px;
      border-radius: 12px;
      margin: 6px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    ">
      🚀 Provalo Subito
    </span>
  </a>

  <a href="https://github.com/dragoneblu-dev/VanillaDesk/archive/refs/heads/main.zip" style="text-decoration: none;">
    <span style="
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background-color: #0366d6;
      color: #FFFFFF;
      font-weight: bold;
      font-size: 16px;
      padding: 12px 24px;
      border-radius: 12px;
      margin: 6px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    ">
      📥 Scarica l'App (ZIP)
    </span>
  </a>
</p>

![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)
![Local First](https://img.shields.io/badge/Architecture-Local_First-success?style=for-the-badge)
![AI Assisted](https://img.shields.io/badge/AI_Assisted_Development-8A2BE2?style=for-the-badge&logo=openai&logoColor=white)

![VanillaDesk Banner](vanillaDesk.png)

VanillaDesk non è un semplice blocco note. È un ambiente di lavoro ibrido che unisce un **elaboratore di testi WYSIWYG avanzato** a un potente **motore di database relazionale (RDBMS) in-memory**. 

Tutto gira alla velocità della luce, direttamente nel tuo browser. Nessun server, nessun cloud, nessun abbonamento, nessuna dipendenza (Zero NPM, No React/Vue/Angular). Solo puro, solido e performante **Vanilla JavaScript**.

![Diario e Timeline](vanillaDesk2.png)
![Code & Kamban](vanillaDesk3.png)

## Perché ho creato VanillaDesk?
Lavorando come professionista IT nel settore **AMS (Application Management Services)**, mi trovavo costantemente a gestire task ripetitivi, query di log, frammenti di codice e documentazioni frammentate. Avevo bisogno di uno strumento veloce come un blocco note, ma potente come un database relazionale, che potessi far girare sulle macchine aziendali senza dover installare server o dipendere da Cloud esterni bloccati dai firewall aziendali. Così è nato VanillaDesk.

## Caratteristiche Principali

* **100% Privacy & Local-First:** I dati non lasciano mai il tuo computer. L'app salva tutto in una cartella sul tuo disco locale (Workspace) usando la *File System Access API*.
* **Database Relazionali Nativi:** Trasforma le tabelle in Kanban (Bacheche), Calendari o Diagrammi di Gantt (Timeline) con pochi click. Supporta Relazioni tra tabelle, Rollup e Formule.
* **Motore di Automazione & Macro:** Crea Trigger e Azioni. Fai scattare aggiornamenti a catena, invia alert sonori o modifica centinaia di record in batch tramite pulsanti personalizzati.
* **Formule JS in Sandbox:** Un motore di calcolo che ti permette di scrivere puro codice Javascript all'interno delle celle per calcoli complessi e manipolazioni di stringhe/date.
* **Transclusion (Citazioni Vive):** Cita dinamicamente un blocco di testo o una tabella da un'altra nota. Se modifichi l'originale, tutte le citazioni nell'app si aggiornano in tempo reale.
* **Crittografia Militare:** Proteggi i tuoi dati con crittografia AES-GCM a 256 bit nativa (WebCrypto API). Se imposti una password, il JSON salvato su disco diventa totalmente illeggibile.
* **Crash Recovery System:** Ad ogni digitazione, l'app salva un backup silente in IndexedDB. Se il browser crasha o si chiude la finestra accidentalmente, la sessione viene ripristinata istantaneamente.

## Architettura & Tech Stack
L'obiettivo ingegneristico di VanillaDesk è la longevità assoluta e l'assenza di debito tecnico derivato da framework terzi.
* **Core:** HTML5, CSS3, ES6+ Vanilla JavaScript. Custom Virtual DOM e Caret Engine per i Widget.
* **Storage:** File System Access API (Persistenza su disco) + IndexedDB (RAM Cache & Recovery).
* **Librerie esterne:** Unica libreria esterna utilizzata è `Chart.js` (inclusa localmente nel repository) per la generazione di Dashboard Analitiche (Tabelle Pivot).

## Sviluppo AI-Assisted (Pair-Programming)
Per la stesura di questo progetto ho adottato un approccio di sviluppo moderno basato sull'Intelligenza Artificiale. L'architettura software, le regole di business, il design del database in-memory e la UX sono frutto della mia visione e della mia esperienza in ambito AMS. I modelli LLM sono stati utilizzati come "Co-Pilot" per accelerare la stesura del codice boilerplate, ottimizzare gli algoritmi di sorting/filtering e rifinire l'interfaccia utente in CSS Vanilla, operando sempre sotto rigide direttive architetturali preimpostate.

## Come usarla (Zero Installazione)
L'applicazione è una vera Single Page Application (SPA) serverless.
1. Clona o scarica il codice sorgente da questo repository.
2. Fai doppio click su `index.html` per aprirlo nel tuo browser.
3. Clicca su **"Crea Nuovo Workspace"** per inizializzare la cartella di lavoro sul tuo PC.

⚠️ **Compatibilità Browser:** Poiché VanillaDesk sfrutta la moderna *File System Access API* per scrivere fisicamente i file sul tuo hard disk, è necessario utilizzare un browser basato su Chromium (**Google Chrome, Microsoft Edge, Brave, Opera**). Browser come Safari o Firefox non supportano ancora pienamente queste API in modo nativo.

## Lavoriamo Insieme / Consulenza
Ho pubblicato questo progetto open-source per condividere uno strumento utile con altri colleghi del settore IT e per dimostrare le mie competenze architetturali e di sviluppo.

Se la tua azienda ha bisogno di un consulente, di uno sviluppatore o di un esperto per ottimizzare processi aziendali (AMS, Automazioni, Sviluppo Web), sentiti libero di contattarmi.

📧 **Email:** [dragoneblu@gmail.com](mailto:dragoneblu@gmail.com)

## Licenza
Questo progetto è rilasciato sotto licenza **MIT**. Sei libero di usarlo, studiarlo, modificarlo e distribuirlo, anche per scopi commerciali. Vedi il file [LICENSE.txt](LICENSE.txt) per i dettagli.