/**
 * tests/test-framework.js
 * Motore di testing isolato in-browser per VanillaDesk.
 * Fornisce suite runner, asserzioni tipizzate e visualizzazione automatica focalizzata sugli errori.
 * MODALITÀ DEFAULT "SOLO FALLITI": All'avvio espande e isola unicamente i test falliti.
 * Supporta nativamente beforeEach, afterEach, resetAppState e test asincroni (async/await).
 */

const Assert = {
    strictEqual: (actual, expected, msg) => {
        if (actual !== expected) {
            throw new Error(`${msg || 'Fallita asserzione strictEqual'}\nAtteso: ${JSON.stringify(expected)}\nRicevuto: ${JSON.stringify(actual)}`);
        }
    },
    deepEqual: (actual, expected, msg) => {
        const s1 = JSON.stringify(actual);
        const s2 = JSON.stringify(expected);
        if (s1 !== s2) {
            throw new Error(`${msg || 'Fallita asserzione deepEqual'}\nAtteso: ${s2}\nRicevuto: ${s1}`);
        }
    },
    isTrue: (value, msg) => {
        if (value !== true) {
            throw new Error(`${msg || 'Valore atteso true'}: Ricevuto ${value}`);
        }
    },
    isFalse: (value, msg) => {
        if (value !== false) {
            throw new Error(`${msg || 'Valore atteso false'}: Ricevuto ${value}`);
        }
    },
    isNull: (value, msg) => {
        if (value !== null) {
            throw new Error(`${msg || 'Valore atteso null'}: Ricevuto ${JSON.stringify(value)}`);
        }
    },
    isNotNull: (value, msg) => {
        if (value === null) {
            throw new Error(`${msg || 'Valore atteso non-null'}: Ricevuto null`);
        }
    },
    throws: (fn, msg) => {
        let threw = false;
        try { fn(); } catch (e) { threw = true; }
        if (!threw) throw new Error(msg || "La funzione doveva lanciare un errore ma è stata eseguita senza eccezioni.");
    },
    doesNotThrow: (fn, msg) => {
        try { fn(); } catch (e) {
            throw new Error(`${msg || "La funzione non doveva lanciare eccezioni"}: ${e.message}`);
        }
    }
};

