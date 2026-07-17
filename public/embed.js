/* Handz On chat widget — embeddable loader.
 * Usage on any website (e.g. handzon.no):
 *   <script src="https://<host>/embed.js" async></script>
 * Renders a floating chat bubble in an isolated Shadow DOM and talks to the
 * Handz On chat API on the same host this script is served from.
 */
(function () {
  "use strict";
  if (window.__handzonChatLoaded) return;
  window.__handzonChatLoaded = true;

  // Resolve the API base from this script's own URL (works with async loading).
  var scriptEl =
    document.currentScript ||
    Array.prototype.slice
      .call(document.getElementsByTagName("script"))
      .filter(function (s) {
        return /embed\.js(\?|$)/.test(s.src || "");
      })
      .pop();
  var API_BASE = scriptEl ? new URL(scriptEl.src).origin : "";

  // Groups this session's turns together in the client portal. crypto.randomUUID
  // needs a secure context and isn't in older browsers, and this script runs on
  // sites we don't control — so fall back to a v4 built from getRandomValues,
  // then to Math.random as a last resort (an id only needs to be unique here).
  var CONVERSATION_ID = (function () {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      if (window.crypto && crypto.getRandomValues) {
        var b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        var h = [].map.call(b, function (x) {
          return ("0" + x.toString(16)).slice(-2);
        });
        return (
          h.slice(0, 4).join("") + "-" + h.slice(4, 6).join("") + "-" +
          h.slice(6, 8).join("") + "-" + h.slice(8, 10).join("") + "-" +
          h.slice(10, 16).join("")
        );
      }
    } catch (e) {
      /* fall through */
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  })();

  var NAVY = "#1e3b67";
  var ACCENT = "#1bade4";
  var WELCOME =
    "Hei! 👋 Jeg er Hanz. Spør meg gjerne om tjenester, priser, avdelinger, åpningstider eller booking!";

  // ---- Markdown (escape first, then bold/italic/links/lists) ----
  function esc(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function inline(s) {
    s = esc(s);
    s = s.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    s = s.replace(
      /(^|[\s(])(https?:\/\/[^\s)]+)/g,
      function (_m, pre, url) {
        // Don't swallow trailing sentence punctuation into the link.
        var tm = /[.,;:!?]+$/.exec(url);
        var trail = tm ? tm[0] : "";
        if (trail) url = url.slice(0, -trail.length);
        return (
          pre +
          '<a href="' +
          url +
          '" target="_blank" rel="noopener noreferrer">' +
          url +
          "</a>" +
          trail
        );
      }
    );
    s = s.replace(/(^|[^*])\*([^*\n]+?)\*/g, "$1<em>$2</em>");
    s = s.replace(/(^|\s)_([^_\n]+?)_/g, "$1<em>$2</em>");
    return s;
  }
  function markdown(text) {
    var lines = text.split("\n");
    var html = "";
    var list = [];
    function flush() {
      if (!list.length) return;
      html +=
        "<ul>" +
        list
          .map(function (it) {
            return "<li>" + inline(it) + "</li>";
          })
          .join("") +
        "</ul>";
      list = [];
    }
    lines.forEach(function (line) {
      var b = /^\s*[-*•]\s+(.*)$/.exec(line);
      if (b) {
        list.push(b[1]);
      } else {
        flush();
        if (line.trim() === "") html += "<br>";
        else html += "<div class='ln'>" + inline(line) + "</div>";
      }
    });
    flush();
    return html;
  }

  // ---- Build DOM in a shadow root ----
  var host = document.createElement("div");
  host.id = "handzon-chat-root";
  host.style.position = "fixed";
  host.style.zIndex = "2147483000";
  host.style.right = "0";
  host.style.bottom = "0";
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent = [
    "*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}",
    ".wrap{position:fixed;right:24px;bottom:24px;display:flex;flex-direction:column;align-items:flex-end;gap:12px}",
    ".fab{width:60px;height:60px;border-radius:50%;border:0;background:" +
      NAVY +
      ";color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}",
    ".fab:hover{background:" + ACCENT + "}",
    ".fab svg{width:26px;height:26px;fill:#fff}",
    ".panel{width:370px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden}",
    ".hd{background:" +
      NAVY +
      ";color:#fff;padding:13px 16px;display:flex;align-items:center;gap:11px}",
    ".hd .logo{width:34px;height:34px;border-radius:7px;background:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto}",
    ".hd .logo img{width:30px;height:auto}",
    ".hd .t{font-weight:700;font-size:1rem;line-height:1.15}",
    ".hd .s{font-size:.74rem;opacity:.85}",
    ".hd .x{margin-left:auto;background:none;border:0;color:#fff;cursor:pointer;padding:4px;display:flex}",
    ".hd .x svg{width:18px;height:18px;fill:#fff}",
    ".body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f5f7fa}",
    ".msg{max-width:86%;padding:10px 13px;border-radius:12px;font-size:.9rem;line-height:1.45;word-wrap:break-word}",
    ".bot{background:#fff;color:#222;border:1px solid #e3e7ee;border-bottom-left-radius:4px;align-self:flex-start}",
    ".me{background:" +
      NAVY +
      ";color:#fff;border-bottom-right-radius:4px;align-self:flex-end;white-space:pre-wrap}",
    ".bot .ln{display:block}",
    ".bot strong{font-weight:700}",
    ".bot a{color:" + NAVY + ";text-decoration:underline;word-break:break-word}",
    ".bot ul{margin:5px 0;padding-left:20px}.bot li{margin:2px 0}",
    ".row{display:flex;border-top:1px solid #e3e7ee;background:#fff}",
    ".row input{flex:1;border:0;padding:14px;font-size:.9rem;outline:none}",
    ".row button{border:0;background:none;color:" +
      NAVY +
      ";cursor:pointer;padding:0 16px;display:flex;align-items:center}",
    ".row button:disabled{color:#b6bfcc;cursor:default}",
    ".row button svg{width:20px;height:20px;fill:currentColor}",
    ".typing{display:inline-flex;gap:4px;align-items:center;height:1em}",
    ".typing i{width:6px;height:6px;border-radius:50%;background:#9aa7b8;display:inline-block;animation:bl 1.2s infinite both}",
    ".typing i:nth-child(2){animation-delay:.2s}.typing i:nth-child(3){animation-delay:.4s}",
    "@keyframes bl{0%,80%,100%{opacity:.25}40%{opacity:1}}",
    "@media(max-width:480px){.wrap{right:12px;bottom:12px}.panel{height:calc(100vh - 96px)}}",
  ].join("");
  root.appendChild(style);

  var SVG = {
    chat:
      '<svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>',
    close:
      '<svg viewBox="0 0 24 24"><path d="M18.3 5.7a1 1 0 0 0-1.4-1.4L12 9.2 7.1 4.3A1 1 0 0 0 5.7 5.7L10.6 12l-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12z"/></svg>',
    send:
      '<svg viewBox="0 0 24 24"><path d="M3 20.5v-6l8-2-8-2v-6l18 8z"/></svg>',
  };

  var wrap = document.createElement("div");
  wrap.className = "wrap";
  root.appendChild(wrap);

  var panel = document.createElement("div");
  panel.className = "panel";
  panel.style.display = "none";
  panel.innerHTML =
    '<div class="hd"><span class="logo"><img src="' +
    API_BASE +
    '/media/logo.webp" alt=""></span>' +
    '<div><div class="t">Kundeservice</div><div class="s">Handz On Auto Care</div></div>' +
    '<button class="x" aria-label="Lukk">' +
    SVG.close +
    "</button></div>" +
    '<div class="body"></div>' +
    '<div class="row"><input type="text" placeholder="Skriv et spørsmål…" aria-label="Melding">' +
    '<button class="send" aria-label="Send">' +
    SVG.send +
    "</button></div>";
  wrap.appendChild(panel);

  var fab = document.createElement("button");
  fab.className = "fab";
  fab.setAttribute("aria-label", "Åpne kundeservice-chat");
  fab.innerHTML = SVG.chat;
  wrap.appendChild(fab);

  var bodyEl = panel.querySelector(".body");
  var inputEl = panel.querySelector("input");
  var sendBtn = panel.querySelector(".send");
  var closeBtn = panel.querySelector(".x");

  var messages = []; // {role, content}
  var busy = false;
  var welcomed = false;

  function addBubble(role, initialHtml) {
    var el = document.createElement("div");
    el.className = "msg " + (role === "user" ? "me" : "bot");
    if (initialHtml !== undefined) el.innerHTML = initialHtml;
    bodyEl.appendChild(el);
    bodyEl.scrollTop = bodyEl.scrollHeight;
    return el;
  }

  function open() {
    panel.style.display = "flex";
    fab.innerHTML = SVG.close;
    if (!welcomed) {
      welcomed = true;
      addBubble("bot", markdown(WELCOME));
    }
    inputEl.focus();
  }
  function close() {
    panel.style.display = "none";
    fab.innerHTML = SVG.chat;
  }
  fab.addEventListener("click", function () {
    panel.style.display === "none" ? open() : close();
  });
  closeBtn.addEventListener("click", close);

  function send() {
    var text = inputEl.value.trim();
    if (!text || busy) return;
    inputEl.value = "";
    messages.push({ role: "user", content: text });
    addBubble("user", esc(text));
    var botEl = addBubble(
      "bot",
      '<span class="typing"><i></i><i></i><i></i></span>'
    );
    busy = true;
    sendBtn.disabled = true;

    fetch(API_BASE + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages,
        conversationId: CONVERSATION_ID,
      }),
    })
      .then(function (res) {
        if (!res.ok || !res.body) throw new Error("HTTP " + res.status);
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        var acc = "";
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) {
              messages.push({ role: "assistant", content: acc });
              return;
            }
            acc += dec.decode(r.value, { stream: true });
            botEl.innerHTML = markdown(acc);
            bodyEl.scrollTop = bodyEl.scrollHeight;
            return pump();
          });
        }
        return pump();
      })
      .catch(function () {
        botEl.innerHTML = markdown(
          "Beklager, noe gikk galt. Prøv igjen, eller kontakt oss på https://handzon.no/kontakt."
        );
      })
      .then(function () {
        busy = false;
        sendBtn.disabled = false;
        bodyEl.scrollTop = bodyEl.scrollHeight;
      });
  }

  sendBtn.addEventListener("click", send);
  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") send();
  });
})();
