# Coding Standards for my AXI

Every rule has an ID (`FE-3`, `SEC-7`). Reviews, scripts and commit notes cite the ID, so keep IDs stable: add new rules at the end of a section and never renumber.

**Contents:** [How to read this](#how-to-read-this) · [Frontend](#frontend) · [Backend](#backend) · [Security](#security) · [Performance](#performance) · [Perceived performance](#perceived-performance) · [Accessibility](#accessibility) · [Developer experience](#developer-experience)

## How to read this

| Word | Meaning |
|---|---|
| **MUST** | A violation is a defect. Reviews block on it. |
| **SHOULD** | Follow it unless you can name a reason not to. |
| **MAY** | Allowed, never required. |

---

## Frontend

### Structure
- **FE-1** MUST use TanStack Router for routing.
- **FE-2** MUST keep all React code in `/src`.
- **FE-3** MUST put routes in `/src/routes`.
- **FE-4** MUST put components used across the app in `/src/components`.
- **FE-5** MUST keep configuration files in the base directory, beside `/src`.
- **FE-6** MUST keep unit tests in `/src/tests`.

### Features
- **FE-7** MUST split components by feature, where a feature is a domain. Sessions and Notifications are separate features.
- **FE-8** Errors, Notifications and Sessions are shared features that many others depend on. Import them. Do not re-create them.

### Components
- **FE-9** MUST write functional components, rendered on the server where possible.
- **FE-10** MUST NOT use `useEffect`. Load data in a loader, change data in an action, derive values during render.
- **FE-11** MUST give each route a `loader` (loads entities) and an `action` (updates entities).
- **FE-12** MUST memoize display components used throughout the app (`memo`).
- **FE-13** MUST keep code DRY: a second copy of logic becomes a shared helper.

### Styling
- **FE-14** MUST style with Tailwind CSS.
- **FE-15** MUST order classes: layout → spacing → typography → visual → states.

```html
<div class="flex items-center px-4 py-2 font-medium text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700">
```

---

## Backend

### Data
- **BE-1** Data is local to the machine. Nothing leaves it unless a rule in [Security](#security) allows it.
- **BE-2** Running the project MUST create a `/data` folder in the project.
- **BE-3** Store each domain as `<domain>/index.faiss`, `<domain>/docstore.sqlite` and `<domain>/manifest.json`.

### Code
- **BE-4** MUST load data with React Query and Node.
- **BE-5** MUST keep code DRY (same as FE-13).
- **BE-6** MUST put commonly used helper functions in `/helpers`.

---

## Security

Based on the OWASP Top 10. Each rule names its category.

| ID | Rule | OWASP |
|---|---|---|
| **SEC-1** | MUST check authorization on the server for every route and action. Hiding a button is not access control. Deny by default. | A01 Broken Access Control |
| **SEC-2** | MUST use platform crypto (`node:crypto`, TLS) with current algorithms. MUST NOT write your own. Generate tokens with `crypto.randomBytes` or `randomUUID`, never `Math.random`. | A02 Cryptographic Failures |
| **SEC-3** | MUST NOT build SQL, shell commands or file paths by joining strings with user input. Use parameterized queries, `execFile` with an argument array, and resolve-then-check-prefix for paths. | A03 Injection |
| **SEC-4** | MUST NOT put untrusted data into HTML as markup. No `innerHTML`, `dangerouslySetInnerHTML` or `document.write` with user data. Use `textContent`, or sanitize first. MUST NOT use `eval` or `new Function`. | A03 Injection (XSS) |
| **SEC-5** | SHOULD threat-model a new feature before building it: what is trusted, what is not, what is the worst misuse. | A04 Insecure Design |
| **SEC-6** | MUST bind local servers to `127.0.0.1`, set security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`) and keep debug output off in production. | A05 Security Misconfiguration |
| **SEC-7** | MUST pin dependency versions through the lockfile, run `npm audit` in CI, and justify each new dependency in the pull request. | A06 Vulnerable Components |
| **SEC-8** | MUST rate-limit and constant-time-compare credentials. MUST NOT put tokens in URLs. Session cookies are `HttpOnly`, `SameSite` and `Secure` when served over HTTPS. | A07 Authentication Failures |
| **SEC-9** | MUST verify the integrity of downloaded code and artifacts (checksums, pinned CI action SHAs). MUST NOT deserialize untrusted data into executable objects. | A08 Integrity Failures |
| **SEC-10** | MUST log security events (auth failures, denied access) and MUST redact secrets and tokens from every log. | A09 Logging Failures |
| **SEC-11** | MUST validate every URL a user supplies before the server fetches it. Allow-list hosts and block private ranges. | A10 SSRF |
| **SEC-12** | MUST NOT commit secrets. Read them from environment variables. Validate all input at the boundary: type, length, range, allowed characters. | A02 / A05 |

---

## Performance

- **PERF-1** MUST optimize image assets: modern formats (AVIF, WebP), responsive `srcset` and `sizes`, and explicit `width` and `height` so the layout does not shift.
- **PERF-2** MUST lazy-load below-the-fold images (`loading="lazy"`, `decoding="async"`). The main above-the-fold image loads eagerly with `fetchpriority="high"`.
- **PERF-3** MUST lazy-load routes and heavy components with `React.lazy` or route-level code splitting.
- **PERF-4** MUST memoize: `memo` for display components (FE-12), `useMemo` for expensive derived values, `useCallback` for handlers passed to memoized children. Measure before memoizing anything else.
- **PERF-5** MUST avoid unnecessary rerenders:
  - Keep state as close as possible to where it is used.
  - Never create objects, arrays or functions inline as props of memoized children.
  - Use stable `key`s, never the array index for reorderable lists.
  - Select the slice of state you need, not the whole store.
- **PERF-6** SHOULD virtualize lists over about 100 rows.
- **PERF-7** SHOULD preload critical fonts and set `font-display: swap`. Self-host fonts.
- **PERF-8** SHOULD keep each route bundle small. Review bundle size when adding a dependency.

## Perceived performance

- **UX-1** MUST show a skeleton screen shaped like the final content while a loader runs. A bare spinner is only for actions under one second.
- **UX-2** MUST prioritize content: render the main content first, defer secondary panels, stream or suspend slow sections.
- **UX-3** SHOULD use transitions of 150–300 ms for state changes, so changes feel connected. Animate only `transform` and `opacity`.
- **UX-4** MUST honor `prefers-reduced-motion`: turn off non-essential motion.
- **UX-5** SHOULD update the UI optimistically for actions that almost always succeed, and roll back with a visible error if one fails.
- **UX-6** SHOULD prefetch the next likely route on hover or focus.

---

## Accessibility

Target WCAG 2.2 level AA.

- **A11Y-1** MUST use semantic HTML first: `header`, `nav`, `main`, `section`, `article`, `footer`, `button`, `a`, `ul`, `label`. A clickable `div` is a defect.
- **A11Y-2** MUST apply ARIA only when no native element does the job. A wrong ARIA role is worse than none. Prefer `aria-label`, `aria-labelledby`, `aria-describedby`, `aria-live` and `aria-expanded` on native elements.
- **A11Y-3** MUST give every image an `alt` (empty `alt=""` when decorative) and every icon-only button an accessible name.
- **A11Y-4** MUST make everything operable by keyboard: visible focus style (never `outline: none` without a replacement), logical tab order, no keyboard traps. Manage focus on route change and when a dialog opens or closes.
- **A11Y-5** MUST pair every form control with a `label`. Show errors as text, link them with `aria-describedby`, and do not rely on color alone.
- **A11Y-6** MUST meet contrast: 4.5:1 for body text, 3:1 for large text and UI components.
- **A11Y-7** MUST give links meaningful text. No "click here". A link that opens a new tab uses `rel="noopener noreferrer"`.
- **A11Y-8** MUST announce dynamic changes (toasts, loading, errors) through a live region.
- **A11Y-9** SHOULD use one `h1` per page and a heading order that does not skip levels.
- **A11Y-10** SHOULD size touch targets at least 24×24 CSS px.

---

## Developer experience

### Folder structure
- **DX-1** MUST keep the structure from [Frontend](#frontend) and [Backend](#backend). A new top-level folder needs a line in the README.
- **DX-2** SHOULD name folders and files in `kebab-case`, components in `PascalCase`, and keep a feature's files together.

### Consistent standards
- **DX-3** MUST use TypeScript with `strict` on. No `any` and no `@ts-ignore` without a comment saying why.
- **DX-4** MUST pass ESLint with zero warnings. Rules that can be automated belong in the ESLint config, not in this file.
- **DX-5** MUST format with Prettier. Never hand-format and never debate style in review.
- **DX-6** MUST run lint, format check, type check and tests on every pull request, and as a pre-commit hook for changed files.

### Automated documentation
- **DX-7** MUST write TSDoc on exported functions and components. Generate API docs from it (TypeDoc) instead of writing them by hand.
- **DX-8** MUST generate the changelog from conventional commit messages (`feat:`, `fix:`, `chore:`).
- **DX-9** SHOULD generate route and component indexes by script, so docs cannot drift from code.

### Why this matters
TypeScript catches wrong types before they run. ESLint catches wrong patterns. Prettier removes style arguments. Together they make a new developer productive without a tour of the code.
