/**
 * manual-core.js
 * Motore per la gestione del Manuale d'Uso in formato frammentato.
 * Registra dinamicamente le sezioni caricate dai file separati.
 * RIPRISTINO E PERFEZIONAMENTO ARCHITETTURALE:
 * - Nessuna funzione globale ridondante (scroll nativo via scrollIntoView).
 * - Copertura capillare di TUTTI gli 11 Capitoli Reali dell'applicazione.
 * - Parser intelligente a 2 livelli: rileva sia intestazioni (h3/h4/h5) che punti elenco (li > b).
 * - Ancoraggio millimetrico a oltre 60 sotto-argomenti con feedback visivo temporaneo al click.
 */

const Manual = {
    isInitialized: false,
    sections: [], 

    registerSection: (id, title, contentHTML) => {
        Manual.sections.push({ id, title, contentHTML });
    },

    init: () => {
        if (Manual.isInitialized) return;

        // Ordina le sezioni in base al numero nell'ID (sec-1, sec-2, ..., sec-11)
        Manual.sections.sort((a, b) => {
            const numA = parseInt(a.id.replace('sec-', ''), 10);
            const numB = parseInt(b.id.replace('sec-', ''), 10);
            return numA - numB;
        });

        // 1. Introduzione
        let welcomeHTML = `
            <div style="background: rgba(37, 99, 235, 0.05); padding: 20px; border-left: 4px solid var(--accent-color); border-radius: 4px; margin-bottom: 25px;">
                <h2 style="margin-top:0; color: var(--accent-color);">Benvenuto nel tuo "Secondo Cervello"</h2>
                Questa applicazione non è un semplice blocco note. È un ambiente ibrido che unisce un <b>elaboratore di testi avanzato</b> a un potente <b>motore di database relazionale e automazioni</b>. Il tutto funziona <em>esclusivamente all'interno del tuo browser</em>: i tuoi dati non vengono mai inviati a server esterni, garantendo una privacy totale, sicurezza assoluta e una velocità di esecuzione istantanea.
            </div>
        `;

        // 2. Mappatura a due livelli di TUTTI gli 11 Capitoli Reali
        // Assegna a runtime un ID fisico a ogni intestazione o punto elenco chiave per garantire il salto esatto
        let parsedSections = [];

        Manual.sections.forEach(sec => {
            const temp = document.createElement('div');
            temp.innerHTML = sec.contentHTML;

            // Livello 1: Cerca prima le intestazioni esplicite h3, h4, h5
            let subElements = Array.from(temp.querySelectorAll('h3, h4, h5'));

            // Livello 2: Se la sezione non usa h3/h4 (es. sec-1, sec-2, sec-11 strutturate ad elenco),
            // estrae i punti elenco principali aventi un titolo in grassetto iniziale (li > b:first-child)
            if (subElements.length === 0) {
                const boldItems = Array.from(temp.querySelectorAll('li > b:first-child'));
                subElements = boldItems.filter(b => {
                    const txt = b.innerText.trim();
                    return txt.length > 2 && txt.length < 80;
                });
            }

            const subTopics = [];

            subElements.forEach((el, hIdx) => {
                let rawText = el.innerText.replace(/[\u200B\n\r]/g, '').trim();
                // Rimuove eventuali due punti finali (es. "L'Albero delle Note (Sidebar):" -> "L'Albero delle Note (Sidebar)")
                rawText = rawText.replace(/:$/, '').trim();
                if (!rawText) return;

                const subId = `${sec.id}-subtopic-${hIdx}`;

                // Se l'elemento è un <b> dentro un <li>, assegna l'ID al <li> per inquadrare l'intero paragrafo,
                // altrimenti assegna l'ID all'intestazione stessa
                const targetNode = (el.tagName === 'B' && el.parentElement && el.parentElement.tagName === 'LI') 
                    ? el.parentElement 
                    : el;
                
                targetNode.id = subId;

                subTopics.push({
                    id: subId,
                    title: rawText
                });
            });

            parsedSections.push({
                id: sec.id,
                title: sec.title,
                subTopics: subTopics,
                contentHTML: temp.innerHTML
            });
        });

        // 3. Costruzione dell'Indice Analitico ad Albero (Tutti gli 11 Capitoli Reali)
        let indexHTML = `
            <div id="manualTopIndex" style="background: var(--sidebar-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 20px; margin-bottom: 35px;">
                <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.1rem; color:var(--text-primary);">📑 Indice dei Contenuti (11 Capitoli)</h3>
                    <span style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase;">Mappa Analitica a 60+ Argomenti</span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 15px;">
        `;

        parsedSections.forEach(sec => {
            indexHTML += `
                <div style="background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; display: flex; flex-direction: column;">
                    <div style="margin-bottom: 8px;">
                        <a href="javascript:void(0)" onclick="document.getElementById('${sec.id}').scrollIntoView({behavior:'smooth', block:'start'})" 
                           style="color:var(--accent-color); text-decoration:none; font-weight:bold; font-size:0.9rem; display:block;">
                            ${sec.title}
                        </a>
                    </div>
            `;

            if (sec.subTopics.length > 0) {
                indexHTML += `<ul style="list-style:none; padding-left:0; margin:0; font-size:0.8rem; line-height:1.7;">`;
                sec.subTopics.forEach(sub => {
                    indexHTML += `
                        <li style="padding-left:10px; text-indent:-10px; margin-bottom:2px;">
                            <span style="color:var(--text-secondary); opacity:0.6;">➔</span> 
                            <a href="javascript:void(0)" onclick="const el=document.getElementById('${sub.id}'); if(el){ el.scrollIntoView({behavior:'smooth', block:'start'}); el.style.transition='background 0.5s'; el.style.background='rgba(37,99,235,0.15)'; setTimeout(()=>el.style.background='', 1200); }" 
                               style="color:var(--text-primary); text-decoration:none;">
                                ${sub.title}
                            </a>
                        </li>
                    `;
                });
                indexHTML += `</ul>`;
            }

            indexHTML += `</div>`;
        });

        indexHTML += `</div></div>`;

        // 4. Costruzione dei Corpi delle Sezioni con ritorno all'indice nativo
        let bodyContentHTML = '';
        parsedSections.forEach(sec => {
            bodyContentHTML += `
                <div style="margin-bottom: 35px;">
                    <h2 id="${sec.id}" style="color: var(--accent-color); border-bottom: 2px solid var(--border-color); padding-bottom:6px; padding-top:20px; margin-top:0;">
                        ${sec.title}
                    </h2>
                    ${sec.contentHTML}
                    <div style="text-align:right; margin-top:12px; border-top:1px dashed var(--border-color); padding-top:6px;">
                        <a href="javascript:void(0)" onclick="document.getElementById('manualScrollArea').scrollTop = 0" 
                           style="font-size:0.8rem; color:var(--text-secondary); text-decoration:none; font-weight:bold;">
                            ⬆ Torna all'indice
                        </a>
                    </div>
                </div>
            `;
        });

        // 5. Generazione Modale Completa
        const modalHTML = `
        <div id="manualModal" class="link-modal-overlay hidden" style="z-index: 5000;">
            <div class="link-modal" style="width: 1050px; max-width: 95vw; height: 90vh; display: flex; flex-direction: column;">
                
                <div class="link-modal-header" style="background: var(--sidebar-bg); border-bottom: 1px solid var(--border-color); flex-shrink: 0;">
                    <div class="link-modal-title">
                        <span style="display:flex; align-items:center; gap:8px; font-size: 1.15rem;">📖 Manuale d'Uso: Guida a VanillaDesk</span>
                        <button class="close-modal-btn" onclick="Manual.close()" title="Chiudi Manuale">✕</button>
                    </div>
                </div>
                
                <div class="link-modal-list" style="padding: 25px 35px; font-size: 0.95rem; line-height: 1.7; color: var(--text-primary); overflow-y: auto; scroll-behavior: smooth;" id="manualScrollArea">
                    ${welcomeHTML}
                    ${indexHTML}
                    ${bodyContentHTML}
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        Manual.isInitialized = true;
    },

    open: () => {
        if (!Manual.isInitialized) Manual.init();
        const m = document.getElementById('manualModal');
        if (m) m.classList.remove('hidden');
    },

    close: () => {
        const m = document.getElementById('manualModal');
        if (m) m.classList.add('hidden');
    }
};