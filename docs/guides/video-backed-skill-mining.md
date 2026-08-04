# Video-backed Skill Mining

Use this workflow when the operator provides videos, reels, or a Google Doc full of video links as source material for new agent skills.

## Reviewed Seeds

The first pass reviewed representative videos from the operator's labeled Doc sections:

- Claude skills: `https://www.instagram.com/reel/DYAnUJCpCep/`
- Agent team flows: `https://www.instagram.com/reel/DX9Zh5WzXof/`
- UI/UX: `https://www.instagram.com/reel/DX_q_jqoLWN/`
- Strict advisor: `https://www.instagram.com/reel/DXPjubKkyDI/`
- Business automation: `https://www.instagram.com/reel/DXR8IAlicVQ/`

These are treated as inspiration evidence, not unquestioned authority. Only repeatable patterns become Octogent behavior.

## Extraction Template

For each video, create a skill candidate with:

- `source`: URL and local report path
- `visible_evidence`: on-screen text, captions, workflow screenshots, tool names
- `core_idea`: one sentence
- `repeatable_workflow`: concrete steps an agent can follow
- `target_agent`: Codex, Claude Sonnet, Claude Opus, Gemini, Perplexity, NotebookLM, Qwen, Notion, or Stitch
- `implementation_type`: autonomous skill, prompt template, routing rule, Notion template, UI workflow, or test
- `confidence`: high, medium, or low
- `verification`: how Octogent proves the skill works

## First Implemented Patterns

- `Video-backed Skill Mining`: turns videos into skill candidates before implementation.
- `Parallel Codebase Recon`: runs scoped scout agents before major repo changes.
- `Multi-perspective Review Council`: uses strict advisor and peer-review passes for important decisions.
- `UI/UX Production System`: converts design inspiration into concrete visual direction, implementation, and browser proof.
- `Business Automation Operator`: converts repeated operations into small, logged, human-approved workflows.
- `Browser Control Harness`: keeps browser agents inside a state-action-verify loop.
- `Persistent Second Brain`: turns Notion/local memory into a compounding project vault.
- `Content Production Pipeline`: turns real project proof into devlogs, scripts, demos, and marketing assets.

## Full-document Implementation Pass

After reviewing the full Doc's labeled themes, Octogent also promotes these recurring patterns into always-on autonomous skills:

- `Prompt Operating System`: stores useful prompts as versioned, tested operating assets.
- `Cross-model Collaboration`: routes Claude, Codex, Gemini, Perplexity, NotebookLM, Qwen, Notion, and Stitch through explicit handoff contracts.
- `RAG Research System`: uses the research triad: Perplexity as the live-source scout, NotebookLM as the curated source-grounded research room, and Notion as durable memory/action tracking.
- `Token Budget Control`: protects model limits through routing, context compression, and cheaper background workers.
- `Local/Free Model Lab`: evaluates local, free, or low-cost models before adding them to swarms.
- `Developer Tool Interop`: keeps IDEs, coding agents, GitHub, browser tools, and local CLIs auditable.
- `Brand Voice & Persona`: preserves the operator's taste, strict advisor modes, and public-facing voice.
- `Motion & Web Experience`: treats scroll, motion, and reference sites as deliberate product experience tools.
- `Startup Business Story`: frames the game as a business experiment with BMC-style customer/value proof.
- `Agentic OS Architecture`: keeps Octogent goal-driven with policies, memory, skills, tools, swarms, logs, and verification.

## Agent Assignment

- Codex executes code changes, tests, browser verification, and deployment checks.
- Claude Sonnet chairs planning, synthesis, review, and business operations.
- Claude Opus is reserved for complex escalations.
- Gemini Pro/Flash handles Google-family, multimodal, long-context, and fast bulk processing.
- Perplexity handles current-source scouting, competitor scans, and citation-heavy research.
- NotebookLM holds selected sources, PDFs, transcripts, and links for source-grounded comparison, Q&A, and synthesis.
- Notion stores final research briefs, source indexes, decisions, BMC notes, tasks, and reusable project memory.
- Qwen through LM Studio handles local background drafting, tagging, and summarization.
- Notion stores extracted skill candidates, decisions, BMC docs, and operating logs.
- Stitch produces UI/UX concepts before Codex implements.

## Rule

Do not implement a video because it looks impressive. Implement only when it exposes a repeatable behavior that can be assigned, tested, and reused.
