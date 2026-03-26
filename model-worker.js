const helloThere = 'hello there';
let hasHelloThere = false;
const unquote = x => String(x).replace(/^[\s"'`]+|[\s"'`]+$/g, '');

const lower = x => String(x).toLowerCase();

const cap = x => [...String(x)].map((x, i) => (!i) ? x.toUpperCase() : x).join('');

const uncap = x => [...String(x)].map((x, i, a) => (a.slice(1).every(y => y == y.toLowerCase()) && !i) ? x.toLowerCase() : x).join('');
const stringify = x => {
    try {
        return JSON.stringify(x);
    } catch {
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
// ... (Keep your helper functions: unquote, cap, uncap, questionToAnswer)

const lcsMemo = new Map(); // Map is more performant for frequent lookups
const lcs = function lcs(seq1, seq2) {
    if (!seq1 || !seq2) return 0;
    const lcsKey = seq1.length > seq2.length ? `${seq1}:${seq2}` : `${seq2}:${seq1}`;
    if (lcsMemo.has(lcsKey)) return lcsMemo.get(lcsKey);

    let arr1 = [...seq1], arr2 = [...seq2];
    if (arr2.length > arr1.length) [arr1, arr2] = [arr2, arr1];

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
    const result = dp[arr2.length];
    lcsMemo.set(lcsKey, result);
    return result;
};

self.onmessage = async (e) => {
    const { type, payload } = e.data;
    if (type === 'INIT') { /* ... keep your init logic ... */ }

    if (type === 'ASK') {
        try {
            const { question, context, blurbs } = payload;
            if (!context || context.trim().length < 5) {
                return self.postMessage({ type: 'ANSWER', payload: "I couldn't find enough information to answer that." });
            }

            // ... (Keep your Easter Egg logic)

            const qarr = question.split(/\s+/);
            const phrases = [...new Set(context.split(/[.?!;]/).map(x => x.trim()).filter(x => x.length > 5))];
            const ctxWords = [...new Set(phrases.join(' ').split(/\s+/))].filter(x => x);

            if (!ctxWords.length) throw new Error("Empty context");

            let answers = await findAns(question, context);

            // Fallback 1: Fuzzy Question Matching
            if (!answers?.length) {
                // ... (Your loop to fix qarr via lcs goes here)
                answers = await findAns(qarr.join(' ') + '?', context);
            }

            // Fallback 2: Sentence Matching (The "Undefined" Danger Zone)
            if (!answers?.length) {
                const quest = question.toLowerCase();
                const searchSet = (blurbs && blurbs.length) ? blurbs : phrases;
                let bestMatchIdx = 0;
                let maxScore = -1;

                searchSet.forEach((sentence, idx) => {
                    const score = lcs(quest, sentence.toLowerCase()) * Math.min(quest.length, sentence.length) / 
                                 Math.max(quest.length, sentence.length);
                    if (score > maxScore) {
                        maxScore = score;
                        bestMatchIdx = idx;
                    }
                });

                const finalSnippet = searchSet[bestMatchIdx] || "No specific details found.";
                return self.postMessage({
                    type: 'ANSWER',
                    payload: questionToAnswer(question, finalSnippet)
                });
            }

            // Scoring for Model Answers
            let bestAnswer = answers[0].text;
            let maxScore = -1;
            for (const a of answers) {
                const weight = a.text.length * a.score;
                if (weight > maxScore) {
                    maxScore = weight;
                    bestAnswer = a.text;
                }
            }

            self.postMessage({
                type: 'ANSWER',
                payload: questionToAnswer(question, bestAnswer)
            });

        } catch (err) {
            self.postMessage({
                type: 'ANSWER',
                payload: "I ran into a snag: " + err.message
            });
        }
    }
};
