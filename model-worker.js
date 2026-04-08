(() => {
  const _fetch = globalThis.fetch;
  globalThis.fetch = Object.setPrototypeOf(async function fetch(url, options) {
    url = url.url ?? url;
    if (String(url).includes('model.json')) {
      return _fetch('https://patrick-ring-motive.github.io/qna/model.json');
    }
    return _fetch.apply(this, arguments);
  }, _fetch);
})();

const importScript = async (url) => {
  const module = { exports: {} };
  eval(await (await fetch(url)).text());
  return module.exports;
};

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
    return String(x);
  }
};

const beReg = /^(is|am|are|were|was|will|did|do|does|can|may|would|could|have|say|get|make|go|know|take|see|come|think|look|want|give|use|find|tell|ask|work|seem|feel|try|leave|call|has)[a-z]+/i;
const wReg = /^(w|h)[a-z]+/i;

const longestWord = (str) => {
  let longest = '';
  const words = String(str).split(/\s+/);
  for (const word of words) {
    if (word.length >= longest.length) {
      longest = word;
    }
  }
  return longest;
};

const getBestAnswer = answers => {
  let bestAnswer = (answers && answers.length > 0) ? answers[0].text : "No answer found.";
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
  return bestAnswer;
};

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
  let sent = ` ${words.join(' ').trim().replace(/\?$/, '')} ${be} ${uncap(answer)}.`;

  if (/^(of|a|the)$/i.test(be) || (/^(of)$/i.test(words[0]))) {
    sent = (`${answer} is ${lower(be)} ${words.join(' ')}`.trim().replace(/\?$/, '.'));
  } else if (/^(did|do|does)$/i.test(be)) {
    let subject = String(String(text.split(` ${be} `).pop()).split(/\s|$/).shift());
    sent = `${subject} ${be} ${words.join(' ').replace(subject, '').replace(/[\.\?\!]$/, '')} ${uncap(answer)}.`;
  } else {
    if (words.some(x => beReg.test(x))) {
      let word = words.find(x => beReg.test(x));
      let subject = text.slice(text.indexOf(word)).replace(word, '');
      sent = `${subject.replace(/[\.\?\!]$/, '')} ${word} ${uncap(answer)}.`;
    } else {
      sent = ` ${words.join(' ').trim().replace(/\?$/, '')} ${be} is ${uncap(answer)}.`;
    }
  }
  sent = sent.split(' ').map((x, i, a) => (lower(x) == lower(a[i - 1])) ? '' : x).join(' ').trim().replace(/\s+/g, ' ');
  sent = sent.replace(/\.\d+$/g, '.');
  sent = sent.replace('—', ' ');
  return (cap(sent));
}

async function findAns(ques, ctx) {
  ques = String(ques).trim().replace(/[\s\?\!\.\,\;]*$/g, '?');
  if (ques.split(/\s/).length === 1) {
    ques = `What is ${ques}?`;
  }
  return await self.model.findAnswers(ques, ctx);
}

