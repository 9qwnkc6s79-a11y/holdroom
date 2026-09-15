(function () {
  var form = document.getElementById("inq");
  if (!form) return;

  var ok = document.getElementById("ok");
  var err = document.getElementById("err");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (ok) ok.classList.remove("is-shown");
    if (err) err.classList.remove("is-shown");

    var data = Object.fromEntries(new FormData(form).entries());
    if (!data.name || !data.firm || !data.email) {
      if (err) {
        err.textContent = "Name, firm, and email are required.";
        err.classList.add("is-shown");
      }
      return;
    }

    var rec = Object.assign({ ts: new Date().toISOString() }, data);
    try {
      var all = JSON.parse(localStorage.getItem("holdroom_inquiries") || "[]");
      all.push(rec);
      localStorage.setItem("holdroom_inquiries", JSON.stringify(all));
    } catch (storageErr) {
      if (err) {
        err.textContent = "Could not save a local copy in this browser. An email draft will still open.";
        err.classList.add("is-shown");
      }
    }

    var body = [
      "Holdroom inquiry",
      "Time: " + rec.ts,
      "Name: " + rec.name,
      "Firm: " + rec.firm,
      "Role: " + (rec.role || ""),
      "Email: " + rec.email,
      "Phone: " + (rec.phone || ""),
      "Headcount: " + rec.headcount,
      "Concurrent: " + rec.concurrent,
      "Will not paste: " + (rec.secret || ""),
      "Message: " + (rec.message || "")
    ].join("\n");

    var mail =
      "mailto:daniel.keene223@gmail.com?subject=" +
      encodeURIComponent("Holdroom inquiry — " + rec.firm) +
      "&body=" +
      encodeURIComponent(body);

    window.location.href = mail;
    if (ok) ok.classList.add("is-shown");
  });
})();
