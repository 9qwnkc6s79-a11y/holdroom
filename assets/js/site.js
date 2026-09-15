(function () {
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

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.querySelectorAll("[data-reveal]").forEach(function (el) {
      el.classList.add("is-in");
    });
    return;
  }

  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll("[data-reveal]").forEach(function (el) {
      el.classList.add("is-in");
    });
    return;
  }

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -32px 0px" }
  );

  document.querySelectorAll("[data-reveal]").forEach(function (el) {
    io.observe(el);
  });
})();
