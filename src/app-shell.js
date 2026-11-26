import { escapeHtml } from "./markdown.js";
import { readAsset } from "./assets.js";

/** The pages that are React routes (src/routes). The server answers each with the same small shell. */
export const APP_ROUTES = ["/", "/claude", "/errors", "/notifications", "/session/$key", "/help"];

/** The bundle is built by `npm run build:app` (scripts/build-app.js); until then a checkout has no React pages. */
export function appBuilt() {
  try {
    readAsset("app/main.js");
    return true;
  } catch {
    return false;
  }
}

/**
 * The HTML every React route is served with: an empty #root, the Tailwind stylesheet and the module bundle.
 * The page content is rendered by React in the browser, from the loaders in src/routes.
 * @param {{ baseUrl?: string, title?: string, errorLogFile?: string }} [options]
 */
export function createAppHtml({ baseUrl, title = "My AI Manager", errorLogFile } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/app/app.css">
<script type="module" src="/app/main.js"></script>
</head>
<body data-base-url="${escapeHtml(baseUrl ?? "")}" data-error-log="${escapeHtml(errorLogFile ?? "")}">
<div id="root"></div>
<noscript><p>My AI Manager needs JavaScript for this page.</p></noscript>
</body>
</html>
`;
}

export const APP_BUILD_HINT = "The My AI Manager pages are not built yet. Run `npm run build:app` in the see-plan folder, then reload.";
