(function () {
  var INQUIRY_ENDPOINT = "REPLACE_WITH_APPS_SCRIPT_URL";

  var form = document.getElementById("inq");
  if (!form) return;

  var ok = document.getElementById("ok");
  var err = document.getElementById("err");
  var button = form.querySelector('button[type="submit"]');
  var loadedAt = document.getElementById("loaded_at");
  var source = document.getElementById("source");
  var sourceOtherWrap = document.getElementById("source-other-wrap");
  var started = Date.now();

  if (loadedAt) loadedAt.value = String(started);

  function field(name) {
    var el = form.elements[name];
    return el ? String(el.value || "").trim() : "";
  }

  function endpointReady() {
    return (
      INQUIRY_ENDPOINT.indexOf("https://") === 0 &&
      INQUIRY_ENDPOINT.indexOf("REPLACE_WITH_APPS_SCRIPT_URL") === -1
    );
  }

  function syncSourceOther() {
    if (!source || !sourceOtherWrap) return;
    var show = source.value === "Other";
    sourceOtherWrap.hidden = !show;
    if (!show) {
      var other = document.getElementById("source_other");
      if (other) other.value = "";
    }
  }

  if (source) {
    source.addEventListener("change", syncSourceOther);
    syncSourceOther();
  }

  function payload() {
    var heard = field("source");
    return {
      name: field("name"),
      email: field("email"),
      company: field("company"),
      role: field("role"),
      firm_size: field("firm_size"),
      phone: field("phone"),
      use_case: field("use_case"),
      timeline: field("timeline"),
      source: heard,
      source_other: heard === "Other" ? field("source_other") : "",
      tier: field("tier"),
      message: field("message"),
      page_url: String(location.href || "").slice(0, 1000),
      user_agent: String(navigator.userAgent || "").slice(0, 400),
      loaded_at: field("loaded_at") || String(started),
      hp_field: field("hp_field")
    };
  }

  function validEmail(value) {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function mailtoUrl(data) {
    var body = [
      "Hatch inquiry",
      "Name: " + data.name,
      "Email: " + data.email,
      "Company: " + data.company,
      "Role: " + data.role,
      "Firm size: " + data.firm_size,
      "Phone: " + data.phone,
      "Use case: " + data.use_case,
      "Timeline: " + data.timeline,
      "Source: " + data.source,
      "Source other: " + data.source_other,
      "Tier: " + (data.tier || "Not sure yet"),
      "Message: " + data.message,
      "Page: " + data.page_url
    ].join("\n");
    return (
      "mailto:daniel.keene223@gmail.com?subject=" +
      encodeURIComponent("Hatch inquiry — " + data.company) +
      "&body=" +
      encodeURIComponent(body)
    );
  }

  function hideBanners() {
    if (ok) ok.classList.remove("is-shown");
    if (err) {
      err.classList.remove("is-shown");
      err.textContent = "";
    }
  }

  function showOk(message) {
    if (err) err.classList.remove("is-shown");
    if (!ok) return;
    ok.textContent = message;
    ok.classList.add("is-shown");
  }

  function showErr(data) {
    if (ok) ok.classList.remove("is-shown");
    if (!err) return;
    err.textContent = "We could not send this inquiry. Email ";
    var link = document.createElement("a");
    link.href = mailtoUrl(data);
    link.textContent = "daniel.keene223@gmail.com";
    err.appendChild(link);
    err.appendChild(document.createTextNode(" and it will still reach Hatch."));
    err.classList.add("is-shown");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    hideBanners();

    var data = payload();
    if (data.hp_field) {
      showOk("Thanks, we got it. Check your inbox for a confirmation.");
      return;
    }
    if (
      !data.name ||
      !data.email ||
      !data.company ||
      !data.role ||
      !data.firm_size ||
      !data.use_case ||
      !data.timeline
    ) {
      if (err) {
        err.textContent =
          "Name, work email, company, role, firm size, what you want to use private AI for, and timeline are required.";
        err.classList.add("is-shown");
      }
      return;
    }
    if (!validEmail(data.email)) {
      if (err) {
        err.textContent = "Enter a valid work email.";
        err.classList.add("is-shown");
      }
      return;
    }
    if (Date.now() - started < 3000) {
      if (err) {
        err.textContent = "Give it a few seconds, then send again.";
        err.classList.add("is-shown");
      }
      return;
    }

    if (!endpointReady()) {
      window.location.href = mailtoUrl(data);
      showOk("An email draft should have opened to daniel.keene223@gmail.com.");
      return;
    }

    if (button) button.disabled = true;

    fetch(INQUIRY_ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      redirect: "follow",
      body: new URLSearchParams(data)
    })
      .then(function () {
        showOk("Thanks, we got it. Check your inbox for a confirmation.");
      })
      .catch(function () {
        if (button) button.disabled = false;
        showErr(data);
      });
  });
})();
