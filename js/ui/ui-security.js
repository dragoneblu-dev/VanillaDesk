/**
 * ui-security.js
 * Modulo dedicato alla UI e all'interazione dell'utente per la crittografia.
 * Gestione crittografia AES-GCM con prompt sicuri e rimozione password.
 * Internazionalizzato con supporto multi-lingua tramite modulo I18n.
 */

Object.assign(UI, {
    PasswordManager: {
        openSettings: () => {
            const hasPassword = !!AppState.documentPassword;
            
            const bodyHTML = `
                <div class="ui-security-banner">
                    ${I18n.t('security.banner_info')}
                </div>

                <div style="${hasPassword ? 'display:none;' : 'display:block;'}">
                    <label class="ui-label-primary">${I18n.t('security.new_password_label')}</label>
                    <input type="password" id="newDocPassword" class="modern-input ui-input-full" style="margin-bottom: 10px;" placeholder="${I18n.t('security.new_password_placeholder')}">
                    
                    <label class="ui-label-primary">${I18n.t('security.confirm_password_label')}</label>
                    <input type="password" id="newDocPasswordConfirm" class="modern-input ui-input-full" style="margin-bottom: 20px;" placeholder="${I18n.t('security.confirm_password_placeholder')}">
                    
                    <button class="btn btn-primary ui-flex-center ui-input-full" onclick="UI.PasswordManager.saveNewPassword()">
                        <span class="ui-flex-center ui-gap-small">${Icons.lock} ${I18n.t('security.encrypt_btn')}</span>
                    </button>
                </div>

                <div style="${hasPassword ? 'display:block;' : 'display:none;'}">
                    <div class="ui-danger-box">
                        <div style="color:var(--danger-color); margin-bottom:10px;"><span style="display:inline-flex; transform:scale(1.5);">${Icons.lock}</span></div>
                        <h3 style="margin-top:0; color:var(--text-primary); font-size:1rem;">${I18n.t('security.protected_title')}</h3>
                        <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:15px;">${I18n.t('security.protected_desc')}</p>
                        
                        <button class="btn ui-flex-center ui-input-full" style="color:var(--danger-color); border-color:var(--danger-color);" onclick="UI.PasswordManager.removePassword()">
                            <span class="ui-flex-center ui-gap-small">${Icons.close} ${I18n.t('security.remove_protection_btn')}</span>
                        </button>
                    </div>
                </div>
            `;

            UI.openDrawer(`<span class="ui-flex-center ui-gap-small">${Icons.lock} ${I18n.t('security.drawer_title')}</span>`, bodyHTML, null);
        },

        saveNewPassword: () => {
            const p1 = document.getElementById('newDocPassword').value;
            const p2 = document.getElementById('newDocPasswordConfirm').value;

            if (!p1) { alert(I18n.t('security.error_empty')); return; }
            if (p1 !== p2) { alert(I18n.t('security.error_mismatch')); return; }

            AppState.documentPassword = p1;
            
            // Forza la riscrittura sul File System ignorando il Diffing precedente
            if (typeof Store !== 'undefined') {
                Store._diskHashes = { notes: {}, databases: {}, index: "" };
                Store.triggerAutoSave(true);
            }
            
            UI.closeDrawer();
            UI.showToast(I18n.t('security.toast_encrypted'), "success");
        },

        removePassword: () => {
            if (confirm(I18n.t('security.confirm_remove'))) {
                AppState.documentPassword = null;
                
                // Forza la riscrittura sul File System ignorando il Diffing precedente
                if (typeof Store !== 'undefined') {
                    Store._diskHashes = { notes: {}, databases: {}, index: "" };
                    Store.triggerAutoSave(true);
                }
                
                UI.closeDrawer();
                UI.showToast(I18n.t('security.toast_removed'), "info");
            }
        },

        promptForOpen: (customMessage = null) => {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.className = 'link-modal-overlay';
                overlay.style.zIndex = '9999';

                const msg = customMessage || I18n.t('security.prompt_unlock_desc');

                overlay.innerHTML = `
                    <div class="link-modal modal-animate" style="width: 400px; padding: 20px;">
                        <div style="text-align:center; color:var(--accent-color); margin-bottom:15px;">
                            <span style="display:inline-flex; transform:scale(2);">${Icons.lock}</span>
                        </div>
                        <h3 style="margin-top:0; text-align:center; color:var(--text-primary);">${I18n.t('security.prompt_unlock_title')}</h3>
                        <p style="font-size:0.85rem; color:var(--text-secondary); text-align:center; margin-bottom:20px;">
                            ${msg}
                        </p>
                        <input type="password" id="decryptPasswordInput" class="modern-input ui-input-full" style="margin-bottom:20px; font-size:1.1rem; text-align:center;" placeholder="${I18n.t('security.prompt_unlock_placeholder')}">
                        <div class="ui-flex-between ui-gap-medium">
                            <button class="btn ui-flex-center ui-input-full" onclick="document.getElementById('btnDecryptCancel').click()">${I18n.t('common.cancel')}</button>
                            <button class="btn btn-primary ui-flex-center ui-input-full" onclick="document.getElementById('btnDecryptConfirm').click()">${I18n.t('security.unlock_btn')}</button>
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