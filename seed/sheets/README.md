# Sheet bootstrap CSVs

These three CSVs are the initial content for the Google Sheet that backs RISE
PoC scenarios. They are **bootstrap data**, not used at runtime — once Phase 2
is wired up, the backend reads scenarios/questions/rubrics directly from the
sheet on every request.

## Tabs

| Tab | File | Rows | Source |
|---|---|---|---|
| `scenarios` | `scenarios.csv` | 4 | PRD §7 + §8.1 |
| `questions` | `questions.csv` | 20 (5 per scenario) | Synthesised from `Form RISE SV (Responses).xlsx` |
| `rubrics` | `rubrics.csv` | 16 (4 per scenario, weights sum to 1.0) | Competency ratings + descriptions per scenario |

## Importing into the Google Sheet

In the target sheet:

1. **File → Import → Upload** → drag `scenarios.csv` → choose **Insert new sheet(s)** → Import.
2. Repeat for `questions.csv` and `rubrics.csv`.
3. Delete the empty default `Sheet1` tab.

The new tabs will be named after the file basenames (`scenarios`, `questions`,
`rubrics`) — those names are what the backend will look up.

## Reseeding

If a tab gets corrupted, re-import the corresponding CSV with **Replace current
sheet** instead of insert.
