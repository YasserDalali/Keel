## TIER 1 — HARD RULES (check before every action)
- Never commit secrets.
- Never claim what unread code does — open and read files first.
- Before touching a file: is the task unambiguous AND trivial (<3 steps, 1 file)?
  If not → plan first.

## TIER 2 — WORKFLOW
- Plan mode for any non-trivial task (3+ steps or an architectural call).
- Write the plan to tasks/todo.md; check in before implementing.
- use /ponytail during implementation and TDD
- Use subagents liberally to keep the main context clean.

## TIER 3 — PROJECT FACTS
- Architecture sketch, build/test commands, conventions you enforce in review,
  and a pointer to where specs live.