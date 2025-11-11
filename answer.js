/**
 * answer.js — aggiornato: auto-risposta integrata con fetchAnswers
 *
 * Premendo "A":
 *   • trova la domanda attiva (.active-block)
 *   • prende il testo da .mcq__body-inner[idx-1]
 *   • trova la risposta corretta in window.answerData
 *   • cerca i .mcq__item-text-inner nel block-view[tabindex="0"]
 *   • clicca automaticamente tutti quelli con testo corrispondente (multi support)
 */

function deepQuerySelectorAll(root, selector) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.querySelectorAll)
      node.querySelectorAll(selector).forEach((el) => out.push(el));
    if (node.children) for (const c of node.children) stack.push(c);
    if (node.shadowRoot) stack.push(node.shadowRoot);
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

/** Simula click mouse (corretto anche per iframe/shadow) */
function highlight(el) {
  try {
    if (!el) return;
    let target = el.parentElement;
    if (target && target.parentElement) target = target.parentElement;
    if (!target) target = el;

    const doc = target.ownerDocument || document;
    const win = doc.defaultView || window;
    try {
      target.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "smooth",
      });
    } catch {}

    const rect = target.getBoundingClientRect();
    const cx = Math.max(0, rect.left + rect.width / 2);
    const cy = Math.max(0, rect.top + rect.height / 2);
    const ev = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: cx,
      clientY: cy,
    };

    try {
      target.dispatchEvent(new win.PointerEvent("pointerdown", ev));
    } catch {}
    try {
      target.dispatchEvent(new win.MouseEvent("mousedown", ev));
    } catch {}
    try {
      target.dispatchEvent(new win.PointerEvent("pointerup", ev));
    } catch {}
    try {
      target.dispatchEvent(new win.MouseEvent("mouseup", ev));
    } catch {}
    try {
      target.dispatchEvent(new win.MouseEvent("click", ev));
    } catch {}

    if (typeof target.click === "function") {
      try {
        target.click();
      } catch {}
    }
  } catch (e) {
    console.error("Errore in highlight():", e);
  }
}

/* === trova active-block anche in iframe / shadow === */
function findActiveBlockEverywhere() {
  const inTop = deepQuerySelector(document, "button.active-block");
  if (inTop) return { el: inTop, doc: document };
  const visited = new Set();
  function walk(win) {
    try {
      if (!win || visited.has(win)) return null;
      visited.add(win);
      const doc = win.document;
      const found = deepQuerySelector(doc, "button.active-block");
      if (found) return { el: found, doc };
      for (let i = 0; i < win.frames.length; i++) {
        try {
          void win.frames[i].document;
          const res = walk(win.frames[i]);
          if (res) return res;
        } catch {}
      }
      return null;
    } catch {
      return null;
    }
  }
  return walk(window);
}

/* === helper vari === */
function closestDeep(startEl, selector) {
  let el = startEl;
  for (let i = 0; i < 200 && el; i++) {
    if (el.matches && el.matches(selector)) return el;
    if (el.parentElement) {
      el = el.parentElement;
      continue;
    }
    const root = el.getRootNode && el.getRootNode();
    if (root && root.host) {
      el = root.host;
      continue;
    }
    break;
  }
  return null;
}
const normChoice = (s) =>
  String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const clean = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\w]/g, "");

