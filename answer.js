/**
 * answer.js — completo
 * - supporto iframe + shadow DOM
 * - domanda da .mcq__body-inner[dataIndex-1]
 * - risalita a .mcq__inner → discesa a .mcq__widget-inner
 * - risposte lette da .mcq__item-text-inner
 * - alert elenco risposte correnti
 * - matching/auto-selezione risposte (se answerData passato)
 *
 * @typedef {{question: string, answers: string[]}} Answer
 */

/* ===================== UTIL ===================== */

/** Scansiona DOM + shadow root "open" e fa querySelectorAll */
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

/**
 * Cerca .active-block:
 * - nel documento principale
 * - ricorsivamente in tutti gli iframe same-origin
 * Attraversa shadow DOM aperti.
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

/** Normalizza testo per confronto semplice */
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w]/g, "");
}
function matchAnswer(a, b) {
  return normalize(a) === normalize(b);
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

  // i "container" delle risposte sono i parent immediati utili per click/checkbox
  // se serve più su/giù, cambia qui:
  const containers = textNodes.map(
    (n) => n.closest(".mcq__item, .mcq__option, .mcq__choice") || n
  );

  const texts = textNodes
    .map((n) => (n.textContent || "").trim())
    .filter(Boolean);

  return { containers, texts };
}

/**
 * Trova le risposte corrette confrontando i testi delle risposte correnti
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
      break; // una volta matchata la domanda, possiamo fermarci
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
        // fallback: click sul container (spesso la UI seleziona così)
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

/* ===================== HOTKEY / EXPORT ===================== */

// Premi "A" per avviare tutto (usa window.answerData se presente)
window.addEventListener("keydown", (e) => {
  if (e.key && e.key.toLowerCase() === "a") {
    alert("🔑 Premuto A → answerQuestion()");
    answerQuestion(window.answerData || []);
  }
});

// Esporta funzioni utili
window.answerQuestion = answerQuestion;
window.getCurrentAnswersFromQuestionNode = getCurrentAnswersFromQuestionNode;
