You are running Octogent's Research Triad workflow for **{{researchTopic}}**.

## Goal

Produce a decision-ready research package, not a pile of links.

## Stage 1 — Perplexity Scout

Use Perplexity for live, current-source scouting.

Required output:

- 8-12 candidate sources with titles, URLs, dates when available, and why each source matters.
- 5-8 key claims, each tied to at least one source.
- Gaps, conflicts, and questions that need source-grounded follow-up.

## Stage 2 — NotebookLM Source Room

Move only the best sources into NotebookLM or the configured NotebookLM workflow.

Required output:

- A curated source set with rejected-source notes.
- Source-grounded answers to the open questions from Stage 1.
- A short comparison of what the selected sources agree and disagree on.

## Stage 3 — Notion Research Memory

Store the final research package in Notion or the configured Notion workflow.

Required output:

- Executive brief.
- Source index.
- Claims table.
- Decisions and confidence.
- Open questions.
- Next tasks for Claude strategy and Codex execution.

## Stage 4 — Claude Strategy

Use Claude Sonnet for synthesis and Claude Opus only if the tradeoff is unusually complex.

Required output:

- Recommendation.
- Risks and counterarguments.
- Business Model Canvas implications when relevant.
- What should be built, tested, or measured next.

## Stage 5 — Codex Tasks

Convert the recommendation into concrete Octogent todos.

Required output:

- Small executable tasks.
- Owner/provider for each task.
- Verification method.
- What to store back into memory after completion.

## Guardrails

- No API keys by default. Use logged-in apps, local CLIs, browser workflows, connectors, or LM Studio instead of paid API-key workflows.
- Do not treat Perplexity results as final until the best sources are reviewed in NotebookLM.
- Do not leave research trapped in NotebookLM; final briefs and decisions must land in Notion.
- Do not ask Codex to execute until the research package has a clear recommendation and testable tasks.