/* === helper: click robusto su una opzione a partire dal nodo testo === */
// 1) prova la <label.mcq__item-label.js-item-label for=...>
// 2) se fallisce, clicca l'input .mcq__item-input.js-item-input
// 3) fallback: highlight() sul testo
async function clickOptionElement(fromTextEl) {
  if (!fromTextEl) return false;

  // risali al blocco risposta
  const item =
    fromTextEl.closest(".mcq__item, .js-mcq-item") ||
    fromTextEl.closest('[class*="mcq__item"]') ||
    fromTextEl;

  const doc = item.ownerDocument || document;
  const win = doc.defaultView || window;

  // trova input/label con classi reali
  const input = item.querySelector(
    'input.mcq__item-input.js-item-input[type="checkbox"], ' +
      'input.mcq__item-input.js-item-input[type="radio"]'
  );
  let label = null;
  if (input && input.id) {
    label = item.querySelector(
      `label.mcq__item-label.js-item-label[for="${CSS.escape(input.id)}"]`
    );
  }
  if (!label) {
    label = item.querySelector("label.mcq__item-label.js-item-label");
  }

  const synthClick = (el) => {
    try {
      const rect = el.getBoundingClientRect();
      const ev = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      };
      try {
        el.dispatchEvent(new win.PointerEvent("pointerdown", ev));
      } catch {}
      try {
        el.dispatchEvent(new win.MouseEvent("mousedown", ev));
      } catch {}
      try {
        el.dispatchEvent(new win.PointerEvent("pointerup", ev));
      } catch {}
      try {
        el.dispatchEvent(new win.MouseEvent("mouseup", ev));
      } catch {}
      try {
        el.dispatchEvent(new win.MouseEvent("click", ev));
      } catch {}
      if (typeof el.click === "function")
        try {
          el.click();
        } catch {}
      return true;
    } catch {
      return false;
    }
  };

  // 1) preferisci la label
  if (label) {
    synthClick(label);
    await new Promise((r) => setTimeout(r, 50));
    if (input) {
      try {
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } catch {}
      try {
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {}
    }
    return true;
  }

  // 2) altrimenti clic diretto sull'input
  if (input) {
    synthClick(input);
    try {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } catch {}
    try {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {}
    return true;
  }

  // 3) fallback sul container
  try {
    highlight(fromTextEl);
    return true;
  } catch {}
  return false;
}

/* === funzione principale: risponde alla domanda (supporto multiple) === */
async function answerQuestion(answerData) {
  alert("▶ Avvio auto-risposta");

  const found = findActiveBlockEverywhere();
  if (!found) {
    alert("❌ Nessun .active-block trovato.");
    return;
  }

  const { el: activeBlock, doc } = found;
  const dataIndex = parseInt(activeBlock.getAttribute("data-index"), 10) - 1;
  const bodies = deepQuerySelectorAll(doc, ".mcq__body-inner");
  if (!bodies[dataIndex]) {
    alert("❌ Nessuna domanda trovata all’indice " + dataIndex);
    return;
  }

  const questionTextDom = bodies[dataIndex];
  const questionTextRaw = (questionTextDom.textContent || "").trim();
  console.log("🧠 Domanda:", questionTextRaw);

  if (!answerData || !answerData.length) {
    alert("⚠️ answerData vuoto, premi 'P' per caricarlo prima.");
    return;
  }

  const entry = answerData.find(
    (e) => clean(e?.question) === clean(questionTextRaw)
  );
  if (!entry) {
    alert("❌ Nessuna risposta trovata per questa domanda.");
    return;
  }

  const wantedAnswers = (entry.answers || []).filter(Boolean);
  if (!wantedAnswers.length) {
    alert("⚠️ Nessuna risposta elencata in answerData per questa domanda.");
    return;
  }

  // container attivo
  let container = closestDeep(questionTextDom, 'block-view[tabindex="0"]');
  if (!container) {
    const all = deepQuerySelectorAll(doc, 'block-view[tabindex="0"]');
    container = all[0];
  }
  if (!container) {
    alert("❌ Nessun block-view[tabindex='0'] trovato per questa domanda.");
    return;
  }

  // mappa testo corrente -> nodo testo (.mcq__item-text-inner)
  const choiceTextNodes = deepQuerySelectorAll(
    container,
    ".mcq__item-text-inner"
  );
  const textMap = new Map(
    choiceTextNodes.map((n) => [normChoice(n.textContent), n])
  );

  let selected = 0;
  const notFound = [];

  // clicca TUTTE le risposte previste (una alla volta, con delay)
  for (let i = 0; i < wantedAnswers.length; i++) {
    const ans = wantedAnswers[i];
    const tEl = textMap.get(normChoice(ans));
    if (!tEl) {
      notFound.push(ans);
      continue;
    }

    // piccolo delay per stabilità UI (soprattutto sulle multiple)
    /* eslint no-await-in-loop: "off" */
    await new Promise((r) => setTimeout(r, 300));

    const ok = await clickOptionElement(tEl);
    if (ok) selected++;
    else notFound.push(ans);
  }

  alert(
    `✅ Selezionate ${selected}/${wantedAnswers.length} risposte.` +
      (notFound.length ? `\n⚠️ Non trovate:\n- ${notFound.join("\n- ")}` : "")
  );
}

/* === Hotkeys === */
window.addEventListener("keydown", (e) => {
  if (e.key && e.key.toLowerCase() === "a") {
    answerQuestion(window.answerData || []);
  }
});
window.addEventListener("keydown", (e) => {
  if (e.key && e.key.toLowerCase() === "f") {
    if (typeof findTextEverywherePrompt === "function") {
      findTextEverywherePrompt();
    }
  }
});

/* === Export === */
window.answerQuestion = answerQuestion;
