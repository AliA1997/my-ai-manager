import { escapeHtml } from "./markdown.js";

/** The /notifications page: notifications with the reusable filter and pager, plus the deletion-rule settings. */
export function createNotificationsHtml({ baseUrl } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Notifications</title>
<link rel="stylesheet" href="/errors.css">
</head>
<body data-base-url="${escapeHtml(baseUrl ?? "")}">
<header id="top">
  <div>
    <p class="eyebrow">see-plan</p>
    <h1>Notifications</h1>
  </div>
  <nav aria-label="Pages"><a href="/">Dashboard</a> <a href="/errors">Error logs</a> <form class="signout" method="post" action="/api/auth/signout"><button type="submit">Sign out</button></form></nav>
</header>
<p id="status" role="status" aria-live="polite"></p>
<main>
  <section aria-labelledby="listTitle">
    <h2 id="listTitle" class="visually-hidden">Notification list</h2>
    <div id="pending" role="region" aria-label="Downloads waiting" hidden></div>
    <div id="list"></div>
  </section>
  <section aria-labelledby="settingsTitle" class="settings">
    <h2 id="settingsTitle">Data settings</h2>
    <p class="hint">Data lives in <code id="dataDir"></code>. These settings are read from <code>config.json</code> there.</p>
    <form id="settingsForm">
      <div class="field">
        <label for="ruleType">When a data set reaches the threshold</label>
        <select id="ruleType">
          <option value="download-then-delete">Wait for a download, then delete</option>
          <option value="delete-oldest">Delete the oldest records, no download</option>
          <option value="notify-only">Delete nothing, only notify me</option>
        </select>
      </div>
      <div class="field">
        <label for="ruleThreshold">Threshold (records)</label>
        <input id="ruleThreshold" type="number" min="1" max="10000000" step="1" required>
      </div>
      <div class="field" id="deleteCountField">
        <label for="ruleDeleteCount">Delete this many at a time</label>
        <input id="ruleDeleteCount" type="number" min="1" step="1">
      </div>
      <p id="settingsError" class="error" role="alert"></p>
      <button type="submit" class="primary">Save settings</button>
    </form>
  </section>
</main>
<script src="/data-filter.js"></script>
<script src="/notifications-client.js"></script>
</body>
</html>
`;
}
