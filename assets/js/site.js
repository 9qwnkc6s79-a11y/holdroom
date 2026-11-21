(function () {
  var showcase = document.querySelector(".showcase");
  var frameButtons = document.querySelectorAll(".frame-switch button");
  frameButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var frame = button.getAttribute("data-frame") || "desk";
      if (showcase) showcase.setAttribute("data-frame", frame);
      frameButtons.forEach(function (item) {
        item.setAttribute("aria-selected", item === button ? "true" : "false");
      });
    });
  });

  var nav = document.querySelector(".nav");
  var toggle = document.querySelector(".nav-toggle");
  if (nav && toggle) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll(".nav-links a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  var path = location.pathname.replace(/\/+$/, "") || "/";
  document.querySelectorAll(".nav-links a").forEach(function (link) {
    var href = link.getAttribute("href") || "";
    var clean = href.replace(/\/+$/, "") || "/";
    if (clean === path) link.setAttribute("aria-current", "page");
  });

  document.querySelectorAll("[data-reveal]").forEach(function (el) {
    el.classList.add("is-in");
  });
})();
