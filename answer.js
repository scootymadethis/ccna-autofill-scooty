/**
 *
 * @param {Array<Answer>} answerData
 * @returns
 */
function answerQuestion(answerData) {
  // Trova l'elemento attivo e ricava il suo data-index
  const activeBlock = document.querySelector(".active-block");
  if (!activeBlock) return;

  const dataIndex = parseInt(activeBlock.getAttribute("data-index"), 10);
  if (isNaN(dataIndex)) return;

  // Prendi tutti gli elementi .mcq__body-inner (ognuno è una domanda)
  const questionBodies = document.querySelectorAll(".mcq__body-inner");
  if (!questionBodies.length) return;

  // Data-index parte da 1 → convertiamo in indice base 0
  const questionTextDom = questionBodies[dataIndex - 1];
  if (!questionTextDom) return;

  const questionText = questionTextDom.textContent.trim();

  // Mostra un alert con il testo della domanda
  alert(`Domanda corrente:\n\n${questionText}`);

  // Trova l'elenco delle risposte (ul.coreContent)
  const answersDom = document.querySelector("ul.coreContent");
  if (!answersDom) return;

  const answers = answersDom.children;

  // Deseleziona tutte le risposte
  for (let answer of Array.from(answers)) {
    const input = answer.querySelector("input");
    if (!input) continue;
    input.checked = false;
  }

  // Trova le risposte corrette
  const correctAnswers = findAnswers(answerData, questionText, answers);
  if (correctAnswers.length === 0) return;

  // Seleziona le risposte corrette
  for (const answer of correctAnswers) {
    const input = answer.querySelector("input");
    if (!input) continue;
    input.checked = true;

    // Emetti l’evento per far reagire eventuale JS del sito
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/**
 *
 * @param {Array<Answer>} answerData
 * @param {string} questionText
 * @param {HTMLCollection} answers
 * @returns
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

function matchAnswer(textA, textB) {
  const replaceRegex = /[^\w]/gi;
  textA = textA.replace(replaceRegex, "");
  textB = textB.replace(replaceRegex, "");
  return textA === textB;
}

window.answerQuestion = answerQuestion;
