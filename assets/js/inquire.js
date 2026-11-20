(function () {
  var form = document.getElementById("inq");
  if (!form) return;

  var ok = document.getElementById("ok");
  var err = document.getElementById("err");
  var submit = form.querySelector("[type=submit]");
  var notesLabel = document.getElementById("notes-label");
  var notes = document.getElementById("notes");
  var params = new URLSearchParams(location.search);
  var wantBeta = form.getAttribute("data-preset") === "beta" || params.get("type") === "beta";

  function selectedType() {
    var picked = form.querySelector('input[name="requestType"]:checked');
    return picked ? picked.value : "inquiry";
  }

  function syncType() {
    var beta = selectedType() === "beta";
    if (notesLabel) notesLabel.textContent = beta ? "What do you want to test?" : "Notes";
    if (notes) {
      notes.placeholder = beta
        ? "The workflow, the files, or the question you want Hatch OS to handle."
        : "What you want to talk about.";
    }
    if (submit) submit.textContent = beta ? "Request beta access" : "Send inquiry";
    if (ok && !ok.classList.contains("is-shown")) {
      ok.textContent = beta
        ? "Request received. We review each beta request personally and will email your invite link and code."
        : "Request received. We review each inquiry personally and will email you.";
    }
  }

  var betaRadio = form.querySelector('input[name="requestType"][value="beta"]');
  var inquiryRadio = form.querySelector('input[name="requestType"][value="inquiry"]');
  if (wantBeta && betaRadio) betaRadio.checked = true;
  if (!wantBeta && inquiryRadio && form.getAttribute("data-preset") !== "beta") inquiryRadio.checked = true;
  form.querySelectorAll('input[name="requestType"]').forEach(function (input) {
    input.addEventListener("change", syncType);
  });
  syncType();

  function showError(message) {
    if (!err) return;
    err.textContent = message;
    err.classList.add("is-shown");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (ok) ok.classList.remove("is-shown");
    if (err) err.classList.remove("is-shown");

    var data = Object.fromEntries(new FormData(form).entries());
    if (!data.name || !data.firm || !data.email) {
      showError("Name, firm, and work email are required.");
      return;
    }

    if (submit) {
      submit.disabled = true;
      submit.textContent = "Sending…";
    }

    fetch("/api/inquire/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        requestType: data.requestType,
        name: data.name,
        email: data.email,
        firm: data.firm,
        role: data.role || "",
        firmSize: data.firmSize || "",
        notes: data.notes || "",
        hp_field: data.hp_field || ""
      })
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          return { ok: response.ok, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.body || result.body.ok !== true) {
          showError((result.body && result.body.error) || "We could not save your request. Please try again.");
          return;
        }
        syncType();
        if (ok) ok.classList.add("is-shown");
        form.reset();
        if (wantBeta && betaRadio) betaRadio.checked = true;
        syncType();
      })
      .catch(function () {
        showError("We could not save your request. Please try again.");
      })
      .then(function () {
        if (submit) submit.disabled = false;
        syncType();
      });
  });
})();
