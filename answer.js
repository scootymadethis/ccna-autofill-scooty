/**
 * answer.js — finale: auto-risposta silenziosa, supporto multiple
 *
 * Premendo "A":
 *   • trova la domanda attiva (.active-block)
 *   • prende il testo da .mcq__body-inner[idx-1]
 *   • trova le risposte corrette in window.answerData
 *   • clicca automaticamente le opzioni corrispondenti (anche multiple)
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
    if (node instanceof Document || node instanceof ShadowRoot)
      for (const c of node.children || []) stack.push(c);
  }
  return out;
}
function deepQuerySelector(root, selector) {
  const all = deepQuerySelectorAll(root, selector);
  return all.length ? all[0] : null;
}
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
function clean(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w]/g, "");
}
function normChoice(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* === Simulazione click === */
function highlight(el) {
  try {
    if (!el) return;
    let target = el.parentElement;
    if (target && target.parentElement) target = target.parentElement;
    if (!target) target = el;

    const doc = target.ownerDocument || document;
    const win = doc.defaultView || window;

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

    if (typeof target.click === "function")
      try {
        target.click();
      } catch {}
  } catch {}
}

/* === trova active-block anche in iframe/shadow === */
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

/* === click robusto su label/input === */
async function clickOptionElement(fromTextEl) {
  if (!fromTextEl) return false;

  const item =
    fromTextEl.closest(".mcq__item, .js-mcq-item") ||
    fromTextEl.closest('[class*="mcq__item"]') ||
    fromTextEl;

  const doc = item.ownerDocument || document;
  const win = doc.defaultView || window;

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
  if (!label) label = item.querySelector("label.mcq__item-label.js-item-label");

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
  try {
    highlight(fromTextEl);
    return true;
  } catch {}
  return false;
}

/* === funzione principale: auto-risposta silenziosa === */
async function answerQuestion(answerData) {
  const found = findActiveBlockEverywhere();
  if (!found) return;

  const { el: activeBlock, doc } = found;
  const dataIndex = parseInt(activeBlock.getAttribute("data-index"), 10) - 1;
  const bodies = deepQuerySelectorAll(doc, ".mcq__body-inner");
  if (!bodies[dataIndex]) return;

  const questionTextDom = bodies[dataIndex];
  const questionTextRaw = (questionTextDom.textContent || "").trim();
  if (!answerData || !answerData.length) return;

  const entry = answerData.find(
    (e) => clean(e?.question) === clean(questionTextRaw)
  );
  if (!entry) return;

  const wantedAnswers = (entry.answers || []).filter(Boolean);
  if (!wantedAnswers.length) return;

  let container = closestDeep(questionTextDom, 'block-view[tabindex="0"]');
  if (!container) {
    const all = deepQuerySelectorAll(doc, 'block-view[tabindex="0"]');
    container = all[0];
  }
  if (!container) return;

  const choiceTextNodes = deepQuerySelectorAll(
    container,
    ".mcq__item-text-inner"
  );
  const textMap = new Map(
    choiceTextNodes.map((n) => [normChoice(n.textContent), n])
  );

  for (let i = 0; i < wantedAnswers.length; i++) {
    const ans = wantedAnswers[i];
    const tEl = textMap.get(normChoice(ans));
    if (!tEl) continue;
    await new Promise((r) => setTimeout(r, 1000)); // 1s delay
    await clickOptionElement(tEl);
  }
}

/* === Hotkey === */
window.addEventListener("keydown", (e) => {
  if (e.key && e.key.toLowerCase() === "a") {
    answerQuestion(window.answerData || []);
  }
});

/* === Export === */
window.answerQuestion = answerQuestion;
