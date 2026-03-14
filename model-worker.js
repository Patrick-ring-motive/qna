

self.onmessage = async (e) => {
                const { type, payload } = e.data;

                if (type === 'INIT') {
                    try {
                        // Import scripts inside worker
                        importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
                        importScripts("https://patrick-ring-motive.github.io/distilgpt2/bert/qna.js");
                        
                        // QNA library puts 'qna' on global scope via importScripts
                        // TF handles its own backend
                        await tf.ready();
                        self.model = await qna.load();
                        self.postMessage({ type: 'READY' });
                    } catch (err) {
                        self.postMessage({ type: 'ERROR', payload: err.message });
                    }
                }

                if (type === 'ASK') {
                    try {
                        const { question, context } = payload;
                        const answers = await self.model.findAnswers(question, context);
                        
                        // Apply the specific scoring logic requested
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

                        self.postMessage({ type: 'ANSWER', payload: bestAnswer });
                    } catch (err) {
                        self.postMessage({ type: 'ANSWER', payload: err.message });
                    }
                }
            };
