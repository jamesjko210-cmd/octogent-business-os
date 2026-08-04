# Research Triad Workflow

Use this when a research task should become a decision, business plan, or implementation backlog.

## Flow

1. **Perplexity Scout**
   - Find current web sources, market signals, competitor references, citations, and disagreement.
   - Output candidate sources, claims, gaps, and open questions.

2. **NotebookLM Source Room**
   - Add only the best selected sources, PDFs, transcripts, and docs.
   - Ask source-grounded questions, compare sources, and reject weak evidence.

3. **Notion Research Memory**
   - Store the final brief, source index, claims table, decisions, BMC notes, open questions, and Codex tasks.
   - Notion is the durable memory. NotebookLM is the source room, not the final archive.

4. **Claude Strategy**
   - Convert research into recommendation, tradeoffs, risks, and business/story implications.

5. **Codex Execution**
   - Convert the recommendation into small tasks with verification.

## Required Templates

- `research-triad-workflow`: complete workflow instructions.
- `notion-research-brief`: Notion-ready final brief structure.

## Provider Routing

- Live source/current market work: `perplexity`
- Curated source Q&A/comparison: `notebooklm`
- Final durable memory/tasks: `notion`
- Strategy/synthesis: `claude-code`
- Implementation/tests/docs: `codex`

Use logged-in apps, local CLIs, or wrapper commands for these providers. Do not request or use API keys for this workflow unless the operator explicitly overrides the no-API-keys policy.

## No-key Wrapper Commands

Point Octogent at these local launchers:

```bash
export OCTOGENT_PERPLEXITY_COMMAND="node scripts/perplexity-workflow.mjs"
export OCTOGENT_NOTEBOOKLM_COMMAND="node scripts/notebooklm-workflow.mjs"
export OCTOGENT_NOTION_COMMAND="node scripts/notion-workflow.mjs"
```

Dry-run them without opening browser windows:

```bash
OCTOGENT_WORKFLOW_DRY_RUN=1 node scripts/perplexity-workflow.mjs "game business market research"
OCTOGENT_WORKFLOW_DRY_RUN=1 node scripts/notebooklm-workflow.mjs "game business source review"
OCTOGENT_WORKFLOW_DRY_RUN=1 node scripts/notion-workflow.mjs "game business research brief"
```

## Completion Criteria

- Sources are current enough for the question.
- Claims trace back to a source.
- NotebookLM/source-room notes separate selected and rejected sources.
- Notion-ready brief contains decisions and executable tasks.
- Codex tasks have verification steps.
