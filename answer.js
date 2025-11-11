/**
 * answer.js — completo + ricerca testuale globale (prompt con tasto "F")
 *
 * Funzioni principali:
 * - answerQuestion(answerData)
 *   • trova <button class="active-block" data-index="..."> anche in iframe/shadow
 *   • prende domanda da .mcq__body-inner[idx-1]
 *   • risale fino a .mcq__inner, scende a .mcq__widget-inner
 *   • estrae risposte da .mcq__item-text-inner
 *   • salva window.currentAnswers e (se answerData) seleziona le corrette
 * - findTextEverywherePrompt()
 *   • chiede stringa via prompt
 *   • cerca in tutto il DOM (+ shadow DOM "open" + iframe same-origin)
 *   • match UGUAGLIA o CONTIENE (case-insensitive, spazi normalizzati)
 *   • mostra alert con contenuto intero degli elementi trovati
 *
 * Hotkeys:
 *   A → answerQuestion(window.answerData || [])
 *   F → findTextEverywherePrompt()
 *
 * @typedef {{question: string, answers: string[]}} Answer
 */

/* ===================== UTIL COMUNI ===================== */

/** querySelectorAll in DOM + shadow root "open" (ricorsivo) */
function deepQuerySelectorAll(root, selector) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;

    if (node.querySelectorAll) {
      node.querySelectorAll(selector).forEach((el) => out.push(el));
    }

    // figli normali
    if (node.children) for (const c of node.children) stack.push(c);

    // shadow root (aperti)
    if (node.shadowRoot) stack.push(node.shadowRoot);

    // document/shadowroot -> figli diretti
    if (node instanceof Document || node instanceof ShadowRoot) {
      for (const c of node.children || []) stack.push(c);
    }
  }
  return out;
}
function deepQuerySelector(root, selector) {
  const all = deepQuerySelectorAll(root, selector);
  return all.length ? all[0] : null;
}

/** Normalizzazione semplice per confronti testuali */
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^\w ]/g, "");
}
function matchAnswer(a, b) {
  return normalize(a) === normalize(b);
}

