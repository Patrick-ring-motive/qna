/* --- Helpers --- */
const helloThere = 'hello there';
let hasHelloThere = false;

const unquote = x => String(x).replace(/^[\s"'`]+|[\s"'`]+$/g, '');
const lower = x => String(x).toLowerCase();
const cap = x => [...String(x)].map((x, i) => (!i) ? x.toUpperCase() : x).join('');
const uncap = x => [...String(x)].map((x, i, a) => (a.slice(1).every(y => y == y.toLowerCase()) && !i) ? x.toLowerCase() : x).join('');

const beReg = /^(is|am|are|were|was|will|did|do|does|can|may|would|could|have|say|get|make|go|know|take|see|come|think|look|want|give|use|find|tell|ask|work|seem|feel|try|leave|call|has)[a-z]*/i;
const wReg = /^(w|h)[a-z]+/i;

function questionToAnswer(text, answer) {
    if (!answer || answer.includes("undefined")) return "I couldn't find a clear answer for that.";
    if (/\sor\s/i.test(text)) return cap(unquote(answer));
    
    answer = unquote(answer);
    text = unquote(text);
    const words = text.split(/\s+/);
    const q0 = unquote(`${words.shift()}`);
    
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
    return cap(sent.replace(/\.\d+$/g, '.').replace('—', ' '));
}

const lcsMemo = new Map();
const lcs = (seq1, seq2) => {
    if (!seq1 || !seq2) return 0;
    const lcsKey = seq1.length > seq2.length ? `${seq1}:${seq2}` : `${seq2}:${seq1}`;
    if (lcsMemo.has(lcsKey)) return lcsMemo.get(lcsKey);

    let arr1 = [...seq1], arr2 = [...seq2];
    const dp = Array(arr2.length + 1).fill(0);
    for (let i = 0; i < arr1.length; i++) {
        let prev = 0;
        for (let j = 0; j < arr2.length; j++) {
            let temp = dp[j + 1];
            if (arr1[i] === arr2[j]) dp[j + 1] = prev + 1;
            else dp[j + 1] = Math.max(dp[j + 1], dp[j]);
            prev = temp;
        }
    }
    lcsMemo.set(lcsKey, dp[arr2.length]);
    return dp[arr2.length];
};

async function findAns(ques, ctx) {
    const q = String(ques).trim().replace(/[\s\?\!\.\,\;]*$/g, '') + '?';
    const finalQ = q.split(/\s/).length === 1 ? `What is ${q}` : q;
    return await self.model.findAnswers(finalQ, ctx);
}

/* --- Worker Logic --- */

self.onmessage = async (e) => {
    "use strict";
    const { type, payload } = e.data;

    if (type === 'INIT') {
        try {
            importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
            importScripts("https://patrick-ring-motive.github.io/qna/qna.js");
            await tf.ready();
            self.model = await qna.load();
            self.postMessage({ type: 'READY' });
        } catch (err) {
            self.postMessage({ type: 'ERROR', payload: err.message });
        }
    }

    if (type === 'ASK') {
        try {
            const { question, context, blurbs } = payload;
            
            // Easter Egg
            if (lcs(question.toLowerCase(), helloThere) >= (0.8 * Math.max(helloThere.length, question.length))) {
                return self.postMessage({ type: 'ANSWER', payload: 'General Kenobi!' });
            }

            if (!context || context.length < 10) {
                return self.postMessage({ type: 'ANSWER', payload: "I don't have enough context to answer that." });
            }

            // Prepare context
            const phrases = [...new Set(context.split(/[.?!;]/).map(x => x.trim()).filter(x => x.length > 5))];
            const ctxWords = [...new Set(phrases.join(' ').split(/\s+/))];

            let answers = await findAns(question, context);

            // Fallback 1: Fuzzy Question Repair
            if (!answers?.length) {
                const qarr = question.split(/\s+/);
                for (let i = 0; i < qarr.length; i++) {
                    const word = qarr[i].toLowerCase();
                    if (word.length < 4 || ctxWords.includes(word)) continue;
                    
                    let bestMatch = { word: qarr[i], score: 0 };
                    for (const cw of ctxWords) {
                        const score = lcs(word, cw.toLowerCase()) / Math.max(word.length, cw.length);
                        if (score > bestMatch.score) bestMatch = { word: cw, score };
                    }
                    if (bestMatch.score > 0.7) qarr[i] = bestMatch.word;
                }
                answers = await findAns(qarr.join(' '), context);
            }

            // Fallback 2: Sentence Matching (Fixed Index Logic)
            if (!answers?.length) {
                const searchSet = (blurbs && blurbs.length) ? blurbs : phrases;
                let best = { text: searchSet[0], score: -1 };
                const qLow = question.toLowerCase();

                searchSet.forEach(s => {
                    const score = lcs(qLow, s.toLowerCase()) / Math.max(qLow.length, s.length);
                    if (score > best.score) best = { text: s, score };
                });

                return self.postMessage({ 
                    type: 'ANSWER', 
                    payload: questionToAnswer(question, best.text) 
                });
            }

            // Rank Model Answers
            let bestAnswer = answers[0].text;
            let maxWeight = -1;
            for (const a of answers) {
                const weight = a.text.length * a.score;
                if (weight > maxWeight) {
                    maxWeight = weight;
                    bestAnswer = a.text;
                }
            }

            self.postMessage({ 
                type: 'ANSWER', 
                payload: questionToAnswer(question, bestAnswer) 
            });

        } catch (err) {
            self.postMessage({ type: 'ANSWER', payload: "Worker Error: " + err.message });
        }
    }
};
