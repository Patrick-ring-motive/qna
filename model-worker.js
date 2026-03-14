const helloThere = 'hello there';
let hasHelloThere = false;
const lcs = function lcs(seq1, seq2) {
    "use strict";
    let arr1 = [...seq1 ?? []];
    let arr2 = [...seq2 ?? []];
    if (arr2.length > arr1.length) {
        [arr1, arr2] = [arr2, arr1];
    }
    const dp = Array(arr1.length + 1).fill(0).map(() => Array(arr2.length + 1).fill(0));
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
    return dp[arr1.length][arr2.length]
};


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
                context
            } = payload;
            if(!hasHelloThere){
                if(lcs(question.toLowerCase(),helloThere) >= (~~(Math.max(helloThere.length,question.length)))){
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
            const ctx = [...new Set(context.split(/\s+/))];
            const ctx_length = ctx.length;
      
            let answers = await self.model.findAnswers(question, context);

            if (!answers?.length) { 
                for (let i = 0; i !== qarr_length; ++i) {
                    const word = qarr[i].toLowerCase();
                    if([word,qarr[i]].some(x=>ctx.includes(x)))continue;
                    let bestMatch = ctx[0];
                    let matchScore = lcs(word, bestMatch) * Math.min(word.length, ctx[0].length) / Math.max(word.length, ctx[0].length);
                    for (let x = 1; x !== ctx_length; ++x) {
                        const ctxword = ctx[x];
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
                answers = await self.model.findAnswers(qarr.join(' ') + '?', context);
            }
            if (!answers?.length) {
                for (let i = 0; i !== qarr_length; ++i) {
                    const word = qarr[i].toLowerCase();
                    if([word,qarr[i]].some(x=>ctx.includes(x)))continue;
                    let bestMatch = ctx[0];
                    let matchScore = lcs(word, bestMatch) * Math.min(word.length, ctx[0].length) / Math.max(word.length, ctx[0].length);
                    for (let x = 1; x !== ctx_length; ++x) {
                        const ctxword = ctx[x];
                        const score = lcs(word, ctxword.toLowerCase()) * Math.min(word.length, ctxword.length) / Math.max(word.length, ctxword.length);
                        if (score > matchScore) {
                            matchScore = score;
                            bestMatch = ctxword;
                        }
                    }
                    qarr[i] = bestMatch;
                }
                answers = await self.model.findAnswers(qarr.join(' ') + '?', context);
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
                payload: bestAnswer
            });
        } catch (err) {
            self.postMessage({
                type: 'ANSWER',
                payload: err.message
            });
        }
    }
};