/** Path CSS sintetico per debug */
function cssPath(el) {
  if (!el || el.nodeType !== 1) return "";
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && parts.length < 10) {
    const name = node.tagName.toLowerCase();
    const id = node.id ? `#${node.id}` : "";
    let cls = "";
    if (node.classList && node.classList.length) {
      cls = "." + Array.from(node.classList).slice(0, 3).join(".");
    }
    parts.unshift(name + id + cls);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

/** Evidenzia e scrolla in vista (per ricerca testuale) */
function highlight(el) {
  try {
    const old = el.style.outline;
    el.style.outline = "3px solid red";
    el.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
    setTimeout(() => (el.style.outline = old), 2500);
  } catch {}
}

/* ===================== TROVA active-block (iframe + shadow) ===================== */

/**
 * Cerca <button class="active-block">:
 * - nel documento principale
 * - ricorsivamente in tutti gli iframe same-origin
 * Attraversa shadow DOM "open".
 */
function findActiveBlockEverywhere() {
  // top document prima
  const inTop = deepQuerySelector(document, "button.active-block");
  if (inTop) {
    alert("✅ .active-block trovato nel documento principale");
    return { el: inTop, doc: document, where: "top" };
  }

  // altrimenti scansiona i frame
  const visited = new Set();
  function walk(win, path) {
    try {
      if (!win || visited.has(win)) return null;
      visited.add(win);

      const doc = win.document; // SecurityError se cross-origin

      const foundHere = deepQuerySelector(doc, "button.active-block");
      if (foundHere) {
        alert(
          "✅ .active-block trovato in " +
            (path.length ? path.join(" > ") : "top")
        );
        return { el: foundHere, doc, where: path.join(" > ") || "top" };
      }

      for (let i = 0; i < win.frames.length; i++) {
        try {
          void win.frames[i].document; // verifica same-origin
          const res = walk(win.frames[i], path.concat("frame[" + i + "]"));
          if (res) return res;
        } catch {
          // cross-origin: ignora
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  const res = walk(window, []);
  if (!res) {
    alert(
      "❌ .active-block NON trovato in nessun frame/shadow accessibile.\n" +
        "Se è in un iframe di ALTRO dominio, fai girare lo userscript anche lì (TM: Run only in top frame = No, aggiungi @match)."
    );
  }
  return res;
}

/* ===================== ESTRAZIONE RISPOSTE ===================== */

/**
 * Dato il nodo DOM della domanda (.mcq__body-inner),
 * risale a .mcq__inner e scende a .mcq__widget-inner
 * per raccogliere i container risposta e il testo da .mcq__item-text-inner
 *
 * @param {Element} questionTextDom
 * @returns {{containers: Element[], texts: string[]}}
 */
function getCurrentAnswersFromQuestionNode(questionTextDom) {
  // risali
  const mcqInner = questionTextDom.closest(".mcq__inner");
  if (!mcqInner) {
    alert("❌ Non trovo il parent .mcq__inner a partire dalla domanda.");
    return { containers: [], texts: [] };
  }

  // scendi
  const widgetInner = deepQuerySelector(mcqInner, ".mcq__widget-inner");
  if (!widgetInner) {
    alert("❌ Non trovo .mcq__widget-inner dentro .mcq__inner.");
    return { containers: [], texts: [] };
  }

  // ogni risposta ha un .mcq__item-text-inner (uno per risposta)
  const textNodes = deepQuerySelectorAll(widgetInner, ".mcq__item-text-inner");

  // "container" su cui cliccare: parent più vicino utile
  const containers = textNodes.map(
    (n) => n.closest(".mcq__item, .mcq__option, .mcq__choice") || n
  );

  const texts = textNodes
    .map((n) => (n.textContent || "").trim())
    .filter(Boolean);

  return { containers, texts };
}

/**
 * Trova i container delle risposte corrette confrontando i testi correnti
 * con l'answerData.
 *
 * @param {Array<Answer>} answerData
 * @param {string} questionText
 * @param {{containers: Element[], texts: string[]}} current
 * @returns {Element[]} containers corrispondenti alle risposte corrette
 */
function findCorrectAnswerContainers(answerData, questionText, current) {
  if (!answerData || !Array.isArray(answerData)) return [];
  const out = [];
  const { containers, texts } = current;

  for (const entry of answerData) {
    if (!entry) continue;
    if (matchAnswer(questionText.trim(), (entry.question || "").trim())) {
      // mappa testo->container
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i];
        for (const want of entry.answers || []) {
          if (matchAnswer(t, want)) {
            out.push(containers[i]);
          }
        }
      }
      break; // domanda trovata, basta
    }
  }
  return out;
}

/* ===================== FLUSSO PRINCIPALE ===================== */

/**
 * Trova domanda + risposte correnti; mostra elenco in alert;
 * se presenti dati, abbina e seleziona risposte corrette.
 *
 * @param {Array<Answer>} answerData
 */
function answerQuestion(answerData) {
  alert("▶ Inizio answerQuestion");

  // 1) trova active-block (anche in iframe/shadow)
  const found = findActiveBlockEverywhere();
  if (!found) return;

  const { el: activeBlock, doc, where } = found;

  // 2) indice della domanda
  const dataIndexStr = activeBlock.getAttribute("data-index");
  alert("📦 data-index = " + dataIndexStr + " (in: " + where + ")");
  const dataIndex = parseInt(dataIndexStr, 10);
  if (isNaN(dataIndex)) {
    alert("❌ data-index non valido");
    return;
  }
  const idx0 = dataIndex - 1;

  // 3) prendi la domanda da .mcq__body-inner[idx0]
  const bodies = deepQuerySelectorAll(doc, ".mcq__body-inner");
  alert("🔍 .mcq__body-inner trovati: " + bodies.length);
  if (!bodies.length) {
    alert("❌ Nessuna .mcq__body-inner nel frame attivo");
    return;
  }
  const questionTextDom = bodies[idx0];
  if (!questionTextDom) {
    alert("❌ Nessuna .mcq__body-inner all’indice " + idx0);
    return;
  }
  const questionText = (questionTextDom.textContent || "").trim();
  alert("🧠 Domanda corrente:\n\n" + questionText);

  // 4) estrai le risposte correnti dal nuovo layout
  const current = getCurrentAnswersFromQuestionNode(questionTextDom);
  window.currentAnswers = current.texts.slice(); // salva per debug/uso esterno

  if (!current.texts.length) {
    alert("⚠️ Nessuna risposta trovata in .mcq__widget-inner");
    return;
  }
  alert(
    "📋 Risposte correnti:\n\n" +
      current.texts.map((t, i) => `${i + 1}. ${t}`).join("\n")
  );

  // 5) se abbiamo answerData, prova a selezionare le risposte corrette
  if (answerData && answerData.length) {
    const correctContainers = findCorrectAnswerContainers(
      answerData,
      questionText,
      current
    );
    alert("🔢 Risposte corrette identificate: " + correctContainers.length);

    // prova a selezionare: prima input, altrimenti click sul container
    for (const c of correctContainers) {
      const input = c.querySelector("input");
      if (input) {
        try {
          input.checked = true;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        } catch {}
      } else {
        // fallback: click sul container
        try {
          c.click();
        } catch {}
      }
    }

    alert("✅ Fine — selezionate " + correctContainers.length + " risposte.");
  } else {
    alert(
      "ℹ️ Nessun answerData passato: mi fermo al dump delle risposte correnti."
    );
  }
}

/* ===================== RICERCA TESTUALE GLOBALE (COMPLEMENTO) ===================== */

/** normalizza per equals/contains (case-insensitive, spazi compressi) */
function normLite(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function eqi(a, b) {
  return normLite(a) === normLite(b);
}
function inci(hay, needle) {
  return normLite(hay).includes(normLite(needle));
}

/** TreeWalker su ELEMENTI + shadow root "open" */
function walkRootForElements(root, onElement) {
  if (!root) return;
  try {
    const walker = (root.ownerDocument || root).createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      null
    );
    let n;
    while ((n = walker.nextNode())) {
      onElement(n);
      if (n.shadowRoot) walkRootForElements(n.shadowRoot, onElement);
    }
  } catch {
    // fallback iterativo
    const stack = [root];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur) continue;
      if (cur.nodeType === 1) onElement(cur);
      if (cur.shadowRoot) stack.push(cur.shadowRoot);
      if (cur.children) for (const c of cur.children) stack.push(c);
    }
  }
}

/** Scansiona documento + iframe same-origin */
function scanAllDocuments(processDoc) {
  const visited = new Set();
  function visitWindow(win, path) {
    try {
      if (!win || visited.has(win)) return;
      visited.add(win);
      const doc = win.document; // SecurityError se cross-origin
      processDoc(doc, path);

      for (let i = 0; i < win.frames.length; i++) {
        try {
          void win.frames[i].document; // same-origin check
          visitWindow(win.frames[i], `${path} > iframe[${i}]`);
        } catch {
          // cross-origin: salta
        }
      }
    } catch {
      // non accessibile
    }
  }
  visitWindow(window, "top");
}

/**
 * Prompt + ricerca testuale globale.
 * Trova elementi il cui contenuto è UGUAGLIA o CONTIENE la stringa.
 * Mostra un alert con l'intero contenuto e path sintetico.
 * Salva in window.lastTextSearch = { query, equals, contains }
 */
function findTextEverywherePrompt() {
  // evita trigger multipli
  if (window.__FT_RUNNING) return;
  window.__FT_RUNNING = true;

  // normalizzazione "esatta": comprimi spazi interni + trim (case-sensitive)
  const norm = (s) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .trim();

  const queryInput = window.prompt(
    'Testo ESATTO da cercare in .mcq__item-text-inner (ambito: block-view[tabindex="0"] in iframe/shadow):',
    ""
  );
  const query = norm(queryInput);
  if (!query) {
    alert("Nessun testo inserito. Annullato.");
    window.__FT_RUNNING = false;
    return;
  }

  /** @type {{el: Element, path: string, text: string, containerPath: string}[]} */
  const matches = [];
  let containersFound = 0;

  // Scansiona TUTTI i documenti accessibili (top + iframe same-origin)
  scanAllDocuments((doc, framePath) => {
    try {
      // Trova tutti i block-view[tabindex="0"] in questo documento (profondo: include shadow "open")
      const containers = deepQuerySelectorAll(doc, 'block-view[tabindex="0"]');
      containersFound += containers.length;

      // Per ogni container, cerca TUTTI i .mcq__item-text-inner che uguagliano il testo
      containers.forEach((container, cIdx) => {
        const items = deepQuerySelectorAll(container, ".mcq__item-text-inner");
        for (const el of items) {
          const txt = norm(el.textContent);
          if (txt === query) {
            matches.push({
              el,
              text: txt,
              path: `${framePath} :: ${cssPath(el)}`,
              containerPath: `${framePath} :: ${cssPath(
                container
              )} (container #${cIdx + 1})`,
            });
          }
        }
      });
    } catch {}
  });

  if (!containersFound) {
    alert(
      '❌ Nessun block-view[tabindex="0"] trovato (in documenti/iframe/shadow accessibili).'
    );
    window.__FT_RUNNING = false;
    return;
  }

  if (!matches.length) {
    alert(
      `❌ Nessuna occorrenza ESATTA di "${query}" in .mcq__item-text-inner dentro block-view[tabindex="0"]\n` +
        `Container totali trovati: ${containersFound}`
    );
    window.__FT_RUNNING = false;
    return;
  }

  // Evidenzia i primi match (limitiamo a 10 per non esagerare) e porta in vista
  matches.slice(0, 10).forEach((m) => highlight(m.el));

  // Salva per console/uso successivo
  window.lastExactChoices = { query, containersFound, matches };

  // Report
  let msg =
    `✅ Trovate ${matches.length} occorrenze ESATTE in .mcq__item-text-inner\n` +
    `all’interno di block-view[tabindex="0"] (container totali: ${containersFound}).\n\n` +
    `Testo cercato: "${query}"\n\n` +
    matches
      .map((m, i) => `${i + 1}) ${m.path}\n   ↳ container: ${m.containerPath}`)
      .join("\n");
  alert(msg);

  window.__FT_RUNNING = false;
  return matches;
}

/* ===================== HOTKEY / EXPORT ===================== */

// Premi "A" per avviare l'autofill (usa window.answerData se presente)
window.addEventListener("keydown", (e) => {
  if (e.key && e.key.toLowerCase() === "a") {
    alert("🔑 Premuto A → answerQuestion()");
    answerQuestion(window.answerData || []);
  }
});

// Premi "F" per lanciare il prompt di ricerca testuale
window.addEventListener("keydown", (e) => {
  if (e.key && e.key.toLowerCase() === "f") {
    findTextEverywherePrompt();
  }
});

// Esporta funzioni utili
window.answerQuestion = answerQuestion;
window.getCurrentAnswersFromQuestionNode = getCurrentAnswersFromQuestionNode;
window.findTextEverywherePrompt = findTextEverywherePrompt;