self.onmessage = async (e) => {
  "use strict";
  const { type, payload } = e.data;

  if (type === 'INIT') {
    try {
      importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
      importScripts("https://patrick-ring-motive.github.io/qna/qna.js");

      // Load nlp-lcs via eval shim (handles module.exports in worker context)
      const nlpLcs = await importScript('https://patrick-ring-motive.github.io/nlp-lcs/index.js');
      self.word = nlpLcs.word;
      self.seq = nlpLcs.seq;

      await tf.ready();
      self.model = await qna.load();
      self.postMessage({ type: 'READY' });
    } catch (err) {
      console.warn(err);
      self.postMessage({ type: 'ERROR', payload: err.message });
    }
  }

  if (type === 'ASK') {
    try {
      const { question, context, blurbs } = payload;
      const { word, seq } = self;

      if (!hasHelloThere) {
        if (word.match(question.toLowerCase(), helloThere)) {
          hasHelloThere = true;
          self.postMessage({ type: 'ANSWER', payload: 'General Kenobi!', source: '' });
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

      // Ask bert our question
      let answers = await findAns(question, context);
      if (!answers?.length && !/^what/i.test(question)) {
        answers = await findAns(`What is ${question}?`, context);
      }
      //Bidirectional Encoder Representations from Transformers
      source = '[bert]';

      if (!answers?.length || getBestAnswer(answers).split(/\s+/).length < 2) {
        source = '[bert+lcs]';
        for (let i = 0; i !== qarr_length; ++i) {
          const qword = qarr[i].toLowerCase();
          if ([qword, qarr[i]].some(x => ctx.includes(x))) continue;
          const { value: bestMatch, match } = word.bestWeighted(qword, ctx);
          if (match) qarr[i] = bestMatch;
        }
        answers = await findAns(qarr.join(' ') + '?', context);
        if (!answers?.length && !/^what/i.test(qarr.join(' '))) {
          answers = await findAns(`What is ${qarr.join(' ')}?`, context);
        }
      }

      

      if (!answers?.length || getBestAnswer(answers).split(/\s+/).length < 2) {
        //Answer Encoder Representations from Transformers
        source = '[aert]';
        answers = await findAns(`What is ${longestWord(question)}?`, context);
      }

      if (!answers?.length || getBestAnswer(answers).split(/\s+/).length < 2) {
        source = '[aert+lcs]';
        const longest = longestWord(question);
        const { value: best } = word.bestMatch(longest, ctx);
        answers = await findAns(`What is ${best}?`, context);
      }
      
    /*if (!answers?.length || getBestAnswer(answers).split(/\s+/).length < 2) {
        source = '[bert+lcs]';
        for (let i = 0; i !== qarr_length; ++i) {
          const qword = qarr[i].toLowerCase();
          if ([qword, qarr[i]].some(x => ctx.includes(x))) continue;
          const { value: bestMatch } = word.bestWeighted(qword, ctx);
          qarr[i] = bestMatch;
        }
        answers = await findAns(qarr.join(' ') + '?', context);
        if (!answers?.length && !/^what/i.test(qarr.join(' '))) {
          answers = await findAns(`What is ${qarr.join(' ')}?`, context);
        }
      }*/
      

      if (!answers?.length || getBestAnswer(answers).split(/\s+/).length < 2) {
        source = '[lcs]';
        const quest = question.toLowerCase();
        let ctext = blurbs ?? context.toLowerCase().split(/[\?\!\.]/);
        ctext = ctext.filter(x => !/Wiktionary.\sthe\s+free\s+dictionary/i.test(x));

        // First pass: context-scored match (raw LCS + length bonus), skip near-identical segments
        let bestMatch = 0;
        let matchScore = 0;
        const ctext_length = ctext.length;
        for (let x = 0; x !== ctext_length; ++x) {
          const ctxword = ctext[x];
          if (word.match(quest, ctxword.toLowerCase())) continue; // too similar — skip
          const score = seq.context(quest, ctxword.toLowerCase());
          if (score > matchScore) {
            matchScore = score;
            bestMatch = x;
          }
        }
        // Second pass fallback: same scoring, no similarity filter
        if (!matchScore) {
          for (let x = 0; x !== ctext_length; ++x) {
            const ctxword = ctext[x];
            const score = seq.context(quest, ctxword.toLowerCase());
            if (score > matchScore) {
              matchScore = score;
              bestMatch = x;
            }
          }
        }

        self.postMessage({
          type: 'ANSWER',
          payload: cap(unquote(ctext[bestMatch])),
          source
        });
        return;
      }

      const bestAnswer = getBestAnswer(answers);
      self.postMessage({
        type: 'ANSWER',
        payload: cap(unquote(bestAnswer)),
        source
      });
    } catch (err) {
      console.warn(err);
      self.postMessage({ type: 'ANSWER', payload: err.message });
    }
  }
};
