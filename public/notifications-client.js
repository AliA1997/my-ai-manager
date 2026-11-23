/* see-plan notifications page: the reusable filter and pager over /api/data/notifications, and the deletion-rule
   settings form. textContent only. */
(function () {
  "use strict";

  var PAGE = 25;
  var KIND_TITLES = { error: "New error", deleted: "Deleted", "pending-download": "Waiting for download", size: "Size warning" };
  var statusEl = document.getElementById("status");
  var listEl = document.getElementById("list");
  var pendingEl = document.getElementById("pending");
  var state = { q: "", filter: "", page: 1 };
  var seq = 0;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function getJson(url, init) {
    return fetch(url, init).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error((body && body.error && body.error.message) || "HTTP " + res.status);
        return body;
      });
    });
  }

  var filter = window.SeePlanFilter.create({
    mount: document.getElementById("list").parentNode,
    label: "Search and filter notifications",
    selectLabel: "Type",
    options: Object.keys(KIND_TITLES).map(function (k) { return { value: k, label: KIND_TITLES[k] }; }),
    onChange: function (v) { state.q = v.q; state.filter = v.filter; state.page = 1; load(); },
  });
  var section = listEl.parentNode;
  section.insertBefore(filter.el, pendingEl);
  var pager = window.SeePlanPager.create({ mount: section, label: "Notification pages", onPage: function (n) { state.page = n; load(); } });

  function render(body) {
    listEl.textContent = "";
    pendingEl.hidden = true;
    if (!body.items.length) {
      listEl.appendChild(el("p", "empty", state.q || state.filter ? "No notifications match." : "No notifications yet."));
    } else {
      var ul = el("ul", "notifications");
      body.items.forEach(function (n) {
        var li = el("li", "notification" + (n.read ? "" : " unread"));
        li.appendChild(el("strong", "", n.title));
        li.appendChild(el("span", "kind", " " + (KIND_TITLES[n.kind] || n.kind)));
        li.appendChild(el("p", "", n.message));
        li.appendChild(el("time", "", n.at ? new Date(n.at).toLocaleString() : ""));
        if (n.kind === "pending-download" && n.domain) {
          var a = el("a", "", "Download " + n.domain + " and delete them");
          a.href = "/api/data/" + encodeURIComponent(n.domain) + "/export";
          li.appendChild(document.createTextNode(" "));
          li.appendChild(a);
        }
        if (!n.read) {
          var b = el("button", "", "Mark as read");
          b.type = "button";
          b.addEventListener("click", function () {
            getJson("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id }) })
              .then(load)
              .catch(function (e) { statusEl.textContent = e.message; });
          });
          li.appendChild(document.createTextNode(" "));
          li.appendChild(b);
        }
        ul.appendChild(li);
      });
      listEl.appendChild(ul);
    }
    filter.setOptions(Object.keys(KIND_TITLES).map(function (k) { return { value: k, label: KIND_TITLES[k] }; }), body.counts);
    pager.update({ page: body.page, pages: body.pages, total: body.total });
  }

  function load() {
    var mine = ++seq;
    var q = "?page=" + state.page + "&pageSize=" + PAGE + (state.q ? "&q=" + encodeURIComponent(state.q) : "") + (state.filter ? "&filter=" + encodeURIComponent(state.filter) : "");
    getJson("/api/data/notifications" + q)
      .then(function (body) { if (mine === seq) { statusEl.textContent = ""; render(body); } })
      .catch(function (e) { if (mine === seq) statusEl.textContent = "Could not load notifications: " + e.message; });
  }

  // ---- settings ----

  var typeEl = document.getElementById("ruleType");
  var thresholdEl = document.getElementById("ruleThreshold");
  var countEl = document.getElementById("ruleDeleteCount");
  var errEl = document.getElementById("settingsError");

  function syncCountField() {
    document.getElementById("deleteCountField").hidden = typeEl.value !== "delete-oldest";
  }
  typeEl.addEventListener("change", syncCountField);

  getJson("/api/data/config").then(function (body) {
    var rule = body.config.deletionRule;
    typeEl.value = rule.type;
    thresholdEl.value = rule.threshold;
    countEl.value = rule.deleteCount;
    document.getElementById("dataDir").textContent = body.dir;
    syncCountField();
  }).catch(function (e) { errEl.textContent = e.message; });

  document.getElementById("settingsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    errEl.textContent = "";
    var rule = { type: typeEl.value, threshold: Number(thresholdEl.value), deleteCount: Number(countEl.value) || undefined };
    getJson("/api/data/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deletionRule: rule }) })
      .then(function () { statusEl.textContent = "Settings saved."; })
      .catch(function (err) { errEl.textContent = err.message; });
  });

  load();
})();
