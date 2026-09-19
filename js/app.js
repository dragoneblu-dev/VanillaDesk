/**
 * App.js
 * ENTRY POINT - Inizializzazione applicazione e montaggio architettura a componenti.
 * REFACTOR: Eliminata l'iniezione imperativa sul DOM del menu principale poiché 
 * la voce "Sicurezza e Password..." è ora nativamente inclusa in UI.toggleMainMenu.
 */

document.addEventListener('DOMContentLoaded', () => {

    // 1. Registrazione Moduli nel Widget Manager Centrale
    if (typeof WidgetManager !== 'undefined') {
        if (typeof AdvancedTable !== 'undefined') WidgetManager.register('database', AdvancedTable);
        if (typeof JournalManager !== 'undefined') WidgetManager.register('journal', JournalManager);
        if (typeof CodeManager !== 'undefined') WidgetManager.register('code', CodeManager);
        if (typeof ButtonManager !== 'undefined') WidgetManager.register('buttonbar', ButtonManager);
        if (typeof ColumnManager !== 'undefined') WidgetManager.register('columns', ColumnManager);
        if (typeof CitationManager !== 'undefined') WidgetManager.register('citation', CitationManager); 
    }

    // 2. Iniezione del Drawer Universale Laterale
    const drawerHTML = `
        <div id="advGlobalDrawer" class="adv-drawer">
            <div class="adv-drawer-header">
                <div class="adv-drawer-title" id="advDrawerTitle">Titolo</div>
                <button class="close-modal-btn" onclick="UI.closeDrawer()">✕</button>
            </div>
            <div id="advDrawerBody" class="adv-drawer-body">
                <!-- Contenuto dinamico -->
            </div>
            <div id="advDrawerFooter" class="adv-drawer-footer">
                <!-- Pulsanti dinamici -->
            </div>
        </div>
    `;

    const layoutElement = document.querySelector('.layout');
    if (layoutElement) {
        layoutElement.style.position = 'relative';
        layoutElement.insertAdjacentHTML('beforeend', drawerHTML);
    }

    // 3. Inizializzazione Sotto-sistemi Visivi
    SidebarManager.init(); 
    UI.loadPreferences();
    if (typeof TableManager !== 'undefined') TableManager.init();
    if (typeof ColorManager !== 'undefined') ColorManager.init();

    // 4. Ripristino Dati da IndexedDB (Crash Recovery)
    Store.recoverFromCrash();

    // SINC. DB PROPRIETA' PAGINA: Inizializza o aggiorna il Shadow Database
    if (typeof AdvancedTable !== 'undefined') {
        AdvancedTable.ensureSystemPropertiesDB();
    }

    // 5. Layout adattivo per Mobile
    if (window.innerWidth <= 850) {
        const sb = document.getElementById('sidebar');
        const btn = document.getElementById('sidebarToggleBtn');
        if (sb) sb.classList.add('collapsed');
        if (btn) btn.classList.remove('active');
    } else {
        const aliveNotes = AppState.notes.filter(n => !n.deletedAt);
        if (aliveNotes.length === 0) {
            const sb = document.getElementById('sidebar');
            const btn = document.getElementById('sidebarToggleBtn');
            if (sb && !sb.classList.contains('collapsed')) {
                sb.classList.add('collapsed');
                if (btn) btn.classList.remove('active');
            }
        } else {
            const btn = document.getElementById('sidebarToggleBtn');
            const sb = document.getElementById('sidebar');
            if (btn && sb && !sb.classList.contains('collapsed')) {
                btn.classList.add('active');
            }
        }
    }

    // 6. Avvio degli Eventi Interattivi Globali
    if (typeof EventsGlobal !== 'undefined') {
        EventsGlobal.init();
    }

    // 7. Attivazione Motore Cron delle Automazioni (Asincrono)
    if (typeof AdvancedAutomations !== 'undefined') {
        AdvancedAutomations.startCronEngine();
    }
});