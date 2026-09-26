/**
 * ui-security.js
 * Modulo dedicato alla UI e all'interazione dell'utente per la crittografia.
 * FIX HASHTRAP: Il salvataggio/rimozione password innesca la pulizia della cache degli Hash 
 * in store.js, forzando la riscrittura massiva dell'intero workspace su disco in modo sicuro.
 */

Object.assign(UI, {
    PasswordManager: {
        openSettings: () => {
            const hasPassword = !!AppState.documentPassword;
            
            const bodyHTML = `
                <div class="ui-security-banner">
                    <b>L'applicazione usa la crittografia di grado militare (AES-GCM 256bit)</b>.<br>
                    Se imposti una password, l'intero Workspace diventerà illeggibile e protetto in modo assoluto su disco.<br><br>
                    <span style="color:var(--danger-color);"><b>ATTENZIONE:</b> Se dimentichi la password, i dati andranno persi per sempre. Non c'è alcun modo per recuperarla!</span>
                </div>

                <div style="${hasPassword ? 'display:none;' : 'display:block;'}">
                    <label class="ui-label-primary">Imposta una nuova password:</label>
                    <input type="password" id="newDocPassword" class="modern-input ui-input-full" style="margin-bottom: 10px;" placeholder="Scrivi la tua password segreta...">
                    
                    <label class="ui-label-primary">Conferma la password:</label>
                    <input type="password" id="newDocPasswordConfirm" class="modern-input ui-input-full" style="margin-bottom: 20px;" placeholder="Ripeti la password per sicurezza...">
                    
                    <button class="btn btn-primary ui-flex-center ui-input-full" onclick="UI.PasswordManager.saveNewPassword()">
                        <span class="ui-flex-center ui-gap-small">${Icons.lock} Cifra il Workspace</span>
                    </button>
                </div>

                <div style="${hasPassword ? 'display:block;' : 'display:none;'}">
                    <div class="ui-danger-box">
                        <div style="color:var(--danger-color); margin-bottom:10px;"><span style="display:inline-flex; transform:scale(1.5);">${Icons.lock}</span></div>
                        <h3 style="margin-top:0; color:var(--text-primary); font-size:1rem;">Il Workspace è protetto</h3>
                        <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:15px;">Per rimuovere la password e tornare ai file JSON in chiaro, clicca qui sotto.</p>
                        
                        <button class="btn ui-flex-center ui-input-full" style="color:var(--danger-color); border-color:var(--danger-color);" onclick="UI.PasswordManager.removePassword()">
                            <span class="ui-flex-center ui-gap-small">${Icons.close} Rimuovi Protezione</span>
                        </button>
                    </div>
                </div>
            `;

            UI.openDrawer(`<span class="ui-flex-center ui-gap-small">${Icons.lock} Sicurezza Workspace</span>`, bodyHTML, null);
        },

        saveNewPassword: () => {
            const p1 = document.getElementById('newDocPassword').value;
            const p2 = document.getElementById('newDocPasswordConfirm').value;

            if (!p1) { alert("La password non può essere vuota."); return; }
            if (p1 !== p2) { alert("Le due password non coincidono."); return; }

            AppState.documentPassword = p1;
            
            // Forza la riscrittura brutale sul File System ignorando il Diffing
            if (typeof Store !== 'undefined') {
                Store._diskHashes = { notes: {}, databases: {}, index: "" };
                Store.triggerAutoSave(true);
            }
            
            UI.closeDrawer();
            UI.showToast("Il workspace è ora crittografato e protetto.", "success");
        },

        removePassword: () => {
            if (confirm("Sei sicuro di voler rimuovere la password? Tutti i file verranno salvati in chiaro sul disco.")) {
                AppState.documentPassword = null;
                
                // Forza la riscrittura brutale sul File System ignorando il Diffing
                if (typeof Store !== 'undefined') {
                    Store._diskHashes = { notes: {}, databases: {}, index: "" };
                    Store.triggerAutoSave(true);
                }
                
                UI.closeDrawer();
                UI.showToast("Protezione rimossa. I file sono di nuovo in chiaro.", "info");
            }
        },

        promptForOpen: (customMessage = null) => {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.className = 'link-modal-overlay';
                overlay.style.zIndex = '9999';

                const msg = customMessage || "Questa cartella contiene file crittografati.<br>Inserisci la password per sbloccarli e leggerli.";

                overlay.innerHTML = `
                    <div class="link-modal modal-animate" style="width: 400px; padding: 20px;">
                        <div style="text-align:center; color:var(--accent-color); margin-bottom:15px;">
                            <span style="display:inline-flex; transform:scale(2);">${Icons.lock}</span>
                        </div>
                        <h3 style="margin-top:0; text-align:center; color:var(--text-primary);">Workspace Protetto</h3>
                        <p style="font-size:0.85rem; color:var(--text-secondary); text-align:center; margin-bottom:20px;">
                            ${msg}
                        </p>
                        <input type="password" id="decryptPasswordInput" class="modern-input ui-input-full" style="margin-bottom:20px; font-size:1.1rem; text-align:center;" placeholder="La tua password segreta...">
                        <div class="ui-flex-between ui-gap-medium">
                            <button class="btn ui-flex-center ui-input-full" onclick="document.getElementById('btnDecryptCancel').click()">Annulla</button>
                            <button class="btn btn-primary ui-flex-center ui-input-full" onclick="document.getElementById('btnDecryptConfirm').click()">Sblocca</button>
                        </div>
                        <button id="btnDecryptCancel" style="display:none;"></button>
                        <button id="btnDecryptConfirm" style="display:none;"></button>
                    </div>
                `;

                document.body.appendChild(overlay);

                const input = document.getElementById('decryptPasswordInput');
                input.focus();

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') document.getElementById('btnDecryptConfirm').click();
                });

                document.getElementById('btnDecryptCancel').onclick = () => {
                    overlay.remove();
                    resolve(null);
                };

                document.getElementById('btnDecryptConfirm').onclick = () => {
                    const pwd = input.value;
                    overlay.remove();
                    resolve(pwd);
                };
            });
        }
    }
});