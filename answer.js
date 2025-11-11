/**
 * answer.js — versione completa con:
 * - ricerca in tutti i frame same-origin
 * - attraversamento di shadow DOM "open"
 * - lettura data-index da <button class="active-block" data-index="...">
 * - testo domanda da .mcq__body-inner[dataIndex-1]
 * - match/auto-selezione delle risposte
 * - alert di debug e hotkey "A"
 *
 * @typedef {{question: string, answers: string[]}} Answer
 */

/* ===================== UTIL ===================== */

/** Scansiona DOM + tutti gli shadow root "open" e fa querySelectorAll */
function deepQuerySelectorAll(root, selector) {
  const result = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;

    if (node.querySelectorAll) {
      node.querySelectorAll(selector).forEach((el) => result.push(el));
    }

    // figli normali
    if (node.children) {
      for (const c of node.children) stack.push(c);
    }

    // shadow root (aperti)
    if (node.shadowRoot) {
      stack.push(node.shadowRoot);
    }

    // se è Document/ShadowRoot, visita i figli diretti
    if (node instanceof Document || node instanceof ShadowRoot) {
      for (const c of node.children || []) stack.push(c);
    }
  }
  return result;
}

/** Ritorna il primo elemento che matcha un selettore cercando in DOM + shadow */
function deepQuerySelector(root, selector) {
  const all = deepQuerySelectorAll(root, selector);
  return all.length ? all[0] : null;
}

/**
 * Cerca in: documento principale + TUTTI gli iframe same-origin (ricorsivo),
 * attraversando gli shadow root "open".
 * Torna il primo button.active-block trovato e il suo document.
 */
function findActiveBlockEverywhere() {
  // 1) prova nel documento principale
  const inTop = deepQuerySelector(document, "button.active-block");
  if (inTop) {
    alert("✅ .active-block trovato nel documento principale");
    return { el: inTop, doc: document, where: "top" };
  }

  // 2) prova negli iframe same-origin (DFS)
  const visited = new Set();
  function walk(win, path) {
    try {
      if (!win || visited.has(win)) return null;
      visited.add(win);

      const doc = win.document; // se cross-origin, eccezione più sotto

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
          // test accesso same-origin
          void win.frames[i].document;
          const res = walk(win.frames[i], path.concat("frame[" + i + "]"));
          if (res) return res;
        } catch {
          // cross-origin: ignora
          continue;
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
        "Se è in un iframe di ALTRO dominio, fai girare lo userscript anche lì (Tampermonkey: Run only in top frame = No, e aggiungi @match per quel dominio)."
    );
  }
  return res;
}

/* ===================== CORE ===================== */

/** Normalizza testi (case-insensitive, rimuove non-word ASCII) */
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w]/g, ""); // semplice e compatibile
}

/** Match rigido su testi normalizzati */
function matchAnswer(textA, textB) {
  return normalize(textA) === normalize(textB);
}

/**
 * Trova le risposte corrette confrontando la domanda e le possibili risposte
 * @param {Array<Answer>} answerData
 * @param {string} questionText
 * @param {HTMLCollection|Element[]} answers
 * @returns {HTMLElement[]}
 */
function findAnswers(answerData, questionText, answers) {
  if (!answerData || !Array.isArray(answerData)) return [];
  const correct = [];

  for (const entry of answerData) {
    if (matchAnswer(questionText.trim(), (entry?.question || "").trim())) {
      for (const li of Array.from(answers)) {
        const liText = (li.textContent || "").trim();
        for (const maybe of entry.answers || []) {
          if (matchAnswer(liText, maybe)) {
            correct.push(li);
          }
        }
      }
    }
  }
  return correct;
}

/**
 * Esegue il flusso:
 * - trova .active-block ovunque,
 * - legge data-index e seleziona .mcq__body-inner[idx-1],
 * - mostra alert col testo della domanda,
 * - individua le risposte corrette e le seleziona.
 *
 * @param {Array<Answer>} answerData
 */
function answerQuestion(answerData) {
  alert("▶ Inizio answerQuestion");

  const found = findActiveBlockEverywhere();
  if (!found) return;

  const { el: activeBlock, doc, where } = found;

  const dataIndexStr = activeBlock.getAttribute("data-index");
  alert("📦 data-index = " + dataIndexStr + " (in: " + where + ")");
  const dataIndex = parseInt(dataIndexStr, 10);
  if (isNaN(dataIndex)) {
    alert("❌ data-index non valido");
    return;
  }
  const idx0 = dataIndex - 1;

  // Tutte le domande nel document dove è stato trovato active-block
  const questionBodies = deepQuerySelectorAll(doc, ".mcq__body-inner");
  alert("🔍 .mcq__body-inner trovati: " + questionBodies.length);
  if (!questionBodies.length) {
    alert("❌ Nessuna .mcq__body-inner trovata nel frame attivo");
    return;
  }

  const questionTextDom = questionBodies[idx0];
  if (!questionTextDom) {
    alert("❌ Nessun .mcq__body-inner all’indice " + idx0);
    return;
  }

  const questionText = (questionTextDom.textContent || "").trim();
  alert("🧠 Domanda corrente:\n\n" + questionText);

  // Risposte: cerca la lista nel medesimo document (alcuni template hanno più UL)
  // Qui prendiamo la prima ul.coreContent visibile nello stesso document
  const answersList = deepQuerySelectorAll(doc, "ul.coreContent");
  if (!answersList.length) {
    alert("❌ Nessun ul.coreContent trovato nel frame attivo");
    return;
  }
  const answersDom = answersList[0];
  const answers = answersDom.children || [];

  alert("📋 Numero risposte trovate: " + answers.length);

  // Reset selezione
  for (const li of Array.from(answers)) {
    const input = li.querySelector("input");
    if (input) input.checked = false;
  }

  // Trova e seleziona le risposte corrette
  const correctAnswers = findAnswers(answerData || [], questionText, answers);
  alert("🔢 Risposte corrette trovate: " + correctAnswers.length);

  for (const li of correctAnswers) {
    const input = li.querySelector("input");
    if (!input) continue;
    input.checked = true;
    try {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {}
  }

  alert(
    "✅ Fine answerQuestion — selezionate " +
      correctAnswers.length +
      " risposte."
  );
}

/* ===================== DEBUG / HOTKEY ===================== */

// Hotkey: premi "A" per lanciare answerQuestion (usa window.answerData se presente)
window.addEventListener("keydown", (e) => {
  if (e.key && e.key.toLowerCase() === "a") {
    alert("🔑 Premuto A → avvio answerQuestion()");
    answerQuestion(window.answerData || []);
  }
});

// Esporta funzioni utili sul window
window.answerQuestion = answerQuestion;
window.findActiveBlockEverywhere = findActiveBlockEverywhere;
