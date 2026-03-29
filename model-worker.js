const helloThere = 'hello there';
let hasHelloThere = false;
let source = 'bert';
const unquote = x => String(x).replace(/^[\s"'`]+|[\s"'`]+$/g, '');

const lower = x => String(x).toLowerCase();

const cap = x => [...String(x)].map((x, i) => (!i) ? x.toUpperCase() : x).join('');

const uncap = x => [...String(x)].map((x, i, a) => (a.slice(1).every(y => y == y.toLowerCase()) && !i) ? x.toLowerCase() : x).join('');
const stringify = x => {
  try {
    return JSON.stringify(x);
  } catch (e) {
    console.warn(e, x);
    x
    return String(x);
  }
};
const beReg = /^(is|am|are|were|was|will|did|do|does|can|may|would|could|have|say|get|make|go|know|take|see|come|think|look|want|give|use|find|tell|ask|work|seem|feel|try|leave|call|has)[a-z]+/i;
const wReg = /^(w|h)[a-z]+/i;

function questionToAnswer(text, answer) {
  if (/\sor\s/i.test(text)) return answer;
  answer = unquote(answer);
  text = unquote(text);
  const words = text.split(/\s+/);
  const q0 = unquote(`${words.shift()}`);
  console.log(words);
  let be = q0;
  if (!beReg.test(q0) && wReg.test(q0)) {
    be = unquote(`${words.shift()}`);
  }
  let sent = ` ${words.join(' ').trim().replace(/\?$/,'')} ${be} ${uncap(answer)}.`;

  if (/^(of|a|the)$/i.test(be) || (/^(of)$/i.test(words[0]))) {
    sent = (`${answer} is ${lower(be)} ${words.join(' ')}`.trim().replace(/\?$/, '.'));
  } else if (/^(did|do|does)$/i.test(be)) {
    let subject = String(String(text.split(` ${be} `).pop()).split(/\s|$/).shift());
    sent = `${subject} ${be} ${words.join(' ').replace(subject,'').replace(/[\.\?\!]$/,'')} ${uncap(answer)}.`;
  } else {
    if (words.some(x => beReg.test(x))) {
      let word = words.find(x => beReg.test(x));
      let subject = text.slice(text.indexOf(word)).replace(word, '');
      sent = `${subject.replace(/[\.\?\!]$/,'')} ${word} ${uncap(answer)}.`;
    } else {
      sent = ` ${words.join(' ').trim().replace(/\?$/,'')} ${be} is ${uncap(answer)}.`;
    }
  }
  sent = sent.split(' ').map((x, i, a) => (lower(x) == lower(a[i - 1])) ? '' : x).join(' ').trim().replace(/\s+/g, ' ');
  sent = sent.replace(/\.\d+$/g, '.');
  sent = sent.replace('—', ' ');
  return (cap(sent));

}
const lcsMemo = new Map();
const lcs = function lcs(seq1, seq2) {
  "use strict";
  const lcsKey = String([seq1, seq2].sort());
  if (lcsMemo.get(lcsKey)) {
    return lcsMemo.get(lcsKey);
  }
  let arr1 = [...seq1 ?? []];
  let arr2 = [...seq2 ?? []];
  if (arr2.length > arr1.length) {
    [arr1, arr2] = [arr2, arr1];
  }
  const dp = Array(arr1.length + 1).fill(0).map(() => new Uint8Array(arr2.length + 1));
  const dp_length = dp.length;
  for (let i = 1; i !== dp_length; i++) {
    const dpi_length = dp[i].length;
    for (let x = 1; x !== dpi_length; x++) {
      if (arr1[i - 1] === arr2[x - 1]) {
        dp[i][x] = dp[i - 1][x - 1] + 1
      } else {
        dp[i][x] = Math.max(dp[i][x - 1], dp[i - 1][x])
      }
    }
  }
  const result = dp[arr1.length][arr2.length];
  lcsMemo.set(lcsKey, result);
  return result;
};

const lcsMatch = (seq1, seq2) => lcs(seq1, seq2) >= ~~(0.8 * Math.max(seq1.length, seq2.length));

async function findAns(ques, ctx) {
  ques = String(ques).trim().replace(/[\s\?\!\.\,\;]*$/g, '?');
  if (ques.split(/\s/).length === 1) {
    ques = `What is ${ques}`;
  }
  return await self.model.findAnswers(ques, ctx);
}

self.onmessage = async (e) => {
  "use strict";
  const {
    type,
    payload
  } = e.data;

  if (type === 'INIT') {
    try {
      // Import scripts inside worker
      importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
      importScripts("https://patrick-ring-motive.github.io/qna/qna.js");

      // QNA library puts 'qna' on global scope via importScripts
      // TF handles its own backend
      await tf.ready();
      self.model = await qna.load();
      self.postMessage({
        type: 'READY'
      });
    } catch (err) {
      console.warn(err);
      self.postMessage({
        type: 'ERROR',
        payload: err.message
      });
    }
  }

  if (type === 'ASK') {
    try {
      const {
        question,
        context,
        blurbs
      } = payload;
      if (!hasHelloThere) {
        if (lcs(question.toLowerCase(), helloThere) >= (~~(0.8 * Math.max(helloThere.length, question.length)))) {
          hasHelloThere = true;
          self.postMessage({
            type: 'ANSWER',
            payload: 'General Kenobi!'
          });
          return;
        }
      }
      const qarr = question.split(/\s+/);
      const qarr_length = qarr.length;
      const phrases = [...new Set([
        context.split(/[.?!]/),
        context.split(/[.?!;]/),
        context.split(/[.?!;,]/),
        context.split(/[.?!;,\n\r]/)
      ].flat().map(x => x.trim()).filter(x => x))];
      const ctx = [...new Set(phrases.join(' ').split(/\s+/))].filter(x => x);
      const ctx_length = ctx.length;

      let answers = await findAns(question, context);
      if (!answers?.length && !/^what/i.test(question)){
        answers = await findAns(`What is ${question}?`, context);
      }
      source = '[bert]';
      if (!answers?.length) {
        source = '[bert+lcs]';
        for (let i = 0; i !== qarr_length; ++i) {
          const word = qarr[i].toLowerCase();
          if ([word, qarr[i]].some(x => ctx.includes(x))) continue;
          let bestMatch = String(ctx[0]);
          let matchScore = lcs(word, bestMatch) * Math.min(word.length, bestMatch.length) / Math.max(word.length, bestMatch.length);
          for (let x = 0; x < ctx_length; ++x) {
            const ctxword = String(ctx[x]);
            const score = lcs(word, ctxword.toLowerCase()) * Math.min(word.length, ctxword.length) / Math.max(word.length, ctxword.length);
            if (score > matchScore) {
              matchScore = score;
              bestMatch = ctxword;
            }
          }
          if (lcs(word, bestMatch.toLowerCase()) >= ~~(0.8 * word.length)) {
            qarr[i] = bestMatch;
          }
        }
        answers = await findAns(qarr.join(' ') + '?', context);
        if (!answers?.length && !/^what/i.test(qarr.join(' '))){
          answers = await findAns(`What is ${qarr.join(' ')}?`, context);
        }
      }
      if (!answers?.length) {
        //source = '[bert+lcs]';
        for (let i = 0; i !== qarr_length; ++i) {
          const word = qarr[i].toLowerCase();
          if ([word, qarr[i]].some(x => ctx.includes(x))) continue;
          let bestMatch = String(ctx[0]);
          let matchScore = lcs(word, bestMatch) * Math.min(word.length, bestMatch.length) / Math.max(word.length, bestMatch.length);
          for (let x = 0; x < ctx_length; ++x) {
            const ctxword = String(ctx[x]);
            const score = lcs(word, ctxword.toLowerCase()) * Math.min(word.length, ctxword.length) / Math.max(word.length, ctxword.length);
            if (score > matchScore) {
              matchScore = score;
              bestMatch = ctxword;
            }
          }
          //if (lcs(word, bestMatch.toLowerCase()) >= ~~(0.8 * word.length)) {
            qarr[i] = bestMatch;
          //}
        }
        answers = await findAns(qarr.join(' ') + '?', context);
        if (!answers?.length && !/^what/i.test(qarr.join(' '))){
          answers = await findAns(`What is ${qarr.join(' ')}?`, context);
        }
      }
      
      if (!answers?.length) {
        const lettersOnly = x => String(x).toLowerCase().replace(/[^a-z]/g, '');
          source = '[lcs]';
          const quest = question.toLowerCase();
          let ctext;
          if (blurbs) {
            ctext = blurbs;
          } else {
            ctext = context.toLowerCase().split(/[\?\!\.]/);
          }
          let bestMatch = 0;
          let matchScore = 0;
          const ctext_length = ctext.length;
          for (let x = 0; x !== ctext_length; ++x) {
            const ctxword = ctext[x];
            const ql = lettersOnly(quest);
            const cl = lettersOnly(ctxword)
            if (lcsMatch(ql, cl)) {
              continue;
            }
            const score = lcs(quest, ctxword.toLowerCase());// * ctxword.length;//* Math.min(quest.length, ctxword.length) / Math.max(quest.length, ctxword.length);
            if (score > matchScore) {
              matchScore = score;
              bestMatch = x;
            }
          }
          if(!matchScore){
            for (let x = 0; x !== ctext_length; ++x) {
              const ctxword = ctext[x];
              const score = lcs(quest, ctxword.toLowerCase()) + ctxword.length/quest.length;
              if (score > matchScore) {
                matchScore = score;
                bestMatch = x;
              }
            }
          }
          self.postMessage({
            type: 'ANSWER',
            payload: cap(unquote(ctext[bestMatch])), // + ' ' + stringify(ctext)
            source
          });
          return;
      }

      // Apply the specific scoring logic requested
      let bestAnswer = (answers && answers.length > 0) ? answers[0].text : qarr?.join?.(' ') ?? "No answer found.";
      let bestScore = 0;

      if (answers && answers.length > 0) {
        for (const a of answers) {
          const score = a.text.length * a.score;
          if (score > bestScore) {
            bestScore = score;
            bestAnswer = a.text;
          }
        }
      }

      self.postMessage({
        type: 'ANSWER',
        payload: cap(unquote(bestAnswer)), //+ ' ' + stringify(answers)
        source
      });
    } catch (err) {
      console.warn(err);
      self.postMessage({
        type: 'ANSWER',
        payload: err.message
      });
    }
  }
};
