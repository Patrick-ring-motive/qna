/**
 * QnA Web Worker — Multi-Strategy Answer Engine
 *
 * This worker implements a cascade of answer-retrieval strategies, each named
 * as a playful acronym. They are tried in order, falling back to the next when
 * the current strategy returns no answer or a suspiciously short one (<2 words).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * [bert]   — Bidirectional Encoder Representations from Transformers (baseline)
 *            The raw TF.js QnA model asked with the user's question verbatim.
 *
 * [blert]  — BERT + LCS (Lexical Correction)
 *            When BERT fails, out-of-vocabulary question words are swapped for
 *            their closest match found in the context via weighted LCS before
 *            re-querying BERT. Handles typos and paraphrase drift.
 *
 * [aert]   — Answer Encoder Representations from Transformers (Keyword Fallback)
 *            Strips the question down to its longest word and asks BERT
 *            "What is <longestWord>?" — a last-ditch keyword probe.
 *
 * [alert]  — AERT + LCS (Keyword + Lexical Correction)
 *            Same as [aert] but the longest word is first fuzzy-matched against
 *            the context vocabulary via LCS before querying BERT.
 *
 * [lcs]    — Pure Longest Common Subsequence (No Neural Model)
 *            BERT is bypassed entirely. The context is split into candidate
 *            phrases and ranked by LCS similarity to the question. The top
 *            matching phrase is returned as-is. Used when all BERT strategies
 *            are exhausted.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const stringify = x => {
  try {
    return JSON.stringify(x);
  } catch (e) {
    console.warn(e, x);
    return String(x);
  }
};

const parse = x =>{
  try{
    return Object(JSON.parse(x));
  }catch(e){
    console.warn(e);
    return Object(x);
  }
};


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

const longestWordPair = (str) => {
  let longest = '';
  const words = String(str).split(/\s+/);
  for (let i = 0;i<words.length;++i) {
    const word = ((words[i-1]||'')+' '+words[i]).trim();
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



globalThis.correctModelOutput = (async()=>{
const { LocalLinter,createBinaryModuleFromUrl } = await import('https://cdn.jsdelivr.net/npm/harper.js/+esm');

let linterInstance = null;

async function getLinter() {
    if (linterInstance) return linterInstance;

    // 1. Import the necessary tools from the library
   // const { LocalLinter, createBinaryModuleFromUrl } = await import('harper.js');

    // 2. Create the binary module. 
    // If hosting locally, point this to your local node_modules path or public folder.
    // Here we use the JSDelivr CDN for the .wasm file.
    const binary = createBinaryModuleFromUrl(
        'https://cdn.jsdelivr.net/npm/harper.js/dist/harper_wasm_bg.wasm'
    );

    // 3. Pass the binary into the constructor
    const linter = new LocalLinter({ binary });
    await linter.setup();

    // 4. Configuration for N-gram output
    const config = await linter.getLintConfig();
    await linter.setLintConfig({
        ...config,
        SpellCheck: false,
        SentenceCapitalization: false,
        Matcher: true,
        Correctness: true
    });

    linterInstance = linter;
    return linter;
}

/**
 * Corrects a single generated sentence.
 */
return (async function correctModelOutput(sentence) {
    try{
    const linter = await getLinter();
    const lints = await linter.lint(sentence);
    
    let corrected = sentence;
    const sortedLints = lints.sort((a, b) => b.span.start - a.span.start);

    for (const lint of sortedLints) {
        if (lint.suggestions && lint.suggestions.length > 0) {
            corrected = await linter.applySuggestion(
                corrected, 
                lint, 
                lint.suggestions[0]
            );
        }
    }

    return corrected;
    }catch(e){
      return `${sentence} ${e}`;
    }
});
})();

async function findAns(ques, ctx) {
  ques = String(ques).trim().replace(/[\s\?\!\.\,\;]*$/g, '?');
  if (ques.split(/\s/).length === 1) {
    ques = `What is ${ques}?`;
  }
  const cques = await correctModelOutput(ques);
  const cctx = await correctModelOutput(ctx);
  const ans = await self.model.findAnswers(ques, ctx);
  if(ans.length < 2)ans.push(...(await self.model.findAnswers(cques, ctx)));
  if(ans.length < 2)ans.push(...(await self.model.findAnswers(ques, cctx)));
  if(ans.length < 2)ans.push(...(await self.model.findAnswers(cques,cctx)));
  
  return [...new Set(ans.map(stringify))].map(parse);
}


self.onmessage = async (e) => {
  "use strict";

  globalThis.correctModelOutput  = await globalThis.correctModelOutput;
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
        context.split(/[.?!;:,]/),
        context.split(/[.?!;:,\n\r]/)
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
        source = '[blert]';//bert + lcs
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
        answers = await findAns(`What is ${longestWordPair(question)}?`, context);
      }

      if (!answers?.length || getBestAnswer(answers).split(/\s+/).length < 2) {
        source = '[alert]'; //aert + lcs
        const longest = longestWordPair(question);
        const { value: best } = word.bestMatch(longest, ctx);
        answers = await findAns(`What is ${best}?`, context);
      }

      if (!answers?.length || getBestAnswer(answers).split(/\s+/).length < 2) {
        //Answer Encoder Representations from Transformers
        source = '[aert]';
        answers = await findAns(`What is ${longestWord(question)}?`, context);
      }

      if (!answers?.length || getBestAnswer(answers).split(/\s+/).length < 2) {
        source = '[alert]'; //aert + lcs
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
const lettersOnly = x => String(x).toLowerCase().replace(/[^a-z]/g, '');
const quest = question.toLowerCase();
let ctext = blurbs ?? context.toLowerCase().split(/[\?\!\.]/);
ctext = ctext.filter(x => !/Wiktionary.\sthe\s+free\s+dictionary/i.test(x));

let bestMatch = 0;
let matchScore = 0;
const ctext_length = ctext.length;

for (let x = 0; x !== ctext_length; ++x) {
  const ctxword = ctext[x];
  if (word.match(lettersOnly(quest), lettersOnly(ctxword))) continue;
  const score = seq.lcs(quest, ctxword.toLowerCase());
  if (score > matchScore) { matchScore = score; bestMatch = x; }
}

if (!matchScore) {
  for (let x = 0; x !== ctext_length; ++x) {
    const ctxword = ctext[x];
    const score = seq.lcs(quest, ctxword.toLowerCase()) + ctxword.length / quest.length;
    if (score > matchScore) { matchScore = score; bestMatch = x; }
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
