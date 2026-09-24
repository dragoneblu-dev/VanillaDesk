/**
 * CodeHighlighter.js
 * Modulo per l'evidenziazione del codice e la gestione del componente Widget Code.
 * FIX SYNC: Aggiunta 'forceSyncAll' per garantire il salvataggio immediato in RAM 
 * bypassando il debounce prima che l'Editor minifichi il DOM, salvando i dati.
 * FIX CITAZIONI: Propagazione del blocco della modalità modifica (isEdit = false) per le citazioni.
 * FEAT DOWNLOAD: Aggiunto pulsante nell'header per scaricare il codice in un file fisico con estensione dinamica.
 * FIX REFACTORING: Integrata la lingua "formula" per unificare l'evidenziazione sintattica dei database.
 */

const CodeManager = {
    activePre: null,
    _preCache: new WeakMap(), 
    _typingTimer: null,

    // Forza il salvataggio sincrono di tutti i blocchi codice dal DOM vivo alla RAM
    forceSyncAll: () => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;
        
        editor.querySelectorAll('.code-wrapper, [data-widget-type="code"]').forEach(wrapper => {
            const pre = wrapper.querySelector('pre');
            if (pre) {
                const trueId = wrapper.id.split('_cited_')[0];
                if (!AppState.databases) AppState.databases = {};
                if (!AppState.databases[trueId]) {
                    AppState.databases[trueId] = { title: 'Codice', language: pre.getAttribute('data-language') || 'none', content: '' };
                }
                
                // Estrazione pulita tramite helper
                let rawText = '';
                if (typeof Editor !== 'undefined' && Editor._getRawText) {
                    rawText = Editor._getRawText(pre);
                    if (rawText.endsWith('\n')) rawText = rawText.slice(0, -1);
                } else {
                    rawText = pre.innerText;
                }
                
                AppState.databases[trueId].content = rawText;
            }
        });
    },

    destroy: (id) => {
        const wrapper = document.getElementById(id);
        if (wrapper) wrapper.remove();
        
        const trueId = id.split('_cited_')[0];
        if (AppState.databases && AppState.databases[trueId]) {
            delete AppState.databases[trueId];
        }

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();
        Store.triggerAutoSave();
    },

    mountAll: (container = document) => {
        const root = container.id === 'noteContent' ? container : (container.querySelector ? container.querySelector('#noteContent') || container : document);
        const found = root.querySelectorAll('.code-wrapper, [data-widget-type="code"]');

        found.forEach(wrapper => {
            let currentId = wrapper.id;
            const trueId = currentId.split('_cited_')[0];
            
            const isCited = currentId.includes('_cited_');
            const isEdit = AppState.isEditMode && !isCited;

            let bodyContainer = wrapper.querySelector('.widget-body');
            
            // 1. ESTRAZIONE DI EMERGENZA
            let legacyText = '';
            if (bodyContainer) {
                const pre = bodyContainer.querySelector('pre');
                if (pre) {
                    legacyText = typeof Editor !== 'undefined' && Editor._getRawText ? Editor._getRawText(pre) : pre.innerText;
                    if (legacyText.endsWith('\n')) legacyText = legacyText.slice(0, -1);
                }
            } else {
                const pre = wrapper.querySelector('pre');
                if (pre) {
                    legacyText = typeof Editor !== 'undefined' && Editor._getRawText ? Editor._getRawText(pre) : pre.innerText;
                    if (legacyText.endsWith('\n')) legacyText = legacyText.slice(0, -1);
                }
            }

            // 2. RECUPERO O INIZIALIZZAZIONE DELLO STATO IN RAM
            let state = null;
            if (!AppState.databases) AppState.databases = {};
            if (wrapper.hasAttribute('data-state')) {
                try {
                    state = JSON.parse(wrapper.getAttribute('data-state').replace(/&quot;/g, '"'));
                    AppState.databases[trueId] = state;
                    wrapper.removeAttribute('data-state');
                } catch(e) {}
            } else if (AppState.databases[trueId]) {
                state = AppState.databases[trueId];
            } else {
                state = { title: 'Codice', language: 'none', content: legacyText };
                AppState.databases[trueId] = state;
            }

            if (state.content === undefined) {
                state.content = legacyText;
            }

            // 3. RICOSTRUZIONE DOM DA ZERO
            if (!bodyContainer) {
                wrapper.innerHTML = `
                    <div class="widget-header adv-table-header" style="display:flex;">
                        <span class="widget-drag-handle adv-drag-handle" style="${isEdit ? 'display:flex;' : 'display:none;'}">${Icons.dragHandle}</span>
                        <span class="widget-options-btn adv-drag-handle" title="Opzioni" style="${isEdit ? 'display:flex;' : 'display:none;'}">${Icons.dotsVertical}</span>
                        <span class="widget-icon" style="display:inline-flex;"></span>
                        <span class="widget-title adv-table-title" contenteditable="${isEdit ? 'true' : 'false'}" style="flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 50px;">${state.title || 'Codice'}</span>
                        <div class="widget-tools adv-tools" style="flex-shrink: 0;"></div>
                    </div>
                    <div class="widget-body">
                        <pre class="code-content" data-language="${state.language || 'none'}" contenteditable="${isEdit ? 'true' : 'false'}"></pre>
                    </div>
                `;
                bodyContainer = wrapper.querySelector('.widget-body');
            } else {
                const lang = state.language || 'none';
                bodyContainer.innerHTML = `<pre class="code-content" data-language="${lang}" contenteditable="${isEdit ? 'true' : 'false'}"></pre>`;
            }

            const pre = bodyContainer.querySelector('pre');
            
            // 4. POPOLAMENTO DELLA VISTA CON I DATI IN RAM
            let rawText = state.content;
            if (!rawText || rawText.trim() === '') {
                pre.innerHTML = '<br>';
            } else {
                CodeManager.highlightBlock(pre, true, rawText);
            }

            if (typeof WidgetManager !== 'undefined') {
                CodeManager._updateShell(currentId, state.language || 'none', wrapper.classList.contains('collapsed'), state.title);
            }
        });
    },

    _updateShell: (wrapperId, lang, isCollapsed, customTitle = null) => {
        if (typeof WidgetManager === 'undefined') return;
        
        let finalTitle = customTitle || 'Codice';

        WidgetManager.updateShellUI(wrapperId, {
            icon: Icons.getCodeIcon(lang),
            title: finalTitle,
            optionsId: `adv-opt-btn-${wrapperId}`,
            onOptionsClick: CodeManager.openOptionsMenu,
            onTitleChange: (id, newTitle) => {
                if (!AppState.databases) AppState.databases = {};
                const trueId = id.split('_cited_')[0];
                let state = AppState.databases[trueId] || {};
                state.title = newTitle;
                AppState.databases[trueId] = state;
                Store.triggerAutoSave();
            },
            tools: [
                { icon: Icons.download, title: 'Scarica Codice in un file', onClick: (e) => CodeManager.downloadCode(e, document.getElementById(wrapperId)) },
                { icon: Icons.clipboard, title: 'Copia Codice', onClick: (e) => CodeManager.copyCode(e, document.getElementById(wrapperId)) },
                { icon: isCollapsed ? Icons.chevronDown : Icons.searchUp, title: 'Espandi / Riduci Blocco', onClick: (e) => CodeManager.toggleCollapse(e, document.getElementById(wrapperId)) }
            ]
        });
    },

    init: () => {
        CodeManager._typingTimer = null;
        document.addEventListener('input', (e) => {
            if (e.target && e.target.tagName === 'PRE' && e.target.classList.contains('code-content')) {
                const wrapper = e.target.closest('.code-wrapper, [data-widget-type="code"]');
                
                if (wrapper) {
                    const trueId = wrapper.id.split('_cited_')[0];
                    if (!AppState.databases) AppState.databases = {};
                    if (!AppState.databases[trueId]) {
                        AppState.databases[trueId] = { title: 'Codice', language: 'none', content: '' };
                    }
                    
                    let rawText = '';
                    if (typeof Editor !== 'undefined' && Editor._getRawText) {
                        rawText = Editor._getRawText(e.target);
                        if (rawText.endsWith('\n')) rawText = rawText.slice(0, -1);
                    } else {
                        rawText = e.target.innerText;
                    }
                    
                    AppState.databases[trueId].content = rawText;
                }

                clearTimeout(CodeManager._typingTimer);
                CodeManager._typingTimer = setTimeout(() => {
                    if (AppState.isEditMode) {
                        const sel = window.getSelection();
                        let caretPos = 0;
                        if (sel.rangeCount > 0) {
                            const range = sel.getRangeAt(0);
                            if (typeof Editor._getCodeOffset === 'function') {
                                caretPos = Editor._getCodeOffset(e.target, range.startContainer, range.startOffset);
                            }
                        }
                        
                        CodeManager.highlightBlock(e.target);
                        
                        if (typeof Editor._setCodeOffset === 'function' && caretPos > 0) {
                            Editor._setCodeOffset(e.target, caretPos, caretPos);
                        }
                        Store.triggerAutoSave();
                    }
                }, 600); 
            }
        });
    },

    openOptionsMenu: (e, id) => {
        if (e) e.stopPropagation();
        UI.Menu.closeAll(true);
        
        const wrapper = document.getElementById(id);
        if (!wrapper) return;
        
        CodeManager.activePre = wrapper.querySelector('pre');
        if (!CodeManager.activePre) return;
        
        const currentLang = CodeManager.activePre.getAttribute('data-language') || 'none';
        
        const langs = [
            { id: 'none', label: 'Testo Semplice' }, 
            { id: 'js', label: 'JavaScript' },
            { id: 'json', label: 'JSON' },
            { id: 'php', label: 'PHP' }, 
            { id: 'python', label: 'Python' },
            { id: 'sql', label: 'SQL' },
            { id: 'bash', label: 'Bash / Shell' },
            { id: 'csharp', label: 'C# / Java' },
            { id: 'yaml', label: 'YAML' },
            { id: 'css', label: 'CSS' }, 
            { id: 'html', label: 'HTML / XML' },
            { id: 'xml', label: 'XML' },
            { id: 'ps1', label: 'PowerShell' },
            { id: 'formula', label: 'Formula (VanillaDesk)' }
        ];
        
        const langSubmenu = langs.map(l => ({
            label: l.label + (currentLang === l.id ? ' <span style="color:var(--accent-color);font-weight:bold;float:right;">✓</span>' : ''),
            onClick: () => CodeManager.setLanguage(wrapper.id, l.id)
        }));
        
        UI.Menu.buildContextMenu(`adv-opt-btn-${id}`, [
            { icon: Icons.down, label: 'Inserisci riga sotto', onClick: () => WidgetManager.insertLineBreakAfter(wrapper.id) },
            { type: 'divider' },
            { icon: Icons.code, label: 'Seleziona Sintassi', type: 'submenu', items: langSubmenu },
            { type: 'divider' },
            { icon: Icons.trash, label: 'Elimina Blocco Codice', danger: true, onClick: () => CodeManager.destroy(wrapper.id) }
        ]);
    },

    setLanguage: (wrapperId, langId) => {
        if (!CodeManager.activePre) return;
        CodeManager.activePre.setAttribute('data-language', langId);
        CodeManager.highlightBlock(CodeManager.activePre, true); 
        UI.Menu.closeAll(true);
        
        if (typeof Editor !== 'undefined') Editor.saveSnapshot();
        
        if (!AppState.databases) AppState.databases = {};
        const trueId = wrapperId.split('_cited_')[0];
        let state = AppState.databases[trueId] || {};
        
        state.language = langId;
        AppState.databases[trueId] = state;
        
        Store.triggerAutoSave();
        
        const wrapper = document.getElementById(wrapperId);
        if (wrapper) {
            CodeManager._updateShell(wrapperId, langId, wrapper.classList.contains('collapsed'), state.title);
        }
    },

    toggleCollapse: (e, wrapper) => {
        e.preventDefault();
        e.stopPropagation();
        wrapper.classList.toggle('collapsed');
        
        if (typeof Editor !== 'undefined') Editor.saveSnapshot();
        Store.triggerAutoSave();
        
        const trueId = wrapper.id.split('_cited_')[0];
        let state = (AppState.databases && AppState.databases[trueId]) ? AppState.databases[trueId] : {};
        const lang = state.language || 'none';
        
        CodeManager._updateShell(wrapper.id, lang, wrapper.classList.contains('collapsed'), state.title);

        if (AppState.showMinimap && typeof UI !== 'undefined' && typeof UI.Minimap !== 'undefined') {
            setTimeout(() => UI.Minimap.sync(), 50);
        }
    },

    copyCode: (e, element) => {
        e.preventDefault();
        e.stopPropagation();
        
        const wrapper = element.classList && element.classList.contains('code-wrapper') 
            ? element : element.closest('.code-wrapper, [data-widget-type="code"]');
        if (!wrapper) return;
        
        const trueId = wrapper.id.split('_cited_')[0];
        
        let textToCopy = "";
        if (AppState.databases && AppState.databases[trueId] && AppState.databases[trueId].content !== undefined) {
            textToCopy = AppState.databases[trueId].content;
        } else {
            const pre = wrapper.querySelector('pre');
            if (pre && typeof Editor !== 'undefined' && Editor._getRawText) {
                textToCopy = Editor._getRawText(pre);
                if (textToCopy.endsWith('\n')) textToCopy = textToCopy.slice(0, -1);
            }
        }
        
        if (textToCopy.trim() === '') textToCopy = '';
        textToCopy = textToCopy.replace(/\u00A0/g, ' ');
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            if (typeof UI !== 'undefined' && UI.showToast) UI.showToast("Codice copiato negli appunti!", "success");
            const btn = e.currentTarget;
            if (btn) {
                const orig = btn.innerHTML;
                btn.innerHTML = `${Icons.checkCircle} Copiato!`;
                btn.classList.add('active');
                setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('active'); }, 1500);
            }
        });
    },

    downloadCode: (e, element) => {
        e.preventDefault();
        e.stopPropagation();

        const wrapper = element.classList && element.classList.contains('code-wrapper') 
            ? element : element.closest('.code-wrapper, [data-widget-type="code"]');
        if (!wrapper) return;

        const trueId = wrapper.id.split('_cited_')[0];

        let textToDownload = "";
        if (AppState.databases && AppState.databases[trueId] && AppState.databases[trueId].content !== undefined) {
            textToDownload = AppState.databases[trueId].content;
        } else {
            const pre = wrapper.querySelector('pre');
            if (pre && typeof Editor !== 'undefined' && Editor._getRawText) {
                textToDownload = Editor._getRawText(pre);
                if (textToDownload.endsWith('\n')) textToDownload = textToDownload.slice(0, -1);
            }
        }

        if (textToDownload.trim() === '') {
            if (typeof UI !== 'undefined' && UI.showToast) UI.showToast("Il blocco di codice è vuoto.", "warning");
            return;
        }

        let lang = 'none';
        let title = 'Snippet';
        if (AppState.databases && AppState.databases[trueId]) {
            lang = AppState.databases[trueId].language || 'none';
            title = AppState.databases[trueId].title || 'Snippet';
        }

        const extensionMap = {
            'js': 'js',
            'json': 'json',
            'php': 'php',
            'python': 'py', 
            'sql': 'sql',
            'bash': 'sh', 
            'csharp': 'cs', 
            'java': 'java',
            'yaml': 'yml', 
            'css': 'css',
            'html': 'html',
            'xml': 'xml',
            'ps1': 'ps1',
            'formula': 'js',
            'none': 'txt'
        };
        const ext = extensionMap[lang] || 'txt';

        const cleanTitle = title.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        const filename = `${cleanTitle}.${ext}`;

        // Omesso BOM (\uFEFF) di proposito per prevenire syntax error durante l'esecuzione di script/JSON
        const blob = new Blob([textToDownload], { type: 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 150);

        if (typeof UI !== 'undefined' && UI.showToast) UI.showToast(`File "${filename}" scaricato.`, "success");
    },

    highlightBlock: (preElement, force = false, overrideText = null) => {
        let text = '';
        
        // 1. Estrazione del testo con parità matematica (TreeWalker)
        if (overrideText !== null) {
            text = overrideText;
        } else {
            if (typeof Editor !== 'undefined' && Editor._getRawText) {
                text = Editor._getRawText(preElement);
                // Rimuoviamo SOLO ed ESATTAMENTE l'ultimo \n che rappresenta il BR strutturale fantasma
                if (text.endsWith('\n')) text = text.slice(0, -1);
            } else {
                text = preElement.innerText || preElement.textContent;
            }
        }
        
        const cached = CodeManager._preCache.get(preElement);
        if (!force && cached && cached === text) return;
        CodeManager._preCache.set(preElement, text);

        const lang = preElement.getAttribute('data-language') || 'none';
        
        if (text.trim() === '') { preElement.innerHTML = '<br>'; return; }
        
        // 2. Tokenizzazione e Protezione HTML
        let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        let tokens = [];
        
        if (lang === 'none') {
            html = html.replace(/\n/g, '<br>');
            html += '<br>'; // Inietta il BR strutturale per il cursore a fine linea
            preElement.innerHTML = html;
            return;
        }
        
        const tokenize = (m, s) => { 
            tokens.push(`<span style="${s}">${m}</span>`); 
            return `__TK_${tokens.length-1}__`; 
        };
        
        if (lang === 'js' || lang === 'php' || lang === 'ps1' || lang === 'csharp' || lang === 'java') {
            const hashRegexPart = (lang === 'php' || lang === 'ps1') ? '|#.*' : '';
            const combinedRegex = new RegExp(`("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`|\\/\\/.*|\\/\\*[\\s\\S]*?\\*\\/${hashRegexPart})`, 'g');
            
            html = html.replace(combinedRegex, match => {
                if (match.startsWith('//') || match.startsWith('/*') || match.startsWith('#')) {
                    return tokenize(match, "color:#6a9955;font-style:italic;");
                }
                return tokenize(match, "color:#ce9178;");
            });
            
        } else if (lang === 'python' || lang === 'bash' || lang === 'yaml') {
            const combinedRegex = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#.*)/g;
            html = html.replace(combinedRegex, match => {
                if (match.startsWith('#')) return tokenize(match, "color:#6a9955;font-style:italic;");
                return tokenize(match, "color:#ce9178;");
            });

        } else if (lang === 'formula') {
            const fns = "SE|SOMMA|MEDIA|CERCA|CONTA|UNISCI|OGGI|ADESSO|DATA_DIFF|DATA_AGGIUNGI|ANNO|MESE|GIORNO|ORA|MINUTO|GIORNO_SETTIMANA|NOTA_CORRENTE|PADRE|FIGLI|PROPRIETA";
            const fnsLower = fns.toLowerCase();
            const fnsTitle = "Se|Somma|Media|Cerca|Conta|Unisci|Oggi|Adesso|Data_diff|Data_aggiungi|Anno|Mese|Giorno|Ora|Minuto|Giorno_settimana|Nota_corrente|Padre|Figli|Proprieta";
            
            // Regex completa in stile JavaScript unita alle funzioni personalizzate
            const combinedRegex = new RegExp(`("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`|\\/\\/.*|\\/\\*[\\s\\S]*?\\*\\/|\\b\\d+(?:\\.\\d+)?\\b|\\b(?:const|let|var|function|return|if|else|for|while|new|true|false|null|undefined|Number|String|Math)\\b|\\b(?:riga|tabella|righe|origine)\\b|\\b(?:${fns}|${fnsLower}|${fnsTitle})\\b)`, 'g');

            html = html.replace(combinedRegex, match => {
                if (match.startsWith('//') || match.startsWith('/*')) return tokenize(match, "color:#6a9955;font-style:italic;");
                if (match.startsWith('"') || match.startsWith("'") || match.startsWith('\`')) return tokenize(match, "color:#ce9178;");
                if (/^\d/.test(match)) return tokenize(match, "color:#b5cea8;");
                if (/^(const|let|var|function|return|if|else|for|while|new|true|false|null|undefined|Number|String|Math)$/.test(match)) return tokenize(match, "color:#569cd6;font-weight:bold;");
                if (/^(riga|tabella|righe|origine)$/.test(match)) return tokenize(match, "color:#9cdcfe;font-weight:bold;");
                
                // Le funzioni personalizzate
                if (new RegExp(`^(?:${fns})$`, 'i').test(match)) return tokenize(match, "color:#c586c0;font-weight:bold;");
                return match; 
            });

        } else if (lang === 'sql') {
            const combinedRegex = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|--.*|\/\*[\s\S]*?\*\/)/g;
            
            html = html.replace(combinedRegex, match => {
                if (match.startsWith('--') || match.startsWith('/*')) {
                    return tokenize(match, "color:#6a9955;font-style:italic;");
                }
                return tokenize(match, "color:#ce9178;");
            });
            
        } else if (lang === 'css') {
            const combinedRegex = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/)/g;
            html = html.replace(combinedRegex, match => {
                if (match.startsWith('/*')) {
                    return tokenize(match, "color:#6a9955;font-style:italic;");
                }
                return tokenize(match, "color:#ce9178;");
            });
            
        } else if (lang === 'html' || lang === 'xml') {
            const combinedRegex = /(&lt;!--[\s\S]*?--&gt;|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
            html = html.replace(combinedRegex, match => {
                if (match.startsWith('&lt;!--')) {
                    return tokenize(match, "color:#6a9955;font-style:italic;");
                }
                return tokenize(match, "color:#ce9178;");
            });
            html = html.replace(/(&lt;\/?[a-zA-Z0-9\-:]+)/g, m => tokenize(m, "color:#569cd6;font-weight:bold;"));
            html = html.replace(/([a-zA-Z0-9\-:]+)=/g, m => tokenize(m, "color:#9cdcfe;"));
            html = html.replace(/(&gt;)/g, m => tokenize(m, "color:#569cd6;font-weight:bold;"));
            
        } else if (lang === 'json') {
            html = html.replace(/("(?:\\.|[^"\\])*")(\s*:)?/g, (match, p1, p2) => {
                if (p2) return tokenize(p1, "color:#9cdcfe;") + p2;
                return tokenize(p1, "color:#ce9178;");
            });
            html = html.replace(/\b(true|false|null)\b/g, m => tokenize(m, "color:#569cd6;font-weight:bold;"));
            html = html.replace(/\b(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)\b/g, m => tokenize(m, "color:#b5cea8;"));
        }
        
        if (lang === 'js') {
            html = html.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|new|true|false|null|undefined|await|async|try|catch|finally|throw)\b/g, '<span style="color:#569cd6;font-weight:bold;">$1</span>');
            html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#b5cea8;">$1</span>');
        } else if (lang === 'python') {
            html = html.replace(/\b(def|return|if|elif|else|for|while|class|import|from|True|False|None|and|or|not|is|in|try|except|finally|raise|with|as|pass|yield|lambda)\b/g, '<span style="color:#569cd6;font-weight:bold;">$1</span>');
            html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#b5cea8;">$1</span>');
        } else if (lang === 'bash') {
            html = html.replace(/\b(if|fi|then|else|elif|for|done|while|do|in|case|esac|function|return|export|local|echo|read|shift|break|continue|tar|grep|find|awk|sed|curl|wget|chmod|chown)\b/g, '<span style="color:#569cd6;font-weight:bold;">$1</span>');
            html = html.replace(/(\$[a-zA-Z_][a-zA-Z0-9_]*|\$\{[^}]+\})/g, '<span style="color:#9cdcfe;">$1</span>');
        } else if (lang === 'csharp' || lang === 'java') {
            html = html.replace(/\b(public|private|protected|internal|static|readonly|final|class|interface|struct|enum|void|string|int|float|double|bool|boolean|long|byte|char|object|return|if|else|for|foreach|while|do|try|catch|finally|throw|new|this|super|base|true|false|null|override|virtual|abstract|namespace|package|import|using)\b/g, '<span style="color:#569cd6;font-weight:bold;">$1</span>');
            html = html.replace(/\b(\d+(?:\.\d+)?f?)\b/gi, '<span style="color:#b5cea8;">$1</span>');
        } else if (lang === 'yaml') {
            html = html.replace(/^(\s*[a-zA-Z0-9_-]+):/gm, '<span style="color:#9cdcfe;">$1</span>:');
            html = html.replace(/\b(true|false|null)\b/g, '<span style="color:#569cd6;font-weight:bold;">$1</span>');
        } else if (lang === 'sql') {
            html = html.replace(/\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|REVOKE|TABLE|VIEW|INDEX|SEQUENCE|TRIGGER|PROCEDURE|FUNCTION|PACKAGE|BODY|DATABASE|SCHEMA|JOIN|INNER|LEFT|RIGHT|OUTER|FULL|CROSS|ON|USING|NATURAL|UNION|INTERSECT|EXCEPT|MINUS|AND|OR|NOT|IN|IS|NULL|BETWEEN|EXISTS|LIKE|ILIKE|RLIKE|ANY|ALL|SOME|CASE|WHEN|THEN|ELSE|END|GROUP|BY|HAVING|ORDER|ASC|DESC|LIMIT|OFFSET|FETCH|NEXT|ROWS|ONLY|WITH|AS|OVER|PARTITION|WINDOW|COMMIT|ROLLBACK|SAVEPOINT|BEGIN|DECLARE|EXCEPTION|MERGE|MATCHED|CALL|EXEC|EXECUTE|PRAGMA|IF|WHILE|FOR|LOOP|RETURN|RETURNING|DEFAULT|PRIMARY|FOREIGN|KEY|UNIQUE|CHECK|CONSTRAINT|REFERENCES|DISTINCT)\b/gi, '<span style="color:#c586c0;font-weight:bold;">$1</span>');
            html = html.replace(/\b(VARCHAR|VARCHAR2|NVARCHAR|NVARCHAR2|CHAR|NUMBER|INTEGER|INT|FLOAT|DOUBLE|DECIMAL|NUMERIC|BOOLEAN|BOOL|DATE|TIMESTAMP|BLOB|CLOB|TEXT|JSON|XML|UUID|COUNT|SUM|AVG|MIN|MAX|COALESCE|NVL|IFNULL|NULLIF|CAST|CONVERT|TO_CHAR|TO_DATE|TO_NUMBER|SUBSTR|SUBSTRING|REPLACE|UPPER|LOWER|TRUNC|ROUND|EXTRACT|DATEADD|DATEDIFF|STR_TO_DATE|ISNULL|NOW|SYSDATE|CURRENT_TIMESTAMP|CURRENT_DATE)\b/gi, '<span style="color:#569cd6;font-weight:bold;">$1</span>');
            html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#b5cea8;">$1</span>');
        } else if (lang === 'php') {
            html = html.replace(/(\$[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)/g, '<span style="color:#9cdcfe;">$1</span>');
            html = html.replace(/\b(echo|if|else|foreach|while|class|public|private|protected|function|return|new|true|false|null)\b/gi, '<span style="color:#569cd6;font-weight:bold;">$1</span>');
        } else if (lang === 'css') {
            html = html.replace(/([a-zA-Z\-]+)\s*:/g, '<span style="color:#9cdcfe;">$1</span>:');
            html = html.replace(/(\.[a-zA-Z0-9_-]+)/g, '<span style="color:#d7ba7d;">$1</span>');
            html = html.replace(/(#[a-zA-Z0-9_-]+)/g, '<span style="color:#569cd6;">$1</span>');
            html = html.replace(/(@[a-zA-Z\-]+)/g, '<span style="color:#c586c0;">$1</span>');
        } else if (lang === 'ps1') {
            html = html.replace(/(\$[a-zA-Z_][a-zA-Z0-9_]*|\$\{[^}]+\})/g, '<span style="color:#9cdcfe;">$1</span>');
            html = html.replace(/\b(if|else|elseif|switch|foreach|for|while|do|until|break|continue|return|function|param|class|try|catch|finally|throw|exit)\b/gi, '<span style="color:#569cd6;font-weight:bold;">$1</span>');
            html = html.replace(/\b(Write-Host|Write-Output|Get-ChildItem|Get-Item|Set-Location|Invoke-RestMethod|Invoke-WebRequest|Start-Process)\b/gi, '<span style="color:#dcdcaa;">$1</span>');
            html = html.replace(/\b(-eq|-ne|-gt|-ge|-lt|-le|-like|-notlike|-match|-notmatch|-contains|-notcontains|-in|-notin|-replace|-and|-or|-not|-xor)\b/gi, '<span style="color:#c586c0;">$1</span>');
        }
        
        html = html.replace(/__TK_(\d+)__/g, (match, i) => tokens[i] !== undefined ? tokens[i] : match);

        // 3. Rendering finale (Sostituzione line endings + BR strutturale)
        html = html.replace(/\n/g, '<br>');
            html += '<br>';
        
        preElement.innerHTML = html;
    }
};

document.addEventListener('DOMContentLoaded', CodeManager.init);