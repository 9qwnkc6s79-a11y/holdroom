(function () {
  "use strict";

  var STORAGE = {
    paired: "holdroom_wf_paired",
    device: "holdroom_wf_device",
    room: "holdroom_wf_room",
    seatsEmpty: "holdroom_wf_seats_empty"
  };

  var ICONS = {
    ask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h9M12 6l6 6-6 6"/></svg>',
    rooms: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="5" width="7" height="14" rx="1.5"/><rect x="13" y="5" width="7" height="8" rx="1.5"/></svg>',
    library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 5h8l4 4v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M15 5v4h4"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h12M13 6l6 6-6 6"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="9" y="4" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3"/></svg>'
  };

  var ROOMS = {
    "fund-a": {
      id: "fund-a",
      name: "Fund A",
      isolation: "Retrieval stays in Fund A. Fund B files are not visible here.",
      files: [
        { id: "f1", name: "Northshore_CIM_v3.pdf", kind: "PDF", status: "ready", progress: 100 },
        { id: "f2", name: "Quality_of_Earnings_memo.docx", kind: "Office", status: "indexed", progress: 100 },
        { id: "f3", name: "Management_presentation_Q2.pdf", kind: "PDF", status: "ready", progress: 100 },
        { id: "f4", name: "Addendum_customer_concentration.md", kind: "Markdown", status: "ready", progress: 100 }
      ]
    },
    "fund-b": {
      id: "fund-b",
      name: "Fund B",
      isolation: "Retrieval stays in Fund B. Fund A files are not visible here.",
      files: [
        { id: "f5", name: "Harbor_CIM_confidential.pdf", kind: "PDF", status: "ready", progress: 100 },
        { id: "f6", name: "Working_capital_bridge.xlsx", kind: "Office", status: "failed", progress: 0, error: "Could not read this file — try PDF or ask Admin." }
      ]
    }
  };

  var SEATS = [
    { name: "Jane Ortiz", role: "Partner", rooms: "Fund A · Fund B", device: "Jane iPhone" },
    { name: "Alex Chen", role: "Associate", rooms: "Fund A", device: "Alex laptop" },
    { name: "Pending invite", role: "Seat reserved", rooms: "—", device: "HOLD-7K2M", pending: true }
  ];

  var ANSWERS = {
    concentration: {
      text: "In the Northshore CIM, the top three customers are 41% of LTM revenue. Customer A is 19%, Customer B 13%, and Customer C 9%. The QoE memo flags the same concentration and notes no contract longer than twelve months on Customer A.",
      sources: [
        {
          file: "Northshore_CIM_v3.pdf",
          room: "Fund A",
          page: "14",
          snippet: "LTM revenue concentration: Customer A 19%, Customer B 13%, Customer C 9% (41% combined). No customer exceeds 20%."
        },
        {
          file: "Quality_of_Earnings_memo.docx",
          room: "Fund A",
          page: "6",
          snippet: "Customer A (19% of LTM) is on a rolling twelve-month MSA. Renewal is not contracted; treat as at-risk in the base case."
        }
      ]
    },
    earnings: {
      text: "The quality-of-earnings memo treats reported EBITDA as inflated by $2.1m of add-backs. After the proposed adjustments, run-rate EBITDA is $18.4m versus $20.5m in the CIM. Working capital is described as a use, not a source, at close.",
      sources: [
        {
          file: "Quality_of_Earnings_memo.docx",
          room: "Fund A",
          page: "3",
          snippet: "We propose $2.1m of add-back removals (one-time legal, related-party rent, and COVID catch-up). Adjusted EBITDA $18.4m."
        },
        {
          file: "Northshore_CIM_v3.pdf",
          room: "Fund A",
          page: "8",
          snippet: "Management presents $20.5m LTM EBITDA and describes working capital as “broadly neutral.”"
        }
      ]
    },
    harbor: {
      text: "Harbor’s CIM (this room only) states LTM revenue of $64m and a book of 11 platform names. There is no Northshore material in Fund B, and this answer does not search Fund A.",
      sources: [
        {
          file: "Harbor_CIM_confidential.pdf",
          room: "Fund B",
          page: "2",
          snippet: "Harbor Partners Fund B — confidential information memorandum. LTM revenue $64m across 11 platform investments."
        }
      ]
    },
    isolated: {
      text: "That name is not in this room’s library. Fund A and Fund B are isolated — this ask will not retrieve the other fund. Switch rooms if you meant the other space, or upload a file here.",
      sources: []
    },
    general: {
      text: "I can answer from general model knowledge, but this reply did not retrieve a passage from the room library. Upload a file in Library if you want the next ask grounded in the deal file.",
      sources: []
    }
  };

  var state = {
    paired: localStorage.getItem(STORAGE.paired) === "1",
    device: localStorage.getItem(STORAGE.device) || "",
    room: localStorage.getItem(STORAGE.room) || "fund-a",
    offline: false,
    route: "signin",
    extraRooms: [],
    emptyRoomsDemo: false,
    emptySeatsDemo: localStorage.getItem(STORAGE.seatsEmpty) === "1",
    threads: { "fund-a": [], "fund-b": [] },
    lastSources: null,
    lastUsedLibrary: null,
    streaming: false,
    pairError: "",
    toast: "",
    fileSeq: 10
  };

  if (!ROOMS[state.room]) state.room = "fund-a";

  var root = document.getElementById("app");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function room() {
    return ROOMS[state.room] || state.extraRooms.find(function (r) { return r.id === state.room; }) || ROOMS["fund-a"];
  }

  function allRooms() {
    return [ROOMS["fund-a"], ROOMS["fund-b"]].concat(state.extraRooms);
  }

  function filesFor(id) {
    var r = ROOMS[id] || state.extraRooms.find(function (x) { return x.id === id; });
    return r ? r.files : [];
  }

  function thread() {
    if (!state.threads[state.room]) state.threads[state.room] = [];
    return state.threads[state.room];
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseHash() {
    var raw = (location.hash || "").replace(/^#/, "");
    if (raw.charAt(0) !== "/") raw = "/" + raw;
    raw = raw.split("?")[0];
    if (raw.length > 1 && raw.slice(-1) === "/") raw = raw.slice(0, -1);
    return raw || "/";
  }

  function pathToRoute(path) {
    var map = {
      "/": "ask",
      "/ask": "ask",
      "/signin": "signin",
      "/pair": "signin",
      "/rooms": "rooms",
      "/library": "library",
      "/sources": "sources",
      "/status": "status",
      "/admin": "admin",
      "/settings": "settings",
      "/more": "more",
      "/offline": "offline"
    };
    return map[path] || "ask";
  }

  function go(path) {
    if (path.charAt(0) !== "#") path = "#" + (path.charAt(0) === "/" ? path : "/" + path);
    if (location.hash === path) {
      sync();
      return;
    }
    location.hash = path;
  }

  function setRoom(id) {
    state.room = id;
    localStorage.setItem(STORAGE.room, id);
  }

  function pickAnswer(q) {
    var t = q.toLowerCase();
    var inA = state.room === "fund-a";
    var inB = state.room === "fund-b";
    if (/(harbor|fund b)/.test(t) && inA) return ANSWERS.isolated;
    if (/(northshore|fund a)/.test(t) && inB) return ANSWERS.isolated;
    if (inB && /(harbor|platform|fund b)/.test(t)) return ANSWERS.harbor;
    if (inA && /(concentration|customer|northshore)/.test(t)) return ANSWERS.concentration;
    if (inA && /(earning|qoe|ebitda|add-back|addback)/.test(t)) return ANSWERS.earnings;
    if (inB && /(bridge|working capital)/.test(t)) {
      return {
        text: "The working-capital bridge file in this room failed ingest, so there is no retrieved passage. The Harbor CIM does not include a numeric bridge. Re-upload as PDF or ask Admin.",
        sources: []
      };
    }
    return ANSWERS.general;
  }

  function statusLabel(status) {
    if (status === "ready") return "Ready";
    if (status === "indexed") return "Indexed";
    if (status === "extracting") return "Extracting";
    if (status === "queued") return "Queued";
    if (status === "failed") return "Failed";
    return status;
  }

  function pillFor(status) {
    if (status === "ready" || status === "indexed") return "pill-ok";
    if (status === "failed") return "pill-bad";
    if (status === "extracting" || status === "queued") return "pill-warn";
    return "pill-mute";
  }

  /* —— views —— */

  function renderOffline() {
    return (
      '<div class="gate">' +
        '<div class="gate-inner">' +
          '<a class="brand" href="#/ask">Holdroom<span class="dot">.</span></a>' +
          "<h1>Can’t reach the Holdroom.</h1>" +
          "<p class=\"lede\">Join the office network or the firm VPN, then retry. This phone does not keep a local copy of the library.</p>" +
          '<div class="btn-row">' +
            '<button class="btn btn-dark" type="button" data-act="offline-off">Retry</button>' +
            '<button class="btn btn-outline" type="button" data-act="offline-off">End offline demo</button>' +
          "</div>" +
          "<p class=\"fine\" style=\"margin-top:18px\">Holdroom does not fall back to a public lab when the box is unreachable.</p>" +
        "</div>" +
      "</div>"
    );
  }

  function renderSignin() {
    return (
      '<div class="gate">' +
        '<div class="gate-inner">' +
          '<a class="brand" href="#/signin">Holdroom<span class="dot">.</span></a>' +
          "<h1>This device is not paired.</h1>" +
          "<p class=\"lede\">Ask your admin for an invite code. The session lives on this box — the phone stores a pointer, not the corpus.</p>" +
          (state.pairError ? '<div class="banner banner-warn" role="alert"><p>' + esc(state.pairError) + "</p></div>" : "") +
          '<form class="card" id="pair-form">' +
            '<label for="invite">Invite code</label>' +
            '<input id="invite" name="invite" type="text" autocomplete="one-time-code" placeholder="HOLD-····" required />' +
            '<p class="field-hint">Wireframe stub. Try HOLD-BETA, or HOLD-NOSEAT to see the empty-seat path.</p>' +
            '<label for="totp">Authenticator code</label>' +
            '<input id="totp" name="totp" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required />' +
            '<p class="field-hint">TOTP stub — any six digits. No SMS. No “sign in with Google.”</p>' +
            '<label for="device">Device name (optional)</label>' +
            '<input id="device" name="device" type="text" placeholder="Jane iPhone" value="' + esc(state.device) + '" />' +
            '<div class="btn-row">' +
              '<button class="btn btn-dark btn-block" type="submit">Pair this device</button>' +
            "</div>" +
          "</form>" +
          '<p class="fine" style="margin-top:16px">If the box is not reachable, you will see “can’t reach the room” — not a login that pretends to work. <button class="linkish" type="button" data-act="offline-on">Show offline demo</button></p>' +
        "</div>" +
      "</div>"
    );
  }

  function navLink(href, label, route) {
    var current = state.route === route ? ' aria-current="page"' : "";
    return '<a class="nav-link" href="' + href + '"' + current + ">" + label + "</a>";
  }

  function tab(href, key, label, routes) {
    var on = routes.indexOf(state.route) !== -1;
    return (
      '<a class="tab' + (on ? " is-active" : "") + '" href="' + href + '"' +
      (on ? ' aria-current="page"' : "") + ">" + ICONS[key] + "<span>" + label + "</span></a>"
    );
  }

  function shell(inner, extraStage) {
    var r = room();
    return (
      '<div class="app-shell">' +
        '<aside class="desktop-nav" aria-label="Holdroom">' +
          '<a class="brand" href="#/ask">Holdroom<span class="dot">.</span></a>' +
          navLink("#/ask", "Ask", "ask") +
          navLink("#/rooms", "Rooms", "rooms") +
          navLink("#/library", "Library", "library") +
          '<div class="nav-sep"></div>' +
          navLink("#/status", "Status", "status") +
          navLink("#/admin", "Admin", "admin") +
          navLink("#/settings", "Settings", "settings") +
          '<p class="rail-foot">Same box as the office. <a href="/">Marketing site</a></p>' +
        "</aside>" +
        '<header class="topbar">' +
          '<a class="brand" href="#/ask">Holdroom<span class="dot">.</span></a>' +
          '<div class="topbar-meta">' +
            '<a class="room-chip" href="#/rooms" title="Current room">' + esc(r.name) + "</a>" +
            '<a class="health-dot" href="#/status" title="Box health ok" aria-label="Box health ok"></a>' +
          "</div>" +
        "</header>" +
        '<main id="stage" class="stage' + (extraStage ? " " + extraStage : "") + '">' + inner + "</main>" +
        '<nav class="tabbar" aria-label="Phone">' +
          tab("#/ask", "ask", "Ask", ["ask", "sources"]) +
          tab("#/rooms", "rooms", "Rooms", ["rooms"]) +
          tab("#/library", "library", "Library", ["library"]) +
          tab("#/more", "more", "More", ["more", "status", "admin", "settings"]) +
        "</nav>" +
      "</div>"
    );
  }

  function renderAsk() {
    var msgs = thread();
    var r = room();
    var body;
    if (!msgs.length) {
      body =
        '<div class="panel empty-ask">' +
          '<p class="screen-kicker">Ask</p>' +
          "<h1>Nothing in this room yet.</h1>" +
          "<p class=\"lede\">Ask, or open Library and drop a PDF. Answers stream from this box — you do not pick a public model.</p>" +
          '<div class="tip">You are talking to the firm’s Holdroom, not a public lab.</div>' +
          '<div class="prompts">' +
            (state.room === "fund-a"
              ? '<button class="prompt" type="button" data-prompt="What is the customer concentration in the Northshore CIM?">Customer concentration</button>' +
                '<button class="prompt" type="button" data-prompt="Summarize the quality of earnings findings.">Quality of earnings</button>' +
                '<button class="prompt" type="button" data-prompt="What is in the other fund?">Other fund (isolation)</button>'
              : state.room === "fund-b"
                ? '<button class="prompt" type="button" data-prompt="What does the Harbor CIM say about LTM revenue?">Harbor CIM</button>' +
                  '<button class="prompt" type="button" data-prompt="What does the Northshore CIM say?">Other fund (isolation)</button>'
                : '<button class="prompt" type="button" data-prompt="What is in this room?">Ask without the library</button>') +
          "</div>" +
        "</div>";
    } else {
      body =
        '<div class="panel thread" aria-live="polite">' +
        msgs.map(function (m) {
          if (m.role === "user") {
            return '<div class="bubble bubble-user"><p>' + esc(m.text) + "</p></div>";
          }
          var sources = "";
          if (m.done) {
            if (m.sources && m.sources.length) {
              sources =
                '<div class="bubble-meta">' +
                  '<a class="sources-link" href="#/sources">Sources · ' + m.sources.length + "</a>" +
                  '<span class="fine">' + esc(r.name) + "</span>" +
                "</div>";
            } else {
              sources =
                '<div class="bubble-meta">' +
                  '<a class="sources-link" href="#/sources">Sources · none retrieved</a>' +
                  '<span class="fine">General model knowledge</span>' +
                "</div>";
            }
          }
          return (
            '<div class="bubble bubble-ai">' +
              "<p>" + esc(m.text) + (m.done ? "" : '<span class="cursor"></span>') + "</p>" +
              sources +
            "</div>"
          );
        }).join("") +
        "</div>";
    }

    body +=
      '<form class="composer" id="ask-form">' +
        '<div class="composer-box">' +
          '<textarea id="ask-input" name="q" rows="1" placeholder="Ask this room…" ' +
            (state.streaming ? "disabled " : "") + "required></textarea>" +
          '<button class="icon-btn" type="button" disabled title="Voice in a later update" aria-label="Voice in a later update">' +
            ICONS.mic +
          "</button>" +
          '<button class="icon-btn primary" type="submit" ' + (state.streaming ? "disabled " : "") + 'aria-label="Send">' +
            ICONS.send +
          "</button>" +
        "</div>" +
      "</form>";

    return shell(body, "stage-ask");
  }

  function renderRooms() {
    if (state.emptyRoomsDemo) {
      return shell(
        '<div class="panel">' +
          '<p class="screen-kicker">Rooms</p>' +
          "<h1>No rooms.</h1>" +
          "<p class=\"lede\">Admin creates Fund A / Fund B (or the first matter). There is no cross-room “search everything” in this beta.</p>" +
          '<button class="btn btn-outline" type="button" data-act="rooms-demo-off">Show Fund A / Fund B</button>' +
        "</div>"
      );
    }

    var cards = allRooms().map(function (r) {
      var count = r.files.length;
      var empty = !count && !(state.threads[r.id] && state.threads[r.id].length);
      var current = r.id === state.room;
      return (
        '<button class="room-card' + (current ? " is-current" : "") + '" type="button" data-enter-room="' + esc(r.id) + '">' +
          '<span class="room-name">' + esc(r.name) + "</span>" +
          (current ? '<span class="pill pill-ink">Current</span>' : '<span class="pill pill-mute">Enter</span>') +
          '<p class="fine">' +
            (empty
              ? "This room has no files and no threads. Upload in Library or ask a question that does not need the library."
              : count + " files · isolated from the other fund") +
          "</p>" +
        "</button>"
      );
    }).join("");

    return shell(
      '<div class="panel">' +
        '<p class="screen-kicker">Rooms</p>' +
        "<h1>Matter spaces.</h1>" +
        "<p class=\"lede\">Isolation first. A partner may see both funds; an associate may see one. Permission is checked before retrieve.</p>" +
        '<div class="room-list">' + cards + "</div>" +
        '<p class="fine" style="margin-top:16px">' + esc(room().isolation) +
          ' <button class="linkish" type="button" data-act="rooms-demo-on">Show empty rooms</button></p>' +
      "</div>"
    );
  }

  function renderLibrary() {
    var r = room();
    var files = r.files;
    var list;
    if (!files.length) {
      list =
        '<div class="card">' +
          "<h2>Nothing indexed in " + esc(r.name) + ".</h2>" +
          "<p class=\"muted\" style=\"margin:0\">Drop a PDF into this room. Files stay on the firm’s box. Holdroom support does not receive a copy.</p>" +
        "</div>";
    } else {
      list = files.map(function (f) {
        return (
          '<div class="card">' +
            '<div class="file-row">' +
              '<div><div class="file-name">' + esc(f.name) + '</div><p class="fine">' + esc(f.kind) + " · " + esc(r.name) + "</p></div>" +
              '<span class="pill ' + pillFor(f.status) + '">' + esc(statusLabel(f.status)) + "</span>" +
              (f.status === "queued" || f.status === "extracting"
                ? '<div class="progress"><span style="width:' + (f.progress || 20) + '%"></span></div>'
                : "") +
              (f.error ? '<p class="fine" style="grid-column:1/-1;color:var(--bad)">' + esc(f.error) + "</p>" : "") +
            "</div>" +
          "</div>"
        );
      }).join("");
    }

    return shell(
      '<div class="panel">' +
        '<p class="screen-kicker">Library</p>' +
        "<h1>Files in " + esc(r.name) + ".</h1>" +
        "<p class=\"lede\">Add to this room only. Extract, chunk, and embed stay on the box. This is not training, and the phone does not sync the corpus.</p>" +
        '<label class="drop" id="drop" for="file-input">' +
          "<strong>Drop a PDF, Office file, or markdown</strong>" +
          '<span class="fine">Click to choose · UI only · stays in ' + esc(r.name) + "</span>" +
        "</label>" +
        '<input class="hidden-file" id="file-input" type="file" />' +
        '<div style="margin-top:14px">' + list + "</div>" +
      "</div>"
    );
  }

  function renderSources() {
    var used = state.lastUsedLibrary;
    var cites = state.lastSources;
    var inner;
    if (used === null) {
      inner =
        "<h1>No answer yet.</h1>" +
        "<p class=\"lede\">Ask in this room, then open Sources from the reply.</p>" +
        '<a class="btn btn-dark" href="#/ask">Back to Ask</a>';
    } else if (!cites || !cites.length) {
      inner =
        "<h1>No retrieved passage.</h1>" +
        "<p class=\"lede\">This answer did not use the library (general model knowledge). Upload a file in this room to ground the next ask.</p>" +
        '<a class="btn btn-outline" href="#/library">Open Library</a>';
    } else {
      inner =
        "<h1>Passages used.</h1>" +
        "<p class=\"lede\">Phase 1: filename + snippet. The file stays on the box; this view is not a portable archive.</p>" +
        cites.map(function (c) {
          return (
            '<div class="card cite">' +
              '<div class="cite-head">' +
                "<div><h2>" + esc(c.file) + "</h2><p class=\"fine\">" + esc(c.room) + (c.page ? " · p. " + esc(c.page) : "") + "</p></div>" +
              "</div>" +
              '<p class="snippet">“' + esc(c.snippet) + '”</p>' +
            "</div>"
          );
        }).join("");
    }

    return shell(
      '<div class="panel">' +
        '<p class="screen-kicker">Sources</p>' +
        inner +
      "</div>"
    );
  }

  function renderStatus() {
    return shell(
      '<div class="panel">' +
        '<p class="screen-kicker">Status</p>' +
        "<h1>This box.</h1>" +
        "<p class=\"lede\">Health of the firm’s Holdroom — not a cloud dashboard. Egress FAIL=blocked is the good outcome.</p>" +
        '<div class="card">' +
          '<div class="status-row"><span>Health</span><b class="egress-ok">ok</b></div>' +
          '<div class="status-row"><span>Image</span><b>holdroom-phase1-wireframe</b></div>' +
          '<div class="status-row"><span>Model loaded</span><b>local instruct (box)</b></div>' +
          '<div class="status-row"><span>Disk free</span><b>412 GB</b></div>' +
          '<div class="status-row"><span>Last backup</span><b>14 Sep 2026 · 22:10</b></div>' +
          '<div class="status-row"><span>Last egress check</span><b>15 Sep 2026 · 09:02</b></div>' +
        "</div>" +
        '<div class="card" style="margin-top:10px">' +
          "<h2>Egress</h2>" +
          "<p class=\"fine\" style=\"margin-bottom:8px\">PASS=reachable would be an error in production. Green means the public APIs were blocked.</p>" +
          '<div class="status-row"><span>OpenAI</span><span class="egress-ok">FAIL=blocked</span></div>' +
          '<div class="status-row"><span>Anthropic</span><span class="egress-ok">FAIL=blocked</span></div>' +
        "</div>" +
        '<p class="fine" style="margin-top:14px">This page does not prove model quality, RAG correctness, or that a real corpus is absent. Operators keep files synthetic until accept.</p>' +
      "</div>"
    );
  }

  function renderAdmin() {
    if (state.emptySeatsDemo) {
      return shell(
        '<div class="panel">' +
          '<p class="screen-kicker">Admin</p>' +
          "<h1>No seats issued.</h1>" +
          "<p class=\"lede\">Create an invite for the first partner. Holdroom does not keep an always-on admin account and does not take a copy of the corpus.</p>" +
          '<div class="btn-row">' +
            '<button class="btn btn-dark" type="button" data-act="seats-demo-off">Show issued seats</button>' +
          "</div>" +
        "</div>"
      );
    }

    var seats = SEATS.map(function (s) {
      return (
        '<div class="card">' +
          '<div class="file-row">' +
            "<div><div class=\"file-name\">" + esc(s.name) + "</div><p class=\"fine\">" + esc(s.role) + " · " + esc(s.rooms) + "</p></div>" +
            '<span class="pill ' + (s.pending ? "pill-warn" : "pill-ok") + '">' + (s.pending ? "Invite" : "Active") + "</span>" +
            '<p class="fine" style="grid-column:1/-1">' + esc(s.device) + "</p>" +
          "</div>" +
        "</div>"
      );
    }).join("");

    return shell(
      '<div class="panel">' +
        '<p class="screen-kicker">Admin</p>' +
        "<h1>Seats and the box.</h1>" +
        "<p class=\"lede\">Invite, revoke, room grants. Support works from Status plus a synthetic repro — not from a copy of client files.</p>" +
        '<div class="stat-pills">' +
          '<span class="pill pill-ink">3 of 8 seats</span>' +
          '<span class="pill pill-mute">Firm line</span>' +
        "</div>" +
        seats +
        '<div class="btn-row">' +
          '<button class="btn btn-dark" type="button" data-act="mint-invite">Create invite</button>' +
          '<button class="btn btn-outline" type="button" data-act="create-room">Create empty room</button>' +
          '<button class="linkish" type="button" data-act="seats-demo-on">Show empty seats</button>' +
        "</div>" +
        (state.toast ? '<div class="banner banner-ok" style="margin-top:14px"><p>' + esc(state.toast) + "</p></div>" : "") +
        '<div class="card" style="margin-top:16px">' +
          "<h2>Backup</h2>" +
          "<p class=\"muted\">Last success 14 Sep 2026 · 22:10. Restore drill is a stub in this wireframe.</p>" +
          '<div class="btn-row">' +
            '<button class="btn btn-ghost" type="button" data-act="backup">Start backup</button>' +
          "</div>" +
        "</div>" +
        '<div class="card" style="margin-top:10px">' +
          "<h2>Updates</h2>" +
          "<p class=\"muted\">Import a signed offline bundle → inactive slot → health → cutover / rollback. No always-on Holdroom remote admin.</p>" +
          '<div class="btn-row">' +
            '<button class="btn btn-ghost" type="button" data-act="update">Import bundle (stub)</button>' +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function renderSettings() {
    return shell(
      '<div class="panel">' +
        '<p class="screen-kicker">Settings</p>' +
        "<h1>This device.</h1>" +
        "<p class=\"lede\">Sign out, reset TOTP, and how to reach the same box from the road. Holdroom does not host the tunnel.</p>" +
        '<div class="card device">' +
          "<div><strong>" + esc(state.device || "This browser") + "</strong><p class=\"fine\">Paired · session pointer only</p></div>" +
          '<span class="pill pill-ok">On box</span>' +
        "</div>" +
        '<div class="card howto" style="margin-top:10px">' +
          "<h2>Remote how-to</h2>" +
          "<p class=\"muted\" style=\"margin:0 0 8px\">Firm-owned path. Never a Holdroom cloud, and never a proxy that runs the model for you.</p>" +
          "<ol>" +
            "<li>Connect this phone or laptop to the firm’s WireGuard, Tailscale-class mesh, or existing client VPN first.</li>" +
            "<li>Then open the same Holdroom URL your IT set (for example <code>https://ai.firm.local</code>).</li>" +
            "<li>If the tunnel is down, you will see “can’t reach the room.” There is no on-device model.</li>" +
          "</ol>" +
          '<p class="fine" style="margin-top:12px">Remote is not configured in this wireframe. Your IT owns the tunnel. Until it exists, use the box on the office LAN only.</p>' +
        "</div>" +
        '<div class="card" style="margin-top:10px">' +
          "<h2>Add to Home Screen</h2>" +
          "<p class=\"muted\" style=\"margin:0\">iPhone: Share → Add to Home Screen. Android: browser menu → Install app. Same origin as the desktop UI. No store listing in Phase 1.</p>" +
        "</div>" +
        '<div class="btn-row">' +
          '<button class="btn btn-outline" type="button" data-act="offline-on">Demo: can’t reach the room</button>' +
          '<button class="btn btn-ghost" type="button" data-act="reset-totp">Reset TOTP (stub)</button>' +
          '<button class="btn btn-dark" type="button" data-act="signout">Sign out</button>' +
        "</div>" +
        (state.toast ? '<div class="banner banner-ok" style="margin-top:14px"><p>' + esc(state.toast) + "</p></div>" : "") +
      "</div>"
    );
  }

  function renderMore() {
    return shell(
      '<div class="panel">' +
        '<p class="screen-kicker">More</p>' +
        "<h1>Box and account.</h1>" +
        '<div class="more-list">' +
          '<a href="#/status">Status</a>' +
          '<a href="#/admin">Admin</a>' +
          '<a href="#/settings">Settings</a>' +
          '<button type="button" data-act="offline-on">Can’t reach the room (demo)</button>' +
        "</div>" +
      "</div>"
    );
  }

  function view() {
    if (state.offline || state.route === "offline") return renderOffline();
    if (!state.paired) return renderSignin();
    if (state.route === "signin") {
      go("#/ask");
      return renderAsk();
    }
    switch (state.route) {
      case "rooms": return renderRooms();
      case "library": return renderLibrary();
      case "sources": return renderSources();
      case "status": return renderStatus();
      case "admin": return renderAdmin();
      case "settings": return renderSettings();
      case "more": return renderMore();
      default: return renderAsk();
    }
  }

  function bind() {
    var pair = document.getElementById("pair-form");
    if (pair) {
      pair.addEventListener("submit", function (e) {
        e.preventDefault();
        var invite = (pair.invite.value || "").trim().toUpperCase();
        var totp = (pair.totp.value || "").trim();
        var device = (pair.device.value || "").trim();
        if (!invite) {
          state.pairError = "Ask your admin for an invite code.";
          draw();
          return;
        }
        if (!/^\d{6}$/.test(totp)) {
          state.pairError = "Enter the six-digit authenticator code from the box.";
          draw();
          return;
        }
        if (invite.indexOf("NOSEAT") !== -1) {
          state.pairError = "No seat for this invite — admin can add one.";
          draw();
          return;
        }
        state.paired = true;
        state.device = device || "This browser";
        state.pairError = "";
        localStorage.setItem(STORAGE.paired, "1");
        localStorage.setItem(STORAGE.device, state.device);
        go("#/ask");
      });
    }

    var ask = document.getElementById("ask-form");
    if (ask) {
      var input = document.getElementById("ask-input");
      ask.addEventListener("submit", function (e) {
        e.preventDefault();
        if (state.streaming) return;
        var q = (input.value || "").trim();
        if (!q) return;
        input.value = "";
        sendAsk(q);
      });
      if (input) {
        input.addEventListener("input", function () {
          input.style.height = "auto";
          input.style.height = Math.min(input.scrollHeight, 140) + "px";
        });
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            ask.requestSubmit();
          }
        });
      }
    }

    document.querySelectorAll("[data-prompt]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        sendAsk(btn.getAttribute("data-prompt"));
      });
    });

    document.querySelectorAll("[data-enter-room]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setRoom(btn.getAttribute("data-enter-room"));
        go("#/ask");
      });
    });

    var drop = document.getElementById("drop");
    var fileInput = document.getElementById("file-input");
    if (drop && fileInput) {
      ["dragenter", "dragover"].forEach(function (ev) {
        drop.addEventListener(ev, function (e) {
          e.preventDefault();
          drop.classList.add("is-over");
        });
      });
      ["dragleave", "drop"].forEach(function (ev) {
        drop.addEventListener(ev, function (e) {
          e.preventDefault();
          drop.classList.remove("is-over");
        });
      });
      drop.addEventListener("drop", function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) ingest(f.name);
      });
      fileInput.addEventListener("change", function () {
        if (fileInput.files && fileInput.files[0]) ingest(fileInput.files[0].name);
        fileInput.value = "";
      });
    }

    document.querySelectorAll("[data-act]").forEach(function (el) {
      el.addEventListener("click", function () {
        handleAct(el.getAttribute("data-act"));
      });
    });
  }

  function handleAct(act) {
    if (act === "offline-on") {
      state.offline = true;
      go("#/offline");
      return;
    }
    if (act === "offline-off") {
      state.offline = false;
      go(state.paired ? "#/ask" : "#/signin");
      return;
    }
    if (act === "signout") {
      state.paired = false;
      state.pairError = "";
      state.toast = "";
      localStorage.removeItem(STORAGE.paired);
      go("#/signin");
      return;
    }
    if (act === "rooms-demo-on") {
      state.emptyRoomsDemo = true;
      draw();
      return;
    }
    if (act === "rooms-demo-off") {
      state.emptyRoomsDemo = false;
      draw();
      return;
    }
    if (act === "seats-demo-on") {
      state.emptySeatsDemo = true;
      localStorage.setItem(STORAGE.seatsEmpty, "1");
      draw();
      return;
    }
    if (act === "seats-demo-off") {
      state.emptySeatsDemo = false;
      localStorage.removeItem(STORAGE.seatsEmpty);
      draw();
      return;
    }
    if (act === "mint-invite") {
      state.toast = "Invite HOLD-7K2M created. Share it in person — it is not emailed by a Holdroom cloud.";
      draw();
      return;
    }
    if (act === "create-room") {
      var id = "matter-" + (state.extraRooms.length + 1);
      state.extraRooms.push({
        id: id,
        name: "New matter",
        isolation: "This room is empty and isolated. It does not search Fund A or Fund B.",
        files: []
      });
      state.threads[id] = [];
      state.toast = "Empty room created. This room has no files and no threads.";
      setRoom(id);
      draw();
      return;
    }
    if (act === "backup") {
      state.toast = "Backup started (stub). Last success stays 14 Sep 2026 until a real box exists.";
      draw();
      return;
    }
    if (act === "update") {
      state.toast = "Waiting for a signed offline bundle. There is no live Holdroom remote push.";
      draw();
      return;
    }
    if (act === "reset-totp") {
      state.toast = "TOTP reset is a stub. On a live box, Admin re-issues the authenticator from this device list.";
      draw();
      return;
    }
  }

  function ingest(name) {
    var r = room();
    var lower = name.toLowerCase();
    var ok = /\.(pdf|docx?|xlsx?|md|txt)$/i.test(lower);
    var kind = /\.pdf$/i.test(lower) ? "PDF" : /\.md$/i.test(lower) ? "Markdown" : "Office";
    state.fileSeq += 1;
    var rec = {
      id: "up-" + state.fileSeq,
      name: name,
      kind: kind,
      status: ok ? "queued" : "failed",
      progress: ok ? 15 : 0,
      error: ok ? "" : "Could not read this file — try PDF or ask Admin."
    };
    r.files = [rec].concat(r.files);
    draw();
    if (!ok) return;
    window.setTimeout(function () {
      rec.status = "extracting";
      rec.progress = 55;
      if (state.route === "library") draw();
    }, 700);
    window.setTimeout(function () {
      rec.status = "indexed";
      rec.progress = 90;
      if (state.route === "library") draw();
    }, 1400);
    window.setTimeout(function () {
      rec.status = "ready";
      rec.progress = 100;
      if (state.route === "library") draw();
    }, 2000);
  }

  function sendAsk(q) {
    if (state.streaming) return;
    var t = thread();
    t.push({ role: "user", text: q });
    var pack = pickAnswer(q);
    var ai = { role: "ai", text: "", done: false, sources: pack.sources };
    t.push(ai);
    state.streaming = true;
    state.lastSources = pack.sources;
    state.lastUsedLibrary = pack.sources.length > 0;
    if (state.route !== "ask") {
      location.hash = "#/ask";
    }
    draw();
    streamInto(ai, pack.text);
  }

  function streamInto(msg, full) {
    if (reduceMotion) {
      msg.text = full;
      msg.done = true;
      state.streaming = false;
      draw();
      return;
    }
    var i = 0;
    var step = function () {
      i += 2;
      msg.text = full.slice(0, i);
      if (i >= full.length) {
        msg.text = full;
        msg.done = true;
        state.streaming = false;
        draw();
        return;
      }
      draw();
      window.setTimeout(step, 16);
    };
    step();
  }

  function draw() {
    root.innerHTML = view();
    bind();
    if (state.route === "ask") {
      var stage = document.getElementById("stage");
      if (stage && thread().length) {
        window.scrollTo(0, document.body.scrollHeight);
      }
    }
  }

  function sync() {
    var path = parseHash();
    if (path === "/offline") {
      state.offline = true;
      state.route = "offline";
      draw();
      return;
    }
    if (state.offline && path !== "/offline") {
      /* hash changed away; keep overlay until they retry */
      state.route = "offline";
      draw();
      return;
    }
    var route = pathToRoute(path);
    if (!state.paired && route !== "signin") {
      if (location.hash !== "#/signin") {
        location.replace("#/signin");
        return;
      }
      route = "signin";
    }
    state.route = route;
    state.toast = "";
    draw();
  }

  window.addEventListener("hashchange", sync);

  if (!location.hash) {
    location.replace(state.paired ? "#/ask" : "#/signin");
  } else {
    sync();
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch(function () {
      /* wireframe: ignore SW register failures on file:// */
    });
  }
})();
