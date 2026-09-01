# TAO — Personal Operating System

Local-first operational intelligence for a Nigerian university student / developer / entrepreneur.

> Every active project must have one clearly defined next physical action. TAO aggressively reduces ambiguity, context switching and unnecessary project proliferation.

**Live:** Netlify (auto-deploy from `main`)

## Core Modules
1. **Command Center** — daily state, priorities, blockers, next actions, time allocation
2. **Projects** — objectives, milestones, blockers, dependencies, mandatory next action
3. **Memory** — structured long-term memory (projects, decisions, goals, preferences, knowledge, people, business, academics, technology, ideas)
4. **Decision Journal** — assumptions, evidence, expected outcomes, confidence, outcomes
5. **Idea Vault** — capture & score (novelty/feasibility/impact/alignment) — scored, not auto-promoted (≥10/20 to promote)
6. **Developer Mode** — inspect local Git repos, commits, TODOs, recent changes (File System Access API)
7. **Study Mode** — courses, topics, weak areas, sessions, deadlines, revision priorities
8. **Business Mode** — opportunities, experiments, prospects, revenue, validation evidence
9. **Planning Engine** — recommends what to work on next given time/deadline/importance/effort/blockers
10. **Weekly Intelligence** — bottlenecks, wasted effort, unfinished projects, behavioral patterns

## Local-first
All data in `localStorage` (`tao.v1`). Export/Import JSON. No data leaves device unless you configure an AI provider.

## AI — swappable
Header selector: Mock (offline heuristic) | Grok (xAI) | OpenAI | Anthropic | Ollama (local). Add key/URL, TAO injects local memory into prompt.

## Keyboard-first
`?` help, `⌘K`/`/` palette, `G then C/P/M/D/I/V/S/B/W/E` nav, `N` new project, `A` ask TAO, `E` export.

## Dev
```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # dist/
npm run preview # http://localhost:4173
```
