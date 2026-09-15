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

  var nodes = document.querySelectorAll("[data-reveal]");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    nodes.forEach(function (el) { el.classList.add("is-in"); });
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

  nodes.forEach(function (el) {
    var top = el.getBoundingClientRect().top;
    if (top < window.innerHeight * 0.92) {
      el.classList.add("is-in");
    } else {
      el.classList.add("will-reveal");
      io.observe(el);
    }
  });
})();
