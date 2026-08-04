# Research Triad Test: Simple Game With Business / Portfolio Potential

Status: Strategy Ready
Research Type: Market / Product / Strategy
Owner: James
Tags: research, triad, game-business, bmc, portfolio
Last Reviewed: 2026-05-14
Confidence: Medium

## Executive Brief

- Recommendation: start with a browser-first, simple social puzzle / micro-challenge game that can be played in under 2 minutes, shared easily, and expanded through weekly content.
- Why: teen gaming is broad and social, while PC/web discovery increasingly depends on creators, community, and external traffic rather than platform browsing alone.
- Product angle: avoid "generic casual game." The business is the game plus the proof system around it: devlogs, player feedback, analytics, experiments, and BMC updates.
- First MVP: one polished core loop, one shareable result screen, lightweight analytics, and a public development log.
- Main risk: the game will be ignored if it has no distinct hook, story, or repeatable reason to return.

## Perplexity Scout Stand-in

Since a live Perplexity CLI wrapper is not configured yet, this test used live web research as the scouting stage. Candidate source themes:

- Teen player behavior and social motivations.
- 2025 games market size and platform trends.
- PC / console discoverability and long-tail signals.
- Mobile market maturity and casual-game monetization constraints.

## Source Index

| Source | Publisher | Date | Why it matters | URL |
| --- | --- | --- | --- | --- |
| Teens and Video Games Today | Pew Research Center | 2024-05-09 | Shows teen gaming is common, social, and linked by teens to problem-solving/friendship benefits. | https://www.pewresearch.org/internet/2024/05/09/teens-and-video-games-today/ |
| 2025 Newzoo Free Global Games Market Report | Newzoo | 2025 | Gives 2025 global revenue, platform revenue, and mobile/PC/console context. | https://nzgda.com/wp-content/uploads/2025/10/2025_Newzoo_Free_Global_Games_Market_Report.pdf |
| Global games market outlook: key growth drivers and challenges for 2025-2027 | Newzoo | 2025-03-06 | Shows mobile maturity and modest player growth in mature markets; helps avoid naive mobile-only assumptions. | https://newzoo.com/resources/blog/global-games-market-update-q1-2025 |
| Into the data: PC & Console Gaming Report 2025 | Newzoo | 2025 | Shows discoverability pressure, low new-game playtime share, and importance of branding/community reach. | https://newzoo.com/resources/blog/into-the-data-pc-console-gaming-report-2025 |
| The PC and console games market in 2025: full year data reveal | Newzoo | 2026 | Shows 2025 engagement/revenue concentration and that PC is more receptive to new IP and AA-scale releases than console. | https://newzoo.com/resources/blog/the-pc-and-console-games-market-in-2025-full-year-performance-data |

## Claims Table

| Claim | Source(s) | Confidence | Implication |
| --- | --- | --- | --- |
| Teens are a reasonable early audience for a small game experiment because gaming is widespread and socially motivated. | Pew | High | Design for quick play, sharing, and social comparison rather than only solo progression. |
| The global games market is large, but attention is concentrated and discovery is difficult. | Newzoo 2025 report, Newzoo PC/Console 2025 | High | A small game needs a sharp hook and external story/devlog distribution. |
| Mobile is huge but mature, and mobile growth in mature markets is limited. | Newzoo Q1 2025, Newzoo 2025 report | Medium | Do not start with app-store complexity. Start web-first and mobile-friendly. |
| PC/browser-style experiments can still be useful because PC shows more tolerance for experimentation than console. | Newzoo full-year 2025 | Medium | Build a web/desktop-friendly prototype first, then decide if mobile app packaging is worth it. |
| A portfolio/business project should document process, not only ship a game. | Inference from discoverability + school/project goals | Medium | YouTube/devlog/Notion evidence becomes part of the business asset. |

## NotebookLM Source Room Notes

Selected sources to add to NotebookLM:

- Pew: Teens and Video Games Today
- Newzoo: 2025 Free Global Games Market Report PDF
- Newzoo: PC & Console Gaming Report 2025 article
- Newzoo: 2025 full-year PC/console data article
- Newzoo: Global games market outlook Q1 2025

Sources rejected for now:

- Random SEO summaries of the games market: too derivative.
- Wikipedia pages for casual/hypercasual games: useful for definitions, not strong enough for strategy.
- Reddit discussions: useful for sentiment, but not needed for the first decision.

Source-grounded answers:

- Best platform for first MVP: web-first, mobile-friendly browser game.
- Best positioning: simple game as a business/portfolio experiment, not "just a game."
- Best proof: analytics, user feedback, iteration logs, and BMC updates.

Conflicts between sources:

- Market size sources show opportunity, but PC/console behavior sources warn that attention is hard to capture.
- Mobile has the largest revenue pool, but mature-market growth and app-store friction make it a worse first step for a solo MVP.

## Decisions

| Decision | Rationale | Confidence | Owner |
| --- | --- | --- | --- |
| Start web-first instead of app-first. | Lower friction, easier sharing, easier testing, easier Codex deployment. | High | Codex |
| Target a 60-120 second core loop. | Fits lightweight play and rapid feedback. | Medium | Claude + Codex |
| Build a distinct hook before adding features. | Discoverability is the risk; features without positioning will not solve it. | High | Claude |
| Store research and BMC updates in Notion-ready briefs. | Makes the project legible as business planning, not just coding. | High | Notion |

## BMC / Strategy Notes

- Customer segments: students/teens, casual browser players, friends sharing short challenges, viewers following the devlog.
- Value proposition: quick, low-friction fun plus visible creator journey and iterative improvement.
- Channels: browser link, school/project demos, YouTube Shorts/devlogs, Discord/friend testing, Notion/portfolio page.
- Differentiation: not complexity; distinct hook, story, measurable iteration, and public build-in-progress proof.
- Revenue/sustainability: not first priority. Later options include sponsorship-style devlog, cosmetic/supporter page, or premium expanded version.
- Key risks: generic concept, weak retention, no distribution, overbuilding before validation.

## Open Questions

- [ ] What is the actual core hook: puzzle, reaction, rhythm, social challenge, or narrative micro-game?
- [ ] What feedback loop will prove people want to replay or share it?
- [ ] What analytics are acceptable and privacy-safe for the target audience?
- [ ] What is the first public devlog format?

## Codex Execution Tasks

- [ ] Create a `game-business` tentacle with this brief as initial context.
  - Owner/provider: Codex
  - Verification: tentacle appears in Deck and contains context/todo files.
  - Memory to capture: initial project direction.
- [ ] Create a one-page BMC draft from this brief.
  - Owner/provider: Claude Sonnet, stored by Notion workflow.
  - Verification: BMC has customer, value prop, channels, differentiation, risks, and next experiments.
  - Memory to capture: first business-model assumptions.
- [ ] Build a tiny browser-game MVP spec.
  - Owner/provider: Claude strategy, Codex implementation.
  - Verification: spec includes core loop, controls, win/loss, share/result screen, and analytics events.
  - Memory to capture: MVP scope and non-goals.
- [ ] Prototype the first playable loop.
  - Owner/provider: Codex
  - Verification: local browser test, mobile viewport test, basic smoke test.
  - Memory to capture: what worked, what felt boring, and what changed.
