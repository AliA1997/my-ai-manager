/* Reusable filter + pagination for see-plan list pages. textContent only (SEC-4), no frameworks.
 *
 *   SeePlanFilter.create({ mount, label, selectLabel, options: [{ value, label }], onChange({ q, filter }) })
 *     A search box (matched against the local vector index by the server) and a select whose options depend on
 *     the page: the errors page passes severities, the notifications page passes notification kinds.
 *   SeePlanPager.create({ mount, onPage(page) })  then  pager.update({ page, pages, total, pageSize })
 *     Previous / Next with a "Page n of m" label that screen readers hear (aria-live).
 */
(function () {
  "use strict";

  var DEBOUNCE_MS = 300;
  var uid = 0;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function labelled(id, text, control) {
    var wrap = el("div", "field");
    var label = el("label", "", text);
    label.setAttribute("for", id);
    wrap.appendChild(label);
    wrap.appendChild(control);
    return wrap;
  }

  function create(opts) {
    var n = ++uid;
    var form = el("form", "data-filter");
    form.setAttribute("role", "search");
    form.setAttribute("aria-label", opts.label || "Search and filter");
    var search = el("input");
    search.type = "search";
    search.id = "dfq" + n;
    search.maxLength = 500;
    search.autocomplete = "off";
    search.placeholder = "Describe what to look for";
    var select = el("select");
    select.id = "dfs" + n;
    form.appendChild(labelled(search.id, "Search", search));
    form.appendChild(labelled(select.id, opts.selectLabel || "Filter", select));
    var timer = null;

    function value() {
      return { q: search.value.trim(), filter: select.value };
    }
    function fire() {
      clearTimeout(timer);
      if (opts.onChange) opts.onChange(value());
    }
    /** Replaces the select's options; `counts` (value -> number) are shown in brackets. Keeps the choice. */
    function setOptions(list, counts) {
      var keep = select.value;
      select.textContent = "";
      var all = el("option", "", "All");
      all.value = "";
      select.appendChild(all);
      (list || []).forEach(function (o) {
        var option = el("option", "", o.label + (counts && counts[o.value] !== undefined ? " (" + counts[o.value] + ")" : ""));
        option.value = o.value;
        select.appendChild(option);
      });
      select.value = keep;
    }
    setOptions(opts.options || []);
    search.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(fire, DEBOUNCE_MS);
    });
    select.addEventListener("change", fire);
    form.addEventListener("submit", function (e) { e.preventDefault(); fire(); });
    if (opts.mount) opts.mount.appendChild(form);
    return { el: form, value: value, setOptions: setOptions };
  }

  function createPager(opts) {
    var nav = el("nav", "data-pager");
    nav.setAttribute("aria-label", opts.label || "Pagination");
    var prev = el("button", "", "Previous");
    var next = el("button", "", "Next");
    prev.type = next.type = "button";
    var status = el("span", "data-pager-status");
    status.setAttribute("aria-live", "polite");
    nav.appendChild(prev);
    nav.appendChild(status);
    nav.appendChild(next);
    var current = { page: 1, pages: 1 };
    prev.addEventListener("click", function () { if (current.page > 1) opts.onPage(current.page - 1); });
    next.addEventListener("click", function () { if (current.page < current.pages) opts.onPage(current.page + 1); });
    function update(info) {
      current = { page: info.page || 1, pages: info.pages || 1 };
      prev.disabled = current.page <= 1;
      next.disabled = current.page >= current.pages;
      status.textContent = "Page " + current.page + " of " + current.pages + (typeof info.total === "number" ? " · " + info.total + " in total" : "");
      nav.hidden = current.pages <= 1;
    }
    update({ page: 1, pages: 1 });
    if (opts.mount) opts.mount.appendChild(nav);
    return { el: nav, update: update };
  }

  window.SeePlanFilter = { create: create };
  window.SeePlanPager = { create: createPager };
})();
