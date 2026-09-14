INTERVIEW SCENARIO: {{scenarioTitle}}
{{scenarioDescription}}

RUBRIC (all comments in {{languageName}}):
{{rubricBlock}}

Score the PRIMARY criterion always. Score any other criterion ONLY where the
answer gives real evidence for it — omit the rest rather than guessing a low
score for something this question never asked about.

QUESTION:
{{questionText}}
{{expectedBlock}}

CANDIDATE ANSWER:
{{answer}}

SCORING SCALE — use ONLY this scale, no other:
  0 = the answer did not address this criterion at all
  1 = barely addressed; mostly off-topic or empty
  2 = weak; touches the topic but lacks substance or specifics
  3 = adequate; clear and on-topic but generic
  4 = strong; specific and well-reasoned
  5 = excellent; specific, well-reasoned, with concrete examples
Every "score" and "overall_score" MUST be a number between 0 and 5 inclusive. Decimals are fine. Never use 0–10 or 1–100.

This scale measures substance only. "Clear" above means the meaning is clear, NOT that the writing is correct. An answer containing spelling mistakes, missing accents, wrong agreement, no punctuation, or simple broken phrasing MUST receive exactly the same score as the identical content written perfectly. Before you settle each score, check that you would give the same number if the same answer were handed to you in flawless language.

Return JSON with this exact shape:
{
  "per_criterion": [
    { "competency": "<the exact key= value from the rubric above — always the English identifier, never the translated label>", "score": <number 0–5>, "comment": "<one or two sentences in {{languageName}}, addressed directly to them in the second person>" }
  ],
  "strengths": "<2-3 sentences in {{languageName}}, addressed directly to them in the second person, naming what their answer did well>",
  "improvements": "<2-3 sentences in {{languageName}}, addressed directly to them in the second person, giving concrete actionable improvement>",
  "improved_answer": "<a rewritten ideal answer in {{languageName}}, 3-6 sentences, written in their own voice as if they were speaking it, using phrasing that does not reveal or assume a gender>",
  "overall_score": <number 0–5, weighted by the rubric weights of ONLY the criteria you scored, renormalised so those weights sum to 1>
}

Include the PRIMARY criterion, plus every other criterion the answer gave evidence for. Omit the others entirely.
