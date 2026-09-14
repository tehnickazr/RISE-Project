SCENARIO: {{scenarioTitle}}

INTERVIEW ({{answeredCount}} questions answered):
{{answersBlock}}

Base your judgement on the evidence above, not on your own impression of the
trade. Where key points are given, an answer that omitted them was incomplete
even if it reads well. Look for patterns that repeat across several answers —
those matter more to the candidate than any single question.

Return JSON with this exact shape:
{
  "overall_score": <0-5 average>,
  "strengths": "<3-4 sentences in {{languageName}} reinforcing what went well>",
  "improvements": "<3-4 sentences in {{languageName}}, concrete and prioritised>",
  "encouragement": "<one short closing line in {{languageName}}>"
}
