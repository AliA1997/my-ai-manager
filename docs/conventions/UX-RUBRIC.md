# UX Validation Rubric

Use this rubric to check that a change keeps the app usable, matches the design canvas ("My AI Manager Desktop", design system **Lavish Axi**) and follows [STANDARDS.md](STANDARDS.md).

## How to score

- Every indicator scores **1** (true) or **0** (false). There is no partial credit.
- If an indicator cannot be checked for this change (for example, the change adds no form), score it **1** and write `n/a` in the notes.
- **Score = points ÷ 30 × 100.**
- **PASS needs more than 90%, so at least 28 of 30 points.** 27 points (90.0%) fails.
- An indicator marked **(gate)** fails the whole rubric when it scores 0, whatever the total.
- `npm run test:ux` (installed Chrome, never a downloaded browser) checks UX-1, 2, 3, 4, 8, 11, 12, 13, 14, 16 and 17 on every page at 1440 and 390 px in light and dark mode. Run `npm run build:app` first.
- Cite the indicator ID (`UX-7`) and any STANDARDS rule ID in the review or commit note.

## A. Navigation and wayfinding

| ID | Indicator (1 = true) | Check | Rule |
|---|---|---|---|
| UX-1 | Every page shows the same nav bar: the gradient bar (plum `--grad-a` → rose `--grad-b` → amber `--grad-c`), the product name on the left, page links as pills. | `npm run test:ux` | FE-8, FE-13 |
| UX-2 | The current page's link is marked with `aria-current="page"` and looks different (filled pill). | `npm run test:ux` | A11Y-2 |
| UX-3 | The nav bar stays on screen when the page scrolls. | `npm run test:ux` | — |
| UX-4 | At 390 px wide the nav scrolls sideways or wraps; nothing is cut off and the page has no horizontal scroll. | `npm run test:ux` (1440 and 390 px) | — |
| UX-5 | Sign out is reachable from the nav on every signed-in page. | Open each page. | — |

## B. Visual design matches the canvas

| ID | Indicator (1 = true) | Check | Rule |
|---|---|---|---|
| UX-6 | Colours come from tokens (`var(--…)` or Tailwind theme classes), never a new hard-coded hex outside the token blocks. | `git diff` for `#[0-9a-f]{3,6}` outside `:root`. | FE-13 |
| UX-7 | Token values match `project/ds/lavish-axi/tokens.json` in both light and dark mode. | Compare `src/styles.css` and `public/*.css` `:root` blocks. | — |
| UX-8 | Dark mode works: switching the OS theme swaps every surface, text and border colour, and no text disappears. | `npm run test:ux` (light and dark) | — |
| UX-9 | Log entries use their role colour stripe and label: user, assistant, tool call, tool result, system, error. | Open a session log. | — |
| UX-10 | Severity badges use the five severity colours (high, medium, low, send to IT, unrated) with the text colour the tokens name. | Open Error logs. | — |
| UX-11 | Type follows the system: sans for UI, mono for file names, session ids and log bodies; body 14 px, log body 12.5 px. | `npm run test:ux` | — |
| UX-12 | Radii follow the tokens: 6 px inputs and buttons, 8 px log rows, 10 px cards and dialogs, pill nav links and badges. | `npm run test:ux` (nav pills); inspect the rest. | — |

## C. Accessibility

| ID | Indicator (1 = true) | Check | Rule |
|---|---|---|---|
| UX-13 **(gate)** | Text meets contrast: 4.5:1 body, 3:1 large text and UI parts, in light and dark mode, including white text on every gradient stop. | `npm run test:ux` (axe color-contrast) | A11Y-6 |
| UX-14 **(gate)** | Every action works by keyboard alone, with a visible focus ring and no keyboard trap. | `npm run test:ux` | A11Y-4 |
| UX-15 | Clickable things are real `<a>` or `<button>`; no clickable `div` or `span`. | Read the diff. | A11Y-1 |
| UX-16 | Every input and select has a label. | `npm run test:ux` (axe label) | A11Y-5 |
| UX-17 | Each page has exactly one `h1` and headings do not skip levels. | `npm run test:ux` | A11Y-9 |
| UX-18 | Touch targets are at least 24×24 px (nav links and buttons are 40 px tall). | Inspect. | A11Y-10 |
| UX-19 | Status is never shown by colour alone: badges and severities also carry a word. | Inspect. | A11Y-5 |
| UX-20 | Toasts, loading and errors are announced through a live region. | Read the diff. | A11Y-8 |

## D. Feedback and content

| ID | Indicator (1 = true) | Check | Rule |
|---|---|---|---|
| UX-21 | Empty lists show a sentence saying what goes there, not a blank area. | Open with no data. | — |
| UX-22 | Errors are shown as text that says what went wrong and what to do next. | Force a failure. | A11Y-5 |
| UX-23 | Labels use plain words and the same names everywhere (one name per page in nav, title and links). | Read the pages. | — |
| UX-24 | No lorem ipsum, placeholder numbers or invented data in shipped UI. | Read the diff. | — |

## E. Conventions and delivery

| ID | Indicator (1 = true) | Check | Rule |
|---|---|---|---|
| UX-25 **(gate)** | `npm test` passes. | Run it. | DX-6 |
| UX-26 | `npm run lint` passes with zero warnings. | Run it. | DX-4 |
| UX-27 | React UI is styled with Tailwind and classes follow layout → spacing → typography → visual → states. | Read the diff. | FE-14, FE-15 |
| UX-28 | Shared UI (nav, errors, notifications, sessions) is imported from `src/components`, not re-created. | Read the diff. | FE-4, FE-8 |
| UX-29 | No `useEffect`; data comes from a route loader and changes go through an action. | `grep useEffect` in the diff. | FE-10, FE-11 |
| UX-30 | The commit message is conventional (`feat:`, `fix:`, `chore:` …) and the changelog entry is added. | Read the commit. | DX-8 |

## Score sheet

```
Change: ____________________   Reviewer: ________   Date: __________
A  UX-1 _ UX-2 _ UX-3 _ UX-4 _ UX-5 _
B  UX-6 _ UX-7 _ UX-8 _ UX-9 _ UX-10 _ UX-11 _ UX-12 _
C  UX-13 _ UX-14 _ UX-15 _ UX-16 _ UX-17 _ UX-18 _ UX-19 _ UX-20 _
D  UX-21 _ UX-22 _ UX-23 _ UX-24 _
E  UX-25 _ UX-26 _ UX-27 _ UX-28 _ UX-29 _ UX-30 _
Points: __ / 30   Score: __ %   Gates (UX-13, UX-14, UX-25) all 1? Y / N
Result: PASS (≥ 28 points and every gate 1) / FAIL
Notes:
```