const TestFramework = {
    suites: [],
    _currentSuite: null,
    _activeFilter: 'fail', // Modalità predefinita: Solo Falliti

    describe: (title, fn) => {
        const suite = {
            title,
            tests: [],
            beforeHooks: [],
            afterHooks: []
        };
        TestFramework.suites.push(suite);
        TestFramework._currentSuite = suite;
        fn();
    },

    test: (title, fn) => {
        if (TestFramework._currentSuite) {
            TestFramework._currentSuite.tests.push({ title, fn });
        }
    },

    beforeEach: (fn) => {
        if (TestFramework._currentSuite) {
            TestFramework._currentSuite.beforeHooks.push(fn);
        }
    },

    afterEach: (fn) => {
        if (TestFramework._currentSuite) {
            TestFramework._currentSuite.afterHooks.push(fn);
        }
    },

    resetAppState: () => {
        if (typeof AppState !== 'undefined') {
            AppState.databases = {};
            AppState.notes = [];
            AppState.currentNoteId = null;
            AppState.isEditMode = false;
            AppState.searchFilter = "";
            AppState.activePropertyFilters = [];
            AppState.showBookmarksInTree = false;
            AppState.showFavoritesInTree = false;
            AppState.showDbNotesInTree = false;
        }
        if (typeof Store !== 'undefined' && Store._diskHashes) {
            Store._diskHashes = { notes: {}, databases: {}, index: "" };
        }
        if (typeof Editor !== 'undefined' && typeof Editor.clearHistory === 'function') {
            Editor.clearHistory();
        }
    },

    toggleAllSuites: (expand) => {
        document.querySelectorAll('.suite-box').forEach(el => {
            const list = el.querySelector('.test-list');
            if (list) list.style.display = expand ? 'block' : 'none';
        });
    },

    filterView: (mode) => {
        TestFramework._activeFilter = mode;
        const btnAll = document.getElementById('btnFilterAll');
        const btnFail = document.getElementById('btnFilterFail');

        if (btnAll && btnFail) {
            if (mode === 'fail') {
                btnFail.classList.add('primary');
                btnAll.classList.remove('primary');
            } else {
                btnAll.classList.add('primary');
                btnFail.classList.remove('primary');
            }
        }

        const suiteBoxes = document.querySelectorAll('.suite-box');
        let anyFailVisible = false;

        suiteBoxes.forEach(suiteBox => {
            const hasFailures = suiteBox.querySelectorAll('.test-item.fail-row').length > 0;
            const testList = suiteBox.querySelector('.test-list');

            if (mode === 'fail') {
                if (!hasFailures) {
                    suiteBox.style.display = 'none';
                } else {
                    suiteBox.style.display = 'block';
                    if (testList) testList.style.display = 'block';
                    anyFailVisible = true;
                }

                suiteBox.querySelectorAll('.test-item').forEach(item => {
                    item.style.display = item.classList.contains('fail-row') ? 'flex' : 'none';
                });
            } else {
                suiteBox.style.display = 'block';
                suiteBox.querySelectorAll('.test-item').forEach(item => {
                    item.style.display = 'flex';
                });
            }
        });

        let emptyBanner = document.getElementById('allPassBanner');
        if (mode === 'fail' && !anyFailVisible) {
            if (!emptyBanner) {
                emptyBanner = document.createElement('div');
                emptyBanner.id = 'allPassBanner';
                emptyBanner.className = 'all-pass-banner';
                emptyBanner.innerHTML = `✓ Tutti i test sono stati superati con successo (0 errori rilevati). Clicca su "Tutti" per consultare l'elenco completo.`;
                const container = document.getElementById('suitesContainer');
                if (container) container.insertBefore(emptyBanner, container.firstChild);
            } else {
                emptyBanner.style.display = 'block';
            }
        } else if (emptyBanner) {
            emptyBanner.style.display = 'none';
        }
    },

    run: async () => {
        const container = document.getElementById('suitesContainer');
        if (!container) return;
        container.innerHTML = '';

        let total = 0, passed = 0, failed = 0;
        const startTime = performance.now();

        TestFramework.resetAppState();
        if (typeof AppState !== 'undefined') {
            AppState.currentNoteId = 'test_note_root';
        }

        for (const suite of TestFramework.suites) {
            const suiteBox = document.createElement('div');
            suiteBox.className = 'suite-box';

            const header = document.createElement('div');
            header.className = 'suite-header';
            header.innerHTML = `<span>${suite.title}</span><span style="font-size:0.75rem; opacity:0.8;">Esecuzione...</span>`;

            const testList = document.createElement('ul');
            testList.className = 'test-list';

            header.onclick = () => {
                testList.style.display = testList.style.display === 'none' ? 'block' : 'none';
            };

            let suitePass = 0;

            for (const t of suite.tests) {
                total++;
                let err = null;

                try {
                    // Esecuzione beforeEach hooks
                    for (const bh of (suite.beforeHooks || [])) {
                        await bh();
                    }

                    // Esecuzione del test
                    await t.fn();

                    passed++;
                    suitePass++;
                } catch (e) {
                    failed++;
                    err = e;
                } finally {
                    // Esecuzione afterEach hooks
                    for (const ah of (suite.afterHooks || [])) {
                        try {
                            await ah();
                        } catch (afterErr) {
                            if (!err) {
                                failed++;
                                err = afterErr;
                            }
                        }
                    }
                }

                const li = document.createElement('li');
                li.className = `test-item ${err ? 'fail-row' : ''}`;

                const trace = err ? `<div class="error-trace">${err.message}</div>` : '';
                li.innerHTML = `
                    <div style="flex:1;">
                        <div class="test-info">
                            <span class="badge ${err ? 'fail' : 'pass'}">${err ? 'FAIL' : 'PASS'}</span>
                            <span>${t.title}</span>
                        </div>
                        ${trace}
                    </div>
                `;
                testList.appendChild(li);
            }

            const isAllPassed = suitePass === suite.tests.length;
            const statusBadge = header.querySelector('span:last-child');
            statusBadge.innerText = `${suitePass}/${suite.tests.length} OK`;
            statusBadge.style.color = isAllPassed ? 'var(--pass)' : 'var(--fail)';

            suiteBox.appendChild(header);
            suiteBox.appendChild(testList);
            container.appendChild(suiteBox);
        }

        const duration = Math.round(performance.now() - startTime);
        const statTotal = document.getElementById('statTotal');
        const statPass = document.getElementById('statPass');
        const statFail = document.getElementById('statFail');
        const statTime = document.getElementById('statTime');

        if (statTotal) statTotal.innerText = total;
        if (statPass) statPass.innerText = passed;
        if (statFail) statFail.innerText = failed;
        if (statTime) statTime.innerText = `${duration}ms`;

        const statusMsg = document.getElementById('statusMessage');
        if (statusMsg) {
            statusMsg.innerText = failed === 0 ? "Tutte le suite hanno superato il collaudo." : `Rilevati ${failed} errori di regressione.`;
            statusMsg.style.color = failed === 0 ? "var(--pass)" : "var(--fail)";
        }

        TestFramework.filterView('fail');
    }
};

const describe = TestFramework.describe;
const test = TestFramework.test;
const it = TestFramework.test;
const beforeEach = TestFramework.beforeEach;
const afterEach = TestFramework.afterEach;

window.describe = TestFramework.describe;
window.test = TestFramework.test;
window.it = TestFramework.test;
window.beforeEach = TestFramework.beforeEach;
window.afterEach = TestFramework.afterEach;
window.TestFramework = TestFramework;
window.Assert = Assert;