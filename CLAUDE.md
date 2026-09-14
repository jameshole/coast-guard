# CLAUDE.md

## Commit conventions

- Write a single-line commit message using `-m "message"` directly — no multi-line messages, no HEREDOC.
- Use conventional commit structure (e.g. `feat: ...`, `fix: ...`, `chore: ...`).
- Do not include Co-Authored-By or any Claude co-author lines.
- NEVER amend a previous commit — always create a new commit.
- Only commit; do NOT push unless explicitly asked.
- Committing is single-use per request: after completing a commit, wait for an explicit new request before committing again, even if more changes accumulate.
