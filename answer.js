/**
 * answer.js — versione aggiornata con supporto iframe + debug alert
 *
 * @typedef {{question: string, answers: string[]}} Answer
 */

/**
 * Trova .active-block ovunque (in tutti i frame stessi dominio)
 * @returns {{el: HTMLElement, doc: Document}|null}
 */
function findActiveBlockInAllFrames() {
  const visited = new Set();

  function walk(win, path) {
    try {
      if (!win || visited.has(win)) return null;
      visited.add(win);

      const doc = win.document;
      const here = doc.querySelector(".active-block");
      if (here) {
        alert(
          "✅ Trovato .active-block in frame: " +
            (path.length ? path.join(" > ") : "top")
        );
        return { el: here, doc };
      }

      for (let i = 0; i < win.frames.length; i++) {
        try {
          // prova ad accedere per verificare se è same-origin
          void win.frames[i].document;
          const found = walk(win.frames[i], path.concat("frame[" + i + "]"));
          if (found) return found;
        } catch (e) {
          // cross-origin → ignora
          continue;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  return walk(window, []);
}

/**
 * Cerca la domanda corrente (testo da .mcq__body-inner)
 * usando .active-block e data-index
 */
function answerQuestion(answerData) {
  alert("▶ Inizio answerQuestion");

  const found = findActiveBlockInAllFrames();
  if (!found) {
    alert("❌ .active-block non trovato in nessun frame accessibile.");
    return;
  }

  const { el: activeBlock, doc } = found;

  const dataIndexStr = activeBlock.getAttribute("data-index");
  alert("📦 data-index = " + dataIndexStr);
  const dataIndex = parseInt(dataIndexStr, 10);
  if (isNaN(dataIndex)) {
    alert("❌ data-index non valido.");
    return;
  }

  const idx = dataIndex - 1;

  const questionBodies = doc.querySelectorAll(".mcq__body-inner");
  alert(
    "🔍 Trovati " + questionBodies.length + " .mcq__body-inner in questo frame"
  );
  if (!questionBodies.length) {
    alert("❌ Nessuna domanda trovata (.mcq__body-inner)");
    return;
  }

  const questionTextDom = questionBodies[idx];
  if (!questionTextDom) {
    alert("❌ Nessun elemento .mcq__body-inner all’indice " + idx);
    return;
  }

  const questionText = questionTextDom.textContent.trim();
  alert("🧠 Domanda corrente:\n\n" + questionText);

  const answersDom = doc.querySelector("ul.coreContent");
  if (!answersDom) {
    alert("❌ Nessun ul.coreContent trovato.");
    return;
  }

  const answers = answersDom.children;
  alert("📋 Numero risposte trovate: " + answers.length);

  // Deseleziona tutto
  for (let answer of Array.from(answers)) {
    const input = answer.querySelector("input");
    if (!input) continue;
    input.checked = false;
  }

  // Trova risposte corrette
  const correctAnswers = findAnswers(answerData, questionText, answers);
  alert("🔢 Risposte corrette trovate: " + correctAnswers.length);
  if (correctAnswers.length === 0) return;

  // Seleziona le risposte corrette
  for (const answer of correctAnswers) {
    const input = answer.querySelector("input");
    if (!input) continue;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  alert(
    "✅ Fine answerQuestion — selezionate " +
      correctAnswers.length +
      " risposte."
  );
}

/**
 * Trova le risposte corrette
 */
function findAnswers(answerData, questionText, answers) {
  if (!answerData || !Array.isArray(answerData)) return [];

  const correctAnswers = [];
  for (let entry of answerData) {
    if (matchAnswer(questionText.trim(), entry.question.trim())) {
      for (let availableAnswer of answers) {
        for (let possibleAnswer of entry.answers) {
          if (matchAnswer(availableAnswer.textContent.trim(), possibleAnswer)) {
            correctAnswers.push(availableAnswer);
          }
        }
      }
    }
  }

  return correctAnswers;
}

/**
 * Confronta due stringhe "ripulite"
 */
function matchAnswer(textA, textB) {
  const replaceRegex = /[^\w]/gi;
  textA = textA.replace(replaceRegex, "").toLowerCase();
  textB = textB.replace(replaceRegex, "").toLowerCase();
  return textA === textB;
}

/**
 * Aggiunge scorciatoia da tastiera per debug/test
 */
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "a") {
    alert("🔑 Premuto A → Avvio answerQuestion()");
    answerQuestion(window.answerData || []);
  }
});

window.answerQuestion = answerQuestion;