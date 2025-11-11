// === DEBUG SWITCH ===
const DEBUG = true;
function dbg(label, value) {
  if (!DEBUG) return;
  try {
    const shown =
      typeof value === "string"
        ? value
        : value && value.outerHTML // se è un nodo, prova a mostrare l'outerHTML
        ? value.outerHTML.slice(0, 500) +
          (value.outerHTML.length > 500 ? " …" : "")
        : JSON.stringify(
            value,
            (_k, v) => (v instanceof Node ? "[Node]" : v),
            2
          );
    // prompt restituisce una stringa inserita dall'utente, ma qui ci interessa la pausa e la visibilità
    return window.prompt(`[DBG] ${label}`, shown || "");
  } catch (e) {
    console.log("[DBG]", label, value);
  }
}

/**
 * @typedef {{question:string, answers:string[]}} Answer
 */

function testKeyAlert() {
  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "a") {
      alert("✅ Hai premuto A — lo script è attivo e funzionante!");
    }
  });
}

/**
 * Avvia l’autorisposta + debug passo-passo
 * @param {Array<Answer>} answerData
 */
function answerQuestion(answerData) {
  dbg(
    "ENTER answerQuestion(answerData length)",
    answerData ? answerData.length : "null/undefined"
  );

  // 1) individua blocco attivo
  const activeBlock = document.querySelector(".active-block");
  dbg("activeBlock querySelector .active-block", activeBlock);
  if (!activeBlock) {
    dbg("NO activeBlock -> return", "");
    return;
  }

  // 2) leggi data-index (parte da 1)
  const dataIndexStr = activeBlock.getAttribute("data-index");
  dbg("activeBlock data-index (string)", dataIndexStr);
  const dataIndex = parseInt(dataIndexStr, 10);
  dbg("dataIndex parsed (number)", dataIndex);
  if (isNaN(dataIndex)) {
    dbg("dataIndex is NaN -> return", "");
    return;
  }

  // 3) prendi tutte le domande .mcq__body-inner
  const questionBodies = document.querySelectorAll(".mcq__body-inner");
  dbg("questionBodies NodeList length", questionBodies.length);
  if (!questionBodies.length) {
    dbg("No .mcq__body-inner -> return", "");
    return;
  }

  // 4) seleziona quella giusta (dataIndex-1)
  const zeroBasedIndex = dataIndex - 1;
  dbg("zeroBasedIndex = dataIndex-1", zeroBasedIndex);
  const questionTextDom = questionBodies[zeroBasedIndex];
  dbg("questionTextDom selected", questionTextDom);
  if (!questionTextDom) {
    dbg("questionTextDom undefined -> return", "");
    return;
  }

  // 5) testo domanda
  const questionRawText = questionTextDom.textContent;
  dbg("questionRawText", questionRawText);
  const questionText = (questionRawText || "").trim();
  dbg("questionText (trimmed)", questionText);

  // 6) trova lista risposte
  const answersDom = document.querySelector("ul.coreContent");
  dbg("answersDom (ul.coreContent)", answersDom);
  if (!answersDom) {
    dbg("No ul.coreContent -> return", "");
    return;
  }

  const answers = answersDom.children;
  dbg("answers HTMLCollection length", answers.length);

  // 7) deseleziona tutte le risposte
  let resetCount = 0;
  for (let answer of Array.from(answers)) {
    dbg(`loop reset answer <li>`, answer);
    const input = answer.querySelector("input");
    dbg("found input inside <li>", input);
    if (!input) {
      dbg("no input -> continue", "");
      continue;
    }
    input.checked = false;
    dbg("input.checked set to", input.checked);
    resetCount++;
  }
  dbg("total resetCount", resetCount);

  // 8) trova risposte corrette
  dbg("CALL findAnswers", { questionText, answersLen: answers.length });
  const correctAnswers = findAnswers(answerData, questionText, answers);
  dbg("RETURN findAnswers -> correctAnswers length", correctAnswers.length);

  if (correctAnswers.length === 0) {
    dbg("No correctAnswers -> return", "");
    return;
  }

  // 9) seleziona risposte corrette
  let selectCount = 0;
  for (const answer of correctAnswers) {
    dbg("select loop <li> to check", answer);
    const input = answer.querySelector("input");
    dbg("input inside correct <li>", input);
    if (!input) {
      dbg("no input in correct <li> -> continue", "");
      continue;
    }
    input.checked = true;
    dbg("input.checked set to", input.checked);

    // eventi (spesso richiesti da piattaforme)
    try {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      dbg("dispatched Event input", true);
      input.dispatchEvent(new Event("change", { bubbles: true }));
      dbg("dispatched Event change", true);
    } catch (e) {
      dbg("dispatchEvent error", String(e));
    }
    selectCount++;
  }
  dbg("total selectCount", selectCount);

  dbg("EXIT answerQuestion", "done");
}

/**
 * Trova le risposte corrette confrontando i testi
 * @param {Array<Answer>} answerData
 * @param {string} questionText
 * @param {HTMLCollection} answers
 * @returns {HTMLElement[]}
 */
function findAnswers(answerData, questionText, answers) {
  dbg("ENTER findAnswers", {
    hasAnswerData: !!answerData,
    questionText,
    answersLen: answers?.length,
  });

  if (!answerData || !Array.isArray(answerData)) {
    dbg("answerData invalid -> return []", answerData);
    return [];
  }

  const correctAnswers = [];
  dbg("answerData length", answerData.length);

  let entryIdx = 0;
  for (let entry of answerData) {
    dbg(`entry[${entryIdx}] question`, entry?.question);
    const qA = (questionText || "").trim();
    const qB = (entry?.question || "").trim();
    dbg(`compare questionText vs entry.question`, { qA, qB });

    const questionMatch = matchAnswer(qA, qB);
    dbg(`matchAnswer(question, entry.question)`, questionMatch);

    if (questionMatch) {
      dbg(`QUESTION MATCH at entry[${entryIdx}]`, "");
      // scansiona le risposte disponibili a DOM vs quelle attese in entry.answers
      let liIdx = 0;
      for (let availableAnswer of answers) {
        const availText = (availableAnswer.textContent || "").trim();
        dbg(`availableAnswer[${liIdx}] text`, availText);

        let paIdx = 0;
        for (let possibleAnswer of entry.answers || []) {
          dbg(`possibleAnswer[${paIdx}]`, possibleAnswer);
          const ansMatch = matchAnswer(availText, possibleAnswer);
          dbg(`matchAnswer(availText, possibleAnswer)`, ansMatch);

          if (ansMatch) {
            dbg(`ANSWER MATCH -> push <li>`, availableAnswer);
            correctAnswers.push(availableAnswer);
          }
          paIdx++;
        }
        liIdx++;
      }
    }
    entryIdx++;
  }

  dbg("EXIT findAnswers -> correctAnswers length", correctAnswers.length);
  return correctAnswers;
}

/**
 * Confronto “rigido ripulito”: rimuove non-word e confronta
 * (debug integrato per vedere normalizzazione)
 */
function matchAnswer(textA, textB) {
  dbg("ENTER matchAnswer raw A/B", { A: textA, B: textB });
  const replaceRegex = /[^\w]/gi;

  let a = (textA || "").replace(replaceRegex, "");
  let b = (textB || "").replace(replaceRegex, "");
  dbg("after replace non-word", { a, b });

  const equal = a === b;
  dbg("A === B ?", equal);
  dbg("EXIT matchAnswer", equal);
  return equal;
}

window.answerQuestion = answerQuestion;
