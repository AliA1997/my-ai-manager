---
name: implement-code
description: Implement code from requirements, a grilling session, a plan file or a plain prompt, following the rules in docs/conventions/STANDARDS.md. Use whenever the user asks to build, add, implement, write, scaffold or fix a feature, route, component, helper or endpoint in this project, even if they never name a skill. Finds code with /jev:jev, copies boilerplates from assets/ and runs the scripts/ so few tokens are spent. Not for executing a finished plan task by task (use piv-implement), reviewing code (use review-code), writing or grilling a plan (use interrogate-plan), or looping a whole plan to green (use piv-loop).
---

# implement-code

Build what was asked, to the project standards, at the lowest token cost.

## Rules that prevent damage

1. Never overwrite a file. `scaffold.mjs` refuses (exit 1); open the existing file and edit it.
2. Never commit, push, publish or install a dependency unless the user asked for that action.
3. Never read all of `docs/conventions/STANDARDS.md`. Print the rules you need with `digest.mjs` (step 2).
4. Never use `useEffect` (FE-10) or put untrusted data into HTML as markup (SEC-4).
5. Stop after 3 failed attempts at the same failure, and change the approach or the input on each attempt. Report what blocks you and what you tried.

## Which tool finds code

Default to `Grep`. Reach for `/jev:jev` when the name is the unknown: it reads the files for you at about 1/120 of the cost.

| Situation | Use |
|---|---|
| Exact symbol or path known | `Grep` or `Read` |
| Behavior known, name unknown | `/jev:jev` → `jev find "<what it does>" <dir>` |
| A property across 3+ files | `jev ask "<yes/no question>" <dir> -q` |
| A located file must be edited | `Read` with `offset` and `limit` on the cited lines only |
| jev missing, or `no match` | Two `Grep` tries, then say it is not in the tree |

Pass the smallest directory that holds the feature (for example `src/` or `public/`, never the repo root). Scores of 0.9 and above: act. 0.6 to 0.9: read the cited lines first.

## Steps

1. **Capture the task.** Read the requirement (prompt, grilling notes or plan file). Resume from `.claude/implement-code.progress.md` if it exists, otherwise write 3 to 7 checkbox tasks into it. Read `references/lessons.md` (15 lines at most).
2. **Load only the rules you need.**
   `node .claude/skills/implement-code/scripts/digest.mjs <prefixes>`
   UI work: `FE PERF UX A11Y SEC`. Server work: `BE SEC DX`. Mixed: both.
3. **Locate** the code to change or mimic, using the table above.
4. **Start from a boilerplate**, never from a blank file:
   `node .claude/skills/implement-code/scripts/scaffold.mjs <route|component|skeleton|test|helper> <Name> --feature <feature>`
   Boilerplates, one per kind: `assets/route.tsx.tmpl`, `assets/component.tsx.tmpl`, `assets/skeleton.tsx.tmpl`, `assets/test.tsx.tmpl`, `assets/helper.ts.tmpl`. Replace each placeholder sentence and the real data shapes. A new route also gets a skeleton and a test.
5. **Implement task by task.** Tick each box in the progress file when its task is done. That file is your memory: after a long session or a compaction, resume from it, not from conversation history.
6. **Verify** before reporting:
   - `node .claude/skills/review-code/scripts/scan.mjs` must exit 0, or every finding is justified in the progress file.
   - `npm test` must exit 0.
7. **Report** in this exact shape:

```
implement-code: DONE | BLOCKED
files: <created and changed, one per line>
checks: scan exit <n>, tests exit <n>
open: <anything left, or "none">
```

## Existing code that is not React

This repo's current code is plain JavaScript (`src/*.js`, `public/*.js`, `node --test`). When you edit those files, keep their style and tests and apply the rules that fit (SEC, A11Y, DX). Do not migrate them to React or TypeScript unless the user asks.

## When the user corrects you

Add one line to `references/lessons.md`: `- <rule or file>: <what to do instead> (<YYYY-MM-DD>)`. A lesson repeated twice moves into this file as a rule, and the oldest line is deleted when the file passes 15 lines.

## Before you finish

- [ ] No file overwritten, nothing committed, pushed or installed unasked
- [ ] No `useEffect`, no untrusted HTML (scan exit 0 or justified)
- [ ] Progress file ticked and `npm test` exit 0
- [ ] Report is in the exact shape above
