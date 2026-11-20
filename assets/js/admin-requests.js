(function () {
  var gate = document.getElementById("gate");
  var gateForm = document.getElementById("gate-form");
  var codeInput = document.getElementById("admin-code");
  var gateErr = document.getElementById("gate-err");
  var app = document.getElementById("queue");
  var list = document.getElementById("request-list");
  var empty = document.getElementById("request-empty");
  var summary = document.getElementById("request-summary");
  var signOut = document.getElementById("sign-out");
  var statusFilters = document.getElementById("status-filters");
  var typeFilters = document.getElementById("type-filters");
  var storageKey = "hatch_site_admin";
  var requests = [];
  var statusFilter = "all";
  var typeFilter = "all";
  var code = "";

  function showGateError(message) {
    if (!gateErr) return;
    gateErr.textContent = message || "";
    gateErr.classList.toggle("is-shown", Boolean(message));
  }

  function authHeaders() {
    return {
      Accept: "application/json",
      Authorization: "Bearer " + code
    };
  }

  function inviteText(record) {
    var invite = record.assignedCode || "(assign a code before sending)";
    return [
      "To: " + record.email,
      "Subject: Your Hatch OS beta invite",
      "",
      "Hi " + record.name + ",",
      "",
      "Your Hatch OS beta access is approved.",
      "",
      "Open: https://hatch-os-beta.vercel.app",
      "Invite code: " + invite,
      "",
      "We review each beta request personally. This invite is for you."
    ].join("\n");
  }

  function when(iso) {
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso || "";
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function filtered() {
    return requests.filter(function (record) {
      if (statusFilter !== "all" && record.status !== statusFilter) return false;
      if (typeFilter !== "all" && record.requestType !== typeFilter) return false;
      return true;
    });
  }

  function field(label, value) {
    var wrap = document.createElement("div");
    var k = document.createElement("div");
    k.className = "kicker";
    k.textContent = label;
    var v = document.createElement("div");
    v.textContent = value || "—";
    wrap.appendChild(k);
    wrap.appendChild(v);
    return wrap;
  }

  function render() {
    if (!list) return;
    list.replaceChildren();
    var rows = filtered();
    if (summary) {
      summary.textContent = rows.length + (rows.length === 1 ? " request" : " requests");
    }
    if (empty) empty.hidden = rows.length !== 0;
    rows.forEach(function (record) {
      var card = document.createElement("article");
      card.className = "req-card";

      var head = document.createElement("div");
      head.className = "req-head";
      var who = document.createElement("div");
      var title = document.createElement("h2");
      title.textContent = record.name || "Untitled";
      var meta = document.createElement("p");
      meta.className = "muted";
      meta.textContent = [record.firm, record.role].filter(Boolean).join(" · ");
      who.appendChild(title);
      who.appendChild(meta);
      var badges = document.createElement("div");
      badges.className = "req-badges";
      var typeBadge = document.createElement("span");
      typeBadge.className = "badge";
      typeBadge.textContent = record.requestType === "beta" ? "Beta" : "Inquiry";
      var statusBadge = document.createElement("span");
      statusBadge.className = "badge badge-" + (record.status || "pending");
      statusBadge.textContent = record.status || "pending";
      badges.appendChild(typeBadge);
      badges.appendChild(statusBadge);
      head.appendChild(who);
      head.appendChild(badges);
      card.appendChild(head);

      var grid = document.createElement("div");
      grid.className = "req-grid";
      grid.appendChild(field("Work email", record.email));
      grid.appendChild(field("Firm size", record.firmSize));
      grid.appendChild(field("Received", when(record.createdAt)));
      grid.appendChild(field("Invite code", record.assignedCode));
      card.appendChild(grid);

      if (record.notes) {
        var notes = document.createElement("p");
        notes.className = "req-notes";
        notes.textContent = record.notes;
        card.appendChild(notes);
      }

      var fine = document.createElement("p");
      fine.className = "fine";
      var bits = [];
      if (record.userAgent) bits.push(record.userAgent);
      if (record.referer) bits.push(record.referer);
      fine.textContent = bits.join(" · ");
      if (bits.length) card.appendChild(fine);

      var actions = document.createElement("div");
      actions.className = "req-actions";
      var codeField = document.createElement("input");
      codeField.type = "text";
      codeField.inputMode = "text";
      codeField.autocomplete = "off";
      codeField.spellcheck = false;
      codeField.maxLength = 20;
      codeField.placeholder = "HATCH-XXXX";
      codeField.value = record.assignedCode || "";
      codeField.setAttribute("aria-label", "Invite code for " + (record.name || "request"));

      var approve = document.createElement("button");
      approve.type = "button";
      approve.className = "btn btn-dark btn-small";
      approve.textContent = "Approve";
      var decline = document.createElement("button");
      decline.type = "button";
      decline.className = "btn btn-outline btn-small";
      decline.textContent = "Decline";
      var copy = document.createElement("button");
      copy.type = "button";
      copy.className = "btn btn-outline btn-small";
      copy.textContent = "Copy email + invite";
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-outline btn-small";
      remove.textContent = "Remove";
      var note = document.createElement("p");
      note.className = "form-err";
      note.setAttribute("role", "alert");

      function fail(message) {
        note.textContent = message;
        note.classList.add("is-shown");
      }

      function patch(status) {
        note.classList.remove("is-shown");
        var assigned = codeField.value.trim();
        approve.disabled = true;
        decline.disabled = true;
        fetch("/api/admin/requests/", {
          method: "PATCH",
          headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
          body: JSON.stringify({
            id: record.id,
            status: status,
            assignedCode: status === "approved" ? assigned : null
          })
        })
          .then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (body) {
              if (response.status === 401) {
                lockOut(body.error || "That code is not valid.");
                return;
              }
              if (!response.ok || !body.request) {
                fail(body.error || "Could not update this request.");
                return;
              }
              replaceRecord(body.request);
            });
          })
          .catch(function () { fail("Could not update this request."); })
          .then(function () {
            approve.disabled = false;
            decline.disabled = false;
          });
      }

      approve.addEventListener("click", function () { patch("approved"); });
      decline.addEventListener("click", function () { patch("declined"); });
      copy.addEventListener("click", function () {
        var text = inviteText(Object.assign({}, record, { assignedCode: codeField.value.trim() || record.assignedCode }));
        var done = function () {
          copy.textContent = "Copied";
          window.setTimeout(function () { copy.textContent = "Copy email + invite"; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done, fail); });
        } else {
          fallbackCopy(text, done, fail);
        }
      });
      remove.addEventListener("click", function () {
        if (!window.confirm("Remove this request from the queue?")) return;
        remove.disabled = true;
        fetch("/api/admin/requests/", {
          method: "DELETE",
          headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
          body: JSON.stringify({ id: record.id })
        })
          .then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (body) {
              if (response.status === 401) {
                lockOut(body.error || "That code is not valid.");
                return;
              }
              if (!response.ok) {
                fail(body.error || "Could not remove this request.");
                remove.disabled = false;
                return;
              }
              requests = requests.filter(function (item) { return item.id !== record.id; });
              render();
            });
          })
          .catch(function () {
            fail("Could not remove this request.");
            remove.disabled = false;
          });
      });

      actions.appendChild(codeField);
      actions.appendChild(approve);
      actions.appendChild(decline);
      actions.appendChild(copy);
      actions.appendChild(remove);
      card.appendChild(actions);
      card.appendChild(note);
      list.appendChild(card);
    });
  }

  function fallbackCopy(text, done, fail) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      done();
    } catch (copyErr) {
      fail("Could not copy. Select the email and code manually.");
    }
    area.remove();
  }

  function replaceRecord(next) {
    requests = requests.map(function (item) { return item.id === next.id ? next : item; });
    render();
  }

  function lockOut(message) {
    code = "";
    try { sessionStorage.removeItem(storageKey); } catch (storageErr) { /* ignore */ }
    requests = [];
    if (app) app.hidden = true;
    if (gate) gate.hidden = false;
    showGateError(message);
  }

  function load() {
    showGateError("");
    return fetch("/api/admin/requests/", { headers: authHeaders() })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          if (response.status === 401 || response.status === 503) {
            lockOut(body.error || "That code is not valid.");
            return;
          }
          if (!response.ok || !Array.isArray(body.requests)) {
            showGateError(body.error || "The request queue could not be reached.");
            return;
          }
          requests = body.requests;
          if (gate) gate.hidden = true;
          if (app) app.hidden = false;
          render();
        });
      })
      .catch(function () {
        showGateError("The request queue could not be reached.");
      });
  }

  function setPressed(group, value, attr) {
    if (!group) return;
    group.querySelectorAll("button").forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute(attr) === value ? "true" : "false");
    });
  }

  if (statusFilters) {
    statusFilters.addEventListener("click", function (event) {
      var button = event.target.closest ? event.target.closest("button") : null;
      if (!button) return;
      statusFilter = button.getAttribute("data-status") || "all";
      setPressed(statusFilters, statusFilter, "data-status");
      render();
    });
  }
  if (typeFilters) {
    typeFilters.addEventListener("click", function (event) {
      var button = event.target.closest ? event.target.closest("button") : null;
      if (!button) return;
      typeFilter = button.getAttribute("data-type") || "all";
      setPressed(typeFilters, typeFilter, "data-type");
      render();
    });
  }

  if (gateForm) {
    gateForm.addEventListener("submit", function (event) {
      event.preventDefault();
      code = (codeInput && codeInput.value || "").trim();
      if (!code) {
        showGateError("Enter the admin code.");
        return;
      }
      try { sessionStorage.setItem(storageKey, code); } catch (storageErr) { /* private mode */ }
      load();
    });
  }

  if (signOut) {
    signOut.addEventListener("click", function () { lockOut(""); });
  }

  try { code = sessionStorage.getItem(storageKey) || ""; } catch (storageErr) { code = ""; }
  if (code) load();
})();
